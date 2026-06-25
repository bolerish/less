import {
  HIDDEN_ELEMENT_ATTRIBUTE,
  HIDDEN_INLINE_STYLE_ATTRIBUTE,
  isHiddenElement,
  isHideExcludedElement,
} from "./hide-policy";

// Tracks pending rAF handles so restore can cancel before display:none fires
const pendingHideRaf = new WeakMap<HTMLElement, number>();

export function applyHiddenElement(element: HTMLElement, immediate = false): void {
  if (isHideExcludedElement(element) || isHiddenElement(element)) return;

  const inlineStyle = element.getAttribute("style");
  if (inlineStyle !== null) {
    element.setAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE, inlineStyle);
  }
  element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");

  if (immediate) {
    // Auto-hide context: single layout shift, no intermediate empty space
    element.style.setProperty("display", "none", "important");
    return;
  }

  // User-triggered: Phase 1 makes element invisible, Phase 2 collapses space on next frame.
  // Separating the two events makes the interaction feel intentional rather than jarring.
  element.style.setProperty("visibility", "hidden", "important");
  const handle = requestAnimationFrame(() => {
    pendingHideRaf.delete(element);
    if (!isHiddenElement(element)) return;
    element.style.removeProperty("visibility");
    element.style.setProperty("display", "none", "important");
  });
  pendingHideRaf.set(element, handle);
}

export function restoreHiddenElement(element: HTMLElement): void {
  if (!isHiddenElement(element)) return;

  const handle = pendingHideRaf.get(element);
  if (handle !== undefined) {
    cancelAnimationFrame(handle);
    pendingHideRaf.delete(element);
  }

  const inlineStyle = element.getAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  if (inlineStyle !== null) {
    element.setAttribute("style", inlineStyle);
    element.removeAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  } else {
    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }
  element.removeAttribute(HIDDEN_ELEMENT_ATTRIBUTE);
}

export function restoreAllHiddenElements(documentRef: Document): void {
  documentRef
    .querySelectorAll<HTMLElement>(`[${HIDDEN_ELEMENT_ATTRIBUTE}="true"]`)
    .forEach(restoreHiddenElement);
}
