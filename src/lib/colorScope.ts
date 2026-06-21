/**
 * colorScope
 *
 * Single source of truth for the per-group colour SCOPE used by stat-name, rarity, and slot
 * colouring. Each group has an independent 3-way scope:
 *
 *  - 'off'        — no colouring for that group.
 *  - 'labels'     — colour the group's words/glyphs in text/label contexts (chips, preview, selects,
 *                   menu items, table cells, tooltips, summaries) but NOT toggle buttons, and NOT
 *                   non-text uses (rarity borders/charts).
 *  - 'everything' — labels PLUS toggle-button text/glyphs PLUS non-text uses (slot-glyph tints in
 *                   builder toggles; rarity borders/charts/frames).
 *
 * Default is 'everything' for all three groups.
 */
export type ColorScope = 'off' | 'labels' | 'everything'

/** Ordered list — also the CycleButton order (Off → Labels → Everything). */
export const COLOR_SCOPES: readonly ColorScope[] = ['off', 'labels', 'everything']

/** Factory default for every group. */
export const DEFAULT_COLOR_SCOPE: ColorScope = 'everything'

/** True when the group should colour TEXT/LABEL contexts (labels or everything). */
export function scopeColorsLabels(scope: ColorScope): boolean {
  return scope !== 'off'
}

/** True when the group should colour BUTTON text/glyphs and non-text uses (everything only). */
export function scopeColorsButtons(scope: ColorScope): boolean {
  return scope === 'everything'
}

/** Parse a persisted/raw value into a ColorScope, falling back to the default. */
export function parseColorScope(raw: string | null): ColorScope {
  return raw === 'off' || raw === 'labels' || raw === 'everything' ? raw : DEFAULT_COLOR_SCOPE
}

/** Serialize a ColorScope for localStorage. */
export function serializeColorScope(scope: ColorScope): string {
  return scope
}
