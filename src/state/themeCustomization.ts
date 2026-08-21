/**
 * themeCustomization.ts
 *
 * Persists per-element theme color overrides (accent, background) in localStorage.
 */
import { EMPTY_THEME_CUSTOMIZATION, THEME_CUSTOM_KEY, type ThemeCustomization } from '../lib/constants'
import { createLocalStorageStateHook, createLocalStorageStore } from './localStorageStore'

const FALLBACK: ThemeCustomization = EMPTY_THEME_CUSTOMIZATION

const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// Font families are free-form CSS font-family values. Accept any non-empty string up to a
// sane cap; reject control chars and the obvious injection risks (`<`, `{`, `;`) so the value
// can be dropped straight into typography.fontFamily without being able to break out of it.
const isFontFamily = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 200 && !/[<>{};]/.test(v)

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
        frameGoldColor: isHexColor(p.frameGoldColor) ? p.frameGoldColor : null,
        titleGoldColor: isHexColor(p.titleGoldColor) ? p.titleGoldColor : null,
        successColor:  isHexColor(p.successColor)  ? p.successColor  : null,
        warningColor:  isHexColor(p.warningColor)  ? p.warningColor  : null,
        errorColor:    isHexColor(p.errorColor)    ? p.errorColor    : null,
        infoColor:     isHexColor(p.infoColor)     ? p.infoColor     : null,
        textPrimaryColor:   isHexColor(p.textPrimaryColor)   ? p.textPrimaryColor   : null,
        textSecondaryColor: isHexColor(p.textSecondaryColor) ? p.textSecondaryColor : null,
        textDisabledColor:  isHexColor(p.textDisabledColor)  ? p.textDisabledColor  : null,
        uiFontFamily:   isFontFamily(p.uiFontFamily)   ? p.uiFontFamily   : null,
        codeFontFamily: isFontFamily(p.codeFontFamily) ? p.codeFontFamily : null,
        scrollbarThumbColor: isHexColor(p.scrollbarThumbColor) ? p.scrollbarThumbColor : null,
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
  // Compare every field so the store skips no-op writes. Keep in sync with ThemeCustomization.
  equals: (a, b) =>
    a.primaryColor   === b.primaryColor   && a.toggleColor    === b.toggleColor    &&
    a.selectionColor === b.selectionColor &&
    a.bgColor        === b.bgColor        && a.paperColor     === b.paperColor     &&
    a.dividerColor   === b.dividerColor   &&
    a.frameGoldColor === b.frameGoldColor && a.titleGoldColor === b.titleGoldColor &&
    a.successColor   === b.successColor   && a.warningColor   === b.warningColor   && a.errorColor === b.errorColor &&
    a.infoColor      === b.infoColor      &&
    a.textPrimaryColor   === b.textPrimaryColor   && a.textSecondaryColor === b.textSecondaryColor &&
    a.textDisabledColor  === b.textDisabledColor  &&
    a.uiFontFamily   === b.uiFontFamily   && a.codeFontFamily === b.codeFontFamily &&
    a.scrollbarThumbColor === b.scrollbarThumbColor &&
    a.borderRadius   === b.borderRadius   && a.selectionOpacity === b.selectionOpacity,
})

export const useThemeCustomization = createLocalStorageStateHook(themeCustomStore)
