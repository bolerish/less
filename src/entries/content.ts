import { restoreAllHiddenElements } from "~features/element-hiding";
import { getSiteHidingEnabled } from "~features/hiding-preference";
import {
  applyStoredHiding,
  invalidateRecordCache,
  setupNavigationListener,
  stopReapplyWatcher,
  watchAndReapplyHiding,
} from "./content/hiding-watcher";
import {
  getUndoCount,
  restoreLastHidden,
  reconcileUndoStack,
  selectionActive,
  startSelectionMode,
  stopSelectionMode,
} from "./content/selection-mode";

const HIDING_KEY_PREFIX = "veil:hiding-enabled:";
let hidingEnabled = false;

export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    void bootstrap();
  },
});

async function bootstrap(): Promise<void> {
  const origin = window.location.origin;
  const hidingKey = `${HIDING_KEY_PREFIX}${encodeURIComponent(origin)}`;

  hidingEnabled = await getSiteHidingEnabled(origin);
  if (!hidingEnabled) document.getElementById("__veil_preload__")?.remove();

  setupNavigationListener(onSpaNavigation);
  document.addEventListener("keydown", handleGlobalKeyDown, true);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(hidingKey in changes)) return;
    hidingEnabled = changes[hidingKey].newValue !== false;
    if (hidingEnabled) {
      void applyStoredHiding();
      watchAndReapplyHiding();
    } else {
      stopReapplyWatcher();
      invalidateRecordCache();
      document.getElementById("__veil_preload__")?.remove();
      restoreAllHiddenElements(document);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isMessage(message)) return;

    if (message.type === "SET_SELECTION_ENABLED") {
      if (message.enabled) startSelectionMode();
      else stopSelectionMode();
    }

    if (message.type === "REFRESH_HIDING") {
      if (message.origin && message.origin !== window.location.origin) {
        sendResponse({ ok: false });
        return;
      }
      void refreshHiding(message.retainedIds).then(
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
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    if (hidingEnabled) {
      stopReapplyWatcher();
      void applyStoredHiding();
      watchAndReapplyHiding();
    }
  });

  if (hidingEnabled) {
    await applyStoredHiding();
    watchAndReapplyHiding();
  }
}

function onSpaNavigation(): void {
  if (!hidingEnabled) return;
  stopReapplyWatcher();
  void applyStoredHiding();
  watchAndReapplyHiding();
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.shiftKey && event.ctrlKey) {
    if (event.key === "E") {
      event.preventDefault();
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
  stopReapplyWatcher();
  invalidateRecordCache();
  document.getElementById("__veil_preload__")?.remove();
  restoreAllHiddenElements(document);
  if (retainedIds) reconcileUndoStack(retainedIds);
  if (hidingEnabled) {
    await applyStoredHiding(true);
    watchAndReapplyHiding();
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
