import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'

// Uniform button props — no color implies priority, same pattern as the override-disable dialog.
const buttonProps = { color: 'primary', variant: 'contained' } as const

export default function ClearTagsConfirmDialog({ open, context, onClose, onClear, onApplyAndClear }: {
  open: boolean
  // 'recipe' or 'safeguard' controls which body copy renders.
  context: 'recipe' | 'safeguard'
  onClose: () => void
  onClear: () => void
  onApplyAndClear: () => void
}) {
  const { t } = useI18n()
  const title = context === 'recipe' ? t('recipeClearTagsConfirmTitle') : t('safeguardClearTagsConfirmTitle')
  const body = context === 'recipe' ? t('recipeClearTagsConfirmBody') : t('safeguardClearTagsConfirmBody')
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{body}</Typography>
      </DialogContent>
      <DialogActions>
        <Button {...buttonProps} onClick={onClose}>{t('cancel')}</Button>
        <Button {...buttonProps} onClick={onClear}>{t('clearTagsConfirmClear')}</Button>
        <Button {...buttonProps} onClick={onApplyAndClear}>{t('clearTagsConfirmApplyAndClear')}</Button>
      </DialogActions>
    </Dialog>
  )
}
