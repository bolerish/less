import {
  applyHiddenElement,
  applyRecordsHiding,
  restoreAllHiddenElements,
} from "~features/element-hiding";
import { getSiteHidingEnabled } from "~features/hiding-preference";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import { deriveHiddenElementRecord } from "~features/record/derivation/record-input-derivation";
import type { HiddenElementRecord } from "~features/record/schema";
import { resolveSelectionTarget } from "~features/selection/targeting/target-resolver";

const HIGHLIGHT_ATTR = "data-pare-highlight";
const STATUS_BAR_ATTR = "data-pare-ui";
const SHIELD_ATTR = "data-pare-iframe-shield";
const HIDING_KEY_PREFIX = "pare:hiding-enabled:";

export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    void bootstrap();
  },
});

async function bootstrap(): Promise<void> {
  const origin = window.location.origin;
  const hidingKey = `${HIDING_KEY_PREFIX}${encodeURIComponent(origin)}`;

  const enabled = await getSiteHidingEnabled(origin);
  if (enabled) await applyStoredHiding();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(hidingKey in changes)) return;
    const nowEnabled = changes[hidingKey].newValue !== false;
    if (nowEnabled) void applyStoredHiding();
    else restoreAllHiddenElements(document);
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isMessage(message)) return;

    if (message.type === "SET_SELECTION_ENABLED") {
      if (message.enabled) startSelectionMode();
      else stopSelectionMode();
    }

    if (message.type === "REFRESH_HIDING") {
      restoreAllHiddenElements(document);
      void applyStoredHiding();
    }
  });
}

async function applyStoredHiding(): Promise<void> {
  const ctx = deriveCurrentPageContext(window);
  try {
    const response = (await browser.runtime.sendMessage({
      type: "GET_RECORDS_FOR_PAGE",
      origin: ctx.origin,
      path: ctx.path,
      search: ctx.search,
    })) as { records: HiddenElementRecord[] };
    applyRecordsHiding(document, response.records);
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

const iframeShields = new Map<HTMLIFrameElement, HTMLDivElement>();
const iframeOriginalPointerEvents = new Map<HTMLIFrameElement, string>();
let shieldObserver: MutationObserver | null = null;

function startSelectionMode(): void {
  if (selectionActive) return;
  selectionActive = true;
  sessionHiddenCount = 0;

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
  applyHiddenElement(element);
  try {
    await browser.runtime.sendMessage({ type: "ADD_RECORD", record });
    sessionHiddenCount++;
    if (statusBarEl) updateStatusBarContent(statusBarEl);
  } catch {
    console.warn("[pare] failed to save record");
  }
}

function resolveTarget(x: number, y: number): HTMLElement | null {
  return resolveSelectionTarget(document, x, y, isOverlayOrHidden);
}

function isOverlayOrHidden(el: HTMLElement): boolean {
  return (
    el.hasAttribute(HIGHLIGHT_ATTR) ||
    el.hasAttribute(STATUS_BAR_ATTR) ||
    el.hasAttribute(SHIELD_ATTR) ||
    el.getAttribute("data-pare-hidden") === "true"
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

function createStatusBar(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute(STATUS_BAR_ATTR, "true");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    background: "rgba(9,9,11,0.88)",
    color: "#fafafa",
    borderRadius: "9999px",
    padding: "8px 20px",
    fontSize: "13px",
    fontFamily: "system-ui,-apple-system,sans-serif",
    fontWeight: "450",
    lineHeight: "1.5",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 16px rgba(0,0,0,0.32)",
    pointerEvents: "none",
  });
  updateStatusBarContent(el);
  return el;
}

function updateStatusBarContent(el: HTMLDivElement): void {
  el.textContent =
    sessionHiddenCount > 0
      ? `${sessionHiddenCount} hidden · Click for more · Esc to stop`
      : "Click to hide · Esc to stop";
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
