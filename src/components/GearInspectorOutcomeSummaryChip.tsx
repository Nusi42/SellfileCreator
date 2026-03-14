import React from 'react'
import { Box, Divider, Stack, Typography } from '@mui/material'
import { alpha, keyframes, type Theme } from '@mui/material/styles'
import { useChangePulse } from '../hooks/useChangePulse'
import ViewListIcon from '@mui/icons-material/ViewList'
import SellIcon from '@mui/icons-material/Sell'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import StarsIcon from '@mui/icons-material/Stars'
import { useI18n } from '../lib/i18n'
import MarkdownTooltip from './MarkdownTooltip'
import type { GearInspectorOutcomeSummary } from '../types/gearInspectorPreview'

// Tone tokens keep summary metric colors consistent across the chip.
type GearInspectorOutcomeSummaryTone = 'total' | 'sell' | 'keep' | 'unique'

// Duration for the value-change pulse.  Short enough to be snappy, long enough to notice.
const GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_MS = 550
// Brief scale + background brightening so the chip draws attention when counts update.
// Scale stays small so it doesn't push adjacent layout elements.
const GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_KEYFRAMES = keyframes`
  0%   { transform: scale(1); }
  30%  { transform: scale(1.07); background-color: var(--gi-chip-pulse-bg); }
  70%  { transform: scale(1.04); }
  100% { transform: scale(1); }
`

// Keep the summary chip compact so it fits in headers and dialogs.
const GEAR_INSPECTOR_SUMMARY_CHIP_RADIUS_PX = 999
// Match icon sizing to the compact chip typography.
const GEAR_INSPECTOR_SUMMARY_ICON_FONT_SIZE_PX = 14
// Dim the summary metrics while gear recalculation is in flight.
const GEAR_INSPECTOR_SUMMARY_DIMMED_OPACITY = 0.55
// Shared chip chrome for the Gear Inspector outcome summary.
const GEAR_INSPECTOR_SUMMARY_CHIP_SX = (theme: Theme) => ({
  // Inline flex keeps the chip aligned with surrounding controls.
  display: 'inline-flex',
  alignItems: 'center',
  // Padding keeps the pill readable without stealing space.
  px: 1.25,
  py: 0.5,
  borderRadius: GEAR_INSPECTOR_SUMMARY_CHIP_RADIUS_PX,
  // Use info tinting so the chip reads as guidance, not a warning.
  backgroundColor: alpha(theme.palette.info.main, 0.12),
  border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
  // Subtle elevation lifts the chip above the header surface.
  boxShadow: theme.shadows[1],
})
// Divider styling keeps metric separators faint but legible.
const GEAR_INSPECTOR_SUMMARY_DIVIDER_SX = (theme: Theme) => ({
  borderColor: alpha(theme.palette.divider, 0.6),
})
// Shared metric layout for summary chip sections.
const GEAR_INSPECTOR_SUMMARY_METRIC_BASE_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.45,
  fontWeight: 700,
  lineHeight: 1,
}

// Props for rendering one metric inside the summary chip.
type GearInspectorOutcomeSummaryMetricProps = {
  icon: React.ReactNode
  value: string
  tone: GearInspectorOutcomeSummaryTone
  dimmed: boolean
}

function resolveGearInspectorSummaryToneColor(theme: Theme, tone: GearInspectorOutcomeSummaryTone): string {
  // Total uses a neutral tint so it reads as context, not status.
  if (tone === 'total') return theme.palette.text.secondary
  // Sell outcomes should mirror the error palette used elsewhere.
  if (tone === 'sell') return theme.palette.error.main
  // Keep outcomes mirror the success palette for immediate scanability.
  if (tone === 'keep') return theme.palette.success.main
  // Safeguard reads best with the warning/gold palette.
  return theme.palette.warning.main
}

function GearInspectorOutcomeSummaryMetric({ icon, value, tone, dimmed }: GearInspectorOutcomeSummaryMetricProps) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        ...GEAR_INSPECTOR_SUMMARY_METRIC_BASE_SX,
        // Apply tone colors so keep/sell reads at a glance.
        color: resolveGearInspectorSummaryToneColor(theme, tone),
        // Match the chip body scale for the numeric value.
        fontSize: theme.typography.pxToRem(12),
        // Fade the metric group while a recalculation spinner is active.
        opacity: dimmed ? GEAR_INSPECTOR_SUMMARY_DIMMED_OPACITY : 1,
      })}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: GEAR_INSPECTOR_SUMMARY_ICON_FONT_SIZE_PX,
        }}
      >
        {icon}
      </Box>
      <Typography component="span" variant="caption" sx={{ fontWeight: 700, lineHeight: 1 }}>
        {value}
      </Typography>
    </Box>
  )
}

export type GearInspectorOutcomeSummaryChipProps = {
  summary: GearInspectorOutcomeSummary | null
  totalSummary?: GearInspectorOutcomeSummary | null
  dimmed?: boolean
  showWhenEmpty?: boolean
  showFilteredTotals?: boolean
  metricMode?: 'all' | 'safeguardsOnly'
  ariaLabel?: string | undefined
}

export default function GearInspectorOutcomeSummaryChip({
  summary,
  totalSummary = null,
  dimmed = false,
  showWhenEmpty = false,
  showFilteredTotals = false,
  metricMode = 'all',
  ariaLabel,
}: GearInspectorOutcomeSummaryChipProps) {
  const { t, lang } = useI18n()
  const formattedSummary = React.useMemo(() => {
    // Skip rendering when no summary is available.
    if (!summary) return null
    // Hide empty summaries unless the caller explicitly wants them.
    if (!showWhenEmpty && summary.total <= 0) return null
    // Fall back to the filtered summary when no total snapshot is provided.
    const totalSnapshot = totalSummary ?? summary
    // Respect the caller intent and only show pairs when both snapshots exist.
    const shouldShowPairs = showFilteredTotals && totalSnapshot.total > 0
    // Format counts with locale-aware separators.
    const formatCount = (value: number) => value.toLocaleString(lang)
    // Helper for formatting filtered/total pairs when filters are active.
    const formatPair = (value: number, totalValue: number) => (
      shouldShowPairs ? `${formatCount(value)} / ${formatCount(totalValue)}` : formatCount(value)
    )
    // Compute the formatted values once for reuse in tooltips and labels.
    const total = formatPair(summary.total, totalSnapshot.total)
    const sold = formatPair(summary.sold, totalSnapshot.sold)
    const kept = formatPair(summary.kept, totalSnapshot.kept)
    const safeguards = formatPair(summary.keptBySafeguards, totalSnapshot.keptBySafeguards)
    // Keep safeguards-only chips focused on the one metric that matters in that tab.
    const tooltipParts = metricMode === 'safeguardsOnly'
      ? [`${t('safeguardsToggleLabel')}: ${safeguards}`]
      : [
          `${t('gearInspectorSummaryTotalLabel')}: ${total}`,
          `${t('gearInspectorMatchSell')}: ${sold}`,
          `${t('gearInspectorMatchKeep')}: ${kept}`,
          `${t('safeguardsToggleLabel')}: ${safeguards}`,
        ]
    return {
      total,
      sold,
      kept,
      safeguards,
      tooltip: tooltipParts.join(' / '),
    }
  }, [lang, metricMode, showFilteredTotals, showWhenEmpty, summary, t, totalSummary])

  // Fingerprint changes whenever any metric count changes.
  const summaryFingerprint = summary
    ? `${summary.total}:${summary.sold}:${summary.kept}:${summary.keptBySafeguards}`
    : null
  const chipPulsing = useChangePulse(summaryFingerprint, GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_MS)
  // Allow the pulse even when dimmed: the scale animation is still legible under
  // reduced opacity and the result that triggered the change may arrive while the
  // dimmed state is still true, so suppressing here would silently drop the pulse.
  const shouldPulse = chipPulsing

  if (!formattedSummary) return null

  return (
    // Tooltip keeps the chip text-light while preserving full context.
    <MarkdownTooltip markdown={formattedSummary.tooltip}>
      {/* Outer pill matches the note dialog styling and scan order. */}
      <Box
        sx={(theme) => ({
          ...GEAR_INSPECTOR_SUMMARY_CHIP_SX(theme),
          // CSS variable supplies the brightened background used by the pulse keyframe.
          '--gi-chip-pulse-bg': alpha(theme.palette.info.main, 0.28),
          // Apply pulse animation when counts changed and the chip is not already showing the dimmed state.
          animation: shouldPulse
            ? `${GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_KEYFRAMES} ${GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_MS}ms ease-out 1`
            : 'none',
          transformOrigin: 'center',
        })}
        aria-label={ariaLabel ?? formattedSummary.tooltip}
      >
        {/* Row layout keeps metric icons aligned and evenly spaced. */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          divider={<Divider orientation="vertical" flexItem sx={GEAR_INSPECTOR_SUMMARY_DIVIDER_SX} />}
        >
          {/* Safeguards tab only needs the safeguard metric because rows are already scoped. */}
          {metricMode === 'all' ? (
            <>
              {/* Total / Sell / Keep / Unique segments mirror the note dialog order. */}
              <GearInspectorOutcomeSummaryMetric
                icon={<ViewListIcon fontSize="inherit" />}
                value={formattedSummary.total}
                tone="total"
                dimmed={dimmed}
              />
              <GearInspectorOutcomeSummaryMetric
                icon={<SellIcon fontSize="inherit" />}
                value={formattedSummary.sold}
                tone="sell"
                dimmed={dimmed}
              />
              <GearInspectorOutcomeSummaryMetric
                icon={<CheckCircleIcon fontSize="inherit" />}
                value={formattedSummary.kept}
                tone="keep"
                dimmed={dimmed}
              />
            </>
          ) : null}
          <GearInspectorOutcomeSummaryMetric
            icon={<StarsIcon fontSize="inherit" />}
            value={formattedSummary.safeguards}
            tone="unique"
            dimmed={dimmed}
          />
        </Stack>
      </Box>
    </MarkdownTooltip>
  )
}
