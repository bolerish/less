import { isHideExcludedElement } from "~features/element-hiding/hide-policy";

import { resolveIframeFromPoint } from "./iframe-target-resolver";
import {
  hasMeaningfulOwnText,
  hasMeaningfulSelectionAttributes,
  isIgnorableEmptyElement,
  isIframeElement,
  isLargeViewportWrapperElement,
  isMeaninglessWrapperElement,
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
  if (iframe !== null) return resolveIframeContainer(iframe);

  const top =
    documentRef
      .elementsFromPoint(x, y)
      .find((el): el is HTMLElement => el instanceof HTMLElement && !ignored(el)) ?? null;

  if (top === null) return null;

  return resolveSelectableTarget(top);
}

function resolveIframeContainer(iframe: HTMLIFrameElement): HTMLElement {
  let current: HTMLElement = iframe;
  let parent = current.parentElement;

  while (parent !== null && !isDocumentShell(parent)) {
    if (!isIframeWrapperElement(parent, current)) break;
    current = parent;
    parent = current.parentElement;
  }

  return current;
}

function isDocumentShell(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === "html" || tag === "body" || tag === "head";
}

function isIframeWrapperElement(parent: HTMLElement, child: HTMLElement): boolean {
  if (hasMeaningfulOwnText(parent)) return false;
  if (hasMeaningfulSelectionAttributes(parent)) return false;

  const visibleSiblings = Array.from(parent.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c !== child && hasNonZeroRect(c),
  );
  return visibleSiblings.length === 0;
}

function hasNonZeroRect(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
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
    return resolveIframeContainer(iframe);
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
