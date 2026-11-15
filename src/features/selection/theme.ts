export function isPageDark(): boolean {
  const root = document.documentElement;

  const colorScheme = window.getComputedStyle(root).colorScheme;
  if (colorScheme.includes("dark")) return true;
  if (colorScheme.includes("light")) return false;

  if (root.classList.contains("dark")) return true;
  if (root.classList.contains("light")) return false;
  if (document.body?.classList.contains("dark")) return true;
  if (document.body?.classList.contains("light")) return false;

  const theme = root.getAttribute("data-theme") ?? root.getAttribute("data-color-scheme");
  if (theme === "dark") return true;
  if (theme === "light") return false;

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

  const probe = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  let el: Element | null = probe ?? document.body;
  while (el && el !== root.parentElement) {
    const lum = bgLuminance(el);
    if (lum !== null) return lum < 0.5;
    el = el.parentElement;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
