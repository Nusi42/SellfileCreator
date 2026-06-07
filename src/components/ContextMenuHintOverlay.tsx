import { Box } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TINT } from '../lib/colorTints'

type Props = {
  text: string
  position: { x: number; y: number } | null
}

// Flip horizontal anchor when cursor is this close to the right edge (px).
const HINT_FLIP_THRESHOLD_PX = 220
const HINT_OFFSET_PX = 10
// Safety-net radius: once the cursor strays this far from the anchored hint, we
// treat the trigger's onMouseLeave as having silently failed and self-dismiss.
const HINT_DISMISS_RADIUS_PX = 48

export function ContextMenuHintOverlay({ text, position }: Props) {
  // The hint normally clears when the trigger fires onMouseLeave, but that event
  // is unreliable: a layout shift (a sibling button appearing) or a re-render can
  // move the trigger out from under a stationary cursor without ever firing it,
  // orphaning this pointer-events:none overlay until reload. Guard against that by
  // self-dismissing whenever the cursor demonstrably leaves the anchored area.
  const [dismissed, setDismissed] = useState(false)
  // Track the previous position so we can reset self-dismissal during render
  // (rather than in an effect) when the trigger reports a fresh hover.
  const [prevPosition, setPrevPosition] = useState(position)
  // Hold the freshest anchor so the global listener compares against live coords
  // without re-subscribing on every mouse move.
  const posRef = useRef(position)
  // A new (non-null) position means the trigger is reporting an active hover, so
  // clear any prior self-dismissal.
  if (position !== prevPosition) {
    setPrevPosition(position)
    if (position) setDismissed(false)
  }
  // Keep the anchor ref current for the global safety-net listener below.
  useEffect(() => {
    posRef.current = position
  }, [position])
  // While a hint is live, watch for the signals that a normal dismiss would miss.
  useEffect(() => {
    if (!position) return undefined
    const dismiss = () => setDismissed(true)
    const handlePointerMove = (event: PointerEvent) => {
      const anchor = posRef.current
      if (!anchor) return
      // Compare the latest committed anchor against the live cursor; capture phase
      // runs before the trigger's own handlers so this lags by one move at most.
      const dx = event.clientX - anchor.x
      const dy = event.clientY - anchor.y
      if (Math.hypot(dx, dy) > HINT_DISMISS_RADIUS_PX) dismiss()
    }
    window.addEventListener('pointermove', handlePointerMove, true)
    // Scroll/wheel/focus-loss/tab-hide all orphan the hint just as silently.
    window.addEventListener('wheel', dismiss, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('blur', dismiss)
    document.addEventListener('visibilitychange', dismiss)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true)
      window.removeEventListener('wheel', dismiss, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('blur', dismiss)
      document.removeEventListener('visibilitychange', dismiss)
    }
  }, [position])

  if (!position || dismissed) return null
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
        backgroundColor: TINT.nearOpaquePaperBg,
        color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
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
