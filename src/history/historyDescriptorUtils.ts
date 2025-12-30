/**
 * historyDescriptorUtils
 *
 * Shared helpers for history descriptor payloads so multiple descriptor builders
 * render consistent snapshots without duplicating normalization logic.
 */
import type { Metaset } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById, normalizeMetasetIconId } from '../lib/metasetIcons'

// Keep metaset snapshot entries aligned with BuilderTooltipContent expectations.
export type MetasetSnapshotEntry = {
  id: string
  name: string
  icon?: string | null
}

export function normalizeNumberArray(value: unknown): number[] {
  // Guard against non-array inputs so callers can pass raw payload fields directly.
  if (!Array.isArray(value)) return []
  // Build a stable, numeric-only output so snapshots never emit NaN or undefined.
  const result: number[] = []
  // Preserve order while filtering out invalid values.
  for (const entry of value) {
    // Coerce values so numeric strings still get included.
    const num = Number(entry)
    // Only include finite numbers so tooltip payloads stay clean.
    if (Number.isFinite(num)) result.push(num)
  }
  return result
}

export function collectMetasetSnapshotEntries(
  ids: readonly unknown[] | null | undefined,
  metasets: readonly Metaset[],
): MetasetSnapshotEntry[] {
  // Normalize the incoming ID list so null/undefined stays empty.
  const rawIds = Array.isArray(ids) ? ids : []
  // Return early to avoid allocating when no metasets are referenced.
  if (rawIds.length === 0) return []
  // Build lookup entries using the stored metaset metadata for labels/icons.
  const out: MetasetSnapshotEntry[] = []
  for (const rawId of rawIds) {
    // Normalize to string so IDs stay comparable across sources.
    const id = String(rawId)
    // Skip empty IDs to avoid placeholder entries.
    if (!id) continue
    // Look up the metaset so names and icons stay human-friendly.
    const meta = metasets.find((entry) => entry.id === id) ?? null
    // Use the stored name when available so history mirrors the UI.
    const rawName = (meta?.name ?? '').trim()
    // Fall back to the ID so the entry is still identifiable.
    const name = rawName.length > 0 ? rawName : id
    // Normalize the icon ID so the glyph lookup is stable.
    const iconId = normalizeMetasetIconId(meta?.iconId ?? DEFAULT_METASET_ICON_ID)
    // Hide "none"/"empty" so we do not render placeholder icons.
    const iconGlyph = iconId === 'none' || iconId === 'empty' ? null : metasetIconOptionById(iconId).glyph
    // Emit the snapshot entry with optional icon payload.
    out.push({
      id,
      name,
      ...(iconGlyph ? { icon: iconGlyph } : {}),
    })
  }
  return out
}
