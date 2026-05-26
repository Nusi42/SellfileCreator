/**
 * gearInspectorGridLayout.ts
 *
 * Shared layout constants + helpers for the Gear Inspector grid.
 */

import type { GearInspectorGridColumnMode } from '../state/gearInspectorGridPreferences'

// Target card width (px) per size mode. Column count is derived as
// floor(rowContentWidth / targetWidth) so the grid auto-adjusts as the panel resizes.
//
// Calibrated for the default 50/50 side-by-side split where each panel is
// PANEL_WIDTH_PX (1152 CSS px). The column count formula strips:
//   – Paper padding: PREVIEW_PAPER_PADDING_UNITS = 2 → 16 px × 2 = 32 px
//   – Scroll container inline-end padding: GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS = 0.5 → 4 px
//   – Row padding (both sides): GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS × 2 → ~12 px
// → rowContentWidth ≈ 1104 px at the reference panel width.
// These targets land on exactly 4 / 5 / 8 columns at that reference width.
export const GEAR_INSPECTOR_CARD_TARGET_WIDTH_PX: Record<GearInspectorGridColumnMode, number> = {
  large: 265,   // ≈4 columns at the default 1108 px row content width
  medium: 210,  // ≈5 columns
  small: 130,   // ≈8 columns
}

// Fallback column count used on the first render, before the ResizeObserver fires.
export const GEAR_INSPECTOR_CARD_FALLBACK_COLUMN_COUNT: Record<GearInspectorGridColumnMode, number> = {
  large: 4,
  medium: 5,
  small: 8,
}

// Column gap units inside the Gear Inspector grid (theme.spacing multiplier).
export const GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS = 0.375

// Horizontal padding units applied to each grid row container.
export const GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS = 0.75

// Inline end padding applied to the Gear Inspector grid scroll container.
export const GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS = 0.5

// Parse a spacing string into a numeric pixel value. Handles both concrete values ('8px',
// '3px') and MUI v9 CSS vars mode expressions where theme.spacing() returns variable refs
// instead of concrete pixels:
//   spacing(1)     → 'var(--mui-spacing)'
//   spacing(0.375) → 'calc(0.375 * var(--mui-spacing))'
// In CSS vars mode, the var has no inline fallback — the CSS variable value is read from
// the document root. Optional inline fallback (var(--name, 8px)) is also supported.
export const parseSpacingPx = (value: string): number => {
  const direct = Number.parseFloat(value)
  if (Number.isFinite(direct) && direct >= 0) return direct
  // MUI v9 CSS vars mode: var(--mui-spacing) or calc(N * var(--mui-spacing)).
  const varMatch = value.match(/var\(([^,)]+)(?:,\s*([\d.]+)px)?\)/)
  if (varMatch) {
    const varName = (varMatch[1] ?? '').trim()
    const fallback = varMatch[2] != null ? Number.parseFloat(varMatch[2]) : NaN
    // Read the resolved CSS variable value from the document root (browser context only).
    const resolved = typeof document !== 'undefined'
      ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName))
      : NaN
    const basePx = Number.isFinite(resolved) ? resolved : (Number.isFinite(fallback) ? fallback : 8)
    const multMatch = value.match(/^calc\(\s*([\d.]+)\s*\*/)
    return basePx * (multMatch ? Number.parseFloat(multMatch[1] ?? '1') : 1)
  }
  return 0
}

type ResolveGearInspectorCardWidthParams = {
  panelWidthPx: number | null
  panelPaddingPx: number
  containerPaddingInlineEndPx: number
  scrollbarWidthPx: number
  gridGapPx: number
  rowPaddingPx: number
  columnCount: number
}

// Resolve the Gear Inspector card width from a panel width + spacing constants.
export const resolveGearInspectorCardWidthPx = ({
  panelWidthPx,
  panelPaddingPx,
  containerPaddingInlineEndPx,
  scrollbarWidthPx,
  gridGapPx,
  rowPaddingPx,
  columnCount,
}: ResolveGearInspectorCardWidthParams): number | null => {
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
