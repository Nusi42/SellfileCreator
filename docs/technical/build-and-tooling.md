# Build and Tooling

This document covers the stack, everyday development workflows, and delivery tooling.

## Stack

- React 18 + TypeScript + Vite
- React Compiler (babel-plugin-react-compiler via @vitejs/plugin-react)
- Material UI v7 (dark theme) + Emotion

## Development

**Prerequisites**
- Node.js 20.19+ (Vite 7 requires ^20.19.0 or >=22.12.0)

### Constants Discipline

Numbers that drive layout, sizing, timing, etc. must live in a single shared constant. When the visual tweaks change, update the constant (or add a new centralized constant) instead of applying ad-hoc adjustments like `SIZE + 2` at the call site. Layering “just this one offset” defeats the one-definition rule and makes downstream clean-up harder.

**Scripts**
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist`
- `npm run preview` — preview the built app
- `npm run typecheck` — run `tsc --noEmit`
- `npm run release:win` — Windows: build and create a versioned zip archive in repo root
- `npm run release:win-dev` — Windows: dev build/package; leaves package.json version unchanged and creates a `-dev` suffixed archive

### Scripts Layout

- Committed (source) scripts live under `scripts/` and should be checked in:
- `scripts/vite/assetsPlugin.ts` — injects the favicon data URL into `index.html` from a fixed allowlist ahead of dev/build runs.
  - `patch-esm-specifiers.cjs` — patches compiled test artifacts to add `.js` extensions for Node ESM.
- `run-tests.mjs` — orchestrates the full `npm test` pipeline (cleans `scripts/.tmp`, runs `tsc -p tsconfig.tests.json`, patches ESM specifiers, executes the HSFC end-to-end harness, then runs all node:test specs emitted under `scripts/.tmp/tests/`).
- `dump-tests-hsfc.mjs` — extracts HSFC‑readable configs from compiled tests (`npm run tests:extract`).
- `dump-goldens-all.mjs` — writes golden snapshots for curated HSFC cases.
- `gen-hsf-from-hsfc.mjs` — generates HSF from a readable HSFC file.
- `build-hsf-from-config.mjs` — generates HSF from a single HSFC config object (stdin/stdout helper).
- Fixture writers (`dump-tests-hsfc.mjs`, `dump-goldens-all.mjs`, `gen-hsf-from-hsfc.mjs`, `build-hsf-from-config.mjs`) reuse the builder output verbatim so JSON member order mirrors the RSL Helper export.
- Fixture HSFs are kept in sync with the app pipeline: `tests/file-hsfc-e2e.ts` routes every HSFC through `parseHsfcObject` and `computeMergedRules` so metaset expansion and obsolete-rule pruning match the UI/export behavior, then compares the full rule payloads exactly as emitted (no key reordering, no field trimming).
- Fixture organization and refresh workflow lives in `tests/FIXTURES.md` for quick reference when adding scenarios or re-generating targets.
  - `audit-l10n-widths.ts` — estimates per-locale string width/line growth to flag UI elements that need fixed sizing.
  - (one-off/migration helpers are not kept here; see below)
  - `export-catalogs.ts` — builds localized catalogs into `dist/l10n/*.l10n.json` (`npm run export:l10n`).
- `release-win.ps1` — Windows packaging script (`-DevBuild` opt-in for dev bundles). `release-win-dev.ps1` forwards to it.
- `run-sample-server.ps1` — sample launcher + push receiver (writes PUT payloads to `mock-export.hsf` by default) for the Sellfile Creator Web Protocol contract. Requires PowerShell 7 (`pwsh`); when invoked from Windows PowerShell it re-launches itself under `pwsh`. Handles Ctrl+C shutdown, CORS preflight responses, exposes `/mock/select` + `/mock/tester-items` helpers to queue demo commands (row numbers for `/mock/select` stay 1-based all the way through to the queued event so they match the UI directly), and binds `[T]` / `[R]` shortcuts (focus the console window) to enqueue sample tester items or select-rule events without crafting requests (payloads load from the shared `sample-commands-response.json` catalog so the script stays lean; the file is required and the script exits when it is missing). The sample catalog supplies `rowNumber` values and they are treated as 1-based. Pass `-PauseBeforeUiReset` when you need the script to pause before clearing startup warnings. The console view keeps a pinned header (hotkeys, protocol quick reference), renders inbound/outbound traffic with cyan/magenta arrow prefixes (the cheatsheet line mirrors those colors and clarifies the `selectRule` / `testerItems` payloads), always shows the newest log entries within the available console rows (older lines trigger an overflow reminder when the window is too short), summarizes the target `.hsf` path relative to the launch directory, and accepts `PUT /<name>` to save alongside the default file (`<name>` is sanitized and `.hsf` is appended automatically). During development the script and JSON payload samples live under `scripts/`; release archives copy them into `dev/` (`dev/run-sample-server.ps1`, `dev/sample-commands-response.json`, `dev/sample-upload-body.json`).

- Transient/compiled helpers live under `scripts/.tmp/**` and are ignored by git (see `.gitignore`). Example:
  - `scripts/.tmp/scripts/export-catalogs.js` — compiled output of `scripts/export-catalogs.ts` used by `npm run export:l10n`.
- `scripts/.tmp/tests/**`, `scripts/.tmp/src/**` — TypeScript‑compiled test/lib artifacts used by `npm test` and tooling.

- Convention for non‑committed utility scripts: place them under `scripts/.tmp/scripts/` and call them from npm scripts if needed. Do not check these into git; they are treated as build/test artifacts, and any ad-hoc helpers should be generated temporarily and cleaned up after use (no long-lived utilities live here).

### Validation Before Handoff

- For code changes (anything beyond docs and `constants.ts`), run `npm run typecheck`, `npm run lint`, and `npm run build` and fix any issues.
- Always run tests when changes may influence HSFC/HSF IO or HSF rule generation logic: `npm test`.
  - Includes edits to: HSFC normalize/parse/write, HSF parse/write, and any HSF rule generation behavior (e.g., permutations/minCount, thresholds Early/Late, rarity/roll schedules, level windows, wildcard and caps handling, pruning/feasibility filters).
  - These end-to-end tests validate readable HSFC → normalize → builder → HSF output and catch regressions in thresholds, rarity/rank schedules, and rule shapes.
  - If a test needs to be updated due to an intentional behavior change, adjust the test alongside the implementation so they remain in sync.
- End-to-end coverage lives under `e2e/` (Playwright). Use `npx playwright test e2e/smoke.spec.ts --project=chromium --reporter=list` as a smoke check before running heavier specs.
  - The dev server binds `127.0.0.1:5182`; when the Codex sandbox reports `EPERM`, rerun the Playwright command with `with_escalated_permissions: true` so Vite can listen on that port.
  - All specs import `test`/`expect` from `e2e/fixtures.ts`; that fixture streams browser console output and page errors to the CLI so debugging works even without an interactive browser.
- Remove temporary debugging, scaffolding, or exploratory code once a change is validated so the repository only reflects the final implementation.
- Production bundles must stay silent: wrap `console.*` calls in `if (import.meta.env.DEV)` or remove them so release builds never write to the browser console.

### Runtime Launch Parameters

- `SellfileCreator.html` (and the dev build at `dist/index.html`) reads the launch URL’s `endpoint` query parameter and exposes it via `window.__APP_CONFIG__`. Passing `?endpoint=http://localhost:4242/` sets `pushEndpoint` for the entire session. The legacy `endpoint` hash (`#endpoint=`) and the older `push` query/hash names continue to work for backward compatibility.
- When `pushEndpoint` is defined, “Export Sellfile” issues an HTTP `PUT` to the endpoint and appends a timestamped filename segment (e.g., `/Sellfile_20240214_1545.hsf`) before sending the `.hsf` JSON payload. Without the parameter, the browser still downloads the file locally. The export button label switches to “Push …” and its tooltip references the active endpoint so users can confirm the target.
- When `pushEndpoint` is defined, the app also polls `GET <pushEndpoint>/commands` for JSON payloads with `events`. Each response drains the queue — there is no cursor or acknowledgement token.
- `type: "selectRule"` with `rowNumber` (1-based, same as the grid row number) to focus a preview row and reselect the owning config.
  - `type: "testerItems"` with `items` (array of HSF-styled artifact objects) to enqueue Rule Tester entries. `openTester: true` opens the dialog automatically.
- Browsers opened via `file://` send `Origin: null` and require the receiving service to answer preflight requests with permissive CORS headers (e.g., `Access-Control-Allow-Origin: *` plus the usual method/header allowances).
- `scripts/run-sample-server.ps1` demonstrates how an external tool can open the packaged app via `Start-Process`, append the encoded endpoint automatically, and host a stub HTTP listener that persists incoming `PUT` payloads to disk (defaults to `mock-export.hsf`, configurable via `-OutputPath`). The sample targets PowerShell 7 (`pwsh`) and will self-relaunch under `pwsh` when run from legacy Windows PowerShell before failing gracefully if `pwsh` is unavailable. The helper answers CORS preflight (`OPTIONS`) requests, sets permissive `Access-Control-Allow-*` headers, exposes `/mock/select` (expects 1-based row numbers and forwards them unchanged) and `/mock/tester-items` helpers to enqueue demo events pulled from `sample-commands-response.json` (the catalog is required and the script exits when it is missing), adds console shortcuts `[T]` for tester artifacts and `[R]` for rule selection (keep the PowerShell window focused when pressing the keys), exits cleanly on Ctrl+C, can auto-open the saved file when run with `-OpenOnSave`, and saves timestamped filenames pushed by the app (`PUT /{name}` with sanitized `<name>.hsf`). `GET /commands` now long-polls: idle requests stay open for up to 30 s and complete immediately when an event is queued, keeping client traffic low while still delivering first-match responses. `sample-commands-response.json` provides 1-based `rowNumber` identifiers when defining selectRule samples.

### Single Source of Truth

- No duplication of logic or data. Centralize and import instead of re-encoding knowledge in multiple files.
- Domain catalogs, enums, and formatting live in `src/lib/types.ts` (artifact sets/types, rarity/rank/faction, `StatVariant`, and slot constraints). Consumers must use these exports and not redefine them.
- HSF schema and tuple converters live in `src/lib/hsfTypes.ts`. App code should use `StatVariant` and helpers rather than rolling custom `{ id, flat }` handling.
- UI/app constants (storage keys, sizes, timing, tooltip keywords, typography scale) live in `src/lib/constants.ts`.
  - Font tiers: display heading (32px) for the hero, base text (15px) for content, secondary text (12px) for chips/controls, 10px badges, and markdown explicitly pinned to 16px.
  - All small buttons share the 15px base font via the theme override and `SMALL_BUTTON_HEIGHT_PX` (28px) so identical controls stay visually aligned across locales.
- When a value must be used in multiple places, extract a constant or enum once and reference it (avoid copy/paste).
- Preview display preferences are centralized in `src/state/preferencesState.tsx`. Components read/write them via `useDisplayPreferences` and `useDisplayPreferenceActions`; no component should touch the underlying localStorage keys directly.
- Local storage persistence helpers:
  - `src/state/localStorageStore.ts` exposes a typed store factory (`createLocalStorageStore`) that normalizes key access, snapshotted state, and subscription notifications so components avoid writing bespoke Effects for persistence.
  - `src/state/colorBlindPreference.ts`, `src/state/rulesFilterPersistence.ts`, `src/state/rulesTableColumnsPreference.ts`, and `src/state/setsOrderPreference.ts` all wrap that store to provide domain-specific hooks (`useColorBlindPreference`, `useRulesFilterOpenPreference`, `useRulesFilterStatePreference`, `useRulesFilterCollapsedPreference`, `useRulesTableColumnsPreference`, `useSetsOrderPreference`) consumed by `App`, `RulesFilterPanel`, and `HsfRulesTable`.
  - Builder-specific preferences (e.g., `useAutoResetAfterInsertPreference`) live in `src/state/builderPreferences.ts` and continue to follow the same store contract so every preference path shares a single persistence mechanism.

### Build Output (Single File)

- The build produces a single self-contained `index.html` (JS and CSS inlined) via a custom Vite plugin in `vite.config.ts`.
- Minification: uses Terser with aggressive but safe compression (drops `console`/`debugger`, two compress passes, identifier mangling, strips comments) and targets modern runtimes (`es2018`).
- Source maps are disabled and asset size reporting is skipped to keep the artifact lean.
- To adjust minification/target, edit `build` in `vite.config.ts`.

### Type Safety & Linting

- Domain types first: use the exported enums and opaque types (`StatVariant`, `RankCode`, `RarityCode`, `Faction`, etc.) instead of bare `string`/`number`. Only convert to legacy `{ id, flat }` tuples or raw codes at IO boundaries, and keep those conversions documented alongside the boundary helpers.
- Prefer discriminated unions or branded wrappers over ad-hoc flags when widening functionality; this keeps the TypeScript compiler enforcing intent for future refactors.
- TypeScript compiler (see `tsconfig.json`):
  - `strict: true`, `alwaysStrict: true`
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true` (omit optional keys instead of `undefined`)
  - `noImplicitReturns: true`, `noImplicitOverride: true`
  - `noUnusedLocals: true`, `noUnusedParameters: true` (catch unused at compile time; underscore to intentionally ignore)
- ESLint:
  - Plugins: `@typescript-eslint`, `react`, `import`, `react-hooks`, `react-you-might-not-need-an-effect`
  - Key rules: `@typescript-eslint/no-explicit-any: error`, `react/jsx-no-undef: error`, `react/react-in-jsx-scope: off`, `react/prop-types: off`, `react-you-might-not-need-an-effect/*: warn`
  - Scripts: `npm run lint`, `npm run typecheck`
- Dev-time checks: Vite runs a TypeScript-only overlay using `vite-plugin-checker`.
  - Note: ESLint overlay is disabled due to ESLint 9 + flat-config integration issues; run ESLint via `npm run lint`.

Coding patterns adopted during the refactor (required for PRs):
- Conditional spreads for optional fields: only add optional object keys when values are defined (satisfies `exactOptionalPropertyTypes`).
- Index safety: when `noUncheckedIndexedAccess` applies, add bounds checks or use non-null assertions (`!`) only after guarding lengths/indices.
- Unknown inputs: treat pasted/uploaded JSON and DOM/drag/clipboard data as `unknown`; parse via small, focused type guards.
- Style/prop values: avoid passing `undefined` into style props/components. Provide explicit defaults or omit the prop.
- Arrays and reordering: copy arrays before mutation; guard splice/swap indices to avoid `undefined` reads.
- CRC32 table and binary searches: keep tables/arrays typed; add non-null assertions in tight loops when indices are ensured valid.

## Release Packaging (Windows)

- Uses native Windows `Compress-Archive` to create ZIP files with predictable metadata (no PowerShell community modules).
- Build via `npm run build`, export localization catalogs (`npm run export:l10n`), and stage README translations so the ZIP ships with ready-to-edit templates under `i18n/`.
- Stage helper resources under a `dev/` subdirectory when present (`run-sample-server.ps1`, `sample-commands-response.json`, `sample-upload-body.json`).
- Create a flat `release_staging` workspace, rename `dist/index.html` to `SellfileCreator.html`, generate UTF-8 BOM README `.txt` files with a `###### vX.Y.Z` badge, and add a `runme.bat` launcher.
- Archive contents:
  - `SellfileCreator.html` — from `dist/index.html`
  - `README.txt` — converted from `README.md` (UTF-8 BOM; injects the version badge)
  - `README.<lang>.txt` — localized README variants converted to UTF-8 BOM text
  - `i18n/*.l10n.json` — localization templates exported from `dist/l10n`
  - `Example.hsfc` — most recent `Nusi_*.hsfc` from `examples/`
  - `Example.hsf` — most recent `Nusi_*.hsf` from `examples/`
  - `runme.bat` — launches the HTML in the default browser
  - `dev/` — optional helper folder with the sample server script and example protocol payloads when available

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, configs, metasets, Substat Target Values (`substatTargets`), autosave, preview.
- `src/components/HelpDialog.tsx`: In-app Help/README viewer. Bundles the top-level `README.md` (via Vite `?raw`) and renders it with the Markdown previewer used elsewhere (sanitized, read-only). The dialog paper pulls the favicon data URL from the `<link rel="icon">` tag (injected by `assetsPlugin`) to paint a richer but still translucent background that matches the app branding without duplicating the asset; the favicon layer scales to 80% of the dialog while preserving aspect ratio.
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customCfgs`, `metasets`, `substatTargets` (Substat Target Values), `finalSellRemainder`, `selectedCfgIdx`, `hsfcNote`.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
  - Wraps `<App />` in `AppStateProvider`, seeding with `defaultSubstatTargets()` (Substat Target Values) and `defaultMetasets()`.
- `src/lib/constants.ts`: Centralized app-wide constants (storage keys, layout widths, UI sizes).
  - UI helpers include `UI_BG_TRANSITION` (shared background-color transition) and file accept strings `ACCEPT_HSF`/`ACCEPT_HSFC`.
- `src/lib/merge.ts`: Pure function to compute merged rules for preview (`computeMergedRules`).
- `src/lib/hsfTypes.ts`: Shared HSF schema helpers (`variantToMain`, `variantToSub`, rank/rarity coverage, etc.) used across the builder, filters, and evaluator.
- `src/lib/iconMaps/gearsetIconMap.ts`: Manually maintained map of artifact set IDs to icon asset imports. Update when Plarium adds or renames sets; do not rely on build-time regeneration.
- `src/lib/hsfIO.ts`: HSF read/write helpers — parse `.hsf` files, build sanitized HSF payloads from merged rules, and serialize to Blob.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/ruleEval.ts`: Pure evaluator for testing items against HSF rules (first match wins). Used by the Rule Tester dialog.
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderConfig.fixedSubstatsV` (subset of `substatsV`) are always included in generated combinations.
  - Exposes `defaultSubstatTargets()` and `SubstatTargetTable` to configure per-rank Substat Target Values (1★..6★). Internally these tables are StatVariant-keyed (numeric) for speed; HSFC export converts them to label-keyed maps for readability. `SubstatTargetTable.anyRankDefaultsTo` controls which star bucket fills in those values when a config uses Rank = Any (defaults to 6★). HSFC payloads continue to use the `Minima` property name for backward compatibility.
- `src/lib/hsfcIO.ts`: HSFC read/write helpers used by Save/Copy/Paste and context menus (normalize readable HSFC → variant model; build readable HSFC payloads from variant state; serialize to Blob). Exports labels via `labelOfVariant` (no `{ id, isFlat }`).
- `src/lib/icons.ts`: Small utility icon builders (e.g., `makeManageColorsIcon()` for the Manage Colors button).
- `src/lib/filenames.ts`: Export filename helpers (`sellfileFilename`, `hsfcFilename`) with timestamping.
- `src/lib/clipboard.ts`: Clipboard helpers (`writeTextSafe`, `readTextSafe`) and `COPY_DIALOG_EVENT` for opening the manual copy dialog.
- `src/lib/i18n.tsx`: Minimal, strictly typed i18n layer. Exposes `I18nProvider` and `useI18n()` with `{ lang, setLang, t, registerRuntimeCatalog }`.
  - Environment behavior:
    - Dev builds: auto-detect language from `navigator.languages` across supported locales (`en-US`, `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR`).
    - Non-dev builds: default to English (`en-US`) unless a stored preference exists.
  - Persistence: stores the last selected language in `localStorage[LANG_KEY]` unless it equals the environment default (dev: auto-detected; prod: `en-US`).
  - Dev-only audit language: `empty` renders all catalog values as empty strings to surface hardcoded/untagged text.
  - `registerRuntimeCatalog(langCode, catalog)`: Registers a runtime translation catalog and switches to it (non-persistent) for contributor testing.
  - Tutorial strings, builder panel caption, and application toasts are localized via `t(...)` calls. Tutorial keys follow a `tut*` naming scheme.
- `src/hooks/useSubstatColors.ts`: Hook for substat color map defaulting and persistence.
- `src/hooks/useFileDragDrop.ts`: Hook for global file drag/drop listeners; exposes `active` overlay state.
  - Recognized file types: `.hsfc`, `.hsf`, and `.l10n.json/.i18n.json/.l10n` (runtime localization catalogs).
  - L10n JSON schema: either `{ "lang": "xx-XX", "catalog": { ... } }` or a plain key→string map named `xx-XX.l10n.json`/`xx-XX.i18n.json` to infer `lang`.
  - Dropping an l10n file registers it via `registerRuntimeCatalog` and applies it immediately (non-persistent).
  - Help dialog includes a dev-only language select dropdown (Empty/EN/DE/FR/ES/PT-BR/PT-PT/RU/UK/TR) for quick verification. “Empty (dev)” uses blank values for all keys to highlight non-localized text.
- `src/hooks/useTutorialCoachState.ts`: Hook that owns tutorial/help gating, builds the scripted `TutorialStep[]`, maintains snapshot/restore for configs/substatTargets/metasets/final-sell state, and exposes navigation handlers (`startTutorial`, skip/next/prev) plus overlay guards to `App.tsx`.
- `src/hooks/useHsfcClipboard.ts`: Consolidates HSFC copy/paste flows, prepares metaset conflict state, generates placeholder metasets for missing references, and exposes handlers used by `App.tsx` (note merging only runs when the current HSFC note is empty).
- `src/hooks/useHsfcDialogs.ts`: Centralizes App-level dialogs tied to HSFC management (clear/delete confirmations, note view/edit modes, and manual copy/paste fallbacks), keeps the “Delete All” autosave suppression in sync, and exposes dialog setters so other hooks (e.g., `useHsfcClipboard`) reuse the shared UI.

Localization status
- Built-in catalogs: `en-US` (source of truth), `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR`.
- New keys coverage: Tutorial content, builder caption, and toasts translated for DE/FR/ES/PT-BR/PT-PT.
- `src/hooks/useAutosave.ts`: Hook to write autosave payloads and flush on exit/visibility.
- `src/components/CopyDialog.tsx`: Fallback manual copy dialog (shown when clipboard writes are blocked).
- `src/components/PasteDialog.tsx`: Manual paste dialog for HSFC content (single config, array, or full HSFC object).
- `src/components/dialogs/RuleTesterDialog.tsx`: Multi-item test UI to check which rule/config matches first. Items are autosaved to `localStorage` under a dedicated key; disabled rules never match.
- `src/components/dialogs/ManageColorsDialog.tsx`: Substat colors management dialog (variant-keyed map).
- `src/components/dialogs/RestoreAutosaveDialog.tsx`: Restore autosave confirmation dialog.
- `src/components/ConfigChipsPanel.tsx`: Config chips list and context menu.
  - Config chips (visuals):
    - Rank/Rarity/Faction: compact labels; omitted when `Any`. Faction respects the “Factions as icons” toggle (icon replaces the label when enabled).
    - Slots: renders artifact type icons (same as Builder) for quick scanning.
    - Main stats: labels; adopt substat text colors when “Color stat texts” is on.
    - Substats: labels followed by a hollow roll indicator when roll bounds are set per stat:
      - Green ring + number = minimum rolls; Red ring + number = the Roll Upper Limit. The number is white; the ring has no fill.
      - No indicator is shown for “Any/Wildcard” to keep defaults uncluttered.
      - A lock emoji (🔒) appears inline after a substat name when it is locked.
    - Aggregate rolls: shows `Σr ≥ N`. When the aggregate target scope is `locked` (`substatMinTarget === 'locked'`), the chip appends a lock (🔒): `Σr ≥ N 🔒`.
    - Sets: When “Sets as icons” is on, metasets with a non-`none` icon render the assigned glyph inline alongside explicit set icons; otherwise both metasets and sets render as text. `none` always shows the metaset name.
    - Separator dividers (`exportMode === 'separator'`) render as a full-width divider with an optional centered name, hide inline action icons, but remain selectable and expose the context menu for move/delete actions. Builder controls stay active so the config can double as a TODO note. Leading `#` characters tone down the divider (solid → dashed → dotted as the count grows) and `[RRGGBB]` tokens at the start recolor both the line and label (tokens are stripped from the rendered name, default color is the theme primary). The same color token, when used on a non-separator config name, recolors the inline name and context-menu icons.
- `scripts/patch-esm-specifiers.cjs`: Post-compile helper that adds `.js` extensions to relative ESM imports in compiled test artifacts under `scripts/.tmp/src/` so Node can resolve them without a bundler. Runs as part of `npm test`.
- `npm run tests:extract`: Generates `examples/tests.extracted.hsfc` containing all HSFC-readable configs used by tests (useful to load/paste into the app).
- `scripts/release-win.ps1`: Build-and-package script for Windows (runs tests first, builds, stages, archives). Pass `-DevBuild` to keep the current package.json version and suffix outputs with `-dev`.
- `scripts/release-win-dev.ps1`: Thin wrapper that invokes `release-win.ps1 -DevBuild` so both entry points stay in sync.
- `scripts/vite/assetsPlugin.ts`: Injects the favicon data URL during dev and build based on its explicit include list.

## Desktop App (Tauri)

This project includes a Tauri v2 desktop wrapper in `src-tauri` that loads the existing Vite app.

- Prerequisites:
  - Rust (stable toolchain) and a C compiler. On Windows, install Visual Studio Build Tools and ensure the WebView2 Runtime is present.
  - Node.js 20.19+ (for Vite) and `@tauri-apps/cli` (installed by `npm install`).

- Development (opens a desktop window and runs Vite dev server):

```bash
npm install
npm run tauri:dev
```

- Build a release desktop app (creates platform installers):

```bash
npm run tauri:build
```

Notes:
- Tauri config (`src-tauri/tauri.conf.json`) uses `npm run dev` for development and the Vite `dist` output for production builds.
- If you need native capabilities (filesystem, shell, tray, etc.), add Tauri v2 plugins and capabilities later.
