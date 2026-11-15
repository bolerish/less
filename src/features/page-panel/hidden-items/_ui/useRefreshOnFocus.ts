import { useEffect, useEffectEvent } from "react";

export function useRefreshOnFocus(reload: () => Promise<void>): void {
  const onFocus = useEffectEvent(() => {
    void reload();
  });
  useEffect(() => {
    const refresh = () => onFocus();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
}
