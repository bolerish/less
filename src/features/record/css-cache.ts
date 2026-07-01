import type { HiddenElementRecord } from "./schema";

const CSS_PAGE_CACHE_PREFIX = "bare:css:page:";
const CSS_SITE_CACHE_PREFIX = "bare:css:site:";

export const SESSION_WARMED_KEY = "bare:session:warmed";

export function pageCSSCacheKey(origin: string, path: string, search: string): string {
  return `${CSS_PAGE_CACHE_PREFIX}${encodeURIComponent(origin)}:${encodeURIComponent(path)}:${encodeURIComponent(search)}`;
}

export function siteCSSCacheKey(origin: string): string {
  return `${CSS_SITE_CACHE_PREFIX}${encodeURIComponent(origin)}`;
}

export async function warmUpSessionCache(): Promise<void> {
  const allLocal = await browser.storage.local.get(null);
  const cssEntries: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(allLocal)) {
    if (key.startsWith("bare:css:")) {
      cssEntries[key] = value as string[];
    }
  }
  await browser.storage.session.set({ ...cssEntries, [SESSION_WARMED_KEY]: true });
}

export async function appendCSSCacheEntry(record: HiddenElementRecord): Promise<void> {
  if (!record.cssSelector) return;
  const { origin, path, search } = record.pageContext;
  const key =
    record.scope === "site-layout"
      ? siteCSSCacheKey(origin)
      : pageCSSCacheKey(origin, path, search);
  const current = (await browser.storage.local.get(key))[key] as string[] | undefined;
  const updated = [...(current ?? []), record.cssSelector];
  await Promise.all([
    browser.storage.local.set({ [key]: updated }),
    browser.storage.session.set({ [key]: updated }),
  ]);
}

export async function rebuildPageCSSCache(
  origin: string,
  path: string,
  search: string,
  records: HiddenElementRecord[],
): Promise<void> {
  const selectors = records.map((r) => r.cssSelector).filter((s): s is string => s !== undefined);
  const key = pageCSSCacheKey(origin, path, search);
  if (selectors.length > 0) {
    await Promise.all([
      browser.storage.local.set({ [key]: selectors }),
      browser.storage.session.set({ [key]: selectors }),
    ]);
  } else {
    await Promise.all([
      browser.storage.local.remove(key),
      browser.storage.session.remove(key),
    ]);
  }
}

export async function rebuildSiteCSSCache(
  origin: string,
  records: HiddenElementRecord[],
): Promise<void> {
  const selectors = records.map((r) => r.cssSelector).filter((s): s is string => s !== undefined);
  const key = siteCSSCacheKey(origin);
  if (selectors.length > 0) {
    await Promise.all([
      browser.storage.local.set({ [key]: selectors }),
      browser.storage.session.set({ [key]: selectors }),
    ]);
  } else {
    await Promise.all([
      browser.storage.local.remove(key),
      browser.storage.session.remove(key),
    ]);
  }
}

export async function clearCSSCacheForOrigin(origin: string): Promise<void> {
  const allStorage = await browser.storage.local.get(null);
  const prefix = `${CSS_PAGE_CACHE_PREFIX}${encodeURIComponent(origin)}:`;
  const keysToRemove = Object.keys(allStorage).filter(
    (k) => k.startsWith(prefix) || k === siteCSSCacheKey(origin),
  );
  if (keysToRemove.length > 0) {
    await Promise.all([
      browser.storage.local.remove(keysToRemove),
      browser.storage.session.remove(keysToRemove),
    ]);
  }
}
