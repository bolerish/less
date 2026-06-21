import type { MatchInputs } from "../schema";
import {
  deriveAttributeFingerprints,
  deriveClassTokens,
  deriveDescendantAttributeFingerprints,
  deriveFullTextFingerprint,
  normalizeTextPreview,
  resolveUniqueAttributeInput,
} from "./record-match-signal-derivation";

type AnchorInput = NonNullable<MatchInputs["treeAnchor"]>;
type AnchorNode = AnchorInput["anchors"][number];
type AnchorRelation = AnchorNode["relation"];

const MAX_DESCENDANT_ANCHOR_CANDIDATES = 12;
const MAX_TREE_ANCHORS = 3;
const MIN_STRONG_ANCHOR_SCORE = 4;
const HIGH_CONFIDENCE_SCORE = 8;
const TEXT_PREVIEW_SCORE = 4;
const CLASS_TOKEN_SCORE = 1;
const ATTRIBUTE_FINGERPRINT_SCORE = 2;
const DESCENDANT_ATTRIBUTE_FINGERPRINT_SCORE = 2;

export function deriveTreeAnchorInput(element: HTMLElement, documentRef: Document): AnchorInput | undefined {
  const parent = element.parentElement;
  const grandParent = parent?.parentElement ?? null;
  const children = Array.from(element.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  const descendants = Array.from(element.querySelectorAll<HTMLElement>("*"))
    .filter((d) => !children.includes(d))
    .slice(0, MAX_DESCENDANT_ANCHOR_CANDIDATES);

  const phases: Array<() => Array<AnchorNode | undefined>> = [
    () => children.map((c) => deriveStrongAnchor("child", c, documentRef)),
    () => [
      deriveStrongAnchor("previousSibling", getSibling(element, "previousElementSibling"), documentRef),
      deriveStrongAnchor("nextSibling", getSibling(element, "nextElementSibling"), documentRef),
    ],
    () => [deriveStrongAnchor("parent", parent, documentRef)],
    () => [deriveStrongAnchor("grandParent", grandParent, documentRef)],
    () => descendants.map((d) => deriveStrongAnchor("descendant", d, documentRef)),
    () => [deriveStrongAnchor("self", element, documentRef)],
  ];

  let selected: AnchorNode[] = [];
  for (const phase of phases) {
    selected = appendStrongAnchors(selected, phase());
    if (selected.length > 0) break;
  }

  return selected.length === 0 ? undefined : { anchors: selected };
}

function computeAnchorScore(anchor: AnchorNode): number {
  return (
    (anchor.uniqueAttribute !== null ? HIGH_CONFIDENCE_SCORE : 0) +
    (anchor.fullTextFingerprint !== null ? HIGH_CONFIDENCE_SCORE : 0) +
    (anchor.text !== null ? TEXT_PREVIEW_SCORE : 0) +
    anchor.classTokens.length * CLASS_TOKEN_SCORE +
    anchor.attributeFingerprints.length * ATTRIBUTE_FINGERPRINT_SCORE +
    anchor.descendantAttributeFingerprints.length * DESCENDANT_ATTRIBUTE_FINGERPRINT_SCORE
  );
}

function deriveAnchor(
  relation: AnchorRelation,
  element: HTMLElement,
  documentRef: Document,
): AnchorNode | undefined {
  const classTokens = deriveClassTokens(element.className);
  const attributeFingerprints = deriveAttributeFingerprints(element);
  const descendantAttributeFingerprints = deriveDescendantAttributeFingerprints(element);
  const text = normalizeTextPreview(element.innerText || element.textContent) ?? null;
  const fullTextFingerprint = deriveFullTextFingerprint(element.innerText || element.textContent) ?? null;
  const uniqueAttribute = resolveUniqueAttributeInput(element, documentRef) ?? null;

  const anchor: AnchorNode = {
    relation,
    tagName: element.tagName.toLowerCase(),
    text,
    fullTextFingerprint,
    classTokens,
    attributeFingerprints,
    descendantAttributeFingerprints,
    uniqueAttribute,
  };

  return computeAnchorScore(anchor) > 0 ? anchor : undefined;
}

function deriveStrongAnchor(
  relation: AnchorRelation,
  element: HTMLElement | null,
  documentRef: Document,
): AnchorNode | undefined {
  if (element === null) return undefined;
  const anchor = deriveAnchor(relation, element, documentRef);
  return anchor !== undefined && computeAnchorScore(anchor) >= MIN_STRONG_ANCHOR_SCORE ? anchor : undefined;
}

function appendStrongAnchors(
  selected: AnchorNode[],
  candidates: Array<AnchorNode | undefined>,
): AnchorNode[] {
  const deduped = dedupeAnchors([...selected, ...candidates.filter((a): a is AnchorNode => a !== undefined)]);
  return deduped
    .sort((a, b) => computeAnchorScore(b) - computeAnchorScore(a))
    .slice(0, MAX_TREE_ANCHORS);
}

function dedupeAnchors(anchors: AnchorNode[]): AnchorNode[] {
  const map = new Map<string, AnchorNode>();
  for (const anchor of anchors) map.set(JSON.stringify(anchor), anchor);
  return Array.from(map.values());
}

function getSibling(
  element: HTMLElement,
  prop: "previousElementSibling" | "nextElementSibling",
): HTMLElement | null {
  const sibling = element[prop];
  return sibling instanceof HTMLElement ? sibling : null;
}
