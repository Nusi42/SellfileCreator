/**
 * recentColorsPreference.ts
 *
 * Tracks the last N colors committed via any ColorField so the picker can show
 * them as quick-pick swatches instead of a static preset list.
 */
import { createLocalStorageStore } from './localStorageStore'

/** Maximum number of recent colors retained. */
export const RECENT_COLORS_MAX = 6

const RECENT_COLORS_KEY = 'sellfileCreator.recentColors.v1'

/**
 * Shown on first use (before the user has committed any color) so the swatch
 * row is never empty out of the box. Matches the original static preset palette.
 */
export const RECENT_COLORS_DEFAULT: readonly string[] = [
  '#90CAF9', '#4FC3F7', '#81C784', '#E57373', '#FFB74D', '#CE93D8',
]

/** Accepts #RRGGBB and #RRGGBBAA. */
const isValidHex = (c: unknown): c is string =>
  typeof c === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)

const recentColorsStore = createLocalStorageStore<string[]>({
  key: RECENT_COLORS_KEY,
  fallback: [...RECENT_COLORS_DEFAULT],
  parse: (raw) => {
    // No stored value yet → seed with defaults so the swatch row is visible immediately.
    if (!raw) return [...RECENT_COLORS_DEFAULT]
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return (parsed as unknown[]).filter(isValidHex).slice(0, RECENT_COLORS_MAX)
    } catch {
      return []
    }
  },
  serialize: (value) => JSON.stringify(value),
  // Shallow array equality — avoids re-renders when content is unchanged.
  equals: (a, b) => a.length === b.length && a.every((c, i) => c === b[i]),
})

/** React hook: returns the list of recently-committed colors (most-recent first). */
export const useRecentColors = () => recentColorsStore.useValue()

/**
 * Prepend `hex` to the recent list, deduplicate by lowercase value, and cap at
 * RECENT_COLORS_MAX. Safe to call during React rendering via store.update.
 */
export const addRecentColor = (hex: string): void => {
  if (!isValidHex(hex)) return
  const lower = hex.toLowerCase()
  recentColorsStore.update((prev) =>
    [hex, ...prev.filter((c) => c.toLowerCase() !== lower)].slice(0, RECENT_COLORS_MAX)
  )
}
