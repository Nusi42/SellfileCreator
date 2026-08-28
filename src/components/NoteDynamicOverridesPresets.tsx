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
 *
 * The same section also offers file backup: "Export All to File" writes every saved
 * set as one JSON document, and "Import from File" merges a document back in. The
 * file format lives in lib/dynamicOverridesPresetFile.ts; import never replaces an
 * existing set (exact duplicates are skipped, colliding names are suffixed), so a
 * backup can never cost user data.
 */
import React from 'react'
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Paper, Popper, Stack, TextField, Tooltip, Typography, Button, Divider } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CasinoIcon from '@mui/icons-material/Casino'
import { useI18n, type I18nKey } from '../lib/i18n'
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
  getDynamicOverridesPresetsSnapshot,
  useDynamicOverridesPresetsPreference,
  type DynamicOverridesPreset,
} from '../state/dynamicOverridesPresetsPreference'
import { createPresetId, sanitizePresetName } from '../state/presetUtils'
import {
  DYNAMIC_OVERRIDES_PRESET_FILE_ACCEPT,
  dynamicOverridesPresetFileToBlob,
  dynamicOverridesPresetFilename,
  mergeImportedDynamicOverridesPresets,
  parseDynamicOverridesPresetFile,
  type DynamicOverridesPresetFileErrorReason,
} from '../lib/dynamicOverridesPresetFile'
import { generateMetasetNameWithFlag } from '../lib/namegen'
import { legendaryGlow } from '../lib/celebrationKeyframes'
import {
  buildDynamicOverridesPresetSummary,
  resolveDynamicOverridesPresetApply,
  snapshotDynamicOverridesFullSelection,
  snapshotDynamicOverridesLabels,
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
  reshuffleSaveName: () => void
  saveFun: boolean
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
  // File backup wiring: download every saved set, or merge a previously exported file.
  exportToFile: () => void
  importFromFile: (file: File) => void
  // Ref for the hidden file input (rendered by the dialogs component) and the opener
  // the menu entry calls — the input must live outside the menu to survive its unmount.
  importInputRef: React.RefObject<HTMLInputElement | null>
  openImportPicker: () => void
  // Post-import report (null when no report is pending) — success counts or a failure reason.
  importReport: DynamicOverridesPresetImportReport | null
  closeImportReport: () => void
}

/** What the import produced, shown in a small confirmation dialog after the merge. */
export type DynamicOverridesPresetImportReport =
  | { ok: true; added: number; renamed: number; skipped: number; duplicates: number }
  | { ok: false; reason: DynamicOverridesPresetFileErrorReason }

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
  // Brief celebratory glow when the generator produces a playful name.
  const [saveFun, setSaveFun] = React.useState(false)
  React.useEffect(() => {
    if (!saveFun) return
    const id = window.setTimeout(() => setSaveFun(false), 1600)
    return () => clearTimeout(id)
  }, [saveFun])
  // Delete-confirm target (null when closed).
  const [deleteTarget, setDeleteTarget] = React.useState<DynamicOverridesPreset | null>(null)
  // Overwrite-confirm target (null when closed): the existing set to replace with the live selection.
  const [overwriteTarget, setOverwriteTarget] = React.useState<DynamicOverridesPreset | null>(null)
  // Active UI language — used to capture human-readable labels at save/overwrite time.
  const { lang } = useI18n()

  // Open the save dialog with a generated name suggestion after the host menu closes.
  const openSaveDialog = React.useCallback(() => {
    onCloseMenu()
    const { name, isFun } = generateMetasetNameWithFlag(presets.map((p) => p.name))
    setSaveName(name)
    if (isFun) setSaveFun(true)
    setSaveOpen(true)
  }, [onCloseMenu, presets])

  // Re-roll the name suggestion without closing the dialog.
  const reshuffleSaveName = React.useCallback(() => {
    const { name, isFun } = generateMetasetNameWithFlag(presets.map((p) => p.name))
    setSaveName(name)
    if (isFun) setSaveFun(true)
  }, [presets])
  const closeSaveDialog = React.useCallback(() => setSaveOpen(false), [])

  // Persist the current selections under the entered name. We snapshot the FULL resolved
  // selection (defaults merged in) — not the lean live map — so the saved set reproduces
  // the same outcome even if the note's defaults change later. Resolution uses the shared
  // resolver, so the values are identical to the live selection. Human-readable labels are
  // captured alongside the answer maps so the flyout can show them if a question disappears.
  const confirmSave = React.useCallback(() => {
    const name = sanitizePresetName(saveName)
    if (!name) return
    const full = snapshotDynamicOverridesFullSelection(note, recipeAnswers, safeguardAnswers)
    const labels = snapshotDynamicOverridesLabels(note, recipeAnswers, safeguardAnswers, lang)
    const preset: DynamicOverridesPreset = {
      id: createPresetId(),
      name,
      savedAt: new Date().toISOString(),
      recipeAnswers: full.recipeAnswers,
      safeguardAnswers: full.safeguardAnswers,
      savedLabels: labels,
    }
    // Newest first, matching the filter/sort preset ordering.
    setPresets((prev) => [preset, ...(Array.isArray(prev) ? prev : [])])
    setSaveOpen(false)
  }, [note, lang, saveName, recipeAnswers, safeguardAnswers, setPresets])

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
  // rule as confirmSave), keeping its id + name and bumping the saved timestamp. Labels are
  // refreshed too so the flyout reflects the overwritten state's question/option text.
  const confirmOverwrite = React.useCallback(() => {
    setOverwriteTarget((target) => {
      if (target) {
        const full = snapshotDynamicOverridesFullSelection(note, recipeAnswers, safeguardAnswers)
        const labels = snapshotDynamicOverridesLabels(note, recipeAnswers, safeguardAnswers, lang)
        const updated: DynamicOverridesPreset = {
          ...target,
          savedAt: new Date().toISOString(),
          recipeAnswers: full.recipeAnswers,
          safeguardAnswers: full.safeguardAnswers,
          savedLabels: labels,
        }
        setPresets((prev) => (Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? updated : p)) : []))
      }
      return null
    })
  }, [note, lang, recipeAnswers, safeguardAnswers, setPresets])

  // ---------------------------------------------------------------------------
  // File backup: export all sets / import a previously exported file
  // ---------------------------------------------------------------------------

  // Report shown after an import attempt (counts on success, a reason on failure).
  const [importReport, setImportReport] = React.useState<DynamicOverridesPresetImportReport | null>(null)
  const closeImportReport = React.useCallback(() => setImportReport(null), [])

  // Write every saved set to one JSON file. Same anchor-click download the SFC save uses.
  const exportToFile = React.useCallback(() => {
    onCloseMenu()
    // Nothing saved yet: the menu entry is disabled, but guard so a stray call is a no-op.
    if (presets.length === 0) return
    const blob = dynamicOverridesPresetFileToBlob(presets)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = dynamicOverridesPresetFilename()
    anchor.click()
    // Release the object URL immediately — the click has already handed the blob to the browser.
    URL.revokeObjectURL(url)
  }, [onCloseMenu, presets])

  // The hidden <input type="file"> lives in the dialogs component; the menu entry
  // reaches it through this ref so closing the menu cannot cancel the chooser.
  const importInputRef = React.useRef<HTMLInputElement | null>(null)
  const openImportPicker = React.useCallback(() => {
    onCloseMenu()
    // Click after the menu-close commit so the input is definitely still mounted.
    importInputRef.current?.click()
  }, [onCloseMenu])

  // Read a picked file and merge its sets in. Never replaces: exact duplicates are
  // skipped and a colliding name with different content is suffixed.
  const importFromFile = React.useCallback((file: File) => {
    onCloseMenu()
    void file.text().then((text) => {
      const parsed = parseDynamicOverridesPresetFile(text)
      if (!parsed.ok) { setImportReport({ ok: false, reason: parsed.reason }); return }
      // Merge against the store snapshot (not the render-time `presets`) so a set saved
      // while the file was being read is still counted. Reading the snapshot rather than
      // merging inside the updater keeps the merge a single pure evaluation, so the
      // renamed/added counts we report cannot be skewed by a double-invoked updater.
      const merged = mergeImportedDynamicOverridesPresets(getDynamicOverridesPresetsSnapshot(), parsed.presets)
      setPresets(merged.presets)
      setImportReport({
        ok: true,
        added: merged.added,
        renamed: merged.renamed,
        skipped: parsed.skipped,
        duplicates: merged.duplicates,
      })
    }).catch(() => {
      // Read failure (permissions, unreadable media) reads the same as a bad file to the user.
      setImportReport({ ok: false, reason: 'unreadable' })
    })
  }, [onCloseMenu, setPresets])

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
    reshuffleSaveName,
    saveFun,
    closeSaveDialog,
    confirmSave,
    deleteTarget,
    closeDeleteDialog,
    confirmDelete,
    overwriteTarget,
    closeOverwriteDialog,
    confirmOverwrite,
    exportToFile,
    importFromFile,
    importInputRef,
    openImportPicker,
    importReport,
    closeImportReport,
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
  const { t, lang } = useI18n()
  // Resolve the per-set summary against the current note (display text + fallback flags).
  // Pass the active language so question/option labels render in the UI locale, not always English.
  const { lines, hasAnyFallback, unavailableLines } = React.useMemo(
    () => buildDynamicOverridesPresetSummary(note, preset.recipeAnswers, preset.safeguardAnswers, lang, preset.savedLabels),
    [note, preset, lang],
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
              <DynamicOverridesPresetSummaryTable lines={lines} unavailableLines={unavailableLines} />
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
  // openImportPicker opens the native chooser through the controller's input ref. The
  // input itself lives in <DynamicOverridesPresetDialogs>, outside the menu: the menu
  // unmounts on click, which would cancel a chooser opened from within it.
  const {
    note, presets, handleLoad, requestDelete, requestOverwrite, openSaveDialog,
    exportToFile, openImportPicker,
  } = controller
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
      {/* File backup: one document holds every saved set, so a user can move their
          sets between machines or keep them across a browser-storage reset. */}
      <Divider sx={{ my: 0.5 }} />
      <MenuItem onClick={exportToFile} disabled={presets.length === 0} sx={{ gap: 0.75 }}>
        <FileDownloadIcon fontSize="small" />
        {t('noteDynamicOverridesPresetsExportFile')}
      </MenuItem>
      <MenuItem onClick={openImportPicker} sx={{ gap: 0.75 }}>
        <FileUploadIcon fontSize="small" />
        {t('noteDynamicOverridesPresetsImportFile')}
      </MenuItem>
    </>
  )
}

/** Map an import failure reason to its catalog key — one definition for the dialog. */
function importFailureMessageKey(reason: DynamicOverridesPresetFileErrorReason | undefined): I18nKey {
  // 'empty' means the document parsed but held no usable set; the others mean wrong file.
  if (reason === 'empty') return 'noteDynamicOverridesPresetsImportEmpty'
  if (reason === 'wrongKind') return 'noteDynamicOverridesPresetsImportWrongKind'
  return 'noteDynamicOverridesPresetsImportUnreadable'
}

/**
 * The save-name + delete-confirm dialogs, the import-report dialog, and the hidden
 * file input — all rendered OUTSIDE the menu so they persist after the menu (and its
 * children) unmount on close. The input in particular must outlive the menu: the
 * native chooser is cancelled if the element that opened it is removed.
 */
export function DynamicOverridesPresetDialogs({ controller }: { controller: DynamicOverridesPresetController }) {
  const { t } = useI18n()
  const {
    saveOpen, saveName, setSaveName, reshuffleSaveName, saveFun, closeSaveDialog, confirmSave,
    deleteTarget, closeDeleteDialog, confirmDelete,
    overwriteTarget, closeOverwriteDialog, confirmOverwrite,
    importInputRef, importFromFile, importReport, closeImportReport,
  } = controller
  const saveNameRef = React.useRef<HTMLInputElement>(null)
  return (
    <>
      {/* Save-name dialog. */}
      <Dialog
        open={saveOpen}
        onClose={closeSaveDialog}
        maxWidth="xs"
        fullWidth
        // The dialog pre-fills a generated name; once the open transition completes and the field
        // is focused, select all so the user can type over it immediately. Matches the dice button.
        slotProps={{ transition: { onEntered: () => saveNameRef.current?.select() } }}
      >
        <DialogTitle>{t('noteDynamicOverridesPresetsSaveDialogTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('noteDynamicOverridesPresetsSaveDialogHelper')}
            </Typography>
            {/* Glow wrapper for isFun names; dice end-adornment rolls a fresh suggestion on demand. */}
            <Box sx={{ borderRadius: 1, ...(saveFun && { animation: `${legendaryGlow} 1400ms ease-out` }) }}>
            <TextField
              autoFocus
              fullWidth
              label={t('noteDynamicOverridesPresetsNameLabel')}
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') confirmSave() }}
              slotProps={{
                htmlInput: { maxLength: 80, ref: saveNameRef },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <IconButton
                        size="small"
                        tabIndex={-1}
                        edge="start"
                        title={t('presetSuggestName')}
                        onClick={() => {
                          reshuffleSaveName()
                          const el = saveNameRef.current
                          window.setTimeout(() => el?.select(), 0)
                        }}
                      >
                        <CasinoIcon fontSize="inherit" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            </Box>
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

      {/* Hidden file input backing "Import from File". Resetting value on every change
          lets the user re-pick the same file after a failed import. */}
      <input
        ref={importInputRef}
        type="file"
        accept={DYNAMIC_OVERRIDES_PRESET_FILE_ACCEPT}
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Clear first so picking the same path again still fires a change event.
          event.target.value = ''
          if (file) importFromFile(file)
        }}
      />

      {/* Import report: what the merge added/renamed/skipped, or why the file was rejected. */}
      <Dialog open={Boolean(importReport)} onClose={closeImportReport} maxWidth="xs" fullWidth>
        <DialogTitle>
          {importReport?.ok
            ? t('noteDynamicOverridesPresetsImportDoneTitle')
            : t('noteDynamicOverridesPresetsImportFailedTitle')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2">
              {importReport?.ok
                // Nothing added because every set was already held: say that plainly
                // instead of reporting "Added 0", which reads like a failure.
                ? (importReport.added === 0 && importReport.duplicates > 0
                  ? t('noteDynamicOverridesPresetsImportAllDuplicates')
                  : t('noteDynamicOverridesPresetsImportDoneMessage', { count: importReport.added }))
                : t(importFailureMessageKey(importReport?.reason))}
            </Typography>
            {/* Duplicates are reported only when some were also added — otherwise the
                headline above already says everything was a duplicate. */}
            {importReport?.ok && importReport.duplicates > 0 && importReport.added > 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('noteDynamicOverridesPresetsImportDuplicates', { count: importReport.duplicates })}
              </Typography>
            ) : null}
            {/* Renamed/skipped are reported only when they happened, so the common
                case stays a single clear line. */}
            {importReport?.ok && importReport.renamed > 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('noteDynamicOverridesPresetsImportRenamed', { count: importReport.renamed })}
              </Typography>
            ) : null}
            {importReport?.ok && importReport.skipped > 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('noteDynamicOverridesPresetsImportSkipped', { count: importReport.skipped })}
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeImportReport} variant="contained">{t('close')}</Button>
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
