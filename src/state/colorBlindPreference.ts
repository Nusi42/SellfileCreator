/**
 * colorBlindPreference.ts
 *
 * Centralizes the color-blind mode preference.
 */
import { COLOR_BLIND_MODE_KEY, type ColorBlindMode } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FALLBACK: ColorBlindMode = 'normal'

const parseColorBlindMode = (raw: string | null): ColorBlindMode => {
  if (raw === 'colorblind') return 'okabeIto'
  return raw === 'normal' || raw === 'okabeIto' || raw === 'tritan' ? raw : FALLBACK
}

const colorBlindStore = createLocalStorageStore<ColorBlindMode>({
  key: COLOR_BLIND_MODE_KEY,
  fallback: FALLBACK,
  parse: parseColorBlindMode,
  serialize: (value) => value,
})

export const useColorBlindPreference = createLocalStorageStateHook(colorBlindStore)
