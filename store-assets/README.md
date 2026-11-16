# Less — Chrome Web Store artwork

`originals/` contains archived Wikipedia captures made with Veil, the former app
name. The repository README uses the original before/after pair; keep these
captures and their attribution tracked.

Track the generator scripts and editable templates. Generated files in `png/`
and the self-contained `source/promo-less-440x280.html` and
`source/marquee-less-1400x560.html` are local outputs ignored by Git. Existing
local outputs are preserved.

## Less promotional tiles

`source/promo-tiles.mjs` combines the current PNG logo with the archived actual
before/after captures. From the repository root, with Google Chrome installed at
its standard macOS path, run:

```sh
node store-assets/source/promo-tiles.mjs
```

It writes `png/promo-less-440x280.png` (440 × 280) and
`png/marquee-less-1400x560.png` (1400 × 560), checks their PNG dimensions and RGB
format, and writes the self-contained HTML alongside the script. Review the
images before uploading; the archived screenshots do not depict the current
panel UI.

## Archived capture workflow

The workflow below documents the Veil side-panel build at `370ec62`. It requires
that historical build and is not a regeneration check for the current in-page
panel. The archived imagery uses actual Wikipedia and extension captures rather
than a fictional website or generated screenshot.

### Archived exports (local outputs)

| File                             | Size       | Content                                                                    |
| -------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `png/01-before-after.png`        | 1280 × 800 | Same Wikipedia article before and after hiding its related-reading sidebar |
| `png/02-select-to-hide.png`      | 1280 × 800 | Actual Veil highlight and Hide toolbar on Wikipedia                        |
| `png/03-manage-hidden-items.png` | 1280 × 800 | Article beside the actual panel with its saved record and Restore control  |
| `png/promo-440x280.png`          | 440 × 280  | Veil logo and a crop of the actual article after hiding                    |
| `png/marquee-1400x560.png`       | 1400 × 560 | Actual selection on the same public article                                |

All exports are opaque RGB PNGs. The layout only places original captures and
Veil's existing logo; it adds a compact explanation and source label. There are
no generated images, fake browser frames, decorative cards, or large headlines.

## Public source and capture provenance

Source: [Reading — Wikipedia](https://en.wikipedia.org/wiki/Reading), captured
2026-11-13 (Asia/Seoul), without login in a fresh temporary Chromium profile.
Wikipedia contributors own the article text and its revision history; the page
links its attribution, reuse terms and the individual media descriptions.
The visible book illustration remains part of the original site's related-reading
box. Site text, styles, image sources and images were not replaced or retouched.
Wikipedia is shown as an independent example of using Veil, without endorsement.

`source/capture.mjs` loads the actual public URL over the network, with the locally
built `dist/chrome-mv3` extension installed. It does not intercept or substitute
Wikipedia responses. The former Fieldnotes demo file has been removed.
`originals/` contains unedited page and extension-document screenshots.

A real keyboard shortcut enters Veil selection mode. A real pointer on the
related-reading table's border highlights the complete box, then a click hides
it through Veil. No page element is removed manually and no CSS is injected by
the capture script. The extension saves its normal IndexedDB record and CSS
cache. The script reloads the public page, verifies persisted hiding, and captures
it again. The management document reads that saved record; its Restore button
is clicked and restoration is verified both immediately and after another reload.

The shared T3 browser opened the public page, but opening the extension page
returned `unsupported-protocol: chrome-extension:`. Capturing therefore uses
extension-capable Chromium through the existing Playwright script. The actual
built popup and side-panel documents are opened as extension pages. In the
management artwork the panel document is captured separately and placed beside
the article; this is explicitly labelled, and does not reproduce Chrome's native
side-panel container. Native browser chrome is not in any image.

## Composition and checks

- Before and after are complete 616 × 660 captures at native size, at the same
  live URL, viewport and scroll position. Header and title geometry, complete
  article DOM text, image source/alt attributes and paragraph typography must
  match exactly. Only the related-reading box is hidden. Its removal causes the
  site's own normal content reflow.
- Selection is a complete 1248 × 680 capture at native size. The highlight and
  toolbar are rendered by Veil. The marquee uses a complete 1368 × 472 capture;
  this short viewport shows the upper part of the highlighted box.
- Management places an 880 × 680 page beside the actual 360 × 680 extension panel,
  both at native size. Its single record comes from the actual hide gesture.
- The small tile scales the 616px after capture to 408px wide, preserving its
  ratio, and crops the top 56 scaled pixels and its lower portion to keep the
  article title and opening text visible. It has no tiny extension controls.
- Every export checks image proportions, native-size placement (except the
  intentional small tile crop), canvas bounds, text overflow, dimensions and RGB.
  Inspect every original and final PNG visually after regeneration.

## Regenerate

Build the extension, then use an installed Playwright module and extension-capable
Chromium. No dependency is added to the application:

```sh
pnpm build
node store-assets/source/capture.mjs \
  --playwright /absolute/path/to/playwright/index.mjs \
  --chromium /absolute/path/to/Chromium
```

On this machine the existing package-manager configuration rejected `pnpm build`
with `ERR_PNPM_IGNORED_BUILDS` before running the build. Without changing that
configuration, `node_modules/.bin/wxt build` successfully produced the extension.
The capture invocation used:

```sh
node store-assets/source/capture.mjs \
  --playwright /Users/jeongmin-yeong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  --chromium /Users/jeongmin-yeong/Library/Caches/ms-playwright/chromium-1155/chrome-mac/Chromium.app/Contents/MacOS/Chromium
```

The script closes Chromium and deletes the temporary profile. Wikipedia content
and layout may change; a future run must pass the assertions and be visually
reviewed again. The page is not frozen into a local imitation.

`source/layout.html` owns composition and copy. `source/tokens.css` is generated
from the actual compiled Veil token bridge. These assets are outside extension
source/public directories and are not shipped in the extension. This work does
not upload images or publish the extension.
