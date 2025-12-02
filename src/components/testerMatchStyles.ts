import { alpha, type Theme } from '@mui/material/styles'

type BorderColorOptions = { dimmed?: boolean }

// Shared keep/sell border helper keeps tester chips aligned across primary and overflow rows.
export function getTesterMatchBorderColor(theme: Theme, keep: boolean, options?: BorderColorOptions): string {
  const baseColor = keep ? theme.palette.success.main : theme.palette.error.main
  const shouldDim = Boolean(options?.dimmed)
  if (!shouldDim) return baseColor
  const dimAlpha = theme.palette.mode === 'dark' ? 0.65 : 0.6
  return alpha(baseColor, dimAlpha)
}
