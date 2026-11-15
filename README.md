# Less

<img src="/src/assets/logo.png" alt="Less logo" width="100" />

Hide what you don’t need.

---

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
