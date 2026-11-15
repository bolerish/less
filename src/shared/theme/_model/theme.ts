import { isPageDark, LESS_THEME_HOSTS } from "../_lib/page-theme";
import {
  getThemePreference,
  initializeThemePreference,
  subscribeThemePreference,
} from "./preference";

let hasPage = false;
let changedPageElement: Element | undefined;
const listeners = new Set<() => void>();

export function isThemeDark(): boolean {
  const preference = getThemePreference();
  if (preference === "dark") return true;
  if (preference === "light") return false;
  if (preference === "page" && hasPage) return isPageDark(changedPageElement);
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function initializeTheme(page: boolean): Promise<() => void> {
  hasPage = page;
  const disposePreference = await initializeThemePreference();
  let dark = isThemeDark();
  const notify = () => {
    const next = isThemeDark();
    if (next === dark) return;
    dark = next;
    for (const listener of listeners) listener();
  };
  const unsubscribe = subscribeThemePreference(notify);
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", notify);
  const observer = new MutationObserver((mutations) => {
    if (getThemePreference() !== "page") return;
    for (const { target } of mutations) {
      if (!(target instanceof Element) || target.closest(LESS_THEME_HOSTS)) continue;
      if (target !== document.documentElement && target !== document.body)
        changedPageElement = target;
      notify();
    }
  });
  if (page)
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
    });
  return () => {
    observer.disconnect();
    media.removeEventListener("change", notify);
    unsubscribe();
    disposePreference();
  };
}
