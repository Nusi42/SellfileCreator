/**
 * GearAnalyticsKpiCards.tsx
 *
 * Row of eight KPI metric cards showing inventory health at a glance.
 * Each card shows a single percentage with a color-coded value.
 */
import { Box, Paper, Tooltip, Typography } from '@mui/material'
import type { GearAnalyticsKpis } from '../../lib/gearAnalytics'
import { useI18n } from '../../lib/i18n'

type Props = {
  kpis: GearAnalyticsKpis
}

type KpiCardProps = {
  label: string
  rate: number | null
  tooltip: string
}

/** Format a 0-1 rate as a percentage string. */
function fmtPct(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

function KpiCard({ label, rate, tooltip }: KpiCardProps) {
  // Use the same height for all states: fmtPct returns '—' when rate is null, keeping the card
  // layout stable when the cross-filter produces zero results and all KPIs become null.
  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 100, flex: '1 1 100px', cursor: 'default' }}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
          {fmtPct(rate)}
        </Typography>
      </Paper>
    </Tooltip>
  )
}

export function GearAnalyticsKpiCards({ kpis }: Props) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <KpiCard label={t('gearAnalyticsKpiSixStar')}       rate={kpis.sixStarRate}       tooltip={t('gearAnalyticsKpiSixStarTip')} />
      <KpiCard label={t('gearAnalyticsKpiLegendaryPlus')} rate={kpis.legendaryPlusRate} tooltip={t('gearAnalyticsKpiLegendaryPlusTip')} />
      <KpiCard label={t('gearAnalyticsKpiMaxed')}          rate={kpis.maxedRate}          tooltip={t('gearAnalyticsKpiMaxedTip')} />
      <KpiCard label={t('gearAnalyticsKpiEquipped')}       rate={kpis.equippedRate}       tooltip={t('gearAnalyticsKpiEquippedTip')} />
      <KpiCard label={t('gearAnalyticsKpiVaultLocked')}    rate={kpis.vaultLockedRate}    tooltip={t('gearAnalyticsKpiVaultLockedTip')} />
      <KpiCard label={t('gearAnalyticsKpiChaos')}          rate={kpis.chaosRate}          tooltip={t('gearAnalyticsKpiChaosTip')} />
      <KpiCard label={t('gearAnalyticsKpiGlyphed')}        rate={kpis.glyphedRate}        tooltip={t('gearAnalyticsKpiGlyphedTip')} />
      <KpiCard label={t('gearAnalyticsKpiAscended')}       rate={kpis.ascendedRate}       tooltip={t('gearAnalyticsKpiAscendedTip')} />
    </Box>
  )
}
