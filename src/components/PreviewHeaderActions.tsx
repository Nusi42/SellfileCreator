import React from 'react'
import { Box, Button, Chip, Stack, Tooltip, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import TuneIcon from '@mui/icons-material/Tune'
import { ELLIPSIS_TEXT_SX, FINAL_SELL_BUTTON_WIDTH_PX, LONG_LABEL_BUTTON_MAX_WIDTH_PX, SMALL_BUTTON_HEIGHT_PX, CLEAR_ICON_BUTTON_SIZE_PX, FILTER_HEADER_LABEL_MAX_WIDTH_PX, FILTER_HEADER_CONTAINER_MAX_WIDTH_PX } from '../lib/constants'
import { ACCEPT_HSF } from '../lib/constants'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import FilePickerButton from './FilePickerButton'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { getHighlightEffectSx, pickHighlightEffect, HIGHLIGHT_EFFECT_DURATION_MS } from './highlightEffects'
import ClearIconButton from './ClearIconButton'
import DirtyBadge from './DirtyBadge'
import type { FinalSellRemainderConfig } from '../lib/finalSell'

const EXPORT_HOVER_DELAY_MS = 2000 as const
const HIGHLIGHT_REPLAY_DELAY_MS = 500 as const

export default function PreviewHeaderActions(props: {
  mergedCount: number
  filteredCount?: number
  filterActive?: boolean
  onToggleFilter?: () => void
  onSelectHsf: (file: File) => void | Promise<void>
  onClearBase: () => void
  baseRuleCount?: number
  onExport: () => void
  exportDisabled: boolean
  pushEndpoint?: string
  hsfDirty: boolean
  // Final sell remainder controls
  finalSell: FinalSellRemainderConfig
  onToggleFinalSell: (enabled: boolean) => void
  onOpenFinalSellDialog: () => void
  onOpenRuleTester?: () => void
}) {
  const { mergedCount, filteredCount, filterActive, onToggleFilter, onSelectHsf, onClearBase, baseRuleCount, onExport, exportDisabled, pushEndpoint, finalSell, onToggleFinalSell, onOpenFinalSellDialog, onOpenRuleTester, hsfDirty } = props
  const fsEnabled = (finalSell.artifacts || finalSell.accessories) && (finalSell.levels?.length ?? 0) > 0
  const { t } = useI18n()
  const mergedCountLabel = formatRulesCount(t, mergedCount)
  const rulesChipLabel = filterActive && typeof filteredCount === 'number'
    ? `${formatRulesCount(t, filteredCount)} / ${mergedCountLabel}`
    : mergedCountLabel
  const filterLabel = filterActive ? t('filtersOn') : t('filtersOff')
  const ruleTesterLabel = t('testerOpenLabel')
  const filterHeaderLabel = t('filterHeader')
  const finalSellLabel = fsEnabled ? t('finalSellOn') : t('finalSellOff')
  const pushActive = !!pushEndpoint
  const exportLabel = pushActive
    ? (baseRuleCount ? t('pushMergedSellfile') : t('pushSellfile'))
    : (baseRuleCount ? t('exportMergedSellfile') : t('exportSellfile'))
  const exportTooltipParts: string[] = []
  if (pushActive && pushEndpoint) {
    exportTooltipParts.push(t('pushSellfileTooltip', { endpoint: pushEndpoint }))
  }
  if (filterActive) {
    exportTooltipParts.push(t('exportIgnoresFilters'))
  }
  const exportTooltip = exportTooltipParts.join('\n')
  // Soft hint: when Final Sell is off, idling over Export briefly highlights the toggle.
  const [finalSellHighlightIdx, setFinalSellHighlightIdx] = React.useState<number | null>(null)
  const hoverTimeoutRef = React.useRef<number | null>(null)
  const highlightClearTimeoutRef = React.useRef<number | null>(null)
  const highlightLoopTimeoutRef = React.useRef<number | null>(null)
  const previousHighlightRef = React.useRef<number | null>(null)
  const hoverActiveRef = React.useRef(false)

  const clearHoverTimeout = React.useCallback(() => {
    if (hoverTimeoutRef.current != null) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  const clearHighlightClearTimeout = React.useCallback(() => {
    if (highlightClearTimeoutRef.current != null) {
      window.clearTimeout(highlightClearTimeoutRef.current)
      highlightClearTimeoutRef.current = null
    }
  }, [])

  const clearHighlightLoopTimeout = React.useCallback(() => {
    if (highlightLoopTimeoutRef.current != null) {
      window.clearTimeout(highlightLoopTimeoutRef.current)
      highlightLoopTimeoutRef.current = null
    }
  }, [])

  const stopHighlighting = React.useCallback(() => {
    clearHighlightClearTimeout()
    clearHighlightLoopTimeout()
    previousHighlightRef.current = null
    setFinalSellHighlightIdx(null)
  }, [clearHighlightClearTimeout, clearHighlightLoopTimeout])

  const playHighlightOnce = React.useCallback(() => {
    if (fsEnabled || !hoverActiveRef.current) return
    clearHighlightClearTimeout()
    clearHighlightLoopTimeout()
    const next = pickHighlightEffect(previousHighlightRef.current)
    previousHighlightRef.current = next
    setFinalSellHighlightIdx(next)
    highlightClearTimeoutRef.current = window.setTimeout(() => {
      setFinalSellHighlightIdx(null)
      highlightClearTimeoutRef.current = null
      if (fsEnabled || !hoverActiveRef.current) return
      highlightLoopTimeoutRef.current = window.setTimeout(() => {
        highlightLoopTimeoutRef.current = null
        playHighlightOnce()
      }, HIGHLIGHT_REPLAY_DELAY_MS)
    }, HIGHLIGHT_EFFECT_DURATION_MS)
  }, [clearHighlightClearTimeout, clearHighlightLoopTimeout, fsEnabled])

  const triggerHighlight = React.useCallback(() => {
    hoverTimeoutRef.current = null
    if (fsEnabled || !hoverActiveRef.current) return
    playHighlightOnce()
  }, [fsEnabled, playHighlightOnce])

  const handleExportHoverStart = React.useCallback(() => {
    if (fsEnabled) return
    hoverActiveRef.current = true
    clearHoverTimeout()
    hoverTimeoutRef.current = window.setTimeout(triggerHighlight, EXPORT_HOVER_DELAY_MS)
  }, [clearHoverTimeout, fsEnabled, triggerHighlight])

  const handleExportHoverEnd = React.useCallback(() => {
    hoverActiveRef.current = false
    clearHoverTimeout()
    stopHighlighting()
  }, [clearHoverTimeout, stopHighlighting])

  React.useEffect(() => {
    if (!fsEnabled) return
    clearHoverTimeout()
    hoverActiveRef.current = false
    stopHighlighting()
  }, [fsEnabled, clearHoverTimeout, stopHighlighting])

  React.useEffect(() => () => {
    clearHoverTimeout()
    hoverActiveRef.current = false
    stopHighlighting()
  }, [clearHoverTimeout, stopHighlighting])
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('sellfilePreview')}</Typography>
        <Chip label={rulesChipLabel} size="small" />
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', flex: 1 }}>
          {t('optionalLoadSellfile')}
        </Typography>
        {/* Right-aligned: Filters and Rule Tester */}
        {onToggleFilter && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 1, maxWidth: FILTER_HEADER_CONTAINER_MAX_WIDTH_PX, minWidth: 0 }}>
            {filterActive && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  whiteSpace: 'normal',
                  lineHeight: 1.2,
                  maxWidth: FILTER_HEADER_LABEL_MAX_WIDTH_PX,
                  textAlign: 'right',
                  wordBreak: 'break-word',
                }}
              >
                {filterHeaderLabel}
              </Typography>
            )}
            <Tooltip title={t('filterTooltip')}>
              <Button
                size="small"
                variant="outlined"
                color={filterActive ? 'warning' : 'success'}
                onClick={onToggleFilter}
                endIcon={<TuneIcon fontSize="small" />}
                sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, flexShrink: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
                aria-label={filterLabel}
              >
                <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{filterLabel}</Typography>
              </Button>
            </Tooltip>
          </Stack>
        )}
        {onOpenRuleTester && (
          <Button
            size="small"
            variant="outlined"
            onClick={onOpenRuleTester}
            sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, flexShrink: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
            aria-label={ruleTesterLabel}
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{ruleTesterLabel}</Typography>
          </Button>
        )}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'nowrap' }}>
        <FilePickerButton
          label={t('loadSellfile')}
          startIcon={<UploadFileIcon />}
          accept={ACCEPT_HSF}
          onSelect={onSelectHsf}
          buttonProps={{ sx: { whiteSpace: 'nowrap', flexShrink: 0 } }}
          labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
        />
        {baseRuleCount ? (
          <ClearIconButton
            size="small"
            aria-label={t('clear')}
            tooltip={t('clear')}
            onClick={onClearBase}
            sx={{ width: CLEAR_ICON_BUTTON_SIZE_PX, height: CLEAR_ICON_BUTTON_SIZE_PX, flexShrink: 0 }}
          />
        ) : (
          <Box sx={{ width: CLEAR_ICON_BUTTON_SIZE_PX, height: CLEAR_ICON_BUTTON_SIZE_PX, flexShrink: 0 }} />
        )}
        {typeof baseRuleCount === 'number' && baseRuleCount > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              ml: 1,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              lineHeight: 1.2,
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              maxWidth: 360,
              minWidth: 0,
              flex: '0 1 360px',
            }}
          >{baseRuleCount === 1 ? t('loadedBaseRuleOne') : t('loadedBaseRuleMany', { n: baseRuleCount })}</Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 2 }}>
          <ToggleButtonGroup
            size="small"
            color="warning"
            sx={{
              height: SMALL_BUTTON_HEIGHT_PX,
              '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                marginLeft: 0,
                borderLeft: '1px solid transparent',
              },
              '& .MuiToggleButtonGroup-grouped.Mui-selected + .MuiToggleButtonGroup-grouped.Mui-selected': {
                marginLeft: 0,
                borderLeft: '1px solid transparent',
              },
            }}
          >
            <Tooltip title={t('addFinalSellTooltip')}>
              <ToggleButton
                value="finalSellToggle"
                selected={fsEnabled}
                onClick={() => onToggleFinalSell(!fsEnabled)}
                data-tour-id="finalsell.toggle"
                aria-label={finalSellLabel}
                aria-pressed={fsEnabled}
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: FINAL_SELL_BUTTON_WIDTH_PX,
                  height: SMALL_BUTTON_HEIGHT_PX,
                  minHeight: SMALL_BUTTON_HEIGHT_PX,
                  lineHeight: 1,
                  textTransform: 'none',
                  px: 1.25,
                  borderColor: theme.palette.warning.main,
                  color: theme.palette.warning.main,
                  '&.Mui-selected': {
                    color: theme.palette.warning.contrastText,
                    backgroundColor: theme.palette.warning.main,
                    '&:hover': {
                      backgroundColor: theme.palette.warning.dark,
                    },
                  },
                  '&:hover': {
                    borderColor: theme.palette.warning.dark,
                    backgroundColor: alpha(theme.palette.warning.main, 0.1),
                  },
                  ...getHighlightEffectSx(finalSellHighlightIdx),
                })}
              >
                <Box
                  component="span"
                  className="highlight-target"
                  sx={{
                    ...ELLIPSIS_TEXT_SX,
                    width: '100%',
                    typography: 'button',
                    textAlign: 'center',
                    lineHeight: 1,
                  }}
                >
                  {finalSellLabel}
                </Box>
              </ToggleButton>
            </Tooltip>
            <Tooltip title={t('configure')}>
              <ToggleButton
                value="finalSellConfig"
                onClick={onOpenFinalSellDialog}
                data-tour-id="finalsell.config"
                aria-label={t('configureFinalSellAria')}
                sx={(theme) => ({
                  minWidth: SMALL_BUTTON_HEIGHT_PX,
                  width: SMALL_BUTTON_HEIGHT_PX,
                  height: SMALL_BUTTON_HEIGHT_PX,
                  minHeight: SMALL_BUTTON_HEIGHT_PX,
                  lineHeight: 1,
                  borderColor: theme.palette.warning.main,
                  backgroundColor: theme.palette.warning.main,
                  color: theme.palette.warning.contrastText,
                  '&:hover': {
                    borderColor: theme.palette.warning.dark,
                    backgroundColor: theme.palette.warning.dark,
                  },
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.warning.dark,
                  },
                })}
              >
                <TuneIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Stack>
        <Tooltip title={exportTooltip || undefined}>
          <DirtyBadge active={hsfDirty} sx={{ display: 'inline-flex', flexShrink: 0 }}>
            <span onMouseEnter={handleExportHoverStart} onMouseLeave={handleExportHoverEnd}>
              <Button
                startIcon={<SaveIcon />}
                sx={{ whiteSpace: 'nowrap', px: 1.25, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
                onClick={onExport}
                disabled={exportDisabled}
                data-tour-id="hsf.export"
                aria-label={exportLabel}
              >
                <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{exportLabel}</Typography>
              </Button>
            </span>
          </DirtyBadge>
        </Tooltip>
      </Stack>
    </>
  )
}
