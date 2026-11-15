import logo from "~assets/logo.png";
import { getPanelMessage } from "../../features/record/management-messages";
import "~shared/styles/bolerish-tokens.css";
import "~shared/styles/app-background.css";
import "~shared/styles/preferred-theme";
import "./style.css";

const params = new URLSearchParams(location.search);
const reason = params.get("reason");
const key = reason === "protected" || reason === "reload" ? reason : "generic";
document.documentElement.lang = browser.i18n.getUILanguage().replace("_", "-");
document.getElementById("message")!.textContent = getPanelMessage(`panel_failure_${key}`);
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
