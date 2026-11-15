/* eslint-disable no-await-in-loop -- Navigations and cross-context storage changes must be ordered. */
// Build first; instrumentation only changes a temporary copy and uses native Chrome storage.
// node scripts/verify-preload.ts --chromium /path/to/Chrome [--build dist/chrome-mv3]
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type BrowserContext } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;

type Probe = {
  entry: number;
  root: boolean;
  readyState: DocumentReadyState;
  reads: number[];
  changes: number[];
  hold: number;
  reveal: number;
  css: number;
  released: boolean;
  error?: string;
};
declare global {
  var __preloadProbe: Probe;
  var __preloadFrames: { at: number; hidden: boolean; visible: boolean }[];
}

const { values } = parseArgs({
  options: {
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    output: { type: "string" },
  },
});
assert(values.chromium, "Pass --chromium with extension support");
const directory = await mkdtemp(join(tmpdir(), "less-preload-verify-"));
const extension = join(directory, "extension");
const reports: unknown[] = [];
let context: BrowserContext | undefined;
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end(`<!doctype html><html><head><style>
    body{margin:0}section{height:120px}#target{background:red}#after{background:lime}
    </style><script>(${observeFrames.toString()})()</script></head><body>
    <section id="target">Hidden target</section><section id="after">Remaining text</section>
    </body></html>`);
});

try {
  await cp(resolve(values.build), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
  assert.equal(
    manifest.content_scripts.find((entry: { js: string[] }) =>
      entry.js.includes("content-scripts/preload.js"),
    )?.run_at,
    "document_start",
  );
  for (const [file, instrument] of [
    ["content-scripts/preload.js", instrumentPreload],
    ["background.js", instrumentBackground],
  ] as const) {
    const path = join(extension, file);
    await writeFile(path, `(${instrument.toString()})();\n${await readFile(path, "utf8")}`);
  }
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const browserCDP = await context.browser()!.newBrowserCDPSession();
  await browserCDP.send("Extensions.loadUnpacked", { path: extension });
  const worker =
    context.serviceWorkers().find((worker) => worker.url().endsWith("/background.js")) ??
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.storage.local.get(null));
  for (const page of context.pages()) await page.close();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  let isolatedContext = 0;
  cdp.on("Runtime.executionContextCreated", ({ context: created }) => {
    if (created.origin === `chrome-extension://${new URL(worker.url()).host}`)
      isolatedContext = created.id;
  });
  await cdp.send("Runtime.enable");
  const scenarios = [
    "warm",
    "other-site",
    "other-page",
    "other-query",
    "same-effect",
    "current-update",
    "current-delete",
    "site-update",
    "reset",
    "remove-cache",
    "malformed-cache",
    "off",
    "empty",
    "timeout",
    "preference-timeout",
    "pagehide",
    "invalidated",
    "navigation",
    "invalid-selector",
  ];
  for (const scenario of scenarios) {
    const url = new URL(`/${scenario}?current=1`, origin);
    const pageKey = `veil:css:page:${encodeURIComponent(origin)}:${encodeURIComponent(url.pathname)}:${encodeURIComponent(url.search)}`;
    const siteKey = `veil:css:site:${encodeURIComponent(origin)}`;
    await worker.evaluate(
      async ({ pageKey, siteKey, origin, scenario }) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          "veil:css:all": {
            [pageKey]: scenario === "empty" ? [] : ["#target@@@1"],
            [siteKey]: ["#absent@@@1"],
          },
          [`veil:hiding-enabled:${encodeURIComponent(origin)}`]: true,
        });
      },
      { pageKey, siteKey, origin, scenario },
    );
    if (scenario === "empty")
      await worker.evaluate(() => chrome.storage.local.set({ "veil:css:all": {} }));
    if (scenario === "invalid-selector")
      await worker.evaluate(
        (key) => chrome.storage.local.set({ "veil:css:all": { [key]: ["[invalid@@@1"] } }),
        pageKey,
      );
    await page.goto(url.href);
    await page.waitForFunction(() => globalThis.__preloadFrames?.length >= 24);
    const { result } = await cdp.send("Runtime.evaluate", {
      contextId: isolatedContext,
      expression: "JSON.stringify(globalThis.__preloadProbe)",
      returnByValue: true,
    });
    const probe: Probe = JSON.parse(result.value);
    const rendered = await page.evaluate(() => ({
      frames: globalThis.__preloadFrames,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
      css: document.getElementById("__veil_preload__")?.textContent,
    }));
    reports.push({ scenario, probe, ...rendered });
    if (values.output) await writeFile(resolve(values.output), JSON.stringify(reports, null, 2));
    assert(!probe.error, `${scenario}: ${probe.error}`);
    assert(probe.root && probe.readyState === "loading", `${scenario}: early document with root`);
    assert(probe.released, `${scenario}: native read completion observed`);
    assert(probe.hold > 0 && probe.reveal >= probe.hold, `${scenario}: page released`);
    const kept = ["warm", "other-site", "other-page", "other-query", "same-effect"].includes(
      scenario,
    );
    if (kept) {
      assert(probe.css > 0, `${scenario}: unrelated/no-op cache change cancelled preload CSS`);
      assert(probe.css <= probe.reveal, `${scenario}: CSS before reveal`);
      assert(
        rendered.fcp !== undefined && probe.css <= rendered.fcp,
        `${scenario}: CSS before FCP`,
      );
      assert(
        rendered.frames.some((frame) => frame.visible),
        `${scenario}: visible page observed`,
      );
      assert(rendered.frames.filter((frame) => frame.visible).every((frame) => frame.hidden));
    } else if (scenario !== "invalid-selector") {
      assert.equal(probe.css, 0, `${scenario}: stale CSS must never be attached`);
      assert.equal(rendered.css, undefined);
      assert(rendered.frames.some((frame) => frame.visible && !frame.hidden));
    } else {
      assert(probe.css > 0, "invalid selector: cache was applied but cannot match the DOM");
      assert(rendered.frames.some((frame) => frame.visible && !frame.hidden));
    }
    if (["timeout", "preference-timeout"].includes(scenario)) {
      assert(probe.reveal - probe.hold >= 140, `${scenario}: timeout fallback exercised`);
      assert(probe.reveal - probe.hold < 230, `${scenario}: reveal did not await late storage`);
    }
    if (["other-site", "other-page", "other-query", "same-effect"].includes(scenario)) {
      assert(probe.changes.length > 0, `${scenario}: actual native onChanged delivered`);
      assert(probe.changes[0] < probe.css, `${scenario}: change preceded application`);
    }
    console.log(`PASS ${scenario}`);
  }
  if (values.output) await writeFile(resolve(values.output), JSON.stringify(reports, null, 2));
  console.log("PASS native Chrome storage races and first-paint preload checks");
} finally {
  await context?.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}

function instrumentBackground() {
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type !== "PRELOAD_VERIFY_WRITE") return;
    const write = message.remove
      ? chrome.storage.local.remove("veil:css:all")
      : chrome.storage.local.set(message.values);
    void write.then(() => respond(true));
    return true;
  });
}

function instrumentPreload() {
  const scenario = location.pathname.slice(1);
  const probe: Probe = {
    entry: performance.now(),
    root: document.documentElement !== null,
    readyState: document.readyState,
    reads: [],
    changes: [],
    hold: 0,
    reveal: 0,
    css: 0,
    released: false,
  };
  globalThis.__preloadProbe = probe;
  const storage: {
    get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  } = chrome.storage.local;
  const get = storage.get.bind(storage);
  const pageKey = `veil:css:page:${encodeURIComponent(location.origin)}:${encodeURIComponent(location.pathname)}:${encodeURIComponent(location.search)}`;
  const siteKey = `veil:css:site:${encodeURIComponent(location.origin)}`;
  let changed: (() => void) | undefined;
  chrome.storage.onChanged.addListener(() => {
    probe.changes.push(performance.now());
    changed?.();
  });
  storage.get = function (keys) {
    return get(keys).then(async (value) => {
      probe.reads.push(performance.now());
      if (scenario === "preference-timeout" && Array.isArray(keys))
        await new Promise((done) => setTimeout(done, 260));
      if (keys !== "veil:css:all") return value;
      try {
        const all = value[keys];
        if (typeof all !== "object" || all === null) throw new Error("Missing fixture cache");
        let next: Record<string, unknown> | undefined;
        if (scenario === "other-site")
          next = { ...all, "veil:css:site:https%3A%2F%2Fother.test": ["#other@@@1"] };
        if (scenario === "other-page")
          next = {
            ...all,
            [pageKey.replace(encodeURIComponent(location.pathname), "%2Felsewhere")]: [
              "#other@@@1",
            ],
          };
        if (scenario === "other-query")
          next = {
            ...all,
            [pageKey.replace(encodeURIComponent(location.search), "%3Fcurrent%3D2")]: [
              "#other@@@1",
            ],
          };
        if (scenario === "same-effect")
          next = {
            ...all,
            [pageKey]: ["#absent@@@5", "#target@@@2", "#target@@@1"],
            [siteKey]: [],
          };
        if (scenario === "current-update") next = { ...all, [pageKey]: ["#after@@@1"] };
        if (scenario === "current-delete") next = { [siteKey]: Reflect.get(all, siteKey) };
        if (scenario === "site-update") next = { ...all, [siteKey]: ["#after@@@1"] };
        if (scenario === "reset") next = {};
        if (scenario === "malformed-cache") next = { ...all, [pageKey]: [null] };
        if (next || scenario === "off" || scenario === "remove-cache") {
          const notified = new Promise<void>((done) => {
            changed = done;
          });
          await chrome.runtime.sendMessage({
            type: "PRELOAD_VERIFY_WRITE",
            remove: scenario === "remove-cache",
            values: next
              ? { "veil:css:all": next }
              : { [`veil:hiding-enabled:${encodeURIComponent(location.origin)}`]: false },
          });
          await notified;
        }
        if (scenario === "timeout") await new Promise((done) => setTimeout(done, 260));
        if (scenario === "pagehide") window.dispatchEvent(new Event("pagehide"));
        if (scenario === "invalidated")
          document.dispatchEvent(
            new CustomEvent(`${chrome.runtime.id}:preload:wxt:content-script-started`, {
              detail: { contentScriptName: "preload", messageId: "verification-replacement" },
            }),
          );
        if (scenario === "navigation") history.replaceState(null, "", "/navigated");
      } catch (error) {
        probe.error = String(error);
      }
      probe.released = true;
      return value;
    });
  };
  const append = Node.prototype.appendChild;
  Node.prototype.appendChild = function <T extends Node>(child: T): T {
    const result = append.call(this, child) as T;
    if (child instanceof HTMLStyleElement) {
      if (child.id === "__veil_preload__") probe.css = performance.now();
      else if (child.textContent?.includes("visibility: hidden !important"))
        probe.hold = performance.now();
    }
    return result;
  };
  const remove = Element.prototype.remove;
  Element.prototype.remove = function () {
    if (
      this instanceof HTMLStyleElement &&
      this.textContent?.includes("visibility: hidden !important")
    )
      probe.reveal = performance.now();
    remove.call(this);
  };
}

function observeFrames() {
  globalThis.__preloadFrames = [];
  function frame(at: number) {
    const target = document.getElementById("target");
    if (target)
      globalThis.__preloadFrames.push({
        at,
        hidden: getComputedStyle(target).display === "none",
        visible: getComputedStyle(target).visibility === "visible",
      });
    if (globalThis.__preloadFrames.length < 24) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
