import { initializeLocale } from "~shared/locale/preference";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "~shared/styles/global.css";
import "./style.css";
import "~shared/styles/preferred-theme";

await initializeLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
