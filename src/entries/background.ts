import {
  addRecord,
  appendCSSCacheEntry,
  deleteRecord,
  getRecord,
  getRecordsByPage,
  getRecordsBySiteLayout,
  pageCSSCacheKey,
  rebuildPageCSSCache,
  rebuildSiteCSSCache,
  siteCSSCacheKey,
} from "~features/record";
import type { HiddenElementRecord } from "~features/record/schema";

type BackgroundMessage =
  | { type: "ADD_RECORD"; record: HiddenElementRecord }
  | { type: "DELETE_RECORD"; id: string }
  | { type: "GET_RECORDS_FOR_PAGE"; origin: string; path: string; search: string };

function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  return typeof value === "object" && value !== null && "type" in value;
}

// In-memory CSS selector cache keyed by CSS cache key.
// undefined = not yet loaded from storage; string[] = loaded (may be empty).
const cssKeyCache = new Map<string, string[]>();

async function resolveSelectorsForPage(
  origin: string,
  path: string,
  search: string,
): Promise<string[]> {
  const pk = pageCSSCacheKey(origin, path, search);
  const sk = siteCSSCacheKey(origin);

  const keysToLoad: string[] = [];
  if (!cssKeyCache.has(pk)) keysToLoad.push(pk);
  if (!cssKeyCache.has(sk)) keysToLoad.push(sk);

  if (keysToLoad.length > 0) {
    const result = await browser.storage.local.get(keysToLoad);
    for (const key of keysToLoad) {
      cssKeyCache.set(key, (result[key] as string[] | undefined) ?? []);
    }
  }

  return [...(cssKeyCache.get(pk) ?? []), ...(cssKeyCache.get(sk) ?? [])];
}

function updateCssKeyCache(key: string, selectors: string[]): void {
  cssKeyCache.set(key, selectors);
}

export default defineBackground(() => {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key.startsWith("bare:css:") && cssKeyCache.has(key)) {
        cssKeyCache.set(key, (newValue as string[] | undefined) ?? []);
      }
    }
  });

  browser.webNavigation.onCommitted.addListener(({ tabId, url, frameId }) => {
    if (frameId !== 0) return;

    let origin: string, path: string, search: string;
    try {
      const u = new URL(url);
      if (!u.protocol.startsWith("http")) return;
      origin = u.origin;
      path = u.pathname;
      search = u.search;
    } catch {
      return;
    }

    void (async () => {
      const selectors = await resolveSelectorsForPage(origin, path, search);
      if (selectors.length === 0) return;

      const css = selectors.map((s) => `${s}{display:none!important}`).join("");
      try {
        await browser.scripting.executeScript({
          target: { tabId },
          func: (cssText: string) => {
            if (document.getElementById("__bare_preload__")) return;
            const style = document.createElement("style");
            style.id = "__bare_preload__";
            style.textContent = cssText;
            document.documentElement.appendChild(style);
          },
          args: [css],
          injectImmediately: true,
        });
      } catch {
        // Tab may not be injectable (e.g., extension pages, PDFs)
      }
    })();
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse): true | void => {
      if (!isBackgroundMessage(message)) return;

      if (message.type === "ADD_RECORD") {
        void (async () => {
          try {
            await addRecord(message.record);
            await appendCSSCacheEntry(message.record);
            if (message.record.cssSelector) {
              const { origin, path, search } = message.record.pageContext;
              const key =
                message.record.scope === "site-layout"
                  ? siteCSSCacheKey(origin)
                  : pageCSSCacheKey(origin, path, search);
              const existing = cssKeyCache.get(key) ?? [];
              if (!existing.includes(message.record.cssSelector)) {
                updateCssKeyCache(key, [...existing, message.record.cssSelector]);
              }
            }
            sendResponse({ ok: true });
          } catch {
            sendResponse({ ok: false });
          }
        })();
        return true;
      }

      if (message.type === "DELETE_RECORD") {
        void (async () => {
          try {
            const record = await getRecord(message.id);
            await deleteRecord(message.id);
            if (record) {
              const { origin, path, search } = record.pageContext;
              if (record.scope === "site-layout") {
                const remaining = await getRecordsBySiteLayout(origin);
                await rebuildSiteCSSCache(origin, remaining);
                updateCssKeyCache(
                  siteCSSCacheKey(origin),
                  remaining.flatMap((r) => (r.cssSelector ? [r.cssSelector] : [])),
                );
              } else {
                const remaining = await getRecordsByPage(origin, path, search);
                await rebuildPageCSSCache(origin, path, search, remaining);
                updateCssKeyCache(
                  pageCSSCacheKey(origin, path, search),
                  remaining.flatMap((r) => (r.cssSelector ? [r.cssSelector] : [])),
                );
              }
            }
            sendResponse({ ok: true });
          } catch {
            sendResponse({ ok: false });
          }
        })();
        return true;
      }

      if (message.type === "GET_RECORDS_FOR_PAGE") {
        const { origin, path, search } = message;
        Promise.all([getRecordsByPage(origin, path, search), getRecordsBySiteLayout(origin)])
          .then(([pageRecords, siteRecords]) =>
            sendResponse({ records: [...pageRecords, ...siteRecords] }),
          )
          .catch(() => sendResponse({ records: [] }));
        return true;
      }
    },
  );
});
