import React from 'react'
import { Box, IconButton } from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import type { SxProps } from '@mui/system'
import type { Theme } from '@mui/material/styles'

export interface NumberSpinnerAdornmentProps {
  ariaLabel: string
  disabled?: boolean
  onStep: (delta: number) => void
}

/**
 * SSOT for suppressing the browser's native number-input spinner so the custom
 * NumberSpinnerAdornment can stand in its place. Spread into a numeric TextField's
 * `sx` alongside an endAdornment={<NumberSpinnerAdornment .../>} to get the substat-style
 * field. Webkit hides the inner/outer spin buttons; Firefox needs MozAppearance: textfield.
 */
export const HIDE_NATIVE_NUMBER_SPINNER_SX = {
  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
  '& input[type=number]': {
    MozAppearance: 'textfield',
  },
} as const

/**
 * Shared inline spinner used by numeric TextFields (mirrors the substat menu style).
 */
export function NumberSpinnerAdornment({ ariaLabel, disabled, onStep }: NumberSpinnerAdornmentProps) {
  const handleMouseDown = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleClick = React.useCallback((delta: number) => (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    onStep(delta)
  }, [disabled, onStep])

  const baseSx: SxProps<Theme> = (theme) => ({
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.25,
    ml: '-4px',
    mr: '-11px',
    py: 0.25,
    borderLeft: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
  })

  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      sx={baseSx}
    >
      <IconButton
        size="small"
        aria-label={`${ariaLabel} increase`}
        disabled={Boolean(disabled)}
        onMouseDown={handleMouseDown}
        onClick={handleClick(1)}
        sx={{
          width: 20,
          height: 16,
          p: 0,
          borderRadius: 0,
        }}
      >
        <KeyboardArrowUpIcon fontSize="inherit" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={`${ariaLabel} decrease`}
        disabled={Boolean(disabled)}
        onMouseDown={handleMouseDown}
        onClick={handleClick(-1)}
        sx={{
          width: 20,
          height: 16,
          p: 0,
          borderRadius: 0,
        }}
      >
        <KeyboardArrowDownIcon fontSize="inherit" />
      </IconButton>
    </Box>
  )
}
