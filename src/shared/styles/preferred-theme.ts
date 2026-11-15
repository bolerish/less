import { getSurfaceProps } from "./surface";
import "./global.css";
import { initializeTheme, isThemeDark, subscribeTheme } from "~shared/theme/_model/theme";

function syncTheme(): void {
  const dark = isThemeDark();
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.remove(
    ...getSurfaceProps(false).className!.split(" "),
    ...getSurfaceProps(true).className!.split(" "),
  );
  document.documentElement.classList.add(...getSurfaceProps(dark).className!.split(" "));
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

syncTheme();
const disposeTheme = await initializeTheme(false);
syncTheme();
const unsubscribeTheme = subscribeTheme(syncTheme);
window.addEventListener(
  "unload",
  () => {
    unsubscribeTheme();
    disposeTheme();
  },
  { once: true },
);
