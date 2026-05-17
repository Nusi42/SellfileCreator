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
  deleteSafeguardIdx,
  setDeleteSafeguardIdx,
  onConfirmDeleteSafeguard,
  deleteSafeguardMultiTargets,
  setDeleteSafeguardMultiTargets,
  onConfirmDeleteSafeguardMulti,
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
  // Safeguard variants — independent state so a safeguard delete dialog never
  // collides with a recipe delete dialog when both states transition.
  deleteSafeguardIdx: number | null
  setDeleteSafeguardIdx: (v: number | null) => void
  onConfirmDeleteSafeguard: () => void
  deleteSafeguardMultiTargets: number[] | null
  setDeleteSafeguardMultiTargets: (v: number[] | null) => void
  onConfirmDeleteSafeguardMulti: () => void
  clearHistoryOpen: boolean
  setClearHistoryOpen: (v: boolean) => void
  onConfirmClearHistory: () => void
}) {
  const { t } = useI18n()
  const deleteMultiCount = deleteMultiTargets?.length ?? 0
  const deleteSafeguardMultiCount = deleteSafeguardMultiTargets?.length ?? 0
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
        <DialogTitle>{t('titleDeleteAllRecipes')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteAllRecipes')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenClear(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setOpenClear(false); onConfirmClear() }}>{t('deleteAll')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {deleteIdx !== null ? (
      <Dialog open={deleteIdx !== null} onClose={() => setDeleteIdx(null)}>
        <DialogTitle>{t('titleDeleteRecipe')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteRecipe')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteIdx(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDelete() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {deleteMultiTargets !== null ? (
      <Dialog open={deleteMultiTargets !== null} onClose={() => setDeleteMultiTargets(null)}>
        <DialogTitle>{t('titleDeleteSelectedRecipes', { n: deleteMultiCount })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgDeleteSelectedRecipes', { n: deleteMultiCount })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteMultiTargets(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDeleteMulti() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {/* Single safeguard delete — reuses the long-standing singular safeguard strings. */}
      {deleteSafeguardIdx !== null ? (
      <Dialog open={deleteSafeguardIdx !== null} onClose={() => setDeleteSafeguardIdx(null)}>
        <DialogTitle>{t('safeguardsDeleteRuleTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('safeguardsDeleteRuleMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSafeguardIdx(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDeleteSafeguard() }}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      ) : null}

      {/* Multi safeguard delete — count-parametrized title/message mirror the recipe pair. */}
      {deleteSafeguardMultiTargets !== null ? (
      <Dialog open={deleteSafeguardMultiTargets !== null} onClose={() => setDeleteSafeguardMultiTargets(null)}>
        <DialogTitle>{t('safeguardsDeleteSelectedRulesTitle', { n: deleteSafeguardMultiCount })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('safeguardsDeleteSelectedRulesMessage', { n: deleteSafeguardMultiCount })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteSafeguardMultiTargets(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { onConfirmDeleteSafeguardMulti() }}>{t('delete')}</Button>
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
 * all recipes, and deleting single or multiple recipes.
 */
