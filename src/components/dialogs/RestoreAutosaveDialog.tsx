import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormGroup, Stack, Typography } from '@mui/material'
import { useMemo, useState, useEffect } from 'react'
import { useI18n } from '../../lib/i18n'
import { formatLocalDateTime } from '../../lib/dateDisplay'
import EllipsisTooltip from '../EllipsisTooltip'
import type { RestoreDraft } from '../../hooks/useAutosaveRestore'
import { RESTORE_SELECTION_DEFAULT, RESTORE_SELECTION_KEYS, type RestoreOptionKey, type RestoreSelection } from '../../types/restoreAutosaveSelection'
import { useRestoreAutosaveSelectionPreference } from '../../state/restoreAutosaveSelection'
import {
  collectMetasetIds,
  collectRecipeMetasetIds,
  collectSafeguardMetasetIds,
  getMetasetDependencyIssues,
} from '../../lib/sfrImportSelection'

export type GearInspectorRestoreDraftMeta = {
  count: number
  savedAt: string | null
}

type RestoreAutosaveDialogProps = {
  open: boolean
  draft: RestoreDraft | null
  gearInspectorDraft: GearInspectorRestoreDraftMeta | null
  storedGearSetsCount: number
  metasetsDiffer: boolean
  targetsDiffer: boolean
  filtersDiffer: boolean
  sortDiffer: boolean
  onDismiss: () => void
  onRestore: (selection: RestoreSelection) => void
}

type RestoreOption = {
  key: RestoreOptionKey
  label: string
  helper?: string
}

const formatSavedAt = (value?: string | null): string | null => formatLocalDateTime(value)

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
  gearInspectorDraft,
  storedGearSetsCount,
  metasetsDiffer,
  targetsDiffer,
  filtersDiffer,
  sortDiffer,
  onDismiss,
  onRestore,
}: RestoreAutosaveDialogProps) {
  const { t } = useI18n()
  const [persistedSelection, setPersistedSelection] = useRestoreAutosaveSelectionPreference()
  const [selection, setSelection] = useState<RestoreSelection>(RESTORE_SELECTION_DEFAULT)
  const recipesCount = draft?.Recipes?.length ?? 0
  const metasCount = draft?.Metasets?.length ?? 0
  // Gear sets are not embedded in autosave/SFR, so only storage matters here.
  // Why: contributors share `.gearsets.json` separately.
  const gearSetsCount = storedGearSetsCount ?? 0
  const hasTargets = Boolean(draft?.substatTargets)
  const hasNote = Boolean(
    (draft?.Note && draft.Note.trim())
    || (draft?.NoteRecipeOverridesAnswers && Object.keys(draft.NoteRecipeOverridesAnswers).length > 0)
    || draft?.NoteRecipeOverridesDisabled
  )
  const hasFilters = Boolean(draft?.Filters)
  const hasSort = Boolean(draft && Object.prototype.hasOwnProperty.call(draft, 'TesterSort'))
  const hasSafeguards = (draft?.Safeguards?.length ?? 0) > 0
  // Only offer the Gear Inspector restore when the saved snapshot has at least one item.
  // An empty snapshot equals the app's default state — restoring it would be a no-op.
  const hasGearInspectorContent = Boolean(gearInspectorDraft && gearInspectorDraft.count > 0)
  const builderSavedAt = formatSavedAt(draft?.AutosaveSavedAt ?? null)
  const gearInspectorSavedAt = formatSavedAt(gearInspectorDraft?.savedAt ?? null)
  const defaultSelection = useMemo<RestoreSelection>(() => {
    const next: RestoreSelection = { ...RESTORE_SELECTION_DEFAULT }
    if (recipesCount > 0) next.recipes = true
    if (metasCount > 0 && metasetsDiffer) next.metasets = true
    if (hasTargets && targetsDiffer) next.targets = true
    if (hasNote) next.note = true
    if (hasSafeguards) next.safeguards = true
    if (hasFilters && filtersDiffer) next.filters = true
    if (hasSort && sortDiffer) next.sort = true
    // Skip tester if snapshot is empty — that equals the default state.
    if (hasGearInspectorContent) next.tester = true
    if (gearSetsCount > 0) next.gearSets = true
    return next
  }, [recipesCount, filtersDiffer, gearSetsCount, hasFilters, hasNote, hasSafeguards, hasSort, hasTargets, metasCount, metasetsDiffer, sortDiffer, targetsDiffer, hasGearInspectorContent])

  useEffect(() => {
    if (!open) return
    const merged = mergeStoredSelection(defaultSelection, persistedSelection)
    setSelection((prev) => (selectionsEqual(prev, merged) ? prev : merged))
  }, [open, defaultSelection, persistedSelection])

  const options = useMemo<RestoreOption[]>(() => {
    const rows: RestoreOption[] = []
    if (recipesCount > 0) {
      rows.push({
        key: 'recipes',
        label: t('restoreAutosaveRecipesLabel', { count: recipesCount }),
        helper: t('restoreAutosaveRecipesHelper'),
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
    if (hasSafeguards) {
      rows.push({
        key: 'safeguards',
        label: t('restoreAutosaveSafeguardsLabel', { count: draft?.Safeguards?.length ?? 0 }),
        helper: t('restoreAutosaveSafeguardsHelper'),
      })
    }
    if (hasFilters && filtersDiffer) {
      rows.push({
        key: 'filters',
        label: t('restoreAutosaveFiltersLabel'),
        helper: t('restoreAutosaveFiltersHelper'),
      })
    }
    if (hasSort && sortDiffer) {
      rows.push({
        key: 'sort',
        label: t('restoreAutosaveSortLabel'),
        helper: t('restoreAutosaveSortHelper'),
      })
    }
    // Only include the Gear Inspector row when the snapshot has actual content (count > 0).
    // An empty snapshot equals the factory default and would be a no-op restore.
    if (hasGearInspectorContent) {
      rows.push({
        key: 'tester',
        label: t('restoreAutosaveTesterLabel', { count: gearInspectorDraft!.count }),
        helper: t('restoreAutosaveTesterHelper'),
      })
    }
    if (gearSetsCount > 0) {
      rows.push({
        key: 'gearSets',
        label: t('restoreAutosaveGearSetsLabel', { count: gearSetsCount }),
        helper: t('restoreAutosaveGearSetsHelper'),
      })
    }
    return rows
  }, [draft?.Safeguards?.length, recipesCount, filtersDiffer, gearSetsCount, hasFilters, hasNote, hasSafeguards, hasSort, hasTargets, metasCount, metasetsDiffer, sortDiffer, targetsDiffer, hasGearInspectorContent, gearInspectorDraft, t])

  // Apply the same metaset dependency rule as Shift-load import options.
  // Why: autosave restore can also import recipes/safeguards without metasets.
  const dependencyIssues = useMemo(() => getMetasetDependencyIssues({
    selection: {
      recipes: selection.recipes,
      safeguards: selection.safeguards,
      metasets: selection.metasets,
    },
    incomingMetasetIds: collectMetasetIds(draft?.Metasets ?? []),
    recipeMetasetIds: collectRecipeMetasetIds(draft?.Recipes ?? []),
    safeguardMetasetIds: collectSafeguardMetasetIds(draft?.Safeguards ?? []),
  }), [draft?.Metasets, draft?.Recipes, draft?.Safeguards, selection.metasets, selection.recipes, selection.safeguards])

  const constraintMessages = useMemo(() => {
    const messages: string[] = []
    for (const issue of dependencyIssues) {
      if (issue === 'recipesRequireMetasets') {
        messages.push(t('restoreAutosaveConstraintRecipesNeedMetasets'))
      }
      if (issue === 'safeguardsRequireMetasets') {
        messages.push(t('restoreAutosaveConstraintSafeguardsNeedMetasets'))
      }
    }
    return messages
  }, [dependencyIssues, t])
  const constraintSummary = constraintMessages.join(' • ')

  const hasOptions = options.length > 0
  // If every item in the list equals the current default (or would be a no-op restore),
  // the dialog has nothing meaningful to offer. Dismiss immediately so the user never sees it.
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
  const canRestore = hasAtLeastOne && constraintMessages.length === 0

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
            {gearInspectorSavedAt && (
              <Typography variant="caption" color="text.secondary">
                {t('restoreAutosaveTesterSavedAt', { timestamp: gearInspectorSavedAt })}
              </Typography>
            )}
          </Stack>
          <FormGroup>
            <Stack spacing={1}>
              {options.map((option) => (
                <Box key={option.key} sx={{ p: 0.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Checkbox
                      checked={selection[option.key]}
                      onChange={handleToggle(option.key)}
                      slotProps={{ input: { 'aria-label': option.label } }}
                      sx={{ mt: -0.5, ml: -0.5 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
                      <Typography variant="body2">{option.label}</Typography>
                      {option.helper && (
                        <Typography variant="caption" color="text.secondary">
                          {option.helper}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        {constraintSummary ? (
          <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
            <EllipsisTooltip title={constraintSummary} wrap="block">
              <Typography
                variant="caption"
                color="error"
                noWrap
                sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {constraintSummary}
              </Typography>
            </EllipsisTooltip>
          </Box>
        ) : <Box sx={{ flex: 1 }} />}
        <Button variant="contained" onClick={() => onRestore(selection)} disabled={!canRestore}>
          {t('restoreAutosaveRestoreSelected')}
        </Button>
        <Button color="error" onClick={onDismiss}>{t('dismiss')}</Button>
      </DialogActions>
    </Dialog>
  )
}
