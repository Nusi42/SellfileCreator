import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import type { MinimaTable } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatVariant } from '../lib/types'

export default function MinimaDialog({ open, onClose, minima, onMinimaChange }: {
  open: boolean
  onClose: () => void
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable) => void
}) {
  const [showLowStarCols, setShowLowStarCols] = useState(false)
  const [confirmResetMinima, setConfirmResetMinima] = useState(false)

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Manage Minimum Substat Values</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Used when generating thresholds at each level.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Button size="small" onClick={() => setShowLowStarCols(s => !s)}>{showLowStarCols ? 'Hide 1–4★' : 'Show 1–4★'}</Button>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(120px,1fr) repeat(${showLowStarCols ? 6 : 2}, 1fr)`, gap: 1, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">Substat</Typography>
            <Typography variant="caption" color="text.secondary">6★</Typography>
            <Typography variant="caption" color="text.secondary">5★</Typography>
            {showLowStarCols && (
              <>
                <Typography variant="caption" color="text.secondary">4★</Typography>
                <Typography variant="caption" color="text.secondary">3★</Typography>
                <Typography variant="caption" color="text.secondary">2★</Typography>
                <Typography variant="caption" color="text.secondary">1★</Typography>
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
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmResetMinima} onClose={() => setConfirmResetMinima(false)}>
        <DialogTitle>Reset minima to defaults?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This restores the recommended values from the documentation.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetMinima(false)}>Cancel</Button>
          <Button color="error" onClick={() => { setConfirmResetMinima(false); onMinimaChange(defaultMinima()) }}>Reset</Button>
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
