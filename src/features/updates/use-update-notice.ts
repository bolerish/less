import { useEffect, useState } from "react";
import { productUpdates } from "./releases";
import {
  compareUpdateVersions,
  getLatestReleasedUpdate,
  isUpdateVersion,
  UPDATES_SEEN_VERSION_KEY,
} from "./notice";

export function useUpdateNotice(open: boolean): boolean {
  const latestVersion = getLatestReleasedUpdate(
    productUpdates,
    browser.runtime.getManifest().version,
  )?.version;
  const [seenVersion, setSeenVersion] = useState<string | undefined | null>(null);

  useEffect(() => {
    let active = true;
    let changed = false;
    const onStorage: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== "local" || !(UPDATES_SEEN_VERSION_KEY in changes)) return;
      changed = true;
      const value: unknown = changes[UPDATES_SEEN_VERSION_KEY]?.newValue;
      setSeenVersion(isUpdateVersion(value) ? value : undefined);
    };
    browser.storage.onChanged.addListener(onStorage);
    void browser.storage.local
      .get(UPDATES_SEEN_VERSION_KEY)
      .then((values) => {
        if (!active || changed) return;
        const value: unknown = values[UPDATES_SEEN_VERSION_KEY];
        setSeenVersion(isUpdateVersion(value) ? value : undefined);
      })
      .catch(() => {});
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  useEffect(() => {
    if (!open || !latestVersion) return;
    let active = true;
    void (async () => {
      const values = await browser.storage.local.get(UPDATES_SEEN_VERSION_KEY);
      const current: unknown = values[UPDATES_SEEN_VERSION_KEY];
      if (isUpdateVersion(current) && compareUpdateVersions(current, latestVersion) >= 0) return;
      await browser.storage.local.set({ [UPDATES_SEEN_VERSION_KEY]: latestVersion });
      if (active) setSeenVersion(latestVersion);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, [open, latestVersion]);

  return (
    latestVersion !== undefined &&
    seenVersion !== null &&
    (seenVersion === undefined || compareUpdateVersions(latestVersion, seenVersion) > 0)
  );
}
