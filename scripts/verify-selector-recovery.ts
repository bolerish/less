/* eslint-disable no-await-in-loop -- Fixtures share one extension and their mutations must stay ordered. */
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;
const directory = await mkdtemp(join(tmpdir(), "selector-recovery-"));
let context: BrowserContext | undefined;
const server = createServer((request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(
    `<html><body>${request.url === "/late" ? `<script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<section id="target">Hidden target</section>'),100)</script>` : '<section id="target">Hidden target</section>'}<section id="after">Remaining</section></body></html>`,
  );
});
try {
  await cp(resolve("dist/chrome-mv3"), join(directory, "extension"), { recursive: true });
  const contentPath = join(directory, "extension/content-scripts/content.js");
  await writeFile(
    contentPath,
    `(${instrumentContent.toString()})();\n${await readFile(contentPath, "utf8")}`,
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const browserCDP = await context.browser()!.newBrowserCDPSession();
  await browserCDP.send("Extensions.loadUnpacked", { path: join(directory, "extension") });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const cdp = await context.newCDPSession(page);
  let isolated = 0;
  cdp.on("Runtime.executionContextCreated", ({ context: created }) => {
    if (created.origin === `chrome-extension://${new URL(worker.url()).host}`)
      isolated = created.id;
  });
  await cdp.send("Runtime.enable");
  const database = async (operation: "seed" | "read" | "delete", records: object[] = []) =>
    worker.evaluate(
      async ({ operation, records }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("veil-db");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<unknown[]>((resolve, reject) => {
            const tx = db.transaction("records", operation === "read" ? "readonly" : "readwrite");
            const store = tx.objectStore("records");
            if (operation === "seed") {
              store.clear();
              for (const record of records) store.put(record);
            }
            if (operation === "delete") store.delete("one");
            const request = store.getAll();
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      },
      { operation, records },
    );
  const key = (path: string) =>
    `veil:css:page:${encodeURIComponent(origin)}:${encodeURIComponent(path)}:`;
  const fixture = (path: string, id = "one", site = origin) => ({
    id,
    createdAt: Date.now(),
    lastMatchedAt: null,
    matchFailureCount: 0,
    lastSuccessfulStrategy: null,
    scope: "page",
    pageContext: { origin: site, path, search: "" },
    target: { tagName: "SECTION", displayText: "Hidden target" },
    metadata: { baseUri: origin + path },
    matchPlan: ["CSS_SELECTOR", "UNIQUE_ATTRIBUTE"],
    matchInputs: { uniqueAttribute: { attributeName: "id", attributeValue: "target" } },
    cssSelector: "#old-target",
  });
  const cache = () =>
    worker.evaluate(async () => (await chrome.storage.local.get("veil:css:all"))["veil:css:all"]);
  const request = async (payload: object) => {
    const result = await cdp.send("Runtime.evaluate", {
      contextId: isolated,
      awaitPromise: true,
      returnByValue: true,
      expression: `new Promise((resolve,reject)=>{const p=chrome.runtime.connect({name:'content'});const timer=setTimeout(()=>{p.disconnect();reject(Error('response timeout'))},5000);p.onMessage.addListener(m=>{if(m.msgId===991){clearTimeout(timer);p.disconnect();resolve(m)}});p.postMessage(${JSON.stringify({ msgId: 991, type: "UPDATE_RECORD_CSS_SELECTOR", ...payload })})})`,
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value as { ok: boolean };
  };
  await page.goto(origin + "/initialize");
  await page
    .waitForFunction(() => document.getElementById("__veil_preload__") !== null)
    .catch(() => {});
  for (const path of ["/normal", "/late"]) {
    await database("seed", [fixture(path)]);
    await worker.evaluate(
      ({ key }) => chrome.storage.local.set({ "veil:css:all": { [key]: ["#old-target@@@1"] } }),
      { key: key(path) },
    );
    await page.goto(origin + path);
    await page.waitForFunction(() => {
      const el = document.getElementById("target");
      return el && getComputedStyle(el).display === "none";
    });
    await assert.doesNotReject(async () => {
      await page.waitForFunction(async () => {
        return (
          document.getElementById("__veil_preload__")?.textContent?.includes("target") ||
          document.querySelector('[id="target"]')?.getAttribute("style")?.includes("none")
        );
      });
      await worker.evaluate(() => chrome.storage.local.get(null));
    });
    // Poll the persisted public boundary, rather than relying on DOM hiding completion.
    await assertEventually(async () => {
      const records = (await database("read")) as { cssSelector: string }[];
      assert.notEqual(records[0].cssSelector, "#old-target");
      assert(
        await page.evaluate(
          (selector) => document.querySelector(selector)?.id === "target",
          records[0].cssSelector,
        ),
      );
      assert(!JSON.stringify(await cache()).includes("#old-target"));
    });
    if (path === "/normal") {
      await page.addInitScript(() => {
        const probe = { frames: 0, visible: 0, failures: 0 };
        Object.assign(globalThis, { __recoveryProbe: probe });
        function frame() {
          const target = document.getElementById("target");
          const after = document.getElementById("after");
          if (target && after) {
            probe.frames++;
            if (
              getComputedStyle(after).visibility === "visible" &&
              after.getBoundingClientRect().height > 0
            ) {
              probe.visible++;
              if (getComputedStyle(target).display !== "none") probe.failures++;
            }
          }
          if (probe.frames < 24) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      await page.reload();
      await page.waitForFunction(() => Reflect.get(globalThis, "__recoveryProbe").frames >= 24);
      const probe = await page.evaluate(() => Reflect.get(globalThis, "__recoveryProbe"));
      assert(probe.visible > 0);
      assert.equal(probe.failures, 0);
      const css = await page.locator("#__veil_preload__").textContent();
      assert(css?.includes("target") && !css.includes("#old-target"));
    }
    console.log(
      `PASS ${path}: fallback, DB/cache repair${path === "/normal" ? ", reload first rAF" : ", cached watcher"}`,
    );
  }
  for (const path of ["/ui-delay", "/startup-off", "/early-refresh"]) {
    await database("seed", [fixture(path)]);
    await worker.evaluate(
      ({ key, origin }) =>
        chrome.storage.local.set({
          "veil:css:all": { [key]: ["#old-target@@@1"] },
          [`veil:hiding-enabled:${encodeURIComponent(origin)}`]: true,
        }),
      { key: key(path), origin },
    );
    await page.goto(origin + path);
    await page.waitForFunction(() => document.documentElement.dataset.uiPending === "true");
    if (path === "/ui-delay") {
      await page.waitForFunction(() => document.getElementById("target")?.style.display === "none");
      assert.equal(await page.getAttribute("html", "data-ui-pending"), "true");
    } else {
      await page.waitForFunction(() => document.documentElement.dataset.readPending === "true");
      if (path === "/startup-off") {
        await worker.evaluate(
          (origin) =>
            chrome.storage.local.set({
              [`veil:hiding-enabled:${encodeURIComponent(origin)}`]: false,
            }),
          origin,
        );
      } else {
        const response = await worker.evaluate(async (origin) => {
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            try {
              return await chrome.tabs.sendMessage(
                tab.id!,
                { type: "REFRESH_HIDING", origin },
                { frameId: 0 },
              );
            } catch {
              /* Welcome tabs have no content receiver. */
            }
          }
          throw new Error("No fixture content receiver");
        }, origin);
        assert.equal(response.ok, true);
      }
      await page.waitForFunction(() => document.documentElement.dataset.readPending === "false");
    }
    await page.waitForFunction(() => document.documentElement.dataset.uiPending === "false");
    if (path === "/startup-off") {
      await page.evaluate(() =>
        document.getElementById("target")!.setAttribute("data-changed", "yes"),
      );
      await page.waitForTimeout(350);
      assert.equal(
        await page.locator("#target").evaluate((el) => (el as HTMLElement).style.display),
        "",
      );
    } else
      await page.waitForFunction(() => document.getElementById("target")?.style.display === "none");
    console.log(`PASS ${path}: native storage/style initialization race`);
  }
  await page.goto(origin + "/late");
  await page.waitForFunction(() => document.getElementById("target") !== null);
  await database("seed", [fixture("/late"), fixture("/late", "foreign", "https://other.test")]);
  const baseline = await database("read");
  const baselineCache = await cache();
  for (const payload of [
    { id: "one", expectedCssSelector: "#old-target", cssSelector: 5 },
    { id: "one", expectedCssSelector: "#conflict", cssSelector: "#target" },
    { id: "foreign", expectedCssSelector: "#old-target", cssSelector: "#target" },
    { id: "deleted", expectedCssSelector: "#old-target", cssSelector: "#target" },
  ])
    assert.equal((await request(payload)).ok, false);
  assert.deepEqual(await database("read"), baseline);
  assert.deepEqual(await cache(), baselineCache);
  console.log("PASS malformed, CAS conflict, cross-site, missing record rejection");
  await database("seed", [fixture("/late"), fixture("/late", "two")]);
  assert.equal(
    (await request({ id: "one", expectedCssSelector: "#old-target", cssSelector: "#target" })).ok,
    true,
  );
  assert(JSON.stringify(await cache()).includes("#old-target"));
  assert.equal((await request({ type: "DELETE_RECORD", id: "one" })).ok, true);
  assert(JSON.stringify(await cache()).includes("#old-target"));
  assert.equal(
    (await request({ id: "one", expectedCssSelector: "#target", cssSelector: "#after" })).ok,
    false,
  );
  assert.equal(
    ((await database("read")) as { id: string }[]).some((r) => r.id === "one"),
    false,
  );
  console.log("PASS shared selector survives update and deletion; deleted record stays deleted");
  const before = await database("read");
  const beforeCache = await cache();
  await worker.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.assign(globalThis, {
      __restorePut: () => {
        IDBObjectStore.prototype.put = original;
      },
    });
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === "records" && value.id === "two")
        throw new Error("Injected fixture put failure");
      return original.call(this, value, ...args);
    };
  });
  try {
    assert.equal(
      (await request({ id: "two", expectedCssSelector: "#old-target", cssSelector: "#after" })).ok,
      false,
    );
  } finally {
    await worker.evaluate("globalThis.__restorePut()");
  }
  assert.deepEqual(await database("read"), before);
  assert.deepEqual(await cache(), beforeCache);
  console.log("PASS IDB put failure restores cache and preserves DB");
} finally {
  await context?.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
async function assertEventually(check: () => Promise<void>) {
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function instrumentContent() {
  if (!["/ui-delay", "/startup-off", "/early-refresh"].includes(location.pathname)) return;
  const mark = (key: string, value: string) => {
    document.documentElement.dataset[key] = value;
  };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    if (String(args[0]).endsWith("content-scripts/content.css")) {
      mark("uiPending", "true");
      await new Promise((done) => setTimeout(done, 400));
      const response = await nativeFetch(...args);
      mark("uiPending", "false");
      return response;
    }
    return nativeFetch(...args);
  };
  const get = chrome.storage.local.get.bind(chrome.storage.local);
  let delayed = false;
  chrome.storage.local.get = (async (keys: string | string[] | null) => {
    const value = await get(keys);
    if (
      location.pathname !== "/ui-delay" &&
      !delayed &&
      Array.isArray(keys) &&
      keys.some((key) => key.startsWith("veil:hiding-enabled:"))
    ) {
      delayed = true;
      mark("readPending", "true");
      await new Promise((done) => setTimeout(done, 260));
      mark("readPending", "false");
    }
    return value;
  }) as typeof chrome.storage.local.get;
}
