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
  GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_UPGRADE_CHANCE_KEY,
  GEAR_INSPECTOR_GRID_SHOW_RULE_TEMPLATES_KEY,
} from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type GearInspectorGridColumnMode = 4 | 5 | 8
export type GearInspectorGridPreferenceVariant = 'gearInspector' | 'safeguards'

const gearInspectorGridColumnsStore = createLocalStorageStore<GearInspectorGridColumnMode>({
  key: GEAR_INSPECTOR_GRID_COLUMNS_KEY,
  // Default to 4 columns so new sessions land on the denser Gear Inspector grid layout.
  fallback: 4,
  parse: (raw) => {
    // Treat missing or malformed values as the 4-column default.
    if (raw === '4') return 4
    if (raw === '5') return 5
    if (raw === '8') return 8
    // Keep the storage fallback aligned with the UI default.
    return 4
  },
  // Persist only the supported column modes so upgrades stay deterministic.
  serialize: (value) => (value === 5 ? '5' : value === 8 ? '8' : '4'),
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
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const gearInspectorGridShowSafeguardUpgradeChanceStore = createLocalStorageStore<boolean>({
  key: GEAR_INSPECTOR_GRID_SHOW_SAFEGUARD_UPGRADE_CHANCE_KEY,
  // Default on so users see improvement guidance immediately.
  fallback: true,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

// Standalone helpers for tutorial snapshot/restore — avoids passing the setter as a prop.
export const snapshotSafeguardUpgradeChance = (): boolean =>
  gearInspectorGridShowSafeguardUpgradeChanceStore.getSnapshot()
export const restoreSafeguardUpgradeChance = (value: boolean): void =>
  gearInspectorGridShowSafeguardUpgradeChanceStore.set(value)

// Reactive read for callers outside the grid (e.g. App.tsx pipeline flag).
export const useShowSafeguardUpgradeChance = (): boolean =>
  gearInspectorGridShowSafeguardUpgradeChanceStore.useValue()

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
  const showSafeguardUpgradeChance = gearInspectorGridShowSafeguardUpgradeChanceStore.useValue()

  const setColumns = useCallback((next: GearInspectorGridColumnMode) => {
    // Accept 4, 5, or 8; fall back to 4 for any other value.
    gearInspectorGridColumnsStore.set(next === 5 ? 5 : next === 8 ? 8 : 4)
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

  const setShowSafeguardUpgradeChance = useCallback((next: boolean) => {
    gearInspectorGridShowSafeguardUpgradeChanceStore.set(Boolean(next))
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
    showSafeguardUpgradeChance,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setHighlightKeepSell,
    setShowSafeguardUpgradeChance,
  }
}
