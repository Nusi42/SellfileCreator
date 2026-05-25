/**
 * EasterEggFlyoutShell.tsx
 *
 * Shared flyout container for canvas-based Easter egg games (Pong, Tetris).
 * Handles: fixed-position Paper, drag-to-move behaviour, title bar with
 * screenshot and close buttons. The game canvas is rendered as children.
 *
 * Callers supply a ref to the canvas element so the shell can capture it for
 * the screenshot, avoiding the need for game components to duplicate that logic.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import SportsEsportsIcon from '@mui/icons-material/SportsEsports'
import { canWriteImageToClipboard } from '../lib/clipboard'
import { captureEasterEggSnapshot } from '../lib/easterEggSnapshot'

const HEADER_H = 40  // title-bar height in px (CSS pixels, not game-logical)

type Props = Readonly<{
  title: string
  /** Ref to the game canvas, used to capture the screenshot. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** Base filename (no extension) for the download fallback. */
  snapshotFilename: string
  /**
   * Physical pixels per logical pixel for the game canvas.
   * Pass the game's SCALE constant so the watermark text is proportionally sized.
   */
  pixelScale?: number
  /**
   * Called at screenshot time to produce an extra string appended to the steg
   * fingerprint payload (e.g. "pong:score=500" for score verification).
   */
  getStegExtra?: () => string
  onClose: () => void
  children: React.ReactNode
}>

export default function EasterEggFlyoutShell({
  title,
  canvasRef,
  snapshotFilename,
  pixelScale = 1,
  getStegExtra,
  onClose,
  children,
}: Props) {
  // Flyout screen position; initialised to the viewport centre using the canvas
  // size (unknown at construction time, so we defer to a lazy initialiser that
  // reads the actual canvas dimensions on first render).
  const [pos, setPos] = useState(() => {
    // Centre of the viewport is a safe default even before the canvas is mounted.
    return {
      x: Math.max(8, window.innerWidth  / 2 - 200),
      y: Math.max(8, window.innerHeight / 2 - 200),
    }
  })

  const [snapDone, setSnapDone] = useState(false)
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  // Stable for the page lifetime: clipboard.write requires HTTPS/localhost.
  const canCopy = useMemo(() => canWriteImageToClipboard(), [])

  // ── Screenshot ────────────────────────────────────────────────────────────

  const handleSnapshot = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ok = await captureEasterEggSnapshot(canvas, snapshotFilename, canCopy, pixelScale, getStegExtra?.())
    if (ok) {
      setSnapDone(true)
      setTimeout(() => setSnapDone(false), 2000)
    }
  }, [canvasRef, canCopy, getStegExtra, pixelScale, snapshotFilename])

  // ── Drag (pointer capture on title bar) ──────────────────────────────────

  const handleDragDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setPos((p) => {
      dragRef.current = { ox: e.clientX, oy: e.clientY, px: p.x, py: p.y }
      return p   // no position change on pointerdown itself
    })
  }, [])

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const { ox, oy, px, py } = dragRef.current
    setPos({ x: px + (e.clientX - ox), y: py + (e.clientY - oy) })
  }, [])

  const handleDragEnd = useCallback(() => { dragRef.current = null }, [])

  return (
    <Paper
      elevation={24}
      sx={{
        position: 'fixed',
        top: pos.y,
        left: pos.x,
        // Float above modals so the flyout is reachable while dialogs are open.
        zIndex: (theme) => theme.zIndex.modal + 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 2,
        // Prevent text selection during drag.
        userSelect: 'none',
      }}
    >
      {/* ── Title bar ─── drag handle + game icon + label + screenshot + close */}
      <Box
        onPointerDown={handleDragDown}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        sx={{
          height: HEADER_H,
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          gap: 1,
          cursor: 'grab',
          bgcolor: 'action.hover',
          flexShrink: 0,
        }}
      >
        <SportsEsportsIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, letterSpacing: 2, fontSize: '0.68rem', flexGrow: 1, userSelect: 'none' }}
        >
          {title}
        </Typography>
        <Tooltip title={snapDone ? 'Copied!' : canCopy ? 'Copy screenshot' : 'Save screenshot'}>
          {/* Tooltip requires a single-child that can hold a ref, so we wrap in span. */}
          <span>
            <IconButton
              size="small"
              onClick={handleSnapshot}
              aria-label={canCopy ? 'Copy screenshot' : 'Save screenshot'}
              // Stop propagation so clicking the button doesn't also start a drag.
              onPointerDown={(e) => e.stopPropagation()}
            >
              {snapDone ? <CheckIcon fontSize="small" /> : <CameraAltIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={`Close ${title}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* ── Game canvas (supplied by the caller) ─────────────────────────── */}
      {children}
    </Paper>
  )
}
