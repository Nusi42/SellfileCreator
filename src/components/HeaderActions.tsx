import { useState, useRef, useCallback, useMemo, type Ref } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Typography } from '@mui/material'
import { keyframes } from '@emotion/react'
import type { MouseEvent } from 'react'
import { ACCEPT_SFC_FILE_DIALOG, ELLIPSIS_TEXT_SX, LONG_LABEL_BUTTON_MAX_WIDTH_PX } from '../lib/constants'
import FilePickerButton from './FilePickerButton'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import { useI18n, formatRecipesCount } from '../lib/i18n'
import DirtyBadge from './DirtyBadge'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { highlightElementKeyframes } from '../lib/attentionCatalog'
import nusiSfcRaw from '../../examples/example.sfc?raw'

// Glow-pulse keyframe: soft drop-shadow that fades in and out.
const sfcNudgeKf = keyframes`
  0%, 100% { filter: none; }
  50% { filter: drop-shadow(0 0 7px currentColor); }
`

// Fade-in keyframe for the floating tip.
const sfcNudgeTipKf = keyframes`
  from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  to   { opacity: 0.97; transform: translateX(-50%) translateY(0); }
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
    sfcLoadNudgeActive = false,
    sfcLoadNudgeFading = false,
    onSfcLoadNudgeDismiss,
  } = props
  const { t } = useI18n()

  const [sfcCtxMenu, setSfcCtxMenu] = useState<{ x: number; y: number } | null>(null)
  // Tracks whether the sample-load confirmation dialog is open.
  const [sampleConfirmOpen, setSampleConfirmOpen] = useState(false)
  // Cursor position for the "right-click for options" hover hint.
  const [sfcHintPos, setSfcHintPos] = useState<{ x: number; y: number } | null>(null)
  const sfcButtonRef = useRef<HTMLButtonElement>(null)
  const closeSfcMenu = useCallback(() => setSfcCtxMenu(null), [])
  const { menuRef: sfcMenuRef, contextMenuGuard: sfcGuard } = useContextMenuPaperGuard({
    open: sfcCtxMenu !== null,
    onClose: closeSfcMenu,
  })
  const { shouldShow: sfcHintShouldShow, markSeen: sfcHintMarkSeen } = useContextMenuHint('sfc.load')

  const recipeChipLabel = formatRecipesCount(
    t,
    count,
    selectedCount > 0 ? selectedCount : null,
    visibleCount,
  )
  const chipLabel = props.chipLabel ?? recipeChipLabel

  const handleLoadSample = useCallback(() => {
    setSampleConfirmOpen(false)
    const file = new File([nusiSfcRaw], 'example.sfc', { type: 'application/json' })
    void onSelectFile(file, { shiftKey: false })
  }, [onSelectFile])

  // Three arrows: all start from the same neon-yellow base but the slow rainbow-flash
  // cycle is staggered so each sits at a different hue at any given moment — gold,
  // magenta, cyan, etc., constantly drifting. A second catalog effect adds personality.
  const nudgeArrows = useMemo(() => {
    if (!sfcLoadNudgeActive) return []
    return [
      { stemHeight: 52, bounceDelay: '0.00s', hueDelay: '0.0s', extraKf: highlightElementKeyframes.shakeBlast, extraDur: '2.2s', extraDelay: '0.0s', rotation: '-28deg' },
      { stemHeight: 64, bounceDelay: '0.12s', hueDelay: '1.2s', extraKf: highlightElementKeyframes.bouncePop,  extraDur: '3.0s', extraDelay: '0.9s', rotation:   '0deg' },
      { stemHeight: 56, bounceDelay: '0.24s', hueDelay: '2.4s', extraKf: highlightElementKeyframes.explode,    extraDur: '2.5s', extraDelay: '0.5s', rotation:  '28deg' },
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
        <Box sx={(theme) => sfcLoadNudgeActive ? { position: 'relative', zIndex: theme.zIndex.tooltip + 1, animation: `${sfcNudgeKf} 1.4s ease-in-out 5`, flexShrink: 1, minWidth: 0 } : { flexShrink: 1, minWidth: 0 }}>
          <MarkdownTooltip markdown={t('loadRecipesTooltip')}>
            <FilePickerButton
              ref={sfcButtonRef}
              label={t('loadRecipes')}
              startIcon={<UploadFileIcon />}
              accept={ACCEPT_SFC_FILE_DIALOG}
              onBeforeOpen={(event) => { onAboutToOpenSfc?.(event) }}
              onSelect={onSelectFile}
              onContextMenu={(e) => {
                e.preventDefault()
                sfcHintMarkSeen()
                setSfcHintPos(null)
                onSfcLoadNudgeDismiss?.()
                setSfcCtxMenu({ x: e.clientX, y: e.clientY })
              }}
              onMouseEnter={(e) => { if (sfcHintShouldShow) setSfcHintPos({ x: e.clientX, y: e.clientY }) }}
              onMouseMove={(e) => { if (sfcHintShouldShow) setSfcHintPos({ x: e.clientX, y: e.clientY }) }}
              onMouseLeave={() => setSfcHintPos(null)}
              data-tour-id="sfc.load"
              labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
              sx={{ flexShrink: 1, minWidth: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX }}
            />
          </MarkdownTooltip>
          {/* 80s-ad arrows: row of chunky downward-pointing arrows above the button. */}
          {nudgeArrows.length > 0 && (
            <Box sx={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: '10px',
              pb: '3px',
              pointerEvents: 'none',
              // Fade-out overrides all child animations and brings opacity to 0.
              ...(sfcLoadNudgeFading ? { animation: `${sfcNudgeFadeOutKf} 0.7s ease-out forwards` } : {}),
            }}>
              {nudgeArrows.map((arrow) => (
                <Box
                  key={arrow.bounceDelay}
                  sx={{ rotate: arrow.rotation, transformOrigin: 'bottom center' }}
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
                    {/* Stem */}
                    <Box sx={{ width: '32px', height: `${arrow.stemHeight}px`, backgroundColor: '#FFE000', borderRadius: '5px 5px 0 0', boxShadow: '4px 4px 0 rgba(0,0,0,0.7)' }} />
                    {/* Head — extra-wide flat arrowhead */}
                    <Box sx={{ width: 0, height: 0, borderLeft: '42px solid transparent', borderRight: '42px solid transparent', borderTop: '30px solid #FFE000', filter: 'drop-shadow(4px 4px 0 rgba(0,0,0,0.7))' }} />
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          {/* Tip floats below the button via absolute positioning inside this position:relative wrapper. */}
          {sfcLoadNudgeActive && (
            <Box
              sx={(theme) => ({
                position: 'absolute',
                top: '100%',
                left: '50%',
                mt: '6px',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.94)' : 'rgba(255,255,255,0.97)',
                color: theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.text.primary,
                borderRadius: 999,
                padding: '8px 22px',
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: 0.3,
                boxShadow: theme.shadows[6],
                border: `2px solid ${theme.palette.divider}`,
                zIndex: theme.zIndex.tooltip + 1,
                backdropFilter: 'blur(6px)',
                animation: sfcLoadNudgeFading
                  ? `${sfcNudgeFadeOutKf} 0.7s ease-out forwards`
                  : `${sfcNudgeTipKf} 0.25s ease-out both, ${highlightElementKeyframes.rainbowFlash} 4s linear 0.3s infinite`,
              })}
            >
              {t('sfcLoadNudgeHint')}
            </Box>
          )}
        </Box>
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={sfcHintShouldShow ? sfcHintPos : null} />
        <Menu
          open={sfcCtxMenu !== null}
          onClose={closeSfcMenu}
          anchorReference="anchorPosition"
          {...(sfcCtxMenu ? { anchorPosition: { top: sfcCtxMenu.y, left: sfcCtxMenu.x } } : {})}
          slotProps={{
            paper: {
              ...buildContextMenuPaperSlotProps({
                component: ContextMenuPaper,
                contextMenuGuard: sfcGuard,
                onRequestClose: closeSfcMenu,
                closeLabel: t('close'),
              }),
              ref: sfcMenuRef as Ref<HTMLDivElement>,
            },
          }}
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
              setSampleConfirmOpen(true)
            }}
          >
            {t('loadSampleSfc')}
          </MenuItem>
        </Menu>
        <Dialog open={sampleConfirmOpen} onClose={() => setSampleConfirmOpen(false)}>
          <DialogTitle>{t('loadSampleSfcConfirmTitle')}</DialogTitle>
          <DialogContent>
            <Typography>{t('loadSampleSfcConfirmMessage')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSampleConfirmOpen(false)}>{t('cancel')}</Button>
            <Button variant="contained" onClick={handleLoadSample}>{t('loadSampleSfcConfirmOk')}</Button>
          </DialogActions>
        </Dialog>
        <DirtyBadge active={sfcDirty} sx={{ flexShrink: 1, minWidth: 0, display: 'inline-flex' }}>
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
