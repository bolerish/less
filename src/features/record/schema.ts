import { z } from "zod/v4-mini";

export const MatchStrategySchema = z.enum(["CSS_SELECTOR", "UNIQUE_ATTRIBUTE", "STRUCTURE", "ANCHOR"]);

export type MatchStrategy = z.infer<typeof MatchStrategySchema>;

export const AnchorRelationSchema = z.enum([
  "self",
  "parent",
  "grandParent",
  "child",
  "descendant",
  "previousSibling",
  "nextSibling",
]);

export type AnchorRelation = z.infer<typeof AnchorRelationSchema>;

const SiblingNodeSchema = z.object({
  tag: z.string(),
  text: z.nullable(z.string()),
  fingerprint: z.string(),
});

const ElementFingerprintSchema = z.object({
  tagName: z.string(),
  role: z.nullable(z.string()),
  classTokens: z.array(z.string()),
  stableClassTokens: z.array(z.string()),
  generatedClassTokens: z.array(z.string()),
  stableAttributes: z.record(z.string(), z.string()),
  attributeFingerprints: z.array(z.string()),
});

const OuterSiblingContextSchema = z.object({
  ancestorDepth: z.number(),
  previousSibling: z.nullable(SiblingNodeSchema),
  nextSibling: z.nullable(SiblingNodeSchema),
});

const UniqueAttributeInputSchema = z.object({
  attributeName: z.string(),
  attributeValue: z.string(),
});

const TreeMatchInputSchema = z.object({
  targetFingerprint: ElementFingerprintSchema,
  parent: z.nullable(ElementFingerprintSchema),
  grandParent: z.nullable(ElementFingerprintSchema),
  childTagSummary: z.array(z.string()),
  outerSiblingContexts: z.array(OuterSiblingContextSchema),
  relativeIndex: z.number(),
});

const AnchorNodeSchema = z.object({
  relation: AnchorRelationSchema,
  tagName: z.string(),
  text: z.nullable(z.string()),
  fullTextFingerprint: z.nullable(z.string()),
  classTokens: z.array(z.string()),
  attributeFingerprints: z.array(z.string()),
  descendantAttributeFingerprints: z.array(z.string()),
  uniqueAttribute: z.nullable(UniqueAttributeInputSchema),
});

export const MatchInputsSchema = z.object({
  uniqueAttribute: z.optional(UniqueAttributeInputSchema),
  tree: z.optional(TreeMatchInputSchema),
  treeAnchor: z.optional(z.object({ anchors: z.array(AnchorNodeSchema) })),
});

export type MatchInputs = z.infer<typeof MatchInputsSchema>;

export const HiddenElementRecordSchema = z.object({
  id: z.string(),
  createdAt: z.number(),

  lastMatchedAt: z.nullable(z.number()),
  matchFailureCount: z.number(),
  lastSuccessfulStrategy: z.nullable(MatchStrategySchema),

  scope: z.enum(["page", "site-layout"]),

  pageContext: z.object({
    origin: z.string(),
    path: z.string(),
    search: z.string(),
  }),

  target: z.object({
    tagName: z.string(),
    displayText: z.nullable(z.string()),
  }),

  metadata: z.object({
    baseUri: z.string(),
  }),

  matchPlan: z.array(MatchStrategySchema),
  matchInputs: MatchInputsSchema,
  cssSelector: z.optional(z.string()),
});

export type HiddenElementRecord = z.infer<typeof HiddenElementRecordSchema>;
