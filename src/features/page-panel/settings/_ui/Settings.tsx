import * as stylex from "@stylexjs/stylex";
import {
  spacingVars,
  sizeVars,
  colorVars,
  radiusVars,
  shadowVars,
  typo,
} from "@bolerish/tokens/semantic.stylex";
import { Button } from "@bolerish/ui/button";
import { Select, SelectValue, SelectTrigger, SelectList, SelectItem } from "@bolerish/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@bolerish/ui/toggle-group";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@bolerish/ui/tooltip";
import { Select as SelectPrimitive, Tooltip as TooltipPrimitive } from "@bolerish/ui/primitives";
import {
  BrowserIcon,
  DesktopIcon,
  SunIcon,
  MoonIcon,
  CaretRightIcon,
  PaintBrushIcon,
  SlidersHorizontalIcon,
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
  page: SettingsPage;
  onNavigate: (page: SettingsPage) => void;
  portalContainer?: HTMLElement;
}) {
  const message = usePanelMessage();

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
        <LanguageField portalContainer={portalContainer} />
      ) : (
        <ThemeField portalContainer={portalContainer} />
      )}
    </section>
  );
}

function LanguageField({ portalContainer }: { portalContainer?: HTMLElement }) {
  const message = usePanelMessage();
  const value = useLocalePreference();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const options = [{ value: "auto", label: message("panel_language_auto") }, ...LOCALES];
  return (
    <div
      {...stylex.props(styles.field)}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <span id={id} {...stylex.props(styles.fieldLabel)}>
        {message("panel_language")}
      </span>
      {/* The native panel is already modal; avoid locking the host page a second time. */}
      <Select
        modal={false}
        open={open}
        onOpenChange={setOpen}
        value={value}
        items={options}
        onValueChange={(next) => {
          if (next === null) return;
          setError(false);
          void setLocalePreference(parseLocalePreference(next)).catch(() => setError(true));
        }}
      >
        <SelectTrigger
          ref={trigger}
          aria-labelledby={id}
          xstyle={styles.select}
          className={["less-control", stylex.props(styles.focus).className].join(" ")}
          data-preference-value={value}
        >
          <SelectValue />
        </SelectTrigger>
        {/* The packaged popup portals to body; scope its primitives to this shadow modal. */}
        <SelectPrimitive.Portal container={portalContainer}>
          <SelectPrimitive.Positioner alignItemWithTrigger={false} sideOffset={4}>
            <SelectPrimitive.Popup finalFocus={trigger} {...stylex.props(styles.languagePopup)}>
              <SelectList>
                {options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    data-preference-value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </Select>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {message("panel_language_error")}
        </p>
      ) : null}
    </div>
  );
}

function ThemeField({ portalContainer }: { portalContainer?: HTMLElement }) {
  const message = usePanelMessage();
  const value = useThemePreference();
  const id = useId();
  const [error, setError] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const icons = { page: BrowserIcon, system: DesktopIcon, light: SunIcon, dark: MoonIcon };
  return (
    <TooltipProvider>
      <div
        {...stylex.props(styles.field)}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape" || activeTooltip === null) return;
          event.preventDefault();
          event.stopPropagation();
          setActiveTooltip(null);
        }}
      >
        <span id={id} {...stylex.props(styles.fieldLabel)}>
          {message("panel_theme")}
        </span>
        <ToggleGroup
          variant="soft"
          size="lg"
          value={[value]}
          xstyle={styles.themes}
          style={{ flexWrap: "wrap" }}
          aria-labelledby={id}
          aria-describedby={`${id}-description`}
          onValueChange={(values) => {
            if (!values[0]) return;
            setError(false);
            void setThemePreference(themePreferenceSchema.parse(values[0])).catch(() =>
              setError(true),
            );
          }}
        >
          {themePreferenceSchema.options.map((option) => {
            const Icon = icons[option];
            const label = message(`panel_theme_${option}`);
            return (
              <Tooltip
                key={option}
                open={activeTooltip === option}
                onOpenChange={(open) =>
                  setActiveTooltip((current) =>
                    open ? option : current === option ? null : current,
                  )
                }
              >
                <TooltipTrigger
                  render={
                    <ToggleGroupItem
                      value={option}
                      xstyle={styles.themeOption}
                      className={["less-control", stylex.props(styles.focus).className].join(" ")}
                      aria-label={label}
                      aria-describedby={
                        activeTooltip === option ? `${id}-${option}-tooltip` : undefined
                      }
                      data-preference-value={option}
                      onFocus={() => setActiveTooltip(option)}
                      onBlur={() => setActiveTooltip(null)}
                      onPointerEnter={() => setActiveTooltip(option)}
                      onPointerLeave={(event) => {
                        if (!event.currentTarget.matches(":focus-visible")) setActiveTooltip(null);
                      }}
                    />
                  }
                >
                  <Icon size={20} aria-hidden="true" />
                </TooltipTrigger>
                <TooltipPrimitive.Portal container={portalContainer}>
                  <TooltipPrimitive.Positioner side="bottom" sideOffset={6}>
                    <TooltipPrimitive.Popup
                      role="tooltip"
                      id={`${id}-${option}-tooltip`}
                      {...stylex.props(styles.tooltip)}
                    >
                      {label}
                    </TooltipPrimitive.Popup>
                  </TooltipPrimitive.Positioner>
                </TooltipPrimitive.Portal>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        <p id={`${id}-description`} {...stylex.props(styles.description)}>
          {message("panel_theme_help")}
        </p>
        <p {...stylex.props(styles.description)}>{message("panel_theme_fallback")}</p>
        {error ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {message("panel_theme_error")}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

const styles = stylex.create({
  settings: {
    paddingBlock: spacingVars.space4,
    paddingInline: spacingVars.space2,
    marginInline: `calc(${spacingVars.space2} * -1)`,
    overflow: "auto",
    minHeight: 0,
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
  icon: { width: sizeVars.iconSm, height: sizeVars.iconSm, flexShrink: 0 },
  navigationList: {
    display: "grid",
    paddingBlock: spacingVars.space1,
    marginInlineStart: `calc(${sizeVars.iconSm} + ${spacingVars.space2})`,
  },
  navigation: { marginInlineStart: `calc(${spacingVars.space3} * -1)`, minWidth: 0 },
  field: { display: "grid", gap: spacingVars.space3 },
  fieldLabel: { fontWeight: typo.fontWeightSemibold },
  description: { margin: 0, color: colorVars.fgSecondary, overflowWrap: "anywhere" },
  select: { width: "100%", minWidth: 0 },
  themes: { width: "100%" },
  themeOption: { flexGrow: 1 },
  languagePopup: {
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderColor: colorVars.strokeDefault,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: radiusVars.sm,
    boxShadow: shadowVars.overlay,
    width: "var(--anchor-width)",
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "var(--available-height)",
    overflow: "auto",
    outline: "none",
    padding: spacingVars.space1,
  },
  focus: {
    outline: { ":is(.less-control):focus-visible": `2px solid ${colorVars.fgFeedbackInfo}` },
    outlineOffset: { ":is(.less-control):focus-visible": 3 },
  },
  tooltip: {
    backgroundColor: colorVars.bgRaised,
    color: colorVars.fgPrimary,
    borderRadius: radiusVars.sm,
    paddingBlock: spacingVars.space1,
    paddingInline: spacingVars.space2,
    boxShadow: shadowVars.overlay,
    fontSize: typo.fontSizeXs,
  },
  error: { color: colorVars.fgFeedbackError, margin: 0, overflowWrap: "anywhere" },
});
