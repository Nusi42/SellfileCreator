import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'
import type { MinimaTable } from '../../lib/hsfBuilder'
import type { Metaset } from '../../lib/metasets'
import type { BuilderConfig } from '../../lib/hsfBuilder'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  Minima?: MinimaTable
  Configs?: BuilderConfig[]
  SelectedConfigIndex?: number
  Note?: string
  AutosaveSavedAt?: string
}

export default function RestoreAutosaveDialog({ open, draft, onDismiss, onRestore }: {
  open: boolean
  draft: RestoreDraft | null
  onDismiss: () => void
  onRestore: () => void
}) {
  const { t } = useI18n()
  const configs = draft?.Configs?.length ?? 0
  const metas = draft?.Metasets?.length ?? 0
  const hasNote = Boolean(draft?.Note && draft.Note.trim())
  return (
    <Dialog open={open} onClose={onDismiss}>
      <DialogTitle>{t('restoreAutosaveTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Typography variant="body2">{t('restoreAutosaveQuestion')}</Typography>
          <Typography variant="caption" color="text.secondary">{t('restoreAutosaveSummary', { configs, metas, note: hasNote ? t('yes') : t('no') })}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onRestore}>{t('restore')}</Button>
        <Button color="error" onClick={onDismiss}>{t('dismiss')}</Button>
      </DialogActions>
    </Dialog>
  )
}
