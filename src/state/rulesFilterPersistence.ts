/**
 * rulesFilterPersistence.ts
 *
 * Shared persistence helpers for the view-only rules filter UI.
 */
import { DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../lib/rulesFilter'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FILTER_OPEN_KEY = 'sellfileCreator.rulesFilter.open.v1'
const FILTER_STATE_KEY = 'sellfileCreator.rulesFilter.state.v1'
const FILTER_COLLAPSED_KEY = 'sellfileCreator.rulesFilter.collapse.v2'

export const RULES_FILTER_COLLAPSIBLE_SECTION_IDS = Object.freeze([
  'rule',
  'sets',
  'sources',
  'champions',
  'main',
  'sub',
  'level',
  'slots',
  'rank',
  'rarity',
  'faction',
  'ascension',
] as const)

type CollapsibleSectionId = typeof RULES_FILTER_COLLAPSIBLE_SECTION_IDS[number]
export type CollapsedSections = Record<CollapsibleSectionId, boolean>

const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = Object.freeze(
  Object.fromEntries(
    RULES_FILTER_COLLAPSIBLE_SECTION_IDS.map((key) => [key, true]),
  ) as CollapsedSections,
)

export const cloneDefaultRulesFilterCollapsed = (): CollapsedSections => ({ ...DEFAULT_COLLAPSED_SECTIONS })

const collapsedEquals = (a: CollapsedSections, b: CollapsedSections): boolean =>
  RULES_FILTER_COLLAPSIBLE_SECTION_IDS.every((key) => Boolean(a[key]) === Boolean(b[key]))

export const cloneDefaultRulesFilterState = (): RulesFilterState =>
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
  fallback: cloneDefaultRulesFilterCollapsed(),
  parse: (raw) => {
    if (!raw) return cloneDefaultRulesFilterCollapsed()
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return cloneDefaultRulesFilterCollapsed()
      const next = cloneDefaultRulesFilterCollapsed()
      for (const key of RULES_FILTER_COLLAPSIBLE_SECTION_IDS) {
        const value = parsed[key]
        if (typeof value === 'boolean') {
          next[key] = value
        }
      }
      return next
    } catch {}
    return cloneDefaultRulesFilterCollapsed()
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

export function resetRulesFilterPreferences() {
  filterOpenStore.set(false)
  filterStateStore.set(cloneDefaultRulesFilterState())
  filterCollapsedStore.set(cloneDefaultRulesFilterCollapsed())
}
