import {
  applyHiddenElement,
  isHiddenElement,
  isHideExcludedElement,
  restoreHiddenElement,
} from "~features/element-hiding";
import { deriveHiddenElementRecord } from "~features/record/derivation/record-input-derivation";
import { resolveSelectionTarget } from "~features/selection/targeting/target-resolver";
import { invalidateRecordCache } from "./hiding-watcher";
import { PANEL_HOST_ATTRIBUTE } from "./page-panel";
import {
  shieldIframes,
  syncShieldPositions,
  unshieldAllIframes,
  SHIELD_ATTR,
} from "./iframe-shield";
import { portRequest } from "./port";
import { removePreloadCSSForElement } from "./preload-css-sync";
import { CORNER_ATTR, flashViewportGlow } from "./selection-feedback";
import {
  HIGHLIGHT_ATTR,
  STATUS_BAR_ATTR,
  mountSelectionUI,
  unmountSelectionUI,
  updateHighlight,
  updateStatusBarContent,
  updateStatusBarError,
} from "./selection-toolbar";

export let selectionActive = false;
const selectionListeners = new Set<(active: boolean) => void>();

export function subscribeSelection(listener: (active: boolean) => void): () => void {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}

let hoveredEl: HTMLElement | null = null;
let sessionHiddenCount = 0;
const undoStack: Array<{ element: HTMLElement; recordId: string }> = [];

export function getUndoCount(): number {
  return undoStack.length;
}

export function startSelectionMode(): void {
  if (selectionActive) return;
  selectionActive = true;
  sessionHiddenCount = 0;
  undoStack.length = 0;

  mountSelectionUI(stopSelectionMode, () => void restoreLastHidden());
  flashViewportGlow();
  shieldIframes();

  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
  for (const listener of selectionListeners) listener(true);
}

export function stopSelectionMode(): void {
  if (!selectionActive) return;
  selectionActive = false;
  hoveredEl = null;

  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  window.removeEventListener("scroll", handleViewportChange, true);
  window.removeEventListener("resize", handleViewportChange);

  unmountSelectionUI();
  flashViewportGlow();
  unshieldAllIframes();
  for (const listener of selectionListeners) listener(false);
}

export function reconcileUndoStack(retainedIds: string[]): void {
  const retained = new Set(retainedIds);
  for (let i = undoStack.length - 1; i >= 0; i--) {
    if (!retained.has(undoStack[i].recordId)) undoStack.splice(i, 1);
  }
  sessionHiddenCount = undoStack.length;
  updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
}

export async function restoreLastHidden(): Promise<void> {
  const last = undoStack.pop();
  if (!last) return;
  removePreloadCSSForElement(last.element);
  restoreHiddenElement(last.element);
  sessionHiddenCount = Math.max(0, sessionHiddenCount - 1);
  try {
    const response = await portRequest<{ ok: boolean }>({
      type: "DELETE_RECORD",
      id: last.recordId,
    });
    if (!response.ok) throw new Error("Could not delete hidden item");
    invalidateRecordCache();
  } catch {
    undoStack.push(last);
    sessionHiddenCount++;
    applyHiddenElement(last.element);
    updateStatusBarError("Could not restore this item. Try again.");
    return;
  }
  updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
}

function handlePointerMove(event: PointerEvent): void {
  const target = resolveTarget(event.clientX, event.clientY);
  hoveredEl = target;
  updateHighlight(target);
}

function handleClick(event: MouseEvent): void {
  if (
    (event.target as HTMLElement).closest(`[${STATUS_BAR_ATTR}],[${PANEL_HOST_ATTRIBUTE}]`) !== null
  )
    return;

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
  applyHiddenElement(element, true);
  try {
    const response = await portRequest<{ ok: boolean }>({ type: "ADD_RECORD", record });
    if (!response.ok) throw new Error("Could not save hidden item");
    invalidateRecordCache();
    sessionHiddenCount++;
    undoStack.push({ element, recordId: record.id });
    updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
  } catch {
    restoreHiddenElement(element);
    updateStatusBarError("Could not save this item. Try again.");
    return;
  }
  await collapseEmptyAncestors(element);
}

async function collapseEmptyAncestors(origin: HTMLElement): Promise<void> {
  const MAX_DEPTH = 2;
  let current = origin.parentElement;
  let depth = 0;

  while (current !== null && depth < MAX_DEPTH) {
    if (isHideExcludedElement(current)) break;
    if (isHiddenElement(current)) break;
    if (current.closest(`[${HIGHLIGHT_ATTR}],[${STATUS_BAR_ATTR}],[${SHIELD_ATTR}]`)) break;
    if (!hasNoVisibleContent(current)) break;

    const record = deriveHiddenElementRecord(current, document);
    applyHiddenElement(current, false);
    try {
      // eslint-disable-next-line no-await-in-loop -- Each ancestor depends on the previous hide.
      const response = await portRequest<{ ok: boolean }>({ type: "ADD_RECORD", record });
      if (!response.ok) throw new Error("Could not save hidden item");
      invalidateRecordCache();
      sessionHiddenCount++;
      undoStack.push({ element: current, recordId: record.id });
      updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
    } catch {
      restoreHiddenElement(current);
      updateStatusBarError("Could not save an empty container. Try again.");
      break;
    }

    current = current.parentElement;
    depth++;
  }
}

function hasNoVisibleContent(el: HTMLElement): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return false;
  }
  for (const child of el.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (isHiddenElement(child)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return false;
  }
  return true;
}

function resolveTarget(x: number, y: number): HTMLElement | null {
  return resolveSelectionTarget(document, x, y, isOverlayOrHidden);
}

function isOverlayOrHidden(el: HTMLElement): boolean {
  return (
    el.closest(
      `[${HIGHLIGHT_ATTR}],[${STATUS_BAR_ATTR}],[${SHIELD_ATTR}],[${CORNER_ATTR}],[${PANEL_HOST_ATTRIBUTE}]`,
    ) !== null || isHiddenElement(el)
  );
}
