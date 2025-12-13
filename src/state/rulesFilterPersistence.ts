/**
 * rulesFilterPersistence.ts
 *
 * Shared persistence helpers for the view-only rules filter UI.
 * Every mode (Sellfile vs Rule Tester) keeps an independent snapshot so
 * switching tabs never clobbers the other side’s state.
 */
import { useCallback } from 'react'
import {
  DEFAULT_RULES_FILTER_STATE,
  cloneDefaultRulesFilterState,
  sanitizeRulesFilterState,
  type RulesFilterState,
} from '../lib/rulesFilter'
import { canonicalize } from '../lib/canonicalize'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export const RULES_FILTER_OPEN_STORAGE_KEY = 'sellfileCreator.rulesFilter.open.v2'
export const RULES_FILTER_STATE_STORAGE_KEY = 'sellfileCreator.rulesFilter.state.v3'
export const RULES_FILTER_COLLAPSED_STORAGE_KEY = 'sellfileCreator.rulesFilter.collapse.v3'
const RULES_FILTER_SYNC_STORAGE_KEY = 'sellfileCreator.rulesFilter.sync.v1'

export const RULES_FILTER_PREVIEW_MODES = Object.freeze(['rules', 'tester'] as const)
export type RulesFilterPreviewMode = typeof RULES_FILTER_PREVIEW_MODES[number]

type ModeScoped<T> = Record<RulesFilterPreviewMode, T>

// Filter drawer defaults to closed so the UI stays compact until summoned.
export const RULES_FILTER_OPEN_DEFAULT = false

export const RULES_FILTER_COLLAPSIBLE_SECTION_IDS = Object.freeze([
  'rule',
  'sets',
  'sources',
  'lastUse',
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

const cloneDefaultRulesFilterCollapsedByMode = (): ModeScoped<CollapsedSections> =>
  createModeScopedValue(cloneDefaultRulesFilterCollapsed)

export { cloneDefaultRulesFilterState }

const DEFAULT_RULES_FILTER_STATE_SIGNATURE = JSON.stringify(canonicalize(DEFAULT_RULES_FILTER_STATE))
const rulesFilterStateSignature = (value: RulesFilterState): string => JSON.stringify(canonicalize(value))

const cloneDefaultRulesFilterStateByMode = (): ModeScoped<RulesFilterState> =>
  createModeScopedValue(cloneDefaultRulesFilterState)

const cloneDefaultFilterOpenByMode = (): ModeScoped<boolean> =>
  createModeScopedValue(() => RULES_FILTER_OPEN_DEFAULT)

const booleanMapEquals = (a: ModeScoped<boolean>, b: ModeScoped<boolean>): boolean =>
  RULES_FILTER_PREVIEW_MODES.every((mode) => Boolean(a[mode]) === Boolean(b[mode]))

const modeScopedEquals = <T>(
  equals: (left: T, right: T) => boolean,
) => (left: ModeScoped<T>, right: ModeScoped<T>): boolean =>
  RULES_FILTER_PREVIEW_MODES.every((mode) => equals(left[mode], right[mode]))

function createModeScopedValue<T>(factory: () => T): ModeScoped<T> {
  // Every mode gets its own clone so edits never leak between modes via shared refs.
  const value: Partial<ModeScoped<T>> = {}
  for (const mode of RULES_FILTER_PREVIEW_MODES) {
    value[mode] = factory()
  }
  return value as ModeScoped<T>
}

// LocalStorage entries are user-editable, so sanitize them back into a complete per-mode map.
const parseBooleanMap = (raw: string | null): ModeScoped<boolean> => {
  if (!raw) return cloneDefaultFilterOpenByMode()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return cloneDefaultFilterOpenByMode()
    const next = cloneDefaultFilterOpenByMode()
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const candidate = parsed[mode]
      next[mode] = typeof candidate === 'boolean' ? candidate : RULES_FILTER_OPEN_DEFAULT
    }
    return next
  } catch {
    return cloneDefaultFilterOpenByMode()
  }
}

// Skip writes when both modes match the default so storage stays lean.
const serializeBooleanMap = (value: ModeScoped<boolean>): string | null => {
  try {
    const normalized = cloneDefaultFilterOpenByMode()
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      normalized[mode] = Boolean(value?.[mode])
    }
    const anyEnabled = RULES_FILTER_PREVIEW_MODES.some((mode) => normalized[mode] !== RULES_FILTER_OPEN_DEFAULT)
    return anyEnabled ? JSON.stringify(normalized) : null
  } catch {
    return null
  }
}

const filterOpenStore = createLocalStorageStore<ModeScoped<boolean>>({
  key: RULES_FILTER_OPEN_STORAGE_KEY,
  fallback: cloneDefaultFilterOpenByMode(),
  parse: parseBooleanMap,
  serialize: serializeBooleanMap,
  equals: booleanMapEquals,
})

// Rules filter state can be large; treat malformed payloads as fresh clones so UI never crashes.
const parseRulesFilterStateMap = (raw: string | null): ModeScoped<RulesFilterState> => {
  if (!raw) return cloneDefaultRulesFilterStateByMode()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return cloneDefaultRulesFilterStateByMode()
    const next = cloneDefaultRulesFilterStateByMode()
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      next[mode] = sanitizeRulesFilterState(parsed[mode])
    }
    return next
  } catch {
    return cloneDefaultRulesFilterStateByMode()
  }
}

const serializeRulesFilterStateMap = (value: ModeScoped<RulesFilterState>): string | null => {
  try {
    const normalized = cloneDefaultRulesFilterStateByMode()
    let dirty = false
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      normalized[mode] = sanitizeRulesFilterState(value?.[mode])
      if (!dirty && rulesFilterStateSignature(normalized[mode]) !== DEFAULT_RULES_FILTER_STATE_SIGNATURE) {
        dirty = true
      }
    }
    return dirty ? JSON.stringify(normalized) : null
  } catch {
    return null
  }
}

const filterStateStore = createLocalStorageStore<ModeScoped<RulesFilterState>>({
  key: RULES_FILTER_STATE_STORAGE_KEY,
  fallback: cloneDefaultRulesFilterStateByMode(),
  parse: parseRulesFilterStateMap,
  serialize: serializeRulesFilterStateMap,
})

// Collapsed sections are stored per mode; clamp unknown keys back to the default collapsed map.
const parseCollapsedMap = (raw: string | null): ModeScoped<CollapsedSections> => {
  if (!raw) return cloneDefaultRulesFilterCollapsedByMode()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return cloneDefaultRulesFilterCollapsedByMode()
    const next = cloneDefaultRulesFilterCollapsedByMode()
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const candidate = parsed[mode]
      if (!candidate || typeof candidate !== 'object') continue
      const snapshot = cloneDefaultRulesFilterCollapsed()
      for (const section of RULES_FILTER_COLLAPSIBLE_SECTION_IDS) {
        const value = (candidate as Record<string, unknown>)[section]
        if (typeof value === 'boolean') {
          snapshot[section] = value
        }
      }
      next[mode] = snapshot
    }
    return next
  } catch {
    return cloneDefaultRulesFilterCollapsedByMode()
  }
}

const serializeCollapsedMap = (value: ModeScoped<CollapsedSections>): string | null => {
  try {
    const normalized = cloneDefaultRulesFilterCollapsedByMode()
    let dirty = false
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const snapshot = value?.[mode]
      normalized[mode] = snapshot ? snapshot : cloneDefaultRulesFilterCollapsed()
      if (!dirty && !collapsedEquals(normalized[mode], DEFAULT_COLLAPSED_SECTIONS)) {
        dirty = true
      }
    }
    return dirty ? JSON.stringify(normalized) : null
  } catch {
    return null
  }
}

const filterCollapsedStore = createLocalStorageStore<ModeScoped<CollapsedSections>>({
  key: RULES_FILTER_COLLAPSED_STORAGE_KEY,
  fallback: cloneDefaultRulesFilterCollapsedByMode(),
  parse: parseCollapsedMap,
  serialize: serializeCollapsedMap,
  equals: modeScopedEquals(collapsedEquals),
})

const useFilterOpenMap = createLocalStorageStateHook(filterOpenStore)
const useFilterStateMap = createLocalStorageStateHook(filterStateStore)
const useCollapsedMap = createLocalStorageStateHook(filterCollapsedStore)
const filterSyncStore = createLocalStorageStore<boolean>({
  key: RULES_FILTER_SYNC_STORAGE_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : null),
})
const useFilterSync = createLocalStorageStateHook(filterSyncStore)

type ModePreferenceHookResult<T> = [T, (next: T | ((prev: T) => T)) => void, ModeScoped<T>]

export const useRulesFilterOpenPreference = (mode: RulesFilterPreviewMode): ModePreferenceHookResult<boolean> => {
  const [map, setMap] = useFilterOpenMap()
  const setValue = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setMap((prev) => {
      const previous = prev ?? cloneDefaultFilterOpenByMode()
      const prevValue = previous[mode]
      const nextValue = typeof next === 'function' ? (next as (value: boolean) => boolean)(prevValue) : Boolean(next)
      if (prevValue === nextValue) return previous
      return { ...previous, [mode]: nextValue }
    })
  }, [mode, setMap])
  return [map[mode], setValue, map]
}

export const useRulesFilterStatePreference = (mode: RulesFilterPreviewMode): ModePreferenceHookResult<RulesFilterState> => {
  const [map, setMap] = useFilterStateMap()
  const setValue = useCallback((next: RulesFilterState | ((prev: RulesFilterState) => RulesFilterState)) => {
    setMap((prev) => {
      const previous = prev ?? cloneDefaultRulesFilterStateByMode()
      const prevValue = previous[mode]
      // Why: localStorage sanitization happens at serialization time, but the store keeps
      // an in-memory snapshot too; clamp updates now so the UI never reads partial shapes.
      const nextValueRaw = typeof next === 'function'
        ? (next as (value: RulesFilterState) => RulesFilterState)(prevValue)
        : next
      const nextValue = sanitizeRulesFilterState(nextValueRaw)
      if (prevValue === nextValue) return previous
      return { ...previous, [mode]: nextValue }
    })
  }, [mode, setMap])
  return [map[mode], setValue, map]
}

export const useRulesFilterCollapsedPreference = (mode: RulesFilterPreviewMode): ModePreferenceHookResult<CollapsedSections> => {
  const [map, setMap] = useCollapsedMap()
  const setValue = useCallback((next: CollapsedSections | ((prev: CollapsedSections) => CollapsedSections)) => {
    setMap((prev) => {
      const previous = prev ?? cloneDefaultRulesFilterCollapsedByMode()
      const prevValue = previous[mode]
      const nextValue = typeof next === 'function' ? (next as (value: CollapsedSections) => CollapsedSections)(prevValue) : next
      if (collapsedEquals(prevValue, nextValue)) return previous
      return { ...previous, [mode]: nextValue }
    })
  }, [mode, setMap])
  return [map[mode], setValue, map]
}

export function resetRulesFilterPreferences() {
  filterOpenStore.set(cloneDefaultFilterOpenByMode())
  filterStateStore.set(cloneDefaultRulesFilterStateByMode())
  filterCollapsedStore.set(cloneDefaultRulesFilterCollapsedByMode())
}

// Imperative helpers allow restores/autosave to write individual modes without juggling hooks.
export function setRulesFilterOpenForMode(mode: RulesFilterPreviewMode, value: boolean) {
  filterOpenStore.update((prev) => {
    const previous = prev ?? cloneDefaultFilterOpenByMode()
    if (previous[mode] === value) return previous
    return { ...previous, [mode]: value }
  })
}

export function setRulesFilterStateForMode(mode: RulesFilterPreviewMode, value: RulesFilterState) {
  // Why: imperative callers (autosave restore, preset apply) can receive stale or partially-written
  // payloads; sanitize before publishing to the shared store to keep consumers crash-free.
  const sanitized = sanitizeRulesFilterState(value)
  filterStateStore.update((prev) => {
    const previous = prev ?? cloneDefaultRulesFilterStateByMode()
    if (previous[mode] === sanitized) return previous
    return { ...previous, [mode]: sanitized }
  })
}

export function setRulesFilterCollapsedForMode(mode: RulesFilterPreviewMode, value: CollapsedSections) {
  filterCollapsedStore.update((prev) => {
    const previous = prev ?? cloneDefaultRulesFilterCollapsedByMode()
    if (collapsedEquals(previous[mode], value)) return previous
    return { ...previous, [mode]: value }
  })
}

export const useRulesFilterSyncPreference = (): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] => {
  return useFilterSync()
}

export function setRulesFilterSyncPreference(sync: boolean) {
  filterSyncStore.set(Boolean(sync))
}
