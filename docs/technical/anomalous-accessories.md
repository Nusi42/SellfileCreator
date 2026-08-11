# Anomalous Accessories — Provisional Preparation

**Status: PROVISIONAL(anomalous), now grounded in real DB data.** RSL Helper
dumps Anomalous Accessories into its gear database, and the substat ids have
been reverse-engineered from `examples/um109288203_RSLHelper.db` (artifacts
264537–264539, verified against in-game screenshots). What is still missing is
a **sample sellfile** demonstrating how RSL Helper *rules* encode these stats —
so exports keep scrubbing them — plus the roll model beyond rank 5. Every
judged value in code, spec, and docs carries the greppable marker
`PROVISIONAL(anomalous)` — search for that token to find every site that must
be revisited.

## Observed DB facts (the id/value model)

| Fact | Basis |
| --- | --- |
| Stat ids: `11` PvE DMG, `12` PvP DMG, `13` Boss DMG — damage **dealt** ("+") with positive values | Observed (artifacts 264537–264539) |
| Stat id `16` = PvP DMG **taken** ("−"), stored as a **negative** percent (−1.25% renders "PvP DMG-") | Observed |
| Dealt family `11..14`, taken family `15..18`, mode order PvE/PvP/Boss/DNG (so `14` DNG+, `15` PvE−, `17` Boss−, `18` DNG−) | **Inferred** from contiguity + the observed `16` |
| All lines `fl = 0` (percent), values scale by 2³² with ×100 display conversion (±53687091 → 1.25%) | Observed |
| Rank-5 base per line = **1.25%** at zero rolls; one roll believed to add another 1.25 | Observed base; per-roll step judged |
| A rank-5 **Banner** with a set (Supersonic) exists — Banner eligibility confirmed | Observed |
| Rank-6 values, glyphability, mixing rules, roll milestones | Unknown |

## What the announcement establishes (known facts)

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

## What is implemented today (SSOT map)

| Piece | Location |
| --- | --- |
| Spec block (ids, labels, set/slot scope) | `shared/domain-constants.json` → `anomalousAccessories` |
| Generated TS constants (`ANOMALOUS_*`) + Rust label/tuple tables | `scripts/tooling/generate-domain-constants.mjs` → `src/lib/generated/domainConstants.ts`, `wasm/rule_engine_core/src/generated_domain_constants.rs` |
| Typed domain helpers (incl. the `+`/`−` UI row split) | `src/lib/anomalousAccessories.ts` |
| Variant/label/i18n-key resolution | `src/lib/types.ts` (`subToVariant`, `labelOfVariant`, `variantFromLabel`, `statVariantI18nKey`), i18n keys `statPveDmgPlus` … `statDungeonDmgMinus` in every `src/lib/i18n/catalogs/*.ts` |
| Feasibility gate (accessory slots only) | `src/lib/statCompatibility.ts` → `resolveAllowedSubstatsForSlotsAndMains` appends the variants when the slot scope can reach a jewelry slot; mirrored in Rust `recipe_builder.rs::resolve_allowed_substats_for_slots_and_mains` (the native-DLL rule-build path) |
| Builder UIs | `RecipeBuilderPanel.tsx` + `SafeguardBuilderPanel.tsx` always render two extra rows (`⚔` damage dealt, `🛡` damage taken) — like every other stat row, individual chips grey out via the shared `allowedSubstatOptions` disabled state when the slot scope has no jewelry slot; safeguard multi-edit selection scan includes them |
| Filter / sort / targets / colors | `RulesFilterPanel.tsx` substat include/exclude rows + the Rolls flyout per-stat options, `PreviewHeaderActions.tsx` sort keys, `SubstatTargetsTabContent.tsx` target rows (rank-5 factory default 1.25; other tiers empty), `ManageColorsDialog.tsx`, `statColorContext.tsx`, `useSubstatColors.ts` defaults (judged per-mode hues), `substatDisplay.ts` colorization gate, `gearInspectorSubstatSortPreferences.ts` allowlists |
| Gear DB ingest | `gearDbNormalizer.ts` — ids 11–18 decode as percent lines; the taken family's negative storage folds to magnitude (direction lives in the stat identity). Pinned by `tests/unit/gearDbNormalizer-anomalous.test.ts` using the real example-DB rows |
| Custom gear editor | jewelry slots offer the substats via anomalous-aware `slotSupportsSub` (`types.ts`); anomalous values keep 2-decimal precision; the session's random auto-fill pool stays classic on purpose |
| Decimal targets | Substat Targets tab + recipe flyout accept and PERSIST 2-decimal values **for anomalous variants only** — the whole clamp chain is variant-gated (`clampTargetValue`, the tab's `clampValue`, `clampTargetOverrideValue` keeps the 2-decimal grid, and Rust `normalize_target_override_value` mirrors it); classic stats stay integral. The anomalous spinner steps the 1.25 grid. Engine-side, minima travel as f64 and FLOOR at the i32 boundary — matching-equivalent on the 1.25 grid — and `resolveRollTargetValue` mirrors that floor so flyout placeholders advertise the thresholds the engine actually applies |
| SFC round-trip (labels, both languages) | TS `sfcIO.ts` via `labelOfVariant`/`variantFromLabel`; Rust `sfc_reader.rs` via the generated `ANOMALOUS_SUBSTAT_LABELS`; pinned by `shared/sfc-label-test-vectors.json` |
| Honest rule semantics | `hsfTypes.ts::variantToSub` + Rust `safeguard_variant_to_sub` emit the real id tuple (never "Any"), so internal/preview rules with a required anomalous substat match exactly the gear that carries it |
| Export scrub | `hsfIO.ts::buildHsfFileFromMerged` — drops rules requiring anomalous substats / vacuous `¬` lines before any `.hsf` bytes are built (download, push, and dirty-fingerprint all share this choke point). **Known divergence:** such rules can match real gear in the preview yet export as nothing — disclosed via a warning toast on every export/push (`toastAnomalousRulesNotExported`, fired through the `onAnomalousRulesScrubbed` callback; shown for silent auto-pushes too) plus the console line; unavoidable until a sample sellfile shows the rule encoding |
| Guard tests | `tests/unit/anomalous-accessories.test.ts`, `tests/unit/anomalous-export-scrub.test.ts`, `tests/unit/gearDbNormalizer-anomalous.test.ts` |

SFC documents persist substats as **label strings**, so the numeric id scheme
never leaks into saved files — the placeholder→real id swap needed no SFC
migration, and future churn wouldn't either.

**Deliberately NOT wired** (revisit as data firms up): the shared
`allowedSubsBySlot` / `STAT_VARIANTS_PRIORITY` tables (they feed the Rust
engine's substat-gap anticipation — anticipation must not invent anomalous
lines while the roll/addition model is unknown; a selected anomalous substat is
conservatively treated as never-appearing-later), roll ranges beyond the rank-5
base / glyph data, safeguard score normalization (anomalous values normalize to
0 and stay inert in ranking until the roll model is confirmed), set-eligibility
as a combination constraint (all observed pieces carry one of the 9 sets, but
setless anomalous accessories are unconfirmed — no false "impossible"
verdicts), and the note-overrides DSL: its stat-key grammar has no anomalous
tokens and its `clampMinimaValue` (`noteRecipeOverrides.ts`) still clamps
minima to integers, so DSL overrides cannot express fractional targets yet.

## Judged values (the PROVISIONAL(anomalous) ledger)

| Judged value | Current choice | Why / replacement source |
| --- | --- | --- |
| Inferred stat ids `14`, `15`, `17`, `18` | DNG+, PvE−, Boss−, DNG− by mode-order contiguity | Only `11/12/13/16` are directly observed. Confirm from a DB dump containing the other four kinds; the generator + `tests/unit/anomalous-accessories.test.ts` pin the table. |
| Per-roll step | Equal to the rank-5 base (1.25) | Base observed at zero rolls; the roll increment is the user's judgment. Rank 6 (and 1–4) values entirely unknown. |
| Variant shape | Percent-shaped (`flat` suffix 0) | Matches the DB `fl = 0` lines. |
| Substat internal keys | `pveDmgPlus` … `dungeonDmgMinus` | Our naming; stable app-internal tokens (and the SFC label anchor). |
| Display labels | Two layers: canonical spec labels keep the announcement wording verbatim (`"PvE DMG +"`, …) and are what SFC files serialize; the i18n catalogs display compact glyph tokens (`"PvE ⚔"` damage dealt, `"PvE 🛡"` damage taken), identical in every locale, so the chips size like classic ones (`SPD`, `CDMG%`). Every surface showing the glyph tokens carries a `MarkdownTooltip` composed by `anomalousSubstatTooltipMarkdown` (`substatDisplay.ts`): per-variant description + shared context note, translated in all 10 catalogs (`stat*Tooltip` keys + `statAnomalousTooltipNote`) | Final in-game strings (and their localizations) may differ; replace from game UI once live. SFC files anchor on the canonical labels, so changing those later needs a read-side alias (`anomalousVariantFromLabel` already accepts space-free and `DMG`-less aliases). |
| Default chip colors | One hue per mode (PvE teal, PvP red, Boss violet, DNG umber), `⚔` brighter than `🛡` | Pure judgment; user-editable in Manage Colors. |
| Glyphability | `statSupportsGlyphs` answers **no** for anomalous variants | Unknown in-game; conservative so no glyph affordance is offered. Flip from observation. |

**Hard rule until a sample sellfile exists:** anomalous ids must never reach
exported `.hsf` bytes. App state, SFC documents, and DB ingest carry them; the
export scrub in `hsfIO.ts` plus `isAnomalousStatId()` enforce the boundary.

## Open unknowns

- How RSL Helper **rules** encode these stats in `.hsf` sellfiles — the sole
  blocker for exporting them; per the project safety rule, serialization is
  only extended against sample files under `docs/orig/`, never guessed.
- The remaining four stat ids (`14/15/17/18`) — inferred, not observed.
- Rank-6 (and 1–4) values, per-roll increments, roll milestones, glyphability,
  and rarity distribution.
- Whether "anomalous" is a piece-level flag anywhere in the DB or purely
  inferred from the substat lines; whether setless anomalous accessories exist.
- WebSocket `gearDbRaw*` payload parity for these rows (same normalizer runs,
  so expected to Just Work — unverified against a live push).

## Replacement checklist (as the rest firms up)

1. Grep `PROVISIONAL(anomalous)` — every hit is a site to revisit.
2. Confirm ids `14/15/17/18` and non-rank-5 values from richer DB dumps; update
   `shared/domain-constants.json` (the id table + `star5RollValue` siblings)
   and the pinned tests.
3. Once the roll model is known, extend the shared roll-range tables + Rust
   scoring normalization so safeguard ranking values anomalous lines, and
   teach the branch runtime f64 emission so preview values stop flooring.
4. Extend HSF serialization only against sample files in `docs/orig/`, then
   retire the export scrub in `hsfIO.ts` (and its test) once RSL Helper
   understands the real ids. Update the SFC label tables/read-side aliases if
   the final display strings differ from the announcement wording.
5. Localize the i18n catalog values (`statPveDmgPlus` …) once official
   translations exist; revisit the deliberately-unwired list above (roll
   targets, overrides DSL, gear-inspector substat editor, gap anticipation).
6. Update this document and [Artifact Rules](artifact-rules.md); delete the
   provisional wording once the data is confirmed.
