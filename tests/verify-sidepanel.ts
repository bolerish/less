/* eslint-disable no-await-in-loop -- Browser interactions and viewport checks are sequential. */
// Build first. Chrome's Extensions.triggerAction dispatches the real toolbar action.
// node tests/verify-sidepanel.ts --chromium /path/to/Chrome
import assert from "node:assert/strict";
import { transformFileAsync } from "@babel/core";
import stylexPlugin from "@stylexjs/babel-plugin";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type BrowserContext, type Page } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;
type DOMNode = {
  nodeName: string;
  backendNodeId: number;
  attributes?: string[];
  children?: DOMNode[];
  shadowRoots?: DOMNode[];
};
type TabTarget = { targetId: string; url: string };
type ExecutionContext = { id: number; origin: string };
import { productUpdates } from "../src/features/updates/releases.ts";
import {
  getLatestReleasedUpdate,
  UPDATES_SEEN_VERSION_KEY,
} from "../src/features/updates/notice.ts";
import type { HiddenElementRecord } from "../src/features/record/schema.ts";

// Resolve the installed public token references without recreating application aliases.
const semantic = await transformFileAsync(
  fileURLToPath(import.meta.resolve("@bolerish/tokens/semantic.stylex")),
  {
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["typescript"] },
    plugins: [
      [
        stylexPlugin,
        { dev: false, unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() } },
      ],
    ],
  },
);
const semanticRefs = Object.fromEntries(
  [
    "strokeDefault",
    "strokeFocus",
    "bgActionPrimary",
    "fgPrimary",
    "interactionHover",
    "interactionPressed",
  ].map((name) => {
    const match = semantic?.code?.match(new RegExp(name + ': "([^"]+)"'));
    assert(match, `installed semantic token ${name}`);
    return [name, match[1]];
  }),
);

const { values } = parseArgs({
  options: {
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    "firefox-build": { type: "string" },
    "released-update-fixture": { type: "boolean", default: false },
    screenshot: { type: "string", default: "/tmp/veil-in-page-panel.png" },
    axe: { type: "string" },
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
<div id="shift-other-parent" style="border:1px solid;padding:10px"><p id="shift-other-child">Another selection base</p></div>
<div id="collapsed-region" role="region" aria-label="날씨" style="width:420px;max-width:100%;margin-top:16px;padding:0;border:0;box-shadow:0 0 0 1px rgba(0,0,0,.1),0 1px 3px rgba(0,0,0,.04)"><div id="weather-content">Weather contents</div></div>
<div style="height:20px;margin-top:16px"></div><div id="empty-region" style="width:420px;margin-top:16px"></div>
<div style="height:20px;margin-top:16px"></div><div id="inset-region" style="width:420px;margin-top:16px;box-shadow:inset 0 0 0 1px black"></div>
<div style="height:20px;margin-top:16px"></div><div id="transparent-region" style="width:420px;margin-top:16px;box-shadow:0 0 0 1px transparent"></div>
<div style="position:relative;height:40px;margin-top:16px"><div id="covered-region" style="width:420px;box-shadow:0 0 0 1px black"></div><div style="position:absolute;inset:0;background:white"></div></div>
<a id="mobile-main" href="https://m.naver.com/" style="display:flex;padding:22px;border:1px solid;border-radius:8px"><strong>모바일 네이버 메인</strong>&nbsp;열기</a>
<a id="formatted-link" href="#" style="display:inline-block"><span>Formatted link</span></a>
<div id="nested"><div style="height:260px"></div><p id="nested-target" style="opacity:0.65 !important;transition:opacity 2s linear">Nested target</p><div style="height:500px"></div></div>
<p id="same-a">Same label</p><p id="same-b">Same label</p>
<div style="height:1800px"></div><p id="far-target">Far target</p><div style="height:1200px"></div>
<p id="fixed-target">Covered target</p></body></html>`;
const accessibilityFixture = `<!doctype html><html lang="en"><head><style>
body{margin:20px;font:16px sans-serif}#a11y-target{padding:24px;border:1px solid;opacity:.65;transition:opacity 2s linear}
</style></head><body><h1>Accessibility fixture</h1><section id="a11y-target" aria-label="Hidden controls"><button id="a11y-button">Hidden action</button></section><button id="after-hidden">After hidden</button></body></html>`;
const mediaFixture = `<!doctype html><html><head><style>body{margin:20px;font:16px/1.5 sans-serif}.media{border:2px solid;padding:20px;margin:20px 0}p{padding:12px}</style></head><body>
<h1>Media and long list</h1><div class="media" id="frame-wrapper"><iframe title="Weather widget" src="https://external.example/frame" width="220" height="100"></iframe></div>
<div class="media" id="image-wrapper"><img alt="Mountain lake" width="160" height="100" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='100'%3E%3Crect width='160' height='100' fill='gray'/%3E%3C/svg%3E"></div>
<video id="video-target" aria-label="Nature clip" width="220" height="100"></video>
${Array.from({ length: 14 }, (_, i) => `<p id="item-${i}">Saved content ${i} with a title long enough to wrap on a narrow screen</p>`).join("")}
<div style="height:600px"></div></body></html>`;
let siteOwnsInert = false;
let siteAria: string | null = null;
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  if ((_req.url ?? "").startsWith("/scrollbar")) {
    res.end(
      `<!doctype html><style>html{scrollbar-gutter:auto}::-webkit-scrollbar{width:16px}body{margin:0}#gutter-reference{width:200px;margin:auto}#gutter-target{height:${(_req.url ?? "").includes("short") ? "100" : "1400"}px;background:#ccc}</style><div id="gutter-reference">Keep this centered</div><section id="gutter-target">Tall removable block</section>`,
    );
    return;
  }
  res.end(
    (_req.url ?? "").startsWith("/accessibility")
      ? accessibilityFixture.replace(
          'id="a11y-target"',
          `id="a11y-target"${siteOwnsInert ? ' inert="site-owned"' : ""}${siteAria === null ? "" : ` aria-hidden="${siteAria}"`}`,
        )
      : (_req.url ?? "").startsWith("/media")
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
  if (values["released-update-fixture"]) {
    const sourceBuild = values.build;
    values.build = join(directory, "released-update-fixture");
    await cp(sourceBuild, values.build, { recursive: true });
    const contentPath = join(values.build, "content-scripts/content.js");
    const source = await readFile(contentPath, "utf8");
    const draft = productUpdates[0];
    assert(draft, "an update entry provides isolated notification fixture data");
    const version = [
      `version:${JSON.stringify(draft.version)}`,
      "version:`" + draft.version + "`",
    ].find((marker) => source.includes(marker));
    const status = /status:(["`])(?:unreleased|released)\1/;
    assert(version && status.test(source), "fixture finds the bundled release metadata");
    await writeFile(
      contentPath,
      source
        .replace(version, `version:${JSON.stringify(manifest.version)}`)
        .replace(status, 'status:"released"'),
    );
    console.log("FIXTURE ONLY: a temporary build copy simulates an installed released update");
  }
  assert.equal(manifest.short_name, "Less");
  assert.equal(manifest.action.default_title, "Less");
  assert.equal(manifest.name, "__MSG_ext_name__");
  assert.equal(manifest.description, "__MSG_ext_description__");
  assert(!manifest.action.default_popup && !manifest.side_panel && !manifest.sidebar_action);
  assert(!manifest.permissions.includes("sidePanel") && !manifest.permissions.includes("tabs"));
  const baseCatalog: Record<string, { message: string }> = JSON.parse(
    await readFile(join(values.build, "_locales/en/messages.json"), "utf8"),
  );
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(
      await readFile(join(values.build, "_locales", locale, "messages.json"), "utf8"),
    );
    assert.equal(catalog.ext_name.message, "Less", `${locale}: product name`);
    assert(
      !Object.values(catalog).some((entry) =>
        (entry as { message: string }).message.includes("Veil"),
      ),
      `${locale}: no old product name`,
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
    assert(!("panel_refresh" in catalog), `${locale}: retired refresh action removed`);
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
    ignoreDefaultArgs: ["--disable-extensions", "--hide-scrollbars"],
    viewport: { width: 1100, height: 800 },
    // CSS scrollbar width alone does not turn the browser's overlay mode into classic mode.
    args: [
      "--enable-unsafe-extension-debugging",
      "--disable-features=OverlayScrollbar,MacOverlayScrollbars",
    ],
  });
  context = activeContext;
  activeContext.setDefaultTimeout(7000);
  const browserCDP = await activeContext.browser()!.newBrowserCDPSession();
  const { id } = await browserCDP.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  const worker =
    activeContext.serviceWorkers()[0] ?? (await activeContext.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.runtime.getManifest());
  // This suite exercises OS-theme transitions; page-following defaults have their own settings check.
  await worker.evaluate(() => chrome.storage.local.set({ "less:theme": "system" }));
  const englishCatalog: Record<string, { message: string }> = JSON.parse(
    await readFile(join(values.build, "_locales/en/messages.json"), "utf8"),
  );
  const messages: Record<string, string> = await worker.evaluate(
    (keys) => Object.fromEntries(keys.map((key) => [key, chrome.i18n.getMessage(key)])),
    Object.keys(englishCatalog) as (keyof typeof import("../public/_locales/en/messages.json"))[],
  );

  Object.assign(
    messages,
    await worker.evaluate(
      (version) => ({
        panel_version_updates: chrome.i18n.getMessage("panel_version_updates", [version]),
        panel_version_updates_unread: chrome.i18n.getMessage("panel_version_updates_unread", [
          version,
        ]),
      }),
      manifest.version,
    ),
  );

  await waitFor(
    async () => activeContext.pages().some((p) => p.url().endsWith("/welcome.html")),
    "install finished",
  );
  const errors: string[] = [];
  activeContext.on("page", (p) =>
    p.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("PAGEERROR", e.message);
    }),
  );
  const site = await activeContext.newPage();
  site.on("console", (msg) => {
    if (msg.type() === "error") console.error("PAGE", msg.text());
  });
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
          (await site.locator("[data-less-panel]").count()) === 0 ||
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
  async function auditPanel(label: string) {
    if (!values.axe) return;
    // axe cannot traverse a closed shadow; audit an exact open-shadow DOM/CSS snapshot.
    const rendered = await panel((d) => ({
      html: d.outerHTML,
      css: Array.from(
        (d.getRootNode() as ShadowRoot).querySelectorAll("style"),
        (e) => e.textContent,
      ).join("\n"),
    }));
    const auditPage = await activeContext.newPage();
    try {
      await auditPage.setContent(
        '<!doctype html><html lang="en"><head><title>Panel audit</title></head><body></body></html>',
      );
      await auditPage.evaluate(({ html, css }) => {
        const host = document.createElement("div");
        document.body.append(host);
        const shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = css;
        shadow.append(style);
        const template = document.createElement("template");
        template.innerHTML = html;
        const dialog = template.content.firstElementChild as HTMLDialogElement;
        dialog.removeAttribute("open");
        shadow.append(dialog);
        dialog.showModal();
      }, rendered);
      await auditPage.addScriptTag({ path: resolve(values.axe) });
      const result = await auditPage.evaluate(async () => {
        const dialog = document.querySelector("body > div")!.shadowRoot!.querySelector("dialog")!;
        const axe = (
          window as unknown as {
            axe: {
              run: (
                node: Element,
                options: unknown,
              ) => Promise<{
                passes: unknown[];
                violations: { id: string; nodes: { html: string }[] }[];
                incomplete: {
                  id: string;
                  nodes: { html: string; any: { data?: { messageKey?: string } }[] }[];
                }[];
              }>;
            };
          }
        ).axe;
        const audit = await axe.run(dialog, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
          },
        });
        const context = document.createElement("canvas").getContext("2d")!;
        const luma = (rgb: number[]) =>
          rgb.slice(0, 3).reduce((total, value, index) => {
            const c = value / 255;
            return (
              total +
              (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) *
                [0.2126, 0.7152, 0.0722][index]
            );
          }, 0);
        const keyContrast = Array.from(dialog.querySelectorAll("kbd"), (key) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = getComputedStyle(dialog).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          context.fillStyle = getComputedStyle(key).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          const bg = luma(Array.from(context.getImageData(0, 0, 1, 1).data));
          context.fillStyle = getComputedStyle(key).color;
          context.fillRect(0, 0, 1, 1);
          const fg = luma(Array.from(context.getImageData(0, 0, 1, 1).data));
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
        return { ...audit, keyContrast };
      });
      await writeFile(`/tmp/less-accessibility-${label}.json`, JSON.stringify(result, null, 2));
      assert(result.passes.length > 10, "axe actually audited the rendered controls");
      assert.deepEqual(result.violations, [], `${label}: axe WCAG A/AA violations`);
      assert(
        result.keyContrast.every((ratio) => ratio >= 4.5),
        `${label}: Kbd contrast including arrow glyphs`,
      );
      assert(
        result.incomplete.every(
          (rule) =>
            rule.id === "color-contrast" &&
            rule.nodes.every((node) =>
              node.any.some((check) => check.data?.messageKey === "nonBmp"),
            ),
        ),
        `${label}: no unreviewed automated findings`,
      );
      console.log(
        `PASS axe snapshot ${label}: ${result.passes.length} rules; arrow glyph contrast checked separately`,
      );
    } finally {
      await auditPage.close();
      await site.bringToFront();
    }
    const tree = await session.send("Accessibility.getFullAXTree");
    assert(
      tree.nodes.some(
        (node) =>
          !node.ignored &&
          node.role?.value === "dialog" &&
          node.name?.value === messages.panel_dialog,
      ),
      "real closed-shadow modal remains named in the accessibility tree",
    );
  }
  async function selectionSurface<T>(
    attribute: string,
    fn: (surface: HTMLElement) => T,
    targetSession = session,
  ): Promise<T> {
    const { root } = await targetSession.send("DOM.getDocument", { depth: -1, pierce: true });
    const host = findNode(root, (n) => n.attributes?.includes(attribute) ?? false);
    const surface = host?.shadowRoots?.[0]?.children?.find((n) => n.nodeName === "DIV");
    assert(surface, `${attribute}: closed shadow surface exists`);
    const { object } = await targetSession.send("DOM.resolveNode", {
      backendNodeId: surface.backendNodeId,
    });
    const result = await targetSession.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function(){return (${fn.toString()})(this)}`,
      returnByValue: true,
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function textIncludes(text: string) {
    return panel((d, t) => d.innerText.includes(t), text);
  }
  async function storedRecords() {
    return worker.evaluate(async (o) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open("veil-db");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      try {
        return await new Promise<HiddenElementRecord[]>((res, rej) => {
          const r = db.transaction("records").objectStore("records").getAll();
          r.onsuccess = () =>
            res((r.result as HiddenElementRecord[]).filter((x) => x.pageContext.origin === o));
          r.onerror = () => rej(r.error);
        });
      } finally {
        db.close();
      }
    }, origin);
  }
  async function count() {
    return (await storedRecords()).length;
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
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "panel closed before shortcut",
    );
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
    });
    await site.locator(selector).click(options);
    await site.keyboard.press("Escape");
    await hidden(selector);
    await waitFor(
      () =>
        worker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const result = await chrome.tabs.sendMessage(tab.id!, { type: "GET_UNDO_COUNT" });
          return result.count > 0;
        }),
      "hidden item is saved and ready to undo",
    );
  }

  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.keyboard.down("Control");
  await site.keyboard.down("Shift");
  await site.keyboard.down("E");
  await waitFor(
    async () => (await site.locator("[data-less-ui]").count()) === 1,
    "fresh selection shortcut enables selection",
  );
  for (let i = 0; i < 6; i++) {
    await site.keyboard.down("E");
    assert.equal(
      await site.locator("[data-less-ui]").count(),
      1,
      "held Ctrl+Shift+E never toggles selection again",
    );
  }
  await site.keyboard.up("E");
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.keyboard.down("E");
  await waitFor(
    async () => (await site.locator("[data-less-ui]").count()) === 0,
    "release and press toggles selection off once",
  );
  for (let i = 0; i < 6; i++) {
    await site.keyboard.down("E");
    assert.equal(
      await site.locator("[data-less-ui]").count(),
      0,
      "holding the disabling shortcut never reopens selection",
    );
  }
  await site.keyboard.up("E");
  await site.keyboard.up("Shift");
  await site.keyboard.up("Control");
  assert.equal(await count(), 0, "holding the shortcut never creates records");
  console.log(
    "PASS selection command messages toggle; DOM key repeats do not duplicate Chrome commands (hardware shortcut unverified)",
  );

  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#two").click();
  await hidden("#two");
  await site.locator("#one").click();
  await hidden("#one");
  await waitFor(async () => (await count()) === 2, "both session records saved");
  await site.keyboard.press("Escape");
  await site.waitForTimeout(11_000);
  await site.locator("#one").evaluate((element) => element.replaceWith(element.cloneNode(true)));
  // Remove copied inline hiding so this checks the persistent selector rule.
  await site.locator("#one").evaluate((element) => {
    element.removeAttribute("style");
    element.removeAttribute("data-veil-hidden");
  });
  await hidden("#one");
  const undoPeer = await context.newPage();
  await undoPeer.goto(site.url());
  await hidden("#one", true, undoPeer);
  await site.bringToFront();
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#one", false, undoPeer);
  await hidden("#two", true, undoPeer);
  await waitFor(async () => (await count()) === 1, "first undo persisted");
  await hidden("#one", false);
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#two", false);
  await hidden("#two", false, undoPeer);
  await waitFor(async () => (await count()) === 0, "second undo persisted");
  await undoPeer.close();
  await site.reload();
  await hidden("#one", false);
  console.log("PASS delayed selector replacement and cross-tab shortcut undo");

  await site.locator("#before").focus();
  const before = await site.locator("#one").boundingBox();
  assert(before);
  await action(site, false);
  await waitFor(
    () => panelAnimations.some((a) => a.type === "WebAnimation" && a.duration === 240),
    "panel entrance animation observed through CDP",
  );
  await waitFor(() => panel((d) => d.getAnimations().length === 0), "panel entrance finishes");
  await waitFor(() => site.locator("[data-less-panel]").count(), "toolbar opens panel");
  await waitFor(() => textIncludes(messages.panel_empty_title), "empty state");
  assert.equal(
    await panel((d) => d.querySelector(".empty h3")?.textContent),
    messages.panel_empty_title,
    "official Empty title and description render as one header",
  );
  assert.equal(
    await panel((d) => d.querySelector(".reset-button") === null),
    true,
    "reset is absent when empty",
  );
  assert.equal(
    await site.locator("[data-less-panel]").evaluate((e) => e.shadowRoot),
    null,
    "closed shadow",
  );
  assert.equal((await site.locator("#one").boundingBox())!.x, before.x, "no page reflow");
  assert.equal(
    await panel((d) => (d.getRootNode() as ShadowRoot).activeElement!.getAttribute("aria-label")),
    messages.panel_close,
  );
  const commands = await worker.evaluate(() => chrome.commands?.getAll?.() ?? []);
  assert(
    commands.some((command) => command.name === "toggle-selection" && command.shortcut),
    "browser assigns the registered selection shortcut",
  );
  assert.equal(
    await panel((d) => d.querySelector(".select-button kbd")),
    null,
    "no invented shortcut hint",
  );
  const unreadVersion = values["released-update-fixture"]
    ? manifest.version
    : getLatestReleasedUpdate(productUpdates, manifest.version)?.version;
  await waitFor(
    () => panel((d) => d.querySelector(".count-value")?.textContent !== "…"),
    "initial records load before update notice checks",
  );
  if (unreadVersion) {
    await waitFor(
      () => panel((d) => !!d.querySelector(".update-notice-dot")),
      "first unread released update displays a dot",
    );
    const badge = await panel((d) => {
      const button = d.querySelector<HTMLElement>(".updates-button")!,
        dot = button.querySelector<HTMLElement>(".update-notice-dot")!;
      const a = button.getBoundingClientRect(),
        b = dot.getBoundingClientRect();
      return {
        label: button.getAttribute("aria-label"),
        side: b.left > a.left + a.width / 2 && b.top < a.top + a.height / 2,
        hidden: dot.getAttribute("aria-hidden"),
      };
    });
    assert.equal(
      badge.label,
      messages.panel_version_updates_unread.replace("$1", manifest.version),
    );
    assert(
      badge.side && badge.hidden === "true",
      "decorative unread dot occupies the top right of the full icon target",
    );
    await click(".updates-button");
    await waitFor(
      () => panel((d) => !!d.querySelector(".updates ol li")),
      "updates actually opens before marking read",
    );
    await waitFor(
      async () =>
        (await worker.evaluate((key) => chrome.storage.local.get(key), UPDATES_SEEN_VERSION_KEY))[
          UPDATES_SEEN_VERSION_KEY
        ] === unreadVersion,
      "viewed release version persisted",
    );
    await site.keyboard.press("Escape");
    await waitFor(
      () => panel((d) => !d.querySelector(".update-notice-dot")),
      "opening the timeline clears unread dot",
    );
    await action();
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "close read panel",
    );
    await action();
    await waitFor(() => site.locator("[data-less-panel]").count(), "read panel remounted");
    assert.equal(
      await panel((d) => !!d.querySelector(".update-notice-dot")),
      false,
      "read state survives panel remount",
    );
    await worker.evaluate((key) => chrome.storage.local.remove(key), UPDATES_SEEN_VERSION_KEY);
    await waitFor(
      () => panel((d) => !!d.querySelector(".update-notice-dot")),
      "external storage change synchronizes unread state",
    );
    await worker.evaluate(({ key, version }) => chrome.storage.local.set({ [key]: version }), {
      key: UPDATES_SEEN_VERSION_KEY,
      version: unreadVersion,
    });
    await waitFor(
      () => panel((d) => !d.querySelector(".update-notice-dot")),
      "external read state synchronizes without reopening",
    );
    console.log(
      "PASS unread dot position/name, opening marks read, persistent remount and cross-context storage synchronization",
    );
  } else {
    assert.equal(
      await panel((d) => !!d.querySelector(".update-notice-dot")),
      false,
      "unreleased/future updates do not claim new released content",
    );
    console.log("PASS no misleading unread badge for bundled unreleased content");
  }
  await waitFor(
    () =>
      panel((d, background) => {
        const control = d.querySelector<HTMLElement>('.preference [role="switch"]')!;
        const probe = d.ownerDocument.createElement("span");
        probe.style.backgroundColor = background;
        control.after(probe);
        const matches =
          getComputedStyle(control).backgroundColor === getComputedStyle(probe).backgroundColor;
        probe.remove();
        return matches;
      }, semanticRefs.bgActionPrimary),
    "enabled switch uses the official primary action background",
  );
  await click('.preference [role="switch"]');
  await waitFor(
    () =>
      panel((d) => d.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false"),
    "switch reflects the saved paused state",
  );
  assert.equal(
    await panel((d) => {
      const label = d.querySelector<HTMLElement>(".preference")!;
      const description = d.querySelector<HTMLElement>(".site-overview > .muted")!;
      return getComputedStyle(label).paddingInline === getComputedStyle(description).paddingInline;
    }),
    true,
    "paused description shares the switch row gutter",
  );
  assert.equal(
    await worker.evaluate(async (o) => {
      const key = `veil:hiding-enabled:${encodeURIComponent(o)}`;
      return (await chrome.storage.local.get(key))[key];
    }, origin),
    false,
    "pointer toggling persists the site preference",
  );
  await site.keyboard.press("Space");
  await waitFor(
    () => panel((d) => d.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true"),
    "keyboard toggling resumes hiding",
  );
  assert.equal(
    await worker.evaluate(async (o) => {
      const key = `veil:hiding-enabled:${encodeURIComponent(o)}`;
      return key in (await chrome.storage.local.get(key));
    }, origin),
    false,
    "resuming clears the paused preference",
  );
  await action(site, false);
  await waitFor(
    () =>
      panelAnimations.filter((a) => a.type === "WebAnimation" && a.duration === 240).length >= 2,
    "panel exit animation observed through CDP",
  );
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
    "exit unmounts after animation",
  );
  assert.equal(await site.evaluate(() => document.activeElement!.id), "before", "focus restored");
  await action(site, false);
  await waitFor(() => panel((d) => d.open), "rapid open accepted");
  const exitCount = panelAnimations.filter((a) => a.type === "WebAnimation").length;
  await action(site, false);
  await waitFor(
    () => panelAnimations.filter((a) => a.type === "WebAnimation").length > exitCount,
    "rapid close accepted",
  );
  await action(site, false);
  await waitFor(() => panel((d) => d.getAnimations().length === 0), "rapid toggles settled");
  assert.equal(await site.locator("[data-less-panel]").count(), 1, "rapid toggles keep one panel");
  await site.emulateMedia({ reducedMotion: "reduce" });
  const beforeReducedPanel = panelAnimations.length;
  await action(site, false);
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
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
  assert.equal(await site.locator("[data-less-panel]").count(), 0, "selection folds panel");
  await site.locator("#one").click();
  await site.keyboard.press("Escape");
  await hidden("#one");
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length > 0),
    "selection returns to panel",
  );
  assert.equal(await count(), 1, "one click persists exactly one record");
  assert.equal(
    await panel((d) => d.querySelectorAll(".record").length),
    1,
    "one click renders exactly one row",
  );
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
  await auditPanel("home");
  if (values.axe) {
    await click(".settings-button");
    await auditPanel("settings");
    for (const page of ["language", "theme", "motion", "shortcuts"]) {
      await click(`[data-settings-page="${page}"]`);
      await auditPanel(page);
      await click('header a[data-panel-destination="settings"]');
    }
    await click('header a[data-panel-destination="hidden"]');
  }

  const cssBefore = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
  await click(".record:nth-child(3) .locate-button");
  assert.notEqual(
    await site.locator("#one").evaluate((e) => getComputedStyle(e).display),
    "none",
    "preview overrides preload CSS and displays the actual target",
  );
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
    0,
    "near-start target clamps centering to the beginning of the page",
  );
  assert.equal(
    await site.locator("#one").evaluate((e) => getComputedStyle(e).outlineStyle),
    "solid",
  );
  await waitFor(() => panel((d) => d.dataset.preview === "true"), "preview status committed");
  await site.emulateMedia({ forcedColors: "active" });
  assert.equal(
    await panel((d) => {
      const context = document.createElement("canvas").getContext("2d")!;
      context.fillStyle = getComputedStyle(d, "::backdrop").backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    }),
    0,
    "forced colors still leave the preview visible",
  );
  await site.emulateMedia({ forcedColors: "none" });
  await auditPanel("preview");
  assert.equal(
    await panel((d) => {
      const status = d.querySelector<HTMLElement>(".preview-status")!;
      const body = d.querySelector<HTMLElement>(".panel-body")!.getBoundingClientRect();
      const list = d.querySelector<HTMLElement>(".records")!.getBoundingClientRect();
      return (
        !d.querySelector(".preview-notice") &&
        status.getBoundingClientRect().width === 1 &&
        getComputedStyle(status).clipPath === "inset(50%)" &&
        list.left >= body.left &&
        list.right <= body.right &&
        d.dataset.previewLayout === "compact"
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
  const visiblePreviewStyle = await site.locator("#two").getAttribute("style");
  await click(".record:nth-child(2) .locate-button");
  await waitFor(() => panel((d) => d.dataset.preview === "true"), "OFF items can be located");
  assert.equal(
    await panel((d) => d.dataset.previewEdge),
    undefined,
    "OFF preview keeps the same bottom placement",
  );
  assert.equal(
    await panel((d) => Math.round(innerHeight - d.getBoundingClientRect().bottom)),
    8,
    "all previews retain the fixed bottom inset",
  );
  assert.equal(
    await panel((d) => getComputedStyle(d, "::backdrop").backdropFilter),
    "none",
    "preview is not blurred",
  );
  await site.keyboard.press("Escape");
  await hidden("#two", false);
  assert.equal(
    await site.locator("#two").getAttribute("style"),
    visiblePreviewStyle,
    "OFF preview restores the visible element exactly",
  );
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
  assert.equal(await panel((d) => d.dataset.preview), "true", "failure retains preview mode");
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
  assert.equal(await site.locator("[data-less-panel]").count(), 1, "Esc ends preview first");
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
  assert.equal(await site.locator("[data-less-panel]").count(), 1);
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
  assert.equal(await site.locator("[data-less-panel]").count(), 1, "tooltip Escape takes priority");
  await site.mouse.move(0, 0);
  await panel((d) => d.querySelector<HTMLElement>(".updates-button")!.focus());
  await waitFor(
    () => panel((d) => !d.querySelector('[role="tooltip"]')),
    "version badge has no visible tooltip",
  );
  assert.equal(await panel((d) => d.querySelector(".updates-button")!.getAttribute("title")), null);
  await click(".updates-button");
  await waitFor(() => textIncludes(messages.panel_update_history), "updates timeline");
  await waitFor(
    () => textIncludes(messages[productUpdates[0].titleKey]),
    "latest update title is rendered",
  );
  assert(
    !(await panel((d) => d.innerText)).includes("Veil"),
    "unreleased update copy uses current name",
  );
  await site.keyboard.press("Escape");
  await waitFor(() => textIncludes(messages.panel_hidden_items), "updates back");
  assert.equal(
    await panel((d) => (d.getRootNode() as ShadowRoot).activeElement!.getAttribute("aria-label")),
    messages.panel_version_updates.replace("$1", manifest.version),
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
                ".list-toolbar button,.panel-footer button,.select-button,.site-card,.record-kind",
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
        headerInset: getComputedStyle(d.querySelector(".panel-header")!).paddingInline,
        bodyInset: getComputedStyle(d.querySelector(".panel-body")!).paddingInline,
        contentOffset:
          d.querySelector(".site-card")!.getBoundingClientRect().left -
          d.querySelector("header nav")!.getBoundingClientRect().left,
      }));
      assert(
        geometry.width <= width && geometry.scroll <= geometry.client,
        "no horizontal clipping",
      );
      assert.equal(geometry.font, "14px");
      assert.equal(geometry.button, "36px");
      assert.equal(geometry.headerInset, geometry.bodyInset, "header and overview share insets");
      assert(Math.abs(geometry.contentOffset) < 0.5, "overview aligns with the header content");
      const cardLayout = await panel((d) => {
        const identity = d.querySelector<HTMLElement>(".site-identity")!.getBoundingClientRect();
        const count = d.querySelector<HTMLElement>(".hidden-count")!.getBoundingClientRect();
        const card = d.querySelector<HTMLElement>(".site-card")!.getBoundingClientRect();
        const preference = d.querySelector<HTMLElement>(".preference")!.getBoundingClientRect();
        const select = d.querySelector<HTMLElement>(".select-button")!.getBoundingClientRect();
        return {
          separated: identity.right <= count.left || identity.bottom <= count.top,
          rows: card.bottom <= select.top && select.bottom <= preference.top,
          countFont: getComputedStyle(d.querySelector(".count-value")!).fontSize,
        };
      });
      assert(
        cardLayout.separated && cardLayout.rows,
        "site card precedes primary action and separate site switch",
      );
      assert.equal(cardLayout.countFont, "32px", "the count retains its semantic heading size");
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
              overlap: left.right > right.left && left.bottom > right.top,
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
      const components = await panel((d, tokens) => {
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
          probe.style.color = token;
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
            rawBorderColor: style.borderTopColor,
            classes: element.className,
            borderToken: style.getPropertyValue("--x4kr36v"),
            hover: element.matches(":hover"),
            disabled: element.matches(":disabled"),
            background: rgba(style.backgroundColor),
            radius: style.borderTopLeftRadius,
            height: style.height,
            font: style.fontSize,
            color: rgba(style.color),
            width: style.width,
          };
        };
        const shadow = d.getRootNode() as ShadowRoot;
        return {
          unresolvedImports: shadow.querySelector("style")!.textContent.includes("@import"),
          neutral: resolveColor(tokens.strokeDefault),
          blue: resolveColor("var(--less-panel-focus)"),
          primary: resolveColor(tokens.bgActionPrimary),
          foreground: resolveColor(tokens.fgPrimary),
          reset: inspect(".reset-button"),
          select: inspect(".select-button"),
          badge: inspect(".record-kind"),
          card: inspect(".site-card"),
        };
      }, semanticRefs);
      assert.equal(
        components.unresolvedImports,
        false,
        "package CSS imports are bundled in shadow",
      );
      for (const control of [components.reset]) {
        assert.equal(control.border, "1px", "official outline button keeps its border geometry");
        assert.equal(control.borderStyle, "solid");
        assert.deepEqual(
          control.borderColor,
          components.neutral,
          `official outline button resolves its semantic border: ${JSON.stringify(control)}`,
        );
        assert.deepEqual(
          control.color,
          components.foreground,
          "supporting actions use neutral text",
        );
        assert.equal(control.font, "14px");
        assert.notEqual(control.radius, "0px");
      }
      assert.equal(components.reset.height, "32px", "reset uses the official small text button");
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
      console.log("PASS official component CSS", { width, colorScheme });
      for (let i = 0; i < 14; i++) {
        await site.keyboard.press("Tab");
        assert.equal(
          await panel((d) => d.contains((d.getRootNode() as ShadowRoot).activeElement!)),
          true,
          "modal keyboard focus stays inside",
        );
      }
      await panel((d) => d.querySelector<HTMLElement>(".panel-header button:last-child")!.focus());
      await waitFor(
        () => panel((d) => !d.querySelector('[role="tooltip"]')),
        "previous tooltip closes before a new focus transition",
      );
      await panel((d) => {
        const button = d.querySelector<HTMLElement>(".restore-button")!;
        button.scrollIntoView({ block: "nearest" });
        button.focus();
      });
      await waitFor(
        () =>
          panel(
            (d, label) => d.querySelector('[role="tooltip"]')?.textContent?.trim() === label,
            messages.panel_restore_tooltip,
          ),
        "localized restore tooltip visible after previous tooltip closes",
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
  await site.evaluate(() => document.querySelector<HTMLElement>("[data-less-panel]")!.remove());
  await waitFor(
    () =>
      site
        .locator("[data-less-panel]")
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

  await panel((d) => d.querySelector<HTMLElement>(".reset-button")!.scrollIntoView());
  await click(".reset-button");
  await site.keyboard.press("Escape");
  await waitFor(
    () => panel((d) => !d.querySelector(".reset-confirmation")),
    "Esc cancels reset first",
  );
  assert.equal(
    await panel(
      (d) => (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".reset-button"),
    ),
    true,
    "cancel returns focus to the trigger",
  );
  await click(".reset-button");
  await waitFor(
    () =>
      panel(
        (d) =>
          (d.getRootNode() as ShadowRoot).activeElement ===
          d.querySelector(".reset-confirmation button"),
      ),
    "cancel gets initial focus",
  );
  assert.equal(
    await panel((d) => d.querySelector(".reset-confirmation")?.getAttribute("role")),
    "alertdialog",
  );
  await site.keyboard.press("Shift+Tab");
  assert.equal(
    await panel(
      (d) => (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".reset-submit"),
    ),
    true,
    "dialog traps backwards focus",
  );
  await site.keyboard.press("Tab");
  assert.equal(
    await panel(
      (d) =>
        (d.getRootNode() as ShadowRoot).activeElement ===
        d.querySelector(".reset-confirmation button"),
    ),
    true,
    "dialog traps forward focus",
  );
  await click(".reset-confirmation button");
  await waitFor(
    () => panel((d) => !d.querySelector(".reset-confirmation")),
    "cancel leaves the saved item intact",
  );
  assert.equal(await count(), 1);
  await click(".reset-button");
  const resetContexts: ExecutionContext[] = [];
  session.on("Runtime.executionContextCreated", (e) => resetContexts.push(e.context));
  await session.send("Runtime.disable");
  await session.send("Runtime.enable");
  const resetWorld = resetContexts.find((c) => c.origin === `chrome-extension://${id}`);
  assert(resetWorld);
  const resetFailure = await session.send("Runtime.evaluate", {
    contextId: resetWorld.id,
    expression: `(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      let calls = 0;
      chrome.runtime.sendMessage = (...args) => {
        if (args[0]?.type !== "RESET_HIDDEN_SITE") return original(...args);
        calls++;
        return new Promise((_, reject) => setTimeout(() => reject(new Error("injected reset failure")), 350));
      };
      return () => { chrome.runtime.sendMessage = original; return calls; };
    })()`,
  });
  await click(".reset-submit");
  assert.equal(
    await panel((d) => d.querySelector(".reset-confirmation")?.getAttribute("aria-busy")),
    "true",
    "reset announces pending state",
  );
  assert.equal(
    await panel((d) => d.querySelector<HTMLButtonElement>(".reset-button")?.disabled),
    true,
    "pending reset keeps the disabled trigger mounted",
  );
  await site.keyboard.press("Tab");
  assert.equal(
    await panel((d) =>
      d
        .querySelector(".reset-confirmation")!
        .contains((d.getRootNode() as ShadowRoot).activeElement),
    ),
    true,
    "pending confirmation retains keyboard focus",
  );
  await site.keyboard.press("Escape");
  await panel((d) => d.querySelector<HTMLButtonElement>(".reset-submit")!.click());
  await waitFor(
    () => panel((d) => !!d.querySelector('.reset-confirmation [role="alert"]')),
    "failed reset keeps the dialog and error visible",
  );
  assert.equal(await count(), 1, "failed reset retains records");
  assert(
    await panel((d) => !!d.querySelector(".reset-button")),
    "failed reset retains its trigger for retry",
  );
  const resetCalls = await session.send("Runtime.callFunctionOn", {
    objectId: resetFailure.result.objectId,
    functionDeclaration: "function(){return this()}",
    returnByValue: true,
  });
  assert.equal(resetCalls.result.value, 1, "pending reset blocks duplicate submission");
  await click(".reset-confirmation .reset-submit");
  await waitFor(async () => (await count()) === 0, "reset DB");
  await hidden("#one", false);
  await hidden("#one", false, sibling);
  await site.reload();
  await hidden("#one", false);
  await action();
  await waitFor(() => textIncludes(messages.panel_empty_title), "reset persists reload");
  await site.keyboard.press("Escape");

  // Check the real focus/AX boundary during fading, preload hiding and temporary preview.
  await site.goto(`${origin}/accessibility`);
  await site.waitForTimeout(300);
  for (const aria of [null, "false", "true"]) {
    await site.locator("#a11y-target").evaluate((e, value) => {
      if (value === null) e.removeAttribute("aria-hidden");
      else e.setAttribute("aria-hidden", value);
    }, aria);
    const originalStyle = await site.locator("#a11y-target").getAttribute("style");
    await site.locator("#a11y-button").focus();
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
    });
    await site.locator("#a11y-button").click({ modifiers: ["Shift"] });
    assert.equal(
      await site.locator("#a11y-target").getAttribute("data-veil-hidden"),
      "true",
      "Shift immediately hides controls' direct parent",
    );
    assert.equal(await site.locator("#a11y-target").getAttribute("aria-hidden"), aria);
    assert.equal(
      await site.locator("#a11y-button").evaluate((e) => {
        e.focus();
        return document.activeElement === e;
      }),
      false,
      "fading hidden controls cannot receive focus",
    );
    const fadingTree = await session.send("Accessibility.getFullAXTree");
    assert(
      !fadingTree.nodes.some((n) => !n.ignored && n.name?.value === "Hidden action"),
      "fading hidden controls are absent from the AX tree",
    );
    await hidden("#a11y-target");
    assert.equal(
      await site.locator("#a11y-target").evaluate(
        (e) =>
          new Promise<number>((resolve) => {
            let changes = 0;
            const observer = new MutationObserver((records) => {
              changes += records.length;
            });
            observer.observe(e, { attributes: true, childList: true, subtree: true });
            setTimeout(() => {
              observer.disconnect();
              resolve(changes);
            }, 250);
          }),
      ),
      0,
      "settled hiding does not create an observer mutation loop",
    );
    await waitFor(async () => (await count()) === 1, "one accessibility rule");
    await site.keyboard.press("Escape");
    siteOwnsInert = aria === "true";
    siteAria = aria;
    await site.reload();
    await hidden("#a11y-target");
    assert.equal(
      await site.locator("#a11y-target").getAttribute("aria-hidden"),
      aria,
      "preload and saved hiding preserve the site's original ARIA",
    );
    assert(
      !(await session.send("Accessibility.getFullAXTree")).nodes.some(
        (n) => !n.ignored && n.name?.value === "Hidden action",
      ),
      "preload-hidden controls are absent from AX",
    );
    await action();
    await click(".locate-button");
    assert.notEqual(
      await site.locator("#a11y-target").evaluate((e) => getComputedStyle(e).display),
      "none",
      "preview overrides the preload display rule",
    );
    await hidden("#a11y-target", false);
    assert.equal(await site.locator("#a11y-target").getAttribute("data-veil-hidden"), "true");
    assert.equal(
      await site.locator("#a11y-target").evaluate((e) => e instanceof HTMLElement && e.inert),
      true,
      "visual preview retains inert even independently of modal focus containment",
    );
    assert.equal(await site.locator("#a11y-target").getAttribute("aria-hidden"), aria);
    assert.equal(
      await site.locator("#a11y-button").evaluate((e) => {
        e.focus();
        return document.activeElement === e;
      }),
      false,
      "visual preview does not activate hidden controls",
    );
    assert(
      !(await session.send("Accessibility.getFullAXTree")).nodes.some(
        (n) => !n.ignored && n.name?.value === "Hidden action",
      ),
      "preview stays outside AX while hidden",
    );
    await site.keyboard.press("Escape");
    await hidden("#a11y-target");
    await click(".restore-button");
    await hidden("#a11y-target", false);
    assert.equal(await site.locator("#a11y-target").getAttribute("aria-hidden"), aria);
    assert.equal(await site.locator("#a11y-target").getAttribute("style"), originalStyle);
    assert.equal(
      await site.locator("#a11y-target").getAttribute("inert"),
      siteOwnsInert ? "site-owned" : null,
    );
    await site.keyboard.press("Escape");
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "panel closes before checking restored focus",
    );
    await site.locator("#a11y-button").focus();
    assert.equal(
      await site.locator("#a11y-button").evaluate((e) => document.activeElement === e),
      !siteOwnsInert,
      "restored controls preserve the site's original inert and ARIA",
    );
    await waitFor(async () => (await count()) === 0, "accessibility rule restored");
  }
  siteOwnsInert = false;
  siteAria = null;
  console.log(
    "PASS fade/preload/preview AX and focus, original absent/false/true ARIA and exact style restore",
  );

  // These cases exercise the built content script, real selection, DB and preload CSS.
  await site.goto(`${origin}/regressions`);
  await site.waitForTimeout(300);
  const beforeShiftURL = site.url();
  const beforeShiftPages = activeContext.pages().length;
  await site.evaluate(() => {
    const link = document.querySelector("#formatted-link")!;
    for (const type of ["pointerdown", "mousedown", "click"]) {
      link.addEventListener(type, () => link.setAttribute(`data-site-${type}`, "ran"), true);
    }
  });
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#formatted-link span").click({ modifiers: ["Shift"] });
  await site.waitForTimeout(150);
  assert.equal(site.url(), beforeShiftURL, "Shift+click prevents site navigation");
  assert.equal(activeContext.pages().length, beforeShiftPages, "Shift+click opens no tab/window");
  assert.deepEqual(
    await site
      .locator("#formatted-link")
      .evaluate((e) =>
        ["pointerdown", "mousedown", "click"].map((type) => e.getAttribute(`data-site-${type}`)),
      ),
    [null, null, null],
    "selection intercepts site capture handlers before activation",
  );
  assert.equal(await count(), 0, "Shift+click cannot hide a body/html parent");
  await site.locator("#single").hover();
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#single").boundingBox(),
    "hover highlights the unmodified base target",
  );
  await site.keyboard.down("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#middle").boundingBox(),
    "Shift keydown highlights the direct parent before any click",
  );
  await site.keyboard.down("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#middle").boundingBox(),
    "repeated Shift keydown never promotes to a grandparent",
  );
  await site.screenshot({ path: values.screenshot.replace(/\.png$/, "-shift-before-click.png") });
  await site.keyboard.press("ArrowUp");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#outer").boundingBox(),
    "ArrowUp explicitly expands the base while Shift is held",
  );
  await site.keyboard.press("ArrowDown");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#middle").boundingBox(),
    "ArrowDown reverses explicit expansion while Shift is held",
  );
  await site.keyboard.up("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#single").boundingBox(),
    "Shift keyup restores the original base target",
  );
  await site.keyboard.down("Shift");
  await site.locator("#formatted-link span").hover();
  assert.equal(
    await site.locator("[data-less-highlight]").boundingBox(),
    null,
    "Shift hover rejects the body/html parent of a normalized link target",
  );
  await site.locator("#shift-other-child").hover();
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#shift-other-parent").boundingBox(),
    "moving to a different base with Shift selects exactly its direct parent",
  );
  await site.locator("#single").hover();
  const highlightedParent = await site.locator("[data-less-highlight]").boundingBox();
  assert.deepEqual(
    highlightedParent,
    await site.locator("#middle").boundingBox(),
    "moving with Shift uses the new base target's direct parent",
  );
  const childCenter = await site.locator("#single").boundingBox();
  assert(childCenter);
  await site.mouse.click(
    childCenter.x + childCenter.width / 2,
    childCenter.y + childCenter.height / 2,
  );
  await site.keyboard.up("Shift");
  assert.equal(
    await site.locator("#middle").getAttribute("data-veil-hidden"),
    "true",
    "one Shift+click immediately hides the direct parent",
  );
  assert.equal(
    await site.locator("#outer").getAttribute("data-veil-hidden"),
    null,
    "Shift never hides the grandparent",
  );
  await hidden("#middle");
  assert.equal(await count(), 1, "one Shift+click saves exactly one record");
  const parentSelector = (await storedRecords())[0].cssSelector;
  assert(parentSelector);
  assert.equal(
    await site.evaluate((selector) => document.querySelector(selector)?.id, parentSelector),
    "middle",
    "the stored rule resolves to the exact parent highlighted before clicking",
  );
  await site.keyboard.press("Escape");
  await site.reload();
  await hidden("#middle");
  assert.equal(
    await site.locator("#outer").getAttribute("data-veil-hidden"),
    null,
    "reload never hides the grandparent",
  );
  await action();
  await click(".restore-button");
  await hidden("#middle", false);
  await waitFor(async () => (await count()) === 0, "Shift parent restore removes its rule");
  await site.keyboard.press("Escape");
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
    "panel closes before keyboard parent selection",
  );
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#single").hover();
  await site.keyboard.press("ArrowUp");
  const childBox = await site.locator("#single").boundingBox();
  assert(childBox);
  await site.mouse.move(childBox.x + 30, childBox.y + 10);
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#middle").boundingBox(),
    "moving inside the keyboard-selected parent retains selection",
  );
  await site.keyboard.press("ArrowUp");
  await site.mouse.wheel(0, 50);
  await site.waitForTimeout(150);
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#outer").boundingBox(),
    "scroll keeps the selected parent's outline aligned",
  );
  await site.keyboard.down("Shift");
  assert.equal(
    await site.locator("[data-less-highlight]").boundingBox(),
    null,
    "keyboard-selected ancestor cannot promote into body/html",
  );
  await site.keyboard.up("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#outer").boundingBox(),
    "Shift release preserves keyboard selection",
  );
  await site.keyboard.press("ArrowDown");
  await site.keyboard.down("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#outer").boundingBox(),
    "Shift previews the direct parent of the keyboard-selected base",
  );
  // Keep the pointer stationary so click must use the preview, not resolve the hit again.
  await site.mouse.down();
  await site.mouse.up();
  await site.keyboard.up("Shift");
  assert.equal(
    await site.locator("#outer").getAttribute("data-veil-hidden"),
    "true",
    "stationary click hides exactly the highlighted keyboard-plus-Shift target",
  );
  await hidden("#outer");
  assert.equal(await count(), 1, "highlighted target is saved once");
  const keyboardParentSelector = (await storedRecords())[0].cssSelector;
  assert(keyboardParentSelector);
  assert.equal(
    await site.evaluate((selector) => document.querySelector(selector)?.id, keyboardParentSelector),
    "outer",
    "click and DB identity agree even when the pointer hit differs from the preview",
  );
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#outer", false);
  await waitFor(async () => (await count()) === 0, "keyboard-plus-Shift target undo");
  await site.locator("#single").hover();
  await site.keyboard.down("Shift");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#middle").boundingBox(),
    "Shift preview follows the keyboard base target",
  );
  await site.keyboard.press("Enter");
  await site.keyboard.up("Shift");
  assert.equal(
    await site.locator("#outer").getAttribute("data-veil-hidden"),
    null,
    "Shift plus Enter saves the highlighted parent without another promotion",
  );
  await hidden("#middle");
  assert.equal(await count(), 1);
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#middle", false);
  await waitFor(async () => (await count()) === 0, "Shift undo removes the parent rule");
  await site.locator("#single").hover();
  await site.keyboard.press("ArrowUp");
  await site.keyboard.press("ArrowDown");
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#single").boundingBox(),
    "ArrowDown returns to the child",
  );
  await site.keyboard.press("ArrowUp");
  await site.keyboard.press("Enter");
  await hidden("#middle");
  assert.equal(await count(), 1, "keyboard parent selection and Enter save once");
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#middle", false);
  await waitFor(async () => (await count()) === 0, "keyboard parent restores");
  await site.locator("#single").hover();
  await site.keyboard.press("ArrowUp");
  await site.locator("h1").hover();
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("h1").boundingBox(),
    "leaving the selected parent resumes targeting",
  );
  await site.locator("#single").hover();
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#single").boundingBox(),
    "returning starts a fresh child selection",
  );
  await worker.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () {
      IDBObjectStore.prototype.add = original;
      throw Error("injected Shift DB save failure");
    };
  });
  await site.locator("#single").click({ modifiers: ["Shift"] });
  await waitFor(
    async () =>
      (await selectionSurface(
        "data-less-ui",
        (e) => e.querySelector('[role="alert"]')?.textContent,
      )) === messages.panel_selection_save_error,
    "Shift save error shown",
  );
  await hidden("#middle", false);
  assert.equal(await count(), 0, "failed Shift save rolls back DB and live hiding");
  await site.keyboard.press("Escape");
  console.log(
    "PASS Shift immediate direct parent, one record, reload/restore/undo, keyboard combination, root guard, site activation prevention and failed-save rollback",
  );
  await site.addStyleTag({
    content:
      "html{font-size:28px}*{font-family:serif!important}button{padding:60px!important;background:red!important;border:9px solid red!important}[data-less-ui],[data-less-highlight]{position:absolute!important;opacity:0!important;z-index:-1!important;pointer-events:auto!important}",
  });
  for (const width of [320, 375]) {
    for (const colorScheme of ["light", "dark"] as const) {
      await site.setViewportSize({ width, height: 720 });
      await site.emulateMedia({ colorScheme });
      await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
      });
      await site.locator("#single").hover();
      const highlight = await selectionSurface("data-less-highlight", (e) => {
        const s = getComputedStyle(e);
        return {
          border: s.borderWidth,
          style: s.borderStyle,
          color: s.borderColor,
          background: s.backgroundColor,
        };
      });
      assert.equal(highlight.border, "2px");
      assert.equal(highlight.style, "solid");
      assert.notEqual(highlight.background, "rgba(0, 0, 0, 0)");
      const toolbar = await selectionSurface("data-less-ui", (e) => {
        const pill = e.firstElementChild!;
        const s = getComputedStyle(pill),
          r = e.getBoundingClientRect();
        return {
          background: s.backgroundColor,
          border: s.borderWidth,
          style: s.borderStyle,
          padding: s.padding,
          left: r.left,
          right: r.right,
          font: s.fontSize,
          closeBorder: getComputedStyle(pill.querySelector("button")!).borderWidth,
        };
      });
      assert.notEqual(toolbar.background, "rgba(0, 0, 0, 0)");
      assert.equal(toolbar.border, "1px");
      assert.equal(toolbar.style, "solid");
      assert.equal(toolbar.padding, "8px 20px");
      assert.equal(toolbar.font, "12px");
      assert.equal(toolbar.closeBorder, "0px");
      assert(toolbar.left >= 0 && toolbar.right <= width, "selection toolbar fits the viewport");
      await site.keyboard.press("ArrowUp");
      const parentRect = await site.locator("#middle").boundingBox();
      const outlineRect = await site.locator("[data-less-highlight]").boundingBox();
      assert.deepEqual(outlineRect, parentRect, "ArrowUp targets the existing parent");
      await site.keyboard.press("ArrowDown");
      assert.deepEqual(
        await site.locator("[data-less-highlight]").boundingBox(),
        await site.locator("#single").boundingBox(),
        "ArrowDown returns to the original child",
      );
      for (let i = 0; i < 10; i++) await site.keyboard.press("ArrowUp");
      assert.deepEqual(
        await site.locator("[data-less-highlight]").boundingBox(),
        await site.locator("#outer").boundingBox(),
        "ancestor navigation stops before body/html",
      );
      await site.keyboard.press("Escape");
    }
  }
  await site.setViewportSize({ width: 1100, height: 800 });
  await site.emulateMedia({ colorScheme: "light" });
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#formatted-link span").hover();
  assert.deepEqual(
    await site.locator("[data-less-highlight]").boundingBox(),
    await site.locator("#formatted-link").boundingBox(),
    "interactive ancestors are not unwrapped into their only child",
  );
  await site.keyboard.press("Enter");
  await hidden("#formatted-link");
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#formatted-link", false);
  await waitFor(async () => (await count()) === 0, "formatted inline link restores its one record");
  await site.keyboard.press("Escape");
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#mobile-main strong").click();
  await site.keyboard.press("Escape");
  await hidden("#mobile-main");
  assert.equal(await count(), 1, "formatted link text saves exactly one link record");
  await site.reload();
  await hidden("#mobile-main");
  await action();
  await click(".restore-button");
  await hidden("#mobile-main", false);
  await waitFor(async () => (await count()) === 0, "formatted link restored");
  await site.keyboard.press("Escape");
  await hide("#weather-content");
  const collapsed = await site.locator("#collapsed-region").evaluate((e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e);
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      padding: s.padding,
      border: s.borderWidth,
      margin: s.marginTop,
    };
  });
  assert.equal(collapsed.width, 420);
  assert.equal(collapsed.height, 0);
  assert.equal(collapsed.padding, "0px");
  assert.equal(collapsed.border, "0px");
  assert.equal(collapsed.margin, "16px");
  assert.equal(await count(), 1, "collapsing a region never automatically saves the parent");
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  for (const selector of [
    "#empty-region",
    "#inset-region",
    "#transparent-region",
    "#covered-region",
  ]) {
    const r = await site.locator(selector).evaluate((e) => e.getBoundingClientRect().toJSON());
    await site.mouse.move(r.x + 30, r.y + 1);
    const outline = await site.locator("[data-less-highlight]").boundingBox();
    assert(
      !outline || outline.height > 8,
      "invisible empty boxes are not painted selection candidates",
    );
  }
  await site.mouse.move(collapsed.x + collapsed.width / 2, collapsed.y);
  const painted = await site.locator("[data-less-highlight]").boundingBox();
  assert(
    painted && painted.height > 0 && painted.height <= 8,
    "collapsed shadow has a visible selection outline",
  );
  assert.equal(
    await site.locator("#collapsed-region").evaluate((e) => e.getBoundingClientRect().height),
    0,
    "selection does not change site layout",
  );
  await site.mouse.click(collapsed.x + collapsed.width / 2, collapsed.y);
  await site.keyboard.press("Escape");
  await hidden("#collapsed-region");
  await waitFor(
    async () => (await count()) === 2,
    "explicit collapsed-region click saves exactly one additional record",
  );
  await site.reload();
  await hidden("#collapsed-region");
  await action();
  await waitFor(() => textIncludes("날씨"), "collapsed region keeps its accessible name");
  await click(".record:first-child .locate-button");
  await waitFor(
    () => panel((d) => d.querySelector(".locate-button")?.getAttribute("aria-pressed") === "true"),
    "collapsed region can be previewed without a hidden-parent error",
  );
  await site.keyboard.press("Escape");
  await click(".record:first-child .restore-button");
  await hidden("#collapsed-region", false);
  await hidden("#weather-content");
  assert.equal(await count(), 1, "restoring the collapsed parent preserves the chosen child rule");
  await click(".restore-button");
  await hidden("#weather-content", false);
  await waitFor(
    async () => (await count()) === 0,
    "collapsed fixture cleaned through real restore",
  );
  await site.keyboard.press("Escape");
  console.log(
    "PASS collapsed 420x0 shadow region: explicit selection, no layout changes, one record, accessible name, preview, reload and independent restore",
  );
  await hide("#single");
  await waitFor(async () => (await count()) >= 1, "selection saved");
  await site.waitForTimeout(450);
  assert.equal(await count(), 1, "one click creates exactly one record");
  assert.deepEqual(
    await site.locator("[data-veil-hidden]").evaluateAll((es) => es.map((e) => e.id)),
    ["single"],
    "no automatically saved ancestors or descendants",
  );
  const borderShell = await site.locator("#outer").evaluate((element) => ({
    connected: element.isConnected,
    display: getComputedStyle(element).display,
    border: getComputedStyle(element).borderTopWidth,
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    visibleText: Array.from(element.querySelectorAll<HTMLElement>("p")).filter(
      (child) => getComputedStyle(child).display !== "none",
    ).length,
  }));
  assert(
    borderShell.connected &&
      borderShell.display !== "none" &&
      borderShell.border === "2px" &&
      borderShell.width > 0 &&
      borderShell.height > 0,
  );
  assert.equal(
    borderShell.visibleText,
    0,
    "border-only shell reproduced after explicitly hiding its sole text target",
  );
  console.log(
    "PASS border-only fixture: selected child is hidden, enclosing border remains; one record, no automatic ancestor mutation",
  );

  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await site.locator("#middle").hover();
  await site.keyboard.press("ArrowUp");
  await site.keyboard.press("Enter");
  await site.keyboard.press("Escape");
  await hidden("#outer");
  await waitFor(
    async () => (await count()) === 2,
    "separately chosen parent preserves both records",
  );
  await action();
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length === 2),
    "explicit parent and child have two rows",
  );
  await click(".reset-button");
  await click(".reset-confirmation .reset-submit");
  await waitFor(async () => (await count()) === 0, "reset regression selection");
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelectorAll(".record").length === 0 && !d.querySelector(".reset-confirmation"),
      ),
    "reset UI settled",
  );
  await action();
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
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
      probe.style.color = "var(--less-panel-focus)";
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
  const previewGeometry = await panel((d) => {
    const r = d.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      scroll: d.querySelector(".records")!.scrollTop,
    };
  });
  const switchingFrames = await panel(async (d) => {
    d.querySelector<HTMLButtonElement>('.locate-button[aria-label*="Far targ"]')!.click();
    const frames: {
      active: string | undefined;
      layout: string | undefined;
      x: number;
      y: number;
      width: number;
      height: number;
      scroll: number;
    }[] = [];
    for (let i = 0; i < 24; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const r = d.getBoundingClientRect();
      frames.push({
        active: d.dataset.preview,
        layout: d.dataset.previewLayout,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        scroll: d.querySelector(".records")!.scrollTop,
      });
    }
    return frames;
  });
  for (const frame of switchingFrames) {
    assert.equal(frame.active, "true", "item switch never exits preview mode");
    assert.equal(frame.layout, "compact", "item switch never resets panel layout");
    for (const key of ["x", "y", "width", "height"] as const)
      assert(Math.abs(frame[key] - previewGeometry[key]) < 1, `stable preview ${key}`);
    assert.equal(frame.scroll, previewGeometry.scroll, "item switch preserves list scroll");
  }
  await hidden("#nested-target");
  await hidden("#far-target", false);
  assert.equal(
    await panel((d) => d.querySelector(".record[data-selected] .record-kind")?.textContent),
    messages.panel_kind_content,
    "content item uses the same preview navigation",
  );
  const centeredContent = await panel((d) => {
    const target = document.querySelector("#far-target")!.getBoundingClientRect();
    return {
      actual: (target.top + target.bottom) / 2,
      expected: (d.getBoundingClientRect().top - 8) / 2,
    };
  });
  assert(
    Math.abs(centeredContent.actual - centeredContent.expected) < 2,
    "content target centers in the page area above the preview pane",
  );
  const farPosition = await site.evaluate(() => scrollY);
  await click('.locate-button[aria-label*="Far targ"]');
  assert.equal(await site.evaluate(() => scrollY), farPosition, "repeat centering is stable");
  await waitFor(
    () =>
      site.locator("#far-target").evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0;
      }),
    "long page scroll",
  );
  const beforeFixed = await site.evaluate(() => scrollY);
  await click('.locate-button[aria-label*="Covered"]');
  assert.equal(
    await site.evaluate(() => scrollY),
    beforeFixed,
    "fixed-position target does not scroll the page",
  );
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
  await click('.locate-button[aria-label*="Covered"]');
  await click("header button");
  assert.equal(
    await panel((d) => d.dataset.preview),
    "false",
    "preview close returns to normal panel",
  );
  assert.equal(
    await site.locator("[data-less-panel]").count(),
    1,
    "preview close retains the panel",
  );
  async function assertMouseRowControls(state: string) {
    await site.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
    await waitFor(
      () =>
        panel((d) =>
          d
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== "running"),
        ),
      "official interaction transitions settled",
    );
    const paint = await panel((d) => {
      const button = d.querySelector<HTMLElement>('.locate-button[aria-label*="Nested"]')!;
      const row = button.closest<HTMLElement>(".record-row")!;
      return {
        hovered: row.matches(":hover"),
        pressed: button.matches(":active"),
        focusVisible: button.matches(":focus-visible"),
        background: getComputedStyle(row).backgroundColor,
        inner: getComputedStyle(button).backgroundColor,
        overlay: getComputedStyle(button, "::after").backgroundColor,
        expectedOverlay: (() => {
          const probe = document.createElement("span");
          probe.style.color = "transparent";
          d.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })(),
        layers: [button].flatMap((element) =>
          [null, "::before", "::after"].map((pseudo) => {
            const style = getComputedStyle(element, pseudo);
            return {
              outline: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              borders: [
                [style.borderTopWidth, style.borderTopStyle, style.borderTopColor],
                [style.borderRightWidth, style.borderRightStyle, style.borderRightColor],
                [style.borderBottomWidth, style.borderBottomStyle, style.borderBottomColor],
                [style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor],
              ],
              shadow: style.boxShadow,
            };
          }),
        ),
      };
    });
    console.log("ROW PAINT", state, JSON.stringify(paint));
    assert.equal(paint.focusVisible, false, `${state}: mouse focus is not keyboard focus`);
    assert.equal(
      paint.overlay,
      paint.expectedOverlay,
      `${state}: official ghost interaction layer`,
    );
    if (!state.includes("selected"))
      assert.equal(paint.inner, "rgba(0, 0, 0, 0)", `${state}: official ghost background`);
    for (const layer of paint.layers) {
      assert.equal(layer.outline, "none", `${state}: no row/button/pseudo outline`);
      if (!state.includes("selected"))
        for (const [width, style, color] of layer.borders)
          assert(
            width === "0px" || style === "none" || color === "rgba(0, 0, 0, 0)",
            `${state}: no visible row/button/pseudo border`,
          );
      assert.equal(layer.shadow, "none", `${state}: no row/button/pseudo shadow`);
    }
    return paint;
  }
  for (const width of [320, 375]) {
    await site.setViewportSize({ width, height: 720 });
    for (const colorScheme of ["light", "dark"] as const) {
      await site.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      const hoveredRow = await panel((d) => {
        d.querySelector<HTMLElement>(".panel-header button:last-child")!.focus();
        const button = d.querySelector<HTMLElement>('.locate-button[aria-label*="Nested"]')!;
        button.scrollIntoView({ block: "nearest" });
        const r = button.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await site.mouse.move(hoveredRow.x, hoveredRow.y);
      await waitFor(
        () =>
          panel(
            (d) =>
              getComputedStyle(d.querySelector('.locate-button[aria-label*="Nested"]')!, "::after")
                .backgroundColor === "rgba(0, 0, 0, 0)",
          ),
        "inner action has no duplicate hover paint",
      );
      const hover = await assertMouseRowControls(`${width}/${colorScheme}/hover`);
      assert(hover.hovered && !hover.pressed, "real mouse hover without pressing");
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-row-hover-${width}-${colorScheme}.png`),
      });
      await site.mouse.down();
      const pressed = await assertMouseRowControls(`${width}/${colorScheme}/pressed`);
      assert(pressed.pressed, "real mouse press changes only the background");
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-row-pressed-${width}-${colorScheme}.png`),
      });
      await site.mouse.up();
      await waitFor(
        () => panel((d, t) => !d.innerText.includes(t), messages.panel_find),
        "preview settled after mouse release",
      );
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
      await assertMouseRowControls(`${width}/${colorScheme}/click-selected`);
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
      await site.mouse.move(0, 0);
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-row-selected-${width}-${colorScheme}.png`),
      });
      const selectedPoint = await panel((d) => {
        const button = d.querySelector<HTMLElement>('.locate-button[aria-pressed="true"]')!;
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      await site.mouse.move(selectedPoint.x, selectedPoint.y);
      const selectedHover = await assertMouseRowControls(`${width}/${colorScheme}/selected-hover`);
      assert(selectedHover.hovered, "selected row is really hovered");
      const paint = await panel((d) => {
        const button = d.querySelector<HTMLElement>('.locate-button[aria-pressed="true"]')!;
        const row = button.closest<HTMLElement>(".record-row")!;
        const item = row.closest<HTMLElement>(".record")!;
        const a = row.getBoundingClientRect(),
          b = item.getBoundingClientRect();
        return {
          background: getComputedStyle(row).backgroundColor,
          inner: getComputedStyle(button).backgroundColor,
          overlay: getComputedStyle(button, "::after").backgroundColor,
          radius: getComputedStyle(row).borderRadius,
          outline: getComputedStyle(row).outlineStyle,
          shadow: getComputedStyle(row).boxShadow,
          fullWidth: a.left === b.left && a.right === b.right,
        };
      });
      assert.equal(
        paint.background,
        state.selected,
        "selection keeps one background while hovered",
      );
      assert.equal(
        paint.inner,
        "rgba(0, 0, 0, 0)",
        "selected action stays transparent; selection belongs to the entire row",
      );
      assert.equal(
        paint.overlay,
        "rgba(0, 0, 0, 0)",
        "selected action has no duplicate hover layer",
      );
      assert.equal(
        paint.outline,
        "none",
        "selected/hovered row uses background without an outline",
      );
      assert.equal(paint.shadow, "none", "selected row has no inset blue edge");
      assert(paint.fullWidth, "Table rows retain full available width");
      await site.screenshot({
        path: values.screenshot.replace(
          /\.png$/,
          `-row-selected-hover-${width}-${colorScheme}.png`,
        ),
      });
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
          background: getComputedStyle(e).backgroundColor,
          rowOutline: getComputedStyle(e.closest(".record-row")!).outlineStyle,
          rowShadow: getComputedStyle(e.closest(".record-row")!).boxShadow,
        };
      });
      assert(
        focus.visible && focus.style === "solid" && parseFloat(focus.width) >= 2,
        "keyboard focus remains visible",
      );
      assert.equal(focus.background, "rgba(0, 0, 0, 0)", "keyboard action stays ghost");
      assert.equal(focus.rowOutline, "none", "keyboard ring belongs to the focused button");
      assert.equal(focus.rowShadow, "none", "keyboard selection has no extra row line");
      console.log("ROW FOCUS", width, colorScheme, JSON.stringify(focus));
      assert.equal(
        focus.color,
        await panel((d, token) => {
          const probe = document.createElement("span");
          probe.style.color = token;
          d.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        }, semanticRefs.strokeFocus),
        "keyboard focus uses the official strokeFocus token",
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
  // TableRow owns hover and selection; the ghost action owns keyboard focus.
  const hoverPoint = await panel((d) => {
    const button = d.querySelector<HTMLElement>(".locate-button")!;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await site.mouse.move(hoverPoint.x, hoverPoint.y);
  await waitFor(
    () =>
      panel((d) => {
        const button = d.querySelector<HTMLElement>(".locate-button")!;
        return (
          button.matches(":hover") &&
          getComputedStyle(button.closest(".record-row")!).backgroundColor !== "rgba(0, 0, 0, 0)"
        );
      }),
    "TableRow owns hover paint",
  );
  await click(".record:first-child .restore-button");
  await hidden("#fixed-target", false);
  await waitFor(async () => (await count()) === 4, "X removes only selected rule");
  await site.keyboard.press("Escape");
  await site.reload();
  await hidden("#fixed-target", false);
  await hidden("#nested-target");
  console.log(
    "PASS one click/one record+row, explicit parent and child, identical labels, nested and long scroll, fixed overlay, panel retained, active action, return, hover/focus, narrow light/dark reduced motion, X restore reload",
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
  const badgeRows = await panel((d) =>
    Array.from(d.querySelectorAll(".record")).map((row) => ({
      category: row.querySelector(".record-kind")?.textContent,
      text: row.querySelector(".record-label")?.textContent ?? "",
      label: row.querySelector(".locate-button")?.getAttribute("aria-label"),
      technicalTag: !!row.querySelector(".record-tag"),
    })),
  );
  for (const row of badgeRows) {
    assert(
      Object.entries(messages).some(
        ([key, value]) => key.startsWith("panel_kind_") && value === row.category,
      ),
      "badge contains a localized content category",
    );
    assert(
      !row.technicalTag && row.text !== row.category && !row.text.startsWith(`${row.category} · `),
      "no HTML tag badge or duplicate category prefix",
    );
    assert(
      row.label?.includes(row.category!) && (!row.text || row.label.includes(row.text)),
      "accessible name includes the category and optional short content",
    );
  }
  for (const size of [
    { width: 1100, height: 800 },
    { width: 375, height: 720 },
    { width: 320, height: 480 },
    { width: 320, height: 300 },
  ]) {
    await site.setViewportSize(size);
    const before = await panel((d) => {
      const list = d.querySelector<HTMLElement>(".records")!,
        footer = d.querySelector<HTMLElement>(".panel-footer")!;
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
        footer = d.querySelector<HTMLElement>(".panel-footer")!;
      list.scrollTop = list.scrollHeight;
      const li = list.querySelector<HTMLElement>(".record")!,
        row = li,
        badge = row.querySelector<HTMLElement>(".record-kind")!,
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
        cellPadding: [
          getComputedStyle(row.firstElementChild!).paddingInlineStart,
          getComputedStyle(row.lastElementChild!).paddingInlineEnd,
        ],
        actionColumnExtra:
          row.lastElementChild!.getBoundingClientRect().width -
          x.width -
          parseFloat(getComputedStyle(row.lastElementChild!).paddingInlineStart) -
          parseFloat(getComputedStyle(row.lastElementChild!).paddingInlineEnd),
        actionPadding: Array.from(
          row.querySelectorAll<HTMLElement>("button"),
          (e) => getComputedStyle(e).padding,
        ),
        actionEdges:
          row.querySelector(".locate-button")!.getBoundingClientRect().left -
          b.left -
          (b.right - x.right),
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
    assert.equal(
      after.cellPadding[0],
      after.cellPadding[1],
      "both Table cells retain the same native horizontal padding",
    );
    assert(
      Math.abs(after.actionColumnExtra) < 1,
      "action column contains only the native Button and cell padding",
    );
    assert(
      after.actionPadding.every((padding) => padding === "0px"),
      "TableCell owns spacing and both row Buttons have zero padding",
    );
    assert(Math.abs(after.actionEdges) < 1, "row action boxes share the same outer cell inset");
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
  const uiContexts: ExecutionContext[] = [];
  session.on("Runtime.executionContextCreated", (e) => uiContexts.push(e.context));
  await session.send("Runtime.disable");
  await session.send("Runtime.enable");
  const uiWorld = uiContexts.find((c) => c.origin === `chrome-extension://${id}`);
  assert(uiWorld, "content isolated world for localized real UI");
  // Exercise the user's actual language control with another live extension document.
  const welcomePage = await activeContext.newPage();
  await welcomePage.goto(`chrome-extension://${id}/welcome.html`);
  await welcomePage.getByRole("combobox").waitFor();
  await site.bringToFront();
  await click(".settings-button");
  await click('[data-settings-page="language"]');
  assert.equal(
    await panel((d) => d.querySelector(".language-select")!.getAttribute("data-preference-value")),
    "auto",
    "browser language is the default",
  );
  await click(".language-select");
  await click('[role="option"][data-preference-value="es"]');
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelector(".language-select")?.getAttribute("data-preference-value") === "es" &&
          d.lang === "es",
      ),
    "language change updates mounted settings",
  );
  assert.equal(
    await worker.evaluate(
      async () => (await chrome.storage.local.get("less:locale"))["less:locale"],
    ),
    "es",
  );
  await welcomePage.getByRole("combobox", { name: "Idioma" }).waitFor();
  await welcomePage.getByRole("heading", { name: "Oculta lo innecesario." }).waitFor();
  await welcomePage.reload();
  await welcomePage.getByRole("combobox", { name: "Idioma" }).waitFor();
  await welcomePage.getByRole("combobox", { name: "Idioma" }).click();
  await welcomePage.getByRole("option", { name: "日本語" }).click();
  await waitFor(
    () =>
      panel(
        (d) =>
          d.querySelector(".language-select")?.getAttribute("data-preference-value") === "ja" &&
          d.lang === "ja",
      ),
    "welcome selection synchronizes mounted panel",
  );
  const siblingSession = await activeContext.newCDPSession(sibling);
  await sibling.bringToFront();
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
  });
  await sibling.locator("[data-less-ui]").waitFor();
  await welcomePage.getByRole("combobox", { name: "言語" }).click();
  await welcomePage.getByRole("option", { name: "Español" }).click();
  const spanish = JSON.parse(
    await readFile(join(values.build, "_locales/es/messages.json"), "utf8"),
  );
  await waitFor(async () => {
    const toolbar = await selectionSurface(
      "data-less-ui",
      (surface) => ({
        text: surface.querySelector("span")!.textContent,
        keys: surface.querySelector("span")!.title,
        close: surface.querySelector("button")!.getAttribute("aria-label"),
      }),
      siblingSession,
    );
    return (
      toolbar.text === spanish.panel_selection_prompt.message &&
      toolbar.keys === spanish.panel_selection_keys.message &&
      toolbar.close === spanish.panel_selection_close.message
    );
  }, "another tab's active selection toolbar translates without remounting");
  await sibling.bringToFront();
  await sibling.keyboard.press("Escape");
  await siblingSession.detach();
  await site.bringToFront();
  await site.keyboard.press("Escape");
  await site.keyboard.press("Escape");
  await waitFor(
    () => panel((d) => d.querySelector(".settings-button")!.getClientRects().length > 0),
    "return to hidden items",
  );
  await worker.evaluate(() => chrome.storage.local.set({ "less:locale": "auto" }));
  await welcomePage.close();
  console.log(
    "PASS real language control: default auto, selection change, persistence/reload, welcome and panel cross-context synchronization",
  );
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(
      await readFile(join(values.build, "_locales", locale, "messages.json"), "utf8"),
    );
    await action();
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "close before locale switch",
    );
    await worker.evaluate((locale) => chrome.storage.local.set({ "less:locale": locale }), locale);
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { type: "TOGGLE_SELECTION" }, { frameId: 0 });
    });
    for (const width of [320, 375]) {
      await site.setViewportSize({ width, height: 720 });
      const instruction = await selectionSurface("data-less-ui", (e) => {
        const info = e.querySelector("span")!;
        const r = info.getBoundingClientRect();
        return { text: info.textContent, title: info.title, left: r.left, right: r.right };
      });
      assert.equal(instruction.text, catalog.panel_selection_prompt.message);
      assert.equal(instruction.title, catalog.panel_selection_keys.message);
      assert(
        instruction.left >= 0 && instruction.right <= width,
        `${locale}/${width}: parent instruction stays readable without clipping`,
      );
    }
    await site.keyboard.press("Escape");
    await action();
    await waitFor(
      () => panel((d) => d.querySelectorAll(".record").length >= 17),
      "localized long list",
    );
    for (const width of [320, 375]) {
      await site.setViewportSize({ width, height: 720 });
      for (const colorScheme of ["light", "dark"] as const) {
        await site.emulateMedia({ colorScheme });
        const rows = await panel((d) =>
          Array.from(d.querySelectorAll(".record")).map((row) => {
            const badge = row.querySelector<HTMLElement>(".record-kind")!;
            const text = row.querySelector<HTMLElement>(".record-label");
            const button = row.querySelector<HTMLElement>(".locate-button")!;
            return {
              category: badge.textContent,
              metrics: [badge, text, button].map((e) =>
                e
                  ? [
                      e.clientWidth,
                      e.scrollWidth,
                      getComputedStyle(e).whiteSpace,
                      getComputedStyle(e).height,
                    ]
                  : null,
              ),
              text: text?.textContent ?? "",
              label: button.getAttribute("aria-label"),
              fits:
                badge.scrollWidth <= badge.clientWidth + 1 &&
                (!text || text.scrollWidth <= text.clientWidth + 1) &&
                button.scrollWidth <= button.clientWidth + 1,
            };
          }),
        );
        for (const row of rows) {
          assert(
            Object.keys(catalog).some(
              (key) => key.startsWith("panel_kind_") && catalog[key].message === row.category,
            ),
            `${locale}: category badge uses the active locale`,
          );
          assert(
            row.fits && row.text !== row.category && row.label?.includes(row.category!),
            `${locale}/${width}/${colorScheme}: badge, short text and accessible name fit ${JSON.stringify(row)}`,
          );
        }
      }
      const before = await panel((d) => {
        const list = d.querySelector<HTMLElement>(".records")!;
        list.scrollTop = Math.floor((list.scrollHeight - list.clientHeight) / 2);
        const reset = d.querySelector<HTMLElement>(".reset-button")!;
        const card = d.querySelector<HTMLElement>(".site-card")!;
        const content = card.firstElementChild!;
        const setting = d.querySelector<HTMLElement>(".preference > span")!.getBoundingClientRect();
        const toggle = d
          .querySelector<HTMLElement>('.preference [role="switch"]')!
          .getBoundingClientRect();
        return {
          scroll: list.scrollTop,
          site: d.querySelector(".site-title")!.textContent,
          reset: reset.getBoundingClientRect().toJSON(),
          labelOffset: setting.left - card.getBoundingClientRect().left,
          switchOffset: toggle.right - card.getBoundingClientRect().right,
          padding: getComputedStyle(content).paddingInline,
          border: getComputedStyle(card).borderInlineWidth,
          width: d.clientWidth,
          overflow: d.scrollWidth,
          refresh: d.querySelector(".refresh-button"),
          resetText: reset.textContent,
          resetIcons: reset.querySelectorAll("svg").length,
          updatesText: d.querySelector(".updates-button")!.childNodes[0].textContent,
          versionBadge: d.querySelector(".updates-button > span")?.textContent,
        };
      });
      assert(
        before.scroll > 0 && before.overflow <= before.width,
        `${locale}/${width}: list scrolls without clipping`,
      );
      assert(
        Math.abs(before.labelOffset) < 0.5 && Math.abs(before.switchOffset) < 0.5,
        `${locale}/${width}: switch row aligns with the shared body edges`,
      );
      assert.equal(before.refresh, null);
      assert.equal(before.resetText, catalog.panel_reset.message);
      assert.equal(before.resetIcons, 0);
      assert.equal(before.updatesText, catalog.panel_update_history.message);
      assert.equal(before.versionBadge, manifest.version);
      await site.mouse.move(0, 0);
      const updateEntry = await panel((d) => {
        const button = d.querySelector<HTMLElement>(".updates-button")!;
        const badge = button.querySelector<HTMLElement>(":scope > span")!;
        const settings = d.querySelector<HTMLElement>(".settings-button")!;
        const style = getComputedStyle(badge);
        const bounds = button.getBoundingClientRect();
        return {
          background: getComputedStyle(button).backgroundColor,
          badgeBackground: style.backgroundColor,
          badgeBorder: style.borderTopColor,
          pill: parseFloat(style.borderTopLeftRadius) >= badge.clientHeight / 2,
          fits:
            button.scrollWidth <= button.clientWidth &&
            bounds.left >= 0 &&
            bounds.right <= d.getBoundingClientRect().right &&
            (bounds.right <= settings.getBoundingClientRect().left ||
              bounds.bottom <= settings.getBoundingClientRect().top),
          label: button.getAttribute("aria-label"),
        };
      });
      assert.equal(updateEntry.background, "rgba(0, 0, 0, 0)", "ghost entry rests transparent");
      assert.notEqual(updateEntry.badgeBackground, "rgba(0, 0, 0, 0)");
      assert.equal(
        updateEntry.badgeBorder,
        updateEntry.badgeBackground,
        "filled badge has no outline",
      );
      assert(
        updateEntry.pill && updateEntry.fits,
        `${locale}/${width}: label and pill fit without overlapping settings`,
      );
      assert(updateEntry.label!.includes(catalog.panel_update_history.message));
      assert(before.reset.bottom <= 720);
      console.log(
        `ALIGN ${locale}/${width}: label ${before.labelOffset}px, switch ${before.switchOffset}px, CardHeader padding ${before.padding}, border ${before.border}`,
      );
      await site.screenshot({
        path: values.screenshot.replace(/\.png$/, `-${locale}-${width}.png`),
      });
      await panel((d) =>
        d.querySelector<HTMLElement>(".record:last-child .restore-button")!.focus(),
      );
      await site.keyboard.press("Tab");
      assert.equal(
        await panel((d) =>
          (d.getRootNode() as ShadowRoot).activeElement!.classList.contains("updates-button"),
        ),
        true,
        "footer version follows list in tab order",
      );
      assert(
        await panel((d) => {
          const style = getComputedStyle(d.querySelector(".updates-button")!);
          return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
        }),
        "update history keeps a visible keyboard focus outline",
      );
      await site.keyboard.press("Tab");
      assert.equal(
        await panel(
          (d) => (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".help-button"),
        ),
        true,
        "help follows version in tab order",
      );
      assert.equal(
        await panel((d) => d.querySelector(".help-button")!.getAttribute("aria-label")),
        catalog.panel_help.message,
      );
      await site.keyboard.press("Tab");
      assert.equal(
        await panel(
          (d) =>
            (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".settings-button"),
        ),
        true,
        "settings follows help in tab order",
      );
      await site.keyboard.press("Tab");
      assert.equal(
        await panel(
          (d) =>
            (d.getRootNode() as ShadowRoot).activeElement ===
            d.querySelector(".panel-header button:last-child"),
        ),
        true,
        "settings footer loops back to close in tab order",
      );
      // Restore a middle position after keyboard focus scrolled the last row into view.
      await panel((d, top) => {
        d.querySelector<HTMLElement>(".records")!.scrollTop = top;
      }, before.scroll);
      await panel((d) => d.querySelector<HTMLElement>(".updates-button")!.focus());
      await site.keyboard.press(width === 320 ? "Enter" : "Space");
      await waitFor(
        () => panel((d) => !!d.querySelector(".updates ol li")),
        "actual Timeline rendered by keyboard",
      );
      const updateView = await panel((d) => {
        const updates = d.querySelector<HTMLElement>(".updates")!;
        return {
          installedVersion: !!updates.querySelector(".installed-version"),
          titles: Array.from(updates.querySelectorAll("h3"), (title) => title.textContent),
          changes: Array.from(updates.querySelectorAll("ul li"), (change) => change.textContent),
          fits: updates.scrollWidth <= updates.clientWidth + 1,
        };
      });
      assert.equal(updateView.installedVersion, false, `${locale}: no duplicate installed version`);
      assert.deepEqual(
        updateView.titles,
        productUpdates.map((update) => catalog[update.titleKey].message),
      );
      assert.deepEqual(
        updateView.changes,
        productUpdates.flatMap((update) => update.changeKeys.map((key) => catalog[key].message)),
      );
      assert(updateView.fits, `${locale}/${width}: update copy wraps without horizontal overflow`);
      if (width === 375 || locale === "ko")
        await site.screenshot({
          path: values.screenshot.replace(/\.png$/, `-updates-${locale}-${width}.png`),
        });
      assert.equal(
        await panel(
          (d) =>
            d.querySelector<HTMLElement>(".records")!.closest<HTMLElement>("[hidden]") !== null,
        ),
        true,
      );
      assert.equal(
        await panel((d) => d.querySelectorAll(".panel-header .updates-button").length),
        0,
        "no duplicate header entry",
      );
      if (width === 320) await click('[data-panel-destination="hidden"]');
      else await site.keyboard.press("Escape");
      await waitFor(
        () =>
          panel((d) =>
            (d.getRootNode() as ShadowRoot).activeElement!.classList.contains("updates-button"),
          ),
        "return focus to footer updates",
      );
      assert.equal(
        await panel((d) => d.querySelector<HTMLElement>(".records")!.scrollTop),
        before.scroll,
        `${locale}/${width}: return retains list scroll`,
      );
      assert.equal(
        await panel((d) => d.querySelector(".site-title")!.textContent),
        before.site,
        "current site retained",
      );
      const footer = await panel((d) => ({
        footer: d.querySelector(".panel-footer")!.getBoundingClientRect().toJSON(),
        version: d.querySelector(".updates-button")!.getBoundingClientRect().toJSON(),
        settings: d.querySelector(".settings-button")!.getBoundingClientRect().toJSON(),
      }));
      assert(
        Math.abs(footer.version.left - footer.footer.left) < 1 &&
          Math.abs(footer.settings.right - footer.footer.right) < 1,
        "version and settings align to opposite footer ends",
      );
      await panel((d) => d.querySelector<HTMLElement>(".settings-button")!.focus());
      await waitFor(
        () =>
          panel(
            (d, label) =>
              Array.from(d.querySelectorAll('[role="tooltip"]')).some(
                (tooltip) =>
                  tooltip.id ===
                    d.querySelector(".settings-button")!.getAttribute("aria-describedby") &&
                  tooltip.textContent === label,
              ),
            catalog.panel_settings.message,
          ),
        "translated settings tooltip",
      );
      await site.keyboard.press("Enter");
      await waitFor(
        () => panel((d) => !!d.querySelector('[data-settings-page="language"]')),
        "keyboard opens settings sections",
      );
      assert.equal(
        await panel((d) => d.querySelector(".panel-current")!.textContent),
        catalog.panel_settings.message,
      );
      await click('[data-settings-page="language"]');
      for (let step = 0; step < 5; step++) {
        await site.keyboard.press("Tab");
        if (
          await panel((d) =>
            (d.getRootNode() as ShadowRoot).activeElement?.matches(".language-select"),
          )
        )
          break;
      }
      assert.equal(
        await panel((d) =>
          (d.getRootNode() as ShadowRoot).activeElement?.matches(".language-select"),
        ),
        true,
        "language Select is keyboard reachable",
      );
      assert.equal(
        await panel((d) =>
          d.querySelector(".language-select")?.getAttribute("data-preference-value"),
        ),
        locale,
      );
      await click(".language-select");
      await waitFor(
        () =>
          panel(
            (d) => d.querySelector(".language-select")?.getAttribute("aria-expanded") === "true",
          ),
        "language popup is open before Escape",
      );
      await waitFor(
        () => panel((d) => d.querySelectorAll('[role="option"]').length === 6),
        "auto and five supported locales",
      );
      await site.keyboard.press("Escape");
      for (const theme of ["light", "dark"] as const) {
        await site.emulateMedia({ colorScheme: theme });
        await waitFor(
          () => panel((d) => d.getAnimations({ subtree: true }).length === 0),
          "settings theme transition settled",
        );
        const layout = await panel((d) => {
          const select = d.querySelector(".language-select")!;
          const rect = select.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: d.clientWidth,
            scroll: d.scrollWidth,
            font: parseFloat(getComputedStyle(select).fontSize),
          };
        });
        assert(
          layout.left >= 0 &&
            layout.right <= width &&
            layout.scroll <= layout.width &&
            layout.font >= 14,
          `${locale}/${width}/${theme}: readable language control without clipping`,
        );
        await site.screenshot({
          path: values.screenshot.replace(/\.png$/, `-settings-${locale}-${width}-${theme}.png`),
        });
      }
      await site.keyboard.press("Escape");
      await site.keyboard.press("Escape");
      await waitFor(
        () =>
          panel(
            (d) =>
              (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".settings-button"),
          ),
        "settings returns focus to gear",
      );
      assert.equal(
        await panel((d) => d.querySelector<HTMLElement>(".records")!.scrollTop),
        before.scroll,
        "settings retains list scroll",
      );
      const backgrounds: string[] = [];
      for (const colorScheme of ["light", "dark"] as const) {
        await site.emulateMedia({ colorScheme });
        await click(".reset-button");
        await waitFor(
          () => panel((d) => !!d.querySelector('[role="alertdialog"]')),
          "localized confirmation opens",
        );
        await waitFor(
          () =>
            panel((d) => {
              const popup = d.querySelector('[role="alertdialog"]');
              return !!popup?.contains((d.getRootNode() as ShadowRoot).activeElement);
            }),
          "confirmation receives initial focus",
        );
        const confirmation = await panel((d) => {
          const popup = d.querySelector<HTMLElement>('[role="alertdialog"]')!;
          const root = popup.getRootNode() as ShadowRoot;
          const title = root.getElementById(popup.getAttribute("aria-labelledby")!)!;
          const description = root.getElementById(popup.getAttribute("aria-describedby")!)!;
          const r = popup.getBoundingClientRect();
          return {
            title: title.textContent,
            description: description.textContent,
            background: getComputedStyle(popup).backgroundColor,
            fits:
              r.left >= 0 &&
              r.right <= innerWidth &&
              r.top >= 0 &&
              r.bottom <= innerHeight &&
              popup.scrollWidth <= popup.clientWidth,
            buttons: Array.from(popup.querySelectorAll("button")).map((button) => {
              const b = button.getBoundingClientRect();
              return (
                b.left >= r.left &&
                b.right <= r.right &&
                b.top >= r.top &&
                b.bottom <= r.bottom &&
                button.scrollWidth <= button.clientWidth
              );
            }),
            focus: popup.contains(root.activeElement),
          };
        });
        assert.equal(confirmation.title, catalog.panel_reset_group.message);
        assert.equal(confirmation.description, catalog.panel_reset_confirm.message);
        assert(
          confirmation.fits && confirmation.buttons.every(Boolean) && confirmation.focus,
          `${locale}/${width}/${colorScheme}: readable confirmation, buttons and contained focus`,
        );
        backgrounds.push(confirmation.background);
        await site.screenshot({
          path: values.screenshot.replace(
            /\.png$/,
            `-confirm-${locale}-${width}-${colorScheme}.png`,
          ),
        });
        await site.keyboard.press("Escape");
        await waitFor(
          () => panel((d) => !d.querySelector('[role="alertdialog"]')),
          "Escape leaves the panel open",
        );
        assert.equal(
          await panel(
            (d) =>
              (d.getRootNode() as ShadowRoot).activeElement === d.querySelector(".reset-button"),
          ),
          true,
        );
      }
      assert.notEqual(backgrounds[0], backgrounds[1], "confirmation follows the inherited theme");
    }
    await action();
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "close before empty response fixture",
    );
    const emptyResponse = await session.send("Runtime.evaluate", {
      contextId: uiWorld.id,
      expression: `(() => {
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = (...args) => args[0]?.type === "LIST_HIDDEN_ITEMS" ? Promise.resolve({ok:true, records:[], unsyncedTabs:0}) : original(...args);
        return () => { chrome.runtime.sendMessage = original; };
      })()`,
    });
    await action();
    await waitFor(
      () => panel((d) => !!d.querySelector(".empty") && d.getAnimations().length === 0),
      "localized empty response fixture is stable",
    );
    for (const width of [320, 375]) {
      for (const colorScheme of ["light", "dark"] as const) {
        await site.setViewportSize({ width, height: 720 });
        await site.emulateMedia({ colorScheme });
        const empty = await panel((d) => {
          const e = d.querySelector<HTMLElement>(".empty")!;
          const r = e.getBoundingClientRect();
          return {
            title: e.querySelector("h3")?.textContent,
            help: e.querySelector("p")?.textContent,
            border: getComputedStyle(e).borderStyle,
            fits: r.left >= 0 && r.right <= innerWidth && e.scrollWidth <= e.clientWidth,
            resetAbsent: d.querySelector(".reset-button") === null,
          };
        });
        assert.equal(empty.title, catalog.panel_empty_title.message);
        assert.equal(empty.help, catalog.panel_empty_help.message);
        assert(
          empty.fits && empty.resetAbsent,
          `${locale}/${width}/${colorScheme}: empty state fits and reset is absent`,
        );
        await site.screenshot({
          path: values.screenshot.replace(/\.png$/, `-empty-${locale}-${width}-${colorScheme}.png`),
        });
      }
    }
    await action();
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "close empty response fixture",
    );
    await session.send("Runtime.callFunctionOn", {
      objectId: emptyResponse.result.objectId,
      functionDeclaration: "function(){this()}",
    });
    await action();
    await waitFor(
      () => panel((d) => d.querySelectorAll(".record").length >= 17),
      "saved records unchanged by locale/empty fixtures",
    );
    console.log(
      `PASS ${locale}: Empty and AlertDialog 320/375 light/dark, translated effect, focus and Escape`,
    );
  }
  await action();
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
    "close localized panel",
  );
  await worker.evaluate(() => chrome.storage.local.remove("less:locale"));
  await action();
  await waitFor(
    () => panel((d) => d.querySelectorAll(".record").length >= 17),
    "original locale restored",
  );
  await action();
  await waitFor(
    async () => (await site.locator("[data-less-panel]").count()) === 0,
    "close for retry fixture",
  );
  const delayedRetry = await session.send("Runtime.evaluate", {
    contextId: uiWorld.id,
    expression: `(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      let calls = 0;
      chrome.runtime.sendMessage = (...args) => {
        if (args[0]?.type !== "LIST_HIDDEN_ITEMS") return original(...args);
        calls++;
        if (calls === 1) return Promise.reject(new Error("fixture load failure"));
        return original(...args).then(result => new Promise(resolve => setTimeout(() => resolve(result), 400)));
      };
      return { count: () => calls, restore: () => { chrome.runtime.sendMessage = original; } };
    })()`,
  });
  await action();
  await waitFor(
    () => panel((d) => !!d.querySelector(".notice.error button")),
    "load error exposes retry",
  );
  assert.equal(
    await panel((d) => d.querySelector(".reset-button")),
    null,
    "unknown count after an initial read failure does not expose reset",
  );
  await panel((d) => {
    const button = d.querySelector<HTMLButtonElement>(".notice.error button")!;
    button.click();
    button.click();
  });
  await waitFor(
    () => panel((d) => !!d.querySelector<HTMLButtonElement>(".notice.error button")?.disabled),
    "retry pending prevents duplicate read",
  );
  await waitFor(
    () =>
      panel((d) => !d.querySelector(".notice.error") && d.querySelectorAll(".record").length >= 17),
    "retry recovers list",
  );
  const calls = await session.send("Runtime.callFunctionOn", {
    objectId: delayedRetry.result.objectId,
    functionDeclaration: "function(){const n=this.count();this.restore();return n}",
    returnByValue: true,
  });
  assert.equal(
    calls.result.value,
    2,
    "one failed initial load and one retry despite duplicate activation",
  );
  const readProbe = await session.send("Runtime.evaluate", {
    contextId: uiWorld.id,
    expression: `(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      const originalAdd = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
      const originalRemove = chrome.runtime.onMessage.removeListener.bind(chrome.runtime.onMessage);
      const listeners = new Set();
      let calls = 0;
      chrome.runtime.sendMessage = (...args) => {
        if (args[0]?.type === "LIST_HIDDEN_ITEMS") calls++;
        return original(...args);
      };
      chrome.runtime.onMessage.addListener = fn => { listeners.add(fn); return originalAdd(fn); };
      chrome.runtime.onMessage.removeListener = fn => { listeners.delete(fn); return originalRemove(fn); };
      return {
        counts: () => ({ calls, listeners: listeners.size }),
        restore: () => { chrome.runtime.sendMessage = original; chrome.runtime.onMessage.addListener = originalAdd; chrome.runtime.onMessage.removeListener = originalRemove; }
      };
    })()`,
  });
  async function queryCounts() {
    const result = await session.send("Runtime.callFunctionOn", {
      objectId: readProbe.result.objectId,
      functionDeclaration: "function(){return this.counts()}",
      returnByValue: true,
    });
    return result.result.value as { calls: number; listeners: number };
  }
  // Rerenders from confirmation and view navigation must not resubscribe or start more reads.
  await click(".reset-button");
  await site.keyboard.press("Escape");
  await click(".updates-button");
  await site.keyboard.press("Escape");
  await site.waitForTimeout(250);
  assert.equal((await queryCounts()).calls, 0, "UI rerenders do not reload records");
  for (let cycle = 1; cycle <= 2; cycle++) {
    await action();
    await waitFor(
      async () => (await site.locator("[data-less-panel]").count()) === 0,
      "panel unmounted for listener check",
    );
    assert.equal((await queryCounts()).listeners, 0, "unmount removes panel listener");
    await action();
    await waitFor(
      () => panel((d) => d.querySelector(".count-value")?.textContent !== "…"),
      "mount query settles",
    );
    await site.waitForTimeout(250);
    assert.deepEqual(
      await queryCounts(),
      { calls: cycle, listeners: 1 },
      "each mount reads once without accumulating listeners",
    );
  }
  const activeTab = await worker.evaluate(
    async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id!,
  );
  await worker.evaluate(
    (tabId) => chrome.tabs.sendMessage(tabId, { type: "HIDDEN_ITEMS_CHANGED" }),
    activeTab,
  );
  await waitFor(
    async () => (await queryCounts()).calls === 3,
    "runtime notification refreshes once",
  );
  const cssCache = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
  await worker.evaluate(() => chrome.storage.local.set({ "veil:css:all": {} }));
  await waitFor(
    async () => (await queryCounts()).calls === 4,
    "storage notification refreshes once",
  );
  await worker.evaluate((cache) => chrome.storage.local.set(cache), cssCache);
  await waitFor(async () => (await queryCounts()).calls === 5, "cache restoration refreshes once");
  await site.waitForTimeout(250);
  assert.equal((await queryCounts()).calls, 5, "completed reads do not trigger a render/read loop");
  await session.send("Runtime.callFunctionOn", {
    objectId: readProbe.result.objectId,
    functionDeclaration: "function(){this.restore()}",
  });
  console.log(
    "PASS five-locale UI, footer/tab order, Timeline return, error retry deduplication and render/mount/runtime/storage read counts with listener cleanup",
  );
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
    footer: d.querySelector<HTMLElement>(".panel-footer")!.getBoundingClientRect().toJSON(),
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
        getComputedStyle(number).fontSize === "32px"
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
  await click(".settings-button");
  await click('[data-settings-page="language"]');
  const settingsZoom = await panel((d) => {
    const select = d.querySelector(".language-select")!;
    return {
      right: select.getBoundingClientRect().right,
      viewport: innerWidth,
      scroll: d.scrollWidth,
      width: d.clientWidth,
    };
  });
  assert(
    settingsZoom.right <= settingsZoom.viewport && settingsZoom.scroll <= settingsZoom.width,
    "settings fit at 200% browser zoom",
  );
  await site.keyboard.press("Escape");
  await site.keyboard.press("Escape");
  await worker.evaluate((tabId) => chrome.tabs.setZoom(tabId, 1), zoomTab);
  await site.setViewportSize({ width: 375, height: 720 });
  await click('.locate-button[aria-label*="Weather"]');
  await hidden("#frame-wrapper", false);
  await site.keyboard.press("Escape");
  await hidden("#frame-wrapper");
  console.log(
    "PASS media labels, real iframe wrapper, category badges, fixed footer, list scroll, consistent row geometry, narrow and short viewports",
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
  await site.setViewportSize({ width: 1100, height: 800 });
  await site.emulateMedia({ reducedMotion: "reduce" });
  const beforeGutterCount = await count();
  await site.goto(`${origin}/scrollbar-tall`);
  await action();
  await waitFor(
    () => panel((d) => !!d.querySelector(".select-button:not([disabled])")),
    "scrollbar fixture ready",
  );
  await click(".panel-header button:last-child");
  const gutterBefore = await site.evaluate(() => ({
    width: innerWidth - document.documentElement.clientWidth,
    x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
    style: document.documentElement.getAttribute("style"),
  }));
  assert(gutterBefore.width > 0, "fixture exercises a real classic scrollbar");
  await hide("#gutter-target", { position: { x: 30, y: 30 } });
  const gutterAfter = await site.evaluate(() => ({
    width: innerWidth - document.documentElement.clientWidth,
    x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
    scrolls: document.documentElement.scrollHeight > innerHeight,
    style: document.documentElement.getAttribute("style"),
    gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    overflow: getComputedStyle(document.documentElement).overflow,
    hidden: Array.from(document.querySelectorAll("[data-veil-hidden]"), (element) => element.id),
  }));
  if (gutterAfter.x !== gutterBefore.x)
    console.log("GUTTER FAILURE", { gutterBefore, gutterAfter });
  assert.equal(gutterAfter.scrolls, false, "hiding removes the need for a scrollbar");
  assert.equal(
    gutterAfter.x,
    gutterBefore.x,
    `remaining content stays at x=${gutterBefore.x} after hiding (actual ${gutterAfter.x})`,
  );
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#gutter-target", false);
  assert.equal(
    await site.evaluate(() => document.documentElement.getAttribute("style")),
    gutterBefore.style,
    "last restoration releases the temporary gutter exactly",
  );
  await site.goto(`${origin}/scrollbar-short`);
  const shortBefore = await site.evaluate(() => ({
    x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
    style: document.documentElement.getAttribute("style"),
  }));
  await hide("#gutter-target");
  assert.deepEqual(
    await site.evaluate(() => ({
      x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
      style: document.documentElement.getAttribute("style"),
    })),
    shortBefore,
    "a page without a scrollbar gains no gutter or layout shift",
  );
  await site.keyboard.press("Control+Shift+Z");
  await hidden("#gutter-target", false);
  console.log(
    "PASS disappearing classic scrollbar preserves content position, exact gutter cleanup and no added space on short pages",
  );
  await waitFor(async () => (await count()) === beforeGutterCount, "gutter undo finishes saving");
  await site.goto(`${origin}/scrollbar-modal`);
  await action();
  await waitFor(
    () => panel((d) => !!d.querySelector(".select-button:not([disabled])")),
    "modal fixture ready",
  );
  await click(".panel-header button:last-child");
  await hide("#gutter-target", { position: { x: 30, y: 30 } });
  await site.reload();
  await hidden("#gutter-target");
  const modalBaseline = await site.evaluate(() => ({
    x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
    width: document.documentElement.clientWidth,
    style: document.documentElement.getAttribute("style"),
  }));
  assert.equal(modalBaseline.width, 1100, "initial cached hiding has no scrollbar gutter");
  await action();
  for (let cycle = 0; cycle < 3; cycle++) {
    await waitFor(
      () =>
        panel(
          (d) =>
            d.querySelector('.preference [role="switch"]')?.getAttribute("aria-checked") === "true",
        ),
      "hiding switch finishes reflecting ON before the next toggle",
    );
    await click('.preference [role="switch"]');
    await hidden("#gutter-target", false);
    await waitFor(
      () =>
        panel(
          (d) =>
            d.querySelector('.preference [role="switch"]')?.getAttribute("aria-checked") ===
            "false",
        ),
      "hiding switch finishes reflecting OFF before the next toggle",
    );
    const beforeWheel = await site.evaluate(() => scrollY);
    await site.mouse.move(100, 100);
    await site.mouse.wheel(0, 400);
    await site.waitForTimeout(80);
    assert.equal(
      await site.evaluate(() => scrollY),
      beforeWheel,
      "panel blocks background wheel scroll",
    );
    await click('.preference [role="switch"]');
    await hidden("#gutter-target");
    assert.deepEqual(
      await site.evaluate(() => ({
        x: document.querySelector("#gutter-reference")!.getBoundingClientRect().x,
        width: document.documentElement.clientWidth,
        overflowX: getComputedStyle(document.documentElement).overflowX,
        overflowY: getComputedStyle(document.documentElement).overflowY,
      })),
      { x: modalBaseline.x, width: modalBaseline.width, overflowX: "hidden", overflowY: "hidden" },
      "ON/OFF keeps initial width with both page scrollbars locked",
    );
  }
  await click(".panel-header button:last-child");
  assert.equal(
    await site.evaluate(() => document.documentElement.getAttribute("style")),
    modalBaseline.style,
    "panel close leaves no forced scrollbar",
  );
  assert.equal(
    await site.evaluate(() => document.documentElement.clientWidth),
    modalBaseline.width,
  );
  await action();
  await click('tr:has(.locate-button[aria-label*="Tall removable block"]) .restore-button');
  await hidden("#gutter-target", false);
  await waitFor(async () => (await count()) === beforeGutterCount, "modal fixture record restored");
  await click(".panel-header button:last-child");
  console.log(
    "PASS initial no-gutter page keeps its layout through panel OFF/ON, both-axis background lock and exact close cleanup",
  );
  const unsupported = await context.newPage();
  await unsupported.goto("chrome://version");
  await action(unsupported);
  await waitFor(async () => {
    const { targetInfos } = await browserCDP.send("Target.getTargets");
    return targetInfos.some((target) =>
      target.url.startsWith(`chrome-extension://${id}/failure.html?reason=protected`),
    );
  }, "unsupported page opens a compact action popup");
  assert.equal(unsupported.url(), "chrome://version/");
  assert(!activeContext.pages().some((p) => p.url().includes("unavailable.html")));
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
