/* eslint-disable no-await-in-loop -- Each real browser transition must settle before the next one. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import vm from "node:vm";
import { chromium, type Page, type CDPSession, type BrowserContext } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;
type DOMNode = {
  nodeName: string;
  backendNodeId: number;
  attributes?: string[];
  children?: DOMNode[];
  shadowRoots?: DOMNode[];
};
const { values } = parseArgs({
  options: {
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    "firefox-build": { type: "string" },
  },
});
assert(values.chromium, "Pass --chromium with Extensions.loadUnpacked/triggerAction");
const directory = await mkdtemp(join(tmpdir(), "less-settings-"));
const server = createServer((_, response) => {
  response.setHeader("content-type", "text/html");
  response.end(
    '<!doctype html><html><head><style>body{margin:20px}#target{width:240px;height:80px}</style></head><body><div id="target">A page element</div></body></html>',
  );
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
let context: BrowserContext | undefined;
function contrast(foreground: string, background: string): number {
  const fg = foreground.match(/[\d.]+/g)!.map(Number);
  const bg = background.match(/[\d.]+/g)!.map(Number);
  const luminance = (channels: number[]) =>
    channels
      .slice(0, 3)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const alpha = fg[3] ?? 1;
  const first = luminance(
    fg.slice(0, 3).map((value, index) => value * alpha + bg[index] * (1 - alpha)),
  );
  const second = luminance(bg);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
assert.equal(contrast("rgb(0, 0, 0)", "rgb(255, 255, 255)"), 21);
assert.equal(contrast("rgba(0, 0, 0, 0)", "rgb(255, 255, 255)"), 1);
async function waitFor(check: () => Promise<unknown>, label: string) {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error(`Timed out: ${label}`);
}
function findNode(node: DOMNode, predicate: (node: DOMNode) => boolean): DOMNode | undefined {
  if (predicate(node)) return node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
}
async function evaluateNode<T, A>(
  session: CDPSession,
  predicate: (node: DOMNode) => boolean,
  fn: (element: HTMLElement, arg: A) => T,
  arg?: A,
): Promise<Awaited<T>> {
  const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const node = findNode(root, predicate);
  assert(node, "real closed-shadow UI exists");
  const { object } = await session.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
  const result = await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: `function(arg){return (${fn.toString()})(this,arg)}`,
    arguments: [{ value: arg }],
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  const activeContext = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1100, height: 800 },
    args: ["--enable-unsafe-extension-debugging"],
  });
  context = activeContext;
  const errors: string[] = [];
  activeContext.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const cdp = await activeContext.browser()!.newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  const worker =
    activeContext.serviceWorkers()[0] ?? (await activeContext.waitForEvent("serviceworker"));
  await waitFor(
    async () => activeContext.pages().some((page) => page.url().endsWith("/welcome.html")),
    "welcome",
  );
  const welcome = activeContext.pages().find((page) => page.url().endsWith("/welcome.html"))!;
  const site = await activeContext.newPage();
  const other = await activeContext.newPage();
  const sessions = new Map<Page, CDPSession>();
  for (const page of [site, other]) {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(`${origin}/${page === site ? "first" : "second"}`);
    sessions.set(page, await activeContext.newCDPSession(page));
  }
  const panel = <T, A = undefined>(fn: (dialog: HTMLElement, arg: A) => T, arg?: A, page = site) =>
    evaluateNode(sessions.get(page)!, (node) => node.nodeName === "DIALOG", fn, arg);
  async function action(page = site) {
    await page.bringToFront();
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const target = targetInfos.find((target) => target.url === page.url());
    assert(target);
    await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
  }
  async function click(selector: string) {
    const rect = await panel((dialog, selector) => {
      const element = dialog.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      element.scrollIntoView({ block: "nearest" });
      return element.getBoundingClientRect().toJSON();
    }, selector);
    await site.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  }
  async function theme(expected: string, page = site) {
    await waitFor(
      () => page.locator("[data-less-panel]").count(),
      "panel mounted before theme check",
    );
    await waitFor(
      () =>
        panel((dialog) => dialog.dataset.theme, undefined, page).then(
          (actual) => actual === expected,
        ),
      `theme ${expected}`,
    );
    assert.equal(
      await panel((dialog) => getComputedStyle(dialog).backgroundColor, undefined, page),
      expected === "dark" ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)",
    );
  }
  async function store(key: "less:theme" | "less:locale", value: string) {
    await worker.evaluate(({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key,
      value,
    });
  }
  for (const page of [site, other]) {
    await waitFor(
      async () =>
        worker.evaluate(async (url) => {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            const frame = await chrome.webNavigation
              .getFrame({ tabId: tab.id!, frameId: 0 })
              .catch(() => null);
            if (frame?.url !== url) continue;
            return chrome.tabs
              .sendMessage(tab.id!, { type: "GET_UNDO_COUNT" })
              .then(() => true)
              .catch(() => false);
          }
          return false;
        }, page.url()),
      "content ready",
    );
    await action(page);
    await waitFor(() => page.locator("[data-less-panel]").count(), "open panel");
  }
  await site.bringToFront();
  await theme("light");
  const before = await site.evaluate(() => ({
    root: document.documentElement.getAttribute("style"),
    body: document.body.getAttribute("style"),
    box: document.querySelector("#target")!.getBoundingClientRect().toJSON(),
  }));
  await click(".settings-button");
  await waitFor(
    () => panel((dialog) => dialog.querySelectorAll("[data-settings-page]").length === 2),
    "two settings rows",
  );
  await click('[data-settings-page="theme"]');
  await waitFor(
    () => panel((dialog) => dialog.querySelectorAll('[role="radio"]').length === 4),
    "four theme options",
  );
  assert.equal(
    await panel((dialog) =>
      dialog
        .querySelector('[role="radio"][aria-checked="true"]')
        ?.getAttribute("data-preference-value"),
    ),
    "page",
    "no saved value defaults to page-following",
  );
  await site.evaluate(() => {
    document.body.dataset.theme = "dark";
  });
  await theme("dark");
  await site.evaluate(() => {
    document.body.removeAttribute("data-theme");
  });
  await theme("light");
  for (const value of ["dark", "light", "system", "page"]) {
    await click(`[role="radio"][data-preference-value="${value}"]`);
    await waitFor(
      async () =>
        (await worker.evaluate(() => chrome.storage.local.get("less:theme")))["less:theme"] ===
        value,
      `persist ${value}`,
    );
    await theme(value === "dark" ? "dark" : "light");
    await theme(value === "dark" ? "dark" : "light", other);
  }
  assert.deepEqual(
    await site.evaluate(() => ({
      root: document.documentElement.getAttribute("style"),
      body: document.body.getAttribute("style"),
      box: document.querySelector("#target")!.getBoundingClientRect().toJSON(),
    })),
    before,
    "theme changes only Less UI, not page styles or geometry",
  );
  await site.evaluate(() => {
    document.body.dataset.theme = "dark";
  });
  await theme("dark");
  await theme("light", other);
  await site.evaluate(() => {
    document.body.dataset.theme = "light";
  });
  await theme("light");
  for (const signal of [
    "root-class",
    "body-class",
    "root-data-theme",
    "root-data-scheme",
    "body-data-scheme",
    "scheme",
    "root-background",
    "body-background",
    "element-background",
  ]) {
    await site.evaluate((signal) => {
      document.body.removeAttribute("data-theme");
      if (signal === "root-class") document.documentElement.className = "dark";
      if (signal === "body-class") document.body.className = "dark";
      if (signal === "root-data-theme") document.documentElement.dataset.theme = "dark";
      if (signal === "root-data-scheme") document.documentElement.dataset.colorScheme = "dark";
      if (signal === "body-data-scheme") document.body.dataset.colorScheme = "dark";
      if (signal === "scheme") document.documentElement.style.colorScheme = "dark";
      if (signal === "root-background") document.documentElement.style.background = "#111";
      if (signal === "body-background") document.body.style.background = "#111";
      if (signal === "element-background") {
        const target = document.querySelector<HTMLElement>("#target")!;
        target.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;background:#111";
      }
    }, signal);
    console.log("page signal", signal);
    await theme("dark");
    await site.evaluate(() => {
      document.documentElement.removeAttribute("class");
      document.documentElement.removeAttribute("style");
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-color-scheme");
      document.body.removeAttribute("data-color-scheme");
      document.body.removeAttribute("class");
      document.body.removeAttribute("style");
      document.querySelector("#target")!.removeAttribute("style");
    });
    await theme("light");
  }
  await site.emulateMedia({ colorScheme: "dark" });
  await theme("dark");
  await site.evaluate(() => {
    document.documentElement.style.colorScheme = "light dark";
  });
  await theme("dark");
  await store("less:theme", "system");
  await site.evaluate(() => {
    document.body.dataset.theme = "light";
  });
  await theme("dark");
  await site.emulateMedia({ colorScheme: "light" });
  await theme("light");
  await store("less:theme", "dark");
  await theme("dark");
  await action();
  await waitFor(async () => (await site.locator("[data-less-panel]").count()) === 0, "closed");
  await action();
  await theme("dark");
  await site.reload();
  await waitFor(
    async () =>
      worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          const frame = await chrome.webNavigation
            .getFrame({ tabId: tab.id!, frameId: 0 })
            .catch(() => null);
          if (frame?.url === url)
            return chrome.tabs
              .sendMessage(tab.id!, { type: "GET_UNDO_COUNT" })
              .then(() => true)
              .catch(() => false);
        }
        return false;
      }, site.url()),
    "reloaded content",
  );
  await action();
  await theme("dark");
  console.log(
    "PASS real Chrome: four theme options, storage, reopen/reload, tab sync, page signals, unavailable/ambiguous fallback, unchanged page geometry",
  );
  await welcome.emulateMedia({ colorScheme: "light" });
  const failure = await activeContext.newPage();
  await failure.emulateMedia({ colorScheme: "light" });
  await failure.goto(`chrome-extension://${id}/failure.html`);
  for (const value of ["page", "dark", "light", "system"]) {
    await store("less:theme", value);
    for (const page of [welcome, failure])
      await waitFor(
        () =>
          page
            .evaluate(() => document.documentElement.dataset.theme)
            .then((theme) => theme === (value === "dark" ? "dark" : "light")),
        `extension document ${value}`,
      );
  }
  await store("less:theme", "page");
  for (const page of [welcome, failure]) {
    await page.emulateMedia({ colorScheme: "dark" });
    await waitFor(
      () => page.evaluate(() => document.documentElement.dataset.theme === "dark"),
      "page option uses system without page",
    );
  }
  // Keyboard launch uses the real toolbar action, not a simulated selector surface.
  await site.keyboard.press("Escape");
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
    "closed for selection",
  );
  await site.keyboard.press("Control+Shift+E");
  await waitFor(() => site.locator("[data-less-ui]").count(), "selection toolbar");
  const toolbarTheme = () =>
    evaluateNode(
      sessions.get(site)!,
      (node) => node.attributes?.includes("data-theme") === true && node.nodeName === "DIV",
      (surface) => surface.dataset.theme,
      undefined,
    );
  await store("less:theme", "dark");
  await waitFor(async () => (await toolbarTheme()) === "dark", "dark toolbar");
  await store("less:theme", "light");
  await waitFor(async () => (await toolbarTheme()) === "light", "light toolbar");
  await site.locator("#target").click();
  await waitFor(() => site.locator("[data-less-corner]").count(), "feedback");
  assert.equal(
    await evaluateNode(
      sessions.get(site)!,
      (node) => node.attributes?.includes("data-theme") === true && node.nodeName === "DIV",
      (surface) => surface.dataset.theme,
      undefined,
    ),
    "light",
  );
  await site.keyboard.press("Escape");
  await waitFor(
    async () => (await site.locator("[data-less-ui]").count()) === 0,
    "toolbar cleanup",
  );
  console.log(
    "PASS real Chrome: welcome/failure fallback and sync, selection toolbar and feedback use shared theme",
  );
  await action();
  await theme("light");
  async function zoom(factor: number) {
    await worker.evaluate(
      async ({ url, factor }) => {
        for (const tab of await chrome.tabs.query({})) {
          const frame = await chrome.webNavigation
            .getFrame({ tabId: tab.id!, frameId: 0 })
            .catch(() => null);
          if (frame?.url === url) await chrome.tabs.setZoom(tab.id!, factor);
        }
      },
      { url: site.url(), factor },
    );
  }
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(await readFile(`public/_locales/${locale}/messages.json`, "utf8"));
    await store("less:locale", locale);
    await waitFor(
      () =>
        panel(
          (dialog, text) =>
            dialog.querySelector(".settings-button")?.getAttribute("aria-label") === text,
          catalog.panel_settings.message,
        ),
      "locale sync",
    );
    for (const width of [320, 375]) {
      await site.setViewportSize({ width, height: 720 });
      await click(".settings-button");
      assert.equal(
        await panel((dialog) => dialog.querySelectorAll("[data-settings-page]").length),
        2,
      );
      if (locale === "ko" && width === 375)
        await site.screenshot({ path: "/tmp/less-settings-ko-home.png" });
      for (const page of ["language", "theme"]) {
        await store("less:locale", locale);
        await click(`[data-settings-page="${page}"]`);
        await waitFor(
          () =>
            panel(
              (dialog, title) => dialog.querySelector("h1")?.textContent === title,
              catalog[`panel_${page}`].message,
            ),
          "localized preference title",
        );
        await waitFor(
          () => panel((dialog) => !!dialog.querySelector('[role="radiogroup"]')),
          "preferences",
        );
        assert.equal(
          await panel((dialog) => dialog.querySelectorAll('[role="radio"]').length),
          page === "language" ? 6 : 4,
        );
        assert.equal(
          await panel(
            (dialog) =>
              (dialog.getRootNode() as ShadowRoot).activeElement === dialog.querySelector("h1"),
          ),
          true,
        );
        for (const scheme of ["light", "dark"]) {
          await store("less:theme", scheme);
          await theme(scheme);
          const layout = await panel((dialog) => ({
            width: dialog.clientWidth,
            scroll: dialog.scrollWidth,
            background: getComputedStyle(dialog).backgroundColor,
            description: dialog.querySelector("main > section p")
              ? getComputedStyle(dialog.querySelector("main > section p")!).color
              : null,
            radioBorder: getComputedStyle(dialog.querySelector('[role="radio"]')!).borderColor,
            rows: Array.from(dialog.querySelectorAll("label")).map((label) => ({
              left: label.getBoundingClientRect().left,
              right: label.getBoundingClientRect().right,
              font: parseFloat(getComputedStyle(label).fontSize),
              color: getComputedStyle(label).color,
            })),
          }));
          assert(
            layout.rows.every((row) => contrast(row.color, layout.background) >= 4.5),
            "readable option contrast",
          );
          if (layout.description)
            assert(
              contrast(layout.description, layout.background) >= 4.5,
              "readable help contrast",
            );
          assert(
            contrast(layout.radioBorder, layout.background) >= 3,
            "visible radio control boundary",
          );
          assert(
            layout.scroll <= layout.width &&
              layout.rows.every((row) => row.left >= 0 && row.right <= width && row.font >= 14),
            `${locale}/${width}/${page}/${scheme}: readable, no clipping`,
          );
        }
        if (locale === "ko" && width === 375 && page === "theme")
          await site.screenshot({ path: "/tmp/less-settings-ko-theme.png" });
        if (page === "language") {
          await click('[role="radio"][data-preference-value="auto"]');
          await waitFor(
            async () =>
              (await worker.evaluate(() => chrome.storage.local.get("less:locale")))[
                "less:locale"
              ] === "auto",
            "auto language",
          );
          await store("less:locale", locale);
        }
        await panel((dialog) => dialog.querySelector<HTMLElement>("h1")!.focus());
        for (let step = 0; step < 5; step++) {
          await site.keyboard.press("Tab");
          if (
            await panel(
              (dialog) =>
                (dialog.getRootNode() as ShadowRoot).activeElement?.getAttribute("role") ===
                "radio",
            )
          )
            break;
        }
        assert.equal(
          await panel((dialog) =>
            (dialog.getRootNode() as ShadowRoot).activeElement?.getAttribute("role"),
          ),
          "radio",
          "keyboard reaches radio group",
        );
        const previous = await panel((dialog) =>
          (dialog.getRootNode() as ShadowRoot).activeElement?.getAttribute("data-preference-value"),
        );
        const focus = await panel((dialog) => {
          const style = getComputedStyle((dialog.getRootNode() as ShadowRoot).activeElement!);
          return {
            outline: style.outlineColor,
            width: parseFloat(style.outlineWidth),
            style: style.outlineStyle,
            background: getComputedStyle(dialog).backgroundColor,
          };
        });
        assert(
          focus.width >= 2 &&
            focus.style === "solid" &&
            contrast(focus.outline, focus.background) >= 3,
          "visible keyboard focus contrast",
        );
        await site.keyboard.press("ArrowDown");
        await waitFor(
          () =>
            panel((dialog, previous) => {
              const active = (dialog.getRootNode() as ShadowRoot).activeElement;
              return (
                active?.getAttribute("data-preference-value") !== previous &&
                active?.getAttribute("aria-checked") === "true"
              );
            }, previous),
          "arrow moves focus and selects the focused option",
        );
        await site.keyboard.press("Escape");
        await waitFor(
          () =>
            panel(
              (dialog, page) =>
                (dialog.getRootNode() as ShadowRoot).activeElement?.getAttribute(
                  "data-settings-page",
                ) === page,
              page,
            ),
          "back focuses originating row",
        );
      }
      await site.keyboard.press("Escape");
      await waitFor(
        () =>
          panel(
            (dialog) =>
              (dialog.getRootNode() as ShadowRoot).activeElement ===
              dialog.querySelector(".settings-button"),
          ),
        "back focuses gear",
      );
    }
    await store("less:locale", locale);
    await zoom(2);
    for (const width of [320, 375]) {
      await site.setViewportSize({ width, height: 720 });
      await click(".settings-button");
      for (const page of ["language", "theme"]) {
        await click(`[data-settings-page="${page}"]`);
        await waitFor(
          () =>
            panel(
              (dialog, title) => dialog.querySelector("h1")?.textContent === title,
              catalog[`panel_${page}`].message,
            ),
          "zoom locale title",
        );
        for (const scheme of ["light", "dark"]) {
          await store("less:theme", scheme);
          await theme(scheme);
          assert(
            await panel(
              (dialog) =>
                dialog.scrollWidth <= dialog.clientWidth &&
                Array.from(dialog.querySelectorAll("label")).every(
                  (label) => label.getBoundingClientRect().right <= innerWidth,
                ),
            ),
            `${locale}/${width}/${page}/${scheme}: 200% browser zoom without clipping`,
          );
        }
        if (locale === "ko" && width === 375 && page === "theme")
          await site.screenshot({ path: "/tmp/less-settings-ko-zoom-200.png" });
        await site.keyboard.press("Escape");
      }
      await site.keyboard.press("Escape");
    }
    await zoom(1);
  }
  assert.deepEqual(errors, [], "no runtime page errors");
  console.log(
    "PASS real Chrome: five locales, 320/375, light/dark, keyboard/arrow selection, focus back, 200% browser zoom",
  );
  if (values["firefox-build"]) {
    const registered = new Map<string, unknown>();
    const event = (name: string) => ({ addListener: (fn: unknown) => registered.set(name, fn) });
    vm.runInNewContext(
      await readFile(join(values["firefox-build"], "background.js"), "utf8"),
      {
        browser: {
          runtime: {
            id: "test",
            onMessage: event("message"),
            onInstalled: event("install"),
            onStartup: event("startup"),
            onConnect: event("connect"),
            getURL: (path: string) => `moz-extension://test${path}`,
          },
          browserAction: { onClicked: event("action") },
          tabs: {
            query: async () => [],
            onActivated: event("activated"),
            onUpdated: event("updated"),
            onRemoved: event("removed"),
          },
          windows: { onFocusChanged: event("focus") },
          storage: { onChanged: event("storage") },
          webNavigation: { onHistoryStateUpdated: event("navigation") },
        },
        console,
        URL,
        setTimeout,
        clearTimeout,
      },
      { timeout: 2000 },
    );
    assert.equal(typeof registered.get("action"), "function");
    console.log("PASS built Firefox MV2 API fixture (not Firefox runtime)");
  }
} finally {
  await context?.close();
  await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
  await rm(directory, { recursive: true, force: true });
}
