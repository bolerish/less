const KEY_PREFIX = "veil:hiding-enabled:";
const LEGACY_KEY_PREFIX = "bare:hiding-enabled:";

function storageKey(origin: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(origin)}`;
}

function legacyKey(origin: string): string {
  return `${LEGACY_KEY_PREFIX}${encodeURIComponent(origin)}`;
}

export async function getSiteHidingEnabled(origin: string): Promise<boolean> {
  const key = storageKey(origin);
  const legacy = legacyKey(origin);
  const result = await browser.storage.local.get([key, legacy]);

  // Migrate legacy key on first access
  if (!(key in result) && legacy in result) {
    const value = result[legacy] as boolean;
    await Promise.all([
      browser.storage.local.set({ [key]: value }),
      browser.storage.local.remove(legacy),
    ]);
    return value !== false;
  }

  return result[key] !== false;
}

export async function setSiteHidingEnabled(origin: string, enabled: boolean): Promise<void> {
  const key = storageKey(origin);
  // Remove legacy key if present, write new key
  const legacy = legacyKey(origin);
  if (enabled) {
    await browser.storage.local.remove([key, legacy]);
  } else {
    await Promise.all([
      browser.storage.local.set({ [key]: false }),
      browser.storage.local.remove(legacy),
    ]);
  }
}

export function subscribeSiteHidingEnabled(origin: string, listener: () => void): () => void {
  const key = storageKey(origin);
  const legacy = legacyKey(origin);
  const handler: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes) => {
    if (key in changes || legacy in changes) listener();
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
