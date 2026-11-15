import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "~shared/styles/global.css";
import "./style.css";
import "~shared/styles/bolerish-tokens.css";
import "~shared/styles/app-background.css";
import "~shared/styles/preferred-theme";
import { TooltipProvider } from "@bolerish/ui/tooltip";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delay={0}>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);
