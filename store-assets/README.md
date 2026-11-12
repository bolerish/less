# Veil — Chrome Web Store artwork

English artwork for the implementation in `370ec62`. These files are prepared
for the next extension release; the side-panel feature has not been published.
Do not use the management screenshot for a store build that lacks this feature.

## Upload files

| File                             | Size       | Purpose                                     |
| -------------------------------- | ---------- | ------------------------------------------- |
| `png/01-before-after.png`        | 1280 × 800 | The same demo page before and after hiding  |
| `png/02-select-to-hide.png`      | 1280 × 800 | Real selection highlight and toolbar        |
| `png/03-manage-hidden-items.png` | 1280 × 800 | Real saved records and restoration controls |
| `png/promo-440x280.png`          | 440 × 280  | Small promotional tile                      |
| `png/marquee-1400x560.png`       | 1400 × 560 | Optional marquee promotional tile           |

The final PNGs are opaque RGB images at the exact dimensions specified by
[Chrome's store listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
The outer canvas has square corners and fills every pixel. The artwork uses
the existing Veil logo and compiled brand tokens. There are
no decorative gradients, device frames, shadows, rounded screenshot cards, or
large advertising headlines. Each asset has one short explanatory line.

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
The management artwork explicitly labels this separate capture, placed beside
the matching page for context; it does not claim to show Chrome’s native panel
container. `popup.png` likewise captures the actual popup document. No browser frame or extension UI has been
redrawn, fabricated, or retouched.

## Composition and checks

- **Before / after:** two complete 616 × 660 captures, each placed at native size.
  The script asserts identical viewport, scroll position, header geometry, and
  article text before and after. The newsletter and sponsored card are hidden
  by Veil; the page’s resulting reflow is real.
- **Selection:** one complete 1248 × 680 capture at native size. The highlight
  and bottom Hide toolbar are actual extension UI. The separate popup is no
  longer used as a floating artwork card.
- **Management:** an 880 × 680 page capture beside the actual 360 × 680 panel
  document, both at native size, with no artificial browser chrome. Both read
  the same two saved hidden items. The caption identifies the separate capture.
- **Small tile:** the existing logo, one short line, and the top portion of the
  actual after capture. Only this asset scales and crops a screenshot (616 px
  to 408 px wide, preserving its ratio); it does not advertise controls that
  would become unreadably small at 440 × 280.
- **Marquee:** one complete 1368 × 472 selection capture at native size, with a
  compact logo and explanation above it.

The HTML/CSS only places real PNGs and the existing `src/assets/logo.svg`.
It never redraws, retouches, or generates product UI. `source/demo.html` is
unchanged. Every export checks screenshot aspect ratios, canvas bounds, text
overflow, exact dimensions, and opaque RGB output. Visually inspect both the
raw captures and all five final PNGs after regeneration, including the real
selection toolbar, Restore controls, and small tile’s intentional crop.

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

The script regenerates all original captures and final PNGs, checks comparison
state, layout, dimensions, and RGB output, closes its browser, and deletes its temporary profile. Capture
dates in the real panel naturally follow the date of regeneration.

`source/layout.html` owns the artwork layout and copy. `source/demo.html` owns
the fictional page. `source/tokens.css` is regenerated from the actual compiled
bolerish token bridge in the build; the images do not maintain a competing
brand palette. The demo's editorial illustration has its own local colors.

`store-assets/` is outside the extension source and public directories and is
not shipped in the app bundle. Nothing in this folder uploads to the store.
