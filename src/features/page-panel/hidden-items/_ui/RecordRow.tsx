import { getRecordLabel } from "../_lib/record-label";
import { usePreviewFocus } from "./usePreviewFocus";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, radiusVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Badge } from "@bolerish/ui/badge";
import { Button } from "@bolerish/ui/button";
import { Item } from "@bolerish/ui/item";
import { Tooltip, TooltipTrigger } from "@bolerish/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@bolerish/ui/primitives";
import { XIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import type { HiddenItemPreview } from "~features/element-hiding/preview";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import type { ManagedRecord } from "~features/record/management";

export function RecordRow({
  record,
  index,
  busy,
  selected,
  preview,
  portalContainer,
  onRestore,
}: {
  record: ManagedRecord;
  index: number;
  busy: boolean;
  selected: boolean;
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
  onRestore: () => void;
}) {
  const message = usePanelMessage();
  const label = getRecordLabel(record, message);
  const locateButton = usePreviewFocus(selected);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();

  return (
    <li className={["record", stylex.props(styles.record).className].join(" ")}>
      <Item
        className="record-row"
        xstyle={styles.recordRow}
        data-selected={selected ? "" : undefined}
        size="xs"
      >
        <Button
          ref={locateButton}
          className={["locate-button", stylex.props(styles.locateButton).className].join(" ")}
          variant="ghost"
          size="sm"
          disabled={busy || !preview}
          aria-label={message("panel_locate_label", [String(index + 1), label])}
          aria-pressed={selected}
          onClick={(event) => void preview?.show(record.id, event.currentTarget.closest("dialog"))}
        >
          <span className={["record-label", stylex.props(styles.recordLabel).className].join(" ")}>
            {label}
          </span>
          <Badge
            className={["record-tag", stylex.props(styles.recordTag).className].join(" ")}
            variant="outline"
            aria-hidden="true"
          >
            {record.target.tagName.toLowerCase()}
          </Badge>
        </Button>
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger
            render={
              <Button
                className={["restore-button", stylex.props(styles.restoreButton).className].join(
                  " ",
                )}
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={message("panel_restore_label", [String(index + 1), label])}
                aria-describedby={tooltipOpen ? tooltipId : undefined}
                onClick={onRestore}
                onFocus={() => setTooltipOpen(true)}
                onBlur={() => setTooltipOpen(false)}
                onPointerEnter={() => setTooltipOpen(true)}
                onPointerLeave={() => setTooltipOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && tooltipOpen) {
                    setTooltipOpen(false);
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                <XIcon {...stylex.props(styles.icon)} aria-hidden="true" />
              </Button>
            }
          />
          <TooltipPrimitive.Portal container={portalContainer}>
            <TooltipPrimitive.Positioner side="left" sideOffset={6}>
              <TooltipPrimitive.Popup
                className={["restore-tooltip", stylex.props(styles.restoreTooltip).className].join(
                  " ",
                )}
                role="tooltip"
                id={tooltipId}
              >
                {message("panel_restore_tooltip")}
              </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
          </TooltipPrimitive.Portal>
        </Tooltip>
      </Item>
    </li>
  );
}

const styles = stylex.create({
  record: {
    minWidth: "0",
    borderBottom: `1px solid ${colorVars.strokeDefault}`,
  },
  recordRow: {
    minHeight: "0",
    border: "0",
    paddingInline: "0",
    paddingBlock: spacingVars.space2,
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    borderRadius: radiusVars.sm,
    outline: {
      default: "none",
      ":hover": `2px solid ${colorVars.fgFeedbackInfo}`,
      ":focus-within": `2px solid ${colorVars.fgFeedbackInfo}`,
    },
    outlineOffset: -2,
    backgroundColor: {
      default: "transparent",
      ":hover": colorVars.interactionHover,
      ":focus-within": colorVars.interactionHover,
      ":has(button:active)": colorVars.interactionPressed,
      ":is([data-selected])": colorVars.bgSelected,
    },
    boxShadow: {
      default: "none",
      ":is([data-selected])": `inset 2px 0 ${colorVars.fgFeedbackInfo}`,
    },
  },
  locateButton: {
    ":is(.locate-button)": {
      flex: "1",
      minWidth: "0",
      justifyContent: "flex-start",
      height: "auto",
      minHeight: "40px",
      paddingInline: spacingVars.space2,
      textAlign: "start",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      backgroundColor: {
        default: "transparent",
        ":hover": "transparent",
        ":active": "transparent",
      },
      outline: { default: "none", ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
      outlineOffset: -2,
      scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
      "::after": { backgroundColor: "transparent" },
    },
  },
  recordLabel: {
    flex: "1",
    minWidth: "0",
    fontWeight: typo.fontWeightMedium,
  },
  recordTag: {
    ":is(.record-tag)": {
      flexShrink: "0",
      color: colorVars.fgSecondary,
      fontWeight: typo.fontWeightRegular,
    },
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  restoreButton: {
    outline: { ":focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
  restoreTooltip: {
    pointerEvents: "none",
    border: `1px solid ${colorVars.strokeDefault}`,
    background: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    padding: spacingVars.space2,
    borderRadius: radiusVars.sm,
    fontSize: typo.fontSizeXs,
  },
});
