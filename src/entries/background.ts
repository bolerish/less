import { getSiteHidingEnabled } from "~features/hiding-preference";
import { db } from "~shared/lib/db";
import { registerPanelAction } from "../features/toolbar/panel-action";
import {
  handleManagement,
  rebuildOriginCSSCache,
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
} from "~features/record";
import type { HiddenElementRecord } from "~features/record/schema";

type ContentPortMessage =
  | { msgId: number; type: "ADD_RECORD"; record: HiddenElementRecord }
  | { msgId: number; type: "DELETE_RECORD"; id: string }
  | { msgId: number; type: "GET_RECORDS_FOR_PAGE"; origin: string; path: string; search: string }
  | {
      msgId: number;
      type: "UPDATE_RECORD_CSS_SELECTOR";
      id: string;
      expectedCssSelector: string | null;
      cssSelector: string | null;
    };

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
  registerPanelAction();
  const revisions = new Map<number, number>();
  let storageRevision = 0;
  browser.tabs.onRemoved.addListener((tabId) => revisions.delete(tabId));
  browser.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
    if (frameId === 0) revisions.set(tabId, (revisions.get(tabId) ?? 0) + 1);
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "OPEN_HELP"
    ) {
      if (sender.tab?.id === undefined || sender.frameId !== 0) return;
      void browser.tabs.create({ url: browser.runtime.getURL("/welcome.html") }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true;
    }
    if (!isManagementRequest(message)) return;
    void (async () => {
      if (!(await canManageSite(sender, message.origin))) {
        sendResponse({ ok: false, error: "Less can only manage the site in this tab." });
        return;
      }
      sendResponse(await handleManagement(message));
    })().catch(() =>
      sendResponse({ ok: false, error: "The page changed. Reopen Less and try again." }),
    );
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
    if (area !== "local") return;
    if (Object.keys(changes).some((key) => key === CSS_ALL_KEY || key.includes("hiding-enabled:")))
      storageRevision++;
    if (!(CSS_ALL_KEY in changes)) return;
    allCSSCache = (changes[CSS_ALL_KEY].newValue as Record<string, string[]>) ?? {};
  });

  browser.webNavigation.onHistoryStateUpdated.addListener(({ tabId, url, frameId }) => {
    if (frameId !== 0) return;

    const revision = (revisions.get(tabId) ?? 0) + 1;
    revisions.set(tabId, revision);
    void browser.tabs
      .sendMessage(tabId, { type: "PRELOAD_NAVIGATED" }, { frameId: 0 })
      .catch(() => {});
    void (async () => {
      try {
        const u = new URL(url);
        if (!u.protocol.startsWith("http")) return;
        while (revisions.get(tabId) === revision) {
          const snapshot = storageRevision;
          // eslint-disable-next-line no-await-in-loop -- A changed snapshot must be read again before injection.
          const [cache, enabled, frame] = await Promise.all([
            getCache(),
            getSiteHidingEnabled(u.origin),
            browser.webNavigation.getFrame({ tabId, frameId: 0 }),
          ]);
          if (revisions.get(tabId) !== revision || frame?.url !== url) return;
          if (storageRevision !== snapshot) continue;
          const css = enabled ? extractCSSForURL(cache, u.origin, u.pathname, u.search) : null;
          // eslint-disable-next-line no-await-in-loop -- Inject only the last consistent snapshot, then return.
          await browser.scripting.executeScript({
            target: { tabId },
            func: (cssText: string, expectedUrl: string) => {
              if (location.href !== expectedUrl) return;
              const el = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
              if (!cssText) {
                el?.remove();
              } else if (el) {
                el.textContent = cssText;
              } else if (cssText) {
                const style = document.createElement("style");
                style.id = "__veil_preload__";
                style.textContent = cssText;
                document.documentElement.appendChild(style);
              }
            },
            args: [css ?? "", url],
          });
          return;
        }
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
        void withRecordMutation(async () => {
          try {
            if (
              !Number.isInteger(msg.msgId) ||
              typeof msg.id !== "string" ||
              !(msg.expectedCssSelector === null || typeof msg.expectedCssSelector === "string") ||
              !(
                msg.cssSelector === null ||
                (typeof msg.cssSelector === "string" && msg.cssSelector.length > 0)
              )
            )
              throw new Error("Invalid payload");
            const record = await getRecord(msg.id);
            const sender = port.sender;
            if (
              !record ||
              !sender ||
              sender.id !== browser.runtime.id ||
              sender.tab?.id === undefined ||
              sender.frameId !== 0 ||
              !sender.url
            )
              throw new Error("Invalid sender");
            const frame = await browser.webNavigation.getFrame({
              tabId: sender.tab.id,
              frameId: 0,
            });
            const source = new URL(sender.url);
            const current = frame && new URL(frame.url);
            if (
              !current ||
              !/^https?:$/.test(source.protocol) ||
              !/^https?:$/.test(current.protocol) ||
              source.origin !== record.pageContext.origin ||
              current.origin !== record.pageContext.origin ||
              (record.scope !== "site-layout" &&
                (current.pathname !== record.pageContext.path ||
                  current.search !== record.pageContext.search)) ||
              (record.cssSelector ?? null) !== msg.expectedCssSelector
            )
              throw new Error("Stale selector update");
            const nextRecord: HiddenElementRecord = {
              ...record,
              matchPlan: record.matchPlan.filter((strategy) => strategy !== "CSS_SELECTOR"),
            };
            if (msg.cssSelector === null) delete nextRecord.cssSelector;
            else {
              nextRecord.cssSelector = msg.cssSelector;
              nextRecord.matchPlan.unshift("CSS_SELECTOR");
            }
            const cache = await loadAllCSSCache();
            const records = await db.records
              .where("pageContext.origin")
              .equals(source.origin)
              .toArray();
            const next = rebuildOriginCSSCache(
              cache,
              source.origin,
              records.map((item) => (item.id === record.id ? nextRecord : item)),
            );
            await saveAllCSSCache(next);
            try {
              await db.records.put(nextRecord);
            } catch (error) {
              await saveAllCSSCache(cache);
              throw error;
            }
            allCSSCache = null;
            port.postMessage({ msgId: msg.msgId, ok: true });
          } catch {
            allCSSCache = null;
            port.postMessage({ msgId: msg.msgId, ok: false });
          }
        });
      }
    });
  });
});

async function canManageSite(
  sender: Browser.runtime.MessageSender,
  origin: string,
): Promise<boolean> {
  if (sender.url?.startsWith(browser.runtime.getURL("/"))) return true;
  if (sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return false;
  const frame = await browser.webNavigation.getFrame({ tabId: sender.tab.id, frameId: 0 });
  if (!frame || !/^https?:$/.test(new URL(frame.url).protocol)) return false;
  return new URL(sender.url).origin === origin && new URL(frame.url).origin === origin;
}
