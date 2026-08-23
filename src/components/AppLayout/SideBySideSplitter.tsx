/**
 * SideBySideSplitter
 *
 * A draggable vertical divider rendered between the builder and preview panels
 * when the app is in side-by-side layout mode. The handle occupies the same
 * 16px horizontal gap that previously appeared as an empty black strip.
 *
 * The drag gesture itself lives in useSplitterDrag (shared with BuilderSplitter);
 * this component supplies the axis, the CSS variable names, the clamps, and the
 * double-click reset (50/50), and renders the handle.
 *
 * The parent is responsible for initialising the CSS custom properties on the
 * container element (e.g. via useLayoutEffect) and for persisting the ratio
 * received from onResize.
 */
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Box } from '@mui/material'
import { useCallback } from 'react'
import type { RefObject } from 'react'

import { useSplitterDrag } from '../../hooks/useSplitterDrag'
import { GRID_COLUMN_GAP_PX } from '../../lib/constants'
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

export function SideBySideSplitter({
  onResize,
  onResizeLive,
  ratio,
  containerRef,
  forceSideBySide = false,
  interactive = true,
}: SideBySideSplitterProps) {
  // Shared gesture: horizontal axis, both panels floored at SPLITTER_MIN_WIDTH_PX.
  const { handleMouseDown } = useSplitterDrag({
    axis: 'horizontal',
    ratio,
    containerRef,
    leadingVar: '--splitter-left-width',
    trailingVar: '--splitter-right-width',
    gapPx: GRID_COLUMN_GAP_PX,
    minLeadingPx: SPLITTER_MIN_WIDTH_PX,
    minTrailingPx: SPLITTER_MIN_WIDTH_PX,
    forceSideBySide,
    onResize,
    ...(onResizeLive ? { onResizeLive } : {}),
  })

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
