import { useCallback } from 'react'
import {
  SAFEGUARDS_GRID_SHOW_OTHER_MATCHES_KEY,
  TESTER_GRID_COLUMNS_KEY,
  TESTER_GRID_SHOW_CHAMP_ICONS_KEY,
  TESTER_GRID_SHOW_FIRST_MATCH_KEY,
  TESTER_GRID_SHOW_MATCH_RECIPE_INDEX_KEY,
  TESTER_GRID_SHOW_MATCH_LINE_KEY,
  TESTER_GRID_SHOW_OTHER_MATCHES_KEY,
  TESTER_GRID_SHOW_SAFEGUARD_UPGRADE_CHANCE_KEY,
  TESTER_GRID_SHOW_RULE_TEMPLATES_KEY,
} from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type TesterGridColumnMode = 4 | 5
export type TesterGridPreferenceVariant = 'tester' | 'safeguards'

const testerGridColumnsStore = createLocalStorageStore<TesterGridColumnMode>({
  key: TESTER_GRID_COLUMNS_KEY,
  // Default to 4 columns so new sessions land on the denser tester-grid layout.
  fallback: 4,
  parse: (raw) => {
    // Treat missing or malformed values as the 4-column default.
    if (raw === '4') return 4
    if (raw === '5') return 5
    // Keep the storage fallback aligned with the UI default.
    return 4
  },
  // Persist only the supported column modes so upgrades stay deterministic.
  serialize: (value) => (value === 4 ? '4' : '5'),
})

const testerGridShowFirstStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_FIRST_MATCH_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowMatchRecipeStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_MATCH_RECIPE_INDEX_KEY,
  // New installs should hide recipe indices in first-match chips until users opt in.
  fallback: false,
  // Missing or malformed storage should stay aligned with the "off by default" intent.
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowMatchLineStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_MATCH_LINE_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowOtherStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_OTHER_MATCHES_KEY,
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

const testerGridShowChampIconsStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_CHAMP_ICONS_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowRuleTemplatesStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_RULE_TEMPLATES_KEY,
  // Default off so the grid stays clean unless the user opts in.
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowSafeguardUpgradeChanceStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_SAFEGUARD_UPGRADE_CHANCE_KEY,
  // Default on so users see improvement guidance immediately.
  fallback: true,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : 'false'),
})

export function useTesterGridPreferences(variant: TesterGridPreferenceVariant = 'tester') {
  const columns = testerGridColumnsStore.useValue()
  const showFirstMatch = testerGridShowFirstStore.useValue()
  const showMatchRecipeIndex = testerGridShowMatchRecipeStore.useValue()
  const showMatchLine = testerGridShowMatchLineStore.useValue()
  const testerShowOtherMatches = testerGridShowOtherStore.useValue()
  const safeguardsShowOtherMatches = safeguardsGridShowOtherStore.useValue()
  const showOtherMatches = variant === 'safeguards'
    ? safeguardsShowOtherMatches
    : testerShowOtherMatches
  const showChampionIcons = testerGridShowChampIconsStore.useValue()
  const showRuleTemplates = testerGridShowRuleTemplatesStore.useValue()
  const showSafeguardUpgradeChance = testerGridShowSafeguardUpgradeChanceStore.useValue()

  const setColumns = useCallback((next: TesterGridColumnMode) => {
    testerGridColumnsStore.set(next === 4 ? 4 : 5)
  }, [])

  const setShowFirstMatch = useCallback((next: boolean) => {
    testerGridShowFirstStore.set(Boolean(next))
  }, [])

  const setShowMatchRecipeIndex = useCallback((next: boolean) => {
    testerGridShowMatchRecipeStore.set(Boolean(next))
  }, [])

  const setShowMatchLine = useCallback((next: boolean) => {
    testerGridShowMatchLineStore.set(Boolean(next))
  }, [])

  const setShowOtherMatches = useCallback((next: boolean) => {
    if (variant === 'safeguards') {
      safeguardsGridShowOtherStore.set(Boolean(next))
      return
    }
    testerGridShowOtherStore.set(Boolean(next))
  }, [variant])

  const setShowChampionIcons = useCallback((next: boolean) => {
    testerGridShowChampIconsStore.set(Boolean(next))
  }, [])

  const setShowRuleTemplates = useCallback((next: boolean) => {
    testerGridShowRuleTemplatesStore.set(Boolean(next))
  }, [])

  const setShowSafeguardUpgradeChance = useCallback((next: boolean) => {
    testerGridShowSafeguardUpgradeChanceStore.set(Boolean(next))
  }, [])

  return {
    columns,
    showFirstMatch,
    showMatchRecipeIndex,
    showMatchLine,
    showOtherMatches,
    showChampionIcons,
    showRuleTemplates,
    showSafeguardUpgradeChance,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setShowSafeguardUpgradeChance,
  }
}
