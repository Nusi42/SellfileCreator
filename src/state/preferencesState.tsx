/**
 * preferencesState.tsx
 *
 * Centralizes preview/display preferences so every surface reads the same
 * values. Each preference persists to localStorage under the existing keys.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
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

const PreferencesStateCtx = createContext<DisplayPreferencesState | null>(null)
const PreferencesDispatchCtx = createContext<DisplayPreferenceDispatchers | null>(null)

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

  useEffect(() => {
    try { window.localStorage.setItem(RULES_TABLE_SHOW_SLOT_ICONS_KEY, String(prefs.showSlotIcons)) } catch {}
  }, [prefs.showSlotIcons])
  useEffect(() => {
    try { window.localStorage.setItem(RULES_TABLE_SHOW_SET_ICONS_KEY, String(prefs.showSetIcons)) } catch {}
  }, [prefs.showSetIcons])
  useEffect(() => {
    try { window.localStorage.setItem(RULES_TABLE_SHOW_FACTION_ICONS_KEY, String(prefs.showFactionIcons)) } catch {}
  }, [prefs.showFactionIcons])
  useEffect(() => {
    try { window.localStorage.setItem(STAT_BUTTON_BORDERS_KEY, String(prefs.statButtonBorders)) } catch {}
  }, [prefs.statButtonBorders])

  const actions: DisplayPreferenceDispatchers = useMemo(() => ({
    setShowSlotIcons: (next: boolean) => setPrefs((prev) => (prev.showSlotIcons === next ? prev : { ...prev, showSlotIcons: next })),
    setShowSetIcons: (next: boolean) => setPrefs((prev) => (prev.showSetIcons === next ? prev : { ...prev, showSetIcons: next })),
    setShowFactionIcons: (next: boolean) => setPrefs((prev) => (prev.showFactionIcons === next ? prev : { ...prev, showFactionIcons: next })),
    setStatButtonBorders: (next: boolean) => setPrefs((prev) => (prev.statButtonBorders === next ? prev : { ...prev, statButtonBorders: next })),
  }), [])

  return (
    <PreferencesStateCtx.Provider value={prefs}>
      <PreferencesDispatchCtx.Provider value={actions}>
        {children}
      </PreferencesDispatchCtx.Provider>
    </PreferencesStateCtx.Provider>
  )
}

export function useDisplayPreferences(): DisplayPreferencesState {
  const ctx = useContext(PreferencesStateCtx)
  if (!ctx) throw new Error('useDisplayPreferences must be used within DisplayPreferencesProvider')
  return ctx
}

export function useDisplayPreferenceActions(): DisplayPreferenceDispatchers {
  const ctx = useContext(PreferencesDispatchCtx)
  if (!ctx) throw new Error('useDisplayPreferenceActions must be used within DisplayPreferencesProvider')
  return ctx
}

export function useDisplayPreferencesContext(): [DisplayPreferencesState, DisplayPreferenceDispatchers] {
  return [useDisplayPreferences(), useDisplayPreferenceActions()]
}
