import type { Locale } from "~shared/locale/locales";

export type Step = {
  title: string;
  description: string;
  kbdLabel?: string;
};

export type Translations = {
  documentTitle: string;
  languageLabel: string;
  title: string;
  steps: Step[];
};

export const translations: Record<Locale, Translations> = {
  en: {
    documentTitle: "Welcome to Less",
    languageLabel: "Language",
    title: "Hide distractions with Less.",
    steps: [
      {
        title: "Pin the extension",
        description: 'Click the puzzle icon in your toolbar and pin "Less" to keep it accessible.',
      },
      {
        title: "Open Less on a website",
        description: "Navigate to a website and click the Less icon in your toolbar.",
      },
      {
        title: "Enter selection mode",
        description: "Choose “Hide an item” in the Less panel, or use the shortcut.",
        kbdLabel: "Toggle selection mode",
      },
      {
        title: "Click to hide",
        description: "Point to an item and click to hide it. Your choice is saved.",
        kbdLabel: "Undo the last hide",
      },
    ],
  },
  ko: {
    documentTitle: "Less 시작하기",
    languageLabel: "언어",
    title: "Less로 불필요한 것을 숨기세요.",
    steps: [
      {
        title: "확장 프로그램 고정",
        description: "툴바의 퍼즐 아이콘을 클릭하고 Less를 고정하세요.",
      },
      {
        title: "웹사이트에서 Less 열기",
        description: "웹사이트로 이동한 후 툴바의 Less 아이콘을 클릭하세요.",
      },
      {
        title: "선택 모드 진입",
        description: "Less 패널에서 “항목 숨기기”를 선택하거나 단축키를 사용하세요.",
        kbdLabel: "선택 모드 켜기/끄기",
      },
      {
        title: "클릭해서 숨기기",
        description: "숨길 항목에 마우스를 올리고 클릭하세요. 숨김 설정이 저장됩니다.",
        kbdLabel: "마지막 숨김 취소",
      },
    ],
  },
  ja: {
    documentTitle: "Lessへようこそ",
    languageLabel: "言語",
    title: "Lessで邪魔なものを非表示にしましょう。",
    steps: [
      {
        title: "拡張機能を固定する",
        description: 'ツールバーのパズルアイコンをクリックして"Less"を固定してください。',
      },
      {
        title: "ウェブサイトでLessを開く",
        description: "ウェブサイトに移動し、ツールバーのLessアイコンをクリックしてください。",
      },
      {
        title: "選択モードに入る",
        description:
          "Lessのパネルで「項目を非表示にする」を選ぶか、ショートカットを使ってください。",
        kbdLabel: "選択モードの切り替え",
      },
      {
        title: "クリックして非表示にする",
        description:
          "非表示にしたい項目にカーソルを合わせてクリックしてください。設定は保存されます。",
        kbdLabel: "直前の非表示を取り消す",
      },
    ],
  },
  es: {
    documentTitle: "Te damos la bienvenida a Less",
    languageLabel: "Idioma",
    title: "Oculta lo innecesario con Less.",
    steps: [
      {
        title: "Ancla la extensión",
        description: 'Haz clic en el icono de rompecabezas en tu barra y ancla "Less".',
      },
      {
        title: "Abre Less en un sitio web",
        description:
          "Navega a un sitio web y haz clic en el icono de Less en tu barra de herramientas.",
      },
      {
        title: "Entra en modo selección",
        description: "Elige «Ocultar un elemento» en el panel de Less o usa el atajo de teclado.",
        kbdLabel: "Activar o desactivar modo selección",
      },
      {
        title: "Clic para ocultar",
        description: "Coloca el cursor sobre el elemento que quieras ocultar y haz clic.",
        kbdLabel: "Deshacer la última ocultación",
      },
    ],
  },
  zh_CN: {
    documentTitle: "欢迎使用 Less",
    languageLabel: "语言",
    title: "用 Less 隐藏不需要的内容。",
    steps: [
      {
        title: "固定扩展程序",
        description: '点击工具栏中的拼图图标并固定"Less"。',
      },
      {
        title: "在网站上打开 Less",
        description: "导航到网站，然后点击工具栏中的 Less 图标。",
      },
      {
        title: "进入选择模式",
        description: "在 Less 面板中点击“隐藏项目”，或使用快捷键。",
        kbdLabel: "切换选择模式",
      },
      {
        title: "点击以隐藏",
        description: "将鼠标移到想隐藏的项目上并点击。隐藏设置会保存。",
        kbdLabel: "撤销上一次隐藏",
      },
    ],
  },
};
