/**
 * PasteDialog
 *
 * Manual paste dialog for SFC content (single recipe, array, or full SFC).
 */
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, TextField, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'

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
  const { t } = useI18n()
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth TransitionProps={{ unmountOnExit: true }}>
      <DialogTitle>{t('titlePasteRecipeJson')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1 }}>{t('msgPasteInstructions')}</Typography>
        <TextField
          multiline
          minRows={8}
          maxRows={16}
          fullWidth
          value={text}
          onChange={(e) => { onTextChange(e.target.value) }}
          placeholder={t('placeholderPasteExample', { example: '{"keep":true, "rankCode":0, …} or [{…}, {…}] or {"Recipes": […]}' })}
          error={Boolean(error)}
          helperText={error ?? ' '}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('cancel')}</Button>
        <Button variant="contained" onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  )
}
