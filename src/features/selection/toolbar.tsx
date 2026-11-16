import { useId, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Badge } from "@bolerish/ui/badge";
import { Button } from "@bolerish/ui/button";
import { Kbd } from "@bolerish/ui/kbd";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@bolerish/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@bolerish/ui/primitives";
import { ArrowCounterClockwiseIcon, XIcon } from "@phosphor-icons/react";
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
let toolbarRoot: Root | null = null;
let toolbarSurface: HTMLDivElement | null = null;
let closeSelection: () => void;
let undoSelection: () => void;

export function mountSelectionUI(onClose: () => void, onUndo: () => void): void {
  statusCount = 0;
  statusHasUndo = false;
  statusError = null;
  _highlightEl = buildHighlightOverlay();
  document.documentElement.appendChild(_highlightEl);

  const { host, surface, disposeTheme } = createSelectionSurface(STATUS_BAR_ATTR, styles.toolbar);
  disposeToolbarTheme = disposeTheme;
  _statusBarEl = host;
  toolbarSurface = surface;
  closeSelection = onClose;
  undoSelection = onUndo;
  setContentHostStyles(host, {
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(12px)",
    opacity: "0",
    width: "max-content",
    maxWidth: "calc(100vw - 24px)",
    userSelect: "none",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  });
  document.documentElement.appendChild(host);
  toolbarRoot = createRoot(surface);
  requestAnimationFrame(() => {
    if (_statusBarEl !== host) return;
    setContentHostStyles(host, { opacity: "1", transform: "translateX(-50%) translateY(0)" });
  });
  const syncLanguage = () => {
    host.lang = getLanguage();
    renderToolbar();
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
  toolbarRoot?.unmount();
  toolbarRoot = null;
  toolbarSurface = null;
  _statusBarEl?.remove();
  _statusBarEl = null;
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
  renderToolbar();
}

export function updateStatusBarError(key: PanelMessage): void {
  statusError = key;
  renderToolbar();
}

function renderToolbar(): void {
  if (!toolbarSurface) return;
  const countMessage =
    statusCount > 0
      ? message(
          new Intl.PluralRules(getLanguage()).select(statusCount) === "one"
            ? "panel_selection_count_one"
            : "panel_selection_count_other",
          [new Intl.NumberFormat(getLanguage()).format(statusCount)],
        )
      : "";
  toolbarRoot?.render(
    <TooltipProvider>
      <div {...stylex.props(styles.pill)} data-selection-toolbar="true">
        <Badge variant="secondary" data-selection-mode="true">
          {message("panel_selection_prompt")}
        </Badge>
        <span {...stylex.props(styles.separator)} aria-hidden="true" />
        <span {...stylex.props(styles.shortcut)} title={message("panel_selection_keys")}>
          <Kbd>Shift</Kbd>
          {message("panel_selection_wider")}
        </span>
        {[
          {
            label: message("panel_selection_undo"),
            icon: ArrowCounterClockwiseIcon,
            action: undoSelection,
            disabled: !statusHasUndo,
          },
          {
            label: message("panel_selection_close"),
            icon: XIcon,
            action: closeSelection,
            disabled: false,
          },
        ].map(({ label, icon: Icon, action, disabled }) => (
          <ToolbarAction
            key={label}
            label={label}
            disabled={disabled}
            onClick={action}
            container={toolbarSurface!}
          >
            <Icon size={18} aria-hidden="true" />
          </ToolbarAction>
        ))}
      </div>
      <span {...stylex.props(styles.announcement)} role="status" aria-live="polite">
        {countMessage}
      </span>
      {statusError ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {message(statusError)}
        </p>
      ) : null}
    </TooltipProvider>,
  );
}

function ToolbarAction({
  label,
  disabled,
  onClick,
  container,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  container: HTMLElement;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span {...stylex.props(styles.action)}>
      <span {...stylex.props(styles.separator)} aria-hidden="true" />
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              shape="circle"
              aria-label={label}
              aria-describedby={open ? id : undefined}
              disabled={disabled}
              onClick={onClick}
              className={["less-control", stylex.props(styles.focus).className].join(" ")}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onPointerEnter={() => setOpen(true)}
              onPointerLeave={(event) => {
                if (!event.currentTarget.matches(":focus-visible")) setOpen(false);
              }}
            >
              {children}
            </Button>
          }
        />
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Positioner side="top" sideOffset={6}>
            <TooltipPrimitive.Popup role="tooltip" id={id} {...stylex.props(styles.tooltip)}>
              {label}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </span>
  );
}

function buildHighlightOverlay(): HTMLDivElement {
  const { host, disposeTheme } = createSelectionSurface(HIGHLIGHT_ATTR, styles.highlight);
  disposeHighlightTheme = disposeTheme;
  host.setAttribute("aria-hidden", "true");
  setContentHostStyles(host, { top: "0", left: "0", display: "none" });
  return host;
}

const styles = stylex.create({
  highlight: {
    backgroundColor: `color-mix(in srgb, ${colorVars.fgFeedbackInfo} 15%, transparent)`,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colorVars.fgFeedbackInfo,
    borderRadius: radiusVars.sm,
  },
  toolbar: { width: "auto", height: "auto", minWidth: 0 },
  pill: {
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderRadius: radiusVars.full,
    paddingBlock: spacingVars.space2,
    paddingInline: { default: spacingVars.space5, "@media (max-width: 375px)": spacingVars.space3 },
    fontSize: typo.fontSizeXs,
    fontFamily: typo.fontFamilyBody,
    fontWeight: typo.fontWeightRegular,
    lineHeight: typo.lineHeightNormal,
    boxShadow: shadowVars.overlay,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colorVars.strokeControl,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: { default: spacingVars.space2, "@media (max-width: 375px)": spacingVars.space1 },
    pointerEvents: "auto",
  },
  shortcut: {
    display: "inline-flex",
    alignItems: "center",
    gap: spacingVars.space1,
    whiteSpace: "nowrap",
    color: colorVars.fgSecondary,
  },
  action: {
    display: "inline-flex",
    alignItems: "center",
    gap: { default: spacingVars.space2, "@media (max-width: 375px)": spacingVars.space1 },
  },
  separator: {
    height: 12,
    borderInlineStartColor: colorVars.strokeControl,
    borderInlineStartWidth: 1,
    borderInlineStartStyle: "solid",
    flexShrink: 0,
  },
  focus: {
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
  },
  tooltip: {
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderRadius: radiusVars.sm,
    paddingBlock: spacingVars.space1,
    paddingInline: spacingVars.space2,
    boxShadow: shadowVars.overlay,
    fontFamily: typo.fontFamilyBody,
    fontSize: typo.fontSizeXs,
  },
  announcement: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  error: {
    margin: 0,
    marginTop: spacingVars.space2,
    padding: spacingVars.space2,
    borderRadius: radiusVars.sm,
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgFeedbackError,
    fontSize: typo.fontSizeSm,
  },
});
