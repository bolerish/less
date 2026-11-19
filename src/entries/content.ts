import { initializeLocale } from "~shared/locale/preference";
import { initializeTheme } from "~shared/theme/_model/theme";
import { initializeMotionPreference } from "~shared/motion/preference";
import "@bolerish/ui/global.css";
import { loadContentStyles } from "~shared/styles/content-styles";
import { restoreAllHiddenElements } from "~features/element-hiding";
import { releasePageScrollbar } from "~features/element-hiding/element-hide";
import { getSiteHidingEnabled } from "~features/hiding-preference";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createPagePanel } from "~features/page-panel/mount";
import { createHiddenItemPreview } from "~features/element-hiding/preview";
import {
  applyStoredHiding,
  invalidateRecordCache,
  setupNavigationListener,
  stopReapplyWatcher,
  watchAndReapplyHiding,
} from "~features/element-hiding/watcher";
import {
  getUndoCount,
  restoreLastHidden,
  reconcileUndoStack,
  selectionActive,
  startSelectionMode,
  stopSelectionMode,
  subscribeSelection,
} from "~features/selection/session";

const HIDING_KEY_PREFIX = "veil:hiding-enabled:";
let hidingEnabled = false;
let panel: ReturnType<typeof createPagePanel> | undefined;
let contentContext: ContentScriptContext;
const preview = createHiddenItemPreview();

export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_start",
  cssInjectionMode: "ui",
  main(ctx) {
    void bootstrap(ctx);
  },
});

async function bootstrap(ctx: ContentScriptContext): Promise<void> {
  contentContext = ctx;
  const origin = window.location.origin;
  const hidingKey = `${HIDING_KEY_PREFIX}${encodeURIComponent(origin)}`;

  ctx.onInvalidated(() => {
    releasePageScrollbar(document);
    stopReapplyWatcher();
    invalidateRecordCache();
    stopSelectionMode();
  });
  const domReady = new Promise<void>((resolve) => {
    if (document.readyState !== "loading") resolve();
    else ctx.addEventListener(document, "DOMContentLoaded", () => resolve(), { once: true });
  });
  const pending = new Map<string, () => void>();
  let pageGeneration = 0;
  function cancelPending(): void {
    pageGeneration++;
    for (const cancel of pending.values()) cancel();
  }
  ctx.onInvalidated(cancelPending);
  let preferenceRevision = 0;
  let preferencePromise: Promise<void> | undefined;
  function initializeHiding(): Promise<void> {
    preferencePromise ??= getSiteHidingEnabled(origin)
      .then((enabled) => {
        if (!ctx.isInvalid && preferenceRevision === 0) hidingEnabled = enabled;
        if (ctx.isInvalid) return;
        if (!hidingEnabled) document.getElementById("__veil_preload__")?.remove();
        else {
          void applyStoredHiding().then(() => {
            if (!ctx.isInvalid && hidingEnabled) watchAndReapplyHiding();
          });
        }
      })
      .catch((error) => {
        preferencePromise = undefined;
        throw error;
      });
    return preferencePromise;
  }
  let panelReady: Promise<void> | undefined;
  function preparePanel(): Promise<void> {
    if (panel) return Promise.resolve();
    panelReady ??= (async () => {
      await domReady;
      if (ctx.isInvalid) return;
      const disposers: (() => void)[] = [];
      try {
        for (const initialize of [
          initializeLocale,
          () => initializeTheme(true),
          initializeMotionPreference,
        ]) {
          // eslint-disable-next-line no-await-in-loop -- Stop and dispose before starting another initializer after invalidation.
          disposers.push(await initialize());
          if (ctx.isInvalid) return;
        }
        await loadContentStyles();
        await initializeHiding();
        if (ctx.isInvalid) return;
        panel = createPagePanel(() => {
          if (!hidingEnabled) throw new Error("Hiding is paused for this site.");
          startSelectionMode();
        }, preview);
        disposers.push(
          subscribeSelection((active) => {
            if (active && panel?.isOpen) panel.close();
            if (!active) panel?.selectionEnded();
          }),
        );
        ctx.onInvalidated(() => {
          for (const dispose of disposers) dispose();
          panel?.close(false);
        });
      } finally {
        if (!panel) for (const dispose of disposers) dispose();
      }
    })().catch((error) => {
      panelReady = undefined;
      throw error;
    });
    return panelReady;
  }
  void preparePanel().catch((error) => console.warn("[Less] panel initialization failed", error));

  setupNavigationListener(() => {
    cancelPending();
    void domReady.then(() => {
      if (!ctx.isInvalid) onSpaNavigation();
    });
  });
  void domReady.then(() => {
    if (!ctx.isInvalid)
      ctx.addEventListener(document, "keydown", handleGlobalKeyDown, { capture: true });
  });

  const onPreferenceChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local" || !(hidingKey in changes)) return;
    preferenceRevision++;
    preview.clear();
    hidingEnabled = changes[hidingKey].newValue !== false;
    if (hidingEnabled) {
      void domReady
        .then(() => {
          if (!ctx.isInvalid && hidingEnabled) return applyStoredHiding();
        })
        .then(() => {
          if (hidingEnabled && !ctx.isInvalid) watchAndReapplyHiding();
        });
    } else {
      stopSelectionMode();
      stopReapplyWatcher();
      invalidateRecordCache();
      document.getElementById("__veil_preload__")?.remove();
      restoreAllHiddenElements(document);
    }
  };
  browser.storage.onChanged.addListener(onPreferenceChanged);
  ctx.onInvalidated(() => browser.storage.onChanged.removeListener(onPreferenceChanged));

  const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
    message: unknown,
    sender,
    sendResponse,
  ) => {
    if (sender.id !== browser.runtime.id || !isMessage(message)) return;

    if (message.type === "CANCEL_PAGE_PANEL" && typeof message.requestId === "string") {
      pending.get(message.requestId)?.();
      sendResponse({ ok: true });
      return;
    }

    if (
      message.type === "TOGGLE_PAGE_PANEL" ||
      message.type === "TOGGLE_SELECTION" ||
      message.type === "SET_SELECTION_ENABLED"
    ) {
      if (
        (message.requestId !== undefined && typeof message.requestId !== "string") ||
        (message.url !== undefined && typeof message.url !== "string") ||
        (message.expiresAt !== undefined &&
          (typeof message.expiresAt !== "number" || !Number.isFinite(message.expiresAt)))
      ) {
        sendResponse({ ok: false });
        return;
      }
      const generation = pageGeneration;
      const url = window.location.href;
      const expiresAt =
        typeof message.expiresAt === "number" ? message.expiresAt : Date.now() + 5000;
      const requestId = message.requestId ?? crypto.randomUUID();
      let settled = false;
      const respond = (response: { ok: boolean; cancelled?: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(requestId);
        sendResponse(response);
      };
      const cancel = () => respond({ ok: false, cancelled: true });
      const timer = setTimeout(() => respond({ ok: false }), Math.max(0, expiresAt - Date.now()));
      pending.set(requestId, cancel);
      const valid = () =>
        !settled &&
        !ctx.isInvalid &&
        generation === pageGeneration &&
        window.location.href === url &&
        (!message.url || message.url === url) &&
        Date.now() < expiresAt;
      if (Date.now() >= expiresAt) respond({ ok: false });
      else if (!valid()) cancel();
      else
        void preparePanel()
          .then(() => {
            if (Date.now() >= expiresAt) {
              respond({ ok: false });
              return;
            }
            if (!valid() || !panel) {
              cancel();
              return;
            }
            if (message.type === "TOGGLE_SELECTION") {
              if (!panel.isOpen && hidingEnabled) {
                if (selectionActive) stopSelectionMode();
                else startSelectionMode();
              }
              respond({ ok: true });
              return;
            }
            if (message.type === "SET_SELECTION_ENABLED") {
              if (message.origin && message.origin !== window.location.origin) {
                respond({
                  ok: false,
                  error: "The current page changed. Try again on the current site.",
                });
              } else if (message.enabled && !hidingEnabled) {
                respond({
                  ok: false,
                  error: "Hiding is paused for this site. Enable it in the Less panel first.",
                });
              } else {
                if (message.enabled) startSelectionMode();
                else stopSelectionMode();
                respond({ ok: true });
              }
              return;
            }
            if (selectionActive) {
              panel.close();
              stopSelectionMode();
            }
            panel.toggle();
            respond({ ok: true });
          })
          .catch(() =>
            respond({
              ok: false,
              ...(message.type === "SET_SELECTION_ENABLED"
                ? { error: "Selection could not start on this page. Reload it and try again." }
                : {}),
            }),
          );
      return true;
    }

    if (message.type === "REFRESH_HIDING") {
      if (message.origin && message.origin !== window.location.origin) {
        sendResponse({ ok: false });
        return;
      }
      void domReady
        .then(initializeHiding)
        .then(() => {
          if (ctx.isInvalid) throw new Error("Content context invalidated");
          return refreshHiding(message.retainedIds);
        })
        .then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false }),
        );
      return true;
    }

    if (message.type === "GET_UNDO_COUNT") {
      sendResponse({ count: getUndoCount() });
      return true;
    }

    if (message.type === "RESTORE_LAST") {
      void restoreLastHidden().then(() => sendResponse({ count: getUndoCount() }));
      return true;
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));

  ctx.addEventListener(window, "pagehide", () => {
    cancelPending();
    panel?.close(false);
  });

  ctx.addEventListener(window, "pageshow", (event) => {
    if (!event.persisted) return;
    if (hidingEnabled) {
      stopReapplyWatcher();
      void applyStoredHiding().then(() => {
        if (hidingEnabled && !ctx.isInvalid) watchAndReapplyHiding();
      });
    }
  });

  await domReady;
  if (ctx.isInvalid) return;
  try {
    await initializeHiding();
  } catch (error) {
    console.warn("[Less] site preference initialization failed", error);
    return;
  }
}

function onSpaNavigation(): void {
  preview.clear();
  invalidateRecordCache();
  if (!hidingEnabled || contentContext.isInvalid) return;
  stopReapplyWatcher();
  void applyStoredHiding().then(() => {
    if (hidingEnabled && !contentContext.isInvalid) watchAndReapplyHiding();
  });
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (panel?.isOpen) return;
  if (event.shiftKey && event.ctrlKey) {
    if (event.key === "E" && import.meta.env.BROWSER !== "chrome") {
      event.preventDefault();
      if (event.repeat) return;
      if (!hidingEnabled) return;
      if (selectionActive) stopSelectionMode();
      else startSelectionMode();
      return;
    }
    if (event.key === "Z") {
      event.preventDefault();
      void restoreLastHidden();
      return;
    }
  }
}

async function refreshHiding(retainedIds?: string[]): Promise<void> {
  preview.clear();
  stopReapplyWatcher();
  invalidateRecordCache();
  document.getElementById("__veil_preload__")?.remove();
  restoreAllHiddenElements(document);
  if (retainedIds) reconcileUndoStack(retainedIds);
  if (hidingEnabled) {
    await applyStoredHiding(true);
    if (hidingEnabled && !contentContext.isInvalid) watchAndReapplyHiding();
  }
}

interface Message {
  type: string;
  enabled?: boolean;
  origin?: string;
  retainedIds?: string[];
  requestId?: string;
  url?: string;
  expiresAt?: number;
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "type" in value;
}
