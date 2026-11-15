import { createRoot, type Root } from "react-dom/client";
import Panel from "./Panel";
import { getPanelMessage } from "~features/record/management-messages";
import * as stylex from "@stylexjs/stylex";
import { colorVars, radiusVars, shadowVars, motionVars } from "@bolerish/tokens/semantic.stylex";
import { getSurfaceProps } from "~shared/styles/surface";
import { appendContentStyles } from "~shared/styles/content-styles";
import { setContentHostStyles } from "~shared/lib/content-host";
import type { HiddenItemPreview } from "~features/element-hiding/preview";

export const PANEL_HOST_ATTRIBUTE = "data-less-panel";

export function createPagePanel(onSelect: () => void, preview: HiddenItemPreview) {
  let host: HTMLDivElement | null = null;
  let dialog: HTMLDialogElement | null = null;
  let root: Root | null = null;
  let previousFocus: HTMLElement | null = null;
  let resumeAfterSelection = false;
  let transition: Animation | null = null;
  let closing = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let unsubscribePreview: (() => void) | undefined;
  const preference = matchMedia("(prefers-color-scheme: dark)");
  const syncTheme = (): void => {
    if (!dialog) return;
    dialog.className = [
      "less-theme",
      getSurfaceProps(preference.matches, styles.dialog).className,
    ].join(" ");
    dialog.dataset.theme = preference.matches ? "dark" : "light";
    dialog.style.colorScheme = dialog.dataset.theme;
  };

  function unmount(restoreFocus: boolean): void {
    transition?.cancel();
    transition = null;
    closing = false;
    unsubscribePreview?.();
    unsubscribePreview = undefined;
    resumeAfterSelection = false;
    observer.disconnect();
    preference.removeEventListener("change", syncTheme);
    dialog?.close();
    root?.unmount();
    root = null;
    host?.remove();
    host = null;
    dialog = null;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function animate(opening: boolean): void {
    if (!dialog) return;
    const element = dialog;
    const style = getComputedStyle(element);
    const start = { opacity: style.opacity, transform: style.transform };
    const time = style.getPropertyValue("--less-motion-duration").trim();
    const duration = parseFloat(time) * (time.endsWith("ms") ? 1 : 1000);
    transition?.cancel();
    transition = null;
    if (reducedMotion.matches) {
      if (!opening) unmount(true);
      return;
    }
    const animation = element.animate(
      [
        opening && !closing ? { opacity: 0, transform: "translateX(100%)" } : start,
        { opacity: opening ? 1 : 0, transform: opening ? "translateX(0)" : "translateX(100%)" },
      ],
      {
        duration,
        easing: style.getPropertyValue("--less-motion-easing").trim(),
        fill: "both",
      },
    );
    transition = animation;
    void animation.finished
      .then(() => {
        if (transition !== animation || dialog !== element) return;
        transition = null;
        if (opening) animation.cancel();
        else unmount(true);
      })
      .catch(() => {});
  }

  function close(restoreFocus = true): void {
    preview.clear(restoreFocus);
    resumeAfterSelection = false;
    if (!restoreFocus || !dialog?.isConnected) {
      unmount(restoreFocus);
      return;
    }
    if (closing) return;
    closing = true;
    animate(false);
  }

  function open(): void {
    if (dialog?.open) {
      if (closing) {
        animate(true);
        closing = false;
      }
      return;
    }
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    host = document.createElement("div");
    host.setAttribute(PANEL_HOST_ATTRIBUTE, "true");
    setContentHostStyles(host, {
      all: "initial",
      position: "fixed",
      top: "0",
      right: "0",
      width: "0",
      height: "0",
      display: "block",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    const shadow = host.attachShadow({ mode: "closed" });
    appendContentStyles(shadow);
    dialog = document.createElement("dialog");
    dialog.lang = browser.i18n.getUILanguage();
    dialog.setAttribute("aria-label", getPanelMessage("panel_dialog"));
    dialog.setAttribute("data-bolerish-surface", "solid");
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !dialog) return;
      const scope = dialog.querySelector<HTMLElement>('[role="alertdialog"]') ?? dialog;
      const controls = Array.from(
        scope.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0 && !element.closest("[hidden]"));
      const active = shadow.activeElement;
      const first = controls[0];
      const last = controls.at(-1);
      if (
        (event.shiftKey && active === first) ||
        (!event.shiftKey && active === last) ||
        !controls.includes(active as HTMLElement)
      ) {
        event.preventDefault();
        ((event.shiftKey ? last : first) ?? scope).focus();
      }
    });
    unsubscribePreview = preview.subscribe((state) => {
      if (dialog) dialog.dataset.preview = String(state.id !== null);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (preview.hasNotice) {
        preview.clear(true);
        return;
      }
      close();
    });
    const container = document.createElement("div");
    container.className = stylex.props(styles.mount).className ?? "";
    dialog.append(container);
    shadow.append(dialog);
    document.documentElement.append(host);
    syncTheme();
    preference.addEventListener("change", syncTheme);
    root = createRoot(container);
    root.render(
      <Panel
        origin={location.origin}
        preview={preview}
        portalContainer={dialog}
        onClose={() => close()}
        onSelect={() => {
          // Unmount before selection starts so no Less UI can become a hiding target.
          close(false);
          onSelect();
          resumeAfterSelection = true;
        }}
      />,
    );
    dialog.showModal();
    animate(true);
    observer.observe(document, { childList: true, subtree: true });
  }

  const observer = new MutationObserver(() => {
    // A page replacing its root must not leave a detached React tree or modal behind.
    if (host && !host.isConnected) close(false);
  });

  return {
    get isOpen() {
      return dialog?.open ?? false;
    },
    toggle() {
      if (dialog?.open && !closing) close();
      else open();
    },
    close,
    selectionEnded() {
      if (resumeAfterSelection) {
        resumeAfterSelection = false;
        open();
      }
    },
  };
}

const styles = stylex.create({
  dialog: {
    padding: 0,
    "--less-panel-focus": colorVars.fgFeedbackInfo,
    "--less-motion-duration": motionVars.durationFast,
    "--less-motion-easing": motionVars.easingStandard,
    boxSizing: "border-box",
    display: { default: "block", ":not([open])": "none" },
    position: "fixed",
    inset: { default: "0 0 0 auto", ":is([data-preview-layout='compact'] )": "auto 8px 8px auto" },
    margin: 0,
    width: {
      default: "min(380px, 100vw)",
      ":is([data-preview-layout='compact'] )": "min(380px, calc(100vw - 16px))",
    },
    height: { default: "100dvh", ":is([data-preview-layout='compact'] )": "min(45dvh, 340px)" },
    maxWidth: "none",
    maxHeight: "none",
    overflow: "hidden",
    overscrollBehavior: "contain",
    pointerEvents: "auto",
    borderBlockWidth: { default: 0, ":is([data-preview-layout='compact'] )": 1 },
    borderInlineEndWidth: { default: 0, ":is([data-preview-layout='compact'] )": 1 },
    borderInlineStartWidth: 1,
    boxShadow: shadowVars.overlay,
    "::backdrop": { backgroundColor: "rgb(0 0 0 / .12)" },
    borderStyle: "solid",
    borderColor: colorVars.strokeDefault,
    borderRadius: { default: 0, ":is([data-preview-layout='compact'] )": radiusVars.md },
    insetBlock: {
      default: "0",
      ":is([data-preview-layout='compact'] )": "auto 8px",
      ":is([data-preview-edge='top'] )": "8px auto",
    },
  },
  mount: {
    height: "100%",
  },
});
