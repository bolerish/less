const INTERACTIVE_TAG_NAMES = new Set([
  "a",
  "button",
  "canvas",
  "input",
  "select",
  "summary",
  "textarea",
  "video",
]);
const VISUAL_DESCENDANT_SELECTOR = "iframe, img, svg, canvas, video, picture, object, embed";
const MEANINGFUL_ATTRIBUTE_NAMES = new Set(["title", "alt"]);

export function isIframeElement(element: HTMLElement): boolean {
  return element.tagName.toLowerCase() === "iframe";
}

export function isLargeViewportWrapperElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width >= window.innerWidth * 0.5 || rect.height >= window.innerHeight * 0.5;
}

export function isMeaninglessWrapperElement(element: HTMLElement): boolean {
  if (isIframeElement(element)) return false;
  if (hasVisibleBorder(element)) return false;
  if (hasMeaningfulOwnText(element) || hasMeaningfulSelectionAttributes(element)) return false;
  if (element.children.length !== 1) return false;

  const child = element.children[0];
  if (!(child instanceof HTMLElement)) return false;

  return hasSimilarRect(element, child);
}

export function isIgnorableEmptyElement(element: HTMLElement): boolean {
  if (isIframeElement(element) || isInteractiveElement(element)) return false;
  if (hasMeaningfulOwnText(element) || hasMeaningfulSelectionAttributes(element)) return false;
  if (hasVisualDescendant(element)) return false;
  if (hasVisibleBorder(element)) return false;
  if (element.children.length !== 0) return false;

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function hasMeaningfulOwnText(element: HTMLElement): boolean {
  const ownText = Array.from(element.childNodes)
    .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join(" ");

  return normalizeText(ownText) !== undefined;
}

export function hasMeaningfulSelectionAttributes(element: HTMLElement): boolean {
  return Array.from(element.attributes).some(({ name, value }) => {
    if (value.trim().length === 0) return false;
    return (
      MEANINGFUL_ATTRIBUTE_NAMES.has(name) || (name.startsWith("aria-") && name !== "aria-hidden")
    );
  });
}

export function hasVisibleBorder(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const styles = [
    style.borderTopStyle,
    style.borderRightStyle,
    style.borderBottomStyle,
    style.borderLeftStyle,
  ];
  const widths = [
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ];

  return styles.some((s, i) => {
    if (s === "none" || s === "hidden") return false;
    return Number.parseFloat(widths[i] ?? "0") > 0;
  });
}

function hasVisualDescendant(element: HTMLElement): boolean {
  return element.querySelector(VISUAL_DESCENDANT_SELECTOR) !== null;
}

function isInteractiveElement(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  return (
    INTERACTIVE_TAG_NAMES.has(tag) ||
    element.hasAttribute("contenteditable") ||
    element.hasAttribute("onclick") ||
    element.tabIndex >= 0 ||
    element.getAttribute("role") === "button" ||
    element.getAttribute("role") === "link"
  );
}

function hasSimilarRect(parent: HTMLElement, child: HTMLElement): boolean {
  const pr = parent.getBoundingClientRect();
  const cr = child.getBoundingClientRect();
  return Math.abs(pr.width - cr.width) <= 2 && Math.abs(pr.height - cr.height) <= 2;
}

function normalizeText(value: string): string | undefined {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length === 0 ? undefined : v;
}
