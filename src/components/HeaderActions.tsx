import { useState, useRef, useCallback } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Typography } from '@mui/material'
import { keyframes } from '@emotion/react'
import type { MouseEvent } from 'react'
import { ACCEPT_SFC_FILE_DIALOG, BUILDER_SECTION_GRID_BADGE_PAD_PX, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX, SPLIT_BUTTON_MAIN_SX, SPLIT_BUTTON_CHEVRON_SX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { useI18n, formatRecipesCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'
import SfcNudgeArrows from './SfcNudgeArrows'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import { buildDirtyTooltip } from '../lib/dateDisplay'
import beginnerSfcRaw from '../../presets/beginner.sfc?raw'
import lategameSfcRaw from '../../presets/lategame.sfc?raw'

// Glow-pulse keyframe: soft drop-shadow that fades in and out.
const sfcNudgeKf = keyframes`
  0%, 100% { filter: none; }
  50% { filter: drop-shadow(0 0 7px currentColor); }
`

export default function HeaderActions(props: {
  onAboutToOpenSfc?: (event: MouseEvent<HTMLButtonElement>) => void
  onSelectFile: (file: File, context?: { shiftKey?: boolean }) => void
  onSaveSfc: () => void
  onOpenNote: () => void
  notePresent: boolean
  count: number
  selectedCount: number
  visibleCount: number
  sfcDirty: boolean
  // Timestamp (ms) when the current unsaved state began; drives the badge tooltip
  // and the dot's staleness ramp.
  sfcDirtySince?: number | null
  // Current time from the owner's staleness tick, so the dot's colour and the
  // tooltip's elapsed span advance together off one clock.
  stalenessNow?: number
  chipLabel?: string
  sfcLoadNudgeActive?: boolean
  sfcLoadNudgeFading?: boolean
  onSfcLoadNudgeDismiss?: () => void
}) {
  const {
    onAboutToOpenSfc,
    onSelectFile,
    onSaveSfc,
    onOpenNote,
    notePresent,
    count,
    selectedCount,
    visibleCount,
    sfcDirty,
    sfcDirtySince,
    stalenessNow,
    sfcLoadNudgeActive = false,
    sfcLoadNudgeFading = false,
    onSfcLoadNudgeDismiss,
  } = props
  const { t } = useI18n()
  // Localized tooltip for the save badge dot — leads with the elapsed span once the
  // document leaves the fresh tier, so the state is never carried by colour alone.
  const sfcDirtyTooltip = buildDirtyTooltip(sfcDirtySince, t, stalenessNow)

  // Anchor for the SFC load menu — opened by the chevron (and by the first
  // left-click of the main button each page load, see handleSfcBeforeOpen).
  const [sfcMenuAnchor, setSfcMenuAnchor] = useState<HTMLElement | null>(null)
  // Tracks which preset the user clicked — null means no confirm dialog is open.
  const [pendingPreset, setPendingPreset] = useState<{ raw: string; filename: string } | null>(null)
  const sfcButtonRef = useRef<HTMLButtonElement>(null)
  const sfcChevronRef = useRef<HTMLButtonElement | null>(null)
  // Anchors the nudge fan when it points at Save (the arrows are portalled, so they
  // need a real element to measure rather than a positioned ancestor).
  const sfcSaveRef = useRef<HTMLDivElement | null>(null)
  // In-memory (per page load) guard: the first left-click on the main button
  // opens the menu instead of the file dialog, so presets are discoverable.
  const sfcFirstClickConsumedRef = useRef(false)
  const closeSfcMenu = useCallback(() => setSfcMenuAnchor(null), [])

  const recipeChipLabel = formatRecipesCount(
    t,
    count,
    selectedCount > 0 ? selectedCount : null,
    visibleCount,
  )
  const chipLabel = props.chipLabel ?? recipeChipLabel

  // First left-click each page load opens the menu (returns true to veto the
  // file dialog); every later click falls through and opens the picker directly.
  const handleSfcBeforeOpen = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    onAboutToOpenSfc?.(event)
    // Any click dismisses the arrows nudge regardless of which path we take.
    onSfcLoadNudgeDismiss?.()
    if (sfcFirstClickConsumedRef.current) return false
    sfcFirstClickConsumedRef.current = true
    setSfcMenuAnchor(event.currentTarget)
    return true
  }, [onAboutToOpenSfc, onSfcLoadNudgeDismiss])

  const handleLoadPreset = useCallback(() => {
    if (!pendingPreset) return
    setPendingPreset(null)
    const file = new File([pendingPreset.raw], pendingPreset.filename, { type: 'application/json' })
    void onSelectFile(file, { shiftKey: false })
  }, [pendingPreset, onSelectFile])

  // Which control the arrows point at. The two nudges are MUTUALLY EXCLUSIVE by
  // logic, not by a flag: a dirty document has unsaved user work (→ Save), while
  // the Load nudge is only ever raised for a document that is empty or still
  // matches a bundled preset (→ Load). Those cannot both hold, so one derived
  // target can serve both cases and the arrows can never point two ways at once.
  const nudgeTarget: 'save' | 'load' | null = !sfcLoadNudgeActive
    ? null
    : sfcDirty ? 'save' : 'load'


  return (
    <Box
      sx={{
        mt: 2,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 1.5,
        minHeight: 32,
      }}
    >
      <Box sx={{ minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
        <EllipsisTooltip title={notePresent ? t('noteOpen') : t('addNote')}>
          <Button
            variant="outlined"
            size="small"
            onClick={onOpenNote}
            sx={{
              maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX,
              overflow: 'hidden',
              minWidth: 0,
              whiteSpace: 'nowrap',
            }}
            data-tour-id="note.toggle"
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
              {notePresent ? t('noteOpen') : t('addNote')}
            </Typography>
          </Button>
        </EllipsisTooltip>
      </Box>
      <Box
        sx={{
          justifySelf: 'center',
          pointerEvents: 'none',
        }}
      >
        <Chip
          label={chipLabel}
          size="small"
          sx={{
            width: '100%',
            maxWidth: 'min(100%, 640px)',
            '& .MuiChip-label': {
              display: 'block',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          }}
        />
      </Box>
      <Box
        sx={{
          minWidth: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          alignItems: 'center',
          // Same overflowX:'clip' trick as the builder's toggle-button grid: the dirty-badge
          // dot deliberately overhangs the Save button's top-right corner (top/right: -3), and
          // without the clip that overhang lands in the builder column's scrollable overflow
          // and raises a horizontal scrollbar the moment the document goes dirty.
          // overflowY stays visible so the dot is not cut off at the top.
          overflowX: 'clip',
          // Move the clip edge past the dot's intentional overhang so it still paints in full
          // (SSOT: BUILDER_SECTION_GRID_BADGE_PAD_PX, shared with both builder grids).
          pr: `${BUILDER_SECTION_GRID_BADGE_PAD_PX}px`,
        }}
      >
        {/* Glow-pulse wrapper: animates the button for ~7 s while the nudge points here. */}
        <Box sx={(theme) => nudgeTarget === 'load' ? { position: 'relative', zIndex: theme.zIndex.tooltip + 1, animation: `${sfcNudgeKf} 1.4s ease-in-out 5`, flexShrink: 1, minWidth: 0 } : { position: 'relative', flexShrink: 1, minWidth: 0 }}>
          {/* Split control: main Load button + attached chevron that opens the preset
              menu. A flex row with a 1px gap (not ButtonGroup) keeps the theme's
              contained/primary button styling on both halves; the gap reads as a seam. */}
          <Box sx={{ display: 'inline-flex', gap: '1px', flexShrink: 1, minWidth: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX }}>
            <MarkdownTooltip markdown={t('loadRecipesTooltip')}>
              <FilePickerButton
                ref={sfcButtonRef}
                label={t('loadRecipes')}
                startIcon={<UploadFileIcon />}
                accept={ACCEPT_SFC_FILE_DIALOG}
                onBeforeOpen={handleSfcBeforeOpen}
                onSelect={onSelectFile}
                data-tour-id="sfc.load"
                labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
                sx={{ flexShrink: 1, minWidth: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, ...SPLIT_BUTTON_MAIN_SX }}
              />
            </MarkdownTooltip>
            {/* Chevron opens the same menu (load-from-file / presets); no right-click anymore. */}
            <Button
              ref={sfcChevronRef}
              aria-label={t('loadRecipesMoreOptions')}
              aria-haspopup="menu"
              onClick={() => {
                onSfcLoadNudgeDismiss?.()
                // Opening the menu explicitly counts as consuming the first-click
                // guard, so the main button opens the file dialog directly after.
                sfcFirstClickConsumedRef.current = true
                setSfcMenuAnchor(sfcChevronRef.current)
              }}
              sx={SPLIT_BUTTON_CHEVRON_SX}
            >
              <ArrowDropDownIcon fontSize="small" />
            </Button>
          </Box>
          {/* 80s-ad arrows, pointing at the chevron (the preset menu) when the nudge
              is asking the user to LOAD something. The identical fan is rendered on the
              Save button below when the nudge is instead asking them to save. */}
          <SfcNudgeArrows
            active={nudgeTarget === 'load'}
            fading={sfcLoadNudgeFading}
            targetRef={sfcChevronRef}
          />
        </Box>
        <Menu
          anchorEl={sfcMenuAnchor}
          open={Boolean(sfcMenuAnchor)}
          onClose={closeSfcMenu}
        >
          <MenuItem
            onClick={() => {
              closeSfcMenu()
              sfcButtonRef.current?.click()
            }}
          >
            {t('loadSfcFromFile')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeSfcMenu()
              setPendingPreset({ raw: beginnerSfcRaw, filename: 'beginner.sfc' })
            }}
          >
            {t('loadPresetBeginner')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              closeSfcMenu()
              setPendingPreset({ raw: lategameSfcRaw, filename: 'lategame.sfc' })
            }}
          >
            {t('loadPresetMidToEndGame')}
          </MenuItem>
        </Menu>
        <Dialog open={pendingPreset !== null} onClose={() => setPendingPreset(null)}>
          <DialogTitle>{t('loadPresetConfirmTitle')}</DialogTitle>
          <DialogContent>
            <Typography>{t('loadPresetConfirmMessage')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPendingPreset(null)}>{t('cancel')}</Button>
            <Button variant="contained" onClick={handleLoadPreset}>{t('loadPresetConfirmOk')}</Button>
          </DialogActions>
        </Dialog>
        {/* Mirror of the Load control's wrapper: positions the nudge fan over Save and
            glows the button while the nudge is pointing here. */}
        <Box ref={sfcSaveRef} sx={(theme) => nudgeTarget === 'save' ? { position: 'relative', zIndex: theme.zIndex.tooltip + 1, animation: `${sfcNudgeKf} 1.4s ease-in-out 5`, flexShrink: 1, minWidth: 0, display: 'inline-flex' } : { position: 'relative', flexShrink: 1, minWidth: 0, display: 'inline-flex' }}>
        <DirtyBadge
          active={sfcDirty}
          tooltip={sfcDirtyTooltip}
          dirtySince={sfcDirtySince}
          now={stalenessNow}
          sx={{ flexShrink: 1, minWidth: 0, display: 'inline-flex' }}
        >
          <MarkdownTooltip markdown={t('saveAllRecipesTooltip')}>
            <Button
              startIcon={<SaveIcon />}
              onClick={onSaveSfc}
              disabled={false}
              data-tour-id="sfc.save"
              sx={{ maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden', flexShrink: 1, minWidth: 0 }}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX} data-ellipsis-target>
                {t('saveAllRecipes')}
              </Typography>
            </Button>
          </MarkdownTooltip>
        </DirtyBadge>
          {/* Same fan as the Load control; centred on this button rather than a chevron. */}
          <SfcNudgeArrows
            active={nudgeTarget === 'save'}
            fading={sfcLoadNudgeFading}
            targetRef={sfcSaveRef}
          />
        </Box>
      </Box>
    </Box>
  )
}
