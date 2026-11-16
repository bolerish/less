import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compareUpdateVersions,
  getLatestReleasedUpdate,
  isUpdateVersion,
} from "../src/features/updates/notice.ts";
import { productUpdates, type ProductUpdate } from "../src/features/updates/releases.ts";

const catalogs = await Promise.all(
  ["en", "ko", "ja", "es", "zh_CN"].map(async (locale) => ({
    locale,
    catalog: JSON.parse(await readFile(`public/_locales/${locale}/messages.json`, "utf8")),
  })),
);
const updateKeys = productUpdates.flatMap((update) => [update.titleKey].concat(update.changeKeys));
for (const { locale, catalog } of catalogs) {
  assert(!("panel_installed_version" in catalog), `${locale}: redundant version label removed`);
  for (const key of updateKeys)
    assert(catalog[key]?.message.trim(), `${locale}/${key}: copy exists`);
  assert.deepEqual(
    Object.keys(catalog)
      .filter((key) => key.startsWith("panel_release_"))
      .sort(),
    updateKeys.toSorted(),
    `${locale}: release copy contains only the displayed changes`,
  );
}

const released: ProductUpdate = {
  version: "1.2.0",
  date: "2026-11-15",
  status: "released",
  titleKey: "panel_release_1_2_0_title",
  changeKeys: [],
};
const future: ProductUpdate = { ...released, version: "1.3.0" };
const draft: ProductUpdate = { ...released, version: "1.4.0", status: "unreleased" };
assert.equal(getLatestReleasedUpdate([draft], "1.4.0"), undefined, "drafts never notify");
assert.equal(getLatestReleasedUpdate([future], "1.2.0"), undefined, "future releases never notify");
assert.equal(getLatestReleasedUpdate([draft, future, released], "1.2.0"), released);
assert.equal(
  getLatestReleasedUpdate([released, future], "1.3.0"),
  future,
  "latest eligible version wins independent of array order",
);
assert.equal(
  getLatestReleasedUpdate([{ ...released, version: "Next update" }], "1.2.0"),
  undefined,
);
assert.equal(compareUpdateVersions("1.2.0", "1.2"), 0);
assert(compareUpdateVersions("1.10.0", "1.9.0") > 0, "version comparison is numeric");
assert(compareUpdateVersions("1.2.0", "1.3.0") < 0, "a newer seen version stays read");
for (const value of [undefined, null, 12, "Next update", "1.2.0-beta"])
  assert(!isUpdateVersion(value));
console.log(
  "PASS update notice policy: released/current only, draft/future exclusion, numeric seen-version ordering",
);
