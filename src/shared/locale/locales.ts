export type Locale = "en" | "ko" | "ja" | "es" | "zh_CN";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "es", label: "Español" },
  { value: "zh_CN", label: "简体中文" },
];

export const LOCALE_TO_LANG: Record<Locale, string> = {
  en: "en",
  ko: "ko",
  ja: "ja",
  es: "es",
  zh_CN: "zh-CN",
};

export function detectLocale(language: string): Locale {
  const lang = language.toLowerCase();
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("zh")) return "zh_CN";
  return "en";
}

export type LocalePreference = Locale | "auto";

export function parseLocalePreference(value: unknown): LocalePreference {
  return LOCALES.find((locale) => locale.value === value)?.value ?? "auto";
}
