/**
 * accountSummaries.ts
 *
 * Per-account metadata for the switcher list — mirrors the "nice info" the preset
 * menus show (saved-at caption via formatLocalDateTime) plus document counts, the last
 * successful push to RSL Helper, and a stats snapshot (generated-rule count + gear
 * sell/keep outcome summary). Reads are done lazily when the menu opens: the SFC
 * document needs one full CRC-guarded parse per account, the rest are tiny top-level
 * reads — acceptable at menu-open frequency.
 *
 * The stats snapshot exists because pipeline RESULTS (merged rule count, per-item
 * sell/keep/safeguard verdicts) cannot be derived from the autosaves at menu-open cost —
 * the LIVE session writes its own account's snapshot whenever those results change.
 */
import { loadAutosave } from './autosave'
import {
  ACCOUNT_BASE_KEY_ACCOUNT_STATS,
  ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR,
  ACCOUNT_BASE_KEY_AUTOSAVE_SFC,
  resolveAccountScopedKeyFor,
} from './accounts'
import {
  getSellfileAutoPushForAccount,
  getSellfileLastPushAtForAccount,
  getSellfileLastPushErrorAtForAccount,
} from '../state/exportPreferences'
import { safeGetItem, safeSetItem } from './safeStorage'
import type { GearInspectorAutosavePayload } from './gearInspectorSession'
import type { GearInspectorOutcomeSummary } from '../types/gearInspectorPreview'

// Snapshot of the live session's pipeline results, persisted per account (see header).
export type AccountStatsSnapshot = {
  // Generated (merged) sellfile rule count — recipes unroll into many rules at build time.
  rules: number
  // Full-DB gear outcome summary (total / sold / kept / kept-by-safeguards).
  gear: GearInspectorOutcomeSummary
  // When the snapshot was written (staleness marker; not currently rendered).
  at: string
}

export const writeAccountStatsSnapshot = (
  accountId: string,
  snapshot: Omit<AccountStatsSnapshot, 'at'>,
): void => {
  const value: AccountStatsSnapshot = { ...snapshot, at: new Date().toISOString() }
  safeSetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_ACCOUNT_STATS), JSON.stringify(value))
}

// Parse + shape-check the snapshot; any malformed content degrades to "no snapshot".
const readAccountStatsSnapshot = (accountId: string): AccountStatsSnapshot | null => {
  const raw = safeGetItem(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_ACCOUNT_STATS))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AccountStatsSnapshot>
    const gear = parsed.gear
    if (
      typeof parsed.rules !== 'number' || !gear
      || typeof gear.total !== 'number' || typeof gear.sold !== 'number'
      || typeof gear.kept !== 'number' || typeof gear.keptBySafeguards !== 'number'
    ) return null
    return parsed as AccountStatsSnapshot
  } catch {
    return null
  }
}

export type AccountListSummary = {
  // Most recent autosave timestamp (SFC document first, gear autosave as fallback).
  savedAt: string | null
  // Recipe count from the SFC document; null when no document is saved.
  recipeCount: number | null
  // Safeguard rule count from the SFC document; null when no document is saved.
  safeguardCount: number | null
  // Generated-rule count from the stats snapshot; null when never written.
  rulesCount: number | null
  // Gear sell/keep outcome summary from the stats snapshot; null when never written.
  gearOutcome: GearInspectorOutcomeSummary | null
  // Last successful sellfile upload to RSL Helper (foreground or background push).
  lastPushAt: string | null
  // Last FAILED background push; null once a later push succeeds (see exportPreferences).
  lastPushErrorAt: string | null
  // The account's own auto-push contract with RSL Helper (honored by the background push).
  autoPush: boolean
}

export const readAccountListSummary = (accountId: string): AccountListSummary => {
  // The SFC autosave's interesting fields are top-level, but the CRC-guarded storage
  // format forces a full parse to reach them (see lib/autosave.ts).
  const sfc = loadAutosave<{ AutosaveSavedAt?: unknown; Recipes?: unknown; Safeguards?: unknown }>(
    resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_AUTOSAVE_SFC),
  )
  // Gear queue metadata never requires decompressing the item blob.
  const gear = loadAutosave<GearInspectorAutosavePayload>(
    resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR),
  )
  const sfcSavedAt = sfc && typeof sfc.payload.AutosaveSavedAt === 'string' ? sfc.payload.AutosaveSavedAt : null
  const gearSavedAt = gear && typeof gear.payload.SavedAt === 'string' ? gear.payload.SavedAt : null
  const stats = readAccountStatsSnapshot(accountId)
  return {
    savedAt: sfcSavedAt ?? gearSavedAt,
    recipeCount: sfc && Array.isArray(sfc.payload.Recipes) ? sfc.payload.Recipes.length : null,
    safeguardCount: sfc && Array.isArray(sfc.payload.Safeguards) ? sfc.payload.Safeguards.length : null,
    rulesCount: stats ? stats.rules : null,
    gearOutcome: stats ? stats.gear : null,
    lastPushAt: getSellfileLastPushAtForAccount(accountId),
    lastPushErrorAt: getSellfileLastPushErrorAtForAccount(accountId),
    autoPush: getSellfileAutoPushForAccount(accountId),
  }
}
