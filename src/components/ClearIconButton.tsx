import * as React from 'react'
import IconButton, { type IconButtonProps } from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ClearIcon from '@mui/icons-material/Clear'
import type { SxProps, Theme } from '@mui/material/styles'
import { CLEAR_ICON_BUTTON_SIZE_PX } from '../lib/constants'

const baseClearButtonSx: SxProps<Theme> = (theme) => ({
  color: theme.palette.text.secondary,
  bgcolor: 'transparent !important',
  borderRadius: theme.shape.borderRadius,
  transition: theme.transitions.create(['color', 'background-color'], { duration: theme.transitions.duration.shortest }),
  width: CLEAR_ICON_BUTTON_SIZE_PX,
  height: CLEAR_ICON_BUTTON_SIZE_PX,
  padding: 0,
  fontSize: theme.typography.pxToRem(16),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    color: theme.palette.common.black,
    bgcolor: `${theme.palette.warning.main} !important`,
  },
  '&.Mui-focusVisible': {
    color: theme.palette.common.black,
    bgcolor: `${theme.palette.warning.main} !important`,
  },
  '&.Mui-disabled': {
    color: theme.palette.action.disabled,
    bgcolor: 'transparent !important',
  },
})

export interface ClearIconButtonProps extends Omit<IconButtonProps, 'color'> {
  tooltip?: React.ReactNode
}

const ClearIconButton = React.forwardRef<HTMLButtonElement, ClearIconButtonProps>(function ClearIconButton(
  { tooltip, sx, ...iconButtonProps },
  ref,
) {
  const mergedSx = React.useMemo<SxProps<Theme>>(() => {
    if (!sx) return baseClearButtonSx
    if (Array.isArray(sx)) {
      return [baseClearButtonSx, ...sx] as SxProps<Theme>
    }
    return [baseClearButtonSx, sx] as SxProps<Theme>
  }, [sx])

  const button = (
    <IconButton
      {...iconButtonProps}
      ref={ref}
      sx={mergedSx}
    >
      <ClearIcon fontSize="small" />
    </IconButton>
  )

  if (!tooltip) {
    return button
  }

  const disabled = Boolean(iconButtonProps.disabled)
  return (
    <Tooltip
      title={tooltip}
      disableHoverListener={disabled}
      disableFocusListener={disabled}
      disableTouchListener={disabled}
      componentsProps={{ tooltip: { sx: { pointerEvents: 'auto' } } }}
    >
      {button}
    </Tooltip>
  )
})

export default ClearIconButton
