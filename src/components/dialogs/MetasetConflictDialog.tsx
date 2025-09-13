import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'

export default function MetasetConflictDialog({ open, count, onCancel, onChoose }: {
  open: boolean
  count: number
  onCancel: () => void
  onChoose: (choice: 'keepCurrent' | 'useIncoming' | 'keepBoth') => void
}) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Metaset conflict</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Typography variant="body2">
            We found {count} metaset(s) with the same ID but different sets.
          </Typography>
          <Typography variant="body2">
            What should we do?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This applies to all conflicts in this import.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 2, pb: 2 }}>
        <Button variant="contained" color="primary" onClick={() => onChoose('keepCurrent')}>
          Keep my current metasets
        </Button>
        <Button variant="outlined" color="primary" onClick={() => onChoose('useIncoming')}>
          Use the pasted metasets
        </Button>
        <Button variant="outlined" color="secondary" onClick={() => onChoose('keepBoth')}>
          Keep both (make a new ID for pasted)
        </Button>
        <Button color="inherit" onClick={onCancel}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}

