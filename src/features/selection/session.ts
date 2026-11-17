import { reconcileCSSSelector } from "~features/element-hiding/preload-css";
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
let baseEl: HTMLElement | null = null;
let shiftPressed = false;
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
  document.addEventListener("keyup", handleKeyUp, true);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
  for (const listener of selectionListeners) listener(true);
}

export function stopSelectionMode(): void {
  if (!selectionActive) return;
  selectionActive = false;
  hoveredEl = null;
  baseEl = null;
  shiftPressed = false;
  ancestorTrail.length = 0;

  document.removeEventListener("pointermove", handlePointerMove, true);
  document.removeEventListener("pointerdown", handlePointerDown, true);
  document.removeEventListener("mousedown", handlePointerDown, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);
  document.removeEventListener("keyup", handleKeyUp, true);
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
    updateStatusBarError("panel_selection_restore_error");
    return;
  }
  updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
}

function handlePointerMove(event: PointerEvent): void {
  const target = resolveTarget(event.clientX, event.clientY);
  shiftPressed = event.shiftKey;
  if (!shiftPressed && ancestorTrail.length > 0 && target && baseEl?.contains(target)) return;
  ancestorTrail.length = 0;
  baseEl = target;
  updateSelectionHighlight();
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

  const target = hoveredEl;
  if (target === null || !target.isConnected) return;

  baseEl = null;
  ancestorTrail.length = 0;
  updateSelectionHighlight();
  void hideAndSave(target);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    stopSelectionMode();
    return;
  }
  if (isSelectionUI(event.target)) return;
  if (event.key === "Shift") {
    shiftPressed = true;
    updateSelectionHighlight();
    return;
  }
  if (baseEl === null || !baseEl.isConnected) return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    const parent = resolveSelectionParent(baseEl, isOverlayOrHidden);
    if (parent !== null) {
      ancestorTrail.push(baseEl);
      baseEl = parent;
    }
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    baseEl = ancestorTrail.pop() ?? baseEl;
  } else if (event.key === "Enter") {
    event.preventDefault();
    const target = hoveredEl;
    if (!target || !target.isConnected) return;
    baseEl = null;
    ancestorTrail.length = 0;
    void hideAndSave(target);
  } else return;
  event.stopPropagation();
  updateSelectionHighlight();
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.key !== "Shift") return;
  shiftPressed = false;
  updateSelectionHighlight();
}

function updateSelectionHighlight(): void {
  hoveredEl = baseEl;
  if (shiftPressed && baseEl) hoveredEl = resolveSelectionParent(baseEl, isOverlayOrHidden);
  updateHighlight(hoveredEl);
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
    await reconcileCSSSelector(record, element);
    invalidateRecordCache();
    sessionHiddenCount++;
    undoStack.push({ element, recordId: record.id });
    updateStatusBarContent(sessionHiddenCount, undoStack.length > 0);
  } catch {
    restoreHiddenElement(element);
    updateStatusBarError("panel_selection_save_error");
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
