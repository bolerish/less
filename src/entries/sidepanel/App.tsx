import { Tooltip, TooltipProvider, TooltipTrigger } from "@bolerish/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@bolerish/ui/primitives";
import type { HiddenItemPreview, PreviewState } from "../content/hidden-item-preview";
import { Card, CardContent } from "@bolerish/ui/card";
import { Button } from "@bolerish/ui/button";
import { Badge } from "@bolerish/ui/badge";
import { Item } from "@bolerish/ui/item";
import { Empty, EmptyDescription } from "@bolerish/ui/empty";
import { Heading } from "@bolerish/ui/heading";
import { Switch } from "@bolerish/ui/switch";
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@bolerish/ui/timeline";
import { ArrowClockwiseIcon, CaretLeftIcon, CursorClickIcon, XIcon } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import logo from "~assets/logo.svg";
import { getPanelMessage as message } from "~features/record/management-messages";
import {
  manageRecords,
  type ManagedRecord,
  type ManagementRequest,
} from "~features/record/management";
import { productUpdates } from "~features/updates/releases";
import {
  getSiteHidingEnabled,
  setSiteHidingEnabled,
  subscribeSiteHidingEnabled,
} from "~features/hiding-preference";

export default function App({
  origin,
  onClose,
  onSelect,
  preview,
  portalContainer,
}: {
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
  origin: string;
  onClose: () => void;
  onSelect: () => void;
}) {
  const [view, setView] = useState<"hidden" | "updates">("hidden");
  const updatesButton = useRef<HTMLButtonElement>(null);
  const updatesHeading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    if (view === "updates") updatesHeading.current?.focus();
    else if (previousView.current === "updates")
      updatesButton.current?.focus({ preventScroll: true });
    previousView.current = view;
    updatesHeading.current?.closest("dialog")?.scrollTo(0, 0);
  }, [view]);

  return (
    <main
      className="panel"
      onKeyDown={(event) => {
        if (event.key === "Escape" && view === "updates") {
          event.preventDefault();
          event.stopPropagation();
          setView("hidden");
        }
      }}
    >
      <header className="panel-header">
        {view === "hidden" ? (
          <div className="brand">
            <img src={logo} alt="" width="22" height="22" />
            <span className="brand-name">Veil</span>
            <span className="preview-label">{message("panel_preview_title")}</span>
          </div>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setView("hidden")}>
              <CaretLeftIcon aria-hidden="true" />
              {message("panel_back")}
            </Button>
            <Heading
              level={1}
              size="subsection"
              ref={updatesHeading}
              tabIndex={-1}
              className="updates-heading"
            >
              {message("panel_updates")}
            </Heading>
          </>
        )}
        <Button
          ref={closeButton}
          variant="ghost"
          size="icon"
          aria-label={message("panel_close")}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div hidden={view !== "hidden"}>
        <TooltipProvider>
          <HiddenItems
            updatesButton={updatesButton}
            onUpdates={() => {
              preview?.clear();
              setView("updates");
            }}
            origin={origin}
            onSelect={onSelect}
            preview={preview}
            portalContainer={portalContainer}
          />
        </TooltipProvider>
      </div>
      {view === "updates" ? <Updates /> : null}
    </main>
  );
}

function Updates() {
  return (
    <section className="updates" aria-label={message("panel_updates")}>
      <p className="muted">{message("panel_updates_help")}</p>
      <Timeline>
        {productUpdates.map((update) => (
          <TimelineItem key={update.version}>
            <TimelineIndicator />
            <TimelineContent>
              <TimelineTitle>
                <h2 className="update-version">
                  {update.version} ·{" "}
                  {update.status === "unreleased"
                    ? message("panel_unreleased")
                    : message("panel_released")}
                </h2>
              </TimelineTitle>
              <TimelineTime dateTime={update.date}>
                {new Date(`${update.date}T00:00:00`).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </TimelineTime>
              <h3>{update.title}</h3>
              <ul>
                {update.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
      <p className="installed-version muted">
        {message("panel_installed_version", [browser.runtime.getManifest().version])}
      </p>
    </section>
  );
}

function HiddenItems({
  updatesButton,
  onUpdates,
  origin,
  onSelect,
  preview,
  portalContainer,
}: {
  updatesButton: RefObject<HTMLButtonElement | null>;
  onUpdates: () => void;
  origin: string;
  onSelect: () => void;
  preview?: HiddenItemPreview;
  portalContainer?: HTMLElement;
}) {
  const [previewState, setPreviewState] = useState<PreviewState>({ id: null, message: "" });
  useEffect(() => preview?.subscribe(setPreviewState), [preview]);
  const [records, setRecords] = useState<ManagedRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const pendingLoads = useRef(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const revision = useRef(0);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    if (!previewState.id) return;
    const shadow = heading.current?.getRootNode();
    if (!(shadow instanceof ShadowRoot)) return;
    const active = shadow.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("locate-button")) return;
    const list = active.closest<HTMLElement>(".records");
    if (!list) return;
    const row = active.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
    else if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
  }, [previewState.id]);

  const load = useCallback(async (): Promise<void> => {
    const current = ++revision.current;
    ++pendingLoads.current;
    setRefreshing(true);
    try {
      const response = await manageRecords({ type: "LIST_HIDDEN_ITEMS", origin });
      if (mounted.current && current === revision.current) {
        setRecords(response.records);
        setError("");
      }
    } catch {
      if (mounted.current && current === revision.current) setError(message("panel_load_error"));
    } finally {
      --pendingLoads.current;
      if (mounted.current) setRefreshing(pendingLoads.current > 0);
    }
  }, [origin]);

  function refresh(): void {
    if (busy || pendingLoads.current > 0) return;
    void load();
  }

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getSiteHidingEnabled(origin).then((value) => {
        if (active) setEnabled(value);
      });
    };
    refresh();
    const unsubscribe = subscribeSiteHidingEnabled(origin, refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [origin]);

  useEffect(() => {
    mounted.current = true;
    const onMessage = (message: unknown): void => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "HIDDEN_ITEMS_CHANGED"
      )
        void load();
    };
    const onFocus = (): void => {
      void load();
    };
    browser.runtime.onMessage.addListener(onMessage);
    const onStorage: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area === "local" && "veil:css:all" in changes) void load();
    };
    browser.storage.onChanged.addListener(onStorage);
    window.addEventListener("focus", onFocus);
    void load();
    return () => {
      mounted.current = false;
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function mutate(request: ManagementRequest): Promise<void> {
    preview?.clear();
    setBusy(true);
    setError("");
    setStatus("");
    ++revision.current;
    try {
      const response = await manageRecords(request);
      if (!mounted.current) return;
      ++revision.current;
      setRecords(response.records);
      setUnsynced(response.unsyncedTabs);
      setConfirmReset(false);
      setStatus(
        request.type === "RESET_HIDDEN_SITE" ? message("panel_reset_done") : message("panel_saved"),
      );
      heading.current?.focus();
    } catch {
      if (mounted.current) setError(message("panel_save_error"));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function startSelection(): Promise<void> {
    setSelecting(true);
    setSelectionError("");
    try {
      onSelect();
    } catch {
      if (mounted.current) setSelectionError(message("panel_selection_error"));
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }

  const hiddenCount = records === null ? null : getHiddenCount(records.length);
  let feedback = status;
  if (refreshing) feedback = message("panel_loading");
  if (busy) feedback = message("panel_saving");
  return (
    <section
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
      <div className="site-overview">
        <Card
          className="site-card"
          role="group"
          lang={browser.i18n.getUILanguage()}
          aria-label={message("panel_current_site")}
          aria-description={message("panel_count_help")}
        >
          <CardContent>
            <div className="site-identity">
              <p className="eyebrow">{message("panel_current_site")}</p>
              <Heading level={1} size="section" ref={heading} tabIndex={-1} className="site-title">
                {origin.replace(/^https?:\/\//, "")}
              </Heading>
            </div>
            <p className="hidden-count" aria-live="polite">
              <span className="count-value">{hiddenCount?.value ?? "…"}</span>{" "}
              <span className="count-noun">
                {hiddenCount?.noun ?? message("panel_hidden_items")}
              </span>
            </p>
          </CardContent>
        </Card>
        <label className="preference">
          <Switch
            size="sm"
            checked={enabled ?? true}
            disabled={enabled === null || busy}
            onCheckedChange={(value) => {
              void setSiteHidingEnabled(origin, value).catch(() =>
                setError(message("panel_preference_error")),
              );
            }}
          />
          {message("panel_enable_hiding")}
        </label>
        <Button
          className="select-button"
          size="sm"
          disabled={busy || selecting || enabled !== true}
          onClick={() => void startSelection()}
        >
          <CursorClickIcon aria-hidden="true" />
          {selecting ? message("panel_starting") : message("panel_select")}
        </Button>
        {selectionError ? (
          <p className="selection-error" role="alert">
            {selectionError}
          </p>
        ) : null}
        {enabled === false ? <p className="muted">{message("panel_paused")}</p> : null}
      </div>
      <p className="preview-status" role="status">
        {previewState.message}
      </p>
      <div className="list-toolbar">
        <h2>{message("panel_hidden_items")}</h2>
        <IconTooltipButton
          className="refresh-button"
          label={message("panel_refresh")}
          tooltip={message("panel_refresh")}
          disabled={busy || refreshing}
          loading={refreshing}
          portalContainer={portalContainer}
          onClick={refresh}
        >
          <ArrowClockwiseIcon aria-hidden="true" />
        </IconTooltipButton>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <Button variant="outline" size="sm" disabled={busy || refreshing} onClick={refresh}>
            {message("panel_retry_load")}
          </Button>
        </div>
      ) : null}
      <p className="status" role="status">
        {feedback}
      </p>
      {unsynced > 0 ? (
        <div className="notice" role="alert">
          <p>{message("panel_sync_notice", [String(unsynced)])}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void mutate({ type: "SYNC_HIDDEN_SITE", origin: origin })}
          >
            {message("panel_retry_sync")}
          </Button>
        </div>
      ) : null}
      {records?.length === 0 ? (
        <Empty className="empty">
          <Heading level={2} size="subsection">
            {message("panel_empty_title")}
          </Heading>
          <EmptyDescription>{message("panel_empty_help")}</EmptyDescription>
        </Empty>
      ) : null}
      {records && records.length > 0 ? (
        <ul className="records" aria-label={message("panel_hidden_items")}>
          {records.map((record, index) => {
            const label = getRecordLabel(record);
            return (
              <li key={record.id} className="record">
                <Item size="xs" className="record-row">
                  <Button
                    className="locate-button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || !preview}
                    aria-label={message("panel_locate_label", [String(index + 1), label])}
                    aria-pressed={previewState.id === record.id}
                    onClick={(event) =>
                      void preview?.show(record.id, event.currentTarget.closest("dialog"))
                    }
                  >
                    <span className="record-label">{label}</span>
                    <Badge className="record-tag" variant="outline" aria-hidden="true">
                      {record.target.tagName.toLowerCase()}
                    </Badge>
                  </Button>
                  <IconTooltipButton
                    className="restore-button"
                    tooltip={message("panel_restore_tooltip")}
                    label={message("panel_restore_label", [String(index + 1), label])}
                    disabled={busy}
                    portalContainer={portalContainer}
                    onClick={() =>
                      void mutate({ type: "RESTORE_HIDDEN_ITEM", origin, id: record.id })
                    }
                  >
                    <XIcon aria-hidden="true" />
                  </IconTooltipButton>
                </Item>
              </li>
            );
          })}
        </ul>
      ) : null}
      <footer className="reset">
        <div className="footer-links">
          <Button
            ref={updatesButton}
            className="updates-button"
            variant="ghost"
            size="sm"
            onClick={onUpdates}
          >
            {message("panel_updates")}
          </Button>
          {records && records.length > 0 && !confirmReset ? (
            <Button
              className="reset-button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmReset(true)}
            >
              {message("panel_reset")}
            </Button>
          ) : null}
        </div>
        {confirmReset && records ? (
          <div role="group" aria-label={message("panel_reset_group")}>
            <p>{message("panel_reset_confirm", [String(records.length)])}</p>
            <div className="actions">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void mutate({ type: "RESET_HIDDEN_SITE", origin: origin })}
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
              >
                {message("panel_cancel")}
              </Button>
            </div>
          </div>
        ) : null}
      </footer>
    </section>
  );
}

function IconTooltipButton({
  label,
  tooltip,
  className,
  children,
  disabled,
  loading = false,
  onClick,
  portalContainer,
}: {
  label: string;
  tooltip: string;
  className: string;
  children: ReactNode;
  disabled: boolean;
  loading?: boolean;
  onClick: () => void;
  portalContainer?: HTMLElement;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={className}
            aria-busy={loading}
            aria-label={label}
            aria-describedby={open ? tooltipId : undefined}
            onClick={onClick}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onPointerEnter={() => setOpen(true)}
            onPointerLeave={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                setOpen(false);
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {children}
          </Button>
        }
      />
      <TooltipPrimitive.Portal container={portalContainer}>
        <TooltipPrimitive.Positioner side="left" sideOffset={6}>
          <TooltipPrimitive.Popup className="restore-tooltip" role="tooltip" id={tooltipId}>
            {tooltip}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

function getRecordLabel(record: ManagedRecord): string {
  const tag = record.target.tagName.toLowerCase();
  let kind = record.target.contentKind;
  if (!kind) {
    if (tag === "video") kind = "video";
    else if (tag === "img") kind = "image";
    else if (["iframe", "object", "embed"].includes(tag)) kind = "external";
    else if (["div", "section", "aside", "header", "footer", "nav", "main"].includes(tag))
      kind = "region";
    else kind = "content";
  }
  const name = message(`panel_kind_${kind}`);
  const text = record.target.displayText?.replace(/\s+/g, " ").trim();
  if (!text || text.toLocaleLowerCase() === name.toLocaleLowerCase()) return name;
  const characters = Array.from(text);
  return `${name} · ${characters.slice(0, 24).join("").trimEnd()}${characters.length > 24 ? "…" : ""}`;
}

function getHiddenCount(count: number): { value: string; noun: string } {
  const formatted = new Intl.NumberFormat(browser.i18n.getUILanguage()).format(count);
  const singular = new Intl.PluralRules(browser.i18n.getUILanguage()).select(count) === "one";
  const suffix = singular ? "one" : "other";
  return {
    value: message(`panel_hidden_count_${suffix}`, [formatted]),
    noun: message(`panel_hidden_noun_${suffix}`),
  };
}
