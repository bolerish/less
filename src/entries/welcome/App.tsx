import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import wxtLogo from "~assets/logo.svg";
import { Kbd, KbdGroup } from "~shared/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~shared/components/ui/select";

type Locale = "en" | "ko" | "ja" | "es" | "zh_CN";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "es", label: "Español" },
  { value: "zh_CN", label: "中文" },
];

type Step = {
  title: string;
  description: string;
  kbdLabel?: string;
};

type Translations = {
  title: string;
  steps: Step[];
  tryLabel: string;
  trySearchPlaceholder: string;
  tryGoLabel: string;
};

// Steps at index 2 and 3 show inline shortcuts (⇧ Ctrl E and ⇧ Ctrl Z).
const STEP_SHORTCUTS = [null, null, ["⇧", "Ctrl", "E"], ["⇧", "Ctrl", "Z"]] as const;

const translations: Record<Locale, Translations> = {
  en: {
    title: "Hide distractions with Veil.",
    steps: [
      {
        title: "Pin the extension",
        description: 'Click the puzzle icon in your toolbar and pin "Veil" to keep it accessible.',
      },
      {
        title: "Open Veil on any page",
        description: "Navigate to a website and click the Veil icon in your toolbar.",
      },
      {
        title: "Enter selection mode",
        description: "Click the cursor icon in the popup, or use the shortcut.",
        kbdLabel: "Toggle selection mode",
      },
      {
        title: "Click to hide",
        description: "Hover over any element — ads, banners, sidebars — and click to hide it forever.",
        kbdLabel: "Restore a hidden element",
      },
    ],
    tryLabel: "Try it on any site",
    trySearchPlaceholder: "Search or paste a URL...",
    tryGoLabel: "Go",
  },
  ko: {
    title: "Veil로 불필요한 것을 숨기세요.",
    steps: [
      {
        title: "확장 프로그램 고정",
        description: '툴바의 퍼즐 아이콘을 클릭하고 "Veil"을 고정하세요.',
      },
      {
        title: "아무 페이지에서 Veil 열기",
        description: "웹사이트로 이동한 후 툴바의 Veil 아이콘을 클릭하세요.",
      },
      {
        title: "선택 모드 진입",
        description: "팝업의 커서 아이콘을 클릭하거나, 단축키를 사용하세요.",
        kbdLabel: "선택 모드 켜기/끄기",
      },
      {
        title: "클릭해서 숨기기",
        description: "숨기고 싶은 요소 위로 마우스를 올리고 클릭하면 영구 숨김됩니다.",
        kbdLabel: "숨긴 요소 되돌리기",
      },
    ],
    tryLabel: "원하는 사이트에서 써보기",
    trySearchPlaceholder: "검색어나 URL을 입력하세요...",
    tryGoLabel: "이동",
  },
  ja: {
    title: "Veilで邪魔なものを非表示にしましょう。",
    steps: [
      {
        title: "拡張機能を固定する",
        description: 'ツールバーのパズルアイコンをクリックして"Veil"を固定してください。',
      },
      {
        title: "任意のページでVeilを開く",
        description: "ウェブサイトに移動し、ツールバーのVeilアイコンをクリックしてください。",
      },
      {
        title: "選択モードに入る",
        description: "ポップアップのカーソルアイコンをクリックするか、ショートカットを使ってください。",
        kbdLabel: "選択モードの切り替え",
      },
      {
        title: "クリックして非表示にする",
        description: "広告、バナー、サイドバーにカーソルを合わせてクリックすると永久に非表示になります。",
        kbdLabel: "非表示にした要素を復元",
      },
    ],
    tryLabel: "実際のサイトで試す",
    trySearchPlaceholder: "検索またはURLを入力...",
    tryGoLabel: "開く",
  },
  es: {
    title: "Oculta lo innecesario con Veil.",
    steps: [
      {
        title: "Ancla la extensión",
        description: 'Haz clic en el icono de rompecabezas en tu barra y ancla "Veil".',
      },
      {
        title: "Abre Veil en cualquier página",
        description: "Navega a un sitio web y haz clic en el icono de Veil en tu barra de herramientas.",
      },
      {
        title: "Entra en modo selección",
        description: "Haz clic en el icono de cursor en el popup o usa el atajo de teclado.",
        kbdLabel: "Activar o desactivar modo selección",
      },
      {
        title: "Clic para ocultar",
        description: "Pasa el cursor sobre cualquier elemento — anuncios, banners, barras — y haz clic para ocultarlo.",
        kbdLabel: "Restaurar un elemento oculto",
      },
    ],
    tryLabel: "Pruébalo en cualquier sitio",
    trySearchPlaceholder: "Busca o pega una URL...",
    tryGoLabel: "Ir",
  },
  zh_CN: {
    title: "用 Veil 隐藏不需要的内容。",
    steps: [
      {
        title: "固定扩展程序",
        description: '点击工具栏中的拼图图标并固定"Veil"。',
      },
      {
        title: "在任意页面打开 Veil",
        description: "导航到网站，然后点击工具栏中的 Veil 图标。",
      },
      {
        title: "进入选择模式",
        description: "点击弹出窗口中的光标图标，或使用快捷键。",
        kbdLabel: "切换选择模式",
      },
      {
        title: "点击以隐藏",
        description: "将鼠标悬停在任何元素上（广告、横幅、侧边栏），点击即可永久隐藏。",
        kbdLabel: "恢复已隐藏的元素",
      },
    ],
    tryLabel: "在任意网站试用",
    trySearchPlaceholder: "搜索或粘贴网址...",
    tryGoLabel: "前往",
  },
};

const LOCALE_TO_LANG: Record<Locale, string> = {
  en: "en",
  ko: "ko",
  ja: "ja",
  es: "es",
  zh_CN: "zh-CN",
};

function detectLocale(): Locale {
  const lang = browser.i18n.getUILanguage().toLowerCase();
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("zh")) return "zh_CN";
  return "en";
}

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
          <Select value={locale} onValueChange={(v: string) => setLocale(v as Locale)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <p className="text-xs font-medium text-zinc-500 mb-3">
              {t.tryLabel}
            </p>

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
                <ArrowRight size={14} weight="bold" />
              </button>
            </form>

          </div>
        </div>
      </div>

    </div>
  );
}

export default App;
