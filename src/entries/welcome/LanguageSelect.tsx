import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~shared/components/ui/select";
import { type Locale, LOCALES } from "./locale";

type Props = {
  value: Locale;
  onValueChange: (value: Locale) => void;
};

export function LanguageSelect({ value, onValueChange }: Props) {
  return (
    <Select value={value} onValueChange={(v: string) => onValueChange(v as Locale)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l.value} value={l.value}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
