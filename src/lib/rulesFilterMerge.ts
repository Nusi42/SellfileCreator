/**
 * rulesFilterMerge.ts
 *
 * Set-algebra over `RulesFilterState` used by the "OR" (combine) apply mode of filter presets.
 * The generic engine lives in `stateMergeAlgebra.ts`; here we only declare the per-field op list
 * (relative to DEFAULT_RULES_FILTER_STATE) plus filter-specific helpers (cross-panel projection).
 */
import {
  DEFAULT_RULES_FILTER_STATE,
  cloneDefaultRulesFilterState,
  type RulesFilterState,
  type GearInspectorSourceFilter,
  type GearInspectorLastUsePreset,
  type Bool3,
} from './rulesFilter'
import type { StatVariant } from './types'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { RULES_FILTER_PREVIEW_MODES, type RulesFilterPreviewMode } from '../state/rulesFilterPersistence'
// Type-only: filterPresetsPreference does not import this module, so there is no cycle.
import type { FilterPreset, FilterPresetView } from '../state/filterPresetsPreference'
import {
  clone,
  unionBy,
  subsetBy,
  differenceBy,
  arrayField as makeArrayField,
  scalarField as makeScalarField,
  flagsField as makeFlagsField,
  runMerge,
  runContains,
  runSubtract,
  runReapplyScalars,
  type FieldOp,
} from './stateMergeAlgebra'

const D = DEFAULT_RULES_FILTER_STATE

// Bind the generic combinators to RulesFilterState so the field list below stays terse.
const arrayField = <E>(
  read: (s: RulesFilterState) => readonly E[] | undefined,
  write: (out: RulesFilterState, value: E[]) => void,
  keyOf?: (x: E) => string | number,
): FieldOp<RulesFilterState> => makeArrayField(read, write, keyOf)
const scalarField = <V>(
  read: (s: RulesFilterState) => V,
  write: (out: RulesFilterState, value: V) => void,
  def: V,
): FieldOp<RulesFilterState> => makeScalarField(read, write, def)
const flagsField = <K extends string>(
  read: (s: RulesFilterState) => Record<K, boolean> | undefined,
  write: (out: RulesFilterState, value: Record<K, boolean>) => void,
  keys: readonly K[],
  def: Record<K, boolean>,
): FieldOp<RulesFilterState> => makeFlagsField(read, write, keys, def)

// --- the single field list ------------------------------------------------

const FIELD_OPS: readonly FieldOp<RulesFilterState>[] = [
  // Rule-level Keep/Use tri-states (scalar override; default 'any').
  scalarField((s) => s.rule?.keep ?? D.rule!.keep, (o, v) => { o.rule = { ...(o.rule ?? clone(D.rule!)), keep: v } }, D.rule!.keep),
  scalarField((s) => s.rule?.use ?? D.rule!.use, (o, v) => { o.rule = { ...(o.rule ?? clone(D.rule!)), use: v } }, D.rule!.use),
  // Gear Inspector result labels (boolean OR group).
  flagsField(
    (s) => s.gearInspectorResult,
    (o, v) => { o.gearInspectorResult = v },
    ['keep', 'sell', 'matched', 'unmatched'] as const,
    D.gearInspectorResult!,
  ),
  // Sets: selected entries union by id; metaSelected union; anyMode/match scalar override.
  arrayField<ArtifactSetSelectionEntry>((s) => s.sets?.selected, (o, v) => { o.sets.selected = v }, (e) => Number(e.id)),
  // metaSelected is absent from the default state; keep it absent when empty so merge/subtract
  // never materialize an empty array (which would otherwise break the merge === base invariant).
  {
    merge: (b, a, out) => {
      const v = unionBy(b.sets?.metaSelected ?? [], a.sets?.metaSelected ?? [], (x) => x)
      if (v.length > 0) out.sets.metaSelected = v
      else delete out.sets.metaSelected
    },
    contains: (b, a) => subsetBy(a.sets?.metaSelected ?? [], b.sets?.metaSelected ?? [], (x) => x),
    subtract: (b, a, out) => {
      const v = differenceBy(b.sets?.metaSelected ?? [], a.sets?.metaSelected ?? [], (x) => x)
      if (v.length > 0) out.sets.metaSelected = v
      else delete out.sets.metaSelected
    },
  },
  scalarField((s) => s.sets?.anyMode ?? D.sets.anyMode, (o, v) => { o.sets.anyMode = v }, D.sets.anyMode),
  scalarField((s) => s.sets?.match ?? D.sets.match!, (o, v) => { o.sets.match = v }, D.sets.match!),
  // Slots / Rank / Rarity / Main / Faction: numeric selections + anyMode.
  arrayField<number>((s) => s.slots?.selected, (o, v) => { o.slots.selected = v as RulesFilterState['slots']['selected'] }),
  scalarField((s) => s.slots?.anyMode ?? D.slots.anyMode, (o, v) => { o.slots.anyMode = v }, D.slots.anyMode),
  arrayField<number>((s) => s.rank?.selected, (o, v) => { o.rank.selected = v as RulesFilterState['rank']['selected'] }),
  scalarField((s) => s.rank?.anyMode ?? D.rank.anyMode, (o, v) => { o.rank.anyMode = v }, D.rank.anyMode),
  arrayField<number>((s) => s.rarity?.selected, (o, v) => { o.rarity.selected = v as RulesFilterState['rarity']['selected'] }),
  scalarField((s) => s.rarity?.anyMode ?? D.rarity.anyMode, (o, v) => { o.rarity.anyMode = v }, D.rarity.anyMode),
  arrayField<number>((s) => s.main?.selected, (o, v) => { o.main.selected = v as RulesFilterState['main']['selected'] }),
  scalarField((s) => s.main?.anyMode ?? D.main.anyMode, (o, v) => { o.main.anyMode = v }, D.main.anyMode),
  arrayField<number>((s) => s.faction?.selected, (o, v) => { o.faction.selected = v as RulesFilterState['faction']['selected'] }),
  scalarField((s) => s.faction?.anyMode ?? D.faction.anyMode, (o, v) => { o.faction.anyMode = v }, D.faction.anyMode),
  // Level: milestone selections + anyMode + the Gear Inspector numeric range (object override).
  arrayField<number>((s) => s.level?.selected, (o, v) => { o.level.selected = v as RulesFilterState['level']['selected'] }),
  scalarField((s) => s.level?.anyMode ?? D.level.anyMode, (o, v) => { o.level.anyMode = v }, D.level.anyMode),
  scalarField((s) => s.level?.gearInspectorRange ?? D.level.gearInspectorRange!, (o, v) => { o.level.gearInspectorRange = v }, D.level.gearInspectorRange!),
  // Sub-stats: must-have / must-not-have unions + match + wildcard mode.
  arrayField<number>((s) => s.sub?.selected, (o, v) => { o.sub.selected = v as RulesFilterState['sub']['selected'] }),
  arrayField<number>((s) => s.sub?.notSelected, (o, v) => { o.sub.notSelected = v as RulesFilterState['sub']['notSelected'] }),
  scalarField((s) => s.sub?.mode ?? D.sub.mode, (o, v) => { o.sub.mode = v }, D.sub.mode),
  scalarField((s) => s.sub?.wildcardMode ?? D.sub.wildcardMode, (o, v) => { o.sub.wildcardMode = v }, D.sub.wildcardMode),
  // Recipe name search (scalar override; default empty query).
  scalarField((s) => s.recipeName?.query ?? D.recipeName!.query, (o, v) => { o.recipeName = { query: v } }, D.recipeName!.query),
  // Gear Inspector sources (string union).
  arrayField<string>((s) => s.gearInspectorSources?.selected, (o, v) => { o.gearInspectorSources = { selected: v as GearInspectorSourceFilter[] } }),
  // Gear Inspector chaos / glyph modes (scalar override; default 'any').
  scalarField((s) => s.gearInspectorChaos?.mode ?? D.gearInspectorChaos!.mode, (o, v) => { o.gearInspectorChaos = { mode: v } }, D.gearInspectorChaos!.mode),
  scalarField((s) => s.gearInspectorGlyphs?.mode ?? D.gearInspectorGlyphs!.mode, (o, v) => { o.gearInspectorGlyphs = { mode: v } }, D.gearInspectorGlyphs!.mode),
  // Ascension stars + stats (numeric unions).
  arrayField<number>((s) => s.gearInspectorAscension?.stars, (o, v) => { o.gearInspectorAscension = { ...(o.gearInspectorAscension ?? clone(D.gearInspectorAscension!)), stars: v } }),
  arrayField<number>((s) => s.gearInspectorAscension?.stats, (o, v) => { o.gearInspectorAscension = { ...(o.gearInspectorAscension ?? clone(D.gearInspectorAscension!)), stats: v as StatVariant[] } }),
  // Champions (numeric union).
  arrayField<number>((s) => s.gearInspectorChampions?.selected, (o, v) => { o.gearInspectorChampions = { selected: v } }),
  // Rolls: object override (niche, deep structure — treat whole filter as one value).
  scalarField((s) => s.gearInspectorRolls ?? D.gearInspectorRolls!, (o, v) => { o.gearInspectorRolls = v }, D.gearInspectorRolls!),
  // Last-use: preset chips union + custom range object override.
  arrayField<string>((s) => s.gearInspectorLastUse?.presets, (o, v) => { o.gearInspectorLastUse = { ...(o.gearInspectorLastUse ?? clone(D.gearInspectorLastUse!)), presets: v as GearInspectorLastUsePreset[] } }),
  scalarField((s) => s.gearInspectorLastUse?.custom ?? D.gearInspectorLastUse!.custom, (o, v) => { o.gearInspectorLastUse = { ...(o.gearInspectorLastUse ?? clone(D.gearInspectorLastUse!)), custom: v } }, D.gearInspectorLastUse!.custom),
  // Improvement chance range (object override).
  scalarField((s) => s.gearInspectorImprovementChance ?? D.gearInspectorImprovementChance!, (o, v) => { o.gearInspectorImprovementChance = v }, D.gearInspectorImprovementChance!),
]

// --- public algebra -------------------------------------------------------

/** OR/union `add` into `base`, returning a new state (inputs untouched). */
export const mergeRulesFilterState = (base: RulesFilterState, add: RulesFilterState): RulesFilterState =>
  runMerge(FIELD_OPS, base, add)

/** True iff merging `add` into `base` would change nothing (base already covers add). */
export const rulesFilterStateContains = (base: RulesFilterState, add: RulesFilterState): boolean =>
  runContains(FIELD_OPS, base, add)

/** Inverse of merge: remove `add`'s contributions from `base`, returning a new state. */
export const subtractRulesFilterState = (base: RulesFilterState, add: RulesFilterState): RulesFilterState =>
  runSubtract(FIELD_OPS, base, add)

/** Re-apply only `add`'s scalar "mode" fields (anyMode, match, etc.) onto `base` — used by un-OR. */
export const reapplyRulesFilterScalars = (base: RulesFilterState, add: RulesFilterState): RulesFilterState =>
  runReapplyScalars(FIELD_OPS, base, add)

/** True iff `add` deviates from the default state (i.e. it would contribute something). */
export const rulesFilterStateHasContribution = (add: RulesFilterState): boolean =>
  !rulesFilterStateContains(cloneDefaultRulesFilterState(), add)

// Reset every Gear-Inspector-only field to default — used when projecting a payload onto the
// rules (Sellfile preview) panel, which ignores these fields entirely.
const stripGearInspectorOnlyFields = (out: RulesFilterState): void => {
  out.gearInspectorResult = clone(D.gearInspectorResult!)
  out.gearInspectorSources = clone(D.gearInspectorSources!)
  out.gearInspectorChaos = clone(D.gearInspectorChaos!)
  out.gearInspectorGlyphs = clone(D.gearInspectorGlyphs!)
  out.gearInspectorAscension = clone(D.gearInspectorAscension!)
  out.gearInspectorChampions = clone(D.gearInspectorChampions!)
  out.gearInspectorRolls = clone(D.gearInspectorRolls!)
  out.gearInspectorLastUse = clone(D.gearInspectorLastUse!)
  out.gearInspectorImprovementChance = clone(D.gearInspectorImprovementChance!)
  // Keep level.selected / anyMode (rules-relevant); reset only the Gear-Inspector numeric range.
  if (out.level) out.level = { ...out.level, gearInspectorRange: clone(D.level.gearInspectorRange!) }
}

/**
 * Project a filter payload onto a target panel so a preset works in either panel regardless of
 * where it was authored (cross-panel mapping — no data-type changes). Fields meaningful in both
 * panels (slots, sets, rank, rarity, level milestones, main/sub, faction, name) pass through; the
 * Keep/Sell intent is translated between the two representations:
 *   - rules panel: `rule.keep` (Bool3) ← Gear-Inspector `gearInspectorResult.keep/sell` (keep-only
 *     → 'yes', sell-only → 'no', both/neither → no restriction); all Gear-Inspector-only fields drop.
 *   - Gear Inspector: `gearInspectorResult.keep/sell` ← `rule.keep`; `rule` is then reset (the rule
 *     enabled/disabled axis has no item-outcome analog).
 * This is why e.g. "Show only Sell" filters the Sellfile preview (as a Sell rule filter), not just
 * the Gear Inspector.
 */
export const projectFilterStateToMode = (state: RulesFilterState, mode: RulesFilterPreviewMode): RulesFilterState => {
  const out = clone(state)
  if (mode === 'rules') {
    // Read the original result outcome before stripping, then fold it into the rule keep/sell intent.
    const result = state.gearInspectorResult
    const keepOnly = Boolean(result?.keep) && !result?.sell
    const sellOnly = Boolean(result?.sell) && !result?.keep
    const mappedKeep: Bool3 = keepOnly ? 'yes' : sellOnly ? 'no' : (out.rule?.keep ?? D.rule!.keep)
    out.rule = { keep: mappedKeep, use: out.rule?.use ?? D.rule!.use }
    stripGearInspectorOnlyFields(out)
  } else {
    // Fold the rule keep/sell intent into the item-outcome flags, then drop the rule axis.
    const ruleKeep = state.rule?.keep ?? 'any'
    if (ruleKeep !== 'any') {
      out.gearInspectorResult = {
        ...(out.gearInspectorResult ?? clone(D.gearInspectorResult!)),
        keep: ruleKeep === 'yes' ? true : Boolean(out.gearInspectorResult?.keep),
        sell: ruleKeep === 'no' ? true : Boolean(out.gearInspectorResult?.sell),
      }
    }
    out.rule = clone(D.rule!)
  }
  return out
}

/**
 * The meaningful filter payload of a preset, resolved for the panel it is being applied to.
 *
 * A snapshot stores one view per preview mode. With "sync views" OFF each panel keeps its own
 * independent filter, so the two stored views can hold entirely different selections — the
 * non-active one is usually stale leftover state. Preferring the ACTIVE panel's own view keeps
 * "apply" faithful to what the user configured and saw when they saved. Only when that view
 * contributes nothing do we fall back to the other one, which is what makes a preset authored
 * in one panel still work in the other (cross-panel mapping via projectFilterStateToMode).
 *
 * Order matters: a mode-agnostic scan (`rules` first, unconditionally) would let a stale rules
 * view win over the Gear Inspector selection the user actually made.
 */
export const presetPayloadView = (
  preset: FilterPreset,
  mode: RulesFilterPreviewMode,
): FilterPresetView | null => {
  const snap = preset.snapshot
  // The active panel's own view wins whenever it carries something.
  const own = snap.views?.[mode]
  if (own && rulesFilterStateHasContribution(own.state)) return own
  // Otherwise fall back to any other view that contributes (cross-panel preset).
  for (const other of RULES_FILTER_PREVIEW_MODES) {
    if (other === mode) continue
    const view = snap.views?.[other]
    if (view && rulesFilterStateHasContribution(view.state)) return view
  }
  // No view contributes (degenerate/default preset): fall back to any view so apply is a no-op.
  return own ?? snap.views?.gearInspector ?? snap.views?.rules ?? null
}

/**
 * The preset's payload projected onto a target panel (cross-panel mapping) so it applies regardless
 * of which panel authored it — e.g. a Sell preset filters the Sellfile preview as a Sell-rule filter.
 */
export const presetPayloadForMode = (
  preset: FilterPreset,
  mode: RulesFilterPreviewMode,
): RulesFilterState | null => {
  const view = presetPayloadView(preset, mode)
  if (!view) return null
  return projectFilterStateToMode(view.state, mode)
}
