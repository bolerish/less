import { fileURLToPath } from "node:url";
import { transformFileSync, types } from "@babel/core";
import stylex from "@stylexjs/babel-plugin";
import postcss from "postcss";
import { z } from "zod";
import type { WxtViteConfig } from "wxt";

const compilerMetadata = z.object({
  stylex: z.array(
    z.tuple([z.string(), z.object({ ltr: z.string(), rtl: z.string().nullish() }), z.number()]),
  ),
});

// Keep the bridge small: these are public exports, never StyleX's generated hashes.
const usedTokens = {
  colorVars: [
    "bgCanvas",
    "bgSurface",
    "bgRaised",
    "bgInverse",
    "bgSubtle",
    "bgSelected",
    "interactionHover",
    "interactionPressed",
    "bgActionPrimary",
    "fgPrimary",
    "fgSecondary",
    "fgInverse",
    "fgOnActionPrimary",
    "fgFeedbackError",
    "fgFeedbackInfo",
    "strokeDefault",
    "strokeControl",
    "strokeFocus",
  ],
  spacingVars: ["space0_5", "space1", "space2", "space3", "space4", "space5", "space6", "space8"],
  motionVars: ["durationFast", "easingStandard"],
  radiusVars: ["sm", "md", "lg", "xl", "full"],
  shadowVars: ["subtle", "floating", "overlay"],
  typo: [
    "fontFamilyBody",
    "fontFamilyHeading",
    "fontSizeXs",
    "fontSizeSm",
    "fontSizeMd",
    "fontSizeLg",
    "fontSizeXl",
    "lineHeightTight",
    "lineHeightNormal",
    "fontWeightRegular",
    "fontWeightMedium",
    "fontWeightSemibold",
  ],
} satisfies {
  [K in keyof Pick<
    typeof import("@bolerish/tokens/semantic.stylex"),
    "colorVars" | "spacingVars" | "radiusVars" | "shadowVars" | "motionVars" | "typo"
  >]: readonly (keyof (typeof import("@bolerish/tokens/semantic.stylex"))[K])[];
};

export function bolerishTokens() {
  const css = compileTokens();
  return {
    name: "veil-bolerish-tokens",
    enforce: "pre",
    load(id: string) {
      if (id.split("?")[0].endsWith("/bolerish-tokens.css")) return css;
    },
  } satisfies NonNullable<WxtViteConfig["plugins"]>[number];
}

function compileTokens(): string {
  const exports = new Map<string, Map<string, string>>();
  const defaults = new Map<string, string>();
  const themes = new Map<string, Map<string, string>>();

  for (const entry of ["color-palette", "semantic.stylex", "themes.stylex"]) {
    const filename = fileURLToPath(import.meta.resolve(`@bolerish/tokens/${entry}`));
    const result = transformFileSync(filename, {
      ast: true,
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: ["typescript"] },
      plugins: [
        [
          stylex,
          {
            dev: false,
            runtimeInjection: false,
            unstable_moduleResolution: { type: "commonJS", rootDir: process.cwd() },
          },
        ],
      ],
    });
    if (!result?.ast) throw new Error(`No compiled token output: ${filename}`);

    for (const node of result.ast.program.body) {
      if (!types.isExportNamedDeclaration(node) || !types.isVariableDeclaration(node.declaration))
        continue;
      for (const declaration of node.declaration.declarations) {
        if (!types.isIdentifier(declaration.id) || !types.isObjectExpression(declaration.init))
          continue;
        const values = new Map<string, string>();
        for (const property of declaration.init.properties) {
          if (!types.isObjectProperty(property) || !types.isStringLiteral(property.value)) continue;
          if (types.isIdentifier(property.key)) values.set(property.key.name, property.value.value);
          if (types.isStringLiteral(property.key))
            values.set(property.key.value, property.value.value);
        }
        exports.set(declaration.id.name, values);
      }
    }

    const rules = compilerMetadata.parse(result.metadata).stylex;
    for (const [name, rule] of rules) {
      const values = new Map<string, string>();
      postcss.parse(rule.ltr).walkDecls(({ prop, value }) => {
        values.set(prop, value);
      });
      if (entry === "themes.stylex") themes.set(name, values);
      else for (const [key, value] of values) defaults.set(key, value);
    }
  }

  const declarations = (mode: "light" | "dark"): Map<string, string> => {
    const values = new Map(defaults);
    for (const kind of ["Color", "Shadow"]) {
      const theme = exports.get(`${mode}${kind}Theme`);
      const className = theme?.values().next().value?.split(" ")[0];
      const overrides = className && themes.get(className);
      if (!overrides) throw new Error(`Missing ${mode}${kind}Theme`);
      for (const [key, value] of overrides) values.set(key, value);
    }
    // Resolve package-internal variables so page custom properties cannot override them.
    const resolve = (value: string, depth = 0): string => {
      if (depth > 10) throw new Error("Circular token reference");
      return value.replace(/var\((--[\w-]+)\)/g, (reference, key: string) => {
        const next = values.get(key);
        if (!next) throw new Error(`Unresolved token: ${reference}`);
        return resolve(next, depth + 1);
      });
    };
    const declarations = new Map<string, string>();
    for (const [group, names] of Object.entries(usedTokens)) {
      for (const name of names) {
        const reference = exports.get(group)?.get(name);
        if (!reference) throw new Error(`Missing public token: ${group}.${name}`);
        const prefix = group === "typo" ? "" : `${group.replace("Vars", "")}-`;
        const suffix = name
          .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
          .replaceAll("_", "-")
          .toLowerCase();
        let value = resolve(reference);
        if (group === "radiusVars") {
          value = value.replace(/([\d.]+)rem\b/g, "calc($1 * var(--bolerish-unit, 1rem))");
        }
        declarations.set(`--veil-${prefix}${suffix}`, value);
      }
    }
    return declarations;
  };

  const light = declarations("light");
  const dark = declarations("dark");
  const serialize = (values: Map<string, string>): string =>
    Array.from(values, ([name, value]) => `${name}:${value};`).join("");
  for (const [name, value] of dark) {
    if (light.get(name) === value) dark.delete(name);
  }
  return `:root,.veil-theme{${serialize(light)}}\n:root.dark,.veil-theme[data-theme=dark]{${serialize(dark)}}\n@media(prefers-color-scheme:dark){:root:not(.light):not(.dark){${serialize(dark)}}}`;
}
