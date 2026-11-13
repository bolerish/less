import { Tooltip, TooltipProvider, TooltipTrigger } from "@bolerish/ui/tooltip";
import { Tooltip as TooltipPrimitive } from "@bolerish/ui/primitives";
import type { HiddenItemPreview, PreviewState } from "../content/hidden-item-preview";
import { Card, CardContent } from "@bolerish/ui/card";
import { Button } from "@bolerish/ui/button";
import {
  Timeline,
  TimelineContent,
  TimelineIndicator,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@bolerish/ui/timeline";
import {
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CursorClickIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import logo from "~assets/logo.svg";
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
    else if (previousView.current === "updates") updatesButton.current?.focus();
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
          <>
            <div className="brand">
              <img src={logo} alt="" width="22" height="22" />
              <span className="brand-name">Veil</span>
              <span className="preview-label">Veil · Preview</span>
            </div>
            <Button
              ref={updatesButton}
              variant="ghost"
              size="sm"
              onClick={() => {
                preview?.clear();
                setView("updates");
              }}
            >
              Updates
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setView("hidden")}>
              <CaretLeftIcon aria-hidden="true" />
              Back
            </Button>
            <h1 ref={updatesHeading} tabIndex={-1} className="updates-heading">
              Updates
            </h1>
          </>
        )}
        <Button
          ref={closeButton}
          variant="ghost"
          size="icon"
          aria-label="Close Veil"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>
      <div hidden={view !== "hidden"}>
        <HiddenItems
          origin={origin}
          onSelect={onSelect}
          preview={preview}
          portalContainer={portalContainer}
        />
      </div>
      {view === "updates" ? <Updates /> : null}
    </main>
  );
}

function Updates() {
  return (
    <section className="updates" aria-label="Product updates">
      <p className="muted">The latest changes, newest first.</p>
      <Timeline>
        {productUpdates.map((update) => (
          <TimelineItem key={update.version}>
            <TimelineIndicator />
            <TimelineContent>
              <TimelineTitle>
                <h2 className="update-version">
                  {update.version} ·{" "}
                  {update.status === "unreleased" ? "Not yet released" : "Released"}
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
        Installed version {browser.runtime.getManifest().version}
      </p>
    </section>
  );
}

function HiddenItems({
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
  const [previewState, setPreviewState] = useState<PreviewState>({ id: null, message: "" });
  useEffect(() => preview?.subscribe(setPreviewState), [preview]);
  const [records, setRecords] = useState<ManagedRecord[] | null>(null);
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
    if (active instanceof HTMLElement && active.classList.contains("locate-button"))
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [previewState.id]);

  const load = useCallback(async (): Promise<void> => {
    const current = ++revision.current;
    try {
      const response = await manageRecords({ type: "LIST_HIDDEN_ITEMS", origin });
      if (mounted.current && current === revision.current) {
        setRecords(response.records);
        setError("");
      }
    } catch (reason) {
      if (mounted.current && current === revision.current)
        setError(
          reason instanceof Error ? reason.message : "Could not load hidden items. Try again.",
        );
    }
  }, [origin]);

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
        request.type === "RESET_HIDDEN_SITE"
          ? "Site reset. Your saved hiding rules have been removed."
          : "Saved hiding rules updated.",
      );
      heading.current?.focus();
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : "Could not save changes. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function startSelection(): Promise<void> {
    setSelecting(true);
    setSelectionError("");
    try {
      onSelect();
    } catch (reason) {
      if (mounted.current)
        setSelectionError(
          reason instanceof Error
            ? reason.message
            : "Could not start selection. Reload the page and try again.",
        );
    } finally {
      if (mounted.current) setSelecting(false);
    }
  }

  return (
    <section
      aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key === "Escape" && (confirmReset || preview?.hasNotice)) {
          event.preventDefault();
          event.stopPropagation();
          if (preview?.hasNotice) preview.clear();
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
          aria-label={browser.i18n.getMessage("panel_current_site") || "Current site"}
          aria-description={
            browser.i18n.getMessage("panel_count_help") ||
            "Saved hiding rules across this site. Restoring an item decreases this count."
          }
        >
          <CardContent>
            <p className="eyebrow">
              {browser.i18n.getMessage("panel_current_site") || "Current site"}
            </p>
            <h1 ref={heading} tabIndex={-1} className="site-title">
              {origin.replace(/^https?:\/\//, "")}
            </h1>
            <p className="hidden-count" aria-live="polite">
              {records === null
                ? browser.i18n.getMessage("panel_loading") || "Loading hidden items…"
                : getHiddenCountLabel(records.length)}
            </p>
          </CardContent>
        </Card>
        <label className="preference">
          <input
            type="checkbox"
            checked={enabled ?? true}
            disabled={enabled === null || busy}
            onChange={(event) => {
              const value = event.currentTarget.checked;
              void setSiteHidingEnabled(origin, value).catch(() =>
                setError("Could not change site hiding. Try again."),
              );
            }}
          />
          Hide saved items on this site
        </label>
        <Button
          className="select-button"
          size="sm"
          disabled={busy || selecting || enabled !== true}
          onClick={() => void startSelection()}
        >
          <CursorClickIcon aria-hidden="true" />
          {selecting ? "Starting selection…" : "Hide an item"}
        </Button>
        {selectionError ? (
          <p className="selection-error" role="alert">
            Could not start selection. {selectionError}
          </p>
        ) : null}
        {enabled === false ? (
          <p className="muted">Hiding is paused. Enable it above to select an item.</p>
        ) : null}
      </div>
      {previewState.message ? (
        <div className="preview-notice" role="status">
          <p>{previewState.message}</p>
          {previewState.id ? (
            <Button variant="ghost" size="sm" onClick={() => preview?.clear()}>
              End preview
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="list-toolbar">
        <h2>Hidden items</h2>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
            Retry loading
          </Button>
        </div>
      ) : null}
      <p className="status" role="status">
        {busy ? "Saving changes…" : status}
      </p>
      {unsynced > 0 ? (
        <div className="notice" role="alert">
          <p>
            Rules were saved, but {unsynced} open {unsynced === 1 ? "page has" : "pages have"} not
            confirmed restoration. Reload those pages or retry page sync.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void mutate({ type: "SYNC_HIDDEN_SITE", origin: origin })}
          >
            Retry page sync
          </Button>
        </div>
      ) : null}
      {records === null && !error ? <p role="status">Loading hidden items…</p> : null}
      {records?.length === 0 ? (
        <div className="empty">
          <h2>Nothing hidden on this site</h2>
          <p>Items you hide with Veil will appear here.</p>
        </div>
      ) : null}
      {records && records.length > 0 ? (
        <>
          <TooltipProvider>
            <ul className="records" aria-label="Hidden items on this site">
              {records.map((record, index) => {
                const label = getRecordLabel(record);
                return (
                  <li key={record.id} className="record">
                    <div className="record-row">
                      <Button
                        className="locate-button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || !preview}
                        aria-label={`Locate item ${index + 1}: ${label}`}
                        aria-pressed={previewState.id === record.id}
                        onClick={(event) =>
                          void preview?.show(record.id, event.currentTarget.closest("dialog"))
                        }
                      >
                        <span className="record-label">{label}</span>
                      </Button>
                      <RestoreButton
                        label={`Restore item ${index + 1}: ${label}`}
                        disabled={busy}
                        portalContainer={portalContainer}
                        onRestore={() =>
                          void mutate({ type: "RESTORE_HIDDEN_ITEM", origin, id: record.id })
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
          <footer className="reset">
            {confirmReset ? (
              <div role="group" aria-label="Confirm site reset">
                <p>
                  Restore all {records.length} hidden items on this site? Saved hiding rules will be
                  removed.
                </p>
                <div className="actions">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void mutate({ type: "RESET_HIDDEN_SITE", origin: origin })}
                  >
                    Reset site
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
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmReset(true)}
              >
                Reset this site…
              </Button>
            )}
          </footer>
        </>
      ) : null}
    </section>
  );
}

function RestoreButton({
  label,
  disabled,
  onRestore,
  portalContainer,
}: {
  label: string;
  disabled: boolean;
  onRestore: () => void;
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
            aria-label={label}
            aria-describedby={open ? tooltipId : undefined}
            onClick={onRestore}
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
            <ArrowCounterClockwiseIcon aria-hidden="true" />
          </Button>
        }
      />
      <TooltipPrimitive.Portal container={portalContainer}>
        <TooltipPrimitive.Positioner side="left" sideOffset={6}>
          <TooltipPrimitive.Popup className="restore-tooltip" role="tooltip" id={tooltipId}>
            Restore this item
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

function getRecordLabel(record: ManagedRecord): string {
  const text = record.target.displayText?.replace(/\s+/g, " ").trim();
  const tag = record.target.tagName.toLowerCase();
  if (!text) return tag;
  const characters = Array.from(text);
  return `${tag} · ${characters.slice(0, 8).join("").trimEnd()}${characters.length > 8 ? "…" : ""}`;
}

function getHiddenCountLabel(count: number): string {
  const formatted = new Intl.NumberFormat(browser.i18n.getUILanguage()).format(count);
  const singular = new Intl.PluralRules(browser.i18n.getUILanguage()).select(count) === "one";
  const key = singular ? "panel_hidden_count_one" : "panel_hidden_count_other";
  return (
    browser.i18n.getMessage(key, formatted) || `${formatted} hidden ${singular ? "item" : "items"}`
  );
}
