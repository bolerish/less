/* eslint-disable no-await-in-loop -- Browser interactions and viewport checks are sequential. */
// Build first. Chrome's Extensions.triggerAction dispatches the real toolbar action.
// node scripts/verify-sidepanel.mjs --playwright /path/to/playwright/index.mjs --chromium /path/to/Chrome
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values } = parseArgs({
  options: {
    playwright: { type: "string" },
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    "firefox-build": { type: "string" },
    screenshot: { type: "string", default: "/tmp/veil-in-page-panel.png" },
  },
});
assert(
  values.playwright && values.chromium,
  "Pass --playwright and --chromium (Chrome with Extensions.triggerAction)",
);
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const directory = await mkdtemp(join(tmpdir(), "veil-page-panel-"));
const fixture =
  '<!doctype html><html lang="en"><head><title>Veil test</title><style>body{margin:20px;font:16px/1.5 sans-serif}section{height:120px;background:#eee;margin:20px 0;padding:20px}#spacer{height:700px}</style></head><body><button id="before">Page focus</button><h1>Reading page</h1><section id="one">메모 PC 바로가기 아주 긴 원문은 상세에서만 표시합니다</section><section id="two">Second distraction, with lengthy raw text for details</section><p>Keep this content</p><div id="spacer"></div><section id="three">Far away distraction</section><p>Keep reading</p></body></html>';
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(fixture);
});
let context;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const manifest = JSON.parse(await readFile(join(values.build, "manifest.json"), "utf8"));
  assert(!manifest.action.default_popup && !manifest.side_panel && !manifest.sidebar_action);
  assert(!manifest.permissions.includes("sidePanel") && !manifest.permissions.includes("tabs"));
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(
      await readFile(join(values.build, "_locales", locale, "messages.json"), "utf8"),
    );
    for (const key of ["panel_current_site", "panel_loading", "panel_count_help"])
      assert(catalog[key]?.message, `${locale}: ${key}`);
    for (const key of ["panel_hidden_count_one", "panel_hidden_count_other"])
      assert(catalog[key]?.message.includes("$1"), `${locale}: count placeholder`);
  }
  if (values["firefox-build"]) {
    const registered = {};
    const event = (name) => ({
      addListener: (fn) => {
        registered[name] = fn;
      },
    });
    const browser = {
      runtime: {
        id: "veil-test",
        onMessage: event("message"),
        onInstalled: event("install"),
        onStartup: event("startup"),
        onConnect: event("connect"),
        getURL: (path) => `moz-extension://test${path}`,
      },
      browserAction: { onClicked: event("action") },
      storage: { onChanged: event("storage") },
      webNavigation: { onHistoryStateUpdated: event("navigation") },
    };
    vm.runInNewContext(
      await readFile(join(values["firefox-build"], "background.js"), "utf8"),
      { browser, console, URL, setTimeout, clearTimeout },
      { timeout: 2000 },
    );
    assert.equal(typeof registered.action, "function");
    assert.equal(typeof registered.message, "function");
    console.log(
      "PASS built Firefox MV2 background registers browserAction without browser.action (API fixture)",
    );
  }
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1100, height: 800 },
    args: ["--enable-unsafe-extension-debugging"],
  });
  context.setDefaultTimeout(7000);
  const browserCDP = await context.browser().newBrowserCDPSession();
  const { id } = await browserCDP.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.runtime.getManifest());
  await waitFor(
    async () => context.pages().some((p) => p.url().endsWith("/welcome.html")),
    "install finished",
  );
  const errors = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const site = await context.newPage();
  await site.goto(`${origin}/fixture`);
  await waitFor(
    async () =>
      await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        let tab;
        for (const t of tabs) {
          const f = await chrome.webNavigation
            .getFrame({ tabId: t.id, frameId: 0 })
            .catch(() => null);
          if (f?.url.includes("/fixture")) tab = t;
        }
        if (!tab) return false;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "GET_UNDO_COUNT" });
          return true;
        } catch {
          return false;
        }
      }),
    "content ready",
  );
  const session = await context.newCDPSession(site);
  const tabTargets = new WeakMap();
  async function action(page = site) {
    await page.bringToFront();
    const { targetInfos } = await browserCDP.send("Target.getTargets", {
      filter: [{ type: "tab" }],
    });
    const target = tabTargets.get(page) ?? targetInfos.find((t) => t.url === page.url());
    tabTargets.set(page, target);
    assert(target, "tab target exists");
    await browserCDP.send("Extensions.triggerAction", { id, targetId: target.targetId });
  }
  async function panel(fn, arg) {
    const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
    const node = findNode(root, (n) => n.nodeName === "DIALOG");
    assert(node, "in-page dialog exists");
    const { object } = await session.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
    const result = await session.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function(arg){return (${fn.toString()})(this,arg)}`,
      arguments: [{ value: arg }],
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.text + JSON.stringify(result.exceptionDetails.exception),
      );
    return result.result.value;
  }
  async function click(selector) {
    await waitFor(
      () => panel((d) => !d.innerText.includes("Finding this item")),
      "preview settled before click",
    );
    await waitFor(
      () => panel((d, s) => !!d.querySelector(s) && !d.querySelector(s).disabled, selector),
      `button exists: ${selector}`,
    );
    const rect = await panel((d, s) => {
      const e = d.querySelector(s);
      if (!e) throw Error(s);
      e.scrollIntoView({ block: "nearest" });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    await site.mouse.click(rect.x, rect.y);
  }
  async function textIncludes(text) {
    return panel((d, t) => d.innerText.includes(t), text);
  }
  async function count() {
    return worker.evaluate(async (o) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open("veil-db");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      try {
        return await new Promise((res, rej) => {
          const r = db.transaction("records").objectStore("records").getAll();
          r.onsuccess = () => res(r.result.filter((x) => x.pageContext.origin === o).length);
          r.onerror = () => rej(r.error);
        });
      } finally {
        db.close();
      }
    }, origin);
  }
  async function hidden(selector, expected = true, page = site) {
    await page.waitForFunction(
      ({ selector, expected }) =>
        (getComputedStyle(document.querySelector(selector)).display === "none") === expected,
      { selector, expected },
    );
  }
  async function hide(selector) {
    await site.keyboard.press("Control+Shift+E");
    await site.locator(selector).click();
    await site.keyboard.press("Escape");
    await hidden(selector);
  }

  await site.locator("#before").focus();
  const before = await site.locator("#one").boundingBox();
  await action();
  await waitFor(() => site.locator("[data-veil-panel]").count(), "toolbar opens panel");
  await waitFor(() => textIncludes("Nothing hidden on this site"), "empty state");
  assert.equal(
    await site.locator("[data-veil-panel]").evaluate((e) => e.shadowRoot),
    null,
    "closed shadow",
  );
  assert.equal((await site.locator("#one").boundingBox()).x, before.x, "no page reflow");
  assert.equal(
    await panel((d) => d.getRootNode().activeElement.getAttribute("aria-label")),
    "Close Veil",
  );
  await action();
  assert.equal(await site.locator("[data-veil-panel]").count(), 0);
  assert.equal(await site.evaluate(() => document.activeElement.id), "before", "focus restored");
  await action();
  await action();
  await action();
  assert.equal(await site.locator("[data-veil-panel]").count(), 1, "rapid toggles keep one panel");
  await click(".select-button");
  assert.equal(await site.locator("[data-veil-panel]").count(), 0, "selection folds panel");
  await site.locator("#one").click();
  await site.keyboard.press("Escape");
  await hidden("#one");
  await waitFor(() => textIncludes("section ·"), "selection returns to panel");
  assert.equal(await count(), 1);
  assert.equal(
    await panel((d) => d.querySelector(".locate-button").textContent.length <= 21),
    true,
    "brief tag/content label",
  );
  assert.equal(
    await panel((d) =>
      d.innerText.includes("메모 PC 바로가기 아주 긴 원문은 상세에서만 표시합니다"),
    ),
    false,
    "raw text collapsed",
  );
  assert.equal(
    await panel((d) => d.querySelectorAll(".record-disclosure,button button").length),
    0,
    "no disclosure or nested buttons",
  );
  const icon = await panel((d) => {
    const svg = d.querySelector('[aria-label^="Restore item"] svg');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      fill: getComputedStyle(svg).fill,
      path: !!svg.querySelector("path"),
    };
  });
  assert(
    icon?.path && icon.width === 16 && icon.height === 16 && icon.fill !== "rgba(0, 0, 0, 0)",
    "restore SVG rendered at visible size",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-restore-icon.png") });
  await click('[aria-label^="Restore item"]');
  await hidden("#one", false);
  await waitFor(async () => (await count()) === 0, "restore DB");
  await waitFor(() => textIncludes("Nothing hidden on this site"), "restore count zero");
  console.log("PASS toolbar, selection return, simple rows, individual restore");
  await site.keyboard.press("Escape");
  await hide("#one");
  await hide("#two");
  await hide("#three");
  await site.reload();
  await hidden("#one");
  await hidden("#two");
  await hidden("#three");
  const sibling = await context.newPage();
  await sibling.goto(`${origin}/fixture`);
  await hidden("#one", true, sibling);
  await site.bringToFront();
  await action();
  await waitFor(() => panel((d) => d.querySelectorAll(".record").length === 3), "three saved rows");
  console.log("PASS reload hidden rules, three records");
  const cssBefore = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
  const visibleScroll = await site.evaluate(() => scrollY);
  await click(".record:nth-child(3) .locate-button");
  await hidden("#one", false);
  assert.equal(await count(), 3, "preview retains DB");
  assert.deepEqual(
    await worker.evaluate(() => chrome.storage.local.get("veil:css:all")),
    cssBefore,
    "preview retains preload cache",
  );
  assert.equal(
    await panel((d) => d.getRootNode().activeElement.classList.contains("locate-button")),
    true,
    "preview keeps panel keyboard focus",
  );
  assert.equal(
    await site.evaluate(() => scrollY),
    visibleScroll,
    "onscreen target does not force scrolling",
  );
  assert.equal(
    await site.locator("#one").evaluate((e) => getComputedStyle(e).outlineStyle),
    "solid",
  );
  await waitFor(() => textIncludes("Temporarily showing"), "preview status committed");
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-preview-desktop.png") });
  await site.keyboard.press("Escape");
  await site.setViewportSize({ width: 375, height: 720 });
  await click(".record:nth-child(3) .locate-button");
  await hidden("#one", false);
  assert.equal(
    await panel((d) => {
      const r = document.querySelector("#one").getBoundingClientRect();
      return r.top < d.getBoundingClientRect().top && r.bottom > 0;
    }),
    true,
    "mobile preview leaves actual target visible above the panel",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-preview-375.png") });
  await worker.evaluate(
    (o) => chrome.storage.local.set({ [`veil:hiding-enabled:${encodeURIComponent(o)}`]: false }),
    origin,
  );
  await hidden("#one", false);
  await hidden("#two", false);
  await waitFor(
    () => panel((d) => d.dataset.preview === "false"),
    "pause clears temporary preview",
  );
  await site.keyboard.press("Escape");
  await hidden("#one", false);
  await worker.evaluate(
    (o) => chrome.storage.local.remove(`veil:hiding-enabled:${encodeURIComponent(o)}`),
    origin,
  );
  await hidden("#one");
  await hidden("#two");
  await hidden("#three");
  await site.setViewportSize({ width: 1100, height: 800 });
  await action();
  await site.evaluate(() => {
    const target = document.querySelector("#one");
    const parent = document.createElement("div");
    parent.id = "hidden-parent";
    parent.style.display = "none";
    target.before(parent);
    parent.append(target);
  });
  await click(".record:nth-child(3) .locate-button");
  await waitFor(() => textIncludes("hidden container"), "hidden ancestor reported honestly");
  assert.equal(await panel((d) => d.dataset.preview), "false");
  await site.evaluate(() =>
    document.querySelector("#hidden-parent").replaceWith(document.querySelector("#one")),
  );
  await click(".record:nth-child(2) .locate-button");
  await hidden("#one");
  await hidden("#two", false);

  await site.keyboard.press("Escape");
  await hidden("#two");
  assert.equal(await site.locator("[data-veil-panel]").count(), 1, "Esc ends preview first");
  await click(".record:nth-child(1) .locate-button");
  await hidden("#three", false);
  assert(
    await site.locator("#three").evaluate((e) => e.getBoundingClientRect().top < innerHeight),
    "preview scrolls actual target",
  );
  await click('.record:nth-child(1) [aria-label^="Restore item"]');
  await hidden("#three", false);
  await hidden("#three", false, sibling);
  await waitFor(async () => (await count()) === 2, "preview then persistent restore");
  await click(".record:nth-child(1) .locate-button");
  await hidden("#two", false);
  await action();
  await hidden("#two");
  await action();
  await click(".select-button");
  await hidden("#two");
  await site.keyboard.press("Escape");
  assert.equal(await site.locator("[data-veil-panel]").count(), 1);
  await click('.record:nth-child(1) [aria-label^="Restore item"]');
  await hidden("#two", false);
  await hidden("#two", false, sibling);
  await waitFor(async () => (await count()) === 1, "restore across tabs");
  await hidden("#one");
  await hidden("#one", true, sibling);
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelectorAll(".record").length === 1 && !d.querySelector(".locate-button").disabled,
      ),
    "restore settled before keyboard",
  );
  await panel((d) => {
    d.querySelector(".locate-button").focus();
  });
  await site.keyboard.press("Tab");

  await waitFor(
    () => panel((d) => !!d.querySelector('[role="tooltip"]')),
    "focus tooltip stays in shadow",
  );
  await site.keyboard.press("Escape");
  assert.equal(await site.locator("[data-veil-panel]").count(), 1, "tooltip Escape takes priority");
  await click(".panel-header button:first-of-type");
  await waitFor(() => textIncludes("The latest changes"), "updates timeline");
  await site.keyboard.press("Escape");
  await waitFor(() => textIncludes("Hidden items"), "updates back");
  assert.equal(await panel((d) => d.getRootNode().activeElement.textContent), "Updates");

  console.log("PASS preview and persistent restore, tooltip and updates");
  for (const width of [320, 375, 1100]) {
    await site.setViewportSize({ width, height: 720 });
    for (const colorScheme of ["light", "dark"]) {
      await site.emulateMedia({ colorScheme });
      await waitFor(
        () =>
          panel(
            (d, bg) => getComputedStyle(d).backgroundColor === bg,
            colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)",
          ),
        "theme background",
      );
      const geometry = await panel((d) => ({
        width: d.getBoundingClientRect().width,
        scroll: d.scrollWidth,
        client: d.clientWidth,
        font: getComputedStyle(d).fontSize,
        button: getComputedStyle(d.querySelector("button")).height,
      }));
      assert(
        geometry.width <= width && geometry.scroll <= geometry.client,
        "no horizontal clipping",
      );
      assert.equal(geometry.font, "14px");
      assert.equal(geometry.button, "32px");
      for (let i = 0; i < 14; i++) {
        await site.keyboard.press("Tab");
        assert.equal(
          await panel((d) => d.contains(d.getRootNode().activeElement)),
          true,
          "modal keyboard focus stays inside",
        );
      }
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-${width}-${colorScheme}.png`),
      });
    }
  }
  const normal = await panel((d) => ({
    font: getComputedStyle(d).fontFamily,
    padding: getComputedStyle(d.querySelector(".panel")).paddingLeft,
    button: getComputedStyle(d.querySelector("button")).height,
  }));
  await site.addStyleTag({
    content:
      "html{font-size:60px!important;--bolerish-density:4;--bolerish-unit:60px;--bolerish-font-body:serif}div,button,section{all:unset!important;display:block!important;color:red!important;background:magenta!important}*{font-family:serif!important}",
  });
  assert.deepEqual(
    await panel((d) => ({
      font: getComputedStyle(d).fontFamily,
      padding: getComputedStyle(d.querySelector(".panel")).paddingLeft,
      button: getComputedStyle(d.querySelector("button")).height,
    })),
    normal,
    "hostile page CSS isolated",
  );
  await site.keyboard.press("Escape");
  await site.reload();
  await hidden("#one");
  await hidden("#two", false);
  await hidden("#three", false);
  await action();
  await click(".record .locate-button");
  await hidden("#one", false);
  await site.evaluate(() => history.pushState({}, "", "/elsewhere"));
  await hidden("#one");
  await click(".record .locate-button");
  await waitFor(() => textIncludes("another page"), "different-path preview unavailable");
  await site.evaluate(() => document.querySelector("[data-veil-panel]").remove());
  await waitFor(
    () =>
      site
        .locator("[data-veil-panel]")
        .count()
        .then((n) => n === 0),
    "host removal cleanup",
  );
  await action();
  await waitFor(() => textIncludes("Hidden items"), "reopen after removed host");
  await worker.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async () => {
      chrome.storage.local.set = original;
      throw Error("injected storage write failure");
    };
  });
  await click('[aria-label^="Restore item"]');
  await waitFor(() => textIncludes("could not read or save"), "save failure shown at operation");
  assert.equal(await count(), 1, "failed restore preserves DB");

  await panel((d) =>
    Array.from(d.querySelectorAll("button"))
      .find((b) => b.textContent.includes("Reset this site"))
      .scrollIntoView(),
  );
  await click(".reset button");
  await site.keyboard.press("Escape");
  assert.equal(
    await panel((d) => !!d.querySelector('[aria-label="Confirm site reset"]')),
    false,
    "Esc cancels reset first",
  );
  await click(".reset button");
  await click(".reset .actions button:first-child");
  await waitFor(async () => (await count()) === 0, "reset DB");
  await hidden("#one", false);
  await hidden("#one", false, sibling);
  await site.reload();
  await hidden("#one", false);
  await action();
  await waitFor(() => textIncludes("Nothing hidden"), "reset persists reload");
  await site.keyboard.press("Escape");

  // Content-origin authority is checked on actual messages sent from the isolated world.
  const { frameTree } = await session.send("Page.getFrameTree");
  const { executionContextId } = await session.send("Page.createIsolatedWorld", {
    frameId: frameTree.frame.id,
    worldName: "veil-authority-probe",
  });
  // Execute with the extension's own isolated context, located through Runtime events.
  const contexts = [];
  session.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
  await session.send("Runtime.disable");
  await session.send("Runtime.enable");
  await waitFor(
    () => contexts.some((c) => c.origin === `chrome-extension://${id}`),
    "extension isolated world",
  );
  const extensionWorld = contexts.find((c) => c.origin === `chrome-extension://${id}`);
  const rejected = await session.send("Runtime.evaluate", {
    contextId: extensionWorld.id,
    expression:
      'chrome.runtime.sendMessage({type:"RESET_HIDDEN_SITE",origin:"https://example.com"})',
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(rejected.result.value.ok, false, "cross-origin management rejected");
  assert(executionContextId);
  await site.evaluate((o) => {
    const iframe = document.createElement("iframe");
    iframe.src = `${o}/frame`;
    document.body.append(iframe);
  }, origin);
  await waitFor(() => site.frames().length === 2, "iframe loaded");
  const iframeAuthority = await worker.evaluate(async (o) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id, allFrames: true },
      func: async (origin) => {
        if (window === top) return null;
        return chrome.runtime.sendMessage({ type: "LIST_HIDDEN_ITEMS", origin });
      },
      args: [o],
    });
    return results.find((result) => result.frameId !== 0)?.result;
  }, origin);
  assert.equal(iframeAuthority.ok, false, "iframe management rejected despite matching origin");
  const unsupported = await context.newPage();
  await unsupported.goto("chrome://version");
  await action(unsupported);
  await waitFor(
    () => context.pages().some((p) => p.url().endsWith("/unavailable.html")),
    "unsupported page opens guidance",
  );
  const guidance = context.pages().find((p) => p.url().endsWith("/unavailable.html"));
  await guidance.getByRole("heading", { name: "Veil could not open on that page" }).waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: real toolbar action, isolated in-page UI, preview cleanup, restore/reset DB+CSS+open tabs+reload, keyboard/Escape, 320/375, themes, hostile CSS, origin validation, unsupported guidance",
  );
  console.log(
    `Screenshots: ${values.screenshot.replace(/\.png$/, "-{320,375,1100}-{light,dark}.png")}`,
  );
} finally {
  await context?.close();
  await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
}
async function waitFor(check, label) {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 40));
  }
  assert.fail(label);
}
