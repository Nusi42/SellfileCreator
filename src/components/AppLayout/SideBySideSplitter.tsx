/**
 * SideBySideSplitter
 *
 * A draggable vertical divider rendered between the builder and preview panels
 * when the app is in side-by-side layout mode. The handle occupies the same
 * 16px horizontal gap that previously appeared as an empty black strip.
 *
 * Drag behaviour:
 *   - mousedown: capture the start position and attach move/up listeners.
 *   - mousemove: compute delta (zoom-corrected when forceSideBySide), call onResize.
 *   - mouseup: release listeners.
 *   - dblclick: reset to 50/50 split (PANEL_WIDTH_PX each).
 *
 * The parent is responsible for clamping the value before persisting; this
 * component only calls onResize with raw (but zoom-corrected) left-panel px.
 */
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Box } from '@mui/material'
import { useCallback, useRef } from 'react'

import { AUTO_SIDE_BY_SIDE_FORCED_ZOOM, GRID_COLUMN_GAP_PX, PANEL_WIDTH_PX } from '../../lib/constants'

export type SideBySideSplitterProps = {
  /** Called during drag with the desired new left-panel width in CSS px. */
  onResize: (newLeftPx: number) => void
  /** Current left-panel width in CSS px — used as drag start reference. */
  leftWidthPx: number
  /** When true, CSS zoom is applied to the root; deltas must be divided by the zoom factor. */
  forceSideBySide?: boolean
  /**
   * When false (production), the component still renders to reserve GRID_COLUMN_GAP_PX of
   * horizontal space so the layout matches dev; drag interaction and the visible icon are suppressed.
   */
  interactive?: boolean
}

export function SideBySideSplitter({ onResize, leftWidthPx, forceSideBySide = false, interactive = true }: SideBySideSplitterProps) {
  // Track drag start values via refs to avoid stale closures in event listeners.
  const dragStartXRef = useRef<number | null>(null)
  const dragStartLeftRef = useRef<number>(leftWidthPx)
  // Keep a live ref to leftWidthPx so the mousedown handler always reads the latest value
  // without re-registering the listener on every render.
  const leftWidthRef = useRef(leftWidthPx)
  leftWidthRef.current = leftWidthPx

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to primary (left) mouse button.
    if (e.button !== 0) return
    e.preventDefault()

    dragStartXRef.current = e.clientX
    dragStartLeftRef.current = leftWidthRef.current

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragStartXRef.current === null) return
      const rawDelta = moveEvent.clientX - dragStartXRef.current
      // When CSS zoom is active, clientX is in visual (zoomed) pixels. Divide by the
      // zoom factor to convert to CSS px, which is what the layout widths are measured in.
      const delta = forceSideBySide ? rawDelta / AUTO_SIDE_BY_SIDE_FORCED_ZOOM : rawDelta
      onResize(dragStartLeftRef.current + delta)
    }

    const handleMouseUp = () => {
      dragStartXRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [forceSideBySide, onResize])

  const handleDoubleClick = useCallback(() => {
    // Reset to the default 50/50 split.
    onResize(PANEL_WIDTH_PX)
  }, [onResize])

  return (
    <Box
      // Interaction handlers are only wired up in dev builds where interactive=true.
      onMouseDown={interactive ? handleMouseDown : undefined}
      onDoubleClick={interactive ? handleDoubleClick : undefined}
      sx={{
        // Fixed width — matches the original GRID_COLUMN_GAP_PX so total layout width is unchanged.
        width: GRID_COLUMN_GAP_PX,
        flexShrink: 0,
        // Stretch to fill the height of the taller panel (parent uses alignItems: 'stretch').
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // In production the element is a passive spacer — no pointer affordances.
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
      {/* Vertical grip icon — only shown when interactive (dev builds). */}
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
