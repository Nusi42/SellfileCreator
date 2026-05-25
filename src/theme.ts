import { alpha, createTheme, darken } from '@mui/material/styles'
import type { ColorBlindMode, ThemeMode } from './lib/constants'
import {
  FONT_SIZE_BASE_PX,
  FONT_SIZE_BASE_REM,
  FONT_SIZE_SECONDARY_PX,
  FONT_SIZE_SECONDARY_REM,
  FONT_SIZE_TITLE_REM,
} from './lib/constants'
/**
 * makeTheme
 *
 * Generates the MUI theme using a color-blind aware palette when requested.
 * Why: Many components rely on `success` / `warning` / `error` semantic tokens.
 * Switching these here updates the whole app without touching call sites.
 * themeMode controls the overall light/dark color scheme (testing toggle).
 */
export function makeTheme(colorBlindMode: ColorBlindMode, themeMode: ThemeMode = 'dark') {
  // Okabe–Ito colors (deuter/protan friendly)
  const OI = { success: '#0072B2', warning: '#E69F00', error: '#D55E00' }
  // Tritan-friendly alternative (avoid blue/yellow pairing): green/orange/magenta
  const TR = { success: '#009E73', warning: '#E69F00', error: '#CC79A7' }

  // Select palette overrides based on color-blind mode
  const over = colorBlindMode === 'okabeIto'
    ? { success: { main: OI.success, contrastText: '#fff' }, warning: { main: OI.warning, contrastText: '#000' }, error: { main: OI.error, contrastText: '#fff' } }
    : colorBlindMode === 'tritan'
    ? { success: { main: TR.success, contrastText: '#fff' }, warning: { main: TR.warning, contrastText: '#000' }, error: { main: TR.error, contrastText: '#000' } }
    : {}

  const isDark = themeMode === 'dark'

  return createTheme({
    palette: {
      mode: themeMode,
      primary: { main: isDark ? '#58a6ff' : '#0969da' },
      background: isDark
        ? { default: '#0f1216', paper: '#161b22' }
        : { default: '#f2f2f2', paper: '#f7f7f7' },
      divider: isDark ? '#30363d' : '#d0d7de',
      // Tint the selected state with the primary blue in light mode only; dark mode keeps MUI's default gray.
      ...(!isDark && {
        action: { selected: 'rgba(9,105,218,0.12)', selectedOpacity: 0.12 },
      }),
      ...over,
    },
    shape: { borderRadius: 8 },
    typography: {
      fontSize: FONT_SIZE_BASE_PX,
      body1: { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      body2: { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      subtitle2: { fontSize: `${FONT_SIZE_BASE_REM}rem`, fontWeight: 600 },
      caption: { fontSize: `${FONT_SIZE_SECONDARY_REM}rem` },
      button: { fontSize: `${FONT_SIZE_BASE_REM}rem`, textTransform: 'none' },
      h6: { fontSize: `${FONT_SIZE_TITLE_REM}rem`, fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { variant: 'contained' },
        styleOverrides: {
          sizeSmall: {
            // Keep small buttons legible in every language by matching the base body size.
            fontSize: `${FONT_SIZE_BASE_REM}rem`,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: ({ theme }) => ({ border: `1px solid ${theme.palette.divider}` }) } },
      MuiAlert: {
        styleOverrides: {
          // Darken filled success alerts globally so toast surfaces are less neon/bright.
          // MUI v9: filledSuccess was removed; scope colorSuccess to the filled variant via a nested selector.
          colorSuccess: ({ theme }) => ({
            '&.MuiAlert-filled': {
              backgroundColor: darken(theme.palette.success.main, 0.42),
              color: theme.palette.success.contrastText,
              border: `1px solid ${alpha(theme.palette.success.light, 0.35)}`,
            },
          }),
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          placement: 'top-start',
          // Tooltips are informational only, so keep them non-interactive to ensure they dismiss on hover-out.
          disableInteractive: true,
          // Do not follow cursor globally; enable explicitly only where needed.
          // Keep tooltips within the viewport and avoid expanding the page
          // when used inside scrollable containers (chips panel, tables).
          // Why: Popper positioned elements can extend beyond the document and
          // trigger global scrollbars if not constrained. Using preventOverflow
          // with a viewport boundary keeps tooltips visible without altering layout.
          slotProps: {
            popper: {
              modifiers: [
                { name: 'offset', options: { offset: [0, 8] } },
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
            // Scale tooltip content to match #root zoom so it doesn't appear oversized in
            // forced-SBS mode. The arrow inherits this zoom as a descendant — no extra rule needed.
            zoom: 'var(--app-zoom, 1)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontSize: `${FONT_SIZE_TITLE_REM}rem`, fontWeight: 600 },
        },
      },
      MuiDialog: {
        defaultProps: {
          closeAfterTransition: false,
          // MUI v9: TransitionProps removed; use slotProps.transition instead.
          slotProps: {
            transition: {
              timeout: { appear: 0, enter: 0, exit: 150 },
              unmountOnExit: true,
            },
          },
        },
        styleOverrides: {
          // Scale dialog paper to match #root zoom in forced-SBS mode. The modal backdrop and
          // container stay unzoomed so MUI's centering logic is unaffected.
          // MUI v9 moved tabIndex=-1 to the paper (was on the container in v5/v6); suppress
          // the browser focus ring so the paper doesn't show a white outline on open.
          paper: { zoom: 'var(--app-zoom, 1)', outline: 0 },
        },
      },
      MuiMenu: {
        defaultProps: {
          slotProps: { root: { closeAfterTransition: false } },
        },
      },
      MuiPopover: {
        defaultProps: {
          slotProps: { root: { closeAfterTransition: false } },
        },
        styleOverrides: {
          // Use CSS `scale` (not `zoom`) for forced-SBS mode scaling. `zoom` shrinks
          // offsetWidth/offsetHeight, causing MUI's overflow-clamp logic to under-correct
          // and shift the menu right by ~42 px. `scale` is visual-only — offsetWidth stays
          // at natural size so positioning math is unaffected. `transformOrigin: top left`
          // overrides the inline transformOrigin MUI writes for animation so the paper
          // anchors at its CSS top-left corner rather than drifting.
          paper: {
            scale: 'var(--app-zoom, 1)',
            transformOrigin: 'top left !important',
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          // Same `scale` approach as MuiPopover — Autocomplete paper is positioned by
          // Popper.js on the container, not the paper, but offsetWidth still matters for
          // viewport-overflow detection inside the listbox paper.
          paper: {
            scale: 'var(--app-zoom, 1)',
            transformOrigin: 'top left !important',
          },
        },
      },
      MuiSlider: {
        styleOverrides: {
          // Tighten mark labels toward the track — the default MUI gap is too large.
          markLabel: { fontSize: '0.75rem', marginTop: -4 },
          // Taller marks so they're visible next to the compact rail.
          mark: { height: 8 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          // MUI ToggleButton ignores action.selected — it derives selected bg from text.primary,
          // which stays gray. Force primary-blue tint for the selected state instead.
          root: ({ theme }) => theme.palette.mode === 'light' ? {
            '&.Mui-selected': {
              color: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity),
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity + 0.08),
              },
            },
          } : {},
        },
      },
    },
  })
}

// Default theme for environments that import the default export directly
const theme = makeTheme('normal', 'dark')
export default theme
/**
 * theme.ts
 *
 * Central Material UI theme (dark mode) used by the app.
 */
