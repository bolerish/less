# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Bare** is a Chrome/Firefox browser extension that lets users hide distracting elements on any web page, with persistence across visits. Built with [WXT](https://wxt.dev/) (Web Extension Tooling), React 19, Tailwind CSS v4, and Dexie (IndexedDB).

## Commands

```bash
pnpm dev              # Dev build with hot reload (Chrome)
pnpm dev:firefox      # Dev build for Firefox
pnpm build            # Production build (Chrome)
pnpm build:firefox    # Production build (Firefox)
pnpm zip              # Build + zip for Chrome Web Store submission

pnpm lint             # oxlint (correctness + perf rules)
pnpm lint:fix         # Auto-fix lint issues
pnpm lint:types       # Type-check via tsc (runs wxt prepare first)
pnpm fmt              # Format with oxfmt
pnpm fmt:check        # Check formatting without writing
```

`scripts/verify-sidepanel.ts` verifies the built extension in headless Chrome. Run `pnpm verify:panel --chromium "/path/to/Google Chrome"` after building; see README.md for the optional Firefox API fixture and screenshots.

## Path Aliases

Defined in `wxt.config.ts` and resolved by WXT's Vite config:

| Alias       | Maps to          |
| ----------- | ---------------- |
| `~assets`   | `./src/assets`   |
| `~entries`  | `./src/entries`  |
| `~features` | `./src/features` |
| `~shared`   | `./src/shared`   |

## Architecture

### Extension entry points (`src/entries/`)

- **`preload.ts`** — Content script injected at `document_start`. Reads CSS selector caches from `browser.storage.local` and injects a `<style id="__bare_preload__">` into the page immediately to hide elements before paint, preventing flash-of-visible-content.
- **`content.ts`** — Main content script. Handles selection mode UI (highlight overlay, status bar, iframe shields), SPA navigation detection via `history.pushState`/`replaceState` monkey-patching, MutationObserver-based re-hiding for dynamic content, and undo stack.
- **`background.ts`** — Service worker. Owns all Dexie DB access (records are never read directly by content scripts — they always message the background). Handles `ADD_RECORD`, `DELETE_RECORD`, and `GET_RECORDS_FOR_PAGE` messages. Also listens to `webNavigation.onCommitted` to inject preload CSS via `browser.scripting.executeScript` as a fallback when the preload content script was too slow.
- **`popup/`** — React popup UI. Uses React hooks in `popup/hooks/` to query the background for counts and preferences.

### Feature modules (`src/features/`)

**`record/`** — Core data layer.

- `schema.ts`: Zod schemas for `HiddenElementRecord`. A record stores match inputs (unique attribute, DOM tree fingerprint, anchor nodes), page context (origin/path/search), scope (`"page"` vs `"site-layout"`), and an optional CSS selector cache.
- `repository.ts`: Dexie queries. Handles stale record cleanup (records failing to match 10+ times, or unmatched for 7 days, or matched records older than 30 days).
- `css-cache.ts`: Manages `bare:css:<key>` entries in `browser.storage.local` — fast CSS selector lists used for flash-free preloading.
- `derivation/`: Pure functions that extract match signals from a DOM element at hide time.

**`element-hiding/`** — Applies/restores `display:none` on elements.

- `hide-policy.ts`: Defines which elements are excluded from hiding and the HTML attributes used to mark hidden elements (`data-bare-hidden`, `data-bare-original-style`).
- `element-hide.ts`: `applyHiddenElement` (with optional fade-out animation), `restoreHiddenElement`, `restoreAllHiddenElements`.
- `match/`: Re-matches stored records against the live DOM on page load using three strategies in priority order: `UNIQUE_ATTRIBUTE` → `ANCHOR` → `STRUCTURE`.

**`selection/targeting/`** — Resolves which DOM element the user is hovering over, with heuristics to elevate to semantically meaningful ancestors (e.g. custom elements, Polymer/LitElement hosts), and iframe-aware targeting.

**`hiding-preference/`** — Per-origin on/off toggle stored in `browser.storage.local`.

### Data flow: hiding an element

1. User clicks an element in selection mode (content script).
2. Content script calls `deriveHiddenElementRecord(element, document)` → builds a `HiddenElementRecord` with match fingerprints.
3. Content script sends `ADD_RECORD` message to background.
4. Background calls `addRecord()` (Dexie) then `appendCSSCacheEntry()` (updates `bare:css:*` in storage).
5. On next page load, preload script reads `bare:css:*` and injects `display:none` CSS immediately.
6. Content script later re-runs `applyRecordsHiding` using the full record match logic as a fallback.

### Matching strategies

Records store three independent match strategies tried in the order specified by `record.matchPlan`:

- `UNIQUE_ATTRIBUTE`: matches by a stable unique HTML attribute (e.g. `id`, `data-*`).
- `ANCHOR`: matches by finding a nearby anchor element with stable text/attributes, then navigating to the target via a stored relation (`parent`, `child`, `previousSibling`, etc.).
- `STRUCTURE`: matches by DOM tree fingerprint (tag, class tokens, sibling context, relative index).

### Storage layout

| Key pattern                              | Type                    | Purpose                             |
| ---------------------------------------- | ----------------------- | ----------------------------------- |
| IndexedDB `bare-db`                      | `HiddenElementRecord[]` | All hide records                    |
| `bare:hiding-enabled:<encoded-origin>`   | `boolean`               | Per-site hiding on/off              |
| `bare:css:page:<origin>:<path>:<search>` | `string[]`              | CSS selectors for a specific page   |
| `bare:css:site:<origin>`                 | `string[]`              | CSS selectors for site-layout scope |
