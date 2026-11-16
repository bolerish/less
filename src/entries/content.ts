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
  let preferenceRevision = 0;
  const preferencePromise = getSiteHidingEnabled(origin).then((enabled) => {
    if (!ctx.isInvalid && preferenceRevision === 0) hidingEnabled = enabled;
  });
  const panelReady = (async () => {
    const disposeLocale = await initializeLocale();
    ctx.onInvalidated(disposeLocale);
    const disposeTheme = await initializeTheme(true);
    ctx.onInvalidated(disposeTheme);
    const disposeMotion = await initializeMotionPreference();
    ctx.onInvalidated(disposeMotion);
    await loadContentStyles();
    await preferencePromise;
    if (ctx.isInvalid) return;
    panel = createPagePanel(() => {
      if (!hidingEnabled) throw new Error("Hiding is paused for this site.");
      startSelectionMode();
    }, preview);
    const unsubscribe = subscribeSelection((active) => {
      if (active && panel?.isOpen) panel?.close();
      if (!active) panel?.selectionEnded();
    });
    ctx.onInvalidated(() => {
      unsubscribe();
      panel?.close(false);
      stopSelectionMode();
      stopReapplyWatcher();
      invalidateRecordCache();
    });
  })().catch((error) => console.warn("[Less] panel initialization failed", error));

  setupNavigationListener(onSpaNavigation);
  ctx.addEventListener(document, "keydown", handleGlobalKeyDown, { capture: true });

  const onPreferenceChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local" || !(hidingKey in changes)) return;
    preferenceRevision++;
    preview.clear();
    hidingEnabled = changes[hidingKey].newValue !== false;
    if (hidingEnabled) {
      void applyStoredHiding().then(() => {
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

    if (
      (message.type === "TOGGLE_PAGE_PANEL" || message.type === "SET_SELECTION_ENABLED") &&
      !panel
    ) {
      void panelReady.then(() => {
        if (ctx.isInvalid || !panel) {
          sendResponse({ ok: false });
          return;
        }
        onMessage(message, sender, sendResponse);
      });
      return true;
    }

    if (message.type === "TOGGLE_PAGE_PANEL") {
      try {
        if (selectionActive) {
          panel?.close();
          stopSelectionMode();
        }
        panel?.toggle();
        sendResponse({ ok: true });
      } catch {
        sendResponse({ ok: false });
      }
      return;
    }

    if (message.type === "SET_SELECTION_ENABLED") {
      if (message.origin && message.origin !== window.location.origin) {
        sendResponse({
          ok: false,
          error: "The current page changed. Try again on the current site.",
        });
        return;
      }
      if (message.enabled && !hidingEnabled) {
        sendResponse({
          ok: false,
          error: "Hiding is paused for this site. Enable it in the Less panel first.",
        });
        return;
      }
      try {
        if (message.enabled) startSelectionMode();
        else stopSelectionMode();
        sendResponse({ ok: true });
      } catch {
        sendResponse({
          ok: false,
          error: "Selection could not start on this page. Reload it and try again.",
        });
      }
      return;
    }

    if (message.type === "REFRESH_HIDING") {
      if (message.origin && message.origin !== window.location.origin) {
        sendResponse({ ok: false });
        return;
      }
      void preferencePromise
        .then(() => refreshHiding(message.retainedIds))
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

  ctx.addEventListener(window, "pagehide", () => panel?.close(false));

  ctx.addEventListener(window, "pageshow", (event) => {
    if (!event.persisted) return;
    if (hidingEnabled) {
      stopReapplyWatcher();
      void applyStoredHiding().then(() => {
        if (hidingEnabled && !ctx.isInvalid) watchAndReapplyHiding();
      });
    }
  });

  await preferencePromise;
  if (ctx.isInvalid) return;
  if (!hidingEnabled) document.getElementById("__veil_preload__")?.remove();
  if (hidingEnabled) {
    await applyStoredHiding();
    if (ctx.isInvalid || !hidingEnabled) return;
    watchAndReapplyHiding();
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
    if (event.key === "E") {
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
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "type" in value;
}
