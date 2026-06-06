/**
 * rulesFilterMerge.ts
 *
 * Set-algebra over `RulesFilterState` used by the "OR" (combine) apply mode of
 * filter presets. Three operations form a clean algebra so the pinned-preset
 * toggle stays consistent:
 *
 *   merge(base, add)     → OR/union `add` into `base`.
 *   contains(base, add)  → true iff merge(base, add) deep-equals base (apply is a no-op).
 *   subtract(base, add)  → inverse of merge: remove `add`'s contributions from `base`.
 *
 * Per-field semantics, relative to DEFAULT_RULES_FILTER_STATE:
 *   - Array selections        → set-union / subset / set-difference (keyed identity).
 *   - Boolean-flag groups      → per-flag OR / subset / clear.
 *   - Scalar/object overrides  → `add` wins only when it differs from the default;
 *                                contains = (add at default) || (base equals add);
 *                                subtract = reset to default when add differs from default.
 *
 * Defined relative to the single-source default state so there is exactly one place
 * that decides "what counts as a contribution".
 */
import {
  DEFAULT_RULES_FILTER_STATE,
  cloneDefaultRulesFilterState,
  type RulesFilterState,
  type GearInspectorSourceFilter,
  type GearInspectorLastUsePreset,
} from './rulesFilter'
import type { StatVariant } from './types'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'

const D = DEFAULT_RULES_FILTER_STATE

// Deep clone via JSON — filter state is plain data (no functions/Dates), matching
// the existing snapshot cloning used throughout the preset code.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// Order-independent structural equality. Snapshot/live states can carry the same
// data with different key order, so we canonicalize keys before comparing — mirrors
// the intent of filterPresetSnapshotsEqual without depending on sanitize ordering.
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const rec = value as Record<string, unknown>
  // Sort keys so {a,b} and {b,a} serialize identically.
  const keys = Object.keys(rec).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')}}`
}
const eq = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b)

// --- array set helpers (keyed identity) -----------------------------------

const unionBy = <T>(base: readonly T[], add: readonly T[], keyOf: (x: T) => string | number): T[] => {
  // Base entries first (base wins on key collision), then any add entries not already present.
  const seen = new Set(base.map(keyOf))
  const out = [...base]
  for (const item of add) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

const subsetBy = <T>(add: readonly T[], base: readonly T[], keyOf: (x: T) => string | number): boolean => {
  // Every add key must already be present in base for the union to be a no-op.
  const have = new Set(base.map(keyOf))
  return add.every((item) => have.has(keyOf(item)))
}

const differenceBy = <T>(base: readonly T[], add: readonly T[], keyOf: (x: T) => string | number): T[] => {
  // Drop every base entry whose key appears in add.
  const remove = new Set(add.map(keyOf))
  return base.filter((item) => !remove.has(keyOf(item)))
}

// --- per-field operation contract -----------------------------------------

// Each field op reads leaf values from base/add and writes results into a mutable
// `out` that starts as a deep clone of base. Keeping the field list defined once
// means merge/contains/subtract can never drift apart.
type FieldOp = {
  merge: (base: RulesFilterState, add: RulesFilterState, out: RulesFilterState) => void
  contains: (base: RulesFilterState, add: RulesFilterState) => boolean
  subtract: (base: RulesFilterState, add: RulesFilterState, out: RulesFilterState) => void
}

// Union-array field: read the leaf array, union/subset/difference by `keyOf`.
const arrayField = <T>(
  read: (s: RulesFilterState) => readonly T[] | undefined,
  write: (out: RulesFilterState, value: T[]) => void,
  keyOf: (x: T) => string | number = (x) => x as unknown as string | number,
): FieldOp => ({
  merge: (b, a, out) => write(out, unionBy(read(b) ?? [], read(a) ?? [], keyOf)),
  contains: (b, a) => subsetBy(read(a) ?? [], read(b) ?? [], keyOf),
  subtract: (b, a, out) => write(out, differenceBy(read(b) ?? [], read(a) ?? [], keyOf)),
})

// Scalar/object override field: `add` wins only when it differs from `def`.
const scalarField = <V>(
  read: (s: RulesFilterState) => V,
  write: (out: RulesFilterState, value: V) => void,
  def: V,
): FieldOp => ({
  merge: (b, a, out) => write(out, clone(eq(read(a), def) ? read(b) : read(a))),
  contains: (b, a) => eq(read(a), def) || eq(read(b), read(a)),
  subtract: (b, a, out) => write(out, clone(eq(read(a), def) ? read(b) : def)),
})

// Boolean-flag group: per-flag OR / subset / clear over a fixed key list.
const flagsField = <K extends string>(
  read: (s: RulesFilterState) => Record<K, boolean> | undefined,
  write: (out: RulesFilterState, value: Record<K, boolean>) => void,
  keys: readonly K[],
  def: Record<K, boolean>,
): FieldOp => ({
  merge: (b, a, out) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    const next = {} as Record<K, boolean>
    for (const k of keys) next[k] = Boolean(bv[k]) || Boolean(av[k])
    write(out, next)
  },
  contains: (b, a) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    // Every flag the addition turns on must already be on in base.
    return keys.every((k) => !av[k] || Boolean(bv[k]))
  },
  subtract: (b, a, out) => {
    const bv = read(b) ?? def
    const av = read(a) ?? def
    const next = {} as Record<K, boolean>
    for (const k of keys) next[k] = Boolean(bv[k]) && !av[k]
    write(out, next)
  },
})

// --- the single field list ------------------------------------------------

const FIELD_OPS: readonly FieldOp[] = [
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
export const mergeRulesFilterState = (base: RulesFilterState, add: RulesFilterState): RulesFilterState => {
  const out = clone(base)
  for (const op of FIELD_OPS) op.merge(base, add, out)
  return out
}

/** True iff merging `add` into `base` would change nothing (base already covers add). */
export const rulesFilterStateContains = (base: RulesFilterState, add: RulesFilterState): boolean =>
  FIELD_OPS.every((op) => op.contains(base, add))

/** Inverse of merge: remove `add`'s contributions from `base`, returning a new state. */
export const subtractRulesFilterState = (base: RulesFilterState, add: RulesFilterState): RulesFilterState => {
  const out = clone(base)
  for (const op of FIELD_OPS) op.subtract(base, add, out)
  return out
}

/** True iff `add` deviates from the default state (i.e. it would contribute something). */
export const rulesFilterStateHasContribution = (add: RulesFilterState): boolean =>
  !rulesFilterStateContains(cloneDefaultRulesFilterState(), add)

/**
 * True iff `state` contributes anything the Sellfile-preview (rules) filter actually uses — i.e.
 * a non-Gear-Inspector-only field. Gear-Inspector-only fields (result labels, gear DB sources,
 * chaos/glyph/ascension/champions/rolls/last-use/improvement-chance, and the numeric level range)
 * have no effect on the rules preview, so a preset built purely from them does not apply there.
 * Used to disable Gear-Inspector-only pinned presets while the Sellfile preview is active.
 */
export const rulesFilterStateAppliesToRulesMode = (state: RulesFilterState): boolean => {
  const stripped = clone(state)
  stripped.gearInspectorResult = clone(D.gearInspectorResult!)
  stripped.gearInspectorSources = clone(D.gearInspectorSources!)
  stripped.gearInspectorChaos = clone(D.gearInspectorChaos!)
  stripped.gearInspectorGlyphs = clone(D.gearInspectorGlyphs!)
  stripped.gearInspectorAscension = clone(D.gearInspectorAscension!)
  stripped.gearInspectorChampions = clone(D.gearInspectorChampions!)
  stripped.gearInspectorRolls = clone(D.gearInspectorRolls!)
  stripped.gearInspectorLastUse = clone(D.gearInspectorLastUse!)
  stripped.gearInspectorImprovementChance = clone(D.gearInspectorImprovementChance!)
  // Keep level.selected / anyMode (rules-relevant); reset only the Gear-Inspector numeric range.
  if (stripped.level) stripped.level = { ...stripped.level, gearInspectorRange: clone(D.level.gearInspectorRange!) }
  return rulesFilterStateHasContribution(stripped)
}
