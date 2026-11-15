import type { HiddenElementRecord } from "../schema";
import { normalizeTextPreview } from "./record-match-signal-derivation";

type Target = HiddenElementRecord["target"];

export function deriveTargetPresentation(
  element: HTMLElement,
): Pick<Target, "contentKind" | "displayText"> {
  let representative: Element = element;
  if (!element.matches("iframe, video, img, object, embed")) {
    const media = element.querySelectorAll("iframe, video, img, object, embed");
    // Only treat a wrapper as its media when it contains one representative and no other text.
    if (media.length === 1 && !element.textContent?.trim()) representative = media[0];
  }
  let contentKind: Target["contentKind"] = "content";
  if (representative.matches("video")) contentKind = "video";
  else if (representative.matches("img")) contentKind = "image";
  else if (representative.matches("iframe, object, embed")) contentKind = "external";
  else if (element.matches("div, section, aside, header, footer, nav, main"))
    contentKind = "region";

  const label = normalizeTextPreview(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      representative.getAttribute("aria-label") ||
      representative.getAttribute("title") ||
      representative.getAttribute("alt"),
  );
  if (label) return { contentKind, displayText: label };
  const text = normalizeTextPreview(element.innerText || element.textContent);
  if (text) return { contentKind, displayText: text };
  if (representative.matches("iframe, object, embed")) {
    const source = representative.getAttribute("src") || representative.getAttribute("data");
    if (source) {
      try {
        return {
          contentKind,
          displayText: new URL(source, element.ownerDocument.baseURI).hostname || null,
        };
      } catch {
        /* Invalid source has no useful public label. */
      }
    }
  }
  return { contentKind, displayText: null };
}
