import type { ProductUpdate } from "./releases";

export const UPDATES_SEEN_VERSION_KEY = "veil:updates:seen-version";

export function getLatestReleasedUpdate(
  updates: readonly ProductUpdate[],
  installedVersion: string,
): ProductUpdate | undefined {
  let latest: ProductUpdate | undefined;
  for (const update of updates) {
    if (
      update.status !== "released" ||
      !isUpdateVersion(update.version) ||
      compareUpdateVersions(update.version, installedVersion) > 0
    )
      continue;
    if (!latest || compareUpdateVersions(update.version, latest.version) > 0) latest = update;
  }
  return latest;
}

export function isUpdateVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+){0,3}$/.test(value);
}

export function compareUpdateVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
