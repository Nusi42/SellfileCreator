/**
 * keepUniquesPreferences.ts
 *
 * Keep Uniques owns a tiny set of UI toggles (currently just the grid filter
 * button). This module persists those toggles via the shared localStorage
 * store helpers so reopening the dialog restores the last scope automatically.
 */
import { KEEP_UNIQUES_GRID_FILTER_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type KeepUniquesGridFilterMode = 'all' | 'selection'

export const sanitizeKeepUniquesGridFilterMode = (raw: unknown): KeepUniquesGridFilterMode => (
  raw === 'selection' ? 'selection' : 'all'
)

const keepUniquesGridFilterStore = createLocalStorageStore<KeepUniquesGridFilterMode>({
  key: KEEP_UNIQUES_GRID_FILTER_KEY,
  fallback: 'all',
  parse: (raw) => sanitizeKeepUniquesGridFilterMode(raw ?? null),
  serialize: (value) => sanitizeKeepUniquesGridFilterMode(value),
})

export const useKeepUniquesGridFilterMode = createLocalStorageStateHook(keepUniquesGridFilterStore)
