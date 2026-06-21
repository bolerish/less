type IsIgnored = (element: HTMLElement) => boolean;

export function resolveIframeFromPoint(
  documentRef: Document,
  x: number,
  y: number,
  isIgnored: IsIgnored,
): HTMLIFrameElement | null {
  const fromStack = documentRef
    .elementsFromPoint(x, y)
    .find((el): el is HTMLIFrameElement => el instanceof HTMLIFrameElement && !isIgnored(el));

  if (fromStack !== undefined) return fromStack;

  const iframes = Array.from(documentRef.querySelectorAll("iframe")).filter((el) => {
    if (isIgnored(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && isPointInRect(rect, x, y);
  });

  if (iframes.length === 0) return null;

  return iframes.sort(compareByStackOrder)[0];
}

function isPointInRect(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function compareByStackOrder(a: HTMLIFrameElement, b: HTMLIFrameElement): number {
  const az = parseZIndex(a);
  const bz = parseZIndex(b);
  if (az !== bz) return bz - az;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
}

function parseZIndex(el: HTMLElement): number {
  const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}
