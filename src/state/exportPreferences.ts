/**
 * exportPreferences.ts
 *
 * Persisted preferences related to Sellfile export behavior.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { SELLFILE_DEDUP_DEFAULT_KEY, SELLFILE_OMIT_DISABLED_KEY, SELLFILE_AUTO_PUSH_KEY } from '../lib/constants'
import {
  ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_DEDUP_DEFAULT,
  ACCOUNT_BASE_KEY_SELLFILE_OMIT_DISABLED,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_ERROR,
  ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_SFC_HASH,
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
// Non-React snapshot of the ACTIVE account's dedupe (foreground export reads this).
export const getSellfileDedupPreferenceSnapshot = (): boolean => sellfileDedupStore.getSnapshot()
// Dedupe for an EXPLICIT account — the background push builds for a specific non-active
// account and must apply THAT account's transform, not the active one's. SSOT for the raw key.
export const getSellfileDedupForAccount = (accountId: string): boolean =>
  parseExportPreferenceRaw(safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_DEDUP_DEFAULT)))

const sellfileOmitDisabledStore = createLocalStorageStore<boolean>({
  key: SELLFILE_OMIT_DISABLED_KEY,
  fallback: false,
  parse: parseExportPreferenceRaw,
  serialize: (value) => (value ? '1' : '0'),
})

export const useSellfileOmitDisabledPreference = createLocalStorageStateHook(sellfileOmitDisabledStore)
// Non-React snapshot of the ACTIVE account's omit-disabled (foreground export reads this).
export const getSellfileOmitDisabledPreferenceSnapshot = (): boolean => sellfileOmitDisabledStore.getSnapshot()
// Omit-disabled for an EXPLICIT account — background push reads the TARGET account's value.
export const getSellfileOmitDisabledForAccount = (accountId: string): boolean =>
  parseExportPreferenceRaw(safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_OMIT_DISABLED)))

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

/**
 * Whether the account has EVER configured auto-push ('1'/'0' present vs key absent).
 * The distinction matters: express simple mode defaults auto-push ON only for accounts
 * that never chose — an explicit off must survive simple starts and account switches.
 */
export const hasExplicitSellfileAutoPushForAccount = (accountId: string): boolean =>
  safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)) !== null

export const setSellfileAutoPushForAccount = (accountId: string, enabled: boolean): void => {
  const key = resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)
  // The ACTIVE account's key is owned by the live store — route through it so React
  // subscribers (the auto-push button) update immediately instead of desyncing.
  if (key === SELLFILE_AUTO_PUSH_KEY) {
    sellfileAutoPushStore.set(enabled)
    return
  }
  // Other accounts: raw write mirroring the store's serialize ('1'/'0'). Off must WRITE
  // (not remove) so it counts as an explicit choice — see hasExplicit… above.
  safeSetItem(key, enabled ? '1' : '0')
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

/**
 * Fingerprint of the .sfc document last pushed for an account (SfcFileAsSellfile only).
 *
 * The background service compares the document it is about to upload against this and skips
 * an identical one — under that capability a gear burst changes no part of the .sfc, so
 * re-sending it on every packet is pure noise. Persisted, so the skip holds across reloads
 * instead of allowing one redundant push per session.
 */
export const getSellfileLastPushSfcHashForAccount = (accountId: string): string | null =>
  safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_SFC_HASH))

export const setSellfileLastPushSfcHashForAccount = (accountId: string, hash: string): void => {
  safeSetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_SELLFILE_LAST_PUSH_SFC_HASH), hash)
}
