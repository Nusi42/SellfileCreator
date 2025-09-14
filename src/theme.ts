import { createTheme } from '@mui/material/styles'
import type { ColorBlindMode } from './lib/constants'
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
    components: {
      MuiButton: { defaultProps: { variant: 'contained' } },
      MuiPaper: { styleOverrides: { root: { border: '1px solid #30363d' } } },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          placement: 'top-start',
          // Do not follow cursor globally; enable explicitly only where needed.
          slotProps: { popper: { modifiers: [{ name: 'offset', options: { offset: [0, 8] } }] } },
        },
        styleOverrides: { tooltip: { fontSize: '12px' } },
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
