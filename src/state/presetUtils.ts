/**
 * presetUtils.ts
 *
 * Shared sanitize helpers reused by every named-preset store (filter presets,
 * sort presets, …). Centralised here to satisfy the Single Source of Truth rule
 * — callers must import these rather than copy them.
 */

/** Accepts only short, non-empty strings suitable for stable internal IDs. */
export const sanitizePresetId = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 80)
}

/** Accepts only short, non-empty strings suitable for user-visible names. */
export const sanitizePresetName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Truncate with ellipsis so the menu label never wraps to multiple lines.
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

/** Returns a valid ISO timestamp, falling back to "now" for malformed values. */
export const sanitizePresetSavedAt = (raw: unknown): string => {
  // savedAt is informational only; clamp bad values to "now" so callers can rely on it.
  if (typeof raw === 'string' && raw.trim()) return raw
  return new Date().toISOString()
}
