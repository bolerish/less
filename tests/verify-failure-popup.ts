/* eslint-disable no-await-in-loop -- Action, navigation and popup lifetime are sequential. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright-core";
declare const chrome: typeof import("wxt/browser").browser;

const { values } = parseArgs({
  options: {
    chromium: {
      type: "string",
      default: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
    build: { type: "string", default: "dist/chrome-mv3" },
  },
});
const directory = await mkdtemp(join(tmpdir(), "less-failure-"));
let releaseParser = () => {};
let notifyParserBlocked = () => {};
const parserBlocked = new Promise<void>((done) => {
  notifyParserBlocked = done;
});
const server = createServer((req, res) => {
  if (req.url === "/parser-gate.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    releaseParser = () => res.end("");
    notifyParserBlocked();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  if (req.url === "/slow-parser") {
    res.end(
      '<!doctype html><html lang="en"><title>Slow page</title><body><h1>Reading page</h1><script src="/parser-gate.js"></script><p>Parsed later</p></body></html>',
    );
    return;
  }
  res.end(
    '<!doctype html><html lang="en"><title>Less fixture</title><body><h1>Reading page</h1><p>Keep reading</p></body></html>',
  );
});
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const context = await chromium.launchPersistentContext(join(directory, "profile"), {
  executablePath: values.chromium,
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"],
});
context.setDefaultTimeout(8000);
const cdp = await context.browser()!.newBrowserCDPSession();
try {
  console.log("Browser:", context.browser()!.version());
  const preinstall = await context.newPage();
  await preinstall.goto(`${origin}/before-install`);
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => chrome.runtime.getManifest());
  const manifest = JSON.parse(await readFile(join(values.build, "manifest.json"), "utf8"));
  assert(!manifest.action.default_popup);
  assert.equal(manifest.minimum_chrome_version, "116");
  assert(!manifest.permissions.includes("tabs"));

  async function action(page: Page) {
    await page.bringToFront();
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const target = targetInfos.find((t) => t.url === page.url());
    assert(target);
    await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
  }
  async function popup() {
    let targetId = "";
    await waitFor(async () => {
      const { targetInfos } = await cdp.send("Target.getTargets");
      targetId =
        targetInfos.find((t) => t.url.startsWith(`chrome-extension://${id}/failure.html?`))
          ?.targetId ?? "";
      return targetId;
    }, "real action popup target");
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: false });
    let nextId = 0;
    async function send<T = unknown>(method: string, params = {}): Promise<T> {
      const commandId = ++nextId;
      return new Promise((done, reject) => {
        const receive = (event: { sessionId: string; message: string }) => {
          if (event.sessionId !== sessionId) return;
          const response = JSON.parse(event.message);
          if (response.id !== commandId) return;
          cdp.off("Target.receivedMessageFromTarget", receive);
          if (response.error) reject(new Error(JSON.stringify(response.error)));
          else done(response.result as T);
        };
        cdp.on("Target.receivedMessageFromTarget", receive);
        void cdp
          .send("Target.sendMessageToTarget", {
            sessionId,
            message: JSON.stringify({ id: commandId, method, params }),
          })
          .catch(reject);
      });
    }
    const evaluate = async (expression: string) =>
      (
        await send<{ result: { value: unknown } }>("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        })
      ).result.value;
    return { targetId, send, evaluate };
  }
  const slowPage = await context.newPage();
  try {
    await slowPage.goto(`${origin}/slow-parser`, { waitUntil: "commit" });
    await parserBlocked;
    assert.equal(await slowPage.evaluate(() => document.readyState), "loading");
    // Click before waiting for any extension receiver or DOM readiness.
    await action(slowPage);
    const earlyResponse = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id!, { type: "GET_UNDO_COUNT" }, { frameId: 0 });
    });
    assert.equal(typeof earlyResponse.count, "number", "receiver exists during HTML parsing");
    releaseParser();
    await slowPage.locator("[data-less-panel]").waitFor({ state: "attached" });
    assert(
      !(await cdp.send("Target.getTargets")).targetInfos.some((target) =>
        target.url.startsWith(`chrome-extension://${id}/failure.html?`),
      ),
      "early click opens panel without a failure popup",
    );
    await action(slowPage);
    await slowPage.locator("[data-less-panel]").waitFor({ state: "detached" });
    console.log(
      "PASS toolbar click during HTML parsing opens once after readiness, next click closes",
    );
  } finally {
    releaseParser();
    await slowPage.close();
  }
  const page = await context.newPage();
  await page.goto(`${origin}/normal`);
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        try {
          return (await chrome.tabs.sendMessage(tab.id!, { type: "GET_UNDO_COUNT" })) !== undefined;
        } catch {
          return false;
        }
      }),
    "content receiver",
  );
  await action(page);
  await page.locator("[data-less-panel]").waitFor({ state: "attached" });
  assert.equal(page.url(), `${origin}/normal`);
  console.log("PASS normal toolbar opens the in-page panel");
  const protectedPage = await context.newPage();
  await protectedPage.goto("chrome://settings");
  const tabCount = (await worker.evaluate(() => chrome.tabs.query({}))).length;
  await action(protectedPage);
  const failure = await popup();
  await waitFor(
    async () =>
      (await failure.evaluate('document.querySelector("#message").textContent')) ===
      (await worker.evaluate(() => chrome.i18n.getMessage("panel_failure_protected"))),
    "protected message",
  );
  assert.equal(protectedPage.url(), "chrome://settings/");
  assert.equal((await worker.evaluate(() => chrome.tabs.query({}))).length, tabCount);
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return (await chrome.action.getPopup({ tabId: tab.id })) === "";
      }),
    "one-shot popup setting cleared while visible",
  );
  assert(
    (await cdp.send("Target.getTargets")).targetInfos.some((t) => t.targetId === failure.targetId),
  );
  const screenshot = await failure.send<{ data: string }>("Page.captureScreenshot");
  await writeFile("/tmp/less-failure-protected.png", Buffer.from(screenshot.data, "base64"));
  console.log(
    "PASS protected settings popup stays visible after setPopup cleanup; no redirect/new tab",
  );
  await failure.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    async () =>
      !(await cdp.send("Target.getTargets")).targetInfos.some(
        (t) => t.targetId === failure.targetId,
      ),
    "Escape closes failure popup",
  );
  await page.bringToFront();
  await page.keyboard.press("Escape");
  await action(page);
  await page.locator("[data-less-panel]").waitFor({ state: "attached" });
  console.log("PASS popup close then normal action still opens panel");
  await action(preinstall);
  const missing = await popup();
  await waitFor(
    async () =>
      (await missing.evaluate('document.querySelector("#message").textContent')) ===
      (await worker.evaluate(() => chrome.i18n.getMessage("panel_failure_reload"))),
    "pre-install receiver reload guidance",
  );
  assert.equal(preinstall.url(), `${origin}/before-install`);
  await missing.evaluate("window.close()");
  await preinstall.reload();
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        try {
          return await chrome.tabs.sendMessage(t.id!, { type: "GET_UNDO_COUNT" });
        } catch {
          return false;
        }
      }),
    "receiver after reload",
  );
  await action(preinstall);
  await preinstall.locator("[data-less-panel]").waitFor({ state: "attached" });
  console.log(
    "PASS actual pre-install missing receiver, reload guidance and successful retry after page reload",
  );

  await cdp.send("Extensions.uninstall", { id });
  const nextWorker = context.waitForEvent("serviceworker");
  const reloaded = await cdp.send("Extensions.loadUnpacked", { path: resolve(values.build) });
  assert.equal(reloaded.id, id);
  worker = await nextWorker;
  await worker.evaluate(() => chrome.runtime.getManifest());
  await action(preinstall);
  const updated = await popup();
  await waitFor(
    async () =>
      (await updated.evaluate('document.querySelector("#message").textContent')) ===
      (await worker.evaluate(() => chrome.i18n.getMessage("panel_failure_reload"))),
    "updated extension receiver guidance",
  );
  await updated.evaluate("window.close()");
  await preinstall.reload();
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        try {
          return await chrome.tabs.sendMessage(t.id!, { type: "GET_UNDO_COUNT" });
        } catch {
          return false;
        }
      }),
    "receiver after extension update reload",
  );
  await action(preinstall);
  await preinstall.locator("[data-less-panel]").waitFor({ state: "attached" });
  console.log(
    "PASS actual extension unload/reload invalidates receiver; failure popup recovers after page reload",
  );

  await page.reload();
  // Runtime API failures are isolated fixtures; the toolbar and popup still run in Chrome.
  await worker.evaluate(
    `globalThis.__lessOriginalSend = chrome.tabs.sendMessage; globalThis.__lessOriginalOpen = chrome.action.openPopup; chrome.tabs.sendMessage = async () => ({ok:false});`,
  );
  await action(page);
  const generic = await popup();
  await waitFor(
    async () =>
      (await generic.evaluate('document.querySelector("#message").textContent')) ===
      (await worker.evaluate(() => chrome.i18n.getMessage("panel_failure_generic"))),
    "generic failure guidance",
  );
  await generic.evaluate("window.close()");
  await worker.evaluate(
    `chrome.action.openPopup = async () => {throw new Error("fixture rejection")}`,
  );
  const pagesBefore = (await worker.evaluate(() => chrome.tabs.query({}))).length;
  await action(page);
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        return (
          (await chrome.action.getBadgeText({ tabId: t.id })) === "!" &&
          (await chrome.action.getPopup({ tabId: t.id })) === ""
        );
      }),
    "rejected open cleans popup",
  );
  assert.equal((await worker.evaluate(() => chrome.tabs.query({}))).length, pagesBefore);
  await worker.evaluate(`chrome.action.openPopup = undefined`);
  await action(page);
  await waitFor(
    () =>
      worker.evaluate(async () => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        return (await chrome.action.getPopup({ tabId: t.id })) === "";
      }),
    "missing openPopup leaves no configured popup",
  );
  await worker.evaluate(
    `chrome.tabs.sendMessage = globalThis.__lessOriginalSend; chrome.action.openPopup = globalThis.__lessOriginalOpen;`,
  );
  console.log(
    "PASS real Chrome with generic/rejected/missing API fixtures: no tab fallback or persistent popup",
  );

  const documentPage = await context.newPage();
  for (const locale of ["en", "ko", "ja", "es", "zh_CN"]) {
    const catalog = JSON.parse(
      await readFile(join(values.build, "_locales", locale, "messages.json"), "utf8"),
    );
    await worker.evaluate((locale) => chrome.storage.local.set({ "less:locale": locale }), locale);
    for (const theme of ["light", "dark"] as const) {
      await documentPage.emulateMedia({ colorScheme: theme });
      for (const reason of ["protected", "reload", "generic"]) {
        await documentPage.setViewportSize({ width: 320, height: 300 });
        await documentPage.goto(`chrome-extension://${id}/failure.html?reason=${reason}`);
        await documentPage
          .getByRole("status")
          .filter({ hasText: catalog[`panel_failure_${reason}`].message })
          .waitFor();
        const layout = await documentPage.evaluate(() => {
          const p = document.querySelector("p")!;
          return {
            width: document.documentElement.scrollWidth,
            lang: document.documentElement.lang,
            background: getComputedStyle(document.body).backgroundColor,
            size: parseFloat(getComputedStyle(p).fontSize),
            bottom: p.getBoundingClientRect().bottom,
            controls: document.querySelectorAll("button,a,input").length,
          };
        });
        assert.equal(layout.width, 320);
        assert.equal(layout.lang, locale.replace("_", "-"));
        assert.equal(
          layout.background,
          theme === "light" ? "rgb(255, 255, 255)" : "rgb(17, 17, 17)",
        );
        assert(layout.size >= 14 && layout.bottom < 300);
        assert.equal(layout.controls, 0);
        await documentPage.keyboard.press("Tab");
        if (reason === "reload")
          await documentPage.screenshot({ path: `/tmp/less-failure-${locale}-${theme}.png` });
      }
    }
  }
  console.log(
    "PASS all three failure documents in five locales at 320px, light/dark, readable text, semantic status and keyboard Escape on real popup",
  );
  await documentPage.close();
} finally {
  releaseParser();
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
async function waitFor(check: () => Promise<unknown>, label: string) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`Timed out: ${label}`);
}
