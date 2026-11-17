/* eslint-disable no-await-in-loop -- Each language transition must settle before asserting its messages. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";

type Change = Record<string, { newValue?: unknown }>;
const storageListeners = new Set<(changes: Change, area: string) => void>();
let stored: unknown;
let rejectWrite = false;
function dispatch(value: unknown, area = "local") {
  for (const listener of storageListeners) listener({ "less:locale": { newValue: value } }, area);
}
function realm(language: string, blankJapaneseBack = false) {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const browser = {
    i18n: { getUILanguage: () => language },
    storage: {
      local: {
        get: async () => ({ "less:locale": stored }),
        set: async (values: Record<string, unknown>) => {
          if (rejectWrite) throw new Error("write failed");
          stored = values["less:locale"];
          dispatch(stored);
        },
      },
      onChanged: {
        addListener: (listener: (changes: Change, area: string) => void) =>
          storageListeners.add(listener),
        removeListener: (listener: (changes: Change, area: string) => void) =>
          storageListeners.delete(listener),
      },
    },
  };
  function load(path: string) {
    if (path.endsWith(".json")) {
      const catalog = JSON.parse(readFileSync(path, "utf8"));
      if (blankJapaneseBack && path.endsWith("/ja/messages.json")) catalog.panel_back.message = "";
      return catalog;
    }
    const filename = path.endsWith(".ts") ? path : `${path}.ts`;
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(source, {
      browser,
      module,
      exports: module.exports,
      require: (name: string) => load(resolve(dirname(filename), name)),
      Intl,
    });
    return module.exports;
  }
  return {
    preference: load(
      resolve("src/shared/locale/preference.ts"),
    ) as typeof import("../src/shared/locale/preference.ts"),
    messages: load(
      resolve("src/shared/locale/messages.ts"),
    ) as typeof import("../src/shared/locale/messages.ts"),
  };
}

const firstRealm = realm("es-MX", true);
const first = firstRealm.preference;
const disposeFirst = await first.initializeLocale();
assert.equal(first.getLocalePreference(), "auto");
assert.equal(first.getLocale(), "es");
assert.equal(first.getLanguage(), "es-MX", "auto preserves browser region for counts and dates");
const second = realm("en-US").preference;
const disposeSecond = await second.initializeLocale();
let notifications = 0;
const unsubscribe = second.subscribeLocale(() => notifications++);
await first.setLocalePreference("zh_CN");
assert.equal(stored, "zh_CN");
assert.equal(second.getLanguage(), "zh-CN", "open contexts synchronize explicit Chinese locale");
assert.equal(notifications, 1);
dispatch("ko", "sync");
assert.equal(second.getLocale(), "zh_CN", "unrelated storage areas are ignored");
const reopened = realm("ja-JP").preference;
const disposeReopened = await reopened.initializeLocale();
assert.equal(reopened.getLocale(), "zh_CN", "new contexts restore persisted choice");
rejectWrite = true;
await assert.rejects(first.setLocalePreference("ko"));
assert.equal(first.getLocale(), "zh_CN", "failed persistence does not change displayed language");
rejectWrite = false;
await first.setLocalePreference("auto");
assert.equal(second.getLanguage(), "en-US");
for (const invalid of [undefined, null, {}, "fr", "zh-CN", 1]) {
  dispatch(invalid);
  assert.equal(
    second.getLocalePreference(),
    "auto",
    "invalid or removed preference falls back to browser",
  );
}
for (const locale of ["en", "ko", "ja", "es", "zh_CN"] as const) {
  await first.setLocalePreference(locale);
  const catalog = JSON.parse(readFileSync(`public/_locales/${locale}/messages.json`, "utf8"));
  assert.equal(
    firstRealm.messages.getPanelMessage("panel_settings"),
    catalog.panel_settings.message,
  );
  for (const count of [0, 1, 2, 1000]) {
    const language = first.getLanguage();
    const key =
      new Intl.PluralRules(language).select(count) === "one"
        ? "panel_selection_count_one"
        : "panel_selection_count_other";
    const formatted = new Intl.NumberFormat(language).format(count);
    assert.equal(
      firstRealm.messages.getPanelMessage(key, [formatted]),
      catalog[key].message.replace("$1", formatted),
    );
  }
  assert.equal(
    firstRealm.messages.getPanelMessage("panel_restore_label", ["2", "$1"]),
    catalog.panel_restore_label.message.replace(
      /\$(\d+)/g,
      (_: string, index: string) => ["2", "$1"][Number(index) - 1] ?? "",
    ),
    "substitution values are inserted literally once",
  );
}
await first.setLocalePreference("ja");
assert.equal(
  firstRealm.messages.getPanelMessage("panel_back"),
  JSON.parse(readFileSync("public/_locales/en/messages.json", "utf8")).panel_back.message,
  "empty translation falls back to English",
);
unsubscribe();
disposeFirst();
disposeSecond();
disposeReopened();
assert.equal(storageListeners.size, 0);
console.log(
  "PASS locale preference: auto/region, persistence, cross-context changes, validation, failed writes and cleanup",
);
