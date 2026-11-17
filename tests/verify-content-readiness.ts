/* eslint-disable no-await-in-loop -- Each scenario settles before the next transition. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";

const source = ts.transpileModule(await readFile("src/entries/content.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const drain = async () => {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
};
function fixture() {
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  const invalidated: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let listener: (...args: any[]) => unknown;
  let navigate = () => {};
  let toggles = 0;
  let styles = 0;
  let subscriptions = 0;
  let failStyles = false;
  let failPreference = false;
  let appliedHiding = 0;
  let releaseStyles: (() => void) | undefined;
  let deferStyles = false;
  let definition: { runAt: string; main: (ctx: unknown) => void };
  const ctx = {
    isInvalid: false,
    onInvalidated: (callback: () => void) => {
      invalidated.push(callback);
      return () => {};
    },
    addEventListener: (
      target: EventTarget,
      name: string,
      callback: EventListener,
      options?: AddEventListenerOptions,
    ) => target.addEventListener(name, callback, options),
  };
  const document = Object.assign(documentEvents, {
    readyState: "loading",
    getElementById: () => null,
  });
  const window = Object.assign(windowEvents, {
    location: { origin: "https://test.example", href: "https://test.example/one" },
  });
  const subscribe = async () => {
    subscriptions++;
    return () => {
      subscriptions--;
    };
  };
  const stub: Record<string, unknown> = {
    initializeLocale: subscribe,
    initializeTheme: subscribe,
    initializeMotionPreference: subscribe,
    loadContentStyles: async () => {
      styles++;
      if (deferStyles)
        await new Promise<void>((resolve) => {
          releaseStyles = resolve;
        });
      if (failStyles) throw new Error("stylesheet unavailable");
    },
    getSiteHidingEnabled: async () => {
      if (failPreference) throw new Error("storage unavailable");
      return true;
    },
    createPagePanel: () => ({
      toggle: () => {
        toggles++;
      },
      close: () => {},
      selectionEnded: () => {},
    }),
    createHiddenItemPreview: () => ({ clear: () => {} }),
    subscribeSelection: () => () => {},
    setupNavigationListener: (callback: () => void) => {
      navigate = callback;
    },
    applyStoredHiding: async () => {
      appliedHiding++;
    },
    watchAndReapplyHiding: () => {},
    stopReapplyWatcher: () => {},
    invalidateRecordCache: () => {},
    releasePageScrollbar: () => {},
    stopSelectionMode: () => {},
    startSelectionMode: () => {},
    restoreAllHiddenElements: () => {},
    reconcileUndoStack: () => {},
    getUndoCount: () => 0,
  };
  vm.runInNewContext(source, {
    require: () => stub,
    exports: {},
    document,
    window,
    console: { warn() {} },
    crypto: { randomUUID },
    defineContentScript: (value: typeof definition) => {
      definition = value;
      return value;
    },
    browser: {
      runtime: {
        id: "test",
        onMessage: {
          addListener: (value: typeof listener) => {
            listener = value;
          },
          removeListener() {},
        },
      },
      storage: { onChanged: { addListener() {}, removeListener() {} } },
    },
    setTimeout: (callback: () => void) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  assert.equal(definition!.runAt, "document_start");
  definition!.main(ctx);
  const send = (message: Record<string, unknown>) =>
    new Promise<any>((resolve) => {
      listener!(message, { id: "test" }, resolve);
    });
  return {
    send,
    timers,
    ready: () => {
      document.readyState = "interactive";
      document.dispatchEvent(new Event("DOMContentLoaded"));
    },
    navigate: () => {
      window.location.href += "/next";
      navigate();
    },
    hide: () => window.dispatchEvent(new Event("pagehide")),
    invalidate: () => {
      ctx.isInvalid = true;
      for (const callback of invalidated) callback();
    },
    failStyles: (value: boolean) => {
      failStyles = value;
    },
    failPreference: (value: boolean) => {
      failPreference = value;
    },
    deferStyles: () => {
      deferStyles = true;
    },
    releaseStyles: () => releaseStyles!(),
    get toggles() {
      return toggles;
    },
    get styles() {
      return styles;
    },
    get subscriptions() {
      return subscriptions;
    },
    get appliedHiding() {
      return appliedHiding;
    },
  };
}
{
  const f = fixture();
  assert.equal(
    (await f.send({ type: "GET_UNDO_COUNT" })).count,
    0,
    "listener available before DOM ready",
  );
  const response = f.send({ type: "TOGGLE_PAGE_PANEL" });
  await drain();
  assert.equal(f.toggles, 0);
  assert.equal(f.styles, 0, "DOM-dependent initialization waits for parser");
  f.ready();
  assert.equal((await response).ok, true);
  assert.equal(f.toggles, 1);
  assert.equal(f.timers.size, 0);
  f.invalidate();
  assert.equal(f.subscriptions, 0);
}
for (const action of ["navigate", "hide", "invalidate", "expire", "cancel"] as const) {
  const f = fixture();
  const response = f.send({ type: "TOGGLE_PAGE_PANEL", requestId: "pending" });
  if (action === "expire") for (const timer of f.timers.values()) timer();
  else if (action === "cancel") await f.send({ type: "CANCEL_PAGE_PANEL", requestId: "pending" });
  else f[action]();
  const result = await response;
  assert.equal(result.ok, false, action);
  assert.equal(result.cancelled, action === "expire" ? undefined : true, action);
  f.ready();
  await drain();
  assert.equal(f.toggles, 0, `${action}: no late toggle after initialization`);
  assert.equal(f.timers.size, 0);
  f.invalidate();
  assert.equal(f.subscriptions, 0);
}
{
  const f = fixture();
  f.failStyles(true);
  f.ready();
  await drain();
  assert.equal(f.subscriptions, 0, "failed preparation disposes installed subscriptions");
  f.failStyles(false);
  assert.equal((await f.send({ type: "TOGGLE_PAGE_PANEL" })).ok, true);
  assert.equal(f.styles, 2, "new click retries failed stylesheet load");
  assert.equal(f.toggles, 1);
  f.invalidate();
  assert.equal(f.subscriptions, 0);
}
{
  const f = fixture();
  f.failPreference(true);
  f.ready();
  await drain();
  assert.equal(f.appliedHiding, 0);
  f.failPreference(false);
  assert.equal((await f.send({ type: "TOGGLE_PAGE_PANEL" })).ok, true);
  assert.equal(f.appliedHiding, 1, "recovered preference also applies saved hiding");
  f.invalidate();
  assert.equal(f.subscriptions, 0);
}
{
  const f = fixture();
  f.deferStyles();
  f.ready();
  await drain();
  f.invalidate();
  f.releaseStyles();
  await drain();
  assert.equal(f.subscriptions, 0, "invalidation during async preparation disposes subscriptions");
  assert.equal(f.toggles, 0);
}
{
  const f = fixture();
  assert.equal((await f.send({ type: "TOGGLE_PAGE_PANEL", expiresAt: "bad" })).ok, false);
  const expired = await f.send({ type: "TOGGLE_PAGE_PANEL", expiresAt: Date.now() - 1 });
  assert.equal(expired.ok, false);
  assert.equal(expired.cancelled, undefined);
  f.ready();
  await drain();
  assert.equal(f.toggles, 0);
  f.invalidate();
}
console.log(
  "PASS content readiness: early listener, DOM gate, navigation/pagehide/invalidation/expiry/cancel, retry and subscription cleanup",
);
