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

Note on opening via file://
- If contributors open `index.html` directly from the filesystem (file://), expect limited or non‑persistent storage in many browsers. LocalStorage writes used by autosave, color preferences, and table settings may not persist. Prefer `npm run dev` or `npm run preview` to serve over http for reliable persistence.

## Project Structure

- `src/App.tsx`: Main UI — base HSF loader, builder, HSFR manager, merged preview, downloads.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
- `src/lib/hsf.ts`: Minimal parser for `.hsf` (JSON with optional BOM) files.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
  - Supports fixed substats: `BuilderConfig.fixedSubstats` (subset of `substats`) are always included in generated combinations.
  - Exposes `defaultMinima()` and `MinimaTable` to configure per‑rank substat minima (1★..6★).
- `src/lib/types.ts`: Shared formatters (sets, types, rarity, rank, level, stat and faction labels).
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
- Parsing: `src/lib/hsf.ts`.

HSFR (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": MinimaTable, "Configs": BuilderConfig[], "IncludeAllExplicitMeta": boolean }`. Also accepts a raw array `BuilderConfig[]` for convenience.
- `Metaset`: `{ id: string; name: string; sets: number[] }` — named group of artifact set IDs. Defaults are created if omitted.
- `BuilderConfig` includes: optional `name`, `keep/sell`, `rankCode` (HSF rank code 0–16), `rarityCode` (HSF rarity code 0–16), `factionCode` (0 Any; non‑consecutive IDs), `mainStats` (array; empty = Any), `startLevel` (0/4/8/12/16), `rollBaseline` (`'afterStart' | 'upToLevel'`), `rollMode` (`'off' | 'strict' | 'potential' | 'auto'`), `substats`, `fixedSubstats` (subset of `substats`), `substatRollBounds?`, `minCount`, `autoMinCount?`, optional filters (`artifactSets` / `artifactTypes`) and `artifactMetaSets?: string[]` referencing `Metaset.id`.
  - `rollMode: 'auto'` resolves at build time: Strict when no selected substat has a numeric Min Rolls (min ≥ 1); Potential when at least one selected substat has a numeric Min Rolls (min ≥ 1). For this resolution, only `min ≥ 1` is considered; the star (any=true) and `max` do not influence Auto.
  - `substatRollBounds`: `Record<key, { min?: number; max?: number; any?: boolean }>` keyed by `"id:isFlat"` (e.g. `"4:true"` for SPD). `min` = at least N rolls (1..5). `max` = cap rolls (0..5). `any: true` = wildcard (enumerate all distributions). Min and Max are mutually exclusive in the UI; the last user action wins (the builder writes only one of `min`, `max`, or `any`).
  - `MinimaTable`: `{ one, two, three, four, five, six }` each a `Record<"id:isFlat", number>`.
- Backward compatibility: older HSFRs with `rank: {kind}`, `rarityExact`, and single `mainStat` are normalized on load. HSFRs without `Metasets` load with defaults. `substatRollBounds.any` is preserved; `min/max` clamped to 0..5.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.

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

### Roll Semantics (builder)

- Badges (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
  - `min = N (1..5)`: require at least N rolls; generates lower‑bound rules after feasibility, and (in Potential) progress rows before feasibility.
  - `max = N (0..5)`: cap rolls at N. A `max = 0` forbids rolls on the substat (presence/base value only). Distributions exceeding a cap are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores badges entirely (presence at start level only).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1`, otherwise resolves to Potential. Star and Max do not affect Auto resolution.
- Feasibility: at a level, let `avail` be the number of rolls credited by the baseline. The set of min badges is feasible if `sum(mins) <= avail`.
- After feasibility: both Strict and Potential keep enforcing the same lower‑bound (exact mins) on later levels so “at least N” remains true.
  - Duplicate avoidance: In Potential mode, once feasible, the generator skips the exact‑min distribution from the partial‑progress set and emits the exact‑min lower‑bound once. This prevents duplicate rows (e.g., SPD(2) at 16).
  - Caps enforcement: For both Strict and Potential, distributions violating any `max` are filtered at generation. Progress rows and lower‑bounds alike respect caps.

## Clipboard and Context Menus

- The chip area always renders (min height) and supports a context menu with “Copy All (.hsfr)” and “Paste”. When empty, a centered hint invites right‑click Paste.
- Chip context menu includes: Duplicate, Move to Top/Up/Down/Bottom, Copy to Clipboard, Delete.
- Copy All copies a full HSFR object `{ Version, Metasets, Minima, Configs, IncludeAllExplicitMeta }` to preserve state on paste.
- Paste accepts: single `BuilderConfig`, array of configs, or a full HSFR object. Legacy forms are normalized.
- Clipboard fallback: in non‑secure contexts (not HTTPS/localhost), programmatic clipboard is blocked, so the app opens a dialog with pre‑selected text for manual copy/paste.

## Save/Load Guarantees

- Saver writes `{ Version, Metasets, Minima, Configs, IncludeAllExplicitMeta }` and downloads `*.hsfr`.
- Loader normalizes legacy shapes and preserves `substatRollBounds.any`, `min`, and `max` (clamped 0..5).
- Copy All mirrors the saver payload, enabling full round‑trip via copy/paste.

## Behavioral Details

- Min vs Max exclusivity: The builder now enforces mutual exclusivity; toggling one clears the other. HSFR persists only the active choice (`min`, `max`, or `any`).
- Max/caps enforcement: Rule generation filters distributions that exceed a per‑substat `max`. A `max = 0` enforces “no rolls” on that substat.
- Auto resolution: Auto now keys strictly off `min ≥ 1` across selected substats; star and max are ignored for Auto.
- Rank Any uses 6★ baseline: When `rankCode = 0` (Any), base minima map to the 6★ bucket for threshold generation (conservative default).

## UI Notes (developer-facing)
- Builder layout: Row 1 Action; Row 2 Rank/Rarity/Faction/Start/Roll permutations; Row 3 Mainstat/Substats; Row 4 Min selected substats (aligned to right under Substats, includes “Minima…”); Row 5 Slots/Sets.
  - Faction is grouped near Rarity. Only accessories (Ring/Amulet/Banner) are faction-specific; other gear ignores `Faction`.
- Mainstat is multi-select with 3 rows of toggle buttons: Any, then HP/HP%/ATK/ATK%/DEF/DEF%, then SPD/RES/ACC/CR%/CDMG%. Buttons share a fixed minWidth; Any is double width for emphasis. HSFR stores `mainStats: {id,f?}[]` (empty = Any).
- Substats is a multi-select `ToggleButtonGroup` with the same 3-row order and widths. `Any` is mutually exclusive with specific substat buttons and maps to `substats: []` in HSFR. When specifics are selected, Any is ignored/cleared.
  - Each selected substat shows a right‑side badge cycling: `★ → 0 → 1 → … → 5 → ★`. New selections start at `★`.
  - Badge semantics: `★` wildcard (all options), `0` no minimum (presence), `N` at least N rolls (min‑only after feasible).
- Min selected substats shows a caption warning if `minCount > substats.length`. The warning element is always rendered with CSS `visibility` toggle to avoid layout shifts.
- Optional `autoMinCount` mode surfaced as a toggle button in the Required selector. Buttons are: Auto, 1, 2, 3, 4. When Auto is selected, the UI keeps `minCount` synced to `min(4, substats.length)`. Selecting a number disables auto. Clearing Substats sets `minCount=0`.
- Defaults: `rarityCode=0` (All), `rollMode='auto'`, `autoMinCount=true` (Required defaults to Auto; effectively 0 until substats are chosen).
- Reset defaults sets: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStats=[]`, `startLevel=0`, `rollMode='auto'`, `minCount=0`, `autoMinCount=true`, `substats=[]`, clears `artifactTypes`/`artifactSets`.

- Config chips: Container is height-limited (about 6 chips) with vertical scroll. After “Add as new config”, the new chip is auto-selected and the chips container scrolls that chip to the top without scrolling the page.
- Merged Preview: The table container auto-scrolls to the first rule row for the selected config. Scrolling is confined to the table container; the page itself never scrolls due to these actions.

### Persistence & Autosave

- Autosave payload key: `autosave.hsfr.v1`. Content: `[crc32, payload]` where `payload = { Metasets, Minima, Configs, IncludeAllExplicitMeta, version }`.
  - A CRC32 is stored alongside the payload to detect corruption or partial writes. On corruption, the key is cleared.
  - On first load, if a valid autosave exists, the UI offers to restore it. If dismissed, autosave is deferred until state diverges to avoid clobbering the previous draft.
- Substat color preferences:
  - Current key: `substatColors.v3` (maps `"id:isFlat" -> { fg, bg }`).
  - Backward compatibility keys checked: `substatColors.v2`, `substatColors.v1`.
- Table settings:
  - Column layout key: `rulesTableCols.v1` (array of `{ key, label, width, visible }`). Merged against defaults on load to introduce new columns.
  - Wrap toggle key: `rulesTableWrapRows.v1` (boolean). Default is `true` (wrapping enabled).
- Important: localStorage persistence is not guaranteed when running from `file://`. Use dev/preview servers for reliable storage.

### Merged Preview Table (performance & UX)

- Virtualization:
  - Fixed‑height fast path when wrapping is off (single‑line rows at 28px; index math from scrollTop).
  - Variable‑height mode when wrapping is on: maintains row height cache, prefix sums, and uses binary search to calculate visible window. Overscan applied.
- Header interactions:
  - Right‑click header opens menu: reset columns, auto‑fit widths, wrap toggle, and per‑column visibility.
  - Drag headers to reorder; drag right edge to resize columns (min width 40px).
  - Auto‑fit computes text widths (monospace for most columns, proportional for Substats) and scales to available width.

## Roadmap

- Optional “Debug” JSON views for `.hsf` / `.hsfr`.
- Inline edit for chip names and keyboard shortcuts.
- Stricter HSFR schema validation and helpful error messages.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.

## Layout Notes (responsive + headers)

- Fixed widths
  - “Add Configs and Rules” and “Merged Preview” each render at 1152px content width in both stacked and side‑by‑side layouts.
  - When stacked, each Paper uses `width: 100%` with `maxWidth: 1152` and centers via `mx: 'auto'`.
- Side‑by‑side breakpoint
  - At viewport widths ≥ 2320px the two Papers render side‑by‑side and are centered together as a pair.
  - Implemented with a full‑bleed wrapper and a fixed‑width grid centered via `left: 50%` + `transform: translateX(-50%)`.
  - Grid: `gridTemplateColumns: '1152px 1152px'`, `columnGap: 16px` (total width 2320px).
- Preview height cap
  - “Merged Preview” never exceeds the height of “Add Configs and Rules”. A `ResizeObserver` tracks the left Paper height and applies it as `maxHeight` to the right Paper, which is a vertical flex container so the table scrolls within.
- Inline header captions
  - The descriptive text for “Base Sell File (.hsf)” and “Add Configs and Rules” is rendered to the right of the `h6` title using a two‑column grid (`gridTemplateColumns: 'auto 1fr'`, `alignItems: 'center'`). The caption wraps within the right column.
