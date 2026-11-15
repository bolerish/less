import { useEffect, useState } from "react";

export function useUndoCount(tabId: number | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (tabId === undefined) return;
      try {
        const res = (await browser.tabs.sendMessage(tabId, { type: "GET_UNDO_COUNT" })) as {
          count: number;
        };
        if (active) setCount(res.count);
      } catch {
        if (active) setCount(0);
      }
    }
    void refresh();
    return () => {
      active = false;
    };
  }, [tabId]);

  const restore = async () => {
    if (tabId === undefined) return;
    try {
      const res = (await browser.tabs.sendMessage(tabId, { type: "RESTORE_LAST" })) as {
        count: number;
      };
      setCount(res.count);
    } catch {
      setCount(0);
    }
  };

  return { count, restore };
}
