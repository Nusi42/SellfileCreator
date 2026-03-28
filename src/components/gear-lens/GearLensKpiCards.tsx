/**
 * GearLensKpiCards.tsx
 *
 * Row of eight KPI metric cards showing inventory health at a glance.
 * Each card shows a single percentage with a color-coded value.
 */
import { Box, Paper, Skeleton, Tooltip, Typography } from '@mui/material'
import type { GearLensKpis } from '../../lib/gearLens'
import { useI18n } from '../../lib/i18n'

type Props = {
  kpis: GearLensKpis
}

type KpiCardProps = {
  label: string
  rate: number | null
  tooltip: string
  /** "higher is better" (green) vs "higher means attention" (amber/red when high). */
  polarity?: 'positive' | 'negative'
  greenThreshold: number
  warnThreshold: number
}

/** Format a 0-1 rate as a percentage string. */
function fmtPct(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

function KpiCard({ label, rate, tooltip, polarity = 'positive', greenThreshold, warnThreshold }: KpiCardProps) {
  if (rate === null) {
    return (
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 100, flex: '1 1 100px' }}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
        <Skeleton width={40} height={28} />
      </Paper>
    )
  }

  // Positive polarity: green = high, red = low.
  // Negative polarity (e.g. vault-locked): amber/red = high because that's noteworthy.
  let color: string
  if (polarity === 'positive') {
    color = rate >= greenThreshold ? 'success.main' : rate >= warnThreshold ? 'warning.main' : 'error.main'
  } else {
    // For "negative" KPIs, high values warrant attention rather than celebration.
    color = rate >= warnThreshold ? 'warning.main' : 'text.primary'
  }

  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 100, flex: '1 1 100px', cursor: 'default' }}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.2, color, fontWeight: 700 }}>
          {fmtPct(rate)}
        </Typography>
      </Paper>
    </Tooltip>
  )
}

export function GearLensKpiCards({ kpis }: Props) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <KpiCard label={t('gearLensKpiSixStar')}       rate={kpis.sixStarRate}       tooltip={t('gearLensKpiSixStarTip')}       greenThreshold={0.50} warnThreshold={0.20} />
      <KpiCard label={t('gearLensKpiLegendaryPlus')} rate={kpis.legendaryPlusRate} tooltip={t('gearLensKpiLegendaryPlusTip')} greenThreshold={0.30} warnThreshold={0.10} />
      <KpiCard label={t('gearLensKpiMaxed')}          rate={kpis.maxedRate}          tooltip={t('gearLensKpiMaxedTip')}          greenThreshold={0.30} warnThreshold={0.10} />
      <KpiCard label={t('gearLensKpiEquipped')}       rate={kpis.equippedRate}       tooltip={t('gearLensKpiEquippedTip')}       greenThreshold={0.50} warnThreshold={0.25} />
      <KpiCard label={t('gearLensKpiVaultLocked')}    rate={kpis.vaultLockedRate}    tooltip={t('gearLensKpiVaultLockedTip')}    polarity="negative" greenThreshold={0} warnThreshold={0.15} />
      <KpiCard label={t('gearLensKpiChaos')}          rate={kpis.chaosRate}          tooltip={t('gearLensKpiChaosTip')}          polarity="negative" greenThreshold={0} warnThreshold={0.20} />
      <KpiCard label={t('gearLensKpiGlyphed')}        rate={kpis.glyphedRate}        tooltip={t('gearLensKpiGlyphedTip')}        greenThreshold={0.25} warnThreshold={0.10} />
      <KpiCard label={t('gearLensKpiAscended')}       rate={kpis.ascendedRate}       tooltip={t('gearLensKpiAscendedTip')}       greenThreshold={0.25} warnThreshold={0.10} />
    </Box>
  )
}
