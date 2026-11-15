// Inline importance protects the host's geometry from page-wide !important resets.
export function setContentHostStyles(host: HTMLDivElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    host.style.setProperty(cssProperty, value, "important");
  }
}
