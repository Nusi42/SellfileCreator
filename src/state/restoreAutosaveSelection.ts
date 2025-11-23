import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { RESTORE_SELECTION_DEFAULT, RESTORE_SELECTION_KEYS, type RestoreSelection } from '../types/restoreAutosaveSelection'

const STORAGE_KEY = 'sellfileCreator.autosave.restoreSelection.v1'

const restoreSelectionStore = createLocalStorageStore<RestoreSelection>({
  key: STORAGE_KEY,
  fallback: RESTORE_SELECTION_DEFAULT,
  parse: (raw) => {
    if (!raw) return RESTORE_SELECTION_DEFAULT
    try {
      const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
      const next: RestoreSelection = { ...RESTORE_SELECTION_DEFAULT }
      for (const key of RESTORE_SELECTION_KEYS) {
        const value = parsed?.[key]
        if (typeof value === 'boolean') {
          next[key] = value
        }
      }
      return next
    } catch {
      return RESTORE_SELECTION_DEFAULT
    }
  },
  serialize: (value) => {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  },
})

export const useRestoreAutosaveSelectionPreference = createLocalStorageStateHook(restoreSelectionStore)
