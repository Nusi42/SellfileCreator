/**
 * themeModePreference.ts
 *
 * Persists the light/dark theme MODE in localStorage. This store backs MUI's modeStorageKey
 * and is owned by MUI's useColorScheme() — the dark/light machinery is untouched.
 *
 * RSLH is layered on top as a SEPARATE flag (below). RSLH is not a mode: it renders on the dark
 * base with the RSLH value-set merged into ThemeCustomization (see rslhPreset.ts + main.tsx).
 * Keeping it out of MUI's mode key is deliberate — MUI only understands light/dark/system, and
 * coupling RSLH into that path previously broke the dark theme.
 */
import { RSLH_ENABLED_KEY, THEME_MODE_KEY } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

// MUI mode is only ever light/dark here (parser rejects anything else → dark fallback).
const FALLBACK: 'dark' | 'light' = 'dark'

const parseThemeMode = (raw: string | null): 'dark' | 'light' =>
  raw === 'dark' || raw === 'light' ? raw : FALLBACK

const themeModeStore = createLocalStorageStore<'dark' | 'light'>({
  key: THEME_MODE_KEY,
  fallback: FALLBACK,
  parse: parseThemeMode,
  serialize: (value) => value,
})

export const useThemeModePreference = createLocalStorageStateHook(themeModeStore)

// ─── RSLH flag (additive; does not touch MUI's dark/light path) ─────────────────
const rslhEnabledStore = createLocalStorageStore<boolean>({
  key: RSLH_ENABLED_KEY,
  fallback: false,
  parse: (raw) => raw === 'true',
  serialize: (value) => (value ? 'true' : null), // null → key removed when false (default)
})

// Reactive read of the RSLH flag. main.tsx gates the preset merge on it; the popout reads it
// to render the RSLH toggle as selected.
export function useRslhEnabled(): boolean {
  return rslhEnabledStore.useValue()
}

// Imperative setter for the popout toggle (paired with MUI's setMode('dark') in the menu).
export function setRslhEnabled(on: boolean): void {
  rslhEnabledStore.set(on)
}
