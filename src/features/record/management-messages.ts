import english from "../../../public/_locales/en/messages.json";

export type PanelMessage = Extract<keyof typeof english, `panel_${string}`>;

export function getPanelMessage(key: PanelMessage, substitutions: string[] = []): string {
  const translated = browser.i18n.getMessage(key, substitutions);
  if (translated) return translated;
  return english[key].message.replace(
    /\$(\d+)/g,
    (_, index: string) => substitutions[Number(index) - 1] ?? "",
  );
}
