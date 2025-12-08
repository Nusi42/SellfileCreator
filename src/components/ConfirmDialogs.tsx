// no default React import needed with new JSX transform
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'

export default function ConfirmDialogs({
  openClear,
  setOpenClear,
  onConfirmClear,
  deleteIdx,
  setDeleteIdx,
  onConfirmDelete,
  deleteMultiTargets,
  setDeleteMultiTargets,
  onConfirmDeleteMulti,
  clearHistoryOpen,
  setClearHistoryOpen,
  onConfirmClearHistory,
}: {
  openClear: boolean
  setOpenClear: (v: boolean) => void
  onConfirmClear: () => void
  deleteIdx: number | null
  setDeleteIdx: (v: number | null) => void
  onConfirmDelete: () => void
  deleteMultiTargets: number[] | null
  setDeleteMultiTargets: (v: number[] | null) => void
  onConfirmDeleteMulti: () => void
  clearHistoryOpen: boolean
  setClearHistoryOpen: (v: boolean) => void
  onConfirmClearHistory: () => void
}) {
  const { t } = useI18n()
  const deleteMultiCount = deleteMultiTargets?.length ?? 0
  return (
    <>
      {clearHistoryOpen ? (
      <Dialog open={clearHistoryOpen} onClose={() => setClearHistoryOpen(false)}>
        <DialogTitle>{t('titleClearHistory')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearHistory')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearHistoryOpen(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setClearHistoryOpen(false); onConfirmClearHistory() }}>{t('builderHistoryClearAction')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {openClear ? (
      <Dialog open={openClear} onClose={() => setOpenClear(false)}>
        <DialogTitle>{t('titleDeleteAllConfigs')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteAllConfigs')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenClear(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setOpenClear(false); onConfirmClear() }}>{t('deleteAll')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {deleteIdx !== null ? (
      <Dialog open={deleteIdx !== null} onClose={() => setDeleteIdx(null)}>
        <DialogTitle>{t('titleDeleteConfig')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteConfig')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteIdx(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDelete() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {deleteMultiTargets !== null ? (
      <Dialog open={deleteMultiTargets !== null} onClose={() => setDeleteMultiTargets(null)}>
        <DialogTitle>{t('titleDeleteSelectedConfigs', { n: deleteMultiCount })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteSelectedConfigs', { n: deleteMultiCount })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMultiTargets(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDeleteMulti() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}
    </>
  )
}
/**
 * ConfirmDialogs
 *
 * Centralized confirmation dialogs used by App for clearing history, clearing
 * all configs, and deleting single or multiple configurations.
 */
