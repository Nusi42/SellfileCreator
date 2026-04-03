/**
 * SideBySideSplitter
 *
 * A draggable vertical divider rendered between the builder and preview panels
 * when the app is in side-by-side layout mode. The handle occupies the same
 * 16px horizontal gap that previously appeared as an empty black strip.
 *
 * Drag behaviour:
 *   - mousedown: capture the start position and attach move/up listeners.
 *   - mousemove: clamp the new left width and write it directly to two CSS custom
 *       properties (--splitter-left-width, --splitter-right-width) on containerRef.
 *       No React state is touched during the drag gesture — zero re-renders.
 *   - mouseup: commit the final clamped value via onResize (one React re-render).
 *   - dblclick: reset to 50/50 split (PANEL_WIDTH_PX each).
 *
 * The parent is responsible for initialising the CSS custom properties on the
 * container element (e.g. via useLayoutEffect) and for persisting the value
 * received from onResize.
 */
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Box } from '@mui/material'
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { AUTO_SIDE_BY_SIDE_FORCED_ZOOM, GRID_COLUMN_GAP_PX, PANEL_WIDTH_PX, SIDE_BY_SIDE_BREAKPOINT_PX } from '../../lib/constants'
import { SPLITTER_MIN_WIDTH_PX, SPLITTER_MAX_WIDTH_PX } from '../../state/splitterPreference'

export type SideBySideSplitterProps = {
  /** Called once on mouseup with the final clamped left-panel width in CSS px. */
  onResize: (newLeftPx: number) => void
  /** Current committed left-panel width in CSS px — used as drag start reference. */
  leftWidthPx: number
  /**
   * Ref to the shared flex container that holds both panels. During drag, CSS
   * custom properties are written directly to this node so no React state
   * updates occur until mouseup.
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

/** Total usable width shared by both panels (gap is occupied by the splitter handle). */
const TOTAL_USABLE_PX = SIDE_BY_SIDE_BREAKPOINT_PX - GRID_COLUMN_GAP_PX

export function SideBySideSplitter({
  onResize,
  leftWidthPx,
  containerRef,
  forceSideBySide = false,
  interactive = true,
}: SideBySideSplitterProps) {
  // Track drag start values via refs to avoid stale closures in event listeners.
  const dragStartXRef = useRef<number | null>(null)
  const dragStartLeftRef = useRef<number>(leftWidthPx)
  // Accumulates the latest clamped value during the drag so mouseup can commit it.
  const dragFinalPxRef = useRef<number>(leftWidthPx)
  // Keep a live ref to leftWidthPx so the mousedown handler always reads the latest
  // committed value without re-registering the listener on every render.
  const leftWidthRef = useRef(leftWidthPx)
  // Sync into ref after render.
  useEffect(() => { leftWidthRef.current = leftWidthPx })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to primary (left) mouse button.
    if (e.button !== 0) return
    e.preventDefault()

    dragStartXRef.current = e.clientX
    dragStartLeftRef.current = leftWidthRef.current
    // Initialise the final-value ref so a click-without-move commits the current width.
    dragFinalPxRef.current = leftWidthRef.current

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragStartXRef.current === null) return
      const rawDelta = moveEvent.clientX - dragStartXRef.current
      // When CSS zoom is active, clientX is in visual (zoomed) pixels. Divide by the
      // zoom factor to convert to CSS px, which is what the layout widths are measured in.
      const delta = forceSideBySide ? rawDelta / AUTO_SIDE_BY_SIDE_FORCED_ZOOM : rawDelta
      const clamped = Math.max(
        SPLITTER_MIN_WIDTH_PX,
        Math.min(SPLITTER_MAX_WIDTH_PX, Math.round(dragStartLeftRef.current + delta)),
      )
      dragFinalPxRef.current = clamped

      // Write CSS custom properties directly to the DOM — no React state, no re-renders.
      const el = containerRef.current
      if (el) {
        el.style.setProperty('--splitter-left-width', `${clamped}px`)
        el.style.setProperty('--splitter-right-width', `${TOTAL_USABLE_PX - clamped}px`)
      }
    }

    const handleMouseUp = () => {
      dragStartXRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Commit the final value once — triggers exactly one React re-render + localStorage write.
      onResize(dragFinalPxRef.current)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [containerRef, forceSideBySide, onResize])

  const handleDoubleClick = useCallback(() => {
    // Reset to the default 50/50 split.
    onResize(PANEL_WIDTH_PX)
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
