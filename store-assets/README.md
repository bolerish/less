# Veil — Chrome Web Store artwork

English artwork for the implementation in `370ec62`. These files are prepared
for the next extension release; the side-panel feature has not been published.
Do not use the management screenshot for a store build that lacks this feature.

## Upload files

| File                             | Size       | Purpose                                      |
| -------------------------------- | ---------- | -------------------------------------------- |
| `png/01-before-after.png`        | 1280 × 800 | The same demo page before and after hiding   |
| `png/02-select-to-hide.png`      | 1280 × 800 | Real selection highlight, toolbar, and popup |
| `png/03-manage-hidden-items.png` | 1280 × 800 | Real saved records and restoration controls  |
| `png/promo-440x280.png`          | 440 × 280  | Small promotional tile                       |
| `png/marquee-1400x560.png`       | 1400 × 560 | Optional marquee promotional tile            |

The final PNGs are opaque RGB images at the exact dimensions specified by
[Chrome's store listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
The outer canvas has square corners and fills every pixel. The promotional
artwork uses the existing Veil logo and the same brand token roles.

## Capture provenance

`originals/` contains unedited captures. Fieldnotes is a fictional, local demo
page, including its text, sponsored card, newsletter, and original SVG hill
illustration. No accounts, browsing history, real ads, third-party brands, or
remote photographs are involved. The page itself visibly says “Local demo”.

The capture script routes the reserved `https://demo.veil.test/` origin to
`source/demo.html` within Chromium. No request is sent to that domain. It loads
the actual `dist/chrome-mv3` extension into a fresh temporary profile, selects
and hides the newsletter and sponsored card using the real extension gestures,
and reloads the page to capture persisted hiding. The management screen reads
the resulting actual IndexedDB records. Its Restore button is exercised against
the live page before the profile is discarded.

T3 preview rejected the extension URL with
`unsupported-protocol: chrome-extension:`. Captures therefore use installed
extension Chromium. `originals/panel.png` is the actual built side-panel document
opened as an extension page, not a photograph of Chrome's native browser chrome.
The same distinction is printed in the management artwork. `popup.png` likewise
captures the actual popup document. No browser frame or extension UI has been
redrawn, fabricated, or retouched.

The HTML/CSS composition scales and places those captures, adds headings and
borders outside them, and uses the existing `src/assets/logo.svg`. The small
promotional tile focuses on the existing brand rather than tiny UI text.

## Regenerate

Build the extension, then provide an installed Playwright module and an
extension-capable Chromium executable. No test or image-editing dependency is
added to the application.

```sh
pnpm build
node store-assets/source/capture.mjs \
  --playwright /absolute/path/to/playwright/index.mjs \
  --chromium /absolute/path/to/Chromium
```

The script regenerates all original captures and final PNGs, checks dimensions
and RGB output, closes its browser, and deletes its temporary profile. Capture
dates in the real panel naturally follow the date of regeneration.

`source/layout.html` owns the artwork layout and copy. `source/demo.html` owns
the fictional page. `source/tokens.css` is regenerated from the actual compiled
bolerish token bridge in the build; the images do not maintain a competing
brand palette. The demo's editorial illustration has its own local colors.

`store-assets/` is outside the extension source and public directories and is
not shipped in the app bundle. Nothing in this folder uploads to the store.
