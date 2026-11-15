import {
  detectLocale,
  LOCALE_TO_LANG,
  parseLocalePreference,
  type LocalePreference,
} from "./locales";

export const LOCALE_PREFERENCE_KEY = "less:locale";
let preference: LocalePreference = "auto";
const listeners = new Set<() => void>();

export function getLocalePreference(): LocalePreference {
  return preference;
}

export function getLocale() {
  return preference === "auto" ? detectLocale(browser.i18n.getUILanguage()) : preference;
}

export function getLanguage(): string {
  return preference === "auto"
    ? browser.i18n.getUILanguage().replace("_", "-")
    : LOCALE_TO_LANG[preference];
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updatePreference(value: unknown): void {
  const next = parseLocalePreference(value);
  if (next === preference) return;
  preference = next;
  for (const listener of listeners) listener();
}

export async function setLocalePreference(value: LocalePreference): Promise<void> {
  await browser.storage.local.set({ [LOCALE_PREFERENCE_KEY]: value });
  updatePreference(value);
}

export async function initializeLocale(): Promise<() => void> {
  let changed = false;
  const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local" || !(LOCALE_PREFERENCE_KEY in changes)) return;
    changed = true;
    updatePreference(changes[LOCALE_PREFERENCE_KEY].newValue);
  };
  browser.storage.onChanged.addListener(onChanged);
  try {
    const stored = await browser.storage.local.get(LOCALE_PREFERENCE_KEY);
    if (!changed) updatePreference(stored[LOCALE_PREFERENCE_KEY]);
  } catch {
    // Keep browser language available when preferences cannot be read.
  }
  return () => browser.storage.onChanged.removeListener(onChanged);
}
