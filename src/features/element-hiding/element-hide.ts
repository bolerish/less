import {
  HIDDEN_ELEMENT_ATTRIBUTE,
  HIDDEN_INLINE_STYLE_ATTRIBUTE,
  isHiddenElement,
  isHideExcludedElement,
} from "./hide-policy";

export function applyHiddenElement(element: HTMLElement, animated = false): void {
  if (isHideExcludedElement(element) || isHiddenElement(element)) return;

  const inlineStyle = element.getAttribute("style");
  if (inlineStyle !== null) {
    element.setAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE, inlineStyle);
  }
  element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");

  if (animated) {
    // Set opacity:1 explicitly so the browser has a known starting value,
    // then force a reflow to lock it in before changing to 0.
    element.style.setProperty("opacity", "1", "important");
    element.style.setProperty("transition", "opacity 0.2s ease-out", "important");
    void element.getBoundingClientRect();
    element.style.setProperty("opacity", "0", "important");

    const finalize = () => {
      if (!isHiddenElement(element)) return;
      element.style.removeProperty("transition");
      element.style.removeProperty("opacity");
      element.style.setProperty("visibility", "hidden", "important");
    };
    const timer = setTimeout(finalize, 280);
    element.addEventListener("transitionend", function onEnd(e: TransitionEvent) {
      if (e.propertyName !== "opacity") return;
      element.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      finalize();
    });
  } else {
    element.style.setProperty("visibility", "hidden", "important");
  }
}

export function restoreHiddenElement(element: HTMLElement): void {
  if (!isHiddenElement(element)) return;

  const inlineStyle = element.getAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  if (inlineStyle !== null) {
    element.setAttribute("style", inlineStyle);
    element.removeAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  } else {
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    element.style.removeProperty("transition");
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }
  element.removeAttribute(HIDDEN_ELEMENT_ATTRIBUTE);
}

export function restoreAllHiddenElements(documentRef: Document): void {
  documentRef
    .querySelectorAll<HTMLElement>(`[${HIDDEN_ELEMENT_ATTRIBUTE}="true"]`)
    .forEach(restoreHiddenElement);
}
