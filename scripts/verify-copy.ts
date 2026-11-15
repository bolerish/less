import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { translations } from "../src/entries/welcome/locale.ts";

import type { Locale } from "../src/shared/locale/locales.ts";

const locales: Locale[] = ["en", "ko", "ja", "es", "zh_CN"];
let reference: Record<string, { message: string }> | undefined;
const catalogs = await Promise.all(
  locales.map(
    async (locale) =>
      JSON.parse(await readFile(`public/_locales/${locale}/messages.json`, "utf8")) as Record<
        string,
        { message: string }
      >,
  ),
);
for (const [index, locale] of locales.entries()) {
  const catalog = catalogs[index];
  reference ??= catalog;
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(reference).sort());
  for (const [key, value] of Object.entries(catalog)) {
    assert.deepEqual(value.message.match(/\$\d+/g), reference[key].message.match(/\$\d+/g));
  }
  const welcome = translations[locale];
  assert(welcome.steps[2].description.includes(catalog.panel_select.message));
  assert(!/forever|영구|永久/.test(JSON.stringify(welcome)));
  if (locale !== "en") assert(!JSON.stringify(welcome).includes("Hide an item"));
  for (const count of [0, 1, 2, 1000]) {
    const key =
      new Intl.PluralRules(locale.replace("_", "-")).select(count) === "one"
        ? "panel_selection_count_one"
        : "panel_selection_count_other";
    assert(catalog[key].message.includes("$1"));
    assert(
      catalog[key].message.replace(
        "$1",
        new Intl.NumberFormat(locale.replace("_", "-")).format(count),
      ),
    );
  }
  if (locale === "es")
    assert.notEqual(
      catalog.panel_selection_count_one.message,
      catalog.panel_selection_count_other.message,
    );
}
console.log("PASS: five locale keys, placeholders, welcome CTA, claims and selection count forms");
