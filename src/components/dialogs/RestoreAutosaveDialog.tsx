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
} from '../../lib/sfcImportSelection'

export type GearInspectorRestoreDraftMeta = {
  count: number
  savedAt: string | null
}

type RestoreAutosaveDialogProps = {
  open: boolean
  draft: RestoreDraft | null
  gearInspectorDraft: GearInspectorRestoreDraftMeta | null
  /**
   * True once the background gear-endpoint data has been applied, superseding the
   * autosave snapshot. The Gear Inspector row stays visible but is disabled and
   * forced unchecked — removing it instead would resize the dialog mid-interaction
   * and risk the user clicking through to a dismissed backdrop.
   */
  gearInspectorDisabled?: boolean
  storedGearSetsCount: number
  metasetsDiffer: boolean
  targetsDiffer: boolean
  /** True when view/filter state or sort state differs from the current session. */
  viewFilterDiffer: boolean
  onDismiss: () => void
  onRestore: (selection: RestoreSelection) => void
}

type RestoreOption = {
  key: RestoreOptionKey
  label: string
  helper?: string
  /**
   * Optional second helper string rendered invisibly (visibility: hidden) so the
   * row always reserves enough height for whichever of the two helpers is taller.
   * Lets the visible helper swap (e.g. enabled → superseded) without resizing the
   * dialog, and measures the real text so no hardcoded height is needed.
   */
  reservedHelper?: string
  /** When true the row renders but cannot be toggled and is treated as unchecked. */
  disabled?: boolean
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
  gearInspectorDisabled = false,
  storedGearSetsCount,
  metasetsDiffer,
  targetsDiffer,
  viewFilterDiffer,
  onDismiss,
  onRestore,
}: RestoreAutosaveDialogProps) {
  const { t } = useI18n()
  const [persistedSelection, setPersistedSelection] = useRestoreAutosaveSelectionPreference()
  const [selection, setSelection] = useState<RestoreSelection>(RESTORE_SELECTION_DEFAULT)
  const recipesCount = draft?.Recipes?.length ?? 0
  const metasCount = draft?.Metasets?.length ?? 0
  // Gear sets are not embedded in autosave/SFC, so only storage matters here.
  // Why: contributors share `.gearsets.json` separately.
  const gearSetsCount = storedGearSetsCount ?? 0
  const hasTargets = Boolean(draft?.substatTargets)
  const hasNote = Boolean(
    (draft?.Note && draft.Note.trim())
    || (draft?.NoteRecipeOverridesAnswers && Object.keys(draft.NoteRecipeOverridesAnswers).length > 0)
    || (draft?.NoteSafeguardOverridesAnswers && Object.keys(draft.NoteSafeguardOverridesAnswers).length > 0)
    || draft?.NoteRecipeOverridesDisabled
  )
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
    // viewFilterDiffer covers both view/filter and sort; show the combined row when either differs.
    if (viewFilterDiffer) next.filters = true
    // Skip Gear Inspector if snapshot is empty — that equals the default state.
    // Also skip when disabled: the endpoint data has superseded the snapshot, so
    // offering its restore would be a no-op (the row stays visible but unchecked).
    if (hasGearInspectorContent && !gearInspectorDisabled) next.gearInspector = true
    if (gearSetsCount > 0) next.gearSets = true
    return next
  }, [recipesCount, viewFilterDiffer, gearSetsCount, hasNote, hasSafeguards, hasTargets, metasCount, metasetsDiffer, targetsDiffer, hasGearInspectorContent, gearInspectorDisabled])

  // Merge persisted and default selection during render when the dialog is open.
  // This replaces a useEffect to avoid an extra re-render cycle — the React-blessed
  // "Storing information from previous renders" pattern guarded by the equality check
  // above (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const mergedSelection = open ? mergeStoredSelection(defaultSelection, persistedSelection) : selection
  if (open && !selectionsEqual(selection, mergedSelection)) {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- see comment above
    setSelection(mergedSelection)
  }

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
    // viewFilterDiffer covers both view/filter and sort state; one combined row.
    if (viewFilterDiffer) {
      rows.push({
        key: 'filters',
        label: t('restoreAutosaveFiltersLabel'),
        helper: t('restoreAutosaveFiltersHelper'),
      })
    }
    // Only include the Gear Inspector row when the snapshot has actual content (count > 0).
    // An empty snapshot equals the factory default and would be a no-op restore.
    if (hasGearInspectorContent) {
      rows.push({
        key: 'gearInspector',
        label: t('restoreAutosaveGearInspectorLabel', { count: gearInspectorDraft!.count }),
        // Show the "superseded" explanation once endpoint data lands; otherwise the
        // normal hint. reservedHelper carries the *other* string so the row reserves
        // the taller of the two from the start and never resizes when they swap.
        helper: gearInspectorDisabled
          ? t('restoreAutosaveGearInspectorSupersededHelper')
          : t('restoreAutosaveGearInspectorHelper'),
        reservedHelper: gearInspectorDisabled
          ? t('restoreAutosaveGearInspectorHelper')
          : t('restoreAutosaveGearInspectorSupersededHelper'),
        disabled: gearInspectorDisabled,
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
  }, [draft?.Safeguards?.length, recipesCount, viewFilterDiffer, gearSetsCount, hasNote, hasSafeguards, hasTargets, metasCount, metasetsDiffer, targetsDiffer, hasGearInspectorContent, gearInspectorDisabled, gearInspectorDraft, t])

  // Apply the same metaset dependency rule as Shift-load import options.
  // Why: autosave restore can also import recipes/safeguards without metasets.
  // When metasets haven't changed the current session already holds them;
  // treat as no "new" incoming IDs so the dependency check never fires.
  const dependencyIssues = useMemo(() => getMetasetDependencyIssues({
    selection: {
      recipes: selection.recipes,
      safeguards: selection.safeguards,
      metasets: selection.metasets,
    },
    incomingMetasetIds: metasetsDiffer
      ? collectMetasetIds(draft?.Metasets ?? [])
      : new Set<string>(),
    recipeMetasetIds: collectRecipeMetasetIds(draft?.Recipes ?? []),
    safeguardMetasetIds: collectSafeguardMetasetIds(draft?.Safeguards ?? []),
  }), [draft?.Metasets, draft?.Recipes, draft?.Safeguards, metasetsDiffer, selection.metasets, selection.recipes, selection.safeguards])

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
  // When all offered fields match their current defaults there is nothing to restore.
  // Apply immediately (onRestore with all-false selection) so acceptRestore() runs and
  // autosave re-enables — rather than leaving the session in the “dismissed” limbo state.
  useEffect(() => {
    if (!open || hasOptions) return
    // Calling onRestore here is intentional: the dialog itself must trigger this auto-accept
    // once it determines hasOptions is false; the parent cannot know this without
    // re-implementing the full options-computation logic outside the dialog.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onRestore(RESTORE_SELECTION_DEFAULT)
  }, [open, hasOptions, onRestore])

  // Nothing to show — bail before rendering so MUI never mounts the Dialog.
  if (!hasOptions) return null

  const handleToggle = (key: RestoreOptionKey) => (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setSelection((prev) => {
      if (prev[key] === checked) return prev
      const next: RestoreSelection = { ...prev, [key]: checked }
      setPersistedSelection((stored) => ({ ...stored, [key]: checked }))
      return next
    })
  }

  // Disabled rows (e.g. the superseded Gear Inspector offer) never count toward a
  // valid restore, even if a stale persisted selection still has them checked.
  const selectableOptions = options.filter(opt => !opt.disabled)
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
                {t('restoreAutosaveGearInspectorSavedAt', { timestamp: gearInspectorSavedAt })}
              </Typography>
            )}
          </Stack>
          <FormGroup>
            <Stack spacing={1}>
              {options.map((option) => (
                <Box key={option.key} sx={{ p: 0.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Checkbox
                      // Disabled rows always render unchecked regardless of any stale
                      // persisted selection, so the user can't restore superseded data.
                      checked={option.disabled ? false : selection[option.key]}
                      disabled={option.disabled}
                      onChange={handleToggle(option.key)}
                      slotProps={{ input: { 'aria-label': option.label } }}
                      sx={{ mt: -0.5, ml: -0.5 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
                      {/* Label dims to the disabled token so it matches the greyed checkbox. */}
                      <Typography variant="body2" color={option.disabled ? 'text.disabled' : 'text.primary'}>
                        {option.label}
                      </Typography>
                      {option.helper && (
                        option.reservedHelper ? (
                          // Stack both helpers in one grid cell so the row reserves the
                          // taller string's height up front; only the active one is visible.
                          // This avoids any dialog resize when the text swaps, with no
                          // hardcoded height — the hidden text is measured for real.
                          <Box sx={{ display: 'grid', minWidth: 0 }}>
                            <Typography
                              variant="caption"
                              color={option.disabled ? 'text.disabled' : 'text.secondary'}
                              sx={{ gridArea: '1 / 1' }}
                            >
                              {option.helper}
                            </Typography>
                            <Typography
                              variant="caption"
                              aria-hidden
                              sx={{ gridArea: '1 / 1', visibility: 'hidden' }}
                            >
                              {option.reservedHelper}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography
                            variant="caption"
                            color={option.disabled ? 'text.disabled' : 'text.secondary'}
                          >
                            {option.helper}
                          </Typography>
                        )
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
