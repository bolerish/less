import { getPanelMessage } from "../record/management-messages";

// WXT's generated Chrome browserAction declarations omit Firefox's promise APIs.
// Firefox implements the same methods used here, including openPopup (MDN).
type ToolbarAction = Pick<
  typeof browser.action,
  "onClicked" | "setBadgeText" | "setTitle" | "setPopup" | "getPopup"
> & { openPopup?: (options?: { windowId?: number }) => Promise<void> };
const action: ToolbarAction =
  import.meta.env.MANIFEST_VERSION === 2
    ? (browser.browserAction as unknown as ToolbarAction)
    : browser.action;
const failureDocument = browser.runtime.getURL("/failure.html");
type FailureReason = "protected" | "reload" | "generic";

export function registerPanelAction(): void {
  const requests = new Map<number, symbol>();
  const queues = new Map<number, Promise<void>>();
  let intent = Symbol();
  // Browser action settings outlive a stopped worker; finish recovery before new work.
  const recovered = browser.tabs
    .query({})
    .then((tabs) =>
      Promise.allSettled(
        tabs.map((tab) => (tab.id === undefined ? undefined : clearPopup(tab.id))),
      ),
    )
    .catch(() => {});

  function enqueue(tabId: number, work: () => Promise<void>): void {
    const pending = (queues.get(tabId) ?? recovered).then(work).catch(() => {});
    queues.set(tabId, pending);
    void pending.finally(() => {
      if (queues.get(tabId) === pending) queues.delete(tabId);
    });
  }

  action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const tabId = tab.id;
    const request = Symbol();
    requests.set(tabId, request);
    intent = request;
    enqueue(tabId, async () => {
      const current = () => requests.get(tabId) === request && intent === request;
      try {
        if (!current() || !(await isCurrentTab(tab))) return;
        const frame = await browser.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
        const url = frame?.url ?? tab.url;
        let reason: FailureReason | undefined;
        try {
          const response = await browser.tabs.sendMessage(
            tabId,
            { type: "TOGGLE_PAGE_PANEL" },
            { frameId: 0 },
          );
          if (!response?.ok) reason = "generic";
        } catch (error) {
          reason = classifyFailure(url, error);
        }
        if (!current() || !(await isCurrentTab(tab))) return;
        if (!reason) {
          await action.setBadgeText({ tabId, text: "" });
          await action.setTitle({ tabId, title: "Less" });
          return;
        }
        await action.setBadgeText({ tabId, text: "!" });
        await action.setTitle({ tabId, title: getPanelMessage(`panel_failure_${reason}`) });
        if (typeof action.openPopup !== "function" || !current()) return;
        const popup = `${failureDocument}?${new URLSearchParams({
          reason,
          tab: String(tabId),
          request: crypto.randomUUID(),
        })}`;
        try {
          await action.setPopup({ tabId, popup });
          if (!current() || !(await isCurrentTab(tab))) return;
          await action.openPopup({ windowId: tab.windowId });
        } finally {
          await clearPopup(tabId, popup);
        }
      } finally {
        if (requests.get(tabId) === request) requests.delete(tabId);
      }
    });
  });

  browser.tabs.onActivated.addListener(() => {
    intent = Symbol();
  });
  browser.windows.onFocusChanged.addListener(() => {
    intent = Symbol();
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url === undefined && change.status !== "loading") return;
    requests.delete(tabId);
    enqueue(tabId, async () => {
      await clearPopup(tabId);
      await action.setBadgeText({ tabId, text: "" });
      await action.setTitle({ tabId, title: "Less" });
    });
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    requests.delete(tabId);
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      sender.id !== browser.runtime.id ||
      !sender.url ||
      !sender.url.startsWith(`${failureDocument}?`) ||
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "FAILURE_POPUP_READY"
    )
      return;
    const popup = sender.url;
    const tabId = Number(new URL(popup).searchParams.get("tab"));
    if (!Number.isInteger(tabId) || tabId < 0) return;
    // Also wakes a stopped worker if it was interrupted between setPopup and cleanup.
    enqueue(tabId, async () => {
      await clearPopup(tabId, popup);
      sendResponse({ ok: true });
    });
    return true;
  });
}

async function isCurrentTab(tab: Browser.tabs.Tab): Promise<boolean> {
  if (tab.id === undefined) return false;
  const [active] = await browser.tabs.query({ active: true, windowId: tab.windowId });
  const window = await browser.windows.get(tab.windowId);
  return window.focused && active?.id === tab.id && active.url === tab.url && !active.pendingUrl;
}

async function clearPopup(tabId: number, ownedPopup?: string): Promise<void> {
  const popup = await action.getPopup({ tabId });
  if (ownedPopup ? popup !== ownedPopup : !popup.startsWith(`${failureDocument}?`)) return;
  await action.setPopup({ tabId, popup: "" });
}

function classifyFailure(url: string | undefined, error: unknown): FailureReason {
  if (url) {
    const page = new URL(url);
    if (
      !["http:", "https:"].includes(page.protocol) ||
      page.hostname === "chromewebstore.google.com" ||
      (page.hostname === "chrome.google.com" && page.pathname.startsWith("/webstore")) ||
      page.hostname === "addons.mozilla.org"
    )
      return "protected";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    /receiving end does not exist|could not establish connection|extension context invalidated|message port closed|message channel closed/i.test(
      message,
    )
  )
    return "reload";
  return "generic";
}
