import { alpha } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { BUILDER_STATUS_CHIP_HEIGHT_PX, STATUS_CHIP_BORDER_RADIUS_PX } from '../lib/constants'
import { resolveDisabledOpacity } from './disabledOpacity'

interface BuilderStatusChipOptions {
  dimDisabled?: boolean
}

// Shared builder status chip styling so the Builder panel and cheat sheet stay visually aligned.
export function createBuilderStatusChipSx(theme: Theme) {
  const chipActiveBg = alpha(theme.palette.success.main, 0.18)
  const chipActiveBgHover = alpha(theme.palette.success.main, 0.24)
  const chipActiveColor = theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark
  const chipDisabledBg = theme.palette.action.disabledBackground ?? alpha(theme.palette.text.disabled, 0.12)
  const chipDisabledColor = theme.palette.text.disabled
  // Keep the base opacity aligned with shared disabled UI dimming.
  const baseDisabledOpacity = resolveDisabledOpacity(theme)

  return (enabled: boolean, opts?: BuilderStatusChipOptions): SxProps<Theme> => {
    const shouldDimDisabled = Boolean(opts?.dimDisabled)
    const disabledOpacity = shouldDimDisabled ? baseDisabledOpacity : 1
    const dimmedDisabledColor = shouldDimDisabled ? alpha(chipDisabledColor, baseDisabledOpacity) : chipDisabledColor
    const dimmedDisabledIconColor = shouldDimDisabled
      ? alpha(chipDisabledColor, Math.min(baseDisabledOpacity * 0.8, baseDisabledOpacity))
      : chipDisabledColor
    const dimmedDisabledBg = shouldDimDisabled ? alpha(theme.palette.text.disabled, 0.08) : chipDisabledBg

    const borderRadius = `${STATUS_CHIP_BORDER_RADIUS_PX}px`
    return {
      height: BUILDER_STATUS_CHIP_HEIGHT_PX,
      minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
      fontWeight: theme.typography.fontWeightMedium ?? 500,
      px: 0,
      backgroundColor: enabled ? chipActiveBg : dimmedDisabledBg,
      color: enabled ? chipActiveColor : dimmedDisabledColor,
      borderRadius,
      overflow: 'hidden',
      '& .MuiChip-icon': {
        color: enabled ? chipActiveColor : dimmedDisabledIconColor,
      },
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
        outline: `2px solid ${alpha(theme.palette.success.main, 0.5)}`,
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
