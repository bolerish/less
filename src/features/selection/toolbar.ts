import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  radiusVars,
  spacingVars,
  shadowVars,
  typo,
} from "@bolerish/tokens/semantic.stylex";
import { getPanelMessage as message } from "~features/record/management-messages";
import { createSelectionSurface } from "~features/selection/surface";
import { setContentHostStyles } from "~shared/lib/content-host";
import { isPageDark } from "~features/selection/theme";

export const HIGHLIGHT_ATTR = "data-less-highlight";
export const STATUS_BAR_ATTR = "data-less-ui";

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
    setContentHostStyles(_highlightEl, { display: "none" });
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    setContentHostStyles(_highlightEl, { display: "none" });
    return;
  }
  setContentHostStyles(_highlightEl, {
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
  }
}

export function updateStatusBarError(message: string): void {
  if (!_statusInfoEl) return;
  _statusInfoEl.setAttribute("role", "alert");
  _statusInfoEl.textContent = message;
}

function buildHighlightOverlay(): HTMLDivElement {
  const { host } = createSelectionSurface(HIGHLIGHT_ATTR, isPageDark(), styles.highlight);
  host.setAttribute("aria-hidden", "true");
  setContentHostStyles(host, { top: "0", left: "0", display: "none" });
  return host;
}

function buildStatusBar(
  onClose: () => void,
  onUndo: () => void,
): { wrapper: HTMLDivElement; infoEl: HTMLSpanElement; restoreEl: HTMLButtonElement } {
  const { host: wrapper, surface } = createSelectionSurface(
    STATUS_BAR_ATTR,
    isPageDark(),
    styles.toolbar,
  );
  setContentHostStyles(wrapper, {
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
    setContentHostStyles(wrapper, { opacity: "1", transform: "translateX(-50%) translateY(0)" });
  });

  const mainPill = document.createElement("div");
  mainPill.className = stylex.props(styles.pill, styles.infoPill).className ?? "";

  const infoEl = document.createElement("span");
  infoEl.textContent = message("panel_selection_prompt");
  mainPill.appendChild(infoEl);

  mainPill.appendChild(createSeparator());

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", message("panel_selection_close"));
  closeBtn.className = stylex.props(styles.closeButton).className ?? "";
  closeBtn.textContent = "✕";
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
  restoreEl.className = stylex.props(styles.pill, styles.restoreButton).className ?? "";
  restoreEl.disabled = true;
  const undoIcon = document.createElement("span");
  undoIcon.textContent = "↺";
  undoIcon.setAttribute("aria-hidden", "true");
  undoIcon.className = stylex.props(styles.undoIcon).className ?? "";
  restoreEl.appendChild(undoIcon);
  restoreEl.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onUndo();
  });
  surface.appendChild(restoreEl);

  return { wrapper, infoEl, restoreEl };
}

function createSeparator(): HTMLSpanElement {
  const sep = document.createElement("span");
  sep.className = stylex.props(styles.separator).className ?? "";
  return sep;
}

const styles = stylex.create({
  highlight: {
    backgroundColor: `color-mix(in srgb, ${colorVars.fgFeedbackInfo} 15%, transparent)`,
    border: `2px solid ${colorVars.fgFeedbackInfo}`,
    borderRadius: radiusVars.sm,
  },
  toolbar: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars.space2,
    width: "auto",
    height: "auto",
  },
  pill: {
    background: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderRadius: radiusVars.full,
    padding: `${spacingVars.space2} ${spacingVars.space5}`,
    fontSize: typo.fontSizeXs,
    fontFamily: typo.fontFamilyBody,
    fontWeight: typo.fontWeightRegular,
    lineHeight: typo.lineHeightNormal,
    whiteSpace: "nowrap",
    boxShadow: shadowVars.overlay,
    border: `1px solid ${colorVars.strokeControl}`,
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars.space2,
  },
  infoPill: {
    pointerEvents: "none",
  },
  closeButton: {
    appearance: "none",
    background: "none",
    border: 0,
    padding: 0,
    fontFamily: "inherit",
    fontSize: typo.fontSizeXs,
    lineHeight: 1,
    color: colorVars.fgSecondary,
    cursor: "pointer",
    pointerEvents: "auto",
    outline: { default: "none", ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: 2,
  },
  restoreButton: {
    appearance: "none",
    padding: `${spacingVars.space2} ${spacingVars.space3}`,
    opacity: { default: 1, ":disabled": 0 },
    transform: { default: "scale(1) translateY(0)", ":disabled": "scale(0.9) translateY(4px)" },
    transition: "opacity 0.2s ease, transform 0.2s ease",
    cursor: "pointer",
    pointerEvents: { default: "auto", ":disabled": "none" },
    outline: { default: "none", ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: 2,
  },
  undoIcon: {
    fontSize: typo.fontSizeMd,
    lineHeight: 1,
    pointerEvents: "none",
  },
  separator: {
    display: "inline-block",
    width: 1,
    height: 12,
    background: colorVars.strokeControl,
    flexShrink: 0,
  },
});
