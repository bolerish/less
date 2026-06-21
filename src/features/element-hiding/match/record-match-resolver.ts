import type { HiddenElementRecord } from "~features/record/schema";

import { resolveTreeAnchorTargetElements } from "./tree-anchor-target-resolver";
import { resolveTopTreeCandidate, resolveTreeCandidateElements } from "./tree-candidate-resolver";

export type MatchResult =
  | { status: "matched"; matchedElement: HTMLElement; matchedAt: number }
  | { status: "unmatched" };

export function resolveMatchedElement(documentRef: Document, record: HiddenElementRecord): MatchResult {
  for (const strategy of record.matchPlan) {
    switch (strategy) {
      case "UNIQUE_ATTRIBUTE": {
        const result = matchByUniqueAttribute(documentRef, record);
        if (result.status === "matched") return result;
        break;
      }
      case "STRUCTURE": {
        const result = matchByStructure(documentRef, record);
        if (result.status === "matched") return result;
        break;
      }
      case "ANCHOR": {
        const result = matchByAnchor(documentRef, record);
        if (result.status === "matched") return result;
        break;
      }
      default: {
        const exhaustive: never = strategy;
        throw new Error(`Unhandled strategy: ${exhaustive}`);
      }
    }
  }
  return { status: "unmatched" };
}

function matchByUniqueAttribute(documentRef: Document, record: HiddenElementRecord): MatchResult {
  const unique = record.matchInputs.uniqueAttribute;
  if (unique === undefined) return { status: "unmatched" };

  const selector = `[${unique.attributeName}="${CSS.escape(unique.attributeValue)}"]`;
  const matched = Array.from(documentRef.querySelectorAll<HTMLElement>(selector));

  if (matched.length !== 1) return { status: "unmatched" };
  return { status: "matched", matchedElement: matched[0], matchedAt: Date.now() };
}

function matchByStructure(documentRef: Document, record: HiddenElementRecord): MatchResult {
  const candidates = resolveTreeCandidateElements(documentRef, record);
  if (candidates.length === 0) return { status: "unmatched" };
  if (candidates.length === 1) return { status: "matched", matchedElement: candidates[0], matchedAt: Date.now() };

  const top = resolveTopTreeCandidate(candidates, record);
  if (top === null) return { status: "unmatched" };
  return { status: "matched", matchedElement: top.element, matchedAt: Date.now() };
}

function matchByAnchor(documentRef: Document, record: HiddenElementRecord): MatchResult {
  const candidates = resolveTreeAnchorTargetElements(documentRef, record);
  if (candidates.length !== 1) return { status: "unmatched" };
  return { status: "matched", matchedElement: candidates[0], matchedAt: Date.now() };
}
