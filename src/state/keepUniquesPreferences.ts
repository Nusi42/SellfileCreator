/**
 * keepUniquesPreferences.ts
 *
 * Keep Uniques owns a tiny set of UI toggles (grid filter + columns).
 * This module persists those toggles via the shared localStorage helpers
 * so reopening the dialog restores the last scope automatically.
 */
import { KEEP_UNIQUES_GRID_COLUMNS_KEY, KEEP_UNIQUES_GRID_FILTER_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type KeepUniquesGridFilterMode = 'all' | 'selection'
export type KeepUniquesGridColumnMode = 1 | 2

export const sanitizeKeepUniquesGridFilterMode = (raw: unknown): KeepUniquesGridFilterMode => (
  raw === 'selection' ? 'selection' : 'all'
)
export const sanitizeKeepUniquesGridColumnMode = (raw: unknown): KeepUniquesGridColumnMode => (
  raw === 2 || raw === '2' ? 2 : 1
)

const keepUniquesGridFilterStore = createLocalStorageStore<KeepUniquesGridFilterMode>({
  key: KEEP_UNIQUES_GRID_FILTER_KEY,
  fallback: 'all',
  parse: (raw) => sanitizeKeepUniquesGridFilterMode(raw ?? null),
  serialize: (value) => sanitizeKeepUniquesGridFilterMode(value),
})
const keepUniquesGridColumnsStore = createLocalStorageStore<KeepUniquesGridColumnMode>({
  key: KEEP_UNIQUES_GRID_COLUMNS_KEY,
  // Default to 1 column so the rule list can stay wider until users opt in.
  fallback: 1,
  parse: (raw) => sanitizeKeepUniquesGridColumnMode(raw ?? null),
  // Persist as a string so localStorage round-trips stay stable.
  serialize: (value) => String(sanitizeKeepUniquesGridColumnMode(value)),
})

export const useKeepUniquesGridFilterMode = createLocalStorageStateHook(keepUniquesGridFilterStore)
export const useKeepUniquesGridColumnMode = createLocalStorageStateHook(keepUniquesGridColumnsStore)
