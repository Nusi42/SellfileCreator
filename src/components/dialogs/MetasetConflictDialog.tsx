import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, RadioGroup, FormControlLabel, Radio } from '@mui/material'
import { useI18n } from '../../lib/i18n'

export default function MetasetConflictDialog({ open, count, onCancel, onChoose }: {
  open: boolean
  count: number
  onCancel: () => void
  onChoose: (choice: 'keepCurrent' | 'useIncoming' | 'keepBoth') => void
}) {
  const { t } = useI18n()
  // Mirror the style of the "Reset metasets" dialog: radio choices + single CTA.
  const [choice, setChoice] = useState<'keepCurrent' | 'useIncoming' | 'keepBoth'>('keepCurrent')
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Resolve Metaset Conflicts</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Typography variant="body2">
            We found {count} metaset(s) with the same ID but different sets.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This applies to all conflicts in this paste.
          </Typography>
          <RadioGroup
            value={choice}
            onChange={(_, v) => setChoice((v as 'keepCurrent' | 'useIncoming' | 'keepBoth') || 'keepCurrent')}
          >
            <FormControlLabel value="keepCurrent" control={<Radio />} label="Keep my current metasets" />
            <FormControlLabel value="useIncoming" control={<Radio />} label="Use the pasted metasets" />
            <FormControlLabel value="keepBoth" control={<Radio />} label="Keep both" />
          </RadioGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('cancel')}</Button>
        <Button variant="contained" color="warning" onClick={() => onChoose(choice)}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}
