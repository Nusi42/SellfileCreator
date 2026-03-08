/**
 * preferencesState.tsx
 *
 * Centralizes preview/display preferences so every surface reads the same
 * values. Each preference persists to localStorage under the existing keys.
 */
import React, { createContext, use, useMemo, useState } from 'react'
import { RULES_TABLE_SHOW_FACTION_ICONS_KEY, RULES_TABLE_SHOW_SET_ICONS_KEY, RULES_TABLE_SHOW_SLOT_ICONS_KEY, STAT_BUTTON_BORDERS_KEY } from '../lib/constants'

type BooleanPreferenceKey = typeof RULES_TABLE_SHOW_SLOT_ICONS_KEY
  | typeof RULES_TABLE_SHOW_SET_ICONS_KEY
  | typeof RULES_TABLE_SHOW_FACTION_ICONS_KEY
  | typeof STAT_BUTTON_BORDERS_KEY

export type DisplayPreferencesState = {
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  statButtonBorders: boolean
}

export type DisplayPreferenceDispatchers = {
  setShowSlotIcons: (next: boolean) => void
  setShowSetIcons: (next: boolean) => void
  setShowFactionIcons: (next: boolean) => void
  setStatButtonBorders: (next: boolean) => void
}

const DEFAULT_PREFERENCES: DisplayPreferencesState = {
  showSlotIcons: true,
  showSetIcons: true,
  showFactionIcons: true,
  statButtonBorders: true,
}

const PreferencesStateContext = createContext<DisplayPreferencesState | null>(null)
const PreferencesDispatchContext = createContext<DisplayPreferenceDispatchers | null>(null)

function writeBooleanPref(key: BooleanPreferenceKey, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // ignore — localStorage persistence is best-effort
  }
}

function readBooleanPref(key: BooleanPreferenceKey, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore – fall through to fallback
  }
  return fallback
}

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DisplayPreferencesState>(() => ({
    showSlotIcons: readBooleanPref(RULES_TABLE_SHOW_SLOT_ICONS_KEY, DEFAULT_PREFERENCES.showSlotIcons),
    showSetIcons: readBooleanPref(RULES_TABLE_SHOW_SET_ICONS_KEY, DEFAULT_PREFERENCES.showSetIcons),
    showFactionIcons: readBooleanPref(RULES_TABLE_SHOW_FACTION_ICONS_KEY, DEFAULT_PREFERENCES.showFactionIcons),
    statButtonBorders: readBooleanPref(STAT_BUTTON_BORDERS_KEY, DEFAULT_PREFERENCES.statButtonBorders),
  }))

  const actions: DisplayPreferenceDispatchers = useMemo(() => ({
    setShowSlotIcons: (next: boolean) => setPrefs((prev) => {
      if (prev.showSlotIcons === next) return prev
      writeBooleanPref(RULES_TABLE_SHOW_SLOT_ICONS_KEY, next)
      return { ...prev, showSlotIcons: next }
    }),
    setShowSetIcons: (next: boolean) => setPrefs((prev) => {
      if (prev.showSetIcons === next) return prev
      writeBooleanPref(RULES_TABLE_SHOW_SET_ICONS_KEY, next)
      return { ...prev, showSetIcons: next }
    }),
    setShowFactionIcons: (next: boolean) => setPrefs((prev) => {
      if (prev.showFactionIcons === next) return prev
      writeBooleanPref(RULES_TABLE_SHOW_FACTION_ICONS_KEY, next)
      return { ...prev, showFactionIcons: next }
    }),
    setStatButtonBorders: (next: boolean) => setPrefs((prev) => {
      if (prev.statButtonBorders === next) return prev
      writeBooleanPref(STAT_BUTTON_BORDERS_KEY, next)
      return { ...prev, statButtonBorders: next }
    }),
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
