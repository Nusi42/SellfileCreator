/**
 * themeCustomization.ts
 *
 * Persists per-element theme color overrides (accent, background) in localStorage.
 */
import { THEME_CUSTOM_KEY, type ThemeCustomization } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FALLBACK: ThemeCustomization = { primaryColor: null, toggleColor: null, selectionColor: null, bgColor: null, paperColor: null, dividerColor: null, successColor: null, warningColor: null, errorColor: null, borderRadius: null, selectionOpacity: null }

const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

const parseThemeCustomization = (raw: string | null): ThemeCustomization => {
  if (!raw) return FALLBACK
  try {
    const p = JSON.parse(raw)
    if (p && typeof p === 'object') {
      return {
        primaryColor:    isHexColor(p.primaryColor)    ? p.primaryColor    : null,
        toggleColor:     isHexColor(p.toggleColor)     ? p.toggleColor     : null,
        selectionColor:  isHexColor(p.selectionColor)  ? p.selectionColor  : null,
        bgColor:       isHexColor(p.bgColor)       ? p.bgColor       : null,
        paperColor:    isHexColor(p.paperColor)    ? p.paperColor    : null,
        dividerColor:  isHexColor(p.dividerColor)  ? p.dividerColor  : null,
        successColor:  isHexColor(p.successColor)  ? p.successColor  : null,
        warningColor:  isHexColor(p.warningColor)  ? p.warningColor  : null,
        errorColor:    isHexColor(p.errorColor)    ? p.errorColor    : null,
        borderRadius:      typeof p.borderRadius      === 'number' && p.borderRadius      >= 0   && p.borderRadius      <= 24  ? p.borderRadius      : null,
        selectionOpacity:  typeof p.selectionOpacity  === 'number' && p.selectionOpacity  >= 0   && p.selectionOpacity  <= 0.5 ? p.selectionOpacity  : null,
      }
    }
  } catch {}
  return FALLBACK
}

export const themeCustomStore = createLocalStorageStore<ThemeCustomization>({
  key: THEME_CUSTOM_KEY,
  fallback: FALLBACK,
  parse: parseThemeCustomization,
  serialize: (v) => JSON.stringify(v),
  equals: (a, b) =>
    a.primaryColor   === b.primaryColor   && a.toggleColor    === b.toggleColor    &&
    a.selectionColor === b.selectionColor &&
    a.bgColor        === b.bgColor        && a.paperColor     === b.paperColor     &&
    a.dividerColor   === b.dividerColor   &&
    a.successColor   === b.successColor   && a.warningColor   === b.warningColor   && a.errorColor === b.errorColor &&
    a.borderRadius   === b.borderRadius   && a.selectionOpacity === b.selectionOpacity,
})

export const useThemeCustomization = createLocalStorageStateHook(themeCustomStore)
