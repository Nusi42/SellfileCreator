/**
 * GearAnalyticsKpiCards.tsx
 *
 * Row of KPI metric cards showing inventory health at a glance.
 * Regular cards show a single percentage; double cards show two related
 * values side-by-side with a "+" separator and are sized twice as wide.
 */
import { Box, Paper, Tooltip, Typography } from '@mui/material'
import type { GearAnalyticsKpis } from '../../lib/gearAnalytics'
import { useI18n } from '../../lib/i18n'

type Props = {
  kpis: GearAnalyticsKpis
}

type KpiCardProps = {
  label: string
  tooltip: string
  /** Show a 0-1 ratio as a percentage. */
  rate: number | null
  /** Decimal places shown after the percentage point. Defaults to 1. */
  decimals?: number
  /** When true, card takes twice the flex width of a regular card. */
  wide?: boolean
}

type KpiDoubleCardProps = {
  label: string
  tooltip: string
  /** Left value string (already formatted). */
  primaryValue: string
  /** Right value string (already formatted). */
  secondaryValue: string
  /**
   * Optional trailing annotation rendered smaller and dimmed after the secondary value.
   * For a count that is a SUBSET of the secondary one (not a third addend), so it is
   * deliberately set apart from the "+"-joined pair rather than joined to it.
   */
  secondarySuffix?: string | undefined
}

/** Format a 0-1 rate as a percentage string with the given decimal places (default 1). */
function fmtPct(rate: number | null, decimals = 1): string {
  if (rate === null) return '—'
  return `${(rate * 100).toFixed(decimals)}%`
}

/** Format a raw count as a locale-aware integer string. */
function fmtCount(count: number | null): string {
  if (count === null) return '—'
  return count.toLocaleString()
}

function KpiCard({ label, rate, tooltip, decimals = 1, wide }: KpiCardProps) {
  // Stable height when cross-filter empties the dataset (rate becomes null → '—').
  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 0, flex: wide ? '2 1 0' : '1 1 0', cursor: 'default', overflow: 'hidden' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
          {fmtPct(rate, decimals)}
        </Typography>
      </Paper>
    </Tooltip>
  )
}

/** Wider card that shows two values separated by "+". Used for merged KPI pairs. */
function KpiDoubleCard({ label, tooltip, primaryValue, secondaryValue, secondarySuffix }: KpiDoubleCardProps) {
  return (
    <Tooltip title={tooltip} arrow placement="top">
      {/* flex: '2 1 0' makes this card twice as wide as a regular card in the same nowrap row. */}
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 0, flex: '2 1 0', cursor: 'default', overflow: 'hidden' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>{primaryValue}</Typography>
          {/* Dimmed "+" separates the two values without implying they sum to anything. */}
          <Typography variant="body1" color="text.disabled" sx={{ fontWeight: 400, lineHeight: 1.2 }}>+</Typography>
          <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>{secondaryValue}</Typography>
          {/* Subset annotation: smaller + dimmed so it reads as a breakdown of the value
              before it, never as another addend. Rendered only when there are any. */}
          {secondarySuffix != null && (
            <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2, fontWeight: 500 }}>
              {secondarySuffix}
            </Typography>
          )}
        </Box>
      </Paper>
    </Tooltip>
  )
}

export function GearAnalyticsKpiCards({ kpis }: Props) {
  const { t } = useI18n()
  // Labels for the merged cards are composed from existing keys where possible (SSOT).
  return (
    <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 1, mb: 2 }}>
      {/* Item-count double cards — leftmost */}
      <KpiDoubleCard
        label={`${t('gearAnalyticsKpiArtifacts')} + ${t('gearAnalyticsKpiAccessories')}`}
        tooltip={t('gearAnalyticsKpiItemCountsTip')}
        primaryValue={fmtCount(kpis.artifactCount)}
        secondaryValue={fmtCount(kpis.accessoryCount)}
        // Anomalous accessories are a subset of the accessory count, so they trail it as a
        // dimmed annotation. Omitted entirely at zero (and when there is no data at all) —
        // an always-on "0" would imply a category the account does not participate in.
        secondarySuffix={kpis.anomalousCount ? fmtCount(kpis.anomalousCount) : undefined}
      />
      <KpiDoubleCard
        label={`${t('gearAnalyticsKpiEquipped')} + ${t('gearInspectorSourceEquippedVault')}`}
        tooltip={t('gearAnalyticsKpiEquippedVaultTip')}
        primaryValue={fmtPct(kpis.equippedRate)}
        secondaryValue={fmtPct(kpis.vaultLockedRate)}
      />
      {/* Quality metrics */}
      <KpiCard wide label={t('gearAnalyticsKpiSixStarLegendary')} rate={kpis.sixStarLegendaryPlusRate} tooltip={t('gearAnalyticsKpiSixStarLegendaryTip')} />
      <KpiCard label={t('gearAnalyticsKpiMaxed')}    rate={kpis.maxedRate}    tooltip={t('gearAnalyticsKpiMaxedTip')} />
      {/* Enhancement / usage metrics */}
      <KpiCard label={t('gearAnalyticsKpiChaos')}    rate={kpis.chaosRate}    tooltip={t('gearAnalyticsKpiChaosTip')} />
      <KpiCard label={t('gearAnalyticsKpiGlyphed')}  rate={kpis.glyphedRate}  tooltip={t('gearAnalyticsKpiGlyphedTip')} />
      <KpiCard label={t('gearAnalyticsKpiAscended')} rate={kpis.ascendedRate} tooltip={t('gearAnalyticsKpiAscendedTip')} />
    </Box>
  )
}
