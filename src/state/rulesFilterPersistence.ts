/**
 * rulesFilterPersistence.ts
 *
 * Shared persistence helpers for the view-only rules filter UI.
 */
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../lib/rulesFilter'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FILTER_OPEN_KEY = 'sellfileCreator.rulesFilter.open.v1'
const FILTER_STATE_KEY = 'sellfileCreator.rulesFilter.state.v1'
const FILTER_COLLAPSED_KEY = 'sellfileCreator.rulesFilter.collapse.v1'

type CollapsedSections = Record<string, boolean>

const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = {
  rule: false,
  sets: false,
  main: false,
  sub: false,
  level: false,
  slots: false,
  rank: false,
  rarity: false,
  faction: false,
}

const cloneDefaultCollapsed = (): CollapsedSections => ({ ...DEFAULT_COLLAPSED_SECTIONS })

const collapsedEquals = (a: CollapsedSections, b: CollapsedSections): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (Boolean(a[key]) !== Boolean(b[key])) return false
  }
  return true
}

const cloneDefaultRulesFilterState = (): RulesFilterState =>
  JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState

const filterOpenStore = createLocalStorageStore<boolean>({
  key: FILTER_OPEN_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => String(value),
})

const filterStateStore = createLocalStorageStore<RulesFilterState>({
  key: FILTER_STATE_KEY,
  fallback: cloneDefaultRulesFilterState(),
  parse: (raw) => {
    if (!raw) return cloneDefaultRulesFilterState()
    try {
      const parsed = JSON.parse(raw) as RulesFilterState
      if (parsed && typeof parsed === 'object') return parsed
    } catch {}
    return cloneDefaultRulesFilterState()
  },
  serialize: (value) => {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  },
})

const filterCollapsedStore = createLocalStorageStore<CollapsedSections>({
  key: FILTER_COLLAPSED_KEY,
  fallback: cloneDefaultCollapsed(),
  parse: (raw) => {
    if (!raw) return cloneDefaultCollapsed()
    try {
      const parsed = JSON.parse(raw) as CollapsedSections
      if (parsed && typeof parsed === 'object') {
        return { ...cloneDefaultCollapsed(), ...parsed }
      }
    } catch {}
    return cloneDefaultCollapsed()
  },
  serialize: (value) => {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  },
  equals: collapsedEquals,
})

export const useRulesFilterOpenPreference = createLocalStorageStateHook(filterOpenStore)
export const useRulesFilterStatePreference = createLocalStorageStateHook(filterStateStore)
export const useRulesFilterCollapsedPreference = createLocalStorageStateHook(filterCollapsedStore)
