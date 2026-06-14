/**
 * NoteDynamicOverridesPresets.tsx
 *
 * Shared save/load/delete UI for the note dialog's "Dynamic Overrides" menu,
 * mirroring the filter/sort preset UX. Both the view-mode menu (NoteDialog) and
 * the edit-mode menu (NoteEditorContent) render the SAME section + dialogs via
 * this single source of truth — they only differ in which note text / answer
 * setters they pass in.
 *
 * A saved set captures both the recipe and safeguard prompt selections. Loading
 * applies only the selections still valid for the current note (questions/options
 * present), leaving everything else untouched. The per-set tooltip lists each
 * stored question prompt + selected answer labels (display text, not internal ids),
 * omitting anything absent from the current note.
 *
 * The controller is split into:
 *  - useDynamicOverridesPresetController(): owns state + handlers;
 *  - <DynamicOverridesPresetMenuItems>: the list + save-as rows, rendered INSIDE the menu;
 *  - <DynamicOverridesPresetDialogs>: the save/delete dialogs, rendered OUTSIDE the menu
 *    so they survive the menu unmounting on close (the menu's children unmount with it).
 */
import React from 'react'
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography, Button, Divider } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import MarkdownTooltip, { renderMarkdownTooltipContent } from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'
import { formatLocalDateTime } from '../lib/dateDisplay'
import {
  useDynamicOverridesPresetsPreference,
  type DynamicOverridesPreset,
} from '../state/dynamicOverridesPresetsPreference'
import { createPresetId, sanitizePresetName } from '../state/presetUtils'
import {
  buildDynamicOverridesPresetSummary,
  resolveDynamicOverridesPresetApply,
  snapshotDynamicOverridesFullSelection,
} from '../lib/dynamicOverridesPresetSummary'
import type { NoteRecipeOverridesAnswers } from '../lib/noteRecipeOverrides'
import type { NoteSafeguardOverridesAnswers } from '../lib/noteSafeguardOverrides'

/** Shared controller args: the current note + live answers and their setters. */
type DynamicOverridesPresetControllerArgs = {
  // The note text the menu acts on (rendered note in view mode, draft in edit mode).
  note: string
  // Live recipe-overrides answers + setter (so load can write them).
  recipeAnswers: NoteRecipeOverridesAnswers
  onRecipeAnswersChange: React.Dispatch<React.SetStateAction<NoteRecipeOverridesAnswers>>
  // Live safeguard-overrides answers + setter.
  safeguardAnswers: NoteSafeguardOverridesAnswers
  onSafeguardAnswersChange: React.Dispatch<React.SetStateAction<NoteSafeguardOverridesAnswers>>
  // Re-enable parsing when a set is loaded (a loaded set is meant to take effect immediately).
  onEnableOverrides: () => void
  // Close the host menu before opening a dialog / after a load so they never overlap.
  onCloseMenu: () => void
}

/** What the controller hook exposes to its two render pieces. */
export type DynamicOverridesPresetController = {
  note: string
  presets: readonly DynamicOverridesPreset[]
  handleLoad: (preset: DynamicOverridesPreset) => void
  requestDelete: (preset: DynamicOverridesPreset) => void
  openSaveDialog: () => void
  // Save dialog wiring.
  saveOpen: boolean
  saveName: string
  setSaveName: (value: string) => void
  closeSaveDialog: () => void
  confirmSave: () => void
  // Delete dialog wiring.
  deleteTarget: DynamicOverridesPreset | null
  closeDeleteDialog: () => void
  confirmDelete: () => void
}

/** Owns preset state + the save/load/delete handlers shared by both menus. */
export function useDynamicOverridesPresetController({
  note,
  recipeAnswers,
  onRecipeAnswersChange,
  safeguardAnswers,
  onSafeguardAnswersChange,
  onEnableOverrides,
  onCloseMenu,
}: DynamicOverridesPresetControllerArgs): DynamicOverridesPresetController {
  const [presets, setPresets] = useDynamicOverridesPresetsPreference()
  // Save dialog state: open + the in-progress name.
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState('')
  // Delete-confirm target (null when closed).
  const [deleteTarget, setDeleteTarget] = React.useState<DynamicOverridesPreset | null>(null)

  // Open the save dialog with an empty name after the host menu closes.
  const openSaveDialog = React.useCallback(() => {
    onCloseMenu()
    setSaveName('')
    setSaveOpen(true)
  }, [onCloseMenu])
  const closeSaveDialog = React.useCallback(() => setSaveOpen(false), [])

  // Persist the current selections under the entered name. We snapshot the FULL resolved
  // selection (defaults merged in) — not the lean live map — so the saved set reproduces
  // the same outcome even if the note's defaults change later. Resolution uses the shared
  // resolver, so the values are identical to the live selection.
  const confirmSave = React.useCallback(() => {
    const name = sanitizePresetName(saveName)
    if (!name) return
    const full = snapshotDynamicOverridesFullSelection(note, recipeAnswers, safeguardAnswers)
    const preset: DynamicOverridesPreset = {
      id: createPresetId(),
      name,
      savedAt: new Date().toISOString(),
      recipeAnswers: full.recipeAnswers,
      safeguardAnswers: full.safeguardAnswers,
    }
    // Newest first, matching the filter/sort preset ordering.
    setPresets((prev) => [preset, ...(Array.isArray(prev) ? prev : [])])
    setSaveOpen(false)
  }, [note, saveName, recipeAnswers, safeguardAnswers, setPresets])

  // Load a saved set: apply only still-valid selections over the live answers, then re-enable.
  const handleLoad = React.useCallback((preset: DynamicOverridesPreset) => {
    const applied = resolveDynamicOverridesPresetApply(note, preset.recipeAnswers, preset.safeguardAnswers)
    // Merge over current answers so questions not covered by the set stay as-is.
    onRecipeAnswersChange((prev) => ({ ...prev, ...applied.recipeAnswers }))
    onSafeguardAnswersChange((prev) => ({ ...prev, ...applied.safeguardAnswers }))
    // A loaded set should take effect immediately even if parsing was disabled.
    onEnableOverrides()
    onCloseMenu()
  }, [note, onRecipeAnswersChange, onSafeguardAnswersChange, onEnableOverrides, onCloseMenu])

  // Delete request closes the menu first, then opens the confirm dialog.
  const requestDelete = React.useCallback((preset: DynamicOverridesPreset) => {
    onCloseMenu()
    setDeleteTarget(preset)
  }, [onCloseMenu])
  const closeDeleteDialog = React.useCallback(() => setDeleteTarget(null), [])
  const confirmDelete = React.useCallback(() => {
    setDeleteTarget((target) => {
      if (target) setPresets((prev) => (Array.isArray(prev) ? prev.filter((p) => p.id !== target.id) : []))
      return null
    })
  }, [setPresets])

  return {
    note,
    presets,
    handleLoad,
    requestDelete,
    openSaveDialog,
    saveOpen,
    saveName,
    setSaveName,
    closeSaveDialog,
    confirmSave,
    deleteTarget,
    closeDeleteDialog,
    confirmDelete,
  }
}

/** One saved-set row: name + timestamp, info tooltip, load on click, delete button. */
function DynamicOverridesPresetRow({
  note,
  preset,
  onLoad,
  onRequestDelete,
}: {
  note: string
  preset: DynamicOverridesPreset
  onLoad: (preset: DynamicOverridesPreset) => void
  onRequestDelete: (preset: DynamicOverridesPreset) => void
}) {
  const { t } = useI18n()
  // Resolve the per-set summary against the current note (display text only).
  const lines = React.useMemo(
    () => buildDynamicOverridesPresetSummary(note, preset.recipeAnswers, preset.safeguardAnswers),
    [note, preset],
  )
  // Render a structured tooltip that mirrors the override cards: each question's title
  // (bold) with its selected answers as bullets beneath. Every piece of text runs through
  // the shared markdown renderer so the override DSL's `code`/**bold** render as intended
  // instead of leaking raw backticks/asterisks.
  const renderTooltip = React.useCallback(() => {
    if (lines.length === 0) {
      return (
        <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.85 }}>
          {t('noteDynamicOverridesPresetsTooltipEmpty')}
        </Typography>
      )
    }
    return (
      <Stack spacing={1.25}>
        {lines.map((line) => (
          <Box key={line.title}>
            {/* Question title: bold weight applied at the wrapper so inner `code`/bold still render. */}
            <Box sx={{ fontWeight: 700, mb: 0.4, '& p': { fontWeight: 700 } }}>
              {renderMarkdownTooltipContent(line.title)}
            </Box>
            {/* Selected answers as a bullet list, like the option rows in the card.
                Answers left at the note's default are dimmed and tagged so the user can
                tell which they actively chose vs. accepted. */}
            <Box component="ul" sx={{ pl: 2.25, m: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {line.answers.map((answer) => (
                <Box
                  component="li"
                  key={answer.label}
                  sx={{ listStylePosition: 'outside', ...(answer.isDefault ? { opacity: 0.7 } : {}) }}
                >
                  <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5, flexWrap: 'wrap' }}>
                    {renderMarkdownTooltipContent(answer.label)}
                    {answer.isDefault ? (
                      <Typography component="span" variant="caption" sx={{ fontStyle: 'italic', opacity: 0.85 }}>
                        {t('noteDynamicOverridesPresetsDefaultTag')}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    )
  }, [lines, t])
  return (
    <MarkdownTooltip render={renderTooltip} placement="right">
      <MenuItem
        onClick={() => onLoad(preset)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.75 }}
      >
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1 }}>
          <Typography variant="body2" noWrap sx={{ lineHeight: 1.2 }}>
            {preset.name}
          </Typography>
          {/* Timestamp keeps the menu scan-friendly, mirroring filter/sort preset rows. */}
          <Typography variant="caption" noWrap sx={{ lineHeight: 1.1, color: 'text.secondary', opacity: 0.78 }}>
            {formatLocalDateTime(preset.savedAt) ?? preset.savedAt}
          </Typography>
        </Box>
        <IconButton
          size="small"
          color="error"
          aria-label={t('delete')}
          onClick={(event) => {
            // Stop the click from also triggering the row's load handler.
            try { event.stopPropagation() } catch {}
            onRequestDelete(preset)
          }}
          sx={{ p: 0.5, alignSelf: 'center' }}
        >
          <DeleteIcon fontSize="inherit" />
        </IconButton>
      </MenuItem>
    </MarkdownTooltip>
  )
}

/**
 * The saved-override-sets section rendered INSIDE the Dynamic Overrides menu:
 * a divider + header, the list of saved sets (or an empty placeholder), and a
 * "Save Current Selection" entry. Must be a direct child of <Menu> (returns a
 * fragment of MenuItems) so keyboard navigation and dense styling apply.
 */
export function DynamicOverridesPresetMenuItems({ controller }: { controller: DynamicOverridesPresetController }) {
  const { t } = useI18n()
  const { note, presets, handleLoad, requestDelete, openSaveDialog } = controller
  return (
    <>
      {/* Visually separate the saved-sets section from the reset/disable actions above. */}
      <Divider sx={{ my: 0.5 }} />
      <Typography variant="caption" sx={{ px: 2, py: 0.25, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
        {t('noteDynamicOverridesPresetsHeader')}
      </Typography>
      {presets.length > 0 ? (
        presets.map((preset) => (
          <DynamicOverridesPresetRow
            key={preset.id}
            note={note}
            preset={preset}
            onLoad={handleLoad}
            onRequestDelete={requestDelete}
          />
        ))
      ) : (
        <MenuItem disabled>{t('noteDynamicOverridesPresetsEmpty')}</MenuItem>
      )}
      <MenuItem onClick={openSaveDialog} sx={{ fontStyle: 'italic', gap: 0.75 }}>
        <BookmarkAddIcon fontSize="small" />
        {t('noteDynamicOverridesPresetsSaveAs')}
      </MenuItem>
    </>
  )
}

/**
 * The save-name + delete-confirm dialogs, rendered OUTSIDE the menu so they
 * persist after the menu (and its children) unmount on close.
 */
export function DynamicOverridesPresetDialogs({ controller }: { controller: DynamicOverridesPresetController }) {
  const { t } = useI18n()
  const {
    saveOpen, saveName, setSaveName, closeSaveDialog, confirmSave,
    deleteTarget, closeDeleteDialog, confirmDelete,
  } = controller
  return (
    <>
      {/* Save-name dialog. */}
      <Dialog open={saveOpen} onClose={closeSaveDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('noteDynamicOverridesPresetsSaveDialogTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('noteDynamicOverridesPresetsSaveDialogHelper')}
            </Typography>
            <TextField
              autoFocus
              label={t('noteDynamicOverridesPresetsNameLabel')}
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') confirmSave() }}
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSaveDialog}>{t('cancel')}</Button>
          <Button onClick={confirmSave} disabled={!saveName.trim()} variant="contained">
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete-confirm dialog. */}
      <Dialog open={Boolean(deleteTarget)} onClose={closeDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('noteDynamicOverridesPresetsDeleteDialogTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('noteDynamicOverridesPresetsDeleteDialogMessage', { name: deleteTarget?.name ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>{t('cancel')}</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            {t('delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
