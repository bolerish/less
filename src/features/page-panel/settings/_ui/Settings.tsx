import * as stylex from "@stylexjs/stylex";
import { spacingVars, sizeVars, colorVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Banner, BannerContent, BannerDescription } from "@bolerish/ui/banner";
import { Field, FieldLabel, FieldDescription } from "@bolerish/ui/field";
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
  BrowserIcon,
  DesktopIcon,
  SunIcon,
  MoonIcon,
  SlidersHorizontalIcon,
  PaintBrushIcon,
} from "@phosphor-icons/react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { LOCALES, parseLocalePreference } from "~shared/locale/locales";
import { setLocalePreference } from "~shared/locale/preference";
import { useLocalePreference } from "~shared/locale/use-locale";
import { usePanelMessage } from "~shared/locale/use-panel-message";
import { setThemePreference, themePreferenceSchema } from "~shared/theme/_model/preference";
import {
  getMotionPreference,
  subscribeMotionPreference,
  setMotionPreference,
  motionPreferenceSchema,
} from "~shared/motion/preference";
import { useThemePreference } from "../_model/use-theme-preference";

export type SettingsPage = "settings" | "language" | "theme" | "motion";

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
  const motion = useSyncExternalStore(subscribeMotionPreference, getMotionPreference);
  const id = useId();
  const selectTrigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const languages = [{ value: "auto", label: message("panel_language_auto") }, ...LOCALES];
  const selectItems =
    page === "motion"
      ? motionPreferenceSchema.options.map((value) => ({
          value,
          label: message(`panel_motion_${value}`),
        }))
      : languages;
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
        if (event.key === "Escape" && selectOpen) {
          event.preventDefault();
          event.stopPropagation();
          setSelectOpen(false);
        }
      }}
    >
      {page === "settings" ? (
        <div {...stylex.props(styles.home)}>
          {(
            [
              { title: "panel_general", pages: ["language"], icon: SlidersHorizontalIcon },
              { title: "panel_appearance", pages: ["theme", "motion"], icon: PaintBrushIcon },
            ] as const
          ).map(({ pages, title, icon: Icon }) => (
            <section key={title}>
              <h2 {...stylex.props(styles.sectionHeading)}>
                <Icon {...stylex.props(styles.sectionIcon)} aria-hidden="true" />
                <span
                  className={[
                    "settings-section-label",
                    stylex.props(styles.navigationLabel).className,
                  ].join(" ")}
                >
                  {message(title)}
                </span>
              </h2>
              <div {...stylex.props(styles.navigationList)}>
                {pages.map((page) => (
                  <Button
                    key={page}
                    variant="ghost"
                    align="space-between"
                    xstyle={styles.navigation}
                    style={{ height: "auto", minHeight: sizeVars.controlMd, whiteSpace: "normal" }}
                    data-settings-page={page}
                    onClick={() => onNavigate(page)}
                  >
                    <span {...stylex.props(styles.navigationLabel)}>
                      {message(`panel_${page}`)}
                    </span>
                    <CaretRightIcon aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : page === "language" || page === "motion" ? (
        <Field>
          <FieldLabel htmlFor={id}>{message(`panel_${page}`)}</FieldLabel>
          <Select
            value={page === "motion" ? motion : language}
            open={selectOpen}
            onOpenChange={setSelectOpen}
            items={selectItems}
            modal={false}
            onValueChange={(value) => {
              if (value === null) return;
              save(
                page === "motion"
                  ? setMotionPreference(motionPreferenceSchema.parse(value))
                  : setLocalePreference(parseLocalePreference(value)),
              );
            }}
          >
            <SelectTrigger
              ref={selectTrigger}
              data-preference-value={page === "motion" ? motion : language}
              id={id}
              aria-describedby={
                [page === "motion" ? `${id}-help` : null, error ? `${id}-error` : null]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              className={page === "motion" ? "motion-select" : "language-select"}
              xstyle={styles.languageSelect}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup portalContainer={portalContainer} finalFocus={selectTrigger}>
              <SelectList>
                {selectItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value} data-preference-value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPopup>
          </Select>
          {page === "motion" ? (
            <FieldDescription id={`${id}-help`}>{message("panel_motion_help")}</FieldDescription>
          ) : null}
          {error ? (
            <Banner id={`${id}-error`} size="sm" announce="assertive">
              <BannerContent>
                <BannerDescription>
                  {message(page === "motion" ? "panel_motion_error" : "panel_language_error")}
                </BannerDescription>
              </BannerContent>
            </Banner>
          ) : null}
        </Field>
      ) : (
        <Field>
          <FieldLabel id={id}>{message("panel_theme")}</FieldLabel>
          <ToggleGroup
            className="theme-options"
            aria-labelledby={id}
            aria-describedby={[`${id}-help`, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(" ")}
            value={[theme]}
            xstyle={styles.themeGroup}
            style={{ flexWrap: "wrap" }}
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
                        xstyle={styles.themeChoice}
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
          <FieldDescription id={`${id}-help`}>{message("panel_theme_help")}</FieldDescription>
          {error ? (
            <Banner id={`${id}-error`} size="sm" announce="assertive">
              <BannerContent>
                <BannerDescription>{message("panel_theme_error")}</BannerDescription>
              </BannerContent>
            </Banner>
          ) : null}
        </Field>
      )}
    </section>
  );
}

const styles = stylex.create({
  settings: {
    overflow: "auto",
    minHeight: 0,
    // Keep the native focus ring inside the scroll clip without moving the content edge.
    padding: `calc(${sizeVars.focusRing} * 2)`,
    margin: `calc(${sizeVars.focusRing} * -2)`,
  },
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
  sectionIcon: { width: sizeVars.iconSm, height: sizeVars.iconSm, flexShrink: 0 },
  navigationList: {
    display: "grid",
    paddingBlock: spacingVars.space1,
    paddingInlineStart: `calc(${sizeVars.iconSm} + ${spacingVars.space2} - var(--less-control-inset))`,
  },
  navigation: { minWidth: 0 },
  navigationLabel: { minWidth: 0, overflowWrap: "anywhere" },
  themeGroup: { width: "100%" },
  themeChoice: {
    flexGrow: 1,
    flexBasis: {
      default: 0,
      "@container less-panel (max-width: 14rem)": `calc(50% - ${spacingVars.space1})`,
    },
  },
  languageSelect: { width: "100%", minWidth: 0 },
});
