import { getPaintedRect } from "~shared/lib/painted-rect";

// Center inside the uncovered page, letting each scroll container clamp to its own limits.
export function positionPreview(
  element: HTMLElement,
  panel: HTMLDialogElement | null,
  recenter = true,
): boolean {
  if (!recenter && hasVisibleTarget(element, panel)) return true;
  const bottom = panel ? Math.max(0, panel.getBoundingClientRect().top - 8) : innerHeight;
  const ancestors: HTMLElement[] = [];
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor !== element) ancestors.push(ancestor);
    // Scrolling the document cannot move a viewport-fixed target or its descendants.
    if (getComputedStyle(ancestor).position === "fixed") break;
  }
  // The outer scroll changes which portion of an inner container is available.
  for (let pass = 0; pass < 2; pass++) {
    for (const ancestor of ancestors) {
      const root = ancestor === document.scrollingElement;
      const style = getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      const left = root ? 0 : bounds.left + ancestor.clientLeft;
      const top = root ? 0 : bounds.top + ancestor.clientTop;
      const right = root ? innerWidth : left + ancestor.clientWidth;
      const end = root ? bottom : top + ancestor.clientHeight;
      const visibleLeft = Math.max(0, left);
      const visibleRight = Math.min(innerWidth, right);
      const visibleTop = Math.max(0, top);
      const visibleBottom = Math.min(bottom, end);
      const centerX =
        visibleRight > visibleLeft ? (visibleLeft + visibleRight) / 2 : (left + right) / 2;
      const centerY =
        visibleBottom > visibleTop ? (visibleTop + visibleBottom) / 2 : (top + end) / 2;
      const rect = getPaintedRect(element);
      const scrollX = root || /auto|scroll|hidden/.test(style.overflowX);
      const scrollY = root || /auto|scroll|hidden/.test(style.overflowY);
      ancestor.scrollTo({
        left: ancestor.scrollLeft + (scrollX ? rect.left + rect.width / 2 - centerX : 0),
        top: ancestor.scrollTop + (scrollY ? rect.top + rect.height / 2 - centerY : 0),
        behavior: "instant",
      });
    }
  }
  return hasVisibleTarget(element, panel);
}

function hasVisibleTarget(element: HTMLElement, panel: HTMLDialogElement | null): boolean {
  const rect = clippedRect(element);
  const target = getPaintedRect(element);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 || height <= 0) return false;
  if (!panel) return true;
  const overlay = panel.getBoundingClientRect();
  const beside = Math.max(
    Math.min(rect.right, overlay.left) - rect.left,
    rect.right - Math.max(rect.left, overlay.right),
  );
  const aboveOrBelow = Math.max(
    Math.min(rect.bottom, overlay.top) - rect.top,
    rect.bottom - Math.max(rect.top, overlay.bottom),
  );
  return (
    beside >= Math.min(80, width, target.width) ||
    aboveOrBelow >= Math.min(80, height, target.height)
  );
}

function clippedRect(element: HTMLElement) {
  const rect = getPaintedRect(element);
  let left = Math.max(0, rect.left);
  let right = Math.min(innerWidth, rect.right);
  let top = Math.max(0, rect.top);
  let bottom = Math.min(innerHeight, rect.bottom);
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor === document.scrollingElement) continue;
    const style = getComputedStyle(ancestor);
    const bounds = ancestor.getBoundingClientRect();
    if (style.overflowX !== "visible") {
      left = Math.max(left, bounds.left + ancestor.clientLeft);
      right = Math.min(right, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
    }
    if (style.overflowY !== "visible") {
      top = Math.max(top, bounds.top + ancestor.clientTop);
      bottom = Math.min(bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
    }
  }
  return { left, right, top, bottom };
}
