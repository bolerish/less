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
  async function contrast(foreground: string, background: string): Promise<number> {
    const [fg, bg] = await site.evaluate(
      ([foreground, background]) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        return [foreground, background].map((color) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
          return [r, g, b, alpha / 255];
        });
      },
      [foreground, background],
    );
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
  assert.equal(await contrast("rgb(0, 0, 0)", "rgb(255, 255, 255)"), 21);
  assert.equal(await contrast("rgba(0, 0, 0, 0)", "rgb(255, 255, 255)"), 1);
  assert.equal(await contrast("oklch(0 0 0)", "oklch(1 0 0)"), 21);
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
    await waitFor(
      () =>
        panel((d, selector) => {
          const element = d.querySelector<HTMLElement>(selector);
          if (
            !element?.getClientRects().length ||
            element.hasAttribute("disabled") ||
            element.closest("[data-ending-style], [data-closed]")
          )
            return false;
          element.scrollIntoView({ block: "nearest", inline: "nearest" });
          const rect = element.getBoundingClientRect();
          const hit = (element.getRootNode() as ShadowRoot).elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return !!hit && element.contains(hit);
        }, selector),
      `clickable ${selector}`,
    );
    const rect = await panel((dialog, selector) => {
      const element = dialog.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      element.scrollIntoView({ block: "nearest" });
      return element.getBoundingClientRect().toJSON();
    }, selector);
    await site.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (selector === ".language-select" || selector === ".motion-select")
      await waitFor(
        () =>
          panel(
            (d, selector) => d.querySelector(selector)?.getAttribute("aria-expanded") === "true",
            selector,
          ),
        "language popup opened",
      );
  }
  async function back() {
    await site.mouse.move(0, 0);
    await panel((d) => d.querySelector<HTMLElement>(".panel-current")!.focus());
    await waitFor(
      () =>
        panel((d) =>
          Array.from(d.querySelectorAll<HTMLElement>('[role="tooltip"]')).every(
            (t) => !t.getClientRects().length || getComputedStyle(t).opacity === "0",
          ),
        ),
      "tooltip closes before screen navigation",
    );
    await site.keyboard.press("Escape");
  }
  async function assertStationaryPanel(change: () => Promise<void>) {
    const start = await panel((d) => {
      const tracked = d as HTMLElement & {
        positionFrames: { left: number; scroll: number; connected: boolean }[];
      };
      tracked.positionFrames = [];
      const left = d.querySelector(".panel-body")!.getBoundingClientRect().left;
      function sample() {
        tracked.positionFrames.push({
          left: d.querySelector(".panel-body")?.getBoundingClientRect().left ?? NaN,
          scroll: d.scrollLeft,
          connected: d.isConnected,
        });
        if (tracked.positionFrames.length < 30) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      return left;
    });
    await change();
    await waitFor(
      () =>
        panel(
          (d) =>
            (
              d as HTMLElement & {
                positionFrames: { left: number; scroll: number; connected: boolean }[];
              }
            ).positionFrames.length === 30,
        ),
      "panel position sampled throughout popup transition",
    );
    const frames = await panel(
      (d) =>
        (
          d as HTMLElement & {
            positionFrames: { left: number; scroll: number; connected: boolean }[];
          }
        ).positionFrames,
    );
    assert(
      frames.every(
        (frame) => frame.connected && frame.scroll === 0 && Math.abs(frame.left - start) < 1,
      ),
      `popup/locale change must not pan or recreate panel: ${JSON.stringify(frames)}`,
    );
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
  async function store(key: "less:theme" | "less:locale" | "less:motion", value: string) {
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
  assert.deepEqual(
    await panel((d) => {
      const control = d.querySelector('[role="switch"]')!;
      const rect = control.getBoundingClientRect();
      return [rect.width, rect.height, control.firstElementChild!.getBoundingClientRect().width];
    }),
    [40, 24, 20],
    "Switch uses the default documentation size without width overrides",
  );
  const helpOpened = activeContext.waitForEvent("page");
  await click(".help-button");
  const help = await helpOpened;
  await help.waitForURL(`chrome-extension://${id}/welcome.html`);
  assert(await help.locator(".welcome-title").textContent(), "help opens the install onboarding");
  await help.close();
  await site.bringToFront();
  assert.equal(await site.locator("[data-less-panel]").count(), 1, "help keeps the page panel");
  const before = await site.evaluate(() => ({
    root: document.documentElement.getAttribute("style"),
    body: document.body.getAttribute("style"),
    box: document.querySelector("#target")!.getBoundingClientRect().toJSON(),
  }));
  await click(".settings-button");
  await waitFor(
    () => panel((dialog) => dialog.querySelectorAll("[data-settings-page]").length === 4),
    "four settings rows",
  );
  await click('[data-settings-page="language"]');
  await site.emulateMedia({ reducedMotion: "no-preference" });
  await assertStationaryPanel(() => click(".language-select"));
  await assertStationaryPanel(() => click('[role="option"][data-preference-value="en"]'));
  await store("less:locale", "auto");
  await site.keyboard.press("Escape");
  await site.emulateMedia({ reducedMotion: "reduce" });
  await click('[data-settings-page="theme"]');
  await waitFor(
    () => panel((dialog) => dialog.querySelectorAll("[data-preference-value]").length === 4),
    "four theme options",
  );
  assert.equal(
    await panel((dialog) =>
      dialog
        .querySelector('[data-preference-value][aria-pressed="true"]')
        ?.getAttribute("data-preference-value"),
    ),
    "page",
    "no saved value defaults to page-following",
  );
  const choiceLabel = await panel((d) =>
    d.querySelector('[data-preference-value="page"]')!.getAttribute("aria-label"),
  );
  const choiceRect = await panel((d) =>
    d
      .querySelector<HTMLElement>('[data-preference-value="page"]')!
      .getBoundingClientRect()
      .toJSON(),
  );
  await site.mouse.move(choiceRect.x + choiceRect.width / 2, choiceRect.y + choiceRect.height / 2);
  await waitFor(
    () =>
      panel(
        (d, label) =>
          Array.from(d.querySelectorAll('[role="tooltip"]')).some(
            (tooltip) => tooltip.textContent === label && tooltip.getRootNode() === d.getRootNode(),
          ),
        choiceLabel,
      ),
    "official theme Tooltip opens in the styled modal",
  );
  await site.mouse.move(0, 0);
  await panel((d) => d.querySelector<HTMLElement>(".panel-current")!.focus());
  await site.evaluate(() => {
    document.body.dataset.theme = "dark";
  });
  await theme("dark");
  await site.evaluate(() => {
    document.body.removeAttribute("data-theme");
  });
  await theme("light");
  for (const value of ["dark", "light", "system", "page"]) {
    await click(`[data-preference-value="${value}"]`);
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
  async function verifySettingsHome(locale: string, width: number, factor: number) {
    await panel((dialog) => dialog.querySelector<HTMLElement>(".panel-current")!.focus());
    await site.keyboard.press("Tab");
    for (const scheme of ["light", "dark"]) {
      await store("less:theme", scheme);
      await theme(scheme);
      await waitFor(
        () =>
          panel((dialog) =>
            Array.from(dialog.querySelectorAll("[data-settings-page]")).every(
              (row) => row.getAnimations().length === 0,
            ),
          ),
        "settings navigation theme transitions finish",
      );
      const layout = await panel((dialog) => {
        const settings = dialog.querySelector<HTMLElement>("main .panel-body > section")!;
        const bounds = settings.getBoundingClientRect();
        return {
          width: settings.clientWidth,
          scroll: settings.scrollWidth,
          overflow: getComputedStyle(settings).overflowX,
          background: getComputedStyle(dialog).backgroundColor,
          headings: Array.from(settings.querySelectorAll("h2")).map((heading) => ({
            color: getComputedStyle(heading).color,
            font: parseFloat(getComputedStyle(heading).fontSize),
            iconOffset:
              heading.querySelector("svg")!.getBoundingClientRect().left -
              dialog.querySelector("header nav")!.getBoundingClientRect().left,
            textOffset: (() => {
              const label = document.createRange();
              label.selectNodeContents(heading.querySelector(".settings-section-label")!);
              const link = document.createRange();
              link.selectNodeContents(heading.closest("section")!.querySelector("button")!);
              return label.getBoundingClientRect().left - link.getBoundingClientRect().left;
            })(),
          })),
          rows: Array.from(settings.querySelectorAll<HTMLElement>("[data-settings-page]")).map(
            (row) => ({
              fits:
                row.scrollWidth <= row.clientWidth &&
                row.getBoundingClientRect().left >= bounds.left &&
                row.getBoundingClientRect().right <= bounds.right,
              color: getComputedStyle(row).color,
              focusFits: (() => {
                row.focus();
                const style = getComputedStyle(row);
                const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
                const rect = row.getBoundingClientRect();
                const bounds = settings.getBoundingClientRect();
                return (
                  row.matches(":focus-visible") &&
                  ring > 0 &&
                  rect.left - ring >= bounds.left &&
                  rect.right + ring <= bounds.right &&
                  rect.top - ring >= bounds.top &&
                  rect.bottom + ring <= bounds.bottom
                );
              })(),
            }),
          ),
        };
      });
      console.log(
        `SETTINGS HOME ${locale}/${width}/${factor}/${scheme}: ${JSON.stringify(layout)}`,
      );
      if (locale === "ko" || locale === "en")
        await site.screenshot({
          path: `/tmp/less-settings-home-${locale}-${width}-${factor}-${scheme}.png`,
        });
      assert(
        layout.scroll <= layout.width && layout.rows.every((row) => row.fits),
        `${locale}/${width}/${factor}/${scheme}: settings home fits without horizontal scrolling`,
      );
      assert(!["hidden", "clip"].includes(layout.overflow), "settings content remains scrollable");
      assert(
        layout.rows.every((row) => row.focusFits),
        `${locale}/${width}/${factor}/${scheme}: full native focus rings fit the scroll area`,
      );
      assert(
        (
          await Promise.all(
            layout.headings.map(
              async (heading) =>
                heading.font >= 14 &&
                Math.abs(heading.textOffset) < 0.5 &&
                Math.abs(heading.iconOffset) < 0.5 &&
                heading.color !== layout.rows[0].color &&
                (await contrast(heading.color, layout.background)) >= 4.5,
            ),
          )
        ).every(Boolean),
        "section labels and links share a text edge with readable muted headings",
      );
    }
  }
  async function verifyShortcuts(locale: string, width: number, factor: number) {
    await click('[data-settings-page="shortcuts"]');
    for (const scheme of ["light", "dark"]) {
      await store("less:theme", scheme);
      await theme(scheme);
      const layout = await panel((d) => {
        const list = d.querySelector<HTMLElement>(".shortcuts")!;
        const rect = list.getBoundingClientRect();
        return {
          keys: Array.from(list.querySelectorAll("dd"), (row) =>
            Array.from(row.querySelectorAll("kbd"), (key) => key.textContent),
          ),
          editing: list.querySelectorAll("input, select, textarea, button").length,
          sections: Array.from(list.querySelectorAll("section"), (section) => {
            const heading = section.querySelector("h2")!;
            const icon = heading.querySelector("svg");
            const label = heading.querySelector<HTMLElement>(".settings-section-label");
            const firstRow = section.querySelector("dt")!;
            return {
              icon:
                !!icon &&
                icon.getAttribute("aria-hidden") === "true" &&
                icon.getBoundingClientRect().width > 0,
              text: label?.textContent,
              offset: label
                ? Math.abs(
                    label.getBoundingClientRect().left - firstRow.getBoundingClientRect().left,
                  )
                : -1,
              color: getComputedStyle(heading).color,
            };
          }),
          fits:
            list.scrollWidth <= list.clientWidth &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            Array.from(
              list.querySelectorAll("kbd"),
              (key) => key.getBoundingClientRect().right <= innerWidth,
            ).every(Boolean),
          path: Array.from(d.querySelectorAll("header nav li"), (e) => e.textContent).filter(
            Boolean,
          ),
        };
      });
      assert.deepEqual(layout.keys, [
        ["Ctrl", "Shift", "E"],
        ["Ctrl", "Shift", "Z"],
        ["Shift"],
        ["↑"],
        ["↓"],
        ["Enter"],
        ["Esc"],
      ]);
      assert.equal(layout.editing, 0, "shortcut page is read-only");
      assert.equal(layout.sections.length, 2, "two labeled shortcut sections");
      for (const section of layout.sections) {
        assert(section.icon, "section labels keep their decorative icons");
        assert(
          section.offset >= 0 && section.offset < 1,
          "shortcut descriptions align with the section text",
        );
      }
      assert.equal(
        layout.sections[0].color,
        layout.sections[1].color,
        "section labels share their muted appearance",
      );
      if (locale === "ko")
        assert.deepEqual(
          layout.sections.map((section) => section.text),
          ["기본 조작", "항목 선택"],
        );
      assert(
        layout.fits,
        `${locale}/${width}/${factor}/${scheme}: shortcut list and native Kbd fit`,
      );
      assert.equal(layout.path.length, 3, "shortcuts keep the Less/settings/current hierarchy");
      if (locale === "ko" && width === 375)
        await site.screenshot({ path: `/tmp/less-shortcuts-ko-${factor}-${scheme}.png` });
    }
    await back();
    assert.equal(
      await panel((d) =>
        (d.getRootNode() as ShadowRoot).activeElement?.getAttribute("data-settings-page"),
      ),
      "shortcuts",
      "return to the shortcuts row",
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
        4,
      );
      await verifySettingsHome(locale, width, 1);
      await verifyShortcuts(locale, width, 1);
      if (locale === "ko" && width === 375)
        await site.screenshot({ path: "/tmp/less-settings-ko-home.png" });
      for (const page of ["language", "theme", "motion"]) {
        await store("less:locale", locale);
        await click(`[data-settings-page="${page}"]`);
        await waitFor(
          () =>
            panel(
              (dialog, title) => dialog.querySelector(".panel-current")?.textContent === title,
              catalog[`panel_${page}`].message,
            ),
          "localized preference title",
        );
        const selector = page === "theme" ? "[data-preference-value]" : `.${page}-select`;
        await waitFor(
          () => panel((dialog, selector) => !!dialog.querySelector(selector), selector),
          "preference controls",
        );
        assert.equal(
          await panel(
            (dialog) =>
              (dialog.getRootNode() as ShadowRoot).activeElement ===
              dialog.querySelector(".panel-current"),
          ),
          true,
        );
        const host = await site.locator("[data-less-panel]").elementHandle();
        for (const scheme of ["light", "dark"]) {
          await store("less:theme", scheme);
          await theme(scheme);
          await waitFor(
            () =>
              panel((d) => {
                d.querySelectorAll("button").forEach((button) => getComputedStyle(button).color);
                return d
                  .getAnimations({ subtree: true })
                  .every((animation) => animation.playState !== "running");
              }),
            "official control theme transition settled",
          );
          const layout = await panel((dialog, selector) => {
            const body = dialog.querySelector<HTMLElement>(".panel-body")!;
            const control = dialog.querySelector<HTMLElement>(selector)!;
            const rect = control.getBoundingClientRect();
            return {
              width: dialog.clientWidth,
              scroll: dialog.scrollWidth,
              left: rect.left,
              right: rect.right,
              color: getComputedStyle(control).color,
              background: getComputedStyle(dialog).backgroundColor,
              headerPadding: getComputedStyle(dialog.querySelector("header")!).paddingInline,
              bodyPadding: getComputedStyle(body).paddingInline,
              contentEdges: (() => {
                const header = dialog.querySelector("header nav")!.getBoundingClientRect();
                const field = control.closest<HTMLElement>('[data-orientation="vertical"]')!;
                const bounds = field.getBoundingClientRect();
                const bodyRect = body.getBoundingClientRect();
                const inset = parseFloat(getComputedStyle(body).paddingInlineStart);
                return [bounds.left - header.left, bodyRect.right - inset - bounds.right];
              })(),
              themeLayout: (() => {
                const group = dialog.querySelector<HTMLElement>(".theme-options");
                if (!group) return null;
                return {
                  width: group.getBoundingClientRect().width,
                  parent: group.parentElement!.getBoundingClientRect().width,
                  choices: Array.from(
                    group.querySelectorAll<HTMLElement>("[data-preference-value]"),
                    (e) => e.getBoundingClientRect().width,
                  ),
                };
              })(),
              iconOnly: Array.from(dialog.querySelectorAll("[data-preference-value]")).every(
                (e) => !!e.querySelector("svg") && !e.textContent?.trim(),
              ),
            };
          }, selector);
          assert(
            layout.scroll <= layout.width && layout.left >= 0 && layout.right <= width,
            `${locale}/${width}/${page}/${scheme}: controls fit`,
          );
          assert.equal(
            layout.headerPadding,
            layout.bodyPadding,
            "header and body share one horizontal inset",
          );
          assert(
            layout.contentEdges.every((offset) => Math.abs(offset) < 0.5),
            `nested Field aligns with the header and body content edges: ${layout.contentEdges}`,
          );
          assert((await contrast(layout.color, layout.background)) >= 4.5, "readable controls");
          if (page === "theme") {
            assert.equal(
              await panel((d) => {
                const group = d.querySelector(".theme-options")!;
                const help = d.querySelector('[id$="-help"]')!;
                return (
                  !!help.textContent?.trim() &&
                  group.getAttribute("aria-describedby")?.split(/\s+/).includes(help.id) &&
                  !help.hasAttribute("role")
                );
              }),
              true,
              "theme guidance is a persistent associated FieldDescription",
            );
            assert(layout.iconOnly, "theme choices contain only icons with accessible labels");
            assert(
              layout.themeLayout &&
                Math.abs(layout.themeLayout.width - layout.themeLayout.parent) < 1,
              "theme group fills its Field",
            );
            assert(
              Math.max(...layout.themeLayout.choices) - Math.min(...layout.themeLayout.choices) < 1,
              "theme choices share the available width equally",
            );
          }
        }
        if (locale === "ko" && width === 375)
          await site.screenshot({ path: `/tmp/less-settings-ko-${page}.png` });
        if (page === "motion") {
          // Reference: computed styles of the public 1.0.1 Field preview.
          assert.deepEqual(
            await panel((d) => {
              const control = d.querySelector<HTMLElement>(".motion-select")!;
              const field = control.closest<HTMLElement>('[data-orientation="vertical"]')!;
              const label = field.querySelector("label")!;
              const help = field.querySelector('[id$="-help"]')!;
              const metrics = (e: Element) => {
                const s = getComputedStyle(e);
                return [s.fontSize, s.fontWeight, s.lineHeight];
              };
              return {
                label: metrics(label),
                description: metrics(help),
                gap: getComputedStyle(field).gap,
              };
            }),
            { label: ["14px", "500", "21px"], description: ["14px", "400", "21px"], gap: "8px" },
            "Field label, description and spacing match the public component preview",
          );
          assert(
            await panel((d) => {
              const trigger = d.querySelector(".motion-select")!;
              return trigger
                .getAttribute("aria-describedby")
                ?.split(/\s+/)
                .some((id) =>
                  (d.getRootNode() as ShadowRoot).getElementById(id)?.id.endsWith("-help"),
                );
            }),
            "official Field description is associated with motion selection",
          );
          await click(".motion-select");
          await waitFor(
            () => panel((d) => d.querySelectorAll('[role="option"]').length === 3),
            "three motion choices",
          );
          await site.keyboard.press("Escape");
        } else if (page === "language") {
          await click(".language-select");
          await waitFor(
            () => panel((d) => d.querySelectorAll('[role="option"]').length === 6),
            "six language choices inside modal",
          );
          assert.equal(
            await panel(
              (d) => d.querySelector('[role="listbox"]')?.getRootNode() === d.getRootNode(),
            ),
            true,
            "official Select popup is in the styled shadow root",
          );
          await site.keyboard.press("Escape");
          await waitFor(
            () =>
              panel(
                (d) =>
                  d.querySelector(".language-select")?.getAttribute("aria-expanded") === "false",
              ),
            "Escape closes only the language popup",
          );
          await click(".language-select");
          await click('[role="option"][data-preference-value="auto"]');
          await waitFor(
            async () =>
              (await worker.evaluate(() => chrome.storage.local.get("less:locale")))[
                "less:locale"
              ] === "auto",
            "auto language saved",
          );
          await store("less:locale", locale);
          await waitFor(
            () =>
              panel(
                (d, locale) =>
                  d.querySelector(".language-select")?.getAttribute("data-preference-value") ===
                  locale,
                locale,
              ),
            "language sync",
          );
          assert.equal(
            await host!.evaluate((e) => e.isConnected),
            true,
            "language changes keep the same panel",
          );
        } else {
          await click('[data-preference-value="dark"]');
          await site.mouse.move(0, 0);
          await panel((d) => d.querySelector<HTMLElement>(".panel-current")!.focus());
        }
        if (page !== "theme")
          await waitFor(
            () =>
              panel((d) => {
                const popup = d.querySelector<HTMLElement>('[role="listbox"]');
                return !popup || popup.getClientRects().length === 0;
              }),
            `${locale}/${width}/${page}: preference popup finishes closing before keyboard traversal`,
          );
        await panel((d) => d.querySelector<HTMLElement>(".panel-current")!.focus());
        for (let step = 0; step < 6; step++) {
          await site.keyboard.press("Tab");
          if (
            await panel(
              (d, selector) => (d.getRootNode() as ShadowRoot).activeElement?.matches(selector),
              selector,
            )
          )
            break;
        }
        assert.equal(
          await panel(
            (d, selector) => (d.getRootNode() as ShadowRoot).activeElement?.matches(selector),
            selector,
          ),
          true,
          `${locale}/${width}/${page}: keyboard reaches preference control ${await panel((d) => (d.getRootNode() as ShadowRoot).activeElement?.outerHTML)}`,
        );
        const focus = await panel((d) => {
          const style = getComputedStyle((d.getRootNode() as ShadowRoot).activeElement!);
          return {
            outline: style.outlineColor,
            width: parseFloat(style.outlineWidth),
            style: style.outlineStyle,
            background: getComputedStyle(d).backgroundColor,
          };
        });
        assert(
          focus.width >= 2 &&
            focus.style === "solid" &&
            (await contrast(focus.outline, focus.background)) >= 3,
          "official keyboard focus remains visible",
        );
        if (page !== "theme") {
          await site.keyboard.press("Enter");
          await waitFor(
            () =>
              panel(
                (d, count) => d.querySelectorAll('[role="option"]').length === count,
                page === "language" ? 6 : 3,
              ),
            "keyboard opens preference popup",
          );
          await site.keyboard.press("ArrowDown");
          await site.keyboard.press("Enter");
          await waitFor(
            () =>
              panel(
                (d, selector) =>
                  d.querySelector(selector)?.getAttribute("aria-expanded") === "false",
                selector,
              ),
            "keyboard selection closes popup",
          );
          await waitFor(
            () =>
              panel(
                (d, selector) =>
                  (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(selector),
                selector,
              ),
            "language selection returns focus to its trigger",
          );
        } else {
          const previous = await panel((d) =>
            (d.getRootNode() as ShadowRoot).activeElement?.getAttribute("data-preference-value"),
          );
          await site.keyboard.press("ArrowRight");
          assert.notEqual(
            await panel((d) =>
              (d.getRootNode() as ShadowRoot).activeElement?.getAttribute("data-preference-value"),
            ),
            previous,
            "arrow moves among theme icons",
          );
          await site.keyboard.press("Space");
          await waitFor(
            () =>
              panel(
                (d) =>
                  (d.getRootNode() as ShadowRoot).activeElement?.getAttribute("aria-pressed") ===
                  "true",
              ),
            "Space selects theme",
          );
        }
        if (page === "motion") await store("less:motion", "system");
        await back();
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
      await back();
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
      await verifySettingsHome(locale, width, 2);
      await verifyShortcuts(locale, width, 2);
      for (const page of ["language", "theme", "motion"]) {
        await click(`[data-settings-page="${page}"]`);
        await waitFor(
          () =>
            panel(
              (dialog, title) => dialog.querySelector(".panel-current")?.textContent === title,
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
                Array.from(
                  dialog.querySelectorAll(".language-select, [data-preference-value]"),
                ).every((label) => label.getBoundingClientRect().right <= innerWidth),
            ),
            `${locale}/${width}/${page}/${scheme}: 200% browser zoom without clipping`,
          );
        }
        if (locale === "ko" && width === 375 && page === "theme")
          await site.screenshot({ path: "/tmp/less-settings-ko-zoom-200.png" });
        await back();
      }
      await back();
    }
    await zoom(1);
  }
  const worlds: { id: number; origin: string }[] = [];
  const session = sessions.get(site)!;
  session.on("Runtime.executionContextCreated", ({ context }) => worlds.push(context));
  await session.send("Runtime.disable");
  await session.send("Runtime.enable");
  const contentWorld = worlds.find((world) => world.origin === `chrome-extension://${id}`);
  assert(contentWorld, "content world available for storage failure verification");
  async function failNextPreferenceWrite(key: string) {
    await session.send("Runtime.evaluate", {
      contextId: contentWorld!.id,
      expression: `(() => {const original = chrome.storage.local.set.bind(chrome.storage.local); chrome.storage.local.set = (items) => { if (${JSON.stringify(key)} in items) { chrome.storage.local.set = original; return Promise.reject(new Error("fixture save failure")); } return original(items); }; })()`,
    });
  }
  await store("less:locale", "en");
  await click(".settings-button");
  await click('[data-settings-page="theme"]');
  await store("less:theme", "dark");
  await theme("dark");
  await failNextPreferenceWrite("less:theme");
  await click('[data-preference-value="light"]');
  await waitFor(
    () => panel((d) => !!d.querySelector('[role="alert"]')),
    "theme failure is visible",
  );
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("less:theme")))["less:theme"],
    "dark",
    "failed theme save retains stored value",
  );
  assert.equal(
    await panel((d) =>
      d.querySelector('[data-preference-value="dark"]')?.getAttribute("aria-pressed"),
    ),
    "true",
    "failed theme save keeps selected icon",
  );
  await click('[data-preference-value="light"]');
  await theme("light");
  assert.equal(
    await panel((d) => !!d.querySelector('[role="alert"]')),
    false,
    "theme retry clears error",
  );
  await site.keyboard.press("Escape");
  await click('[data-settings-page="language"]');
  await failNextPreferenceWrite("less:locale");
  await click(".language-select");
  await click('[role="option"][data-preference-value="ko"]');
  await waitFor(
    () => panel((d) => !!d.querySelector('[role="alert"]')),
    "language failure is visible",
  );
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("less:locale")))["less:locale"],
    "en",
    "failed language save retains stored value",
  );
  assert.equal(
    await panel((d) => d.querySelector(".language-select")?.getAttribute("data-preference-value")),
    "en",
    "failed language save retains displayed choice",
  );
  await click(".language-select");
  await click('[role="option"][data-preference-value="ko"]');
  await waitFor(
    () =>
      panel(
        (d) => d.querySelector(".language-select")?.getAttribute("data-preference-value") === "ko",
      ),
    "language retry succeeds",
  );
  assert.equal(
    await panel((d) => !!d.querySelector('[role="alert"]')),
    false,
    "language retry clears error",
  );
  console.log(
    "PASS failed theme/language writes preserve selection, show an error and support retry",
  );
  await back();
  await back();
  await site.setViewportSize({ width: 1100, height: 800 });
  await store("less:locale", "en");
  for (const [preference, media, animated] of [
    ["system", "reduce", false],
    ["system", "no-preference", true],
    ["full", "reduce", true],
    ["reduced", "no-preference", false],
  ] as const) {
    await click(".settings-button");
    await click('[data-settings-page="motion"]');
    await store("less:motion", preference);
    await waitFor(
      () =>
        panel(
          (d, value) =>
            d.querySelector(".motion-select")?.getAttribute("data-preference-value") === value,
          preference,
        ),
      "motion preference synchronized",
    );
    const path = await panel((d) =>
      Array.from(d.querySelectorAll("header nav li:not([aria-hidden])"), (e) => e.textContent),
    );
    assert.deepEqual(
      path,
      ["Less", "Settings", "Motion"],
      "real hierarchy in the official Breadcrumb",
    );
    const hash = new URL(site.url()).hash;
    await click('[data-panel-destination="settings"]');
    assert.equal(new URL(site.url()).hash, hash, "local navigation does not alter the site URL");
    await click('[data-panel-destination="hidden"]');
    await click(".panel-header button:last-child");
    await waitFor(async () => !(await site.locator("[data-less-panel]").count()), "panel closed");
    await site.emulateMedia({ reducedMotion: media });
    await action();
    await waitFor(() => site.locator("[data-less-panel]").count(), "panel reopened for motion");
    const animations = await panel((d) =>
      d.getAnimations().map((a) => a.effect?.getTiming().duration),
    );
    assert.equal(
      animations.includes(240),
      animated,
      `${preference}/${media}: panel motion follows the saved setting`,
    );
    await waitFor(() => panel((d) => d.getAnimations().length === 0), "panel entrance settles");
    const backdrop = await panel((d) => getComputedStyle(d, "::backdrop").backdropFilter);
    assert.equal(backdrop, "blur(4px)", "panel uses the design-system modal blur");
    await click(".panel-current");
    assert.equal(
      await site.locator("[data-less-panel]").count(),
      1,
      "inside clicks keep panel open",
    );
    await site.mouse.click(20, 300);
    await waitFor(
      async () => !(await site.locator("[data-less-panel]").count()),
      "outside overlay closes panel",
    );
    await action();
    await waitFor(() => site.locator("[data-less-panel]").count(), "panel reopened");
    await waitFor(() => panel((d) => d.getAnimations().length === 0), "reopen settles");
  }
  await click(".settings-button");
  await click('[data-settings-page="motion"]');
  await store("less:motion", "system");
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelector(".motion-select")?.getAttribute("data-preference-value") === "system",
      ),
    "motion starts from saved system setting",
  );
  await failNextPreferenceWrite("less:motion");
  await click(".motion-select");
  await click('[role="option"][data-preference-value="reduced"]');
  await waitFor(
    () => panel((d) => !!d.querySelector('[role="alert"]')),
    "motion save failure is visible",
  );
  assert.equal(
    await panel((d) => d.querySelector(".motion-select")?.getAttribute("data-preference-value")),
    "system",
    "failed motion save preserves selection",
  );
  assert(
    await panel((d) =>
      d
        .querySelector(".motion-select")!
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .includes(d.querySelector('[role="alert"]')!.id),
    ),
    "save failure Banner is associated with the selection",
  );
  await click(".motion-select");
  await click('[role="option"][data-preference-value="reduced"]');
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelector(".motion-select")?.getAttribute("data-preference-value") === "reduced",
      ),
    "motion retry succeeds",
  );
  assert.equal(await panel((d) => !!d.querySelector('[role="alert"]')), false);
  await site.reload();
  await action();
  await waitFor(() => site.locator("[data-less-panel]").count(), "panel after reload");
  await click(".settings-button");
  await click('[data-settings-page="motion"]');
  assert.equal(
    await panel((d) => d.querySelector(".motion-select")?.getAttribute("data-preference-value")),
    "reduced",
    "motion persists across reload",
  );
  console.log(
    "PASS Breadcrumb navigation, motion/system override, persistence, save failure/retry, backdrop blur and outside dismissal",
  );
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
          webNavigation: {
            onCommitted: event("committed"),
            onHistoryStateUpdated: event("navigation"),
          },
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
