/**
 * setsOrderPreference.ts
 *
 * Shared Sets ordering preference across Builder and Rules Filter panels.
 */
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'
import { SETS_ORDER_KEY } from '../lib/constants'

export type SetsOrder = 'game' | 'az' | 'icons'

const FALLBACK: SetsOrder = 'icons'

const setsOrderStore = createLocalStorageStore<SetsOrder>({
  key: SETS_ORDER_KEY,
  fallback: FALLBACK,
  parse: (raw) => (raw === 'game' || raw === 'az' || raw === 'icons' ? raw : FALLBACK),
  serialize: (value) => value,
})

export const useSetsOrderPreference = createLocalStorageStateHook(setsOrderStore)

export function getSetsOrderPreference(): SetsOrder {
  return setsOrderStore.getSnapshot()
}
