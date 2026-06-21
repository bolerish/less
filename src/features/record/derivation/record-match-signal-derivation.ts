const INTERNAL_ATTRIBUTE_NAME_PREFIX = "data-bare-";
const UNIQUE_ATTRIBUTE_NAMES = [
  "id",
  "name",
  "href",
  "src",
  "type",
  "role",
  "title",
  "alt",
] as const;
const ALLOWLIST_ATTRIBUTE_NAMES = new Set([
  "id",
  "name",
  "role",
  "type",
  "href",
  "src",
  "alt",
  "title",
]);
const UTILITY_CLASS_NAME_TOKENS = new Set([
  "absolute",
  "block",
  "contents",
  "fixed",
  "flex",
  "grid",
  "hidden",
  "inline",
  "inline-block",
  "inline-flex",
  "relative",
  "sr-only",
  "sticky",
]);
const UTILITY_CLASS_VALUE_SEGMENTS = new Set([
  "0",
  "auto",
  "fit",
  "full",
  "max",
  "min",
  "none",
  "screen",
]);
const FINGERPRINT_ATTRIBUTE_NAMES = new Set([
  "cx",
  "cy",
  "d",
  "height",
  "points",
  "r",
  "rx",
  "ry",
  "viewBox",
  "viewbox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
]);
const MAX_DESCENDANT_ATTRIBUTE_FINGERPRINTS = 8;
const MAX_TEXT_PREVIEW_LENGTH = 120;
const FNV_32_OFFSET_BASIS = 0x811c9dc5;
const FNV_32_PRIME = 0x01000193;
const MIN_SHORT_PROPERTY_UTILITY_SEGMENT_COUNT = 2;
const MAX_SHORT_PROPERTY_NAME_LENGTH = 3;
const MAX_SHORT_PROPERTY_VALUE_LENGTH = 6;
const MIN_STABLE_CLASS_TOKEN_LENGTH = 4;
const HASH_LIKE_TOKEN_PATTERN = /^[A-Za-z_-]*[0-9][A-Za-z0-9_-]{3,}$/;
const HEX_HASH_TOKEN_PATTERN = /^[A-Fa-f0-9]{6,}$/;
const UNIQUE_ATTRIBUTE_PRIORITY = { aria: 2, data: 1, fallback: 3, id: 0 } as const;

type UniqueAttributeInput = { attributeName: string; attributeValue: string };

export function normalizeTextPreview(value: string | null | undefined): string | undefined {
  const normalizedValue = normalizeTextContent(value ?? null);
  return normalizedValue === undefined
    ? undefined
    : normalizedValue.slice(0, MAX_TEXT_PREVIEW_LENGTH);
}

export function deriveFullTextFingerprint(value: string | null): string | undefined {
  const normalizedValue = normalizeTextContent(value);
  return normalizedValue === undefined ? undefined : deriveCompactFingerprint(normalizedValue);
}

function normalizeTextContent(value: string | null): string | undefined {
  if (value === null) return undefined;
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

function deriveCompactFingerprint(value: string): string {
  let hash = FNV_32_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_32_PRIME);
  }
  return (hash >>> 0).toString(36);
}

const isHashedToken = (token: string): boolean =>
  HASH_LIKE_TOKEN_PATTERN.test(token) || HEX_HASH_TOKEN_PATTERN.test(token);

const hasVariantSyntax = (token: string): boolean => token.includes(":");
const hasArbitraryValueSyntax = (token: string): boolean =>
  token.includes("[") || token.includes("]") || token.includes("(") || token.includes(")");

const isShortPropertyUtilityToken = (token: string): boolean => {
  const segments = token.split("-");
  if (segments.length < MIN_SHORT_PROPERTY_UTILITY_SEGMENT_COUNT) return false;
  const [prop, ...values] = segments;
  if (prop.length > MAX_SHORT_PROPERTY_NAME_LENGTH) return false;
  const hasUtilityValue = values.some(
    (v) => /^\d+$/.test(v) || UTILITY_CLASS_VALUE_SEGMENTS.has(v),
  );
  if (!hasUtilityValue) return false;
  return values.every((v) => v.length <= MAX_SHORT_PROPERTY_VALUE_LENGTH);
};

const isUtilityToken = (token: string): boolean =>
  UTILITY_CLASS_NAME_TOKENS.has(token) ||
  hasVariantSyntax(token) ||
  hasArbitraryValueSyntax(token) ||
  isShortPropertyUtilityToken(token);

const isStableClassToken = (token: string): boolean => {
  if (token.length < MIN_STABLE_CLASS_TOKEN_LENGTH) return false;
  if (isHashedToken(token) || isUtilityToken(token)) return false;
  const digitCount = Array.from(token).filter((c) => /\d/.test(c)).length;
  if (digitCount >= Math.ceil(token.length / 2)) return false;
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(token);
};

const normalizeClassName = (className: string | SVGAnimatedString): string =>
  typeof className === "string" ? className : className.baseVal;

export const deriveStableClassTokens = (className: string | SVGAnimatedString): string[] =>
  Array.from(new Set(normalizeClassName(className).split(/\s+/).filter(isStableClassToken))).sort();

export const deriveGeneratedClassTokens = (className: string | SVGAnimatedString): string[] =>
  Array.from(new Set(normalizeClassName(className).split(/\s+/).filter(isHashedToken))).sort();

export const deriveClassTokens = (className: string | SVGAnimatedString): string[] =>
  Array.from(
    new Set([...deriveStableClassTokens(className), ...deriveGeneratedClassTokens(className)]),
  ).sort();

export const deriveAttributeFingerprints = (element: Element): string[] =>
  Array.from(element.attributes)
    .filter(({ name, value }) => FINGERPRINT_ATTRIBUTE_NAMES.has(name) && value.trim().length > 0)
    .map(
      ({ name, value }) =>
        `${element.tagName.toLowerCase()}:${name}:${deriveCompactFingerprint(value)}`,
    )
    .sort();

export const deriveDescendantAttributeFingerprints = (element: Element): string[] => {
  const fingerprintSet = new Set<string>();
  for (const descendant of Array.from(element.querySelectorAll("*"))) {
    for (const fingerprint of deriveAttributeFingerprints(descendant)) {
      fingerprintSet.add(fingerprint);
      if (fingerprintSet.size >= MAX_DESCENDANT_ATTRIBUTE_FINGERPRINTS) {
        return Array.from(fingerprintSet).sort();
      }
    }
  }
  return Array.from(fingerprintSet).sort();
};

const isAllowedAttributeName = (name: string): boolean =>
  !isInternalAttributeName(name) &&
  (ALLOWLIST_ATTRIBUTE_NAMES.has(name) || name.startsWith("data-") || name.startsWith("aria-"));

const isUniqueAttributeName = (name: string): boolean =>
  !isInternalAttributeName(name) &&
  (UNIQUE_ATTRIBUTE_NAMES.includes(name as (typeof UNIQUE_ATTRIBUTE_NAMES)[number]) ||
    name.startsWith("data-") ||
    name.startsWith("aria-"));

function isInternalAttributeName(name: string): boolean {
  return name.startsWith(INTERNAL_ATTRIBUTE_NAME_PREFIX);
}

const isStableAttributeValue = (value: string): boolean => {
  const v = value.trim();
  if (v.length === 0 || /^\d+$/.test(v)) return false;
  return !isHashedToken(v);
};

export const deriveAllowedAttributes = (element: HTMLElement): Record<string, string> =>
  Object.fromEntries(
    Array.from(element.attributes)
      .filter(({ name, value }) => isAllowedAttributeName(name) && isStableAttributeValue(value))
      .map(({ name, value }) => [name, value] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

export const resolveUniqueAttributeInput = (
  element: HTMLElement,
  documentRef: Document,
): UniqueAttributeInput | undefined => {
  const attributes = Array.from(element.attributes)
    .filter(({ name, value }) => isUniqueAttributeName(name) && isStableAttributeValue(value))
    .sort((a, b) => getUniqueAttributePriority(a.name) - getUniqueAttributePriority(b.name));

  for (const attr of attributes) {
    const selector = `[${attr.name}="${CSS.escape(attr.value)}"]`;
    const matched = Array.from(documentRef.querySelectorAll<HTMLElement>(selector));
    if (matched.length === 1 && matched[0] === element) {
      return { attributeName: attr.name, attributeValue: attr.value };
    }
  }
  return undefined;
};

function getUniqueAttributePriority(name: string): number {
  if (name === "id") return UNIQUE_ATTRIBUTE_PRIORITY.id;
  if (name.startsWith("data-")) return UNIQUE_ATTRIBUTE_PRIORITY.data;
  if (name.startsWith("aria-")) return UNIQUE_ATTRIBUTE_PRIORITY.aria;
  return UNIQUE_ATTRIBUTE_PRIORITY.fallback;
}
