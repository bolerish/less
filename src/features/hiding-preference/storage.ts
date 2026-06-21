const KEY_PREFIX = "bare:hiding-enabled:";

function storageKey(origin: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(origin)}`;
}

export async function getSiteHidingEnabled(origin: string): Promise<boolean> {
  const key = storageKey(origin);
  const result = await browser.storage.local.get(key);
  return result[key] !== false;
}

export async function setSiteHidingEnabled(origin: string, enabled: boolean): Promise<void> {
  const key = storageKey(origin);
  if (enabled) {
    await browser.storage.local.remove(key);
  } else {
    await browser.storage.local.set({ [key]: false });
  }
}

export function subscribeSiteHidingEnabled(origin: string, listener: () => void): () => void {
  const key = storageKey(origin);
  const handler: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes) => {
    if (key in changes) listener();
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
