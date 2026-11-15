import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  manageRecords,
  type ManagedRecord,
  type ManagementRequest,
} from "~features/record/management";
import type { PanelMessage } from "~features/record/management-messages";
import { usePanelMessage } from "~shared/locale/use-panel-message";

export function useHiddenItems(origin: string) {
  const message = usePanelMessage();
  const [records, setRecords] = useState<ManagedRecord[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const pendingLoads = useRef(0);
  const [error, setError] = useState<PanelMessage | "">("");
  const [status, setStatus] = useState<PanelMessage | "">("");
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(0);

  const revision = useRef(0);
  const mounted = useRef(false);
  const load = async (): Promise<void> => {
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
      if (mounted.current && current === revision.current) setError("panel_load_error");
    } finally {
      --pendingLoads.current;
      if (mounted.current) setRefreshing(pendingLoads.current > 0);
    }
  };

  const loadFromEffect = useEffectEvent(load);

  function refresh(): void {
    if (busy || pendingLoads.current > 0) return;
    void load();
  }

  useEffect(() => {
    mounted.current = true;
    const onMessage = (message: unknown): void => {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "HIDDEN_ITEMS_CHANGED"
      )
        void loadFromEffect();
    };
    const onFocus = (): void => {
      void loadFromEffect();
    };
    browser.runtime.onMessage.addListener(onMessage);
    const onStorage: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area === "local" && "veil:css:all" in changes) void loadFromEffect();
    };
    browser.storage.onChanged.addListener(onStorage);
    window.addEventListener("focus", onFocus);
    void loadFromEffect();
    return () => {
      mounted.current = false;
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [origin]);

  async function mutate(request: ManagementRequest): Promise<boolean> {
    setBusy(true);
    setError("");
    setStatus("");
    ++revision.current;
    try {
      const response = await manageRecords(request);
      if (!mounted.current) return false;
      ++revision.current;
      setRecords(response.records);
      setUnsynced(response.unsyncedTabs);
      setStatus(request.type === "RESET_HIDDEN_SITE" ? "panel_reset_done" : "panel_saved");
      return true;
    } catch {
      if (mounted.current) setError("panel_save_error");
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return {
    records,
    refreshing,
    error: error ? message(error) : "",
    setError,
    status: status ? message(status) : "",
    busy,
    unsynced,
    refresh,
    mutate,
  };
}
