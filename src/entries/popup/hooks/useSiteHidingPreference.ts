import { useEffect, useState } from "react";
import {
  getSiteHidingEnabled,
  setSiteHidingEnabled,
  subscribeSiteHidingEnabled,
} from "~features/hiding-preference";

export function useSiteHidingPreference(origin: string | null) {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!origin) return;

    setLoaded(false);
    getSiteHidingEnabled(origin).then((value) => {
      setEnabled(value);
      setLoaded(true);
    });

    return subscribeSiteHidingEnabled(origin, () => {
      getSiteHidingEnabled(origin).then(setEnabled);
    });
  }, [origin]);

  const toggle = async (next: boolean): Promise<void> => {
    if (!origin) return;
    const prev = enabled;
    setEnabled(next);
    try {
      await setSiteHidingEnabled(origin, next);
    } catch {
      setEnabled(prev);
    }
  };

  return { enabled, loaded, toggle };
}
