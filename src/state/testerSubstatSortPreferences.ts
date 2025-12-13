/**
 * testerSubstatSortPreferences.ts
 *
 * Persists the Rule Tester "substat sort" UI state (priorities + toggles).
 * This is intentionally UI-only: it changes preview ordering but never affects exports.
 */
import { useCallback } from 'react'
import { TESTER_SORT_KEY_LAST_USAGE, type TesterSortKey, type TesterSubstatSortDirection } from '../lib/testerSort'
import { STAT_VARIANTS_PRIORITY } from '../lib/types'
import { TESTER_SUBSTAT_SORT_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type TesterSubstatSortState = {
  // Priority list: earlier entries win; missing stats are treated as 0.
  priorities: TesterSortKey[]
  direction: TesterSubstatSortDirection
  // Per-key override list: included keys sort opposite of the global direction.
  flipped: TesterSortKey[]
  // Keep the existing accordion sections; disabling merges artifact sets and accessory sets per faction.
  keepSections: boolean
  // Exclude glyph values by default so "base" rolls remain comparable.
  excludeGlyphs: boolean
}

export const DEFAULT_TESTER_SUBSTAT_SORT_STATE: TesterSubstatSortState = Object.freeze({
  priorities: [],
  direction: 'desc',
  flipped: [],
  keepSections: true,
  excludeGlyphs: true,
})

// Guardrail: only allow known, UI-visible sort keys into the persisted lists.
// Why: prevents old/invalid localStorage values from leaking into sorting logic.
const SORT_KEY_SET = new Set<number>([
  ...STAT_VARIANTS_PRIORITY.map((variant) => Number(variant)),
  TESTER_SORT_KEY_LAST_USAGE,
])

const normalizeSortKeys = (raw: unknown): TesterSortKey[] => {
  // Persisted priorities are user-driven, so treat anything non-array as "no priorities".
  if (!Array.isArray(raw)) return []
  // Avoid duplicates so priority numbers stay compact and deterministic.
  const seen = new Set<number>()
  const normalized: TesterSortKey[] = []
  raw.forEach((value) => {
    const num = Number(value)
    // Missing/garbage inputs should never break hydration; drop them silently.
    if (!Number.isFinite(num)) return
    // Unknown variants are ignored so the UI doesn't render phantom badges.
    if (!SORT_KEY_SET.has(num)) return
    if (seen.has(num)) return
    seen.add(num)
    normalized.push(num as TesterSortKey)
  })
  return normalized
}

const testerSubstatSortStore = createLocalStorageStore<TesterSubstatSortState>({
  key: TESTER_SUBSTAT_SORT_KEY,
  // Factory defaults keep sections, exclude glyphs, and apply a descending sort once priorities are chosen.
  fallback: DEFAULT_TESTER_SUBSTAT_SORT_STATE,
  parse: (raw) => {
    // Empty storage is the common case for first run; keep the fast path obvious.
    if (!raw) return DEFAULT_TESTER_SUBSTAT_SORT_STATE
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return DEFAULT_TESTER_SUBSTAT_SORT_STATE
      const obj = parsed as Record<string, unknown>
      // Defensive normalization keeps preferences stable across future format tweaks.
      const direction: TesterSubstatSortDirection = obj.direction === 'asc' ? 'asc' : 'desc'
      const keepSections = obj.keepSections === false ? false : true
      const excludeGlyphs = obj.excludeGlyphs === false ? false : true
      const priorities = normalizeSortKeys(obj.priorities)
      // Flipped keys are only meaningful for keys that are currently selected as priorities.
      const flipped = normalizeSortKeys(obj.flipped).filter((key) => priorities.some((v) => Number(v) === Number(key)))
      return { priorities, direction, flipped, keepSections, excludeGlyphs }
    } catch {
      return DEFAULT_TESTER_SUBSTAT_SORT_STATE
    }
  },
  // JSON keeps the schema flexible while still being human-debuggable in devtools.
  serialize: (value) => JSON.stringify(value),
})

export function useTesterSubstatSortPreferences() {
  // Store read: subscribed so the preview header + grid stay in sync without extra effects.
  const state = testerSubstatSortStore.useValue()

  const clear = useCallback(() => {
    // "Clear" is the popover's [default] action: remove priorities and restore all toggles.
    testerSubstatSortStore.set(DEFAULT_TESTER_SUBSTAT_SORT_STATE)
  }, [])

  const setDirection = useCallback((direction: TesterSubstatSortDirection) => {
    // Direction is normalized so callers can pass any string without risking invalid state.
    testerSubstatSortStore.update((prev) => ({ ...prev, direction: direction === 'asc' ? 'asc' : 'desc' }))
  }, [])

  const toggleKeepSections = useCallback(() => {
    // Keep-sections controls grouping only; sorting logic remains the same.
    testerSubstatSortStore.update((prev) => ({ ...prev, keepSections: !prev.keepSections }))
  }, [])

  const toggleExcludeGlyphs = useCallback(() => {
    // Glyph toggle affects which stat value is used: base-only vs base+glyph.
    testerSubstatSortStore.update((prev) => ({ ...prev, excludeGlyphs: !prev.excludeGlyphs }))
  }, [])

  const togglePriorityKey = useCallback((key: TesterSortKey) => {
    // Generalized toggle used by the sort popover for both stat variants and synthetic keys.
    testerSubstatSortStore.update((prev) => {
      const already = prev.priorities.some((v) => Number(v) === Number(key))
      if (!already) return { ...prev, priorities: [...prev.priorities, key] }
      const priorities = prev.priorities.filter((v) => Number(v) !== Number(key))
      const flipped = prev.flipped.filter((v) => Number(v) !== Number(key))
      return { ...prev, priorities, flipped }
    })
  }, [])

  const toggleFlipped = useCallback((key: TesterSortKey) => {
    // "Flipped" means "opposite of the global direction" so the UI can show two simple glyph buttons.
    testerSubstatSortStore.update((prev) => {
      const selected = prev.priorities.some((v) => Number(v) === Number(key))
      if (!selected) return prev
      const already = prev.flipped.some((v) => Number(v) === Number(key))
      if (!already) return { ...prev, flipped: [...prev.flipped, key] }
      return { ...prev, flipped: prev.flipped.filter((v) => Number(v) !== Number(key)) }
    })
  }, [])

  return {
    state,
    clear,
    setDirection,
    toggleKeepSections,
    toggleExcludeGlyphs,
    togglePriorityKey,
    toggleFlipped,
  }
}
