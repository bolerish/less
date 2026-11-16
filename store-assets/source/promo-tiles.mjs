/* eslint-disable no-await-in-loop -- Render and export each artwork sequentially in one browser. */
import { chromium } from "playwright-core";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const data = async (path) =>
  `data:image/png;base64,${(await readFile(new URL(path, root))).toString("base64")}`;
const [logo, before, after] = await Promise.all(
  ["../src/assets/logo.png", "originals/before.png", "originals/after.png"].map(data),
);
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  for (const [name, width, height] of [
    ["promo-less-440x280.png", 440, 280],
    ["marquee-less-1400x560.png", 1400, 560],
  ]) {
    const small = width === 440;
    const html = small
      ? `<!doctype html><html lang="en"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#eee;color:#18181b;font-family:Arial,sans-serif}.tile{width:440px;height:280px;padding:14px 16px}.brand{display:flex;align-items:center;gap:6px;font-size:19px;font-weight:700}.brand img{width:25px;height:25px}header{display:block}h1{font-size:24px;font-weight:500;letter-spacing:-.6px;margin:10px 0 0}.comparison{display:flex;gap:12px;margin-top:12px}figure{margin:0;width:198px}figcaption{font-size:11px;margin-bottom:5px;color:#444}.crop{height:116px;overflow:hidden;background:white;border-top:2px solid #ccc}.crop img{display:block;width:198px;max-width:none;transform:translateY(-96px)}.note{font-size:10px;color:#555;margin:8px 0 0}</style><main class="tile"><header><div class="brand"><img src="${logo}" alt="">Less</div><h1>Hide what you don’t need.</h1></header><div class="comparison">${[
          [before, "Before"],
          [after, "After"],
        ]
          .map(
            ([src, label]) =>
              `<figure><figcaption>${label}</figcaption><div class="crop"><img src="${src}" alt="Wikipedia ${label.toLowerCase()} hiding"></div></figure>`,
          )
          .join(
            "",
          )}</div><p class="note">Hide the sidebar. Keep the article. · Wikipedia</p></main></html>`
      : `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#eee;color:#18181b;font-family:Arial,sans-serif}.tile{width:${width}px;height:${height}px;overflow:hidden;position:relative;padding:${small ? "24px" : "48px"}}.brand{display:flex;align-items:center;gap:10px;font-size:${small ? 24 : 32}px;font-weight:600}.brand img{width:${small ? 32 : 44}px;height:${small ? 32 : 44}px}h1{font-size:${small ? 32 : 54}px;line-height:1.08;letter-spacing:-1.5px;font-weight:500;margin:${small ? "22px 0 0" : "38px 0 0"};max-width:${small ? 240 : 350}px}.shots{display:flex;gap:${small ? 10 : 20}px;position:absolute;left:${small ? 280 : 490}px;top:${small ? 28 : 48}px}.shot{margin:0;width:${small ? 130 : 406}px}figcaption{font-size:${small ? 12 : 16}px;margin-bottom:12px;color:#555} .crop{height:${small ? 240 : 416}px;overflow:hidden;background:white} .crop img{width:100%;display:block}.source{position:absolute;left:48px;bottom:40px;font-size:13px;color:#666;max-width:340px;line-height:1.5}
    ${small ? `.shots{left:264px;top:28px}.shot{width:152px}.crop{height:212px}.crop img{width:616px;max-width:none;transform:translate(-24px,-300px)}` : `.tile{padding:28px 48px}.brand{font-size:28px}.brand img{width:40px;height:40px}h1{position:absolute;left:270px;top:32px;margin:0;font-size:36px;max-width:none;letter-spacing:-1px}h1 br{display:none}h1 br:after{content:' '}.shots{left:48px;top:100px;gap:24px}.shot{width:640px}.crop{height:384px}.crop img{width:616px;max-width:none;transform:translateY(-180px)}.source{bottom:16px;max-width:none;font-size:12px}.source br{display:none}`}
    </style></head><body><main class="tile"><div class="brand"><img src="${logo}" alt="">Less</div><h1>${small ? "Hide what<br>you don’t<br>need." : "Hide what you don’t need."}</h1><div class="shots">${(small
      ? [[after, "After"]]
      : [
          [before, "Before"],
          [after, "After"],
        ]
    )
      .map(
        ([src, label]) =>
          `<figure class="shot"><figcaption>${label}</figcaption><div class="crop"><img src="${src}" alt="Wikipedia ${label.toLowerCase()} hiding"></div></figure>`,
      )
      .join(
        "",
      )}</div>${small ? "" : '<div class="source">Hide a sidebar. Keep the article. <br>Wikipedia · Actual before and after</div>'}</main></body></html>`;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode()));
    });
    assert.equal(
      await page.locator("h1").evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
      true,
    );
    const path = new URL(`png/${name}`, root);
    await page.screenshot({ path: path.pathname, omitBackground: false });
    const png = await readFile(path);
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.equal(png[24], 8);
    assert.equal(png[25], 2);
    await writeFile(new URL(`source/${name.replace(".png", ".html")}`, root), html);
    console.log(`PASS ${name}: ${width}×${height}, 24-bit RGB, no alpha`);
    await page.close();
  }
} finally {
  await browser.close();
}
