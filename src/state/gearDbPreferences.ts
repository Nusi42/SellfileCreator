/**
 * gearDbPreferences.ts
 *
 * Persisted preferences related to gear-database endpoint updates.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { GEAR_DB_HIDE_UPDATE_TOAST_KEY, GEAR_DB_PERSIST_ENDPOINT_GEAR_KEY } from '../lib/constants'
import { ACCOUNT_BASE_KEY_GEAR_DB_PERSIST_ENDPOINT_GEAR, resolveAccountScopedKeyFor } from '../lib/accounts'
import { safeGetItem, safeSetItem } from '../lib/safeStorage'

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
// debounce). Manual/custom Gear Inspector items are still persisted. PER ACCOUNT: the
// live gearInspector autosave (active account) filters to manual items, and the
// background account-push honors the TARGET account's flag. Default ON (legacy behavior).
// Absent key = default true; only explicit '0'/'false' disables. Shared with the raw
// per-account getter below so both decode identically.
const parsePersistEndpointGearRaw = (raw: string | null): boolean => raw !== 'false' && raw !== '0'

// Live store bound to the ACTIVE account's resolved key.
const persistEndpointGearStore = createLocalStorageStore<boolean>({
  key: GEAR_DB_PERSIST_ENDPOINT_GEAR_KEY,
  fallback: true,
  parse: parsePersistEndpointGearRaw,
  serialize: (value) => (value ? '1' : '0'),
})

export const usePersistEndpointGearPreference = createLocalStorageStateHook(persistEndpointGearStore)
// Non-React snapshot for the ACTIVE account (autosave payload builder).
export const getPersistEndpointGearPreferenceSnapshot = (): boolean => persistEndpointGearStore.getSnapshot()

/**
 * Persistence flag for an EXPLICIT account (the account dialog edits any account; the
 * background push honors the target's flag). SSOT for the raw key access — the store
 * above only covers the ACTIVE account's resolved key.
 */
export const getPersistEndpointGearForAccount = (accountId: string): boolean =>
  parsePersistEndpointGearRaw(safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_GEAR_DB_PERSIST_ENDPOINT_GEAR)))

export const setPersistEndpointGearForAccount = (accountId: string, value: boolean): void => {
  const key = resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_GEAR_DB_PERSIST_ENDPOINT_GEAR)
  // The ACTIVE account's key is owned by the live store — route through it so React
  // subscribers (the autosave payload builder) update immediately instead of desyncing.
  if (key === GEAR_DB_PERSIST_ENDPOINT_GEAR_KEY) {
    persistEndpointGearStore.set(value)
    return
  }
  // Other accounts: raw write mirroring the store's serialize ('1'/'0').
  safeSetItem(key, value ? '1' : '0')
}
