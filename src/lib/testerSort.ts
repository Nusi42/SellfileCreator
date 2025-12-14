import { ACCESSORY_NO_SET_ID } from './constants'
import { isAccessorySlot } from './testerDomain'
import {
  compareArtifactSets,
  compareArtifactTypes,
  StatVariant,
  type ArtifactSetId,
  type ArtifactTypeId,
} from './types'
import type { TesterPreviewRow } from '../types/testerPreview'
import { normalizeSubstatByMax6 } from './substatRollNormalization'

const generalSlotBucket = (slot: ArtifactTypeId): number => (isAccessorySlot(slot) ? 1 : 0)

const factionSortKey = (row: TesterPreviewRow): number => {
  const value = Number(row.artifact.faction)
  return Number.isFinite(value) ? value : 0
}

const isNoSetArtifact = (row: TesterPreviewRow): boolean => {
  const slot = Number(row.artifact.slot)
  const setId = Number(row.artifact.set)
  if (!Number.isFinite(setId)) return true
  if (isAccessorySlot(slot)) {
    return setId === ACCESSORY_NO_SET_ID
  }
  return setId === 0
}

const compareTesterArtifactSets = (a: TesterPreviewRow, b: TesterPreviewRow): number => {
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

const ascensionLevel = (row: TesterPreviewRow): number => {
  const rolls = row.artifact.ascension?.rolls
  return Number.isFinite(rolls) ? Number(rolls) : 0
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

const mainStatPriority = (row: TesterPreviewRow): number => {
  const variant = row.artifact.mainStat?.variant
  if (variant === undefined || variant === null) return MAINSTAT_PRIORITY.length
  return MAINSTAT_PRIORITY_MAP.get(variant as StatVariant) ?? MAINSTAT_PRIORITY.length
}

/** Comparator for tester preview rows following the default UI priority. */
export function compareTesterPreviewRows(a: TesterPreviewRow, b: TesterPreviewRow): number {
  return (
    generalSlotBucket(a.artifact.slot) - generalSlotBucket(b.artifact.slot)
    || (factionSortKey(a) - factionSortKey(b))
    || compareTesterArtifactSets(a, b)
    || compareArtifactTypes(a.artifact.slot, b.artifact.slot)
    || compareDescendingNumbers(a.artifact.rank, b.artifact.rank)
    || compareDescendingNumbers(a.artifact.rarity, b.artifact.rarity)
    || compareDescendingNumbers(ascensionLevel(a), ascensionLevel(b))
    || (mainStatPriority(a) - mainStatPriority(b))
  )
}

/** Stable sort helper so table rows adhere to the requested ordering. */
export function sortTesterRows(rows: readonly TesterPreviewRow[]): TesterPreviewRow[] {
  if (rows.length <= 1) {
    return rows.slice()
  }
  const annotated = rows.map((row, index) => ({ row, index }))
  annotated.sort((left, right) => compareTesterPreviewRows(left.row, right.row) || (left.index - right.index))
  return annotated.map((entry) => entry.row)
}

export type TesterSubstatSortDirection = 'desc' | 'asc'

// Synthetic "priority keys" beyond the StatVariant enum.
// Why: keep the sort menu extensible without forcing fake variants into the domain enum.
export const TESTER_SORT_KEY_LAST_USAGE = -1 as const

export type TesterSortKey = StatVariant | typeof TESTER_SORT_KEY_LAST_USAGE

export type TesterSubstatSortSpec = {
  // Ordered priority keys; earlier entries win.
  priorities: readonly TesterSortKey[]
  direction: TesterSubstatSortDirection
  // Optional per-key override: listed keys sort opposite of the global direction.
  flipped?: readonly TesterSortKey[]
  // When true, sort by the pre-glyph (base + myth) values to avoid mixing glyph upgrades into ordering.
  excludeGlyphs: boolean
  // When true, ignore priority order and sort by the sum of normalized substat values.
  normalized?: boolean
  // Optional per-StatVariant weights used by normalized mode (default weight is 1.0).
  // Why: allow users to bias the normalized sum without needing to reorder priorities.
  weights?: Partial<Record<StatVariant, number>>
}

// Weighting constants are exported so UI + persistence + sort logic share a single source of truth.
export const TESTER_SORT_WEIGHT_STEP = 0.05 as const
export const TESTER_SORT_WEIGHT_MIN = 0.1 as const
export const TESTER_SORT_WEIGHT_MAX = 3.0 as const
export const TESTER_SORT_WEIGHT_DEFAULT = 1.0 as const

export const normalizeTesterSortWeight = (value: number): number => {
  // Treat non-finite inputs as the neutral default; invalid persisted values should never leak into UI math.
  if (!Number.isFinite(value)) return TESTER_SORT_WEIGHT_DEFAULT
  // Clamp to the advertised range so UI controls remain predictable.
  const clamped = Math.min(TESTER_SORT_WEIGHT_MAX, Math.max(TESTER_SORT_WEIGHT_MIN, value))
  // Snap to the advertised step so +/- buttons always land on a stable decimal.
  const stepped = Math.round(clamped / TESTER_SORT_WEIGHT_STEP) * TESTER_SORT_WEIGHT_STEP
  // Normalize to 2 decimals so repeated math/persistence doesn't accumulate float noise with 0.05 steps.
  return Math.round(stepped * 100) / 100
}

export const isNeutralTesterSortWeight = (value: number): boolean => (
  // Equality checks on floats are safe here because normalizeTesterSortWeight keeps 1 decimal.
  normalizeTesterSortWeight(value) === TESTER_SORT_WEIGHT_DEFAULT
)

const weightForNormalizedSum = (weights: TesterSubstatSortSpec['weights'], variant: StatVariant): number => {
  // Weight values are user-controlled; sanitize aggressively and always fall back to neutral.
  const raw = weights?.[variant]
  if (raw === undefined || raw === null) return TESTER_SORT_WEIGHT_DEFAULT
  const normalized = normalizeTesterSortWeight(Number(raw))
  return Number.isFinite(normalized) ? normalized : TESTER_SORT_WEIGHT_DEFAULT
}

const statValueForSubstatSort = (row: TesterPreviewRow, variant: StatVariant, excludeGlyphs: boolean): number => {
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

const lastUsageValueForSort = (row: TesterPreviewRow): number | null => {
  // Null/invalid timestamps should always sort last; return null so the comparator can handle them explicitly.
  const timestamp = row.artifact.lastUseLocalTimestamp
  if (typeof timestamp !== 'string' || timestamp.length === 0) return null
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : null
}

export type TesterNormalizedSubstatScoreSpec = {
  // Selected substats to include in the normalized sum (synthetic keys are not allowed here).
  variants: readonly StatVariant[]
  // When true, ignore glyph values (base + myth only) to keep scores comparable.
  excludeGlyphs: boolean
  // Optional per-substat weights; missing weights are treated as neutral (1.0).
  weights?: Partial<Record<StatVariant, number>>
}

export function computeTesterNormalizedSubstatScore(
  row: TesterPreviewRow,
  spec: TesterNormalizedSubstatScoreSpec,
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

export function compareTesterPreviewRowsBySubstats(
  a: TesterPreviewRow,
  b: TesterPreviewRow,
  spec: TesterSubstatSortSpec,
): number {
  // Direction is normalized so UI callers can toggle without worrying about invalid strings.
  const direction = spec.direction === 'asc' ? 'asc' : 'desc'
  const globalMultiplier = direction === 'asc' ? 1 : -1
  // Default to excluding glyphs so legacy callers that omit the flag behave predictably.
  const excludeGlyphs = spec.excludeGlyphs !== false
  // Normalized sorting is a "sum score" mode: priority order and per-key flips are ignored.
  const selectedSubstats = spec.priorities.filter((key) => Number(key) !== TESTER_SORT_KEY_LAST_USAGE)
  const normalized = spec.normalized === true && selectedSubstats.length > 1

  if (normalized) {
    // Delegate score math to the shared helper so overlays and sorting stay in sync.
    const scoreSpec: TesterNormalizedSubstatScoreSpec = {
      variants: selectedSubstats as StatVariant[],
      excludeGlyphs,
      ...(spec.weights ? { weights: spec.weights } : {}),
    }
    const left = computeTesterNormalizedSubstatScore(a, scoreSpec) ?? 0
    const right = computeTesterNormalizedSubstatScore(b, scoreSpec) ?? 0
    if (left !== right) {
      return (left - right) * globalMultiplier
    }
    // Tie-breaker intentionally uses the natural tester ordering so "Sort" stays additive.
    return compareTesterPreviewRows(a, b)
  }

  const flipped = new Set<number>((spec.flipped ?? []).map((key) => Number(key)))
  for (const variant of spec.priorities) {
    const key = Number(variant)
    const perKeyMultiplier = flipped.has(key) ? -globalMultiplier : globalMultiplier

    if (key === TESTER_SORT_KEY_LAST_USAGE) {
      const left = lastUsageValueForSort(a)
      const right = lastUsageValueForSort(b)
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
  // Final tie-breaker intentionally uses the natural tester ordering so "Sort" feels additive, not destructive.
  return compareTesterPreviewRows(a, b)
}

export function sortTesterRowsBySubstats(
  rows: readonly TesterPreviewRow[],
  spec: TesterSubstatSortSpec,
): TesterPreviewRow[] {
  if (rows.length <= 1) return rows.slice()
  const annotated = rows.map((row, index) => ({ row, index }))
  annotated.sort((left, right) => (
    compareTesterPreviewRowsBySubstats(left.row, right.row, spec) || (left.index - right.index)
  ))
  return annotated.map((entry) => entry.row)
}
