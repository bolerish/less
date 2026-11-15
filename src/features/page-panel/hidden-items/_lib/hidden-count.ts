import type { getPanelMessage } from "~features/record/management-messages";

export function getHiddenCount(
  count: number,
  language: string,
  message: typeof getPanelMessage,
): { value: string; noun: string } {
  const formatted = new Intl.NumberFormat(language).format(count);
  const singular = new Intl.PluralRules(language).select(count) === "one";
  const suffix = singular ? "one" : "other";
  return {
    value: message(`panel_hidden_count_${suffix}`, [formatted]),
    noun: message(`panel_hidden_noun_${suffix}`),
  };
}
