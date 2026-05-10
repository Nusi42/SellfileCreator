import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'

type FileFormatErrorDialogProps = {
  open: boolean
  fileName?: string | null
  onClose: () => void
}

export default function FileFormatErrorDialog(props: FileFormatErrorDialogProps) {
  const { open, fileName, onClose } = props
  const { t } = useI18n()

  const targetLabel = useMemo(() => {
    const trimmed = (fileName ?? '').trim()
    if (!trimmed) return t('fileFormatErrorUnknownName')
    const truncated = trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
    return `“${truncated}”`
  }, [fileName, t])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="file-format-error-title"
    >
      <DialogTitle id="file-format-error-title">
        {t('fileFormatErrorTitle')}
      </DialogTitle>
      <DialogContent dividers>
        <Typography component="p" variant="body1">
          {t('fileFormatErrorMessage', { fileName: targetLabel })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose}>
          {t('fileFormatErrorDismiss')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
