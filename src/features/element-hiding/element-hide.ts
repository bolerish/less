import {
  HIDDEN_ELEMENT_ATTRIBUTE,
  HIDDEN_INLINE_STYLE_ATTRIBUTE,
  isHiddenElement,
  isHideExcludedElement,
} from "./hide-policy";
import { isMotionReduced } from "~shared/motion/preference";

const pendingAnimations = new WeakMap<HTMLElement, () => void>();
const ADDED_INERT_ATTRIBUTE = "data-veil-inert-added";
const pageGutters = new WeakMap<
  Document,
  { root: HTMLElement; value: string; priority: string; hadStyle: boolean }
>();

export function finishHiddenElementAnimation(element: HTMLElement): void {
  pendingAnimations.get(element)?.();
}

export function applyHiddenElement(element: HTMLElement, animated = false): void {
  if (isHideExcludedElement(element) || isHiddenElement(element)) return;
  preservePageScrollbar(element.ownerDocument);

  const inlineStyle = element.getAttribute("style");
  if (inlineStyle !== null) {
    element.setAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE, inlineStyle);
  }
  element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");
  // Keep fading and visually previewed hidden controls out of focus and accessibility navigation.
  if (!element.hasAttribute("inert")) {
    element.setAttribute(ADDED_INERT_ATTRIBUTE, "true");
    element.inert = true;
  }
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();

  if (animated && !isMotionReduced()) {
    element.style.setProperty("will-change", "opacity", "important");
    element.style.setProperty("opacity", "1", "important");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const finalize = (): void => {
      pendingAnimations.delete(element);
      clearTimeout(timer);
      element.removeEventListener("transitionend", onEnd);
      if (!isHiddenElement(element)) return;
      element.style.removeProperty("transition");
      element.style.removeProperty("opacity");
      element.style.removeProperty("will-change");
      element.style.setProperty("display", "none", "important");
    };
    const onEnd = (event: TransitionEvent): void => {
      if (event.target === element && event.propertyName === "opacity") finalize();
    };
    pendingAnimations.set(element, finalize);
    // Double rAF lets the initial opacity paint before the fade starts.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (pendingAnimations.get(element) !== finalize) return;
        element.style.setProperty(
          "transition",
          "opacity 0.28s cubic-bezier(0.4, 0, 1, 1)",
          "important",
        );
        element.style.setProperty("opacity", "0", "important");
        timer = setTimeout(finalize, 360);
        element.addEventListener("transitionend", onEnd);
      });
    });
  } else {
    element.style.setProperty("display", "none", "important");
  }
}

export function restoreHiddenElement(element: HTMLElement): void {
  if (!isHiddenElement(element)) return;

  finishHiddenElementAnimation(element);
  const inlineStyle = element.getAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  if (inlineStyle !== null) {
    element.setAttribute("style", inlineStyle);
    element.removeAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
  } else {
    element.style.removeProperty("display");
    element.style.removeProperty("visibility");
    element.style.removeProperty("opacity");
    element.style.removeProperty("transition");
    element.style.removeProperty("will-change");
    if (element.getAttribute("style") === "") element.removeAttribute("style");
  }
  element.removeAttribute(HIDDEN_ELEMENT_ATTRIBUTE);
  if (element.hasAttribute(ADDED_INERT_ATTRIBUTE)) {
    element.removeAttribute("inert");
    element.removeAttribute(ADDED_INERT_ATTRIBUTE);
  }
  if (!element.ownerDocument.querySelector(`[${HIDDEN_ELEMENT_ATTRIBUTE}="true"]`))
    releasePageScrollbar(element.ownerDocument);
}

export function restoreAllHiddenElements(documentRef: Document): void {
  documentRef
    .querySelectorAll<HTMLElement>(`[${HIDDEN_ELEMENT_ATTRIBUTE}="true"]`)
    .forEach(restoreHiddenElement);
  releasePageScrollbar(documentRef);
}

function preservePageScrollbar(documentRef: Document): void {
  const root = documentRef.documentElement;
  const view = documentRef.defaultView;
  // Keep an existing classic scrollbar track, including browsers with overlay scrollbar defaults.
  if (
    !view ||
    pageGutters.has(documentRef) ||
    view.innerWidth <= root.clientWidth ||
    view.getComputedStyle(root).overflowY === "scroll"
  )
    return;
  pageGutters.set(documentRef, {
    root,
    value: root.style.getPropertyValue("overflow-y"),
    priority: root.style.getPropertyPriority("overflow-y"),
    hadStyle: root.hasAttribute("style"),
  });
  root.style.setProperty("overflow-y", "scroll", "important");
}

export function releasePageScrollbar(documentRef: Document): void {
  const previous = pageGutters.get(documentRef);
  if (!previous) return;
  pageGutters.delete(documentRef);
  const root = previous.root;
  // Preserve a page's own later change instead of restoring over it.
  if (
    root.style.getPropertyValue("overflow-y") !== "scroll" ||
    root.style.getPropertyPriority("overflow-y") !== "important"
  )
    return;
  if (previous.value) root.style.setProperty("overflow-y", previous.value, previous.priority);
  else root.style.removeProperty("overflow-y");
  if (!previous.hadStyle && root.getAttribute("style") === "") root.removeAttribute("style");
}
