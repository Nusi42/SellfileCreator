import { useCallback } from 'react'
import {
  SAFEGUARDS_GRID_SHOW_OTHER_MATCHES_KEY,
  GEAR_INSPECTOR_GRID_COLUMNS_KEY,
  GEAR_INSPECTOR_GRID_SHOW_CHAMP_ICONS_KEY,
  GEAR_INSPECTOR_GRID_SHOW_FIRST_MATCH_KEY,
  GEAR_INSPECTOR_GRID_HIGHLIGHT_KEEP_SELL_KEY,
  GEAR_INSPECTOR_GRID_SHOW_MATCH_RECIPE_INDEX_KEY,
  GEAR_INSPECTOR_GRID_SHOW_MATCH_LINE_KEY,
  GEAR_INSPECTOR_GRID_SHOW_OTHER_MATCHES_KEY,
  GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_IMPROVEMENT_CHANCE_KEY,
  GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_RANK_KEY,
  GEAR_INSPECTOR_GRID_SAFEGUARD_RANK_MODE_KEY,
  GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY,
  type SafeguardRankMode,
} from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type GearInspectorGridColumnMode = 'large' | 'medium' | 'small'
export type GearInspectorGridPreferenceVariant = 'gearInspector' | 'safeguards'

// EPHEMERAL view state: every Gear Inspector grid view toggle in this file is a live display
// preference that is NOT persisted (no localStorage, no .sfc). `sessionOnly` keeps each
// store's cross-component sharing (the grid, the preview header, and App's improvement-chance
// pipeline flag all read these) while resetting to the fallback each load. Keys/parse remain
// for documentation and legacy-tolerance but storage is never touched.
const gearInspectorGridColumnsStore = createLocalStorageStore<GearInspectorGridColumnMode>({
  key: GEAR_INSPECTOR_GRID_COLUMNS_KEY,
  // Default to large cards so new sessions land on the spacious Gear Inspector grid layout.
  fallback: 'large',
  parse: (raw) => {
    // Accept current string values directly.
    if (raw === 'large') return 'large'
    if (raw === 'medium') return 'medium'
    if (raw === 'small') return 'small'
    // Migrate legacy numeric values stored by older builds.
    if (raw === '4') return 'large'
    if (raw === '5') return 'medium'
    if (raw === '8') return 'small'
    // Treat missing or unrecognized values as the large default.
    return 'large'
  },
  // Persist the mode name directly so future reads need no coercion.
  serialize: (value) => value,
  sessionOnly: true,
})

const gearInspectorGridShowFirstStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_FIRST_MATCH_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowMatchRecipeStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_MATCH_RECIPE_INDEX_KEY,
  // New installs should hide recipe indices in first-match chips until users opt in.
  fallback: false,
  // Missing or malformed storage should stay aligned with the "off by default" intent.
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowMatchLineStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_MATCH_LINE_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowOtherStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_OTHER_MATCHES_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const safeguardsGridShowOtherStore = createLocalStorageStore<boolean>({
  key: SAFEGUARDS_GRID_SHOW_OTHER_MATCHES_KEY,
  // Safeguards starts with "other matches" hidden so cards stay focused on primary outcomes.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowChampIconsStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_CHAMP_ICONS_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowRuleTemplatesStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY,
  // Default off so the grid stays clean unless the user opts in.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridHighlightKeepSellStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_HIGHLIGHT_KEEP_SELL_KEY,
  // Default on so keep/sell outcomes are emphasized immediately for new sessions.
  fallback: true,
  parse: (raw) => raw === null ? true : raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

const gearInspectorGridShowSafeguardImprovementChanceStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_IMPROVEMENT_CHANCE_KEY,
  // Default on so users see improvement guidance immediately.
  fallback: true,
  parse: (raw) => raw === null ? true : raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
  sessionOnly: true,
})

// Safeguard-rank overlay MODE store (v2). Default off — the chip is opt-in so the
// card overlay stays uncluttered by default. Migrates the legacy v1 boolean on first
// read: a stored `'true'` becomes 'rank' (the prior overlay), anything else 'off'.
const parseSafeguardRankMode = (raw: string | null): SafeguardRankMode => {
  if (raw === 'rank' || raw === 'groupRank' || raw === 'both' || raw === 'off') return raw
  // Any unrecognized value (incl. the legacy v1 boolean handling below) resolves safely to a
  // valid mode — never crash on stored nonsense.
  // v2 unset — fall back to the legacy v1 boolean so existing users keep their overlay.
  if (raw === null && typeof localStorage !== 'undefined') {
    try {
      const legacy = localStorage.getItem(GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_RANK_KEY)
      if (legacy === 'true') return 'rank'
    } catch { /* storage may be unavailable; fall through to default */ }
  }
  return 'off'
}

const gearInspectorGridSafeguardRankModeStore = createLocalStorageStore<SafeguardRankMode>({
  key: GEAR_INSPECTOR_GRID_SAFEGUARD_RANK_MODE_KEY,
  fallback: 'off',
  parse: parseSafeguardRankMode,
  serialize: (value) => value,
  sessionOnly: true,
})

// Reactive read for callers that only need the rank mode without the full preference hook.
export const useSafeguardRankMode = (): SafeguardRankMode =>
  gearInspectorGridSafeguardRankModeStore.useValue()

// Standalone helpers for tutorial snapshot/restore — avoids passing the setter as a prop.
export const snapshotSafeguardImprovementChance = (): boolean =>
  gearInspectorGridShowSafeguardImprovementChanceStore.getSnapshot()
export const restoreSafeguardImprovementChance = (value: boolean): void =>
  gearInspectorGridShowSafeguardImprovementChanceStore.set(value)

// Reactive read for callers outside the grid (e.g. App.tsx pipeline flag).
export const useShowSafeguardImprovementChance = (): boolean =>
  gearInspectorGridShowSafeguardImprovementChanceStore.useValue()

export function useGearInspectorGridPreferences(variant: GearInspectorGridPreferenceVariant = 'gearInspector') {
  const columns = gearInspectorGridColumnsStore.useValue()
  const showFirstMatch = gearInspectorGridShowFirstStore.useValue()
  const showMatchRecipeIndex = gearInspectorGridShowMatchRecipeStore.useValue()
  const showMatchLine = gearInspectorGridShowMatchLineStore.useValue()
  const gearInspectorShowOtherMatches = gearInspectorGridShowOtherStore.useValue()
  const safeguardsShowOtherMatches = safeguardsGridShowOtherStore.useValue()
  const showOtherMatches = variant === 'safeguards'
    ? safeguardsShowOtherMatches
    : gearInspectorShowOtherMatches
  const showChampionIcons = gearInspectorGridShowChampIconsStore.useValue()
  const showRuleTemplates = gearInspectorGridShowRuleTemplatesStore.useValue()
  const highlightKeepSell = gearInspectorGridHighlightKeepSellStore.useValue()
  const showSafeguardImprovementChance = gearInspectorGridShowSafeguardImprovementChanceStore.useValue()
  const safeguardRankMode = gearInspectorGridSafeguardRankModeStore.useValue()

  const setColumns = useCallback((next: GearInspectorGridColumnMode) => {
    // Accept only the three named modes; fall back to large for any other value.
    gearInspectorGridColumnsStore.set(
      next === 'medium' ? 'medium' : next === 'small' ? 'small' : 'large',
    )
  }, [])

  const setShowFirstMatch = useCallback((next: boolean) => {
    gearInspectorGridShowFirstStore.set(Boolean(next))
  }, [])

  const setShowMatchRecipeIndex = useCallback((next: boolean) => {
    gearInspectorGridShowMatchRecipeStore.set(Boolean(next))
  }, [])

  const setShowMatchLine = useCallback((next: boolean) => {
    gearInspectorGridShowMatchLineStore.set(Boolean(next))
  }, [])

  const setShowOtherMatches = useCallback((next: boolean) => {
    if (variant === 'safeguards') {
      safeguardsGridShowOtherStore.set(Boolean(next))
      return
    }
    gearInspectorGridShowOtherStore.set(Boolean(next))
  }, [variant])

  const setShowChampionIcons = useCallback((next: boolean) => {
    gearInspectorGridShowChampIconsStore.set(Boolean(next))
  }, [])

  const setShowRuleTemplates = useCallback((next: boolean) => {
    gearInspectorGridShowRuleTemplatesStore.set(Boolean(next))
  }, [])

  const setHighlightKeepSell = useCallback((next: boolean) => {
    gearInspectorGridHighlightKeepSellStore.set(Boolean(next))
  }, [])

  const setShowSafeguardImprovementChance = useCallback((next: boolean) => {
    gearInspectorGridShowSafeguardImprovementChanceStore.set(Boolean(next))
  }, [])

  const setSafeguardRankMode = useCallback((next: SafeguardRankMode) => {
    gearInspectorGridSafeguardRankModeStore.set(next)
  }, [])

  return {
    columns,
    showFirstMatch,
    showMatchRecipeIndex,
    showMatchLine,
    showOtherMatches,
    showChampionIcons,
    showRuleTemplates,
    highlightKeepSell,
    showSafeguardImprovementChance,
    safeguardRankMode,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setHighlightKeepSell,
    setShowSafeguardImprovementChance,
    setSafeguardRankMode,
  }
}
