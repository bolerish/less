import { z } from "zod";

export const THEME_PREFERENCE_KEY = "less:theme";
export const themePreferenceSchema = z.enum(["page", "system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
let preference: ThemePreference = "page";
const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  return preference;
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updatePreference(value: unknown): void {
  const next = themePreferenceSchema.safeParse(value).data ?? "page";
  if (next === preference) return;
  preference = next;
  for (const listener of listeners) listener();
}

export async function setThemePreference(value: ThemePreference): Promise<void> {
  await browser.storage.local.set({ [THEME_PREFERENCE_KEY]: value });
  updatePreference(value);
}

export async function initializeThemePreference(): Promise<() => void> {
  let changed = false;
  const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local" || !(THEME_PREFERENCE_KEY in changes)) return;
    changed = true;
    updatePreference(changes[THEME_PREFERENCE_KEY].newValue);
  };
  browser.storage.onChanged.addListener(onChanged);
  try {
    const stored = await browser.storage.local.get(THEME_PREFERENCE_KEY);
    if (!changed) updatePreference(stored[THEME_PREFERENCE_KEY]);
  } catch {
    // A storage failure leaves the default page/system fallback available.
  }
  return () => browser.storage.onChanged.removeListener(onChanged);
}
