/**
 * preferencesState.tsx
 *
 * Centralizes preview/display preferences so every surface reads the same
 * values. Each persisted preference is backed by a createLocalStorageStore so
 * factory defaults are never written to localStorage (the store deletes the key
 * when the value equals the fallback). The SSOT for each default is the fallback
 * field of its store — TypeScript enforces that new stores must declare one.
 */
import React, { createContext, use, useMemo, useState } from 'react'
import {
  AUTO_SIDE_BY_SIDE_MIN_ZOOM,
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_KEY,
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MAX,
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MIN,
  AUTO_SIDE_BY_SIDE_ZOOM_ENABLED_KEY,
  RULES_TABLE_SHOW_FACTION_ICONS_KEY,
  RULES_TABLE_SHOW_SET_ICONS_KEY,
  RULES_TABLE_SHOW_SLOT_ICONS_KEY,
  COLOR_SCOPE_STAT_KEY,
  COLOR_SCOPE_RARITY_KEY,
  COLOR_SCOPE_SLOT_KEY,
} from '../lib/constants'
import {
  type ColorScope,
  DEFAULT_STAT_COLOR_SCOPE,
  DEFAULT_RARITY_COLOR_SCOPE,
  DEFAULT_SLOT_COLOR_SCOPE,
  parseColorScope,
  serializeColorScope,
} from '../lib/colorScope'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type DisplayPreferencesState = {
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  // Per-group colour scopes (off / labels / everything). Each gates one colouring group; the
  // theme-menu master toggle flips all three between off and everything.
  statColorScope: ColorScope
  rarityColorScope: ColorScope
  slotColorScope: ColorScope
  // Auto side-by-side zoom: master switch + the force/stack cutoff (theme flyout).
  autoSideBySideZoomEnabled: boolean
  autoSideBySideMinZoom: number
  // Transient session flag — not persisted to localStorage, resets on page reload.
  psychedelic: boolean
}

export type DisplayPreferenceDispatchers = {
  setShowSlotIcons: (next: boolean) => void
  setShowSetIcons: (next: boolean) => void
  setShowFactionIcons: (next: boolean) => void
  setStatColorScope: (next: ColorScope) => void
  setRarityColorScope: (next: ColorScope) => void
  setSlotColorScope: (next: ColorScope) => void
  setAutoSideBySideZoomEnabled: (next: boolean) => void
  setAutoSideBySideMinZoom: (next: number) => void
  setPsychedelic: (next: boolean) => void
}

// Shared boolean parse/serialize helpers for the boolean preference stores below.
const parseBooleanPref = (fallback: boolean) => (raw: string | null): boolean => {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
const serializeBooleanPref = (value: boolean): string => String(value)

// Numeric preference parse/serialize, clamped to [min,max] so a corrupt/out-of-range stored value
// degrades to the fallback rather than feeding a nonsensical zoom into the layout.
const parseClampedNumberPref =
  (fallback: number, min: number, max: number) =>
  (raw: string | null): number => {
    if (raw === null) return fallback
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback
    return parsed
  }
const serializeNumberPref = (value: number): string => String(value)

const showSlotIconsStore = createLocalStorageStore<boolean>({
  key: RULES_TABLE_SHOW_SLOT_ICONS_KEY,
  fallback: true,
  parse: parseBooleanPref(true),
  serialize: serializeBooleanPref,
})

const showSetIconsStore = createLocalStorageStore<boolean>({
  key: RULES_TABLE_SHOW_SET_ICONS_KEY,
  fallback: true,
  parse: parseBooleanPref(true),
  serialize: serializeBooleanPref,
})

const showFactionIconsStore = createLocalStorageStore<boolean>({
  key: RULES_TABLE_SHOW_FACTION_ICONS_KEY,
  fallback: true,
  parse: parseBooleanPref(true),
  serialize: serializeBooleanPref,
})

// One store per colour group. Defaults reproduce v1.0.26's effective look: stats coloured in TEXT
// only, slot tints everywhere (incl. builder toggles), rarity off until the user opts in.
const statColorScopeStore = createLocalStorageStore<ColorScope>({
  key: COLOR_SCOPE_STAT_KEY,
  fallback: DEFAULT_STAT_COLOR_SCOPE,
  parse: (raw) => parseColorScope(raw, DEFAULT_STAT_COLOR_SCOPE),
  serialize: serializeColorScope,
})
const rarityColorScopeStore = createLocalStorageStore<ColorScope>({
  key: COLOR_SCOPE_RARITY_KEY,
  fallback: DEFAULT_RARITY_COLOR_SCOPE,
  parse: (raw) => parseColorScope(raw, DEFAULT_RARITY_COLOR_SCOPE),
  serialize: serializeColorScope,
})
const slotColorScopeStore = createLocalStorageStore<ColorScope>({
  key: COLOR_SCOPE_SLOT_KEY,
  fallback: DEFAULT_SLOT_COLOR_SCOPE,
  parse: (raw) => parseColorScope(raw, DEFAULT_SLOT_COLOR_SCOPE),
  serialize: serializeColorScope,
})

const autoSideBySideZoomEnabledStore = createLocalStorageStore<boolean>({
  key: AUTO_SIDE_BY_SIDE_ZOOM_ENABLED_KEY,
  fallback: true,
  parse: parseBooleanPref(true),
  serialize: serializeBooleanPref,
})

const autoSideBySideMinZoomStore = createLocalStorageStore<number>({
  key: AUTO_SIDE_BY_SIDE_MIN_ZOOM_KEY,
  fallback: AUTO_SIDE_BY_SIDE_MIN_ZOOM,
  parse: parseClampedNumberPref(
    AUTO_SIDE_BY_SIDE_MIN_ZOOM,
    AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MIN,
    AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MAX,
  ),
  serialize: serializeNumberPref,
})

// Convenience hooks following the project's createLocalStorageStateHook pattern.
export const useShowSlotIconsPreference = createLocalStorageStateHook(showSlotIconsStore)
export const useShowSetIconsPreference = createLocalStorageStateHook(showSetIconsStore)
export const useShowFactionIconsPreference = createLocalStorageStateHook(showFactionIconsStore)
export const useStatColorScopePreference = createLocalStorageStateHook(statColorScopeStore)
export const useRarityColorScopePreference = createLocalStorageStateHook(rarityColorScopeStore)
export const useSlotColorScopePreference = createLocalStorageStateHook(slotColorScopeStore)
export const useAutoSideBySideZoomEnabledPreference = createLocalStorageStateHook(autoSideBySideZoomEnabledStore)
export const useAutoSideBySideMinZoomPreference = createLocalStorageStateHook(autoSideBySideMinZoomStore)

const PreferencesStateContext = createContext<DisplayPreferencesState | null>(null)
const PreferencesDispatchContext = createContext<DisplayPreferenceDispatchers | null>(null)

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  // Each store drives its own subscription via useSyncExternalStore. The individual
  // values are memoized into a single prefs object so context consumers only re-render
  // when a value they care about actually changes.
  const showSlotIcons = showSlotIconsStore.useValue()
  const showSetIcons = showSetIconsStore.useValue()
  const showFactionIcons = showFactionIconsStore.useValue()
  const statColorScope = statColorScopeStore.useValue()
  const rarityColorScope = rarityColorScopeStore.useValue()
  const slotColorScope = slotColorScopeStore.useValue()
  const autoSideBySideZoomEnabled = autoSideBySideZoomEnabledStore.useValue()
  const autoSideBySideMinZoom = autoSideBySideMinZoomStore.useValue()
  const [psychedelic, setPsychedelic] = useState(false)

  const prefs = useMemo<DisplayPreferencesState>(
    () => ({ showSlotIcons, showSetIcons, showFactionIcons, statColorScope, rarityColorScope, slotColorScope, autoSideBySideZoomEnabled, autoSideBySideMinZoom, psychedelic }),
    [showSlotIcons, showSetIcons, showFactionIcons, statColorScope, rarityColorScope, slotColorScope, autoSideBySideZoomEnabled, autoSideBySideMinZoom, psychedelic],
  )

  const actions = useMemo<DisplayPreferenceDispatchers>(() => ({
    setShowSlotIcons: (next) => { showSlotIconsStore.set(next) },
    setShowSetIcons: (next) => { showSetIconsStore.set(next) },
    setShowFactionIcons: (next) => { showFactionIconsStore.set(next) },
    setStatColorScope: (next) => { statColorScopeStore.set(next) },
    setRarityColorScope: (next) => { rarityColorScopeStore.set(next) },
    setSlotColorScope: (next) => { slotColorScopeStore.set(next) },
    setAutoSideBySideZoomEnabled: (next) => { autoSideBySideZoomEnabledStore.set(next) },
    setAutoSideBySideMinZoom: (next) => { autoSideBySideMinZoomStore.set(next) },
    setPsychedelic: (next) => { setPsychedelic((prev) => prev === next ? prev : next) },
  }), [])

  return (
    <PreferencesStateContext value={prefs}>
      <PreferencesDispatchContext value={actions}>
        {children}
      </PreferencesDispatchContext>
    </PreferencesStateContext>
  )
}

export function useDisplayPreferences(): DisplayPreferencesState {
  const ctx = use(PreferencesStateContext)
  if (!ctx) throw new Error('useDisplayPreferences must be used within DisplayPreferencesProvider')
  return ctx
}

export function useDisplayPreferenceActions(): DisplayPreferenceDispatchers {
  const ctx = use(PreferencesDispatchContext)
  if (!ctx) throw new Error('useDisplayPreferenceActions must be used within DisplayPreferencesProvider')
  return ctx
}

export function useDisplayPreferencesContext(): [DisplayPreferencesState, DisplayPreferenceDispatchers] {
  return [useDisplayPreferences(), useDisplayPreferenceActions()]
}
