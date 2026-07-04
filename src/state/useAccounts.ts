/**
 * useAccounts.ts
 *
 * React subscription to the account registry (lib/accounts.ts is the SSOT).
 * The registry mutates in place, so the store snapshot is a monotonic version
 * number; consumers re-read the accessor functions after each notification.
 */
import { useSyncExternalStore } from 'react'
import {
  getAccounts,
  getAccountsVersion,
  getActiveAccount,
  subscribeAccounts,
  type SfcAccount,
} from '../lib/accounts'

export type UseAccountsResult = {
  // All accounts, registry order (creation order).
  accounts: readonly SfcAccount[]
  // The account whose namespace this session runs in.
  activeAccount: SfcAccount
}

export function useAccounts(): UseAccountsResult {
  // Version bump → re-render → fresh reads below. No object identity games needed.
  useSyncExternalStore(subscribeAccounts, getAccountsVersion)
  return { accounts: getAccounts(), activeAccount: getActiveAccount() }
}
