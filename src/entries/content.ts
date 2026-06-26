import {
  applyHiddenElement,
  applyRecordsHiding,
  restoreAllHiddenElements,
  restoreHiddenElement,
} from "~features/element-hiding";
import { getSiteHidingEnabled } from "~features/hiding-preference";
import { pageCSSCacheKey, siteCSSCacheKey } from "~features/record/css-cache";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import { deriveHiddenElementRecord } from "~features/record/derivation/record-input-derivation";
import { resolveCSSSelector } from "~features/record/derivation/record-match-signal-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { resolveSelectionTarget } from "~features/selection/targeting/target-resolver";

const HIGHLIGHT_ATTR = "data-bare-highlight";
const STATUS_BAR_ATTR = "data-bare-ui";
const SHIELD_ATTR = "data-bare-iframe-shield";
const HIDING_KEY_PREFIX = "bare:hiding-enabled:";

let hidingEnabled = false;

export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    void bootstrap();
  },
});

async function bootstrap(): Promise<void> {
  const origin = window.location.origin;
  const hidingKey = `${HIDING_KEY_PREFIX}${encodeURIComponent(origin)}`;

  hidingEnabled = await getSiteHidingEnabled(origin);
  if (hidingEnabled) {
    await applyStoredHiding();
    watchAndReapplyHiding();
  }

  setupNavigationListener();
  document.addEventListener("keydown", handleGlobalKeyDown, true);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(hidingKey in changes)) return;
    hidingEnabled = changes[hidingKey].newValue !== false;
    if (hidingEnabled) {
      void applyStoredHiding();
      watchAndReapplyHiding();
    } else {
      stopReapplyWatcher();
      restoreAllHiddenElements(document);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isMessage(message)) return;

    if (message.type === "SET_SELECTION_ENABLED") {
      if (message.enabled) startSelectionMode();
      else stopSelectionMode();
    }

    if (message.type === "REFRESH_HIDING") {
      invalidateRecordCache();
      document.getElementById("__bare_preload__")?.remove();
      restoreAllHiddenElements(document);
      void applyStoredHiding();
      watchAndReapplyHiding();
    }

    if (message.type === "GET_UNDO_COUNT") {
      sendResponse({ count: undoStack.length });
      return true;
    }

    if (message.type === "RESTORE_LAST") {
      void restoreLastHidden().then(() => sendResponse({ count: undoStack.length }));
      return true;
    }
  });
}

async function applyStoredHiding(): Promise<void> {
  const ctx = deriveCurrentPageContext(window);
  const cacheKey = `${ctx.path}\x00${ctx.search}`;

  const cached = recordCache.get(cacheKey);
  if (cached) {
    applyRecordsHiding(document, cached);
    return;
  }

  try {
    const response = (await browser.runtime.sendMessage({
      type: "GET_RECORDS_FOR_PAGE",
      origin: ctx.origin,
      path: ctx.path,
      search: ctx.search,
    })) as { records: HiddenElementRecord[] };
    recordCache.set(cacheKey, response.records);

    const toCache: Array<{ record: HiddenElementRecord; el: HTMLElement }> = [];
    applyRecordsHiding(document, response.records, (record, el) => {
      if (!record.cssSelector) toCache.push({ record, el });
    });
    if (toCache.length > 0) void retroactivelyCacheSelectorBatch(toCache);
  } catch {
    // Background may not be ready on very early page load
  }
}

// --- Selection mode ---

let selectionActive = false;
let highlightEl: HTMLDivElement | null = null;
let statusBarEl: HTMLDivElement | null = null;
let hoveredEl: HTMLElement | null = null;
let sessionHiddenCount = 0;

const undoStack: Array<{ element: HTMLElement; recordId: string }> = [];
let statusInfoEl: HTMLSpanElement | null = null;
let statusRestoreWrapperEl: HTMLDivElement | null = null;

// --- In-memory record cache ---

const recordCache = new Map<string, HiddenElementRecord[]>();

function invalidateRecordCache(): void {
  recordCache.clear();
}

// --- Retroactive CSS caching ---

async function retroactivelyCacheSelectorBatch(
  items: Array<{ record: HiddenElementRecord; el: HTMLElement }>,
): Promise<void> {
  const byKey = new Map<string, string[]>();

  for (const { record, el } of items) {
    const cssSelector = resolveCSSSelector(el, document);
    if (!cssSelector) continue;
    const { origin, path, search } = record.pageContext;
    const key =
      record.scope === "site-layout"
        ? siteCSSCacheKey(origin)
        : pageCSSCacheKey(origin, path, search);
    const list = byKey.get(key);
    if (list) {
      if (!list.includes(cssSelector)) list.push(cssSelector);
    } else {
      byKey.set(key, [cssSelector]);
    }
  }

  for (const [key, newSelectors] of byKey) {
    const stored = ((await browser.storage.local.get(key))[key] as string[] | undefined) ?? [];
    const toAdd = newSelectors.filter((s) => !stored.includes(s));
    if (toAdd.length > 0) {
      await browser.storage.local.set({ [key]: [...stored, ...toAdd] });
    }
  }
}

// --- Deferred hiding (SPA / dynamic content) ---

let reapplyObserver: MutationObserver | null = null;
let reapplyStopTimer: ReturnType<typeof setTimeout> | null = null;

function watchAndReapplyHiding(): void {
  if (reapplyObserver) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  reapplyObserver = new MutationObserver(() => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void applyStoredHiding(), 80);
  });

  reapplyObserver.observe(document.documentElement, { childList: true, subtree: true });

  reapplyStopTimer = setTimeout(stopReapplyWatcher, 8_000);
}

function stopReapplyWatcher(): void {
  reapplyObserver?.disconnect();
  reapplyObserver = null;
  if (reapplyStopTimer !== null) {
    clearTimeout(reapplyStopTimer);
    reapplyStopTimer = null;
  }
}

function setupNavigationListener(): void {
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    origPush(...args);
    onSpaNavigation();
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    origReplace(...args);
    onSpaNavigation();
  };

  window.addEventListener("popstate", onSpaNavigation);
}

function onSpaNavigation(): void {
  if (!hidingEnabled) return;
  stopReapplyWatcher();
  void applyStoredHiding();
  watchAndReapplyHiding();
}

// --- Iframe shields ---

const iframeShields = new Map<HTMLIFrameElement, HTMLDivElement>();
const iframeOriginalPointerEvents = new Map<HTMLIFrameElement, string>();
let shieldObserver: MutationObserver | null = null;

function startSelectionMode(): void {
  if (selectionActive) return;
  selectionActive = true;
  sessionHiddenCount = 0;
  undoStack.length = 0;

  highlightEl = createHighlightOverlay();
  document.documentElement.appendChild(highlightEl);

  statusBarEl = createStatusBar();
  document.documentElement.appendChild(statusBarEl);

  shieldIframes();

  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
}

function stopSelectionMode(): void {
  if (!selectionActive) return;
  selectionActive = false;
  hoveredEl = null;

  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("scroll", handleViewportChange, true);
  window.removeEventListener("resize", handleViewportChange);

  highlightEl?.remove();
  highlightEl = null;
  statusBarEl?.remove();
  statusBarEl = null;
  statusInfoEl = null;
  statusRestoreWrapperEl = null;

  unshieldAllIframes();
}

function handlePointerMove(event: PointerEvent): void {
  const target = resolveTarget(event.clientX, event.clientY);
  hoveredEl = target;
  updateHighlight(target);
}

function handleClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();

  const target = hoveredEl ?? resolveTarget(event.clientX, event.clientY);
  if (target === null) return;

  hoveredEl = null;
  updateHighlight(null);
  void hideAndSave(target);
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.shiftKey && event.ctrlKey) {
    if (event.key === "E") {
      event.preventDefault();
      if (!hidingEnabled) return;
      if (selectionActive) stopSelectionMode();
      else startSelectionMode();
      return;
    }
    if (event.key === "Z") {
      event.preventDefault();
      void restoreLastHidden();
      return;
    }
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    stopSelectionMode();
  }
}

function handleViewportChange(): void {
  if (hoveredEl) updateHighlight(hoveredEl);
  syncShieldPositions();
}

async function hideAndSave(element: HTMLElement): Promise<void> {
  const record = deriveHiddenElementRecord(element, document);
  applyHiddenElement(element, true);
  try {
    await browser.runtime.sendMessage({ type: "ADD_RECORD", record });
    invalidateRecordCache();
    sessionHiddenCount++;
    undoStack.push({ element, recordId: record.id });
    updateStatusBarContent();
  } catch {
    console.warn("[bare] failed to save record");
  }
}

async function restoreLastHidden(): Promise<void> {
  const last = undoStack.pop();
  if (!last) return;
  removePreloadCSSForElement(last.element);
  restoreHiddenElement(last.element);
  sessionHiddenCount = Math.max(0, sessionHiddenCount - 1);
  try {
    await browser.runtime.sendMessage({ type: "DELETE_RECORD", id: last.recordId });
    invalidateRecordCache();
  } catch {
    console.warn("[bare] failed to delete record");
  }
  updateStatusBarContent();
}

function resolveTarget(x: number, y: number): HTMLElement | null {
  return resolveSelectionTarget(document, x, y, isOverlayOrHidden);
}

function isOverlayOrHidden(el: HTMLElement): boolean {
  return (
    el.closest(`[${HIGHLIGHT_ATTR}],[${STATUS_BAR_ATTR}],[${SHIELD_ATTR}]`) !== null ||
    el.getAttribute("data-bare-hidden") === "true"
  );
}

function updateHighlight(target: HTMLElement | null): void {
  if (!highlightEl) return;
  if (target === null) {
    highlightEl.style.display = "none";
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    highlightEl.style.display = "none";
    return;
  }
  Object.assign(highlightEl.style, {
    display: "block",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function createHighlightOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute(HIGHLIGHT_ATTR, "true");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    top: "0",
    left: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    background: "rgba(59,130,246,0.15)",
    border: "2px solid rgba(59,130,246,0.7)",
    borderRadius: "3px",
    boxSizing: "border-box",
    display: "none",
  });
  return el;
}

function isPageDark(): boolean {
  for (const el of [document.documentElement, document.body]) {
    if (!el) continue;
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
    if (!m) continue;
    const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (alpha < 0.1) continue;
    const luminance = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    return luminance < 0.5;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function createStatusBar(): HTMLDivElement {
  const isDark = isPageDark();

  const applyPillStyle = (el: HTMLDivElement): void => {
    Object.assign(el.style, {
      background: isDark ? "rgba(250,250,250,0.95)" : "rgba(9,9,11,0.88)",
      color: isDark ? "#18181b" : "#fafafa",
      borderRadius: "9999px",
      padding: "8px 20px",
      fontSize: "13px",
      fontFamily: "system-ui,-apple-system,sans-serif",
      fontWeight: "450",
      lineHeight: "1.5",
      whiteSpace: "nowrap",
      boxShadow: isDark
        ? "0 4px 20px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1)"
        : "0 4px 16px rgba(0,0,0,0.32)",
      border: isDark ? "1px solid rgba(0,0,0,0.07)" : "none",
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
    });
  };

  // Wrapper — positions both pills
  const wrapper = document.createElement("div");
  wrapper.setAttribute(STATUS_BAR_ATTR, "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  });

  // Undo pill — appears when something has been hidden
  const undoPill = document.createElement("div");
  applyPillStyle(undoPill);
  Object.assign(undoPill.style, {
    opacity: "0",
    transform: "scale(0.9) translateY(4px)",
    transition: "opacity 0.2s ease, transform 0.2s ease",
    cursor: "pointer",
    pointerEvents: "none",
  });
  const undoIcon = document.createElement("span");
  undoIcon.textContent = "↺";
  Object.assign(undoIcon.style, { fontSize: "15px", lineHeight: "1", pointerEvents: "none" });
  const undoLabel = document.createElement("span");
  undoLabel.textContent = "Undo";
  undoLabel.style.pointerEvents = "none";
  undoPill.appendChild(undoIcon);
  undoPill.appendChild(undoLabel);
  undoPill.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void restoreLastHidden();
  });
  wrapper.appendChild(undoPill);
  statusRestoreWrapperEl = undoPill;

  // Main pill — always visible
  const mainPill = document.createElement("div");
  applyPillStyle(mainPill);
  mainPill.style.pointerEvents = "none";

  const infoEl = document.createElement("span");
  mainPill.appendChild(infoEl);
  statusInfoEl = infoEl;

  mainPill.appendChild(makeSeparator(isDark));
  mainPill.appendChild(makeActionBtn(["Esc"], "Exit", stopSelectionMode, isDark));
  wrapper.appendChild(mainPill);

  updateStatusBarContent();
  return wrapper;
}

function updateStatusBarContent(): void {
  if (statusInfoEl) {
    statusInfoEl.textContent = sessionHiddenCount > 0 ? `${sessionHiddenCount} Hidden` : "Hide";
  }
  if (statusRestoreWrapperEl) {
    const hasUndo = undoStack.length > 0;
    statusRestoreWrapperEl.style.opacity = hasUndo ? "1" : "0";
    statusRestoreWrapperEl.style.transform = hasUndo ? "scale(1) translateY(0)" : "scale(0.9) translateY(4px)";
    statusRestoreWrapperEl.style.pointerEvents = hasUndo ? "auto" : "none";
  }
}

function makeActionBtn(
  keys: string[],
  label: string,
  onClick: () => void,
  isDark: boolean,
): HTMLSpanElement {
  const btn = document.createElement("span");
  Object.assign(btn.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    cursor: "pointer",
    pointerEvents: "auto",
  });
  const keysWrap = document.createElement("span");
  Object.assign(keysWrap.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    pointerEvents: "none",
  });
  keys.forEach((k) => keysWrap.appendChild(makeKbd(k, isDark)));
  btn.appendChild(keysWrap);
  const text = document.createElement("span");
  text.textContent = label;
  text.style.pointerEvents = "none";
  btn.appendChild(text);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function makeKbd(text: string, isDark: boolean): HTMLElement {
  const kbd = document.createElement("kbd");
  kbd.textContent = text;
  Object.assign(kbd.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: isDark ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.1)",
    border: isDark ? "1px solid rgba(0,0,0,0.18)" : "1px solid rgba(255,255,255,0.28)",
    borderBottom: isDark ? "2px solid rgba(0,0,0,0.14)" : "2px solid rgba(255,255,255,0.2)",
    borderRadius: "4px",
    padding: "0 5px",
    height: "18px",
    minWidth: "18px",
    fontSize: "10px",
    fontFamily: "inherit",
    fontWeight: "500",
    lineHeight: "1",
    letterSpacing: "0.02em",
    pointerEvents: "none",
  });
  return kbd;
}

function removePreloadCSSForElement(element: HTMLElement): void {
  const style = document.getElementById("__bare_preload__") as HTMLStyleElement | null;
  if (!style?.sheet) return;
  for (let i = style.sheet.cssRules.length - 1; i >= 0; i--) {
    try {
      if (element.matches((style.sheet.cssRules[i] as CSSStyleRule).selectorText)) {
        style.sheet.deleteRule(i);
      }
    } catch {
      // invalid selector
    }
  }
}

function makeDot(): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.textContent = "·";
  dot.style.opacity = "0.35";
  return dot;
}

function makeSeparator(isDark: boolean): HTMLSpanElement {
  const sep = document.createElement("span");
  Object.assign(sep.style, {
    display: "inline-block",
    width: "1px",
    height: "12px",
    background: isDark ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)",
    flexShrink: "0",
  });
  return sep;
}

// --- Iframe shields ---

function shieldIframes(): void {
  document.querySelectorAll<HTMLIFrameElement>("iframe").forEach(shieldOneIframe);

  shieldObserver = new MutationObserver((mutations) => {
    let changed = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLIFrameElement) {
          shieldOneIframe(node);
          changed = true;
        } else if (node instanceof HTMLElement) {
          node.querySelectorAll<HTMLIFrameElement>("iframe").forEach((iframe) => {
            shieldOneIframe(iframe);
            changed = true;
          });
        }
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof HTMLIFrameElement) removeShield(node);
      }
    }
    if (changed) syncShieldPositions();
  });

  shieldObserver.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function shieldOneIframe(iframe: HTMLIFrameElement): void {
  if (iframeShields.has(iframe)) return;

  iframeOriginalPointerEvents.set(iframe, iframe.style.pointerEvents);
  iframe.style.pointerEvents = "none";

  const rect = iframe.getBoundingClientRect();
  const zIndex = getComputedZIndex(iframe);

  const shield = document.createElement("div");
  shield.setAttribute(SHIELD_ATTR, "true");
  shield.setAttribute("aria-hidden", "true");
  Object.assign(shield.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: String(zIndex + 1),
    background: "transparent",
    pointerEvents: "auto",
  });

  document.documentElement.appendChild(shield);
  iframeShields.set(iframe, shield);
}

function removeShield(iframe: HTMLIFrameElement): void {
  const shield = iframeShields.get(iframe);
  if (shield) {
    shield.remove();
    iframeShields.delete(iframe);
  }
  const original = iframeOriginalPointerEvents.get(iframe);
  if (original !== undefined) {
    iframe.style.pointerEvents = original;
    iframeOriginalPointerEvents.delete(iframe);
  }
}

function syncShieldPositions(): void {
  iframeShields.forEach((shield, iframe) => {
    const rect = iframe.getBoundingClientRect();
    Object.assign(shield.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  });
}

function unshieldAllIframes(): void {
  Array.from(iframeShields.keys()).forEach(removeShield);
  shieldObserver?.disconnect();
  shieldObserver = null;
}

function getComputedZIndex(el: HTMLElement): number {
  const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

// --- Utilities ---

interface Message {
  type: string;
  enabled?: boolean;
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "type" in value;
}
