import { SUBSTAT_TARGET_MAX_ROLLS } from '../constants'
import { ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, isAnomalousSubstatVariant } from '../anomalousAccessories'
import type { SubstatRollTargetEntry } from './types'

// PROVISIONAL(anomalous): the one target-value quantizer. Classic stats stay
// integral (the engine's branch runtime floors to i32, and integral targets keep
// UI and engine in agreement). Anomalous targets SNAP to the observed 1.25 grid:
// the engine floor is only matching-equivalent for on-grid values — an off-grid
// 2.6 would display as 2.6 yet apply as ≥ 2, silently widening the rule.
export const quantizeTargetValueForVariant = (variant: number, value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (isAnomalousSubstatVariant(Number(variant))) {
    const step = ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE
    const snapped = Math.round(value / step) * step
    return Math.max(0, Math.round(snapped * 100) / 100)
  }
  return Math.max(0, Math.round(value))
}

// User input is sanitized through this clamp. Ingress callers that know the stat
// (SFC readers, the builder UI) pass `variant` so classic stays integral and
// anomalous snaps to the grid; variant-less internal callers re-normalize data
// that already passed a variant-aware ingress, so a 2-decimal clamp suffices.
export const clampTargetOverrideValue = (value: unknown, variant?: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (variant != null) return quantizeTargetValueForVariant(variant, value)
  const rounded = Math.round(value * 100) / 100
  if (rounded < 0) return 0
  return rounded
}

// Roll targets can be partially specified (Base only, sparse increments). Normalize
// them so builder math and serialization always operate on trimmed data.
export const normalizeRollTargetEntry = (
  entry: SubstatRollTargetEntry | null | undefined,
  variant?: number,
): SubstatRollTargetEntry | null => {
  if (!entry) return null
  let hasOverride = false
  const normalized: SubstatRollTargetEntry = {}
  const baseValue = clampTargetOverrideValue(entry.base, variant)
  if (baseValue != null) {
    normalized.base = baseValue
    hasOverride = true
  }
  if (Array.isArray(entry.increments)) {
    const trimmed: Array<number | null> = []
    let hasIncrement = false
    const limit = Math.min(entry.increments.length, SUBSTAT_TARGET_MAX_ROLLS)
    for (let i = 0; i < limit; i += 1) {
      const raw = entry.increments[i]
      if (raw == null) {
        trimmed[i] = null
        continue
      }
      const clamped = clampTargetOverrideValue(raw, variant)
      if (clamped == null) {
        trimmed[i] = null
        continue
      }
      trimmed[i] = clamped
      hasIncrement = true
    }
    while (trimmed.length > 0 && trimmed[trimmed.length - 1] == null) {
      trimmed.pop()
    }
    if (hasIncrement && trimmed.length > 0) {
      normalized.increments = trimmed
      hasOverride = true
    }
  }
  return hasOverride ? normalized : null
}

// Resolves the effective roll target threshold for a given roll count.
// rollIndex 0 = Base; 1 = +1, etc. factoryBase is the per-roll increment value
// for this stat/star (e.g. from baseMinForStarV — the game doubles it per roll:
// threshold = factoryBase + rollIndex * factoryBase).
// When entry is null, returns the pure factory value.
// For omitted increment positions, clamps at max(factory, lastSpecified) so
// the threshold never silently drops below the last explicitly set value.
// Rust mirror: wasm/rule_engine_core/src/lib.rs (resolve_target_threshold).
export const resolveRollTargetValue = (
  entry: SubstatRollTargetEntry | null | undefined,
  rollIndex: number,
  factoryBase: number,
): number => {
  // Mirror the engine's quantization exactly — for the factory fallback AND for
  // explicit overrides: the branch runtime FLOORS every base/override to i32, so
  // this returns the ENGINE-APPLIED threshold (stored values may carry on-grid
  // decimals like 2.5 that apply as 2). Callers comparing or advertising
  // thresholds must never mix floored and unfloored numbers. Drop the floors
  // together with the i32 boundary once the runtime learns f64 emission.
  const perRoll = Math.floor(Math.max(0, factoryBase))
  const factory = perRoll + rollIndex * perRoll
  if (!entry) return factory
  if (rollIndex <= 0) {
    return typeof entry.base === 'number' ? Math.floor(entry.base) : factory
  }
  const inc = entry.increments?.[rollIndex - 1]
  if (typeof inc === 'number') return Math.floor(inc)
  // Omitted position: floor at max(factory, last explicitly specified value).
  const lastSpecified = [...(entry.increments ?? [])].reverse().find((v): v is number => typeof v === 'number')
    ?? (typeof entry.base === 'number' ? entry.base : null)
  return lastSpecified != null ? Math.max(factory, Math.floor(lastSpecified)) : factory
}

// Loose parser accepts SFC legacy shapes (numbers, strings, plain objects) and
// converts them into the normalized structure used internally. Pass `variant`
// from every SFC/external ingress so the per-variant quantization applies.
export const normalizeLooseRollTargetEntry = (entry: unknown, variant?: number): SubstatRollTargetEntry | null => {
  if (entry == null) return null
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return normalizeRollTargetEntry({ base: entry }, variant)
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return normalizeRollTargetEntry({ base: parsed }, variant)
      }
    }
    return null
  }
  if (typeof entry === 'object') {
    return normalizeRollTargetEntry(entry as SubstatRollTargetEntry, variant)
  }
  return null
}
