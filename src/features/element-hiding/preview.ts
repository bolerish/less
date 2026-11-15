import { isHiddenElement, isHideExcludedElement } from "~features/element-hiding";
import { HIDDEN_INLINE_STYLE_ATTRIBUTE } from "~features/element-hiding/hide-policy";
import { resolveMatchedElement } from "~features/element-hiding/match/record-match-resolver";
import type { HiddenElementRecord } from "~features/record/schema";
import { portRequest } from "~features/record/content-port";
import { finishHiddenElementAnimation } from "~features/element-hiding/element-hide";
import { positionPreview } from "~features/element-hiding/preview-position";
import { getPanelMessage as message } from "~features/record/management-messages";
import { getPaintedRect } from "~shared/lib/painted-rect";

export type PreviewState = { id: string | null; message: string };
export type HiddenItemPreview = ReturnType<typeof createHiddenItemPreview>;

export function createHiddenItemPreview() {
  let state: PreviewState = { id: null, message: "" };
  type Target = { element: HTMLElement; style: string | null; animation?: Animation };
  let current: Target | null = null;
  const outgoing = new Set<Target>();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function restore(target: Target): void {
    target.animation?.cancel();
    if (target.style === null) target.element.removeAttribute("style");
    else target.element.setAttribute("style", target.style);
  }
  let revision = 0;
  let cleanupPosition: (() => void) | undefined;
  let previewPanel: HTMLDialogElement | null = null;
  const listeners = new Set<(state: PreviewState) => void>();
  function publish(next: PreviewState): void {
    state = next;
    for (const listener of listeners) listener(next);
  }
  function clear(animate = false): void {
    revision++;
    cleanupPosition?.();
    cleanupPosition = undefined;
    if (previewPanel) {
      delete previewPanel.dataset.previewLayout;
      delete previewPanel.dataset.previewEdge;
      previewPanel = null;
    }
    for (const target of outgoing) restore(target);
    outgoing.clear();
    if (current) {
      const target = current;
      current = null;
      const opacity = getComputedStyle(target.element).opacity;
      target.animation?.cancel();
      if (animate && !reducedMotion.matches && target.element.isConnected) {
        outgoing.add(target);
        target.animation = target.element.animate([{ opacity }, { opacity: 0 }], {
          duration: 140,
          easing: "ease-in",
          fill: "forwards",
        });
        void target.animation.finished
          .then(() => {
            if (outgoing.delete(target)) restore(target);
          })
          .catch(() => {});
      } else restore(target);
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
      clear(true);
      const pending = revision;
      const { origin, pathname: path, search } = location;
      publish({ id: null, message: message("panel_find") });
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
            message: message("panel_other_page"),
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
            message: message("panel_unavailable"),
          });
          return;
        }
        const element = match.matchedElement;
        for (const target of outgoing) {
          if (target.element !== element) continue;
          outgoing.delete(target);
          restore(target);
        }
        finishHiddenElementAnimation(element);
        current = { element, style: element.getAttribute("style") };
        previewPanel = panel;
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
        const originalOpacity = getComputedStyle(element).opacity;
        const opacity = Number(originalOpacity) > 0 ? originalOpacity : "1";
        element.style.setProperty("opacity", opacity);
        element.style.setProperty("transition", "none", "important");
        element.style.setProperty("visibility", "visible", "important");
        const outline = panel
          ? getComputedStyle(panel).getPropertyValue("--less-panel-focus").trim()
          : "Highlight";
        element.style.setProperty("outline", `3px solid ${outline}`, "important");
        element.style.setProperty("outline-offset", "3px", "important");

        const rect = getPaintedRect(element);
        const visible = element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        if (!rect.width || !rect.height || !visible) {
          clear();
          publish({
            id: null,
            message: message("panel_hidden_parent"),
          });
          return;
        }
        if (!reducedMotion.matches) {
          current.animation = element.animate([{ opacity: 0 }, { opacity }], {
            duration: 140,
            easing: "ease-out",
          });
        }
        // Wait for the panel's React update and the restored target's actual layout.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (pending !== revision) return;
        if (!positionPreview(element, panel)) {
          clear();
          publish({
            id: null,
            message: message("panel_covered"),
          });
          return;
        }
        publish({
          id,
          message: message("panel_preview_description"),
        });
        let frame = 0;
        const reposition = (): void => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            if (pending === revision) positionPreview(element, panel);
          });
        };
        const observer = new ResizeObserver(reposition);
        observer.observe(element);
        observer.observe(document.body);
        window.addEventListener("resize", reposition);
        document.addEventListener("load", reposition, true);
        cleanupPosition = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          window.removeEventListener("resize", reposition);
          document.removeEventListener("load", reposition, true);
        };
      } catch {
        if (pending !== revision) return;
        clear();
        publish({
          id: null,
          message: message("panel_preview_error"),
        });
      }
    },
  };
}
