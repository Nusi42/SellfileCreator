/**
 * testerGridLayout.ts
 *
 * Shared layout constants + helpers for the tester grid.
 */

// Column gap units inside the tester grid (theme.spacing multiplier).
export const TESTER_GRID_COLUMN_GAP_UNITS = 0.375

// Horizontal padding units applied to each grid row container.
export const TESTER_GRID_ROW_PADDING_UNITS = 0.75

// Parse a spacing string (e.g. "12px") into a numeric pixel value.
export const parseSpacingPx = (value: string): number => Number.parseFloat(value) || 0
