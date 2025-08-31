import React, { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import type { MinimaTable } from '../lib/hsfBuilder'
import { defaultMinima } from '../lib/hsfBuilder'
import { StatId } from '../lib/types'

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
              { label: 'HP', id: StatId.HP, isFlat: true },
              { label: 'HP%', id: StatId.HP, isFlat: false },
              { label: 'ATK', id: StatId.ATK, isFlat: true },
              { label: 'ATK%', id: StatId.ATK, isFlat: false },
              { label: 'DEF', id: StatId.DEF, isFlat: true },
              { label: 'DEF%', id: StatId.DEF, isFlat: false },
              { label: 'SPD', id: StatId.SPD, isFlat: true },
              { label: 'RES', id: StatId.RES, isFlat: true },
              { label: 'ACC', id: StatId.ACC, isFlat: true },
              { label: 'CR%', id: StatId.CR, isFlat: false },
              { label: 'CDMG%', id: StatId.CDMG, isFlat: false },
            ].map(({ label, id, isFlat }) => (
              <React.Fragment key={`row-${id}:${isFlat}`}>
                <Typography sx={{ pr: 1 }}>{label}</Typography>
                <TextField size="small" type="number" value={String(minima.six[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, six: { ...minima.six, [`${id}:${isFlat}`]: v } }) }} />
                <TextField size="small" type="number" value={String(minima.five[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, five: { ...minima.five, [`${id}:${isFlat}`]: v } }) }} />
                {showLowStarCols && (
                  <>
                    <TextField size="small" type="number" value={String(minima.four[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, four: { ...minima.four, [`${id}:${isFlat}`]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.three[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, three: { ...minima.three, [`${id}:${isFlat}`]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.two[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, two: { ...minima.two, [`${id}:${isFlat}`]: v } }) }} />
                    <TextField size="small" type="number" value={String(minima.one[`${id}:${isFlat}`] ?? 0)} onChange={(e) => { const v = Number(e.target.value); onMinimaChange({ ...minima, one: { ...minima.one, [`${id}:${isFlat}`]: v } }) }} />
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

