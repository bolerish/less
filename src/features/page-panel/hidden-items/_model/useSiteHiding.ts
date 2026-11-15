import { useEffect, useState } from "react";
import {
  getSiteHidingEnabled,
  setSiteHidingEnabled,
  subscribeSiteHidingEnabled,
} from "~features/hiding-preference";

export function useSiteHiding(origin: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
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
  return { enabled, setEnabled: (value: boolean) => setSiteHidingEnabled(origin, value) };
}
