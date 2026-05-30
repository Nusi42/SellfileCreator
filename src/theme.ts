/**
 * theme.ts
 *
 * Builds the MUI CSS-variables theme. Using colorSchemes (dark + light) so scheme
 * switching via useColorScheme() only toggles the data-mui-color-scheme attribute
 * — no React re-renders, no emotion CSS regeneration, no 13-second UI freeze.
 *
 * themeMode is NO LONGER a parameter here. The active scheme is handled entirely
 * by MUI's ThemeProvider (reads/writes modeStorageKey in localStorage).
 */
import { alpha, createTheme, darken, lighten } from '@mui/material/styles'
import type { ColorBlindMode, ThemeCustomization } from './lib/constants'
import {
  FONT_SIZE_BASE_PX,
  FONT_SIZE_BASE_REM,
  FONT_SIZE_SECONDARY_PX,
  FONT_SIZE_SECONDARY_REM,
  FONT_SIZE_TITLE_REM,
} from './lib/constants'
import { CUSTOM_TOKENS } from './lib/themeCustomTokens'

const EMPTY_CUSTOM: ThemeCustomization = { primaryColor: null, toggleColor: null, selectionColor: null, bgColor: null, paperColor: null, dividerColor: null, successColor: null, warningColor: null, errorColor: null, borderRadius: null, selectionOpacity: null }

// Builds per-scheme palette options. Called twice (dark, light) so both colorSchemes
// receive their full palette including custom overrides and color-blind alternatives.
function buildSchemePalette(isDark: boolean, colorBlindMode: ColorBlindMode, custom: ThemeCustomization) {
  // Okabe–Ito (deuter/protan friendly)
  const OI = { success: '#0072B2', warning: '#E69F00', error: '#D55E00' }
  // Tritan-friendly (avoid blue/yellow pairing)
  const TR = { success: '#009E73', warning: '#E69F00', error: '#CC79A7' }

  const over = colorBlindMode === 'okabeIto'
    ? { success: { main: OI.success, contrastText: '#fff' }, warning: { main: OI.warning, contrastText: '#000' }, error: { main: OI.error, contrastText: '#fff' } }
    : colorBlindMode === 'tritan'
    ? { success: { main: TR.success, contrastText: '#fff' }, warning: { main: TR.warning, contrastText: '#000' }, error: { main: TR.error, contrastText: '#000' } }
    : {}

  const primaryMain = custom.primaryColor ?? (isDark ? '#58a6ff' : '#0969da')
  const defaultBg    = isDark ? '#0f1216' : '#f2f2f2'
  const defaultPaper = isDark ? '#161b22' : '#f7f7f7'
  const bgDefault    = custom.bgColor ?? defaultBg
  const bgPaperDerived = custom.bgColor != null
    ? (isDark ? lighten(bgDefault, 0.06) : darken(bgDefault, 0.03))
    : defaultPaper
  const bgPaper = custom.paperColor ?? bgPaperDerived

  const selColor   = custom.selectionColor ?? (isDark ? '#ffffff' : primaryMain)
  const selOpacity = custom.selectionOpacity ?? (isDark ? 0.16 : 0.12)

  return {
    primary: { main: primaryMain },
    background: { default: bgDefault, paper: bgPaper },
    divider: custom.dividerColor ?? (isDark ? '#30363d' : '#d0d7de'),
    action: { selected: alpha(selColor, selOpacity), selectedOpacity: selOpacity },
    ...over,
    // Pre-set Alert.successFilledColor before MUI's setColor() runs.
    // MUI computes this from getContrastText(success.dark) — dark green → white — but
    // v1.0.13 used getContrastText(success.main) = rgba(0,0,0,0.87).  setColor() only
    // writes when the key is absent, so pre-setting it here locks in the correct value.
    ...(isDark ? { Alert: { successFilledColor: 'rgba(0,0,0,0.87)' } } : {}),
    ...(custom.successColor != null && { success: { main: custom.successColor } }),
    ...(custom.warningColor != null && { warning: { main: custom.warningColor } }),
    ...(custom.errorColor   != null && { error:   { main: custom.errorColor   } }),
  }
}

export function makeTheme(colorBlindMode: ColorBlindMode, custom: ThemeCustomization = EMPTY_CUSTOM) {
  const darkPalette  = buildSchemePalette(true,  colorBlindMode, custom)
  const lightPalette = buildSchemePalette(false, colorBlindMode, custom)

  return createTheme({
    // colorSchemeSelector: Without this, MUI defaults to 'media' when both dark and
    // light colorSchemes are provided — which ignores setMode() entirely and always
    // follows the OS preference. We need data-attribute toggling for the manual toggle.
    cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
    colorSchemes: {
      dark:  { palette: darkPalette  },
      light: { palette: lightPalette },
    },
    shape: { borderRadius: custom.borderRadius ?? 8 },
    typography: {
      fontSize: FONT_SIZE_BASE_PX,
      body1:    { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      body2:    { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      subtitle2:{ fontSize: `${FONT_SIZE_BASE_REM}rem`, fontWeight: 600 },
      caption:  { fontSize: `${FONT_SIZE_SECONDARY_REM}rem` },
      button:   { fontSize: `${FONT_SIZE_BASE_REM}rem`, textTransform: 'none' },
      h6:       { fontSize: `${FONT_SIZE_TITLE_REM}rem`, fontWeight: 600 },
    },
    custom: CUSTOM_TOKENS,
    components: {
      MuiButton: {
        defaultProps: { variant: 'contained' },
        styleOverrides: {
          sizeSmall: { fontSize: `${FONT_SIZE_BASE_REM}rem` },
        },
      },
      MuiPaper: { styleOverrides: { root: ({ theme }) => ({ border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}` }) } },
      MuiAlert: {
        styleOverrides: {
          // Darken filled success alerts so toast surfaces are less neon/bright.
          // applyStyles('dark') provides correct dark-scheme values since theme.palette.*
          // always reflects the light-scheme hex in MUI v9 CSS variables mode.
          colorSuccess: ({ theme }) => ({
            '&.MuiAlert-filled': {
              backgroundColor: darken(theme.palette.success.main, 0.42),
              border: `1px solid ${alpha(theme.palette.success.light, 0.35)}`,
              ...theme.applyStyles('dark', {
                backgroundColor: darken(theme.colorSchemes.dark?.palette.success?.main ?? theme.palette.success.main, 0.42),
                border: `1px solid ${alpha(theme.colorSchemes.dark?.palette.success?.light ?? theme.palette.success.light, 0.35)}`,
              }),
            },
          }),
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          placement: 'top-start',
          disableInteractive: true,
          slotProps: {
            popper: {
              modifiers: [
                { name: 'offset',          options: { offset: [0, 8] } },
                { name: 'preventOverflow', options: { boundary: 'viewport', altAxis: true, tether: true } },
              ],
            },
          },
        },
        styleOverrides: {
          tooltip: {
            fontSize: `${FONT_SIZE_SECONDARY_PX}px`,
            maxWidth: 640,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
            // Scale tooltip content to match #root zoom in forced-SBS mode.
            zoom: 'var(--app-zoom, 1)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { fontSize: `${FONT_SIZE_TITLE_REM}rem`, fontWeight: 600 } },
      },
      MuiDialog: {
        defaultProps: {
          closeAfterTransition: false,
          slotProps: {
            transition: { timeout: { appear: 0, enter: 0, exit: 150 }, unmountOnExit: true },
          },
        },
        styleOverrides: {
          // Scale dialog paper to match #root zoom in forced-SBS mode.
          paper: { zoom: 'var(--app-zoom, 1)', outline: 0 },
        },
      },
      MuiMenu: {
        defaultProps: { slotProps: { root: { closeAfterTransition: false } } },
      },
      MuiPopover: {
        defaultProps: { slotProps: { root: { closeAfterTransition: false } } },
        styleOverrides: {
          // scale (not zoom) avoids shrinking offsetWidth so MUI's overflow-clamp is unaffected.
          // No transformOrigin override — MUI sets it via inline style per-menu based on anchor
          // position. Forcing 'top left !important' would break right-anchored menus in SBS zoom.
          paper: { scale: 'var(--app-zoom, 1)' },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { scale: 'var(--app-zoom, 1)' },
        },
      },
      MuiSlider: {
        styleOverrides: {
          markLabel: { fontSize: '0.75rem', marginTop: -4 },
          mark:      { height: 8 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          // applyStyles('light'/'dark') emits [data-mui-color-scheme] selectors so this
          // responds to scheme changes without React re-renders or palette.mode checks.
          // Base styles have NO selected-state overrides — each scheme applies its own via
          // applyStyles, leaving the other scheme to use MUI's natural defaults.
          root: ({ theme }) => {
            const tc = custom.toggleColor
            if (tc != null) {
              return {
                '&.Mui-selected': {
                  // Light: tint from custom toggleColor.
                  ...theme.applyStyles('light', {
                    color: tc,
                    backgroundColor: alpha(tc, lightPalette.action.selectedOpacity),
                    '&:hover': { backgroundColor: alpha(tc, lightPalette.action.selectedOpacity + 0.08) },
                  }),
                  // Dark: tint bg only; text stays text.primary (white) for readability.
                  ...theme.applyStyles('dark', {
                    color: 'inherit',
                    backgroundColor: alpha(tc, 0.2),
                    '&:hover': { backgroundColor: alpha(tc, 0.28) },
                  }),
                },
              }
            }
            // No custom toggleColor → light mode tints from primary; dark mode uses
            // MUI's default action.selected (rgba(255,255,255,0.08)) with no override.
            const toggleMain = lightPalette.primary.main
            return {
              '&.Mui-selected': {
                ...theme.applyStyles('light', {
                  color: toggleMain,
                  backgroundColor: alpha(toggleMain, lightPalette.action.selectedOpacity),
                  '&:hover': { backgroundColor: alpha(toggleMain, lightPalette.action.selectedOpacity + 0.08) },
                }),
                // Dark: no override → MUI's default gray selected highlight is preserved.
              },
            }
          },
        },
      },
    },
  })
}

// Default theme for environments that import the default export directly.
const theme = makeTheme('normal')
export default theme
