import type { HiddenElementRecord } from "../schema";
import { deriveCurrentPageContext } from "./page-context-derivation";
import { resolveCSSSelector, resolveUniqueAttributeInput } from "./record-match-signal-derivation";
import { deriveScope } from "./record-scope-derivation";
import { deriveTreeAnchorInput } from "./record-tree-anchor-input-derivation";
import { deriveTreeInput } from "./record-tree-input-derivation";
import { deriveTargetPresentation } from "./record-presentation-derivation";

export function deriveHiddenElementRecord(
  element: HTMLElement,
  documentRef: Document,
): HiddenElementRecord {
  const uniqueAttribute = resolveUniqueAttributeInput(element, documentRef);
  const tree = deriveTreeInput(element);
  const treeAnchor = deriveTreeAnchorInput(element, documentRef);

  const cssSelector = resolveCSSSelector(element, documentRef);
  const matchPlan = deriveMatchPlan(
    cssSelector !== undefined,
    uniqueAttribute !== undefined,
    treeAnchor !== undefined,
  );

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
      ...deriveTargetPresentation(element),
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

function deriveMatchPlan(
  hasCSSSelector: boolean,
  hasUniqueAttribute: boolean,
  hasTreeAnchor: boolean,
): HiddenElementRecord["matchPlan"] {
  const plan: HiddenElementRecord["matchPlan"] = [];
  if (hasCSSSelector) plan.push("CSS_SELECTOR");
  if (hasUniqueAttribute) plan.push("UNIQUE_ATTRIBUTE");
  if (hasTreeAnchor) plan.push("ANCHOR");
  plan.push("STRUCTURE");
  return plan;
}
