import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "~shared/styles/global.css";

const mq = window.matchMedia("(prefers-color-scheme: dark)");
function syncTheme() {
  document.documentElement.classList.toggle("dark", mq.matches);
}
syncTheme();
mq.addEventListener("change", syncTheme);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
