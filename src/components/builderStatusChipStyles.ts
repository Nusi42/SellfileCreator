import type { SxProps, Theme } from '@mui/material/styles'
import { BUILDER_STATUS_CHIP_HEIGHT_PX, STATUS_CHIP_BORDER_RADIUS_PX } from '../lib/constants'
import { resolveDisabledOpacity } from './disabledOpacity'

interface BuilderStatusChipOptions {
  dimDisabled?: boolean
}

// Shared builder status chip styling so the Builder panel and cheat sheet stay visually aligned.
export function createBuilderStatusChipSx(theme: Theme) {
  const chipActiveBg = 'rgba(var(--mui-palette-success-mainChannel) / 0.18)'
  const chipActiveBgHover = 'rgba(var(--mui-palette-success-mainChannel) / 0.24)'
  // Active color defaults to the dark-palette variant; dark mode uses the lighter tint via applyStyles.
  const chipDisabledBg = (theme.vars?.palette.action.disabledBackground ?? theme.palette.action.disabledBackground) ?? 'rgba(var(--mui-palette-text-disabledChannel) / 0.12)'
  const chipDisabledColor = (theme.vars?.palette.text.disabled ?? theme.palette.text.disabled)
  // Keep the base opacity aligned with shared disabled UI dimming.
  const baseDisabledOpacity = resolveDisabledOpacity(theme)

  return (enabled: boolean, opts?: BuilderStatusChipOptions): SxProps<Theme> => {
    const shouldDimDisabled = Boolean(opts?.dimDisabled)
    const disabledOpacity = shouldDimDisabled ? baseDisabledOpacity : 1
    // chipDisabledColor is a CSS var reference; use channel tokens for alpha-based dimming.
    const dimmedDisabledColor = shouldDimDisabled
      ? `rgba(var(--mui-palette-text-disabledChannel) / ${baseDisabledOpacity})`
      : chipDisabledColor
    const dimmedDisabledIconColor = shouldDimDisabled
      ? `rgba(var(--mui-palette-text-disabledChannel) / ${Math.min(baseDisabledOpacity * 0.8, baseDisabledOpacity)})`
      : chipDisabledColor
    const dimmedDisabledBg = shouldDimDisabled ? 'rgba(var(--mui-palette-text-disabledChannel) / 0.08)' : chipDisabledBg

    const borderRadius = `${STATUS_CHIP_BORDER_RADIUS_PX}px`
    return {
      height: BUILDER_STATUS_CHIP_HEIGHT_PX,
      minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
      fontWeight: theme.typography.fontWeightMedium ?? 500,
      px: 0,
      backgroundColor: enabled ? chipActiveBg : dimmedDisabledBg,
      // Light-mode base uses the darker success tone; dark mode overrides to the lighter tint.
      color: enabled ? (theme.vars?.palette.success.dark ?? theme.palette.success.dark) : dimmedDisabledColor,
      borderRadius,
      overflow: 'hidden',
      '& .MuiChip-icon': {
        color: enabled ? (theme.vars?.palette.success.dark ?? theme.palette.success.dark) : dimmedDisabledIconColor,
      },
      // Dark mode: swap success colors to the lighter palette tint for readability on dark surfaces.
      ...theme.applyStyles('dark', enabled ? {
        color: (theme.vars?.palette.success.light ?? theme.palette.success.light),
        '& .MuiChip-icon': { color: (theme.vars?.palette.success.light ?? theme.palette.success.light) },
      } : {}),
      '& .MuiChip-label': {
        px: theme.spacing(0.75),
        fontWeight: theme.typography.fontWeightMedium ?? 500,
        borderRadius,
      },
      '&.MuiChip-clickable:hover': enabled ? {
        backgroundColor: chipActiveBgHover,
      } : {},
      '&.MuiChip-clickable:active': enabled ? {
        backgroundColor: chipActiveBgHover,
      } : {},
      '&.Mui-focusVisible': enabled ? {
        outline: '2px solid rgba(var(--mui-palette-success-mainChannel) / 0.5)',
        outlineOffset: 2,
      } : {},
      '&.Mui-disabled': {
        opacity: disabledOpacity,
        backgroundColor: dimmedDisabledBg,
        color: dimmedDisabledColor,
      },
    }
  }
}
