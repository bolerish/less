/* eslint-disable no-await-in-loop -- Verify sequential hot reloads and UI mounts. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { createServer as createWxtServer } from "wxt";

declare const chrome: typeof import("wxt/browser").browser;
type DOMNode = {
  nodeName: string;
  backendNodeId: number;
  children?: DOMNode[];
  shadowRoots?: DOMNode[];
};

const server = await createWxtServer({
  webExt: { disabled: true },
  dev: { server: { host: "127.0.0.1", port: 31847 } },
});
const fixture = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>Less HMR fixture</title><p>Reading page</p>");
});
const directory = await mkdtemp(join(tmpdir(), "less-dev-"));
const panelPath = "src/features/page-panel/Panel.tsx";
const original = await readFile(panelPath, "utf8");
let context: BrowserContext | undefined;
let changed = false;
try {
  await server.start();
  const paths = [
    "/src/entries/welcome/index.html",
    "/src/entries/welcome/App.tsx",
    "/src/features/page-panel/Panel.tsx",
    "/virtual:stylex.css",
  ];
  const responses = await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(new URL(path, server.origin));
      const source = await response.text();
      assert.equal(response.status, 200, `${path}: ${source.slice(0, 300)}`);
      assert(!source.includes("vite-error-overlay"), `${path}: no transform error`);
      return source;
    }),
  );
  assert(responses[0]?.includes("Welcome to Less"));
  assert(/react.*compiler.runtime/.test(responses[2] ?? ""), "React Compiler transforms Panel");
  assert(responses[3]?.includes("--less-app-background") && responses[3]?.includes("--x"));
  await new Promise<void>((done) => fixture.listen(0, "127.0.0.1", done));
  const address = fixture.address();
  assert(address && typeof address !== "string");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", {
    path: resolve("dist/chrome-mv3-dev"),
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  await waitFor(
    () =>
      worker.evaluate(async () =>
        (await chrome.tabs.query({})).some((tab) => tab.url?.endsWith("/welcome.html")),
      ),
    "install welcome",
  );
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("DEV PAGE", msg.text());
  });
  page.on("pageerror", (error) => console.error("DEV PAGEERROR", error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.bringToFront();
  const session = await context.newCDPSession(page);
  async function ready() {
    return worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        return !!(await chrome.tabs.sendMessage(tab.id!, { type: "GET_UNDO_COUNT" }));
      } catch {
        return false;
      }
    });
  }
  async function open() {
    await page.bringToFront();
    await waitFor(ready, "dev content receiver");
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const target = targetInfos.find((target) => target.url === page.url());
    assert(target);
    await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
    await page.locator("[data-less-panel]").waitFor({ state: "attached" });
  }
  async function padding() {
    const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
    const dialog = findDialog(root);
    if (!dialog) return null;
    const { object } = await session.send("DOM.resolveNode", {
      backendNodeId: dialog.backendNodeId,
    });
    const result = await session.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration:
        "function(){return getComputedStyle(this.querySelector('.panel')).paddingLeft}",
      returnByValue: true,
    });
    return result.result.value;
  }
  await open();
  await waitFor(async () => (await padding()) === "16px", "initial extracted shadow CSS");
  const replacement = original.replace(
    "paddingInline: spacingVars.space4",
    "paddingInline: spacingVars.space5",
  );
  assert.notEqual(replacement, original, "fixture changes an existing consumed StyleX value");
  changed = true;
  await writeFile(panelPath, replacement);
  await waitFor(
    async () => (await page.locator("[data-less-panel]").count()) === 0,
    "hot reload invalidates old shadow mount",
  );
  await open();
  await waitFor(
    async () => (await padding()) === "20px",
    "rebuilt CSS reaches newly mounted closed shadow",
  );
  await writeFile(panelPath, original);
  changed = false;
  await waitFor(
    async () => (await page.locator("[data-less-panel]").count()) === 0,
    "restore invalidates modified UI",
  );
  await open();
  await waitFor(async () => (await padding()) === "16px", "restored CSS reaches shadow");
  console.log(
    "PASS dev transforms and real Chrome content hot reload: shadow cleanup, extracted CSS change and source restoration",
  );
} finally {
  if (changed) await writeFile(panelPath, original);
  await context?.close();
  await server.stop();
  if (fixture.listening) await new Promise<void>((done) => fixture.close(() => done()));
  await rm(directory, { recursive: true, force: true });
}
function findDialog(node: DOMNode): DOMNode | undefined {
  if (node.nodeName === "DIALOG") return node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const result = findDialog(child);
    if (result) return result;
  }
}
async function waitFor(check: () => unknown | Promise<unknown>, label: string) {
  const until = Date.now() + 20000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 80));
  }
  assert.fail(label);
}
