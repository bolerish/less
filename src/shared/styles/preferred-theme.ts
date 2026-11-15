import { getSurfaceProps } from "./surface";
import "./global.css";

const preference = window.matchMedia("(prefers-color-scheme: dark)");

function syncTheme(): void {
  document.documentElement.classList.toggle("dark", preference.matches);
  document.documentElement.classList.remove(
    ...getSurfaceProps(false).className!.split(" "),
    ...getSurfaceProps(true).className!.split(" "),
  );
  document.documentElement.classList.add(
    ...getSurfaceProps(preference.matches).className!.split(" "),
  );
  document.documentElement.style.colorScheme = preference.matches ? "dark" : "light";
}

syncTheme();
preference.addEventListener("change", syncTheme);
