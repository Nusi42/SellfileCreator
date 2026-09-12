/**
 * dateDisplay.ts
 *
 * Shared helpers for parsing + formatting local date/time strings so UI copy
 * stays consistent (autosave banners, Gear Inspector tooltips, etc.).
 */

import { stalenessDurationParts, stalenessMinutes, stalenessTier } from './stalenessRamp'

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

/**
 * Builds the dirty-badge tooltip text. Three shapes, in descending specificity:
 *
 *  - past the fresh tier → "Unsaved for 1h 20m — not saved since <time>". The
 *    ELAPSED SPAN leads because that is the number that changes behaviour, and
 *    because colour alone must never be the only carrier of the dot's state
 *    (colour-blind users, and anyone with reduced-motion suppressing the pulse).
 *  - a known start but still fresh → "Unsaved changes — not saved since <time>".
 *  - no timestamp at all → plain "Unsaved changes".
 *
 * Centralized so the SFC and HSF badges stay worded and formatted identically.
 * `translate` is the i18n `t` function; the time uses the app-wide medium-date/
 * short-time format. `now` is passed in so the wording rides the same staleness
 * tick as the dot's colour and the two can never disagree.
 */
export function buildDirtyTooltip(
  dirtySince: number | null | undefined,
  translate: (
    key: 'dirtyBadgeNotSavedSince' | 'dirtyBadgeUnsaved' | 'dirtyBadgeUnsavedFor'
      | 'dirtyBadgeNotPushedSince' | 'dirtyBadgeUnpushed' | 'dirtyBadgeUnpushedFor'
      | 'dirtyBadgeDurationHours' | 'dirtyBadgeDurationMinutes',
    params?: Record<string, string | number>,
  ) => string,
  now: number = Date.now(),
  // A dot over a PUSH button describes a document the client has not received, not
  // an unsaved file. Each shape gets its own whole key (never a spliced sentence),
  // so a translator reorders freely and no language inherits English word order.
  describesPush = false,
): string {
  const formatted = dirtySince != null ? formatLocalDateTime(dirtySince) : null
  if (!formatted) return translate(describesPush ? 'dirtyBadgeUnpushed' : 'dirtyBadgeUnsaved')
  // Only surface a duration once it has left the fresh tier — below that the span
  // is noise ("Unsaved for 0m") and the plain wording reads better.
  const minutes = stalenessMinutes(dirtySince, now)
  const parts = stalenessTier(minutes) === 'fresh' ? null : stalenessDurationParts(minutes)
  if (parts) {
    // Unit words live in the catalogs; hours are dropped entirely under an hour so
    // no language has to render a "0h" that means nothing.
    const duration = parts.hours > 0
      ? translate('dirtyBadgeDurationHours', { hours: parts.hours, minutes: parts.minutes })
      : translate('dirtyBadgeDurationMinutes', { minutes: parts.minutes })
    return translate(
      describesPush ? 'dirtyBadgeUnpushedFor' : 'dirtyBadgeUnsavedFor',
      { duration, time: formatted },
    )
  }
  return translate(
    describesPush ? 'dirtyBadgeNotPushedSince' : 'dirtyBadgeNotSavedSince',
    { time: formatted },
  )
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
