/**
 * builderSplitterPreference.ts
 *
 * Persists the user's chosen split between the builder-form paper (top) and the
 * chip-list paper (bottom) inside the builder column.
 *
 * Two things distinguish this from the horizontal splitter (state/splitterPreference.ts):
 *
 *  - The ratio is stored PER BUILDER MODE. The recipe form and the safeguard form have very
 *    different natural heights, so a split that suits one reads as badly proportioned in the
 *    other; each mode remembers its own.
 *  - The ratio is NULLABLE, and null is the default. Null means "no drag yet" — the top paper
 *    sits at its natural content height and the chip list takes whatever is left, which is the
 *    layout the builder column had before it was split. Dragging is therefore purely opt-in:
 *    a user who never touches the handle never sees the proportions change.
 *
 * As with the horizontal splitter, a ratio (0.0–1.0) rather than absolute px is stored so the
 * split survives a window resize; App.tsx converts it to px against the measured column height.
 */
import { useCallback } from 'react'

import { BUILDER_SPLITTER_STORAGE_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'
import type { BuilderMode } from './previewBuilderModePreferences'

/** Permitted ratio range — the px clamps are the real guard; this bounds stored garbage. */
const BUILDER_SPLITTER_MIN_RATIO = 0.05
const BUILDER_SPLITTER_MAX_RATIO = 0.95

/** null = never dragged in this mode; the top paper uses its natural content height. */
export type BuilderSplitterRatio = number | null

/** One entry per builder mode; a missing entry is the natural-height default. */
type BuilderSplitterRatios = Partial<Record<BuilderMode, number>>

/** Clamp a candidate ratio into range, or reject it as unusable. */
function clampRatio(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return null
  return Math.max(BUILDER_SPLITTER_MIN_RATIO, Math.min(BUILDER_SPLITTER_MAX_RATIO, n))
}

const store = createLocalStorageStore<BuilderSplitterRatios>({
  key: BUILDER_SPLITTER_STORAGE_KEY,
  fallback: {},
  parse: (raw) => {
    // Missing key / malformed JSON both mean "no stored split" — fall back to natural height.
    if (!raw) return {}
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const source = parsed as Record<string, unknown>
      const next: BuilderSplitterRatios = {}
      // Only read the two known modes; unknown keys are dropped rather than trusted.
      for (const mode of ['recipe', 'safeguard'] as const) {
        const clamped = clampRatio(source[mode])
        if (clamped !== null) next[mode] = clamped
      }
      return next
    } catch {
      return {}
    }
  },
  // An empty map is the default state — remove the key rather than storing "{}".
  serialize: (value) => (Object.keys(value).length === 0 ? null : JSON.stringify(value)),
  // Shallow compare both modes so a no-op write does not notify subscribers.
  equals: (a, b) => a.recipe === b.recipe && a.safeguard === b.safeguard,
})

/**
 * Returns the persisted split ratio for `mode` (null when the user has never dragged in that
 * mode) plus a setter. Passing null to the setter clears the mode's entry, restoring the
 * natural-height default — that is what the handle's double-click reset does.
 */
export function useBuilderSplitterRatio(mode: BuilderMode): [BuilderSplitterRatio, (ratio: BuilderSplitterRatio) => void] {
  const ratios = store.useValue()
  const value = ratios[mode] ?? null
  const set = useCallback((ratio: BuilderSplitterRatio) => {
    store.update((prev) => {
      // null clears this mode's entry; the other mode's split is left untouched.
      if (ratio === null) {
        if (prev[mode] === undefined) return prev
        const next = { ...prev }
        delete next[mode]
        return next
      }
      const clamped = clampRatio(ratio)
      if (clamped === null || prev[mode] === clamped) return prev
      return { ...prev, [mode]: clamped }
    })
  }, [mode])
  return [value, set]
}
