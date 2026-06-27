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
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Popper, Stack, TextField, Tooltip, Typography, Button, Divider } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useI18n } from '../lib/i18n'
import { formatLocalDateTime } from '../lib/dateDisplay'
import { ClippedScrollBody } from './ClippedScrollBody'
import { DynamicOverridesPresetSummaryTable } from './DynamicOverridesPresetSummaryTable'
import {
  DYNAMIC_OVERRIDES_PRESET_POPOVER_WIDTH_PX,
  DYNAMIC_OVERRIDES_PRESET_POPOVER_MAX_HEIGHT_PX,
  DYNAMIC_OVERRIDES_PRESET_POPOVER_OPEN_DELAY_MS,
  DYNAMIC_OVERRIDES_PRESET_POPOVER_CLOSE_DELAY_MS,
  SAFE_TEXT_LINE_HEIGHT,
} from '../lib/constants'
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
import { buildWarningBadgeBase } from '../lib/badgeStyles'
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
  requestOverwrite: (preset: DynamicOverridesPreset) => void
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
  // Overwrite dialog wiring.
  overwriteTarget: DynamicOverridesPreset | null
  closeOverwriteDialog: () => void
  confirmOverwrite: () => void
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
  // Overwrite-confirm target (null when closed): the existing set to replace with the live selection.
  const [overwriteTarget, setOverwriteTarget] = React.useState<DynamicOverridesPreset | null>(null)

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

  // Overwrite request closes the menu first, then opens the confirm dialog.
  const requestOverwrite = React.useCallback((preset: DynamicOverridesPreset) => {
    onCloseMenu()
    setOverwriteTarget(preset)
  }, [onCloseMenu])
  const closeOverwriteDialog = React.useCallback(() => setOverwriteTarget(null), [])
  // Replace the target set's stored answers with the current FULL selection (same snapshot
  // rule as confirmSave), keeping its id + name and bumping the saved timestamp.
  const confirmOverwrite = React.useCallback(() => {
    setOverwriteTarget((target) => {
      if (target) {
        const full = snapshotDynamicOverridesFullSelection(note, recipeAnswers, safeguardAnswers)
        const updated: DynamicOverridesPreset = {
          ...target,
          savedAt: new Date().toISOString(),
          recipeAnswers: full.recipeAnswers,
          safeguardAnswers: full.safeguardAnswers,
        }
        setPresets((prev) => (Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? updated : p)) : []))
      }
      return null
    })
  }, [note, recipeAnswers, safeguardAnswers, setPresets])

  return {
    note,
    presets,
    handleLoad,
    requestDelete,
    requestOverwrite,
    openSaveDialog,
    saveOpen,
    saveName,
    setSaveName,
    closeSaveDialog,
    confirmSave,
    deleteTarget,
    closeDeleteDialog,
    confirmDelete,
    overwriteTarget,
    closeOverwriteDialog,
    confirmOverwrite,
  }
}

/** One saved-set row: name + timestamp, a hover-anchored summary Popover, load on click, delete button. */
function DynamicOverridesPresetRow({
  note,
  preset,
  onLoad,
  onRequestDelete,
  onRequestOverwrite,
}: {
  note: string
  preset: DynamicOverridesPreset
  onLoad: (preset: DynamicOverridesPreset) => void
  onRequestDelete: (preset: DynamicOverridesPreset) => void
  onRequestOverwrite: (preset: DynamicOverridesPreset) => void
}) {
  const { t } = useI18n()
  // Resolve the per-set summary against the current note (display text + fallback flags).
  const { lines, hasAnyFallback } = React.useMemo(
    () => buildDynamicOverridesPresetSummary(note, preset.recipeAnswers, preset.safeguardAnswers),
    [note, preset],
  )
  // The summary lives in a scrollable Popover (not a tooltip) because large sets can be
  // taller than the viewport and tooltips cannot scroll. Anchor is the row itself.
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  // Hover-intent timers: a short open delay mimics the old tooltip feel; a short close
  // delay lets the pointer travel from the row into the Popover without it snapping shut.
  const openTimerRef = React.useRef<number | null>(null)
  const closeTimerRef = React.useRef<number | null>(null)
  const clearTimers = React.useCallback(() => {
    if (openTimerRef.current != null) { window.clearTimeout(openTimerRef.current); openTimerRef.current = null }
    if (closeTimerRef.current != null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null }
  }, [])
  // Open against the hovered row element after the open delay.
  const scheduleOpen = React.useCallback((target: HTMLElement) => {
    clearTimers()
    openTimerRef.current = window.setTimeout(() => { setAnchorEl(target) }, DYNAMIC_OVERRIDES_PRESET_POPOVER_OPEN_DELAY_MS)
  }, [clearTimers])
  // Close after the grace delay so a pointer crossing the gap to the Popover keeps it open.
  const scheduleClose = React.useCallback(() => {
    clearTimers()
    closeTimerRef.current = window.setTimeout(() => { setAnchorEl(null) }, DYNAMIC_OVERRIDES_PRESET_POPOVER_CLOSE_DELAY_MS)
  }, [clearTimers])
  // Tidy timers on unmount so a pending open/close never fires into a dead component.
  React.useEffect(() => clearTimers, [clearTimers])
  return (
    <>
      <MenuItem
        onClick={() => onLoad(preset)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.75 }}
      >
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1 }}>
          <Typography variant="body2" noWrap sx={{ lineHeight: SAFE_TEXT_LINE_HEIGHT }}>
            {preset.name}
          </Typography>
          {/* Timestamp keeps the menu scan-friendly, mirroring filter/sort preset rows. */}
          <Typography variant="caption" noWrap sx={{ lineHeight: SAFE_TEXT_LINE_HEIGHT, color: 'text.secondary', opacity: 0.78 }}>
            {formatLocalDateTime(preset.savedAt) ?? preset.savedAt}
          </Typography>
        </Box>
        {/* Warning icon: some saved answers are unavailable for this note (question gone or
            options removed). Inline rather than absolute so it fits naturally in the flex row. */}
        {hasAnyFallback ? (
          <Tooltip title={t('noteDynamicOverridesPresetsFallbackRowTooltip')} placement="top">
            <Box
              component="span"
              aria-label={t('noteDynamicOverridesPresetsFallbackRowTooltip')}
              sx={(theme) => ({
                ...buildWarningBadgeBase(theme),
                flexShrink: 0,
                alignSelf: 'center',
                cursor: 'default',
              })}
            >
              !
            </Box>
          </Tooltip>
        ) : null}
        {/* Overwrite: replace this set's stored selection with the current one (confirmed). */}
        <IconButton
          size="small"
          aria-label={t('noteDynamicOverridesPresetsOverwriteButton')}
          onClick={(event) => {
            // Stop the click from also triggering the row's load handler.
            try { event.stopPropagation() } catch {}
            onRequestOverwrite(preset)
          }}
          sx={{ p: 0.5, alignSelf: 'center' }}
        >
          <SaveAsIcon fontSize="inherit" />
        </IconButton>
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
        {/* Only the chevron previews: hovering it opens the summary popout, anchored to the
            chevron itself. The name + overwrite/delete buttons no longer trigger it, so they
            stay clickable even after the popout opens. */}
        <Box
          onMouseEnter={(event) => scheduleOpen(event.currentTarget)}
          onMouseLeave={scheduleClose}
          sx={{ display: 'inline-flex', alignSelf: 'center', flexShrink: 0, p: 0.5, cursor: 'default' }}
          aria-label={t('noteDynamicOverridesPresetsHeader')}
        >
          <ChevronRightIcon
            fontSize="small"
            aria-hidden
            sx={{ color: 'text.secondary', opacity: anchorEl != null ? 1 : 0.6 }}
          />
        </Box>
      </MenuItem>
      {/* A Popper (NOT a Popover/Modal): no backdrop, no focus trap, so the underlying
          Dynamic Overrides menu keeps its own outside-click-to-dismiss backdrop. A modal
          Popover layered a second (invisible) backdrop that swallowed the menu's dismiss
          click, leaving Escape as the only way out. Anchored to the chevron (not the row),
          so it opens just off the row's right edge. */}
      <Popper
        open={anchorEl != null}
        anchorEl={anchorEl}
        placement="right-start"
        // Keep the popout on-screen AND off the menu it springs from. When there is no
        // room to the right (e.g. the near-fullscreen simple-mode dialog), flip to the
        // TOP/BOTTOM rather than to the left — a left flip would land the popout back over
        // the menu's action buttons. `preventOverflow` then slides it fully on-screen.
        modifiers={[
          { name: 'offset', options: { offset: [0, 8] } },
          { name: 'flip', options: { fallbackPlacements: ['bottom-start', 'top-start', 'left-start'] } },
          { name: 'preventOverflow', options: { altAxis: true, padding: 8 } },
        ]}
        // Above the menu's Popper layer so the summary is not clipped behind it.
        sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
      >
        <Paper
          elevation={8}
          // Re-arm/cancel the hover-close so the pointer can rest inside the popout to scroll it.
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
          sx={(theme) => ({
            // Width/height are viewport-bounded so the popout fits naturally at any zoom
            // (the simple-mode dialog fills the viewport, where a fixed 600×560 box would
            // swamp the whole screen). It never exceeds the usable area minus a small inset.
            width: `min(${DYNAMIC_OVERRIDES_PRESET_POPOVER_WIDTH_PX}px, calc(100vw - 32px))`,
            maxWidth: `calc(100vw - 32px)`,
            maxHeight: `calc(100vh - 32px)`,
            display: 'flex',
            flexDirection: 'column',
            p: 1.5,
            borderRadius: 1.5,
            // Subtle ring + soft shadow read as a floating card rather than a flat panel.
            border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
            backgroundImage: 'none',
          })}
        >
          {/* Title row: which set this is + when it was saved, so the popout is self-identifying.
              flexShrink: 0 keeps the header intact while the scroll body absorbs the squeeze. */}
          <Box sx={{ mb: 1, flexShrink: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {preset.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', opacity: 0.8 }}>
              {formatLocalDateTime(preset.savedAt) ?? preset.savedAt}
            </Typography>
          </Box>
          {/* A bolder rule (thicker + full-opacity divider colour) sets the header apart from the table. */}
          <Divider sx={{ mb: 1.25, borderBottomWidth: 2, borderColor: 'divider', opacity: 1, flexShrink: 0 }} />
          {/* Scroll area fills the remaining card height (flex:1 + minHeight:0 so it can shrink
              below the constant cap when the card is clamped to the viewport on a short/zoomed
              screen). Its own maxHeight still caps it on tall screens. */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ClippedScrollBody maxHeightPx={DYNAMIC_OVERRIDES_PRESET_POPOVER_MAX_HEIGHT_PX} overflowY="auto">
              <DynamicOverridesPresetSummaryTable lines={lines} />
            </ClippedScrollBody>
          </Box>
        </Paper>
      </Popper>
    </>
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
  const { note, presets, handleLoad, requestDelete, requestOverwrite, openSaveDialog } = controller
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
            onRequestOverwrite={requestOverwrite}
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
    overwriteTarget, closeOverwriteDialog, confirmOverwrite,
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

      {/* Overwrite-confirm dialog: replacing a set's stored selection is destructive, so confirm. */}
      <Dialog open={Boolean(overwriteTarget)} onClose={closeOverwriteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{t('noteDynamicOverridesPresetsOverwriteDialogTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('noteDynamicOverridesPresetsOverwriteDialogMessage', { name: overwriteTarget?.name ?? '' })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOverwriteDialog}>{t('cancel')}</Button>
          <Button onClick={confirmOverwrite} color="warning" variant="contained">
            {t('noteDynamicOverridesPresetsOverwriteButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
