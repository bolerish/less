import { db } from "~shared/lib/db";

import type { HiddenElementRecord } from "./schema";

const MATCH_FAILURE_THRESHOLD = 10;
const STALE_MATCHED_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_UNMATCHED_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_KEY = "lastCleanupAt";

async function cleanupStaleRecords(): Promise<void> {
  const now = Date.now();

  await db.records.where("matchFailureCount").above(MATCH_FAILURE_THRESHOLD).delete();

  await db.records
    .where("lastMatchedAt")
    .below(now - STALE_MATCHED_MS)
    .delete();

  await db.records
    .filter((r) => r.lastMatchedAt === null && r.createdAt < now - STALE_UNMATCHED_MS)
    .delete();
}

export async function cleanupIfNeeded(): Promise<void> {
  const entry = await db.meta.get(CLEANUP_KEY);
  const lastCleanup = (entry?.value as number | undefined) ?? 0;

  if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;

  await cleanupStaleRecords();
  await db.meta.put({ key: CLEANUP_KEY, value: Date.now() });
}

export function getRecordsByPage(
  origin: string,
  path: string,
  search: string,
): Promise<HiddenElementRecord[]> {
  return db.records
    .where("[pageContext.origin+pageContext.path+pageContext.search]")
    .equals([origin, path, search])
    .toArray();
}

export function getRecordsBySiteLayout(origin: string): Promise<HiddenElementRecord[]> {
  return db.records.where({ scope: "site-layout", "pageContext.origin": origin }).toArray();
}
