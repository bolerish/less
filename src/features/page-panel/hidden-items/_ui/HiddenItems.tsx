import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  spacingVars,
  radiusVars,
  sizeVars,
  typo,
} from "@bolerish/tokens/semantic.stylex";
import { Table, TableBody, TableContainer } from "@bolerish/ui/table";
import { Button } from "@bolerish/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@bolerish/ui/empty";
import { ScrollArea, ScrollAreaViewport, ScrollAreaContent } from "@bolerish/ui/scroll-area";
import { useRef, useState } from "react";
import type { HiddenItemPreview } from "~features/element-hiding/preview";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import type { ManagementRequest } from "~features/record/management";
import { useHiddenItems } from "../_model/useHiddenItems";
import { usePreviewState } from "../_model/usePreviewState";
import { SiteOverview } from "./SiteOverview";
import { RecordRow } from "./RecordRow";
import { ResetDialog } from "./ResetDialog";
import { useRefreshOnFocus } from "./useRefreshOnFocus";
import { SelectionIcon } from "@phosphor-icons/react";

export function HiddenItems({
  origin,
  onSelect,
  preview,
  portalContainer,
}: {
  origin: string;
  onSelect: () => void;
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
}) {
  const message = usePanelMessage();
  const {
    records,
    refreshing,
    error: errorKey,
    setError,
    status: statusKey,
    busy,
    unsynced,
    refresh,
    reload,
    mutate,
  } = useHiddenItems(origin);
  useRefreshOnFocus(reload);
  const error = errorKey ? message(errorKey) : "";
  const previewState = usePreviewState(preview);
  const [confirmReset, setConfirmReset] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  async function handleMutation(request: ManagementRequest): Promise<void> {
    preview?.clear();
    if (await mutate(request)) {
      setConfirmReset(false);
      heading.current?.focus();
    }
  }

  let feedback = statusKey ? message(statusKey) : "";
  if (refreshing) feedback = message("panel_loading");
  if (busy) feedback = message("panel_saving");
  return (
    <section
      {...stylex.props(styles.hiddenItems)}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key === "Escape" && preview?.hasNotice) {
          event.preventDefault();
          event.stopPropagation();
          preview.clear(true);
        }
      }}
    >
      <SiteOverview
        origin={origin}
        count={records?.length ?? null}
        busy={busy}
        heading={heading}
        onSelect={onSelect}
        onError={setError}
      />
      <p
        className={["preview-status", stylex.props(styles.previewStatus).className].join(" ")}
        role="status"
      >
        {previewState.message ? message(previewState.message) : ""}
      </p>
      <div className={["list-toolbar", stylex.props(styles.listToolbar).className].join(" ")}>
        <h2 {...stylex.props(styles.heading, styles.listHeading)}>
          {message("panel_hidden_items")}
        </h2>
        <ResetDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          count={records?.length ?? null}
          busy={busy}
          error={error}
          heading={heading}
          portalContainer={portalContainer}
          onBeforeOpen={() => {
            preview?.clear();
            setError("");
          }}
          onReset={() => void handleMutation({ type: "RESET_HIDDEN_SITE", origin })}
        />
      </div>
      {error && !confirmReset ? (
        <div
          className={["notice error", stylex.props(styles.notice, styles.error).className].join(
            " ",
          )}
          role="alert"
        >
          <p {...stylex.props(styles.paragraph)}>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || refreshing}
            onClick={refresh}
            className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
          >
            {message("panel_retry_load")}
          </Button>
        </div>
      ) : null}
      <p className={["status", stylex.props(styles.status).className].join(" ")} role="status">
        {feedback}
      </p>
      {unsynced > 0 ? (
        <div className={["notice", stylex.props(styles.notice).className].join(" ")} role="alert">
          <p {...stylex.props(styles.paragraph)}>
            {message("panel_sync_notice", [String(unsynced)])}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleMutation({ type: "SYNC_HIDDEN_SITE", origin: origin })}
            className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
          >
            {message("panel_retry_sync")}
          </Button>
        </div>
      ) : null}
      {records?.length === 0 ? (
        <Empty className="empty">
          <EmptyHeader>
            <EmptyMedia>
              <SelectionIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{message("panel_empty_title")}</EmptyTitle>
            <EmptyDescription>{message("panel_empty_help")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {records && records.length > 0 ? (
        <ScrollArea xstyle={styles.recordsRoot}>
          <ScrollAreaViewport
            className="records"
            xstyle={styles.records}
            role="region"
            aria-label={message("panel_hidden_items")}
          >
            <ScrollAreaContent>
              <TableContainer>
                <Table
                  aria-label={message("panel_hidden_items")}
                  style={{ tableLayout: "fixed", minWidth: "16rem" }}
                >
                  <colgroup>
                    <col />
                    <col
                      style={{ width: `calc(${sizeVars.controlMd} + ${spacingVars.space3} * 2)` }}
                    />
                  </colgroup>
                  <TableBody>
                    {records.map((record, index) => (
                      <RecordRow
                        key={record.id}
                        record={record}
                        index={index}
                        busy={busy}
                        selected={previewState.id === record.id}
                        preview={preview}
                        portalContainer={portalContainer}
                        onRestore={() =>
                          void handleMutation({
                            type: "RESTORE_HIDDEN_ITEM",
                            origin,
                            id: record.id,
                          })
                        }
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </ScrollAreaContent>
          </ScrollAreaViewport>
        </ScrollArea>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  hiddenItems: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  previewStatus: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "0",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  listToolbar: {
    display: { default: "flex", ":is([data-preview-layout='compact'] *)": "none" },
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacingVars.space2,
    paddingBlock: spacingVars.space2,
    borderBottom: `1px solid ${colorVars.strokeDefault}`,
    flexShrink: 0,
  },
  heading: {
    fontSize: typo.fontSizeSm,
    fontWeight: typo.fontWeightMedium,
    margin: 0,
  },
  listHeading: {
    color: colorVars.fgSecondary,
    fontWeight: typo.fontWeightSemibold,
  },
  paragraph: {
    marginBlock: spacingVars.space2,
  },
  notice: {
    border: `1px solid ${colorVars.strokeDefault}`,
    borderRadius: radiusVars.sm,
    padding: spacingVars.space3,
    marginBlock: spacingVars.space3,
    background: colorVars.bgSurface,
    flexShrink: 0,
  },
  error: {
    borderColor: colorVars.fgFeedbackError,
  },
  status: {
    color: colorVars.fgSecondary,
    flexShrink: 0,
    marginBlock: { default: spacingVars.space2, ":empty": 0 },
  },

  recordsRoot: {
    flex: { default: "1 1 0", "@container less-panel (max-width: 14rem)": "none" },
    minHeight: 48,
  },
  records: {
    minHeight: "48px",
    overflow: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
    listStyle: "none",
    padding: "0",
    margin: "0",
    height: { default: "100%", "@container less-panel (max-width: 14rem)": "auto" },
  },
  controlFocus: {
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
