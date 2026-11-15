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
import { type Locale, LOCALE_TO_LANG, detectLocale, translations } from "./locale";

// Steps at index 2 and 3 show inline shortcuts (⇧ Ctrl E and ⇧ Ctrl Z).
const STEP_SHORTCUTS = [null, null, ["⇧", "Ctrl", "E"], ["⇧", "Ctrl", "Z"]] as const;

function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const t = translations[locale];

  useEffect(() => {
    document.documentElement.lang = LOCALE_TO_LANG[locale];
  }, [locale]);

  return (
    <main className="welcome">
      <div className="welcome-content">
        {/* Header */}
        <div className="welcome-header">
          <div className="welcome-brand">
            <img src={wxtLogo} alt="Less logo" width={32} />
            <Heading level={1} size="page" className="welcome-title">
              {t.title}
            </Heading>
          </div>
          <LanguageSelect value={locale} onValueChange={setLocale} />
        </div>

        <Separator className="welcome-divider" />

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
                    <div className="welcome-shortcut">
                      <KbdGroup>
                        {shortcut.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                      <span className="welcome-shortcut-label">{step.kbdLabel}</span>
                    </div>
                  )}
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
