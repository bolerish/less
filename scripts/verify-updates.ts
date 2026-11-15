import assert from "node:assert/strict";
import {
  compareUpdateVersions,
  getLatestReleasedUpdate,
  isUpdateVersion,
} from "../src/features/updates/notice.ts";
import type { ProductUpdate } from "../src/features/updates/releases.ts";

const released: ProductUpdate = {
  version: "1.2.0",
  date: "2026-11-15",
  status: "released",
  title: "Fixture release",
  changes: [],
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
