import { SUBSTAT_TARGET_MAX_ROLLS } from '../../lib/constants'
import type { SubstatRollTargetEntry } from '../../lib/hsfBuilder'
import type { StatVariant } from '../../lib/types'

// Bound state mirrors the serialized BuilderRecipe structure so callers can
// hydrate menu drafts without performing extra object shape conversions.
// `not: true` means the substat must be absent from the item (HSF Condition "¬").
// Mutually exclusive with min/max/any.
export type SubstatRollBoundsEntry = { min?: number; max?: number; any?: boolean; not?: boolean }

export type SubstatMenuInfo = {
  variant: StatVariant
  presence: 'all' | 'partial'
  lockState: 'none' | 'partial' | 'all'
  minValue: number | null
  maxValue: number | null
  minMixed: boolean
  maxMixed: boolean
  wildcard: boolean
  rollKind: 'none' | 'any' | 'min' | 'max' | 'not' | 'mixed'
}

// Local draft for the currently-open substat context menu. Tracks staged
// min/max edits plus all roll target overrides until the user commits.
// `not` shadows min/max when true — the stat must be absent.
export type SubstatMenuDraftState = {
  min: number | null
  max: number | null
  not?: boolean
  targetBase: number | null
  targetRolls: Array<number | null>
}

export const clampRollMin = (value: number): number => Math.max(0, Math.min(5, Math.round(Number(value))))
export const clampRollMax = (value: number): number => Math.max(0, Math.min(4, Math.round(Number(value))))

// Bounds normalization trims NaN payloads, clamps min/max to legal ranges, and
// normalizes wildcard entries back to `{ any: true }` for consistent diffs.
// `not: true` takes precedence — it clears all other fields and is mutually exclusive.
export const normalizeRollBoundsEntry = (entry: SubstatRollBoundsEntry | null | undefined): SubstatRollBoundsEntry | null => {
  if (!entry) return null
  // `not` is mutually exclusive with min/max/any; a truthy value wins immediately.
  if (entry.not === true) return { not: true }
  // Explicitly false not-flag is irrelevant — treat as absent.
  const next: SubstatRollBoundsEntry = {}
  const hasMin = typeof entry.min === 'number' && Number.isFinite(entry.min)
  const hasMax = typeof entry.max === 'number' && Number.isFinite(entry.max)
  if (hasMin) next.min = clampRollMin(entry.min!)
  if (hasMax) next.max = clampRollMax(entry.max!)
  if (typeof next.min === 'number' && typeof next.max === 'number' && next.max < Math.min(next.min, 4)) {
    next.max = Math.min(4, next.min)
  }
  if (!hasMin && !hasMax) {
    return entry.any ? { any: true } : null
  }
  return next
}

export const rollBoundsEqual = (a: SubstatRollBoundsEntry | null, b: SubstatRollBoundsEntry | null): boolean => (
  ((a?.min ?? null) === (b?.min ?? null))
  && ((a?.max ?? null) === (b?.max ?? null))
  && (Boolean(a?.any) === Boolean(b?.any))
  && (Boolean(a?.not) === Boolean(b?.not))
)

export const normalizeRollTargetEntry = (
  entry: SubstatRollTargetEntry | null | undefined,
): SubstatRollTargetEntry | null => {
  // Builder stores overrides as variant keyed objects. UI accepts partial drafts,
  // so we sanitize them before comparing or persisting to avoid false positives.
  if (!entry) return null
  const next: SubstatRollTargetEntry = {}
  const hasBase = typeof entry.base === 'number' && Number.isFinite(entry.base)
  if (hasBase) next.base = entry.base!
  if (Array.isArray(entry.increments)) {
    const trimmed = entry.increments
      .slice(0, SUBSTAT_TARGET_MAX_ROLLS)
      .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
    while (trimmed.length > 0 && (trimmed[trimmed.length - 1] == null)) {
      trimmed.pop()
    }
    if (trimmed.some((value) => value != null)) {
      next.increments = trimmed
    }
  }
  if (next.base == null && !next.increments) return null
  return next
}

export const targetEntriesEqual = (
  a: SubstatRollTargetEntry | null | undefined,
  b: SubstatRollTargetEntry | null | undefined,
): boolean => {
  if (a === b) return true
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.base !== b.base) return false
  const left = Array.isArray(a.increments) ? a.increments : []
  const right = Array.isArray(b.increments) ? b.increments : []
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

export const createEmptyTargetRolls = (): Array<number | null> => Array.from({ length: SUBSTAT_TARGET_MAX_ROLLS }, () => null)

export const cloneTargetRolls = (source: readonly (number | null)[] | undefined): Array<number | null> => {
  // Editors always work with a fixed-length array (Base + up to 5 rolls) so
  // derived components can rely on index math instead of guarding for length.
  const next = createEmptyTargetRolls()
  if (!source) return next
  for (let i = 0; i < Math.min(source.length, SUBSTAT_TARGET_MAX_ROLLS); i += 1) {
    next[i] = source[i] ?? null
  }
  return next
}

export const buildTargetEntryFromDraft = (
  base: number | null,
  rolls: readonly (number | null)[],
): SubstatRollTargetEntry | null => {
  const hasRollValues = rolls.some((value) => value != null)
  if (base == null && !hasRollValues) return null
  const entry: SubstatRollTargetEntry = {}
  if (base != null) entry.base = base
  if (hasRollValues) {
    entry.increments = rolls.map((value) => (value == null ? null : value))
  }
  return entry
}

export const clampTargetValue = (value: number | null, allowDecimals = false): number | null => {
  if (value == null) return null
  // Classic stats stay integral (the engine's branch runtime quantizes to i32);
  // anomalous mode-damage substats carry fractional bases (1.25% per line), so
  // callers pass allowDecimals for those variants to keep 2-decimal precision.
  if (allowDecimals) return Math.max(0, Math.round(value * 100) / 100)
  return Math.max(0, Math.round(value))
}

// Numeric parser mirrors the builder inputs: whitespace tolerant, ignores NaN.
export const parseNumericInput = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const next = Number(trimmed)
  if (Number.isNaN(next) || !Number.isFinite(next)) return null
  return next
}
