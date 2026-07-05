import { readPreloadCSS } from "~features/record/css-cache";
import { deriveCurrentPageContext } from "~features/record/derivation/page-context-derivation";

export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_start",
  main() {
    void injectPreloadCSS();
  },
});

async function injectPreloadCSS(): Promise<void> {
  if (document.getElementById("__veil_preload__")) return;
  const { origin, path, search } = deriveCurrentPageContext(window);
  if (!origin.startsWith("http")) return;

  const css = await readPreloadCSS(origin, path, search);
  if (!css) return;

  const style = document.createElement("style");
  style.id = "__veil_preload__";
  style.textContent = css;
  document.documentElement.appendChild(style);
}
