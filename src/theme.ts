import { alpha, createTheme, darken } from '@mui/material/styles'
import type { ColorBlindMode } from './lib/constants'
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
 */
export function makeTheme(mode: ColorBlindMode) {
  // Okabe–Ito colors (deuter/protan friendly)
  const OI = { success: '#0072B2', warning: '#E69F00', error: '#D55E00' }
  // Tritan-friendly alternative (avoid blue/yellow pairing): green/orange/magenta
  const TR = { success: '#009E73', warning: '#E69F00', error: '#CC79A7' }

  // Select palette overrides based on mode
  const over = mode === 'okabeIto'
    ? { success: { main: OI.success, contrastText: '#fff' }, warning: { main: OI.warning, contrastText: '#000' }, error: { main: OI.error, contrastText: '#fff' } }
    : mode === 'tritan'
    ? { success: { main: TR.success, contrastText: '#fff' }, warning: { main: TR.warning, contrastText: '#000' }, error: { main: TR.error, contrastText: '#000' } }
    : {}

  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#58a6ff' },
      background: { default: '#0f1216', paper: '#161b22' },
      divider: '#30363d',
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
      MuiPaper: { styleOverrides: { root: { border: '1px solid #30363d' } } },
      MuiAlert: {
        styleOverrides: {
          // Darken filled success alerts globally so toast surfaces are less neon/bright.
          filledSuccess: ({ theme }) => ({
            backgroundColor: darken(theme.palette.success.main, 0.42),
            color: theme.palette.success.contrastText,
            border: `1px solid ${alpha(theme.palette.success.light, 0.35)}`,
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
          TransitionProps: {
            timeout: { appear: 0, enter: 0, exit: 150 },
            unmountOnExit: true,
          },
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
      },
      MuiSlider: {
        styleOverrides: {
          // Tighten mark labels toward the track — the default MUI gap is too large.
          markLabel: { fontSize: '0.75rem', marginTop: -4 },
          // Taller marks so they're visible next to the compact rail.
          mark: { height: 8 },
        },
      },
    },
  })
}

// Default theme for environments that import the default export directly
const theme = makeTheme('normal')
export default theme
/**
 * theme.ts
 *
 * Central Material UI theme (dark mode) used by the app.
 */
