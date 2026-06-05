import { type ReactNode } from 'react'
import { Box, Divider, Typography, type Theme } from '@mui/material'
import SellIcon from '@mui/icons-material/Sell'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import StarsIcon from '@mui/icons-material/Stars'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { useI18n } from '../lib/i18n'
import MarkdownTooltip from './MarkdownTooltip'
import type { GearDiffDelta } from '../hooks/useGearDiffCompare'

// Format a signed delta: explicit + for gains, "0" when unchanged, "-" comes for free.
function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

// Tone color for a delta value: neutral when zero, otherwise the metric's own color.
function toneColor(theme: Theme, value: number, activeColor: string): string {
  if (value === 0) return theme.vars?.palette.text.disabled ?? theme.palette.text.disabled
  return activeColor
}

// Pill chrome matches the Gear Inspector outcome summary chip's shape/size (so they line up
// in the header) but uses the SECONDARY tint + a leading compare icon to read as a clearly
// different thing — the diff delta, not the absolute outcome totals.
const CHIP_SX = (theme: Theme) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.75,
  px: 1.25,
  py: 0.5,
  // Pill radius, matching the Gear Inspector outcome summary chip beside the mode toggle.
  // String bypasses MUI's sx borderRadius multiplier so it stays a full pill regardless of
  // theme.shape.borderRadius (same idiom as the outcome chip).
  borderRadius: '999px',
  backgroundColor: 'rgba(var(--mui-palette-secondary-mainChannel) / 0.12)',
  border: '1px solid rgba(var(--mui-palette-secondary-mainChannel) / 0.35)',
  boxShadow: theme.shadows[1],
  fontWeight: 700,
  lineHeight: 1,
})

const ICON_SX = { fontSize: 14 } as const

// One signed metric: icon + value, tone-colored, sized to match the outcome chip.
function DeltaMetric({ icon, value, color }: { icon: ReactNode; value: number; color: string }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.45,
        fontWeight: 700,
        lineHeight: 1,
        fontSize: theme.typography.pxToRem(12),
        color: toneColor(theme, value, color),
      })}
    >
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', fontSize: 14 }}>{icon}</Box>
      <Typography component="span" variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>{formatSigned(value)}</Typography>
    </Box>
  )
}

type GearDiffDeltaChipProps = {
  delta: GearDiffDelta
}

// Compact pill showing signed before→after deltas: sold / kept / safeguarded. Tooltip
// mirrors the outcome chip's terse "Label: value / …" style, reusing the same labels.
export function GearDiffDeltaChip({ delta }: GearDiffDeltaChipProps) {
  const { t } = useI18n()
  const tooltip = [
    `${t('gearInspectorMatchSell')}: ${formatSigned(delta.sold)}`,
    `${t('gearInspectorMatchKeep')}: ${formatSigned(delta.kept)}`,
    `${t('safeguardsToggleLabel')}: ${formatSigned(delta.keptBySafeguards)}`,
  ].join(' / ')
  return (
    <MarkdownTooltip markdown={tooltip}>
      <Box sx={CHIP_SX} aria-label={tooltip}>
        {/* Leading compare icon ties the chip to the Diff button and sets it apart from the
            outcome summary chip. */}
        <CompareArrowsIcon sx={{ fontSize: 15, color: 'secondary.main' }} />
        <DeltaMetric icon={<SellIcon sx={ICON_SX} />} value={delta.sold} color="var(--mui-palette-error-main)" />
        <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
        <DeltaMetric icon={<CheckCircleIcon sx={ICON_SX} />} value={delta.kept} color="var(--mui-palette-success-main)" />
        <Divider orientation="vertical" flexItem sx={{ my: 0.25 }} />
        <DeltaMetric icon={<StarsIcon sx={ICON_SX} />} value={delta.keptBySafeguards} color="var(--mui-palette-warning-main)" />
      </Box>
    </MarkdownTooltip>
  )
}

export default GearDiffDeltaChip
