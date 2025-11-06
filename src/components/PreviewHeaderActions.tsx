import React from 'react'
import { Box, Button, Chip, Stack, Tooltip, ToggleButton, ToggleButtonGroup, Typography, Menu, MenuItem } from '@mui/material'
import { alpha } from '@mui/material/styles'
import TuneIcon from '@mui/icons-material/Tune'
import {
  ELLIPSIS_TEXT_SX,
  FINAL_SELL_BUTTON_WIDTH_PX,
  LONG_LABEL_BUTTON_MAX_WIDTH_PX,
  SMALL_BUTTON_HEIGHT_PX,
  CLEAR_ICON_BUTTON_SIZE_PX,
  FILTER_HEADER_LABEL_MAX_WIDTH_PX,
  SELLFILE_BUTTON_HEIGHT_PX,
  TOTAL_RULE_COUNT_LIMIT,
  ACCEPT_HSF,
} from '../lib/constants'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import FilePickerButton from './FilePickerButton'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { getHighlightEffectSx, pickHighlightEffect, HIGHLIGHT_EFFECT_DURATION_MS } from './highlightEffects'
import ClearIconButton from './ClearIconButton'
import DirtyBadge from './DirtyBadge'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import Checkbox from '@mui/material/Checkbox'
import { stripAnimatedEllipsisSource, useAnimatedEllipsis } from '../hooks/useAnimatedEllipsis'

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
  onExportDeduped?: () => void
  dedupeDefault: boolean
  onToggleDedupeDefault: (next: boolean) => void
  omitDisabledForExport: boolean
  onToggleOmitDisabled: (next: boolean) => void
  exportDisabled: boolean
  pushEndpoint?: string
  hsfDirty: boolean
  building?: boolean
  testerBuilding?: boolean
  limitHit?: boolean
  // Final sell remainder controls
  finalSell: FinalSellRemainderConfig
  onToggleFinalSell: (enabled: boolean) => void
  onOpenFinalSellDialog: () => void
  onOpenRuleTester?: () => void
  previewMode: 'rules' | 'tester'
  onChangePreviewMode: (mode: 'rules' | 'tester') => void
  testerCount?: number
  testerFilteredCount?: number
}) {
  const {
    mergedCount,
    filteredCount,
    filterActive,
    onToggleFilter,
    onSelectHsf,
    onClearBase,
    baseRuleCount,
    onExport,
    onExportDeduped,
    dedupeDefault,
    onToggleDedupeDefault,
    omitDisabledForExport,
    onToggleOmitDisabled,
    exportDisabled,
    pushEndpoint,
    finalSell,
    onToggleFinalSell,
    onOpenFinalSellDialog,
    onOpenRuleTester,
    hsfDirty,
    building = false,
    limitHit = false,
    previewMode,
    onChangePreviewMode,
    testerCount,
    testerFilteredCount,
    testerBuilding = false,
  } = props
  const isRulesMode = previewMode === 'rules'
  const fsEnabled = (finalSell.artifacts || finalSell.accessories) && (finalSell.levels?.length ?? 0) > 0
  const { t } = useI18n()
  const mergedCountLabel = formatRulesCount(t, mergedCount, { limit: TOTAL_RULE_COUNT_LIMIT })
  const testerCountValue = Number.isFinite(testerCount) ? Math.max(0, Math.floor(testerCount ?? 0)) : 0
  const testerFilteredValue = Number.isFinite(testerFilteredCount) ? Math.max(0, Math.floor(testerFilteredCount ?? 0)) : testerCountValue
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(undefined), [])
  const testerTotalLabel = testerCountValue === 1
    ? t('testerItemsCountOne')
    : t('testerItemsCountMany', { n: numberFormatter.format(testerCountValue) })
  const testerFilteredLabel = testerFilteredValue === 1
    ? t('testerItemsCountOne')
    : t('testerItemsCountMany', { n: numberFormatter.format(testerFilteredValue) })
  const chipBaseLabel = isRulesMode
    ? (filterActive && typeof filteredCount === 'number'
      ? `${formatRulesCount(t, filteredCount, { limit: TOTAL_RULE_COUNT_LIMIT })} / ${mergedCountLabel}`
      : mergedCountLabel)
    : (filterActive && Number.isFinite(testerFilteredCount)
      ? `${testerFilteredLabel} / ${testerTotalLabel}`
      : testerTotalLabel)
  const buildingLabel = t('rulesBuilding')
  const isBuilding = isRulesMode ? building : testerBuilding
  const animatedBuildingLabel = useAnimatedEllipsis(buildingLabel, { active: isBuilding })
  const buildingMaxLabel = React.useMemo(() => {
    const base = stripAnimatedEllipsisSource(buildingLabel)
    return `${base}${'.'.repeat(3)}`
  }, [buildingLabel])
  const rulesChipLabel = isBuilding ? animatedBuildingLabel : chipBaseLabel
  const rulesChipMinChars = React.useMemo(
    () => Math.max(
      Array.from(buildingMaxLabel).length,
      Array.from(chipBaseLabel).length,
    ),
    [chipBaseLabel, buildingMaxLabel],
  )
  const rulesChipMinWidth = rulesChipMinChars > 0 ? `${rulesChipMinChars}ch` : undefined
  const rulesChipSx = React.useMemo(() => {
    const base: Record<string, unknown> = {
      ...(rulesChipMinWidth ? { minWidth: rulesChipMinWidth } : {}),
    }
    if (limitHit && !building && isRulesMode) {
      return {
        ...base,
        bgcolor: 'error.main',
        color: 'error.contrastText',
        '.MuiChip-label': { color: 'error.contrastText' },
      }
    }
    return base
  }, [building, isRulesMode, limitHit, rulesChipMinWidth])
  const limitTooltip = React.useMemo(() => {
    if (!limitHit || building || !isRulesMode) return ''
    const formattedLimit = new Intl.NumberFormat(undefined).format(TOTAL_RULE_COUNT_LIMIT)
    return t('rulesLimitExceeded', { limit: formattedLimit })
  }, [building, isRulesMode, limitHit, t])

  const previewHeading = isRulesMode ? t('sellfilePreview') : t('testerPreviewHeading')
  const rulesModeLabel = t('previewModeRules')
  const testerModeLabel = t('previewModeTester')
  const exportMenuEnabled = React.useMemo(
    () => typeof onExportDeduped === 'function' || typeof onToggleDedupeDefault === 'function' || typeof onToggleOmitDisabled === 'function',
    [onExportDeduped, onToggleDedupeDefault, onToggleOmitDisabled],
  )
  const [exportMenuAnchor, setExportMenuAnchor] = React.useState<HTMLElement | null>(null)
  const closeExportMenu = React.useCallback(() => { setExportMenuAnchor(null) }, [])
  const exportMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(exportMenuAnchor),
    onClose: closeExportMenu,
    menuRef: exportMenuPaperRef,
  })
  const {
    shouldShow: showExportHint,
    markSeen: markExportHintSeen,
  } = useContextMenuHint('previewExportMenu')
  const [exportHintPos, setExportHintPos] = React.useState<{ x: number; y: number } | null>(null)
  const exportHintActive = showExportHint && exportHintPos !== null && !exportMenuAnchor
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
  React.useEffect(() => {
    if (!showExportHint) setExportHintPos(null)
  }, [showExportHint])
  React.useEffect(() => {
    if (!exportMenuEnabled) setExportHintPos(null)
  }, [exportMenuEnabled])
  React.useEffect(() => {
    if (!exportMenuEnabled && exportMenuAnchor) {
      setExportMenuAnchor(null)
    }
  }, [exportMenuAnchor, exportMenuEnabled])
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">{previewHeading}</Typography>
        {limitHit && !building && isRulesMode ? (
          <Tooltip title={limitTooltip}>
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <Chip label={rulesChipLabel} size="small" sx={rulesChipSx} />
            </Box>
          </Tooltip>
        ) : (
          <Chip label={rulesChipLabel} size="small" sx={rulesChipSx} />
        )}
        <Box sx={{ flex: 1 }} />
        {filterActive ? (
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
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={previewMode}
          exclusive
          onChange={(_, next) => { if (next === 'rules' || next === 'tester') onChangePreviewMode(next) }}
          aria-label={t('previewModeAria')}
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
          <ToggleButton
            value="rules"
            aria-label={rulesModeLabel}
            sx={{ px: 1.25, minWidth: 0, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, textTransform: 'none' }}
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{rulesModeLabel}</Typography>
          </ToggleButton>
          <ToggleButton
            value="tester"
            aria-label={testerModeLabel}
            sx={{ px: 1.25, minWidth: 0, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, textTransform: 'none' }}
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{testerModeLabel}</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
        {onToggleFilter && (
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
        )}
        {onOpenRuleTester && (
          <Button
            size="small"
            variant="outlined"
            onClick={onOpenRuleTester}
            sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, flexShrink: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
            aria-label={ruleTesterLabel}
            title={ruleTesterLabel}
          >
            <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{ruleTesterLabel}</Typography>
          </Button>
        )}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
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
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {typeof baseRuleCount === 'number' && baseRuleCount > 0 ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                lineHeight: 1.2,
                textAlign: 'right',
                minWidth: 0,
              }}
            >
              {baseRuleCount === 1 ? t('loadedBaseRuleOne') : t('loadedBaseRuleMany', { n: baseRuleCount })}
            </Typography>
          ) : null}
          {baseRuleCount ? (
            <ClearIconButton
              size="small"
              aria-label={t('clear')}
              tooltip={t('clear')}
              onClick={onClearBase}
              sx={{ width: CLEAR_ICON_BUTTON_SIZE_PX, height: CLEAR_ICON_BUTTON_SIZE_PX, flexShrink: 0 }}
            />
          ) : null}
          <Tooltip
            title={(
              <Box component="span">
                {t('loadSellfile')}
                <br />
                {t('optionalLoadSellfile')}
              </Box>
            )}
          >
            <FilePickerButton
              label={t('loadSellfile')}
              accept={ACCEPT_HSF}
              onSelect={onSelectHsf}
              buttonProps={{
                sx: {
                  minWidth: SELLFILE_BUTTON_HEIGHT_PX,
                  width: SELLFILE_BUTTON_HEIGHT_PX,
                  height: SELLFILE_BUTTON_HEIGHT_PX,
                  minHeight: SELLFILE_BUTTON_HEIGHT_PX,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 0,
                  flexShrink: 0,
                },
                'aria-label': t('loadSellfile'),
              }}
            >
              <UploadFileIcon fontSize="small" />
            </FilePickerButton>
          </Tooltip>
          <Tooltip title={exportTooltip || undefined}>
            <DirtyBadge
              active={hsfDirty}
              sx={{ display: 'inline-flex', flexShrink: 0, ml: 1 }}
            >
              <Box
                component="span"
                onMouseEnter={(event) => {
                  handleExportHoverStart()
                  if (!exportMenuEnabled || !showExportHint) return
                  setExportHintPos({ x: event.clientX, y: event.clientY })
                }}
                onMouseMove={(event) => {
                  if (!exportMenuEnabled || !showExportHint) return
                  setExportHintPos({ x: event.clientX, y: event.clientY })
                }}
                onMouseLeave={() => {
                  handleExportHoverEnd()
                  setExportHintPos(null)
                }}
                onContextMenu={(event) => {
                  if (!exportMenuEnabled) return
                  try {
                    event.preventDefault()
                    event.stopPropagation()
                  } catch {}
                  setExportMenuAnchor(event.currentTarget as HTMLElement)
                  markExportHintSeen()
                  setExportHintPos(null)
                }}
              >
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
              </Box>
            </DirtyBadge>
          </Tooltip>
          <ContextMenuHintOverlay text={t('contextMenuHint')} position={exportHintActive ? exportHintPos : null} />
          {exportMenuEnabled ? (
            <Menu
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={closeExportMenu}
              PaperProps={{ ref: exportMenuPaperRef }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem
                onClick={() => onToggleOmitDisabled(!omitDisabledForExport)}
              >
                <Checkbox
                  size="small"
                  checked={omitDisabledForExport}
                  onChange={(event) => onToggleOmitDisabled(Boolean(event.target.checked))}
                  sx={{ mr: 1, p: 0.5 }}
                />
                {t('exportSellfileOmitDisabled')}
              </MenuItem>
              <MenuItem
                onClick={() => onToggleDedupeDefault(!dedupeDefault)}
              >
                <Checkbox
                  size="small"
                  checked={dedupeDefault}
                  onChange={(event) => onToggleDedupeDefault(Boolean(event.target.checked))}
                  sx={{ mr: 1, p: 0.5 }}
                />
                {t('exportSellfileDedupDefault')}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  closeExportMenu()
                  onExportDeduped?.()
                }}
              >
                {t('exportSellfileDeduped')}
              </MenuItem>
            </Menu>
          ) : null}
        </Stack>
      </Stack>
    </>
  )
}
