import { Box } from '@mui/material'

type Props = {
  text: string
  position: { x: number; y: number } | null
}

export function ContextMenuHintOverlay({ text, position }: Props) {
  if (!position) return null
  return (
    <Box
      sx={(theme) => ({
        position: 'fixed',
        top: position.y + 10,
        left: position.x + 10,
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
}
