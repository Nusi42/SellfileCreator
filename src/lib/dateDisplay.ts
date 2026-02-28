/**
 * dateDisplay.ts
 *
 * Shared helpers for parsing + formatting local date/time strings so UI copy
 * stays consistent (autosave banners, Gear Inspector tooltips, etc.).
 */

export type DateDisplayFormatOptions = Pick<Intl.DateTimeFormatOptions, 'dateStyle' | 'timeStyle'>

const DEFAULT_FORMAT_OPTIONS: DateDisplayFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
}

const normalizeTimestampString = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('T') || !trimmed.includes(' ')) return trimmed
  return trimmed.replace(' ', 'T')
}

const toDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return new Date(value)
  }
  if (typeof value === 'string') {
    const normalized = normalizeTimestampString(value)
    if (!normalized) return null
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

export function formatLocalDateTime(
  value: string | number | Date | null | undefined,
  options: DateDisplayFormatOptions = DEFAULT_FORMAT_OPTIONS,
): string | null {
  const date = toDate(value)
  if (!date) return null
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  } catch {
    return date.toLocaleString()
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getDaysSince(value: string | number | Date | null | undefined): number | null {
  const date = toDate(value)
  if (!date) return null
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs)) return null
  const days = diffMs / MS_PER_DAY
  if (!Number.isFinite(days)) return null
  if (days <= 0) return 0
  return days
}
