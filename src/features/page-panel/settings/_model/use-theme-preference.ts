import { useSyncExternalStore } from "react";
import { getThemePreference, subscribeThemePreference } from "~shared/theme/_model/preference";

export function useThemePreference() {
  return useSyncExternalStore(subscribeThemePreference, getThemePreference);
}
