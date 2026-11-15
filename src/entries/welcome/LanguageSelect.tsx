import {
  Select,
  SelectPopup,
  SelectList,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bolerish/ui/select";
import { type Locale, LOCALES } from "./locale";

type Props = {
  value: Locale;
  onValueChange: (value: Locale) => void;
};

export function LanguageSelect({ value, onValueChange }: Props) {
  return (
    <Select
      value={value}
      items={LOCALES}
      onValueChange={(next) => {
        const locale = LOCALES.find((locale) => locale.value === next);
        if (locale) onValueChange(locale.value);
      }}
    >
      <SelectTrigger className="language-select">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup className="language-options" alignItemWithTrigger>
        <SelectList>
          {LOCALES.map((l) => (
            <SelectItem className="language-option" key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectList>
      </SelectPopup>
    </Select>
  );
}
