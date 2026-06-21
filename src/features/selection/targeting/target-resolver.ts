import { isHideExcludedElement } from "~features/element-hiding/hide-policy";

import { resolveIframeFromPoint } from "./iframe-target-resolver";
import {
  isIgnorableEmptyElement,
  isIframeElement,
  isLargeViewportWrapperElement,
  isMeaninglessWrapperElement,
  hasMeaningfulOwnText,
  hasMeaningfulSelectionAttributes,
  hasVisibleBorder,
} from "./target-heuristics";

type IsIgnored = (element: HTMLElement) => boolean;

export function resolveSelectionTarget(
  documentRef: Document,
  x: number,
  y: number,
  isIgnored: IsIgnored = () => false,
): HTMLElement | null {
  const ignored = (el: HTMLElement): boolean => isIgnored(el) || isHideExcludedElement(el);

  const iframe = resolveIframeFromPoint(documentRef, x, y, ignored);
  if (iframe !== null) return iframe;

  const top = documentRef
    .elementsFromPoint(x, y)
    .find((el): el is HTMLElement => el instanceof HTMLElement && !ignored(el)) ?? null;

  if (top === null) return null;

  return resolveSelectableTarget(top);
}

function resolveSelectableTarget(element: HTMLElement): HTMLElement | null {
  const unwrapped = unwrapTarget(element);

  if (isIgnorableEmptyElement(unwrapped)) return null;

  return unwrapped;
}

function unwrapTarget(element: HTMLElement): HTMLElement {
  const iframe = element.querySelector("iframe");
  if (
    iframe !== null &&
    !hasMeaningfulOwnText(element) &&
    !hasMeaningfulSelectionAttributes(element) &&
    !hasVisibleBorder(element) &&
    isLargeViewportWrapperElement(element)
  ) {
    return iframe;
  }

  let current = element;
  while (isMeaninglessWrapperElement(current)) {
    const child = current.children[0];
    if (!(child instanceof HTMLElement)) break;
    current = child;
  }

  return current;
}

export { isIframeElement };
