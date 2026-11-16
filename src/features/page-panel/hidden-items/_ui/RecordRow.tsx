import { getRecordLabel } from "../_lib/record-label";
import { usePreviewFocus } from "./usePreviewFocus";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, sizeVars } from "@bolerish/tokens/semantic.stylex";
import { Badge } from "@bolerish/ui/badge";
import { Button } from "@bolerish/ui/button";
import { TableRow, TableCell } from "@bolerish/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@bolerish/ui/tooltip";
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
  const { category, text } = getRecordLabel(record, message);
  const label = text ? `${category} ${text}` : category;
  const locateButton = usePreviewFocus(selected);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();

  return (
    <TableRow className="record record-row" data-selected={selected ? "" : undefined}>
      <TableCell>
        <Button
          ref={locateButton}
          className={["locate-button", stylex.props(styles.locateButton).className].join(" ")}
          variant={selected ? "secondary" : "ghost"}
          align="start"
          size="sm"
          xstyle={styles.previewWidth}
          // TableCell owns insets; saved labels need multiline height.
          style={{
            padding: 0,
            height: "auto",
            minHeight: sizeVars.controlSm,
            whiteSpace: "normal",
            textAlign: "start",
          }}
          disabled={busy || !preview}
          aria-label={message("panel_locate_label", [String(index + 1), label])}
          aria-pressed={selected}
          onClick={(event) => void preview?.show(record.id, event.currentTarget.closest("dialog"))}
        >
          <Badge className="record-kind" variant="outline" aria-hidden="true">
            {category}
          </Badge>{" "}
          {text ? (
            <span
              className={["record-label", stylex.props(styles.recordLabel).className].join(" ")}
            >
              {text}
            </span>
          ) : null}
        </Button>
      </TableCell>
      <TableCell>
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger
            render={
              <Button
                style={{ padding: 0 }}
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
          <TooltipContent
            portalContainer={portalContainer}
            side="left"
            className="restore-tooltip"
            id={tooltipId}
          >
            {message("panel_restore_tooltip")}
          </TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

const styles = stylex.create({
  previewWidth: { width: "100%", minWidth: 0 },
  locateButton: {
    // TableRow owns hover; the inner action retains the Button's keyboard focus.
    ":is(.locate-button)::after": { backgroundColor: colorVars.interactionDefault },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
  recordLabel: {
    flex: "1",
    minWidth: "0",
    overflowWrap: "anywhere",
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  restoreButton: {
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
