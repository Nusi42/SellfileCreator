# Build and Tooling

This document covers the stack, everyday development workflows, and delivery tooling.

## Stack

- React 18 + TypeScript + Vite
- React Compiler (babel-plugin-react-compiler via @vitejs/plugin-react)
- Material UI v7 (dark theme) + Emotion

## Development

**Prerequisites**
- Node.js 20.19+ (Vite 7 requires ^20.19.0 or >=22.12.0)
- Rust toolchain in each execution environment you use (WSL and native Windows are separate installs): `rustup`, `cargo`, `rustc`, `wasm-bindgen`, and target `wasm32-unknown-unknown`

### Constants Discipline

Numbers that drive layout, sizing, timing, etc. must live in a single shared constant. When the visual tweaks change, update the constant (or add a new centralized constant) instead of applying ad-hoc adjustments like `SIZE + 2` at the call site. Layering “just this one offset” defeats the one-definition rule and makes downstream clean-up harder.

**Scripts**
- `npm install` — install dependencies; auto-installs missing `wasm-bindgen-cli` + `wasm32-unknown-unknown` target (when Rust exists), then fails fast if the local Rust/WASM toolchain for the current platform is still incomplete
- `npm run dev` — run one wasm ensure pass, start Vite, and watch Rust/domain inputs to auto-run wasm ensure on changes
- `npm run dev:vite` — start Vite dev server only (used by `npm run dev` orchestration)
- `npm run build` — production build to `dist`
- `npm run preview` — preview the built app
- `npm run typecheck` — run `tsc --noEmit`
- `npm run wasm:build:rule-engine` — compile `wasm/rule_engine` and regenerate `src/lib/wasm/generated/*` bindings
- `npm run wasm:ensure:rule-engine` — rebuild `src/lib/wasm/generated/*` only when relevant Rust/domain inputs are newer than generated outputs
- `npm run check:wasm-toolchain` — validate `rustc`, `cargo`, `rustup`, `wasm-bindgen`, and installed target `wasm32-unknown-unknown`
- `npm run ensure:wasm-toolchain` — run the same checks plus auto-fix (`cargo install wasm-bindgen-cli --version 0.2.108` and `rustup target add wasm32-unknown-unknown`) when needed
- `npm run test:unit` — compile + run node:test + SFR fixture runner
- `npm run test:e2e` — run Playwright against the Vite dev server in Chromium
- `npm run test:e2e:all` — run Playwright against the Vite dev server in all browsers
- `npm run test:all` — run unit/integration plus Chromium Playwright
- `npm run test:all:full` — run unit/integration plus full Playwright coverage
- `npm run release:win` — Windows: build and create a versioned zip archive in repo root
- `npm run release:win-dev` — Windows: dev build/package; leaves package.json version unchanged and creates a `-dev` suffixed archive
- `npm run release-notes:catchup` — back-fill `docs/HISTORY.txt` for past releases and refresh the entry for the in-progress version (default updates only the newest missing release; pass `-- --all` to replay the entire backlog; Codex writes the notes and no other files change). The script now auto-splits large commit windows into sequential Codex runs so context stays within limits—tune the chunk size with `RELEASE_NOTES_MAX_COMMITS_PER_CHUNK=120 npm run release-notes:catchup` when a different cadence works better for the backlog you are curating.

### Scripts Layout

- Committed (source) scripts live under `scripts/` and are grouped by purpose:
- `scripts/vite/assetsPlugin.ts` — injects the favicon data URL into `index.html` from a fixed allowlist ahead of dev/build runs.
- `scripts/vite/wasmInlinePlugin.ts` — resolves `sql.js/dist/sql-wasm.wasm`, encodes it once as a data URI, and injects a `__SQL_JS_WASM_INLINE__` define so static (`file://`) builds can still load gear DBs without a network fetch.
- `scripts/tooling/build-rule-engine-wasm.mjs` — builds the experimental Rust matcher crate (`wasm/rule_engine`) for `wasm32-unknown-unknown` and regenerates `src/lib/wasm/generated/*` via `wasm-bindgen` (defaults to release profile for optimized perf validation; set `WASM_RULE_ENGINE_PROFILE=dev` for faster local iteration; release builds default `CARGO_PROFILE_RELEASE_STRIP=none` unless explicitly overridden).
- `scripts/tooling/ensure-rule-engine-wasm.mjs` — compares mtimes for relevant wasm sources (`wasm/rule_engine/src/**`, `Cargo.toml`, `Cargo.lock`, shared domain-constant inputs, and the wasm build scripts) against generated outputs and invokes `build-rule-engine-wasm.mjs` only when outputs are missing/stale.
- `scripts/tooling/run-dev-with-wasm-watch.mjs` — dev orchestrator used by `npm run dev`; runs an initial ensure, starts `npm run dev:vite`, and polls Rust/domain source inputs (`wasm/rule_engine/src/**`, `Cargo.toml`, `Cargo.lock`, `shared/domain-constants.json`) to trigger incremental ensure checks during active development.
- `scripts/tooling/check-rust-wasm-toolchain.mjs` — verifies required Rust/WASM binaries and target installation for the current platform; with `--fix`, it auto-installs missing `wasm-bindgen-cli` and wasm target when possible.
- `postinstall` runs `npm run ensure:wasm-toolchain` before Playwright browser installation.
- `dev` now runs an initial `npm run wasm:ensure:rule-engine` pass and then keeps polling Rust/domain inputs so follow-up edits trigger fresh ensure checks while Vite stays running.
- `build`, `typecheck`, and `test:unit` still run `npm run wasm:ensure:rule-engine` first, so non-dev workflows auto-regenerate wasm/bindings as needed.
- `src/lib/wasm/generated/rule_engine_bg.wasm` is intentionally gitignored and should be regenerated locally by the ensure/build scripts instead of committed.
- `scripts/tooling/patch-esm-specifiers.cjs` — patches compiled artifacts to add `.js` extensions for Node ESM.
- `scripts/test/run-tests.mjs` — orchestrates `npm run test:unit` (cleans `tmp/tsc/tests`, runs `tsc -p tsconfig.tests.json`, patches ESM specifiers, executes the SFR fixture runner, then runs all node:test specs emitted under `tmp/tsc/tests/tests/`).
- `scripts/test/dump-tests-sfr.mjs` — extracts SFR‑readable configs from compiled tests (`npm run tests:extract`).
- `scripts/test/dump-goldens-all.mjs` — writes golden snapshots for curated SFR cases.
- `scripts/test/gen-hsf-from-sfr.mjs` — generates HSF from a readable SFR file.
- `scripts/test/build-hsf-from-recipe.mjs` — generates HSF from a single SFR config object (stdin/stdout helper).
- Fixture writers (`dump-tests-sfr.mjs`, `dump-goldens-all.mjs`, `gen-hsf-from-sfr.mjs`, `build-hsf-from-recipe.mjs`) reuse the builder output verbatim so JSON member order mirrors the RSL Helper export.
- Fixture HSFs are kept in sync with the app pipeline: `tests/integration/sfr-fixtures.runner.ts` routes every SFR through `parseSfrObject` and `computeMergedRules` so metaset expansion and obsolete-rule pruning match the UI/export behavior, then compares the full rule payloads exactly as emitted (no key reordering, no field trimming).
- Fixture organization and refresh workflow lives in `tests/FIXTURES.md` for quick reference when adding scenarios or re-generating targets.
  - `scripts/tooling/audit-l10n-widths.ts` — estimates per-locale string width/line growth to flag UI elements that need fixed sizing.
  - (one-off/migration helpers are not kept here; see below)
  - `scripts/tooling/export-catalogs.ts` — builds localized catalogs into `dist/l10n/*.l10n.json` (`npm run export:l10n`).
- `scripts/release/release-win.ps1` — Windows packaging script (`-DevBuild` opt-in for dev bundles). `scripts/release/release-win-dev.ps1` forwards to it.
- `scripts/watchers/run-db-watcher.ps1` — JSON-RPC 2.0 WebSocket db watcher. Launches the UI with a `ws://` endpoint, accepts `uploadSellfile` requests, emits `selectRule` + gear DB events, and watches `%APPDATA%\RslHelper\Config` for `.db` updates by default (disable via `-WatchGearDb:false` or override with `-GearDbPath`). Requires PowerShell 7 (`pwsh`) and will re-launch under `pwsh` if needed. Uses `[R]` to queue a sample selectRule and `[F]` to force a DB snapshot.
- `scripts/watchers/run-db-watcher-helper.ps1` — lightweight WebSocket db watcher (the `type/cmd/evt` protocol). Same behavior as `run-db-watcher.ps1`, but uses the compact envelope expected by RSL Helper integrations.
- `scripts/watchers/run-db-watcher-core.ps1` — shared implementation for the two WebSocket db watchers above; keep common behavior here so the two wrappers stay in sync.
- `scripts/watchers/Stream-Helper-DB-to-Creator.bat` — double-click helper that requires PowerShell 7 (`pwsh`), prompts to open the official download page when `pwsh` is missing, and passes a fixed `-AppEntryPath` plus `-GearDbPath "%APPDATA%\RslHelper\Config"` into `run-db-watcher-helper.ps1`. In-repo source points to `..\dist\index.html` for local development; release packaging rewrites that line to `..\SellfileCreator.html` before staging the `dev/` copy, so shipped bundles contain no runtime dev-vs-prod path branching.
- `scripts/watchers/cpp-example/` — standalone C++ watcher sample that mirrors the core PowerShell flow (accepts `uploadSellfile`, reads the Helper sqlite DB, converts it to `artifactLogSnapshot`, and supports helper/JSON-RPC modes). Build/run steps live in `scripts/watchers/cpp-example/README.md`.

- Transient/compiled helpers live under `tmp/tsc/**` and are ignored by git (see `.gitignore`). Example:
  - `tmp/tsc/scripts/scripts/tooling/export-catalogs.js` — compiled output of `scripts/tooling/export-catalogs.ts` used by `npm run export:l10n`.
- `tmp/tsc/tests/tests/**`, `tmp/tsc/tests/src/**` — TypeScript‑compiled test/lib artifacts used by `npm run test:unit` and tooling.

- Convention for non‑committed utility scripts: place them under `tmp/tsc/scripts/scripts/` and call them from npm scripts if needed. Do not check these into git; they are treated as build/test artifacts, and any ad-hoc helpers should be generated temporarily and cleaned up after use (no long-lived utilities live here).
- WASM rule engine is mandatory in this branch; worker-side generation and matcher paths always run through `src/lib/wasm/wasmRuleEngine.ts`.
  - Worker matcher evaluation runs through WASM when enabled.
  - Worker warm/build generation now routes generated branch-rule finalization (epic/legendary collapse, obsolete pruning, stable ordering) through WASM and fails closed if the WASM module is unavailable.
  - Cache reuse remains enabled in worker matcher paths; profile with representative fixtures (`npm run measure:rule-tester`) instead of cache-disable runtime flags.

### Validation Before Handoff

- For code changes (anything beyond docs and `constants.ts`), run `npm run typecheck`, `npm run lint`, and `npm run build` and fix any issues.
- Always run tests when changes may influence SFR/HSF IO or HSF rule generation logic: `npm test`.
  - Includes edits to: SFR normalize/parse/write, HSF parse/write, and any HSF rule generation behavior (e.g., permutations/minCount, thresholds Early/Late, rarity/roll schedules, level windows, wildcard and caps handling, pruning/feasibility filters).
  - These end-to-end tests validate readable SFR → normalize → builder → HSF output and catch regressions in thresholds, rarity/rank schedules, and rule shapes.
  - If a test needs to be updated due to an intentional behavior change, adjust the test alongside the implementation so they remain in sync.
- End-to-end coverage lives under `tests/playwright/` (Playwright). Use `npx playwright test tests/playwright/smoke.spec.ts --project=chromium --reporter=list` as a smoke check before running heavier specs.
  - The dev server binds `127.0.0.1:5182`; when the Codex sandbox reports `EPERM`, rerun the Playwright command with `with_escalated_permissions: true` so Vite can listen on that port.
  - All specs import `test`/`expect` from `tests/playwright/fixtures.ts`; that fixture streams browser console output and page errors to the CLI so debugging works even without an interactive browser.
- Remove temporary debugging, scaffolding, or exploratory code once a change is validated so the repository only reflects the final implementation.
- Production bundles must stay silent: wrap `console.*` calls in `if (import.meta.env.DEV)` or remove them so release builds never write to the browser console.

### Runtime Launch Parameters

- `SellfileCreator.html` (and the dev build at `dist/index.html`) reads the launch URL’s `endpoint` query parameter and exposes it via `window.__APP_CONFIG__`. Passing `?endpoint=ws://localhost:8765/` sets the WebSocket `pushEndpoint` for the entire session. The `#endpoint=` hash alias also works as long as it points to a `ws://` or `wss://` URL.
- When `pushEndpoint` is defined, “Export Sellfile” sends an `uploadSellfile` request over the active WebSocket. Without the parameter, the browser still downloads the file locally. The export button label switches to “Push …” and its tooltip references the active endpoint so users can confirm the target.
- Incoming events are delivered over WebSocket notifications: `selectRule`, `gearDbFile`, `gearDbRawSnapshot`, and `gearDbRawDelta` (see the WebSocket protocol docs for exact payload shapes).
- `scripts/watchers/run-db-watcher.ps1` and `scripts/watchers/run-db-watcher-helper.ps1` demonstrate how an external tool can open the packaged app via `Start-Process`, append the encoded WebSocket endpoint automatically, and host a local WebSocket listener that persists incoming `uploadSellfile` payloads to disk (defaults to `exported-sellfile.hsf`, configurable via `-OutputPath`). The scripts target PowerShell 7 (`pwsh`), emit demo `selectRule` events via `[R]`, provide `[F]` to force a DB snapshot, and optionally watch `%APPDATA%\RslHelper\Config` for `.db` changes so the Rule Tester refreshes without manual drag-and-drop.

### Single Source of Truth

- No duplication of logic or data. Centralize and import instead of re-encoding knowledge in multiple files.
- Domain catalogs, enums, and formatting live in `src/lib/types.ts` (artifact sets/types, rarity/rank/faction, `StatVariant`, and slot constraints). Consumers must use these exports and not redefine them.
- Cross-language constants (used by both TS and Rust) must be added to `shared/domain-constants.json` and generated via `scripts/tooling/generate-domain-constants.mjs`; never duplicate those values directly in `src/**` and `wasm/rule_engine/src/**`, and never hand-edit generated constant files.
- HSF schema and stat converters live in `src/lib/hsfTypes.ts`. App code should use `StatVariant` and helpers rather than rolling custom `{ id, flat }` handling.
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
- `sql.js` bundles its own Node fallbacks; `vite.config.ts` aliases `fs`, `path`, and `crypto` to small shims under `scripts/vite/shims/` so Rollup stops warning about those built-ins during browser builds. Keep the shims in sync if the dependency ever grows additional Node-only requires.
- To adjust minification/target, edit `build` in `vite.config.ts`.

### Type Safety & Linting

- Domain types first: use the exported enums and opaque types (`StatVariant`, `RankCode`, `RarityCode`, `Faction`, etc.) instead of bare `string`/`number`. Only convert to legacy `{ id, flat }` payloads or raw codes at IO boundaries, and keep those conversions documented alongside the boundary helpers.
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
- Stage helper resources under a `dev/` subdirectory when present (`scripts/watchers/run-db-watcher.ps1`, `scripts/watchers/run-db-watcher-helper.ps1`, `scripts/watchers/run-db-watcher-core.ps1`, `scripts/watchers/Stream-Helper-DB-to-Creator.bat`, `websocket-jsonrpc.md`, `websocket-helper.md`).
- Create a flat `release_staging` workspace, rename `dist/index.html` to `SellfileCreator.html`, generate UTF-8 BOM README `.txt` files with a `###### vX.Y.Z` badge, and add a `runme.bat` launcher.
- Archive contents:
  - `SellfileCreator.html` — from `dist/index.html`
  - `README.txt` — converted from `README.md` (UTF-8 BOM; injects the version badge)
  - `README.<lang>.txt` — localized README variants converted to UTF-8 BOM text
  - `HISTORY.txt` — copied from `docs/HISTORY.txt` so the release bundle ships with the full changelog
  - `i18n/*.l10n.json` — localization templates exported from `dist/l10n`
  - `Sellfiles/_RECIPE_FOR_LATEGAME_AND_ENDGAME_.sfr` — prefers the most recent `Nusi_*.sfr` in `examples/`; falls back to `example.sfr` (legacy `example.sfr`) if no timestamped sample is present
  - `Sellfiles/lategame-sellfile.hsf` — copied from `examples/lategame.hsf` (legacy `Lategame.hsf` fallback) so the archive always ships the curated lategame baseline
  - `Sellfiles/endgame-sellfile.hsf` — copied from `examples/endgame.hsf` (legacy `Endgame.hsf` fallback) so the archive also ships the curated endgame baseline
  - `Sellfiles/basic.sfr` — copied from `examples/Basic.sfr` (legacy `Basic.sfr` fallback) as the minimal starter recipe
  - `runme.bat` — launches the HTML in the default browser
  - `dev/` — optional helper folder with the WebSocket watcher scripts and protocol docs when available

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, configs, metasets, Substat Target Values (`substatTargets`), autosave, preview.
- `src/components/HelpDialog.tsx`: In-app Help/README viewer. Bundles the top-level `README.md` (via Vite `?raw`) and renders it with the Markdown previewer used elsewhere (sanitized, read-only). The dialog paper pulls the favicon data URL from the `<link rel="icon">` tag (injected by `assetsPlugin`) to paint a richer but still translucent background that matches the app branding without duplicating the asset; the favicon layer scales to 80% of the dialog while preserving aspect ratio.
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customRecipes`, `metasets`, `substatTargets` (Substat Target Values), `finalSellRemainder`, `logicHubDialogTab`, `keepUniqueRules`, `safeguardsEnabled`, `selectedRecipeIdx`, `sfrNote`.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
  - Wraps `<App />` in `AppStateProvider`, seeding with `defaultSubstatTargets()` (Substat Target Values) and `defaultMetasets()`.
- `src/lib/constants.ts`: Centralized app-wide constants (storage keys, layout widths, UI sizes).
  - UI helpers include `UI_BG_TRANSITION` (shared background-color transition) and file accept strings `ACCEPT_HSF`/`ACCEPT_SFR` plus the dialog-specific filters `ACCEPT_SFR_FILE_DIALOG` and `ACCEPT_HSF_OR_DB_FILE_DIALOG`.
- `src/lib/merge.ts`: Pure function to compute merged rules for preview (`computeMergedRules`).
- `src/lib/hsfTypes.ts`: Shared HSF schema helpers (`variantToMain`, `variantToSub`, rank/rarity coverage, etc.) used across the builder, filters, and evaluator.
- `src/lib/iconMaps/gearsetIconMap.ts`: Manually maintained map of artifact set IDs to icon asset imports. Update when Plarium adds or renames sets; do not rely on build-time regeneration.
- `src/lib/hsfIO.ts`: HSF read/write helpers — parse `.hsf` files, build sanitized HSF payloads from merged rules, and serialize to Blob.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/ruleEval.ts`: Pure evaluator for testing items against HSF rules (first match wins). Used by the Gear tab inside Logic Hub.
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderRecipe.fixedSubstatsV` (subset of `substatsV`) are always included in generated combinations.
  - Exposes `defaultSubstatTargets()` and `SubstatTargetTable` to configure per-rank Substat Target Values (1★..6★). Internally these tables are StatVariant-keyed (numeric) for speed; SFR export converts them to label-keyed maps for readability. `SubstatTargetTable.anyRankDefaultsTo` controls which star bucket fills in those values when a config uses Rank = Any (defaults to 6★). SFR payloads continue to use the `Minima` property name for backward compatibility.
- `src/lib/sfrIO.ts`: SFR read/write helpers used by Save/Copy/Paste and context menus (normalize readable SFR → variant model; build readable SFR payloads from variant state; serialize to Blob). Exports labels via `labelOfVariant` (no `{ id, isFlat }`).
- `src/lib/icons.ts`: Small utility icon builders (e.g., `makeManageColorsIcon()` for the Manage Colors button).
- `src/lib/filenames.ts`: Export filename helpers (`sellfileFilename`, `sfrFilename`) with timestamping.
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
  - Recognized file types: `.sfr` (legacy `.sfr`), `.hsf`, and `.l10n.json/.i18n.json/.l10n` (runtime localization catalogs).
  - L10n JSON schema: either `{ "lang": "xx-XX", "catalog": { ... } }` or a plain key→string map named `xx-XX.l10n.json`/`xx-XX.i18n.json` to infer `lang`.
  - Dropping an l10n file registers it via `registerRuntimeCatalog` and applies it immediately (non-persistent).
  - Help dialog includes a dev-only language select dropdown (Empty/EN/DE/FR/ES/PT-BR/PT-PT/RU/UK/TR) for quick verification. “Empty (dev)” uses blank values for all keys to highlight non-localized text.
- `src/hooks/useTutorialCoachState.ts`: Hook that owns tutorial/help gating, builds the scripted `TutorialStep[]`, maintains snapshot/restore for configs/substatTargets/metasets/final-sell state, and exposes navigation handlers (`startTutorial`, skip/next/prev) plus overlay guards to `App.tsx`.
- `src/hooks/useSfrClipboard.ts`: Consolidates SFR copy/paste flows, prepares metaset conflict state, generates placeholder metasets for missing references, and exposes handlers used by `App.tsx` (note merging only runs when the current SFR note is empty).
- `src/hooks/useSfrDialogs.ts`: Centralizes App-level dialogs tied to SFR management (clear/delete confirmations, note view/edit modes, and manual copy/paste fallbacks), keeps the “Delete All” autosave suppression in sync, and exposes dialog setters so other hooks (e.g., `useSfrClipboard`) reuse the shared UI.

Localization status
- Built-in catalogs: `en-US` (source of truth), `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR`.
- New keys coverage: Tutorial content, builder caption, and toasts translated for DE/FR/ES/PT-BR/PT-PT.
- `src/hooks/useAutosave.ts`: Hook to write autosave payloads and flush on exit/visibility.
- `src/components/CopyDialog.tsx`: Fallback manual copy dialog (shown when clipboard writes are blocked).
- `src/components/PasteDialog.tsx`: Manual paste dialog for SFR content (single config, array, or full SFR object).
- `src/components/dialogs/GearTesterTabContent.tsx`: Multi-item test UI (rendered inside Logic Hub’s Gear tab) to check which rule/config matches first. Items are autosaved to `localStorage` under a dedicated key; disabled rules never match.
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
    - Aggregate rolls: shows `Σr ≥ N` whenever a manual Global Min Required Rolls value is set. If a locked-only floor (`lockedMinRequiredRolls`) is active, the chip appends a separate `Σr ≥ L 🔒` badge (suppressed when both numbers match).
    - Sets: When “Sets as icons” is on, metasets with a non-`none` icon render the assigned glyph inline alongside explicit set icons; otherwise both metasets and sets render as text. `none` always shows the metaset name.
    - Separator dividers (`exportMode === 'separator'`) render as a full-width divider with an optional centered name, hide inline action icons, but remain selectable and expose the context menu for move/delete actions. Builder controls stay active so the config can double as a TODO note. Leading `#` characters tone down the divider (solid → dashed → dotted as the count grows) and `[RRGGBB]` tokens at the start recolor both the line and label (tokens are stripped from the rendered name, default color is the theme primary). The same color token, when used on a non-separator config name, recolors the inline name and context-menu icons.
- `scripts/tooling/patch-esm-specifiers.cjs`: Post-compile helper that adds `.js` extensions to relative ESM imports in compiled artifacts under `tmp/tsc/tests/src/` so Node can resolve them without a bundler. Runs as part of `npm run test:unit`.
- `npm run tests:extract`: Generates `examples/tests.extracted.sfr` containing all SFR-readable configs used by tests (useful to load/paste into the app).
- `scripts/release/release-win.ps1`: Build-and-package script for Windows (runs tests first, builds, stages, archives). Pass `-DevBuild` to keep the current package.json version and suffix outputs with `-dev`.
- `scripts/release/release-win-dev.ps1`: Thin wrapper that invokes `release-win.ps1 -DevBuild` so both entry points stay in sync.
- `scripts/vite/assetsPlugin.ts`: Injects the favicon data URL during dev and build based on its explicit include list.

### Icon Assets Catalogs

- Runtime-ready icons live under `ico/`, broken into purpose-specific catalogs so the bundle only touches what each surface needs:
  - `ico/slots/` — slot glyph SVGs (`Weapon.svg`, `Helm.svg`, `Schild.svg`, etc.) rendered via `artifactTypeIcons.tsx`.
  - `ico/sets/` — the `.webp` glyphs for every artifact set plus the nested `ico/sets/slots/` directory that holds per-set/per-slot artwork. Artifact pieces follow `<setId>_<Slot>.webp` (slot is `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, or `Boots`) so numeric IDs stay aligned with the in-game order; accessory/faction pieces retain `SetName_Slot.webp` (spaces become underscores).
  - `ico/faction/` — faction crests keyed by their slugified faction names (`banner-lords.webp`, `shadowkin.webp`, etc.).
- The raw, lossless references sit in `docs/orig/ico-sets/ico-slots/` as `.png` exports following the same per-slot naming conventions. Update the PNG first, review it in-source, and then convert it to `.webp` when copying into `ico/sets/slots/` so the shipped bundle stays lean. (ImageMagick `magick <input.png> -quality 95 <output.webp>` or `cwebp` both keep the alpha channel intact; pick whichever tool you already use.)
- When Plarium adds a new set, drop the source PNGs into `docs/orig/ico-sets/ico-slots/`, regenerate the corresponding `.webp` files under `ico/sets/slots/`, and wire the IDs through whatever UI consumes them. Keeping the twin directories in sync guarantees that artists and devs share one authoritative catalog.

## Release Notes Workflow

Release history lives in `docs/HISTORY.txt` (UTF-8 with BOM). The automation scripts delegate the heavy lifting to Codex using the shared prompt in `docs/CREATE-RELEASE-NOTES.md`. Only the history file should change after each run—no plan files, commits, or artefact directories are touched.

1. **Sync history** — `npm run release-notes:catchup`  
   On first run (or when invoked with `npm run release-notes:catchup -- --all`) it back-fills every missing `vX.Y.Z` release by replaying the commit ranges. Subsequent runs without flags update only the newest missing release entry plus the in-progress version derived from `package.json`, so you can refresh notes after each feature lands without rehashing the entire backlog. The script automatically slices very long commit windows into sequential Codex runs—watch the chunk index printed in the prompt and continue writing within `docs/HISTORY.txt` between slices. Override the heading date by exporting `RELEASE_NOTES_DATE=yyyy-mm-dd` when you already know the intended ship date; adjust the chunk size with `RELEASE_NOTES_MAX_COMMITS_PER_CHUNK=120` (or another value) when you need finer or coarser passes.
2. **Gate the release** — Before packaging, confirm `docs/HISTORY.txt` already includes the upcoming `vX.Y.Z` entry. `npm run release-notes:catchup` keeps the file in sync; review the generated diff (or open the file directly) ahead of `npm run release:win` so the notes ship with the build.

The Codex agent must inspect diffs, not just commit messages. Large asset updates under `examples/` may be skipped unless they change player-facing behaviour. The final notes list the English bullets first, then German translations covering the same points.

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
