import {
  handleManagement,
  isManagementRequest,
  removeManagedRecords,
  withRecordMutation,
} from "~features/record/management-service";
import {
  addRecord,
  buildCSSFromEntries,
  buildRecordEntry,
  CSS_ALL_KEY,
  deleteRecord,
  getRecord,
  getRecordsByPage,
  getRecordsBySiteLayout,
  loadAllCSSCache,
  pageCSSCacheKey,
  parseEntrySelector,
  saveAllCSSCache,
  siteCSSCacheKey,
  updateRecordCSSSelector,
} from "~features/record";
import type { HiddenElementRecord } from "~features/record/schema";

type ContentPortMessage =
  | { msgId: number; type: "ADD_RECORD"; record: HiddenElementRecord }
  | { msgId: number; type: "DELETE_RECORD"; id: string }
  | { msgId: number; type: "GET_RECORDS_FOR_PAGE"; origin: string; path: string; search: string }
  | { type: "UPDATE_RECORD_CSS_SELECTOR"; id: string; cssSelector: string };

function isContentPortMessage(v: unknown): v is ContentPortMessage {
  return typeof v === "object" && v !== null && "type" in v;
}

let allCSSCache: Record<string, string[]> | null = null;

async function getCache(): Promise<Record<string, string[]>> {
  allCSSCache = await loadAllCSSCache();
  return allCSSCache;
}

async function persistCache(): Promise<void> {
  if (allCSSCache !== null) {
    await saveAllCSSCache(allCSSCache);
  }
}

function extractCSSForURL(
  cache: Record<string, string[]>,
  origin: string,
  path: string,
  search: string,
): string | null {
  const pk = pageCSSCacheKey(origin, path, search);
  const sk = siteCSSCacheKey(origin);
  const entries = [...(cache[pk] ?? []), ...(cache[sk] ?? [])];
  return entries.length > 0 ? buildCSSFromEntries(entries) : null;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      sender.id !== browser.runtime.id ||
      !sender.url?.startsWith(browser.runtime.getURL("/")) ||
      !isManagementRequest(message)
    )
      return;
    void handleManagement(message).then(sendResponse);
    return true;
  });
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      void browser.tabs.create({ url: browser.runtime.getURL("/welcome.html") });
    }
    void loadAllCSSCache().then((cache) => {
      allCSSCache = cache;
    });
  });

  browser.runtime.onStartup.addListener(() => {
    void loadAllCSSCache().then((cache) => {
      allCSSCache = cache;
    });
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(CSS_ALL_KEY in changes)) return;
    allCSSCache = (changes[CSS_ALL_KEY].newValue as Record<string, string[]>) ?? {};
  });

  browser.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url, frameId }) => {
    if (frameId !== 0) return;

    void (async () => {
      try {
        const u = new URL(url);
        if (!u.protocol.startsWith("http")) return;
        const cache = await getCache();
        const css = extractCSSForURL(cache, u.origin, u.pathname, u.search);
        await browser.scripting.executeScript({
          target: { tabId },
          func: (cssText: string) => {
            const el = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
            if (el) {
              el.textContent = cssText;
            } else if (cssText) {
              const style = document.createElement("style");
              style.id = "__veil_preload__";
              style.textContent = cssText;
              document.documentElement.appendChild(style);
            }
          },
          args: [css ?? ""],
        });
      } catch {
        // Tab may not be injectable
      }
    })();
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== "content") return;

    port.onMessage.addListener((rawMsg: unknown) => {
      if (!isContentPortMessage(rawMsg)) return;
      const msg = rawMsg;

      if (msg.type === "ADD_RECORD") {
        const { msgId, record } = msg;
        void withRecordMutation(async () => {
          let added = false;
          try {
            await addRecord(record);
            added = true;
            const entry = buildRecordEntry(record);
            if (entry) {
              const cache = await getCache();
              const { origin, path, search } = record.pageContext;
              const key =
                record.scope === "site-layout"
                  ? siteCSSCacheKey(origin)
                  : pageCSSCacheKey(origin, path, search);
              const existing = cache[key] ?? [];
              if (!existing.some((e) => parseEntrySelector(e) === record.cssSelector)) {
                allCSSCache = { ...cache, [key]: [...existing, entry] };
                await persistCache();
              }
            }
            port.postMessage({ msgId, ok: true });
            void browser.runtime.sendMessage({ type: "HIDDEN_ITEMS_CHANGED" }).catch(() => {});
          } catch {
            allCSSCache = null;
            if (added) await deleteRecord(record.id);
            port.postMessage({ msgId, ok: false });
          }
        });
      }

      if (msg.type === "DELETE_RECORD") {
        const { msgId, id } = msg;
        void withRecordMutation(async () => {
          try {
            const record = await getRecord(id);
            if (record) await removeManagedRecords(record.pageContext.origin, [id]);
            allCSSCache = null;
            port.postMessage({ msgId, ok: true });
            void browser.runtime.sendMessage({ type: "HIDDEN_ITEMS_CHANGED" }).catch(() => {});
          } catch {
            port.postMessage({ msgId, ok: false });
          }
        });
      }

      if (msg.type === "GET_RECORDS_FOR_PAGE") {
        const { msgId, origin, path, search } = msg;
        void Promise.all([getRecordsByPage(origin, path, search), getRecordsBySiteLayout(origin)])
          .then(([pageRecords, siteRecords]) =>
            port.postMessage({ msgId, records: [...pageRecords, ...siteRecords] }),
          )
          .catch(() => port.postMessage({ msgId, error: "Could not load hidden items" }));
      }

      if (msg.type === "UPDATE_RECORD_CSS_SELECTOR") {
        void withRecordMutation(() => updateRecordCSSSelector(msg.id, msg.cssSelector)).catch(
          console.error,
        );
      }
    });
  });
});
