/**
 * gearDbPreferences.ts
 *
 * Persisted preferences related to gear-database endpoint updates.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { GEAR_DB_HIDE_UPDATE_TOAST_KEY, GEAR_DB_PERSIST_ENDPOINT_GEAR_KEY } from '../lib/constants'

// Hide-update-toast: when enabled, the "gear update" toast is suppressed while
// status badges keep updating. Persisted so the choice survives reloads.
const hideGearDbUpdateToastStore = createLocalStorageStore<boolean>({
  key: GEAR_DB_HIDE_UPDATE_TOAST_KEY,
  fallback: false,
  parse: (raw) => raw === 'true' || raw === '1',
  serialize: (value) => (value ? '1' : '0'),
})

export const useHideGearDbUpdateToastPreference = createLocalStorageStateHook(hideGearDbUpdateToastStore)

// Persist-endpoint-gear: when disabled, REAL endpoint gear data is kept out of
// localStorage (perf/sanity — a full inventory autosave compresses megabytes on every
// debounce). Manual/custom Gear Inspector items are still persisted. Applies app-wide
// (all accounts): the live gearInspector autosave filters to manual items, and the
// background account-push skips its gear autosave write. Default ON (legacy behavior).
const persistEndpointGearStore = createLocalStorageStore<boolean>({
  key: GEAR_DB_PERSIST_ENDPOINT_GEAR_KEY,
  fallback: true,
  // Absent key = default true; only explicit '0'/'false' disables.
  parse: (raw) => raw !== 'false' && raw !== '0',
  serialize: (value) => (value ? '1' : '0'),
})

export const usePersistEndpointGearPreference = createLocalStorageStateHook(persistEndpointGearStore)
// Non-React snapshot for the background account-push flow and the autosave payload builder.
export const getPersistEndpointGearPreferenceSnapshot = (): boolean => persistEndpointGearStore.getSnapshot()
// Non-React setter so the account manager dialog (rendered outside App's pref plumbing)
// can flip the toggle while React subscribers stay in sync.
export const setPersistEndpointGearPreference = (value: boolean): void => { persistEndpointGearStore.set(value) }
