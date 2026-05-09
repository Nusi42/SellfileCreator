import { Box } from '@mui/material'
import { createPortal } from 'react-dom'

type Props = {
  text: string
  position: { x: number; y: number } | null
}

// Flip horizontal anchor when cursor is this close to the right edge (px).
const HINT_FLIP_THRESHOLD_PX = 220
const HINT_OFFSET_PX = 10

export function ContextMenuHintOverlay({ text, position }: Props) {
  if (!position) return null
  // Anchor to the left of the cursor when near the right viewport edge so the
  // tooltip never runs off-screen or wraps.
  const nearRight =
    typeof window !== 'undefined' &&
    position.x > window.innerWidth - HINT_FLIP_THRESHOLD_PX
  const hint = (
    <Box
      sx={(theme) => ({
        position: 'fixed',
        top: position.y + HINT_OFFSET_PX,
        ...(nearRight
          ? { right: window.innerWidth - position.x + HINT_OFFSET_PX, left: 'auto' }
          : { left: position.x + HINT_OFFSET_PX }),
        whiteSpace: 'nowrap',
        transform: 'translate3d(0, 0, 0)',
        pointerEvents: 'none',
        backgroundColor: theme.palette.mode === 'dark'
          ? 'rgba(30, 30, 30, 0.92)'
          : 'rgba(255, 255, 255, 0.95)',
        color: theme.palette.mode === 'dark'
          ? theme.palette.common.white
          : theme.palette.text.primary,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: theme.typography.caption.fontSize,
        fontWeight: 600,
        letterSpacing: 0.1,
        boxShadow: theme.shadows[4],
        border: `1px solid ${theme.palette.divider}`,
        zIndex: theme.zIndex.tooltip + 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing(0.5),
        opacity: 0.96,
        backdropFilter: 'blur(4px)',
      })}
    >
      {text}
    </Box>
  )

  if (typeof document === 'undefined') return hint
  return createPortal(hint, document.body)
}
