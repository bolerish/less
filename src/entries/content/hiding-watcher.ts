import { applyRecordsHiding } from "~features/element-hiding";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "./port";
import {
  backfillCSSSelector,
  isLegacyCSSSelector,
  verifyAndCleanCSSSelectors,
} from "./preload-css-sync";

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

  const cached = recordCache.get(cacheKey);
  if (cached) {
    applyRecordsHiding(document, cached);
    return;
  }

  try {
    const response = await portRequest<{ records?: HiddenElementRecord[]; error?: string }>({
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

    const toBackfill: Array<{ record: HiddenElementRecord; el: HTMLElement }> = [];
    const toVerify: Array<{ record: HiddenElementRecord; el: HTMLElement }> = [];
    applyRecordsHiding(document, response.records, (record, el) => {
      if (!record.cssSelector || isLegacyCSSSelector(record.cssSelector))
        toBackfill.push({ record, el });
      else toVerify.push({ record, el });
    });
    if (toBackfill.length > 0 || toVerify.length > 0) {
      void (async () => {
        if (toBackfill.length > 0) await backfillCSSSelector(toBackfill);
        if (toVerify.length > 0) await verifyAndCleanCSSSelectors(toVerify);
      })();
    }
  } catch (error) {
    if (reportError) throw error;
    console.warn("[Veil] could not apply saved hiding", error);
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
    nav.addEventListener("navigate", onNavigate);
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
