import { getPanelMessage, type PanelMessage } from "./messages";
import { detectLocale } from "./locales";
import { useLocalePreference } from "./use-locale";

export function usePanelMessage() {
  const preference = useLocalePreference();
  const locale = preference === "auto" ? detectLocale(browser.i18n.getUILanguage()) : preference;
  return (key: PanelMessage, substitutions: string[] = []) =>
    getPanelMessage(key, substitutions, locale);
}
