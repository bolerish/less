import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { translations } from "../src/entries/welcome/locale.ts";

import { getRecordLabel } from "../src/features/page-panel/hidden-items/_lib/record-label.ts";
import type { ManagedRecord } from "../src/features/record/management.ts";
import type { getPanelMessage } from "../src/shared/locale/messages.ts";

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
  const message: typeof getPanelMessage = (key) => catalog[key].message;
  for (const [tagName, kind] of Object.entries({
    video: "video",
    img: "image",
    iframe: "external",
    object: "external",
    embed: "external",
    div: "region",
    section: "region",
    a: "content",
    span: "content",
  })) {
    const record: ManagedRecord = {
      id: "label-fixture",
      createdAt: 0,
      path: "/",
      scope: "page",
      target: { tagName, displayText: null },
    };
    const category = catalog[`panel_kind_${kind}`].message;
    assert.deepEqual(
      getRecordLabel(record, message),
      { category, text: "" },
      `${locale}/${tagName}: legacy category fallback`,
    );
    record.target.displayText = category;
    assert.deepEqual(
      getRecordLabel(record, message),
      { category, text: "" },
      `${locale}: category is never repeated as content`,
    );
    record.target.displayText = "  Example   content  ";
    assert.deepEqual(getRecordLabel(record, message), { category, text: "Example content" });
    record.target.contentKind = "external";
    assert.equal(
      getRecordLabel(record, message).category,
      catalog.panel_kind_external.message,
      "stored media classification takes precedence over an HTML wrapper tag",
    );
    record.target.displayText = "🌿".repeat(25);
    assert.equal(getRecordLabel(record, message).text, `${"🌿".repeat(24)}…`);
  }
  assert(
    !/\$\d/.test(catalog.panel_reset_confirm.message),
    "reset describes all items without a count placeholder",
  );
  if (locale === "ko") {
    assert.equal(catalog.panel_reset_group.message, "숨김 설정을 초기화할까요?");
    assert.equal(
      catalog.panel_reset_confirm.message,
      "이 사이트에서 숨긴 항목이 모두 다시 보여요.",
    );
    assert.equal(catalog.panel_reset.message, "초기화");
    assert.equal(catalog.panel_reset_all.message, "초기화");
    assert.equal(catalog.panel_cancel.message, "취소");
    assert.equal(catalog.ext_description.message, "불필요한 것을 숨기세요.");
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
