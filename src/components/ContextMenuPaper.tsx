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
  // Light-mode values are the base; dark-mode overrides are applied via applyStyles.
  // Use concrete light-scheme hex for darken/lighten math (CSS var strings break color math).
  // Dark-scheme hex extracted from colorSchemes for the applyStyles override section.
  const p = theme.palette.background.paper
  const d = theme.palette.divider
  // Dark-scheme defaults match buildSchemePalette in theme.ts.
  // colorSchemes isn't typed on Theme in sx callbacks, so we use known defaults.
  const darkP = '#161b22'
  const darkD = '#30363d'
  const textColor = theme.vars?.palette.text.primary ?? theme.palette.text.primary
  return {
    position: 'absolute',
    top: CONTEXT_MENU_CLOSE_BUTTON_OFFSET_PX,
    right: 0,
    width: CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
    height: CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
    padding: 0,
    borderRadius: '50%',
    backgroundColor: darken(p, 0.06),
    border: `1px solid ${d}`,
    color: textColor,
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
      backgroundColor: darken(p, 0.12),
      borderColor: darken(d, 0.08),
      color: textColor,
      boxShadow: theme.shadows[4],
    },
    '&.Mui-focusVisible': {
      backgroundColor: darken(p, 0.18),
      color: textColor,
      boxShadow: theme.shadows[6],
      borderColor: darken(d, 0.15),
    },
    // Dark mode: lighten dark-scheme hex (not light-scheme p/d) so button sits above dark paper.
    ...theme.applyStyles('dark', {
      backgroundColor: lighten(darkP, 0.18),
      borderColor: lighten(darkD, 0.25),
      '&:hover': {
        backgroundColor: lighten(darkP, 0.10),
        borderColor: lighten(darkD, 0.35),
        color: textColor,
        boxShadow: theme.shadows[4],
      },
      '&.Mui-focusVisible': {
        backgroundColor: lighten(darkP, 0.27),
        color: textColor,
        boxShadow: theme.shadows[6],
        borderColor: lighten(darkD, 0.45),
      },
    }),
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
