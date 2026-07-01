import { pageCSSCacheKey, SESSION_WARMED_KEY, siteCSSCacheKey } from "~features/record/css-cache";

export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_start",
  main() {
    void injectPreloadCSS();
  },
});

async function injectPreloadCSS(): Promise<void> {
  if (document.getElementById("__bare_preload__")) return;
  const { origin, pathname: path, search } = location;
  if (!origin.startsWith("http")) return;

  const pk = pageCSSCacheKey(origin, path, search);
  const sk = siteCSSCacheKey(origin);

  const sessionResult = await browser.storage.session.get([SESSION_WARMED_KEY, pk, sk]);
  const result = sessionResult[SESSION_WARMED_KEY]
    ? sessionResult
    : await browser.storage.local.get([pk, sk]);

  const selectors = [
    ...((result[pk] as string[] | undefined) ?? []),
    ...((result[sk] as string[] | undefined) ?? []),
  ];

  if (selectors.length === 0) return;

  const style = document.createElement("style");
  style.id = "__bare_preload__";
  style.textContent = selectors.map((s) => `${s}{display:none!important}`).join("");
  document.documentElement.appendChild(style);
}
