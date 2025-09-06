# Technical Details

This document is for developers and contributors. For user-facing instructions, see the top-level README.

## Stack

- React 18 + TypeScript + Vite
- Material UI v6 (dark theme) + Emotion

## Development

Prerequisites
- Node.js 18+

Scripts
- `npm install` — install dependencies
- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist`
- `npm run preview` — preview the built app
- `npm run typecheck` — run `tsc --noEmit`

Checks before handoff
- For code changes (anything beyond docs), run `npm run typecheck`, `npm run lint`, and `npm run build` and fix any issues. For docs‑only changes, you can skip these.

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
  - Plugins: `@typescript-eslint`, `react`, `import`, `react-hooks`
  - Key rules: `@typescript-eslint/no-explicit-any: error`, `react/jsx-no-undef: error`, `react/react-in-jsx-scope: off`, `react/prop-types: off`
  - Scripts: `npm run lint`, `npm run typecheck`
- Dev-time checks: Vite runs TypeScript and ESLint in parallel using `vite-plugin-checker` with an in‑browser overlay.

Coding patterns adopted during the refactor (required for PRs):
- Conditional spreads for optional fields: only add optional object keys when values are defined (satisfies `exactOptionalPropertyTypes`).
- Index safety: when `noUncheckedIndexedAccess` applies, add bounds checks or use non‑null assertions (`!`) only after guarding lengths/indices.
- Unknown inputs: treat pasted/uploaded JSON and DOM/drag/clipboard data as `unknown`; parse via small, focused type guards.
- Style/prop values: avoid passing `undefined` into style props/components. Provide explicit defaults or omit the prop.
- Arrays and reordering: copy arrays before mutation; guard splice/swap indices to avoid `undefined` reads.
- CRC32 table and binary searches: keep tables/arrays typed; add non‑null assertions in tight loops when indices are ensured valid.

HSF/HSFR specifics tightened for safety:
- Builder outputs (HSF):
  - Always include `Rank`, `Rarity`, and `Faction` (0 = Any).
  - Always include `ArtifactSet` and `ArtifactType` (emit `[]` when unfiltered).
  - `LVLForCheck` is omitted only when `rollMode === 'off'` and `startLevel === 'any'` to mean “any level”.
  - `Substats` always contains 4 entries (selected + padded).
- HSFR normalize: `normalizeConfig(input: unknown)` builds a `BuilderConfig` by assembling a base object and conditionally adding optional fields; never assigns `undefined` to optional keys.


Note on opening via file://
- If contributors open `index.html` directly from the filesystem (file://), expect limited or non‑persistent storage in many browsers. LocalStorage writes used by autosave, color preferences, and table settings may not persist. Prefer `npm run dev` or `npm run preview` to serve over http for reliable persistence.

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, configs, metasets, minima, autosave, preview.
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customCfgs`, `metasets`, `minima`, `includeAllExplicitMeta`, `selectedCfgIdx`, `hsfrNote`.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
  - Wraps `<App />` in `AppStateProvider`, seeding with `defaultMinima()` and `defaultMetasets()`.
- `src/lib/constants.ts`: Centralized app‑wide constants (storage keys, layout widths, UI sizes).
  - UI helpers include `UI_BG_TRANSITION` (shared background‑color transition) and file accept strings `ACCEPT_HSF`/`ACCEPT_HSFR`.
- `src/lib/merge.ts`: Pure function to compute merged rules for preview (`computeMergedRules`).
- `src/lib/hsfIO.ts`: HSF read/write helpers — parse `.hsf` files, build sanitized HSF payloads from merged rules, and serialize to Blob.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderConfig.fixedSubstatsV` (subset of `substatsV`) are always included in generated combinations.
  - Exposes `defaultMinima()` and `MinimaTable` to configure per‑rank substat minima (1★..6★). Internally these tables are StatVariant‑keyed (numeric) for speed; HSFR export converts them to label‑keyed maps for readability.
- `src/lib/hsfrIO.ts`: HSFR read/write helpers used by Save/Copy/Paste and context menus (normalize readable HSFR → variant model; build readable HSFR payloads from variant state; serialize to Blob). Exports labels via `labelOfVariant` (no `{ id, isFlat }`).
- `src/lib/icons.ts`: Small utility icon builders (e.g., `makeManageColorsIcon()` for the Manage Colors button).
- `src/lib/filenames.ts`: Export filename helpers (`sellfileFilename`, `hsfrFilename`) with timestamping.
- `src/lib/clipboard.ts`: Clipboard helpers (`writeTextSafe`, `readTextSafe`) and `COPY_DIALOG_EVENT` for opening the manual copy dialog.
- `src/hooks/useSubstatColors.ts`: Hook for substat color map defaulting and persistence.
- `src/hooks/useFileDragDrop.ts`: Hook for global file drag/drop listeners; exposes `active` overlay state.
- `src/hooks/useAutosave.ts`: Hook to write autosave payloads and flush on exit/visibility.
- `src/components/CopyDialog.tsx`: Fallback manual copy dialog (shown when clipboard writes are blocked).
- `src/components/PasteDialog.tsx`: Manual paste dialog for HSFR content (single config, array, or full HSFR object).
- `src/components/dialogs/ManageColorsDialog.tsx`: Substat colors management dialog (variant‑keyed map).
- `src/components/dialogs/RestoreAutosaveDialog.tsx`: Restore autosave confirmation dialog.
- `src/components/ConfigChipsPanel.tsx`: Config chips list and context menu.
- `src/components/HeaderActions.tsx`: HSFR header controls (Load/Save/Delete/Note/Count).
- `src/components/PreviewHeaderActions.tsx`: Preview header controls (Load/Clear HSF, Export, Manage Colors, count chip).
- `src/components/FileDragOverlay.tsx`: Visual overlay displayed when dragging files over the app.
- `src/lib/types.ts`: Shared formatters (sets, types, rarity, rank, level, stat and faction labels) plus preferred orders/comparators for slots/sets.
- `src/components/artifactTypeIcons.tsx`: Local Material Symbols (outlined, 24px) inline SVGs and a unified artifact slot icon map used by Builder and Config chips.
  - Substat Colors (chips):
    - Storage: `localStorage['substatColors.v5']` as `Record<number, { fg: string; bg: string }>` keyed by `StatVariant` (numeric).
    - Defaults: `DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT` and `DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT` (distinct flat vs percent colors for HP/ATK/DEF).
    - Usage: Manage Colors reads/writes the variant‑keyed map; preview chips compute the variant via converters and look up colors.
    - Config chips: when “Color stat buttons” is on, mainstat/substat labels in config chips use the same `fg` color as the preview chips.
    - Rationale: One variant‑keyed map avoids `id/flat` pairs and duplicate catalogs.
  - `StatVariant` encodes stats for UI/state using `(HSF Stat ID << 8) | flatFlag` where `flatFlag` is `0` for percent/default and `1` for flat. For HP/ATK/DEF, both percent and flat variants exist (e.g., `HP` vs `HP_FLAT`); others are fixed: SPD/RES/ACC use `flat=1`, CR/CDMG use `flat=0`.
- `ARTIFACT_RULES.md`: Artifact-related reference notes.

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

HSFR (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": MinimaTable, "Configs": ReadableConfig[], "IncludeAllExplicitMeta": boolean, "SelectedConfigIndex"?: number }`. Also accepts a raw array `ReadableConfig[]` for convenience.
- `Metaset` write format: `{ id: string; name: string; setNames: string[]; show?: boolean }` — named group of artifact set NAMES. Defaults are created if omitted.
- `ReadableConfig` (write format, used by Save and Copy) includes only readable labels — no numeric IDs:
  - `name?`, `keep`, `enabled`
  - `Rank`: string (e.g., `"≥ 5★"`)
  - `Rarity`: string (e.g., `"Legendary"`)
  - `Faction`: string (e.g., `"High Elves"`)
  - `mainStats`: string[] (e.g., `["HP%","SPD"]`)
  - `startLevel`: 0 | 4 | 8 | 12 | 16 | `"any"`
  - `rollBaseline`: `'afterStart' | 'upToLevel'`
  - `rollMode`: `'off' | 'strict' | 'potential' | 'auto'`
  - `substats`: string[] (labels)
  - `fixedSubstats`: string[] (labels, subset of `substats`)
  - `substatRollBounds`: label‑keyed map `{ [label: string]: { min?: number; max?: number; any?: boolean } }`
  - `minCount`, `autoMinCount?`
  - `artifactTypeNames?`: string[]
  - `artifactSetNames?`: string[]
  - `artifactMetaSetNames?`: string[] (metaset names)
- `MinimaTable` write format: label‑keyed maps.
- Compatibility: HSFR loader accepts only the readable schema (labels). HSF IO maintains its legacy compatibility; no legacy handling is performed for HSFR.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.

IO Helpers (HSFR)
- Parse text/file: `parseHsfrText`, `readHsfrFile`.
- Build & write: `buildReadableConfig`, `minimaToReadable`, `buildHsfrPayload`, `hsfrToBlob`.
- Object parsing: `parseHsfrObject` normalizes a pre-parsed HSFR payload (readable schema). Autosave stores the same HSFR payload with a CRC and restores via this parser.
- HSFR parsing expects readable schema; only HSF retains legacy compatibility.

Clipboard Helpers
- `src/lib/clipboard.ts` centralizes clipboard interactions:
  - `writeTextSafe(text)` and `readTextSafe()` wrap the async Clipboard API with security checks and failure handling.
  - When writes are blocked, components dispatch `COPY_DIALOG_EVENT` to request that the App open a manual copy dialog prefilled with the content.
  - Fallback UI lives in `src/components/CopyDialog.tsx` (copy) and `src/components/PasteDialog.tsx` (paste).

Autosave
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'autosave.hsfr.v1'`). Value is `[crc32, payload]` where `payload` is a readable HSFR object (`buildHsfrPayload`) and `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, minima, configs, includeAllExplicitMeta, selectedConfigIndex, note })` handles reading the entry, opening the Restore dialog when appropriate, and enabling autosave at the right time.
- Restore vs Dismiss:
  - Restore: applies the saved session (metasets, minima, configs, note, selection) and enables autosave.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden.
- file:// note: LocalStorage behavior varies for file origins and can be non‑persistent or path‑scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.

App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`hsfrIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.

Hooks and Shared Components
- `src/hooks/useAutosaveRestore.ts`: Encapsulates autosave restore prompt, dismiss baseline, and enablement.
- `src/hooks/useManageColorsDialog.ts`: Manages Manage Colors dialog state + persisted substat colors.
- `src/hooks/useMinimaDialog.ts`: Manages Substat Values (Minima) dialog state.
- `src/hooks/useMetasetsDialog.ts`: Manages Manage Metasets dialog state.
- `src/hooks/useConfirmDialog.ts`: Generic confirm dialog state.
- `src/components/FilePickerButton.tsx`: Reusable file‑picker button (label + hidden input) with `accept` and `onSelect` props.

Internal vs IO representation
- UI and builder state use StatVariant‑based fields: `mainStatsV`, `substatsV`, `fixedSubstatsV`, and `substatRollBoundsV` (variant‑keyed map).
- HSFR write paths (Save, Copy All, Copy single config) output the readable form described above: labels for stats, metaset names, and label‑keyed minima/bounds.
- HSFR read paths accept only the readable HSFR schema. Autosave stores a readable HSFR payload (plus CRC).
- HSF files are read and written exactly as before; no changes to HSF IO.

Display helpers
- Prefer `labelOfVariant(variant)` for UI rendering of stats.
- Avoid redundant `variantToSub(...)` followed by `statNameFromId(...)` in presentation code. Reserve `variantToSub` for HSF/HSFR IO and builder internals where `(id, isFlat)` tuples are required.
- Slot icons: render via the shared map in `src/components/artifactTypeIcons.tsx` (keeps visuals consistent between Builder slots and Config chips; no runtime font dependency).
- Set tooltips: texts live in `src/lib/setDescriptions.ts` and are rendered by `WithSetTooltip`/`getSetTooltipContent` from `src/components/SetTooltip.tsx`.
  - Texts are concise, effect‑only summaries and may contain explicit inline tags: `{buff:Name}` or `{debuff:Name}`. Only tagged terms are colorized (blue for buffs, red for debuffs). There is no heuristic keyword detection.
  - Explicit newlines (`\n`) in description strings render as separate lines in the tooltip.
  - Variable (1–9) sets use `byPieces` to render numbered lines `1: …` through `9: …`.
  - Consumers should wrap set labels with `WithSetTooltip` to get the tooltip (used in Builder select and Metasets dialog).
 - Roll badges: when `rollMode === 'off'`, badges are visually disabled and render as a neutral hollow circle (no text/fill, neutral border); interactions are disabled.

Ordering (UI + export)
- Slots: use a fixed preferred order for artifact types — Weapon, Helmet, Shield, Gauntlets, Chestplate, Boots, Ring, Amulet, Banner — implemented by `compareArtifactTypes`.
- Sets: use game order (numeric ID ascending) — implemented by `compareArtifactSets`.
- UI: `formatArtifactTypes(...)` and `formatArtifactSets(...)` sort before rendering; Config chips also sort slot icons.
- HSFR export: `buildReadableConfig(...)` writes `artifactTypeNames` and `artifactSetNames` sorted; `buildHsfrPayload(...)` writes metaset `setNames` sorted by game order.
- HSF export: `buildHsfRules(...)` sorts `ArtifactType` and `ArtifactSet` arrays for stable output.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (0/4/8/12/16) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Levels are the milestones 0/4/8/12/16.
- Count Rolls baseline (`rollBaseline`): `'afterStart'` (From) counts rolls strictly after the selected start; `'upToLevel'` (All) includes prior rolls up to each level.
- Substat thresholds: base minima derive from star bucket inferred from `rankCode` (see `starForRankCode`). Each “roll” adds another base minimum for that substat.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base minima derive from star bucket inferred from `rankCode` (see `starForRankCode`). Roll distributions add multiples of the base minimum for each roll allocated to a substat.
- Mythical pre‑roll: When rarity selection includes Mythical (exact 15, ranges that include Mythical, or `>= Legendary`), treat there as being one pre‑roll at level 0 on one substat. Note: `Any` (0) does not assume Mythical pre‑roll.
  - Baseline `'upToLevel'` counts this pre‑roll at every level; `'afterStart'` counts it only if `startLevel` is 0.
  - The target budget by +16 is therefore 5 rolls when Mythical is included (4 otherwise).
- Fixed substats: rule permutations always include all fixed substats, and pick additional substats from the remaining selected ones so the size is `max(minCount, fixedCount)`, capped at 4.
- Mainstat expansion: because HSF does not accept an array for main stat, multiple selections are unrolled into separate rules, one per selected main stat. An empty selection emits HSF rules with `MainStatID = -1` (Any).
 - HSF export always writes both `MainStatID` and `MainStatF` (using `-1` and `1` for “Any”).

### Roll Semantics (builder)

- Badges (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
  - `min = N (1..5)`: require at least N rolls; generates lower‑bound rules after feasibility, and (in Potential) progress rows before feasibility.
  - `max = N (0..4)`: cap rolls at N. A `max = 0` forbids rolls on the substat (presence/base value only). Distributions exceeding a cap are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores badges entirely (presence at start level only).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and Max do not affect Auto resolution.
- Feasibility: at a level, let `avail` be the number of rolls credited by the baseline. The set of min badges is feasible if `sum(mins) <= avail`.
- After feasibility: both Strict and Potential keep enforcing the same lower‑bound (exact mins) on later levels so “at least N” remains true.
  - Duplicate avoidance: In Potential mode, once feasible, the generator skips the exact‑min distribution from the partial‑progress set and emits the exact‑min lower‑bound once. This prevents duplicate rows (e.g., SPD(2) at 16).
  - Caps enforcement: For both Strict and Potential, distributions violating any `max` are filtered at generation. Progress rows and lower‑bounds alike respect caps.

## Clipboard and Context Menus

- The chip area always renders (min height) and supports a context menu with “Copy All (.hsfr)” and “Paste”. When empty, a centered hint invites right‑click Paste.
- Chip context menu includes: Duplicate, Move to Top/Up/Down/Bottom, Copy to Clipboard, Delete.
- Copy All copies a full HSFR object `{ Version, Metasets, Minima, Configs, IncludeAllExplicitMeta }` via `buildHsfrPayload` to preserve state on paste.
- Paste accepts: single `BuilderConfig`, array of configs, or a full HSFR object in the readable schema. Legacy forms are not normalized.
- Clipboard fallback: in non‑secure contexts (not HTTPS/localhost), programmatic clipboard is blocked, so the app opens a dialog with pre‑selected text for manual copy/paste.

## Save/Load Guarantees

- Saver writes `{ Version, Metasets, Minima, Configs, IncludeAllExplicitMeta, SelectedConfigIndex? }` (via `buildHsfrPayload`) and downloads `*.hsfr`. When no config is explicitly selected, the last config index is saved by convention so loaders can preserve intent.
- Loader (`readHsfrFile`) accepts the readable HSFR schema and preserves `substatRollBounds.any`, `min`, and `max` (clamped to valid ranges; `min` 0..5, `max` 0..4). Legacy HSFR shapes are not supported.
- Copy All mirrors the saver payload (including `SelectedConfigIndex`) to enable full round‑trip via copy/paste.

## Behavioral Details

- Min vs Max exclusivity: The builder now enforces mutual exclusivity; toggling one clears the other. HSFR persists only the active choice (`min`, `max`, or `any`).
- Max/caps enforcement: Rule generation filters distributions that exceed a per‑substat `max`. A `max = 0` enforces “no rolls” on that substat.
- Auto resolution: Auto now keys strictly off `min ≥ 1` across selected substats; star and max are ignored for Auto.
- Rank Any uses 6★ baseline: When `rankCode = 0` (Any), base minima map to the 6★ bucket for threshold generation (conservative default).
- Rarity ranges (≥): Conservative lower-bound behavior. `rollLevelsForRarityCode` maps `≥ Common..≥ Epic (6..9)` to the lower bound’s schedule (Common/Uncommon/Rare/Epic), and `≥ Legendary (16)` to Legendary. `rarityIncludesMythical` no longer assumes Mythical for any `≥` range; only exact Mythical (15) and `≤ Mythical (14)` imply the Mythical pre‑roll.
- Rarity label parsing: HSFR normalize accepts human‑readable `Rarity` strings (e.g. `"≥ Epic"`, `"Legendary"`, `"Any"`) and maps them to canonical codes. Numeric `rarityCode` is also accepted; `rarityExact` is no longer supported.
- Metaset name resolution on paste: `parseConfigsFromText(text, metasets)` resolves `artifactMetaSetNames` against the caller‑provided current metasets. For full HSFR objects, `parseHsfrObject` resolves names against embedded `Metasets`; if absent, falls back to the app’s current metasets (`prev.metasets`). No default metasets are injected implicitly.
- Per‑config pruning: Obsolete elimination now runs per config before merging, so preview table counts match the builder’s chip count. Cross‑config overlaps remain visible for auditability.
- Obsolete comparator: Compares substats by the same StatVariant and raw Value for the same operator (no normalization to rolls). Tie‑break prefers earlier rule indices within a config when values are equal.

## File Import UX

- Global drop target: The entire app window accepts file drops. Local dropzones were removed to reduce friction. Implemented via `useFileDragDrop` + `FileDragOverlay`.
- Overlay on file drag: A full‑screen, non‑interactive overlay appears on real file drags, indicating that `.hsfr` (configs + metasets) and `.hsf` (sellfile) are accepted. Overlay uses `pointer-events: none` so it never blocks the actual drop.
- Routing by extension: Drops are dispatched by filename extension — `.hsfr` → HSFR loader (`readHsfrFile`), `.hsf` → HSF loader (`readHsfFile`). Unknown extensions are ignored.
- Safety: Only intercept drags when `DataTransfer.types` includes `Files`; component drags (e.g., table column reorder) are unaffected.

## HSFR Global Note

- Schema: HSFR may include an optional root-level `Note: string` with Markdown content.
- Load: When an HSFR with `Note` is loaded, a modal dialog opens automatically (view‑only). The dialog can also be opened via the always‑visible “Add/Edit Note” button in the HSFR controls row.
- Edit: The dialog uses an embedded Markdown editor (`@uiw/react-md-editor`) with sanitized previews (`rehype-sanitize`). We keep the editor in a dedicated component `src/components/NoteDialog.tsx`.
- Save/Copy: If a Note exists (non‑empty), HSFR exports and “Copy all Configs” include it.
- Paste semantics: Pasting HSFR content (via context menu or manual paste) only overwrites the current note if the current note is empty. Loading a file always overwrites the current note.
- Dependencies: `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, and `rehype-sanitize`.

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
- Mainstat is multi-select with 3 rows of toggle buttons: Any, then HP/HP%/ATK/ATK%/DEF/DEF%, then SPD/RES/ACC/CR%/CDMG%. Buttons share a fixed minWidth; Any is double width for emphasis. Internally stores `mainStatsV: StatVariant[]` (empty = Any). HSFR export converts these to readable labels.
- Substats is a multi-select `ToggleButtonGroup` with the same 3-row order and widths (StatVariant). `Any` is mutually exclusive with specific substat buttons and maps to empty selection (meaning Any). When specifics are selected, Any is ignored/cleared.
  - Each selected substat shows a right‑side badge cycling: `★ → 0 → 1 → … → 5 → ★`. New selections start at `★`.
  - Badge semantics: `★` wildcard (all options), `0` no minimum (presence), `N` at least N rolls (min‑only after feasible).
- Required substats shows a caption warning if `minCount > substats.length`. The warning area is reserved below the control (absolute overlay) to avoid layout shifts.
- Optional `autoMinCount` mode surfaced as a toggle button in the Required selector. Buttons are: Auto, 1, 2, 3, 4. When Auto is selected, the UI keeps `minCount` synced to `min(4, substatsV.length)`. Selecting a number disables auto. Clearing Substats sets `minCount=0`.
- Min required rolls: a second toggle cluster after Required substats with `Auto, 1..5`. When enabled (not Auto), it enforces an aggregate lower bound on the total rolls across the selected substats. In Strict mode, distributions that fail the aggregate are filtered; in Potential mode, early progress rows are kept only if the aggregate can still be met by +16. In Roll Strategy = Auto, setting it > 0 switches Auto to Potential.
- Defaults: `rarityCode=0` (All), `rollMode='auto'`, `autoMinCount=true` (Required defaults to Auto; effectively 0 until substats are chosen). Stats and sets/types/factions are driven by enums (`StatVariant`, `ArtifactSet`, `ArtifactType`, `Faction`).
- Reset defaults sets: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStatsV=[]`, `startLevel=0`, `rollMode='auto'`, `minCount=0`, `autoMinCount=true`, `substatsV=[]`, clears `artifactTypes`/`artifactSets`.

- Config chips: Container is height-limited (about 6 chips) with vertical scroll. After “Add as new config”, the new chip is auto-selected and the chips container scrolls that chip to the top without scrolling the page.
- Preview: The table container auto-scrolls to the first rule row for the selected config. Scrolling is confined to the table container; the page itself never scrolls due to these actions.

### Persistence & Autosave

- Autosave payload key: `autosave.hsfr.v1`. Content: `[crc32, payload]` where `payload = { Metasets, Minima, Configs, IncludeAllExplicitMeta, version }`.
  - A CRC32 is stored alongside the payload to detect corruption or partial writes. On corruption, the key is cleared.
  - On first load, if a valid autosave exists, the UI offers to restore it. If dismissed, autosave is deferred until state diverges to avoid clobbering the previous draft.
- Substat color preferences:
  - Current key: `substatColors.v5` (variant-keyed map: `StatVariant -> { fg, bg }`). Older keys are no longer read.
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

## Migration Notes (HSFR)

- Rarity labels: The parser accepts human‑readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). If multiple are provided, precedence is `rarityCode` → `Rarity`.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in‑app metasets, or against embedded `Metasets` for full HSFR objects. To ensure consistent resolution across machines, include `Metasets` in HSFR exports or pre‑create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower‑bound roll schedules, and no Mythical pre‑roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre‑roll), switch to exact `Legendary`/`Mythical`.
- Per‑config pruning: Obsolete pruning runs per config before merging, so preview table counts match the builder chip. Cross‑config overlaps remain visible by design.
- Back‑compat: Legacy shapes and readable labels for `mainStat`, `substats`, and set/type fields are supported. Optional fields are omitted rather than assigned `undefined`. Unknown fields are ignored.

## Roadmap

- Optional “Debug” JSON views for `.hsf` / `.hsfr`.
- Inline edit for chip names and keyboard shortcuts.
- Stricter HSFR schema validation and helpful error messages.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.

## Layout Notes (responsive + headers)

- Fixed widths
  - “Add Configs and Rules” and “Preview” each render at `PANEL_WIDTH_PX` content width in both stacked and side‑by‑side layouts.
  - When stacked, each Paper uses `width: 100%` with `maxWidth: PANEL_WIDTH_PX` and centers via `mx: 'auto'`.
- Side‑by‑side breakpoint
  - At viewport widths ≥ `SIDE_BY_SIDE_BREAKPOINT_PX` the two Papers render side‑by‑side and are centered together as a pair.
  - Implemented with a full‑bleed wrapper and a fixed‑width grid centered via `left: 50%` + `transform: translateX(-50%)`.
  - Grid: `gridTemplateColumns: '${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px'`, `columnGap: ${GRID_COLUMN_GAP_PX}px` (total width `SIDE_BY_SIDE_BREAKPOINT_PX`).
- Preview height cap
  - “Preview” never exceeds the height of “Add Configs and Rules”. A `ResizeObserver` tracks the left Paper height and applies it as `maxHeight` to the right Paper, which is a vertical flex container so the table scrolls within.
- Inline header captions
  - The descriptive text for “Base Sell File (.hsf)” and “Add Configs and Rules” is rendered to the right of the `h6` title using a two‑column grid (`gridTemplateColumns: 'auto 1fr'`, `alignItems: 'center'`). The caption wraps within the right column.
