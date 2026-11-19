import { Banner, BannerContent, BannerTitle, BannerDescription } from "@bolerish/ui/banner";
import * as stylex from "@stylexjs/stylex";
import { colorVars, spacingVars, typo } from "@bolerish/tokens/semantic.stylex";
import { Link } from "@bolerish/ui/link";
import { Heading } from "@bolerish/ui/heading";
import { Separator } from "@bolerish/ui/separator";
import { Kbd, KbdGroup } from "@bolerish/ui/kbd";
import {
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineIndicator,
  TimelineItem,
  TimelineTitle,
} from "@bolerish/ui/timeline";
import { useEffect, useState } from "react";
import wxtLogo from "~assets/logo.png";
import { LanguageSelect } from "./LanguageSelect";
import { translations } from "./locale";
import { LOCALE_TO_LANG, detectLocale } from "~shared/locale/locales";
import { useLocalePreference } from "~shared/locale/use-locale";
import { setLocalePreference } from "~shared/locale/preference";
import { usePanelMessage } from "~shared/locale/use-panel-message";

// Steps at index 2 and 3 show inline shortcuts (⇧ Ctrl E and ⇧ Ctrl Z).
const STEP_SHORTCUTS = [null, null, ["⇧", "Ctrl", "E"], ["⇧", "Ctrl", "Z"]] as const;

function App() {
  const preference = useLocalePreference();
  const locale = preference === "auto" ? detectLocale(browser.i18n.getUILanguage()) : preference;
  const message = usePanelMessage();
  const [error, setError] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [shortcutsFailed, setShortcutsFailed] = useState(false);
  const t = translations[locale];

  useEffect(() => {
    document.documentElement.lang = LOCALE_TO_LANG[locale];
    document.title = t.documentTitle;
  }, [locale, t.documentTitle]);

  return (
    <main className={["welcome", stylex.props(styles.root).className].join(" ")}>
      <div className={["welcome-content", stylex.props(styles.content).className].join(" ")}>
        {/* Header */}
        <div className={["welcome-header", stylex.props(styles.header).className].join(" ")}>
          <div className={["welcome-brand", stylex.props(styles.brand).className].join(" ")}>
            <img src={wxtLogo} alt="" width={32} />
            <Heading level={1} size="page" className="welcome-title">
              {t.title}
            </Heading>
          </div>
          <LanguageSelect
            ariaLabel={t.languageLabel}
            value={locale}
            onValueChange={(value) => {
              setError(false);
              void setLocalePreference(value).catch(() => setError(true));
            }}
          />
        </div>

        {error ? <p role="alert">{message("panel_language_error")}</p> : null}
        <Separator className="welcome-divider" xstyle={styles.divider} />

        {import.meta.env.BROWSER === "chrome" ? (
          <Banner size="md" xstyle={styles.notice}>
            <BannerContent>
              <BannerTitle>{t.accessTitle}</BannerTitle>
              <BannerDescription>{t.accessDescription}</BannerDescription>
              <Link
                variant="current"
                href={`chrome://extensions/?id=${browser.runtime.id}`}
                onClick={async (event) => {
                  event.preventDefault();
                  try {
                    await browser.tabs.create({
                      url: `chrome://extensions/?id=${browser.runtime.id}`,
                    });
                    setSettingsFailed(false);
                  } catch {
                    setSettingsFailed(true);
                  }
                }}
              >
                {message(
                  settingsFailed ? "panel_failure_settings_retry" : "panel_failure_settings",
                )}
              </Link>
            </BannerContent>
          </Banner>
        ) : null}
        <Timeline>
          {t.steps.map((step, i) => {
            const shortcut = STEP_SHORTCUTS[i];
            return (
              <TimelineItem key={step.title}>
                <TimelineIndicator className="welcome-step-indicator">{i + 1}</TimelineIndicator>
                <TimelineContent className="welcome-step-content">
                  <TimelineTitle>{step.title}</TimelineTitle>
                  <TimelineDescription>{step.description}</TimelineDescription>
                  {shortcut && step.kbdLabel && (
                    <div
                      className={["welcome-shortcut", stylex.props(styles.shortcut).className].join(
                        " ",
                      )}
                    >
                      <KbdGroup>
                        {shortcut.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                      <span
                        className={[
                          "welcome-shortcut-label",
                          stylex.props(styles.shortcutLabel).className,
                        ].join(" ")}
                      >
                        {step.kbdLabel}
                      </span>
                    </div>
                  )}
                  {i === 2 && import.meta.env.BROWSER === "chrome" ? (
                    <Link
                      variant="current"
                      href="chrome://extensions/shortcuts"
                      onClick={async (event) => {
                        event.preventDefault();
                        try {
                          await browser.tabs.create({ url: "chrome://extensions/shortcuts" });
                          setShortcutsFailed(false);
                        } catch {
                          setShortcutsFailed(true);
                        }
                      }}
                    >
                      {shortcutsFailed
                        ? message("panel_failure_settings_retry")
                        : t.shortcutSettings}
                    </Link>
                  ) : null}
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </div>
    </main>
  );
}

export default App;

const styles = stylex.create({
  root: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: `calc(${spacingVars.space8} * 2) ${spacingVars.space8}`,
    background: "var(--less-app-background)",
  },
  notice: { marginBottom: spacingVars.space8 },
  content: { width: "100%", maxWidth: 672 },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacingVars.space4,
    marginBottom: spacingVars.space8,
  },
  brand: { display: "flex", minWidth: 0, alignItems: "center", gap: spacingVars.space3 },
  divider: { marginBottom: spacingVars.space8 },
  shortcut: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacingVars.space2,
    marginTop: spacingVars.space2,
  },
  shortcutLabel: { fontSize: typo.fontSizeXs, color: colorVars.fgSecondary },
});
