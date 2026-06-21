import type { HiddenElementRecord, MatchInputs } from "~features/record/schema";
import {
  deriveAttributeFingerprints,
  deriveClassTokens,
  deriveDescendantAttributeFingerprints,
  deriveFullTextFingerprint,
} from "~features/record/derivation/record-match-signal-derivation";

import { computeTextMatchScore } from "./text-match-score";

type AnchorNode = NonNullable<MatchInputs["treeAnchor"]>["anchors"][number];

const IDENTITY_SCORE = 8;
const CLASS_TOKEN_SCORE = 2;
const ATTR_FINGERPRINT_SCORE = 2;
const DESCENDANT_ATTR_FINGERPRINT_SCORE = 2;
const TARGET_TEXT_PREVIEW_LENGTH = 120;

export function resolveTreeAnchorTargetElements(
  documentRef: Document,
  record: HiddenElementRecord,
): HTMLElement[] {
  const treeAnchor = record.matchInputs.treeAnchor;
  if (treeAnchor === undefined) return [];

  const scores = new Map<HTMLElement, number>();

  for (const anchor of treeAnchor.anchors) {
    const anchorElements = Array.from(documentRef.querySelectorAll<HTMLElement>(anchor.tagName));
    for (const anchorEl of anchorElements) {
      const anchorScore = computeAnchorScore(anchorEl, anchor);
      if (anchorScore <= 0) continue;
      for (const target of resolveAnchorTargets(anchorEl, anchor, record)) {
        scores.set(target, (scores.get(target) ?? 0) + anchorScore);
      }
    }
  }

  return resolveTopScored(scores);
}

function resolveTopScored(scores: Map<HTMLElement, number>): HTMLElement[] {
  const sorted = Array.from(scores.entries()).sort(([, a], [, b]) => b - a);
  const top = sorted[0];
  const next = sorted[1];
  if (top === undefined || top[1] <= 0) return [];
  if (next !== undefined && next[1] === top[1]) return [];
  return [top[0]];
}

function computeAnchorScore(el: HTMLElement, anchor: AnchorNode): number {
  let score = 0;

  if (anchor.uniqueAttribute !== null && el.getAttribute(anchor.uniqueAttribute.attributeName) === anchor.uniqueAttribute.attributeValue) {
    score += IDENTITY_SCORE;
  }

  if (anchor.fullTextFingerprint !== null && deriveFullTextFingerprint(el.innerText || el.textContent) === anchor.fullTextFingerprint) {
    score += IDENTITY_SCORE;
  }

  score += computeTextMatchScore(normalizeText(el.innerText || el.textContent), anchor.text);
  score += computeOverlap(anchor.classTokens, deriveClassTokens(el.className)) * CLASS_TOKEN_SCORE;
  score += computeOverlap(anchor.attributeFingerprints, deriveAttributeFingerprints(el)) * ATTR_FINGERPRINT_SCORE;
  score += computeOverlap(anchor.descendantAttributeFingerprints, deriveDescendantAttributeFingerprints(el)) * DESCENDANT_ATTR_FINGERPRINT_SCORE;

  return score;
}

function hasMatchingTarget(el: HTMLElement, record: HiddenElementRecord): boolean {
  if (el.tagName.toLowerCase() !== record.target.tagName) return false;
  if (record.target.displayText === null) return true;

  const text = normalizeText(el.innerText || el.textContent);
  if (text === undefined) return false;

  const stored = record.target.displayText;
  if (stored.length < TARGET_TEXT_PREVIEW_LENGTH) return text === stored;
  return text === stored || text.startsWith(stored) || text.includes(stored);
}

function resolveAnchorTargets(
  anchorEl: HTMLElement,
  anchor: AnchorNode,
  record: HiddenElementRecord,
): HTMLElement[] {
  switch (anchor.relation) {
    case "self":
      return hasMatchingTarget(anchorEl, record) ? [anchorEl] : [];
    case "parent":
      return Array.from(anchorEl.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement && hasMatchingTarget(c, record),
      );
    case "grandParent":
      return Array.from(anchorEl.querySelectorAll<HTMLElement>(record.target.tagName)).filter(
        (el) => el.parentElement?.parentElement === anchorEl && hasMatchingTarget(el, record),
      );
    case "child": {
      const parent = anchorEl.parentElement;
      return parent !== null && hasMatchingTarget(parent, record) ? [parent] : [];
    }
    case "previousSibling": {
      const next = anchorEl.nextElementSibling;
      return next instanceof HTMLElement && hasMatchingTarget(next, record) ? [next] : [];
    }
    case "nextSibling": {
      const prev = anchorEl.previousElementSibling;
      return prev instanceof HTMLElement && hasMatchingTarget(prev, record) ? [prev] : [];
    }
    case "descendant": {
      const target = anchorEl.closest<HTMLElement>(record.target.tagName);
      return target !== null && target.contains(anchorEl) && hasMatchingTarget(target, record) ? [target] : [];
    }
    default: {
      const exhaustive: never = anchor.relation;
      throw new Error(`Unhandled anchor relation: ${exhaustive}`);
    }
  }
}

function computeOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.reduce((n, t) => n + (setB.has(t) ? 1 : 0), 0);
}

function normalizeText(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/\s+/g, " ").trim();
  return v.length === 0 ? undefined : v;
}
