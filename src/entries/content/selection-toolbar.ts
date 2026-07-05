export const HIGHLIGHT_ATTR = "data-veil-highlight";
export const STATUS_BAR_ATTR = "data-veil-ui";

let _highlightEl: HTMLDivElement | null = null;
let _statusBarEl: HTMLDivElement | null = null;
let _statusInfoEl: HTMLSpanElement | null = null;
let _statusRestoreEl: HTMLDivElement | null = null;

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
    _highlightEl.style.display = "none";
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    _highlightEl.style.display = "none";
    return;
  }
  Object.assign(_highlightEl.style, {
    display: "block",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

export function updateStatusBarContent(count: number, hasUndo: boolean): void {
  if (_statusInfoEl) {
    _statusInfoEl.textContent = count > 0 ? `${count} Hidden` : "Hide";
  }
  if (_statusRestoreEl) {
    _statusRestoreEl.style.opacity = hasUndo ? "1" : "0";
    _statusRestoreEl.style.transform = hasUndo
      ? "scale(1) translateY(0)"
      : "scale(0.9) translateY(4px)";
    _statusRestoreEl.style.pointerEvents = hasUndo ? "auto" : "none";
  }
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
  const el = document.createElement("div");
  el.setAttribute(HIGHLIGHT_ATTR, "true");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    top: "0",
    left: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    background: "rgba(59,130,246,0.15)",
    border: "2px solid rgba(59,130,246,0.7)",
    borderRadius: "3px",
    boxSizing: "border-box",
    display: "none",
  });
  return el;
}

function buildStatusBar(
  onClose: () => void,
  onUndo: () => void,
): { wrapper: HTMLDivElement; infoEl: HTMLSpanElement; restoreEl: HTMLDivElement } {
  const isDark = isPageDark();

  const applyPillStyle = (el: HTMLDivElement): void => {
    Object.assign(el.style, {
      background: isDark ? "rgba(20,20,22,0.78)" : "rgba(255,255,255,0.72)",
      color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
      borderRadius: "9999px",
      padding: "8px 20px",
      fontSize: "13px",
      fontFamily: "system-ui,-apple-system,sans-serif",
      fontWeight: "450",
      lineHeight: "1.5",
      whiteSpace: "nowrap",
      boxShadow: isDark
        ? "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)"
        : "0 4px 20px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
      border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.07)",
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
    });
    el.style.setProperty("-webkit-backdrop-filter", "blur(20px) saturate(160%)");
    el.style.backdropFilter = "blur(20px) saturate(160%)";
  };

  const wrapper = document.createElement("div");
  wrapper.setAttribute(STATUS_BAR_ATTR, "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(12px)",
    opacity: "0",
    zIndex: "2147483647",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    userSelect: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  });
  requestAnimationFrame(() => {
    wrapper.style.opacity = "1";
    wrapper.style.transform = "translateX(-50%) translateY(0)";
  });

  const mainPill = document.createElement("div");
  applyPillStyle(mainPill);
  mainPill.style.pointerEvents = "none";

  const infoEl = document.createElement("span");
  infoEl.textContent = "Hide";
  mainPill.appendChild(infoEl);

  mainPill.appendChild(makeSeparator(isDark));

  const closeBtn = document.createElement("span");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    fontSize: "13px",
    lineHeight: "1",
    opacity: "0.5",
    cursor: "pointer",
    pointerEvents: "auto",
  });
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  });
  mainPill.appendChild(closeBtn);
  wrapper.appendChild(mainPill);

  const restoreEl = document.createElement("div");
  applyPillStyle(restoreEl);
  Object.assign(restoreEl.style, {
    padding: "8px 14px",
    opacity: "0",
    transform: "scale(0.9) translateY(4px)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    cursor: "pointer",
    pointerEvents: "none",
  });
  const undoIcon = document.createElement("span");
  undoIcon.textContent = "↺";
  Object.assign(undoIcon.style, { fontSize: "16px", lineHeight: "1", pointerEvents: "none" });
  restoreEl.appendChild(undoIcon);
  restoreEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo();
  });
  wrapper.appendChild(restoreEl);

  return { wrapper, infoEl, restoreEl };
}

function makeSeparator(isDark: boolean): HTMLSpanElement {
  const sep = document.createElement("span");
  Object.assign(sep.style, {
    display: "inline-block",
    width: "1px",
    height: "12px",
    background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
    flexShrink: "0",
  });
  return sep;
}
