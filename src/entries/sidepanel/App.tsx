import { Button } from "@bolerish/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bolerish/ui/tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import logo from "~assets/logo.svg";
import {
  manageRecords,
  type ManagedRecord,
  type ManagementRequest,
} from "~features/record/management";
import { productUpdates } from "~features/updates/releases";
import { useActiveSite, type ActiveSite } from "./useActiveSite";

export default function App() {
  const { site, loading, error } = useActiveSite();
  return (
    <main className="panel">
      <header className="brand">
        <img src={logo} alt="" width="24" height="24" />
        <span>Veil</span>
      </header>
      <Tabs defaultValue="hidden" variant="underline">
        <TabsList aria-label="Veil views">
          <TabsTrigger value="hidden">Hidden items</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
        </TabsList>
        <TabsContent value="hidden" keepMounted>
          {loading ? <p role="status">Finding the current site…</p> : null}
          {error ? (
            <p role="alert">Veil could not find the current tab. Reopen this panel to try again.</p>
          ) : null}
          {!loading && !error && !site ? (
            <section className="empty">
              <h1>Open a website</h1>
              <p>Switch to a regular web page to manage its hidden items.</p>
            </section>
          ) : null}
          {site ? <HiddenItems key={`${site.tabId}:${site.origin}`} site={site} /> : null}
        </TabsContent>
        <TabsContent value="updates">
          <h1>Updates</h1>
          <p className="muted">Changes that help you make the web your own.</p>
          {productUpdates.map((update) => (
            <article className="update" key={update.version}>
              <p className="eyebrow">
                {update.version} ·{" "}
                {update.status === "unreleased" ? "Not yet released" : "Released"}
              </p>
              <time dateTime={update.date}>
                {new Date(`${update.date}T00:00:00`).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </time>
              <h2>{update.title}</h2>
              <ul>
                {update.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </article>
          ))}
          <p className="muted">Installed version {browser.runtime.getManifest().version}</p>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function HiddenItems({ site }: { site: ActiveSite }) {
  const [records, setRecords] = useState<ManagedRecord[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const revision = useRef(0);
  const mounted = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    const current = ++revision.current;
    try {
      const response = await manageRecords({ type: "LIST_HIDDEN_ITEMS", origin: site.origin });
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
  }, [site.origin]);

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
    window.addEventListener("focus", onFocus);
    void load();
    return () => {
      mounted.current = false;
      browser.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function mutate(request: ManagementRequest): Promise<void> {
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

  return (
    <section aria-busy={busy}>
      <p className="eyebrow">CURRENT SITE</p>
      <h1 ref={heading} tabIndex={-1} className="site-title">
        {site.origin.replace(/^https?:\/\//, "")}
      </h1>
      <p className="muted">Restore items here. Use the popup to hide something new.</p>
      <div className="list-toolbar">
        <span>
          {records === null
            ? "Hidden items"
            : `${records.length} hidden ${records.length === 1 ? "item" : "items"}`}
        </span>
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
            onClick={() => void mutate({ type: "SYNC_HIDDEN_SITE", origin: site.origin })}
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
          <ul className="records" aria-label="Hidden items on this site">
            {records.map((record) => {
              const text = record.target.displayText?.trim();
              const label = text || `${record.target.tagName.toLowerCase()} element`;
              return (
                <li key={record.id} className="record">
                  <div className="record-copy">
                    <h2>{label}</h2>
                    <p>
                      {record.target.tagName.toLowerCase()} ·{" "}
                      {record.scope === "site-layout" ? "Across this site" : record.path}
                    </p>
                    <time dateTime={new Date(record.createdAt).toISOString()}>
                      Hidden {new Date(record.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`Restore ${label}`}
                    onClick={() =>
                      void mutate({
                        type: "RESTORE_HIDDEN_ITEM",
                        origin: site.origin,
                        id: record.id,
                      })
                    }
                  >
                    Restore
                  </Button>
                </li>
              );
            })}
          </ul>
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
                    onClick={() => void mutate({ type: "RESET_HIDDEN_SITE", origin: site.origin })}
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
