import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../lib/constants'
import type { MinimaTable } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatVariant } from '../lib/types'

export default function MinimaDialog({ open, onClose, minima, onMinimaChange }: {
  open: boolean
  onClose: () => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
}) {
  const { t } = useI18n()
  const [showLowStarCols, setShowLowStarCols] = useState(false)
  const [confirmResetMinima, setConfirmResetMinima] = useState(false)

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{t('titleManageMinima')}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('msgMinimaHelp')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Button
              size="small"
              variant={showLowStarCols ? 'contained' : 'outlined'}
              color={showLowStarCols ? 'success' : 'warning'}
              sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
              onClick={() => setShowLowStarCols(s => !s)}
            >
              {showLowStarCols ? t('hideLowStars') : t('showLowStars')}
            </Button>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(120px,1fr) repeat(${showLowStarCols ? 6 : 2}, 1fr)`, gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">{t('columnSubstat')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('star6')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('star5')}</Typography>
            {showLowStarCols && (
              <>
                <Typography variant="caption" color="text.secondary">{t('star4')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('star3')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('star2')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('star1')}</Typography>
              </>
            )}
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
                {showLowStarCols && (
                  <>
                    {(() => { const vKey = Number(v); return (
                      <>
                        <TextField size="small" type="number" value={String(minima.four[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, four: { ...minima.four, [vKey]: v } }) }} />
                        <TextField size="small" type="number" value={String(minima.three[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, three: { ...minima.three, [vKey]: v } }) }} />
                        <TextField size="small" type="number" value={String(minima.two[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, two: { ...minima.two, [vKey]: v } }) }} />
                        <TextField size="small" type="number" value={String(minima.one[vKey] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, one: { ...minima.one, [vKey]: v } }) }} />
                      </>
                    )})()}
                  </>
                )}
              </React.Fragment>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" color="error" onClick={() => setConfirmResetMinima(true)}>Reset to defaults</Button>
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
