import type { HiddenElementRecord } from "../schema";

const SEMANTIC_LAYOUT_TAG_NAMES = new Set(["aside", "footer", "header", "nav"]);
const SEMANTIC_LAYOUT_ROLE_NAMES = new Set(["banner", "complementary", "contentinfo", "navigation"]);
const LAYOUT_SCOPE_RECT_GAP_PX = 2;

const hasSimilarRect = (ref: HTMLElement, candidate: HTMLElement): boolean => {
  const refRect = ref.getBoundingClientRect();
  const candidateRect = candidate.getBoundingClientRect();
  return (
    Math.abs(refRect.width - candidateRect.width) <= LAYOUT_SCOPE_RECT_GAP_PX &&
    Math.abs(refRect.height - candidateRect.height) <= LAYOUT_SCOPE_RECT_GAP_PX
  );
};

const getNearestLayoutElement = (element: HTMLElement): HTMLElement | null =>
  element.closest<HTMLElement>(
    'header, nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]',
  );

const isLayoutLandmark = (element: HTMLElement): boolean => {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  return SEMANTIC_LAYOUT_TAG_NAMES.has(tagName) || (role !== null && SEMANTIC_LAYOUT_ROLE_NAMES.has(role));
};

export function deriveScope(element: HTMLElement): HiddenElementRecord["scope"] {
  const layoutElement = getNearestLayoutElement(element);
  if (layoutElement === null || !isLayoutLandmark(layoutElement)) return "page";
  return layoutElement === element || hasSimilarRect(layoutElement, element) ? "site-layout" : "page";
}
