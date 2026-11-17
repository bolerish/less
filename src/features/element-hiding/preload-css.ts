import { resolveCSSSelector } from "~features/record/derivation/record-match-signal-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "~features/record/content-port";

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
      if (
        element.matches(
          (style.sheet.cssRules[i] as CSSStyleRule).selectorText.replace(
            /:not\(\[data-veil-hidden\]\)$/,
            "",
          ),
        )
      ) {
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
      if (
        (style.sheet.cssRules[i] as CSSStyleRule).selectorText.replace(
          /:not\(\[data-veil-hidden\]\)$/,
          "",
        ) === selector
      ) {
        style.sheet.deleteRule(i);
      }
    } catch {
      // invalid selector
    }
  }
}

export async function reconcileCSSSelector(
  record: HiddenElementRecord,
  el: HTMLElement,
): Promise<string | null> {
  const old = record.cssSelector ?? null;
  if (old && !isLegacyCSSSelector(old)) {
    try {
      const matches = document.querySelectorAll(old);
      if (matches.length === 1 && matches[0] === el) {
        applyCurrentSelector(old);
        return old;
      }
    } catch {
      /* Invalid selectors are replaced below. */
    }
  }
  if (old) removePreloadCSSBySelector(old);
  const cssSelector = resolveCSSSelector(el, document) ?? null;
  if (old === null && cssSelector === null && !record.matchPlan.includes("CSS_SELECTOR"))
    return null;
  const response = await portRequest<{ ok: boolean }>({
    type: "UPDATE_RECORD_CSS_SELECTOR",
    id: record.id,
    expectedCssSelector: old,
    cssSelector,
  });
  if (!response.ok) throw new Error("Selector update rejected");
  if (cssSelector) applyCurrentSelector(cssSelector);
  return cssSelector;
}

function applyCurrentSelector(selector: string): void {
  selector = `${selector}:not([data-veil-hidden])`;
  let style = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "__veil_preload__";
    document.documentElement.appendChild(style);
  }
  if (
    style.sheet &&
    ![...style.sheet.cssRules].some((rule) => (rule as CSSStyleRule).selectorText === selector)
  )
    style.sheet.insertRule(`${selector}{display:none!important}`, style.sheet.cssRules.length);
}
