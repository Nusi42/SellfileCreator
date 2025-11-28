/**
 * dateDisplay.ts
 *
 * Shared helpers for parsing + formatting local date/time strings so UI copy
 * stays consistent (autosave banners, tester tooltips, etc.).
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
