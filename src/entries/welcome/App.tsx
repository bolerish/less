import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import wxtLogo from "~assets/logo.svg";
import { Kbd, KbdGroup } from "~shared/components/ui/kbd";
import { LanguageSelect } from "./LanguageSelect";
import { type Locale, LOCALE_TO_LANG, detectLocale, translations } from "./locale";

// Steps at index 2 and 3 show inline shortcuts (⇧ Ctrl E and ⇧ Ctrl Z).
const STEP_SHORTCUTS = [null, null, ["⇧", "Ctrl", "E"], ["⇧", "Ctrl", "Z"]] as const;

function buildUrl(query: string): string {
  const trimmed = query.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+\.[\w.-]+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = translations[locale];

  useEffect(() => {
    document.documentElement.lang = LOCALE_TO_LANG[locale];
  }, [locale]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    window.open(buildUrl(trimmed), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center px-8 py-16">
      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src={wxtLogo} alt="Veil logo" width={32} />
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{t.title}</h1>
          </div>
          <LanguageSelect value={locale} onValueChange={setLocale} />
        </div>

        <hr className="border-zinc-200 mb-8" />

        {/* Two-column layout */}
        <div className="grid grid-cols-[1fr_280px] gap-14 items-start">
          {/* Left: steps + per-site note */}
          <div>
            <div className="flex flex-col gap-6">
              {t.steps.map((step, i) => {
                const shortcut = STEP_SHORTCUTS[i];
                return (
                  <div key={i} className="flex gap-4">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-semibold text-zinc-900 mb-1">{step.title}</p>
                      <p className="text-xs text-zinc-500 leading-relaxed">{step.description}</p>
                      {shortcut && step.kbdLabel && (
                        <div className="flex items-center gap-2 mt-2">
                          <KbdGroup>
                            {shortcut.map((key) => (
                              <Kbd key={key}>{key}</Kbd>
                            ))}
                          </KbdGroup>
                          <span className="text-xs text-zinc-400">{step.kbdLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: try it (sticky) */}
          <div className="sticky top-16">
            <p className="text-xs font-medium text-zinc-500 mb-3">{t.tryLabel}</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.trySearchPlaceholder}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 transition-all"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 active:bg-zinc-800 transition-colors"
              >
                <span>{t.tryGoLabel}</span>
                <ArrowRightIcon size={14} weight="bold" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
