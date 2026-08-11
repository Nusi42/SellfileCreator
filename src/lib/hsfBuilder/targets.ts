import { SUBSTAT_TARGET_MAX_ROLLS } from '../constants'
import { ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, hsfValueScaleForVariant, isAnomalousSubstatVariant } from '../anomalousAccessories'
import type { SubstatRollTargetEntry } from './types'

// The RESOLUTION a stat's targets can express: the smallest change that survives
// the trip to HSF. The engine emits integers in the stat's wire unit, so this is
// exactly 1/scale — 1 for classic stats, 0.01 for the anomalous stats HSF stores
// in hundredths of a percent. Anything finer would be lost on export.
export const targetValueResolutionForVariant = (variant: number): number => (
  1 / hsfValueScaleForVariant(Number(variant))
)

// The SPINNER step: how far one arrow press moves. Deliberately coarser than the
// resolution for the anomalous stats — 0.25 is the granularity RSL Helper itself
// shows (docs/orig/anomalous.hsf: 0,25 / 0,5 / 0,75 / 1 …), so stepping matches
// what users see in-app while typing keeps the full 0.01 resolution.
export const ANOMALOUS_TARGET_SPINNER_STEP = 0.25
export const targetValueStepForVariant = (variant: number): number => (
  isAnomalousSubstatVariant(Number(variant)) ? ANOMALOUS_TARGET_SPINNER_STEP : 1
)

// The smallest value a PRESENT gear substat line can carry — a line that exists
// is never worth less than one minimum roll. 1 for classic stats; the observed
// rank-5 base for anomalous ones (no real gear has shown a smaller line). This
// is deliberately NOT the spinner step or the wire resolution: a user may want a
// 0.25 THRESHOLD, but no piece of gear carries a 0.25 line.
export const minGearLineValueForVariant = (variant: number): number => (
  isAnomalousSubstatVariant(Number(variant)) ? ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE : 1
)

// Multiplying into the wire unit is not exact in binary floating point — 0.29 *
// 100 is 28.999999999999996, which would floor a whole wire unit down. Every
// scale-then-truncate step first rounds away representation noise at a precision
// far finer than any real target. One definition; the Rust mirror uses the same
// epsilon so the two floors can never disagree on a boundary value.
const WIRE_NOISE_PRECISION = 1e6
const scaleToWireUnits = (value: number, variant: number): number => {
  const scale = hsfValueScaleForVariant(Number(variant))
  return Math.round(Math.max(0, value) * scale * WIRE_NOISE_PRECISION) / WIRE_NOISE_PRECISION
}

// The one target-value quantizer: snap to the stat's expressible resolution.
// Values off the resolution grid cannot survive export, so they are rounded here
// rather than silently truncated at the wire boundary.
export const quantizeTargetValueForVariant = (variant: number, value: number): number => {
  if (!Number.isFinite(value)) return 0
  const scale = hsfValueScaleForVariant(Number(variant))
  const snapped = Math.round(scaleToWireUnits(value, variant)) / scale
  // A non-zero input never becomes "no threshold": typing 0.4 on SPD (or 0.004 on
  // an anomalous stat) means the user wants SOME floor, so it lands on the first
  // expressible value. Only a typed 0 (or negative) clears the target.
  if (snapped === 0 && value > 0) return targetValueResolutionForVariant(variant)
  return snapped
}

// The threshold the ENGINE actually applies for a stored target value. The branch
// runtime emits substat values as integers IN THE STAT'S WIRE UNIT, so a value
// floors only to that unit's resolution: classic stats floor to whole numbers
// (a stored 2.5 applies as ≥ 2) while an anomalous 1.25 is exact (125 hundredths).
// Every surface that ADVERTISES or COMPARES a threshold routes through here so no
// two of them disagree; editable inputs keep showing the stored value. Mirrors
// to_hsf_wire_value (wasm/rule_engine_core/src/hsf_builder_core.rs), which floors
// the same way to produce the integer the emitter writes.
export const engineAppliedTargetValue = (value: number, variant: number): number => (
  Math.floor(scaleToWireUnits(value, variant)) / hsfValueScaleForVariant(Number(variant))
)

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

// Structural equality for two target entries. Both sides are normalized first so
// shape differences (undefined vs null, trailing nulls, off-grid values that
// quantize to the same threshold) never register as a change. Normalization is
// idempotent, so passing already-normalized entries is free.
export const targetEntriesEqual = (
  left: SubstatRollTargetEntry | null | undefined,
  right: SubstatRollTargetEntry | null | undefined,
  variant: number,
): boolean => {
  const a = normalizeRollTargetEntry(left, variant)
  const b = normalizeRollTargetEntry(right, variant)
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.base !== b.base) return false
  const leftIncrements = a.increments ?? []
  const rightIncrements = b.increments ?? []
  if (leftIncrements.length !== rightIncrements.length) return false
  for (let i = 0; i < leftIncrements.length; i += 1) {
    if (leftIncrements[i] !== rightIncrements[i]) return false
  }
  return true
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
  variant: number,
): number => {
  // Engine-applied on BOTH sides — the factory fallback (floor the per-roll base
  // before multiplying, matching emit_hsf_target_value's already-floored base_vals)
  // and explicit overrides. Never mix engine-applied and stored numbers.
  const perRoll = engineAppliedTargetValue(factoryBase, variant)
  const factory = perRoll + rollIndex * perRoll
  if (!entry) return factory
  if (rollIndex <= 0) {
    return typeof entry.base === 'number' ? engineAppliedTargetValue(entry.base, variant) : factory
  }
  const inc = entry.increments?.[rollIndex - 1]
  if (typeof inc === 'number') return engineAppliedTargetValue(inc, variant)
  // Omitted position: floor at max(factory, last explicitly specified value).
  const lastSpecified = [...(entry.increments ?? [])].reverse().find((v): v is number => typeof v === 'number')
    ?? (typeof entry.base === 'number' ? entry.base : null)
  return lastSpecified != null ? Math.max(factory, engineAppliedTargetValue(lastSpecified, variant)) : factory
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
