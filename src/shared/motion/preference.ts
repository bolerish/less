import { z } from "zod";

export const MOTION_PREFERENCE_KEY = "less:motion";
export const motionPreferenceSchema = z.enum(["system", "full", "reduced"]);
export type MotionPreference = z.infer<typeof motionPreferenceSchema>;
let preference: MotionPreference = "system";
const listeners = new Set<() => void>();

export function getMotionPreference(): MotionPreference {
  return preference;
}

export function isMotionReduced(): boolean {
  return (
    preference === "reduced" ||
    (preference === "system" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

export function subscribeMotionPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updatePreference(value: unknown): void {
  const next = motionPreferenceSchema.safeParse(value).data ?? "system";
  if (next === preference) return;
  preference = next;
  for (const listener of listeners) listener();
}

export async function setMotionPreference(value: MotionPreference): Promise<void> {
  await browser.storage.local.set({ [MOTION_PREFERENCE_KEY]: value });
  updatePreference(value);
}

export async function initializeMotionPreference(): Promise<() => void> {
  let changed = false;
  const onChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== "local" || !(MOTION_PREFERENCE_KEY in changes)) return;
    changed = true;
    updatePreference(changes[MOTION_PREFERENCE_KEY].newValue);
  };
  browser.storage.onChanged.addListener(onChanged);
  try {
    const stored = await browser.storage.local.get(MOTION_PREFERENCE_KEY);
    if (!changed) updatePreference(stored[MOTION_PREFERENCE_KEY]);
  } catch {
    // A failed read keeps the system motion preference available.
  }
  return () => browser.storage.onChanged.removeListener(onChanged);
}
