import * as stylex from "@stylexjs/stylex";
import { spacingVars, colorVars } from "@bolerish/tokens/semantic.stylex";
import { Label } from "@bolerish/ui/label";
import { NativeSelect, NativeSelectOption } from "@bolerish/ui/native-select";
import { useId, useState } from "react";
import { LOCALES, parseLocalePreference } from "~shared/locale/locales";
import { setLocalePreference } from "~shared/locale/preference";
import { useLocalePreference } from "~shared/locale/use-locale";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import "./settings.css";

export function Settings() {
  const id = useId();
  const preference = useLocalePreference();
  const message = usePanelMessage();
  const [error, setError] = useState(false);
  return (
    <section {...stylex.props(styles.settings)} aria-label={message("panel_settings")}>
      <Label htmlFor={id}>{message("panel_language")}</Label>
      <NativeSelect
        className="language-control"
        id={id}
        value={preference}
        xstyle={styles.select}
        onChange={(event) => {
          setError(false);
          void setLocalePreference(parseLocalePreference(event.target.value)).catch(() =>
            setError(true),
          );
        }}
      >
        <NativeSelectOption value="auto">{message("panel_language_auto")}</NativeSelectOption>
        {LOCALES.map(({ value, label }) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {message("panel_language_error")}
        </p>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  settings: {
    display: "flex",
    flexDirection: "column",
    gap: spacingVars.space3,
    paddingBlock: spacingVars.space4,
    overflow: "auto",
    minHeight: 0,
  },
  select: { width: "100%", maxWidth: "100%" },
  error: { color: colorVars.fgFeedbackError, margin: 0, overflowWrap: "anywhere" },
});
