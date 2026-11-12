// Build first. Requires an existing Playwright install and extension-capable Chromium:
// node scripts/measure-preload.mjs --playwright /path/to/playwright/index.mjs \
//   --chromium /path/to/Chromium --runs 20 --output /tmp/veil-preload.json
// Reloads, incremental rule saves, and trace stream reads must run in order.
/* eslint-disable no-await-in-loop */
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    playwright: { type: "string" },
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
    runs: { type: "string", default: "20" },
    output: { type: "string" },
    trace: { type: "string" },
  },
});
const runs = Number(values.runs);
assert(Number.isInteger(runs) && runs > 0, "--runs must be a positive integer");
const { chromium } = await import(
  values.playwright ? pathToFileURL(resolve(values.playwright)).href : "playwright"
);
const directory = await mkdtemp(join(tmpdir(), "veil-preload-measure-"));
const extension = join(directory, "extension");
const samples = [];
const errors = [];
let context;
let server;

try {
  await cp(resolve(values.build), extension, { recursive: true });
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
  const preload = manifest.content_scripts.find((entry) =>
    entry.js.includes("content-scripts/preload.js"),
  );
  assert.equal(preload?.run_at, "document_start");
  const preloadPath = join(extension, "content-scripts/preload.js");
  // Instrument a temporary build copy. All reads still use the real Chrome API.
  await writeFile(
    preloadPath,
    `(${instrumentPreload.toString()})();\n${await readFile(preloadPath, "utf8")}`,
  );

  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end(`<!doctype html><html><head><meta charset="utf-8">
      <style>body{margin:0;font:16px system-ui}section{height:120px;padding:12px;box-sizing:border-box}
      #block1{background:#f66}#block2{background:#6b6}#block3{background:#66f;visibility:visible}
      #after{margin:0;height:120px;background:#eee}</style>
      <script>(${observePage.toString()})()</script></head><body>
      <section id="block1">Block one</section><section id="block2">Block two</section>
      <section id="block3">Block three</section><h1 id="after">Remaining content</h1>
      </body></html>`);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}/fixture`;
  const preference = `veil:hiding-enabled:${encodeURIComponent(origin)}`;
  const cacheKey = `veil:css:page:${encodeURIComponent(origin)}:%2Ffixture:`;
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    viewport: { width: 800, height: 640 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker =
    context.serviceWorkers().find((worker) => worker.url().endsWith("/background.js")) ??
    (await context.waitForEvent("serviceworker", {
      predicate: (worker) => worker.url().endsWith("/background.js"),
      timeout: 10_000,
    }));
  // Confirm API access in the actual extension process; no page-injected mocks.
  await worker.evaluate(
    () =>
      new Promise((done, reject) => {
        const deadline = Date.now() + 5_000;
        function ready() {
          if (globalThis.chrome?.storage?.local) done();
          else if (Date.now() >= deadline)
            reject(new Error("Native extension storage API unavailable"));
          else setTimeout(ready, 10);
        }
        ready();
      }),
  );
  assert.equal(await worker.evaluate(() => typeof chrome.storage.local.get), "function");
  for (const existing of context.pages()) await existing.close();
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const version = await cdp.send("Browser.getVersion");
  let extensionContext;
  cdp.on("Runtime.executionContextCreated", ({ context: created }) => {
    if (created.origin === `chrome-extension://${new URL(worker.url()).host}`)
      extensionContext = created.id;
  });
  await cdp.send("Runtime.enable");

  async function measure(name, count, enabled) {
    // Leave the selection UI's outgoing document behind before timing revisits.
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__veilPageMeasurement.frames.length >= 12);
    for (let iteration = 0; iteration < runs; iteration++) {
      const tracing = Boolean(values.trace && name === "saved-3" && iteration === 0);
      if (tracing) {
        await cdp.send("Tracing.start", {
          categories: "devtools.timeline,disabled-by-default-devtools.screenshot,blink.user_timing",
          transferMode: "ReturnAsStream",
        });
      }
      await page.goto(url, { waitUntil: "load" });
      await page.waitForFunction(() => window.__veilPageMeasurement.frames.length >= 12);
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: "JSON.stringify(globalThis.__veilPreloadMeasurement)",
        contextId: extensionContext,
        returnByValue: true,
      });
      const preload = JSON.parse(result.value);
      const render = await page.evaluate(() => window.__veilPageMeasurement);
      const firstVisible = render.frames.find((frame) => frame.visibility === "visible");
      const css = preload.events.find((event) => event.type === "css");
      const hold = preload.events.find((event) => event.type === "hold");
      const reveal = preload.events.find((event) => event.type === "reveal");
      const fcp = render.paints.find((paint) => paint.name === "first-contentful-paint")?.at;
      assert(firstVisible, `${name}: page did not reveal`);
      assert(hold && reveal, `${name}: missing hold/reveal instrumentation`);
      assert.equal(preload.events[0].readyState, "loading");
      for (const frame of render.frames.filter((frame) => frame.visibility === "visible")) {
        assert.equal(frame.afterTop, (3 - (enabled ? count : 0)) * 120);
        for (let block = 0; block < 3; block++) {
          assert.equal(frame.displays[block] === "none", enabled && block < count);
        }
      }
      if (enabled && count > 0) {
        assert(css && css.at <= reveal.at, `${name}: reveal preceded saved CSS`);
        assert(fcp !== undefined && css.at <= fcp, `${name}: FCP preceded saved CSS`);
      } else assert(!css, `${name}: unexpected preload CSS`);
      samples.push({
        scenario: name,
        iteration,
        traced: tracing,
        entryMs: preload.events[0].at,
        holdMs: reveal.at - hold.at,
        cssMs: css?.at ?? null,
        revealMs: reveal.at,
        fcpMs: fcp ?? null,
        firstVisibleFrameMs: firstVisible.at,
        firstVisibleTop: firstVisible.afterTop,
        cls: render.shifts.reduce((total, shift) => total + shift.value, 0),
        reads: preload.reads,
        frames: render.frames,
      });
      if (tracing) {
        const complete = new Promise((done) => cdp.once("Tracing.tracingComplete", done));
        await cdp.send("Tracing.end");
        const { stream } = await complete;
        let trace = "";
        for (;;) {
          const chunk = await cdp.send("IO.read", { handle: stream });
          trace += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
          if (chunk.eof) break;
        }
        await cdp.send("IO.close", { handle: stream });
        await writeFile(resolve(values.trace), trace);
      }
    }
    console.log(`PASS ${name}: ${runs} revisits`);
  }

  await measure("empty", 0, true);
  for (let count = 1; count <= 3; count++) {
    // Save through Veil's real keyboard/pointer/port/IndexedDB/cache path.
    await page.keyboard.press("Control+Shift+E");
    await page.locator("[data-veil-ui]").waitFor({ state: "attached" });
    await page.locator(`#block${count}`).click();
    await worker.evaluate(
      ({ key, count }) =>
        new Promise((done, reject) => {
          const timer = setTimeout(() => {
            chrome.storage.onChanged.removeListener(changed);
            reject(new Error("Saved CSS cache did not update"));
          }, 10_000);
          function check(cache) {
            if (Object.values(cache ?? {}).flat().length !== count) return;
            clearTimeout(timer);
            chrome.storage.onChanged.removeListener(changed);
            done();
          }
          function changed(changes, area) {
            if (area === "local" && key in changes) check(changes[key].newValue);
          }
          chrome.storage.onChanged.addListener(changed);
          void chrome.storage.local.get(key).then((result) => check(result[key]));
        }),
      { key: "veil:css:all", count },
    );
    await page.keyboard.press("Escape");
    const cache = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
    assert.equal(cache["veil:css:all"][cacheKey].length, count);
    await measure(`saved-${count}`, count, true);
  }
  await worker.evaluate((key) => chrome.storage.local.set({ [key]: false }), preference);
  await measure("off", 3, false);
  assert.deepEqual(errors, []);
  const report = {
    browser: version,
    runsPerScenario: runs,
    storage: "real chrome.storage.local; rules saved through selection UI",
    environment: "headless; fresh temporary profile; local no-store static fixture; warm revisits",
    observationWindow: "first 12 animation frames after parsing the fixture",
    instrumentation:
      "temporary preload copy wraps native storage promises and DOM insertion/removal",
    samples,
    tracedSamplesExcludedFromSummary: samples.filter((sample) => sample.traced).length,
    summary: summarize(samples.filter((sample) => !sample.traced)),
  };
  if (values.output) await writeFile(resolve(values.output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ browser: version.product, summary: report.summary }, null, 2));
} finally {
  await context?.close();
  await new Promise((done) => (server ? server.close(done) : done()));
  await rm(directory, { recursive: true, force: true });
}

function instrumentPreload() {
  const measurement = {
    events: [{ type: "entry", at: performance.now(), readyState: document.readyState }],
    reads: [],
  };
  globalThis.__veilPreloadMeasurement = measurement;
  const get = chrome.storage.local.get.bind(chrome.storage.local);
  chrome.storage.local.get = function (keys) {
    const read = { keys, start: performance.now() };
    measurement.reads.push(read);
    return get(keys).then((value) => {
      read.end = performance.now();
      return value;
    });
  };
  const append = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    const result = append.call(this, child);
    if (
      child.id === "__veil_preload__" ||
      child.textContent?.includes("visibility: hidden !important")
    ) {
      measurement.events.push({ type: child.id ? "css" : "hold", at: performance.now() });
    }
    return result;
  };
  const remove = Element.prototype.remove;
  Element.prototype.remove = function () {
    const hold =
      this.tagName === "STYLE" && this.textContent.includes("visibility: hidden !important");
    const result = remove.call(this);
    if (hold) measurement.events.push({ type: "reveal", at: performance.now() });
    return result;
  };
}

function observePage() {
  const measurement = { paints: [], shifts: [], frames: [] };
  window.__veilPageMeasurement = measurement;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      measurement.paints.push({ name: entry.name, at: entry.startTime });
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput)
        measurement.shifts.push({ at: entry.startTime, value: entry.value });
    }
  }).observe({ type: "layout-shift", buffered: true });
  function frame(at) {
    const after = document.getElementById("after");
    if (after) {
      measurement.frames.push({
        at,
        visibility: getComputedStyle(after).visibility,
        afterTop: after.getBoundingClientRect().top,
        displays: [1, 2, 3].map(
          (number) => getComputedStyle(document.getElementById(`block${number}`)).display,
        ),
      });
    }
    if (measurement.frames.length < 12) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function summarize(samples) {
  const result = {};
  for (const scenario of new Set(samples.map((sample) => sample.scenario))) {
    const group = samples.filter((sample) => sample.scenario === scenario);
    const statistics = (numbers) => {
      const sorted = numbers.filter((number) => number !== null).sort((a, b) => a - b);
      if (sorted.length === 0) return null;
      return {
        min: sorted[0],
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted.at(-1),
      };
    };
    result[scenario] = {
      count: group.length,
      holdMs: statistics(group.map((sample) => sample.holdMs)),
      fcpMs: statistics(group.map((sample) => sample.fcpMs)),
      cssFromEntryMs: statistics(
        group.map((sample) => (sample.cssMs === null ? null : sample.cssMs - sample.entryMs)),
      ),
      nativeReadMs: statistics(
        group.flatMap((sample) => sample.reads.map((read) => read.end - read.start)),
      ),
      cssReadMs: statistics(
        group.map((sample) => {
          const read = sample.reads.find((read) => read.keys === "veil:css:all");
          return read ? read.end - read.start : null;
        }),
      ),
      preferenceReadMs: statistics(
        group.map((sample) => {
          const read = sample.reads.find((read) => Array.isArray(read.keys));
          return read ? read.end - read.start : null;
        }),
      ),
      maxCLS: Math.max(...group.map((sample) => sample.cls)),
    };
  }
  return result;
}
