# Rules and Data

This document covers file schemas, builder semantics, and compatibility notes.

## File Formats

### HSF (RSL Helper)
- JSON container: `{ "Rules": HsfRule[] }` (UTF-8; BOM tolerated).
- Types: `src/lib/hsfTypes.ts`.
- Parsing: `src/lib/hsfIO.ts#parseHsfFile`.
- Build & write: `buildHsfFileFromMerged`, `hsfToBlob`.

### HSFC (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": SubstatTargetTable, "Configs": ReadableConfig[], "FinalSellRemainder": { artifacts: boolean; accessories: boolean; levels: (0|4|8|12|16)[]; setsMode: 'any' | 'explicit' }, "SelectedConfigIndex"?: number }`. `Minima` stores the Substat Target Values table; the legacy name is preserved for compatibility. Also accepts a raw array `ReadableConfig[]` for convenience.
  - Writer always includes `FinalSellRemainder` (even when off).
- Reader: when `FinalSellRemainder` is missing (older files), treat it as off with default ranges `[0,4,8,12]` and `setsMode = 'any'`.
  - Loader convenience applies to all builds: in addition to full HSFC objects and `ReadableConfig[]`, a single readable config object is accepted (matching `tests/fixtures/*.hsfc`) so dragging fixtures into the app works everywhere.
- `Metaset` write format: `{ id: string; name: string; setNames: string[]; show?: boolean; iconId?: string }` — named group of artifact set names with an optional icon identifier. Defaults are created if omitted.
- `ReadableConfig` (write format for Save/Copy) emits human-readable labels plus metaset IDs:
  - `name?`, `keep`, `visibility`: `'Active' | 'Disabled' | 'Separator'`.
  - `Rank`: string label (e.g., `"≥ 5★"`); `Rarity`: string label or `"Auto"`; `Faction`: faction name string.
  - `mainStats`: string[] (labels).
  - `minLevel`, `maxLevel`: explicit level milestones (0|4|8|12|16). `earlyKeepMode?`: `'late'` when Late thresholds are active.
  - `substats`: string[] (labels); `fixedSubstats`: string[] (subset of `substats`).
  - `autoRarityThreshold?`: `'uncommon' | 'rare' | 'epic'` — emitted only when Milestone Thresholds are Late+Auto and active (defaults to `'rare'`).
  - `substatRollBounds?`: label-keyed map `{ [label: string]: { min?: number; max?: number; any?: boolean } }`.
  - `minCount`, `autoMinCount`, `autoSubstatFlex?` (true only when flex actually applies).
  - `minRequiredRolls`, `autoMinRequiredRolls`, `minRollsTarget?` (`'Locked'` when aggregate substat targets require every locked stat to hit the goal).
  - `artifactTypeNames?`: string[]; `artifactSetNames?`: string[]; `artifactMetaSetIds?`: string[] (IDs referencing the payload’s `Metasets` entries).
  - Meta hint: Each config written by Save/Copy includes `__cfgIdx_ignoredWhenRead: number` (1-based index at export time); readers ignore this field.
- `SubstatTargetTable` write format: label-keyed maps (Substat Target Values per rank).
- Compatibility: HSFC loader targets the readable schema (labels + metaset IDs). For backward compatibility it still maps `artifactMetaSetNames` to IDs and tolerates legacy helpers like `rankCode`, but numeric stat IDs are no longer accepted.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.
- Final Sell (remainder) rules: when enabled (at least one gear type and at least one level selected), the merge appends Sell rules for all level milestones (0/4/8/12/16). Milestones not selected in the UI are emitted as disabled (`Use: false`) instead of being omitted. In **Explicit** mode the rules list every currently known set in `ArtifactSet` so new game sets stay protected; in **Any** mode the `ArtifactSet` field is omitted so every present and future set matches. The alternate coverage mode (the option not selected in the dialog) is also emitted with `Use: false` so exports make the operator’s intent explicit.
  - Preview rows use ellipsis tooltips so the shorthand remains accessible even when truncated inside the table cell.

### IO Helpers (HSFC)
- Parse text/file: `parseHsfcText`, `readHsfcFile`.
- Build & write: `buildReadableConfig`, `substatTargetsToReadable`, `buildHsfcPayload`, `hsfcToBlob`.
- Object parsing: `parseHsfcObject` normalizes a pre-parsed HSFC payload (readable schema). Autosave stores the same HSFC payload with a CRC and restores via this parser.
- HSFC parsing focuses on the readable schema; it applies the compatibility helpers noted above while HSF handles numeric legacy formats.

### Clipboard Helpers
- `src/lib/clipboard.ts` centralizes clipboard interactions:
  - `writeTextSafe(text)` and `readTextSafe()` wrap the async Clipboard API with security checks and failure handling.
  - When writes are blocked, components dispatch `COPY_DIALOG_EVENT` to request that the App open a manual copy dialog prefilled with the content.
  - Fallback UI lives in `src/components/CopyDialog.tsx` (copy) and `src/components/PasteDialog.tsx` (paste).
- Copy All copies a full HSFC: `{ Version, Metasets, Minima (Substat Target Values), Configs, FinalSellRemainder, SelectedConfigIndex? }`.
- Copy single config copies a minimal HSFC: `{ Version, Metasets: [only those referenced by the config], Configs: [readable config] }` so pasting elsewhere brings required metasets.
- Paste accepts: a single config, an array of configs, or a full HSFC object (readable schema). Legacy shapes are not normalized.

### Autosave
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'`). Value is `[crc32, payload]` where `payload` is a readable HSFC object (`buildHsfcPayload`) and `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, substatTargets, configs, finalSellRemainder, selectedConfigIndex, note })` handles reading the entry, opening the Restore dialog when appropriate, and enabling autosave at the right time.
- Restore vs Dismiss:
  - Restore: applies the saved session (metasets, substatTargets, configs, note, selection) and enables autosave.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden.
- file:// note: LocalStorage behavior varies for file origins and can be non-persistent or path-scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.

### App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`hsfcIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (0/4/8/12/16) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Rarity “Auto”: HSFC read/write accepts `Rarity: "Auto"`. The builder resolves this to a concrete rarity code before generating HSF rules based on roll requirements, always evaluating against the full +0→+16 timeline so the level window only clips emitted rows:
  - Required rolls are the max of aggregate `minRequiredRolls` and the worst-case sum of per-stat `min` across generated permutations (fixed + highest mins among the remainder up to `minCount`).
  - Mapping: 0→Any, 1→≥ Uncommon, 2→≥ Rare, 3→≥ Epic, 4→≥ Legendary, 5→Mythical (exact).
- Presence guards: Locked substats still force Auto to pick a rarity that has those stats present at the earliest emitted level (always +0 for Auto resolution). Auto also clamps to the requested `minCount` (bounded by selected substats) so Flex merely changes permutations, not the rarity floor. At +0 the ladder becomes: needing 1/2/3/4 substats escalates to ≥Uncommon/≥Rare/≥Epic/≥Legendary respectively.
  - Feasibility check: if the base mapping cannot reach the required rolls by +16 given the baseline/start, Mythical is chosen when it makes the target feasible (pre-roll at +0); otherwise the base mapping is used and infeasible rows are pruned as usual.
- Levels are the milestones 0/4/8/12/16.
- Level window: HSFC uses `minLevel` and `maxLevel` to bound emitted rules. When reading legacy configs without these fields the parser falls back to `[0..16]`, and legacy `startLevel` inputs are converted into a collapsed window (`minLevel = maxLevel = start`) before the builder runs.
- Count Rolls baseline (`rollBaseline`): still parsed for legacy configs and used for roll math, but new HSFC exports do not include it.
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode` (see `starForRankCode`). Each “roll” adds another base target for that substat.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode`. Roll distributions add multiples of the base target for each roll allocated to a substat.
- Mythical pre-roll: When rarity selection includes Mythical (exact 15, ranges that include Mythical, or `>= Legendary`), treat there as being one pre-roll at level 0 on one substat.
  - Rarity = Any (0): by default does not assume Mythical. However, when either the sum of per-stat mins or the aggregate Min required rolls is 5, the builder treats `Any` as Mythical-capable and includes one pre-roll at +0 so feasibility checks and thresholds align with Σr = 5 scenarios.
  - Baseline substat count (Any): For the “how many substats exist at this level” check, `Any` behaves like `≥ Legendary` (no extra substats appear). Roll schedules still follow the selected rarity/range.
  - Baseline `'upToLevel'` counts this pre-roll at every level; `'afterStart'` only counts rolls gained after `minLevel` (so pre-roll applies when `minLevel` is 0).
  - The target budget by +16 is therefore 5 rolls when Mythical is included (4 otherwise).
- Fixed substats: rule permutations always include all fixed substats and pick additional substats from the remaining selected ones so the size is `max(minCount, fixedCount)`, capped at 4.
- Dynamic combo sizing before +16: At levels where the rarity cannot yet have `minCount` substats, the builder emits permutations sized to the number of substats that can physically exist (still honoring fixed substats). Once the available substats reach `minCount` (typically by +16), permutations use `minCount`.
- Mainstat expansion: because HSF does not accept an array for main stat, multiple selections are unrolled into separate rules, one per selected main stat. An empty selection emits HSF rules with `MainStatID = -1` (Any).
  - HSF export always writes both `MainStatID` and `MainStatF` (using `-1` and `1` for “Any”).

### Roll Semantics (builder)

- Roll indicators (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
- `min = N (1..5)`: require at least N rolls; generates lower-bound rules after feasibility, and (in Potential/Early) early rows before feasibility.
  - Roll Upper Limit (`max = N`, 0..4): cap rolls at N. A `max = 0` forbids rolls on the substat (baseline value only). Distributions exceeding the upper limit are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores roll indicators entirely (only the starting, unrolled values).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential (Early) when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and the Roll Upper Limit do not affect Auto resolution.
- Feasibility: at a level, let `avail` be the number of rolls credited by the baseline. The set of Min indicators is feasible if `sum(mins) <= avail`.
- After feasibility: both Strict and Potential (Early) keep enforcing the same lower-bound (exact mins) on later levels so “at least N” remains true.
- Potential/Early (single-substat fast path): When exactly one substat has a `min ≥ 1` and no wildcard, the builder emits a single early lower-bound per milestone: `base + min(avail, min) * base`. Thresholds rise until the minimum becomes feasible, then remain fixed (e.g., ACC(2): +0 9, +4 18, +8 27, +12 27, +16 27).
  - After feasibility, the lower-bound remains enforced at later levels; no additional early rows are emitted.
  - This mirrors the “green roll” target for single-stat targets and keeps the preview to a single row per level.
  - If a global `minRequiredRolls` is set and is higher than the per-stat minimum, the early target uses the higher of the two (with one selected substat, the aggregate equals that substat).
- Star + MinRequired (single-substat): When the single selected substat uses wildcard (`any: true`) and a global `minRequiredRolls > 0`, the builder uses the same early single-row behavior, with `minRequiredRolls` standing in for the per-stat minimum.
  - Milestone Thresholds (UI toggle):
    - Early (default): thresholds at a level use rolls gained so far (legacy: Potential semantics where applicable).
    - Late: thresholds at a level use only what must be present now so the target by +16 remains achievable. For a single substat with `min = k`, applied = `max(0, k − remainingRollsTo16)`.
- Roll Upper Limit enforcement: For both Strict and Potential/Early, distributions violating any `max` are filtered at generation. Early rows and lower-bounds alike respect the upper limits.
- HSF encoding: When a substat only sets a Roll Upper Limit (`max` without a matching `min`), generated rules emit `Condition: '<='` with the capped threshold (`baseline + max * baseline` for stat values, raw cap for the `Roll Count` stat). Per-substat targets continue to use `Condition: '>='`.
- Aggregate (Σ rolls) behavior: `minRequiredRolls` applies to the sum of rolls across the selected substats only; it does not implicitly raise per-stat thresholds. In Strict, distributions failing the aggregate are filtered; in Potential/Early, early rows are kept only if the aggregate can still be met by +16.
- Baseline row at start: In Potential/Early, if `avail === 0` but the aggregate can still be met by the target (e.g., Σr ≥ 4 with Legendary schedule), a baseline row is emitted at +0. This enables early “can still reach by +16” visibility.
- Wildcard-only + aggregate (all selected stats have `any: true`, and `minRequiredRolls > 0`):
  - Early: emits only minimal allocations at each milestone — the selected portion of rolls sums to `min(minRequiredRolls, avail)`. Extra rolls can land on non-selected stats (implicit “other” bucket). This keeps early rows concise and stable across levels.
  - Late: emits baseline-only rows at early milestones (+0/+4/+8/+12), and enforces the same minimal allocations at +16. When rarities provide more rolls than the “need now” total at an intermediate milestone (e.g., ≥ Epic branches at +8/+12), the builder routes the surplus to a virtual sink so the required rows are still emitted instead of being dropped.
- Wildcard-only, no aggregate (all selected are `any: true`, and `minRequiredRolls` is Auto/0): Potential/Early behaves like Strict for distributions (no “other” bucket). This prevents thresholds at +16 from being below earlier levels as additional substats become present.
- Legendary full-set keepers: when the config requires all four selected substats, applies no per-stat min/max bounds, spans the full 0..16 window, and the rarity selection has all four substats present at +0 (Legendary/Mythical paths), the builder emits a single `LVLForCheck = 99` row instead of enumerating the 70 roll permutations as long as `Min required rolls` is either Auto/0 or exactly matches the number of rolls those rarities can supply by +16 (4 for Legendary, 5 for Mythical). Any lower aggregate target keeps the milestone permutations.

## Migration Notes (HSFC)

- Rarity labels: The parser accepts human-readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). When both `rarityCode` and `Rarity` are supplied, the normalized string (including "Auto") overrides the numeric code.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in-app metasets, or against embedded `Metasets` for full HSFC objects. To ensure consistent resolution across machines, include `Metasets` in HSFC exports or pre-create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower-bound roll schedules, and no Mythical pre-roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre-roll), switch to exact `Legendary`/`Mythical`.
- Per-config pruning: Obsolete pruning runs per config before merging, so preview table counts match the builder chip. Cross-config overlaps remain visible by design.
- Back-compat: New HSFC exports include `minLevel` and `maxLevel` and omit `rollMode`/`rollBaseline`/`startLevel`. The parser still accepts legacy fields, defaulting to `[startLevel..16]` (falling back to `[0..16]` when the start level is missing or "any") when the explicit window is absent. If legacy `rollMode: 'off'` is provided, the window collapses to that `startLevel` so baseline-only configs continue to load.
