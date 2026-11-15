import english from "../../../public/_locales/en/messages.json";
import korean from "../../../public/_locales/ko/messages.json";
import japanese from "../../../public/_locales/ja/messages.json";
import spanish from "../../../public/_locales/es/messages.json";
import chinese from "../../../public/_locales/zh_CN/messages.json";
import type { Locale } from "./locales";
import { getLocale } from "./preference";

export type PanelMessage = Extract<keyof typeof english, `panel_${string}`>;
const catalogs = { en: english, ko: korean, ja: japanese, es: spanish, zh_CN: chinese };

export function getPanelMessage(
  key: PanelMessage,
  substitutions: string[] = [],
  locale: Locale = getLocale(),
): string {
  const translated = catalogs[locale][key]?.message || english[key].message;
  return translated.replace(
    /\$(\d+)/g,
    (_, index: string) => substitutions[Number(index) - 1] ?? "",
  );
}
