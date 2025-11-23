import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Stack, Typography } from '@mui/material'
import { useMemo, useState, useEffect } from 'react'
import { useI18n } from '../../lib/i18n'
import type { RestoreDraft } from '../../hooks/useAutosaveRestore'
import { RESTORE_SELECTION_DEFAULT, RESTORE_SELECTION_KEYS, type RestoreOptionKey, type RestoreSelection } from '../../types/restoreAutosaveSelection'
import { useRestoreAutosaveSelectionPreference } from '../../state/restoreAutosaveSelection'

export type TesterRestoreDraftMeta = {
  count: number
  savedAt: string | null
}

type RestoreAutosaveDialogProps = {
  open: boolean
  draft: RestoreDraft | null
  testerDraft: TesterRestoreDraftMeta | null
  metasetsDiffer: boolean
  targetsDiffer: boolean
  filtersDiffer: boolean
  onDismiss: () => void
  onRestore: (selection: RestoreSelection) => void
}

type RestoreOption = {
  key: RestoreOptionKey
  label: string
  helper?: string
}

const formatSavedAt = (value?: string | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

const mergeStoredSelection = (defaults: RestoreSelection, stored: Partial<RestoreSelection>): RestoreSelection => {
  const merged: RestoreSelection = { ...defaults }
  RESTORE_SELECTION_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      const value = stored[key]
      if (typeof value === 'boolean') merged[key] = value
    }
  })
  return merged
}

const selectionsEqual = (a: RestoreSelection, b: RestoreSelection): boolean => (
  RESTORE_SELECTION_KEYS.every((key) => a[key] === b[key])
)

export default function RestoreAutosaveDialog({
  open,
  draft,
  testerDraft,
  metasetsDiffer,
  targetsDiffer,
  filtersDiffer,
  onDismiss,
  onRestore,
}: RestoreAutosaveDialogProps) {
  const { t } = useI18n()
  const [persistedSelection, setPersistedSelection] = useRestoreAutosaveSelectionPreference()
  const [selection, setSelection] = useState<RestoreSelection>(RESTORE_SELECTION_DEFAULT)
  const configsCount = draft?.Configs?.length ?? 0
  const metasCount = draft?.Metasets?.length ?? 0
  const hasTargets = Boolean(draft?.substatTargets)
  const hasNote = Boolean(draft?.Note && draft.Note.trim())
  const hasFilters = Boolean(draft?.Filters)
  const builderSavedAt = formatSavedAt(draft?.AutosaveSavedAt ?? null)
  const testerSavedAt = formatSavedAt(testerDraft?.savedAt ?? null)
  const defaultSelection = useMemo<RestoreSelection>(() => {
    const next: RestoreSelection = { ...RESTORE_SELECTION_DEFAULT }
    if (configsCount > 0) next.configs = true
    if (metasCount > 0 && metasetsDiffer) next.metasets = true
    if (hasTargets && targetsDiffer) next.targets = true
    if (hasNote) next.note = true
    if (hasFilters && filtersDiffer) next.filters = true
    if (testerDraft) next.tester = true
    return next
  }, [configsCount, hasFilters, hasNote, hasTargets, metasCount, metasetsDiffer, targetsDiffer, testerDraft, filtersDiffer])

  useEffect(() => {
    if (!open) return
    const merged = mergeStoredSelection(defaultSelection, persistedSelection)
    setSelection((prev) => (selectionsEqual(prev, merged) ? prev : merged))
  }, [open, defaultSelection, persistedSelection])

  const options = useMemo<RestoreOption[]>(() => {
    const rows: RestoreOption[] = []
    if (configsCount > 0) {
      rows.push({
        key: 'configs',
        label: t('restoreAutosaveConfigsLabel', { count: configsCount }),
        helper: t('restoreAutosaveConfigsHelper'),
      })
    }
    if (metasCount > 0 && metasetsDiffer) {
      rows.push({
        key: 'metasets',
        label: t('restoreAutosaveMetasetsLabel', { count: metasCount }),
        helper: t('restoreAutosaveMetasetsHelper'),
      })
    }
    if (hasTargets && targetsDiffer) {
      rows.push({
        key: 'targets',
        label: t('restoreAutosaveTargetsLabel'),
        helper: t('restoreAutosaveTargetsHelper'),
      })
    }
    if (hasNote) {
      rows.push({
        key: 'note',
        label: t('restoreAutosaveNoteLabel'),
        helper: t('restoreAutosaveNoteHelper'),
      })
    }
    if (hasFilters && filtersDiffer) {
      rows.push({
        key: 'filters',
        label: t('restoreAutosaveFiltersLabel'),
        helper: t('restoreAutosaveFiltersHelper'),
      })
    }
    if (testerDraft) {
      rows.push({
        key: 'tester',
        label: t('restoreAutosaveTesterLabel', { count: testerDraft.count }),
        helper: t('restoreAutosaveTesterHelper'),
      })
    }
    return rows
  }, [configsCount, hasFilters, hasNote, hasTargets, metasCount, metasetsDiffer, targetsDiffer, testerDraft, t, filtersDiffer])

  const hasOptions = options.length > 0
  // Autosave prompts must feel invisible when there's nothing actionable.
  useEffect(() => {
    if (!open || hasOptions) return
    // Mirror legacy “no prompt” behavior by rolling back the open flag ASAP.
    onDismiss()
  }, [open, hasOptions, onDismiss])

  if (!hasOptions) return null

  const handleToggle = (key: RestoreOptionKey) => (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setSelection((prev) => {
      if (prev[key] === checked) return prev
      const next: RestoreSelection = { ...prev, [key]: checked }
      setPersistedSelection((stored) => ({ ...stored, [key]: checked }))
      return next
    })
  }

  const selectableOptions = options
  const hasAtLeastOne = selectableOptions.some(opt => selection[opt.key])

  return (
    <Dialog open={open} onClose={onDismiss} maxWidth="sm" fullWidth>
      <DialogTitle>{t('restoreAutosaveTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2">{t('restoreAutosaveSubtitle')}</Typography>
          <Stack spacing={0.5}>
            {builderSavedAt && (
              <Typography variant="caption" color="text.secondary">
                {t('restoreAutosaveSavedAt', { timestamp: builderSavedAt })}
              </Typography>
            )}
            {testerSavedAt && (
              <Typography variant="caption" color="text.secondary">
                {t('restoreAutosaveTesterSavedAt', { timestamp: testerSavedAt })}
              </Typography>
            )}
          </Stack>
          <FormGroup>
          <Stack spacing={1.25}>
            {options.map((option) => (
              <Box key={option.key}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={selection[option.key]}
                      onChange={handleToggle(option.key)}
                    />
                  )}
                  label={(
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <Typography variant="body2">{option.label}</Typography>
                      {option.helper && (
                        <Typography variant="caption" color="text.secondary">
                          {option.helper}
                        </Typography>
                      )}
                    </Box>
                  )}
                  sx={{
                    alignItems: 'flex-start',
                    '& .MuiFormControlLabel-label': { width: '100%' },
                  }}
                />
              </Box>
            ))}
          </Stack>
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={() => onRestore(selection)} disabled={!hasAtLeastOne}>
          {t('restoreAutosaveRestoreSelected')}
        </Button>
        <Button color="error" onClick={onDismiss}>{t('dismiss')}</Button>
      </DialogActions>
    </Dialog>
  )
}
