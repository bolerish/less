import { getLanguage, subscribeLocale } from "~shared/locale/preference";
import type { PanelMessage } from "~features/record/management-messages";
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
import { getPaintedRect } from "~shared/lib/painted-rect";

export const HIGHLIGHT_ATTR = "data-less-highlight";
export const STATUS_BAR_ATTR = "data-less-ui";

let unsubscribeLocale: (() => void) | undefined;
let disposeHighlightTheme: (() => void) | undefined;
let disposeToolbarTheme: (() => void) | undefined;
let statusCount = 0;
let statusHasUndo = false;
let statusError: PanelMessage | null = null;

let _highlightEl: HTMLDivElement | null = null;
let _statusBarEl: HTMLDivElement | null = null;
let _statusInfoEl: HTMLSpanElement | null = null;
let _statusRestoreEl: HTMLButtonElement | null = null;

export function mountSelectionUI(onClose: () => void, onUndo: () => void): void {
  statusCount = 0;
  statusHasUndo = false;
  statusError = null;
  _highlightEl = buildHighlightOverlay();
  document.documentElement.appendChild(_highlightEl);

  const { wrapper, infoEl, restoreEl, closeBtn } = buildStatusBar(onClose, onUndo);
  _statusBarEl = wrapper;
  _statusInfoEl = infoEl;
  _statusRestoreEl = restoreEl;
  document.documentElement.appendChild(_statusBarEl);
  const syncLanguage = () => {
    wrapper.lang = getLanguage();
    infoEl.title = message("panel_selection_keys");
    closeBtn.setAttribute("aria-label", message("panel_selection_close"));
    restoreEl.setAttribute("aria-label", message("panel_selection_undo"));
    const error = statusError;
    updateStatusBarContent(statusCount, statusHasUndo);
    if (error) updateStatusBarError(error);
  };
  syncLanguage();
  unsubscribeLocale = subscribeLocale(syncLanguage);
}

export function unmountSelectionUI(): void {
  disposeHighlightTheme?.();
  disposeToolbarTheme?.();
  disposeHighlightTheme = undefined;
  disposeToolbarTheme = undefined;
  unsubscribeLocale?.();
  unsubscribeLocale = undefined;
  statusCount = 0;
  statusHasUndo = false;
  statusError = null;
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
  const rect = getPaintedRect(target);
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
  statusCount = count;
  statusHasUndo = hasUndo;
  statusError = null;
  if (_statusInfoEl) {
    _statusInfoEl.removeAttribute("role");
    _statusInfoEl.textContent =
      count > 0
        ? message(
            new Intl.PluralRules(getLanguage()).select(count) === "one"
              ? "panel_selection_count_one"
              : "panel_selection_count_other",
            [new Intl.NumberFormat(getLanguage()).format(count)],
          )
        : message("panel_selection_prompt");
  }
  if (_statusRestoreEl) {
    _statusRestoreEl.disabled = !hasUndo;
  }
}

export function updateStatusBarError(key: PanelMessage): void {
  statusError = key;
  if (!_statusInfoEl) return;
  _statusInfoEl.setAttribute("role", "alert");
  _statusInfoEl.textContent = message(key);
}

function buildHighlightOverlay(): HTMLDivElement {
  const { host, disposeTheme } = createSelectionSurface(HIGHLIGHT_ATTR, styles.highlight);
  disposeHighlightTheme = disposeTheme;
  host.setAttribute("aria-hidden", "true");
  setContentHostStyles(host, { top: "0", left: "0", display: "none" });
  return host;
}

function buildStatusBar(
  onClose: () => void,
  onUndo: () => void,
): {
  wrapper: HTMLDivElement;
  infoEl: HTMLSpanElement;
  restoreEl: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
} {
  const {
    host: wrapper,
    surface,
    disposeTheme,
  } = createSelectionSurface(STATUS_BAR_ATTR, styles.toolbar);
  disposeToolbarTheme = disposeTheme;
  setContentHostStyles(wrapper, {
    bottom: "74px",
    left: "50%",
    transform: "translateX(-50%) translateY(12px)",
    opacity: "0",
    zIndex: "2147483647",
    display: "inline-flex",
    alignItems: "center",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    width: "max-content",
    maxWidth: "calc(100vw - 24px)",
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
  infoEl.title = message("panel_selection_keys");
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

  return { wrapper, infoEl, restoreEl, closeBtn };
}

function createSeparator(): HTMLSpanElement {
  const sep = document.createElement("span");
  sep.className = stylex.props(styles.separator).className ?? "";
  return sep;
}

const styles = stylex.create({
  highlight: {
    backgroundColor: `color-mix(in srgb, ${colorVars.fgFeedbackInfo} 15%, transparent)`,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colorVars.fgFeedbackInfo,
    borderRadius: radiusVars.sm,
  },
  toolbar: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars.space2,
    width: "auto",
    minWidth: 0,
    height: "auto",
  },
  pill: {
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderRadius: radiusVars.full,
    padding: `${spacingVars.space2} ${spacingVars.space5}`,
    fontSize: typo.fontSizeXs,
    fontFamily: typo.fontFamilyBody,
    fontWeight: typo.fontWeightRegular,
    lineHeight: typo.lineHeightNormal,
    whiteSpace: "normal",
    boxShadow: shadowVars.overlay,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars.strokeControl,
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars.space2,
  },
  infoPill: {
    minWidth: 0,
    pointerEvents: "none",
  },
  closeButton: {
    flexShrink: 0,
    appearance: "none",
    borderWidth: 0,
    borderStyle: "none",
    padding: 0,
    fontFamily: "inherit",
    fontSize: typo.fontSizeXs,
    lineHeight: 1,
    color: colorVars.fgSecondary,
    cursor: "pointer",
    pointerEvents: "auto",
    outlineOffset: 2,
    // Scope native toolbar atoms so they cannot override the DS cascade layers.
    ":is(button)": {
      backgroundColor: "transparent",
      outline: { default: "none", ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    },
  },
  restoreButton: {
    flexShrink: 0,
    appearance: "none",
    padding: `${spacingVars.space2} ${spacingVars.space3}`,
    opacity: { default: 1, ":disabled": 0 },
    transform: { default: "scale(1) translateY(0)", ":disabled": "scale(0.9) translateY(4px)" },
    transition: "opacity 0.2s ease, transform 0.2s ease",
    cursor: "pointer",
    pointerEvents: { default: "auto", ":disabled": "none" },
    outlineOffset: 2,
    // Scope native toolbar atoms so they cannot override the DS cascade layers.
    ":is(button)": {
      outline: { default: "none", ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    },
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
    borderInlineStartColor: colorVars.strokeControl,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    flexShrink: 0,
  },
});
