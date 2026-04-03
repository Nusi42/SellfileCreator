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
  GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY,
} from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type GearInspectorGridColumnMode = 'large' | 'medium' | 'small'
export type GearInspectorGridPreferenceVariant = 'gearInspector' | 'safeguards'

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
})

const gearInspectorGridShowFirstStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_FIRST_MATCH_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowMatchRecipeStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_MATCH_RECIPE_INDEX_KEY,
  // New installs should hide recipe indices in first-match chips until users opt in.
  fallback: false,
  // Missing or malformed storage should stay aligned with the "off by default" intent.
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowMatchLineStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_MATCH_LINE_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowOtherStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_OTHER_MATCHES_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const safeguardsGridShowOtherStore = createLocalStorageStore<boolean>({
  key: SAFEGUARDS_GRID_SHOW_OTHER_MATCHES_KEY,
  // Safeguards starts with "other matches" hidden so cards stay focused on primary outcomes.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowChampIconsStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_CHAMP_ICONS_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowRuleTemplatesStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY,
  // Default off so the grid stays clean unless the user opts in.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridHighlightKeepSellStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_HIGHLIGHT_KEEP_SELL_KEY,
  // Default on so keep/sell outcomes are emphasized immediately for new sessions.
  fallback: true,
  parse: (raw) => raw === null ? true : raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowSafeguardImprovementChanceStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_IMPROVEMENT_CHANCE_KEY,
  // Default on so users see improvement guidance immediately.
  fallback: true,
  parse: (raw) => raw === null ? true : raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowSafeguardRankStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_RANK_KEY,
  // Default off — rank chip is opt-in so the card overlay stays uncluttered by default.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

// Reactive read for callers that only need the rank toggle without the full preference hook.
export const useShowSafeguardRank = (): boolean =>
  gearInspectorGridShowSafeguardRankStore.useValue()

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
  const showSafeguardRank = gearInspectorGridShowSafeguardRankStore.useValue()

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

  const setShowSafeguardRank = useCallback((next: boolean) => {
    gearInspectorGridShowSafeguardRankStore.set(Boolean(next))
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
    showSafeguardRank,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setHighlightKeepSell,
    setShowSafeguardImprovementChance,
    setShowSafeguardRank,
  }
}
