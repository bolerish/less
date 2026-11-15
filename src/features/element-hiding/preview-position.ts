import { getPaintedRect } from "~shared/lib/painted-rect";

// Position the temporary target without changing the website's layout or scroll behavior.
export function positionPreview(element: HTMLElement, panel: HTMLDialogElement | null): boolean {
  const rect = getPaintedRect(element);
  const visible = clippedRect(element);
  if (
    visible.right - visible.left < Math.min(80, rect.width) ||
    visible.bottom - visible.top < Math.min(80, rect.height)
  ) {
    element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }
  if (!panel) return hasVisibleTarget(element, null);

  if (innerWidth < 760 || !hasVisibleTarget(element, panel)) {
    panel.dataset.previewLayout = "compact";
    delete panel.dataset.previewEdge;
    // Compact placement has no transition; its layout is available synchronously.
    if (!hasVisibleTarget(element, panel)) panel.dataset.previewEdge = "top";
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
