import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, radiusVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Badge } from "@bolerish/ui/badge";
import { Empty, EmptyDescription } from "@bolerish/ui/empty";
import { Heading } from "@bolerish/ui/heading";
import { ScrollArea, ScrollAreaViewport, ScrollAreaContent } from "@bolerish/ui/scroll-area";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { HiddenItemPreview, PreviewState } from "~features/element-hiding/preview";
import { getPanelMessage as message } from "~features/record/management-messages";
import type { ManagementRequest } from "~features/record/management";
import { useHiddenItems } from "./useHiddenItems";
import { SiteOverview } from "./SiteOverview";
import { RecordRow } from "./RecordRow";

export function HiddenItems({
  hasUnreadUpdates,
  updatesButton,
  onUpdates,
  origin,
  onSelect,
  preview,
  portalContainer,
}: {
  hasUnreadUpdates: boolean;
  updatesButton: RefObject<HTMLButtonElement | null>;
  onUpdates: () => void;
  origin: string;
  onSelect: () => void;
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
}) {
  const { records, refreshing, error, setError, status, busy, unsynced, refresh, mutate } =
    useHiddenItems(origin);
  const [previewState, setPreviewState] = useState<PreviewState>({ id: null, message: "" });
  const [confirmReset, setConfirmReset] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => preview?.subscribe(setPreviewState), [preview]);

  async function handleMutation(request: ManagementRequest): Promise<void> {
    preview?.clear();
    if (await mutate(request)) {
      setConfirmReset(false);
      heading.current?.focus();
    }
  }

  let feedback = status;
  if (refreshing) feedback = message("panel_loading");
  if (busy) feedback = message("panel_saving");
  return (
    <section
      {...stylex.props(styles.hiddenItems)}
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (confirmReset || preview?.hasNotice)) {
          event.preventDefault();
          event.stopPropagation();
          if (preview?.hasNotice) preview.clear(true);
          else {
            setConfirmReset(false);
            heading.current?.focus();
          }
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
        {previewState.message}
      </p>
      <div className={["list-toolbar", stylex.props(styles.listToolbar).className].join(" ")}>
        <h2 {...stylex.props(styles.heading, styles.listHeading)}>
          {message("panel_hidden_items")}
        </h2>
        <Button
          className={[
            "reset-button less-control",
            stylex.props(styles.controlFocus).className,
          ].join(" ")}
          xstyle={styles.resetButton}
          variant="ghost"
          size="sm"
          disabled={busy || !records?.length}
          onClick={() => setConfirmReset(true)}
        >
          {message("panel_reset")}
        </Button>
      </div>
      {confirmReset && records ? (
        <div
          className={["reset-confirmation", stylex.props(styles.resetConfirmation).className].join(
            " ",
          )}
          role="group"
          aria-label={message("panel_reset_group")}
        >
          <p {...stylex.props(styles.paragraph)}>
            {message("panel_reset_confirm", [String(records.length)])}
          </p>
          <div className={["actions", stylex.props(styles.actions).className].join(" ")}>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void handleMutation({ type: "RESET_HIDDEN_SITE", origin: origin })}
              className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
            >
              {message("panel_reset_all")}
            </Button>
            <Button
              autoFocus
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setConfirmReset(false);
                heading.current?.focus();
              }}
              className={["less-control", stylex.props(styles.controlFocus).className].join(" ")}
            >
              {message("panel_cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
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
        <Empty className="empty" xstyle={styles.empty}>
          <Heading level={2} size="subsection">
            {message("panel_empty_title")}
          </Heading>
          <EmptyDescription xstyle={styles.emptyDescription}>
            {message("panel_empty_help")}
          </EmptyDescription>
        </Empty>
      ) : null}
      {records && records.length > 0 ? (
        <ScrollArea xstyle={styles.recordsRoot}>
          <ScrollAreaViewport
            className="records"
            xstyle={styles.records}
            aria-label={message("panel_hidden_items")}
          >
            <ScrollAreaContent render={<ul />} xstyle={styles.recordsList}>
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
                    void handleMutation({ type: "RESTORE_HIDDEN_ITEM", origin, id: record.id })
                  }
                />
              ))}
            </ScrollAreaContent>
          </ScrollAreaViewport>
        </ScrollArea>
      ) : null}
      <footer className={["panel-footer", stylex.props(styles.panelFooter).className].join(" ")}>
        <Button
          size="sm"
          variant="ghost"
          ref={updatesButton}
          className={[
            "updates-button less-control",
            stylex.props(styles.controlFocus).className,
          ].join(" ")}
          xstyle={styles.updatesButton}
          aria-label={message(
            hasUnreadUpdates ? "panel_version_updates_unread" : "panel_version_updates",
            [browser.runtime.getManifest().version],
          )}
          onClick={onUpdates}
        >
          <Badge variant="outline">v{browser.runtime.getManifest().version}</Badge>
          {hasUnreadUpdates ? (
            <span
              className={["update-notice-dot", stylex.props(styles.updateNoticeDot).className].join(
                " ",
              )}
              aria-hidden="true"
            />
          ) : null}
        </Button>
      </footer>
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
  resetButton: {
    flexShrink: "0",
  },
  resetConfirmation: {
    maxHeight: "35dvh",
    overflow: "auto",
    paddingBlock: spacingVars.space3,
    flexShrink: 0,
  },
  paragraph: {
    marginBlock: spacingVars.space2,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: spacingVars.space2,
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
  empty: {
    alignItems: "stretch",
    gap: "0",
    border: "0",
    borderRadius: "0",
    padding: `${spacingVars.space6} 0`,
    textAlign: "start",
    flexShrink: 0,
  },
  emptyDescription: {
    fontSize: "inherit",
    lineHeight: "inherit",
    color: colorVars.fgSecondary,
  },
  recordsRoot: {
    flex: "1 1 0",
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
    height: "100%",
  },
  recordsList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  panelFooter: {
    marginTop: "auto",
    paddingTop: spacingVars.space3,
    borderTop: `1px solid ${colorVars.strokeDefault}`,
    display: { default: "block", ":is([data-preview-layout='compact'] *)": "none" },
    flexShrink: 0,
  },
  updatesButton: {
    flexShrink: "0",
  },
  updateNoticeDot: {
    position: "absolute",
    top: "2px",
    right: "2px",
    width: "6px",
    height: "6px",
    borderRadius: radiusVars.full,
    background: colorVars.fgPrimary,
    boxShadow: "0 0 0 2px var(--less-app-background)",
    pointerEvents: "none",
  },
  controlFocus: {
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
    scrollMarginBlock: `calc(${spacingVars.space8} * 2) ${spacingVars.space4}`,
  },
});
