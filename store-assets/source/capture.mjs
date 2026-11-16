// Capture the built extension on a live public Wikipedia page, then compose opaque store PNGs.
/* eslint-disable no-await-in-loop */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import postcss from "postcss";
import { format } from "oxfmt";

const { values } = parseArgs({
  options: {
    playwright: { type: "string" },
    chromium: { type: "string" },
    build: { type: "string", default: "dist/chrome-mv3" },
  },
});
assert(values.playwright && values.chromium, "Pass --playwright and --chromium");
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const source = dirname(fileURLToPath(import.meta.url));
const assets = dirname(source);
const originals = join(assets, "originals");
const output = join(assets, "png");
const extension = resolve(values.build);
const directory = await mkdtemp(join(tmpdir(), "veil-store-"));
let context;
try {
  await mkdir(originals, { recursive: true });
  await mkdir(output, { recursive: true });
  const popupHTML = await readFile(join(extension, "popup.html"), "utf8");
  const cssPath = popupHTML.match(/rel="stylesheet"[^>]+href="([^"]+)"/)[1];
  const css = postcss.parse(await readFile(join(extension, cssPath), "utf8"));
  let tokens = "";
  css.walkRules((rule) => {
    if (
      rule.selector === ":root,.veil-theme" &&
      rule.nodes.some((node) => node.prop === "--veil-color-bg-canvas")
    )
      tokens = `:root,\n.veil-theme {\n${rule.nodes
        .filter((node) => node.type === "decl")
        .map((node) => `  ${node.prop}: ${node.value};`)
        .join("\n")}\n}`;
  });
  assert(
    tokens && !tokens.includes("--veil-color-bg-canvas:var("),
    "Use the actual compiled token bridge",
  );
  const formatted = await format("tokens.css", tokens);
  assert.equal(formatted.errors.length, 0);
  tokens = formatted.code;
  await writeFile(join(source, "tokens.css"), tokens);
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    viewport: { width: 616, height: 660 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionURL = `chrome-extension://${new URL(worker.url()).host}`;
  const site = await context.newPage();
  await site.goto("https://en.wikipedia.org/wiki/Reading", { waitUntil: "networkidle" });
  await site.evaluate(() => document.fonts.ready);
  const beforeState = await readPageState(site);
  await site.screenshot({ path: join(originals, "before.png") });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 288, height: 320 });
  await site.bringToFront();
  await popup.goto(`${extensionURL}/popup.html`);
  await popup.waitForFunction(
    () => !document.querySelector('[aria-label="Select items to hide"]').disabled,
  );
  await popup.locator("#root > div").screenshot({ path: join(originals, "popup.png") });
  await popup.close();

  await site.setViewportSize({ width: 1248, height: 680 });
  await site.keyboard.press("Control+Shift+E");
  const sidebar = await hoverSidebar(site);
  await site.waitForTimeout(350);
  await site.screenshot({ path: join(originals, "selection.png") });
  await site.setViewportSize({ width: 1368, height: 472 });
  await hoverSidebar(site);
  await site.waitForTimeout(350);
  await site.screenshot({ path: join(originals, "marquee.png") });
  await site.setViewportSize({ width: 1248, height: 680 });
  await hoverSidebar(site);
  await site.mouse.click(sidebar.x, sidebar.y);
  await waitHidden(site, "table.sidebar");
  await site.keyboard.press("Escape");
  await site.mouse.move(0, 0);
  await site.setViewportSize({ width: 616, height: 660 });
  // Revisit to capture persisted hiding, rather than a transient selection state.
  await site.reload({ waitUntil: "networkidle" });
  await waitHidden(site, "table.sidebar");
  const afterState = await readPageState(site);
  assert.deepEqual(
    afterState,
    beforeState,
    "Same live URL, viewport, scroll, header, title, complete article text, images, and paragraph styles",
  );
  console.log(
    "PASS live Wikipedia: sidebar hidden by Veil; persists after reload; article preserved",
  );
  await site.screenshot({ path: join(originals, "after.png") });
  await site.setViewportSize({ width: 880, height: 680 });
  await site.mouse.move(0, 0);
  await site.waitForTimeout(600);
  await site.screenshot({ path: join(originals, "managed-page.png") });

  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 680 });
  await site.bringToFront();
  await panel.goto(`${extensionURL}/sidepanel.html`);
  await panel.getByRole("heading", { name: "en.wikipedia.org", exact: true }).waitFor();
  await panel.getByText("1 hidden item", { exact: true }).waitFor();
  await panel.screenshot({ path: join(originals, "panel.png") });
  assert.equal(await panel.getByRole("button", { name: /^Restore / }).count(), 1);
  // Confirm the captured control really restores a selected record on the live page.
  await panel.getByRole("button", { name: /^Restore / }).click();
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("table.sidebar")).display !== "none",
  );

  await site.reload({ waitUntil: "networkidle" });
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("table.sidebar")).display !== "none",
  );
  assert.equal((await readPageState(site)).content, beforeState.content);
  console.log("PASS actual saved record, panel Restore, and restoration after reload");

  const files = {
    BEFORE: "before.png",
    AFTER: "after.png",
    SELECTION: "selection.png",
    POPUP: "popup.png",
    MANAGED_PAGE: "managed-page.png",
    PANEL: "panel.png",
    MARQUEE: "marquee.png",
  };
  let layout = (await readFile(join(source, "layout.html"), "utf8")).replace("{{TOKENS}}", tokens);
  for (const [key, file] of Object.entries(files))
    layout = layout.replaceAll(
      `{{${key}}}`,
      `data:image/png;base64,${(await readFile(join(originals, file))).toString("base64")}`,
    );
  layout = layout.replaceAll(
    "{{LOGO}}",
    `data:image/png;base64,${(await readFile(resolve("src/assets/logo.png"))).toString("base64")}`,
  );
  const art = await context.newPage();
  await context.route("https://artwork.veil.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: layout }),
  );
  const exports = [
    ["before-after", "01-before-after.png", 1280, 800],
    ["selection", "02-select-to-hide.png", 1280, 800],
    ["management", "03-manage-hidden-items.png", 1280, 800],
    ["promo", "promo-440x280.png", 440, 280],
    ["marquee", "marquee-1400x560.png", 1400, 560],
  ];
  for (const [id, name, width, height] of exports) {
    await art.setViewportSize({ width, height });
    await art.goto(`https://artwork.veil.test/?asset=${id}`);
    await art.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    assert.equal(await art.locator(".asset.active").count(), 1);
    const layoutIssues = await art.locator(".asset.active").evaluate((asset) => {
      const bounds = asset.getBoundingClientRect();
      return Array.from(asset.querySelectorAll("img, p, figcaption, .brand")).flatMap((element) => {
        const rect = element.getBoundingClientRect();
        // Only the small tile deliberately crops the bottom of a real page capture.
        if (element.closest(".promo-crop")) return [];
        if (
          rect.left < bounds.left ||
          rect.top < bounds.top ||
          rect.right > bounds.right ||
          rect.bottom > bounds.bottom
        )
          return [`Outside canvas: ${element.tagName} ${element.className}`];
        if (element.tagName === "IMG" && element.classList.contains("shot")) {
          const scaleX = rect.width / element.naturalWidth;
          const scaleY = rect.height / element.naturalHeight;
          if (Math.abs(scaleX - scaleY) > 0.001) return ["Distorted capture"];
          if (Math.abs(scaleX - 1) > 0.001) return ["Capture must remain at native size"];
        }
        if (
          element.scrollWidth > element.clientWidth ||
          element.scrollHeight > element.clientHeight
        )
          return [`Clipped text: ${element.tagName}`];
        return [];
      });
    });
    assert.deepEqual(layoutIssues, [], "Export must preserve capture proportions and visible text");
    const path = join(output, name);
    await art.screenshot({ path, omitBackground: false });
    const png = await readFile(path);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[25], 2, "Store export must be RGB without alpha");
    console.log(`PASS ${name}: ${width} × ${height}, opaque RGB PNG`);
  }
} finally {
  if (context) await context.close();
  await rm(directory, { recursive: true, force: true });
}

async function waitHidden(page, selector) {
  await page.waitForFunction(
    (selector) => getComputedStyle(document.querySelector(selector)).display === "none",
    selector,
  );
}

async function readPageState(page) {
  return page.evaluate(() => {
    const paragraph = document.querySelector(".mw-parser-output p:not(.mw-empty-elt)");
    const style = getComputedStyle(paragraph);
    return {
      url: location.href,
      viewport: [innerWidth, innerHeight],
      scroll: [scrollX, scrollY],
      header: document.querySelector("header").getBoundingClientRect().toJSON(),
      title: document.querySelector("#firstHeading").getBoundingClientRect().toJSON(),
      content: document.querySelector(".mw-parser-output").textContent,
      images: Array.from(document.querySelectorAll(".mw-parser-output img"), (image) => [
        image.getAttribute("src"),
        image.getAttribute("alt"),
      ]),
      paragraphStyle: [style.fontFamily, style.fontSize, style.lineHeight, style.color],
    };
  });
}

async function hoverSidebar(page) {
  // Find a visible border point belonging to the complete table, using read-only hit testing.
  const point = await page.evaluate(() => {
    const table = document.querySelector("table.sidebar");
    const b = table.getBoundingClientRect();
    for (let offset = -1; offset <= 2; offset += 0.1) {
      for (const [x, y] of [
        [b.x + offset, b.y + 8],
        [b.x + 8, b.y + offset],
        [b.right - offset, b.y + 8],
      ]) {
        if (document.elementFromPoint(x, y) === table) return { x, y };
      }
    }
    return null;
  });
  assert(point, "The live table must have a visible border point that a real pointer can select");
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => {
    const highlight = document.querySelector("[data-veil-highlight]");
    const box = document.querySelector("table.sidebar").getBoundingClientRect();
    if (!highlight || getComputedStyle(highlight).display === "none") return false;
    const selected = highlight.getBoundingClientRect();
    return Math.abs(selected.width - box.width) < 8 && Math.abs(selected.height - box.height) < 8;
  });
  return point;
}
