/* eslint-disable no-await-in-loop -- Browser interactions and viewport checks are sequential. */
// Build first. Chrome's Extensions.triggerAction dispatches the real toolbar action.
// node scripts/verify-sidepanel.ts --chromium /path/to/Chrome
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type BrowserContext, type Page } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;
type DOMNode = {
  nodeName: string;
  backendNodeId: number;
  children?: DOMNode[];
  shadowRoots?: DOMNode[];
};
type TabTarget = { targetId: string; url: string };
type ExecutionContext = { id: number; origin: string };
import type { HiddenElementRecord } from "../src/features/record/schema.ts";

const { values } = parseArgs({
  options: {
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    "firefox-build": { type: "string" },
    screenshot: { type: "string", default: "/tmp/veil-in-page-panel.png" },
  },
});
assert(values.chromium, "Pass --chromium (Chrome with Extensions.triggerAction)");
const directory = await mkdtemp(join(tmpdir(), "veil-page-panel-"));
const fixture =
  '<!doctype html><html lang="en"><head><title>Veil test</title><style>body{margin:20px;font:16px/1.5 sans-serif}section{height:120px;background:#eee;margin:20px 0;padding:20px}#spacer{height:700px}</style></head><body><button id="before">Page focus</button><h1>Reading page</h1><section id="one">메모 PC 바로가기 아주 긴 원문은 상세에서만 표시합니다</section><section id="two">Second distraction, with lengthy raw text for details</section><p>Keep this content</p><div id="spacer"></div><section id="three">Far away distraction</section><p>Keep reading</p></body></html>';
const regressionFixture = `<!doctype html><html lang="en"><head><title>Veil regression cases</title><style>
body{margin:20px;font:16px/1.5 sans-serif}#outer{border:2px solid;padding:14px}#middle{padding:10px}#single{padding:20px}
#nested{height:160px;overflow:auto;border:2px solid;width:min(400px,80vw)}#nested-target{height:80px;background:#ddd}
#far-target{height:100px;background:#ddd}#fixed-target{position:fixed;right:20px;top:100px;width:200px;height:70px;background:#ddd}
</style></head><body><h1>Selection and preview cases</h1>
<div id="outer"><div id="middle"><p id="single">Chosen child</p></div></div>
<div id="nested"><div style="height:260px"></div><p id="nested-target" style="opacity:0.65 !important;transition:opacity 2s linear">Nested target</p><div style="height:500px"></div></div>
<p id="same-a">Same label</p><p id="same-b">Same label</p>
<div style="height:1800px"></div><p id="far-target">Far target</p><div style="height:1200px"></div>
<p id="fixed-target">Covered target</p></body></html>`;
const mediaFixture = `<!doctype html><html><head><style>body{margin:20px;font:16px/1.5 sans-serif}.media{border:2px solid;padding:20px;margin:20px 0}p{padding:12px}</style></head><body>
<h1>Media and long list</h1><div class="media" id="frame-wrapper"><iframe title="Weather widget" src="https://external.example/frame" width="220" height="100"></iframe></div>
<div class="media" id="image-wrapper"><img alt="Mountain lake" width="160" height="100" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='100'%3E%3Crect width='160' height='100' fill='gray'/%3E%3C/svg%3E"></div>
<video id="video-target" aria-label="Nature clip" width="220" height="100"></video>
${Array.from({ length: 14 }, (_, i) => `<p id="item-${i}">Saved content ${i} with a title long enough to wrap on a narrow screen</p>`).join("")}
<div style="height:600px"></div></body></html>`;
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(
    (_req.url ?? "").startsWith("/media")
      ? mediaFixture
      : (_req.url ?? "").startsWith("/regressions")
        ? regressionFixture
        : fixture,
  );
});
let context: BrowserContext | undefined;
try {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const manifest = JSON.parse(await readFile(join(values.build, "manifest.json"), "utf8"));
  assert(!manifest.action.default_popup && !manifest.side_panel && !manifest.sidebar_action);
  assert(!manifest.permissions.includes("sidePanel") && !manifest.permissions.includes("tabs"));
  const baseCatalog: Record<string, { message: string }> = JSON.parse(
    await readFile(join(values.build, "_locales/en/messages.json"), "utf8"),
  );
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(
      await readFile(join(values.build, "_locales", locale, "messages.json"), "utf8"),
    );
    for (const key of ["panel_current_site", "panel_loading", "panel_count_help"])
      assert(catalog[key]?.message, `${locale}: ${key}`);
    for (const key of ["panel_hidden_count_one", "panel_hidden_count_other"])
      assert(catalog[key]?.message.includes("$1"), `${locale}: count placeholder`);
    for (const suffix of ["one", "other"]) {
      const noun = catalog[`panel_hidden_noun_${suffix}`]?.message;
      assert(noun, `${locale}: count noun`);
      assert(
        !catalog[`panel_hidden_count_${suffix}`].message.includes(noun),
        `${locale}: number and noun are not duplicated`,
      );
    }
    assert.deepEqual(
      Object.keys(catalog).sort(),
      Object.keys(baseCatalog).sort(),
      `${locale}: same message keys`,
    );
    for (const [key, entry] of Object.entries(baseCatalog)) {
      assert.deepEqual(
        catalog[key].message.match(/\$\d+/g) ?? [],
        entry.message.match(/\$\d+/g) ?? [],
        `${locale}/${key}: placeholders match`,
      );
    }
    assert(catalog.panel_restore_tooltip.message.length <= 12, `${locale}: brief unhide tooltip`);
  }
  if (values["firefox-build"]) {
    const registered: Record<string, (...args: unknown[]) => unknown> = {};
    const event = (name: string) => ({
      addListener: (fn: (...args: unknown[]) => unknown) => {
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
        getURL: (path: string) => `moz-extension://test${path}`,
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
  const activeContext = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1100, height: 800 },
    args: ["--enable-unsafe-extension-debugging"],
  });
  context = activeContext;
  activeContext.setDefaultTimeout(7000);
  const browserCDP = await activeContext.browser()!.newBrowserCDPSession();
  const { id } = await browserCDP.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  const worker =
    activeContext.serviceWorkers()[0] ?? (await activeContext.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.runtime.getManifest());
  const englishCatalog: Record<string, { message: string }> = JSON.parse(
    await readFile(join(values.build, "_locales/en/messages.json"), "utf8"),
  );
  const messages: Record<string, string> = await worker.evaluate(
    (keys) => Object.fromEntries(keys.map((key) => [key, chrome.i18n.getMessage(key)])),
    Object.keys(englishCatalog) as (keyof typeof import("../public/_locales/en/messages.json"))[],
  );

  await waitFor(
    async () => activeContext.pages().some((p) => p.url().endsWith("/welcome.html")),
    "install finished",
  );
  const errors: string[] = [];
  activeContext.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  const site = await activeContext.newPage();
  await site.goto(`${origin}/fixture`);
  await waitFor(
    async () =>
      await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        let tab;
        for (const t of tabs) {
          const f = await chrome.webNavigation
            .getFrame({ tabId: t.id!, frameId: 0 })
            .catch(() => null);
          if (f?.url.includes("/fixture")) tab = t;
        }
        if (!tab) return false;
        try {
          await chrome.tabs.sendMessage(tab.id!, { type: "GET_UNDO_COUNT" });
          return true;
        } catch {
          return false;
        }
      }),
    "content ready",
  );
  const session = await activeContext.newCDPSession(site);
  const panelAnimations: { duration: number; type: string }[] = [];
  await session.send("Animation.enable");
  session.on("Animation.animationStarted", ({ animation }) =>
    panelAnimations.push({ duration: animation.source?.duration ?? 0, type: animation.type }),
  );
  const tabTargets = new WeakMap<Page, TabTarget>();
  async function action(page = site, settle = true) {
    await page.bringToFront();
    const { targetInfos } = await browserCDP.send("Target.getTargets", {
      filter: [{ type: "tab" }],
    });
    const target = tabTargets.get(page) ?? targetInfos.find((t) => t.url === page.url());
    assert(target, "tab target exists");
    tabTargets.set(page, target);
    await browserCDP.send("Extensions.triggerAction", { id, targetId: target.targetId });
    if (settle && page === site)
      await waitFor(
        async () =>
          (await site.locator("[data-veil-panel]").count()) === 0 ||
          (await panel((d) => d.getAnimations().length === 0)),
        "panel transition settled",
      );
  }
  async function panel<T, A = undefined>(
    fn: (dialog: HTMLDialogElement, arg: A) => T,
    arg?: A,
  ): Promise<Awaited<T>> {
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
  async function click(selector: string) {
    await waitFor(
      () => panel((d) => d.getAnimations().length === 0),
      "panel is stable before pointer input",
    );
    await waitFor(
      () => panel((d, t) => !d.innerText.includes(t), messages.panel_find),
      "preview settled before click",
    );
    await waitFor(
      () =>
        panel(
          (d, s) =>
            !!d.querySelector<HTMLButtonElement>(s) &&
            !d.querySelector<HTMLButtonElement>(s)!.disabled,
          selector,
        ),
      `button exists: ${selector}`,
    );
    const rect = await panel((d, s) => {
      const e = d.querySelector<HTMLButtonElement>(s);
      if (!e) throw Error(s);
      e.scrollIntoView({ block: "nearest" });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    await site.mouse.click(rect.x, rect.y);
    if (selector.includes("locate-button"))
      await waitFor(
        () => panel((d, t) => !d.innerText.includes(t), messages.panel_find),
        "preview layout settled",
      );
  }
  async function textIncludes(text: string) {
    return panel((d, t) => d.innerText.includes(t), text);
  }
  async function count() {
    return worker.evaluate(async (o) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("veil-db");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      try {
        return await new Promise<number>((res, rej) => {
          const r = db.transaction("records").objectStore("records").getAll();
          r.onsuccess = () =>
            res(
              (r.result as HiddenElementRecord[]).filter((x) => x.pageContext.origin === o).length,
            );
          r.onerror = () => rej(r.error);
        });
      } finally {
        db.close();
      }
    }, origin);
  }
  async function hidden(selector: string, expected = true, page = site) {
    await page.waitForFunction(
      ({ selector, expected }) =>
        (getComputedStyle(document.querySelector(selector)!).display === "none") === expected,
      { selector, expected },
    );
  }
  async function hide(
    selector: string,
    options?: Parameters<ReturnType<Page["locator"]>["click"]>[0],
  ) {
    await waitFor(
      async () => (await site.locator("[data-veil-panel]").count()) === 0,
      "panel closed before shortcut",
    );
    await site.keyboard.press("Control+Shift+E");
    await site.locator(selector).click(options);
    await site.keyboard.press("Escape");
    await hidden(selector);
  }

  await site.locator("#before").focus();
  const before = await site.locator("#one").boundingBox();
  assert(before);
  await action(site, false);
  await waitFor(
    () => panelAnimations.some((a) => a.type === "WebAnimation" && a.duration === 120),
    "panel entrance animation observed through CDP",
  );
  await waitFor(() => panel((d) => d.getAnimations().length === 0), "panel entrance finishes");
  await waitFor(() => site.locator("[data-veil-panel]").count(), "toolbar opens panel");
  await waitFor(() => textIncludes(messages.panel_empty_title), "empty state");
  assert.equal(
    await site.locator("[data-veil-panel]").evaluate((e) => e.shadowRoot),
    null,
    "closed shadow",
  );
  assert.equal((await site.locator("#one").boundingBox())!.x, before.x, "no page reflow");
  assert.equal(
    await panel((d) => (d.getRootNode() as ShadowRoot).activeElement!.getAttribute("aria-label")),
    messages.panel_close,
  );
  await action(site, false);
  await waitFor(
    () =>
      panelAnimations.filter((a) => a.type === "WebAnimation" && a.duration === 120).length >= 2,
    "panel exit animation observed through CDP",
  );
  await waitFor(
    async () => (await site.locator("[data-veil-panel]").count()) === 0,
    "exit unmounts after animation",
  );
  assert.equal(await site.evaluate(() => document.activeElement!.id), "before", "focus restored");
  await action(site, false);
  await action(site, false);
  await action(site, false);
  await waitFor(() => panel((d) => d.getAnimations().length === 0), "rapid toggles settled");
  assert.equal(await site.locator("[data-veil-panel]").count(), 1, "rapid toggles keep one panel");
  await site.emulateMedia({ reducedMotion: "reduce" });
  const beforeReducedPanel = panelAnimations.length;
  await action(site, false);
  await waitFor(
    async () => (await site.locator("[data-veil-panel]").count()) === 0,
    "reduced motion closes the panel immediately",
  );
  await action();
  await waitFor(() => textIncludes(messages.panel_empty_title), "reduced motion reopens panel");
  assert.equal(
    panelAnimations.slice(beforeReducedPanel).some((a) => a.type === "WebAnimation"),
    false,
    "reduced motion skips panel entrance and exit animations",
  );
  await site.emulateMedia({ reducedMotion: "no-preference" });
  await click(".select-button");
  assert.equal(await site.locator("[data-veil-panel]").count(), 0, "selection folds panel");
  await site.locator("#one").click();
  await site.keyboard.press("Escape");
  await hidden("#one");
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length === 1),
    "selection returns to panel",
  );
  assert.equal(await count(), 1);
  assert.equal(
    await panel((d) => d.querySelector<HTMLElement>(".locate-button")!.textContent.length <= 60),
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
    const svg = d.querySelector<HTMLElement>(".restore-button svg")!;
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
  await click(".restore-button");
  await hidden("#one", false);
  await waitFor(async () => (await count()) === 0, "restore DB");
  await waitFor(() => textIncludes(messages.panel_empty_title), "restore count zero");
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
    await panel((d) =>
      ((d.getRootNode() as ShadowRoot).activeElement as HTMLElement).classList.contains(
        "locate-button",
      ),
    ),
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
  await waitFor(() => panel((d) => d.dataset.preview === "true"), "preview status committed");
  assert.equal(
    await panel((d) => {
      const status = d.querySelector<HTMLElement>(".preview-status")!;
      const heading = d.querySelector<HTMLElement>(".list-toolbar h2")!.getBoundingClientRect();
      const list = d.querySelector<HTMLElement>(".records")!.getBoundingClientRect();
      return (
        !d.querySelector(".preview-notice") &&
        status.getBoundingClientRect().width === 1 &&
        getComputedStyle(status).clipPath === "inset(50%)" &&
        heading.left === list.left
      );
    }),
    true,
    "preview has no visible banner or return button and keeps the list gutter",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-preview-desktop.png") });
  await site.keyboard.press("Escape");
  await site.setViewportSize({ width: 375, height: 720 });
  await click(".record:nth-child(3) .locate-button");
  await hidden("#one", false);
  assert.equal(
    await panel((d) => {
      const r = document.querySelector<HTMLElement>("#one")!.getBoundingClientRect();
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
    const target = document.querySelector<HTMLElement>("#one")!;
    const parent = document.createElement("div");
    parent.id = "hidden-parent";
    parent.style.display = "none";
    target.before(parent);
    parent.append(target);
  });
  await click(".record:nth-child(3) .locate-button");
  await waitFor(
    () => textIncludes(messages.panel_hidden_parent),
    "hidden ancestor reported honestly",
  );
  assert.equal(await panel((d) => d.dataset.preview), "false");
  await site.evaluate(() =>
    document
      .querySelector<HTMLElement>("#hidden-parent")!
      .replaceWith(document.querySelector<HTMLElement>("#one")!),
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
  await click(".record:nth-child(1) .restore-button");
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
  await click(".record:nth-child(1) .restore-button");
  await hidden("#two", false);
  await hidden("#two", false, sibling);
  await waitFor(async () => (await count()) === 1, "restore across tabs");
  await hidden("#one");
  await hidden("#one", true, sibling);
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelectorAll(".record").length === 1 &&
          !d.querySelector<HTMLButtonElement>(".locate-button")!.disabled,
      ),
    "restore settled before keyboard",
  );
  await panel((d) => {
    d.querySelector<HTMLElement>(".locate-button")!.focus();
  });
  await site.keyboard.press("Tab");

  await waitFor(
    () => panel((d) => !!d.querySelector<HTMLElement>('[role="tooltip"]')!),
    "focus tooltip stays in shadow",
  );
  await site.keyboard.press("Escape");
  assert.equal(await site.locator("[data-veil-panel]").count(), 1, "tooltip Escape takes priority");
  await click(".panel-header button:first-of-type");
  await waitFor(() => textIncludes(messages.panel_updates_help), "updates timeline");
  await site.keyboard.press("Escape");
  await waitFor(() => textIncludes(messages.panel_hidden_items), "updates back");
  assert.equal(
    await panel((d) => (d.getRootNode() as ShadowRoot).activeElement!.textContent),
    messages.panel_updates,
  );

  console.log("PASS preview and persistent restore, tooltip and updates");
  for (const width of [320, 375, 1100]) {
    await site.setViewportSize({ width, height: 720 });
    for (const colorScheme of ["light", "dark"] as const) {
      await site.emulateMedia({ colorScheme });
      await waitFor(
        () =>
          panel(
            (d, bg) => getComputedStyle(d).backgroundColor === bg,
            colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)",
          ),
        "theme background",
      );
      await waitFor(
        () =>
          panel((d) =>
            Array.from(
              d.querySelectorAll(
                ".list-toolbar button,.reset button,.select-button,.site-card,.record-tag",
              ),
            ).every((element) => element.getAnimations().length === 0),
          ),
        "official component theme transitions finish",
      );
      const geometry = await panel((d) => ({
        width: d.getBoundingClientRect().width,
        scroll: d.scrollWidth,
        client: d.clientWidth,
        font: getComputedStyle(d).fontSize,
        button: getComputedStyle(d.querySelector<HTMLElement>("button")!).height,
      }));
      assert(
        geometry.width <= width && geometry.scroll <= geometry.client,
        "no horizontal clipping",
      );
      assert.equal(geometry.font, "14px");
      assert.equal(geometry.button, "32px");
      const cardLayout = await panel((d) => {
        const identity = d.querySelector<HTMLElement>(".site-identity")!.getBoundingClientRect();
        const count = d.querySelector<HTMLElement>(".hidden-count")!.getBoundingClientRect();
        const card = d.querySelector<HTMLElement>(".site-card")!.getBoundingClientRect();
        const preference = d.querySelector<HTMLElement>(".preference")!.getBoundingClientRect();
        const select = d.querySelector<HTMLElement>(".select-button")!.getBoundingClientRect();
        return {
          columns: identity.right <= count.left && identity.top < count.bottom,
          rows: card.bottom <= preference.top && preference.bottom <= select.top,
          countFont: getComputedStyle(d.querySelector(".count-value")!).fontSize,
        };
      });
      assert(
        cardLayout.columns && cardLayout.rows,
        "site identity/count use two columns above separate actions",
      );
      assert.equal(cardLayout.countFont, "24px", "the count retains its semantic heading size");
      if (width <= 375) {
        const stress = await panel(
          (d, value) => {
            const domain = d.querySelector<HTMLElement>(".site-title")!;
            const number = d.querySelector<HTMLElement>(".count-value")!;
            const original = [domain.textContent, number.textContent];
            domain.textContent = `${"longdomain".repeat(10)}.example.com`;
            number.textContent = value;
            const left = domain.getBoundingClientRect();
            const right = number.getBoundingClientRect();
            const card = d.querySelector<HTMLElement>(".site-card")!;
            const result = {
              overlap: left.right > right.left,
              overflow: card.scrollWidth > card.clientWidth,
            };
            [domain.textContent, number.textContent] = original;
            return result;
          },
          messages.panel_hidden_count_other.replace("$1", "123,456,789"),
        );
        assert(
          !stress.overlap && !stress.overflow,
          "long domain and large count fit without shrinking text",
        );
      }
      const components = await panel((d) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        // CSS color-mix and rgba can serialize differently for the same rendered color.
        const rgba = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        };
        const resolveColor = (token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          d.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return rgba(color);
        };
        const inspect = (selector: string) => {
          const element = d.querySelector<HTMLElement>(selector)!;
          const style = getComputedStyle(element);
          return {
            border: style.borderTopWidth,
            borderStyle: style.borderTopStyle,
            borderColor: rgba(style.borderTopColor),
            background: rgba(style.backgroundColor),
            radius: style.borderTopLeftRadius,
            height: style.height,
            font: style.fontSize,
          };
        };
        const shadow = d.getRootNode() as ShadowRoot;
        return {
          unresolvedImports: shadow.querySelector("style")!.textContent.includes("@import"),
          neutral: resolveColor("--veil-color-stroke-default"),
          blue: resolveColor("--veil-panel-focus"),
          primary: resolveColor("--veil-color-bg-action-primary"),
          refresh: inspect(".list-toolbar button"),
          reset: inspect(".reset button"),
          select: inspect(".select-button"),
          badge: inspect(".record-tag"),
          card: inspect(".site-card"),
        };
      });
      assert.equal(
        components.unresolvedImports,
        false,
        "package CSS imports are bundled in shadow",
      );
      for (const control of [components.refresh, components.reset]) {
        assert.equal(control.border, "1px", "official outline button has a visible border");
        assert.equal(control.borderStyle, "solid");
        assert.deepEqual(control.borderColor, components.neutral, "button border stays neutral");
        assert.equal(control.height, "32px", "official sm button geometry resolves");
        assert.equal(control.font, "14px");
        assert.notEqual(control.radius, "0px");
      }
      assert.deepEqual(
        components.select.background,
        components.primary,
        "official primary fill resolves",
      );
      for (const component of [components.badge, components.card]) {
        assert.equal(component.border, "1px", "official Badge/Card border resolves");
        assert.deepEqual(component.borderColor, components.neutral);
        assert.notEqual(component.radius, "0px");
      }
      assert.notDeepEqual(
        components.blue,
        components.neutral,
        "blue focus differs from neutral borders",
      );
      console.log("PASS official component CSS", { width, colorScheme, ...components });
      for (let i = 0; i < 14; i++) {
        await site.keyboard.press("Tab");
        assert.equal(
          await panel((d) => d.contains((d.getRootNode() as ShadowRoot).activeElement!)),
          true,
          "modal keyboard focus stays inside",
        );
      }
      await panel((d) => {
        const button = d.querySelector<HTMLElement>(".restore-button")!;
        button.scrollIntoView({ block: "nearest" });
        button.focus();
      });
      await waitFor(
        () => panel((d) => !!d.querySelector('[role="tooltip"]')),
        "localized tooltip visible",
      );
      await waitFor(
        () =>
          panel((d, width) => {
            const r = d.querySelector<HTMLElement>('[role="tooltip"]')!.getBoundingClientRect();
            return r.width > 0 && r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= 720;
          }, width),
        `tooltip position settled inside viewport (${width}/${colorScheme})`,
      ).catch(async (error) => {
        console.error(
          "Tooltip bounds",
          await panel((d) => ({
            tooltip: d
              .querySelector<HTMLElement>('[role="tooltip"]')!
              .getBoundingClientRect()
              .toJSON(),
            trigger: d
              .querySelector<HTMLElement>(".restore-button")!
              .getBoundingClientRect()
              .toJSON(),
          })),
        );
        await site.screenshot({
          path: values.screenshot.replace(/\.png$/, "-tooltip-failure.png"),
        });
        throw error;
      });
      const tooltip = await panel((d) => {
        const tip = d.querySelector<HTMLElement>('[role="tooltip"]')!,
          r = tip.getBoundingClientRect(),
          button = d.querySelector<HTMLElement>(".restore-button")!;
        return {
          text: tip.textContent?.trim(),
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          name: button.getAttribute("aria-label"),
          descriptions: button.getAttribute("aria-describedby")?.split(/\s+/).length ?? 0,
        };
      });
      assert.equal(tooltip.text, messages.panel_restore_tooltip);
      assert(
        tooltip.left >= 0 && tooltip.right <= width && tooltip.top >= 0 && tooltip.bottom <= 720,
        `tooltip stays in viewport: ${JSON.stringify({ width, colorScheme, tooltip })}`,
      );
      assert(
        tooltip.descriptions <= 1 && (tooltip.name?.length ?? 0) < 100,
        "no long duplicate tooltip description",
      );
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-${width}-${colorScheme}.png`),
      });
    }
  }
  const normal = await panel((d) => ({
    font: getComputedStyle(d).fontFamily,
    padding: getComputedStyle(d.querySelector<HTMLElement>(".panel")!).paddingLeft,
    button: getComputedStyle(d.querySelector<HTMLElement>("button")!).height,
  }));
  await site.addStyleTag({
    content:
      "html{font-size:60px!important;--bolerish-density:4;--bolerish-unit:60px;--bolerish-font-body:serif}div,button,section{all:unset!important;display:block!important;color:red!important;background:magenta!important}*{font-family:serif!important}",
  });
  assert.deepEqual(
    await panel((d) => ({
      font: getComputedStyle(d).fontFamily,
      padding: getComputedStyle(d.querySelector<HTMLElement>(".panel")!).paddingLeft,
      button: getComputedStyle(d.querySelector<HTMLElement>("button")!).height,
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
  await waitFor(
    () => textIncludes(messages.panel_other_page),
    "different-path preview unavailable",
  );
  await site.evaluate(() => document.querySelector<HTMLElement>("[data-veil-panel]")!.remove());
  await waitFor(
    () =>
      site
        .locator("[data-veil-panel]")
        .count()
        .then((n) => n === 0),
    "host removal cleanup",
  );
  await action();
  await waitFor(() => textIncludes(messages.panel_hidden_items), "reopen after removed host");
  await worker.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async () => {
      chrome.storage.local.set = original;
      throw Error("injected storage write failure");
    };
  });
  await click(".restore-button");
  await waitFor(() => textIncludes(messages.panel_save_error), "save failure shown at operation");
  assert.equal(await count(), 1, "failed restore preserves DB");

  await panel((d) => d.querySelector<HTMLElement>(".reset button")!.scrollIntoView());
  await click(".reset button");
  await site.keyboard.press("Escape");
  assert.equal(
    await panel((d) => !!d.querySelector<HTMLElement>('.reset [role="group"]')),
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
  await waitFor(() => textIncludes(messages.panel_empty_title), "reset persists reload");
  await site.keyboard.press("Escape");

  // These cases exercise the built content script, real selection, DB and preload CSS.
  await site.goto(`${origin}/regressions`);
  await site.waitForTimeout(300);
  await hide("#single");
  await waitFor(async () => (await count()) >= 1, "selection saved");
  await site.waitForTimeout(450);
  assert.equal(await count(), 1, "one click creates exactly one record");
  assert.deepEqual(
    await site.locator("[data-veil-hidden]").evaluateAll((es) => es.map((e) => e.id)),
    ["single"],
    "no automatically saved ancestors or descendants",
  );
  await hide("#outer", { position: { x: 2, y: 2 } });
  await waitFor(
    async () => (await count()) === 2,
    "separately chosen parent preserves both records",
  );
  await action();
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length === 2),
    "explicit parent and child have two rows",
  );
  await click(".reset button");
  await click(".reset .actions button:first-child");
  await waitFor(async () => (await count()) === 0, "reset regression selection");
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelectorAll(".record").length === 0 && !d.querySelector('.reset [role="group"]'),
      ),
    "reset UI settled",
  );
  await action();
  await waitFor(
    async () => (await site.locator("[data-veil-panel]").count()) === 0,
    "panel closed before selection",
  );
  for (const selector of ["#same-a", "#same-b", "#nested-target", "#far-target", "#fixed-target"])
    await hide(selector);
  await waitFor(
    async () => (await count()) === 5,
    "distinct selections with identical labels retained",
  );
  await site.reload();
  for (const selector of ["#same-a", "#same-b", "#nested-target", "#far-target", "#fixed-target"])
    await hidden(selector);
  await action();
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length === 5),
    "five selected rows",
  );
  const hiddenStyle = await site.locator("#nested-target").getAttribute("style");
  async function samplePreview() {
    return site.evaluate(async () => {
      const target = document.querySelector<HTMLElement>("#nested-target")!;
      const samples: { opacity: number; display: string; animations: number }[] = [];
      const until = performance.now() + 450;
      await new Promise<void>((resolve) => {
        const frame = () => {
          const style = getComputedStyle(target);
          samples.push({
            opacity: Number(style.opacity),
            display: style.display,
            animations: target.getAnimations().length,
          });
          if (performance.now() < until) requestAnimationFrame(frame);
          else resolve();
        };
        frame();
      });
      return samples;
    });
  }
  const fadeIn = samplePreview();
  await click('.locate-button[aria-label*="Nested"]');
  const entering = await fadeIn;
  assert(
    entering.some((s) => s.animations > 0 && s.opacity > 0 && s.opacity < 0.65),
    "preview actually fades in",
  );
  const fadeOut = samplePreview();
  await site.keyboard.press("Escape");
  const leaving = await fadeOut;
  assert(
    leaving.some((s) => s.animations > 0 && s.opacity > 0 && s.opacity < 0.65),
    "preview actually fades out",
  );
  await hidden("#nested-target");
  assert.equal(
    await site.locator("#nested-target").getAttribute("style"),
    hiddenStyle,
    "fade restores original hidden inline style exactly",
  );
  const beforeReload = panelAnimations.length;
  await site.reload();
  await hidden("#nested-target");
  await site.waitForTimeout(200);
  assert.equal(
    panelAnimations.slice(beforeReload).some((a) => a.type === "WebAnimation"),
    false,
    "initial saved-item hiding does not run a preview fade",
  );
  await action();
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length === 5),
    "panel reopened for nested scroll",
  );
  const savedCache = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
  await panel((d) => {
    for (const label of ["Nested", "Far targ", "Nested"])
      d.querySelector<HTMLButtonElement>(`.locate-button[aria-label*="${label}"]`)!.click();
  });
  await waitFor(
    () =>
      panel((d) =>
        d.querySelector('.locate-button[aria-pressed="true"]')?.textContent?.includes("Nested"),
      ),
    "rapid preview requests keep the latest target",
  );
  await hidden("#nested-target", false);
  await hidden("#far-target");
  await site.keyboard.press("Escape");
  await hidden("#nested-target");
  assert.equal(
    await site.locator("#nested-target").getAttribute("style"),
    hiddenStyle,
    "rapid preview cancellation restores the exact hidden style",
  );
  await site.evaluate(() => {
    document.querySelector<HTMLElement>("#nested")!.scrollTop = 0;
    scrollTo(0, 0);
  });
  assert.equal(await site.locator("#nested").evaluate((e) => e.scrollTop), 0);
  await click('.locate-button[aria-label*="Nested"]');
  await hidden("#nested-target", false);
  assert.equal(
    await site.locator("#nested-target").evaluate((e) => getComputedStyle(e).outlineColor),
    await panel((d) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--veil-panel-focus)";
      d.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
    "preview target uses the panel's blue focus color",
  );
  await waitFor(
    () => site.locator("#nested").evaluate((e) => e.scrollTop > 0),
    "nested container actually scrolls",
  );
  assert.equal(
    await site.locator("#nested-target").evaluate((e) => {
      const r = e.getBoundingClientRect(),
        p = e.parentElement!.getBoundingClientRect();
      return r.bottom > p.top && r.top < p.bottom;
    }),
    true,
    "nested preview lies inside its scrollport",
  );
  assert.equal(
    await panel((d) => d.open && d.querySelectorAll(".record").length === 5),
    true,
    "panel and other rows stay available",
  );
  assert.equal(
    await panel((d) =>
      d
        .querySelector<HTMLElement>('.locate-button[aria-pressed="true"]')!
        .textContent.includes("Nested"),
    ),
    true,
    "active preview identified",
  );
  await site.evaluate(() => document.body.append(document.createElement("span")));
  await site.waitForTimeout(200);
  await hidden("#nested-target", false);
  await site.evaluate(() => {
    const image = document.createElement("img");
    image.id = "late-preview-image";
    document.querySelector("#nested-target")!.before(image);
    setTimeout(() => {
      image.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='400'%3E%3C/svg%3E";
    }, 50);
  });
  await site.waitForFunction(
    () =>
      document.querySelector<HTMLImageElement>("#late-preview-image")?.complete &&
      document.querySelector<HTMLImageElement>("#late-preview-image")!.naturalHeight > 0,
  );
  await waitFor(
    () =>
      site.locator("#nested-target").evaluate((e) => {
        const r = e.getBoundingClientRect(),
          p = e.parentElement!.getBoundingClientRect();
        return r.bottom > p.top && r.top < p.bottom;
      }),
    "late image layout keeps preview inside nested scrollport",
  );
  const scrollBefore = await site.evaluate(() => ({
    page: scrollY,
    nested: document.querySelector<HTMLElement>("#nested")!.scrollTop,
  }));
  await click('.locate-button[aria-label*="Nested"]');
  await site.waitForTimeout(150);
  assert.deepEqual(
    await site.evaluate(() => ({
      page: scrollY,
      nested: document.querySelector<HTMLElement>("#nested")!.scrollTop,
    })),
    scrollBefore,
    "visible preview does not scroll again",
  );
  await click('.locate-button[aria-label*="Far targ"]');
  await hidden("#nested-target");
  await hidden("#far-target", false);
  await waitFor(
    () =>
      site.locator("#far-target").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0;
      }),
    "long page scroll",
  );
  await click('.locate-button[aria-label*="Covered"]');
  await hidden("#far-target");
  await hidden("#fixed-target", false);
  await waitFor(
    () =>
      panel((d) => {
        const p = d.getBoundingClientRect(),
          r = document.querySelector<HTMLElement>("#fixed-target")!.getBoundingClientRect();
        return p.bottom <= r.top || p.top >= r.bottom || p.right <= r.left || p.left >= r.right;
      }),
    "covered fixed target exposed by compact panel placement",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-covered-target.png") });
  assert.equal(await count(), 5, "all previews retain DB");
  assert.deepEqual(
    await worker.evaluate(() => chrome.storage.local.get("veil:css:all")),
    savedCache,
    "all previews retain cache",
  );
  await site.keyboard.press("Escape");
  await hidden("#fixed-target");
  assert.equal(await panel((d) => d.dataset.preview), "false", "Escape ends preview");
  for (const width of [320, 375]) {
    await site.setViewportSize({ width, height: 720 });
    for (const colorScheme of ["light", "dark"] as const) {
      await site.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await click('.locate-button[aria-label*="Nested"]');
      await hidden("#nested-target", false);
      assert.equal(
        await site.locator("#nested-target").evaluate((e) => e.getAnimations().length),
        0,
        "reduced motion skips preview fade",
      );
      await waitFor(
        () => panel((d) => d.dataset.previewLayout === "compact"),
        "narrow compact preview",
      );
      const state = await panel((d) => {
        const row = d.querySelector<HTMLElement>('.locate-button[aria-pressed="true"]')!;
        row.focus();
        return {
          width: d.getBoundingClientRect().width,
          client: d.clientWidth,
          scroll: d.scrollWidth,
          rows: d.querySelectorAll(".record").length,
          selected: getComputedStyle(row.closest(".record-row")!).backgroundColor,
        };
      });
      assert(
        state.width <= width && state.scroll <= state.client && state.rows === 5,
        "narrow preview keeps list without clipping",
      );
      assert.notEqual(state.selected, "rgba(0, 0, 0, 0)", "semantic selection background resolves");
      await site.keyboard.press("Tab");
      await site.keyboard.press("Shift+Tab");
      const focus = await panel((d) => {
        const e = (d.getRootNode() as ShadowRoot).activeElement!,
          s = getComputedStyle(e);
        return {
          visible: e.matches(":focus-visible"),
          style: s.outlineStyle,
          width: s.outlineWidth,
          color: s.outlineColor,
          background: getComputedStyle(e.closest(".record-row")!).backgroundColor,
        };
      });
      assert(
        focus.visible && focus.style === "solid" && focus.width === "2px",
        "keyboard focus remains visible",
      );
      assert.notEqual(focus.background, "rgba(0, 0, 0, 0)", "keyboard row focus has a background");
      assert.equal(
        focus.color,
        await site.locator("#nested-target").evaluate((e) => getComputedStyle(e).outlineColor),
        "keyboard row focus and preview use the same blue color",
      );
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-preview-${width}-${colorScheme}.png`),
      });
      await site.keyboard.press("Escape");
      await hidden("#nested-target");
    }
  }
  await site.setViewportSize({ width: 1100, height: 800 });
  await site.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  // Row hover is a semantic layer, independent of its button's package hover layer.
  const hoverPoint = await panel((d) => {
    const row = d.querySelector<HTMLElement>(".record-row")!,
      r = row.getBoundingClientRect();
    return { x: r.left + 2, y: r.top + 2 };
  });
  await site.mouse.move(hoverPoint.x, hoverPoint.y);
  assert.equal(
    await panel((d) => {
      const e = d.querySelector<HTMLElement>(".record-row")!;
      return e.matches(":hover") && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)";
    }),
    true,
    "row hover background resolves",
  );
  await click(".record:first-child .restore-button");
  await hidden("#fixed-target", false);
  await waitFor(async () => (await count()) === 4, "X removes only selected rule");
  await site.keyboard.press("Escape");
  await site.reload();
  await hidden("#fixed-target", false);
  await hidden("#nested-target");
  console.log(
    "PASS one click/one record+row, explicit parent and child, identical labels, nested and long scroll, fixed overlay, panel retained, active row, return, hover/focus, narrow light/dark reduced motion, X restore reload",
  );

  await activeContext.route("https://external.example/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Cross-origin frame fixture</p>" }),
  );
  await site.goto(`${origin}/media`);
  await site.waitForTimeout(250);
  const beforeMedia = await count();
  await hide("#frame-wrapper", { position: { x: 2, y: 2 } });
  await hide("#image-wrapper", { position: { x: 2, y: 2 } });
  await hide("#video-target");
  for (let i = 0; i < 14; i++) await hide(`#item-${i}`);
  await waitFor(
    async () => (await count()) === beforeMedia + 17,
    "media selections saved once each",
  );
  const presentations = await worker.evaluate(async (o) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("veil-db");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<HiddenElementRecord["target"][]>((resolve, reject) => {
        const r = db.transaction("records").objectStore("records").getAll();
        r.onsuccess = () =>
          resolve(
            (r.result as HiddenElementRecord[])
              .filter((x) => x.pageContext.origin === o && x.pageContext.path === "/media")
              .map((x) => x.target),
          );
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  }, origin);
  assert(
    presentations.some(
      (t) =>
        t.tagName === "div" && t.contentKind === "external" && t.displayText === "Weather widget",
    ),
    "wrapper classified from one iframe without opening its document",
  );
  assert(
    presentations.some(
      (t) => t.tagName === "div" && t.contentKind === "image" && t.displayText === "Mountain lake",
    ),
    "representative image uses alt text",
  );
  assert(
    presentations.some(
      (t) => t.tagName === "video" && t.contentKind === "video" && t.displayText === "Nature clip",
    ),
    "video uses aria label",
  );
  await worker.evaluate(async (o) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("veil-db");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("records", "readwrite"),
          store = transaction.objectStore("records"),
          request = store.getAll();
        request.onsuccess = () => {
          const record = (request.result as HiddenElementRecord[]).find(
            (r) => r.pageContext.origin === o && r.target.displayText === "Mountain lake",
          );
          if (record) {
            delete record.target.contentKind;
            store.put(record);
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, origin);
  await action();
  await waitFor(() => panel((d) => d.querySelectorAll(".record").length >= 17), "long list loaded");
  assert.equal(
    await panel((d) =>
      Array.from(d.querySelectorAll(".locate-button")).some(
        (b) => b.textContent?.includes("Mountain lake") && !b.textContent.includes("undefined"),
      ),
    ),
    true,
    "legacy record without kind has a safe label",
  );
  for (const size of [
    { width: 1100, height: 800 },
    { width: 375, height: 720 },
    { width: 320, height: 480 },
    { width: 320, height: 300 },
  ]) {
    await site.setViewportSize(size);
    const before = await panel((d) => {
      const list = d.querySelector<HTMLElement>(".records")!,
        footer = d.querySelector<HTMLElement>(".reset")!;
      list.scrollTop = 0;
      return {
        footer: footer.getBoundingClientRect().toJSON(),
        list: list.getBoundingClientRect().toJSON(),
        scroll: list.scrollHeight,
        client: list.clientHeight,
      };
    });
    assert(before.scroll > before.client && before.client > 0, "remaining list viewport scrolls");
    const after = await panel((d) => {
      const list = d.querySelector<HTMLElement>(".records")!,
        footer = d.querySelector<HTMLElement>(".reset")!;
      list.scrollTop = list.scrollHeight;
      const li = list.querySelector<HTMLElement>(".record")!,
        row = li.querySelector<HTMLElement>(".record-row")!,
        badge = row.querySelector<HTMLElement>(".record-tag")!,
        button = row.querySelector<HTMLElement>(".restore-button")!;
      const a = li.getBoundingClientRect(),
        b = row.getBoundingClientRect(),
        tag = badge.getBoundingClientRect(),
        x = button.getBoundingClientRect();
      return {
        footer: footer.getBoundingClientRect().toJSON(),
        scroll: list.scrollTop,
        row: {
          left: a.left,
          right: a.right,
          hoverLeft: b.left,
          hoverRight: b.right,
          padding: getComputedStyle(li).paddingBlock,
        },
        alignment: Math.abs((tag.top + tag.bottom) / 2 - (x.top + x.bottom) / 2),
        width: d.clientWidth,
        overflow: d.scrollWidth,
      };
    });
    assert.equal(after.footer.top, before.footer.top, "footer remains fixed when list scrolls");
    assert(
      after.footer.bottom <= size.height && before.list.bottom <= after.footer.top + 1,
      "footer stays in viewport below list",
    );
    assert.equal(after.row.padding, "0px", "no outer row gap");
    assert.equal(after.row.left, after.row.hoverLeft);
    assert.equal(after.row.right, after.row.hoverRight);
    assert(
      after.alignment < 1 && after.overflow <= after.width && after.scroll > 0,
      "badge/X centered; scrollbar does not clip rows",
    );
    // Give the compositor a frame after the resize and nested scroll before capturing pixels.
    await site.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    await site.screenshot({
      path: values.screenshot.replace(/\.png$/, `-list-${size.width}-${size.height}.png`),
    });
  }
  await site.setViewportSize({ width: 375, height: 720 });
  const zoomTab = await worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
  );
  await worker.evaluate((tabId) => chrome.tabs.setZoom(tabId, 2), zoomTab);
  await site.waitForTimeout(150);
  const zoom = await panel((d) => ({
    viewport: innerWidth,
    width: d.clientWidth,
    scroll: d.scrollWidth,
    body: d.querySelector<HTMLElement>(".panel")!.getBoundingClientRect().toJSON(),
    footer: d.querySelector<HTMLElement>(".reset")!.getBoundingClientRect().toJSON(),
  }));
  assert(
    zoom.scroll <= zoom.width && zoom.width <= zoom.viewport,
    "200% browser zoom has no horizontal clipping",
  );
  assert.equal(
    await panel((d) => {
      const content = d.querySelector<HTMLElement>(".site-card > div")!;
      const number = d.querySelector<HTMLElement>(".count-value")!;
      return (
        getComputedStyle(content).gridTemplateColumns.split(" ").length === 1 &&
        getComputedStyle(number).fontSize === "24px"
      );
    }),
    true,
    "extreme width stacks the site card while retaining readable count text",
  );
  const zoomControls = await panel((d) =>
    Array.from(d.querySelectorAll<HTMLElement>(".panel-header > *")).map((e) =>
      e.getBoundingClientRect().toJSON(),
    ),
  );
  for (let i = 0; i < zoomControls.length; i++)
    for (let j = i + 1; j < zoomControls.length; j++) {
      const a = zoomControls[i],
        b = zoomControls[j];
      assert(
        a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
        "header controls do not overlap at 200% zoom",
      );
    }
  await panel((d) => d.querySelector<HTMLElement>(".select-button")!.focus());
  assert.equal(
    await panel((d) => {
      const e = d.querySelector<HTMLElement>(".select-button")!,
        r = e.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    true,
    "site action remains reachable at 200% zoom",
  );
  await panel((d) => d.querySelector<HTMLElement>(".record:last-child .restore-button")!.focus());
  assert.equal(
    await panel((d) => {
      const e = d.querySelector<HTMLElement>(".record:last-child .restore-button")!,
        r = e.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    true,
    "last row action remains reachable at 200% zoom",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-zoom-200.png") });
  await worker.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1), zoomTab);
  await site.setViewportSize({ width: 375, height: 720 });
  await click('.locate-button[aria-label*="Weather"]');
  await hidden("#frame-wrapper", false);
  await site.keyboard.press("Escape");
  await hidden("#frame-wrapper");
  console.log(
    "PASS media labels, real iframe wrapper, tag badges, fixed footer, list scroll, consistent row geometry, narrow and short viewports",
  );

  await site.goto(`${origin}/fixture`);
  await site.waitForTimeout(250);

  // Content-origin authority is checked on actual messages sent from the isolated world.
  const { frameTree } = await session.send("Page.getFrameTree");
  const { executionContextId } = await session.send("Page.createIsolatedWorld", {
    frameId: frameTree.frame.id,
    worldName: "veil-authority-probe",
  });
  // Execute with the extension's own isolated context, located through Runtime events.
  const contexts: ExecutionContext[] = [];
  session.on("Runtime.executionContextCreated", (e) => contexts.push(e.context));
  await session.send("Runtime.disable");
  await session.send("Runtime.enable");
  await waitFor(
    () => contexts.some((c) => c.origin === `chrome-extension://${id}`),
    "extension isolated world",
  );
  const extensionWorld = contexts.find((c) => c.origin === `chrome-extension://${id}`);
  assert(extensionWorld);
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
  await waitFor(
    () => site.frames().some((frame) => frame.url() === `${origin}/frame`),
    "iframe navigation committed",
  );
  await site.bringToFront();
  const iframeAuthority = await worker.evaluate(async (o) => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id!, allFrames: true },
      func: async (origin: string) => {
        if (window === top) return null;
        return chrome.runtime.sendMessage({ type: "LIST_HIDDEN_ITEMS", origin });
      },
      args: [o],
    });
    return results.find((result) => result.frameId !== 0)?.result;
  }, origin);
  assert(iframeAuthority, "iframe returned an authority response");
  assert.equal(iframeAuthority.ok, false, "iframe management rejected despite matching origin");
  const unsupported = await context.newPage();
  await unsupported.goto("chrome://version");
  await action(unsupported);
  await waitFor(
    () => activeContext.pages().some((p) => p.url().endsWith("/unavailable.html")),
    "unsupported page opens guidance",
  );
  const guidance = context.pages().find((p) => p.url().endsWith("/unavailable.html"));
  assert(guidance);
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
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  await rm(directory, { recursive: true, force: true });
}
function findNode(node: DOMNode, predicate: (node: DOMNode) => boolean): DOMNode | undefined {
  if (predicate(node)) return node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
}
async function waitFor(check: () => unknown | Promise<unknown>, label: string) {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 40));
  }
  assert.fail(label);
}
