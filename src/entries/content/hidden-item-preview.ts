import { isHiddenElement, isHideExcludedElement } from "~features/element-hiding";
import { HIDDEN_INLINE_STYLE_ATTRIBUTE } from "~features/element-hiding/hide-policy";
import { resolveMatchedElement } from "~features/element-hiding/match/record-match-resolver";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "./port";

export type PreviewState = { id: string | null; message: string };
export type HiddenItemPreview = ReturnType<typeof createHiddenItemPreview>;

export function createHiddenItemPreview() {
  let state: PreviewState = { id: null, message: "" };
  let current: { element: HTMLElement; style: string | null } | null = null;
  let revision = 0;
  const listeners = new Set<(state: PreviewState) => void>();
  function publish(next: PreviewState): void {
    state = next;
    for (const listener of listeners) listener(next);
  }
  function clear(): void {
    revision++;
    if (current) {
      if (current.style === null) current.element.removeAttribute("style");
      else current.element.setAttribute("style", current.style);
      current = null;
    }
    publish({ id: null, message: "" });
  }
  return {
    get hasNotice() {
      return state.message !== "";
    },
    clear,
    subscribe(listener: (state: PreviewState) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    async show(id: string, panel: HTMLDialogElement | null = null): Promise<void> {
      clear();
      const pending = revision;
      const { origin, pathname: path, search } = location;
      publish({ id: null, message: "Finding this item on the page…" });
      try {
        // Use the same page/scope and matching boundary as the hiding engine.
        const response = await portRequest<{ records?: HiddenElementRecord[] }>({
          type: "GET_RECORDS_FOR_PAGE",
          origin,
          path,
          search,
        });
        if (pending !== revision) return;
        const record = response.records?.find((record) => record.id === id);
        if (!record) {
          publish({
            id: null,
            message: "This item belongs to another page. Open its saved path to locate it.",
          });
          return;
        }
        const match = resolveMatchedElement(document, record);
        if (
          match.status !== "matched" ||
          isHideExcludedElement(match.matchedElement) ||
          !isHiddenElement(match.matchedElement)
        ) {
          publish({
            id: null,
            message:
              "This hidden item is not available in the current page. Its saved rule is unchanged.",
          });
          return;
        }
        const element = match.matchedElement;
        current = { element, style: element.getAttribute("style") };
        const savedStyle = element.getAttribute(HIDDEN_INLINE_STYLE_ATTRIBUTE);
        if (savedStyle === null) element.removeAttribute("style");
        else element.setAttribute("style", savedStyle);
        // Read its original layout without the preload rule, synchronously before any paint.
        const preload = document.getElementById("__veil_preload__") as HTMLStyleElement | null;
        const disabled = preload?.disabled ?? false;
        let display: string;
        try {
          if (preload) preload.disabled = true;
          display = getComputedStyle(element).display;
        } finally {
          if (preload) preload.disabled = disabled;
        }
        // Inline importance beats preload !important without editing its rules or the stored cache.
        element.style.setProperty("display", display, "important");
        element.style.setProperty("opacity", "1", "important");
        element.style.setProperty("visibility", "visible", "important");
        element.style.setProperty("outline", "3px solid #3884ff", "important");
        element.style.setProperty("outline-offset", "3px", "important");
        publish({
          id,
          message: "Temporarily showing this item on the page. Its hiding rule is still saved.",
        });
        const rect = element.getBoundingClientRect();
        const visible = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        if (!rect.width || !rect.height || !visible) {
          clear();
          publish({
            id: null,
            message:
              "This item is inside a hidden container and cannot be located here. Its saved rule is unchanged.",
          });
          return;
        }
        // The compact preview panel leaves room for the page, including on a 320px screen.
        const panelRect = panel?.getBoundingClientRect();
        const visibleBesidePanel = panelRect
          ? Math.max(0, Math.min(rect.right, panelRect.left) - Math.max(0, rect.left))
          : rect.width;
        const bottom =
          panelRect && visibleBesidePanel < Math.min(80, rect.width)
            ? panelRect.top - 8
            : innerHeight;
        const visibleHeight = Math.min(rect.bottom, bottom) - Math.max(rect.top, 0);
        if (
          visibleHeight < Math.min(rect.height, bottom, 80) ||
          rect.right <= 0 ||
          rect.left >= innerWidth
        ) {
          element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          const after = element.getBoundingClientRect();
          if (after.top >= bottom - Math.min(after.height, 80)) {
            window.scrollBy({
              top: after.top - Math.max(8, (bottom - Math.min(after.height, bottom)) / 2),
              behavior: "instant",
            });
          }
        }
        const after = element.getBoundingClientRect();
        if (
          Math.min(after.bottom, bottom) <= Math.max(after.top, 0) ||
          after.right <= 0 ||
          after.left >= innerWidth
        ) {
          clear();
          publish({
            id: null,
            message:
              "The panel or page layout covers this item. It cannot be shown here. Its saved rule is unchanged.",
          });
        }
      } catch {
        if (pending !== revision) return;
        clear();
        publish({
          id: null,
          message: "Could not locate this item. Reload the page and try again.",
        });
      }
    },
  };
}
