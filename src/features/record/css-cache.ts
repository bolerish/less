import type { HiddenElementRecord } from "./schema";

const CSS_PAGE_CACHE_PREFIX = "veil:css:page:";
const CSS_SITE_CACHE_PREFIX = "veil:css:site:";

export const CSS_ALL_KEY = "veil:css:all";

// Legacy keys from when the app was named "bare"
const LEGACY_CSS_ALL_KEY = "bare:css:all";
const LEGACY_CSS_PAGE_PREFIX = "bare:css:page:";
const LEGACY_CSS_SITE_PREFIX = "bare:css:site:";

export function pageCSSCacheKey(origin: string, path: string, search: string): string {
  return `${CSS_PAGE_CACHE_PREFIX}${encodeURIComponent(origin)}:${encodeURIComponent(path)}:${encodeURIComponent(search)}`;
}

export function siteCSSCacheKey(origin: string): string {
  return `${CSS_SITE_CACHE_PREFIX}${encodeURIComponent(origin)}`;
}

// Entry format: "selector@@@amount"
// Backward compatible: entries without "@@@" are treated as selector with amount=1
export function parseEntrySelector(entry: string): string {
  const idx = entry.lastIndexOf("@@@");
  return idx >= 0 ? entry.slice(0, idx) : entry;
}

export function parseEntryAmount(entry: string): number {
  const idx = entry.lastIndexOf("@@@");
  return idx >= 0 ? Number(entry.slice(idx + 3)) : 1;
}

export function buildCSSFromEntries(entries: string[]): string {
  return entries.map((e) => `${parseEntrySelector(e)}{display:none!important}`).join("");
}

export async function loadAllCSSCache(): Promise<Record<string, string[]>> {
  const fast = await browser.storage.local.get(CSS_ALL_KEY);
  if (CSS_ALL_KEY in fast) {
    return (fast[CSS_ALL_KEY] as Record<string, string[]>) ?? {};
  }

  // Slow path: legacy migration (bare:css:* → veil:css:*)
  const allStorage = await browser.storage.local.get(null);
  if (
    !(CSS_ALL_KEY in allStorage) &&
    !Object.keys(allStorage).some(
      (k) =>
        k.startsWith(LEGACY_CSS_PAGE_PREFIX) ||
        k.startsWith(LEGACY_CSS_SITE_PREFIX) ||
        k === LEGACY_CSS_ALL_KEY,
    )
  ) {
    return {};
  }

  const toRemove: string[] = [];
  let migrated: Record<string, string[]> = {};

  // Migrate from legacy bare:css:all (app rename)
  if (LEGACY_CSS_ALL_KEY in allStorage) {
    const legacyAll = (allStorage[LEGACY_CSS_ALL_KEY] as Record<string, string[]>) ?? {};
    for (const [key, value] of Object.entries(legacyAll)) {
      const newKey = key
        .replace(LEGACY_CSS_PAGE_PREFIX, CSS_PAGE_CACHE_PREFIX)
        .replace(LEGACY_CSS_SITE_PREFIX, CSS_SITE_CACHE_PREFIX);
      migrated[newKey] = value;
    }
    toRemove.push(LEGACY_CSS_ALL_KEY);
  }

  // Migrate from old per-key format (bare:css:page:... / bare:css:site:...)
  for (const [key, value] of Object.entries(allStorage)) {
    if (
      (key.startsWith(LEGACY_CSS_PAGE_PREFIX) || key.startsWith(LEGACY_CSS_SITE_PREFIX)) &&
      Array.isArray(value)
    ) {
      const newKey = key
        .replace(LEGACY_CSS_PAGE_PREFIX, CSS_PAGE_CACHE_PREFIX)
        .replace(LEGACY_CSS_SITE_PREFIX, CSS_SITE_CACHE_PREFIX);
      migrated[newKey] = value as string[];
      toRemove.push(key);
    }
  }

  if (toRemove.length > 0) {
    await Promise.all([
      browser.storage.local.set({ [CSS_ALL_KEY]: migrated }),
      browser.storage.local.remove(toRemove),
    ]);
  }

  return migrated;
}

export async function saveAllCSSCache(cache: Record<string, string[]>): Promise<void> {
  await browser.storage.local.set({ [CSS_ALL_KEY]: cache });
}

export async function clearCSSCacheForOrigin(origin: string): Promise<void> {
  const cache = await loadAllCSSCache();
  const prefix = `${CSS_PAGE_CACHE_PREFIX}${encodeURIComponent(origin)}:`;
  const siteKey = siteCSSCacheKey(origin);
  const updated = Object.fromEntries(
    Object.entries(cache).filter(([k]) => !k.startsWith(prefix) && k !== siteKey),
  );
  await saveAllCSSCache(updated);
}

export function buildRecordEntry(record: HiddenElementRecord): string | null {
  if (!record.cssSelector) return null;
  return `${record.cssSelector}@@@1`;
}

export async function readPreloadCSS(
  origin: string,
  path: string,
  search: string,
): Promise<string | null> {
  const pk = pageCSSCacheKey(origin, path, search);
  const sk = siteCSSCacheKey(origin);
  const result = await browser.storage.local.get(CSS_ALL_KEY);
  const all = (result[CSS_ALL_KEY] as Record<string, string[]> | undefined) ?? {};
  const entries = [...(all[pk] ?? []), ...(all[sk] ?? [])];
  return entries.length > 0 ? buildCSSFromEntries(entries) : null;
}
