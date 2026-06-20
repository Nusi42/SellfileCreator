import { useState, useRef, useCallback, useMemo } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Typography } from '@mui/material'
import { keyframes } from '@emotion/react'
import type { MouseEvent } from 'react'
import { ACCEPT_SFC_FILE_DIALOG, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX, SFC_NUDGE_FADE_OUT_MS, SPLIT_BUTTON_MAIN_SX, SPLIT_BUTTON_CHEVRON_SX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { useI18n, formatRecipesCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import { highlightElementKeyframes } from '../lib/attentionCatalog'
import { buildDirtyTooltip } from '../lib/dateDisplay'
import beginnerSfcRaw from '../../presets/beginner.sfc?raw'
import lategameSfcRaw from '../../presets/lategame.sfc?raw'

// Fade-out duration (s) for the nudge arrows, derived from the SSOT ms constant
// so the CSS animation and the DOM-removal timer in the tutorial hook agree.
const SFC_NUDGE_FADE_OUT_S = `${SFC_NUDGE_FADE_OUT_MS / 1000}s`

// Glow-pulse keyframe: soft drop-shadow that fades in and out.
const sfcNudgeKf = keyframes`
  0%, 100% { filter: none; }
  50% { filter: drop-shadow(0 0 7px currentColor); }
`

// 80s-advertisement bounce: snappy up-down with a double-tap at the top.
const arrowBounceKf = keyframes`
  0%   { transform: translateY(0); }
  25%  { transform: translateY(-18px); }
  45%  { transform: translateY(-8px); }
  60%  { transform: translateY(-15px); }
  80%  { transform: translateY(-3px); }
  100% { transform: translateY(0); }
`

// Fade-out used when the nudge timer expires.
const sfcNudgeFadeOutKf = keyframes`
  from { opacity: 1; }
  to   { opacity: 0; }
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
  // Timestamp (ms) when the current unsaved state began; drives the badge tooltip.
  sfcDirtySince?: number | null
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
    sfcLoadNudgeActive = false,
    sfcLoadNudgeFading = false,
    onSfcLoadNudgeDismiss,
  } = props
  const { t } = useI18n()
  // Localized "not saved since <time>" tooltip for the save badge dot.
  const sfcDirtyTooltip = buildDirtyTooltip(sfcDirtySince, t)

  // Anchor for the SFC load menu — opened by the chevron (and by the first
  // left-click of the main button each page load, see handleSfcBeforeOpen).
  const [sfcMenuAnchor, setSfcMenuAnchor] = useState<HTMLElement | null>(null)
  // Tracks which preset the user clicked — null means no confirm dialog is open.
  const [pendingPreset, setPendingPreset] = useState<{ raw: string; filename: string } | null>(null)
  const sfcButtonRef = useRef<HTMLButtonElement>(null)
  const sfcChevronRef = useRef<HTMLButtonElement | null>(null)
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

  // Three arrows: all start from the same neon-yellow base but the slow rainbow-flash
  // cycle is staggered so each sits at a different hue at any given moment — gold,
  // magenta, cyan, etc., constantly drifting. A second catalog effect adds personality.
  // The arrows fan out (±22°) but their TIPS all converge on the chevron (see the
  // render block) — the centre arrow is shorter so the two side arrows frame it.
  const nudgeArrows = useMemo(() => {
    if (!sfcLoadNudgeActive) return []
    return [
      { stemHeight: 66, bounceDelay: '0.00s', hueDelay: '0.0s', extraKf: highlightElementKeyframes.shakeBlast, extraDur: '2.2s', extraDelay: '0.0s', rotation: '-22deg' },
      { stemHeight: 54, bounceDelay: '0.12s', hueDelay: '1.2s', extraKf: highlightElementKeyframes.bouncePop,  extraDur: '3.0s', extraDelay: '0.9s', rotation:   '0deg' },
      { stemHeight: 66, bounceDelay: '0.24s', hueDelay: '2.4s', extraKf: highlightElementKeyframes.explode,    extraDur: '2.5s', extraDelay: '0.5s', rotation:  '22deg' },
    ]
  }, [sfcLoadNudgeActive])


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
        }}
      >
        {/* Glow-pulse wrapper: animates the button for ~7 s after first-run nudge fires. */}
        <Box sx={(theme) => sfcLoadNudgeActive ? { position: 'relative', zIndex: theme.zIndex.tooltip + 1, animation: `${sfcNudgeKf} 1.4s ease-in-out 5`, flexShrink: 1, minWidth: 0 } : { position: 'relative', flexShrink: 1, minWidth: 0 }}>
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
          {/* 80s-ad arrows: a fan of chunky arrows whose tips all CONVERGE on the chevron.
              Each arrow is absolutely positioned at the same anchor point (the chevron's
              centre) and rotated about its own tip (bottom centre), so tilting fans the
              tails outward while every tip stays pinned to that one point. */}
          {nudgeArrows.length > 0 && (
            <Box sx={{
              position: 'absolute',
              bottom: '100%',
              // Anchor the shared convergence point over the chevron centre: the chevron
              // is the rightmost element, so half its width in from the right edge.
              right: '12px',
              width: 0,
              pb: '3px',
              pointerEvents: 'none',
              // Fade-out overrides all child animations and brings opacity to 0.
              ...(sfcLoadNudgeFading ? { animation: `${sfcNudgeFadeOutKf} ${SFC_NUDGE_FADE_OUT_S} ease-out forwards` } : {}),
            }}>
              {nudgeArrows.map((arrow) => (
                <Box
                  key={arrow.bounceDelay}
                  sx={{
                    // Stack every arrow on the shared anchor; the column is centred on it
                    // (translateX(-50%)) and rotates about its bottom tip so all tips meet.
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    transform: `translateX(-50%) rotate(${arrow.rotation})`,
                    transformOrigin: 'bottom center',
                  }}
                >
                  {/* Inner box handles all animation; outer box holds the static fan rotation. */}
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    animation: sfcLoadNudgeFading
                      ? 'none'
                      : `${arrowBounceKf} 0.5s ease-in-out ${arrow.bounceDelay} infinite, ${highlightElementKeyframes.rainbowFlash} 3.6s linear ${arrow.hueDelay} infinite, ${arrow.extraKf} ${arrow.extraDur} ease-in-out ${arrow.extraDelay} infinite`,
                  }}>
                    {/* Stem — slimmed so the fan reads as a pointer at the chevron, not a banner. */}
                    <Box sx={{ width: '16px', height: `${arrow.stemHeight}px`, backgroundColor: '#FFE000', borderRadius: '4px 4px 0 0', boxShadow: '3px 3px 0 rgba(0,0,0,0.7)' }} />
                    {/* Head — narrow flat arrowhead. */}
                    <Box sx={{ width: 0, height: 0, borderLeft: '22px solid transparent', borderRight: '22px solid transparent', borderTop: '24px solid #FFE000', filter: 'drop-shadow(3px 3px 0 rgba(0,0,0,0.7))' }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
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
        <DirtyBadge active={sfcDirty} tooltip={sfcDirtyTooltip} sx={{ flexShrink: 1, minWidth: 0, display: 'inline-flex' }}>
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
      </Box>
    </Box>
  )
}
