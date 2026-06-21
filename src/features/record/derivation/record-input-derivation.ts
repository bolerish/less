import type { HiddenElementRecord } from "../schema";
import { deriveCurrentPageContext } from "./page-context-derivation";
import {
  normalizeTextPreview,
  resolveUniqueAttributeInput,
} from "./record-match-signal-derivation";
import { deriveScope } from "./record-scope-derivation";
import { deriveTreeAnchorInput } from "./record-tree-anchor-input-derivation";
import { deriveTreeInput } from "./record-tree-input-derivation";

export function deriveHiddenElementRecord(
  element: HTMLElement,
  documentRef: Document,
): HiddenElementRecord {
  const uniqueAttribute = resolveUniqueAttributeInput(element, documentRef);
  const tree = deriveTreeInput(element);
  const treeAnchor = deriveTreeAnchorInput(element, documentRef);

  const matchPlan = deriveMatchPlan(uniqueAttribute !== undefined, treeAnchor !== undefined);
  const cssSelector = uniqueAttribute
    ? `[${uniqueAttribute.attributeName}="${CSS.escape(uniqueAttribute.attributeValue)}"]`
    : undefined;

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    lastMatchedAt: null,
    matchFailureCount: 0,
    lastSuccessfulStrategy: null,
    scope: deriveScope(element),
    pageContext: deriveCurrentPageContext(documentRef.defaultView!),
    target: {
      tagName: element.tagName.toLowerCase(),
      displayText: deriveDisplayText(element),
    },
    metadata: { baseUri: documentRef.baseURI },
    matchPlan,
    matchInputs: {
      uniqueAttribute,
      tree,
      treeAnchor,
    },
    cssSelector,
  };
}

function deriveDisplayText(element: HTMLElement): string | null {
  if (element instanceof HTMLIFrameElement) {
    const title = normalizeTextPreview(element.getAttribute("title"));
    if (title !== undefined) return title;
    const src = normalizeTextPreview(element.getAttribute("src"));
    if (src === undefined) return null;
    try {
      return new URL(src, element.ownerDocument.baseURI).hostname;
    } catch {
      return src;
    }
  }
  return normalizeTextPreview(element.innerText || element.textContent) ?? null;
}

function deriveMatchPlan(
  hasUniqueAttribute: boolean,
  hasTreeAnchor: boolean,
): HiddenElementRecord["matchPlan"] {
  const fallback: HiddenElementRecord["matchPlan"] = hasTreeAnchor ? ["ANCHOR"] : ["STRUCTURE"];
  return hasUniqueAttribute ? ["UNIQUE_ATTRIBUTE", ...fallback] : fallback;
}
