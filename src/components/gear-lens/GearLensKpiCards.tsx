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
}

/** Format a 0-1 rate as a percentage string. */
function fmtPct(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

function KpiCard({ label, rate, tooltip }: KpiCardProps) {
  if (rate === null) {
    return (
      <Paper variant="outlined" sx={{ px: 1.5, py: 1, minWidth: 100, flex: '1 1 100px' }}>
        <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
        <Skeleton width={40} height={28} />
      </Paper>
    )
  }

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

export function GearLensKpiCards({ kpis }: Props) {
  const { t } = useI18n()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
      <KpiCard label={t('gearLensKpiSixStar')}       rate={kpis.sixStarRate}       tooltip={t('gearLensKpiSixStarTip')} />
      <KpiCard label={t('gearLensKpiLegendaryPlus')} rate={kpis.legendaryPlusRate} tooltip={t('gearLensKpiLegendaryPlusTip')} />
      <KpiCard label={t('gearLensKpiMaxed')}          rate={kpis.maxedRate}          tooltip={t('gearLensKpiMaxedTip')} />
      <KpiCard label={t('gearLensKpiEquipped')}       rate={kpis.equippedRate}       tooltip={t('gearLensKpiEquippedTip')} />
      <KpiCard label={t('gearLensKpiVaultLocked')}    rate={kpis.vaultLockedRate}    tooltip={t('gearLensKpiVaultLockedTip')} />
      <KpiCard label={t('gearLensKpiChaos')}          rate={kpis.chaosRate}          tooltip={t('gearLensKpiChaosTip')} />
      <KpiCard label={t('gearLensKpiGlyphed')}        rate={kpis.glyphedRate}        tooltip={t('gearLensKpiGlyphedTip')} />
      <KpiCard label={t('gearLensKpiAscended')}       rate={kpis.ascendedRate}       tooltip={t('gearLensKpiAscendedTip')} />
    </Box>
  )
}
