/**
 * PasteDialog
 *
 * Manual paste dialog for HSFR content (single config, array, or full HSFR).
 */
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, TextField, Typography } from '@mui/material'

export default function PasteDialog({
  open,
  text,
  error,
  onTextChange,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  open: boolean
  text: string
  error: string | null
  onTextChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>Paste Config JSON</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Paste a single config, an array of configs, or an HSFR object containing Configs.
        </Typography>
        <TextField
          multiline
          minRows={8}
          maxRows={16}
          fullWidth
          value={text}
          onChange={(e) => { onTextChange(e.target.value) }}
          placeholder='Example: {"keep":true, "rankCode":0, ...} or [{...}, {...}] or {"Configs": [...]}'
          error={Boolean(error)}
          helperText={error ?? ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  )
}
