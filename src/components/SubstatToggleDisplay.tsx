import React from 'react'
import { Box, IconButton } from '@mui/material'
import type { BoxProps } from '@mui/material/Box'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import { alpha } from '@mui/material/styles'
import {
  FONT_SIZE_SECONDARY_PX,
  ROLL_BADGE_HOVER_GUTTER_PX,
  ROLL_BADGE_SCALE,
  ROLL_BADGE_SIZE_PX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX,
  BUILDER_SUBSTAT_IDLE_GUTTER_PX,
  MULTI_EDIT_MIXED_BG_ALPHA,
  MULTI_EDIT_MIXED_BORDER_ALPHA,
  MULTI_EDIT_MIXED_TEXT_ALPHA,
} from '../lib/constants'
import { buildWarningBadgeBase } from '../lib/badgeStyles'
// Use MarkdownTooltip for both the lock badge and roll indicator so builders see consistent multi-line copy.
import MarkdownTooltip from './MarkdownTooltip'

const LOCK_TOGGLE_HIT_SIZE_PX = ROLL_BADGE_SIZE_PX + (ROLL_BADGE_HOVER_GUTTER_PX * 2)
const LOCK_TOGGLE_OFFSET_X_PX = ROLL_BADGE_HOVER_GUTTER_PX
const LOCK_TOGGLE_OFFSET_Y_PX = ROLL_BADGE_HOVER_GUTTER_PX / 2

export interface SubstatToggleIndicatorState {
  wildcard: boolean
  min?: number
  max?: number
  // When true, the substat must be absent (HSF Condition "¬").
  not?: boolean
  tooltip?: string
}

export interface SubstatToggleDisplayProps {
  label: string
  locked: boolean
  selected: boolean
  indicator?: SubstatToggleIndicatorState
  indicatorWarning?: boolean
  indicatorWarningTooltip?: string
  disableInteractions?: boolean
  onIndicatorClick?: (event: React.MouseEvent) => void
  onIndicatorContextMenu?: (event: React.MouseEvent) => void
  lockSx?: BoxProps['sx']
  indicatorMixed?: boolean
  onLockToggle?: (event: React.MouseEvent | React.KeyboardEvent) => void
  lockTooltip?: string
  lockAriaLabel?: string
  lockDisabled?: boolean
  lockIsMixed?: boolean
  onInteractiveHoverChange?: (hovering: boolean) => void
}

// Shared visual used by the builder and cheat sheet. Keeps the roll indicator
// layout consistent so references stay recognizable across the app.
export function SubstatToggleDisplay({
  label,
  locked,
  selected,
  indicator,
  indicatorWarning = false,
  indicatorWarningTooltip,
  disableInteractions = false,
  onIndicatorClick,
  onIndicatorContextMenu,
  lockSx,
  indicatorMixed = false,
  onLockToggle,
  lockTooltip,
  lockAriaLabel,
  lockDisabled = false,
  lockIsMixed = false,
  onInteractiveHoverChange,
}: SubstatToggleDisplayProps) {
  const wildcard = indicator?.wildcard === true
  const notSub = indicator?.not === true
  const min = typeof indicator?.min === 'number' ? Math.max(0, Math.min(5, indicator!.min!)) : undefined
  const max = typeof indicator?.max === 'number' ? Math.max(0, Math.min(4, indicator!.max!)) : undefined
  const hasMin = typeof min === 'number'
  const hasMax = typeof max === 'number'
  const tooltip = indicator?.tooltip ?? ''
  const warningTooltip = indicatorWarningTooltip ?? ''
  // Keep warning badges tied to visible indicators so empty rows stay clean.
  const showIndicatorWarning = indicatorWarning && (selected || indicatorMixed)
  const indicatorLabel = (() => {
    if (indicatorMixed) return ''
    if (notSub) return '¬'
    if (hasMax) return String(max)
    if (wildcard) return '★'
    if (hasMin) return String(min)
    return ''
  })()
  const shouldShowLock = selected || lockIsMixed || locked
  const shouldShowIndicator = selected || indicatorMixed

  return (
    <Box
      className="roll-container"
      sx={{
        display: 'grid',
        gridTemplateColumns: `var(--sub-left-gutter, ${ROLL_BADGE_SIZE_PX}px) 1fr var(--sub-right-gutter, ${ROLL_BADGE_SIZE_PX}px)`,
        alignItems: 'center',
        width: '100%',
        height: '100%',
        pointerEvents: disableInteractions ? 'none' : 'auto',
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
          top: -13,
          left: -(ROLL_BADGE_HOVER_GUTTER_PX - 1),
          pointerEvents: (onLockToggle && !disableInteractions && shouldShowLock) ? 'auto' : 'none',
          zIndex: 3,
          ...(lockSx ?? {}),
        }}
      >
        {onLockToggle ? (
          // Let the lock badge reuse MarkdownTooltip so these hints match the builder label tooltips.
          <MarkdownTooltip markdown={lockTooltip ?? ''} disableHoverListener={!lockTooltip}>
            <span>
              <IconButton
                component="span"
                // Expose the lock badge as an explicit toggle so users can flip the fixed state without cycling the main button.
                size="small"
                aria-label={lockAriaLabel}
                aria-pressed={lockIsMixed ? 'mixed' : locked}
                disableRipple
                disabled={lockDisabled || disableInteractions}
                sx={(theme) => {
                  const hoverGlow = alpha(
                    theme.palette.text.primary,
                    theme.palette.mode === 'dark' ? 0.22 : 0.14,
                  )
                  return {
                    width: LOCK_TOGGLE_HIT_SIZE_PX,
                    height: LOCK_TOGGLE_HIT_SIZE_PX,
                    p: 0,
                    backgroundColor: 'transparent',
                    color: 'inherit',
                    pointerEvents: (!shouldShowLock || lockDisabled || disableInteractions) ? 'none' : 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `translate(-${LOCK_TOGGLE_OFFSET_X_PX}px, -${LOCK_TOGGLE_OFFSET_Y_PX}px)`,
                    borderRadius: LOCK_TOGGLE_HIT_SIZE_PX / 2,
                    transition: 'background-color .15s, box-shadow .15s, opacity .15s',
                    opacity: shouldShowLock ? 1 : 0,
                    visibility: shouldShowLock ? 'visible' : 'hidden',
                    '& svg': {
                      opacity: shouldShowLock ? 'var(--sub-lock-hover-opacity, 0)' : 0,
                      transition: 'opacity .15s',
                    },
                    '&:hover, &:focus-visible': {
                      '--sub-lock-hover-opacity': (locked || lockIsMixed) ? 1 : 0.85,
                      backgroundColor: hoverGlow,
                      boxShadow: `0 0 0 1px ${hoverGlow}`,
                    },
                    '&:focus-visible': {
                      outline: 'none',
                    },
                  }
                }}
                onClick={(event) => {
                  if (disableInteractions) return
                  try {
                    event.preventDefault()
                    event.stopPropagation()
                  } catch {}
                  onLockToggle?.(event)
                }}
                onMouseEnter={() => { if (!disableInteractions) onInteractiveHoverChange?.(true) }}
                onMouseLeave={() => { onInteractiveHoverChange?.(false) }}
                onMouseDown={(event) => {
                  try {
                    event.preventDefault()
                    event.stopPropagation()
                  } catch {}
                }}
                tabIndex={disableInteractions || !shouldShowLock ? -1 : 0}
                role="button"
                onKeyDown={(event) => {
                  if (disableInteractions) return
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  try {
                    event.preventDefault()
                    event.stopPropagation()
                  } catch {}
                  onLockToggle?.(event as unknown as React.MouseEvent<HTMLButtonElement>)
                }}
              >
                {(locked || lockIsMixed) ? <LockIcon sx={{ fontSize: 14 }} /> : <LockOpenOutlinedIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </span>
          </MarkdownTooltip>
        ) : (
          <Box
            sx={{
              opacity: locked ? 0.9 : 0,
              transition: 'opacity .15s',
              pointerEvents: 'none',
              ...(lockSx ?? {}),
            }}
          >
            <LockIcon sx={{ fontSize: 14 }} />
          </Box>
        )}
      </Box>
      {/* Roll indicator hints also route through MarkdownTooltip so multi-line copy stays consistent. */}
      <MarkdownTooltip markdown={tooltip} disableHoverListener={!tooltip}>
        <Box
          className="roll-indicator"
          role="button"
          onMouseEnter={() => { if (!disableInteractions) onInteractiveHoverChange?.(true) }}
          onMouseLeave={() => { onInteractiveHoverChange?.(false) }}
          onClick={(e) => {
            if (disableInteractions || !selected) return
            onIndicatorClick?.(e)
          }}
          onContextMenu={(e) => {
            if (disableInteractions || !selected) return
            e.preventDefault()
            onIndicatorContextMenu?.(e)
          }}
          onMouseDown={(event) => {
            try {
              event.preventDefault()
              event.stopPropagation()
            } catch {}
          }}
          sx={(theme) => {
            const mixedBorder = alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BORDER_ALPHA.dark : MULTI_EDIT_MIXED_BORDER_ALPHA.light,
            )
            const mixedBg = alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BG_ALPHA.dark : MULTI_EDIT_MIXED_BG_ALPHA.light,
            )
            const mixedText = alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_TEXT_ALPHA.dark : MULTI_EDIT_MIXED_TEXT_ALPHA.light,
            )
            const isRedVariant = hasMax || notSub
            const borderColor = indicatorMixed
              ? mixedBorder
              : (isRedVariant
                ? theme.palette.error.main
                : (wildcard || hasMin ? theme.palette.success.main : theme.palette.text.secondary))
            const textColor = indicatorMixed
              ? mixedText
              : (isRedVariant
                ? theme.palette.error.contrastText
                : (wildcard || hasMin ? theme.palette.common.white : theme.palette.text.secondary))
            const backgroundColor = indicatorMixed
              ? mixedBg
              : (isRedVariant
                ? theme.palette.error.main
                : (wildcard || hasMin ? theme.palette.success.main : 'transparent'))
            const hoverGlow = alpha(
              theme.palette.text.primary,
              theme.palette.mode === 'dark' ? 0.22 : 0.14,
            )
            return {
              gridColumn: '3',
              justifySelf: 'end',
              mr: 0.5,
              width: ROLL_BADGE_SIZE_PX,
              height: ROLL_BADGE_SIZE_PX,
              borderRadius: '50%',
              display: shouldShowIndicator ? 'inline-flex' : 'none',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: FONT_SIZE_SECONDARY_PX,
              lineHeight: 1,
              userSelect: 'none',
              cursor: !selected || disableInteractions ? 'default' : 'pointer',
              opacity: shouldShowIndicator ? 1 : 0,
              pointerEvents: !selected || disableInteractions ? 'none' : 'auto',
              border: '1px solid',
              borderStyle: indicatorMixed ? 'dashed' : 'solid',
              transform: `translateX(${((ROLL_BADGE_SIZE_PX * (ROLL_BADGE_SCALE - 1)) / 2)}px) scale(${ROLL_BADGE_SCALE})`,
              transformOrigin: 'center',
              clipPath: 'circle(50% at 50% 50%)',
              borderColor,
              color: textColor,
              bgcolor: backgroundColor,
              zIndex: 1,
              position: 'relative',
              overflow: 'hidden',
              transition: 'box-shadow .15s, border-color .15s, color .15s, opacity .15s',
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                backgroundColor: hoverGlow,
                opacity: 0,
                pointerEvents: 'none',
                transition: 'opacity .15s',
              },
              '&:hover, &:focus-visible': {
                boxShadow: `0 0 0 1px ${hoverGlow}`,
                outline: 'none',
                '&::after': {
                  opacity: indicatorMixed ? 0 : 1,
                },
              },
            }
          }}
        >
          {indicatorLabel}
        </Box>
      </MarkdownTooltip>
      {showIndicatorWarning ? (
        <MarkdownTooltip markdown={warningTooltip} disableHoverListener={!warningTooltip}>
          <Box
            component="span"
            sx={(theme) => ({
              position: 'absolute',
              top: -6,
              left: '50%',
              transform: 'translate(-50%, -50%) scale(0.75)',
              transformOrigin: 'center',
              ...buildWarningBadgeBase(theme),
            })}
          >
            !
          </Box>
        </MarkdownTooltip>
      ) : null}
    </Box>
  )
}

// Shared sx for main-stat ToggleButtonGroup rows (Recipe Builder and Safeguard Builder).
// Main stats use a small horizontal padding (px: 0.75) because they don't have a lock/roll
// badge overlay — unlike substats which require px: 0 for the badge gutter alignment.
// display:'flex' + width:'100%' fill the container; flex:0 1 <preferred> on each button lets
// them shrink as the splitter is dragged left, flooring at minWidth before the scroll kicks in.
export const mainStatToggleGroupSx = {
  display: 'flex',
  width: '100%',
  gap: 0.5,
  '& .MuiToggleButton-root': {
    px: 0.75,
    flex: `0 1 ${BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX}px`,
    minWidth: 32,
    height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
    justifyContent: 'center',
    borderRadius: 1,
    border: '1px solid',
    borderColor: 'divider',
    '&.Mui-selected': {
      borderColor: 'divider',
    },
  },
  '& .MuiToggleButtonGroup-grouped': {
    margin: '0 !important',
    borderRadius: 1,
  },
} as const

export const substatToggleGroupSx = {
  display: 'flex',
  width: '100%',
  gap: 0.5,
  '& .MuiToggleButton-root': {
    // Keep zero horizontal padding so the lock badge gutter alignment is preserved.
    px: 0,
    flex: `0 1 ${BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX}px`,
    minWidth: 32,
    height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
    justifyContent: 'center',
    position: 'relative',
    boxSizing: 'border-box',
    borderRadius: 1,
    border: '1px solid',
    borderColor: 'divider',
    '&.Mui-selected': {
      borderColor: 'divider',
    },
  },
  '& .MuiToggleButtonGroup-grouped': {
    margin: '0 !important',
    borderRadius: 1,
  },
  '--sub-left-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
  '--sub-right-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
  '& .MuiToggleButton-root[data-interactive-hover="true"]:not(.Mui-selected)': {
    '--sub-left-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
    '--sub-right-gutter': `${BUILDER_SUBSTAT_IDLE_GUTTER_PX}px`,
  },
  '& .MuiToggleButton-root[data-interactive-hover="true"]:not(.Mui-selected) .roll-label': {
    textAlign: 'center',
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
