/**
 * splitterPreference.ts
 *
 * Persists the user's chosen left-panel width for the side-by-side splitter.
 * Uses the shared createLocalStorageStore pattern so React reads are reactive
 * and the value survives page reloads.
 */
import { useCallback } from 'react'

import { PANEL_WIDTH_PX } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

/** Minimum width (px) for either panel — prevents collapsing a side entirely. */
const SPLITTER_MIN_WIDTH_PX = 320
/** Maximum left-panel width. Right panel gets at least SPLITTER_MIN_WIDTH_PX. */
const SPLITTER_MAX_WIDTH_PX = 2304 - SPLITTER_MIN_WIDTH_PX // totalUsable - minRight

const store = createLocalStorageStore<number>({
  key: 'side-by-side-splitter-left-px',
  fallback: PANEL_WIDTH_PX,
  parse: (raw) => {
    // Clamp to valid range; fall back to default on missing / non-numeric values.
    const n = parseFloat(raw ?? '')
    if (!Number.isFinite(n)) return PANEL_WIDTH_PX
    return Math.max(SPLITTER_MIN_WIDTH_PX, Math.min(SPLITTER_MAX_WIDTH_PX, Math.round(n)))
  },
  serialize: (value) => String(Math.round(value)),
})

export { SPLITTER_MIN_WIDTH_PX, SPLITTER_MAX_WIDTH_PX }

/**
 * Returns the persisted left-panel width (px) and a setter that clamps + persists the value.
 * Call from App.tsx (or wherever the grid lives) in side-by-side mode.
 */
export function useSplitterLeftWidthPx(): [number, (px: number) => void] {
  const value = store.useValue()
  const set = useCallback((px: number) => {
    // Clamp before persisting so the stored value is always valid.
    const clamped = Math.max(SPLITTER_MIN_WIDTH_PX, Math.min(SPLITTER_MAX_WIDTH_PX, Math.round(px)))
    store.set(clamped)
  }, [])
  return [value, set]
}
