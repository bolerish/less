import { useEffect, useState } from "react";
import { getTabURL } from "~shared/lib/tab-url";

interface CurrentTab {
  id: number;
  windowId: number;
  origin: string | null;
}

export function useCurrentTab(): CurrentTab | null {
  const [tab, setTab] = useState<CurrentTab | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id === undefined) return;
        let origin: string | null = null;
        const tabURL = await getTabURL(activeTab).catch(() => undefined);
        if (tabURL) {
          const url = new URL(tabURL);
          if (/^https?:$/.test(url.protocol)) origin = url.origin;
        }
        if (!disposed) setTab({ id: activeTab.id, windowId: activeTab.windowId, origin });
      } catch (error) {
        console.warn("[Veil] could not find the current tab", error);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  return tab;
}
