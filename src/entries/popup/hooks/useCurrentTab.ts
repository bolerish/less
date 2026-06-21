import { useEffect, useState } from "react";

interface CurrentTab {
  origin: string;
}

export function useCurrentTab(): CurrentTab | null {
  const [tab, setTab] = useState<CurrentTab | null>(null);

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
      if (activeTab?.url) {
        try {
          setTab({ origin: new URL(activeTab.url).origin });
        } catch {}
      }
    });
  }, []);

  return tab;
}
