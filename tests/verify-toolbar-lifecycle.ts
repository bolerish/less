/* eslint-disable no-await-in-loop -- Each fixture transition must settle before the next. */
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

type Listener = (...args: any[]) => unknown;
const source = await readFile("dist/chrome-mv3/background.js", "utf8");
const firefoxSource = await readFile("dist/firefox-mv2/background.js", "utf8");
for (const [engine, bundle] of [
  ["Chrome", source],
  ["Firefox MV2", firefoxSource],
]) {
  const listeners = new Map<string, Listener[]>();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let sent = 0;
  let getFrame = async (tabId: number) => ({ url: tabs.get(tabId)!.url });
  const event = (name: string) => ({
    addListener: (fn: Listener) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    removeListener: (fn: Listener) =>
      listeners.set(
        name,
        (listeners.get(name) ?? []).filter((listener) => listener !== fn),
      ),
  });
  const emit = (name: string, ...args: unknown[]) =>
    listeners.get(name)?.forEach((fn) => fn(...args));
  const tabs = new Map<number, { id: number; windowId: number; url: string; active: boolean }>();
  tabs.set(1, { id: 1, windowId: 1, url: "https://one.test/", active: true });
  tabs.set(2, { id: 2, windowId: 1, url: "https://two.test/", active: false });
  tabs.set(3, { id: 3, windowId: 2, url: "https://three.test/", active: true });
  const popup = new Map<number, string>();
  const badges = new Map<number, string>();
  const titles = new Map<number, string>();
  const opened: string[] = [];
  let focusedWindow = 1;
  let receiver: () => Promise<unknown> = async () => ({ ok: true });
  let open: () => Promise<void> = async () => {
    const tab = [...tabs.values()].find((t) => t.active && t.windowId === focusedWindow)!;
    opened.push(popup.get(tab.id)!);
  };
  const action = {
    onClicked: event("click"),
    getPopup: async ({ tabId }: { tabId: number }) => popup.get(tabId) ?? "",
    setPopup: async ({ tabId, popup: path }: { tabId: number; popup: string }) => {
      popup.set(tabId, path);
    },
    setBadgeText: async ({ tabId, text }: { tabId: number; text: string }) => {
      badges.set(tabId, text);
    },
    setTitle: async ({ tabId, title }: { tabId: number; title: string }) => {
      titles.set(tabId, title);
    },
    openPopup: async () => open(),
  };
  const browser = {
    ...(engine === "Chrome" ? { action } : { browserAction: action }),
    runtime: {
      id: "test",
      getURL: (path: string) => `moz-extension://test${path}`,
      onMessage: event("message"),
      onInstalled: event("install"),
      onStartup: event("startup"),
      onConnect: event("connect"),
    },
    tabs: {
      query: async (query: { active?: boolean; windowId?: number }) =>
        [...tabs.values()].filter(
          (t) =>
            (!query.active || t.active) &&
            (query.windowId === undefined || t.windowId === query.windowId),
        ),
      sendMessage: async (_tabId: number, message: { type: string }) => {
        if (message.type === "CANCEL_PAGE_PANEL") return { ok: true };
        sent++;
        return receiver();
      },
      onActivated: event("activate"),
      onUpdated: event("update"),
      onRemoved: event("remove"),
    },
    windows: {
      get: async (id: number) => ({ focused: id === focusedWindow }),
      onFocusChanged: event("focus"),
    },
    i18n: { getUILanguage: () => "en-US" },
    storage: { local: { get: async () => ({}) }, onChanged: event("storage") },
    webNavigation: {
      onBeforeNavigate: event("beforeNavigate"),
      onCommitted: { addListener() {} },
      onHistoryStateUpdated: event("history"),
      getFrame: async ({ tabId }: { tabId: number }) => getFrame(tabId),
    },
  };
  const load = () =>
    vm.runInNewContext(
      bundle,
      {
        browser,
        console,
        URL,
        URLSearchParams,
        crypto: { randomUUID },
        AbortController,
        setTimeout: (callback: () => void) => {
          const id = ++nextTimer;
          timers.set(id, callback);
          return id;
        },
        clearTimeout: (id: number) => timers.delete(id),
      },
      { timeout: 2000 },
    );
  load();
  const click = (id = 1) => emit("click", { ...tabs.get(id)! });
  const drain = async () => {
    for (let i = 0; i < 8; i++) await new Promise((done) => setImmediate(done));
  };
  await drain();
  click();
  await drain();
  assert.equal(opened.length, 0);
  assert.equal(badges.get(1), "");
  const firstSent = sent;
  click();
  click();
  click();
  await drain();
  assert.equal(sent - firstSent, 3, "each rapid successful click toggles exactly once");
  assert.equal(timers.size, 0, "completed requests release timers");
  const beforeMatchingEvents = sent;
  click();
  emit("activate", { tabId: 1, windowId: 1 });
  emit("focus", 1);
  await drain();
  assert.equal(
    sent,
    beforeMatchingEvents + 1,
    "matching activation/focus cannot cancel this tab's click",
  );
  let releaseFrame: (() => void) | undefined;
  getFrame = async (tabId) => {
    await new Promise<void>((done) => {
      releaseFrame = done;
    });
    return { url: tabs.get(tabId)!.url };
  };
  receiver = () => new Promise(() => {});
  getFrame = async (tabId) => ({ url: tabs.get(tabId)!.url });
  click();
  await drain();
  emit("update", 1, { status: "loading" });
  await drain();
  assert.equal(timers.size, 1, "same-document loading preserves pending request");
  emit("beforeNavigate", { tabId: 1, frameId: 1, url: tabs.get(1)!.url });
  await drain();
  assert.equal(timers.size, 1, "subframe navigation preserves pending request");
  emit("beforeNavigate", { tabId: 1, frameId: 0, url: tabs.get(1)!.url });
  await drain();
  assert.equal(timers.size, 0, "top-level same-URL reload cancels pending request");
  receiver = async () => ({ ok: true });
  getFrame = async (tabId) => {
    await new Promise<void>((done) => {
      releaseFrame = done;
    });
    return { url: tabs.get(tabId)!.url };
  };
  const beforeNavigation = sent;
  click();
  await drain();
  tabs.get(1)!.url = "https://one.test/next";
  emit("update", 1, { url: tabs.get(1)!.url });
  releaseFrame!();
  await drain();
  assert.equal(
    sent,
    beforeNavigation,
    "navigation during frame lookup cannot deliver stale toggle",
  );
  getFrame = async (tabId) => ({ url: tabs.get(tabId)!.url });
  tabs.get(1)!.url = "https://one.test/";
  receiver = () => new Promise(() => {});
  click();
  await drain();
  assert.equal(timers.size, 1);
  for (const timer of timers.values()) timer();
  await drain();
  assert.equal(timers.size, 0, "timeout releases timer without waiting for hung receiver");
  receiver = async () => ({ ok: true });
  const beforeRetry = sent;
  click();
  await drain();
  assert.equal(sent, beforeRetry + 1, "next click proceeds after hung response timeout");
  receiver = () => new Promise(() => {});
  click();
  await drain();
  tabs.get(1)!.url = "https://one.test/after-hang";
  emit("update", 1, { url: tabs.get(1)!.url });
  await drain();
  assert.equal(timers.size, 0, "navigation cancels a hung response without waiting for it");
  receiver = async () => ({ ok: true });
  const afterCancelledNavigation = sent;
  click();
  await drain();
  assert.equal(
    sent,
    afterCancelledNavigation + 1,
    "new document click bypasses cancelled response",
  );
  tabs.get(1)!.url = "https://one.test/";
  receiver = async () => {
    throw new Error("Could not establish connection. Receiving end does not exist.");
  };
  click();
  await drain();
  assert(opened.at(-1)?.includes("reason=reload"));
  assert.equal(popup.get(1), "");
  assert.equal(
    titles.get(1),
    JSON.parse(await readFile("public/_locales/en/messages.json", "utf8")).panel_failure_reload
      .message,
  );
  receiver = async () => ({ ok: false });
  click();
  await drain();
  assert(opened.at(-1)?.includes("reason=generic"));
  tabs.get(1)!.url = "chrome://settings/";
  receiver = async () => {
    throw new Error("No receiver");
  };
  click();
  await drain();
  assert(opened.at(-1)?.includes("reason=protected"));
  tabs.get(1)!.url = "https://chromewebstore.google.com/detail/test";
  click();
  await drain();
  assert(opened.at(-1)?.includes("reason=protected"));
  tabs.get(1)!.url = "https://one.test/";
  const oldOpen = action.openPopup;
  action.openPopup = undefined!;
  const count = opened.length;
  click();
  await drain();
  assert.equal(opened.length, count);
  assert.equal(popup.get(1), "");
  action.openPopup = oldOpen;
  open = async () => {
    throw new Error("User gesture required / unsupported");
  };
  click();
  await drain();
  assert.equal(popup.get(1), "");
  open = async () => {
    const tab = [...tabs.values()].find((t) => t.active && t.windowId === focusedWindow)!;
    opened.push(popup.get(tab.id)!);
  };
  let finish: ((value: unknown) => void) | undefined;
  receiver = () =>
    new Promise((done) => {
      finish = done;
    });
  click();
  await drain();
  tabs.get(1)!.active = false;
  tabs.get(2)!.active = true;
  emit("activate", { tabId: 2, windowId: 1 });
  finish!({ ok: false });
  await drain();
  assert.equal(opened.length, count);
  // The inactive tab's late failure cannot overwrite/open on the newly clicked tab.
  receiver = async () => {
    throw new Error("Receiving end does not exist");
  };
  click(2);
  await drain();
  assert(opened.at(-1)?.includes("tab=2"));
  assert.equal(popup.get(1), "");
  assert.equal(popup.get(2), "");
  receiver = () =>
    new Promise((done) => {
      finish = done;
    });
  click(2);
  await drain();
  tabs.get(2)!.url = "https://two.test/new";
  emit("update", 2, { url: "https://two.test/new" });
  finish!({ ok: false });
  await drain();
  assert.equal(popup.get(2), "");
  assert.equal(badges.get(2), "");
  click(2);
  await drain();
  focusedWindow = 2;
  emit("focus", 2);
  finish!({ ok: false });
  await drain();
  assert.equal(popup.get(2), "");
  receiver = async () => {
    throw new Error("Receiving end does not exist");
  };
  click(3);
  click(3);
  click(3);
  await drain();
  assert(opened.at(-1)?.includes("tab=3"));
  assert.equal(popup.get(3), "");
  receiver = () =>
    new Promise((done) => {
      finish = done;
    });
  click(3);
  await drain();
  tabs.delete(3);
  emit("remove", 3);
  finish!({ ok: false });
  await drain();
  assert.equal(popup.get(3), "");
  // Simulate worker termination: only browser-owned settings survive.
  popup.set(1, "moz-extension://test/failure.html?reason=reload&tab=1&request=stale");
  listeners.clear();
  load();
  await drain();
  assert.equal(popup.get(1), "");
  console.log(
    `PASS ${engine} API fixture: reasons, missing/rejected openPopup, stale failure, tab/window switches, navigation/close, rapid clicks and restart recovery`,
  );
}
