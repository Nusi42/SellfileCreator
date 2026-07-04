/**
 * exportPreferences.ts
 *
 * Persisted preferences related to Sellfile export behavior.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { SELLFILE_DEDUP_DEFAULT_KEY, SELLFILE_OMIT_DISABLED_KEY, SELLFILE_AUTO_PUSH_KEY } from '../lib/constants'
import {
  ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR,
  resolveAccountScopedKeyFor,
} from '../lib/accounts'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../lib/safeStorage'

// Shared raw→boolean parse for every export preference. Exported because the background
// account-push flow reads ANOTHER account's auto-push key directly (the store below is
// bound to the active account's key) and must decode the raw value identically.
export const parseExportPreferenceRaw = (raw: string | null): boolean => raw === 'true' || raw === '1'

const sellfileDedupStore = createLocalStorageStore<boolean>({
  key: SELLFILE_DEDUP_DEFAULT_KEY,
  fallback: false,
  parse: parseExportPreferenceRaw,
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileDedupPreference = createLocalStorageStateHook(sellfileDedupStore)
// Non-React snapshot for the background account-push flow (dedupe is a GLOBAL pref, so
// the store is the correct source even when building for another account).
export const getSellfileDedupPreferenceSnapshot = (): boolean => sellfileDedupStore.getSnapshot()

const sellfileOmitDisabledStore = createLocalStorageStore<boolean>({
  key: SELLFILE_OMIT_DISABLED_KEY,
  fallback: false,
  parse: parseExportPreferenceRaw,
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileOmitDisabledPreference = createLocalStorageStateHook(sellfileOmitDisabledStore)
// Non-React snapshot for the background account-push flow (omit-disabled is global, see above).
export const getSellfileOmitDisabledPreferenceSnapshot = (): boolean => sellfileOmitDisabledStore.getSnapshot()

// Auto-push: when enabled, automatically push the sellfile to the active endpoint on every dirty-state change.
const sellfileAutoPushStore = createLocalStorageStore<boolean>({
  key: SELLFILE_AUTO_PUSH_KEY,
  fallback: false,
  parse: parseExportPreferenceRaw,
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileAutoPushPreference = createLocalStorageStateHook(sellfileAutoPushStore)

/**
 * Auto-push for an EXPLICIT account (the account manager edits any account; the
 * background push flow reads the target account's own contract). SSOT for the raw
 * key access — the store above only covers the ACTIVE account's resolved key.
 */
export const getSellfileAutoPushForAccount = (accountId: string): boolean =>
  parseExportPreferenceRaw(safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)))

export const setSellfileAutoPushForAccount = (accountId: string, enabled: boolean): void => {
  const key = resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)
  // The ACTIVE account's key is owned by the live store — route through it so React
  // subscribers (the auto-push button) update immediately instead of desyncing.
  if (key === SELLFILE_AUTO_PUSH_KEY) {
    sellfileAutoPushStore.set(enabled)
    return
  }
  // Other accounts: raw write mirroring the store's serialize + delete-on-default(false).
  if (enabled) safeSetItem(key, '1')
  else safeRemoveItem(key)
}

/**
 * Last SUCCESSFUL sellfile upload per account (ISO timestamp, shown in the account menu).
 * Written by BOTH push paths — the foreground export (active account) and the background
 * account push (any account) — so the raw scoped key is the SSOT, not a live store.
 */
export const getSellfileLastPushAtForAccount = (accountId: string): string | null =>
  safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH))

export const markSellfileLastPushForAccount = (accountId: string): void => {
  safeSetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH), new Date().toISOString())
  // A success supersedes any earlier failure — the list's error marker clears with it.
  safeRemoveItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR))
}

/**
 * Failed BACKGROUND push marker (ISO timestamp). Background outcomes never toast — the
 * account list shows an error line for the account instead, until a push succeeds.
 */
export const getSellfileLastPushErrorAtForAccount = (accountId: string): string | null =>
  safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR))

export const markSellfileLastPushErrorForAccount = (accountId: string): void => {
  safeSetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR), new Date().toISOString())
}
