/**
 * activeAccountSession.ts
 *
 * Per-TAB active-account identity (SSOT for "which account is THIS tab editing").
 *
 * Multi-tab safety: localStorage is shared across every tab of the same origin, so the
 * registry's `activeAccountId` cannot answer "which account does this tab edit" — two
 * tabs would collide on one global value. sessionStorage is per-tab and survives a
 * same-tab reload (F5, the account-switch reload) but NOT a new tab, which is exactly
 * the lifetime an account-per-tab choice needs.
 *
 * This mirrors the SIMPLE_MODE_SESSION_KEY pattern in runtimeConfig.ts (the app's only
 * other sessionStorage use): stash-and-verify, degrading to null in storage-less
 * environments (incognito file://) so the app still boots on the registry default.
 *
 * Precedence at boot (established in accounts.ts ensureAccountsInitialized):
 *   1. ?playerid/?playerName launch param  — RSL Helper opens the app FOR an account; wins.
 *   2. this tab's stored session id        — a plain reload keeps the tab on its account.
 *   3. registry.activeAccountId            — a fresh tab boots to the last-used account.
 * The winner is written back here so `resolveAccountScopedKey`/`getActiveAccount` in
 * accounts.ts resolve every scoped key against the TAB's account, not the global default.
 */

// The per-tab marker. `.session.` in the name flags the sessionStorage lifetime, matching
// SIMPLE_MODE_SESSION_KEY's convention.
export const ACTIVE_ACCOUNT_SESSION_KEY = 'sellfileCreator.activeAccount.session.v1'

// Read the tab's chosen account id, or null when unset / storage is unavailable. Callers
// treat null as "no per-tab choice yet" and fall through to the registry default.
export const getTabActiveAccountId = (): string | null => {
  try {
    const value = window.sessionStorage.getItem(ACTIVE_ACCOUNT_SESSION_KEY)
    // Empty string is not a valid account id — normalize it to "unset".
    return value && value.length > 0 ? value : null
  } catch {
    // Storage-less (incognito file://): no per-tab memory; boot rides the registry default.
    return null
  }
}

/**
 * Pin the tab to an account id. Returns true only when it verifiably persisted — callers
 * that need the choice to survive the reload (switchAccount) can detect the storage-less
 * case, though the immediate in-session resolution in accounts.ts works regardless.
 */
export const setTabActiveAccountId = (id: string): boolean => {
  try {
    window.sessionStorage.setItem(ACTIVE_ACCOUNT_SESSION_KEY, id)
    return window.sessionStorage.getItem(ACTIVE_ACCOUNT_SESSION_KEY) === id
  } catch {
    // Storage unavailable — the caller-side reload will simply re-resolve to the registry
    // default. That is the correct graceful degradation for a single-tab-only environment.
    return false
  }
}
