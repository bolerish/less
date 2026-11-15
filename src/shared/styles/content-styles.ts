// WXT prepare lists JS entry paths before CSS extraction creates this UI asset.
declare module "wxt/browser" {
  interface WxtRuntime {
    getURL(path: "/content-scripts/content.css"): string;
  }
}

let css = "";

// WXT emits this entry's CSS when cssInjectionMode is "ui". Fetch the final
// asset, including unplugin's extracted rules, before any injected UI mounts.
export async function loadContentStyles(): Promise<void> {
  const response = await fetch(browser.runtime.getURL("/content-scripts/content.css"));
  if (!response.ok) throw new Error(`Less stylesheet: ${response.status}`);
  css = (await response.text())
    .replaceAll(":root", ".less-theme")
    .replace(/(-?[\d.]+)rem\b/g, (_, value: string) => `${Number(value) * 16}px`);
}

export function appendContentStyles(root: ShadowRoot): void {
  const style = document.createElement("style");
  style.textContent = css;
  root.append(style);
}
