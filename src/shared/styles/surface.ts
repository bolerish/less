import * as stylex from "@stylexjs/stylex";
import { colorVars, typo } from "@bolerish/tokens/semantic.stylex";
import {
  darkColorTheme,
  darkShadowTheme,
  lightColorTheme,
  lightShadowTheme,
} from "@bolerish/tokens/themes.stylex";

export function getSurfaceProps(dark: boolean, xstyle?: stylex.StyleXStyles) {
  return stylex.props(
    dark ? darkColorTheme : lightColorTheme,
    dark ? darkShadowTheme : lightShadowTheme,
    styles.surface,
    dark ? styles.dark : styles.light,
    xstyle,
  );
}

const styles = stylex.create({
  surface: {
    "--bolerish-unit": "16px",
    "--bolerish-density": "1",
    "--bolerish-font-body": "initial",
    "--bolerish-font-heading": "initial",
    backgroundColor: "var(--less-app-background)",
    color: colorVars.fgPrimary,
    fontFamily: typo.fontFamilyBody,
    fontSize: typo.fontSizeSm,
    fontWeight: typo.fontWeightRegular,
    lineHeight: typo.lineHeightNormal,
    direction: "ltr",
    textAlign: "start",
  },
  light: { "--less-app-background": "#fff", colorScheme: "light" },
  dark: { "--less-app-background": "#111", colorScheme: "dark" },
});
