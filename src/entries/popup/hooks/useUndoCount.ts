import { useCallback, useEffect, useState } from "react";

export function useUndoCount(tabId: number | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (tabId === undefined) return;
    try {
      const res = (await browser.tabs.sendMessage(tabId, { type: "GET_UNDO_COUNT" })) as {
        count: number;
      };
      setCount(res.count);
    } catch {
      setCount(0);
    }
  }, [tabId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restore = useCallback(async () => {
    if (tabId === undefined) return;
    try {
      const res = (await browser.tabs.sendMessage(tabId, { type: "RESTORE_LAST" })) as {
        count: number;
      };
      setCount(res.count);
    } catch {
      setCount(0);
    }
  }, [tabId]);

  return { count, restore };
}
