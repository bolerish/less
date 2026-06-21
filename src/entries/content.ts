import { applyRecordsHiding } from "~features/element-hiding";
import { deriveHiddenElementRecord } from "~features/record/derivation/record-input-derivation";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";
import { addRecord, getRecordsByPage, getRecordsBySiteLayout } from "~features/record";
import { getSiteHidingEnabled } from "~features/hiding-preference";

const HIGHLIGHT_ATTR = "data-pare-highlight";

export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    void bootstrap();
  },
});

async function bootstrap(): Promise<void> {
  const origin = window.location.origin;
  const enabled = await getSiteHidingEnabled(origin);
  if (enabled) {
    await applyStoredHiding();
  }

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isMessage(message)) return;

    if (message.type === "SET_SELECTION_ENABLED") {
      if (message.enabled) {
        startSelectionMode();
      } else {
        stopSelectionMode();
      }
    }

    if (message.type === "REFRESH_HIDING") {
      void applyStoredHiding();
    }
  });
}

async function applyStoredHiding(): Promise<void> {
  const ctx = deriveCurrentPageContext(window);
  const [pageRecords, siteRecords] = await Promise.all([
    getRecordsByPage(ctx.origin, ctx.path, ctx.search),
    getRecordsBySiteLayout(ctx.origin),
  ]);
  applyRecordsHiding(document, [...pageRecords, ...siteRecords]);
}

// --- Selection mode ---

let selectionActive = false;
let highlightEl: HTMLDivElement | null = null;
let hoveredEl: HTMLElement | null = null;

function startSelectionMode(): void {
  if (selectionActive) return;
  selectionActive = true;

  highlightEl = createHighlightOverlay();
  document.documentElement.appendChild(highlightEl);

  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

function stopSelectionMode(): void {
  if (!selectionActive) return;
  selectionActive = false;
  hoveredEl = null;

  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);

  if (highlightEl) {
    highlightEl.remove();
    highlightEl = null;
  }
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

  void hideAndSave(target);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    stopSelectionMode();
  }
}

async function hideAndSave(element: HTMLElement): Promise<void> {
  stopSelectionMode();
  const record = deriveHiddenElementRecord(element, document);
  element.style.setProperty("display", "none", "important");
  element.setAttribute("data-pare-hidden", "true");
  try {
    await addRecord(record);
  } catch (error) {
    console.warn("[pare] failed to save record", error);
  }
}

function resolveTarget(x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    if (isOverlayOrHidden(el)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "html" || tag === "body") continue;
    return el;
  }
  return null;
}

function isOverlayOrHidden(el: Element): boolean {
  return el.hasAttribute(HIGHLIGHT_ATTR) || el.getAttribute("data-pare-hidden") === "true";
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
    top: `${rect.top + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function createHighlightOverlay(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute(HIGHLIGHT_ATTR, "true");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "absolute",
    top: "0",
    left: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    background: "rgba(59,130,246,0.15)",
    border: "2px solid rgba(59,130,246,0.7)",
    borderRadius: "3px",
    boxSizing: "border-box",
    transition: "top 60ms, left 60ms, width 60ms, height 60ms",
    display: "none",
  });
  return el;
}

interface Message {
  type: string;
  enabled?: boolean;
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "type" in value;
}
