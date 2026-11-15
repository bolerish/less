import { applyRecordsHiding } from "~features/element-hiding";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "~features/record/content-port";
import { reconcileCSSSelector } from "~features/element-hiding/preload-css";

const pendingRepairs = new Set<string>();
const recordCache = new Map<string, HiddenElementRecord[]>();

let recordGeneration = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

let reapplyObserver: MutationObserver | null = null;
let reapplyStopTimer: ReturnType<typeof setTimeout> | null = null;

export function invalidateRecordCache(): void {
  recordGeneration++;
  recordCache.clear();
}

export async function applyStoredHiding(reportError = false): Promise<void> {
  const generation = recordGeneration;
  const ctx = deriveCurrentPageContext(window);
  const cacheKey = `${ctx.path}\x00${ctx.search}`;

  try {
    const cached = recordCache.get(cacheKey);
    const response = cached
      ? { records: cached, error: undefined }
      : await portRequest<{ records?: HiddenElementRecord[]; error?: string }>({
          type: "GET_RECORDS_FOR_PAGE",
          origin: ctx.origin,
          path: ctx.path,
          search: ctx.search,
        });
    if (response.error || !response.records) throw new Error(response.error ?? "Missing records");
    if (
      generation !== recordGeneration ||
      window.location.pathname !== ctx.path ||
      window.location.search !== ctx.search
    )
      return;
    recordCache.set(cacheKey, response.records);

    applyRecordsHiding(document, response.records, (record, el) => {
      const key = `${generation}:${record.id}`;
      if (!el.isConnected || pendingRepairs.has(key)) return;
      pendingRepairs.add(key);
      void reconcileCSSSelector(record, el)
        .then((selector) => {
          if (
            generation !== recordGeneration ||
            window.location.pathname !== ctx.path ||
            window.location.search !== ctx.search
          )
            return;
          if (selector) {
            record.cssSelector = selector;
            if (!record.matchPlan.includes("CSS_SELECTOR"))
              record.matchPlan.unshift("CSS_SELECTOR");
          } else {
            delete record.cssSelector;
            record.matchPlan = record.matchPlan.filter((strategy) => strategy !== "CSS_SELECTOR");
          }
        })
        .catch((error) => console.warn("[Less] selector repair failed", error))
        .finally(() => pendingRepairs.delete(key));
    });
  } catch (error) {
    if (reportError) throw error;
    console.warn("[Less] could not apply saved hiding", error);
  }
}

export function watchAndReapplyHiding(): void {
  if (reapplyObserver) return;

  reapplyObserver = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void applyStoredHiding(), 80);
  });

  reapplyObserver.observe(document.documentElement, { childList: true, subtree: true });
  reapplyStopTimer = setTimeout(stopReapplyWatcher, 8_000);
}

export function stopReapplyWatcher(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = null;
  reapplyObserver?.disconnect();
  reapplyObserver = null;
  if (reapplyStopTimer !== null) {
    clearTimeout(reapplyStopTimer);
    reapplyStopTimer = null;
  }
}

export function setupNavigationListener(onNavigate: () => void): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = (window as any).navigation as EventTarget | undefined;
  if (nav) {
    nav.addEventListener("currententrychange", onNavigate);
    return;
  }

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    origPush(...args);
    onNavigate();
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    origReplace(...args);
    onNavigate();
  };
  window.addEventListener("popstate", onNavigate);
}
