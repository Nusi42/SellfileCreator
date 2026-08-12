# Anomalous Accessories

**Status: exporting.** RSL Helper dumps Anomalous Accessories into its gear
database *and* writes them into sellfiles, and we now have both sides:
`examples/um109288203_RSLHelper.db` (artifacts 264537–264539) for the gear
model, and **`docs/orig/anomalous.hsf`** for the rule encoding. That sample —
eight rules matching a screenshot one-for-one — confirmed all eight stat ids
(including the four that had been inferred) and fixed the wire format, which
retired the export scrub.

What remains judged is the **value model beyond rank 5**: one observed base
(1.25% per line at zero rolls) and no data on per-roll increments or the other
five ranks. Those sites carry the greppable marker `JUDGED(anomalous …)` —
search for it to find every assumption still standing.

## Confirmed facts

### From the sample sellfile (`docs/orig/anomalous.hsf`)

Eight rules, each with one anomalous substat line, matching the captured
screenshot in order:

| Rule | Screenshot | `ID` | `IsFlat` | `Value` |
| --- | --- | --- | --- | --- |
| 1 | PvE DMG+ 0,25% | 11 | `false` | 25 |
| 2 | PvP DMG+ 0,5% | 12 | `false` | 50 |
| 3 | Boss DMG+ 0,75% | 13 | `false` | 75 |
| 4 | DNG DMG+ 1% | 14 | `false` | 100 |
| 5 | PvE DMG− 1,25% | 15 | `false` | 125 |
| 6 | PvP DMG− 1,5% | 16 | `false` | 150 |
| 7 | Boss DMG− 2% | 17 | `false` | 200 |
| 8 | DNG DMG− 2,25% | 18 | `false` | 225 |

Three things follow, and all three are load-bearing:

1. **All eight ids are confirmed.** `14/15/17/18` had been *inferred* from
   mode-order contiguity against the DB; the sample proved the inference right,
   so no renumbering was needed.
2. **Values are stored in hundredths of a percent** (`0.25%` → `25`). This is
   anomalous-specific: `docs/orig/rules.hsf` stores classic percent stats plain
   (`5` = 5%). The scale lives in the spec as `hsfValueScale`.
3. **The rules are otherwise ordinary** — `IsFlat: false` (percent-shaped,
   matching the DB's `fl = 0`), `Condition: ">="`, the other three substat slots
   `ID: -1` padding, `Rank`/`Rarity` 0, `MainStatID` −1. No new rule grammar.

The sample also demonstrates **0.25 granularity** (0,25 / 0,5 / 0,75 are all
expressible), which is why targets quantize to the wire resolution rather than
to a coarse roll grid.

All of the above is asserted, not paraphrased, by
`tests/unit/anomalous-hsf-sample.test.ts` — it reads the sample file directly,
so a change in RSL Helper's format fails a test instead of silently corrupting
exports.

### From the gear database

| Fact | Basis |
| --- | --- |
| Stat ids `11` PvE, `12` PvP, `13` Boss, `14` DNG — damage **dealt** ("+"), positive values | Observed (artifacts 264537–264539) + sample sellfile |
| Stat ids `15..18` — damage **taken** ("−"), stored as **negative** percents (−1.25% renders "PvP DMG-") | Observed (`16`) + sample sellfile |
| All lines `fl = 0` (percent), values scale by 2³² with ×100 display conversion (±53687091 → 1.25%) | Observed |
| Rank-5 base per line = **1.25%** at zero rolls | Observed |
| A rank-5 **Banner** with a set (Supersonic) exists — Banner eligibility confirmed | Observed |

### From the announcement

- **Source:** Champion Proving Grounds, a new permanent rotation-based dungeon
  (player level 60+, 27 stages, 28-day rotations). Anomalous Accessories come
  from its milestone rewards / Proving Ground Chests and are exclusive to the
  mode.
- **Nature:** a new *type* of accessory. Pieces retain their parent Set bonuses,
  but substats "may include one or a combination of new boons **instead of** the
  flat Stat bonuses from before" — i.e. a piece can plausibly mix classic and
  anomalous substat lines (unconfirmed; see unknowns).
- **The eight new substats** (labels verbatim from the announcement):
  - `PvE DMG +` / `PvE DMG -` — increased damage dealt / decreased damage taken in PvE modes.
  - `PvP DMG +` / `PvP DMG -` — same for PvP modes.
  - `Boss DMG +` / `Boss DMG -` — same against Bosses.
  - `DNG DMG +` / `DNG DMG -` — same in Dungeons.
  - Same-family bonuses stack (e.g. PvE-damage and Boss-damage both apply).
- **Eligible sets (announced, final):** Stone Skin, Protection, Supersonic,
  Merciless, Bloodshield, Reaction, Revenge, Refresh, Cleansing — all nine
  already exist in the set catalog (`shared/domain-constants.json` →
  `artifactSet`); no new set ids are needed.
- **Storage:** jewelry storage grows by 200 slots (no app impact — we never
  model storage capacity).
- **Out of app scope:** the same update's Coalescence Relic group (Faction
  Bonus relics). Relics are not sellfile gear, so this app ignores them.

## The value model (display units vs wire units)

Everything the user sees and everything we persist is in **display units**
(percent: `1.25`). HSF stores **wire units** (hundredths: `125`). The conversion
happens in exactly one place per side, and four named helpers in
`src/lib/hsfBuilder/targets.ts` own the whole model:

| Helper | Answers |
| --- | --- |
| `hsfValueScaleForVariant` (`anomalousAccessories.ts`) | display → wire multiplier: 1 classic, 100 anomalous. The SSOT both sides read. |
| `targetValueResolutionForVariant` | the finest expressible value (`1/scale`): 1 classic, 0.01 anomalous. Anything finer cannot survive export. |
| `minTargetValueForVariant` | the smallest **supported** target: 1 classic, `ANOMALOUS_MIN_TARGET_VALUE` (0.25) anomalous. **Zero is not a target** — "no threshold" is expressed by not selecting the substat at all — so everything below the floor (including 0, negatives, non-finite) clamps up to it. Spec-defined, generated into both languages. |
| `targetValueStepForVariant` | the **spinner** step, which is the same quantity: stepping by the minimum keeps every arrow press on a legal value. Typing keeps full resolution. |
| `minGearLineValueForVariant` | the smallest value a **present gear line** can hold (1.25 anomalous). Distinct from the target minimum: a 0.25 *threshold* is meaningful, but no real piece carries a 0.25 *line*. |
| `quantizeTargetValueForVariant` | the single ingress gate (UI input, SFC load, DSL): snap to the resolution, then clamp to the minimum. |
| `engineAppliedTargetValue` | the threshold the engine actually applies — floor **in wire units**. Classic stats floor to whole numbers (a stored 2.5 applies as ≥ 2); an anomalous 1.25 is exact. |

Scaling is not exact in binary floating point (`0.29 * 100` is
`28.999999999999996`), so both sides round away representation noise at `1e6`
before truncating — `WIRE_NOISE_PRECISION` in `targets.ts`, mirrored in
`hsf_builder_core.rs`. Without it a value could floor a whole wire unit down.

On the Rust side the display→wire conversion is `to_hsf_wire_value`
(`hsf_builder_core.rs`), applied at the single `f64 → i32` boundary in
`prepare_hsf_builder_recipe` (`hsf_builder_execution.rs`) and in
`build_hsf_combo_vectors_core`. Everything downstream — `base_vals`,
`target_bases`, `target_increments`, and `emit_hsf_target_value`'s factory
arithmetic — therefore works in wire units, and the emitted `Value` is already
correct with no f64 plumbing anywhere.

### The return trip: wire → display at match time

Export is only half the boundary. The **matcher** compares an emitted rule's
threshold against an item's `subValues`, and those two arrive in *different*
units: rules carry wire units (the `125` above), while `subValues` come out of
the importer in display units (`1.25`, see `gearDbNormalizer.ts`'s
`PERCENT_WHEN_FLAT_FLAG_ZERO` conversion). Comparing them raw makes every
anomalous rule unsatisfiable — `1.25 >= 125` is false for any real gear.

`wire_value_to_display` (generated into `generated_domain_constants.rs`, the
inverse of `hsf_value_scale_for_variant` and the mirror of `hsfValueToDisplay`
in `anomalousAccessories.ts`) closes it. It is applied **once per rule at
configure time**, where `PreparedRuleSub` is built in `matcher_evaluator.rs` —
not in the hot compare — so `match_rule_substats` keeps comparing two plain
`f64`s with no per-item scale lookup. Classic stats scale by 1, so the
conversion is a no-op for them; that is exactly why the gap stayed invisible
until these stats existed.

Note this is the *matcher's* inverse, not a change to the wire format:
`docs/orig/anomalous.hsf` confirms RSL Helper reads `Value: 25` as 0.25%, and
the exported file is unchanged.

Regression coverage is split deliberately:
`tests/unit/anomalous-rule-emission.test.ts` pins what the builder *emits*, and
`tests/unit/anomalous-rule-matching.test.ts` pins that the matcher then *accepts*
a real item carrying that line. Either spec alone passes with the bug present —
the assertion has to cross the unit boundary, so the matching spec runs the full
build → normalize → evaluate path.

The variant is a **REQUIRED** argument through `clampTargetOverrideValue` /
`normalizeRollTargetEntry` / `normalizeLooseRollTargetEntry` /
`targetEntriesEqual` / `resolveRollTargetValue` / `engineAppliedTargetValue`, so
no ingress can bypass quantization — enforced by the signature, not by
convention. Each has exactly one definition; `substatMenuHelpers` re-exports
rather than re-implements, and `recipeMultiEditDraft`'s private integer-rounding
copies are gone (they persisted an anomalous 2.5 as 3 — *above* what the user
typed). **Both** target tables quantize at every write: roll targets
(`sfcIO.parseReadableTargetEntry`, the multi-edit apply path, the DSL apply
path) and the Minima table (`sfcIO.normalizeSubstatTargets`, the DSL's
`clampMinimaValue`, the tab's own clamp).

Every surface that ADVERTISES or COMPARES a threshold (flyout placeholders +
hint, min/max roll chips via the shared `resolveRollTargetValue`, the "target
decreases" warning, recipe-chip summaries) shows the engine-applied value; only
editable inputs show the stored one.

**Missing Minima keys fall back to the factory minimum, not to 0.** An SFC stores
only the targets that DEVIATE from the app's factory defaults (see below), and a
document saved before a stat existed has no key for it at all — a 0 base would
emit a vacuous `>= 0` matching any gear carrying the line. `baseMinForStarV`
(`hsfBuilder.ts`) is the ONE resolver for what a missing entry means and answers
the factory minimum; `prepare_hsf_builder_recipe` mirrors it via `or_else` on
`factory_base_by_variant_for_star`, then clamps to `min_target_value_for_variant`
so no table built by any other route can ship a vacuous threshold either.

That resolver replaced four independent answers — `baseMinForStarV`, the gear
inspector's own `baseStepForRank`, the Substat Targets tab, and an open-coded
ternary in the gear-inspector editor — three of which said 0, so an older
document displayed 0 in the grid while the builder emitted a real threshold.

### SFC stores deviations only

`substatTargetsToReadable` omits any value equal to the app's factory default for
that stat and rank (`isFactoryDefaultTargetValue`), and `normalizeSubstatTargets`
re-seeds from the current defaults on load. A document therefore tracks the app's
defaults as they improve rather than freezing whichever numbers were current when
it was saved — which is what makes the judged anomalous values below correctable
in place. The in-memory table stays DENSE, so every reader, equality check and
history "is default" badge is unaffected by the sparser file.

Two consequences, both accepted deliberately: an older app build reading a new
file resolves missing keys to 0 (its own readers predate the fallback above), and
"equals the default" stands in for "the user never touched it", so a target typed
to exactly the default is re-interpreted if that default later changes — the same
mechanism that delivers the correction.

Pinned by `tests/unit/substat-targets-sparse-sfc.test.ts` (round-trip losslessness,
deviations, 0-correction, forward adoption) and
`tests/unit/anomalous-rule-emission.test.ts`, which asserts the whole emission path
end-to-end: eight substats × five level milestones, each rule carrying its own id
at `>= 125`. Its counterpart `tests/unit/anomalous-rule-matching.test.ts` then
asserts an item carrying such a line actually MATCHES that rule (see "The return
trip" above) — emission and matching sit on opposite sides of the unit boundary,
so neither spec alone can catch a scale error.

## SSOT map

| Piece | Location |
| --- | --- |
| Spec block (ids, labels, wire scale, set/slot scope) | `shared/domain-constants.json` → `anomalousAccessories` |
| Generated TS constants (`ANOMALOUS_*`) + Rust label/tuple tables, `hsf_value_scale_for_variant` and its inverse `wire_value_to_display` | `scripts/tooling/generate-domain-constants.mjs` → `src/lib/generated/domainConstants.ts`, `wasm/rule_engine_core/src/generated_domain_constants.rs` |
| Typed domain helpers (incl. the `+`/`−` UI row split and the wire scale) | `src/lib/anomalousAccessories.ts` |
| Variant/label/i18n-key resolution | `src/lib/types.ts` (`subToVariant`, `labelOfVariant`, `variantFromLabel`, `statVariantI18nKey`), i18n keys `statPveDmgPlus` … `statDungeonDmgMinus` in every `src/lib/i18n/catalogs/*.ts` |
| Feasibility gate (accessory slots only) | `src/lib/statCompatibility.ts` → `resolveAllowedSubstatsForSlotsAndMains` appends the variants when the slot scope can reach a **viable** jewelry slot; mirrored in Rust `recipe_builder.rs::resolve_allowed_substats_for_slots_and_mains` |
| Builder UIs | `RecipeBuilderPanel.tsx` + `SafeguardBuilderPanel.tsx` always render two extra rows (`⚔` damage dealt, `🛡` damage taken) — like every other stat row, individual chips grey out via the shared `allowedSubstatOptions` disabled state when the slot scope has no jewelry slot; safeguard multi-edit selection scan includes them |
| Substats split into two collapsible sub-groups | The substats header carries **two chevrons + two labels on one row**: the primary (`substats` / filter `sub`) owns the classic rows, the secondary (`substatsAnomalous` / filter `subAnomalous`) owns the anomalous ones. Anomalous renders **below** classic everywhere and starts **collapsed** (`DEFAULT_COLLAPSED_BUILDER_SECTION_IDS`; the filter panel already defaults every section collapsed). While collapsed *and* holding a selection, its **label** takes the shared `COLLAPSED_CONTENT_INDICATOR_SX` highlight (`constants.ts`) — label-only, exactly like every other section; the chevron itself is never tinted, preserving the prior decision that collapsed chevrons carry no marker. That token also replaced the 18 inline `{ color: 'primary.main' }` copies the builder sections each carried, so the highlight now has one definition. Wired through the `secondaryId`/`secondaryLabel`/`secondaryIndicate` props on **both** `BuilderSectionHeader` (`BuilderSectionToggle.tsx`) and the forked `FilterSectionHeader` (`RulesFilterPanel.tsx`) — these two stay parallel by hand, so change both. Dirty predicates split by family via `isAnomalousSubstatVariant`; the filter's mode/glyph/rolls chips belong to the classic half |
| Filter / sort / targets / colors | `RulesFilterPanel.tsx` substat include/exclude rows + the Rolls flyout per-stat options, `PreviewHeaderActions.tsx` sort keys, `SubstatTargetsTabContent.tsx` target rows, `ManageColorsDialog.tsx`, `statColorContext.tsx`, `useSubstatColors.ts` defaults (judged per-mode hues), `substatDisplay.ts` colorization gate, `gearInspectorSubstatSortPreferences.ts` allowlists |
| Rolls flyout height | The flyout lists all 19 substats (11 classic + 8 anomalous). `ContextMenuPaper` forces `overflow: visible !important` so its close button can protrude, which means the *paper* cannot scroll — MUI then clamps it to the gap between anchor and viewport bottom, cutting off the trailing anomalous rows. Fixed by scrolling the inner per-stat `Stack` instead (`ROLLS_FLYOUT_MAX_HEIGHT_PX` in `constants.ts` + `overflowY: 'auto'`), which keeps the title and wildcard row pinned |
| Gear analytics | `gearAnalytics.ts` exports TWO variant lists on purpose: `HEATMAP_VARIANTS` (MAIN stats — the slot × main heatmap, which anomalous can never appear in) and `ANALYTICS_SUBSTAT_VARIANTS` (substats, anomalous included). `countSubstatFrequency` always tallied them off the rows; reusing the main-stat list as the radar's axes was what hid them. Champion Stats never filtered them — `computeChampSubstatTotalStats` aggregates whatever variant the gear carries — but ordered them all at `Infinity` (arbitrary encounter order) until it read the same list, and its `fmtVal` rounded to one decimal, rendering a 1.25 total as "1.3" |
| Display naming | Every user-facing surface shows the localized glyph token via `statVariantI18nKey` (`StatLabel` is the shared node renderer). `labelOfVariant` is the CANONICAL spelling — the SFC anchor and DSL fallback — never display text; `aria-label`s use the same token as the visible text, which is what classic stats already did |
| Gear DB ingest | `gearDbNormalizer.ts` — ids 11–18 decode as percent lines; the taken family's negative storage folds to magnitude (direction lives in the stat identity). Pinned by `tests/unit/gearDbNormalizer-anomalous.test.ts` using the real example-DB rows |
| Custom gear editor | jewelry slots offer the substats via anomalous-aware `slotSupportsSub` (`types.ts`); line values snap to the wire resolution and floor at `minGearLineValueForVariant`; the session's random auto-fill pool stays classic on purpose |
| Gear inspector icon marker | `hasAnomalousSubstat` (`anomalousAccessories.ts`) is the ITEM-level SSOT — "does this piece CARRY a mode-damage substat", deliberately distinct from the `isAnomalousEligible*` pair ("could it ever roll one"). `GridIconBox`'s `anomalous` prop draws the frame **dashed** plus an inset companion ring (`box-shadow`, so the frame size, badge offsets and `calc(100% + border)` art wrapper are untouched). The marker rides the stroke STYLE, never the COLOUR — the border colour already encodes rarity and both must stay independently readable. Ring colour alphas the rarity accent (a real hex); with no rarity it falls back to `TINT.neutralBorderStrong`, since `theme.palette.divider` is already `rgba()` and must not be re-alpha'd. Both call sites — `GearInspectorGridCard` (`NormalizedStat[]`) and `GearInspectorTabContent` (`[variant, value]` pairs from `entriesInOrder`) — feed the one predicate rather than forking the condition |
| Gear line values | `clampGearLineValue` (`gearInspectorSession.ts`) is the one rule — resolution snap + minimum-roll floor — shared by the custom-gear editor's input clamp and the session's `adjustSubValuesFor` re-normalization, which previously disagreed on both |
| SFC round-trip (labels, both languages) | TS `sfcIO.ts` via `labelOfVariant`/`variantFromLabel`; Rust `sfc_reader.rs` via the generated `ANOMALOUS_SUBSTAT_LABELS`; pinned by `shared/sfc-label-test-vectors.json` |
| Honest rule semantics | `hsfTypes.ts::variantToSub` + Rust `safeguard_variant_to_sub` emit the real id tuple (never "Any"), so internal/preview rules with a required anomalous substat match exactly the gear that carries it — and now export as that same rule |
| Stat-id DECODING (both directions must know these ids) | `subToVariant` (`types.ts`) and Rust `sub_to_variant` (`lib.rs`) decode an HSF `(ID, IsFlat)` tuple back to a variant. Both branch on the CLASSIC id ranges first, so each needs an explicit anomalous branch — Rust reaches it through the generated `anomalous_variant_for_stat_id`. Rust's was missing, so every anomalous id decoded to the `Any` fallback and *all eight looked like the same stat* to anything keyed on the decoded variant. The visible symptom was the obsolete detector pruning every anomalous rule after the first as "covered by looser/equal thresholds": a recipe with N mode-damage substats emitted one rule per level instead of N. `main_to_variant` deliberately keeps the Any fallback — these can never be main stats |
| HSF export | No special-casing left. `hsfIO.ts::buildHsfFileFromMerged` passes anomalous rules through like any other; the value scale is applied by the emitter (see above). The old export scrub, its disclosure toast (`toastAnomalousRulesNotExported`), and the `scrubbedAnomalousRules` plumbing through `buildExportPayload` / `backgroundAccountPush` are all deleted |
| Rule MATCHING (wire → display) | `matcher_evaluator.rs` converts each rule substat threshold back to display units via the generated `wire_value_to_display` when `PreparedRuleSub` is built at configure time, because item `subValues` are display units. Without it every anomalous rule is unsatisfiable (`1.25 >= 125`) — the recipe silently matches nothing, which no emission-only test can see. See "The return trip" above |
| Guard tests | `tests/unit/anomalous-hsf-sample.test.ts` (the sample file itself), `tests/unit/anomalous-accessories.test.ts`, `tests/unit/anomalous-target-quantization.test.ts`, `tests/unit/anomalous-rule-emission.test.ts`, `tests/unit/anomalous-rule-matching.test.ts`, `tests/unit/substat-targets-sparse-sfc.test.ts`, `tests/unit/gearDbNormalizer-anomalous.test.ts` |
| SFC→HSF fixtures | `tests/fixtures/anomalous-two-mode-damage-substats-any-rolls.{sfc,hsf}` (two substats must emit two rules per milestone, not one) and `anomalous-decimal-minima-targets.{sfc,hsf}` (a 2.5 target emits 250, the 0.25 minimum emits 25). These run the FULL pipeline — `parseSfcObject → computeMergedRules → export` — which is where the decode bug above actually bit; unit tests calling `buildHsfRules` directly were blind to it because the damage happened in the post-build pruning step |

SFC documents persist substats as **label strings**, so the numeric id scheme
never leaks into saved files — the placeholder→real id swap needed no SFC
migration, and future churn wouldn't either.

**Deliberately NOT wired** (revisit as the roll model firms up): the shared
`allowedSubsBySlot` / `STAT_VARIANTS_PRIORITY` tables (they feed the Rust
engine's substat-gap anticipation — anticipation must not invent anomalous lines
while the roll/addition model is unknown; a selected anomalous substat is
conservatively treated as never-appearing-later), roll ranges beyond the rank-5
base / glyph data, safeguard score normalization (anomalous values normalize to
0 and stay inert in ranking), set-eligibility as a combination constraint (all
observed pieces carry one of the 9 sets, but setless anomalous accessories are
unconfirmed — no false "impossible" verdicts).

## The DSL spelling

**Anomalous stats spell as their internal key in DSL text**
(`rolltarget.pveDmgPlus=1.25`), never as their display label: `+` and spaces are
token separators, so "PvE DMG +" cannot occupy a field position. Both the
spelling and the vocabulary have one definition in `types.ts` —
`statVariantToKey` plus `dslSubstatKeys()` / `dslMainStatKeys()` — consumed by
every DSL-text surface: the two serializers (`overridesSerializer`,
`noteSafeguardOverrides`' option-info reconstruction), the structured editor's
selects, pickers and `selectorLeafToView`, and the EBNF `statKey` row.

The two stat vocabularies are deliberately separate: anomalous substats appear
in substat positions only, never in `mainstats=`. That split is enforced on both
sides — `dslMainStatKeys()` for what the editor offers, and
`mainStatKeyToVariant` (`types.ts`, gating on `isEverMainStatVariant` /
`ALLOWED_MAIN_BY_SLOT`) for what the parser accepts, so hand-written
`mainstats=pveDmgPlus` resolves to nothing instead of building an op for a stat
no gear can carry. `variantFromLabel` still accepts every alias (label,
space-free, `DMG`-less, key), so hand-written text keeps parsing whichever form
it uses.

Stat TARGET values parse as decimals (`parseTargetValue` — counts like
`minrolls` still truncate), the apply paths quantize per variant, and the EBNF
reference lists the anomalous keys plus a `targetNum` terminal marking where
decimals are legal.

Option-info tooltip text (`formatRecipeOverridesOpValue` /
`formatSafeguardOverridesOpValue`) answers one shared contract, stated once in
`noteOverridesParser.ts`: readable DSL, where *values* may use display sugar
(`≥3`, `5★`, `+[600,900]`) but *identifiers* use the DSL vocabulary verbatim —
because those are the fragments a user lifts back into a marker. Byte-exact
reconstruction is a different job with a different owner (`overridesSerializer`).

## Judged values (the `JUDGED(anomalous …)` ledger)

| Judged value | Current choice | Why / replacement source |
| --- | --- | --- |
| Per-rank base values (`JUDGED(anomalous per-rank values)`) | 1.25 floors **every** rank, not just rank 5 | Rank 5 is the only observed base. A missing entry reads as "no target at all" — a weaker default than the one number we know. Replace with a per-rank table from richer DB dumps. Sites: `ANOMALOUS_FACTORY_MINIMA` (`hsfBuilder.ts`), `factory_minima_for_star` (`recipe_builder.rs`). |
| Per-roll step (`JUDGED(anomalous per-roll step)`) | Each further line assumed to add another 1.25 | Base observed at zero rolls; the increment is unconfirmed. Only used to size a display column (`substatDisplay.ts`), so an error costs alignment, not correctness. |
| Glyphability (`JUDGED(anomalous glyphability)`) | `statSupportsGlyphs` answers **no** | Unobserved in-game; conservative so no glyph affordance is offered for something that may not exist. Flip from observation. |
| Spinner step | 0.25 | The granularity RSL Helper displays in the sample. Typing keeps the full 0.01 resolution, so this only affects arrow keys. |
| Substat internal keys | `pveDmgPlus` … `dungeonDmgMinus` | Our naming; stable app-internal tokens (and the SFC label anchor). |
| Display labels | Two layers: canonical spec labels keep the announcement wording verbatim (`"PvE DMG +"`, …) and are what SFC files serialize; the i18n catalogs display compact glyph tokens (`"PvE ⚔"` damage dealt, `"PvE 🛡"` damage taken), identical in every locale, so the chips size like classic ones (`SPD`, `CDMG%`). Every surface showing the glyph tokens carries a `MarkdownTooltip` composed by `anomalousSubstatTooltipMarkdown` (`substatDisplay.ts`): per-variant description + shared context note, translated in all 10 catalogs (`stat*Tooltip` keys + `statAnomalousTooltipNote`) | Final in-game strings (and their localizations) may differ; replace from game UI once live. SFC files anchor on the canonical labels, so changing those later needs a read-side alias (`anomalousVariantFromLabel` already accepts space-free and `DMG`-less aliases). |
| Default chip colors | One hue per mode (PvE teal, PvP red, Boss violet, DNG **blue-grey**); the pair is separated by LIGHTNESS with `🛡` the lighter member. Both members clear 4.5:1 against BOTH shipped papers (`#1E1E1E` dark, `#2C2C2C` RSLH) — measured, and pinned by `tests/unit/anomalous-default-colors.test.ts` | Hue choice is judgment; the contrast floor is not. Two revisions failed it in opposite directions: the first darkened `🛡` (Boss/DNG 🛡 illegible), the second fixed `🛡` but left `⚔` at mid-tones where Boss ⚔ sat at **2.68:1**, under the text threshold before any tint. DNG left umber because RSLH tints SELECTED surfaces warm tan (`#cc9064`) — a brownish stat on a tan row is a hue collision no adapter can fix, since adapters change lightness, not hue. Light-scheme and selected-row legibility come from `adaptSubstatFgOnSurface`, which targets `WCAG_MIN_CONTRAST` (3.0, the app's documented bar for chip-sized text — not 4.5); the test asserts that constant rather than restating a bar. |

## Open unknowns

- Rank-6 (and 1–4) base values, per-roll increments, and roll milestones — the
  one remaining data gap that matters.
- Glyphability and rarity distribution.
- Whether "anomalous" is a piece-level flag anywhere in the DB or purely
  inferred from the substat lines; whether setless anomalous accessories exist.
- WebSocket `gearDbRaw*` payload parity for these rows (same normalizer runs,
  so expected to Just Work — unverified against a live push).

## Replacement checklist (as the rest firms up)

1. Grep `JUDGED(anomalous` — every hit is an assumption to revisit.
2. Confirm non-rank-5 base values and the per-roll increment from richer DB
   dumps; update `shared/domain-constants.json` (`star5RollValue` grows into a
   per-rank table) plus the two mirrored factory-minima tables and their tests.
3. Once the roll model is known, extend the shared roll-range tables + Rust
   scoring normalization so safeguard ranking values anomalous lines, and
   revisit the deliberately-unwired list above (gap anticipation).
4. Localize the i18n catalog values (`statPveDmgPlus` …) once official
   translations exist; update the SFC label tables/read-side aliases if the
   final display strings differ from the announcement wording.
5. Update this document and [Artifact Rules](artifact-rules.md).
