import { getTabURL } from "~shared/lib/tab-url";
import { useEffect, useState } from "react";

export interface ActiveSite {
  tabId: number;
  origin: string;
}
type ActiveSiteState = { site: ActiveSite | null; loading: boolean; error: boolean };

export function useActiveSite(): ActiveSiteState {
  const [state, setState] = useState<ActiveSiteState>({ site: null, loading: true, error: false });
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let windowId: number | undefined;
    let activeTabId: number | undefined;
    const refresh = async (): Promise<void> => {
      const current = ++generation;
      setState({ site: null, loading: true, error: false });
      try {
        if (windowId === undefined) windowId = (await browser.windows.getCurrent()).id;
        const [tab] = await browser.tabs.query({ active: true, windowId });
        activeTabId = tab?.id;
        let site: ActiveSite | null = null;
        const tabURL = tab ? await getTabURL(tab) : undefined;
        if (tab?.id !== undefined && tabURL) {
          const url = new URL(tabURL);
          if (/^https?:$/.test(url.protocol)) site = { tabId: tab.id, origin: url.origin };
        }
        if (!disposed && current === generation) setState({ site, loading: false, error: false });
      } catch {
        if (!disposed && current === generation)
          setState({ site: null, loading: false, error: true });
      }
    };
    const onActivated = (info: { windowId: number }): void => {
      if (windowId === undefined || info.windowId === windowId) void refresh();
    };
    const onUpdated = (
      _id: number,
      change: { url?: string; status?: string },
      tab: { active?: boolean; windowId: number },
    ): void => {
      if (tab.active && tab.windowId === windowId && (change.url || change.status === "complete"))
        void refresh();
    };
    const onRemoved = (tabId: number): void => {
      if (tabId === activeTabId) void refresh();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    void refresh();
    return () => {
      disposed = true;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    };
  }, []);
  return state;
}
