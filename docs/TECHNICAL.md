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

## Project Structure

- `src/App.tsx`: Main UI — base HSF loader, builder, HSFR manager, merged preview, downloads.
- `src/theme.ts`: MUI dark theme configuration.
- `src/main.tsx`: App bootstrap with `ThemeProvider` and `CssBaseline`.
- `src/lib/hsf.ts`: Minimal parser for `.hsf` (JSON with optional BOM) files.
- `src/lib/hsfTypes.ts`: Types for `.hsf` schema (Rules/Substats).
- `src/lib/hsfBuilder.ts`: Rule builder utilities for generating permutations and thresholds.
- `src/lib/types.ts`: Shared formatters (sets, types, rarity, rank, level, stat labels).
- `ARTIFACT_RULES.md`: Artifact-related reference notes.

## File Formats

HSF (RSL Helper)
- JSON container: `{ "Rules": HsfRule[] }` (UTF‑8; BOM tolerated).
- Types: `src/lib/hsfTypes.ts`.
- Parsing: `src/lib/hsf.ts`.

HSFR (this app)
- JSON container: `{ "Metasets": Metaset[], "Configs": BuilderConfig[] }`. Also accepts a raw array `BuilderConfig[]` for convenience.
- `Metaset`: `{ id: string; name: string; sets: number[] }` — named group of artifact set IDs. Defaults are created if omitted.
- `BuilderConfig` includes: optional `name`, `keep/sell`, `rankCode` (HSF rank code 0–16), `rarityCode` (HSF rarity code 0–16), `mainStat`, `startLevel` (0/4/8/12/16), `generateRollPermutations` (boolean), `substats`, `minCount`, optional filters (`artifactSets` / `artifactTypes`) and `artifactMetaSets?: string[]` referencing `Metaset.id`.
- Backward compatibility: older HSFRs with `rank: {kind}` and `rarityExact` are normalized on load. HSFRs without `Metasets` load with defaults.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (0/4/8/12/16) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Roll permutations toggle: when `generateRollPermutations` is `true`, we include rules at +4/+8/+12/+16 after the selected `startLevel`, distributing rarity-allowed “rolls” across the chosen substats. When `false`, only a presence/threshold rule is emitted at `startLevel`.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base minima derive from star bucket inferred from `rankCode` (see `starForRankCode`). Roll distributions add multiples of the base minimum for each roll allocated to a substat.

## UI Notes (developer-facing)
- Builder layout: Row 1 Action; Row 2 Rank/Rarity/Start/Roll permutations; Row 3 Mainstat/Substats; Row 4 Min selected substats (aligned to right under Substats); Row 5 Slots/Sets.
- Mainstat uses 3 rows of exclusive toggle buttons: Any, then HP/HP%/ATK/ATK%/DEF/DEF%, then SPD/RES/ACC/CR%/CDMG%. Buttons share a fixed minWidth; Any is double width for emphasis. Schema remains `mainStat: { any: true } | { any: false; id; f? }`.
- Substats is a multi-select `ToggleButtonGroup` with the same 3-row order and widths. `Any` is mutually exclusive with specific substat buttons and maps to `substats: []` in HSFR. When specifics are selected, Any is ignored/cleared.
- Min selected substats shows a caption warning if `minCount > substats.length`. The warning element is always rendered with CSS `visibility` toggle to avoid layout shifts.
- Defaults: `rarityCode=0` (All), `minCount=0`.
- Reset defaults sets: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStat.any=true`, `startLevel=0`, `generateRollPermutations=true`, `minCount=0`, `substats=[]`, clears `artifactTypes`/`artifactSets`.

## Roadmap

- Optional “Debug” JSON views for `.hsf` / `.hsfr`.
- Inline edit for chip names and keyboard shortcuts.
- Stricter HSFR schema validation and helpful error messages.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.
