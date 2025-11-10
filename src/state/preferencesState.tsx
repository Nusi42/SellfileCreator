/**
 * preferencesState.tsx
 *
 * Centralizes preview/display preferences so every surface reads the same
 * values. Each preference persists to localStorage under the existing keys.
 */
import React, { createContext, useContext, useMemo, useState } from 'react'
import { RULES_TABLE_SHOW_FACTION_ICONS_KEY, RULES_TABLE_SHOW_SET_ICONS_KEY, RULES_TABLE_SHOW_SLOT_ICONS_KEY, STAT_BUTTON_BORDERS_KEY } from '../lib/constants'

const TESTER_PREVIEW_LAYOUT_STORAGE_KEY = 'sellfileCreator.tester.previewLayout.v1'

type BooleanPreferenceKey = typeof RULES_TABLE_SHOW_SLOT_ICONS_KEY
  | typeof RULES_TABLE_SHOW_SET_ICONS_KEY
  | typeof RULES_TABLE_SHOW_FACTION_ICONS_KEY
  | typeof STAT_BUTTON_BORDERS_KEY

export type DisplayPreferencesState = {
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  statButtonBorders: boolean
  testerPreviewLayout: 'list' | 'grid'
}

export type DisplayPreferenceDispatchers = {
  setShowSlotIcons: (next: boolean) => void
  setShowSetIcons: (next: boolean) => void
  setShowFactionIcons: (next: boolean) => void
  setStatButtonBorders: (next: boolean) => void
  setTesterPreviewLayout: (next: 'list' | 'grid') => void
}

const DEFAULT_PREFERENCES: DisplayPreferencesState = {
  showSlotIcons: true,
  showSetIcons: true,
  showFactionIcons: true,
  statButtonBorders: true,
  testerPreviewLayout: 'list',
}

const PreferencesStateCtx = createContext<DisplayPreferencesState | null>(null)
const PreferencesDispatchCtx = createContext<DisplayPreferenceDispatchers | null>(null)

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

function readTesterLayoutPref(): 'list' | 'grid' {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES.testerPreviewLayout
  try {
    const raw = window.localStorage.getItem(TESTER_PREVIEW_LAYOUT_STORAGE_KEY)
    return raw === 'grid' ? 'grid' : 'list'
  } catch {
    return DEFAULT_PREFERENCES.testerPreviewLayout
  }
}

function writeTesterLayoutPref(value: 'list' | 'grid'): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TESTER_PREVIEW_LAYOUT_STORAGE_KEY, value)
  } catch {
    // ignore – storage is best-effort
  }
}

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DisplayPreferencesState>(() => ({
    showSlotIcons: readBooleanPref(RULES_TABLE_SHOW_SLOT_ICONS_KEY, DEFAULT_PREFERENCES.showSlotIcons),
    showSetIcons: readBooleanPref(RULES_TABLE_SHOW_SET_ICONS_KEY, DEFAULT_PREFERENCES.showSetIcons),
    showFactionIcons: readBooleanPref(RULES_TABLE_SHOW_FACTION_ICONS_KEY, DEFAULT_PREFERENCES.showFactionIcons),
    statButtonBorders: readBooleanPref(STAT_BUTTON_BORDERS_KEY, DEFAULT_PREFERENCES.statButtonBorders),
    testerPreviewLayout: readTesterLayoutPref(),
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
    setTesterPreviewLayout: (next: 'list' | 'grid') => setPrefs((prev) => {
      if (prev.testerPreviewLayout === next) return prev
      writeTesterLayoutPref(next)
      return { ...prev, testerPreviewLayout: next }
    }),
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
