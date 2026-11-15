import { getPanelMessage as message } from "../../features/record/management-messages";
import { createSelectionSurface, setSelectionHostStyles } from "./selection-surface";

export const HIGHLIGHT_ATTR = "data-veil-highlight";
export const STATUS_BAR_ATTR = "data-veil-ui";

let _highlightEl: HTMLDivElement | null = null;
let _statusBarEl: HTMLDivElement | null = null;
let _statusInfoEl: HTMLSpanElement | null = null;
let _statusRestoreEl: HTMLButtonElement | null = null;

export function mountSelectionUI(onClose: () => void, onUndo: () => void): void {
  _highlightEl = buildHighlightOverlay();
  document.documentElement.appendChild(_highlightEl);

  const { wrapper, infoEl, restoreEl } = buildStatusBar(onClose, onUndo);
  _statusBarEl = wrapper;
  _statusInfoEl = infoEl;
  _statusRestoreEl = restoreEl;
  document.documentElement.appendChild(_statusBarEl);
}

export function unmountSelectionUI(): void {
  _highlightEl?.remove();
  _highlightEl = null;
  _statusBarEl?.remove();
  _statusBarEl = null;
  _statusInfoEl = null;
  _statusRestoreEl = null;
}

export function updateHighlight(target: HTMLElement | null): void {
  if (!_highlightEl) return;
  if (target === null) {
    setSelectionHostStyles(_highlightEl, { display: "none" });
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    setSelectionHostStyles(_highlightEl, { display: "none" });
    return;
  }
  setSelectionHostStyles(_highlightEl, {
    display: "block",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

export function updateStatusBarContent(count: number, hasUndo: boolean): void {
  if (_statusInfoEl) {
    _statusInfoEl.removeAttribute("role");
    _statusInfoEl.textContent =
      count > 0
        ? message(
            new Intl.PluralRules(browser.i18n.getUILanguage()).select(count) === "one"
              ? "panel_selection_count_one"
              : "panel_selection_count_other",
            [new Intl.NumberFormat(browser.i18n.getUILanguage()).format(count)],
          )
        : message("panel_selection_prompt");
  }
  if (_statusRestoreEl) {
    _statusRestoreEl.disabled = !hasUndo;
    _statusRestoreEl.style.opacity = hasUndo ? "1" : "0";
    _statusRestoreEl.style.transform = hasUndo
      ? "scale(1) translateY(0)"
      : "scale(0.9) translateY(4px)";
    _statusRestoreEl.style.pointerEvents = hasUndo ? "auto" : "none";
  }
}

export function updateStatusBarError(message: string): void {
  if (!_statusInfoEl) return;
  _statusInfoEl.setAttribute("role", "alert");
  _statusInfoEl.textContent = message;
}

export function isPageDark(): boolean {
  const root = document.documentElement;

  const colorScheme = window.getComputedStyle(root).colorScheme;
  if (colorScheme.includes("dark")) return true;
  if (colorScheme.includes("light")) return false;

  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  if (document.body?.classList.contains("dark")) return true;
  if (document.body?.classList.contains("light")) return false;

  const theme = root.getAttribute("data-theme") ?? root.getAttribute("data-color-scheme");
  if (theme === "dark") return true;
  if (theme === "light") return false;

  const bgLuminance = (el: Element): number | null => {
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.1) return null;
    return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  };

  for (const el of [root, document.body]) {
    if (!el) continue;
    const lum = bgLuminance(el);
    if (lum !== null) return lum < 0.5;
  }

  const probe = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  let el: Element | null = probe ?? document.body;
  while (el && el !== root.parentElement) {
    const lum = bgLuminance(el);
    if (lum !== null) return lum < 0.5;
    el = el.parentElement;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function buildHighlightOverlay(): HTMLDivElement {
  const { host: el, surface } = createSelectionSurface(HIGHLIGHT_ATTR, isPageDark());
  el.setAttribute("aria-hidden", "true");
  setSelectionHostStyles(el, { top: "0", left: "0", display: "none" });
  Object.assign(surface.style, {
    background: "var(--veil-selection-fill)",
    border: "2px solid var(--veil-selection-stroke)",
    borderRadius: "var(--veil-radius-sm)",
  });
  return el;
}

function buildStatusBar(
  onClose: () => void,
  onUndo: () => void,
): { wrapper: HTMLDivElement; infoEl: HTMLSpanElement; restoreEl: HTMLButtonElement } {
  const applyPillStyle = (el: HTMLElement): void => {
    Object.assign(el.style, {
      background: "var(--veil-color-bg-raised)",
      color: "var(--veil-color-fg-primary)",
      borderRadius: "var(--veil-radius-full)",
      padding: "var(--veil-spacing-space-2) var(--veil-spacing-space-5)",
      fontSize: "var(--veil-font-size-xs)",
      fontFamily: "var(--veil-font-family-body)",
      fontWeight: "var(--veil-font-weight-regular)",
      lineHeight: "var(--veil-line-height-normal)",
      whiteSpace: "nowrap",
      boxShadow: "var(--veil-shadow-overlay)",
      border: "1px solid var(--veil-color-stroke-control)",
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--veil-spacing-space-2)",
    });
  };

  const { host: wrapper, surface } = createSelectionSurface(STATUS_BAR_ATTR, isPageDark());
  setSelectionHostStyles(wrapper, {
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(12px)",
    opacity: "0",
    zIndex: "2147483647",
    display: "inline-flex",
    alignItems: "center",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    userSelect: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  });
  requestAnimationFrame(() => {
    setSelectionHostStyles(wrapper, { opacity: "1", transform: "translateX(-50%) translateY(0)" });
  });

  Object.assign(surface.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--veil-spacing-space-2)",
    width: "auto",
    height: "auto",
  });

  const mainPill = document.createElement("div");
  applyPillStyle(mainPill);
  mainPill.style.pointerEvents = "none";

  const infoEl = document.createElement("span");
  infoEl.textContent = message("panel_selection_prompt");
  mainPill.appendChild(infoEl);

  mainPill.appendChild(makeSeparator());

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", message("panel_selection_close"));
  Object.assign(closeBtn.style, {
    appearance: "none",
    background: "none",
    border: "0",
    padding: "0",
    font: "inherit",
  });
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    fontSize: "var(--veil-font-size-xs)",
    lineHeight: "1",
    color: "var(--veil-color-fg-secondary)",
    cursor: "pointer",
    pointerEvents: "auto",
  });
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  });
  mainPill.appendChild(closeBtn);
  surface.appendChild(mainPill);

  const restoreEl = document.createElement("button");
  restoreEl.type = "button";
  restoreEl.setAttribute("aria-label", message("panel_selection_undo"));
  restoreEl.style.appearance = "none";
  applyPillStyle(restoreEl);
  Object.assign(restoreEl.style, {
    padding: "var(--veil-spacing-space-2) var(--veil-spacing-space-3)",
    opacity: "0",
    transform: "scale(0.9) translateY(4px)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    cursor: "pointer",
    pointerEvents: "none",
  });
  const undoIcon = document.createElement("span");
  undoIcon.textContent = "↺";
  undoIcon.setAttribute("aria-hidden", "true");
  Object.assign(undoIcon.style, {
    fontSize: "var(--veil-font-size-md)",
    lineHeight: "1",
    pointerEvents: "none",
  });
  restoreEl.appendChild(undoIcon);
  restoreEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo();
  });
  surface.appendChild(restoreEl);

  return { wrapper, infoEl, restoreEl };
}

function makeSeparator(): HTMLSpanElement {
  const sep = document.createElement("span");
  Object.assign(sep.style, {
    display: "inline-block",
    width: "1px",
    height: "12px",
    background: "var(--veil-color-stroke-control)",
    flexShrink: "0",
  });
  return sep;
}
