/**
 * splitterPreference.ts
 *
 * Persists the user's chosen split ratio for the side-by-side splitter.
 * Storing a ratio (0.0–1.0) rather than absolute px means the panels scale
 * correctly when the browser window is resized — the actual left/right px
 * values are derived in App.tsx from the measured container width at runtime.
 * Uses the shared createLocalStorageStore pattern so React reads are reactive
 * and the value survives page reloads.
 */
import { useCallback } from 'react'

import { createLocalStorageStore } from './localStorageStore'

/** Minimum width (px) for either panel — prevents collapsing a side entirely. */
export const SPLITTER_MIN_WIDTH_PX = 320

/** Default 50/50 ratio. */
const SPLITTER_DEFAULT_RATIO = 0.5

/** Permitted ratio range — ensures both panels always have some minimum usable space. */
const SPLITTER_MIN_RATIO = 0.1
const SPLITTER_MAX_RATIO = 0.9

const store = createLocalStorageStore<number>({
  key: 'sellfileCreator.layout.splitterRatio.v1',
  fallback: SPLITTER_DEFAULT_RATIO,
  parse: (raw) => {
    // Clamp to valid range; fall back to default on missing / non-numeric values.
    const n = parseFloat(raw ?? '')
    if (!Number.isFinite(n)) return SPLITTER_DEFAULT_RATIO
    return Math.max(SPLITTER_MIN_RATIO, Math.min(SPLITTER_MAX_RATIO, n))
  },
  serialize: (value) => String(value),
})

/**
 * Returns the persisted split ratio (0.0–1.0) and a setter that clamps + persists it.
 * App.tsx multiplies the ratio by the measured container usable width to get absolute px.
 */
export function useSplitterRatio(): [number, (ratio: number) => void] {
  const value = store.useValue()
  const set = useCallback((ratio: number) => {
    const clamped = Math.max(SPLITTER_MIN_RATIO, Math.min(SPLITTER_MAX_RATIO, ratio))
    store.set(clamped)
  }, [])
  return [value, set]
}
