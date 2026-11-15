import { LOCALE_TO_LANG } from "./locales";
import { useSyncExternalStore } from "react";
import { getLocalePreference, subscribeLocale } from "./preference";

export function useLocalePreference() {
  return useSyncExternalStore(subscribeLocale, getLocalePreference);
}

export function useLanguage(): string {
  const preference = useLocalePreference();
  return preference === "auto"
    ? browser.i18n.getUILanguage().replace("_", "-")
    : LOCALE_TO_LANG[preference];
}
