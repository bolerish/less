import { useEffect, useState } from "react";
import wxtLogo from "~assets/logo.svg";
import { Kbd, KbdGroup } from "~shared/components/ui/kbd";
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
    <div className="min-h-screen bg-background flex flex-col items-center px-8 py-16">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src={wxtLogo} alt="Veil logo" width={32} />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{t.title}</h1>
          </div>
          <LanguageSelect value={locale} onValueChange={setLocale} />
        </div>

        <hr className="border-border mb-8" />

        <div className="flex flex-col gap-6">
          {t.steps.map((step, i) => {
            const shortcut = STEP_SHORTCUTS[i];
            return (
              <div key={i} className="flex gap-4">
                <div className="shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold">
                  {i + 1}
                </div>
                <div className="pt-0.5">
                  <p className="text-sm font-semibold text-foreground mb-1">{step.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                  {shortcut && step.kbdLabel && (
                    <div className="flex items-center gap-2 mt-2">
                      <KbdGroup>
                        {shortcut.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                      <span className="text-xs text-muted-foreground">{step.kbdLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
