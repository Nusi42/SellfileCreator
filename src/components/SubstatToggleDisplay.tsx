import React from 'react'
import { Box, Tooltip } from '@mui/material'
import type { BoxProps } from '@mui/material/Box'
import LockIcon from '@mui/icons-material/Lock'
import {
  FONT_SIZE_SECONDARY_PX,
  ROLL_BADGE_HOVER_GUTTER_PX,
  ROLL_BADGE_SCALE,
  ROLL_BADGE_SIZE_PX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX,
  BUILDER_SUBSTAT_IDLE_GUTTER_PX,
} from '../lib/constants'

export interface SubstatToggleIndicatorState {
  wildcard: boolean
  min?: number
  max?: number
  tooltip?: React.ReactNode
}

export interface SubstatToggleDisplayProps {
  label: string
  locked: boolean
  selected: boolean
  indicator?: SubstatToggleIndicatorState
  disableInteractions?: boolean
  onIndicatorClick?: (event: React.MouseEvent) => void
  onIndicatorContextMenu?: (event: React.MouseEvent) => void
  lockSx?: BoxProps['sx']
  indicatorMixed?: boolean
}

// Shared visual used by the builder and cheat sheet. Keeps the roll indicator
// layout consistent so references stay recognizable across the app.
export function SubstatToggleDisplay({
  label,
  locked,
  selected,
  indicator,
  disableInteractions = false,
  onIndicatorClick,
  onIndicatorContextMenu,
  lockSx,
  indicatorMixed = false,
}: SubstatToggleDisplayProps) {
  const wildcard = indicator?.wildcard === true
  const min = typeof indicator?.min === 'number' ? Math.max(0, Math.min(5, indicator!.min!)) : undefined
  const max = typeof indicator?.max === 'number' ? Math.max(0, Math.min(4, indicator!.max!)) : undefined
  const hasMin = typeof min === 'number'
  const hasMax = typeof max === 'number'
  const tooltip = indicator?.tooltip ?? ''
  const showIndicator = selected || Boolean(indicator) || indicatorMixed
  const indicatorLabel = (() => {
    if (indicatorMixed) return '–'
    if (hasMax) return String(max)
    if (wildcard) return '★'
    if (hasMin) return String(min)
    return ''
  })()
  return (
    <Box
      className="roll-container"
      sx={{
        display: 'grid',
        gridTemplateColumns: `var(--sub-left-gutter, ${ROLL_BADGE_SIZE_PX}px) 1fr var(--sub-right-gutter, ${ROLL_BADGE_SIZE_PX}px)`,
        alignItems: 'center',
        width: '100%',
        height: '100%',
        pointerEvents: disableInteractions ? 'none' : 'none',
        transition: 'grid-template-columns 160ms ease',
        position: 'relative',
      }}
    >
      <Box sx={{ width: ROLL_BADGE_SIZE_PX, height: ROLL_BADGE_SIZE_PX, pointerEvents: 'none' }} />
      <Box
        className="roll-label"
        component="span"
        sx={{
          gridColumn: '2',
          pointerEvents: 'none',
          textAlign: selected ? 'left' : 'center',
          pl: selected ? 0 : 0,
          width: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          transition: 'padding-left 160ms ease, text-align 160ms ease',
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          position: 'absolute',
          // Slightly higher to sit just above the label baseline in tight locales.
          top: -12,
          left: -4,
          opacity: locked ? 0.9 : 0,
          transition: 'opacity .15s',
          pointerEvents: 'none',
          zIndex: 3,
          ...(lockSx ?? {}),
        }}
      >
        <LockIcon sx={{ fontSize: 14 }} />
      </Box>
      <Tooltip title={tooltip} disableHoverListener={!tooltip}>
        <Box
          className="roll-indicator"
          role="button"
          onClick={(e) => {
            if (disableInteractions || !selected) return
            onIndicatorClick?.(e)
          }}
          onContextMenu={(e) => {
            if (disableInteractions || !selected) return
            e.preventDefault()
            onIndicatorContextMenu?.(e)
          }}
          sx={{
            gridColumn: '3',
            justifySelf: 'end',
            mr: 0.5,
            width: ROLL_BADGE_SIZE_PX,
            height: ROLL_BADGE_SIZE_PX,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: FONT_SIZE_SECONDARY_PX,
            lineHeight: 1,
            userSelect: 'none',
            cursor: !selected || disableInteractions ? 'default' : 'pointer',
            opacity: showIndicator ? 1 : 0,
            pointerEvents: !selected || disableInteractions ? 'none' : 'auto',
            border: '1px solid',
            borderStyle: 'solid',
            transform: `translateX(${((ROLL_BADGE_SIZE_PX * (ROLL_BADGE_SCALE - 1)) / 2)}px) scale(${ROLL_BADGE_SCALE})`,
            transformOrigin: 'center',
            clipPath: 'circle(50% at 50% 50%)',
            borderColor: indicatorMixed
              ? 'warning.main'
              : (hasMax
                ? 'error.main'
                : (wildcard || hasMin ? 'success.main' : 'text.secondary')),
            color: indicatorMixed
              ? 'warning.main'
              : (hasMax
                ? 'error.contrastText'
                : (wildcard || hasMin ? 'common.white' : 'text.secondary')),
            bgcolor: indicatorMixed
              ? 'transparent'
              : (hasMax
                ? 'error.main'
                : (wildcard || hasMin ? 'success.main' : 'transparent')),
            zIndex: 1,
          }}
        >
          {indicatorLabel}
        </Box>
      </Tooltip>
    </Box>
  )
}

export const substatToggleGroupSx = {
  gap: 0.5,
  '& .MuiToggleButton-root': {
    // Keep zero horizontal padding so the visual width matches the legacy
    // builder toggles and the lock badge lines up with the label gutter.
    px: 0,
    minWidth: BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX,
    width: BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX,
    height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
    justifyContent: 'center',
    position: 'relative',
    boxSizing: 'border-box',
  },
  '--sub-left-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
  '--sub-right-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
    marginLeft: '0 !important',
    borderLeft: '1px solid transparent',
  },
  '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
    marginLeft: '0 !important',
    borderLeft: '1px solid transparent',
  },
  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-indicator': {
    opacity: 1,
    backgroundColor: 'transparent',
    color: 'transparent',
    borderColor: 'text.secondary',
  },
  '& .MuiToggleButton-root:not(.Mui-selected):hover': {
    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
    '--sub-right-gutter': `${ROLL_BADGE_SIZE_PX}px`,
  },
  '& .MuiToggleButton-root:not(.Mui-selected):hover .roll-label': {
    textAlign: 'left',
    pl: 0,
  },
  '& .MuiToggleButton-root.Mui-selected': {
    '--sub-left-gutter': `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
    '--sub-right-gutter': `${ROLL_BADGE_SIZE_PX}px`,
  },
  '& .MuiToggleButton-root.Mui-selected .roll-label': {
    textAlign: 'left',
    pl: 0,
  },
} as const
