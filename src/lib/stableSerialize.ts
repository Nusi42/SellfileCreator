// stableSerialize provides deterministic value serialization without relying on
// JSON.stringify so callers can build stable signatures from typed payloads.

const STABLE_NULL = 'n'
const STABLE_UNDEFINED = 'u'

const normalizeNumber = (value: number): string => {
  // Collapse NaN payload variants to one token.
  if (Number.isNaN(value)) return 'NaN'
  // Keep +/-Infinity explicit and deterministic.
  if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf'
  // Normalize -0 so numeric equality maps to one token.
  if (Object.is(value, -0)) return '0'
  return String(value)
}

const serializeValue = (value: unknown): string => {
  if (value === null) return STABLE_NULL
  if (value === undefined) return STABLE_UNDEFINED
  if (typeof value === 'boolean') return value ? 'b1' : 'b0'
  if (typeof value === 'number') return `d${normalizeNumber(value)}`
  if (typeof value === 'string') return `s${value.length}:${value}`
  if (Array.isArray(value)) {
    const items = value.map((entry) => serializeValue(entry))
    return `a${value.length}[${items.join('|')}]`
  }
  if (typeof value === 'object') {
    // Sort keys once so map insertion order never changes signatures.
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const parts = keys.map((key) => `k${key.length}:${key}=${serializeValue(record[key])}`)
    return `o${keys.length}{${parts.join(';')}}`
  }
  // Functions/symbols should not appear in state payloads, but keep a fallback.
  return `x${String(value)}`
}

export const stableSerialize = (value: unknown): string => serializeValue(value)
