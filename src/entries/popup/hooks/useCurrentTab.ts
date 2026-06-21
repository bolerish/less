import { useEffect, useState } from "react";

interface CurrentTab {
  id: number;
  origin: string;
}

export function useCurrentTab(): CurrentTab | null {
  const [tab, setTab] = useState<CurrentTab | null>(null);

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab?.id !== undefined && activeTab.url) {
        try {
          setTab({ id: activeTab.id, origin: new URL(activeTab.url).origin });
        } catch {}
      }
    });
  }, []);

  return tab;
}
