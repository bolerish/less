import * as stylex from "@stylexjs/stylex";
import { spacingVars, colorVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Label } from "@bolerish/ui/label";
import { RadioGroup, RadioGroupItem } from "@bolerish/ui/radio-group";
import { CaretRightIcon, PaintBrushIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { LOCALES, parseLocalePreference } from "~shared/locale/locales";
import { setLocalePreference } from "~shared/locale/preference";
import { useLocalePreference } from "~shared/locale/use-locale";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import { setThemePreference, themePreferenceSchema } from "~shared/theme/_model/preference";
import { useThemePreference } from "../_model/use-theme-preference";

export type SettingsPage = "settings" | "language" | "theme";

export function Settings({
  page,
  onNavigate,
}: {
  page: SettingsPage;
  onNavigate: (page: SettingsPage) => void;
}) {
  const message = usePanelMessage();
  const language = useLocalePreference();
  const theme = useThemePreference();
  return (
    <section {...stylex.props(styles.settings)} aria-label={message("panel_settings")}>
      {page === "settings" ? (
        <div {...stylex.props(styles.home)}>
          {(
            [
              {
                page: "language",
                title: "panel_general",
                label: "panel_language",
                icon: SlidersHorizontalIcon,
              },
              {
                page: "theme",
                title: "panel_appearance",
                label: "panel_theme",
                icon: PaintBrushIcon,
              },
            ] as const
          ).map(({ page, title, label, icon: Icon }) => (
            <section key={page}>
              <h2 {...stylex.props(styles.sectionHeading)}>
                <Icon aria-hidden="true" {...stylex.props(styles.icon)} />
                {message(title)}
              </h2>
              <div {...stylex.props(styles.navigationList)}>
                <Button
                  variant="ghost"
                  align="space-between"
                  xstyle={styles.navigation}
                  data-settings-page={page}
                  onClick={() => onNavigate(page)}
                >
                  {message(label)}
                  <CaretRightIcon aria-hidden="true" />
                </Button>
              </div>
            </section>
          ))}
        </div>
      ) : page === "language" ? (
        <PreferenceField
          key={page}
          label={message("panel_language")}
          value={language}
          options={[{ value: "auto", label: message("panel_language_auto") }, ...LOCALES]}
          onChange={(value) => setLocalePreference(parseLocalePreference(value))}
          errorMessage={message("panel_language_error")}
        />
      ) : (
        <PreferenceField
          key={page}
          label={message("panel_theme")}
          description={message("panel_theme_help")}
          value={theme}
          options={themePreferenceSchema.options.map((value) => ({
            value,
            label: message(`panel_theme_${value}`),
          }))}
          onChange={(value) => setThemePreference(themePreferenceSchema.parse(value))}
          errorMessage={message("panel_theme_error")}
        />
      )}
    </section>
  );
}

function PreferenceField({
  label,
  description,
  value,
  options,
  onChange,
  errorMessage,
}: {
  label: string;
  description?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => Promise<void>;
  errorMessage: string;
}) {
  const id = useId();
  const [error, setError] = useState(false);
  return (
    <div {...stylex.props(styles.field)}>
      <span id={id} {...stylex.props(styles.fieldLabel)}>
        {label}
      </span>
      {description ? (
        <p id={`${id}-description`} {...stylex.props(styles.description)}>
          {description}
        </p>
      ) : null}
      <RadioGroup
        value={value}
        aria-labelledby={id}
        aria-describedby={description ? `${id}-description` : undefined}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          setError(false);
          void onChange(next).catch(() => setError(true));
        }}
      >
        {options.map((option) => (
          <Label key={option.value} className={stylex.props(styles.option).className}>
            <RadioGroupItem
              value={option.value}
              data-preference-value={option.value}
              className={["less-preference-radio", stylex.props(styles.focus).className].join(" ")}
            />
            <span {...stylex.props(styles.optionText)}>{option.label}</span>
          </Label>
        ))}
      </RadioGroup>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  settings: { paddingBlock: spacingVars.space4, overflow: "auto", minHeight: 0 },
  home: { display: "grid", gap: spacingVars.space6 },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    color: colorVars.fgSecondary,
    fontWeight: typo.fontWeightSemibold,
    fontSize: typo.fontSizeSm,
    margin: 0,
    marginBottom: spacingVars.space2,
  },
  icon: { width: 20, height: 20, flexShrink: 0 },
  navigationList: { display: "grid", paddingBlock: spacingVars.space1, marginInlineStart: 28 },
  navigation: { marginInline: `calc(${spacingVars.space4} * -1)`, minWidth: 0 },
  field: { display: "grid", gap: spacingVars.space3 },
  fieldLabel: { fontWeight: typo.fontWeightSemibold },
  description: { margin: 0, color: colorVars.fgSecondary, overflowWrap: "anywhere" },
  option: { minHeight: 44, gap: spacingVars.space3, alignItems: "center" },
  optionText: { minWidth: 0, overflowWrap: "anywhere" },
  focus: {
    borderColor: { ":is(.less-preference-radio)": colorVars.strokeControl },
    outline: {
      ":is(.less-preference-radio):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}`,
    },
    outlineOffset: { ":is(.less-preference-radio):focus-visible": 3 },
  },
  error: { color: colorVars.fgFeedbackError, margin: 0, overflowWrap: "anywhere" },
});
