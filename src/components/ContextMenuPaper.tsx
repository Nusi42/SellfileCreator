import * as React from 'react'
import Paper, { type PaperProps } from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import type { SxProps, Theme } from '@mui/material/styles'
import { darken, lighten } from '@mui/material/styles'
import {
  CONTEXT_MENU_CLOSE_BUTTON_OFFSET_PX,
  CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
} from '../lib/constants'
// Close button tooltip now uses MarkdownTooltip so every context menu inherits the same hover feel.
import MarkdownTooltip from './MarkdownTooltip'

export type ContextMenuPaperGuardToken = {
  readonly __contextMenuPaperGuardToken: 'ContextMenuPaperGuardToken'
}

export interface ContextMenuPaperProps extends PaperProps {
  onRequestClose: () => void
  closeLabel: string
  overlay?: React.ReactNode
  // Required guard token forces callers to wire the outside-click cleanup.
  contextMenuGuard: ContextMenuPaperGuardToken
  // Allow data-tour-id for guided overlays without extra casting.
  'data-tour-id'?: string
  ref?: React.Ref<HTMLDivElement>
}

const basePaperSx: SxProps<Theme> = {
  position: 'relative',
  overflow: 'visible !important',
  clipPath: 'none',
}

const closeButtonSx: SxProps<Theme> = (theme) => {
  // Derive all colors from the configurable background.paper and divider tokens so the
  // button automatically adapts when the user sets custom theme colors.
  // lighten/darken amounts are tuned so default dark mode output matches the original
  // hardcoded grey values (grey[800]/grey[900]/grey[700]) within ~5 % luminance.
  const p = theme.palette.background.paper
  const d = theme.palette.divider
  const isDark = theme.palette.mode === 'dark'
  const baseBg     = isDark ? lighten(p, 0.18) : darken(p, 0.06)
  const hoverBg    = isDark ? lighten(p, 0.10) : darken(p, 0.12)
  const focusBg    = isDark ? lighten(p, 0.27) : darken(p, 0.18)
  const baseBorder  = isDark ? lighten(d, 0.25) : d
  const hoverBorder = isDark ? lighten(d, 0.35) : darken(d, 0.08)
  const focusBorder = isDark ? lighten(d, 0.45) : darken(d, 0.15)
  return {
    position: 'absolute',
    top: CONTEXT_MENU_CLOSE_BUTTON_OFFSET_PX,
    right: 0,
    width: CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
    height: CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
    padding: 0,
    borderRadius: '50%',
    backgroundColor: baseBg,
    border: `1px solid ${baseBorder}`,
    color: theme.palette.text.primary,
    boxShadow: theme.shadows[3],
    transform: 'translate(50%, -50%)',
    zIndex: theme.zIndex.tooltip,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: theme.transitions.create(['background-color', 'color', 'box-shadow', 'border-color'], {
      duration: theme.transitions.duration.shortest,
    }),
    '&:hover': {
      backgroundColor: hoverBg,
      borderColor: hoverBorder,
      color: theme.palette.text.primary,
      boxShadow: theme.shadows[4],
    },
    '&.Mui-focusVisible': {
      backgroundColor: focusBg,
      color: theme.palette.text.primary,
      boxShadow: theme.shadows[6],
      borderColor: focusBorder,
    },
  }
}

/**
 * ContextMenuPaper
 *
 * Wraps MUI Menu papers with a consistent close button overlay. Keeps the close
 * affordance visible across all context menus without requiring each menu to
 * manage absolute positioning or spacing individually.
 */
function ContextMenuPaper(
  { contextMenuGuard: _contextMenuGuard, onRequestClose, closeLabel, overlay, children, sx, ref, ...paperProps }: ContextMenuPaperProps,
) {
  const mergedSx = React.useMemo<SxProps<Theme>>(() => {
    if (!sx) return basePaperSx
    return Array.isArray(sx) ? [basePaperSx, ...sx] : [basePaperSx, sx]
  }, [sx])

  const handleCloseClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      onRequestClose()
    },
    [onRequestClose],
  )

  const closeButton = (
    <IconButton
      size="small"
      onClick={handleCloseClick}
      aria-label={closeLabel}
      sx={closeButtonSx}
    >
      <CloseRoundedIcon fontSize="small" />
    </IconButton>
  )

  return (
    <Paper {...paperProps} ref={ref} sx={mergedSx}>
      {/* Using MarkdownTooltip keeps the close button hover text consistent with every other tooltip upgrade. */}
      <MarkdownTooltip markdown={closeLabel}>{closeButton}</MarkdownTooltip>
      {overlay}
      {children}
    </Paper>
  )
}

// Helper for slotProps.paper so ContextMenuPaper requirements are type-checked.
// Accepts all ContextMenuPaperProps except `ref` — callers must spread the ref
// separately (e.g. `{ ...buildContextMenuPaperSlotProps({...}), ref: myRef }`)
// so the React Compiler does not flag the ref as "passed to a function during render".
export function buildContextMenuPaperSlotProps(props: Omit<ContextMenuPaperProps, 'ref'>): PaperProps {
  return props as PaperProps
}

export default ContextMenuPaper
