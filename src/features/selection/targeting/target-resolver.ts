import { isHideExcludedElement } from "~features/element-hiding/hide-policy";
import { getPaintedRect } from "~shared/lib/painted-rect";

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
  const stack = documentRef.elementsFromPoint(x, y);
  const hit = stack.find((element) => element instanceof HTMLElement && !isIgnored(element));
  const emptyHit =
    hit instanceof HTMLElement &&
    isIgnorableEmptyElement(hit) &&
    getComputedStyle(hit).backgroundColor === "rgba(0, 0, 0, 0)" &&
    getComputedStyle(hit).boxShadow === "none";
  const collapsed = new Set(stack.flatMap((element) => Array.from(element.children)));
  for (const element of collapsed) {
    if (
      !(element instanceof HTMLElement) ||
      ignored(element) ||
      (!hit?.contains(element) && !emptyHit)
    )
      continue;
    const rect = element.getBoundingClientRect();
    if (rect.height !== 0 || rect.width <= 0) continue;
    const painted = getPaintedRect(element);
    if (
      painted.height > 0 &&
      x >= painted.left &&
      x <= painted.right &&
      y >= painted.top - 2 &&
      y <= painted.bottom + 2
    )
      return element;
  }

  const iframe = resolveIframeFromPoint(documentRef, x, y, ignored);
  if (iframe !== null) return resolveIframeContainer(iframe);

  const top =
    stack.find((el): el is HTMLElement => el instanceof HTMLElement && !ignored(el)) ?? null;

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
  const rect = getPaintedRect(el);
  return rect.width > 0 && rect.height > 0;
}

function resolveSelectableTarget(element: HTMLElement): HTMLElement | null {
  const unwrapped = unwrapTarget(element.closest<HTMLElement>("a, button") ?? element);
  if (isIgnorableEmptyElement(unwrapped)) return null;
  return elevateToCustomElementHost(unwrapped) ?? unwrapped;
}

export function resolveSelectionParent(
  element: HTMLElement,
  isIgnored: IsIgnored = () => false,
): HTMLElement | null {
  const parent = element.parentElement;
  if (
    parent === null ||
    isDocumentShell(parent) ||
    isIgnored(parent) ||
    isHideExcludedElement(parent) ||
    !hasNonZeroRect(parent)
  )
    return null;
  return parent;
}

// Polymer/LitElement scoped-CSS pattern: inner elements carry the host's tag
// name as a class (e.g. class="style-scope ytd-rich-shelf-renderer").
// When we detect this, elevate the target to the custom element itself so the
// user hides the whole component, not an anonymous internal wrapper.
function elevateToCustomElementHost(element: HTMLElement): HTMLElement | null {
  const hostTag = findCustomElementHostClass(element);
  if (hostTag === null) return null;
  const host = element.closest<HTMLElement>(hostTag);
  return host !== null && host !== element ? host : null;
}

function findCustomElementHostClass(element: HTMLElement): string | null {
  for (const cls of element.classList) {
    if (isCustomElementTagName(cls)) return cls;
  }
  return null;
}

function isCustomElementTagName(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name);
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
