/**
 * BuilderSplitter
 *
 * The draggable horizontal divider inside the builder column, sitting between the builder-form
 * paper (top) and the chip-list paper (bottom). It is the row-axis counterpart to
 * SideBySideSplitter and shares that component's drag gesture via useSplitterDrag.
 *
 * Two behaviours are specific to this handle:
 *
 *  - It only becomes interactive in side-by-side mode. That is the only layout where the builder
 *    column has a fixed height budget to divide; stacked single-column mode lets both papers grow
 *    with their content, so there is nothing to trade off and the handle renders as a passive gap.
 *  - Double-click resets to null rather than to a fixed ratio. Null restores the natural-height
 *    default (top paper exactly as tall as its form, chips take the rest), which is the layout the
 *    builder column has before the user ever drags.
 */
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { Box } from '@mui/material'
import { useCallback } from 'react'
import type { RefObject } from 'react'

import { useSplitterDrag } from '../../hooks/useSplitterDrag'
import {
  BUILDER_SPLITTER_MIN_BOTTOM_PX,
  BUILDER_SPLITTER_MIN_TOP_PX,
  GRID_COLUMN_GAP_PX,
} from '../../lib/constants'

/** CSS custom properties the drag writes; the column reads them for live resizing. */
export const BUILDER_SPLITTER_TOP_VAR = '--builder-splitter-top-height'
export const BUILDER_SPLITTER_BOTTOM_VAR = '--builder-splitter-bottom-height'

export type BuilderSplitterProps = {
  /**
   * Current committed split ratio, or null when the user has not dragged in this builder mode.
   * Null is the natural-height default; the drag needs a concrete start value, so the caller
   * passes the measured fallback ratio alongside it.
   */
  ratio: number | null
  /**
   * Ratio to start a drag from when `ratio` is null — the natural split measured from the DOM,
   * so grabbing the handle continues from exactly where the papers currently sit rather than
   * jumping to an arbitrary value.
   */
  fallbackRatio: number
  /** Called once on mouseup with the final clamped ratio; null on double-click reset. */
  onResize: (ratio: number | null) => void
  /** The column element carrying the CSS custom properties written during the drag. */
  containerRef: RefObject<HTMLElement | null>
  /**
   * Height budget (CSS px) the two papers share. Measured by useBuilderPreviewLayout rather than
   * read off the container, because the container's own box is what the drag is resizing.
   */
  usableHeightPx: number | null
  /** When true, CSS zoom is applied to the root; deltas must be divided by the zoom factor. */
  forceSideBySide?: boolean
  /** False renders a passive spacer of the same height so the stacked layout keeps its gap. */
  interactive?: boolean
}

export function BuilderSplitter({
  ratio,
  fallbackRatio,
  onResize,
  containerRef,
  usableHeightPx,
  forceSideBySide = false,
  interactive = true,
}: BuilderSplitterProps) {
  // Shared gesture: vertical axis, floors that keep the form usable and the chip list readable.
  const { handleMouseDown } = useSplitterDrag({
    axis: 'vertical',
    // A null ratio means "natural height" — start the drag from where the papers actually are.
    ratio: ratio ?? fallbackRatio,
    containerRef,
    leadingVar: BUILDER_SPLITTER_TOP_VAR,
    trailingVar: BUILDER_SPLITTER_BOTTOM_VAR,
    gapPx: GRID_COLUMN_GAP_PX,
    minLeadingPx: BUILDER_SPLITTER_MIN_TOP_PX,
    minTrailingPx: BUILDER_SPLITTER_MIN_BOTTOM_PX,
    forceSideBySide,
    onResize,
    usableExtentPx: usableHeightPx,
  })

  const handleDoubleClick = useCallback(() => {
    // Remove the inline variables as well as the stored ratio. The papers read
    // `var(--…, auto)`, so a leftover inline px value would keep winning over the natural-height
    // fallback and the reset would appear to do nothing.
    const container = containerRef.current
    if (container) {
      container.style.removeProperty(BUILDER_SPLITTER_TOP_VAR)
      container.style.removeProperty(BUILDER_SPLITTER_BOTTOM_VAR)
    }
    // Clear the stored ratio — back to the builder form's natural height.
    onResize(null)
  }, [containerRef, onResize])

  return (
    <Box
      // Interaction handlers are only active when interactive=true.
      onMouseDown={interactive ? handleMouseDown : undefined}
      onDoubleClick={interactive ? handleDoubleClick : undefined}
      sx={{
        // Fixed height — mirrors the column splitter's fixed width so both gaps read the same.
        height: GRID_COLUMN_GAP_PX,
        flexShrink: 0,
        // Span the full column width (parent is a column flex with stretched children).
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Passive spacer when not interactive — no pointer affordances.
        ...(interactive ? {
          cursor: 'row-resize',
          borderRadius: 1,
          transition: 'background-color 150ms ease',
          '&:hover': { backgroundColor: 'action.hover' },
          '&:active': { backgroundColor: 'action.selected' },
          userSelect: 'none',
        } : {}),
      }}
    >
      {/* Horizontal grip icon — the MUI DragIndicator's default orientation already reads as a
          row divider, so unlike the column splitter it needs no rotation. */}
      {interactive && (
        <DragIndicatorIcon
          sx={{
            fontSize: 14,
            color: 'text.disabled',
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  )
}
