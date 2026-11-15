import * as stylex from "@stylexjs/stylex";
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
  typo,
} from "@bolerish/tokens/semantic.stylex";
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
  ariaLabel: string;
  value: Locale;
  onValueChange: (value: Locale) => void;
};

export function LanguageSelect({ value, onValueChange, ariaLabel }: Props) {
  return (
    <Select
      value={value}
      items={LOCALES}
      onValueChange={(next) => {
        const locale = LOCALES.find((locale) => locale.value === next);
        if (locale) onValueChange(locale.value);
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={["language-select", stylex.props(styles.trigger).className].join(" ")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup className="language-options" xstyle={styles.popup} alignItemWithTrigger>
        <SelectList>
          {LOCALES.map((l) => (
            <SelectItem
              className={["language-option", stylex.props(styles.option).className].join(" ")}
              key={l.value}
              value={l.value}
            >
              {l.label}
            </SelectItem>
          ))}
        </SelectList>
      </SelectPopup>
    </Select>
  );
}

const styles = stylex.create({
  trigger: {
    width: "fit-content",
    height: 28,
    padding: `6px ${spacingVars.space2}`,
    gap: `calc(${spacingVars.space1} * 1.5)`,
    border: `1px solid ${colorVars.strokeControl}`,
    borderRadius: radiusVars.md,
    background: {
      default: `color-mix(in oklab, ${colorVars.strokeControl} 20%, transparent)`,
      ":is(.dark *)": `color-mix(in oklab, ${colorVars.strokeControl} 30%, transparent)`,
    },
    fontSize: typo.fontSizeXs,
    lineHeight: typo.lineHeightNormal,
  },
  popup: {
    minWidth: 128,
    border: 0,
    borderRadius: radiusVars.lg,
    padding: 0,
    background: colorVars.bgRaised,
    boxShadow: shadowVars.floating,
  },
  option: {
    minHeight: 28,
    padding: `${spacingVars.space1} ${spacingVars.space2}`,
    paddingInlineEnd: spacingVars.space8,
    borderRadius: radiusVars.md,
    fontSize: typo.fontSizeXs,
    lineHeight: typo.lineHeightNormal,
  },
});
