/**
 * themeModePreference.ts
 *
 * Persists the light/dark theme mode preference in localStorage.
 */
import { THEME_MODE_KEY, type ThemeMode } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FALLBACK: ThemeMode = 'dark'

const parseThemeMode = (raw: string | null): ThemeMode =>
  raw === 'dark' || raw === 'light' ? raw : FALLBACK

const themeModeStore = createLocalStorageStore<ThemeMode>({
  key: THEME_MODE_KEY,
  fallback: FALLBACK,
  parse: parseThemeMode,
  serialize: (value) => value,
})

export const useThemeModePreference = createLocalStorageStateHook(themeModeStore)
