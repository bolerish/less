import { setContentHostStyles } from "~shared/lib/content-host";
import * as stylex from "@stylexjs/stylex";
import { typo } from "@bolerish/tokens/semantic.stylex";
import { getSurfaceProps } from "~shared/styles/surface";
import { appendContentStyles } from "~shared/styles/content-styles";

export function createSelectionSurface(
  attribute: string,
  isDark: boolean,
  xstyle?: stylex.StyleXStyles,
) {
  const host = document.createElement("div");
  host.setAttribute(attribute, "true");
  setContentHostStyles(host, {
    all: "initial",
    position: "fixed",
    display: "block",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const root = host.attachShadow({ mode: "closed" });
  appendContentStyles(root);
  const surface = document.createElement("div");
  surface.className = [
    "less-theme",
    getSurfaceProps(isDark, [styles.surface, xstyle]).className,
  ].join(" ");
  surface.dataset.theme = isDark ? "dark" : "light";
  root.append(surface);
  return { host, surface };
}

const styles = stylex.create({
  surface: {
    backgroundColor: "transparent",
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    fontSize: typo.fontSizeXs,
    pointerEvents: "none",
  },
});
