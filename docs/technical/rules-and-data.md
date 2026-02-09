# Rules and Data

This document covers file schemas, builder semantics, and compatibility notes.

## File Formats

### HSF (RSL Helper)
- JSON container: `{ "Rules": HsfRule[] }` (UTF-8; BOM tolerated).
- Types: `src/lib/hsfTypes.ts`.
- Parsing: `src/lib/hsfIO.ts#parseHsfFile`.
- Build & write: `buildHsfFileFromMerged`, `hsfToBlob`.
- Builder-generated rules always prepend `ConfigID` (1-based config index) ahead of `Keep`/`IsRuleTypeAND`. Keep Unique injections reuse a negative sentinel value (`ConfigID <= KEEP_UNIQUE_CONFIG_ID_BASE`, see `src/lib/constants.ts`) so they remain distinguishable without colliding with builder configs. `ConfigName` is injected during export (using the latest trimmed label) so Sellfiles can reference the source config without forcing the preview table to rebuild on every rename.
- Every exported rule also records `RowIdx` — a 1-based row counter that reflects the final order inside the HSF file. This stays stable after dedupe/merges so downstream automation can reconcile preview rows with their file offsets even when `ConfigID` is absent or reused.
- `cleanHsfForExport` strips every UI-only metadata field (anything prefixed with `__`, e.g., `__rankMask`, `__keepUniqueRuleId`, `__keepUniqueHash`, diagnostics from Keep Unique detection) before serializing. Push uploads reuse the same sanitized payload so endpoints never see transient fields.

### HSFC (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": SubstatTargetTable, "Configs": ReadableConfig[], "FinalSellRemainder": { artifacts: boolean; accessories: boolean; levels: LevelMilestone[]; setsMode: 'any' | 'explicit' }, "SelectedConfigIndex"?: number }`. `Minima` stores the Substat Target Values table; the legacy name is preserved for compatibility. Also accepts a raw array `ReadableConfig[]` for convenience.
  - Writer always includes `FinalSellRemainder` (even when off).
- Reader: when `FinalSellRemainder` is missing (older files), treat it as off with default ranges `[0,4,8,12]` and `setsMode = 'any'`.
  - Loader convenience applies to all builds: in addition to full HSFC objects and `ReadableConfig[]`, a single readable config object is accepted (matching `tests/fixtures/*.hsfc`) so dragging fixtures into the app works everywhere.
- `Metaset` write format: `{ id: string; name: string; setNames: string[]; show?: boolean; iconId?: string }` — named group of artifact set names with an optional icon identifier. Defaults are created if omitted.
- `ReadableConfig` (write format for Save/Copy) emits human-readable labels plus metaset IDs:
  - `name?`, `Tags?` (string[]), `keep`, `visibility`: `'Active' | 'Disabled' | 'Separator'`.
  - `Rank`: string label (e.g., `"≥ 5★"`); `Rarity`: string label or `"Auto"`; `Faction`: faction name string.
  - `mainStats`: string[] (labels).
  - `minLevel`, `maxLevel`: explicit level milestones (`LevelMilestone`). `earlyKeepMode?`: `'late'` when Late thresholds are active.
  - `substats`: array of `{ stat: string; fixed?: boolean; rollBounds?: { min?: number; max?: number; any?: boolean } }`. Each entry represents one selected substat, whether it is fixed, and its per-stat roll bounds. (The writer no longer emits separate `fixedSubstats`/`substatRollBounds` fields; the loader still accepts those legacy split shapes and converts them inside `hsfcIO`.)
  - `autoRarityThreshold?`: `'uncommon' | 'rare' | 'epic'` — emitted only when Milestone Thresholds are Late+Auto and active (defaults to `'rare'`).
  - `minCount`, `autoMinCount`, `autoSubstatFlex?` (true only when flex actually applies).
- `minRequiredRolls`, `autoMinRequiredRolls`, `lockedMinRequiredRolls`. When `lockedMinRequiredRolls` is present and at least one substat is fixed, the builder treats the aggregate floor as “locked only” automatically — there is no separate scope flag anymore. Older HSFC files may include `minRollsTarget: 'Locked'` or `substatMinTarget`; the importer converts those scope hints into `lockedMinRequiredRolls` (and clears the manual global floor when locked substats exist) so HSFC exports no longer need the extra field while pure locked-scope configs stay locked-only.
  - `artifactTypeNames?`: string[]; `artifactSetNames?`: `{ name: string; excluded?: true }[]` (excluded entries explicitly opt out of metaset-derived sets); `artifactMetaSetIds?`: string[] (IDs referencing the payload’s `Metasets` entries). The loader still accepts legacy `artifactSetNames: string[]`/`number[]` and `{ id | name, excluded? }` object entries for backward compatibility.
- `SubstatTargetTable` write format: label-keyed maps (Substat Target Values per rank).
- Compatibility: HSFC loader targets the readable schema (labels + metaset IDs). For backward compatibility it still maps `artifactMetaSetNames` to IDs and tolerates legacy helpers like `rankCode`, but numeric stat IDs are no longer accepted.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Configs.map(buildHsfRules))`.
- Final Sell (remainder) rules: when enabled (at least one gear type and at least one level selected), the merge appends Sell rules for every entry in `LEVEL_MILESTONES` (0/4/8/12/16). Milestones not selected in the UI are emitted as disabled (`Use: false`) instead of being omitted. In **Explicit** mode the rules list every currently known set in `ArtifactSet` so new game sets stay protected; in **Any** mode the `ArtifactSet` field is omitted so every present and future set matches. The alternate coverage mode (the option not selected in the dialog) is also emitted with `Use: false` so exports make the operator’s intent explicit.
  - Preview rows use native ellipsis (`title`) tooltips so the shorthand remains accessible even when truncated inside the table cell.

#### Keep Uniques payload

- HSFC payloads also carry `KeepUniques?: KeepUniqueRule[]` plus `KeepUniquesEnabled?: boolean`. Autosave/clipboard/history reuse the same fields; omitting either key is treated as “off” with an empty gear-combination list.
- Each rule entry serializes `{ id, requiredCount, activation, countMode, combination }` (persisted as `tuple` in HSFC). `countMode` stores the scope toggles `{ perRule, perSet, perFaction, perMainStat, perSlot }`; defaults when missing are `perRule=false`, `perSet=true`, `perFaction=true`, `perMainStat=true`, `perSlot=false`. Combinations are normalized via `normalizeKeepUniqueCombination` and are written as readable labels (slot/set names, `5★` rank strings, rarity labels such as `Rare`, stat labels, faction names, metaset ids). `sets` now serialize as `{ name: string; excluded?: true }[]` so excluded gear sets remain explicit and parseable; older HSFC strings (`string[]`) still load as includes. `mainStats` stores the selected stat variants (empty array = Any). Invalid combos are discarded during parsing so corrupted HSFC files never reach the UI. Legacy HSFC exports that wrote `enabled` instead of `activation` are still accepted; the loader maps `enabled=false` to `activation:'off'` and `true` to `activation:'protectExisting'`.
  - HSFC tuples no longer mirror the first entry via a `mainStat` field; downstream consumers must read the `mainStats` array (or handle it being empty for Any).
- Optional substat focus is stored as `substats?: string[]` (readable labels). Match behavior serializes `substatMatch?: 'any' | 'all' | 'perSubstat'` only when a non-default match is chosen; missing defaults to `any`. Substat scoring always uses normalized ranking; weights apply when `substatMatch` is `any` or `all`, while `perSubstat` ignores weights. Per-stat weights are stored as `substatWeights?: Record<string, number>` using the same labels and only include non-default weights for the selected substats.
- Multiple substats follow the match: `any` accepts items that have at least one selected substat, `all` requires every selected substat, and `perSubstat` applies the quota separately for each selected substat.
- Importers clamp `rank`/`rarity` to `1..6`, coerce non-numeric stats to `StatVariant.Any`, and drop accessory factions whenever the combination refers to an armor slot. IDs fall back to regenerated `ku_<timestamp>_<rand>` values when blanks arrive from external files.
- Exporters write the combinations exactly as stored in app state. Detection snapshots (`keepUniqueDetection`) are runtime-only and never serialized; they rebuild automatically once the gear queue stabilizes.
- Downstream merge helpers label every emitted keep rule with `RULE_SOURCE_KEEP_UNIQUES` and assign a negative `ConfigID` (≤ `KEEP_UNIQUE_CONFIG_ID_BASE`) so Sellfile previews can highlight them without letting selection logic treat them as builder configs. The exported `ConfigName` mirrors the Keep Unique rule label so HSF uploads now carry the same metadata as regular configs.
- New sessions seed a default Keep Unique rule that protects 5★/6★ rings, amulets, and banners across every accessory-friendly set (1–9 families plus single-piece accessories) with `Per slot`, `Per set`, `Per faction`, and `Per main stat` scopes enabled so each combination preserves at least one item.
- A second rule (disabled by default) guards 5★/6★ weapons and armor pieces (weapon, helmet, shield, gauntlets, chestplate, boots) for the stun, toxic, cursed, provoke, and destroy sets with `Per slot` and `Per set` scopes (per-faction/per-main are off) so you can enable it later when those rare sets become important.

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
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'`). Value is `[crc32, payload]` where `payload` is a readable HSFC object (`buildHsfcPayload`) plus dialog-only metadata (filters, timestamps). `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, substatTargets, configs, finalSellRemainder, selectedConfigIndex, note, filters })` handles reading the entry, surfacing the Restore dialog, and re-enabling autosave after the user makes a choice. Rule Tester autosave (`AUTOSAVE_TESTER_KEY`) is loaded separately via `loadRuleTesterAutosaveDraft` and merged into the same dialog so the checkbox list can cover both builder and tester state.
- Restore vs Dismiss:
  - Restore: applies whichever sections the user checked — configs (including the builder selection), metasets, Substat Target Values, Final Sell remainder, the pinned note, filter panel state, and optionally the Rule Tester queue — then enables autosave.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog. The gear queue behaves the same way: the saved list stays in localStorage until the user restores it or future autosaves overwrite it.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden. Rule Tester autosave writes compressed payloads via `buildRuleTesterAutosavePayload` (with a timestamp) as soon as the queue diverges from the startup baseline (imports, restores, edits) and continues even if the Gear tab is closed; opening the Logic Hub dialog also primes autosave immediately.
- file:// note: LocalStorage behavior varies for file origins and can be non-persistent or path-scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.
- Autosave-only fields: `NoteConfigOptionsAnswers` stores the note config options answers and `NoteConfigOptionsDisabled` records when config options are ignored; HSFC exports never include these fields.

### App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`hsfcIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (`LEVEL_MILESTONES`) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Rarity “Auto”: HSFC read/write accepts `Rarity: "Auto"`. The builder resolves this to a concrete rarity code before generating HSF rules based on roll requirements, always evaluating against the full +0→+16 timeline so the level window only clips emitted rows:
  - Required rolls are the max of aggregate `minRequiredRolls` and the worst-case sum of per-stat `min` across generated permutations (fixed + highest mins among the remainder up to `minCount`).
  - Mapping: 0→Any, 1→≥ Uncommon, 2→≥ Rare, 3→≥ Epic, 4→≥ Legendary, 5→Mythical (exact).
  - When Auto has no roll requirements at all (aggregate min = 0 and no per-stat mins), it resolves to `Any` so no roll schedule is implied.
- Manual roll minimums: when `autoMinRequiredRolls=false` and `minRequiredRolls=0` (with no per-stat mins), the builder suppresses roll-based thresholds for all rarity codes so only base/presence targets are emitted.
- Presence guards: Locked substats still force Auto to pick a rarity that has those stats present at the earliest emitted level (always +0 for Auto resolution). Auto also clamps to the requested `minCount` (bounded by selected substats) so Flex merely changes permutations, not the rarity floor. At +0 the ladder becomes: needing 1/2/3/4 substats escalates to ≥Uncommon/≥Rare/≥Epic/≥Legendary respectively.
  - Feasibility check: if the base mapping cannot reach the required rolls by +16 given the baseline/start, Mythical is chosen when it makes the target feasible (pre-roll at +0); otherwise the base mapping is used and infeasible rows are pruned as usual.
- Levels follow `LEVEL_MILESTONES` (0/4/8/12/16).
- Level window: HSFC uses `minLevel` and `maxLevel` to bound emitted rules. When these fields are omitted the parser now defaults to the full `[0..16]` window.
- Count Rolls baseline: derived from the explicit level window. When the window starts at +0, rolls are credited only after the start level (legacy “afterStart”). Windows that begin above +0 treat rolls gained before the start as already allocated (“upToLevel”). Legacy HSFC `rollBaseline` fields are tolerated but ignored.
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode` (see `starForRankCode`). Each “roll” adds another base target for that substat.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode`. Roll distributions add multiples of the base target for each roll allocated to a substat.
- Default factory minima: `defaultSubstatTargets()` now mirrors the in-game floors (`6★ HP=200/ATK=15/DEF=15`, `5★ HP=160/ATK=12/DEF=12`, `4★ HP=120/ATK=10/DEF=10`, `3★ HP=110/ATK=9/DEF=9`, `2★ HP=100/ATK=8/DEF=8`, `1★ HP=90/ATK=7/DEF=7`). Legacy fixtures that still exercise the broader averages pin those higher values in their `Minima` block so the expanded permutations stay covered.
- Glyph limitations: the live game cannot apply glyphs to `CR%` or `CDMG%`. Any glyph-specific UI (tester roll filters, glyph presence filters, etc.) automatically excludes those stats to match in-game legality.
- Mythical pre-roll: When rarity selection includes Mythical (exact 15, ranges that include Mythical, or `>= Legendary`), treat there as being one pre-roll at level 0 on one substat.
  - Rarity = Any (0): by default does not assume Mythical. However, when either the sum of per-stat mins or the aggregate Min Required Rolls is 5, the builder treats `Any` as Mythical-capable and includes one pre-roll at +0 so feasibility checks and thresholds align with Σr = 5 scenarios.
  - Baseline substat count (Any): For the “how many substats exist at this level” check, `Any` behaves like `≥ Legendary` (no extra substats appear). Roll schedules still follow the selected rarity/range.
  - Baseline `'upToLevel'` counts this pre-roll at every level; `'afterStart'` only counts rolls gained after `minLevel` (so pre-roll applies when `minLevel` is 0).
  - The target budget by +16 is therefore 5 rolls when Mythical is included (4 otherwise).
- Fixed substats: rule permutations always include all fixed substats and pick additional substats from the remaining selected ones so the size is `max(minCount, fixedCount)`, capped at 4.
- Dynamic combo sizing before +16: At levels where the rarity cannot yet have `minCount` substats, the builder emits permutations sized to the number of substats that can physically exist (still honoring fixed substats). Once the available substats reach `minCount` (typically by +16), permutations use `minCount`.
- Legendary minima collapse: When the resolved rarity branch has no addition levels (Auto resolves to `≥ Legendary`, exact Legendary, or Mythical), the config requires all four selected substats (`minCount = maxCount = 4` with flex off), aggregate minima target `selected`, every participating substat keeps the factory minima, and no per-stat min/max or custom roll targets are present, `buildHsfRules` collapses each qualifying four-substat combination to its minima thresholds instead of enumerating roll partitions. A full 0–16 window promotes each combination to `LVLForCheck = 99` (“Any level”); partial windows still emit one minima row per milestone so level filters stay respected. Branches that introduce new substats later (Rare/Epic/Auto below ≥ Legendary) always enumerate the level-specific partitions.
- Epic factory triple collapse: Exact `Rarity = Epic` configs that require exactly three substats (flex off) and keep every participating stat at its factory minima (no per-stat overrides or custom roll targets) reuse the minima row for levels 0/4/8/12 instead of enumerating roll partitions. Level 16 still emits the full partition set because the fourth substat appears there. Collapse is disabled when a global roll minimum targets anything other than `selected` or demands a total other than the Epic schedule’s three rolls.
- Rare factory double collapse: Exact `Rarity = Rare` configs that require exactly two substats (flex off) and stick to factory minima reuse the minima row for levels 0/4/8; once +12 unlocks the third substat the builder resumes full partition enumeration.
- Auto + Flex branching: When Auto rarity, locked substats, and wildcard optionals line up, the builder now emits staged branches. The first branch inherits the Auto-resolved rarity code (respecting any Late keep floor) and keeps `minCount` equal to the locked set across the +0→+12 window, so enabling flex no longer bumps the preview to exact Epic; we skip this branch when the level window starts at +16. If the window reaches +16 we add a follow-up branch that raises `minCount` for the optional slot; this branch disables flex when the aggregate floor already equals the locked trio and leaves flex on only when extra permutations are required. A third branch always targets `≥ Legendary` (or higher) so Legendary timelines remain visible. Downstream collapse rewrites duplicate Epic/Legendary rule pairs to a single `≥ Epic` row and preserves the configured branch order.
- Branch ordering: Rule generation records the branch index and per-branch emission sequence. Preview sorting runs on `(level milestone, branch index, branch sequence, original index)` so all surfaces keep the builder’s intended order even after collapse/dedupe.
- Mainstat expansion: because HSF does not accept an array for main stat, multiple selections are unrolled into separate rules, one per selected main stat. An empty selection emits HSF rules with `MainStatID = -1` (Any).
  - HSF export always writes both `MainStatID` and `MainStatF` (using `-1` and `1` for “Any”).

### Roll Semantics (builder)

- Roll indicators (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
- `min = N (1..5)`: require at least N rolls; generates lower-bound rules after feasibility, and (in Potential/Early) early rows before feasibility.
  - Roll Upper Limit (`max = N`, 0..4): cap rolls at N. A `max = 0` forbids rolls on the substat (baseline value only). Distributions exceeding the upper limit are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores roll indicators entirely (only the starting, unrolled values).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential (Early) when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and the Roll Upper Limit do not affect Auto resolution.
- Auto aggregate floor: When `minRequiredRolls` stays on Auto, the builder mirrors the required substat count (or locked count when targeting `locked`) once two or more stats are tracked, but never exceeds the number of rolls the resolved rarity can deliver by +16. Single-stat configs continue to treat Auto as zero.
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
- Rule Tester evaluation mirrors RSL Helper by requiring the capped stat to exist (value > 0) before it evaluates a `<`/`<=` condition. To forbid a stat entirely, keep using the “Not \<stat\>” toggle so the rule does not match when the stat is present.
- Aggregate (Σ rolls) behavior: `minRequiredRolls` applies to the sum of rolls across the selected substats only; it does not implicitly raise per-stat thresholds. In Strict, distributions failing the aggregate are filtered; in Potential/Early, early rows are kept only if the aggregate can still be met by +16.
- Baseline row at start: In Potential/Early, if `avail === 0` but the aggregate can still be met by the target (e.g., Σr ≥ 4 with Legendary schedule), a baseline row is emitted at +0. This enables early “can still reach by +16” visibility.
- Wildcard-only + aggregate (all selected stats have `any: true`, and `minRequiredRolls > 0`):
  - Early: emits only minimal allocations at each milestone — the selected portion of rolls sums to `min(minRequiredRolls, avail)`. Extra rolls can land on non-selected stats (implicit “other” bucket). This keeps early rows concise and stable across levels.
  - Late: emits baseline-only rows at early milestones (+0/+4/+8/+12), and enforces the same minimal allocations at +16. When rarities provide more rolls than the “need now” total at an intermediate milestone (e.g., ≥ Epic branches at +8/+12), the builder routes the surplus to a virtual sink so the required rows are still emitted instead of being dropped.
- Wildcard-only, no aggregate (all selected are `any: true`, and `minRequiredRolls` is Auto/0): Potential/Early behaves like Strict for distributions (no “other” bucket). This prevents thresholds at +16 from being below earlier levels as additional substats become present.
- Legendary full-set keepers: when the config requires all four selected substats, applies no per-stat min/max bounds, spans the full 0..16 window, and the rarity selection has all four substats present at +0 (Legendary/Mythical paths), the builder emits a single `LVLForCheck = 99` row instead of enumerating the 70 roll permutations as long as `Min Required Rolls` is either Auto/0 or exactly matches the number of rolls those rarities can supply by +16 (4 for Legendary, 5 for Mythical). Any lower aggregate target keeps the milestone permutations.

## Migration Notes (HSFC)

- Rarity labels: The parser accepts human-readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). When both `rarityCode` and `Rarity` are supplied, the normalized string (including "Auto") overrides the numeric code.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in-app metasets, or against embedded `Metasets` for full HSFC objects. To ensure consistent resolution across machines, include `Metasets` in HSFC exports or pre-create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower-bound roll schedules, and no Mythical pre-roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre-roll), switch to exact `Legendary`/`Mythical`.
- Per-config pruning: Obsolete pruning runs per config before merging, so preview table counts match the builder chip. Cross-config overlaps remain visible by design.
- Back-compat: HSFC exports now require the explicit level window. When either `minLevel` or `maxLevel` is missing, the parser defaults to the full `[0..16]` window before the builder runs.

### Runtime Gear Sets (`*.gearsets.json`)
- Purpose: allow end users to hot-load brand-new gear-set definitions until an official release ships.
- File shape (`version = 1`):
  ```json
  {
    "version": 1,
    "sets": [
      {
        "id": 999,
        "name": "Celestial",
        "pieceGroup": "armorFixed", // 'accessories' | 'armorFixed' | 'armorVariable'
        "pieces": 2,               // number or string (e.g., "1–9")
        "text": "SPD +15%",
        "byPieces": { "4": "extra turn" },      // optional
        "icon": "data:image/png;base64,..."
      }
    ]
  }
  ```
- The app accepts drag‑and‑drop or manual file selection for `*.gearsets.json` files. All imagery must be embedded data URLs; no external fetches are allowed in the runtime sandbox.
- `examples/custom.gearsets.json` includes four reference entries (2-piece armor, accessory-only single piece, 4-piece armor, and a 1–9 flexible set) with inline PNG data so contributors can copy known-good structures.
- Validation:
  - `id` must be a positive integer.
  - `pieceGroup` must match the exported enum (`accessories`, `armorFixed`, `armorVariable`).
  - `pieces` and `text` are required; `byPieces` uses numeric keys.
  - `icon` is optional; when supplied it must be a `data:` URL (SVG, PNG, WebP, etc.). When omitted or invalid the UI falls back to a generated badge that displays the set ID.
- Persistence: accepted sets are merged into the in-memory catalogs immediately and saved to `localStorage` (`sellfileCreator.runtimeGearSets.v1`). HSFC files do not embed runtime sets; contributors should share the `.gearsets.json` alongside any `.hsfc` they distribute. On startup, stored sets remain dormant until the user opts into the “Gear Sets” checkbox in the **Restore Last Saved Configs?** dialog; declining (or dismissing the dialog) keeps the stored snapshot untouched until the next HSFC autosave or Rule Tester autosave writes, at which point the runtime registry snapshot (empty or not) is persisted. This lets contributors reopen the dialog later to reapply previously stored sets without re-importing.
- Behavior:
  - Built-in catalogs stay untouched; runtime entries override lookups (names, tooltips, icons) for their numeric IDs.
  - Selection menus, tooltips, builder chips, history entries, and exports all pull from the merged catalog.
  - Accessory compatibility (`ACCESSORY_SLOTS_COMPATIBLE_SET_IDS`) and piece-group helpers now query the merged registry so runtime IDs respect slot/faction constraints automatically.
  - All locales display the contributor-supplied `name`/`text` fields; there is no per-language override for hot-loaded sets.
  - Manual import buttons (`Load Configs` in the builder and `Load Sellfile` in preview) now share the same router as drag-and-drop, so they silently accept `.hsf`, `.hsfc`, `.l10n`, `.gearsets.json`, and gear database delta files.
