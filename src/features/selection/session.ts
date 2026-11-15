import { getPanelMessage as message } from "~features/record/management-messages";
import {
  applyHiddenElement,
  isHiddenElement,
  restoreHiddenElement,
} from "~features/element-hiding";
import { deriveHiddenElementRecord } from "~features/record/derivation/record-input-derivation";
import {
  resolveSelectionTarget,
  resolveSelectionParent,
} from "~features/selection/targeting/target-resolver";
import { invalidateRecordCache } from "~features/element-hiding/watcher";
import {
  shieldIframes,
  syncShieldPositions,
  unshieldAllIframes,
  SHIELD_ATTR,
} from "~features/selection/iframe-shield";
import { portRequest } from "~features/record/content-port";
import { removePreloadCSSForElement } from "~features/element-hiding/preload-css";
import { CORNER_ATTR, flashViewportGlow } from "~features/selection/feedback";
import {
  HIGHLIGHT_ATTR,
  STATUS_BAR_ATTR,
  mountSelectionUI,
  unmountSelectionUI,
  updateHighlight,
  updateStatusBarContent,
  updateStatusBarError,
} from "~features/selection/toolbar";

const PANEL_HOST_ATTRIBUTE = "data-less-panel";

export let selectionActive = false;
const selectionListeners = new Set<(active: boolean) => void>();

export function subscribeSelection(listener: (active: boolean) => void): () => void {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}

let hoveredEl: HTMLElement | null = null;
const ancestorTrail: HTMLElement[] = [];
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
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("mousedown", handlePointerDown, true);
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
  ancestorTrail.length = 0;

  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("pointerdown", handlePointerDown, true);
  document.removeEventListener("mousedown", handlePointerDown, true);
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
    updateStatusBarError(message("panel_selection_restore_error"));
    return;
  }
  updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
}

function handlePointerMove(event: PointerEvent): void {
  const target = resolveTarget(event.clientX, event.clientY);
  if (ancestorTrail.length > 0 && target && hoveredEl?.contains(target)) return;
  ancestorTrail.length = 0;
  hoveredEl = target;
  updateHighlight(target);
}

function isSelectionUI(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(`[${STATUS_BAR_ATTR}],[${PANEL_HOST_ATTRIBUTE}]`) !== null
  );
}

function handlePointerDown(event: MouseEvent): void {
  if (isSelectionUI(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handleClick(event: MouseEvent): void {
  if (isSelectionUI(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const target = hoveredEl ?? resolveTarget(event.clientX, event.clientY);
  if (target === null) return;

  if (event.shiftKey) {
    hoveredEl = target;
    selectParent();
    updateHighlight(hoveredEl);
    return;
  }

  hoveredEl = null;
  ancestorTrail.length = 0;
  updateHighlight(null);
  void hideAndSave(target);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    stopSelectionMode();
    return;
  }
  if (hoveredEl === null || !hoveredEl.isConnected) return;
  if (isSelectionUI(event.target)) return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    selectParent();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    hoveredEl = ancestorTrail.pop() ?? hoveredEl;
  } else if (event.key === "Enter") {
    event.preventDefault();
    const target = hoveredEl;
    hoveredEl = null;
    ancestorTrail.length = 0;
    void hideAndSave(target);
  } else return;
  event.stopPropagation();
  updateHighlight(hoveredEl);
}

function selectParent(): void {
  if (!hoveredEl) return;
  const parent = resolveSelectionParent(hoveredEl, isOverlayOrHidden);
  if (parent !== null) {
    ancestorTrail.push(hoveredEl);
    hoveredEl = parent;
  }
}

function handleViewportChange(): void {
  if (hoveredEl) updateHighlight(hoveredEl);
  syncShieldPositions();
}

async function hideAndSave(element: HTMLElement): Promise<void> {
  if (isHiddenElement(element)) return;
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
    updateStatusBarError(message("panel_selection_save_error"));
    return;
  }
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
