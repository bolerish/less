import tokens from "~shared/styles/bolerish-tokens.css?inline";

export function createSelectionSurface(attribute: string, isDark: boolean) {
  const host = document.createElement("div");
  host.setAttribute(attribute, "true");
  setSelectionHostStyles(host, {
    all: "initial",
    position: "fixed",
    display: "block",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `${tokens}
    .veil-theme {
      all: initial;
      --bolerish-unit: 16px;
      --bolerish-density: 1;
      --bolerish-font-body: initial;
      --bolerish-font-heading: initial;
      --veil-selection-fill: color-mix(in srgb, var(--veil-color-fg-feedback-info) 15%, transparent);
      --veil-selection-stroke: var(--veil-color-fg-feedback-info);
      display: block;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      font-family: var(--veil-font-family-body);
      font-size: var(--veil-font-size-xs);
      font-weight: var(--veil-font-weight-regular);
      line-height: var(--veil-line-height-normal);
      color: var(--veil-color-fg-primary);
      color-scheme: ${isDark ? "dark" : "light"};
      direction: ltr;
      pointer-events: none;
    }
    *, *::before, *::after { box-sizing: border-box; }
  `;
  const surface = document.createElement("div");
  surface.className = "veil-theme";
  surface.dataset.theme = isDark ? "dark" : "light";
  root.append(style, surface);
  return { host, surface };
}

// Inline importance protects the host's geometry from page-wide !important resets.
export function setSelectionHostStyles(host: HTMLDivElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    host.style.setProperty(cssProperty, value, "important");
  }
}
