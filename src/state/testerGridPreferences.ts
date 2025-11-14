import { useCallback } from 'react'
import { TESTER_GRID_COLUMNS_KEY, TESTER_GRID_SHOW_CHAMP_ICONS_KEY, TESTER_GRID_SHOW_FIRST_MATCH_KEY, TESTER_GRID_SHOW_OTHER_MATCHES_KEY } from '../lib/constants'
import { createLocalStorageStore } from './localStorageStore'

export type TesterGridColumnMode = 4 | 5

const testerGridColumnsStore = createLocalStorageStore<TesterGridColumnMode>({
  key: TESTER_GRID_COLUMNS_KEY,
  fallback: 5,
  parse: (raw) => {
    if (raw === '4') return 4
    if (raw === '5') return 5
    return 5
  },
  serialize: (value) => (value === 4 ? '4' : '5'),
})

const testerGridShowFirstStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_FIRST_MATCH_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowOtherStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_OTHER_MATCHES_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

const testerGridShowChampIconsStore = createLocalStorageStore<boolean>({
  key: TESTER_GRID_SHOW_CHAMP_ICONS_KEY,
  fallback: true,
  parse: (raw) => raw === 'false' ? false : true,
  serialize: (value) => (value ? 'true' : 'false'),
})

export function useTesterGridPreferences() {
  const columns = testerGridColumnsStore.useValue()
  const showFirstMatch = testerGridShowFirstStore.useValue()
  const showOtherMatches = testerGridShowOtherStore.useValue()
  const showChampionIcons = testerGridShowChampIconsStore.useValue()

  const setColumns = useCallback((next: TesterGridColumnMode) => {
    testerGridColumnsStore.set(next === 4 ? 4 : 5)
  }, [])

  const setShowFirstMatch = useCallback((next: boolean) => {
    testerGridShowFirstStore.set(Boolean(next))
  }, [])

  const setShowOtherMatches = useCallback((next: boolean) => {
    testerGridShowOtherStore.set(Boolean(next))
  }, [])

  const setShowChampionIcons = useCallback((next: boolean) => {
    testerGridShowChampIconsStore.set(Boolean(next))
  }, [])

  return {
    columns,
    showFirstMatch,
    showOtherMatches,
    showChampionIcons,
    setColumns,
    setShowFirstMatch,
    setShowOtherMatches,
    setShowChampionIcons,
  }
}
