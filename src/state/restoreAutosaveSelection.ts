import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { RESTORE_SELECTION_KEYS, type RestoreSelection } from '../types/restoreAutosaveSelection'

type RestoreSelectionOverrides = Partial<RestoreSelection>

const STORAGE_KEY = 'sellfileCreator.autosave.restoreSelection.v1'

const restoreSelectionStore = createLocalStorageStore<RestoreSelectionOverrides>({
  key: STORAGE_KEY,
  fallback: {},
  parse: (raw) => {
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
      const next: RestoreSelectionOverrides = {}
      for (const key of RESTORE_SELECTION_KEYS) {
        const value = parsed?.[key]
        if (typeof value === 'boolean') next[key] = value
      }
      return next
    } catch {
      return {}
    }
  },
  serialize: (value) => {
    try {
      if (!value || Object.keys(value).length === 0) return null
      return JSON.stringify(value)
    } catch {
      return null
    }
  },
})

export const useRestoreAutosaveSelectionPreference = createLocalStorageStateHook(restoreSelectionStore)
