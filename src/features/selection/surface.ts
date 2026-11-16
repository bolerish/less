import { setContentHostStyles } from "~shared/lib/content-host";
import * as stylex from "@stylexjs/stylex";
import { typo } from "@bolerish/tokens/semantic.stylex";
import { getSurfaceProps } from "~shared/styles/surface";
import { appendContentStyles } from "~shared/styles/content-styles";
import { isThemeDark, subscribeTheme } from "~shared/theme/_model/theme";

export function createSelectionSurface(attribute: string, xstyle?: stylex.StyleXStyles) {
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
  function syncTheme() {
    const dark = isThemeDark();
    surface.className = [
      "less-theme",
      getSurfaceProps(dark, [styles.surface, xstyle]).className,
    ].join(" ");
    surface.dataset.theme = dark ? "dark" : "light";
  }
  syncTheme();
  const disposeTheme = subscribeTheme(syncTheme);
  root.append(surface);
  return { host, surface, disposeTheme };
}

const styles = stylex.create({
  surface: {
    "--less-app-background": "transparent",
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    fontSize: typo.fontSizeXs,
    pointerEvents: "none",
  },
});
