# Rules and Data

This document covers file schemas, builder semantics, and compatibility notes.

## File Formats

### HSF (RSL Helper)
- JSON container: `{ "Rules": HsfRule[] }` (UTF-8; BOM tolerated).
- Types: `src/lib/hsfTypes.ts`.
- Parsing: `src/lib/hsfIO.ts#parseHsfFile`.
- Build & write: `buildHsfFileFromMerged`, `hsfToBlob`.
- Builder-generated rules always prepend `RecipeID` (1-based recipe index) ahead of `Keep`/`IsRuleTypeAND`. Safeguard injections reuse a negative sentinel value (`RecipeID <= KEEP_UNIQUE_CONFIG_ID_BASE`, see `src/lib/constants.ts`) so they remain distinguishable without colliding with builder recipes. `RecipeName` is injected during export (using the latest trimmed label) so Sellfiles can reference the source recipe without forcing the preview table to rebuild on every rename. Final Sell rules (`__source === RULE_SOURCE_FINAL_SELL`) always export with `RecipeName: 'Final Sell'` regardless of `RecipeID`.
- Every exported rule also records `RowIdx` — a 1-based row counter that reflects the final order inside the HSF file. This stays stable after dedupe/merges so downstream automation can reconcile preview rows with their file offsets even when `RecipeID` is absent or reused.
- `cleanHsfForExport` strips every UI-only metadata field (anything prefixed with `__`, e.g., `__rankMask`, `__safeguardRuleId`, `__safeguardHash`, diagnostics from safeguard detection) before serializing. It also strips `[rrggbb]` color-directive prefixes from `RecipeName` (via `parseRecipeNameDirectives`) because those directives are display-only and must not appear in exported files. Push uploads reuse the same sanitized payload so endpoints never see transient fields.

### SFC (this app)
- JSON container: `{ "Version": string, "Metasets": Metaset[], "Minima": SubstatTargetTable, "Recipes": ReadableRecipe[], "FinalSellRemainder": { artifacts: boolean; accessories: boolean; levels: LevelMilestone[]; setsMode: 'any' | 'explicit' } }`. `Minima` stores the Substat Target Values table; the legacy name is preserved for compatibility. Recipe selection is not persisted in the SFC format; manual loads (file/clipboard/preset) select the first NON-SEPARATOR recipe and safeguard rule (`firstSelectableRecipeIndex` / `firstSelectableSafeguardIndex`; index 0 when only separators exist), while autosave restore re-applies the session's saved `SelectedRecipeIndex` / `SelectedSafeguardRuleIdx`.
  - Writer always includes `FinalSellRemainder` (even when off).
- Reader: when `FinalSellRemainder` is missing (older files), treat it as off with default ranges `[0,4,8,12]` and `setsMode = 'any'`.
  - Loader convenience applies to all builds: in addition to full SFC objects and `ReadableRecipe[]`, a single readable recipe object is accepted (matching `tests/fixtures/*.sfc`) so dragging fixtures into the app works everywhere.
- `Metaset` write format: `{ id: string; name: string; setNames: string[]; show?: boolean; iconId?: string }` — named group of artifact set names with an optional icon identifier. Defaults are created if omitted.
- `ReadableRecipe` (write format for Save/Copy) emits human-readable labels plus metaset IDs:
  - `name?`, `Tags?` (string[]), `keep`, `visibility`: `'Active' | 'Disabled'` (legacy files may also carry `'Separator'` — see the separator entry below).
    - `Tags` are **free-form user labels**. No tag carries app-defined behaviour, so renaming one never changes how rules are generated — but a note's overrides DSL can still select recipes by tag (`@tag=...`), which is how the bundled presets toggle groups of recipes, so renaming a tag can break a note that targets it.
  - **Recipe behaviour flags**, written only when set so a recipe that uses neither re-serializes byte-identically to a file written before they existed:
    - `IgnoredBySafeguards?: true` — this recipe's keeps do not count towards safeguard coverage. Read by `buildIgnoreSafeguardRecipeIndices` (`safeguards.ts`).
    - `ReworkGate?: 'reworked' | 'notReworked'` — restricts every emitted rule to one rework state. Absent means the recipe does not care. See [Chaos-ore rule gating](#chaos-ore-rule-gating-the-ore-property).
    - Both were expressed as "magic" tags until v1.0.42. Legacy files are transcoded on load — see [Legacy behaviour-tag transcode](#legacy-behaviour-tag-transcode).
  - **Separator entries (list dividers)** persist minimally and identically in BOTH the `Recipes` and the `Safeguards` arrays: `{ appearance?, Separator: true }` and nothing else (`ReadableSeparatorEntry` in `sfcIO.ts`). Every other field is irrelevant to a divider — the loaders (`normalizeRecipe` / `normalizeSafeguardRule`, and the WASM `sfc_reader`) rehydrate factory defaults, so slim separators round-trip safely. Legacy recipe files that marked separators via `SellfileVisibility: 'Separator'` (usually with a full field set) still load; the writer always emits the unified slim shape. Safeguard separators are inert by construction: `isSafeguardRuleActive` returns false for them, and every WASM projection sends them as `activation: off` rules so rule indices stay aligned without ever matching gear.
  - `Rank`: string label (e.g., `"≥ 5★"`); `Rarity`: string label or `"Auto"`; `Faction`: faction name string.
  - `mainStats`: string[] (labels).
  - `minLevel`, `maxLevel`: explicit level milestones (`LevelMilestone`). `earlyKeepMode?`: `'late'` when Late thresholds are active.
  - `substats`: array of `{ stat: string; fixed?: boolean; rollBounds?: { min?: number; max?: number; any?: boolean } }`. Each entry represents one selected substat, whether it is fixed, and its per-stat roll bounds. (The writer no longer emits separate `fixedSubstats`/`substatRollBounds` fields; the loader still accepts those legacy split shapes and converts them inside `sfcIO`.)
  - `autoRarityThreshold?`: `'uncommon' | 'rare' | 'epic'` — emitted only when Milestone Thresholds are Late+Auto and active (defaults to `'rare'`).
  - `minCount`, `autoMinCount`, `autoSubstatFlex?` (true only when flex actually applies).
- `minRequiredRolls`, `autoMinRequiredRolls`, `lockedMinRequiredRolls`. When `lockedMinRequiredRolls` is present and at least one substat is fixed, the builder treats the aggregate floor as “locked only” automatically — there is no separate scope flag anymore. Older SFC files may include `minRollsTarget: 'Locked'` or `substatMinTarget`; the importer converts those scope hints into `lockedMinRequiredRolls` (and clears the manual global floor when locked substats exist) so SFC exports no longer need the extra field while pure locked-scope recipes stay locked-only.
  - `artifactTypeNames?`: string[]; `artifactSetNames?`: `{ name: string; excluded?: true }[]` (excluded entries explicitly opt out of metaset-derived sets); `artifactMetaSetIds?`: string[] (IDs referencing the payload’s `Metasets` entries). The loader still accepts legacy `artifactSetNames: string[]`/`number[]` and `{ id | name, excluded? }` object entries for backward compatibility.
- `SubstatTargetTable` write format: label-keyed maps (Substat Target Values per rank).
- Compatibility: SFC loader targets the readable schema (labels + metaset IDs). For backward compatibility it still maps `artifactMetaSetNames` to IDs and tolerates legacy helpers like `rankCode`, but numeric stat IDs are no longer accepted.
- Compatibility boundary: legacy payload coercion stays in SFC IO (`parseSfcObject`/`parseSfcText`). WASM rule-engine bindings now expect canonical app payloads and fail fast on malformed inputs.
- Note marker compatibility is resolved at SFC IO boundaries: loader accepts legacy `<!-- config-options ... -->` and `<!-- keep-uniques(-re) ... -->` markers, and writers always emit canonical `<!-- recipe-overrides ... -->` and `<!-- safeguards(-re) ... -->` markers.
- Merged rules: metaset references are resolved to their member sets and unioned with explicit `artifactSets`, then `(base HSF Rules) + sum(Recipes.map(buildHsfRules))`.
  - `mergeRecipeArtifactSets` (in `ruleCache.ts`) pre-resolves a recipe's sets + metasets into a single flat include-only list and clears `artifactMetaSets` before fingerprinting and rule generation. This prevents the second `resolveArtifactSetSelections` call inside `buildRulesForRecipe` from re-adding sets that were explicitly excluded (e.g. `gearsets=+-Daze` on a metaset recipe would otherwise have Daze restored by the Utility metaset expansion).
  - Recipe overrides applied via `applyRecipeOverrides` / `resolveRecipeOverridesEffectiveRecipe` write excluded entries (`{ id, excluded: true }`) into `artifactSets` before the recipe reaches `mergeRecipeArtifactSets`, so the exclusion is correctly honoured during HSF rule generation.
- Final Sell (remainder) rules: when enabled (at least one gear type and at least one level selected), the merge appends Sell rules for every entry in `LEVEL_MILESTONES` (0/4/8/12/16). Milestones not selected in the UI are emitted as disabled (`Use: false`) instead of being omitted. In **Explicit** mode the rules list every currently known set in `ArtifactSet` so new game sets stay protected; in **Any** mode the `ArtifactSet` field is omitted so every present and future set matches. The alternate coverage mode (the option not selected in the dialog) is also emitted with `Use: false` so exports make the operator’s intent explicit.
  - Preview rows use native ellipsis (`title`) tooltips so the shorthand remains accessible even when truncated inside the table cell.

#### Safeguards payload

- SFC payloads also carry `Safeguards?: SafeguardRule[]` plus `SafeguardsEnabled?: boolean`. Autosave/clipboard/history reuse the same fields; omitting either key is treated as “off” with an empty gear-combination list. The array may also contain separator entries (`{ appearance?, Separator: true }` — see the recipe section above; same shape, same minimal-persistence rule).
- **Groups are POSITIONAL — a nested entry, not a field.** See [Groups](app-behavior.md#groups-safeguards-sharing-one-required-count) for the semantics. A group persists as ONE entry in the `Safeguards` array carrying its settings once plus the members it holds; a member's own record gains **no key** from the feature, so a list with no groups re-serializes byte-identically (pinned by `tests/unit/safeguard-groups-sfc-roundtrip.test.ts` against the shipped `presets/lategame.sfc`, whose `Safeguards` array holds 153 entries — 2 of them groups, flattening to 155 rules — beside 195 `Recipes`):
  - `{ Group: { requiredCount: number, countMode: {…} }, members: [ …rule entries… ] }` — the group's own count and bucket chips, written once (capitalised to match `Separator`), plus its members in order. **No `id`:** the nesting identifies the group, so nothing on disk needs to be unique and an id is minted per load (`grp/<index>` in Rust, which must stay reproducible). Each member's `tuple`/`requiredCount` are written unchanged — a member is an ordinary rule whose count sizes what it feeds the group. Separators are never nested.
  - The shape cannot express a torn or overlapping run, so the reader needs no group repair for anything the writer produced — that is the point of encoding membership as shape rather than as matching ids.
  - `buildReadableSafeguardEntries` / `parseReadableSafeguardEntries` (`lib/sfcIO.ts`) are the single definition of the projection, shared by the file/autosave path and the clipboard.
  - Forward-compat caveat, same class as separators: an **older** build reading a new file does not understand a nested entry, so its members are skipped rather than flattened. This format is not backward-readable by design — the id-based shape it replaced is no longer read.
  - `wasm/rule_engine_core/src/sfc_reader.rs` mirrors the nesting in `parse_sfc_safeguard_entries`. It must stay in step: the native DLL reads `.sfc` text with no TypeScript in the process, so a mismatch there silently drops every grouped rule for DLL consumers.
- Each rule entry serializes `{ id, requiredCount, activation, countMode, combination }` plus optional `improvementChanceThreshold?: { atLevel0: number; atLevel4: number|null; atLevel8: number|null; atLevel12: number|null }` (omitted when null / disabled). Each field is a percentage (0–100, one decimal); `atLevel4/8/12` inherit the resolved value of their left neighbour when null — `atLevel0` is always present when the feature is on. Legacy SFC files that stored a bare number are transparently upgraded by `normalizeLegacyImprovementChanceThreshold`. `countMode` stores the scope toggles `{ perRule, perSet, perFaction, perMainStat, perSlot }`; defaults when missing are `perRule=false`, `perSet=true`, `perFaction=true`, `perMainStat=true`, `perSlot=false`. Combinations are normalized via `normalizeSafeguardRule` and are written as readable labels (slot/set names, `5★` rank strings, rarity labels such as `Rare`, stat labels, faction names, metaset ids). `sets` now serialize as `{ name: string; excluded?: true }[]` so excluded gear sets remain explicit and parseable; older SFC strings (`string[]`) still load as includes. `mainStats` stores the selected stat variants (empty array = Any). Invalid combos are discarded during parsing so corrupted SFC files never reach the UI. `activation` accepts `off` / `protectExisting` / `anticipateGaps` / `anticipateImprovements`; missing or unknown values normalize to `protectExisting` (`normalizeSafeguardActivation`) — a legacy per-rule `enabled` flag is not consulted, so files that predate `activation` simply load in Protect mode. Note the forward-compat consequence: a file saved with a newer mode (e.g. `anticipateImprovements`) silently downgrades to Protect when opened in an older build.
  - SFC tuples no longer mirror the first entry via a `mainStat` field; downstream consumers must read the `mainStats` array (or handle it being empty for Any).
- Optional substat focus is stored as `substats?: string[]` (readable labels). Match behavior serializes `substatMatch?: '1' | '2' | '3' | '4' | 'perSubstat'` only when a non-default match is chosen; a missing value resolves to `1` (at least one). Legacy `'any'`/`'all'` tokens still load — `'any'` → `'1'`, `'all'` → the count of selected substats — but are no longer written. Substat scoring always uses the **current** (observed) substat value — normalized for cross-stat comparison — and is never projected forward to +16; weights apply in every min-count mode (`'1'`–`'4'`), while `perSubstat` ignores weights. Per-stat weights are stored as `substatWeights?: Record<string, number>` using the same labels and only include non-default weights for the selected substats.
- Multiple substats follow the match: `'1'`–`'4'` requires at least that many of the selected substats to be present, and `perSubstat` applies the quota separately for each selected substat.
- Importers clamp `rank`/`rarity` to `1..6`, coerce non-numeric stats to `StatVariant.Any`, and drop accessory factions whenever the combination refers to an artifact slot. IDs fall back to regenerated `ku_<timestamp>_<rand>` values when blanks arrive from external files.
- Exporters write the combinations exactly as stored in app state. Detection snapshots (`safeguardDetection`) are runtime-only and never serialized; they rebuild automatically once the gear queue stabilizes.
- Each `SafeguardDetectionEntry` now includes a `candidates?: SafeguardCandidateOut[]` array produced by the WASM detection pass. Each entry carries `{ itemKey, score, candidateRank, isWithinQuota }`: `candidateRank` is 1-based (1 = highest-scoring item); `isWithinQuota` is `true` for all top-N candidates (kept and sold alike), not only the sold ones. The field is absent on older cached snapshots and treated as an empty array. Artifacts in the detection entry also now cover the full ranked candidate pool (all matched items), not only the sold subset.
- `score_safeguard_candidates_value` (WASM) / `scoreSafeguardCandidatesWithLoadedWasm` (TS) — live preview scoring for the weight-configuration popover. Accepts a `SafeguardWasmScorePreviewIn` payload (`{ artifacts, substats, weights, keepCount }`) and returns a sorted `SafeguardWasmCandidateOut[]` with 1-based ranks and quota flags, without re-running the full detection pass. Used by `scoreSafeguardCandidates` in `safeguards.ts`.
- Downstream merge helpers label every emitted safeguard rule with `RULE_SOURCE_SAFEGUARDS` and assign a negative `RecipeID` (≤ `KEEP_UNIQUE_CONFIG_ID_BASE`) so Sellfile previews can highlight them without letting selection logic treat them as builder recipes. The exported `RecipeName` mirrors the Safeguard rule label so HSF uploads now carry the same metadata as regular recipes.
- New sessions seed a default Safeguard rule that protects 5★/6★ rings, amulets, and banners across every accessory-friendly set (1–9 families plus single-piece accessories) with `Per slot`, `Per set`, `Per faction`, and `Per main stat` scopes enabled so each combination preserves at least one item.
- A second rule (disabled by default) guards 5★/6★ weapons and artifact pieces (weapon, helmet, shield, gauntlets, chestplate, boots) for the stun, toxic, cursed, provoke, and destroy sets with `Per slot` and `Per set` scopes (per-faction/per-main are off) so you can enable it later when those rare sets become important.

### NativeInput / NativeOutput (native DLL)

These JSON schemas are consumed and produced by the `sfc_decide` C-ABI function in
`wasm/sfc_engine` (the `.hsf` export entry point, `sfc_build_hsf`, is documented below
under [NativeHsfInput / NativeHsfOutput](#nativehsfinput--nativehsfoutput-native-dll)). They are distinct from the browser WASM bindings and require no JavaScript runtime. Build, ABI surface, threading and
measured cost: [decision engine DLL](build-and-tooling.md#decision-engine-dll-sfc_engine).

**NativeInput** — passed as a JSON string to `sfc_decide`:

```jsonc
{
  // Raw .sfc file text as a JSON string value. The DLL parses it; no pre-parsing needed.
  "sfc": "{\"Version\":\"1.0\",\"Recipes\":[...],\"Safeguards\":[...]}",

  // Gear in the RAW wire shape the game reports — NOT the app's compact rows. The DLL
  // runs the raw->compact normalisation itself (artifact_log.rs), so a caller pipes its
  // packets straight in without running the app's TypeScript.
  "artifacts": [
    {
      "id": 1001,
      "kindId": 2,            // slot id
      "rankId": 6,            // stars 1-6
      "rarityId": 5,          // 1=Common … 6=Mythical
      "level": 9,             // RAW live level; the DLL floors it to its band (9 -> +8)
      "setKindId": 10,        // the set, for EVERY slot (accessories included)
      "requiredFraction": 4,  // accessory faction CODE — never a set id
      "rerollsCount": null,   // chaos-ore rework counter; feeds the Ore rule gate
      "primary":   { "id": 1, "isAbsolute": 0, "statValue": 51539607552 },
      "secondary": [ { "id": 4, "level": 4, "isAbsolute": 1,
                        // 32.32 fixed point: displayed value x 2^32. Pass it through
                        // unchanged — the DLL decodes and rounds it (see below).
                        "statValue": 90194313216,
                        // The mythical bonus. Producers disagree on the spelling, so
                        // BOTH are read and summed; a block populates only one.
                        "mValue": 0, "rValue": 0,
                        // Mirrored to document the wire, never counted: subValues are
                        // pre-glyph, matching the app's buildSubValueMap.
                        "glyphValue": 25769803776 } ]
    }
  ],

  // Optional, but it changes answers: it sets equipped_in_collection, which safeguard
  // scoring reads. Only id + the artifacts slot-map are used.
  "champions": [ { "id": 900, "artifacts": { "7": 1001 } } ],

  // Cost knobs. improvementChances is opt-IN (it costs several times the whole decision
  // chain and feeds no verdict); rules is opt-OUT.
  "improvementChances": false,
  "rules": true
}
```

**The normalisation the DLL performs** — one definition in `rule_engine_core::gear_ingest`,
called by the DLL and mirrored by the TS ingest in `gearDbNormalizer.ts`. Each of these was
once a live wrong answer, and each is silent when wrong:

| Rule | Why it matters |
|---|---|
| Fixed-point decode, then round per component (percent 2dp; flat HP/ATK/DEF + SPD/RES/ACC integral; else 3dp) | A "12" decodes to 11.999999964609742. ~44% of a real vault's substats are non-integral, and each failed a `>= 12` rule. |
| Level snapped to the milestone whose BAND it is in (0-3, 4-7, 8-11, 12-15, 16) — i.e. floored | `.hsf` has no "level >= N": a rule carries one `LVLForCheck` matched by EXACT equality, with `LEVEL_ANY_SENTINEL` (99) as the only wildcard — it bypasses the level gate entirely, and is what a full 0..16 window collapses to. Snapping is what lets a rule cover a range at all: a `LVLForCheck: 8` rule is the "8-11" rule, and a +9 matches it because it is snapped to 8 first. Skip the snap and the RAW 9 equals no milestone, so the piece misses every level-naming rule (any-level rules still take it) — and levels 1-3, 5-7, 9-11, 13-15 are ordinary gear, so that is a large share of any vault. The milestones bound those ranges rather than marking points to round to, so a piece belongs to the milestone it has REACHED: snapping to the nearest instead promoted the top of every band (a +15 judged as +16), so "keep only +16" kept gear that is not +16 and "sell below +16" spared it. |
| Setless ACCESSORY → `ACCESSORY_NO_SET_ID`; setless armour stays `0` | A reference sellfile has 397 rules naming the sentinel and none naming 0. Promoting armour too would hand setless chestplates to accessory rules. |
| Substat value = base + mythical, **never** the glyph, each component rounded then the sum | The app's `subValues` are pre-glyph. Counting a glyph clears thresholds the app's own preview fails. |
| Set from `setKindId` for every slot; `requiredFraction` is only the faction | Reading the faction code as an accessory's set gave every accessory a set id in the faction range. |
| StatVariant encoded via the shared `sub_to_variant` / `main_to_variant`, never a raw `(id << 8) \| flag` | The shared encoders canonicalize the flat suffix per family (SPD/RES/ACC always flat, CR/CDMG always percent) and reject unknown ids. Taking the wire's `isAbsolute` literally yields a variant no rule can name, so the threshold lookup misses and the piece drops to the final-sell catch-all. Substats and main stats need their own encoder — the two disagree for the ids each family allows. |
| Any non-zero flat flag means flat; an unknown stat id drops the slot | Masking the flag to its low bit reads a `2` as percent and flips the percent scaling; inventing a variant for an unknown id fabricates a substat the app never sees. |
| Duplicate-variant substats folded, then the SUM re-rounded | Each half is already rounded, but summing two rounded floats re-introduces error (9.06 lands at 9.059999999999999), and the evaluator's equality test is an exact epsilon compare. |

`s{n}lvl` on the compact row is the **roll count**; the substat VALUE a threshold compares
against is carried separately (`sub_values`) and is what makes numeric rules fire at all.

**NativeOutput** — returned as a JSON string from `sfc_decide`:

```jsonc
{
  "verdicts": [
    {
      "artifactId": 1001,
      "keep": true,
      "matched": true,        // false = no rule covered it → kept by DEFAULT
      "ruleName": "…",        // deciding rule's RecipeName, or null
      "safeguarded": false    // kept ONLY because a safeguard overrode a selling rule
    }
  ],
  "safeguardRanks": [
    {
      "artifactId": 1001,
      "ruleOrdinal": 2,       // 1-based safeguard rule
      "score": 41.5,
      "candidateRank": 7,     // 1-based across ALL of that rule's buckets
      "bucketRank": 2,        // 1-based within this piece's own bucket
      "bucketKey": "4:12:1025:0",   // "{slot}:{set}:{mainStat}:{faction}"
      "isWithinQuota": true,
      "groupId": "grp/0",     // null when the rule is ungrouped
      "substatBuckets": [ { "variant": 1025, "bucketRank": 1, "isWithinQuota": true } ]
    }
  ],
  "improvementChances": [ { "artifactId": 1001, "chancePercent": 72.4 } ],  // empty unless requested
  "rules": [ /* merged HSF rules — same shape as the app's HSF download */ ]
}
```

Four semantics that must not drift:

- **No match means KEEP.** A full export encodes "sell the rest" as an explicit trailing
  catch-all, so a no-match only arises for a partial or hand-written file — where keep is
  the safe default for an irreversible action. `matched: false` distinguishes it.
- **`first_match` is the verdict; `first_non_excluded_match` is the baseline.** The
  evaluator promotes a safeguard keep-override into `first_match`, and the app reads the
  same pair (`firstMatch` / `baseMatch`). Reading the non-excluded channel as the decision
  reports SELL for every rescued piece.
- **`safeguarded`** = decided-keep AND baseline-sell AND the deciding match is a
  keep-override source. A `.hsf` cannot express this state — `cleanHsfForExport` strips the
  `__source: "safeguards"` marker — which is the main reason this DLL exists.
- **The recipe-mode vector carries exactly three tokens.** `RECIPE_MODE_ACTIVE` /
  `_DISABLED` / `_SEPARATOR` (`matcher_evaluator.rs`) are the one spelling, matching the
  app's `SellfileExportMode` type; every producer imports them. The mode says whether a
  recipe *participates*, never what it decides — keep-vs-sell lives on each rule's `Keep`
  flag. The gate is a denylist (anything not disabled/separator participates), so an
  invented token works by accident until the gate becomes an allowlist and every rule is
  silently dropped; that is why the constants are exported rather than written inline.

On any error the DLL returns `{"error":"<message>"}` instead, never null — the failure reply
is that object and nothing else, so detect it by the payload STARTING with `{"error"`.
Scanning the whole body for the token also matches a rule name, reporting a problem on a
good answer.

### NativeHsfInput / NativeHsfOutput (native DLL)

Consumed and produced by the `sfc_build_hsf` C-ABI function, which renders a `.hsf` from
the same sellfile + gear a decision uses. The writer (`wasm/sfc_engine/src/hsf_export.rs`)
mirrors `src/lib/hsfIO.ts`: `{"Rules":[…]}` pretty-printed at two spaces, `__`-prefixed UI
metadata stripped, `RecipeID`/`RecipeName` hoisted ahead of the schema fields, a 1-based
`RowIdx` appended per rule, and final-sell rows relabelled `"Final Sell"`.

**NativeHsfInput** — the decide fields plus three content switches:

```jsonc
{
  "sfc":       "…",   // as NativeInput
  "artifacts": [ … ], // as NativeInput — a safeguard names the pieces it rescues, so a
                      // request with no gear yields no safeguards whatever the switch says
  "champions": [ … ], // as NativeInput

  // Omitted = follow the sellfile's own setting, so a request naming none of them
  // reproduces the app's own export. `false` withholds that source; `true` adds nothing,
  // since each source is already gated by the sellfile (safeguards_enabled, a defined
  // FinalSellRemainder, each recipe's use_flag) and a caller must not be able to invent
  // a sell the author did not ask for.
  "recipes":    true, // recipe rules, dropped BEFORE detection so safeguards are not
                      // injected for sells the requested file does not contain
  "safeguards": true, // AND-ed with the sellfile's own switch — it can only take away
  "finalSell":  true  // withholds the merge's finalSellRemainder, dropping the catch-all
}
```

`deny_unknown_fields` + `rename_all = "camelCase"` are deliberate: a misspelled switch is
refused rather than silently defaulting to on, which would hand back a file that still
sells everything.

**NativeHsfOutput**:

```jsonc
{
  "hsf":       "{
  \"Rules\": [ … ]
}",  // the complete file; write verbatim
  "ruleCount": 412                          // so a caller need not re-parse to size it
}
```

The three switches map onto three separate `ComputeMergedRulesIn` inputs (`custom_rules`,
`safeguard_enabled` + detection, `final_sell_remainder`), which is why they compose without
interfering — and why the outputs **partition**: `{safeguards:false}` and
`{recipes:false, finalSell:false}` are disjoint and their union is byte-identical to the
complete file's rule set, so a caller can split one sellfile into separate `.hsf` files by
origin without duplicating or losing a rule. **The choice must be made here**: `cleanHsfForExport` strips `__source`, so a
finished `.hsf` records nothing about which rule came from which source and cannot be
filtered after the fact.

### IO Helpers (SFC)
- Parse text/file: `parseSfcText`, `readSfcFile`.
- Build & write: `buildReadableRecipe`, `substatTargetsToReadable`, `buildSfcPayload`, `sfcToText` (the ONE serialization of an emitted document), `sfcTextToBlob` / `sfcToBlob` (download), `sfcTextToFile` + `CUSTOM_SFC_FILENAME` (wrapping text for the regular file-load path — bundled presets, the express Custom snapshot, the boot restore).
- Object parsing: `parseSfcObject` normalizes a pre-parsed SFC payload (readable schema). Autosave stores the same SFC payload with a CRC and restores via this parser.
- SFC parsing focuses on the readable schema; it applies the compatibility helpers noted above while HSF handles numeric legacy formats.
- Legacy recipe-bundle support (`.hsfc` extension, legacy keys, and legacy note markers) remains centralized in `src/lib/sfcIO.ts`.

### Clipboard Helpers
- `src/lib/clipboard.ts` centralizes clipboard interactions:
  - `writeTextSafe(text)` and `readTextSafe()` wrap the async Clipboard API with security checks and failure handling.
  - When writes are blocked, components dispatch `COPY_DIALOG_EVENT` to request that the App open a manual copy dialog prefilled with the content.
  - Fallback UI lives in `src/components/CopyDialog.tsx` (copy) and `src/components/PasteDialog.tsx` (paste).
- Copy All copies a full SFC: `{ Version, Metasets, Minima (Substat Target Values), Recipes, FinalSellRemainder }`.
- Copy single recipe copies a minimal SFC: `{ Version, Metasets: [only those referenced by the recipe], Recipes: [readable recipe] }` so pasting elsewhere brings required metasets.
- Paste accepts: a single recipe, an array of recipes, or a full SFC object (readable schema). Legacy shapes are not normalized.

### Autosave
- Storage: LocalStorage key from `src/lib/constants.ts` (`AUTOSAVE_KEY = 'sellfileCreator.autosave.sfc.v1'`). Value is `[crc32, payload]` where `payload` is a readable SFC object (`buildSfcPayload`) plus dialog-only metadata (filters, timestamps). `crc32` verifies integrity (`src/lib/autosave.ts`).
- Load/restore gating: `useAutosaveRestore({ key, version, metasets, substatTargets, recipes, finalSellRemainder, selectedRecipeIndex, note, filters })` handles reading the entry, surfacing the Restore dialog, and re-enabling autosave after the user makes a choice. All metaset equality comparisons during restore must go through `metasetsEqualSession(a, b)` (exported from `useAutosaveRestore.ts`) — it is the single source of truth for "are these two metaset lists interchangeable", checking both content (name + sets + iconId via `metasetsSignature`) and ID-set equality. Never inline this dual check; always import and call `metasetsEqualSession`. Gear Inspector autosave (`AUTOSAVE_GEAR_INSPECTOR_KEY`) is loaded separately via `loadGearInspectorAutosaveDraft` and merged into the same dialog so the checkbox list can cover both builder and Gear Inspector state.
- `AutosaveFiltersState` (the `Filters` field inside the autosave payload) now includes `builderRecipeCollapsed` and `builderSafeguardCollapsed` alongside the filter-panel views. Builder section collapse is treated as session state — not a permanent preference — so the app starts with all sections expanded, resets to defaults when the restore dialog opens, and applies the saved layout only if the user checks "View & Filter" and confirms. Non-default builder collapse counts as a meaningful difference (i.e., it affects `restoreFiltersDiffer` and shows the checkbox), unlike filter-panel open/collapsed which is considered UI-only.
- Restore vs Dismiss:
  - Restore: applies whichever sections the user checked — recipes (including the builder selection), metasets, Substat Target Values, Final Sell remainder, Safeguards (rules + enabled state), the pinned note, filter panel state, and optionally the Gear Inspector queue — then enables autosave.
  - Constraint: restoring Recipes or Safeguards while Metasets is unchecked is allowed only if those restored sections do not reference any metaset IDs from the autosave payload.
  - Dismiss: preserves the previous autosave and keeps autosave disabled. A baseline snapshot of the current state is captured; autosave only enables after the user makes a change (state diverges from this baseline). This avoids overwriting the previous session just by dismissing the dialog. The gear queue behaves the same way: the saved list stays in localStorage until the user restores it or future autosaves overwrite it.
- Writes: `useAutosave({ key, payload, enabled })` writes one snapshot immediately when enabled and on subsequent payload changes, and flushes the latest snapshot on `beforeunload`/visibility hidden. Gear Inspector autosave writes compressed payloads via `buildGearInspectorAutosavePayload` (with a timestamp) as soon as the queue diverges from the startup baseline (imports, restores, edits) and continues even if the Gear tab is closed; opening the Tools dialog also primes autosave immediately.
- file:// note: LocalStorage behavior varies for file origins and can be non-persistent or path-scoped. Prefer `npm run dev` or `npm run preview` for reliable autosave persistence.
- Autosave-only fields: `NoteRecipeOverridesAnswers` stores recipe-override question answers; `NoteSafeguardOverridesAnswers` stores safeguard-override slider and question answers; `NoteRecipeOverridesDisabled` records when dynamic overrides (both recipe and safeguard) are ignored as a unit — the key name is preserved for backward compatibility even though it now gates both systems. SFC exports never include these fields. Legacy keys (`NoteConfigOptionsAnswers`, `NoteConfigOptionsDisabled`) are still accepted on load.

### App Delegation and Boundaries
- `src/App.tsx` delegates all file IO to `hsfIO`/`sfcIO` and clipboard actions to `clipboard.ts`. Autosave restore flow is delegated to `useAutosaveRestore`.
- App uses `CopyDialog`/`PasteDialog` components for manual workflows; no direct use of normalization functions from UI code.
- Shift-modified `.sfc` imports (manual picker or drag/drop with Shift pressed) open a selective import dialog for Recipes, Note, Metasets, and Safeguards. Per-section import modes are supported (`replace`/`append` for recipes, note, safeguards; `replace`/`merge` for metasets), and metaset merge conflicts reuse the existing conflict dialog.
- Shift-modified import uses the same metaset dependency constraint as autosave restore: Recipes/Safeguards without Metasets are blocked when they reference metaset IDs from the incoming file.

## HSF Semantics (as used here)

- Rank codes (0–16), Rarity codes (0–16), Level milestones (`LEVEL_MILESTONES`) are interpreted in `hsfBuilder.ts` and `types.ts` based on observed samples.
- Rarity “Auto”: SFC read/write accepts `Rarity: "Auto"`. The builder resolves this to a concrete rarity code before generating HSF rules based on roll requirements, always evaluating against the full +0→+16 timeline so the level window only clips emitted rows:
  - Required rolls are the max of aggregate `minRequiredRolls` and the worst-case sum of per-stat `min` across generated permutations (fixed + highest mins among the remainder up to `minCount`).
  - Mapping: 0→Any, 1→≥ Uncommon, 2→≥ Rare, 3→≥ Epic, 4→≥ Legendary, 5→Mythical (exact).
  - When Auto has no roll requirements at all (aggregate min = 0 and no per-stat mins), it resolves to `Any` so no roll schedule is implied.
- Manual roll minimums: when `autoMinRequiredRolls=false` and `minRequiredRolls=0` (with no per-stat mins), the builder suppresses roll-based thresholds for all rarity codes so only base/presence targets are emitted.
- Presence guards: Locked substats still force Auto to pick a rarity that has those stats present at the earliest emitted level (always +0 for Auto resolution). Auto also clamps to the requested `minCount` (bounded by selected substats) so Flex merely changes permutations, not the rarity floor. At +0 the ladder becomes: needing 1/2/3/4 substats escalates to ≥Uncommon/≥Rare/≥Epic/≥Legendary respectively.
  - Feasibility check: if the base mapping cannot reach the required rolls by +16 given the baseline/start, Mythical is chosen when it makes the target feasible (pre-roll at +0); otherwise the base mapping is used and infeasible rows are pruned as usual.
- Levels follow `LEVEL_MILESTONES` (0/4/8/12/16).
- Level window: SFC uses `minLevel` and `maxLevel` to bound emitted rules. When these fields are omitted the parser now defaults to the full `[0..16]` window.
- Count Rolls baseline: derived from the explicit level window. When the window starts at +0, rolls are credited only after the start level (legacy “afterStart”). Windows that begin above +0 treat rolls gained before the start as already allocated (“upToLevel”). Legacy SFC `rollBaseline` fields are tolerated but ignored.
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode` (see `starForRankCode`). Each “roll” adds another base target for that substat.
- Rarity roll schedule (mapping in `rollLevelsForRarityCode`):
  - Common: none; Uncommon: [4]; Rare: [4,8]; Epic: [4,8,12]; Legendary/Mythical: [4,8,12,16].
  - Range codes map conservatively to the stricter schedule (see code for details).
- Substat thresholds: base substat targets derive from the star bucket inferred from `rankCode`. Roll distributions add multiples of the base target for each roll allocated to a substat.
- Default factory minima: `defaultSubstatTargets()` derives each star tier's floor from the `.min` of `SUBSTAT_ROLL_RANGES_BY_STAR` (`src/lib/generated/domainConstants.ts`, generated from `shared/domain-constants.json`) — e.g. `6★ HP=200/ATK=15/DEF=15`, `5★ HP=135/ATK=12/DEF=12`, down to `1★ HP=43/ATK=4/DEF=4`. The full per-rank table lives in [Artifact Rules → Substat Minimum Values](artifact-rules.md#substat-minimum-values); the generated constants are the SSOT. Legacy fixtures that still exercise broader averages pin higher values in their own `Minima` block so the expanded permutations stay covered.
- Glyph limitations: the live game cannot apply glyphs to `CR%` or `CDMG%`. Any glyph-specific UI (Gear Inspector roll filters, glyph presence filters, etc.) automatically excludes those stats to match in-game legality.
- Mythical pre-roll: When rarity selection includes Mythical (exact 15, ranges that include Mythical, or `>= Legendary`), treat there as being one pre-roll at level 0 on one substat.
  - Rarity = Any (0): by default does not assume Mythical. However, when either the sum of per-stat mins or the aggregate Min Required Rolls is 5, the builder treats `Any` as Mythical-capable and includes one pre-roll at +0 so feasibility checks and thresholds align with Σr = 5 scenarios.
  - Baseline substat count (Any): For the “how many substats exist at this level” check, `Any` behaves like `≥ Legendary` (no extra substats appear). Roll schedules still follow the selected rarity/range.
  - Baseline `'upToLevel'` counts this pre-roll at every level; `'afterStart'` only counts rolls gained after `minLevel` (so pre-roll applies when `minLevel` is 0).
  - The target budget by +16 is therefore 5 rolls when Mythical is included (4 otherwise).
- Fixed substats: rule permutations always include all fixed substats and pick additional substats from the remaining selected ones so the size is `max(minCount, fixedCount)`, capped at 4.
- Dynamic combo sizing before +16: At levels where the rarity cannot yet have `minCount` substats, the builder emits permutations sized to the number of substats that can physically exist (still honoring fixed substats). Once the available substats reach `minCount` (typically by +16), permutations use `minCount`.
- Legendary minima collapse: When the resolved rarity branch has no addition levels (Auto resolves to `≥ Legendary`, exact Legendary, or Mythical), the recipe requires all four selected substats (`minCount = maxCount = 4` with flex off), aggregate minima target `selected`, every participating substat keeps the factory minima, and no per-stat min/max or custom roll targets are present, `buildHsfRules` collapses each qualifying four-substat combination to its minima thresholds instead of enumerating roll partitions. A full 0–16 window promotes each combination to `LVLForCheck = 99` (“Any level”); partial windows still emit one minima row per milestone so level filters stay respected. Branches that introduce new substats later (Rare/Epic/Auto below ≥ Legendary) always enumerate the level-specific partitions.
- Epic factory triple collapse: Exact `Rarity = Epic` recipes that require exactly three substats (flex off) and keep every participating stat at its factory minima (no per-stat overrides or custom roll targets) reuse the minima row for levels 0/4/8/12 instead of enumerating roll partitions. Level 16 still emits the full partition set because the fourth substat appears there. Collapse is disabled when a global roll minimum targets anything other than `selected` or demands a total other than the Epic schedule’s three rolls.
- Rare factory double collapse: Exact `Rarity = Rare` recipes that require exactly two substats (flex off) and stick to factory minima reuse the minima row for levels 0/4/8; once +12 unlocks the third substat the builder resumes full partition enumeration.
- Auto + Flex branching: When Auto rarity, locked substats, and wildcard optionals line up, the builder now emits staged branches. The first branch inherits the Auto-resolved rarity code (respecting any Late keep floor) and keeps `minCount` equal to the locked set across the +0→+12 window, so enabling flex no longer bumps the preview to exact Epic; we skip this branch when the level window starts at +16. If the window reaches +16 we add a follow-up branch that raises `minCount` for the optional slot; this branch disables flex when the aggregate floor already equals the locked trio and leaves flex on only when extra permutations are required. A third branch always targets `≥ Legendary` (or higher) so Legendary timelines remain visible. Downstream collapse rewrites duplicate Epic/Legendary rule pairs to a single `≥ Epic` row and preserves the configured branch order.
- Branch ordering: Rule generation records the branch index and per-branch emission sequence. Preview sorting runs on `(level milestone, branch index, branch sequence, original index)` so all surfaces keep the builder’s intended order even after collapse/dedupe.
- Mainstat expansion: because HSF does not accept an array for main stat, multiple selections are unrolled into separate rules, one per selected main stat. An empty selection emits HSF rules with `MainStatID = -1` (Any).
  - HSF export always writes both `MainStatID` and `MainStatF` (using `-1` and `1` for “Any”).

### Chaos-ore rule gating (the `Ore` property)

The recipe field `reworkGate` narrows the rules a recipe emits to one **rework** state — "rework" is the domain term for applying a Chaos Ore to a gear piece. It follows the same sentinel convention as `MainStatID`: an ungated recipe is unconstrained, so existing recipes are byte-for-byte unaffected.

| `reworkGate` | Emitted `Ore` | Matches |
| --- | --- | --- |
| *(absent)* | key omitted (`ORE_ANY` = `-1`) | any gear, regardless of rework state |
| `reworked` | `1` (`ORE_ORED`) | only gear that has been reworked (`rerollCount > 0`) |
| `notReworked` | `0` (`ORE_NOT_ORED`) | only gear that has not been reworked (`rerollCount === 0`) |

- **Tri-state by construction, so there is no exclusivity rule to enforce.** The field is absent when the recipe does not care, which makes "both states at once" unrepresentable — an editor cannot produce it, and neither can a hand-edited file. This replaced a pair of mutually exclusive tags that needed `applyReworkTagExclusivity` in every editor path plus an `if_reworked` wins precedence rule for files that carried both. The only place precedence still exists is the legacy transcode (below), which resolves a contradictory *old* file the same way the tag-era resolver did.
- **Sentinels and tokens are cross-language SSOT.** `ore`, `reworkGate` and `recipeFlagFields` in `shared/domain-constants.json` emit `ORE_ANY` / `ORE_NOT_ORED` / `ORE_ORED`, `REWORK_GATE_REWORKED` / `REWORK_GATE_NOT_REWORKED`, and the SFC key names into both `src/lib/generated/domainConstants.ts` and `wasm/rule_engine_core/src/generated_domain_constants.rs`. Never hand-declare these values. Because serde's `rename` needs a literal, `sfc_reader.rs` spells the two SFC keys out and pins them to the generated constants with a `const _: () = { assert!(...) }` block, so a rename in the spec fails the Rust build instead of silently producing a reader that ignores the field.
- **Gate → sentinel is one definition per language.** TS: `oreSentinelForRecipe` in `src/lib/recipeFlags.ts`. Rust: `resolve_chaos_ore_value` in `wasm/rule_engine_core/src/sfc_reader.rs` (used by the native-DLL SFC reader path). Both also carry the legacy tag fallback **and gate it on the same version window** (see below) — a divergence there would make the same file sell different gear in the app than through the DLL. `matcher_evaluator.rs`'s `rework_gate_resolves_to_expected_sentinels` / `legacy_recipe_tags_still_resolve_to_expected_sentinels` / `an_explicit_gate_beats_a_stale_legacy_tag` / `the_legacy_tag_fallback_honours_the_same_version_window_as_typescript` mirror `tests/unit/recipe-flags.test.ts` + `tests/unit/sfc-io-compat-keys.test.ts` to pin them to identical behavior.
- **The flags join the rule-cache fingerprint automatically.** `recipeSnapshot.ts` excludes `tags` wholesale via `IGNORED_KEYS` (renaming a user label must not rebuild every rule). That exclusion is only safe because no tag carries app-defined behavior any more: the two behavior-carrying values are real `BuilderRecipe` fields, so the snapshot's generic key sweep picks them up with no registry to maintain. (A note's `@tag=` selector does read tags, but it is applied when overrides resolve — after rule generation — so it does not belong in this fingerprint.) This removed `describeSemanticTags` / `SEMANTIC_TAG_CONTRIBUTIONS` entirely. Regression cover: `tests/unit/recipe-flags-cache-key.test.ts`.
- **Both flags are omit-when-default, and every writer must honour that.** A cleared flag is the *absent key*, never a stored `false` / `undefined`. This is load-bearing precisely *because* the fingerprint sweep is generic: it iterates `Object.entries(recipe)`, so a recipe carrying `ignoredBySafeguards: false` fingerprints differently from the identical recipe reloaded from disk (the SFC loader only ever emits a key when it is set) — a spurious full rule rebuild after every clear. `writeRecipeFlag` in `src/lib/recipeFlags.ts` is the single definition of the rule; all three writers go through it — the single-edit handlers in `RecipeBuilderPanel`, the multi-edit apply path (`setRecipeFieldValue` in `recipeMultiEditDraft.ts`, routed via `isRecipeFlagKey`), and the overrides apply step (`applyRecipeOverrides` in `noteRecipeOverrides.ts`). Its `value` parameter is correlated with `key`, so a gate token cannot be written into the boolean field; the multi-edit path holds an unnarrowable `BuilderFieldValue` and casts once at that boundary rather than widening the signature for everyone. Regression cover: "clearing a flag omits the key rather than storing a falsey value" in `tests/unit/recipe-flags-cache-key.test.ts`.
- **The flags' UI presentation is one registry.** `src/components/recipeFlagChips.ts` holds the glyph, the i18n term, the hint key, the read predicate, and the write pair (`fieldKey` + `onValue`) per flag state; the recipe builder's `Flags:` chip row and `RecipeChip`'s Keep/Sell badge both render from it, so a flag cannot show one glyph in the panel and another on the chip. Because `fieldKey` names the recipe field a chip aggregates and writes, neither surface re-derives the id→field mapping with its own ternary, and adding a flag is one registry entry rather than an entry plus hand-edits in the panel. It lives under `components/` rather than in `lib/recipeFlags.ts` because it references `I18nKey`, and the domain module stays free of UI imports.
- **`Ore` is a real HSF field, not UI metadata.** It carries no `__` prefix, so `cleanHsfForExport` passes it straight through to the exported Sellfile. Ungated recipes emit no `Ore` key at all (`input.ore.filter(|v| *v != ORE_ANY)` in `hsf_builder_execution.rs`), which is what keeps existing exports unchanged.
- **`Ore` gates first-match AND "other matches" together.** `evaluate_item` builds the first-match and the per-recipe decision list (`matchingRecipeIndices` / `matchingRecipeDecisions`, what the Gear Inspector shows as *other matches*) from two different accumulators, but BOTH sit inside the one `match_rule_gate` call — so a rework-mismatched recipe is absent from the other-matches list, not merely outranked in it. This is load-bearing on `ore` being a field of `RuleGate`: that struct is simultaneously the `BTreeMap` grouping key in `RuleBucket::from_ordered_rules` and the input to `match_rule_gate`, and the matcher runs only ONE gate check per group head. Removing `ore` from `RuleGate` would let recipes with opposite rework gates share a group, and the head check would admit the wrong ones. Regression cover: "a rework-mismatched recipe is absent from other matches" in `tests/unit/chaos-ore-rule-gating.test.ts`.
- **Matching is Rust-owned.** The gate lives in `match_rule_gate` (`matcher_evaluator.rs`) alongside the other constant-per-group fields; TypeScript delegates through the WASM engine and has no second implementation. Missing item rework data counts as *not reworked*, matching how the Gear Inspector's Chaos Ore filter reads the same field.
- **The item side needed a new wire field.** `rerollCount` (the pre-existing DB/field spelling for the rework count — the `REROLLCOUNT` column) lives in `previewExtras` on the TS side, and `previewExtras` is deliberately stripped down to `id` at the WASM boundary — so `TestItemRaw` gained its own `rerollCount`, projected in `toWasmTestItem` (`src/lib/wasm/wasmRuleEngine.ts`). If that projection regresses, `tests/unit/chaos-ore-rule-gating.test.ts` fails.
- **`Ore` participates in every dedupe identity.** Two rules differing only by their chaos-ore gate select different gear, so merging them would drop a constraint. It is part of `BuilderEmissionSignatureKey` (`hsf_builder_execution.rs`) and of all three keys in `rule_dedupe.rs` (`ObsoleteCoarseKey`, `CollapseCanonicalKey`, `ExportDedupeBaseKey`).
- **Safeguards are never ore-gated.** Injected keep-rules and the Final Sell catch-all emit `Ore: None`, so safeguards and the final sweep stay independent of rework state.
- **Preview column.** The rules table shows an `Ore` column in `auto` mode: hidden until some rule actually constrains it (`isChaosOreConstrained`), exactly like the `Faction` column. Unconstrained rules render blank, mirroring how an `Any` main stat shows nothing.

### Roll Semantics (builder)

- Roll indicators (per selected substat) — mutually exclusive UI states:
  - `any = true` (star): enumerate distributions; no numeric minimum on this substat.
- `min = N (1..5)`: require at least N rolls; generates lower-bound rules after feasibility, and (in Potential/Early) early rows before feasibility.
  - Roll Upper Limit (`max = N`, 0..4): cap rolls at N. A `max = 0` forbids rolls on the substat (baseline value only). Distributions exceeding the upper limit are filtered. If any substat requests `min > max`, the level/combo is impossible and no rows are emitted.
- Off mode: ignores roll indicators entirely (only the starting, unrolled values).
- Auto mode: resolves to Strict when no selected substat has `min ≥ 1` and `minRequiredRolls` is 0 (or Auto); resolves to Potential (Early) when either any selected substat has `min ≥ 1` or `minRequiredRolls > 0`. Star (★) and the Roll Upper Limit do not affect Auto resolution.
- Auto aggregate floor: When `minRequiredRolls` stays on Auto, the builder mirrors the required substat count (or locked count when targeting `locked`) once two or more stats are tracked, but never exceeds the number of rolls the resolved rarity can deliver by +16. Single-stat recipes continue to treat Auto as zero.
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
- Gear Inspector evaluation mirrors RSL Helper by requiring the capped stat to exist (value > 0) before it evaluates a `<`/`<=` condition. To forbid a stat entirely, keep using the “Not \<stat\>” toggle so the rule does not match when the stat is present.
- Aggregate (Σ rolls) behavior: `minRequiredRolls` applies to the sum of rolls across the selected substats only; it does not implicitly raise per-stat thresholds. In Strict, distributions failing the aggregate are filtered; in Potential/Early, early rows are kept only if the aggregate can still be met by +16.
- Baseline row at start: In Potential/Early, if `avail === 0` but the aggregate can still be met by the target (e.g., Σr ≥ 4 with Legendary schedule), a baseline row is emitted at +0. This enables early “can still reach by +16” visibility.
- Wildcard-only + aggregate (all selected stats have `any: true`, and `minRequiredRolls > 0`):
  - Early: emits only minimal allocations at each milestone — the selected portion of rolls sums to `min(minRequiredRolls, avail)`. Extra rolls can land on non-selected stats (implicit “other” bucket). This keeps early rows concise and stable across levels.
  - Late: emits baseline-only rows at early milestones (+0/+4/+8/+12), and enforces the same minimal allocations at +16. When rarities provide more rolls than the “need now” total at an intermediate milestone (e.g., ≥ Epic branches at +8/+12), the builder routes the surplus to a virtual sink so the required rows are still emitted instead of being dropped.
- Wildcard-only, no aggregate (all selected are `any: true`, and `minRequiredRolls` is Auto/0): Potential/Early behaves like Strict for distributions (no “other” bucket). This prevents thresholds at +16 from being below earlier levels as additional substats become present.
- Legendary full-set keepers: when the recipe requires all four selected substats, applies no per-stat min/max bounds, spans the full 0..16 window, and the rarity selection has all four substats present at +0 (Legendary/Mythical paths), the builder emits a single `LVLForCheck = 99` row instead of enumerating the 70 roll permutations as long as `Min Required Rolls` is either Auto/0 or exactly matches the number of rolls those rarities can supply by +16 (4 for Legendary, 5 for Mythical). Any lower aggregate target keeps the milestone permutations.

## Migration Notes (SFC)

- Rarity labels: The parser accepts human-readable `Rarity` strings (e.g., "≥ Epic", "Legendary", "Any"). When both `rarityCode` and `Rarity` are supplied, the normalized string (including "Auto") overrides the numeric code.
- Metaset names: On paste/import, `artifactMetaSetNames` are resolved against the current in-app metasets, or against embedded `Metasets` for full SFC objects. To ensure consistent resolution across machines, include `Metasets` in SFC exports or pre-create matching metaset names.
- ≥ ranges (conservative): `≥ Common..≥ Epic (6..9)` now use their lower-bound roll schedules, and no Mythical pre-roll is assumed for any `≥` range. If you depended on the old behavior (Legendary schedule + Mythical pre-roll), switch to exact `Legendary`/`Mythical`.
- Per-recipe pruning: Obsolete pruning runs per recipe before merging, so preview table counts match the builder chip. Cross-recipe overlaps remain visible by design.
- Back-compat: SFC exports now require the explicit level window. When either `minLevel` or `maxLevel` is missing, the parser defaults to the full `[0..16]` window before the builder runs.

### Legacy behaviour-tag transcode

Two behaviours used to be encoded as "magic" tags the app searched for inside the user's own tag list: safeguard-ignore and the rework gate. They are explicit recipe fields now (`ignoredBySafeguards`, `reworkGate`), which is what lets `recipeSnapshot.ts` exclude `tags` from the rule-cache fingerprint without exceptions and lets the tag picker stop flagging some tags as special. Everything below exists purely so files written before the flags keep working.

- **The transcode is the SSOT.** `transcodeLegacyRecipeTags` (`src/lib/recipeFlags.ts`) splits a stored tag list into the flags it was encoding plus the labels that survive; `transcodeLegacyNoteTagSelectors` does the same for the overrides DSL inside a note. Both run at the SFC IO boundary (`parseSfcObject`, and the `canonicalizeLegacyNoteMarkers` chain in `sfcIO.ts`).
- **Every shipped spelling is accepted**, listed once in `legacyRecipeTags` in `shared/domain-constants.json` and generated into both languages: `ignore_by_safeguards` / `ignore_keep_unique` / `ignore_safeguard` → `ignoredBySafeguards`; `if_reworked` / `only_for_chaos_ored` → `reworkGate: 'reworked'`; `if_not_reworked` / `ignore_for_chaos_ored` → `reworkGate: 'notReworked'`.
- **It runs only inside the legacy version window, in BOTH languages.** The window's ceiling is `legacyRecipeTags.lastWritingVersion` in `shared/domain-constants.json` (currently `1.0.41`), generated into `LEGACY_RECIPE_TAG_LAST_WRITING_VERSION` for TS and Rust alike — it is never spelled as digits in either reader. `usesLegacyBehaviourTags` (`sfcIO.ts`) and `uses_legacy_behaviour_tags` (`sfc_reader.rs`) each parse the ceiling off that constant, so the app and the native DLL cannot disagree about which files convert. `1.0.41` is the last release that *wrote* behaviour tags, so anything newer already stores the real flag keys and a legacy-looking tag there is a deliberate user label — converting it would silently eat a name the user chose. A **missing or unparseable** `Version` reads as old and therefore still converts, which is what keeps hand-written and third-party files working; both `sfcVersionAtMost` and its Rust mirror `sfc_version_at_most` coerce a non-numeric segment to `0` for exactly this reason (in TS, `??` does not catch `NaN`, and an uncoerced `NaN` loses every comparison and would wrongly report such a file as new). Pre-release suffixes are stripped first, so `1.0.41-dev` sits inside the window and `1.0.42-dev` outside it. There is no scheduled removal version: the transcode, its `LEGACY_TAGS_*` constants, and the spec block go together once files that old no longer need to load.
- **Every load path passes the file's `Version`.** `parseSfcObject` reads it before normalizing recipes; `parseRecipesFromText` (clipboard / single-recipe import) reads it off a pasted SFC object too, so a paste and a file load of the same bytes convert identically. A bare recipe array carries no context and reads as old, which is the documented fallback. `resolve_chaos_ore_value` takes the version as its third argument, threaded from `ReadableSfc.version` through `parse_readable_recipe`.
- **The save path never converts.** `canonicalizeLegacyNoteMarkers` takes the version being *written*, so the selector rewrite does not fire on export: a legacy spelling that survived to save is the author's own text and round-trips verbatim. Marker-wording canonicalization still runs unconditionally there — it carries no behaviour.
- **An explicit flag key beats a legacy tag** in the same file: a current build wrote the key, so it must win over a stale tag left behind by a hand merge. Both the TS loader and `resolve_chaos_ore_value` in Rust apply that precedence.
- **A contradictory legacy file resolves to `reworked`.** Carrying both rework tags was always meaningless, but hand-edited files exist; this preserves the precedence the tag-era resolver documented so such a file loads exactly as it used to. The *field* cannot express the contradiction at all, so this rule lives only in the transcode.
- **Note bodies are rewritten too, on the same window.** A note whose DSL said `@tag=ignore_by_safeguards { … }` would select nothing once the tag is stripped, so the selector is rewritten onto the flag comparison. Both passes share `usesLegacyBehaviourTags`, so a file can never have its tags left alone while its notes are rewritten to match tags that are no longer there. Deliberately narrow: only the single-value `tag=X` / `tag:X` form is rewritten, because that is the only form ever shipped in a note. The `tag in [a,b]` list form is left untouched — a flag comparison cannot express set membership, so rewriting it would produce invalid DSL rather than a working selector.
- **To remove it all:** delete the `legacyRecipeTags` block from the spec (including `lastWritingVersion`), the generated `LEGACY_TAGS_*` / `LEGACY_RECIPE_TAG_*` constants, the transcode section of `recipeFlags.ts`, its call sites and `usesLegacyBehaviourTags` in `sfcIO.ts`, the legacy fallback plus `uses_legacy_behaviour_tags` / `sfc_version_at_most` in `sfc_reader.rs` (and the `source_version` parameter threaded through `parse_readable_recipe`), and the legacy tests in `tests/unit/recipe-flags.test.ts` + `matcher_evaluator.rs`.
- Regression cover: `tests/unit/recipe-flags.test.ts` (transcode + note rewrite), `tests/unit/sfc-io-compat-keys.test.ts` (load/save round-trip, omit-when-unset, explicit-key precedence, **and the version window** — boundary at 1.0.41/1.0.42, pre-release suffixes, missing/unparseable versions, note-and-tag agreement, no rewrite on save, and the pasted-SFC path honouring its own `Version`), and `legacy_recipe_tags_still_resolve_to_expected_sentinels` + `the_legacy_tag_fallback_honours_the_same_version_window_as_typescript` in `matcher_evaluator.rs`.

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
        "pieceGroup": "artifactFixed", // 'accessories' | 'artifactFixed' | 'artifactVariable'
        "pieces": 2,               // number or string (e.g., "1–9")
        "text": "SPD +15%",
        "byPieces": { "4": "extra turn" },      // optional
        "icon": "data:image/png;base64,..."
      }
    ]
  }
  ```
- The app accepts drag‑and‑drop or manual file selection for `*.gearsets.json` files. All imagery must be embedded data URLs; no external fetches are allowed in the runtime sandbox.
- `examples/custom.gearsets.json` includes four reference entries (2-piece artifact, accessory-only single piece, 4-piece artifact, and a 1–9 flexible set) with inline PNG data so contributors can copy known-good structures.
- Validation:
  - `id` must be a positive integer.
  - `pieceGroup` must match the exported enum (`accessories`, `artifactFixed`, `artifactVariable`). Legacy values `armorFixed`/`armorVariable` (pre-rename exports) are still accepted on import and normalized via `normalizePieceGroupValue` (`src/lib/gearSets/groups.ts`).
  - `pieces` and `text` are required; `byPieces` uses numeric keys.
  - `icon` is optional; when supplied it must be a `data:` URL (SVG, PNG, WebP, etc.). When omitted or invalid the UI falls back to a generated badge that displays the set ID.
- Persistence: accepted sets are merged into the in-memory catalogs immediately and saved to `localStorage` (`sellfileCreator.runtimeGearSets.v1`). SFC files do not embed runtime sets; contributors should share the `.gearsets.json` alongside any `.sfc` they distribute. On startup, stored sets remain dormant until the user opts into the “Gear Sets” checkbox in the **Restore Last Saved Recipes?** dialog; declining (or dismissing the dialog) keeps the stored snapshot untouched until the next SFC autosave or Gear Inspector autosave writes, at which point the runtime registry snapshot (empty or not) is persisted. This lets contributors reopen the dialog later to reapply previously stored sets without re-importing.
- Behavior:
  - Built-in catalogs stay untouched; runtime entries override lookups (names, tooltips, icons) for their numeric IDs.
  - Selection menus, tooltips, builder chips, history entries, and exports all pull from the merged catalog.
  - Accessory compatibility (`ACCESSORY_SLOTS_COMPATIBLE_SET_IDS`) and piece-group helpers now query the merged registry so runtime IDs respect slot/faction constraints automatically.
  - All locales display the contributor-supplied `name`/`text` fields; there is no per-language override for hot-loaded sets.
  - Manual import buttons (`Load Recipes (.sfc)` in the builder and `Load Sellfile` in preview) now share the same router as drag-and-drop, so they silently accept `.hsf`, `.sfc` (legacy `.sfc`), `.l10n`, `.gearsets.json`, and gear database delta files.
