/**
 * testerGridLayout.ts
 *
 * Shared layout constants + helpers for the tester grid.
 */

// Column gap units inside the tester grid (theme.spacing multiplier).
export const TESTER_GRID_COLUMN_GAP_UNITS = 0.375

// Horizontal padding units applied to each grid row container.
export const TESTER_GRID_ROW_PADDING_UNITS = 0.75

// Inline end padding applied to the tester grid scroll container.
export const TESTER_GRID_CONTAINER_PADDING_END_UNITS = 0.5

// Parse a spacing string (e.g. "12px") into a numeric pixel value.
export const parseSpacingPx = (value: string): number => Number.parseFloat(value) || 0

type ResolveTesterCardWidthParams = {
  panelWidthPx: number | null
  panelPaddingPx: number
  containerPaddingInlineEndPx: number
  scrollbarWidthPx: number
  gridGapPx: number
  rowPaddingPx: number
  columnCount: number
}

// Resolve the Rule Tester card width from a panel width + spacing constants.
export const resolveTesterCardWidthPx = ({
  panelWidthPx,
  panelPaddingPx,
  containerPaddingInlineEndPx,
  scrollbarWidthPx,
  gridGapPx,
  rowPaddingPx,
  columnCount,
}: ResolveTesterCardWidthParams): number | null => {
  // Guard against missing measurements or invalid inputs.
  if (!Number.isFinite(panelWidthPx)) return null
  const normalizedPanelWidth = Math.max(0, Number(panelWidthPx))
  if (normalizedPanelWidth <= 0) return null
  // Normalize spacing values so negative inputs cannot skew the width.
  const normalizedPadding = Math.max(0, panelPaddingPx)
  const normalizedContainerPadding = Math.max(0, containerPaddingInlineEndPx)
  const normalizedScrollbarWidth = Math.max(0, scrollbarWidthPx)
  const normalizedRowPadding = Math.max(0, rowPaddingPx)
  const normalizedGap = Math.max(0, gridGapPx)
  const normalizedColumns = Math.max(1, Math.round(columnCount))
  // Panel width includes its own padding; strip it to get the grid container width.
  const gridContainerWidth = Math.max(0, normalizedPanelWidth - (normalizedPadding * 2))
  // Strip the scroll container padding so widths match the rendered grid.
  const scrollContainerWidth = Math.max(
    0,
    gridContainerWidth - normalizedContainerPadding - normalizedScrollbarWidth,
  )
  // Grid rows add their own horizontal padding before cards render.
  const rowContentWidth = Math.max(0, scrollContainerWidth - (normalizedRowPadding * 2))
  if (rowContentWidth <= 0) return null
  // Subtract column gaps and divide by column count to get the per-card width.
  const availableWidth = Math.max(0, rowContentWidth - (normalizedGap * Math.max(0, normalizedColumns - 1)))
  if (availableWidth <= 0) return null
  return Math.round((availableWidth / normalizedColumns) * 100) / 100
}
