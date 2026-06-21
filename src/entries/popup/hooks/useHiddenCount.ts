import { useEffect, useState } from "react";
import { countRecordsByOrigin } from "~features/record";

export function useHiddenCount(origin: string | null, refreshKey = 0): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!origin) return;
    countRecordsByOrigin(origin).then(setCount);
  }, [origin, refreshKey]);

  return count;
}
