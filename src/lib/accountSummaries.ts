/**
 * accountSummaries.ts
 *
 * Per-account metadata for the switcher list — mirrors the "nice info" the preset
 * menus show (saved-at caption via formatLocalDateTime) plus document/gear counts.
 * Reads are done lazily when the menu opens: the gear autosave exposes SavedAt and
 * ItemCount top-level (no blob decompression), while the SFC document needs one full
 * CRC-guarded parse per account — acceptable at menu-open frequency.
 */
import { loadAutosave } from './autosave'
import {
  ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR,
  ACCOUNT_BASE_KEY_AUTOSAVE_SFC,
  resolveAccountScopedKeyFor,
} from './accounts'
import type { GearInspectorAutosavePayload } from './gearInspectorSession'

export type AccountListSummary = {
  // Most recent autosave timestamp (SFC document first, gear autosave as fallback).
  savedAt: string | null
  // Recipe count from the SFC document; null when no document is saved.
  recipeCount: number | null
  // Gear item count from the gear autosave's top-level metadata; null when absent.
  gearItemCount: number | null
}

export const readAccountListSummary = (accountId: string): AccountListSummary => {
  // The SFC autosave's interesting fields are top-level, but the CRC-guarded storage
  // format forces a full parse to reach them (see lib/autosave.ts).
  const sfc = loadAutosave<{ AutosaveSavedAt?: unknown; Recipes?: unknown }>(
    resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_AUTOSAVE_SFC),
  )
  // Gear queue metadata never requires decompressing the item blob.
  const gear = loadAutosave<GearInspectorAutosavePayload>(
    resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR),
  )
  const sfcSavedAt = sfc && typeof sfc.payload.AutosaveSavedAt === 'string' ? sfc.payload.AutosaveSavedAt : null
  const gearSavedAt = gear && typeof gear.payload.SavedAt === 'string' ? gear.payload.SavedAt : null
  return {
    savedAt: sfcSavedAt ?? gearSavedAt,
    recipeCount: sfc && Array.isArray(sfc.payload.Recipes) ? sfc.payload.Recipes.length : null,
    gearItemCount: gear && typeof gear.payload.ItemCount === 'number' ? gear.payload.ItemCount : null,
  }
}
