// Build first. Uses the actual installed extension, IndexedDB, storage, and content scripts.
// node scripts/verify-sidepanel.mjs --playwright /path/to/playwright/index.mjs --chromium /path/to/Chromium
/* eslint-disable no-await-in-loop */
import assert from "node:assert/strict";
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
    screenshot: { type: "string" },
  },
});
assert(values.playwright && values.chromium, "Pass --playwright and --chromium");
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const directory = await mkdtemp(join(tmpdir(), "veil-sidepanel-"));
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
  res.end(
    '<!doctype html><html lang="en"><head><title>Veil fixture</title><style>section{height:100px;margin:16px;padding:16px;background:#eee}body{font:16px sans-serif}</style></head><body><h1>Fixture</h1><section id="one">First distraction</section><section id="two">Second distraction</section><p>Keep this content</p></body></html>',
  );
});
let context;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const extension = resolve(values.build);
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
  assert.equal(manifest.side_panel.default_path, "sidepanel.html");
  assert.equal(manifest.minimum_chrome_version, "116");
  assert(manifest.permissions.includes("sidePanel"));
  assert(
    !manifest.permissions.includes("tabs"),
    "Existing webNavigation permission should suffice",
  );
  const html = await readFile(join(extension, "sidepanel.html"), "utf8");
  const cssPath = html.match(/rel="stylesheet"[^>]+href="([^"]+)"/)[1];
  const css = await readFile(join(extension, cssPath), "utf8");
  assert(
    css.includes("--veil-color-bg-canvas:var(--"),
    "Panel aliases must reference package tokens rather than emit a second token definition",
  );
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    viewport: { width: 1000, height: 800 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionURL = `chrome-extension://${new URL(worker.url()).host}`;
  const site = await context.newPage();
  await site.goto(`${origin}/fixture`);
  await site.keyboard.press("Control+Shift+E");
  await site.locator("#one").click();
  await site.keyboard.press("Escape");
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("#one")).display === "none",
  );
  console.log("Selected and hid first fixture item");
  assert.equal(
    (await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })))
      .length,
    0,
    "Install and hiding must not auto-open the panel",
  );
  const popup = await context.newPage();
  await site.bringToFront();
  await popup.goto(`${extensionURL}/popup.html`);
  await popup.getByRole("button", { name: "Manage hidden items" }).waitFor();
  await popup.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent === "Manage hidden items",
      ).disabled,
  );
  const popupClosed = popup.waitForEvent("close");
  await popup.getByRole("button", { name: "Manage hidden items" }).click();
  await popupClosed;
  const nativeContexts = await worker.evaluate(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] });
      if (contexts.length) return contexts;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return [];
  });
  assert.equal(nativeContexts.length, 1, "User gesture must create a native side-panel document");
  console.log(
    "Native sidePanel.open accepted; rendered side-panel contexts:",
    nativeContexts.length,
  );
  console.log(
    "Panel targets",
    context.pages().map((page) => page.url()),
  );
  // Inspect the same built document in a background extension tab as well.
  // Load the same built document in a background extension tab for rendered UI checks.
  const panel = await context.newPage();
  await site.bringToFront();
  await panel.goto(`${extensionURL}/sidepanel.html`);
  await panel
    .getByRole("heading", { name: `127.0.0.1:${server.address().port}`, exact: true })
    .waitFor();
  await panel.getByRole("heading", { name: "First distraction", exact: true }).waitFor();
  console.log("Actual DB record is visible in built panel");
  console.log(
    "panel styles",
    await panel.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      button: getComputedStyle(document.querySelector("button")).height,
      width: document.documentElement.scrollWidth,
    })),
  );
  await panel.setViewportSize({ width: 375, height: 720 });
  if (values.screenshot) await panel.screenshot({ path: resolve(values.screenshot) });
  await panel.getByRole("button", { name: "Restore First distraction", exact: true }).click();
  await panel.getByRole("heading", { name: "Nothing hidden on this site" }).waitFor();
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("#one")).display !== "none",
  );
  await site.reload();
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("#one")).display !== "none",
  );
  console.log("Individual restore removed DB and CSS hiding and survived reload");

  // Save two items through the real selection gesture, then revisit in another tab.
  await hide(site, "#one");
  await hide(site, "#two");
  await panel.getByRole("heading", { name: "Second distraction", exact: true }).waitFor();
  const sibling = await context.newPage();
  await sibling.goto(`${origin}/fixture`);
  await sibling.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#one")).display === "none" &&
      getComputedStyle(document.querySelector("#two")).display === "none",
  );
  await panel.getByRole("heading", { name: "First distraction", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Restore First distraction", exact: true }).click();
  await Promise.all(
    [site, sibling].map((page) =>
      page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector("#one")).display !== "none" &&
          getComputedStyle(document.querySelector("#two")).display === "none",
      ),
    ),
  );
  console.log("Restoration reached all open site tabs and retained the other hidden item");

  // Force one real API call to fail. Confirm UI error and unchanged persisted state.
  await worker.evaluate(() => {
    const native = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = (...args) => {
      if (Object.hasOwn(args[0], "veil:css:all")) {
        chrome.storage.local.set = native;
        return Promise.reject(new Error("Injected cache write failure"));
      }
      return native(...args);
    };
  });
  await panel.getByRole("button", { name: "Restore Second distraction", exact: true }).click();
  await panel.getByRole("alert").filter({ hasText: "could not read or save" }).waitFor();
  await panel.getByRole("button", { name: "Retry loading" }).click();
  await panel.getByRole("heading", { name: "Second distraction", exact: true }).waitFor();
  assert.equal(await site.locator("#two").evaluate((el) => getComputedStyle(el).display), "none");
  await sibling.reload();
  await sibling.waitForFunction(
    () => getComputedStyle(document.querySelector("#two")).display === "none",
  );
  console.log("Cache write failure is visible; DB and preload rule preserved");

  const cacheBefore = await worker.evaluate(() => chrome.storage.local.get("veil:css:all"));
  await worker.evaluate(() => {
    const native = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function () {
      IDBObjectStore.prototype.delete = native;
      throw new Error("Injected DB deletion failure");
    };
  });
  await panel.getByRole("button", { name: "Restore Second distraction", exact: true }).click();
  await panel.getByRole("alert").filter({ hasText: "could not read or save" }).waitFor();
  assert.deepEqual(
    await worker.evaluate(() => chrome.storage.local.get("veil:css:all")),
    cacheBefore,
    "Failed DB mutation must roll back its CSS cache",
  );
  await panel.getByRole("button", { name: "Retry loading" }).click();
  await panel.getByRole("heading", { name: "Second distraction", exact: true }).waitFor();
  console.log("DB deletion failure is visible and CSS cache rollback verified");

  await worker.evaluate(() => {
    globalThis.__veilReadMethods = {
      getAll: IDBIndex.prototype.getAll,
      openCursor: IDBIndex.prototype.openCursor,
    };
    IDBIndex.prototype.getAll = function () {
      throw new Error("Injected DB read failure");
    };
    IDBIndex.prototype.openCursor = function () {
      throw new Error("Injected DB read failure");
    };
  });
  await panel.getByRole("button", { name: "Refresh", exact: true }).click();
  await panel.getByRole("alert").filter({ hasText: "could not read or save" }).waitFor();
  await worker.evaluate(() => {
    Object.assign(IDBIndex.prototype, globalThis.__veilReadMethods);
  });
  await panel.getByRole("button", { name: "Retry loading" }).click();
  await panel.getByRole("alert").waitFor({ state: "hidden" });
  console.log("DB read failure and retry verified without a false empty state");

  await panel.getByRole("button", { name: "Reset this site…", exact: true }).click();
  assert.equal(await panel.evaluate(() => document.activeElement?.textContent), "Cancel");
  await panel.keyboard.press("Enter");
  await panel.getByRole("heading", { name: "Second distraction", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Reset this site…", exact: true }).click();
  await worker.evaluate(() => {
    const native = chrome.tabs.sendMessage.bind(chrome.tabs);
    chrome.tabs.sendMessage = (...args) => {
      if (args[1]?.type === "REFRESH_HIDING") {
        chrome.tabs.sendMessage = native;
        return Promise.reject(new Error("Injected tab delivery failure"));
      }
      return native(...args);
    };
  });
  await panel.getByRole("button", { name: "Reset site", exact: true }).click();
  await panel.getByRole("button", { name: "Retry page sync", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Retry page sync", exact: true }).click();
  await panel
    .getByRole("button", { name: "Retry page sync", exact: true })
    .waitFor({ state: "hidden" });
  await panel.getByRole("heading", { name: "Nothing hidden on this site" }).waitFor();
  await Promise.all(
    [site, sibling].map((page) =>
      page.waitForFunction(
        () => getComputedStyle(document.querySelector("#two")).display !== "none",
      ),
    ),
  );
  await sibling.reload();
  await sibling.waitForFunction(
    () => getComputedStyle(document.querySelector("#two")).display !== "none",
  );
  console.log("Reset confirmation, cancellation, DB/cache/DOM restore and reload verified");

  // Fail saving a new item: it must visibly recover and never enter the undo stack.
  await worker.evaluate(() => {
    const native = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = (...args) => {
      if (Object.hasOwn(args[0], "veil:css:all")) {
        chrome.storage.local.set = native;
        return Promise.reject(new Error("Injected save failure"));
      }
      return native(...args);
    };
  });
  await sibling.keyboard.press("Control+Shift+E");
  await sibling.locator("#one").click();
  await waitForAXText(sibling, "Could not save this item");
  await sibling.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#one")).display !== "none" &&
      getComputedStyle(document.querySelector("#one")).opacity !== "0",
  );
  await sibling.keyboard.press("Escape");
  await panel.getByRole("button", { name: "Refresh", exact: true }).click();
  await panel.getByRole("heading", { name: "Nothing hidden on this site" }).waitFor();
  await sibling.reload();
  await sibling.waitForFunction(
    () => getComputedStyle(document.querySelector("#one")).display !== "none",
  );
  console.log("Failed selection save visibly recovers and does not leave a DB record");

  // Keyboard tab navigation uses the actual bolerish Tabs primitive.
  await panel.getByRole("tab", { name: "Hidden items", exact: true }).focus();
  await panel.keyboard.press("ArrowRight");
  await panel.keyboard.press("Enter");
  await panel.getByRole("heading", { name: "Updates", exact: true }).waitFor();
  await panel.getByText("Next update · Not yet released", { exact: true }).waitFor();
  await panel.getByRole("tab", { name: "Updates", exact: true }).focus();
  await panel.keyboard.press("ArrowLeft");
  await panel.keyboard.press("Enter");
  await panel.getByRole("heading", { name: "Nothing hidden on this site" }).waitFor();
  console.log("Updates and arrow-key navigation verified");

  // A fresh origin has no activeTab grant. The existing webNavigation permission is enough.
  const other = await context.newPage();
  await other.goto(`http://localhost:${server.address().port}/other`);
  await panel
    .getByRole("heading", { name: `localhost:${server.address().port}`, exact: true })
    .waitFor();
  await site.bringToFront();
  await panel
    .getByRole("heading", { name: `127.0.0.1:${server.address().port}`, exact: true })
    .waitFor();
  await other.bringToFront();
  await other.goto("about:blank");
  await panel.getByRole("heading", { name: "Open a website", exact: true }).waitFor();
  await other.close();
  await site.bringToFront();
  await panel
    .getByRole("heading", { name: `127.0.0.1:${server.address().port}`, exact: true })
    .waitFor();
  console.log(
    "Tab switching, new origin without activeTab, unsupported page and tab close verified",
  );

  await site.locator("#one").evaluate((element) => {
    element.textContent = "LongDistractionWithoutBreaks".repeat(12);
  });
  await hide(site, "#one");
  await panel.getByRole("button", { name: /^Restore LongDistraction/ }).waitFor();
  for (const width of [320, 375, 768]) {
    await panel.setViewportSize({ width, height: 720 });
    for (const colorScheme of ["light", "dark"]) {
      await panel.emulateMedia({ colorScheme });
      assert(
        await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `No horizontal clipping at ${width}/${colorScheme}`,
      );
      const colors = await panel.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        foreground: getComputedStyle(document.body).color,
      }));
      assert.notEqual(colors.background, "rgba(0, 0, 0, 0)");
      assert.notEqual(colors.background, colors.foreground);
    }
  }
  await panel.setViewportSize({ width: 160, height: 360 });
  assert(
    await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Reflow at the effective width of a 320px panel at 200%",
  );
  console.log("320/375/768px, light/dark and 200% effective-width reflow verified");
  console.log("PASS: actual extension sidepanel workflows");
} finally {
  if (context) await context.close();
  await new Promise((done) => server.close(done));
  await rm(directory, { recursive: true, force: true });
}

async function hide(page, selector) {
  await page.keyboard.press("Control+Shift+E");
  await page.locator(selector).click();
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (selector) => getComputedStyle(document.querySelector(selector)).display === "none",
    selector,
  );
}

async function waitForAXText(page, text) {
  const session = await context.newCDPSession(page);
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { nodes } = await session.send("Accessibility.getFullAXTree");
      if (nodes.some((node) => String(node.name?.value).includes(text))) return;
      await page.waitForTimeout(20);
    }
    assert.fail(`Accessible message was not announced: ${text}`);
  } finally {
    await session.detach();
  }
}
