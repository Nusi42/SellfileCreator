/**
 * keepOverrideLayout.ts
 *
 * Shared layout helpers for keep-override tabs (Keep Uniques + Keep Best Substat).
 */

// Rules pane keeps a minimum width so editor controls never collapse.
export const KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_PX = 360
// Two-column mode can spare a bit less width without crushing the editor controls.
export const KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_COMPACT_PX = 320

// Keep-override grids match the Rule Tester card width at 4 columns.
export const KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT = 4

type KeepOverrideGridPaneWidthParams = {
  gridColumnMode: 1 | 2
  targetCardWidthPx: number | null
  gridGapPx: number
  rowPaddingPx: number
}

// Resolve the right-column width so keep-override cards mirror the tester grid width.
export const resolveKeepOverrideGridPaneWidth = ({
  gridColumnMode,
  targetCardWidthPx,
  gridGapPx,
  rowPaddingPx,
}: KeepOverrideGridPaneWidthParams): string | null => {
  // Skip forcing a width until we know the tester card width.
  if (!Number.isFinite(targetCardWidthPx)) return null
  // Normalize card width so NaN/negative input cannot break layout.
  const normalizedCardWidth = Math.max(0, Number(targetCardWidthPx))
  if (normalizedCardWidth <= 0) return null
  // Normalize padding + gap so arithmetic stays stable.
  const normalizedPadding = Math.max(0, rowPaddingPx)
  const normalizedGap = Math.max(0, gridGapPx)
  // Resolve the active column count (keep-override only supports 1 or 2).
  const columnCount = gridColumnMode === 2 ? 2 : 1
  // Grid pane width is: card widths + gaps + row padding on both sides.
  const resolved = (normalizedCardWidth * columnCount)
    + (Math.max(0, columnCount - 1) * normalizedGap)
    + (normalizedPadding * 2)
  return `${resolved}px`
}
