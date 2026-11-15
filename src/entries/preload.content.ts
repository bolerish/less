import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { getSiteHidingEnabled, subscribeSiteHidingEnabled } from "~features/hiding-preference";
import {
  CSS_ALL_KEY,
  pageCSSCacheKey,
  parseEntrySelector,
  readPreloadCSS,
  siteCSSCacheKey,
} from "~features/record/css-cache";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";

// A first-display delay budget, not an estimate of storage latency.
const FIRST_DISPLAY_TIMEOUT_MS = 150;

export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_start",
  main(ctx) {
    void injectPreloadCSS(ctx);
  },
});

async function injectPreloadCSS(ctx: ContentScriptContext): Promise<void> {
  if (document.getElementById("__veil_preload__")) return;
  const root = document.documentElement;
  if (!root || ctx.isInvalid) return;
  const { origin, path, search } = deriveCurrentPageContext(window);
  if (!origin.startsWith("http")) return;
  const pageKey = pageCSSCacheKey(origin, path, search);
  const siteKey = siteCSSCacheKey(origin);

  const url = window.location.href;
  const deadline = performance.now() + FIRST_DISPLAY_TIMEOUT_MS;
  const holdStyle = document.createElement("style");
  // Cover descendants that explicitly set visibility, without changing page attributes.
  holdStyle.textContent = ":root, :root * { visibility: hidden !important; }";
  let finished = false;
  const cleanups: (() => void)[] = [];

  function finish(): void {
    if (finished) return;
    finished = true;
    holdStyle.remove();
    for (const cleanup of cleanups) cleanup();
  }

  function getCachedSelectors(cache: unknown): Set<string> | null {
    const selectors = new Set<string>();
    if (cache == null) return selectors;
    if (typeof cache !== "object" || Array.isArray(cache)) return null;
    for (const key of [pageKey, siteKey]) {
      const entries: unknown = Reflect.get(cache, key);
      if (entries == null) continue;
      if (!Array.isArray(entries) || !entries.every((entry: unknown) => typeof entry === "string"))
        return null;
      for (const entry of entries) selectors.add(parseEntrySelector(entry));
    }
    return selectors;
  }

  try {
    const timer = window.setTimeout(finish, FIRST_DISPLAY_TIMEOUT_MS);
    cleanups.push(() => window.clearTimeout(timer));
    cleanups.push(ctx.onInvalidated(finish));
    cleanups.push(subscribeSiteHidingEnabled(origin, finish));
    const handleCacheChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== "local" || !(CSS_ALL_KEY in changes)) return;
      const before = getCachedSelectors(changes[CSS_ALL_KEY].oldValue);
      const after = getCachedSelectors(changes[CSS_ALL_KEY].newValue);
      // Cancel a stale pending read only when this page's hiding rules actually change.
      if (
        !before ||
        !after ||
        before.size !== after.size ||
        [...before].some((selector) => !after.has(selector))
      )
        finish();
    };
    browser.storage.onChanged.addListener(handleCacheChange);
    cleanups.push(() => browser.storage.onChanged.removeListener(handleCacheChange));
    window.addEventListener("pagehide", finish);
    cleanups.push(() => window.removeEventListener("pagehide", finish));
    root.appendChild(holdStyle);

    // Either OFF or an empty/failed cache can release the page before the other read settles.
    const cssPromise = readPreloadCSS(origin, path, search).then(
      (css) => {
        if (!css) finish();
        return css;
      },
      () => {
        finish();
        return null;
      },
    );
    if (!(await getSiteHidingEnabled(origin))) return;
    const css = await cssPromise;
    if (
      !css ||
      finished ||
      ctx.isInvalid ||
      performance.now() >= deadline ||
      window.location.href !== url ||
      document.getElementById("__veil_preload__")
    ) {
      return;
    }

    const style = document.createElement("style");
    style.id = "__veil_preload__";
    style.textContent = css;
    root.appendChild(style);
  } catch {
    // Storage or DOM failures must leave the page visible.
  } finally {
    // Apply saved layout rules before revealing; no animation or extra frame delay.
    finish();
  }
}
