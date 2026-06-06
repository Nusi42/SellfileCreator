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
import { RULES_TABLE_SHOW_FACTION_ICONS_KEY, RULES_TABLE_SHOW_SET_ICONS_KEY, RULES_TABLE_SHOW_SLOT_ICONS_KEY, STAT_BUTTON_BORDERS_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type DisplayPreferencesState = {
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  statButtonBorders: boolean
  // Transient session flag — not persisted to localStorage, resets on page reload.
  psychedelic: boolean
}

export type DisplayPreferenceDispatchers = {
  setShowSlotIcons: (next: boolean) => void
  setShowSetIcons: (next: boolean) => void
  setShowFactionIcons: (next: boolean) => void
  setStatButtonBorders: (next: boolean) => void
  setPsychedelic: (next: boolean) => void
}

// Shared boolean parse/serialize helpers for all four preference stores below.
const parseBooleanPref = (fallback: boolean) => (raw: string | null): boolean => {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
const serializeBooleanPref = (value: boolean): string => String(value)

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

const statButtonBordersStore = createLocalStorageStore<boolean>({
  key: STAT_BUTTON_BORDERS_KEY,
  fallback: true,
  parse: parseBooleanPref(true),
  serialize: serializeBooleanPref,
})

// Convenience hooks following the project's createLocalStorageStateHook pattern.
export const useShowSlotIconsPreference = createLocalStorageStateHook(showSlotIconsStore)
export const useShowSetIconsPreference = createLocalStorageStateHook(showSetIconsStore)
export const useShowFactionIconsPreference = createLocalStorageStateHook(showFactionIconsStore)
export const useStatButtonBordersPreference = createLocalStorageStateHook(statButtonBordersStore)

const PreferencesStateContext = createContext<DisplayPreferencesState | null>(null)
const PreferencesDispatchContext = createContext<DisplayPreferenceDispatchers | null>(null)

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  // Each store drives its own subscription via useSyncExternalStore. The individual
  // values are memoized into a single prefs object so context consumers only re-render
  // when a value they care about actually changes.
  const showSlotIcons = showSlotIconsStore.useValue()
  const showSetIcons = showSetIconsStore.useValue()
  const showFactionIcons = showFactionIconsStore.useValue()
  const statButtonBorders = statButtonBordersStore.useValue()
  const [psychedelic, setPsychedelic] = useState(false)

  const prefs = useMemo<DisplayPreferencesState>(
    () => ({ showSlotIcons, showSetIcons, showFactionIcons, statButtonBorders, psychedelic }),
    [showSlotIcons, showSetIcons, showFactionIcons, statButtonBorders, psychedelic],
  )

  const actions = useMemo<DisplayPreferenceDispatchers>(() => ({
    setShowSlotIcons: (next) => { showSlotIconsStore.set(next) },
    setShowSetIcons: (next) => { showSetIconsStore.set(next) },
    setShowFactionIcons: (next) => { showFactionIconsStore.set(next) },
    setStatButtonBorders: (next) => { statButtonBordersStore.set(next) },
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
