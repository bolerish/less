export const LESS_THEME_HOSTS =
  "[data-less-panel], [data-less-ui], [data-less-highlight], [data-less-corner]";
let backgroundProbe: Element | undefined;

export function isPageDark(changedElement?: Element): boolean {
  const root = document.documentElement;

  const colorScheme = window.getComputedStyle(root).colorScheme;
  if (colorScheme === "dark") return true;
  if (colorScheme === "light") return false;

  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  if (document.body?.classList.contains("dark")) return true;
  if (document.body?.classList.contains("light")) return false;

  for (const element of [root, document.body]) {
    const theme = element?.getAttribute("data-theme") ?? element?.getAttribute("data-color-scheme");
    if (theme === "dark") return true;
    if (theme === "light") return false;
  }

  const bgLuminance = (el: Element): number | null => {
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) return null;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.1) return null;
    return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
  };

  for (const el of [root, document.body]) {
    if (!el) continue;
    const lum = bgLuminance(el);
    if (lum !== null) return lum < 0.5;
  }

  // Ignore our overlays so an open panel cannot become its own theme source.
  let probe = document
    .elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    .find((element) => !element.closest(LESS_THEME_HOSTS));
  if (probe && probe !== root && probe !== document.body) backgroundProbe = probe;
  // Modal backdrops block page hit testing; a changed page element can still identify the background.
  for (const candidate of [changedElement, backgroundProbe]) {
    if (!candidate?.isConnected) continue;
    const rect = candidate.getBoundingClientRect();
    const x = window.innerWidth / 2,
      y = window.innerHeight / 2;
    if (rect.left <= x && rect.right >= x && rect.top <= y && rect.bottom >= y) {
      probe = backgroundProbe = candidate;
      break;
    }
  }
  let el: Element | null = probe ?? document.body;
  while (el && el !== root.parentElement) {
    const lum = bgLuminance(el);
    if (lum !== null) return lum < 0.5;
    el = el.parentElement;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
