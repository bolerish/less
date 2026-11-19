import { createRoot } from "react-dom/client";
import { Button } from "@bolerish/ui/button";
import "~shared/styles/global.css";
import { initializeLocale, getLanguage, subscribeLocale } from "~shared/locale/preference";
import logo from "~assets/logo.png";
import { getPanelMessage } from "~features/record/management-messages";
import "~shared/styles/preferred-theme";
import * as stylex from "@stylexjs/stylex";
import { typo } from "@bolerish/tokens/semantic.stylex";

const params = new URLSearchParams(location.search);
const reason = params.get("reason");
const key =
  reason === "protected" || reason === "reload" || reason === "access" || reason === "temporary"
    ? reason
    : "generic";
const controls = document.createElement("div");
document.querySelector("main")!.append(controls);
const root = createRoot(controls);
let failed = false;
function renderMessage() {
  document.documentElement.lang = getLanguage();
  document.getElementById("message")!.textContent = getPanelMessage(`panel_failure_${key}`);
  if (key === "access" || key === "temporary")
    root.render(
      <Button
        onClick={async () => {
          try {
            await browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
          } catch {
            failed = true;
            renderMessage();
          }
        }}
      >
        {getPanelMessage(failed ? "panel_failure_settings_retry" : "panel_failure_settings")}
      </Button>,
    );
}
await initializeLocale();
renderMessage();
subscribeLocale(renderMessage);
(document.getElementById("logo") as HTMLImageElement).src = logo;

if (params.has("request")) {
  const tabId = Number(params.get("tab"));
  void browser.runtime.sendMessage({ type: "FAILURE_POPUP_READY" }).catch(() => {});
  browser.tabs.onActivated.addListener(({ tabId: activeId }) => {
    if (activeId !== tabId) window.close();
  });
  browser.tabs.onUpdated.addListener((id, change) => {
    if (id === tabId && (change.url !== undefined || change.status === "loading")) window.close();
  });
  browser.tabs.onRemoved.addListener((id) => {
    if (id === tabId) window.close();
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});

const styles = stylex.create({
  root: { width: 320 },
  body: {
    boxSizing: "border-box",
    padding: 20,
    fontSize: typo.fontSizeSm,
    lineHeight: typo.lineHeightNormal,
  },
  header: { display: "flex", alignItems: "center", gap: 10 },
  title: { margin: 0, fontSize: typo.fontSizeMd, fontWeight: typo.fontWeightSemibold },
  message: { margin: "16px 0 0", overflowWrap: "anywhere" },
});
for (const [selector, style] of [
  ["html", styles.root],
  ["body", styles.body],
  ["header", styles.header],
  ["h1", styles.title],
  ["#message", styles.message],
] as const) {
  document.querySelector(selector)?.classList.add(...stylex.props(style).className!.split(" "));
}
