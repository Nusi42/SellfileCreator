/**
 * gearDbTime
 *
 * Shared helpers for translating the Julian-day timestamps Helper stores inside
 * the LastUsedArtifacts table. Both the SQL importer and the JSON raw-row path
 * need to coerce those payloads into the `YYYY-MM-DD HH:MM:SS.mmm` strings the
 * UI already consumes, so the conversion logic lives here instead of getting
 * copy-pasted across modules.
 */

// SQLite stores REAL timestamps as Julian day numbers; convert them back to ms.
const SQLITE_JULIAN_UNIX_EPOCH = 2440587.5
const MS_PER_DAY = 24 * 60 * 60 * 1000
const JULIAN_MIN = 1_700_000
const JULIAN_MAX = 3_000_000

const padNumber = (value: number, size: number): string => (
  // Pad each slice manually so every component retains leading zeros (e.g., 08:05).
  `${Math.abs(value)}`.padStart(size, '0')
)

export const formatDateAsLocalTimestamp = (date: Date): string | null => {
  // Guard against invalid Date payloads so bogus inputs never leak downstream.
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = padNumber(date.getMonth() + 1, 2)
  const day = padNumber(date.getDate(), 2)
  const hours = padNumber(date.getHours(), 2)
  const minutes = padNumber(date.getMinutes(), 2)
  const seconds = padNumber(date.getSeconds(), 2)
  const millis = padNumber(date.getMilliseconds(), 3)
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
}

const fromJulianDay = (value: number): string | null => {
  // Keep the bounds tight so accidental numbers (e.g., artifact IDs) vanish.
  if (value < JULIAN_MIN || value > JULIAN_MAX) return null
  const msSinceEpoch = (value - SQLITE_JULIAN_UNIX_EPOCH) * MS_PER_DAY
  if (!Number.isFinite(msSinceEpoch)) return null
  return formatDateAsLocalTimestamp(new Date(msSinceEpoch))
}

/**
 * Convert whatever Helper stored into the canonical timestamp string.
 * - Strings are trimmed and returned as-is.
 * - REAL columns (Julian days) become ISO-ish timestamps in local time.
 * - Everything else resolves to `null` so callers can drop the metadata.
 */
export const coerceLastUseValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  const numeric = typeof value === 'bigint' ? Number(value) : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null
  return fromJulianDay(numeric)
}
