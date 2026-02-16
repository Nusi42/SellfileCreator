/**
 * safeguardsPreferences.ts
 *
 * Safeguards owns a tiny set of UI toggles (grid filter + columns).
 * This module persists those toggles via the shared localStorage helpers
 * so reopening the dialog restores the last scope automatically.
 */
import { SAFEGUARDS_GRID_COLUMNS_KEY, SAFEGUARDS_GRID_FILTER_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

export type SafeguardsGridFilterMode = 'all' | 'selection'
export type SafeguardsGridColumnMode = 1 | 2

export const sanitizeSafeguardsGridFilterMode = (raw: unknown): SafeguardsGridFilterMode => (
  raw === 'selection' ? 'selection' : 'all'
)
export const sanitizeSafeguardsGridColumnMode = (raw: unknown): SafeguardsGridColumnMode => (
  raw === 2 || raw === '2' ? 2 : 1
)

const safeguardsGridFilterStore = createLocalStorageStore<SafeguardsGridFilterMode>({
  key: SAFEGUARDS_GRID_FILTER_KEY,
  fallback: 'all',
  parse: (raw) => sanitizeSafeguardsGridFilterMode(raw ?? null),
  serialize: (value) => sanitizeSafeguardsGridFilterMode(value),
})
const safeguardsGridColumnsStore = createLocalStorageStore<SafeguardsGridColumnMode>({
  key: SAFEGUARDS_GRID_COLUMNS_KEY,
  // Default to 1 column so the rule list can stay wider until users opt in.
  fallback: 1,
  parse: (raw) => sanitizeSafeguardsGridColumnMode(raw ?? null),
  // Persist as a string so localStorage round-trips stay stable.
  serialize: (value) => String(sanitizeSafeguardsGridColumnMode(value)),
})

export const useSafeguardsGridFilterMode = createLocalStorageStateHook(safeguardsGridFilterStore)
export const useSafeguardsGridColumnMode = createLocalStorageStateHook(safeguardsGridColumnsStore)
