import { applyRecordsHiding } from "~features/element-hiding";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "./port";
import { backfillCSSSelector, isLegacyCSSSelector, verifyAndCleanCSSSelectors } from "./preload-css-sync";

const recordCache = new Map<string, HiddenElementRecord[]>();

let reapplyObserver: MutationObserver | null = null;
let reapplyStopTimer: ReturnType<typeof setTimeout> | null = null;

export function invalidateRecordCache(): void {
  recordCache.clear();
}

export async function applyStoredHiding(): Promise<void> {
  const ctx = deriveCurrentPageContext(window);
  const cacheKey = `${ctx.path}\x00${ctx.search}`;

  const cached = recordCache.get(cacheKey);
  if (cached) {
    applyRecordsHiding(document, cached);
    return;
  }

  try {
    const response = await portRequest<{ records: HiddenElementRecord[] }>({
      type: "GET_RECORDS_FOR_PAGE",
      origin: ctx.origin,
      path: ctx.path,
      search: ctx.search,
    });
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
  } catch {
    // Background may not be ready on very early page load
  }
}

export function watchAndReapplyHiding(): void {
  if (reapplyObserver) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  reapplyObserver = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void applyStoredHiding(), 80);
  });

  reapplyObserver.observe(document.documentElement, { childList: true, subtree: true });
  reapplyStopTimer = setTimeout(stopReapplyWatcher, 8_000);
}

export function stopReapplyWatcher(): void {
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
