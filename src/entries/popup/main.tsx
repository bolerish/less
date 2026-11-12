import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "~shared/styles/global.css";
import "~shared/styles/bolerish-tokens.css";
import "~shared/styles/preferred-theme";
import { TooltipProvider } from "~shared/components/ui/tooltip.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
