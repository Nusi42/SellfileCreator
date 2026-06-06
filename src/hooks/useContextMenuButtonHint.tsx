/**
 * Bundles the full "right-click for actions" hint lifecycle into one call.
 *
 * Returns:
 *  • triggerProps — spread onto the hoverable element (onMouseEnter/Move/Leave).
 *  • onOpen()    — call when the context menu actually opens; marks the hint seen
 *                  and clears the tooltip immediately.
 *  • overlay     — the ContextMenuHintOverlay element; render it anywhere in the
 *                  component's JSX tree (typically near the trigger).
 *
 * Using this hook instead of useContextMenuHint directly ensures the three pieces
 * (pos state, trigger handlers, overlay render) cannot be accidentally left
 * partially wired.
 *
 * For complex cases — two interleaved hints, exposed pos state for parent components,
 * container-level tracking with drag suppression — use useContextMenuHint directly;
 * those sites are documented with a comment explaining why.
 */
import React, { useCallback, useState } from 'react'
import { ContextMenuHintOverlay } from '../components/ContextMenuHintOverlay'
import type { ContextHintId } from './contextMenuHintIds'
import { useContextMenuHint } from './useContextMenuHint'

interface Options {
  /** When false, the hint never shows and trigger events are no-ops. Default true. */
  enabled?: boolean
  /** Pre-translated hint text displayed in the overlay. */
  text: string
}

interface Result {
  /** Spread onto the trigger element to track cursor position. */
  triggerProps: {
    onMouseEnter: (event: React.MouseEvent) => void
    onMouseMove: (event: React.MouseEvent) => void
    onMouseLeave: () => void
  }
  /** Call when the context menu opens — marks the hint seen and clears the tooltip. */
  onOpen: () => void
  /** The hint overlay element — render this somewhere near the trigger. */
  overlay: React.ReactElement | null
}

export function useContextMenuButtonHint(
  id: ContextHintId,
  { enabled = true, text }: Options,
): Result {
  const { shouldShow, markSeen } = useContextMenuHint(id)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Render-time guard: clear a stale pos when the hint is dismissed (shouldShow → false).
  const [prevShouldShow, setPrevShouldShow] = useState(shouldShow)
  if (shouldShow !== prevShouldShow) {
    setPrevShouldShow(shouldShow)
    if (!shouldShow && pos !== null) setPos(null)
  }

  const active = shouldShow && enabled && pos !== null

  const onMouseEnter = useCallback((event: React.MouseEvent) => {
    if (!shouldShow || !enabled) return
    setPos({ x: event.clientX, y: event.clientY })
  }, [enabled, shouldShow])

  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!shouldShow || !enabled) return
    setPos({ x: event.clientX, y: event.clientY })
  }, [enabled, shouldShow])

  const onMouseLeave = useCallback(() => { setPos(null) }, [])

  const onOpen = useCallback(() => {
    markSeen()
    setPos(null)
  }, [markSeen])

  const overlay = <ContextMenuHintOverlay text={text} position={active ? pos : null} />

  return { triggerProps: { onMouseEnter, onMouseMove, onMouseLeave }, onOpen, overlay }
}
