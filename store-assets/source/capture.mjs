// Capture the built extension against a local fixture, then compose opaque store PNGs.
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
  const demo = (await readFile(join(source, "demo.html"), "utf8")).replace("{{TOKENS}}", tokens);
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    executablePath: values.chromium,
    headless: true,
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    colorScheme: "light",
    viewport: { width: 760, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  // All demo content comes from a local file; .test is reserved and never contacted.
  await context.route("https://demo.veil.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: demo }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionURL = `chrome-extension://${new URL(worker.url()).host}`;
  const site = await context.newPage();
  await site.goto("https://demo.veil.test/reading");
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

  await site.setViewportSize({ width: 1000, height: 580 });
  await site.keyboard.press("Control+Shift+E");
  const newsletter = await site.locator("#newsletter").boundingBox();
  await site.mouse.move(newsletter.x + 12, newsletter.y + 12);
  await site.waitForFunction(() => {
    const highlight = document.querySelector("[data-veil-highlight]");
    return highlight && getComputedStyle(highlight).display !== "none";
  });
  // The real toolbar has an entrance animation; wait for it to finish before capture.
  await site.waitForTimeout(350);
  await site.screenshot({ path: join(originals, "selection.png") });
  await site.mouse.click(newsletter.x + 12, newsletter.y + 12);
  await waitHidden(site, "#newsletter");
  await site.keyboard.press("Escape");
  await site.keyboard.press("Control+Shift+E");
  const sponsor = await site.locator("#sponsor").boundingBox();
  await site.mouse.move(sponsor.x + 12, sponsor.y + 12);
  await site.mouse.click(sponsor.x + 12, sponsor.y + 12);
  await waitHidden(site, "#sponsor");
  await site.keyboard.press("Escape");
  await site.setViewportSize({ width: 760, height: 600 });
  // Revisit to capture persisted hiding, rather than a transient selection state.
  await site.reload();
  await waitHidden(site, "#newsletter");
  await waitHidden(site, "#sponsor");
  await site.screenshot({ path: join(originals, "after.png") });
  await site.setViewportSize({ width: 900, height: 450 });
  await site.screenshot({ path: join(originals, "managed-page.png") });

  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 650 });
  await site.bringToFront();
  await panel.goto(`${extensionURL}/sidepanel.html`);
  await panel.getByRole("heading", { name: "demo.veil.test", exact: true }).waitFor();
  await panel.getByText("2 hidden items", { exact: true }).waitFor();
  await panel.screenshot({ path: join(originals, "panel.png") });
  assert.equal(await panel.getByRole("button", { name: /^Restore / }).count(), 2);
  // Confirm the captured control really restores a selected record on the live page.
  await panel.getByRole("button", { name: /^Restore Sponsored/i }).click();
  await site.waitForFunction(
    () => getComputedStyle(document.querySelector("#sponsor")).display !== "none",
  );

  const files = {
    BEFORE: "before.png",
    AFTER: "after.png",
    SELECTION: "selection.png",
    POPUP: "popup.png",
    MANAGED_PAGE: "managed-page.png",
    PANEL: "panel.png",
  };
  let layout = (await readFile(join(source, "layout.html"), "utf8")).replace("{{TOKENS}}", tokens);
  for (const [key, file] of Object.entries(files))
    layout = layout.replaceAll(
      `{{${key}}}`,
      `data:image/png;base64,${(await readFile(join(originals, file))).toString("base64")}`,
    );
  layout = layout.replaceAll(
    "{{LOGO}}",
    `data:image/svg+xml;base64,${(await readFile(resolve("src/assets/logo.svg"))).toString("base64")}`,
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
