import { getPanelMessage as message } from "../../features/record/management-messages";

document.documentElement.lang = browser.i18n.getUILanguage();
document.title = message("panel_unavailable_title");
const heading = document.querySelector('[data-message="panel_unavailable_heading"]');
if (heading) heading.textContent = message("panel_unavailable_heading");
const action = document.querySelector('[data-message="panel_unavailable_action"]');
if (action) action.textContent = message("panel_unavailable_action");
const protectedMessage = document.querySelector('[data-message="panel_unavailable_protected"]');
if (protectedMessage) protectedMessage.textContent = message("panel_unavailable_protected");
const reload = document.querySelector('[data-message="panel_unavailable_reload"]');
if (reload) reload.textContent = message("panel_unavailable_reload");
