import * as stylex from "@stylexjs/stylex";
import { colorVars } from "@bolerish/tokens/semantic.stylex";
import { createSelectionSurface } from "~features/selection/surface";
import { setContentHostStyles } from "~shared/lib/content-host";

export const CORNER_ATTR = "data-less-corner";

export function flashViewportGlow(): void {
  const { host, surface, disposeTheme } = createSelectionSurface(CORNER_ATTR, styles.glow);
  host.setAttribute("aria-hidden", "true");
  setContentHostStyles(host, { inset: "0" });
  document.documentElement.appendChild(host);

  // Double rAF: ensures opacity:0 is painted before transition kicks in
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      surface.dataset.phase = "visible";
    }),
  );

  setTimeout(() => {
    surface.dataset.phase = "fading";
    const remove = () => {
      disposeTheme();
      host.remove();
    };
    surface.addEventListener("transitionend", remove, { once: true });
    // Transition events can be skipped when the document is hidden.
    setTimeout(remove, 600);
  }, 400);
}

const styles = stylex.create({
  glow: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    opacity: { default: 0, ':is([data-phase="visible"])': 1 },
    boxShadow: `inset 0 0 50px 12px color-mix(in srgb, ${colorVars.fgPrimary} 18%, transparent), inset 0 0 110px 35px color-mix(in srgb, ${colorVars.fgPrimary} 7%, transparent)`,
    border: `1.5px solid ${colorVars.strokeDefault}`,
    transition: {
      default: "opacity 0.25s ease-out",
      ':is([data-phase="fading"])': "opacity 0.55s ease-in",
    },
  },
});
