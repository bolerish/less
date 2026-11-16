import { getRecordLabel } from "../_lib/record-label";
import { usePreviewFocus } from "./usePreviewFocus";
import * as stylex from "@stylexjs/stylex";
import { Badge } from "@bolerish/ui/badge";
import { Button } from "@bolerish/ui/button";
import { TableRow, TableCell } from "@bolerish/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bolerish/ui/tooltip";
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
  const label = text ? `${category} · ${text}` : category;
  const locateButton = usePreviewFocus(selected);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();

  return (
    <TableRow className="record record-row" data-selected={selected ? "" : undefined}>
      <TableCell>
        <Button
          ref={locateButton}
          className="locate-button"
          xstyle={styles.locatePlacement}
          align="start"
          variant={selected ? "secondary" : "ghost"}
          size="sm"
          disabled={busy || !preview}
          aria-label={message("panel_locate_label", [String(index + 1), label])}
          aria-pressed={selected}
          onClick={(event) => void preview?.show(record.id, event.currentTarget.closest("dialog"))}
        >
          <Badge className="record-kind" variant="outline" aria-hidden="true">
            {category}
          </Badge>
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
                className="restore-button"
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
                <XIcon aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent
            className="restore-tooltip"
            portalContainer={portalContainer}
            side="left"
            role="tooltip"
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
  locatePlacement: { width: "100%", minWidth: 0 },
  recordLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
});
