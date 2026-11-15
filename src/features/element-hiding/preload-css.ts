import {
  CSS_ALL_KEY,
  pageCSSCacheKey,
  parseEntrySelector,
  siteCSSCacheKey,
} from "~features/record/css-cache";
import { resolveCSSSelector } from "~features/record/derivation/record-match-signal-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { portPost } from "~features/record/content-port";

// Old-style selectors used .className; new style uses [class*="token"].
// Detects legacy selectors so they can be transparently re-derived on next match.
export function isLegacyCSSSelector(selector: string): boolean {
  return /(?:^|[\s>+~,(])\.[\w-]|(?<=[a-z0-9_-])\.[\w-]/.test(selector);
}

export function removePreloadCSSForElement(element: HTMLElement): void {
  const style = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
  if (!style?.sheet) return;
  for (let i = style.sheet.cssRules.length - 1; i >= 0; i--) {
    try {
      if (element.matches((style.sheet.cssRules[i] as CSSStyleRule).selectorText)) {
        style.sheet.deleteRule(i);
      }
    } catch {
      // invalid selector
    }
  }
}

export function removePreloadCSSBySelector(selector: string): void {
  const style = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
  if (!style?.sheet) return;
  for (let i = style.sheet.cssRules.length - 1; i >= 0; i--) {
    try {
      if ((style.sheet.cssRules[i] as CSSStyleRule).selectorText === selector) {
        style.sheet.deleteRule(i);
      }
    } catch {
      // invalid selector
    }
  }
}

export async function backfillCSSSelector(
  items: Array<{ record: HiddenElementRecord; el: HTMLElement }>,
): Promise<void> {
  const byKey = new Map<string, string[]>();
  const resolved = new Map<string, string>(); // record id → cssSelector

  for (const { record, el } of items) {
    const cssSelector = resolveCSSSelector(el, document);
    if (!cssSelector) continue;
    resolved.set(record.id, cssSelector);
    const { origin, path, search } = record.pageContext;
    const key =
      record.scope === "site-layout"
        ? siteCSSCacheKey(origin)
        : pageCSSCacheKey(origin, path, search);
    const list = byKey.get(key);
    if (list) {
      if (!list.includes(cssSelector)) list.push(cssSelector);
    } else {
      byKey.set(key, [cssSelector]);
    }
  }

  const currentAll =
    ((await browser.storage.local.get(CSS_ALL_KEY))[CSS_ALL_KEY] as
      | Record<string, string[]>
      | undefined) ?? {};
  let changed = false;
  for (const [key, newSelectors] of byKey) {
    const existing = currentAll[key] ?? [];
    const existingSelectors = new Set(existing.map(parseEntrySelector));
    const toAdd = newSelectors.filter((s) => !existingSelectors.has(s));
    if (toAdd.length > 0) {
      currentAll[key] = [...existing, ...toAdd.map((s) => `${s}@@@1`)];
      changed = true;
    }
  }
  if (changed) {
    await browser.storage.local.set({ [CSS_ALL_KEY]: currentAll });
  }

  for (const [id, cssSelector] of resolved) {
    portPost({ type: "UPDATE_RECORD_CSS_SELECTOR", id, cssSelector });
  }
}

export async function verifyAndCleanCSSSelectors(
  items: Array<{ record: HiddenElementRecord; el: HTMLElement }>,
): Promise<void> {
  const staleByKey = new Map<string, Set<string>>();

  for (const { record, el } of items) {
    if (!record.cssSelector) continue;
    let stale = false;
    try {
      const matched = document.querySelectorAll(record.cssSelector);
      if (matched.length !== 1 || matched[0] !== el) stale = true;
    } catch {
      stale = true;
    }
    if (!stale) continue;

    removePreloadCSSBySelector(record.cssSelector);

    const { origin, path, search } = record.pageContext;
    const key =
      record.scope === "site-layout"
        ? siteCSSCacheKey(origin)
        : pageCSSCacheKey(origin, path, search);
    if (!staleByKey.has(key)) staleByKey.set(key, new Set());
    staleByKey.get(key)!.add(record.cssSelector);
  }

  if (staleByKey.size === 0) return;

  const currentAll =
    ((await browser.storage.local.get(CSS_ALL_KEY))[CSS_ALL_KEY] as
      | Record<string, string[]>
      | undefined) ?? {};
  let changed = false;
  for (const [key, stale] of staleByKey) {
    if (!currentAll[key]) continue;
    const before = currentAll[key].length;
    currentAll[key] = currentAll[key].filter((e) => !stale.has(parseEntrySelector(e)));
    if (currentAll[key].length !== before) changed = true;
  }
  if (changed) {
    await browser.storage.local.set({ [CSS_ALL_KEY]: currentAll });
  }
}
