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
  settled: number;
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
    ...["off", "reset", "current-update", "pagehide", "invalidated", "navigation", "off-on"].map(
      (name) => `late-${name}`,
    ),
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
    const settleDeadline = Date.now() + 10000;
    for (;;) {
      assert(Date.now() < settleDeadline, `${scenario}: initial reads did not settle`);
      const settled = await cdp.send("Runtime.evaluate", {
        contextId: isolatedContext,
        expression: "globalThis.__preloadProbe?.settled === 2",
        returnByValue: true,
      });
      if (settled.result.value) break;
      await page.waitForTimeout(10);
    }
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
    } else if (["timeout", "preference-timeout"].includes(scenario)) {
      assert(probe.css > probe.reveal, `${scenario}: valid late CSS applied after reveal`);
      assert(rendered.frames.some((frame) => frame.visible && frame.hidden));
    } else if (scenario !== "invalid-selector") {
      if (scenario.includes("navigation"))
        assert(!rendered.css?.includes("#target"), `${scenario}: stale target CSS`);
      else {
        assert.equal(probe.css, 0, `${scenario}: stale CSS must never be attached`);
        assert.equal(rendered.css, undefined);
      }
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
      assert(probe.changes[0] <= probe.css, `${scenario}: change observed before application`);
    }
    console.log(`PASS ${scenario}`);
  }
  const historyCache = {
    [`veil:css:page:${encodeURIComponent(origin)}:%2Fhistory-start:`]: ["#target@@@1"],
    [`veil:css:page:${encodeURIComponent(origin)}:%2Fhistory-end:`]: ["#after@@@1"],
  };
  await worker.evaluate(
    (cache) => chrome.storage.local.set({ "veil:css:all": cache }),
    historyCache,
  );
  await page.goto(`${origin}/history-start`);
  await page.waitForFunction(() =>
    document.getElementById("__veil_preload__")?.textContent?.includes("#target"),
  );
  await page.bringToFront();
  const { targetInfos } = await browserCDP.send("Target.getTargets", { filter: [{ type: "tab" }] });
  const targetInfo = targetInfos.find((target) => target.url === page.url());
  assert(targetInfo, "History fixture tab exists");
  await browserCDP.send("Extensions.triggerAction", {
    id: new URL(worker.url()).host,
    targetId: targetInfo.targetId,
  });
  await worker.evaluate(() => {
    const storage: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
    } = chrome.storage.local;
    const get = storage.get.bind(storage);
    let delayed = false;
    storage.get = async (keys) => {
      const value = await get(keys);
      if (keys === "veil:css:all" && !delayed) {
        delayed = true;
        await new Promise<void>((resume) => {
          Object.assign(globalThis, { __resumeHistoryRead: resume });
        });
      }
      return value;
    };
  });
  await page.evaluate(() => history.pushState(null, "", "/history-end"));
  await worker.evaluate(async () => {
    const deadline = Date.now() + 5000;
    while (typeof Reflect.get(globalThis, "__resumeHistoryRead") !== "function") {
      if (Date.now() >= deadline) throw new Error("History cache read did not start");
      await new Promise((done) => setTimeout(done, 10));
    }
  });
  await worker.evaluate(async (cache) => {
    await chrome.storage.local.set({
      "veil:css:all": { ...cache, "veil:css:site:https%3A%2F%2Fother.test": ["#other@@@1"] },
    });
    const resume: unknown = Reflect.get(globalThis, "__resumeHistoryRead");
    if (typeof resume !== "function") throw new Error("Missing pending history read");
    resume();
  }, historyCache);
  await page.waitForFunction(() => {
    const css = document.getElementById("__veil_preload__")?.textContent;
    return css?.includes("#after") && !css.includes("#target");
  });
  console.log("PASS history CSS refresh survives an unrelated cache write");
  await worker.evaluate(
    (origin) =>
      chrome.storage.local.set({
        [`veil:hiding-enabled:${encodeURIComponent(origin)}`]: false,
      }),
    origin,
  );
  await page.evaluate(() => history.pushState(null, "", "/history-start"));
  await page.waitForFunction(() => !document.getElementById("__veil_preload__"));
  console.log("PASS history navigation keeps hiding OFF");
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
  const rawScenario = location.pathname.slice(1);
  const late = rawScenario.startsWith("late-");
  const scenario = late ? rawScenario.slice(5) : rawScenario;
  const probe: Probe = {
    entry: performance.now(),
    root: document.documentElement !== null,
    readyState: document.readyState,
    reads: [],
    settled: 0,
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
  let calls = 0;
  storage.get = function (keys) {
    const initial = calls++ < 2;
    return get(keys)
      .then(async (value) => {
        probe.reads.push(performance.now());
        if (scenario === "preference-timeout" && Array.isArray(keys))
          await new Promise((done) => setTimeout(done, 260));
        if (keys !== "veil:css:all") return value;
        try {
          if (late) await new Promise((done) => setTimeout(done, 180));
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
          if (next || scenario === "off" || scenario === "off-on" || scenario === "remove-cache") {
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
            if (scenario === "off-on")
              await chrome.runtime.sendMessage({
                type: "PRELOAD_VERIFY_WRITE",
                values: { [`veil:hiding-enabled:${encodeURIComponent(location.origin)}`]: true },
              });
          }
          if (scenario === "timeout") await new Promise((done) => setTimeout(done, 260));
          if (scenario === "pagehide") window.dispatchEvent(new Event("pagehide"));
          if (scenario === "invalidated")
            document.dispatchEvent(
              new CustomEvent(`${chrome.runtime.id}:preload:wxt:content-script-started`, {
                detail: { contentScriptName: "preload", messageId: "verification-replacement" },
              }),
            );
          if (scenario === "navigation") {
            const original = location.href;
            history.replaceState(null, "", "/navigated");
            if (late) {
              await new Promise((done) => setTimeout(done, 20));
              history.replaceState(null, "", original);
            }
          }
          if (late) await new Promise((done) => setTimeout(done, 80));
        } catch (error) {
          probe.error = String(error);
        }
        probe.released = true;
        return value;
      })
      .finally(() => {
        if (initial) probe.settled++;
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
