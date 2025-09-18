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
      <DialogTitle>Restore last saved configuration?</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          <Typography variant="body2">
            An autosaved session was found. Would you like to restore it?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Configs: {configs} • Metasets: {metas} • Note: {hasNote ? 'Yes' : 'No'}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={onDismiss}>{t('dismiss')}</Button>
        <Button variant="contained" onClick={onRestore}>{t('restore')}</Button>
      </DialogActions>
    </Dialog>
  )
}
