import { ACCESSORY_NO_SET_ID } from './constants'
import { isAccessorySlot } from './gearInspectorDomain'
import {
  compareArtifactSets,
  compareArtifactTypes,
  StatVariant,
  type ArtifactSetId,
  type ArtifactTypeId,
} from './types'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { normalizeSubstatByMax6 } from './substatRollNormalization'

const generalSlotBucket = (slot: ArtifactTypeId): number => (isAccessorySlot(slot) ? 1 : 0)

const factionSortKey = (row: GearInspectorPreviewRow): number => {
  const value = Number(row.artifact.faction)
  return Number.isFinite(value) ? value : 0
}

const isNoSetArtifact = (row: GearInspectorPreviewRow): boolean => {
  const slot = Number(row.artifact.slot)
  const setId = Number(row.artifact.set)
  if (!Number.isFinite(setId)) return true
  if (isAccessorySlot(slot)) {
    return setId === ACCESSORY_NO_SET_ID
  }
  return setId === 0
}

const compareGearInspectorArtifactSets = (a: GearInspectorPreviewRow, b: GearInspectorPreviewRow): number => {
  const aNoSet = isNoSetArtifact(a)
  const bNoSet = isNoSetArtifact(b)
  if (aNoSet !== bNoSet) {
    return aNoSet ? -1 : 1
  }
  const aSet = Number(a.artifact.set) as ArtifactSetId
  const bSet = Number(b.artifact.set) as ArtifactSetId
  return compareArtifactSets(aSet, bSet)
}

const compareDescendingNumbers = (left: unknown, right: unknown): number => {
  const a = Number(left)
  const b = Number(right)
  const safeA = Number.isFinite(a) ? a : 0
  const safeB = Number.isFinite(b) ? b : 0
  return safeB - safeA
}

const compareAscendingNumbers = (left: unknown, right: unknown): number => {
  const a = Number(left)
  const b = Number(right)
  const safeA = Number.isFinite(a) ? a : 0
  const safeB = Number.isFinite(b) ? b : 0
  return safeA - safeB
}

const ascensionLevel = (row: GearInspectorPreviewRow): number => {
  const rolls = row.artifact.ascension?.rolls
  return Number.isFinite(rolls) ? Number(rolls) : 0
}

const exactArtifactLevelForSort = (row: GearInspectorPreviewRow): number => {
  const exact = row.artifact.exactLevel
  if (Number.isFinite(exact)) {
    return Number(exact)
  }
  return Number(row.artifact.level)
}

const MAINSTAT_PRIORITY: readonly StatVariant[] = [
  StatVariant.HP,
  StatVariant.HP_FLAT,
  StatVariant.ATK,
  StatVariant.ATK_FLAT,
  StatVariant.DEF,
  StatVariant.DEF_FLAT,
  StatVariant.SPD,
  StatVariant.RES,
  StatVariant.ACC,
  StatVariant.CR,
  StatVariant.CDMG,
] as const

const MAINSTAT_PRIORITY_MAP = new Map<StatVariant, number>(
  MAINSTAT_PRIORITY.map((variant, index) => [variant, index]),
)

const mainStatPriority = (row: GearInspectorPreviewRow): number => {
  const variant = row.artifact.mainStat?.variant
  if (variant === undefined || variant === null) return MAINSTAT_PRIORITY.length
  return MAINSTAT_PRIORITY_MAP.get(variant as StatVariant) ?? MAINSTAT_PRIORITY.length
}

const artifactIdForSort = (row: GearInspectorPreviewRow): number => {
  // DB artifact ids are the canonical identity, and we use them as the final deterministic tie-breaker.
  const value = Number(row.artifact.id)
  return Number.isFinite(value) ? value : 0
}

/** Comparator for Gear Inspector preview rows following the default UI priority. */
export function compareGearInspectorPreviewRows(a: GearInspectorPreviewRow, b: GearInspectorPreviewRow): number {
  return (
    generalSlotBucket(a.artifact.slot) - generalSlotBucket(b.artifact.slot)
    || (factionSortKey(a) - factionSortKey(b))
    || compareGearInspectorArtifactSets(a, b)
    || compareArtifactTypes(a.artifact.slot, b.artifact.slot)
    || compareDescendingNumbers(a.artifact.rank, b.artifact.rank)
    || compareDescendingNumbers(a.artifact.rarity, b.artifact.rarity)
    || compareDescendingNumbers(ascensionLevel(a), ascensionLevel(b))
    // Higher upgrade level should surface first before main-stat priority kicks in.
    || compareDescendingNumbers(exactArtifactLevelForSort(a), exactArtifactLevelForSort(b))
    || (mainStatPriority(a) - mainStatPriority(b))
    // When all UI keys match, artifact id decides position so DB row-order churn cannot move equal cards.
    || compareAscendingNumbers(artifactIdForSort(a), artifactIdForSort(b))
  )
}

/** Stable sort helper so table rows adhere to the requested ordering. */
export function sortGearInspectorRows(rows: readonly GearInspectorPreviewRow[]): GearInspectorPreviewRow[] {
  if (rows.length <= 1) {
    return rows.slice()
  }
  const annotated = rows.map((row, index) => ({ row, index }))
  annotated.sort((left, right) => compareGearInspectorPreviewRows(left.row, right.row) || (left.index - right.index))
  return annotated.map((entry) => entry.row)
}

export type GearInspectorSubstatSortDirection = 'desc' | 'asc'

// Grouping state is persisted alongside sort preferences to keep UI + grid aligned.
export type GearInspectorGroupingState = {
  artifacts: {
    // When true, include a set-level grouping for artifacts.
    bySet: boolean
    // When true, include a slot-level grouping for artifacts.
    bySlot: boolean
  }
  accessories: {
    // When true, include a faction-level grouping for accessories.
    byFaction: boolean
    // When true, include a set-level grouping for accessories.
    bySet: boolean
    // When true, include a slot-level grouping for accessories.
    bySlot: boolean
  }
  // When true, suppress all headers and render a single flat list.
  hideHeaders: boolean
}

// Default grouping keeps the legacy behavior: artifacts by set, accessories by faction + set.
export const GEAR_INSPECTOR_GROUPING_DEFAULT_STATE: GearInspectorGroupingState = Object.freeze({
  artifacts: {
    bySet: true,
    bySlot: false,
  },
  accessories: {
    byFaction: true,
    bySet: true,
    bySlot: false,
  },
  hideHeaders: false,
})

export const isDefaultGearInspectorGroupingState = (grouping: GearInspectorGroupingState | null | undefined): boolean => {
  // Missing or invalid grouping always falls back to the default state.
  if (!grouping) return true
  return grouping.artifacts.bySet === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.artifacts.bySet
    && grouping.artifacts.bySlot === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.artifacts.bySlot
    && grouping.accessories.byFaction === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.byFaction
    && grouping.accessories.bySet === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.bySet
    && grouping.accessories.bySlot === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.bySlot
    && grouping.hideHeaders === GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.hideHeaders
}

export const normalizeGearInspectorGroupingState = (raw: unknown): GearInspectorGroupingState => {
  // Invalid shapes should never crash; fall back to the default grouping recipe.
  if (!raw || typeof raw !== 'object') return GEAR_INSPECTOR_GROUPING_DEFAULT_STATE
  const obj = raw as Record<string, unknown>
  const artifactsRaw = obj.artifacts && typeof obj.artifacts === 'object' ? (obj.artifacts as Record<string, unknown>) : {}
  const accessoriesRaw = obj.accessories && typeof obj.accessories === 'object' ? (obj.accessories as Record<string, unknown>) : {}
  const artifacts = {
    // Explicit true/false is honored; otherwise fall back to the defaults.
    bySet: artifactsRaw.bySet === true ? true : artifactsRaw.bySet === false ? false : GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.artifacts.bySet,
    bySlot: artifactsRaw.bySlot === true ? true : artifactsRaw.bySlot === false ? false : GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.artifacts.bySlot,
  }
  const accessories = {
    // Accessory grouping can combine faction/set/slot independently.
    byFaction: accessoriesRaw.byFaction === true ? true : accessoriesRaw.byFaction === false ? false : GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.byFaction,
    bySet: accessoriesRaw.bySet === true ? true : accessoriesRaw.bySet === false ? false : GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.bySet,
    bySlot: accessoriesRaw.bySlot === true ? true : accessoriesRaw.bySlot === false ? false : GEAR_INSPECTOR_GROUPING_DEFAULT_STATE.accessories.bySlot,
  }
  const hideHeaders = obj.hideHeaders === true
  return { artifacts, accessories, hideHeaders }
}

// Synthetic "priority keys" beyond the StatVariant enum.
// Why: keep the sort menu extensible without forcing fake variants into the domain enum.
export const GEAR_INSPECTOR_SORT_KEY_LAST_USAGE = -1 as const
export const GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE = -2 as const
export const GEAR_INSPECTOR_SORT_KEY_NEWEST = -3 as const

export type GearInspectorSortKey =
  | StatVariant
  | typeof GEAR_INSPECTOR_SORT_KEY_LAST_USAGE
  | typeof GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE
  | typeof GEAR_INSPECTOR_SORT_KEY_NEWEST

export const isGearInspectorSyntheticSortKey = (key: number): boolean => (
  key === GEAR_INSPECTOR_SORT_KEY_LAST_USAGE
  || key === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE
  || key === GEAR_INSPECTOR_SORT_KEY_NEWEST
)

export type GearInspectorSubstatSortSpec = {
  // Ordered priority keys; earlier entries win.
  priorities: readonly GearInspectorSortKey[]
  direction: GearInspectorSubstatSortDirection
  // Optional per-key override: listed keys sort opposite of the global direction.
  flipped?: readonly GearInspectorSortKey[]
  // When true, sort by the pre-glyph (base + myth) values to avoid mixing glyph upgrades into ordering.
  excludeGlyphs: boolean
  // When true, ignore priority order and sort by the sum of normalized substat values.
  normalized?: boolean
  // Optional per-StatVariant weights used by normalized mode (default weight is 1.0).
  // Why: allow users to bias the normalized sum without needing to reorder priorities.
  weights?: Partial<Record<StatVariant, number>>
  // Optional override for normalized mode: a list of score specs where the effective score is the best (max).
  // Why: supports "combine presets and use the best" UX without forking the score math.
  normalizedScoreSpecs?: readonly GearInspectorNormalizedSubstatScoreSpec[]
  // Optional artifact-id keyed safeguard chance map used by the synthetic "improvement chance" sort key.
  safeguardUpgradeChanceByArtifactId?: ReadonlyMap<number, number | null>
}

// Weighting constants are exported so UI + persistence + sort logic share a single source of truth.
export const GEAR_INSPECTOR_SORT_WEIGHT_STEP = 0.05 as const
export const GEAR_INSPECTOR_SORT_WEIGHT_MIN = 0.1 as const
export const GEAR_INSPECTOR_SORT_WEIGHT_MAX = 3.0 as const
export const GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT = 1.0 as const

export const normalizeGearInspectorSortWeight = (value: number): number => {
  // Treat non-finite inputs as the neutral default; invalid persisted values should never leak into UI math.
  if (!Number.isFinite(value)) return GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
  // Clamp to the advertised range so UI controls remain predictable.
  const clamped = Math.min(GEAR_INSPECTOR_SORT_WEIGHT_MAX, Math.max(GEAR_INSPECTOR_SORT_WEIGHT_MIN, value))
  // Snap to the advertised step so +/- buttons always land on a stable decimal.
  const stepped = Math.round(clamped / GEAR_INSPECTOR_SORT_WEIGHT_STEP) * GEAR_INSPECTOR_SORT_WEIGHT_STEP
  // Normalize to 2 decimals so repeated math/persistence doesn't accumulate float noise with 0.05 steps.
  return Math.round(stepped * 100) / 100
}

export const isNeutralGearInspectorSortWeight = (value: number): boolean => (
  // Equality checks on floats are safe here because normalizeGearInspectorSortWeight keeps 1 decimal.
  normalizeGearInspectorSortWeight(value) === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
)

const weightForNormalizedSum = (weights: GearInspectorSubstatSortSpec['weights'], variant: StatVariant): number => {
  // Weight values are user-controlled; sanitize aggressively and always fall back to neutral.
  const raw = weights?.[variant]
  if (raw === undefined || raw === null) return GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
  const normalized = normalizeGearInspectorSortWeight(Number(raw))
  return Number.isFinite(normalized) ? normalized : GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
}

const statValueForSubstatSort = (row: GearInspectorPreviewRow, variant: StatVariant, excludeGlyphs: boolean): number => {
  // Missing substats are treated as 0 so mixed-slot gear still sorts deterministically.
  const entry = row.artifact.substats.find((stat) => Number(stat.variant) === Number(variant))
  if (!entry) return 0
  // `totalValue` is the pre-glyph value (base + myth) per gearDbNormalizer's contract.
  // Glyph inclusion is opt-in so we never double-count glyph upgrades elsewhere.
  const base = Number(entry.totalValue)
  const glyph = Number(entry.glyphValue)
  const safeBase = Number.isFinite(base) ? base : 0
  const safeGlyph = Number.isFinite(glyph) ? glyph : 0
  return excludeGlyphs ? safeBase : (safeBase + safeGlyph)
}

const lastUsageValueForSort = (row: GearInspectorPreviewRow): number | null => {
  // Null/invalid timestamps should always sort last; return null so the comparator can handle them explicitly.
  const timestamp = row.artifact.lastUseLocalTimestamp
  if (typeof timestamp !== 'string' || timestamp.length === 0) return null
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : null
}

const safeguardUpgradeChanceValueForSort = (
  row: GearInspectorPreviewRow,
  map: ReadonlyMap<number, number | null> | undefined,
): number | null => {
  // Missing map entry means "no matching safeguard chance", which should sort last for this synthetic key.
  if (!map) return null
  const artifactId = Number(row.artifact.id)
  if (!Number.isFinite(artifactId)) return null
  const value = map.get(artifactId)
  if (value == null) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  // Keep values bounded so invalid debug overrides cannot dominate sorting.
  if (numeric <= 0) return 0
  if (numeric >= 100) return 100
  return numeric
}

const newestValueForSort = (row: GearInspectorPreviewRow): number | null => {
  // Artifact ids monotonically increase for imported DB rows, so larger ids are newer.
  const artifactId = Number(row.artifact.id)
  return Number.isFinite(artifactId) ? artifactId : null
}

export type GearInspectorNormalizedSubstatScoreSpec = {
  // Selected substats to include in the normalized sum (synthetic keys are not allowed here).
  variants: readonly StatVariant[]
  // When true, ignore glyph values (base + myth only) to keep scores comparable.
  excludeGlyphs: boolean
  // Optional per-substat weights; missing weights are treated as neutral (1.0).
  weights?: Partial<Record<StatVariant, number>>
}

export function computeGearInspectorNormalizedSubstatScore(
  row: GearInspectorPreviewRow,
  spec: GearInspectorNormalizedSubstatScoreSpec,
): number | null {
  // Missing selection means "no score", allowing callers to hide overlays without inventing a 0.
  if (!spec.variants || spec.variants.length === 0) return null
  // Exclude-glyphs defaults to true in the rest of the sorter; keep the same bias here.
  const excludeGlyphs = spec.excludeGlyphs !== false
  // Sum all selected substats; missing ones are treated as 0 per statValueForSubstatSort's contract.
  let total = 0
  for (const variant of spec.variants) {
    // Normalize every contribution by its 6★ roll cap so mixed stats become comparable.
    const raw = statValueForSubstatSort(row, variant, excludeGlyphs)
    // Weights bias each contribution; missing/invalid weights fall back to 1.0.
    const weight = weightForNormalizedSum(spec.weights, variant)
    total += weight * normalizeSubstatByMax6(variant, raw)
  }
  // Treat non-finite totals as "no score" so callers never render NaN/Infinity into UI.
  return Number.isFinite(total) ? total : null
}

export function compareGearInspectorPreviewRowsBySubstats(
  a: GearInspectorPreviewRow,
  b: GearInspectorPreviewRow,
  spec: GearInspectorSubstatSortSpec,
): number {
  // Direction is normalized so UI callers can toggle without worrying about invalid strings.
  const direction = spec.direction === 'asc' ? 'asc' : 'desc'
  const globalMultiplier = direction === 'asc' ? 1 : -1
  // Default to excluding glyphs so legacy callers that omit the flag behave predictably.
  const excludeGlyphs = spec.excludeGlyphs !== false
  // Normalized sorting is a "sum score" mode: priority order and per-key flips are ignored.
  const selectedSubstats = spec.priorities.filter((key) => !isGearInspectorSyntheticSortKey(Number(key)))
  const normalizedScoreSpecs = spec.normalizedScoreSpecs
  // Normalized mode is allowed when we have either a score-spec override or at least one selected substat.
  const normalized = spec.normalized === true && (
    (normalizedScoreSpecs?.length ?? 0) > 0 || selectedSubstats.length > 0
  )

  if (normalized) {
    const score = (row: GearInspectorPreviewRow): number => {
      // When score-spec overrides exist, use the best (max) score across them.
      if (normalizedScoreSpecs && normalizedScoreSpecs.length > 0) {
        let best = 0
        for (const scoreSpec of normalizedScoreSpecs) {
          const value = computeGearInspectorNormalizedSubstatScore(row, scoreSpec)
          if (value == null) continue
          if (value > best) best = value
        }
        return best
      }
      // Otherwise compute the normalized sum from the selected substats + per-stat weights.
      const scoreSpec: GearInspectorNormalizedSubstatScoreSpec = {
        variants: selectedSubstats as StatVariant[],
        excludeGlyphs,
        ...(spec.weights ? { weights: spec.weights } : {}),
      }
      return computeGearInspectorNormalizedSubstatScore(row, scoreSpec) ?? 0
    }

    const left = score(a)
    const right = score(b)
    if (left !== right) {
      return (left - right) * globalMultiplier
    }
    // Tie-breaker intentionally uses the natural Gear Inspector ordering so "Sort" stays additive.
    return compareGearInspectorPreviewRows(a, b)
  }

  const flipped = new Set<number>((spec.flipped ?? []).map((key) => Number(key)))
  for (const variant of spec.priorities) {
    const key = Number(variant)
    const perKeyMultiplier = flipped.has(key) ? -globalMultiplier : globalMultiplier

    if (key === GEAR_INSPECTOR_SORT_KEY_LAST_USAGE) {
      const left = lastUsageValueForSort(a)
      const right = lastUsageValueForSort(b)
      if (left == null && right == null) continue
      if (left == null) return 1
      if (right == null) return -1
      if (left === right) continue
      return (left - right) * perKeyMultiplier
    }

    if (key === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE) {
      const left = safeguardUpgradeChanceValueForSort(a, spec.safeguardUpgradeChanceByArtifactId)
      const right = safeguardUpgradeChanceValueForSort(b, spec.safeguardUpgradeChanceByArtifactId)
      if (left == null && right == null) continue
      if (left == null) return 1
      if (right == null) return -1
      if (left === right) continue
      return (left - right) * perKeyMultiplier
    }

    if (key === GEAR_INSPECTOR_SORT_KEY_NEWEST) {
      const left = newestValueForSort(a)
      const right = newestValueForSort(b)
      if (left == null && right == null) continue
      if (left == null) return 1
      if (right == null) return -1
      if (left === right) continue
      return (left - right) * perKeyMultiplier
    }

    const left = statValueForSubstatSort(a, key as StatVariant, excludeGlyphs)
    const right = statValueForSubstatSort(b, key as StatVariant, excludeGlyphs)
    if (left === right) continue
    return (left - right) * perKeyMultiplier
  }
  // Final tie-breaker intentionally uses the natural Gear Inspector ordering so "Sort" feels additive, not destructive.
  return compareGearInspectorPreviewRows(a, b)
}

export function sortGearInspectorRowsBySubstats(
  rows: readonly GearInspectorPreviewRow[],
  spec: GearInspectorSubstatSortSpec,
): GearInspectorPreviewRow[] {
  if (rows.length <= 1) return rows.slice()
  const annotated = rows.map((row, index) => ({ row, index }))
  annotated.sort((left, right) => (
    compareGearInspectorPreviewRowsBySubstats(left.row, right.row, spec) || (left.index - right.index)
  ))
  return annotated.map((entry) => entry.row)
}
