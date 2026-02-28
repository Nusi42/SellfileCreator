import { alpha, type Theme } from '@mui/material/styles'

type BorderColorOptions = { dimmed?: boolean }
type SurfaceColorOptions = { dimmed?: boolean }

// Shared keep/sell border helper keeps Gear Inspector chips aligned across primary and overflow rows.
export function getGearInspectorMatchBorderColor(theme: Theme, keep: boolean, options?: BorderColorOptions): string {
  const baseColor = keep ? theme.palette.success.main : theme.palette.error.main
  const shouldDim = Boolean(options?.dimmed)
  if (!shouldDim) return baseColor
  const dimAlpha = theme.palette.mode === 'dark' ? 0.65 : 0.6
  return alpha(baseColor, dimAlpha)
}

// Shared keep/sell surface helper keeps first/other match chips visually aligned.
export function getGearInspectorMatchSurfaceColors(theme: Theme, keep: boolean, options?: SurfaceColorOptions): {
  surface: string
  hover: string
} {
  const baseColor = keep ? theme.palette.success.main : theme.palette.error.main
  // Keep tint subtle so chips read as a midpoint between neutral paper and full card tint.
  const baseSurfaceAlpha = theme.palette.mode === 'dark' ? 0.05 : 0.01
  const baseHoverAlpha = theme.palette.mode === 'dark' ? 0.50 : 0.13
  const dimFactor = options?.dimmed ? 0.85 : 1
  return {
    surface: alpha(baseColor, baseSurfaceAlpha * dimFactor),
    hover: alpha(baseColor, baseHoverAlpha * dimFactor),
  }
}
