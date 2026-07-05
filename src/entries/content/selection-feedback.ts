import { isPageDark } from "./selection-toolbar";

export const CORNER_ATTR = "data-veil-corner";

export function flashViewportGlow(): void {
  const isDark = isPageDark();
  const el = document.createElement("div");
  el.setAttribute(CORNER_ATTR, "true");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    opacity: "0",
    boxShadow: isDark
      ? [
          "inset 0 0 50px 12px rgba(255,255,255,0.18)",
          "inset 0 0 110px 35px rgba(255,255,255,0.07)",
        ].join(", ")
      : [
          "inset 0 0 50px 12px rgba(0,0,0,0.18)",
          "inset 0 0 110px 35px rgba(0,0,0,0.07)",
        ].join(", "),
    border: isDark ? "1.5px solid rgba(255,255,255,0.15)" : "1.5px solid rgba(0,0,0,0.1)",
    transition: "opacity 0.25s ease-out",
  });
  document.documentElement.appendChild(el);

  // Double rAF: ensures opacity:0 is painted before transition kicks in
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    }),
  );

  setTimeout(() => {
    el.style.transition = "opacity 0.55s ease-in";
    el.style.opacity = "0";
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, 400);
}
