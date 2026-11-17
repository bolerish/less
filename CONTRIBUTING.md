# Development and verification

```bash
pnpm dev       # Chrome (hot reload)
pnpm build     # Production build
pnpm zip       # Build + zip for store submission
```

## Verify the in-page panel

Use Node 22.23 or later and Chrome with `Extensions.loadUnpacked` and
`Extensions.triggerAction`. The TypeScript script runs with Node's native type
stripping; `playwright-core` supplies the browser APIs and types without bundling
or downloading a browser.

```bash
pnpm build
pnpm build:firefox
pnpm lint:types
pnpm verify:panel --chromium "/path/to/Google Chrome" --firefox-build dist/firefox-mv2
```

The script loads the built extension in a temporary headless Chrome profile and
uses real toolbar actions, selection, messaging, IndexedDB, storage and page DOM.
It verifies selection records, preview and restoration, scrolling, keyboard access,
responsive panel geometry and locales. The Firefox option checks the built MV2
background API in a fixture; it does not run Firefox. PNGs are written to `/tmp`
by default (`--screenshot /path/to/capture.png` changes their prefix). Chrome,
profile and local fixture server are cleaned up afterward.

The panel and page-scroll checks explicitly disable Chromium overlay scrollbars so classic-gutter fixtures do not depend on the OS scrollbar preference.

The page-panel shell and shared header/body inset live in `src/features/page-panel/layout.tsx`.
`view.tsx` owns the breadcrumb hierarchy and screen state; `mount.tsx` owns the native modal lifetime, backdrop dismissal and panel motion.
Motion preferences live in `src/shared/motion/preference.ts`; the system setting is the default.
`src/shared/lib/page-scroll.ts` owns overlapping hiding-gutter and modal-scroll claims.
The modal hides both page scrollbars while preserving its opening width; explicit preview navigation remains possible.

## Verify previously corrected behavior

Select checks from the changed user flow before editing. Keep the current
assignment's approved requirements, including follow-up requests, visible until
submission. A passing build does not establish the behavior below.

| User requirement                                                                                              | Existing verification                                                 | Remaining judgment                                                                            |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Shift previews the parent; click hides that exact target once                                                 | `pnpm verify:panel`                                                   | Exercise any reported site-specific DOM case separately                                       |
| Table cells own spacing; row Buttons have no padding and retain keyboard focus without a second hover layer   | `pnpm verify:panel`                                                   | Inspect the generated hover/selected screenshots                                              |
| Version/update entry, settings/language selection, panel layout and persistence remain available              | `pnpm verify:panel`, `pnpm verify:locale`, `pnpm verify:updates`      | Compare the approved layout with the rendered result                                          |
| Settings icons remain visible, section text aligns with links and the header aligns with the icon column      | `pnpm verify:settings`                                                | Compare against the approved settings reference                                               |
| Header/body edges align at every depth; focus rings fit; theme help uses FieldDescription                     | `pnpm verify:settings`                                                | Inspect the focused settings rows and nested fields                                           |
| Help opens install onboarding; shortcuts are read-only; Switch uses the documented default size               | `pnpm verify:settings`, `pnpm verify:panel`                           | Review the labels and Kbd list against the actual key handlers                                |
| Breadcrumb navigation, overlay dismissal and saved motion respect keyboard and system settings                | `pnpm verify:settings`                                                | Review long paths and actual motion on the reported device                                    |
| Hiding the last tall item preserves an existing scrollbar gutter without adding one to short pages            | `pnpm verify:panel`                                                   | The fixture enables classic scrollbars; overlay scrollbars do not reserve space               |
| Every item enters the same bottom preview; switches retain pane geometry/list scroll; targets center above it | `pnpm verify:panel`                                                   | Fixed targets stay in place; short-page limits clamp scrolling                                |
| Panel OFF/ON preserves width; preview works while OFF and removes backdrop blur                               | `pnpm verify:panel`, `verify-page-scroll.ts`                          | Exercise the reported site's saved items                                                      |
| Hiding is applied before reveal and remains correct on navigation/cache changes                               | `pnpm verify:preload`                                                 | Verify the reported website; local fixtures do not cover every site                           |
| Five languages retain keys/placeholders and supported product claims                                          | `pnpm verify:copy`, `pnpm verify:locale`                              | Review natural wording in each changed language; key parity does not prove fluency            |
| Toolbar launch and failure lifecycle remain correct                                                           | `pnpm verify:toolbar`, `pnpm verify:failure`                          | Fixture API checks do not establish Firefox runtime behavior                                  |
| A toolbar click during HTML parsing opens the panel after readiness; the next click closes it                 | `pnpm verify:failure`                                                 | Exercise slow real websites separately; the local fixture deliberately blocks the parser      |
| Official components, StyleX and feature-local responsibilities are preserved                                  | Inspect changed imports, styles and ownership against `bolerish-code` | Tokens alone do not establish component reuse; folder names alone do not establish separation |

Run source-only checks without building:

```bash
pnpm verify:copy
pnpm verify:locale
pnpm verify:updates
```

If pnpm stops before running a check because dependency build approval is
unresolved, report that command failure separately. The source-only checks can
also run directly with `node tests/verify-copy.ts`,
`node tests/verify-locale.ts` and `node tests/verify-updates.ts`; do not
change dependency approvals just to make a verification command pass.

Browser checks require a fresh build and the Chrome executable:

```bash
pnpm build
pnpm verify:panel --chromium "/path/to/Google Chrome"
pnpm verify:preload --chromium "/path/to/Google Chrome"
pnpm verify:failure --chromium "/path/to/Google Chrome"
```

`pnpm verify:toolbar` requires both Chrome and Firefox builds. It also checks
early message handling, rapid clicks, navigation cancellation, response expiry,
and recovery after failed content initialization. Pending panel requests expire
after five seconds; expiry is a failure limit, not a delay before opening.
The selection mutation script edits source files temporarily; do not run it in a shared or
already modified checkout. None of these commands starts a scheduled agent or
permits automatic merging.

For root scroll ownership and an optional axe audit:

```bash
node tests/verify-page-scroll.ts --chromium "/path/to/Google Chrome"
pnpm verify:panel --chromium "/path/to/Google Chrome" --axe "/path/to/axe.min.js"
```

Axe scans an exact rendered DOM/CSS snapshot in an open shadow root because it
cannot traverse the production closed shadow. The same run checks the real
closed-shadow accessibility tree and keyboard flows. Arrow-only Kbd contrast is
measured separately when axe reports non-text glyphs. These checks do not replace
screen-reader or live Firefox testing.

Before submitting, connect each approved requirement to an executed check and
its result, or state that it remains unverified. Recheck previously corrected
behavior affected by a rewrite. Do not treat a delegated agent's completion
message as verification of the final combined result. Distinguish intentional
new requirements from recurrence of an earlier defect.

## Verify settings and themes

The default theme now follows the web page, with the system setting as a fallback
when the page theme cannot be detected. Explicit page, system, light and dark
choices are global and synchronize across open tabs and extension documents.

```bash
pnpm build
pnpm build:firefox
pnpm verify:settings --chromium "/path/to/Google Chrome" --firefox-build dist/firefox-mv2
```

This check covers saved choices, page changes, isolated toolbar/feedback surfaces,
five languages, keyboard focus, contrast, 320/375px and 200% browser zoom.
Firefox coverage is an API fixture; it does not establish Firefox runtime behavior.
