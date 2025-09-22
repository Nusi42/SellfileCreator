# Technical Details

This document is for developers and contributors. For user-facing instructions, see the top-level README.

## Stack

- React 18 + TypeScript + Vite
- Material UI v7 (dark theme) + Emotion

## Development

Prerequisites
- Node.js 18+

Scripts
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist`
- `npm run preview` — preview the built app
- `npm run typecheck` — run `tsc --noEmit`
- `npm run release:win` — Windows: build and create a versioned zip archive in repo root
- `npm run release:win-dev` — Windows: dev build/package; leaves package.json version unchanged and creates a `-dev` suffixed archive

### Scripts Layout

- Committed (source) scripts live under `scripts/` and should be checked in:
  - `build-icon-data.mjs` — builds static icon data used by the app.
  - `patch-esm-specifiers.cjs` — patches compiled test artifacts to add `.js` extensions for Node ESM.
  - `dump-tests-hsfc.mjs` — extracts HSFC‑readable configs from compiled tests (`npm run tests:extract`).
  - `dump-goldens-all.mjs` — writes golden snapshots for curated HSFC cases.
  - `gen-hsf-from-hsfc.mjs` — generates HSF from a readable HSFC file.
  - `build-hsf-from-config.mjs` — generates HSF from a single HSFC config object (stdin/stdout helper).
  - `audit-l10n-widths.ts` — estimates per-locale string width/line growth to flag UI elements that need fixed sizing.
  - (one-off/migration helpers are not kept here; see below)
  - `export-catalogs.ts` — builds localized catalogs into `dist/l10n/*.l10n.json` (`npm run export:l10n`).
  - `release-win.ps1`, `release-win-dev.ps1` — Windows packaging scripts.

- Transient/compiled helpers live under `scripts/.tmp/**` and are ignored by git (see `.gitignore`). Example:
  - `scripts/.tmp/scripts/export-catalogs.js` — compiled output of `scripts/export-catalogs.ts` used by `npm run export:l10n`.
  - `scripts/.tmp/tests/**`, `scripts/.tmp/src/**` — TypeScript‑compiled test/lib artifacts used by `test:hsfc` and tooling.

- Convention for non‑committed utility scripts: place them under `scripts/.tmp/scripts/` and call them from npm scripts if needed. Do not check these into git; they are treated as build/test artifacts. Current examples:
  - `scripts/.tmp/scripts/build-from-hsfc.mjs` — summarizes HSF rules from HSFC for debugging.
  - `scripts/.tmp/scripts/check-i18n-english-consistency.cjs` — one‑off i18n migration verifier.
  - `scripts/.tmp/scripts/check-diff-strings-to-catalog.cjs` — one‑off i18n diff checker.

Checks before handoff
- For code changes (anything beyond docs), run `npm run typecheck`, `npm run lint`, and `npm run build` and fix any issues.
- Always run tests when changes may influence HSFC/HSF IO or HSF rule generation logic: `npm run test:hsfc`.
  - Includes edits to: HSFC normalize/parse/write, HSF parse/write, and any HSF rule generation behavior (e.g., permutations/minCount, thresholds Early/Late, rarity/roll schedules, level windows, wildcard and caps handling, pruning/feasibility filters).
  - These end‑to‑end tests validate readable HSFC → normalize → builder → HSF output and catch regressions in thresholds, rarity/rank schedules, and rule shapes.
  - If a test needs to be updated due to an intentional behavior change, adjust the test alongside the implementation so they remain in sync.

### Single Source of Truth

- No duplication of logic or data. Centralize and import instead of re‑encoding knowledge in multiple files.
- Domain catalogs, enums, and formatting live in `src/lib/types.ts` (artifact sets/types, rarity/rank/faction, `StatVariant`, and slot constraints). Consumers must use these exports and not redefine them.
- HSF schema and tuple converters live in `src/lib/hsfTypes.ts`. App code should use `StatVariant` and helpers rather than rolling custom `{ id, flat }` handling.
- UI/app constants (storage keys, sizes, timing, tooltip keywords) live in `src/lib/constants.ts`.
- When a value must be used in multiple places, extract a constant or enum once and reference it (avoid copy/paste).

### Build Output (Single File)

- The build produces a single self‑contained `index.html` (JS and CSS inlined) via a custom Vite plugin in `vite.config.ts`.
- Minification: uses Terser with aggressive but safe compression (drops `console`/`debugger`, two compress passes, identifier mangling, strips comments) and targets modern runtimes (`es2018`).
- Source maps are disabled and asset size reporting is skipped to keep the artifact lean.
- To adjust minification/target, edit `build` in `vite.config.ts`.

### Type Safety & Linting

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
- Index safety: when `noUncheckedIndexedAccess` applies, add bounds checks or use non‑null assertions (`!`) only after guarding lengths/indices.
- Unknown inputs: treat pasted/uploaded JSON and DOM/drag/clipboard data as `unknown`; parse via small, focused type guards.
- Style/prop values: avoid passing `undefined` into style props/components. Provide explicit defaults or omit the prop.
- Arrays and reordering: copy arrays before mutation; guard splice/swap indices to avoid `undefined` reads.
- CRC32 table and binary searches: keep tables/arrays typed; add non‑null assertions in tight loops when indices are ensured valid.

### Slot Constraints

- Source of truth: `src/lib/types.ts` exports slot constraints as `ALLOWED_MAIN_BY_SLOT` and `ALLOWED_SUB_BY_SLOT` using `StatVariant` constants (no inline bit‑math).
- Helpers: `slotSupportsMain`, `slotSupportsSub`, `anySelectedSlotSupportsMain`, `anySelectedSlotSupportsAllSubstats` centralize feasibility checks.
- Builder integration: `hsfBuilder.ts` uses these helpers to:
  - Skip emitting rules with mains that cannot exist on the selected slots.
  - Prune substat combinations that no selected slot can satisfy (only when `artifactTypeNames` is filtered).
- Rationale: Keeps domain facts in one place and avoids generating impossible rules when slots are restricted.

HSF/HSFC specifics tightened for safety:
- Builder outputs (HSF):
  - Always include `Rank`, `Rarity`, and `Faction` (0 = Any).
  - Always include `ArtifactSet` and `ArtifactType` (emit `[]` when unfiltered).
  - Emits rules only for milestone levels within an explicit window `[minLevel..maxLevel]` (inclusive). Levels are 0/4/8/12/16.
  - Levels where the selected `minCount` substats cannot physically exist for the item’s rarity (e.g., Epic has only 3 substats before +16) are skipped.
  - `Substats` always contains 4 entries (selected + padded).
- HSFC normalize: `normalizeConfig(input: unknown)` builds a `BuilderConfig` by assembling a base object and conditionally adding optional fields; never assigns `undefined` to optional keys. New readable fields `minLevel` and `maxLevel` are preferred; legacy `rollMode`/`rollBaseline`/`startLevel` are still parsed for backward compatibility.
- Aggregate min target: Optional `minRollsTarget: 'Selected'|'Locked'` in HSFC scopes `minRequiredRolls` to either all selected substats (`Selected`, default) or only locked ones (`Locked`). When `Locked` with `minRequiredRolls > 0` and no locked substats, generation is infeasible and emits no rules.

### Preview Filters (RulesFilterPanel)

- View-only; export is not affected. State lives in `src/lib/rulesFilter.ts`.
- AnyMode chips: `Include` keeps rules that don't specify a field, `Hide` removes them, `Only` shows only those rules.
- Sets
  - Metasets unroll into explicit set IDs before matching.
  - Match mode `Any`/`All` combines selected sets.
  - Final‑sell remainder rows (marked internally) are excluded when any set is selected so results aren’t dominated by “All Currently Known”.
  - The Sets selector reuses `SetMenuSection` (icons/list) with metaset hover highlights and anchored placement consistent with the Builder.
- Rank & Rarity (compact)
  - Side by side on sm+: Rank adapts to content width; Rarity takes remaining space.
  - Condensed controls only (no More/Less): Rank buttons `1★-3★`, `4★`, `5★`, `6★`; Rarity buttons `U/C`, `Rare`, `Epic`, `Legendary`, `Mythical`.
  - Group buttons have explicit click handlers to toggle their member values reliably in multi‑select.
- Faction
  - Placed to the right of `Level` in a two‑column row (sm+); grouped menu like the Builder. Input width is fixed to avoid layout shift.
- Spacing
  - Chip top margin is centralized: `FILTER_CHIP_TOP_MARGIN` in `src/lib/constants.ts`.
- Empty state
  - When filters hide all rows but rules exist, the table shows: “No RSL Helper Sellfile rules due to the filter.” (prop `emptyDueToFilter`).

### Tuple Decoders (HSF → StatVariant)

- `mainToVariant` and `subToVariant` in `src/lib/types.ts` accept either boolean or 0/1 flags for flat/percent and normalize internally. This fixes flat mainstat filtering for inputs that use boolean flags.

Builder UI
- Min required rolls target: The label for "Min required rolls" is a small toggle. It switches the aggregate min target between Selected and Locked. The control disables switching to Locked when there are no locked substats.
- Reset to defaults:
  - Left‑click: resets to user defaults when present; otherwise to factory defaults.
  - Right‑click: opens a menu with Save current as user defaults, Reset to factory defaults, and a checkbox "Auto reset after Insert".
  - User defaults are stored under `sellfileCreator.builder.userDefaults.v1`.
  - Auto reset after Insert: when enabled (default Off), the builder resets to defaults immediately after inserting a config (no confirmation dialog). State persists under `sellfileCreator.builder.autoResetAfterInsert.v1`.

Production‑only restrictions
- Native context menu and text selection are disabled globally in production builds to reduce accidental edits and copy noise. App context menus continue to work (native menu is prevented, propagation allowed).
- Allowed surfaces: Inputs, textareas, contenteditable nodes, and any element marked with `data-allow-select` / `data-allow-context`.
- Dev builds are unaffected; full selection and native context menu are available for debugging.


Note on opening via file://
- If contributors open `index.html` directly from the filesystem (file://), expect limited or non‑persistent storage in many browsers. LocalStorage writes used by autosave, color preferences, and table settings may not persist. Prefer `npm run dev` or `npm run preview` to serve over http for reliable persistence.

## Release Packaging (Windows)

- Uses native Windows `Compress-Archive` to create ZIP files (no external tools required).
- Run `npm run release:win` to produce `SellfileCreator_vX.Y.Z.zip`.
- Run `npm run release:win-dev` to produce a dev archive. It does not modify `package.json` and always adds `-dev` to the filename, e.g., `SellfileCreator_vX.Y.Z-dev.zip`.
  - The script runs tests first (`npm run test:hsfc`). If tests fail, it restores the original `package.json` and aborts — no archive is produced.
  - The script first "cleans" the version in `package.json` by stripping any `-dev` (or other pre-release) suffix, uses that for the build/archive, then bumps the patch and writes back `-dev` (e.g., `1.2.3-dev` → build `1.2.3`, archive `SellfileCreator_v1.2.3.zip`, then set `1.2.4-dev`).
  - Safety: If the build or archive step fails, the script restores the original `package.json` (including its version), and no archive is produced.
  - Additionally, copies the built `dist/index.html` to `old_releases/SellfileCreator_vX.Y.Z.html` for quick reference.
  - Dev variant (`release:win-dev`) copies to `old_releases/SellfileCreator_vX.Y.Z-dev.html`.
- Archive contents (no subdirectories):
  - `SellfileCreator.html` — from `dist/index.html` (renamed)
  - `README.txt` — from `README.md`
  - `Example.hsfc` — most recent `Nusi_*.hsfc` from `samples/`
  - `Example.hsf` — most recent `Nusi_*.hsf` from `samples/`
  - `runme.bat` — starts default browser with `SellfileCreator.html`

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, configs, metasets, minima, autosave, preview.
- `src/components/HelpDialog.tsx`: In‑app Help/README viewer. Bundles the top‑level `README.md` (via Vite `?raw`) and renders it with the Markdown previewer used elsewhere (sanitized, read‑only).
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customCfgs`, `metasets`, `minima`, `finalSellRemainder`, `selectedCfgIdx`, `hsfcNote`.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
  - Wraps `<App />` in `AppStateProvider`, seeding with `defaultMinima()` and `defaultMetasets()`.
- `src/lib/constants.ts`: Centralized app‑wide constants (storage keys, layout widths, UI sizes).
  - UI helpers include `UI_BG_TRANSITION` (shared background‑color transition) and file accept strings `ACCEPT_HSF`/`ACCEPT_HSFC`.
- `src/lib/merge.ts`: Pure function to compute merged rules for preview (`computeMergedRules`).
- `src/lib/codeCoverage.ts`: Shared helpers mapping rank/rarity codes (0..16) to discrete sets used by filters and evaluators.
- `src/lib/hsfIO.ts`: HSF read/write helpers — parse `.hsf` files, build sanitized HSF payloads from merged rules, and serialize to Blob.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/ruleEval.ts`: Pure evaluator for testing items against HSF rules (first match wins). Used by the Rule Tester dialog.
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderConfig.fixedSubstatsV` (subset of `substatsV`) are always included in generated combinations.
  - Exposes `defaultMinima()` and `MinimaTable` to configure per‑rank substat minima (1★..6★). Internally these tables are StatVariant‑keyed (numeric) for speed; HSFC export converts them to label‑keyed maps for readability.
- `src/lib/hsfcIO.ts`: HSFC read/write helpers used by Save/Copy/Paste and context menus (normalize readable HSFC → variant model; build readable HSFC payloads from variant state; serialize to Blob). Exports labels via `labelOfVariant` (no `{ id, isFlat }`).
- `src/lib/icons.ts`: Small utility icon builders (e.g., `makeManageColorsIcon()` for the Manage Colors button).
- `src/lib/filenames.ts`: Export filename helpers (`sellfileFilename`, `hsfcFilename`) with timestamping.
- `src/lib/clipboard.ts`: Clipboard helpers (`writeTextSafe`, `readTextSafe`) and `COPY_DIALOG_EVENT` for opening the manual copy dialog.
- `src/lib/i18n.tsx`: Minimal, strictly typed i18n layer. Exposes `I18nProvider` and `useI18n()` with `{ lang, setLang, t, registerRuntimeCatalog }`.
  - Environment behavior:
    - Dev builds: auto‑detect language from `navigator.languages` across supported locales (`en-US`, `de-DE`, `fr-FR`, `es-ES`, `pt-PT`; scaffolds mirror English for `ru-RU`, `uk-UA`, `tr-TR`).
    - Non‑dev builds: default to English (`en-US`) unless a stored preference exists.
  - Persistence: stores the last selected language in `localStorage[LANG_KEY]` unless it equals the environment default (dev: auto‑detected; prod: `en-US`).
  - Dev‑only audit language: `empty` renders all catalog values as empty strings to surface hardcoded/untagged text.
  - `registerRuntimeCatalog(langCode, catalog)`: Registers a runtime translation catalog and switches to it (non‑persistent) for contributor testing.
  - Tutorial strings, builder panel caption, and application toasts are localized via `t(...)` calls. Tutorial keys follow a `tut*` naming scheme.
- `src/hooks/useSubstatColors.ts`: Hook for substat color map defaulting and persistence.
- `src/hooks/useFileDragDrop.ts`: Hook for global file drag/drop listeners; exposes `active` overlay state.
  - Recognized file types: `.hsfc`, `.hsf`, and `.l10n.json/.i18n.json/.l10n` (runtime localization catalogs).
  - L10n JSON schema: either `{ "lang": "xx-XX", "catalog": { ... } }` or a plain key→string map named `xx-XX.l10n.json`/`xx-XX.i18n.json` to infer `lang`.
  - Dropping an l10n file registers it via `registerRuntimeCatalog` and applies it immediately (non‑persistent).
  - Help dialog includes a dev‑only language select dropdown (Empty/EN/DE/FR/ES/PT/RU/UK/TR) for quick verification. “Empty (dev)” uses blank values for all keys to highlight non‑localized text.

Localization status
- Built‑in catalogs: `en-US` (source of truth), `de-DE`, `fr-FR`, `es-ES`, `pt-PT`.
- New keys coverage: Tutorial content, builder caption, and toasts translated for DE/FR/ES/PT.
- Scaffolds: `ru-RU`, `uk-UA`, `tr-TR` mirror English until contributed.
- `src/hooks/useAutosave.ts`: Hook to write autosave payloads and flush on exit/visibility.
- `src/components/CopyDialog.tsx`: Fallback manual copy dialog (shown when clipboard writes are blocked).
- `src/components/PasteDialog.tsx`: Manual paste dialog for HSFC content (single config, array, or full HSFC object).
- `src/components/dialogs/RuleTesterDialog.tsx`: Multi-item test UI to check which rule/config matches first. Items are autosaved to `localStorage` under a dedicated key; disabled rules never match.
- `src/components/dialogs/ManageColorsDialog.tsx`: Substat colors management dialog (variant‑keyed map).
- `src/components/dialogs/RestoreAutosaveDialog.tsx`: Restore autosave confirmation dialog.
- `src/components/ConfigChipsPanel.tsx`: Config chips list and context menu.
  - Config chips (visuals):
    - Rank/Rarity/Faction: compact labels; omitted when `Any`.
    - Slots: renders artifact type icons (same as Builder) for quick scanning.
    - Main stats: labels; adopt substat text colors when “Color stat texts” is on.
    - Substats: labels followed by a hollow roll indicator when roll bounds are set per stat:
      - Green ring + number = minimum rolls; Red ring + number = roll cap. The number is white; the ring has no fill.
      - No indicator is shown for “Any/Wildcard” to keep defaults uncluttered.
      - A lock emoji (🔒) appears inline after a substat name when it is locked.
    - Aggregate rolls: shows `Σr ≥ N`. When the aggregate target scope is `locked` (`substatMinTarget === 'locked'`), the chip appends a lock (🔒): `Σr ≥ N 🔒`.
    - Sets: metaset names and explicit set names are joined and truncated by the 2‑line clamp of the chip.
  - Selection & Multiselect (chips):
    - Selection: Left‑click selects a single chip; Ctrl/Cmd+Click toggles selection; Shift+Click selects a contiguous range from the last anchor. Left‑clicking empty space in the chips area clears selection unless a multiselect modifier is held.
    - Context menu: Right‑click a chip to act on it (Duplicate, Move Top/Up/Down/Bottom, Copy, Paste after, Delete). Right‑click empty space for list‑level actions; includes “Select All”, “Copy all Configs”, and “Paste at End”.
    - Actions on selection: When multiple chips are selected, chip actions apply to the entire selection.
      - Duplicate: Inserts copies of all selected chips after the last selected index and selects the new copies.
      - Move Up/Down: Moves each selected chip by one slot independently (items can pass each other; relative order is not preserved).
      - Move Top/Bottom: Moves the whole selection to the start/end while preserving internal order.
      - Delete: Single‑delete shows “This will remove only this configuration from HSFC.” Multi‑delete shows the selected count in the confirmation text.
    - Duplicate detection: Chips that are exact duplicates (ignoring only `name`) render with a red border and tooltip “This is a duplicate of config #X”. Selection/hover styling takes priority over the duplicate border.
    - Tooltips: The chip‑level “Click to edit this config” tooltip is controlled to avoid overlapping with the ellipsized name tooltip; the name uses `EllipsisTooltip` and only shows when truncated.
    - Builder gating: With a multiselect, the Builder is visually disabled by a dim/blur overlay and the bottom‑right status reads “Multiselect”. Controls remain visible but are blocked. A lock icon shows with a standard tooltip that follows the cursor.
    - Preview behavior: While multiselect is active, the Sellfile Preview does not auto‑scroll to selection changes. Single‑select restores auto‑scroll.
    - Drag & drop: The multiselect overlay allows file drops (pointer‑events disabled during a real file drag). Drag starting closes any open menus/popovers; if a confirmation dialog is open, the drag overlay is hidden and drops are ignored.
- `src/components/HeaderActions.tsx`: HSFC header controls (Load/Save/Delete/Note/Count).
- `src/components/PreviewHeaderActions.tsx`: Sellfile Preview header controls (Load/Clear HSF, Export, Manage Colors, Rule Tester, count chip).
- `src/components/FileDragOverlay.tsx`: Visual overlay displayed when dragging files over the app.
- `src/lib/types.ts`: Shared formatters (sets, types, rarity, rank, level, stat and faction labels) plus preferred orders/comparators for slots/sets.
- `src/components/artifactTypeIcons.tsx`: Local Material Symbols (outlined, 24px) inline SVGs and a unified artifact slot icon map used by Builder and Config chips.
  - Substat Colors (chips):
- Storage: `localStorage['sellfileCreator.substatColors.v5']` as `Record<number, { fg: string; bg: string }>` keyed by `StatVariant` (numeric).
    - Defaults: `DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT` and `DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT` (distinct flat vs percent colors for HP/ATK/DEF).
    - Usage: Manage Colors reads/writes the variant‑keyed map; preview chips compute the variant via converters and look up colors.
    - Config chips: when “Color stat texts” is on, mainstat/substat labels in config chips use the same `fg` color as the preview chips.
    - Rationale: One variant‑keyed map avoids `id/flat` pairs and duplicate catalogs.
  - `StatVariant` encodes stats for UI/state using `(HSF Stat ID << 8) | flatFlag` where `flatFlag` is `0` for percent/default and `1` for flat. For HP/ATK/DEF, both percent and flat variants exist (e.g., `HP` vs `HP_FLAT`); others are fixed: SPD/RES/ACC use `flat=1`, CR/CDMG use `flat=0`.

UI constants
- `src/lib/constants.ts` centralizes UI sizes used by the Builder and Config chips to keep visuals consistent:
  - Builder roll badge: `ROLL_BADGE_SIZE_PX`, `ROLL_BADGE_SCALE`.
  - Config chip roll badge (hollow): `CHIP_ROLL_BADGE_SIZE_PX`, `CHIP_ROLL_BADGE_FONT_SIZE_PX`.
- `ARTIFACT_RULES.md`: Artifact-related reference notes.
- `samples/orig/`: Folder with samples generated by RSL Helper. Use as fallback in case rules are unclear.
- `samples/`: Folder with potentially older and broken samples generated by this tool. Use only for historical comparisions.
 - `tests/`: End-to-end HSFC-driven tests compiled and executed by Node (no runner).
 - `tests/file-hsfc-e2e.ts`: File-based runner. Discovers pairs in `tests/fixtures/` named `<base>.hsfc` (input) and `<base>.hsf` (expected). Backwards compatible with `<base>.hsfc.json`/`<base>.hsf.json`.
   - Canonicalizes and asserts exact structural equality (stable ordering; no extra/missing members).
   - Enforces pairing: if a `<base>.hsfc` exists without a matching `<base>.hsf` (or vice‑versa), the runner fails with a clear error listing the missing counterparts.
   - Optionally loads `<base>.assert.mjs` that exports `validate(rules)` to add pinpoint intent checks alongside exact equality.
 - `tests/fixtures/`: Test cases as standalone files. Add new scenarios here by creating `<base>.hsfc` and `<base>.hsf` (and optional `<base>.assert.mjs`).
 - `tsconfig.tests.json`: Test-only TS config. Compiles selected `src/lib/**` files and `tests/**` to `scripts/.tmp` for Node to execute.
 - `scripts/patch-esm-specifiers.cjs`: Post-compile helper that adds `.js` extensions to relative ESM imports in compiled test artifacts under `scripts/.tmp/src/lib/` so Node can resolve them without a bundler. Runs as part of `test:hsfc`.
  
  - `npm run tests:extract`: Generates `samples/tests.extracted.hsfc` containing all HSFC-readable configs used by tests (useful to load/paste into the app).
 - `scripts/release-win.ps1`: Build-and-package script for Windows (runs tests first, builds, stages, archives).
 - `scripts/release-win-dev.ps1`: Dev build-and-package script (no version edits; `-dev` filename suffix).
 - `scripts/build-icon-data.mjs`: Generates static icon data used by the app.

## Desktop App (Tauri)

This project includes a Tauri v2 desktop wrapper in `src-tauri` that loads the existing Vite app.

- Prerequisites:
  - Rust (stable toolchain) and a C compiler. On Windows, install Visual Studio Build Tools and ensure the WebView2 Runtime is present.
  - Node.js 18+ (for Vite) and `@tauri-apps/cli` (installed by `npm install`).

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
- If you need native capabilities (filesystem, shell, tray, etc.), we can add Tauri v2 plugins and capabilities later.

## File Formats

HSF (RSL Helper)
- JSON container: `{ "Rules": HsfRule[] }` (UTF‑8; BOM tolerated).
- Types: `src/lib/hsfTypes.ts`.
- Parsing: `src/lib/hsfIO.ts#parseHsfFile`.
- Build & write: `buildHsfFileFromMerged`, `hsfToBlob`.

HSFC (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": MinimaTable, "Configs": ReadableConfig[], "FinalSellRemainder": { artifacts: boolean; accessories: boolean; levels: (0|4|8|12|16)[] }, "SelectedConfigIndex"?: number }`. Also accepts a raw array `ReadableConfig[]` for convenience.
  - Writer always includes `FinalSellRemainder` (even when off).
  - Reader: when `FinalSellRemainder` is missing (older files), treat it as off with default ranges `[0,4,8,12]`.
  - Dev-only convenience: during Vite `dev` builds, the loader also accepts a single readable `ReadableConfig` object (the shape used by `tests/fixtures/*.hsfc`). This enables dragging test `.hsfc` files directly into the app. In production builds, use either a full HSFC object or an array of configs.
- `Metaset` write format: `{ id: string; name: string; setNames: string[]; show?: boolean }` — named group of artifact set NAMES. Defaults are created if omitted.
- `ReadableConfig` (write format, used by Save and Copy) includes only readable labels — no numeric IDs:
  - `name?`, `keep`, `enabled`
  - `Rank`: string (e.g., `"≥ 5★"`)
  - `Rarity`: string (e.g., `"Legendary"`)
  - `Faction`: string (e.g., `"High Elves"`)
  - `mainStats`: string[] (e.g., `["HP%","SPD"]`)
  - `startLevel`: 0 | 4 | 8 | 12 | 16 | `"any"`
  - `rollBaseline`: `'afterStart' | 'upToLevel'`
- `rollMode`: `'off' | 'strict' | 'potential' | 'auto'` (legacy compatibility; UI surfaces these behaviors as Milestone Thresholds: Early and Late)
  - `autoRarityThreshold?`: `'uncommon' | 'rare' | 'epic'` — Applies only when `Rarity` is `Auto` and Milestone Thresholds are `late` and active. Controls the minimum ≥-rarity tier included as supplements at +4/+8/+12 for Late+Auto behavior. Defaults to `'rare'` when omitted.
  - `substats`: string[] (labels)
  - `fixedSubstats`: string[] (labels, subset of `substats`)
  - `substatRollBounds`: label‑keyed map `{ [label: string]: { min?: number; max?: number; any?: boolean } }`
  - `minCount`, `autoMinCount?`, `autoSubstatFlex`
  - `artifactTypeNames?`: string[]
  - `artifactSetNames?`: string[]
  - `artifactMetaSetNames?`: string[] (metaset names)
  - Meta hint: Each config written by Save/Copy includes `__cfgIdx_ignoredWhenRead: number` (1‑based index at the time of export). Readers ignore this field.
- `MinimaTable` write format: label‑keyed maps.
- Compatibility: HSFC loader accepts only the readable schema (labels). HSF IO maintains its legacy compatibility; no legacy handling is performed for HSFC.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.
- Final Sell (remainder) rules: when enabled (at least one gear type and at least one level selected), the merge appends Sell rules for all level milestones (0/4/8/12/16). Milestones not selected in the UI are emitted as disabled (`Use: false`) instead of being omitted. These rules explicitly include all currently known sets in `ArtifactSet` and selected slots in `ArtifactType`. In the preview, these rules render the Sets column as “All Currently Known” to avoid clutter; on export the full numeric set list is written.

IO Helpers (HSFC)
- Parse text/file: `parseHsfcText`, `readHsfcFile`.
- Build & write: `buildReadableConfig`, `minimaToReadable`, `buildHsfcPayload`, `hsfcToBlob`.
- Object parsing: `parseHsfcObject` normalizes a pre-parsed HSFC payload (readable schema). Autosave stores the same HSFC payload with a CRC and restores via this parser.
- HSFC parsing expects readable schema; only HSF retains legacy compatibility.

Clipboard Helpers
- `src/lib/clipboard.ts` centralizes clipboard interactions:
  - `writeTextSafe(text)` and `readTextSafe()` wrap the async Clipboard API with security checks and failure handling.
  - When writes are blocked, components dispatch `COPY_DIALOG_EVENT` to request that the App open a manual copy dialog prefilled with the content.
  - Fallback UI lives in `src/components/CopyDialog.tsx` (copy) and `src/components/PasteDialog.tsx` (paste).
 - Copy All copies a full HSFC: `{ Version, Metasets, Minima, Configs, FinalSellRemainder, SelectedConfigIndex? }`.
 - Copy single config copies a minimal HSFC: `{ Version, Metasets: [only those referenced by the config], Configs: [readable config] }` so pasting elsewhere brings required metasets.
 - Paste accepts: a single config, an array of configs, or a full HSFC object (readable schema). Legacy shapes are not normalized.

Autosave
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'`). Value is `[crc32, payload]` where `payload` is a readable HSFC object (`buildHsfcPayload`) and `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, minima, configs, finalSellRemainder, selectedConfigIndex, note })` handles reading the entry, opening the Restore dialog when appropriate, and enabling autosave at the right time.
- Restore vs Dismiss:
  - Restore: applies the saved session (metasets, minima, configs, note, selection) and enables autosave.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden.
- file:// note: LocalStorage behavior varies for file origins and can be non‑persistent or path‑scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.

App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`hsfcIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.

### Help / README

- Rendering: `src/components/HelpDialog.tsx` renders the top‑level `README.md` (imported as a raw string via `README.md?raw`) using `@uiw/react-md-editor`’s Markdown preview with `rehype-sanitize` for safety.
- First‑run gating: On mount, `App` compares `localStorage.getItem(README_SEEN_VERSION_KEY)` with `APP_VERSION`. If they differ, the Help dialog opens. When the dialog closes, the app writes the current `APP_VERSION` to `README_SEEN_VERSION_KEY` to avoid reopening until the version changes.
- UX: A clearly labeled Help button sits to the right of the three top‑right caption lines in the header and opens the Help dialog on demand.
- Constants: `README_SEEN_VERSION_KEY = 'sellfileCreator.readme.seen.version'` lives in `src/lib/constants.ts` and centralizes the storage key.
- Style: `README.md` is strictly user‑facing. Keep language simple and practical (ELI5 level), similar to tooltips/tutorial copy. Avoid phrasing that suggests AI authorship. Using Raid: Shadow Legends terminology is okay where it helps players.

### In‑App Tutorial

- Overlay: `src/components/tutorial/TutorialCoach.tsx` renders a lightweight coachmark overlay that highlights elements by `data-tour-id` and shows step text with Back/Next controls. The coach dialog is slightly wider on desktop (`sm: 860px`) to accommodate section breadcrumbs without ellipsis.
- Gating: The tutorial autostarts once on first run for a new version after the Help dialog is closed. Version gating uses `TUTORIAL_SEEN_VERSION_KEY = 'sellfileCreator.tutorial.seen.version'` (in `src/lib/constants.ts`).
- Manual start: `HelpDialog` includes a bottom‑left “Start Tutorial” button. The dialog surfaces README content and acts as the entry point.
- Steps: Built inside `App.tsx` using a typed `TutorialStep[]`. Two scripted examples run in sequence: a basic config (slot + main stat + set + add) and an advanced config (substats + Min required rolls + Milestone Thresholds). Steps can run small `before` actions that set builder state for demonstration.
- Targets: A step can highlight a single `targetId` or multiple `targetIds: string[]`. When multiple are given, the overlay hole covers the union of all target rects.
- Targets: Key controls expose `data-tour-id` attributes: rank/rarity/faction selects, mainstat group, slots (Boots), sets Select, add‑config button, HSFC load/save buttons, Min required rolls and Thresholds groups.

Navigation
- Breadcrumbs: The dialog footer shows section breadcrumbs (Basics, Advanced, Metasets, Config Chips, Final Sell, Save & Export). Clicking a section jumps there; the current section is clickable too (jumps to its first step).
- Emoji feedback: When skipping forward/backward, a small emoji rises briefly over the section being left (🙁 for forward/skip, 👍 for rewind). Jumps happen immediately; the animation runs independently. No emoji is shown when clicking the current section.

Jump hydration (fast‑forward/backward)
- Intent: Section jumps reconstruct state as if the user walked through intermediate steps, rather than literally skipping.
- Implementation: On jump, the app resets to a clean baseline and replays step effects up to the target index (slots, mainstat, sets, substats, required count, min rolls, config adds/selection, metaset creation/defaults, metaset selection, Final Sell defaults).
- Determinism: After hydration, the target step’s `before` still opens/closes any dialogs/menus to match the intended view.

Behavioral details
- Highlight hole: The overlay darkens everything except the current target rect (four masking panes). A brief fade‑out “ghost” (180ms) smooths transitions when the target changes or vanishes (e.g., menus/dialogs closing).
- Auto‑scroll: The coach scrolls the target into view on every step, including rAF+timeout recomputes to handle MUI portal timing.
- Step normalization: Each step can prepare UI state via `before` (e.g., ensure metasets dialog open/closed, open/close Sets menu, open/close chips context menu, open/close Preview header menu, open/close Final Sell dialog). This keeps navigation robust when moving back and forth.
- Targeted closers: To reliably close menus under the overlay, the coach dispatches `Escape` directly to portals (`ul[role=listbox]`, `[data-tour-id="chips.menu"]`, `[data-tour-id="chip.menu"]`, `[data-tour-id="preview.header.menu"]`) and then sends a synthetic outside click (on `document.body`). Sets menu closing also ESCs the listbox itself.
- Text emphasis: Step bodies support:
  - Backticks `code`: UI keywords rendered primary + bold (e.g., `Sets`, `Milestone Thresholds`).
  - Double tildes `~~brand~~`: brand/emphasis styling with a subtle heartbeat.

Session handling
- Snapshot/restore: On tutorial start, the app snapshots the full HSFC state in memory (configs, selection, metasets, minima, final‑sell, note, builder) and resets to a clean default so the walkthrough is deterministic. On exit or finish, the snapshot is restored exactly.
- Exit hygiene: On exit/finish, the app first closes all transient UI (menus, dialogs, context menus), then restores the snapshot, then closes the coach. This ensures autosave only re‑enables after the original state is back in place.
- Autosave: Paused while the tutorial runs to avoid overwriting the user’s real session. Resumes after exit/finish.

Start/Finish attention effects
- Shared hook: `src/lib/attentionEffects.ts` exposes `useAttentionEffectStyles(enabled)` which returns an `sx` with animated effects. The Start button in `HelpDialog` and the Finish button in the coach reuse this hook (no duplication). Text‑only variants target the `.attention-text` span inside the button.

Common targets (`data-tour-id`)
- `builder.panel`, `builder.action`, `builder.enabled`, `builder.name`
- `builder.mainstat`, `builder.mainstat.spd`, `builder.slots`, `builder.slot.boots`
- `builder.substats`, `builder.required`, `builder.min-rolls`, `builder.min-rolls.toggle`, `builder.thresholds`
- `builder.sets`, `menu.metasets.section`, `builder.manage-metasets`
- `metasets.add`, `metasets.close`, `metasets.dialog`
- `chips.container`, `chips.menu`, `chip.menu`
- `finalsell.toggle`, `finalsell.config`, `finalsell.dialog`, `finalsell.dialog.types`, `finalsell.dialog.levels`, `finalsell.dialog.close`
- `hsfc.save`, `hsf.export`, `preview.paper`, `preview.header`, `preview.header.menu`

### Extending Tutorial (Sections + Hydration)

- Where to edit
  - Steps and section anchors: `startTutorial()` in `src/App.tsx`.
  - Coach dialog UI (breadcrumbs, animation): `src/components/tutorial/TutorialCoach.tsx`.
- Transient UI helpers: `ensureMetasetsDialog` / `ensureSetsMenu` / `ensureChipsMenu` / `ensurePreviewHeaderMenu` / `ensureFinalSellDialog` and `closeAllTransientUi()` inside `startTutorial()`.

- Add a new section anchor
  - Give the first step of the section a stable `id` (e.g., `'my-feature-intro'`).
  - Add `{ label, index: find('<first-step-id>') }` to the `sections` array in `startTutorial()`.
  - The breadcrumb will render automatically if `index >= 0`.

- Add new step effects to hydration
  - Jumps reconstruct state by replaying step effects (a `switch` on `step.id`) in `onSkipTo` within `startTutorial()`.
  - To support a new step that mutates state, add a `case '<step-id>'` and update the in‑memory variables:
    - `nextBuilder` (slots, mainstats, substats, locks, counts, rolls, name, etc.)
    - `nextCfgs` / `nextSel` (when a step “adds” the current builder as a config)
    - `nextMetas` (create/merge metasets; reuse `makeMetasetId()` and `defaultMetasets()` as needed)
    - `nextFsr` (Final Sell defaults)
  - Keep mutations minimal and explicit so later tweaks to a step can be mirrored here safely.

- Ensure deterministic UI on arrival
  - For any new dialogs or menus, add an `ensureXxx(open: boolean)` helper and call it in the step’s `before` (open/closed as intended).
  - Add targeted closers to `closeAllTransientUi()` if a new portal needs a direct `Escape`.

- Add new targets
  - Tag the UI with a stable `data-tour-id` and reference it from the step `targetId`/`targetIds`.
  - If you highlight an element rendered in a portal (e.g., MUI `Menu`/`Dialog`), consider a short retry in `before` if it mounts on the next tick.

- Breadcrumb behavior
  - Clicking a future section: shows 🙁 over the section being left; jumps immediately.
  - Clicking a past section: shows 👍 over the section being left; jumps immediately.
  - Clicking the current section: no emoji; jumps to that section’s first step.

### Add New Tutorial Steps

- Steps live in `App.tsx` inside `startTutorial()` as an array of `TutorialStep`:
  - `id: string` — unique, used for small behavioral conditions.
  - `title: string` — short caption.
  - `body: string` — user text. Wrap UI/control names in backticks to render emphasized (blue/bold).
  - `targetId?: string` — `data-tour-id` to highlight. Ensure the component has that attribute.
  - `before?: () => void` — optional side‑effects to set expected UI state (open/close dialogs/menus), and to set builder fields for scripted demos.

- Normalize UI state in `before` using helpers defined in `startTutorial()`:
  - `ensureMetasetsDialog(open: boolean)`
  - `ensureSetsMenu(open: boolean)`
  - `ensureChipsMenu(open: boolean)`
  These keep navigation robust when moving back and forth.

- Tag the target element with a stable `data-tour-id` in its component (e.g., BuilderPanel, dialogs, menus). Example:
  - Sets metasets section: `data-tour-id="menu.metasets.section"`
  - Preview table container: `data-tour-id="preview.table"`

- Example step additions

```ts
// Highlight the Sets selector, then the Metasets section inside the open menu
{
  id: 'sets-open',
  title: 'Select a Metaset',
  body: 'Open `Sets` and see your metasets at the top.',
  targetId: 'builder.sets',
  before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); },
},
{
  id: 'sets-metasets',
  title: 'Metasets in Sets',
  body: 'Your `Metasets` appear here at the top.',
  targetId: 'menu.metasets.section',
  before: () => { ensureMetasetsDialog(false); ensureSetsMenu(true); },
},

// Toggle Keep/Sell highlight (no state change required — the user can click it)
{
  id: 'action',
  title: 'Choose Action',
  body: 'Toggle between `Keep` and `Sell` to control outcomes.',
  targetId: 'builder.action',
  before: () => { ensureSetsMenu(false); },
}
```

- Verification tips
  - After adding a step: run the tutorial, navigate forward/back; ensure the highlighted target is scrolled into view, menus/dialogs are opened/closed as expected, and the overlay hole does not cover the target.
  - If a portal target (menu/dialog) sometimes misses on first entry, use a short `setTimeout` in `before` to retry opening once.

Hooks and Shared Components
- `src/hooks/useAutosaveRestore.ts`: Encapsulates autosave restore prompt, dismiss baseline, and enablement.
- `src/hooks/useManageColorsDialog.ts`: Manages Manage Colors dialog state + persisted substat colors.
- `src/hooks/useMinimaDialog.ts`: Manages Substat Values (Minima) dialog state.
- `src/hooks/useMetasetsDialog.ts`: Manages Manage Metasets dialog state.
- `src/hooks/useConfirmDialog.ts`: Generic confirm dialog state.
- `src/components/FilePickerButton.tsx`: Reusable file‑picker button (label + hidden input) with `accept` and `onSelect` props.

Internal vs IO representation
- UI and builder state use StatVariant‑based fields: `mainStatsV`, `substatsV`, `fixedSubstatsV`, and `substatRollBoundsV` (variant‑keyed map).
- HSFC write paths (Save, Copy All, Copy single config) now write compact metaset references by ID: `artifactMetaSetIds: string[]`. For backward compatibility, read paths still accept `artifactMetaSetNames` and map them to IDs by name. The `Metasets` section in HSFC includes `{ id, name, setNames, show? }` so IDs remain readable.
- Copy single config writes `{ Version, Metasets: [subset], Configs: [config] }`.
- Paste‑only flow creates hidden placeholder metasets with generated names for any unknown referenced metaset IDs (chips never show raw IDs).
- HSFC read paths accept the readable HSFC schema. Autosave stores a readable HSFC payload (plus CRC).
- HSF files are read and written exactly as before; no changes to HSF IO.

Display helpers
- Prefer `labelOfVariant(variant)` for UI rendering of stats.
- Avoid redundant `variantToSub(...)` followed by `statNameFromId(...)` in presentation code. Reserve `variantToSub` for HSF/HSFC IO and builder internals where `(id, isFlat)` tuples are required.
- Slot icons: render via the shared map in `src/components/artifactTypeIcons.tsx` (keeps visuals consistent between Builder slots and Config chips; no runtime font dependency).
- Set tooltips: texts live in `src/lib/setDescriptions.ts` and are rendered by `WithSetTooltip`/`getSetTooltipContent` from `src/components/SetTooltip.tsx`.
  - Localization: Tooltip lines resolve via i18n keys derived from set label keys (e.g., `setDesc_setLife_text`, `setDesc_setFeral_by_4`). English values are defined in `src/lib/i18n/catalogs/en-US.ts`; other locales may override selectively.
  - Texts are concise, effect‑only summaries and may contain explicit inline tags: `{buff:Name}` or `{debuff:Name}`. Only tagged terms are colorized (blue for buffs, red for debuffs). There is no heuristic keyword detection.
  - Explicit newlines (`\n`) in description strings render as separate lines in the tooltip.
  - Variable (1–9) sets use `byPieces` to render numbered lines `1: …` through `9: …`.
  - Consumers should wrap set labels with `WithSetTooltip` to get the tooltip (used in Builder select and Metasets dialog).
- Roll indicators: when `rollMode === 'off'`, indicators are visually disabled and render as a neutral hollow circle (no text/fill, neutral border); interactions are disabled.

Ordering (UI + export)
- Slots: use a fixed preferred order for artifact types — Weapon, Helmet, Shield, Gauntlets, Chestplate, Boots, Ring, Amulet, Banner — implemented by `compareArtifactTypes`.
- Sets (UI): three view modes in the Sets selector — Game (numeric ID ascending), A–Z (alphabetical), and Icons. Icons switches regular sets to an icon‑only grid while metasets stay as a text list. The choice is persisted (`sellfileCreator.setsOrder.v1`) and shared between the Builder and Metasets dialog.
  - Search Sets: A "Search Sets" field filters the list/grid by name. Search text is not persisted; only the view mode is stored.
  - Icon grid: Items show as icons with tooltips (name + details). Selection toggling in icon mode is handled explicitly to avoid missed clicks in dense layouts.
- Sets (export): use game order (numeric ID ascending) — implemented by `compareArtifactSets`.
- UI: `formatArtifactTypes(...)` and `formatArtifactSets(...)` sort before rendering; Config chips also sort slot icons.
- HSFC export: `buildReadableConfig(...)` writes `artifactTypeNames` and `artifactSetNames` sorted; `mainStats`, `substats`, and `fixedSubstats` are also sorted by preferred stat order; `buildHsfcPayload(...)` writes metaset `setNames` sorted by game order.
- HSF export: `buildHsfRules(...)` sorts `ArtifactType` and `ArtifactSet` arrays for stable output and applies `[minLevel..maxLevel]` filtering with feasibility gating and per‑level combo sizing (before +16, use the number of substats physically present for the rarity).
- Builder canonicalization: `buildHsfRules(...)` canonicalizes `mainStatsV` and `substatsV` using `compareVariants` before unrolling/combining so the generated rule order is deterministic and independent of click order. Combinations and roll distributions are enumerated in a stable order.
 - `IsRuleTypeAND`: Exported as `false` for all rules. Current RSL Helper behavior does not require the AND variant for our generated thresholds, and a consistent value improves interoperability across readers.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (0/4/8/12/16) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Rarity “Auto”: HSFC read/write accepts `Rarity: "Auto"`. The builder resolves this to a concrete rarity code before generating HSF rules based on roll requirements and the current level window:
  - Required rolls are the max of aggregate `minRequiredRolls` and the worst‑case sum of per‑stat `min` across generated permutations (fixed + highest mins among the remainder up to `minCount`).
  - Mapping: 0→Any, 1→≥ Uncommon, 2→≥ Rare, 3→≥ Epic, 4→≥ Legendary, 5→Mythical (exact). If `minLevel=0`, Auto also ensures the resolved rarity can have at least `minCount` substats present at +0: 1→≥Uncommon, 2→≥Rare, 3→≥Epic, 4→≥Legendary.
  - Level‑window aware: if the base mapping cannot reach the required rolls by +16 given the baseline/start, Mythical is chosen when it makes the target feasible (pre‑roll at +0); otherwise the base mapping is used and infeasible rows are pruned as usual.
- Levels are the milestones 0/4/8/12/16.
- Level window: HSFC uses `minLevel` and `maxLevel` to bound emitted rules. When reading legacy configs without these fields, the window defaults to `[startLevel..16]` (presence‑only is handled separately via legacy `rollMode: 'off'`).
- Count Rolls baseline (`rollBaseline`): still parsed for legacy configs and used for roll math, but new HSFC exports do not include it.
- Substat thresholds: base minima derive from star bucket inferred from `rankCode` (see `starForRankCode`). Each “roll” adds another base minimum for that substat.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base minima derive from star bucket inferred from `rankCode` (see `starForRankCode`). Roll distributions add multiples of the base minimum for each roll allocated to a substat.
- Mythical pre‑roll: When rarity selection includes Mythical (exact 15, ranges that include Mythical, or `>= Legendary`), treat there as being one pre‑roll at level 0 on one substat.
  - Rarity = Any (0): by default does not assume Mythical. However, when either the sum of per‑stat mins or the aggregate Min required rolls is 5, the builder treats `Any` as Mythical‑capable and includes one pre‑roll at +0 so feasibility checks and thresholds align with Σr = 5 scenarios.
  - Presence (Any): For presence feasibility only (how many substats exist at a level), `Any` behaves like `≥ Legendary` (no additions). Roll schedules still follow the selected rarity/range.
  - Baseline `'upToLevel'` counts this pre‑roll at every level; `'afterStart'` counts it only if `startLevel` is 0.
  - The target budget by +16 is therefore 5 rolls when Mythical is included (4 otherwise).
- Fixed substats: rule permutations always include all fixed substats, and pick additional substats from the remaining selected ones so the size is `max(minCount, fixedCount)`, capped at 4.
- Dynamic combo sizing before +16: At levels where the rarity cannot yet have `minCount` substats, the builder emits permutations sized to the number of substats that can physically be present (still honoring fixed substats). Once presence reaches `minCount` (typically by +16), permutations use `minCount`.
- Mainstat expansion: because HSF does not accept an array for main stat, multiple selections are unrolled into separate rules, one per selected main stat. An empty selection emits HSF rules with `MainStatID = -1` (Any).
 - HSF export always writes both `MainStatID` and `MainStatF` (using `-1` and `1` for “Any”).

### Roll Semantics (builder)

- Roll indicators (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
- `min = N (1..5)`: require at least N rolls; generates lower‑bound rules after feasibility, and (in Potential/Early) early rows before feasibility.
  - Roll cap (`max = N`, 0..4): cap rolls at N. A `max = 0` forbids rolls on the substat (presence/base value only). Distributions exceeding a cap are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores roll indicators entirely (presence at start level only).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential (Early) when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and roll cap do not affect Auto resolution.
- Feasibility: at a level, let `avail` be the number of rolls credited by the baseline. The set of Min indicators is feasible if `sum(mins) <= avail`.
- After feasibility: both Strict and Potential (Early) keep enforcing the same lower‑bound (exact mins) on later levels so “at least N” remains true.
- Potential/Early (single-substat fast path): When exactly one substat has a `min ≥ 1` and no wildcard, the builder emits a single early lower‑bound per milestone: `base + min(avail, min) * base`. Thresholds rise until the minimum becomes feasible, then remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
  - After feasibility, the lower‑bound remains enforced at later levels; no additional early rows are emitted.
  - This mirrors the “green roll” expectation for single‑stat targets and keeps the preview to a single row per level.
  - If a global `minRequiredRolls` is set and is higher than the per‑stat minimum, the early target uses the higher of the two (with one selected substat, the aggregate equals that substat).
- Star + MinRequired (single-substat): When the single selected substat uses wildcard (`any: true`) and a global `minRequiredRolls > 0`, the builder uses the same early single-row behavior, with `minRequiredRolls` standing in for the per‑stat minimum.
  - Milestone Thresholds (UI toggle):
    - Early (default): thresholds at a level use rolls gained so far (legacy: Potential semantics where applicable).
    - Late: thresholds at a level use only what must be present now so the target by +16 remains achievable. For a single substat with `min = k`, applied = `max(0, k − remainingRollsTo16)`.
- Roll cap enforcement: For both Strict and Potential/Early, distributions violating any `max` are filtered at generation. Early rows and lower‑bounds alike respect roll caps.
- Aggregate (Σ rolls) behavior: `minRequiredRolls` applies to the sum of rolls across the selected substats only; it does not implicitly raise per‑stat thresholds. In Strict, distributions failing the aggregate are filtered; in Potential/Early, early rows are kept only if the aggregate can still be met by +16.
- Presence at start: In Potential/Early, if `avail === 0` but the aggregate can still be met by the target (e.g., Σr ≥ 4 with Legendary schedule), a presence row is emitted at +0. This enables early “can still reach by +16” visibility.
- Wildcard‑only + aggregate (all selected stats have `any: true`, and `minRequiredRolls > 0`):
  - Early: emits only minimal allocations at each milestone — the selected portion of rolls sums to `min(minRequiredRolls, avail)`. Extra rolls can land on non‑selected stats (implicit “other” bucket). This keeps early rows concise and stable across levels.
  - Late: emits presence‑only at early milestones (+0/+4/+8/+12), and enforces the same minimal allocations at +16.
- Wildcard‑only, no aggregate (all selected are `any: true`, and `minRequiredRolls` is Auto/0): Potential/Early behaves like Strict for distributions (no “other” bucket). This prevents thresholds at +16 from being below earlier levels as additional substats become present.

## Clipboard and Context Menus

- The chip area always renders (min height) and supports a context menu with “Copy All (.hsfc)” and “Paste”. When empty, a centered hint invites right‑click Paste.
- Chip context menu includes: Duplicate, Move to Top/Up/Down/Bottom, Copy to Clipboard, Delete.
- Copy All copies a full HSFC object `{ Version, Metasets, Minima, Configs, FinalSellRemainder }` via `buildHsfcPayload` to preserve state on paste.
- Paste accepts: single `BuilderConfig`, array of configs, or a full HSFC object in the readable schema. Legacy forms are not normalized.
- Clipboard fallback: in non‑secure contexts (not HTTPS/localhost), programmatic clipboard is blocked, so the app opens a dialog with pre‑selected text for manual copy/paste.

## Save/Load Guarantees

- Saver writes `{ Version, Metasets, Minima, Configs, FinalSellRemainder, SelectedConfigIndex? }` (via `buildHsfcPayload`) and downloads `*.hsfc`. When no config is explicitly selected, the last config index is saved by convention so loaders can preserve intent.
- Loader (`readHsfcFile`) accepts the readable HSFC schema and preserves `substatRollBounds.any`, `min`, and `max` (clamped to valid ranges; `min` 0..5, `max` 0..4). Legacy HSFC shapes are not supported.
- Copy All mirrors the saver payload (including `SelectedConfigIndex`) to enable full round‑trip via copy/paste.

## Behavioral Details

- Min vs Roll cap exclusivity: The builder now enforces mutual exclusivity; toggling one clears the other. HSFC persists only the active choice (`min`, `max`, or `any`).
- Roll cap enforcement: Rule generation filters distributions that exceed a per‑substat `max`. A `max = 0` enforces “no rolls” on that substat.
- Auto resolution: Auto now keys strictly off `min ≥ 1` across selected substats; star and roll cap are ignored for Auto.
- Rank Any uses 6★ baseline: When `rankCode = 0` (Any), base minima map to the 6★ bucket for threshold generation (conservative default).
- Rarity ranges (≥): Conservative lower-bound behavior. `rollLevelsForRarityCode` maps `≥ Common..≥ Epic (6..9)` to the lower bound’s schedule (Common/Uncommon/Rare/Epic), and `≥ Legendary (16)` to Legendary. `rarityIncludesMythical` no longer assumes Mythical for any `≥` range; only exact Mythical (15) and `≤ Mythical (14)` imply the Mythical pre‑roll.
 - Any rarity presence: For presence feasibility only, `Any` is treated like `≥ Legendary` (no additions). Mythical pre‑roll is still not assumed unless Σ mins or aggregate min equals 5.
- Rarity label parsing: HSFC normalize accepts human‑readable `Rarity` strings (e.g. `"≥ Epic"`, `"Legendary"`, `"Any"`) and maps them to canonical codes. Numeric `rarityCode` is also accepted; `rarityExact` is no longer supported.
- Metaset name resolution on paste: `parseConfigsFromText(text, metasets)` resolves `artifactMetaSetNames` against the caller‑provided current metasets. For full HSFC objects, `parseHsfcObject` resolves names against embedded `Metasets`; if absent, falls back to the app’s current metasets (`prev.metasets`). No default metasets are injected implicitly.
- Per‑config pruning: Obsolete elimination now runs per config before merging, so preview table counts match the builder’s chip count. Cross‑config overlaps remain visible for auditability.
- Obsolete comparator: Compares substats by the same StatVariant and raw Value for the same operator (no normalization to rolls). Tie‑break prefers earlier rule indices within a config when values are equal.

## File Import UX

- Global drop target: The entire app window accepts file drops. Local dropzones were removed to reduce friction. Implemented via `useFileDragDrop` + `FileDragOverlay`.
- Overlay on file drag: A full‑screen, non‑interactive overlay appears on real file drags, indicating that `.hsfc` (configs + metasets) and `.hsf` (sellfile) are accepted. Overlay uses `pointer-events: none` so it never blocks the actual drop.
- Routing by extension: Drops are dispatched by filename extension — `.hsfc` → HSFC loader (`readHsfcFile`), `.hsf` → HSF loader (`readHsfFile`). Unknown extensions are ignored.
- Safety: Only intercept drags when `DataTransfer.types` includes `Files`; component drags (e.g., table column reorder) are unaffected.
 - Load semantics: File load and drag‑and‑drop replace the entire state (metasets, minima, configs, final‑sell, selection, note). No conflict merging on file load.

## HSFC Global Note

- Schema: HSFC may include an optional root-level `Note: string` with Markdown content.
- Load: When an HSFC with `Note` is loaded, a modal dialog opens automatically (view‑only). The dialog can also be opened via the always‑visible “Add/Edit Note” button in the HSFC controls row.
- Edit: The dialog uses an embedded Markdown editor (`@uiw/react-md-editor`) with sanitized previews (`rehype-sanitize`). We keep the editor in a dedicated component `src/components/NoteDialog.tsx`.
- Save/Copy: If a Note exists (non‑empty), HSFC exports and “Copy all Configs” include it.
- Paste semantics: Pasting HSFC content (via context menu or manual paste) only overwrites the current note if the current note is empty. Loading a file always overwrites the current note.
 - Metaset conflicts on paste (Copy/Paste only): identical value (same sets) keeps current ID and remaps pasted references. If the same ID has different sets, a single dialog offers: Keep current, Use pasted, or Keep both (new ID for pasted). Unknown pasted metaset IDs create hidden placeholders with generated names so chips never show raw IDs.
- Dependencies: `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, and `rehype-sanitize`.

## Localization (Contributors)

- Source of truth:
  - `src/lib/i18n/catalogs/en-US.ts` defines the complete, typed key set. Add new keys here only.
- Catalog files (non‑English):
  - Each catalog lives in `src/lib/i18n/catalogs/<lang>.ts` and imports English, exporting overrides only: `const overrides = { ... }; export default { ...enUS, ...overrides }`.
  - This keeps key parity without duplicating English strings. The provider also merges catalogs over English at runtime as a safety net.
- Shipped languages:
  - Localized: `de-DE`, `fr-FR`, `es-ES`, `pt-PT` — provide partial/complete overrides.
  - Scaffolds: `ru-RU`, `uk-UA`, `tr-TR` — files exist and currently mirror English until translated.
- Runtime behavior:
  - Selected catalog overlays English. Precedence: runtime catalog (via `registerRuntimeCatalog`) → built‑in `<lang>.ts` → English.
  - Dev‑only audit language: `empty` renders all keys with empty strings to surface hardcoded text.
  - Users can drag‑and‑drop `.l10n.json` files to test a localization for the current session.
    - Preferred schema: `{ "lang": "xx-XX", "catalog": { ... } }`.
    - Alternative: a plain key→string map named like `xx-XX.l10n.json`.
- Type safety:
  - Keys are typed off `en-US.ts` (`StrictCatalog`). Using an unknown key in code fails typecheck; missing translations fall back to English safely.
- Release templates:
  - The release ZIP includes `dist/l10n/*.l10n.json` templates (generated by `npm run export:l10n`) so users can review/fix translations.
- Contribution workflow:
  - Keep keys identical to `en-US.ts`; do not rename/remove without scope discussion.
  - Submit updates by editing `src/lib/i18n/catalogs/<lang>.ts` (overrides only) or attach `.l10n.json` files.
  - Before handoff: quick in‑app test (language switch), then `npm run typecheck && npm run lint && npm run build`.

## Metaset Management

- Delete dialog behaviors:
  - Unused and empty: deletes immediately without confirmation.
  - Unused with sets: shows a simple confirmation (no replace options).
  - Used in configs: shows a single-choice confirmation with radio options and a single confirm button (fixed width):
    - Delete and remove references (red).
    - Replace with explicit sets (warning): merges the metaset’s sets into `artifactSets` and removes the metaset reference.
    - Replace with another metaset (warning): selector sits to the right of its radio; enabled only when selected.
  - Default selection mirrors Delete: if any referenced metaset contains sets, defaults to “Replace with explicit sets”, otherwise to “Delete and remove references”.
  - Builder integration: when deleting or replacing a metaset, the live builder selection is updated using the same mapping as configs.
  - Sets Select fallback: when a selection can’t be resolved (e.g., deleted ID), it renders “Any” instead of an empty label.
  - Clear buttons: “Clear” in Metasets editor is disabled for empty metasets; “Clear” in the builder’s Sets row is disabled when selection is Empty/Any.

- Reset metasets to defaults:
  - Presents the same three choices as Delete (remove references, explicit sets, or replace with metaset), applied across all configs and the builder.
  - Defaults like Delete (prefer “Replace with explicit sets” when any used metaset has sets).
  - After applying the chosen mapping, replaces the metaset list with `defaultMetasets()`.

- Name generation for new metasets:
  - Source: `src/lib/namegen.ts`. Generates short, readable names from curated descriptor/place/group lists; dedupes against existing names.
  - Runtime blacklist: filters out any tokens used elsewhere in the UI (`artifactSetNames`, `factionNames`, `artifactTypeNames`) to avoid collisions as catalogs grow.
  - Playful mode (~20%): occasionally produces light, kid‑friendly combinations (e.g., “Snack Squad”) while keeping content PG.
  - Implementation: dependency‑free LCG for randomness; compact lists; no user toggle.
  - Visual feedback (UI only): When a playful name is generated, the metaset name TextField shows a brief golden glow with a few rising sparkles (~1.4s). The effect is clipped to the input box and does not cover the floating label.
  - Scrollbar stability: The metasets list area uses `scrollbar-gutter: stable both-edges` to prevent dialog width shifts when the vertical scrollbar appears.
  - Deletion performance: Deleting an unused metaset (no references in configs) skips remapping `customCfgs` and updates only the builder if needed. This avoids unnecessary preview/chip re-renders.
  - IDs and IO:
    - Built‑in metasets use stable, human‑readable slugs (e.g., `meta_nuker`, `meta_support_survivability`) instead of timestamps.
    - New metaset IDs are compact base‑36 strings via `makeMetasetId()` (e.g., `m_ab12cd3`).
    - HSFC configs reference metasets by ID via `artifactMetaSetIds` (compact); the `Metasets` section remains readable with names and `setNames`.

- Tooltip copy style: avoid HTML entities in tooltips. Use backticks for titles and string expressions for labels containing quotes to satisfy ESLint.

## Preview Table Selection

- Row click: Selecting a rule row highlights the related config and selects the corresponding config chip, but does not auto‑scroll the table. This avoids unexpected jumps during exploration.
- Chip click: Selecting a config chip still auto‑scrolls the table to the first matching rule row (smooth scroll).
- Rationale: preserves navigational intent — row clicks act locally; chip clicks navigate the preview.

### Obsolete Rules Handling

- Obsolete detection groups rules by coarse keys (keep/use, rank/rarity/level, sets/types, main stat, faction) and normalized substats. A rule is “obsolete” if another rule in the same group dominates it (componentwise looser-or-equal thresholds, with tie-breaking to earlier indices for exact duplicates).
- Preview pruning only removes an obsolete rule when both the obsolete rule and its covering rule originate from the same custom config (same `__cfgIdx`). This preserves:
  - Duplicate configs (copying a config now shows both copies in Preview).
  - Base-vs-custom overlaps and across-config overlaps (kept visible for auditability).

## UI Notes (developer-facing)
- Builder layout: Row 1 Action; Row 2 Rank/Rarity/Faction/Start/Roll permutations; Row 3 Mainstat/Substats; Row 4 Min selected substats (aligned to right under Substats, includes “Minima…”); Row 5 Slots/Sets.
  - Faction is grouped near Rarity. Only accessories (Ring/Amulet/Banner) are faction-specific; other gear ignores `Faction`.
- Mainstat is multi-select with 3 rows of toggle buttons: Any, then HP/HP%/ATK/ATK%/DEF/DEF%, then SPD/RES/ACC/CR%/CDMG%. Buttons share a fixed minWidth; Any is double width for emphasis. Internally stores `mainStatsV: StatVariant[]` (empty = Any). HSFC export converts these to readable labels.
- Substats is a multi-select `ToggleButtonGroup` with the same 3-row order and widths (StatVariant). `Any` is mutually exclusive with specific substat buttons and maps to empty selection (meaning Any). When specifics are selected, Any is ignored/cleared.
  - Right‑side roll indicator interaction:
    - States are mutually exclusive: Min (`min = 0..5`), Roll Cap (`max = 0..4`), or wildcard `any` (★).
    - Left‑click increases; Right‑click decreases.
    - From ★: Left → Min 0; Right → Roll Cap 0.
    - On Min: Left increases (0→…→5→★); Right decreases (5→…→0→★).
    - On Roll Cap: Right increases (0→…→4→★); Left decreases (1→0→★).
  - Indicator semantics/colors: `any` shows a green ★, Min is green with the number, Roll Cap is red with the number. A cap of 0 forbids rolls on that substat.
- Required substats shows a caption warning if `minCount > substats.length`. A compact, fixed-height spacer below the controls reserves space to avoid layout shifts while keeping the gap minimal.
- Optional `autoMinCount` mode surfaced as a toggle button in the Required selector. Buttons are: Auto, 1, 2, 3, 4. When Auto is selected, the UI keeps `minCount` synced to `min(4, substatsV.length)`. Selecting a number disables auto. Clearing Substats sets `minCount=0`.
- Wildcard flex toggle (star icon beside the Required label) is available only when Required is set to a specific count and at least one starred substat (`any: true`) is selected. When enabled, that count becomes a floor: starred substats are permuted across totals ≥ `minCount` while locked/non-star selections remain mandatory; aggregate/roll minimums still apply to the chosen subset.
  - Flex permutations are deferred until at least two milestone rolls are available, so early rows (e.g. +0/+4) stay minimal while still expanding once there are enough rolls to spread across multiple starred stats.
- Min required rolls: a second toggle cluster after Required substats with `Auto, 1..5`. When enabled (not Auto), it enforces an aggregate lower bound on the total rolls across the selected substats and filters out rows where the target cannot be reached anymore by +16 (i.e., `Σselected + remaining < minRequiredRolls`). The label text and the lock toggle icon are separate hover targets so highlighting the text no longer activates the icon; the icon carries the interactive behaviors (`aria-pressed`, focus ring, tooltip, hover color) while the label remains plain text. In Strict mode, distributions that fail the aggregate are filtered; in Potential/Early, early rows are kept only when the aggregate can still be met by +16. For legacy HSFC files, `rollMode: 'potential'` maps to this behavior; the UI now exposes this under “Milestone Thresholds”.
- Defaults: `rarityCode=0` (All), `rollMode='auto'`, `autoMinCount=true` (Required defaults to Auto; effectively 0 until substats are chosen). Stats and sets/types/factions are driven by enums (`StatVariant`, `ArtifactSet`, `ArtifactType`, `Faction`).
- Reset defaults sets: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStatsV=[]`, `startLevel=0`, `rollMode='auto'`, `minCount=0`, `autoMinCount=true`, `substatsV=[]`, clears `artifactTypes`/`artifactSets`.

- Config chips: Container is height-limited (about 6 chips) with vertical scroll. After “Add as new config”, the new chip is auto-selected and the chips container scrolls that chip to the top without scrolling the page.
- Preview: The table container auto-scrolls to the first rule row for the selected config. Scrolling is confined to the table container; the page itself never scrolls due to these actions.

### Persistence & Autosave

- Autosave payload key: `sellfileCreator.autosave.hsfc.v1`. Content: `[crc32, payload]` where `payload = { Metasets, Minima, Configs, FinalSellRemainder, version }`.
  - A CRC32 is stored alongside the payload to detect corruption or partial writes. On corruption, the key is cleared.
  - On first load, if a valid autosave exists, the UI offers to restore it. If dismissed, autosave is deferred until state diverges to avoid clobbering the previous draft.
- Substat color preferences:
  - Current key: `sellfileCreator.substatColors.v5` (variant-keyed map: `StatVariant -> { fg, bg }`). Older keys are no longer read.
- Table settings:
  - Column layout key: `rulesTableCols.v2` (array of `{ key, label, width, visible, mode? }`), merged against defaults on load. `mode` applies to Faction column (tri‑state: `auto|show|hide`).
  - Wrap toggle key: `rulesTableWrapRows.v1` (boolean). Default is `false` (single‑line rows by default).
- Important: localStorage persistence is not guaranteed when running from `file://`. Use dev/preview servers for reliable storage.

### Preview Table (performance & UX)

- Sticky header & scrolling:
  - Header remains visible (`stickyHeader`) while the `TableContainer` scrolls; page never scrolls for preview.
  - Uses `tableLayout: fixed` to keep column widths stable; horizontal scroll only when total visible width exceeds container width.
- Virtualization:
  - Fixed‑height fast path when wrapping is off (single‑line rows at ~30px; computes visible window from `scrollTop`).
  - Variable‑height mode when wrapping is on: caches row heights, builds prefix sums, uses binary search to compute visible range; overscan applied; spacer rows maintain scroll height.
  - The table no longer shows a “Showing X–Y of Z” indicator; users can visually gauge range while scrolling.
- Header interactions:
  - Right‑click header menu: Reset columns (also resets Multi‑line rows to Off), Auto‑fit widths, Multi‑line rows toggle (persists), per‑column visibility (Faction supports `auto|show|hide`).
  - Drag headers to reorder; drag a column’s right edge to resize (min width 40px).
  - Auto‑fit measures text widths (monospace for most columns, proportional for Substats) via canvas and scales to available width.
- Row interactions:
  - Hover gating: highlight only while pointer is inside the preview area; clears on leave.
  - Click a row: selects the related config and smoothly scrolls the first matching row into view.
  - Selecting a config chip: smoothly scrolls the first matching table row into view.
- Context menu mirrors chip actions (Duplicate, Move Top/Up/Down/Bottom, Copy, Paste after, Delete). Base rows show Clear.
- Cell styling:
  - Idx column uses green text for Keep, amber for Sell. Disabled rules (`Use === false`) render with a strikethrough.
- Implementation note:
  - Preview table lives in `src/components/HsfRulesTable.tsx` (previously embedded in `App.tsx`). `EllipsisTooltip` only shows a tooltip when content overflows.
  - Internal preview-only metadata (e.g., `__cfgIdx`) is not read from HSF files and is stripped on export; it exists only at runtime in memory.

## Rule Tester

- Purpose: Create example items and evaluate which rule (if any) would match first under “first match wins”. Helps verify merged vs base behavior quickly without exporting.
- UI: Opens from the Sellfile Preview header via the “Rule Tester” button.
- Rules source: Evaluates against the effective rules array provided by the preview (merged base + custom when present). Disabled rules never match.
- Evaluator: `src/lib/ruleEval.ts` exposes `evaluateFirst(rules, item)` (pure). Uses shared rank/rarity coverage helpers from `src/lib/codeCoverage.ts`.
- Autosave: Session persists under `AUTOSAVE_TESTER_KEY` and restores when the dialog opens.
- Tester item shape (readable summary):
  - Slot (`ArtifactTypeId`), Set (`ArtifactSetId`), Rank (`1..6`), Rarity (`1..6` Common..Mythical), Level (`0|4|8|12|16`), Faction (`FactionId` for accessories), Main (`StatVariant`), Substats as absolute values (variant→value) preserving user order.
  - Present substats count derives from rarity and level; values clamp to per‑rank minima from `minima` tables. Substats equal to the selected main or not allowed by slot are filtered out. Missing substats are auto‑filled from allowed candidates up to the presence count.
- Sentinel IDs (tester‑only): `TESTER_NO_SET_ID = 0` means “None — Only accessories” for accessory slots; `TESTER_ANY_SLOT_ID = 0` means “Any slot” and only matches rules that do not restrict slots.
- Constants: Layout sizing is centralized in `src/lib/constants.ts` (`TESTER_*` widths and heights, result row minimum height) to keep the dialog compact and stable across locales.

## Migration Notes (HSFC)

- Rarity labels: The parser accepts human‑readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). If multiple are provided, precedence is `rarityCode` → `Rarity`.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in‑app metasets, or against embedded `Metasets` for full HSFC objects. To ensure consistent resolution across machines, include `Metasets` in HSFC exports or pre‑create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower‑bound roll schedules, and no Mythical pre‑roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre‑roll), switch to exact `Legendary`/`Mythical`.
- Per‑config pruning: Obsolete pruning runs per config before merging, so preview table counts match the builder chip. Cross‑config overlaps remain visible by design.
- Back‑compat: New HSFC exports include `minLevel` and `maxLevel` and omit `rollMode`/`rollBaseline`/`startLevel`. The parser continues to accept legacy fields and derives a window of `[startLevel..16]` when `minLevel/maxLevel` are not provided. Presence‑only (legacy `rollMode: 'off'`) remains supported.

## Roadmap

- Optional “Debug” JSON views for `.hsf` / `.hsfc`.
- Inline edit for chip names and keyboard shortcuts.
- Stricter HSFC schema validation and helpful error messages.

## Possible Refactorings

- Extract the sellfile preview scroll-alignment logic into a tested utility so the table component focuses on rendering and the pending-scroll state can be unit-tested.
- Move the tutorial highlight geometry + DOM querying into a dedicated hook that returns the computed rect and cleanup callbacks; makes it easier to swap the implementation when we add async overlays.
- Fold the builder attention nudges into a reducer alongside `selectedIsDirty` so the timing/phase state lives with the rest of the builder logic instead of ad-hoc effects.
- Revisit drag/drop handling once we add file queues: a small event publisher (one listener, multiple subscribers) would remove the remaining imperative listeners in components.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.

## Layout Notes (responsive + headers)

- Fixed widths
  - “Configs Builder” and “Sellfile Preview” each render at `PANEL_WIDTH_PX` content width in both stacked and side‑by‑side layouts.
  - When stacked, each Paper uses `width: 100%` with `maxWidth: PANEL_WIDTH_PX` and centers via `mx: 'auto'`.
- Side‑by‑side breakpoint
  - At viewport widths ≥ `SIDE_BY_SIDE_BREAKPOINT_PX` the two Papers render side‑by‑side and are centered together as a pair.
  - Implemented with a full‑bleed wrapper and a fixed‑width grid centered via `left: 50%` + `transform: translateX(-50%)`.
  - Grid: `gridTemplateColumns: '${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px'`, `columnGap: ${GRID_COLUMN_GAP_PX}px` (total width `SIDE_BY_SIDE_BREAKPOINT_PX`).
- Preview height cap
  - “Sellfile Preview” never exceeds the height of “Configs Builder”. A `ResizeObserver` tracks the left Paper height and applies it as `maxHeight` to the right Paper, which is a vertical flex container so the table scrolls within.
- Inline header captions
  - The descriptive text for “Base Sell File (.hsf)” and “Configs Builder” is rendered to the right of the `h6` title using a two‑column grid (`gridTemplateColumns: 'auto 1fr'`, `alignItems: 'center'`). The caption wraps within the right column.
