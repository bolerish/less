import { createSelectionSurface, setSelectionHostStyles } from "./selection-surface";
import { isPageDark } from "./selection-toolbar";

export const CORNER_ATTR = "data-veil-corner";

export function flashViewportGlow(): void {
  const { host, surface: el } = createSelectionSurface(CORNER_ATTR, isPageDark());
  host.setAttribute("aria-hidden", "true");
  setSelectionHostStyles(host, { inset: "0" });
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    opacity: "0",
    boxShadow: [
      "inset 0 0 50px 12px color-mix(in srgb, var(--veil-color-fg-primary) 18%, transparent)",
      "inset 0 0 110px 35px color-mix(in srgb, var(--veil-color-fg-primary) 7%, transparent)",
    ].join(", "),
    border: "1.5px solid var(--veil-color-stroke-default)",
    transition: "opacity 0.25s ease-out",
  });
  document.documentElement.appendChild(host);

  // Double rAF: ensures opacity:0 is painted before transition kicks in
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    }),
  );

  setTimeout(() => {
    el.style.transition = "opacity 0.55s ease-in";
    el.style.opacity = "0";
    el.addEventListener("transitionend", () => host.remove(), { once: true });
  }, 400);
}
