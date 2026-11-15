/* eslint-disable no-await-in-loop -- Mutants share a checkout and must run serially. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

// Fixed semantic mutations, not a random or exhaustive operator campaign.
const seed = "less-selection-v1";
const session = "src/features/selection/session.ts";
const hiding = "src/features/element-hiding/element-hide.ts";
const resolver = "src/features/selection/targeting/target-resolver.ts";
const mutants = [
  {
    id: "site-pointer-leaks",
    edits: [
      [
        session,
        "function handlePointerDown(event: MouseEvent): void {\n  if (isSelectionUI(event.target)) return;",
        "function handlePointerDown(event: MouseEvent): void {\n  return;",
      ],
    ],
  },
  { id: "shift-hides", edits: [[session, "if (event.shiftKey) {", "if (false) {"]] },
  {
    id: "parent-unpinned",
    edits: [
      [
        session,
        "if (ancestorTrail.length > 0 && target && hoveredEl?.contains(target)) return;",
        "// Mutant: discard the chosen parent on pointer movement.",
      ],
    ],
  },
  {
    id: "root-parent",
    edits: [
      [
        resolver,
        "while (parent !== null && !isDocumentShell(parent)) {\n    if (!isIgnored(parent)",
        "while (parent !== null) {\n    if (!isIgnored(parent)",
      ],
      [
        resolver,
        "!isIgnored(parent) && !isHideExcludedElement(parent) && hasNonZeroRect(parent)",
        "!isIgnored(parent) && hasNonZeroRect(parent)",
      ],
    ],
  },
  {
    id: "duplicate-record",
    edits: [
      [
        session,
        'const response = await portRequest<{ ok: boolean }>({ type: "ADD_RECORD", record });',
        'await portRequest({ type: "ADD_RECORD", record: { ...record, id: crypto.randomUUID() } });\n    const response = await portRequest<{ ok: boolean }>({ type: "ADD_RECORD", record });',
      ],
    ],
  },
  {
    id: "no-painted-height",
    edits: [
      [
        "src/shared/lib/painted-rect.ts",
        "if (rect.width <= 0 || rect.height !== 0) return rect;",
        "if (rect.width >= 0 || rect.height !== 0) return rect;",
      ],
    ],
  },
  {
    id: "aria-restore-lost",
    edits: [
      [
        hiding,
        "finishHiddenElementAnimation(element);",
        'finishHiddenElementAnimation(element);\n  element.removeAttribute("aria-hidden");',
      ],
    ],
  },
  {
    id: "preview-display-lost",
    edits: [
      [
        "src/features/element-hiding/preview.ts",
        'element.style.setProperty("display", display, "important");',
        'element.style.setProperty("display", "none", "important");',
      ],
    ],
  },
  { id: "fade-focusable", edits: [[hiding, "element.inert = true;", "element.inert = false;"]] },
  {
    id: "aria-overwritten",
    edits: [
      [
        hiding,
        'element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");',
        'element.setAttribute(HIDDEN_ELEMENT_ATTRIBUTE, "true");\n  element.setAttribute("aria-hidden", "true");',
      ],
    ],
  },
];
function classifyTest(status: number | null, timedOut: boolean, output: string) {
  if (status === 0) return "survived";
  if (
    status === null ||
    timedOut ||
    /TimeoutError|timed out|at (?:async )?waitFor \(/i.test(output)
  )
    return "inconclusive";
  return output.includes("AssertionError") ? "detected" : "inconclusive";
}
assert.equal(classifyTest(0, false, ""), "survived");
assert.equal(classifyTest(1, false, "AssertionError: count differs"), "detected");
assert.equal(
  classifyTest(1, false, "AssertionError\n    at waitFor (test.ts:1:1)"),
  "inconclusive",
);
assert.equal(classifyTest(1, false, "TimeoutError"), "inconclusive");
assert.equal(classifyTest(null, true, "AssertionError"), "inconclusive");
assert.equal(classifyTest(1, false, "SyntaxError"), "inconclusive");
const { values } = parseArgs({
  options: { chromium: { type: "string" }, ids: { type: "string" } },
});
assert(values.chromium, "Pass --chromium (extension-capable Chrome)");
const selected = values.ids
  ? mutants.filter((m) => values.ids!.split(",").includes(m.id))
  : mutants;
assert(selected.length && new Set(selected.map((m) => m.id)).size === selected.length);
if (values.ids)
  assert.equal(selected.length, values.ids.split(",").length, "known unique mutant IDs");
const directory = await mkdtemp(join(tmpdir(), "less-selection-mutations-"));
const originals = new Map<string, string>();
for (const file of new Set(mutants.flatMap((m) => m.edits.map(([file]) => file)))) {
  originals.set(file, await readFile(file, "utf8"));
}
const hashes = Object.fromEntries(
  [...originals].map(([file, source]) => [file, createHash("sha256").update(source).digest("hex")]),
);
const results: Array<{ id: string; outcome: string; milliseconds: number; evidence?: string }> = [];
async function run(name: string, args: string[]) {
  const started = Date.now();
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  await writeFile(join(directory, `${name}.log`), output);
  return {
    result,
    output,
    milliseconds: Date.now() - started,
    timedOut: !!result.error && "code" in result.error && result.error.code === "ETIMEDOUT",
  };
}
async function restore() {
  for (const [file, source] of originals) await writeFile(file, source);
}
const testArgs = ["verify:panel", "--chromium", values.chromium];
console.log(`Manual campaign ${seed}; ${selected.length} mutants; logs ${directory}`);
try {
  const build = await run("baseline-build", ["build"]);
  assert.equal(build.result.status, 0, "baseline build must pass");
  const baseline = await run("baseline-test", testArgs);
  assert.equal(baseline.result.status, 0, "baseline regression must pass before mutation");
  console.log(
    `BASELINE pass (${baseline.milliseconds}ms); baseline estimate ${selected.length * (baseline.milliseconds + build.milliseconds)}ms`,
  );
  for (const mutant of selected) {
    try {
      for (const [file, before, after] of mutant.edits) {
        const source = await readFile(file, "utf8");
        assert.equal(source.split(before).length, 2, `${mutant.id}: exactly one source anchor`);
        await writeFile(file, source.replace(before, after));
      }
      const compile = await run(`${mutant.id}-types`, [
        "exec",
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
      ]);
      if (compile.result.status !== 0) {
        results.push({
          id: mutant.id,
          outcome: compile.timedOut ? "inconclusive" : "invalid-compile",
          milliseconds: compile.milliseconds,
        });
        console.log(JSON.stringify(results.at(-1)));
        continue;
      }
      const build = await run(`${mutant.id}-build`, ["build"]);
      if (build.result.status !== 0) {
        results.push({
          id: mutant.id,
          outcome: build.timedOut ? "inconclusive" : "invalid-build",
          milliseconds: build.milliseconds,
        });
      } else {
        const test = await run(mutant.id, testArgs);
        const assertion = test.output.match(/AssertionError[^\n]*(?:\n[^\n]*)?/s)?.[0];
        const outcome = classifyTest(test.result.status, test.timedOut, test.output);
        results.push({
          id: mutant.id,
          outcome,
          milliseconds: build.milliseconds + test.milliseconds,
          evidence: assertion,
        });
      }
      console.log(JSON.stringify(results.at(-1)));
    } finally {
      await restore();
    }
  }
} finally {
  await restore();
  await writeFile(
    join(directory, "results.json"),
    JSON.stringify({ seed, hashes, command: ["pnpm", ...testArgs], results }, null, 2),
  );
  const finalBuild = await run("restored-build", ["build"]);
  assert.equal(finalBuild.result.status, 0, "restored source builds");
}
console.log(`Results: ${join(directory, "results.json")}`);
assert(
  results.every((r) => r.outcome === "detected"),
  "inspect survivors, invalid builds and inconclusive results separately",
);
