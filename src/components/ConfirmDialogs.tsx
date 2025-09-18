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
  deleteMultiCount,
  setDeleteMultiCount,
  onConfirmDeleteMulti,
}: {
  openClear: boolean
  setOpenClear: (v: boolean) => void
  onConfirmClear: () => void
  deleteIdx: number | null
  setDeleteIdx: (v: number | null) => void
  onConfirmDelete: () => void
  deleteMultiCount: number | null
  setDeleteMultiCount: (v: number | null) => void
  onConfirmDeleteMulti: () => void
}) {
  const { t } = useI18n()
  return (
    <>
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

      <Dialog open={deleteIdx !== null} onClose={() => setDeleteIdx(null)}>
        <DialogTitle>{t('titleDeleteConfig')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteConfig')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteIdx(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setDeleteIdx(null); onConfirmDelete() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteMultiCount !== null} onClose={() => setDeleteMultiCount(null)}>
        <DialogTitle>{t('titleDeleteSelectedConfigs', { n: deleteMultiCount ?? 0 })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteSelectedConfigs', { n: deleteMultiCount ?? 0 })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMultiCount(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setDeleteMultiCount(null); onConfirmDeleteMulti() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
/**
 * ConfirmDialogs
 *
 * Centralized confirmation dialogs used by App for clearing all configs and
 * deleting a single or multiple configurations.
 */
