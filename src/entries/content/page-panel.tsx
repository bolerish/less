import { themeClassNames } from "@bolerish/ui/theme";
import packageCSS from "@bolerish/ui/global.css?inline";
import { createRoot, type Root } from "react-dom/client";
import App from "../sidepanel/App";
import aliases from "../sidepanel/panel-tokens.css?inline";
import panelCSS from "../sidepanel/style.css?inline";
import { setSelectionHostStyles } from "./selection-surface";
import type { HiddenItemPreview } from "./hidden-item-preview";

export const PANEL_HOST_ATTRIBUTE = "data-veil-panel";

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
    dialog.className = `veil-theme ${themeClassNames[preference.matches ? "dark" : "light"]}`;
    dialog.dataset.theme = preference.matches ? "dark" : "light";
    dialog.dataset.bolerishTheme = dialog.dataset.theme;
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
    const duration = parseFloat(style.getPropertyValue("--veil-motion-duration-fast"));
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
        easing: style.getPropertyValue("--veil-motion-easing-standard").trim(),
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
    setSelectionHostStyles(host, {
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
    const style = document.createElement("style");
    // Load the actual component CSS in this tree; document styles cannot cross a shadow boundary.
    // Package token defaults target :root; inside a shadow tree their root is our theme surface.
    // Pin rem geometry to the extension's 16px unit rather than the website's root font size.
    const isolatedCSS = packageCSS
      .replaceAll(":root", ".veil-theme")
      .replace(/(-?[\d.]+)rem\b/g, (_, value: string) => `${Number(value) * 16}px`);
    style.textContent = `${isolatedCSS}\n${aliases}\n${panelCSS}`;
    dialog = document.createElement("dialog");
    dialog.lang = "en";
    dialog.setAttribute("aria-label", "Veil — current site");
    dialog.setAttribute("data-bolerish-surface", "solid");
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
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
        (event.shiftKey ? last : first)?.focus();
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
    dialog.append(container);
    shadow.append(style, dialog);
    document.documentElement.append(host);
    syncTheme();
    preference.addEventListener("change", syncTheme);
    root = createRoot(container);
    root.render(
      <App
        origin={location.origin}
        preview={preview}
        portalContainer={dialog}
        onClose={() => close()}
        onSelect={() => {
          // Unmount before selection starts so no Veil UI can become a hiding target.
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
