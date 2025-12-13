/**
 * testerSubstatSortPreferences.ts
 *
 * Persists the Rule Tester "substat sort" UI state (priorities + toggles).
 * This is intentionally UI-only: it changes preview ordering but never affects exports.
 */
import { useCallback } from 'react'
import { type TesterSubstatSortDirection } from '../lib/testerSort'
import { StatVariant, STAT_VARIANTS_PRIORITY } from '../lib/types'
import { TESTER_SUBSTAT_SORT_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type TesterSubstatSortState = {
  // Priority list: earlier entries win; missing stats are treated as 0.
  priorities: StatVariant[]
  direction: TesterSubstatSortDirection
  // Keep the existing accordion sections; disabling merges artifact sets and accessory sets per faction.
  keepSections: boolean
  // Exclude glyph values by default so "base" rolls remain comparable.
  excludeGlyphs: boolean
}

export const DEFAULT_TESTER_SUBSTAT_SORT_STATE: TesterSubstatSortState = Object.freeze({
  priorities: [],
  direction: 'desc',
  keepSections: true,
  excludeGlyphs: true,
})

// Guardrail: only allow known, UI-visible variants into the persisted priority list.
// Why: prevents old/invalid localStorage values from leaking into sorting logic.
const STAT_VARIANT_SET = new Set<number>(STAT_VARIANTS_PRIORITY.map((variant) => Number(variant)))

const normalizePriorities = (raw: unknown): StatVariant[] => {
  // Persisted priorities are user-driven, so treat anything non-array as "no priorities".
  if (!Array.isArray(raw)) return []
  // Avoid duplicates so priority numbers stay compact and deterministic.
  const seen = new Set<number>()
  const normalized: StatVariant[] = []
  raw.forEach((value) => {
    const num = Number(value)
    // Missing/garbage inputs should never break hydration; drop them silently.
    if (!Number.isFinite(num)) return
    // Unknown variants are ignored so the UI doesn't render phantom badges.
    if (!STAT_VARIANT_SET.has(num)) return
    if (seen.has(num)) return
    seen.add(num)
    normalized.push(num as StatVariant)
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
      const priorities = normalizePriorities(obj.priorities)
      return { priorities, direction, keepSections, excludeGlyphs }
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

  const togglePriority = useCallback((variant: StatVariant) => {
    // Clicking a stat appends it as the next priority; clicking again removes it and compacts ranks.
    testerSubstatSortStore.update((prev) => {
      const already = prev.priorities.some((v) => Number(v) === Number(variant))
      if (!already) return { ...prev, priorities: [...prev.priorities, variant] }
      return { ...prev, priorities: prev.priorities.filter((v) => Number(v) !== Number(variant)) }
    })
  }, [])

  return {
    state,
    clear,
    setDirection,
    toggleKeepSections,
    toggleExcludeGlyphs,
    togglePriority,
  }
}
