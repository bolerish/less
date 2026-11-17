/* eslint-disable no-await-in-loop -- Each browser layout must settle before the next assertion. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import ts from "typescript";
import { chromium } from "playwright-core";

declare const lessPosition: typeof import("../src/features/element-hiding/preview-position");
const { values } = parseArgs({ options: { chromium: { type: "string" } } });
assert(values.chromium, "Pass --chromium");
const sources = await Promise.all(
  ["src/shared/lib/painted-rect.ts", "src/features/element-hiding/preview-position.ts"].map(
    (path) => readFile(path, "utf8"),
  ),
);
const code = ts.transpileModule(sources.join("\n").replace(/^import .*;\n/gm, ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const browser = await chromium.launch({ executablePath: values.chromium, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await page.setContent(`<!doctype html><style>
    html{overflow:hidden}body{margin:0}#pane{position:fixed;inset:auto 8px 8px auto;
    width:380px;height:340px;margin:0;padding:0;border:0}
    #nested{height:180px;overflow:auto;width:500px}
    #nested-target{height:60px;margin:0}#content{height:80px;margin:0}
    #fixed{position:fixed;top:100px;right:20px;width:200px;height:70px}
    </style><div style="height:900px"></div><div id="nested"><div style="height:300px"></div>
    <p id="nested-target">Nested content</p><div style="height:500px"></div></div>
    <div style="height:900px"></div><p id="content">Content category</p>
    <div style="height:1200px"></div><p id="fixed">Fixed content</p><dialog open id="pane"></dialog>`);
  await page.addScriptTag({
    content: `(()=>{const exports={};${code};globalThis.lessPosition=exports;})()`,
  });
  async function position(selector: string) {
    return page.evaluate((selector) => {
      const target = document.querySelector<HTMLElement>(selector)!;
      const pane = document.querySelector<HTMLDialogElement>("#pane")!;
      const result = lessPosition.positionPreview(target, pane);
      const rect = target.getBoundingClientRect();
      return {
        result,
        center: (rect.top + rect.bottom) / 2,
        expected: (pane.getBoundingClientRect().top - 8) / 2,
        y: scrollY,
        nested: document.querySelector("#nested")?.scrollTop ?? 0,
      };
    }, selector);
  }
  const nested = await position("#nested-target");
  assert(
    nested.result && nested.nested > 0 && nested.y > 0,
    "nested and document scrolling both work under the lock",
  );
  assert(Math.abs(nested.center - nested.expected) < 2, "nested content centers above the pane");
  assert.deepEqual(await position("#nested-target"), nested, "repeated nested centering is stable");
  const content = await position("#content");
  assert(content.result && content.y > nested.y, "content navigates just like a region");
  assert(Math.abs(content.center - content.expected) < 2, "content centers in the uncovered area");
  assert.deepEqual(await position("#content"), content, "repeated content centering is stable");
  const fixed = await position("#fixed");
  assert(fixed.result, "fixed content remains visible");
  assert.equal(fixed.y, content.y, "fixed content does not scroll the document");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#content")!.style.marginTop = "200px";
    lessPosition.positionPreview(
      document.querySelector("#content")!,
      document.querySelector("#pane"),
      false,
    );
  });
  assert.equal(
    await page.evaluate(() => scrollY),
    content.y,
    "visible resize does not recenter unexpectedly",
  );
  await page.evaluate(() => {
    document.body.innerHTML = '<p id="start">Short page</p><dialog open id="pane"></dialog>';
  });
  const short = await position("#start");
  assert(short.result && short.y === 0, "short page clamps without adding space");
  console.log(
    "PASS real Chrome: content/nested centering under scroll lock, stable repeat, fixed target, resize and short-page clamp",
  );
} finally {
  await browser.close();
}
