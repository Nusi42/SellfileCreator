import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import type { MinimaTable, Star } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatVariant } from '../lib/types'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'

export default function MinimaDialog({ open, onClose, minima, onMinimaChange }: {
  open: boolean
  onClose: () => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
}) {
  const { t } = useI18n()
  const [confirmResetMinima, setConfirmResetMinima] = useState(false)
  const storedFallback = minima.anyRankDefaultsTo
  const fallbackStar: Star = storedFallback ?? 6

  const starHeaderCell = ({ label, star }: { label: string; star: Star }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Tooltip title={t('minimaUseForAnyTooltip', { rank: label })}>
        <IconButton
          size="small"
          onClick={() => { if (storedFallback !== star) onMinimaChange({ ...minima, anyRankDefaultsTo: star }) }}
          color={fallbackStar === star ? 'primary' : 'default'}
          aria-pressed={fallbackStar === star}
          aria-label={t('minimaUseForAnyAria', { rank: label })}
        >
          {fallbackStar === star ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
        </IconButton>
      </Tooltip>
    </Box>
  )

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{t('titleManageMinima')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('msgMinimaHelp')}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) repeat(6, 1fr)', gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">{t('columnSubstat')}</Typography>
            {starHeaderCell({ label: t('star6'), star: 6 })}
            {starHeaderCell({ label: t('star5'), star: 5 })}
            {starHeaderCell({ label: t('star4'), star: 4 })}
            {starHeaderCell({ label: t('star3'), star: 3 })}
            {starHeaderCell({ label: t('star2'), star: 2 })}
            {starHeaderCell({ label: t('star1'), star: 1 })}
            {[
              { label: 'HP', v: StatVariant.HP_FLAT },
              { label: 'HP%', v: StatVariant.HP },
              { label: 'ATK', v: StatVariant.ATK_FLAT },
              { label: 'ATK%', v: StatVariant.ATK },
              { label: 'DEF', v: StatVariant.DEF_FLAT },
              { label: 'DEF%', v: StatVariant.DEF },
              { label: 'SPD', v: StatVariant.SPD },
              { label: 'RES', v: StatVariant.RES },
              { label: 'ACC', v: StatVariant.ACC },
              { label: 'CR%', v: StatVariant.CR },
              { label: 'CDMG%', v: StatVariant.CDMG },
            ].map(({ label, v }) => (
              <React.Fragment key={`row-${v}`}>
                <Typography sx={{ pr: 1 }}>{label}</Typography>
                {(() => { const vKey = Number(v); return (
                  <>
                    <TextField size="small" type="number" value={String(minima.six[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, six: { ...minima.six, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.five[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, five: { ...minima.five, [vKey]: v } }) }} />
                  </>
                )})()}
                {(() => { const vKey = Number(v); return (
                  <>
                    <TextField size="small" type="number" value={String(minima.four[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, four: { ...minima.four, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.three[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, three: { ...minima.three, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.two[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, two: { ...minima.two, [vKey]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.one[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, one: { ...minima.one, [vKey]: v } }) }} />
                  </>
                )})()}
              </React.Fragment>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMinima(true)}>{t('resetToDefaults')}</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmResetMinima} onClose={() => setConfirmResetMinima(false)}>
        <DialogTitle>{t('titleResetMinima')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetMinima')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetMinima(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setConfirmResetMinima(false); onMinimaChange(defaultMinima()) }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * MinimaDialog
 *
 * Modal editor for per-star substat minima tables. Internally operates on
 * variant-keyed minima; presentation uses readable labels.
 */
