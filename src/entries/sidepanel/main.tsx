import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useActiveSite } from "./useActiveSite";
import "@bolerish/ui/global.css";
import "~shared/styles/bolerish-tokens.css";
import "./style.css";
import "~shared/styles/app-background.css";
import "~shared/styles/preferred-theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LegacyPanel />
  </StrictMode>,
);

// Retained source for the retired document; WXT excludes this native entrypoint.
function LegacyPanel() {
  const { site } = useActiveSite();
  if (!site) return <p>Open a website and click the Less toolbar icon.</p>;
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
