/**
 * exportPreferences.ts
 *
 * Persisted preferences related to Sellfile export behavior.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { SELLFILE_DEDUP_DEFAULT_KEY, SELLFILE_OMIT_DISABLED_KEY, SELLFILE_AUTO_PUSH_KEY } from '../lib/constants'

const sellfileDedupStore = createLocalStorageStore<boolean>({
  key: SELLFILE_DEDUP_DEFAULT_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileDedupPreference = createLocalStorageStateHook(sellfileDedupStore)

const sellfileOmitDisabledStore = createLocalStorageStore<boolean>({
  key: SELLFILE_OMIT_DISABLED_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileOmitDisabledPreference = createLocalStorageStateHook(sellfileOmitDisabledStore)

// Auto-push: when enabled, automatically push the sellfile to the active endpoint on every dirty-state change.
const sellfileAutoPushStore = createLocalStorageStore<boolean>({
  key: SELLFILE_AUTO_PUSH_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileAutoPushPreference = createLocalStorageStateHook(sellfileAutoPushStore)
