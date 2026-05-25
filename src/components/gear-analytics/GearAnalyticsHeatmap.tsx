/**
 * GearAnalyticsHeatmap.tsx
 *
 * CSS-grid slot × main stat coverage heatmap.
 * Cell color uses a red→green heat scale (high count = green, low count = red).
 * Clicking a column header toggles its slot in the cross-filter.
 * Clicking a cell toggles both the slot (cross-filter) and the main stat (substat drill-down filter).
 */
import React from 'react'
import { Box, Collapse, Tooltip, useTheme } from '@mui/material'
import { HEATMAP_SLOTS, HEATMAP_VARIANTS, artifactTypeI18nKey, statVariantI18nKey, type SlotMainMatrix } from '../../lib/gearAnalytics'
import type { GearAnalyticsDim } from '../../lib/gearAnalytics'
import { EllipsisTooltip } from '../EllipsisTooltip'
import { useI18n } from '../../lib/i18n'
import { useDisplayPreferences } from '../../state/preferencesState'
import { slotIconSvgAsset } from '../artifactTypeIcons'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { GearAnalyticsChartHeader } from './GearAnalyticsChartHeader'

type Props = {
  matrix: SlotMainMatrix
  dim: GearAnalyticsDim
  /** Toggle a slot selection in the cross-filter when a cell or column header is clicked. */
  onToggleSlot: (slot: number) => void
  /** Toggle a main stat selection in the substat drill-down filter when a cell is clicked. */
  onToggleMainStat?: (variant: number) => void
  /** When true, the chart body is hidden and only the title row remains visible. */
  collapsed?: boolean
  /** Called when the user clicks the collapse chevron; applyToAll = Ctrl/Cmd+click or right-click. */
  onToggleCollapse?: (applyToAll: boolean) => void
}

const CELL_SIZE = 34      // px per cell square
const LABEL_COL_W = 80   // px for stat label column — wide enough for "CDMG%", "Gauntlets", etc.
const SLOT_HEADER_H = 32  // px for slot header row

/** Map a 0–1 intensity to a heatmap color: 0 = red, 1 = green. Zero-count cells use the divider tone. */
function heatColor(intensity: number): string {
  // Hue: 0° = red, 120° = green. Saturation and lightness kept perceptually consistent.
  const hue = Math.round(intensity * 120)
  const lightness = Math.round(38 + intensity * 6)
  return `hsl(${hue}, 65%, ${lightness}%)`
}

export function GearAnalyticsHeatmap({ matrix, dim, onToggleSlot, onToggleMainStat, collapsed, onToggleCollapse }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { statButtonBorders } = useDisplayPreferences()
  const [substatColors] = useSubstatColors()

  return (
    <Box>
      {/* Title row — chevron toggles collapse; tooltip on the label for context. */}
      <GearAnalyticsChartHeader title={t('gearAnalyticsChartHeatmap')} description={t('gearAnalyticsChartHeatmapDesc')} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      <Collapse in={!collapsed} timeout="auto">
      <Box sx={{ overflowX: 'auto' }}>
        {/* Grid: first column is the stat label, then one column per slot. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `${LABEL_COL_W}px ${HEATMAP_SLOTS.map(() => `${CELL_SIZE}px`).join(' ')}`,
            width: 'fit-content',
            userSelect: 'none',
          }}
        >
          {/* Header row: empty corner + slot names. */}
          <Box sx={{ height: SLOT_HEADER_H }} />
          {HEATMAP_SLOTS.map((slot) => {
            const isSelected = dim.slots.has(slot)
            const icon = slotIconSvgAsset(slot)
            const useIcon = icon !== null
            return (
              // Always show the full slot name in a tooltip (icons need it; text may be clipped).
              <Tooltip key={slot} title={t(artifactTypeI18nKey(slot))} placement="top" arrow>
                <Box
                  onClick={() => onToggleSlot(slot)}
                  sx={{
                    height: SLOT_HEADER_H,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    px: 0.25,
                    overflow: 'hidden',
                    color: isSelected ? 'primary.main' : 'text.secondary',
                    borderBottom: isSelected
                      ? `2px solid ${(theme.vars?.palette.primary.main ?? theme.palette.primary.main)}`
                      : '2px solid transparent',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  {useIcon ? (
                    // Icon inherits `color` via fill:currentColor so selection is reflected.
                    <Box component="svg" viewBox={icon.viewBox}
                      sx={{ width: 16, height: 16, fill: 'currentColor', display: 'block', flexShrink: 0 }}
                    >
                      <path d={icon.path} />
                    </Box>
                  ) : (
                    <Box component="span" sx={{
                      display: 'block', width: '100%',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontSize: 9, fontWeight: isSelected ? 700 : 400, lineHeight: 1, textAlign: 'center',
                    }}>
                      {t(artifactTypeI18nKey(slot))}
                    </Box>
                  )}
                </Box>
              </Tooltip>
            )
          })}

          {/* Data rows: one per stat variant. */}
          {HEATMAP_VARIANTS.map((variant) => (
            // Fragment carries the key; inner children don't need their own keys.
            <React.Fragment key={variant}>
              {/* Stat label cell — EllipsisTooltip shows the full name when text is clipped. */}
              <EllipsisTooltip title={t(statVariantI18nKey(variant))} wrap="block">
                <Box
                  sx={{
                    height: CELL_SIZE,
                    display: 'flex',
                    alignItems: 'center',
                    pr: 0.5,
                    fontSize: 10,
                    // Use the user-configured stat color; fall back to theme secondary.
                    // Respect the global "color stat texts" preference.
                    color: statButtonBorders ? (substatColors[variant]?.fg ?? theme.palette.text.secondary) : (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(statVariantI18nKey(variant))}
                </Box>
              </EllipsisTooltip>
              {/* Count cells for each slot × this variant. */}
              {HEATMAP_SLOTS.map((slot) => {
                const count = matrix.matrix[slot]?.[variant] ?? 0
                const maxCount = matrix.maxCount
                // Intensity 0 for zero-count cells, scaled up to 1 for max-count cells.
                const intensity = maxCount > 0 ? count / maxCount : 0
                // Zero-count cells use the neutral divider tone; non-zero cells use the heat scale.
                const bgColor = intensity > 0
                  ? heatColor(intensity)
                  : 'rgba(var(--mui-palette-text-primaryChannel) / 0.06)'

                return (
                  <Tooltip
                    key={`${slot}-${variant}`}
                    title={`${t(artifactTypeI18nKey(slot))} / ${t(statVariantI18nKey(variant))}: ${count}`}
                    placement="top"
                    arrow
                  >
                    <Box
                      onClick={() => { onToggleSlot(slot); onToggleMainStat?.(variant) }}
                      sx={{
                        height: CELL_SIZE,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: bgColor,
                        cursor: 'pointer',
                        fontSize: 9,
                        // Light text on medium-to-high intensity cells (green range), dark text on red/empty.
                        color: intensity > 0.4 ? 'rgba(255,255,255,0.9)' : 'text.secondary',
                        fontWeight: intensity > 0 ? 600 : 400,
                        border: '1px solid',
                        borderColor: 'divider',
                        transition: 'filter 0.12s',
                        '&:hover': { filter: 'brightness(1.18)' },
                      }}
                    >
                      {count > 0 ? count : null}
                    </Box>
                  </Tooltip>
                )
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>
      </Collapse>
    </Box>
  )
}
