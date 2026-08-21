import * as React from 'react'
import Paper, { type PaperProps } from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import type { SxProps, Theme } from '@mui/material/styles'
import { darken } from '@mui/material/styles'
import { TINT } from '../lib/colorTints'
import { GOLD_FRAME_CSS } from '../lib/goldSkin'
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
  // Light-mode: derive from paper/divider tokens so the button adapts to custom colors —
  // parchment paper and the gold divider make the button warm by construction.
  // darken() receives light-scheme hex (theme.palette.* = light in CSS vars mode) — safe.
  // Dark-mode: hardcoded fills via applyStyles. The dark paper sits near grey[900]
  // lightness, so lighten() deltas cannot reach the contrast the fixed fills provide;
  // the fills keep the original grey ladder's LIGHTNESS but are amber-tinted so the
  // button speaks the gold skin, and the borders ride the frame-gold channel (TINT).
  const p = theme.palette.background.paper
  const d = theme.palette.divider
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
    // No boxShadow, at rest or on hover/focus: under the gold skin depth is the FRAME, not
    // MUI elevation, and this button rides ON a floating paper that already casts the one
    // drop shadow — its own elevation[3]/[4]/[6] ladder read as a second, wrong light source.
    // Hover and focus are carried by the fill and border colour changes below.
    transform: 'translate(50%, -50%)',
    zIndex: theme.zIndex.tooltip,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: theme.transitions.create(['background-color', 'color', 'border-color'], {
      duration: theme.transitions.duration.shortest,
    }),
    '&:hover': {
      backgroundColor: darken(p, 0.12),
      borderColor: darken(d, 0.08),
      color: textColor,
    },
    '&.Mui-focusVisible': {
      backgroundColor: darken(p, 0.18),
      color: textColor,
      borderColor: darken(d, 0.15),
    },
    // Dark mode: amber-tinted fills at the ORIGINAL grey ladder's lightness steps
    // (grey[800]/[900]/[700] equivalents) — the dark paper (#101a26) is already near
    // grey[900] lightness, so lighten() deltas are too small; fixed fills stay the
    // exception, now warmed so the ✕ speaks the gold skin. Borders ride the frame-gold
    // channel via TINT so they follow a custom gold like every other hairline.
    ...theme.applyStyles('dark', {
      backgroundColor: '#494130',  // warm grey[800]
      borderColor: TINT.floatingCloseBorder,
      '&:hover': {
        backgroundColor: '#262013',  // warm grey[900]
        borderColor: TINT.floatingCloseBorderHover,
        color: textColor,
      },
      '&.Mui-focusVisible': {
        backgroundColor: '#665935',  // warm grey[700]
        color: textColor,
        borderColor: GOLD_FRAME_CSS,
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
