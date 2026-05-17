/**
 * Display appearance for a named item (recipe or safeguard rule).
 * Bundles name and optional foreground color so callers cannot pass one without the other.
 */
import { parseRecipeNameDirectives } from './recipeNameDirectives'

export type NameAppearance = {
  /** Display name shown in chips, builders, and gear-inspector panels. */
  name: string
  /** Optional foreground hex color, e.g. "#FF5733". Absent means inherit from theme. */
  fgColor?: string
}

// Build a clean NameAppearance from raw name/color strings; returns undefined when both are empty.
const buildAppearance = (rawName: string, fgColor: string | undefined): NameAppearance | undefined => {
  // Trim defensively so callers can hand us either pre-trimmed or raw input.
  const name = (rawName ?? '').trim()
  const color = fgColor && fgColor.trim() ? fgColor.trim() : undefined
  if (!name && !color) return undefined
  return color ? { name, fgColor: color } : { name }
}

/**
 * Read an appearance record from an SFC entry, supporting both the current nested form
 * and the legacy flat form. SSOT for recipe + safeguard read paths.
 *
 * Resolution order:
 *  - Nested: `record.appearance = { name, fgColor? }` — trusted as-is (no directive parsing).
 *  - Legacy flat: `record.name` (with optional `[#RRGGBB]` directive) + `record.fgcolor`.
 *
 * The legacy `[#RRGGBB]` directive parsing only runs on the flat form; the nested form
 * is treated as authoritative and its `name` is preserved verbatim.
 */
export const readAppearanceFromRecord = (record: Record<string, unknown>): NameAppearance | undefined => {
  // Nested form wins when present: trust the saved structure and skip directive parsing.
  const nested = record['appearance']
  if (nested && typeof nested === 'object') {
    const obj = nested as Record<string, unknown>
    const name = typeof obj['name'] === 'string' ? (obj['name'] as string) : ''
    const fgColor = typeof obj['fgColor'] === 'string' && obj['fgColor'] ? (obj['fgColor'] as string) : undefined
    return buildAppearance(name, fgColor)
  }
  // Legacy flat form: name lives at top level; fgcolor may be flat or embedded in name as [#RRGGBB].
  let rawName = typeof record['name'] === 'string' ? (record['name'] as string) : ''
  let fgColor = typeof record['fgcolor'] === 'string' && record['fgcolor'] ? (record['fgcolor'] as string) : undefined
  if (!fgColor) {
    // Migrate inline color directive only when no explicit fgcolor field was provided.
    const legacy = parseRecipeNameDirectives(rawName, '')
    if (legacy.hasExplicitColor) { fgColor = legacy.resolvedColor; rawName = legacy.displayName }
  }
  return buildAppearance(rawName, fgColor)
}

/**
 * Build the partial SFC record fragment that persists an appearance.
 * Spread this FIRST in the enclosing record literal so `appearance` becomes the leading
 * key in serialized output for both recipes and safeguard rules.
 *
 * Returns an empty object when the appearance has no usable name/color, so the spread
 * cleanly omits the field rather than emitting an empty placeholder.
 */
export const appearancePersistField = (
  appearance: NameAppearance | undefined,
): { appearance: NameAppearance } | Record<string, never> => {
  // Re-normalize on the way out so blank names + missing colors collapse to "omit".
  const cleaned = buildAppearance(appearance?.name ?? '', appearance?.fgColor)
  return cleaned ? { appearance: cleaned } : {}
}
