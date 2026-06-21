import type { MatchInputs } from "../schema";
import {
  deriveAllowedAttributes,
  deriveAttributeFingerprints,
  deriveClassTokens,
  deriveFullTextFingerprint,
  deriveGeneratedClassTokens,
  deriveStableClassTokens,
  normalizeTextPreview,
} from "./record-match-signal-derivation";

type TreeInput = NonNullable<MatchInputs["tree"]>;
type ElementFingerprint = TreeInput["targetFingerprint"];
type SiblingNode = NonNullable<TreeInput["outerSiblingContexts"][number]["previousSibling"]>;
type OuterSiblingContext = TreeInput["outerSiblingContexts"][number];

const MAX_OUTER_SIBLING_CONTEXTS = 3;

export function deriveTreeInput(element: HTMLElement): TreeInput {
  const parent = element.parentElement;
  const grandParent = parent?.parentElement ?? null;

  return {
    targetFingerprint: deriveElementFingerprint(element),
    parent: parent ? deriveElementFingerprint(parent) : null,
    grandParent: grandParent ? deriveElementFingerprint(grandParent) : null,
    childTagSummary: deriveChildTagSummary(parent) ?? deriveChildTagSummary(grandParent) ?? [],
    outerSiblingContexts: deriveOuterSiblingContexts(element),
    relativeIndex: deriveRelativeIndex(element) ?? 0,
  };
}

export function deriveElementFingerprint(element: HTMLElement): ElementFingerprint {
  return {
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    classTokens: deriveClassTokens(element.className),
    stableClassTokens: deriveStableClassTokens(element.className),
    generatedClassTokens: deriveGeneratedClassTokens(element.className),
    stableAttributes: deriveAllowedAttributes(element),
    attributeFingerprints: deriveAttributeFingerprints(element),
  };
}

function deriveOuterSiblingContexts(element: HTMLElement): OuterSiblingContext[] {
  const contexts: OuterSiblingContext[] = [];
  let ancestor: HTMLElement | null = element;
  let depth = 0;

  while (ancestor !== null && !isDocumentShell(ancestor) && contexts.length < MAX_OUTER_SIBLING_CONTEXTS) {
    const ctx = deriveOuterSiblingContext(ancestor, depth);
    if (ctx !== null) contexts.push(ctx);
    ancestor = ancestor.parentElement;
    depth++;
  }

  return contexts;
}

function isDocumentShell(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  return tag === "body" || tag === "html";
}

function deriveOuterSiblingContext(ancestor: HTMLElement, depth: number): OuterSiblingContext | null {
  const prev = deriveSiblingNode(ancestor.previousElementSibling);
  const next = deriveSiblingNode(ancestor.nextElementSibling);
  if (prev === null && next === null) return null;
  return { ancestorDepth: depth, previousSibling: prev, nextSibling: next };
}

function deriveSiblingNode(element: Element | null): SiblingNode | null {
  if (!(element instanceof HTMLElement)) return null;
  const text = normalizeTextPreview(element.innerText || element.textContent);
  if (text === undefined) return null;
  return {
    tag: element.tagName.toLowerCase(),
    text,
    fingerprint: deriveFullTextFingerprint(element.innerText || element.textContent) ?? "",
  };
}

function deriveChildTagSummary(element: HTMLElement | null): string[] | undefined {
  if (element === null) return undefined;
  const tags = Array.from(new Set(Array.from(element.children).map((c) => c.tagName.toLowerCase()))).sort();
  return tags.length === 0 ? undefined : tags;
}

function deriveRelativeIndex(element: HTMLElement): number | undefined {
  const parent = element.parentElement;
  if (parent === null) return undefined;
  const siblings = Array.from(parent.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && c.tagName === element.tagName,
  );
  const idx = siblings.indexOf(element);
  return idx < 0 ? undefined : idx;
}
