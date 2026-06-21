import {
  addRecord,
  appendCSSCacheEntry,
  deleteRecord,
  getRecord,
  getRecordsByPage,
  getRecordsBySiteLayout,
  rebuildPageCSSCache,
  rebuildSiteCSSCache,
} from "~features/record";
import type { HiddenElementRecord } from "~features/record/schema";

type BackgroundMessage =
  | { type: "ADD_RECORD"; record: HiddenElementRecord }
  | { type: "DELETE_RECORD"; id: string }
  | { type: "GET_RECORDS_FOR_PAGE"; origin: string; path: string; search: string };

function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  return typeof value === "object" && value !== null && "type" in value;
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse): true | void => {
      if (!isBackgroundMessage(message)) return;

      if (message.type === "ADD_RECORD") {
        void (async () => {
          try {
            await addRecord(message.record);
            await appendCSSCacheEntry(message.record);
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
              } else {
                const remaining = await getRecordsByPage(origin, path, search);
                await rebuildPageCSSCache(origin, path, search, remaining);
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
