import type { HiddenElementRecord, MatchInputs } from "~features/record/schema";
import {
  deriveAttributeFingerprints,
  deriveClassTokens,
  deriveDescendantAttributeFingerprints,
  deriveFullTextFingerprint,
} from "~features/record/derivation/record-match-signal-derivation";

import { computeTextMatchScore } from "./text-match-score";

type TreeInput = NonNullable<MatchInputs["tree"]>;
type ElementFingerprint = TreeInput["targetFingerprint"];
type OuterSiblingContext = TreeInput["outerSiblingContexts"][number];
type SiblingNode = NonNullable<OuterSiblingContext["previousSibling"]>;

const TARGET_STABLE_ATTR_SCORE = 4;
const PARENT_NODE_SCORE = 3;
const GRANDPARENT_NODE_SCORE = 2;
const CLASS_TOKEN_SCORE = 1;
const ATTR_FINGERPRINT_SCORE = 2;
const DESCENDANT_ATTR_FINGERPRINT_SCORE = 2;
const CHILD_TAG_SCORE = 1;
const EXACT_INDEX_SCORE = 1;
const ADJACENT_INDEX_SCORE = 0.5;
const SIBLING_TAG_SCORE = 1;
const SIBLING_FINGERPRINT_SCORE = 8;

interface Candidate {
  element: HTMLElement;
  score: number;
}

export function resolveTreeCandidateElements(documentRef: Document, record: HiddenElementRecord): HTMLElement[] {
  const tree = record.matchInputs.tree;
  if (tree === undefined) return [];

  return Array.from(documentRef.querySelectorAll<HTMLElement>(record.target.tagName)).filter((el) => {
    return (
      hasMatchingFingerprint(el.parentElement, tree.parent) &&
      hasMatchingFingerprint(el.parentElement?.parentElement ?? null, tree.grandParent)
    );
  });
}

export function resolveTopTreeCandidate(
  candidates: readonly HTMLElement[],
  record: HiddenElementRecord,
): Candidate | null {
  const scored = candidates
    .map((el) => ({ element: el, score: computeScore(el, record) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const next = scored[1];

  if (top === undefined || top.score <= 0) return null;
  if (next !== undefined && next.score === top.score) return null;

  return top;
}

function hasMatchingFingerprint(
  element: HTMLElement | null | undefined,
  fingerprint: ElementFingerprint | null,
): boolean {
  if (fingerprint === null) return true;
  if (!element) return false;
  return (
    element.tagName.toLowerCase() === fingerprint.tagName &&
    Object.entries(fingerprint.stableAttributes).every(
      ([name, value]) => element.getAttribute(name) === value,
    )
  );
}

function computeScore(el: HTMLElement, record: HiddenElementRecord): number {
  const tree = record.matchInputs.tree;
  if (tree === undefined) return 0;

  const parent = el.parentElement;
  const grandParent = parent?.parentElement ?? null;
  let score = 0;

  const stableAttrs = Object.entries(tree.targetFingerprint.stableAttributes);
  if (stableAttrs.length > 0 && stableAttrs.every(([k, v]) => el.getAttribute(k) === v)) {
    score += TARGET_STABLE_ATTR_SCORE;
  }

  if (hasMatchingFingerprint(parent, tree.parent) && tree.parent !== null) score += PARENT_NODE_SCORE;
  if (hasMatchingFingerprint(grandParent, tree.grandParent) && tree.grandParent !== null) score += GRANDPARENT_NODE_SCORE;

  if (computeOverlap(tree.targetFingerprint.classTokens, deriveClassTokens(el.className)) > 0) {
    score += CLASS_TOKEN_SCORE;
  }
  if (computeOverlap(tree.targetFingerprint.attributeFingerprints, deriveAttributeFingerprints(el)) > 0) {
    score += ATTR_FINGERPRINT_SCORE;
  }
  if (computeOverlap(tree.targetFingerprint.attributeFingerprints, deriveDescendantAttributeFingerprints(el)) > 0) {
    score += DESCENDANT_ATTR_FINGERPRINT_SCORE;
  }
  if (computeOverlap(tree.childTagSummary, deriveChildTags(el)) > 0) {
    score += CHILD_TAG_SCORE;
  }

  score += computeOuterSiblingScore(el, tree.outerSiblingContexts);
  score += computeTextMatchScore(
    normalizeText(el.innerText || el.textContent),
    record.target.displayText,
  );

  const idx = deriveRelativeIndex(el);
  if (idx !== undefined) {
    if (tree.relativeIndex === idx) score += EXACT_INDEX_SCORE;
    else if (Math.abs(tree.relativeIndex - idx) === 1) score += ADJACENT_INDEX_SCORE;
  }

  return score;
}

function computeOuterSiblingScore(el: HTMLElement, contexts: OuterSiblingContext[]): number {
  return contexts.reduce((acc, ctx) => acc + computeSiblingContextScore(el, ctx), 0);
}

function computeSiblingContextScore(el: HTMLElement, ctx: OuterSiblingContext): number {
  const ancestor = resolveAncestor(el, ctx.ancestorDepth);
  if (ancestor === null) return 0;
  return (
    computeSiblingNodeScore(ancestor.previousElementSibling, ctx.previousSibling) +
    computeSiblingNodeScore(ancestor.nextElementSibling, ctx.nextSibling)
  );
}

function computeSiblingNodeScore(sibling: Element | null, stored: SiblingNode | null): number {
  if (!(sibling instanceof HTMLElement) || stored === null) return 0;
  if (sibling.tagName.toLowerCase() !== stored.tag) return 0;

  const fingerprintScore =
    stored.fingerprint !== "" &&
    deriveFullTextFingerprint(sibling.innerText || sibling.textContent) === stored.fingerprint
      ? SIBLING_FINGERPRINT_SCORE
      : 0;

  return SIBLING_TAG_SCORE + computeTextMatchScore(normalizeText(sibling.innerText || sibling.textContent), stored.text) + fingerprintScore;
}

function resolveAncestor(el: HTMLElement, depth: number): HTMLElement | null {
  let current: HTMLElement | null = el;
  for (let i = 0; i < depth; i++) current = current?.parentElement ?? null;
  return current;
}

function computeOverlap(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  return a.reduce((n, t) => n + (setB.has(t) ? 1 : 0), 0);
}

function deriveChildTags(el: HTMLElement): string[] {
  const parent = el.parentElement ?? el;
  return Array.from(new Set(Array.from(parent.children).map((c) => c.tagName.toLowerCase()))).sort();
}

function deriveRelativeIndex(el: HTMLElement): number | undefined {
  const parent = el.parentElement;
  if (!parent) return undefined;
  const siblings = Array.from(parent.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.tagName === el.tagName,
  );
  const idx = siblings.indexOf(el);
  return idx < 0 ? undefined : idx;
}

function normalizeText(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  return v.length === 0 ? undefined : v;
}
