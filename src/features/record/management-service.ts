import { getTabURL } from "~shared/lib/tab-url";
import { db } from "~shared/lib/db";
import {
  buildRecordEntry,
  loadAllCSSCache,
  pageCSSCacheKey,
  saveAllCSSCache,
  siteCSSCacheKey,
} from "./css-cache";
import type { ManagedRecord, ManagementRequest, ManagementResponse } from "./management";

let mutationQueue: Promise<unknown> = Promise.resolve();

export function withRecordMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation);
  mutationQueue = result.catch(() => {});
  return result;
}

export function isManagementRequest(value: unknown): value is ManagementRequest {
  if (typeof value !== "object" || value === null || !("type" in value) || !("origin" in value))
    return false;
  if (typeof value.origin !== "string") return false;
  try {
    const url = new URL(value.origin);
    if (!/^https?:$/.test(url.protocol) || url.origin !== value.origin) return false;
  } catch {
    return false;
  }
  return (
    value.type === "LIST_HIDDEN_ITEMS" ||
    value.type === "RESET_HIDDEN_SITE" ||
    value.type === "SYNC_HIDDEN_SITE" ||
    (value.type === "RESTORE_HIDDEN_ITEM" && "id" in value && typeof value.id === "string")
  );
}

export async function handleManagement(request: ManagementRequest): Promise<ManagementResponse> {
  try {
    const records = await withRecordMutation(async () => {
      if (request.type === "RESTORE_HIDDEN_ITEM" || request.type === "RESET_HIDDEN_SITE") {
        const all = await db.records.where("pageContext.origin").equals(request.origin).toArray();
        const removed =
          request.type === "RESET_HIDDEN_SITE"
            ? all
            : all.filter((record) => record.id === request.id);
        await removeManagedRecords(
          request.origin,
          removed.map((record) => record.id),
        );
      }
      return getManagedRecords(request.origin);
    });
    if (request.type !== "LIST_HIDDEN_ITEMS")
      void browser.runtime.sendMessage({ type: "HIDDEN_ITEMS_CHANGED" }).catch(() => {});
    const unsyncedTabs =
      request.type === "LIST_HIDDEN_ITEMS" ? 0 : await syncSiteTabs(request.origin);
    return { ok: true, records, unsyncedTabs };
  } catch (error) {
    console.error("[Less] hidden item management failed", error);
    return {
      ok: false,
      error:
        "Less could not read or save your hidden items. Try again. If this continues, reload the extension.",
    };
  }
}

export async function removeManagedRecords(origin: string, ids: string[]): Promise<void> {
  const cache = await loadAllCSSCache();
  const records = await db.records.where("pageContext.origin").equals(origin).toArray();
  const removedIds = new Set(ids);
  const pagePrefix = `veil:css:page:${encodeURIComponent(origin)}:`;
  const siteKey = siteCSSCacheKey(origin);
  const next = Object.fromEntries(
    Object.entries(cache).filter(([key]) => !key.startsWith(pagePrefix) && key !== siteKey),
  );
  for (const record of records) {
    if (removedIds.has(record.id)) continue;
    const entry = buildRecordEntry(record);
    if (!entry) continue;
    const { path, search } = record.pageContext;
    const key = record.scope === "site-layout" ? siteKey : pageCSSCacheKey(origin, path, search);
    (next[key] ??= []).push(entry);
  }
  // A failed storage write leaves the DB intact; a failed DB write restores the cache.
  await saveAllCSSCache(next);
  try {
    await db.transaction("rw", db.records, () => db.records.bulkDelete(ids));
  } catch (error) {
    await saveAllCSSCache(cache);
    throw error;
  }
}

async function getManagedRecords(origin: string): Promise<ManagedRecord[]> {
  const records = await db.records.where("pageContext.origin").equals(origin).toArray();
  return records
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      scope: record.scope,
      target: record.target,
      path: record.pageContext.path,
    }));
}

async function syncSiteTabs(origin: string): Promise<number> {
  const retainedIds = (await getManagedRecords(origin)).map((record) => record.id);
  const tabs = await browser.tabs.query({});
  const sites = await Promise.all(
    tabs.map(async (tab) => {
      try {
        const url = await getTabURL(tab);
        return url && new URL(url).origin === origin ? tab : null;
      } catch {
        return null;
      }
    }),
  );
  const siteTabs = sites.filter((tab) => tab !== null);
  const results = await Promise.allSettled(
    siteTabs.map(async (tab) => {
      const response = await browser.tabs.sendMessage(tab.id!, {
        type: "REFRESH_HIDING",
        origin,
        retainedIds,
      });
      if (!response?.ok) throw new Error("Content script did not confirm restoration");
    }),
  );
  return results.filter((result) => result.status === "rejected").length;
}
