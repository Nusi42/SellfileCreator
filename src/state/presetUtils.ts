/**
 * presetUtils.ts
 *
 * Shared sanitize helpers reused by every named-preset store (filter presets,
 * sort presets, …). Centralised here to satisfy the Single Source of Truth rule
 * — callers must import these rather than copy them.
 */
import { normalizeMetasetIconId, type MetasetIconId } from '../lib/metasetIcons'

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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
/** Returns a valid #RRGGBB hex color, or undefined for absent/invalid values. */
export const sanitizePresetColor = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined
  return HEX_COLOR_RE.test(raw) ? raw : undefined
}

/**
 * Returns a valid glyph-catalog icon id, or undefined for absent/invalid values
 * and for the catalog's "no icon" sentinel ('none'). Mirrors sanitizePresetColor:
 * undefined means "store nothing", so a preset without an icon stays field-absent.
 */
export const sanitizePresetIconId = (raw: unknown): MetasetIconId | undefined => {
  if (typeof raw !== 'string') return undefined
  // normalizeMetasetIconId collapses unknown ids to 'none'; treat that as "no icon".
  const normalized = normalizeMetasetIconId(raw)
  return normalized === 'none' ? undefined : normalized
}

/** The icon/pin fields shared by every pinnable named preset (filter, sort, …). */
export type PresetIconPinFields = {
  iconId?: MetasetIconId
  pinned?: true
}

/**
 * Resolve icon/pin for a stored built-in stub over its shipped definition.
 * Absent stub field ⇒ inherit the definition default; present field ⇒ user override
 * (an explicit iconId:'none' clears the icon, pinned:false un-pins a default-pinned built-in).
 * Returns only the resolved fields so callers can clear-then-apply onto a definition copy.
 */
export const resolveBuiltinIconPin = (def: PresetIconPinFields, rec: Record<string, unknown>): PresetIconPinFields => {
  const out: PresetIconPinFields = {}
  // A string iconId in the stub is an explicit override; sanitize 'none'/invalid down to "cleared".
  if (typeof rec['iconId'] === 'string') {
    const icon = sanitizePresetIconId(rec['iconId'])
    if (icon) out.iconId = icon
  } else if (def.iconId) {
    out.iconId = def.iconId
  }
  // A boolean pinned in the stub is an explicit override; otherwise inherit the definition default.
  if (typeof rec['pinned'] === 'boolean') {
    if (rec['pinned'] === true) out.pinned = true
  } else if (def.pinned) {
    out.pinned = true
  }
  return out
}

/**
 * Compute the compact icon/pin override fields to persist for a built-in preset.
 * Only values that differ from the shipped definition are emitted — an explicit
 * iconId:'none' records an intentional clear, pinned:false records an intentional un-pin —
 * so storage stays compact yet user customizations are never silently dropped.
 */
export const buildBuiltinIconPinStub = (
  cur: PresetIconPinFields,
  def: PresetIconPinFields,
): { iconId?: MetasetIconId | 'none'; pinned?: boolean } => {
  const out: { iconId?: MetasetIconId | 'none'; pinned?: boolean } = {}
  if ((cur.iconId ?? undefined) !== (def.iconId ?? undefined)) out.iconId = cur.iconId ?? 'none'
  const curPin = cur.pinned === true
  const defPin = def.pinned === true
  if (curPin !== defPin) out.pinned = curPin
  return out
}
