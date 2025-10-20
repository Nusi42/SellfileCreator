/**
 * builderPreferences.ts
 *
 * Builder-specific persisted preferences.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { BUILDER_AUTO_RESET_AFTER_INSERT_KEY } from '../lib/constants'

const autoResetStore = createLocalStorageStore<boolean>({
  key: BUILDER_AUTO_RESET_AFTER_INSERT_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => String(value),
})

export const useAutoResetAfterInsertPreference = createLocalStorageStateHook(autoResetStore)
