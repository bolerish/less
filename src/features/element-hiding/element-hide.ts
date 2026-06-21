import {
  HIDDEN_ELEMENT_ATTRIBUTE,
  HIDDEN_INLINE_STYLE_ATTRIBUTE,
  isHiddenElement,
  isHideExcludedElement,
} from "./hide-policy";

export function applyHiddenElement(element: HTMLElement): void {
  if (isHideExcludedElement(element) || isHiddenElement(element)) return;

  const inlineStyle = element.getAttribute("style");
  if (inlineStyle !== null) {
    element.setAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE, inlineStyle);
  }
  element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");
  element.style.setProperty("display", "none", "important");
}

export function restoreHiddenElement(element: HTMLElement): void {
  if (!isHiddenElement(element)) return;

  const inlineStyle = element.getAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  if (inlineStyle !== null) {
    element.setAttribute("style", inlineStyle);
    element.removeAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  } else {
    element.style.removeProperty("display");
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }
  element.removeAttribute(HIDDEN_ELEMENT_ATTRIBUTE);
}

export function restoreAllHiddenElements(documentRef: Document): void {
  documentRef
    .querySelectorAll<HTMLElement>(`[${HIDDEN_ELEMENT_ATTRIBUTE}="true"]`)
    .forEach(restoreHiddenElement);
}
