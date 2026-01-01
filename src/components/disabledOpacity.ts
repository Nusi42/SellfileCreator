import type { Theme } from '@mui/material/styles'

// MUI's documented fallback keeps dimming consistent when themes omit disabledOpacity.
export const DEFAULT_DISABLED_OPACITY = 0.38

// Read disabledOpacity from the theme when available so app dimming matches MUI defaults.
export const resolveDisabledOpacity = (theme: Theme): number => {
  // Cache the palette value once to keep the return logic terse.
  const themeOpacity = theme.palette.action.disabledOpacity
  // Treat missing values as the MUI default.
  return typeof themeOpacity === 'number' ? themeOpacity : DEFAULT_DISABLED_OPACITY
}
