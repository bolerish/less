import * as stylex from "@stylexjs/stylex";
import { spacingVars, sizeVars, colorVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Field, FieldLabel } from "@bolerish/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@bolerish/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@bolerish/ui/toggle-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "@bolerish/ui/tooltip";
import {
  CaretRightIcon,
  PaintBrushIcon,
  SlidersHorizontalIcon,
  BrowserIcon,
  DesktopIcon,
  SunIcon,
  MoonIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
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
  portalContainer,
}: {
  portalContainer?: HTMLElement;
  page: SettingsPage;
  onNavigate: (page: SettingsPage) => void;
}) {
  const message = usePanelMessage();
  const language = useLocalePreference();
  const theme = useThemePreference();
  const id = useId();
  const languageTrigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languages = [{ value: "auto", label: message("panel_language_auto") }, ...LOCALES];
  const themeIcons = { page: BrowserIcon, system: DesktopIcon, light: SunIcon, dark: MoonIcon };

  function save(preference: Promise<void>) {
    setError(false);
    void preference.catch(() => setError(true));
  }
  return (
    <section
      {...stylex.props(styles.settings)}
      aria-label={message("panel_settings")}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && languageOpen) {
          event.preventDefault();
          event.stopPropagation();
          setLanguageOpen(false);
        }
      }}
    >
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
        <Field>
          <FieldLabel htmlFor={id}>{message("panel_language")}</FieldLabel>
          <Select
            value={language}
            open={languageOpen}
            onOpenChange={setLanguageOpen}
            items={languages}
            modal={false}
            onValueChange={(value) => {
              if (value !== null) save(setLocalePreference(parseLocalePreference(value)));
            }}
          >
            <SelectTrigger
              ref={languageTrigger}
              data-preference-value={language}
              id={id}
              className="language-select"
              xstyle={styles.languageSelect}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup portalContainer={portalContainer} finalFocus={languageTrigger}>
              <SelectList>
                {languages.map(({ value, label }) => (
                  <SelectItem key={value} value={value} data-preference-value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPopup>
          </Select>
          {error ? (
            <p role="alert" {...stylex.props(styles.error)}>
              {message("panel_language_error")}
            </p>
          ) : null}
        </Field>
      ) : (
        <Field>
          <div {...stylex.props(styles.fieldHeading)}>
            <FieldLabel id={id}>{message("panel_theme")}</FieldLabel>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label={message("panel_theme_help")}>
                    <InfoIcon aria-hidden="true" size={16} />
                  </Button>
                }
              />
              <TooltipContent portalContainer={portalContainer}>
                {message("panel_theme_help")}
              </TooltipContent>
            </Tooltip>
          </div>
          <ToggleGroup
            aria-labelledby={id}
            value={[theme]}
            style={{ flexWrap: "wrap", maxWidth: "100%" }}
            variant="soft"
            onValueChange={(values) => {
              const value = values[0];
              if (value !== undefined) save(setThemePreference(themePreferenceSchema.parse(value)));
            }}
          >
            {themePreferenceSchema.options.map((value) => {
              const Icon = themeIcons[value];
              const label = message(`panel_theme_${value}`);
              return (
                <Tooltip key={value}>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem
                        value={value}
                        data-preference-value={value}
                        aria-label={label}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </ToggleGroupItem>
                    }
                  />
                  <TooltipContent portalContainer={portalContainer}>{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
          {error ? (
            <p role="alert" {...stylex.props(styles.error)}>
              {message("panel_theme_error")}
            </p>
          ) : null}
        </Field>
      )}
    </section>
  );
}

const styles = stylex.create({
  settings: { overflow: "auto", minHeight: 0 },
  home: { display: "grid", gap: spacingVars.space6 },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: spacingVars.space2,
    color: colorVars.fgTertiary,
    fontWeight: typo.fontWeightSemibold,
    fontSize: typo.fontSizeSm,
    margin: 0,
    marginBottom: spacingVars.space2,
  },
  icon: { width: sizeVars.iconSm, height: sizeVars.iconSm, flexShrink: 0 },
  navigationList: {
    display: "grid",
    paddingBlock: spacingVars.space1,
  },
  navigation: { minWidth: 0 },
  fieldHeading: { display: "flex", alignItems: "center", gap: spacingVars.space2 },
  languageSelect: { width: "100%", minWidth: 0 },
  error: { color: colorVars.fgFeedbackError, margin: 0, overflowWrap: "anywhere" },
});
