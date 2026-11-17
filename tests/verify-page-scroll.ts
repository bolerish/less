/* eslint-disable no-await-in-loop -- Each scroll state must settle before the next assertion. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import ts from "typescript";
import { chromium } from "playwright-core";

declare const lessScrollPolicy: typeof import("../src/shared/lib/page-scroll");
declare let lessUnlock: () => void;
const { values } = parseArgs({ options: { chromium: { type: "string" } } });
assert(values.chromium, "Pass --chromium");
const source = await readFile("src/shared/lib/page-scroll.ts", "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const browser = await chromium.launch({
  executablePath: values.chromium,
  headless: true,
  ignoreDefaultArgs: ["--hide-scrollbars"],
  // Exercise real classic gutters independently of the OS scrollbar preference.
  args: ["--disable-features=OverlayScrollbar,MacOverlayScrollbars"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  async function setup(height: number, style = "") {
    await page.goto("about:blank");
    await page.setContent(`<!doctype html><html style="${style}"><head><style>
      body{margin:0}::-webkit-scrollbar{width:16px;height:16px}
      #reference{width:200px;margin:auto}#target{height:${height}px}
      </style></head><body><div id="reference">Reference</div><div id="target"></div></body></html>`);
    await page.addScriptTag({
      content: `(()=>{const exports={};${code};globalThis.lessScrollPolicy=exports;globalThis.lessUnlock=()=>{};})()`,
    });
  }
  const snapshot = () =>
    page.evaluate(() => ({
      style: document.documentElement.getAttribute("style"),
      width: document.documentElement.getBoundingClientRect().width,
      x: document.querySelector("#reference")!.getBoundingClientRect().x,
      y: scrollY,
      overflow: getComputedStyle(document.documentElement).overflowY,
    }));

  await setup(1400);
  const tall = await snapshot();
  assert(tall.width < 1100, "fixture has a classic scrollbar");
  await page.evaluate(() => {
    lessScrollPolicy.preservePageScrollbar(document);
    (document.querySelector("#target") as HTMLElement).style.display = "none";
  });
  const hidden = await snapshot();
  assert.equal(hidden.x, tall.x);
  assert.equal(hidden.width, tall.width);
  assert.notEqual(hidden.overflow, "scroll", "preserve space without forcing a scrollbar");
  await page.evaluate(() => {
    (document.querySelector("#target") as HTMLElement).style.removeProperty("display");
    lessScrollPolicy.releasePageScrollbar(document);
  });
  assert.equal((await snapshot()).style, tall.style, "last restore returns the exact style");

  for (const height of [100, 1400]) {
    await setup(height, "color: green; overflow: auto;");
    const initial = await snapshot();
    await page.evaluate(() => {
      lessUnlock = lessScrollPolicy.lockPageScroll(document);
    });
    assert.equal((await snapshot()).x, initial.x, "opening the panel keeps its original gutter");
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        (document.querySelector("#target") as HTMLElement).style.height = "1400px";
        lessScrollPolicy.releasePageScrollbar(document);
      });
      assert.equal((await snapshot()).x, initial.x, "OFF does not add a scrollbar under the panel");
      await page.evaluate(() => {
        lessScrollPolicy.preservePageScrollbar(document);
        (document.querySelector("#target") as HTMLElement).style.height = "100px";
      });
      const on = await snapshot();
      assert.equal(on.x, initial.x, "ON keeps the same page content position");
      assert.equal(on.width, initial.width);
      assert.equal(on.overflow, "hidden");
    }
    await page.evaluate(() => {
      lessUnlock();
      lessUnlock();
      lessScrollPolicy.releasePageScrollbar(document);
    });
    const end = await snapshot();
    assert.equal(end.style, initial.style, "both owners release exact original declarations");
    assert.notEqual(end.overflow, "scroll", "no forced scrollbar remains after toggling");
  }

  await setup(2400, "color: green; overflow: auto;");
  await page.evaluate(() => {
    scrollTo(0, 400);
    lessUnlock = lessScrollPolicy.lockPageScroll(document);
  });
  const lockedY = (await snapshot()).y;
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(100);
  assert.equal((await snapshot()).y, lockedY, "wheel cannot scroll the background");
  await page.evaluate(() => scrollTo(0, 700));
  assert.equal((await snapshot()).y, 700, "explicit preview navigation can still scroll");
  await page.evaluate(() => {
    document.documentElement.style.color = "blue";
    document.documentElement.style.overflowY = "clip";
  });
  await page.waitForFunction(() => document.documentElement.style.overflowY === "hidden");
  await page.evaluate(() => lessUnlock());
  assert.deepEqual(
    await page.evaluate(() => ({
      color: document.documentElement.style.color,
      overflow: document.documentElement.style.overflowY,
      x: document.documentElement.style.overflowX,
    })),
    { color: "blue", overflow: "clip", x: "auto" },
    "retain the page's own later changes",
  );
  console.log(
    "PASS real Chrome: existing/no gutter, repeated OFF/ON, exact release, wheel lock, explicit preview scroll, external style changes and idempotent cleanup",
  );
} finally {
  await browser.close();
}
