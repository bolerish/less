import { themeClassNames } from "@bolerish/ui/theme";

const preference = window.matchMedia("(prefers-color-scheme: dark)");

function syncTheme(): void {
  document.documentElement.classList.toggle("dark", preference.matches);
  document.documentElement.classList.remove(
    ...themeClassNames.light.split(" "),
    ...themeClassNames.dark.split(" "),
  );
  document.documentElement.classList.add(
    ...themeClassNames[preference.matches ? "dark" : "light"].split(" "),
  );
  document.documentElement.style.colorScheme = preference.matches ? "dark" : "light";
}

syncTheme();
preference.addEventListener("change", syncTheme);
