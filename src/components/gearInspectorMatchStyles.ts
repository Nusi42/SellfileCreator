import type { Theme } from '@mui/material/styles'

// No isDark/isLight checks here — all alpha values live in CSS custom properties
// (APP_SCHEME_ALPHAS) injected by GlobalStyles. Components read theme.custom tokens
// which reference those vars so colors adapt at the CSS level without re-renders.

// Shared keep/sell border helper. Returns the full border color for a match chip.
// Non-dimmed: return the scheme-adaptive palette CSS variable directly.
// Dimmed: return the scheme-adaptive CSS channel token (lower alpha).
export function getGearInspectorMatchBorderColor(theme: Theme, keep: boolean, options?: { dimmed?: boolean }): string {
  if (!options?.dimmed) {
    // theme.vars.palette.xxx.main is the CSS variable reference — resolves per scheme.
    // Fallback to theme.palette.* for non-CSS-vars environments (should not occur in practice).
    return keep
      ? (theme.vars?.palette.success.main ?? theme.palette.success.main)
      : (theme.vars?.palette.error.main ?? theme.palette.error.main)
  }
  return keep ? theme.custom.matchKeepBorderDim : theme.custom.matchSellBorderDim
}

// Shared keep/sell surface + hover helper. Both values are CSS channel token strings
// that resolve to the correct scheme alpha without any isDark check in callers.
export function getGearInspectorMatchSurfaceColors(theme: Theme, keep: boolean, options?: { dimmed?: boolean }): {
  surface: string
  hover: string
} {
  if (options?.dimmed) {
    return keep
      ? { surface: theme.custom.matchKeepSurfaceDim, hover: theme.custom.matchKeepHoverDim }
      : { surface: theme.custom.matchSellSurfaceDim, hover: theme.custom.matchSellHoverDim }
  }
  return keep
    ? { surface: theme.custom.matchKeepSurface, hover: theme.custom.matchKeepHover }
    : { surface: theme.custom.matchSellSurface, hover: theme.custom.matchSellHover }
}
