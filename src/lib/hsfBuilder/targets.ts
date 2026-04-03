import { SUBSTAT_TARGET_MAX_ROLLS } from '../constants'
import type { SubstatRollTargetEntry } from './types'

// User input (SFC or Builder UI) is sanitized through this clamp to keep roll
// target math integer-only and within the supported range.
export const clampTargetOverrideValue = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 0) return 0
  return rounded
}

// Roll targets can be partially specified (Base only, sparse increments). Normalize
// them so builder math and serialization always operate on trimmed data.
export const normalizeRollTargetEntry = (
  entry: SubstatRollTargetEntry | null | undefined,
): SubstatRollTargetEntry | null => {
  if (!entry) return null
  let hasOverride = false
  const normalized: SubstatRollTargetEntry = {}
  const baseValue = clampTargetOverrideValue(entry.base)
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
      const clamped = clampTargetOverrideValue(raw)
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

// Loose parser accepts SFC legacy shapes (numbers, strings, plain objects) and
// converts them into the normalized structure used internally.
export const normalizeLooseRollTargetEntry = (entry: unknown): SubstatRollTargetEntry | null => {
  if (entry == null) return null
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return normalizeRollTargetEntry({ base: entry })
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return normalizeRollTargetEntry({ base: parsed })
      }
    }
    return null
  }
  if (typeof entry === 'object') {
    return normalizeRollTargetEntry(entry as SubstatRollTargetEntry)
  }
  return null
}
