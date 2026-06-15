/**
 * gearDbPreferences.ts
 *
 * Persisted preferences related to gear-database endpoint updates.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { GEAR_DB_HIDE_UPDATE_TOAST_KEY } from '../lib/constants'

// Hide-update-toast: when enabled, the "gear update" toast is suppressed while
// status badges keep updating. Persisted so the choice survives reloads.
const hideGearDbUpdateToastStore = createLocalStorageStore<boolean>({
  key: GEAR_DB_HIDE_UPDATE_TOAST_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => (value ? '1' : '0'),
})

export const useHideGearDbUpdateToastPreference = createLocalStorageStateHook(hideGearDbUpdateToastStore)
