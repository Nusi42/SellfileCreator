import { SUBSTAT_TARGET_MAX_ROLLS } from '../constants'
import { ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, isAnomalousSubstatVariant } from '../anomalousAccessories'
import type { SubstatRollTargetEntry } from './types'

// The value grid a stat's targets live on: 1 for classic stats (the engine's
// branch runtime floors to i32, so integral targets keep UI and engine in
// agreement) and the observed 1.25 step for PROVISIONAL(anomalous) mode-damage
// substats. One definition — both the quantizer and per-variant spinner steps
// read it, so "what is one step for this stat" is never re-derived.
export const targetValueStepForVariant = (variant: number): number => (
  isAnomalousSubstatVariant(Number(variant)) ? ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE : 1
)

// The one target-value quantizer: snap to the stat's grid (nearest multiple).
// Anomalous targets must stay on-grid because the engine floor below is only
// matching-equivalent there — an off-grid 2.6 would display as 2.6 yet apply as
// ≥ 2, silently widening the rule.
export const quantizeTargetValueForVariant = (variant: number, value: number): number => {
  if (!Number.isFinite(value)) return 0
  const step = targetValueStepForVariant(variant)
  const snapped = Math.max(0, Math.round(Math.round(value / step) * step * 100) / 100)
  // A non-zero input never becomes "no threshold": typing 0.4 on SPD or 0.5 on an
  // anomalous stat means the user wants SOME floor, so it lands on the first grid
  // step. Only a typed 0 (or negative) clears the target.
  if (snapped === 0 && value > 0) return step
  return snapped
}

// The threshold the ENGINE actually applies for a stored target value: the branch
// runtime emits substat values as i32, so any stored fraction floors on the way
// out (a stored 2.5 applies as ≥ 2). Every surface that ADVERTISES or COMPARES a
// threshold routes through here so no two of them disagree; editable inputs keep
// showing the stored value. Named after its Rust counterpart, emit_hsf_target_value
// (wasm/rule_engine_core/src/lib.rs) — delete both together when the runtime
// learns f64 emission, and the whole floor concept goes with them.
export const engineAppliedTargetValue = (value: number): number => Math.floor(Math.max(0, value))

// User input is sanitized through this clamp. `variant` is REQUIRED so there is no
// bypass around the quantizer: every ingress (SFC, builder UI, note-overrides DSL)
// knows which stat it is writing, so "one quantizer, no bypass" is enforced by the
// signature rather than by convention.
export const clampTargetOverrideValue = (value: unknown, variant: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return quantizeTargetValueForVariant(variant, value)
}

// Roll targets can be partially specified (Base only, sparse increments). Normalize
// them so builder math and serialization always operate on trimmed data.
export const normalizeRollTargetEntry = (
  entry: SubstatRollTargetEntry | null | undefined,
  variant: number,
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
// Rust mirror: wasm/rule_engine_core/src/lib.rs (emit_hsf_target_value).
export const resolveRollTargetValue = (
  entry: SubstatRollTargetEntry | null | undefined,
  rollIndex: number,
  factoryBase: number,
): number => {
  // Engine-applied on BOTH sides — the factory fallback (floor the per-roll base
  // before multiplying, matching emit_hsf_target_value's already-floored base_vals)
  // and explicit overrides. Never mix engine-applied and stored numbers.
  const perRoll = engineAppliedTargetValue(factoryBase)
  const factory = perRoll + rollIndex * perRoll
  if (!entry) return factory
  if (rollIndex <= 0) {
    return typeof entry.base === 'number' ? engineAppliedTargetValue(entry.base) : factory
  }
  const inc = entry.increments?.[rollIndex - 1]
  if (typeof inc === 'number') return engineAppliedTargetValue(inc)
  // Omitted position: floor at max(factory, last explicitly specified value).
  const lastSpecified = [...(entry.increments ?? [])].reverse().find((v): v is number => typeof v === 'number')
    ?? (typeof entry.base === 'number' ? entry.base : null)
  return lastSpecified != null ? Math.max(factory, engineAppliedTargetValue(lastSpecified)) : factory
}

// Loose parser accepts SFC legacy shapes (numbers, strings, plain objects) and
// converts them into the normalized structure used internally. `variant` is
// required for the same reason as above — no ingress may skip quantization.
export const normalizeLooseRollTargetEntry = (entry: unknown, variant: number): SubstatRollTargetEntry | null => {
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
