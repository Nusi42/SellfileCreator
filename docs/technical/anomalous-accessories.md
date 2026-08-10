# Anomalous Accessories (Update 11.70) — Provisional Preparation

**Status: PROVISIONAL(anomalous).** The game update that introduces Anomalous
Accessories (Champion Proving Grounds) is announced but we have neither RSL
Helper data nor sample sellfiles for it. Everything in this layer is a judged
placeholder designed to be replaced wholesale once real data exists. Every
judged value in code, spec, and docs carries the greppable marker
`PROVISIONAL(anomalous)` — search for that token to find every site that must be
revisited.

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
| Feasibility gate (accessory slots only) | `src/lib/statCompatibility.ts` → `resolveAllowedSubstatsForSlotsAndMains` appends the variants when the slot scope can reach a jewelry slot |
| Builder UIs | `RecipeBuilderPanel.tsx` + `SafeguardBuilderPanel.tsx` render two extra accessory-gated rows (`+` damage dealt, `−` damage taken) |
| Filter / sort / targets / colors | `RulesFilterPanel.tsx` substat include/exclude rows + the Rolls flyout per-stat options, `PreviewHeaderActions.tsx` sort keys, `SubstatTargetsTabContent.tsx` target rows (empty defaults — no known roll values), `ManageColorsDialog.tsx`, `statColorContext.tsx`, `useSubstatColors.ts` defaults (judged per-mode hues), `substatDisplay.ts` colorization gate, `gearInspectorSubstatSortPreferences.ts` allowlists |
| SFC round-trip (labels, both languages) | TS `sfcIO.ts` via `labelOfVariant`/`variantFromLabel`; Rust `sfc_reader.rs` via the generated `ANOMALOUS_SUBSTAT_LABELS`; pinned by `shared/sfc-label-test-vectors.json` |
| Honest rule semantics | `hsfTypes.ts::variantToSub` + Rust `safeguard_variant_to_sub` emit the placeholder id tuple (never "Any"), so internal/preview rules with a required anomalous substat match nothing — the truth, since no current gear carries these ids |
| Export scrub | `hsfIO.ts::buildHsfFileFromMerged` — drops unsatisfiable rules / vacuous `¬` lines before any `.hsf` bytes are built (download, push, and dirty-fingerprint all share this choke point) |
| Guard tests | `tests/unit/anomalous-accessories.test.ts`, `tests/unit/anomalous-export-scrub.test.ts` |

SFC documents persist substats as **label strings**, so the placeholder numeric
scheme never leaks into saved files — a later id swap only touches the shared
spec and the label tables, not the SFC format.

**Deliberately NOT wired** (revisit when real data lands): the shared
`allowedSubsBySlot` / `STAT_VARIANTS_PRIORITY` tables (they feed the Rust
engine's substat-gap anticipation — enumerating 8 impossible-in-data variants
would inflate placeholder combinatorics), roll ranges / glyph data (values
unknown — the Substat Targets tab shows the rows with empty defaults for
user-entered guesses, but there are no factory values and no roll-range math),
safeguard score normalization (unknown variants normalize to 0
and stay inert by design), and the note-overrides DSL stat-key grammar (a
user-facing documented format — no provisional tokens in it yet). The gear
inspector's custom-gear editor DOES offer them on jewelry slots
(`slotSupportsSub` in `types.ts` is anomalous-aware), so hand-crafted preview
accessories can carry the substats and match rules that require them; the
session's random substat auto-fill pool stays classic on purpose.

## Judged placeholders (the PROVISIONAL(anomalous) ledger)

| Judged value | Current choice | Why / replacement source |
| --- | --- | --- |
| Substat numeric ids | `200`–`207` (`ANOMALOUS_PROVISIONAL_ID_FLOOR` = 200) | Real game/RSL-Helper stat ids are unknown. The range clears every real stat id (≤ 99) while staying byte-sized, so the standard `statVariant` encoding (`(id&255)<<8 \| flat`) carries them through existing encode/decode paths. The generator fail-fasts on violations. Replace with real ids from an RSL Helper dump / sample sellfile. |
| Variant shape | Percent-shaped (`flat` suffix 0) | The boons read as percentages; the wire shape is unknown. |
| Substat internal keys | `pveDmgPlus` … `dungeonDmgMinus` | Our naming; stable app-internal tokens that can survive the id swap (and the SFC label anchor). |
| Display labels | Two layers: canonical spec labels keep the announcement wording verbatim (`"PvE DMG +"`, …) and are what SFC files serialize; the i18n catalogs display compact glyph tokens (`"PvE ⚔"` damage dealt, `"PvE 🛡"` damage taken), identical in every locale, so the chips size like classic ones (`SPD`, `CDMG%`). Every surface showing the glyph tokens carries a `MarkdownTooltip` composed by `anomalousSubstatTooltipMarkdown` (`substatDisplay.ts`): per-variant description + shared context note, translated in all 10 catalogs (`stat*Tooltip` keys + `statAnomalousTooltipNote`) | Final in-game strings (and their localizations) may differ; replace from game UI once live. SFC files anchor on the canonical labels, so changing those later needs a read-side alias (`anomalousVariantFromLabel` already accepts space-free and `DMG`-less aliases). |
| Default chip colors | One hue per mode (PvE teal, PvP red, Boss violet, DNG umber), `+` brighter than `−` | Pure judgment; user-editable in Manage Colors. |
| Slot eligibility | Ring, Amulet, **Banner** | The announcement only says "Accessories"/"Jewelry"; Banner inclusion is a judgment call. Confirm in-game. |

**Hard rule until replacement:** placeholder ids must never reach exported
`.hsf` bytes. App-internal state and SFC documents may carry them (SFC stores
labels anyway); the export scrub in `hsfIO.ts` plus
`isProvisionalAnomalousStatId()` enforce the boundary.

## Open unknowns (blockers for real wiring)

- Real stat ids, and whether the game models these as new stat ids, a new
  variant dimension, or something else entirely (affects the `statVariant`
  encoding decision).
- HSF/SFC representation — per the project safety rule, serialization is only
  extended against sample `.hsf` files under `docs/orig/`, never guessed.
- How RSL Helper will expose the substats (SQLite dump columns, WebSocket
  payloads) and whether "anomalous" is a piece-level flag or inferred from the
  substat lines.
- Value ranges, roll behavior at level milestones, glyphability, and
  rarity/rank distribution of the new substats.
- Whether classic and anomalous substat lines mix on one piece, and whether the
  four-substat-slot model (`SUBSTAT_SLOT_COUNT`) still holds.

## Replacement checklist (when real data arrives)

1. Grep `PROVISIONAL(anomalous)` — every hit is a site to revisit.
2. Replace the placeholder ids in `shared/domain-constants.json` with the real
   ones; keep the internal keys (SFC files anchor on labels, so no SFC
   migration is needed for the id swap itself). Rework or retire the
   floor/range guards in the generator and
   `tests/unit/anomalous-accessories.test.ts` to match the real id domain.
3. Confirm the wire shape (flat suffix, value semantics, roll behavior), then
   extend the shared spec (`statVariantLabels`, `allowedSubsBySlot` or an
   anomalous-specific table, roll ranges, glyph data) and the Rust engine's
   matching/scoring tables; regenerate WASM.
4. Extend HSF serialization only against sample files in `docs/orig/`, then
   retire the export scrub in `hsfIO.ts` (and its test) once RSL Helper
   understands the real ids. Update the SFC label tables/read-side aliases if
   the final display strings differ from the announcement wording.
5. Localize the i18n catalog values (`statPveDmgPlus` …) once official
   translations exist; revisit the deliberately-unwired list above (roll
   targets, overrides DSL, gear-inspector substat editor, gap anticipation).
6. Update this document and [Artifact Rules](artifact-rules.md); delete the
   provisional wording once the data is confirmed.
