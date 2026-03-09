import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useI18n } from '../../lib/i18n'
import EllipsisTooltip from '../EllipsisTooltip'
import type { BuilderRecipe } from '../../lib/hsfBuilder'
import type { Metaset } from '../../lib/metasets'
import type { SafeguardRule } from '../../lib/safeguards'
import {
  collectMetasetIds,
  collectRecipeMetasetIds,
  collectSafeguardMetasetIds,
  getMetasetDependencyIssues,
} from '../../lib/sfrImportSelection'

// Keep section keys shared so state updates remain type-safe.
export type SfrImportSectionKey = 'recipes' | 'note' | 'metasets' | 'safeguards'

// Recipes can either replace the builder list or append to it.
export type SfrRecipeImportMode = 'replace' | 'append'
// Note text can replace existing content or append to the end.
export type SfrNoteImportMode = 'replace' | 'append'
// Metasets can replace current list or merge into it.
export type SfrMetasetImportMode = 'replace' | 'merge'
// Safeguards can replace current rules or append incoming rules.
export type SfrSafeguardsImportMode = 'replace' | 'append'

export type SfrImportSelection = Record<SfrImportSectionKey, boolean>

export type SfrImportModes = {
  recipes: SfrRecipeImportMode
  note: SfrNoteImportMode
  metasets: SfrMetasetImportMode
  safeguards: SfrSafeguardsImportMode
}

type SfrImportOptionsDialogProps = {
  open: boolean
  fileName: string
  incomingRecipes: BuilderRecipe[]
  incomingNote: string | null
  incomingMetasets: Metaset[]
  incomingSafeguards: SafeguardRule[]
  onCancel: () => void
  onConfirm: (selection: SfrImportSelection, modes: SfrImportModes) => void
}

const DEFAULT_SELECTION: SfrImportSelection = {
  recipes: true,
  note: true,
  metasets: true,
  safeguards: true,
}

const DEFAULT_MODES: SfrImportModes = {
  recipes: 'replace',
  note: 'replace',
  metasets: 'replace',
  safeguards: 'replace',
}

export default function SfrImportOptionsDialog(props: SfrImportOptionsDialogProps) {
  const {
    open,
    fileName,
    incomingRecipes,
    incomingNote,
    incomingMetasets,
    incomingSafeguards,
    onCancel,
    onConfirm,
  } = props
  const { t } = useI18n()
  const [selection, setSelection] = useState<SfrImportSelection>(DEFAULT_SELECTION)
  const [modes, setModes] = useState<SfrImportModes>(DEFAULT_MODES)
  // Compute payload counts once so labels and validation stay in sync.
  const incomingRecipeCount = incomingRecipes.length
  const incomingMetasetCount = incomingMetasets.length
  const incomingSafeguardCount = incomingSafeguards.length
  const hasIncomingNote = Boolean(incomingNote && incomingNote.trim().length > 0)

  // Reset defaults each time a fresh Shift-load dialog opens.
  // Track the previous dependency snapshot in state so the comparison doesn't
  // trigger the react-hooks/refs lint rule during render.
  const importResetKey = open ? `${incomingRecipeCount}|${hasIncomingNote}|${incomingMetasetCount}|${incomingSafeguardCount}` : ''
  const [prevImportResetKey, setPrevImportResetKey] = useState<string>('')
  if (open && importResetKey !== prevImportResetKey) {
    setPrevImportResetKey(importResetKey)
    setSelection({
      recipes: incomingRecipeCount > 0,
      note: hasIncomingNote,
      metasets: incomingMetasetCount > 0,
      safeguards: incomingSafeguardCount > 0,
    })
    setModes(DEFAULT_MODES)
  }
  if (!open && prevImportResetKey !== '') {
    setPrevImportResetKey('')
  }

  // Build incoming payload dependency sets for metaset constraints.
  const incomingMetasetIds = useMemo(
    () => collectMetasetIds(incomingMetasets),
    [incomingMetasets],
  )
  const incomingRecipeMetaIds = useMemo(
    () => collectRecipeMetasetIds(incomingRecipes),
    [incomingRecipes],
  )
  const incomingSafeguardMetaIds = useMemo(
    () => collectSafeguardMetasetIds(incomingSafeguards),
    [incomingSafeguards],
  )
  // Enforce: recipes/safeguards without metasets only if they do not reference incoming metasets.
  const dependencyIssues = useMemo(() => getMetasetDependencyIssues({
    selection: {
      recipes: selection.recipes,
      safeguards: selection.safeguards,
      metasets: selection.metasets,
    },
    incomingMetasetIds,
    recipeMetasetIds: incomingRecipeMetaIds,
    safeguardMetasetIds: incomingSafeguardMetaIds,
  }), [incomingMetasetIds, incomingRecipeMetaIds, incomingSafeguardMetaIds, selection.metasets, selection.recipes, selection.safeguards])

  const hasAtLeastOneSelection = selection.recipes || selection.note || selection.metasets || selection.safeguards
  const canConfirm = hasAtLeastOneSelection && dependencyIssues.length === 0

  const toggleSelection = (key: SfrImportSectionKey) => (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setSelection((prev) => ({ ...prev, [key]: checked }))
  }

  const setMode = <T extends keyof SfrImportModes>(key: T) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value as SfrImportModes[T]
    setModes((prev) => ({ ...prev, [key]: value }))
  }

  const constraintMessages = useMemo(() => {
    const messages: string[] = []
    for (const issue of dependencyIssues) {
      if (issue === 'recipesRequireMetasets') {
        messages.push(t('sfrImportConstraintRecipesNeedMetasets'))
      }
      if (issue === 'safeguardsRequireMetasets') {
        messages.push(t('sfrImportConstraintSafeguardsNeedMetasets'))
      }
    }
    return messages
  }, [dependencyIssues, t])
  const constraintSummary = constraintMessages.join(' • ')

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sfrImportDialogTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2">
            {t('sfrImportDialogSubtitle', { fileName })}
          </Typography>
          <Stack spacing={1.25}>
            {/* Use one card per section so text and radio groups align consistently. */}
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Checkbox checked={selection.recipes} onChange={toggleSelection('recipes')} sx={{ mt: -0.5, ml: -0.5 }} />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{t('sfrImportSectionRecipesLabel', { count: incomingRecipeCount })}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('sfrImportSectionRecipesHelper')}</Typography>
                  <RadioGroup row value={modes.recipes} onChange={setMode('recipes')} sx={{ columnGap: 2 }}>
                    <FormControlLabel value="replace" control={<Radio size="small" />} label={t('sfrImportModeReplace')} disabled={!selection.recipes} />
                    <FormControlLabel value="append" control={<Radio size="small" />} label={t('sfrImportModeAppend')} disabled={!selection.recipes} />
                  </RadioGroup>
                </Stack>
              </Box>
            </Box>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Checkbox checked={selection.note} onChange={toggleSelection('note')} sx={{ mt: -0.5, ml: -0.5 }} />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{t('sfrImportSectionNoteLabel')}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('sfrImportSectionNoteHelper')}</Typography>
                  <RadioGroup row value={modes.note} onChange={setMode('note')} sx={{ columnGap: 2 }}>
                    <FormControlLabel value="replace" control={<Radio size="small" />} label={t('sfrImportModeReplace')} disabled={!selection.note} />
                    <FormControlLabel value="append" control={<Radio size="small" />} label={t('sfrImportModeAppend')} disabled={!selection.note} />
                  </RadioGroup>
                </Stack>
              </Box>
            </Box>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Checkbox checked={selection.metasets} onChange={toggleSelection('metasets')} sx={{ mt: -0.5, ml: -0.5 }} />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{t('sfrImportSectionMetasetsLabel', { count: incomingMetasetCount })}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('sfrImportSectionMetasetsHelper')}</Typography>
                  <RadioGroup row value={modes.metasets} onChange={setMode('metasets')} sx={{ columnGap: 2 }}>
                    <FormControlLabel value="replace" control={<Radio size="small" />} label={t('sfrImportModeReplace')} disabled={!selection.metasets} />
                    <FormControlLabel value="merge" control={<Radio size="small" />} label={t('sfrImportModeMerge')} disabled={!selection.metasets} />
                  </RadioGroup>
                </Stack>
              </Box>
            </Box>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <Checkbox checked={selection.safeguards} onChange={toggleSelection('safeguards')} sx={{ mt: -0.5, ml: -0.5 }} />
                <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{t('sfrImportSectionSafeguardsLabel', { count: incomingSafeguardCount })}</Typography>
                  <Typography variant="caption" color="text.secondary">{t('sfrImportSectionSafeguardsHelper')}</Typography>
                  <RadioGroup row value={modes.safeguards} onChange={setMode('safeguards')} sx={{ columnGap: 2 }}>
                    <FormControlLabel value="replace" control={<Radio size="small" />} label={t('sfrImportModeReplace')} disabled={!selection.safeguards} />
                    <FormControlLabel value="append" control={<Radio size="small" />} label={t('sfrImportModeAppend')} disabled={!selection.safeguards} />
                  </RadioGroup>
                </Stack>
              </Box>
            </Box>
          </Stack>
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
        <Button variant="contained" disabled={!canConfirm} onClick={() => onConfirm(selection, modes)}>
          {t('sfrImportApply')}
        </Button>
        <Button color="error" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
