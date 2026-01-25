import React from 'react'
import { Box, Divider, Stack, Typography } from '@mui/material'
import { alpha, type Theme } from '@mui/material/styles'
import ViewListIcon from '@mui/icons-material/ViewList'
import SellIcon from '@mui/icons-material/Sell'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import StarsIcon from '@mui/icons-material/Stars'
import { useI18n } from '../lib/i18n'
import MarkdownTooltip from './MarkdownTooltip'
import type { TesterOutcomeSummary } from '../types/testerPreview'

// Tone tokens keep summary metric colors consistent across the chip.
type TesterOutcomeSummaryTone = 'total' | 'sell' | 'keep' | 'unique'

// Keep the summary chip compact so it fits in headers and dialogs.
const TESTER_SUMMARY_CHIP_RADIUS_PX = 999
// Match icon sizing to the compact chip typography.
const TESTER_SUMMARY_ICON_FONT_SIZE_PX = 14
// Dim the summary metrics while gear recalculation is in flight.
const TESTER_SUMMARY_DIMMED_OPACITY = 0.55
// Shared chip chrome for the tester outcome summary.
const TESTER_SUMMARY_CHIP_SX = (theme: Theme) => ({
  // Inline flex keeps the chip aligned with surrounding controls.
  display: 'inline-flex',
  alignItems: 'center',
  // Padding keeps the pill readable without stealing space.
  px: 1.25,
  py: 0.5,
  borderRadius: TESTER_SUMMARY_CHIP_RADIUS_PX,
  // Use info tinting so the chip reads as guidance, not a warning.
  backgroundColor: alpha(theme.palette.info.main, 0.12),
  border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
  // Subtle elevation lifts the chip above the header surface.
  boxShadow: theme.shadows[1],
})
// Divider styling keeps metric separators faint but legible.
const TESTER_SUMMARY_DIVIDER_SX = (theme: Theme) => ({
  borderColor: alpha(theme.palette.divider, 0.6),
})
// Shared metric layout for summary chip sections.
const TESTER_SUMMARY_METRIC_BASE_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.45,
  fontWeight: 700,
  lineHeight: 1,
}

// Props for rendering one metric inside the summary chip.
type TesterOutcomeSummaryMetricProps = {
  icon: React.ReactNode
  value: string
  tone: TesterOutcomeSummaryTone
  dimmed: boolean
}

function resolveTesterSummaryToneColor(theme: Theme, tone: TesterOutcomeSummaryTone): string {
  // Total uses a neutral tint so it reads as context, not status.
  if (tone === 'total') return theme.palette.text.secondary
  // Sell outcomes should mirror the error palette used elsewhere.
  if (tone === 'sell') return theme.palette.error.main
  // Keep outcomes mirror the success palette for immediate scanability.
  if (tone === 'keep') return theme.palette.success.main
  // Keep Unique reads best with the warning/gold palette.
  return theme.palette.warning.main
}

function TesterOutcomeSummaryMetric({ icon, value, tone, dimmed }: TesterOutcomeSummaryMetricProps) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        ...TESTER_SUMMARY_METRIC_BASE_SX,
        // Apply tone colors so keep/sell reads at a glance.
        color: resolveTesterSummaryToneColor(theme, tone),
        // Match the chip body scale for the numeric value.
        fontSize: theme.typography.pxToRem(12),
        // Fade the metric group while a recalculation spinner is active.
        opacity: dimmed ? TESTER_SUMMARY_DIMMED_OPACITY : 1,
      })}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: TESTER_SUMMARY_ICON_FONT_SIZE_PX,
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

export type TesterOutcomeSummaryChipProps = {
  summary: TesterOutcomeSummary | null
  totalSummary?: TesterOutcomeSummary | null
  dimmed?: boolean
  showWhenEmpty?: boolean
  showFilteredTotals?: boolean
  ariaLabel?: string | undefined
}

export default function TesterOutcomeSummaryChip({
  summary,
  totalSummary = null,
  dimmed = false,
  showWhenEmpty = false,
  showFilteredTotals = false,
  ariaLabel,
}: TesterOutcomeSummaryChipProps) {
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
    const keepUniques = formatPair(summary.keptByKeepUniques, totalSnapshot.keptByKeepUniques)
    // Build a compact, symmetric tooltip string so the chip stays text-light.
    const tooltipParts = [
      `${t('testerSummaryTotalLabel')}: ${total}`,
      `${t('testerMatchSell')}: ${sold}`,
      `${t('testerMatchKeep')}: ${kept}`,
      `${t('keepUniquesToggleLabel')}: ${keepUniques}`,
    ]
    return {
      total,
      sold,
      kept,
      keepUniques,
      tooltip: tooltipParts.join(' / '),
    }
  }, [lang, showFilteredTotals, showWhenEmpty, summary, t, totalSummary])

  if (!formattedSummary) return null

  return (
    // Tooltip keeps the chip text-light while preserving full context.
    <MarkdownTooltip markdown={formattedSummary.tooltip}>
      {/* Outer pill matches the note dialog styling and scan order. */}
      <Box
        sx={TESTER_SUMMARY_CHIP_SX}
        aria-label={ariaLabel ?? formattedSummary.tooltip}
      >
        {/* Row layout keeps metric icons aligned and evenly spaced. */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          divider={<Divider orientation="vertical" flexItem sx={TESTER_SUMMARY_DIVIDER_SX} />}
        >
          {/* Total / Sell / Keep / Unique segments mirror the note dialog order. */}
          <TesterOutcomeSummaryMetric
            icon={<ViewListIcon fontSize="inherit" />}
            value={formattedSummary.total}
            tone="total"
            dimmed={dimmed}
          />
          <TesterOutcomeSummaryMetric
            icon={<SellIcon fontSize="inherit" />}
            value={formattedSummary.sold}
            tone="sell"
            dimmed={dimmed}
          />
          <TesterOutcomeSummaryMetric
            icon={<CheckCircleIcon fontSize="inherit" />}
            value={formattedSummary.kept}
            tone="keep"
            dimmed={dimmed}
          />
          <TesterOutcomeSummaryMetric
            icon={<StarsIcon fontSize="inherit" />}
            value={formattedSummary.keepUniques}
            tone="unique"
            dimmed={dimmed}
          />
        </Stack>
      </Box>
    </MarkdownTooltip>
  )
}
