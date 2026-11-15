export function getPaintedRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height !== 0) return rect;
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return rect;

  let { left, right, top, bottom } = rect;
  // Computed shadows serialize lengths in px; commas inside color functions are not separators.
  for (const shadow of getComputedStyle(element).boxShadow.split(/,(?![^()]*\))/)) {
    if (shadow.includes("inset") || /rgba\([^)]*,\s*0\)|\/\s*0\s*\)/.test(shadow)) continue;
    const lengths = shadow.match(/-?[\d.]+px/g)?.map(Number.parseFloat);
    if (!lengths || lengths.length < 3) continue;
    const [x, y, blur, spread = 0] = lengths;
    // shortcut: blur uses its CSS radius as a bound; refine if precise blurred-edge picking is needed.
    const extent = blur + spread;
    if (extent <= 0) continue;
    left = Math.min(left, rect.left + x - extent);
    right = Math.max(right, rect.right + x + extent);
    top = Math.min(top, rect.top + y - extent);
    bottom = Math.max(bottom, rect.bottom + y + extent);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}
