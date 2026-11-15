import { themeClassNames } from "@bolerish/ui/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useActiveSite } from "./useActiveSite";
import "@bolerish/ui/global.css";
import "~shared/styles/bolerish-tokens.css";
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
    <LegacyPanel />
  </StrictMode>,
);

// Retained source for the retired document; WXT excludes this native entrypoint.
function LegacyPanel() {
  const { site } = useActiveSite();
  if (!site) return <p>Open a website and click the Veil toolbar icon.</p>;
  return (
    <App
      origin={site.origin}
      onClose={() => window.close()}
      onSelect={() => {
        void browser.tabs.sendMessage(site.tabId, {
          type: "SET_SELECTION_ENABLED",
          enabled: true,
          origin: site.origin,
        });
      }}
    />
  );
}
