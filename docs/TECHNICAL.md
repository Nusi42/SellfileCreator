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
- `npm run release:win` — Windows: build and create a versioned 7z archive in repo root

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
  - Emits rules only for milestone levels within an explicit window `[minLevel..maxLevel]` (inclusive). Levels are 0/4/8/12/16.
  - Levels where the selected `minCount` substats cannot physically exist for the item’s rarity (e.g., Epic has only 3 substats before +16) are skipped.
  - `Substats` always contains 4 entries (selected + padded).
- HSFR normalize: `normalizeConfig(input: unknown)` builds a `BuilderConfig` by assembling a base object and conditionally adding optional fields; never assigns `undefined` to optional keys. New readable fields `minLevel` and `maxLevel` are preferred; legacy `rollMode`/`rollBaseline`/`startLevel` are still parsed for backward compatibility.


Note on opening via file://
- If contributors open `index.html` directly from the filesystem (file://), expect limited or non‑persistent storage in many browsers. LocalStorage writes used by autosave, color preferences, and table settings may not persist. Prefer `npm run dev` or `npm run preview` to serve over http for reliable persistence.

## Release Packaging (Windows)

- Requires 7-Zip under `%USERPROFILE%\Tools\7-Zip\7z.exe` (fallback: `7zG.exe`).
- Run `npm run release:win` to produce `SellfileCreator_vX.Y.Z.7z`.
  - The script runs tests first (`npm run test:hsfr`). If tests fail, it restores the original `package.json` and aborts — no archive is produced.
  - The script first "cleans" the version in `package.json` by stripping any `-dev` (or other pre-release) suffix, uses that for the build/archive, then bumps the patch and writes back `-dev` (e.g., `1.2.3-dev` → build `1.2.3`, archive `SellfileCreator_v1.2.3.7z`, then set `1.2.4-dev`).
  - Safety: If the build or archive step fails, the script restores the original `package.json` (including its version), and no archive is produced.
  - Additionally, copies the built `dist/index.html` to `old_releases/SellfileCreator_vX.Y.Z.html` for quick reference.
- Archive contents (no subdirectories):
  - `SellfileCreator.html` — from `dist/index.html` (renamed)
  - `README.txt` — from `README.md`
  - `Sample_Endgame.hsfr` — from `samples/KruysenVideo_upToMinute31.hsfr`
  - `Sample_Endgame.hsf` — from `samples/KruysenVideo_upToMinute24.hsf`
  - `runme.bat` — starts default browser with `SellfileCreator.html`

## Project Structure

- `src/App.tsx`: Main UI — orchestrates builder, configs, metasets, minima, autosave, preview.
- `src/components/HelpDialog.tsx`: In‑app Help/README viewer. Bundles the top‑level `README.md` (via Vite `?raw`) and renders it with the Markdown previewer used elsewhere (sanitized, read‑only).
- `src/state/appState.tsx`: Context + reducer for core app state. Exposes `AppStateProvider`, `useAppState`, `useAppActions`, and `makeInitialAppState`. Fields: `customCfgs`, `metasets`, `minima`, `finalSellRemainder`, `selectedCfgIdx`, `hsfrNote`.
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
- `src/components/PreviewHeaderActions.tsx`: Sellfile Preview header controls (Load/Clear HSF, Export, Manage Colors, count chip).
- `src/components/FileDragOverlay.tsx`: Visual overlay displayed when dragging files over the app.
- `src/lib/types.ts`: Shared formatters (sets, types, rarity, rank, level, stat and faction labels) plus preferred orders/comparators for slots/sets.
- `src/components/artifactTypeIcons.tsx`: Local Material Symbols (outlined, 24px) inline SVGs and a unified artifact slot icon map used by Builder and Config chips.
  - Substat Colors (chips):
- Storage: `localStorage['sellfileCreator.substatColors.v5']` as `Record<number, { fg: string; bg: string }>` keyed by `StatVariant` (numeric).
    - Defaults: `DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT` and `DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT` (distinct flat vs percent colors for HP/ATK/DEF).
    - Usage: Manage Colors reads/writes the variant‑keyed map; preview chips compute the variant via converters and look up colors.
    - Config chips: when “Color stat buttons” is on, mainstat/substat labels in config chips use the same `fg` color as the preview chips.
    - Rationale: One variant‑keyed map avoids `id/flat` pairs and duplicate catalogs.
  - `StatVariant` encodes stats for UI/state using `(HSF Stat ID << 8) | flatFlag` where `flatFlag` is `0` for percent/default and `1` for flat. For HP/ATK/DEF, both percent and flat variants exist (e.g., `HP` vs `HP_FLAT`); others are fixed: SPD/RES/ACC use `flat=1`, CR/CDMG use `flat=0`.
- `ARTIFACT_RULES.md`: Artifact-related reference notes.
- `samples/orig/`: Folder with samples generated by RSL Helper. Use as fallback in case rules are unclear.
- `samples/`: Folder with potentially older and broken samples generated by this tool. Use only for historical comparisions.
 - `tests/`: End-to-end HSFR-driven tests compiled and executed by Node (no runner).
 - `tests/test-hsfr-e2e.ts`: Ports builder scenarios and validates HSFR IO → normalize → builder end-to-end.
 - `tsconfig.tests.json`: Test-only TS config. Compiles selected `src/lib/**` files and `tests/**` to `scripts/.tmp` for Node to execute.
 - `scripts/patch-esm-specifiers.cjs`: Post-compile helper that adds `.js` extensions to relative ESM imports in compiled test artifacts under `scripts/.tmp/src/lib/` so Node can resolve them without a bundler. Runs as part of `test:hsfr`.
  - `npm run tests:extract`: Generates `docs/tests.extracted.hsfr.json` containing all HSFR-readable configs used by tests (useful to load/paste into the app).
 - `scripts/release-win.ps1`: Build-and-package script for Windows (runs tests first, builds, stages, archives).
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

HSFR (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": MinimaTable, "Configs": ReadableConfig[], "FinalSellRemainder": { artifacts: boolean; accessories: boolean; levels: (0|4|8|12|16)[] }, "SelectedConfigIndex"?: number }`. Also accepts a raw array `ReadableConfig[]` for convenience.
  - Writer always includes `FinalSellRemainder` (even when off).
  - Reader: when `FinalSellRemainder` is missing (older files), treat it as off with default ranges `[0,4,8,12]`.
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
- Final Sell (remainder) rules: when enabled (at least one gear type and at least one level selected), the merge appends Sell rules for all level milestones (0/4/8/12/16). Milestones not selected in the UI are emitted as disabled (`Use: false`) instead of being omitted. These rules explicitly include all currently known sets in `ArtifactSet` and selected slots in `ArtifactType`. In the preview, these rules render the Sets column as “All Currently Known” to avoid clutter; on export the full numeric set list is written.

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
 - Copy All copies a full HSFR: `{ Version, Metasets, Minima, Configs, FinalSellRemainder, SelectedConfigIndex? }`.
 - Copy single config copies a minimal HSFR: `{ Version, Metasets: [only those referenced by the config], Configs: [readable config] }` so pasting elsewhere brings required metasets.
 - Paste accepts: a single config, an array of configs, or a full HSFR object (readable schema). Legacy shapes are not normalized.

Autosave
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfr.v1'`). Value is `[crc32, payload]` where `payload` is a readable HSFR object (`buildHsfrPayload`) and `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, minima, configs, finalSellRemainder, selectedConfigIndex, note })` handles reading the entry, opening the Restore dialog when appropriate, and enabling autosave at the right time.
- Restore vs Dismiss:
  - Restore: applies the saved session (metasets, minima, configs, note, selection) and enables autosave.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden.
- file:// note: LocalStorage behavior varies for file origins and can be non‑persistent or path‑scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.

App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`hsfrIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.

### Help / README

- Rendering: `src/components/HelpDialog.tsx` renders the top‑level `README.md` (imported as a raw string via `README.md?raw`) using `@uiw/react-md-editor`’s Markdown preview with `rehype-sanitize` for safety.
- First‑run gating: On mount, `App` compares `localStorage.getItem(README_SEEN_VERSION_KEY)` with `APP_VERSION`. If they differ, the Help dialog opens. When the dialog closes, the app writes the current `APP_VERSION` to `README_SEEN_VERSION_KEY` to avoid reopening until the version changes.
- UX: A clearly labeled Help button sits to the right of the three top‑right caption lines in the header and opens the Help dialog on demand.
- Constants: `README_SEEN_VERSION_KEY = 'sellfileCreator.readme.seen.version'` lives in `src/lib/constants.ts` and centralizes the storage key.

### In‑App Tutorial

- Overlay: `src/components/tutorial/TutorialCoach.tsx` renders a lightweight coachmark overlay that highlights elements by `data-tour-id` and shows step text with Back/Next controls. The coach dialog is slightly wider on desktop (`sm: 860px`) to accommodate section breadcrumbs without ellipsis.
- Gating: The tutorial autostarts once on first run for a new version after the Help dialog is closed. Version gating uses `TUTORIAL_SEEN_VERSION_KEY = 'sellfileCreator.tutorial.seen.version'` (in `src/lib/constants.ts`).
- Manual start: `HelpDialog` includes a bottom‑left “Start Tutorial” button. The dialog surfaces README content and acts as the entry point.
- Steps: Built inside `App.tsx` using a typed `TutorialStep[]`. Two scripted examples run in sequence: a basic config (slot + main stat + set + add) and an advanced config (substats + Min required rolls + Milestone Thresholds). Steps can run small `before` actions that set builder state for demonstration.
- Targets: A step can highlight a single `targetId` or multiple `targetIds: string[]`. When multiple are given, the overlay hole covers the union of all target rects.
- Targets: Key controls expose `data-tour-id` attributes: rank/rarity/faction selects, mainstat group, slots (Boots), sets Select, add‑config button, HSFR load/save buttons, Min required rolls and Thresholds groups.

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
- Step normalization: Each step can prepare UI state via `before` (e.g., ensure metasets dialog open/closed, open/close Sets menu, open/close chips context menu, open/close Final Sell dialog). This keeps navigation robust when moving back and forth.
- Targeted closers: To reliably close menus under the overlay, the coach dispatches `Escape` directly to portals (`ul[role=listbox]`, `[data-tour-id="chips.menu"]`, `[data-tour-id="chip.menu"]`) and then sends a synthetic outside click (on `document.body`). Sets menu closing also ESCs the listbox itself.
- Text emphasis: Step bodies support:
  - Backticks `code`: UI keywords rendered primary + bold (e.g., `Sets`, `Milestone Thresholds`).
  - Double tildes `~~brand~~`: brand/emphasis styling with a subtle heartbeat.

Session handling
- Snapshot/restore: On tutorial start, the app snapshots the full HSFR state in memory (configs, selection, metasets, minima, final‑sell, note, builder) and resets to a clean default so the walkthrough is deterministic. On exit or finish, the snapshot is restored exactly.
- Exit hygiene: On exit/finish, the app first closes all transient UI (menus, dialogs, context menus), then restores the snapshot, then closes the coach. This ensures autosave only re‑enables after the original state is back in place.
- Autosave: Paused while the tutorial runs to avoid overwriting the user’s real session. Resumes after exit/finish.

Start/Finish attention effects
- Shared hook: `src/lib/attentionEffects.ts` exposes `useAttentionEffectStyles(enabled)` which returns an `sx` with animated effects. The Start button in `HelpDialog` and the Finish button in the coach reuse this hook (no duplication). Text‑only variants target the `.attention-text` span inside the button.

Common targets (`data-tour-id`)
- `builder.panel`, `builder.action`, `builder.enabled`, `builder.name`
- `builder.mainstat`, `builder.mainstat.spd`, `builder.slots`, `builder.slot.boots`
- `builder.substats`, `builder.required`, `builder.min-rolls`, `builder.thresholds`
- `builder.sets`, `menu.metasets.section`, `builder.manage-metasets`
- `metasets.add`, `metasets.close`, `metasets.dialog`
- `chips.container`, `chips.menu`, `chip.menu`
- `finalsell.toggle`, `finalsell.config`, `finalsell.dialog`, `finalsell.dialog.types`, `finalsell.dialog.levels`, `finalsell.dialog.close`
- `hsfr.save`, `hsf.export`, `preview.paper`

### Extending Tutorial (Sections + Hydration)

- Where to edit
  - Steps and section anchors: `startTutorial()` in `src/App.tsx`.
  - Coach dialog UI (breadcrumbs, animation): `src/components/tutorial/TutorialCoach.tsx`.
  - Transient UI helpers: `ensureMetasetsDialog` / `ensureSetsMenu` / `ensureChipsMenu` / `ensureFinalSellDialog` and `closeAllTransientUi()` inside `startTutorial()`.

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
- HSFR write paths (Save, Copy All, Copy single config) now write compact metaset references by ID: `artifactMetaSetIds: string[]`. For backward compatibility, read paths still accept `artifactMetaSetNames` and map them to IDs by name. The `Metasets` section in HSFR includes `{ id, name, setNames, show? }` so IDs remain readable.
- Copy single config writes `{ Version, Metasets: [subset], Configs: [config] }`.
- Paste‑only flow creates hidden placeholder metasets with generated names for any unknown referenced metaset IDs (chips never show raw IDs).
- HSFR read paths accept the readable HSFR schema. Autosave stores a readable HSFR payload (plus CRC).
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
- Sets (UI): three view modes in the Sets selector — Game (numeric ID ascending), A–Z (alphabetical), and Icons. Icons switches regular sets to an icon‑only grid while metasets stay as a text list. The choice is persisted (`sellfileCreator.setsOrder.v1`) and shared between the Builder and Metasets dialog.
  - Search Sets: A "Search Sets" field filters the list/grid by name. Search text is not persisted; only the view mode is stored.
  - Icon grid: Items show as icons with tooltips (name + details). Selection toggling in icon mode is handled explicitly to avoid missed clicks in dense layouts.
- Sets (export): use game order (numeric ID ascending) — implemented by `compareArtifactSets`.
- UI: `formatArtifactTypes(...)` and `formatArtifactSets(...)` sort before rendering; Config chips also sort slot icons.
- HSFR export: `buildReadableConfig(...)` writes `artifactTypeNames` and `artifactSetNames` sorted; `mainStats`, `substats`, and `fixedSubstats` are also sorted by preferred stat order; `buildHsfrPayload(...)` writes metaset `setNames` sorted by game order.
- HSF export: `buildHsfRules(...)` sorts `ArtifactType` and `ArtifactSet` arrays for stable output and applies `[minLevel..maxLevel]` filtering with feasibility gating and per‑level combo sizing (before +16, use the number of substats physically present for the rarity).
- Builder canonicalization: `buildHsfRules(...)` canonicalizes `mainStatsV` and `substatsV` using `compareVariants` before unrolling/combining so the generated rule order is deterministic and independent of click order. Combinations and roll distributions are enumerated in a stable order.
 - `IsRuleTypeAND`: Exported as `false` for all rules. Current RSL Helper behavior does not require the AND variant for our generated thresholds, and a consistent value improves interoperability across readers.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (0/4/8/12/16) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Rarity “Auto”: HSFR read/write accepts `Rarity: "Auto"`. The builder resolves this to a concrete rarity code before generating HSF rules based on roll requirements and the current level window:
  - Required rolls are the max of aggregate `minRequiredRolls` and the worst‑case sum of per‑stat `min` across generated permutations (fixed + highest mins among the remainder up to `minCount`).
  - Mapping: 0→Any, 1→≥ Uncommon, 2→≥ Rare, 3→≥ Epic, 4→≥ Legendary, 5→Mythical (exact). If `minLevel=0`, Auto also ensures the resolved rarity can have at least `minCount` substats present at +0: 1→≥Uncommon, 2→≥Rare, 3→≥Epic, 4→≥Legendary.
  - Level‑window aware: if the base mapping cannot reach the required rolls by +16 given the baseline/start, Mythical is chosen when it makes the target feasible (pre‑roll at +0); otherwise the base mapping is used and infeasible rows are pruned as usual.
- Levels are the milestones 0/4/8/12/16.
- Level window: HSFR uses `minLevel` and `maxLevel` to bound emitted rules. When reading legacy configs without these fields, the window defaults to `[startLevel..16]` (presence‑only is handled separately via legacy `rollMode: 'off'`).
- Count Rolls baseline (`rollBaseline`): still parsed for legacy configs and used for roll math, but new HSFR exports do not include it.
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

- Badges (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
- `min = N (1..5)`: require at least N rolls; generates lower‑bound rules after feasibility, and (in Potential/Early) early rows before feasibility.
  - `max = N (0..4)`: cap rolls at N. A `max = 0` forbids rolls on the substat (presence/base value only). Distributions exceeding a cap are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores badges entirely (presence at start level only).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential (Early) when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and Max do not affect Auto resolution.
- Feasibility: at a level, let `avail` be the number of rolls credited by the baseline. The set of min badges is feasible if `sum(mins) <= avail`.
- After feasibility: both Strict and Potential (Early) keep enforcing the same lower‑bound (exact mins) on later levels so “at least N” remains true.
- Potential/Early (single-substat fast path): When exactly one substat has a `min ≥ 1` and no wildcard, the builder emits a single early lower‑bound per milestone: `base + min(avail, min) * base`. Thresholds rise until the minimum becomes feasible, then remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
  - After feasibility, the lower‑bound remains enforced at later levels; no additional early rows are emitted.
  - This mirrors the “green roll” expectation for single‑stat targets and keeps the preview to a single row per level.
  - If a global `minRequiredRolls` is set and is higher than the per‑stat minimum, the early target uses the higher of the two (with one selected substat, the aggregate equals that substat).
- Star + MinRequired (single-substat): When the single selected substat uses wildcard (`any: true`) and a global `minRequiredRolls > 0`, the builder uses the same early single-row behavior, with `minRequiredRolls` standing in for the per‑stat minimum.
  - Milestone Thresholds (UI toggle):
    - Early (default): thresholds at a level use rolls gained so far (legacy: Potential semantics where applicable).
    - Late: thresholds at a level use only what must be present now so the target by +16 remains achievable. For a single substat with `min = k`, applied = `max(0, k − remainingRollsTo16)`.
- Caps enforcement: For both Strict and Potential/Early, distributions violating any `max` are filtered at generation. Early rows and lower‑bounds alike respect caps.
- Aggregate (Σ rolls) behavior: `minRequiredRolls` applies to the sum of rolls across the selected substats only; it does not implicitly raise per‑stat thresholds. In Strict, distributions failing the aggregate are filtered; in Potential/Early, early rows are kept only if the aggregate can still be met by +16.
- Presence at start: In Potential/Early, if `avail === 0` but the aggregate can still be met by the target (e.g., Σr ≥ 4 with Legendary schedule), a presence row is emitted at +0. This enables early “can still reach by +16” visibility.
- Wildcard‑only + aggregate (all selected stats have `any: true`, and `minRequiredRolls > 0`):
  - Early: emits only minimal allocations at each milestone — the selected portion of rolls sums to `min(minRequiredRolls, avail)`. Extra rolls can land on non‑selected stats (implicit “other” bucket). This keeps early rows concise and stable across levels.
  - Late: emits presence‑only at early milestones (+0/+4/+8/+12), and enforces the same minimal allocations at +16.
- Wildcard‑only, no aggregate (all selected are `any: true`, and `minRequiredRolls` is Auto/0): Potential/Early behaves like Strict for distributions (no “other” bucket). This prevents thresholds at +16 from being below earlier levels as additional substats become present.

## Clipboard and Context Menus

- The chip area always renders (min height) and supports a context menu with “Copy All (.hsfr)” and “Paste”. When empty, a centered hint invites right‑click Paste.
- Chip context menu includes: Duplicate, Move to Top/Up/Down/Bottom, Copy to Clipboard, Delete.
- Copy All copies a full HSFR object `{ Version, Metasets, Minima, Configs, FinalSellRemainder }` via `buildHsfrPayload` to preserve state on paste.
- Paste accepts: single `BuilderConfig`, array of configs, or a full HSFR object in the readable schema. Legacy forms are not normalized.
- Clipboard fallback: in non‑secure contexts (not HTTPS/localhost), programmatic clipboard is blocked, so the app opens a dialog with pre‑selected text for manual copy/paste.

## Save/Load Guarantees

- Saver writes `{ Version, Metasets, Minima, Configs, FinalSellRemainder, SelectedConfigIndex? }` (via `buildHsfrPayload`) and downloads `*.hsfr`. When no config is explicitly selected, the last config index is saved by convention so loaders can preserve intent.
- Loader (`readHsfrFile`) accepts the readable HSFR schema and preserves `substatRollBounds.any`, `min`, and `max` (clamped to valid ranges; `min` 0..5, `max` 0..4). Legacy HSFR shapes are not supported.
- Copy All mirrors the saver payload (including `SelectedConfigIndex`) to enable full round‑trip via copy/paste.

## Behavioral Details

- Min vs Max exclusivity: The builder now enforces mutual exclusivity; toggling one clears the other. HSFR persists only the active choice (`min`, `max`, or `any`).
- Max/caps enforcement: Rule generation filters distributions that exceed a per‑substat `max`. A `max = 0` enforces “no rolls” on that substat.
- Auto resolution: Auto now keys strictly off `min ≥ 1` across selected substats; star and max are ignored for Auto.
- Rank Any uses 6★ baseline: When `rankCode = 0` (Any), base minima map to the 6★ bucket for threshold generation (conservative default).
- Rarity ranges (≥): Conservative lower-bound behavior. `rollLevelsForRarityCode` maps `≥ Common..≥ Epic (6..9)` to the lower bound’s schedule (Common/Uncommon/Rare/Epic), and `≥ Legendary (16)` to Legendary. `rarityIncludesMythical` no longer assumes Mythical for any `≥` range; only exact Mythical (15) and `≤ Mythical (14)` imply the Mythical pre‑roll.
 - Any rarity presence: For presence feasibility only, `Any` is treated like `≥ Legendary` (no additions). Mythical pre‑roll is still not assumed unless Σ mins or aggregate min equals 5.
- Rarity label parsing: HSFR normalize accepts human‑readable `Rarity` strings (e.g. `"≥ Epic"`, `"Legendary"`, `"Any"`) and maps them to canonical codes. Numeric `rarityCode` is also accepted; `rarityExact` is no longer supported.
- Metaset name resolution on paste: `parseConfigsFromText(text, metasets)` resolves `artifactMetaSetNames` against the caller‑provided current metasets. For full HSFR objects, `parseHsfrObject` resolves names against embedded `Metasets`; if absent, falls back to the app’s current metasets (`prev.metasets`). No default metasets are injected implicitly.
- Per‑config pruning: Obsolete elimination now runs per config before merging, so preview table counts match the builder’s chip count. Cross‑config overlaps remain visible for auditability.
- Obsolete comparator: Compares substats by the same StatVariant and raw Value for the same operator (no normalization to rolls). Tie‑break prefers earlier rule indices within a config when values are equal.

## File Import UX

- Global drop target: The entire app window accepts file drops. Local dropzones were removed to reduce friction. Implemented via `useFileDragDrop` + `FileDragOverlay`.
- Overlay on file drag: A full‑screen, non‑interactive overlay appears on real file drags, indicating that `.hsfr` (configs + metasets) and `.hsf` (sellfile) are accepted. Overlay uses `pointer-events: none` so it never blocks the actual drop.
- Routing by extension: Drops are dispatched by filename extension — `.hsfr` → HSFR loader (`readHsfrFile`), `.hsf` → HSF loader (`readHsfFile`). Unknown extensions are ignored.
- Safety: Only intercept drags when `DataTransfer.types` includes `Files`; component drags (e.g., table column reorder) are unaffected.
 - Load semantics: File load and drag‑and‑drop replace the entire state (metasets, minima, configs, final‑sell, selection, note). No conflict merging on file load.

## HSFR Global Note

- Schema: HSFR may include an optional root-level `Note: string` with Markdown content.
- Load: When an HSFR with `Note` is loaded, a modal dialog opens automatically (view‑only). The dialog can also be opened via the always‑visible “Add/Edit Note” button in the HSFR controls row.
- Edit: The dialog uses an embedded Markdown editor (`@uiw/react-md-editor`) with sanitized previews (`rehype-sanitize`). We keep the editor in a dedicated component `src/components/NoteDialog.tsx`.
- Save/Copy: If a Note exists (non‑empty), HSFR exports and “Copy all Configs” include it.
- Paste semantics: Pasting HSFR content (via context menu or manual paste) only overwrites the current note if the current note is empty. Loading a file always overwrites the current note.
 - Metaset conflicts on paste (Copy/Paste only): identical value (same sets) keeps current ID and remaps pasted references. If the same ID has different sets, a single dialog offers: Keep current, Use pasted, or Keep both (new ID for pasted). Unknown pasted metaset IDs create hidden placeholders with generated names so chips never show raw IDs.
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
  - IDs and IO:
    - Built‑in metasets use stable, human‑readable slugs (e.g., `meta_nuker`, `meta_support_survivability`) instead of timestamps.
    - New metaset IDs are compact base‑36 strings via `makeMetasetId()` (e.g., `m_ab12cd3`).
    - HSFR configs reference metasets by ID via `artifactMetaSetIds` (compact); the `Metasets` section remains readable with names and `setNames`.

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
- Required substats shows a caption warning if `minCount > substats.length`. A compact, fixed-height spacer below the controls reserves space to avoid layout shifts while keeping the gap minimal.
- Optional `autoMinCount` mode surfaced as a toggle button in the Required selector. Buttons are: Auto, 1, 2, 3, 4. When Auto is selected, the UI keeps `minCount` synced to `min(4, substatsV.length)`. Selecting a number disables auto. Clearing Substats sets `minCount=0`.
- Min required rolls: a second toggle cluster after Required substats with `Auto, 1..5`. When enabled (not Auto), it enforces an aggregate lower bound on the total rolls across the selected substats and filters out rows where the target cannot be reached anymore by +16 (i.e., `Σselected + remaining < minRequiredRolls`). In Strict mode, distributions that fail the aggregate are filtered; in Potential/Early, early rows are kept only when the aggregate can still be met by +16. For legacy HSFR files, `rollMode: 'potential'` maps to this behavior; the UI now exposes this under “Milestone Thresholds”.
- Defaults: `rarityCode=0` (All), `rollMode='auto'`, `autoMinCount=true` (Required defaults to Auto; effectively 0 until substats are chosen). Stats and sets/types/factions are driven by enums (`StatVariant`, `ArtifactSet`, `ArtifactType`, `Faction`).
- Reset defaults sets: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStatsV=[]`, `startLevel=0`, `rollMode='auto'`, `minCount=0`, `autoMinCount=true`, `substatsV=[]`, clears `artifactTypes`/`artifactSets`.

- Config chips: Container is height-limited (about 6 chips) with vertical scroll. After “Add as new config”, the new chip is auto-selected and the chips container scrolls that chip to the top without scrolling the page.
- Preview: The table container auto-scrolls to the first rule row for the selected config. Scrolling is confined to the table container; the page itself never scrolls due to these actions.

### Persistence & Autosave

- Autosave payload key: `sellfileCreator.autosave.hsfr.v1`. Content: `[crc32, payload]` where `payload = { Metasets, Minima, Configs, FinalSellRemainder, version }`.
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

## Migration Notes (HSFR)

- Rarity labels: The parser accepts human‑readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). If multiple are provided, precedence is `rarityCode` → `Rarity`.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in‑app metasets, or against embedded `Metasets` for full HSFR objects. To ensure consistent resolution across machines, include `Metasets` in HSFR exports or pre‑create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower‑bound roll schedules, and no Mythical pre‑roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre‑roll), switch to exact `Legendary`/`Mythical`.
- Per‑config pruning: Obsolete pruning runs per config before merging, so preview table counts match the builder chip. Cross‑config overlaps remain visible by design.
- Back‑compat: New HSFR exports include `minLevel` and `maxLevel` and omit `rollMode`/`rollBaseline`/`startLevel`. The parser continues to accept legacy fields and derives a window of `[startLevel..16]` when `minLevel/maxLevel` are not provided. Presence‑only (legacy `rollMode: 'off'`) remains supported.

## Roadmap

- Optional “Debug” JSON views for `.hsf` / `.hsfr`.
- Inline edit for chip names and keyboard shortcuts.
- Stricter HSFR schema validation and helpful error messages.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.

## Layout Notes (responsive + headers)

- Fixed widths
  - “Add Configs and Rules” and “Sellfile Preview” each render at `PANEL_WIDTH_PX` content width in both stacked and side‑by‑side layouts.
  - When stacked, each Paper uses `width: 100%` with `maxWidth: PANEL_WIDTH_PX` and centers via `mx: 'auto'`.
- Side‑by‑side breakpoint
  - At viewport widths ≥ `SIDE_BY_SIDE_BREAKPOINT_PX` the two Papers render side‑by‑side and are centered together as a pair.
  - Implemented with a full‑bleed wrapper and a fixed‑width grid centered via `left: 50%` + `transform: translateX(-50%)`.
  - Grid: `gridTemplateColumns: '${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px'`, `columnGap: ${GRID_COLUMN_GAP_PX}px` (total width `SIDE_BY_SIDE_BREAKPOINT_PX`).
- Preview height cap
  - “Sellfile Preview” never exceeds the height of “Add Configs and Rules”. A `ResizeObserver` tracks the left Paper height and applies it as `maxHeight` to the right Paper, which is a vertical flex container so the table scrolls within.
- Inline header captions
  - The descriptive text for “Base Sell File (.hsf)” and “Add Configs and Rules” is rendered to the right of the `h6` title using a two‑column grid (`gridTemplateColumns: 'auto 1fr'`, `alignItems: 'center'`). The caption wraps within the right column.
