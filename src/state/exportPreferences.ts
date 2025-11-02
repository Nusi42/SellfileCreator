/**
 * exportPreferences.ts
 *
 * Persisted preferences related to Sellfile export behavior.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { SELLFILE_DEDUP_DEFAULT_KEY, SELLFILE_OMIT_DISABLED_KEY } from '../lib/constants'

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
