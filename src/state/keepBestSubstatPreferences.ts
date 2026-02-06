/**
 * keepBestSubstatPreferences.ts
 *
 * Keep Best Substat owns a tiny set of UI toggles (grid filter + columns).
 * This module persists those toggles via the shared localStorage helpers
 * so reopening the dialog restores the last scope automatically.
 */
import { KEEP_BEST_SUBSTAT_GRID_COLUMNS_KEY, KEEP_BEST_SUBSTAT_GRID_FILTER_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type KeepBestSubstatGridFilterMode = 'all' | 'selection'
export type KeepBestSubstatGridColumnMode = 1 | 2

export const sanitizeKeepBestSubstatGridFilterMode = (raw: unknown): KeepBestSubstatGridFilterMode => (
  raw === 'selection' ? 'selection' : 'all'
)
export const sanitizeKeepBestSubstatGridColumnMode = (raw: unknown): KeepBestSubstatGridColumnMode => (
  raw === 2 || raw === '2' ? 2 : 1
)

const keepBestSubstatGridFilterStore = createLocalStorageStore<KeepBestSubstatGridFilterMode>({
  key: KEEP_BEST_SUBSTAT_GRID_FILTER_KEY,
  fallback: 'all',
  parse: (raw) => sanitizeKeepBestSubstatGridFilterMode(raw ?? null),
  serialize: (value) => sanitizeKeepBestSubstatGridFilterMode(value),
})
const keepBestSubstatGridColumnsStore = createLocalStorageStore<KeepBestSubstatGridColumnMode>({
  key: KEEP_BEST_SUBSTAT_GRID_COLUMNS_KEY,
  // Default to 1 column so the rule list can stay wider until users opt in.
  fallback: 1,
  parse: (raw) => sanitizeKeepBestSubstatGridColumnMode(raw ?? null),
  // Persist as a string so localStorage round-trips stay stable.
  serialize: (value) => String(sanitizeKeepBestSubstatGridColumnMode(value)),
})

export const useKeepBestSubstatGridFilterMode = createLocalStorageStateHook(keepBestSubstatGridFilterStore)
export const useKeepBestSubstatGridColumnMode = createLocalStorageStateHook(keepBestSubstatGridColumnsStore)
