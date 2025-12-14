import * as React from 'react'
import Paper, { type PaperProps } from '@mui/material/Paper'
import IconButton from '@mui/material/IconButton'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import type { SxProps, Theme } from '@mui/material/styles'
import {
  CONTEXT_MENU_CLOSE_BUTTON_OFFSET_PX,
  CONTEXT_MENU_CLOSE_BUTTON_SIZE_PX,
} from '../lib/constants'
// Close button tooltip now uses MarkdownTooltip so every context menu inherits the same hover feel.
import MarkdownTooltip from './MarkdownTooltip'

interface ContextMenuPaperProps extends PaperProps {
  onRequestClose: () => void
  closeLabel: string
  overlay?: React.ReactNode
}

const basePaperSx: SxProps<Theme> = {
  position: 'relative',
  overflow: 'visible !important',
  clipPath: 'none',
}

const closeButtonSx: SxProps<Theme> = (theme) => {
  const baseBg = theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[400]
  const hoverBg = theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[500]
  const focusBg = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[600]
  const baseBorder = theme.palette.mode === 'dark' ? theme.palette.grey[700] : theme.palette.grey[500]
  const hoverBorder = theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[600]
  const focusBorder = theme.palette.mode === 'dark' ? theme.palette.grey[500] : theme.palette.grey[700]
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
const ContextMenuPaper = React.forwardRef<HTMLDivElement, ContextMenuPaperProps>(function ContextMenuPaper(
  { onRequestClose, closeLabel, overlay, children, sx, ...paperProps },
  ref,
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
})

export default ContextMenuPaper
