# Repository Guidelines

## Project Structure & Module Organization

Less is a WXT, React, and TypeScript extension for Chrome and Firefox that hides unwanted page elements.

- `src/entries/`: Background, content scripts, preload hiding, welcome page, and failure UI entry points.
- `src/features/`: Selection, hiding, matching, records, site preferences, updates, and `page-panel/` UI.
- `src/shared/`: Database connection, utilities, and styles.
- `src/assets/`: Images. `public/_locales/`: Messages for five languages.
- `scripts/`: Verification and measurement tools. `build/`: Build helpers.
- `store-assets/`: Store artwork. Do not edit generated `dist/` or `.wxt/` files.

## Build, Test, and Development Commands

Run pnpm from the repository root. Verification scripts require Node 22.23 or later.

| Command                             | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `pnpm install`                      | Install dependencies and prepare WXT           |
| `pnpm dev` / `pnpm dev:firefox`     | Start Chrome / Firefox development             |
| `pnpm build` / `pnpm build:firefox` | Build for each browser                         |
| `pnpm zip` / `pnpm zip:firefox`     | Package store submissions                      |
| `pnpm lint`                         | Check Oxlint correctness and performance rules |
| `pnpm lint:types`                   | Prepare WXT and check TypeScript types         |
| `pnpm fmt:check` / `pnpm fmt`       | Check / apply Oxfmt formatting                 |

## Coding Style & Naming Conventions

Follow Oxfmt: two-space indentation, double quotes, and semicolons. Use PascalCase components and camelCase functions/variables. Follow neighboring filenames: `management-service.ts`, `App.tsx`. Use `~features`, `~shared`, `~entries`, and `~assets` aliases. Reuse existing schemas, repository functions, `@bolerish/ui`, and StyleX patterns.

## Testing Guidelines

No `pnpm test` or coverage threshold is configured. Add regression checks to `scripts/verify-*.ts`, which use Playwright's `playwright-core` and Node `assert`. Verify behavior changes with static and browser checks.

```bash
pnpm build
pnpm verify:panel --chromium "/path/to/Google Chrome"
pnpm verify:failure --chromium "/path/to/Google Chrome"
```

Chrome must support `Extensions.loadUnpacked` and `Extensions.triggerAction`. Panel checks cover selection, restoration, storage, keyboard access, responsiveness, and locales. After building Firefox, add `--firefox-build dist/firefox-mv2` for API fixture checks; report Firefox runtime testing separately. Update script references and expectations when paths or UI change.

## Commit & Pull Request Guidelines

Use `type(scope): description`, following history: `fix(toolbar): ...`, `feat(panel): ...`. Separate commits by purpose; preserve unrelated changes. PRs should explain motivation, behavior changes, checks, and untested areas. Link relevant issues and include screenshots for UI changes.

## Storage & Permission Boundaries

Background code owns IndexedDB access. Keep records, CSS caches, and live DOM synchronized when changing hiding or restoration. Preserve message origin/frame validation and justify minimal additional permissions.

## Preserve approved requirements and corrections

Before editing, identify this assignment's approved requirements and relevant
previous corrections. Use the [verification map](README.md#verify-previously-corrected-behavior)
to select existing checks; add a regression only for a demonstrated gap. Preserve
correct behavior across rewrites. Reuse official components rather than equating
token use with design-system adoption, and inspect actual responsibility
boundaries rather than checking segment names alone.

Before completion, check the final combined result against each requirement.
Report executed checks and remaining unverified conditions separately. A build,
a Skill invocation, or a delegate's completion report alone is insufficient.
Natural wording and requested visual states need review of the actual changed
copy or rendered result. Keep progress and final completion reports distinct.
