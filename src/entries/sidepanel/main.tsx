import { themeClassNames } from "@bolerish/ui/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@bolerish/ui/global.css";
import "./panel-tokens.css";
import "./style.css";

const preference = window.matchMedia("(prefers-color-scheme: dark)");
function syncTheme(): void {
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
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
