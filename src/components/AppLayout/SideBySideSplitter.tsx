/**
 * SideBySideSplitter
 *
 * A draggable vertical divider rendered between the builder and preview panels
 * when the app is in side-by-side layout mode. The handle occupies the same
 * 16px horizontal gap that previously appeared as an empty black strip.
 *
 * Drag behaviour:
 *   - mousedown: capture the start ratio and attach move/up listeners.
 *   - mousemove: read the container's current usable width, compute the new
 *       ratio from the cursor delta, clamp it, and write absolute px values
 *       directly to two CSS custom properties (--splitter-left-width,
 *       --splitter-right-width) on containerRef. No React state is touched
 *       during the drag gesture — zero re-renders.
 *   - mouseup: commit the final clamped ratio via onResize (one React re-render).
 *   - dblclick: reset to 50/50 split (ratio 0.5).
 *
 * The parent is responsible for initialising the CSS custom properties on the
 * container element (e.g. via useLayoutEffect) and for persisting the ratio
 * received from onResize.
 */
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Box } from '@mui/material'
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { AUTO_SIDE_BY_SIDE_FORCED_ZOOM, GRID_COLUMN_GAP_PX } from '../../lib/constants'
import { SPLITTER_MIN_WIDTH_PX } from '../../state/splitterPreference'

export type SideBySideSplitterProps = {
  /** Called once on mouseup with the final clamped split ratio (0.0–1.0). */
  onResize: (newRatio: number) => void
  /**
   * Optional live callback fired on every mousemove during drag with the right-panel
   * width in CSS px. Callers can use this to update layout props (e.g. column count)
   * without waiting for mouseup. The value is the same px that gets written to
   * --splitter-right-width, so no additional math is required on the caller side.
   */
  onResizeLive?: (rightWidthPx: number) => void
  /** Current committed split ratio — used as drag start reference. */
  ratio: number
  /**
   * Ref to the shared flex container that holds both panels. During drag, CSS
   * custom properties are written directly to this node so no React state
   * updates occur until mouseup. Also used to read the live container width
   * so the ratio→px conversion is always correct regardless of window size.
   */
  containerRef: RefObject<HTMLElement | null>
  /** When true, CSS zoom is applied to the root; deltas must be divided by the zoom factor. */
  forceSideBySide?: boolean
  /**
   * When false, the component renders as a passive spacer (no cursor / hover affordances)
   * but still occupies GRID_COLUMN_GAP_PX so the layout width is unchanged.
   */
  interactive?: boolean
}

/** Convert a split ratio to left/right px given the container's usable width. */
function ratioToPx(ratio: number, usableWidthPx: number): { leftPx: number; rightPx: number } {
  const leftPx = Math.max(SPLITTER_MIN_WIDTH_PX, Math.min(usableWidthPx - SPLITTER_MIN_WIDTH_PX, Math.round(ratio * usableWidthPx)))
  return { leftPx, rightPx: usableWidthPx - leftPx }
}

export function SideBySideSplitter({
  onResize,
  onResizeLive,
  ratio,
  containerRef,
  forceSideBySide = false,
  interactive = true,
}: SideBySideSplitterProps) {
  // Track drag start values via refs to avoid stale closures in event listeners.
  const dragStartXRef = useRef<number | null>(null)
  const dragStartRatioRef = useRef<number>(ratio)
  // Accumulates the latest clamped ratio during the drag so mouseup can commit it.
  const dragFinalRatioRef = useRef<number>(ratio)
  // Keep a live ref to ratio so the mousedown handler always reads the latest
  // committed value without re-registering the listener on every render.
  const ratioRef = useRef(ratio)
  // Sync into ref after render.
  useEffect(() => { ratioRef.current = ratio })
  // Keep a live ref to onResizeLive so the mousemove closure always calls the
  // latest callback without needing to re-register the listener.
  const onResizeLiveRef = useRef(onResizeLive)
  useEffect(() => { onResizeLiveRef.current = onResizeLive }, [onResizeLive])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to primary (left) mouse button.
    if (e.button !== 0) return
    e.preventDefault()

    dragStartXRef.current = e.clientX
    dragStartRatioRef.current = ratioRef.current
    // Initialise the final-value ref so a click-without-move commits the current ratio.
    dragFinalRatioRef.current = ratioRef.current

    // Snapshot the container's usable width once at drag start.
    // The container is width: 100vw (or fixed in forced-zoom mode) — it does not change
    // during a drag gesture. Caching this avoids calling getBoundingClientRect() on every
    // mousemove, which would force a synchronous layout flush each event and starve the
    // browser's rendering update that delivers ResizeObserver notifications (live column count).
    const el = containerRef.current
    const zoom = forceSideBySide ? AUTO_SIDE_BY_SIDE_FORCED_ZOOM : 1
    const containerUsableAtStart = el
      ? Math.max(0, el.getBoundingClientRect().width / zoom - GRID_COLUMN_GAP_PX)
      : 0

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragStartXRef.current === null || containerUsableAtStart <= 0) return
      const container = containerRef.current
      if (!container) return

      // clientX is in visual (zoomed) px when zoom is active; divide for CSS px delta.
      const rawDelta = moveEvent.clientX - dragStartXRef.current
      const delta = forceSideBySide ? rawDelta / zoom : rawDelta

      // Convert delta to a ratio change, then clamp the resulting ratio.
      const rawRatio = dragStartRatioRef.current + delta / containerUsableAtStart
      // Also enforce absolute-px minimums so panels never collapse below SPLITTER_MIN_WIDTH_PX.
      const minRatio = SPLITTER_MIN_WIDTH_PX / containerUsableAtStart
      const maxRatio = 1 - minRatio
      const clampedRatio = Math.max(minRatio, Math.min(maxRatio, rawRatio))
      dragFinalRatioRef.current = clampedRatio

      // Write CSS custom properties directly to the DOM — no React state, no re-renders.
      const { leftPx, rightPx } = ratioToPx(clampedRatio, containerUsableAtStart)
      container.style.setProperty('--splitter-left-width', `${leftPx}px`)
      container.style.setProperty('--splitter-right-width', `${rightPx}px`)
      // Notify the caller of the live right-panel width so layout props (e.g. column
      // count) can update without waiting for mouseup to commit the ratio.
      onResizeLiveRef.current?.(rightPx)
    }

    const handleMouseUp = () => {
      dragStartXRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Commit the final ratio once — triggers exactly one React re-render + localStorage write.
      onResize(dragFinalRatioRef.current)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [containerRef, forceSideBySide, onResize])

  const handleDoubleClick = useCallback(() => {
    // Reset to the default 50/50 split.
    onResize(0.5)
  }, [onResize])

  return (
    <Box
      // Interaction handlers are only active when interactive=true.
      onMouseDown={interactive ? handleMouseDown : undefined}
      onDoubleClick={interactive ? handleDoubleClick : undefined}
      sx={{
        // Fixed width — matches GRID_COLUMN_GAP_PX so total layout width is unchanged.
        width: GRID_COLUMN_GAP_PX,
        flexShrink: 0,
        // Stretch to fill the height of the taller panel (parent uses alignItems: 'stretch').
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Passive spacer when not interactive — no pointer affordances.
        ...(interactive ? {
          cursor: 'col-resize',
          borderRadius: 1,
          transition: 'background-color 150ms ease',
          '&:hover': { backgroundColor: 'action.hover' },
          '&:active': { backgroundColor: 'action.selected' },
          userSelect: 'none',
        } : {}),
      }}
    >
      {/* Vertical grip icon — only shown when interactive. */}
      {interactive && (
        <DragIndicatorIcon
          sx={{
            fontSize: 14,
            color: 'text.disabled',
            // The MUI DragIndicator icon has horizontal lines by default; rotating makes them vertical.
            transform: 'rotate(90deg)',
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  )
}
