/**
 * colorScope
 *
 * Single source of truth for the per-group colour SCOPE used by stat-name, rarity, and slot
 * colouring. Each group has an independent 4-way scope that cycles
 * off → controls → text → everything → off:
 *
 *  - 'off'        — no colouring for that group.
 *  - 'controls'   — only interactive CONTROLS: toggle buttons, selects/dropdowns/menus, and the
 *                   closed-select display of the current value.
 *  - 'text'       — only the non-control DISPLAY text: chips, preview, table cells, tooltips,
 *                   summaries, history timeline, and the non-text accents (rarity borders/charts).
 *  - 'everything' — controls AND text.
 *
 * `controls` and `text` are disjoint; `everything` is the union. Default is 'everything'.
 *
 * Each render site is tagged CONTROL or TEXT, and colours when its tag is covered by the scope:
 *  - control site → colours at 'controls' or 'everything'  (scopeColorsControls)
 *  - text site    → colours at 'text' or 'everything'      (scopeColorsText)
 */
export type ColorScope = 'off' | 'controls' | 'text' | 'everything'

/** Ordered list — also the CycleButton order (off → controls → text → everything). */
export const COLOR_SCOPES: readonly ColorScope[] = ['off', 'controls', 'text', 'everything']

/** Factory default for every group. */
export const DEFAULT_COLOR_SCOPE: ColorScope = 'everything'

/** True when the group colours CONTROL sites (buttons / selects / closed-select displays). */
export function scopeColorsControls(scope: ColorScope): boolean {
  return scope === 'controls' || scope === 'everything'
}

/** True when the group colours TEXT sites (chips / cells / tooltips / summaries / accents). */
export function scopeColorsText(scope: ColorScope): boolean {
  return scope === 'text' || scope === 'everything'
}

/** True when the group colours anything at all (used by the master toggle's "any on" check). */
export function scopeColorsAnything(scope: ColorScope): boolean {
  return scope !== 'off'
}

/** Parse a persisted/raw value into a ColorScope, falling back to the default. */
export function parseColorScope(raw: string | null): ColorScope {
  return raw === 'off' || raw === 'controls' || raw === 'text' || raw === 'everything' ? raw : DEFAULT_COLOR_SCOPE
}

/** Serialize a ColorScope for localStorage. */
export function serializeColorScope(scope: ColorScope): string {
  return scope
}
