import React from 'react'
import { Box, Button, Chip, Divider, Menu, MenuItem, Popover, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { alpha, type Theme } from '@mui/material/styles'
import {
  ELLIPSIS_TEXT_SX,
  FINAL_SELL_BUTTON_MIN_WIDTH_PX,
  FINAL_SELL_BUTTON_WIDTH_PX,
  SMALL_BUTTON_HEIGHT_PX,
  CLEAR_ICON_BUTTON_SIZE_PX,
  FILTER_HEADER_LABEL_MAX_WIDTH_PX,
  SELLFILE_BUTTON_HEIGHT_PX,
  TOTAL_RULE_COUNT_LIMIT,
  ACCEPT_HSF_OR_DB_FILE_DIALOG,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
} from '../lib/constants'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import FilePickerButton from './FilePickerButton'
import { useI18n, formatRulesCount } from '../lib/i18n'
import ClearIconButton from './ClearIconButton'
import DirtyBadge from './DirtyBadge'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import Checkbox from '@mui/material/Checkbox'
// MarkdownTooltip keeps all preview tooltips (filter toggle, export warnings, etc.) aligned with the global styling/delay.
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import WorkloadProgressIndicator from './WorkloadProgressIndicator'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ContextMenuPaper from './ContextMenuPaper'
import { type TesterSubstatSortDirection } from '../lib/testerSort'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, StatVariant, statVariantI18nKey } from '../lib/types'
import type { TesterSubstatSortState } from '../state/testerSubstatSortPreferences'
import type { SubstatColorMap } from '../lib/renderColoredStatText'


type ProgressChipProps = {
  progressRatio: number
  ariaLabel?: string | undefined
  children: React.ReactElement
}

function ProgressChip({ progressRatio, ariaLabel, children }: ProgressChipProps) {
  const clampedRatio = Math.max(0, Math.min(1, progressRatio))
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {children}
      <WorkloadProgressIndicator progressRatio={clampedRatio} ariaLabel={ariaLabel} />
    </Box>
  )
}

export default function PreviewHeaderActions(props: {
  mergedCount: number
  filteredCount?: number
  filterActive?: boolean
  onToggleFilter?: () => void
  // True when any filter-related setting deviates from defaults (including config filters).
  filtersDirty?: boolean
  // Clears filter state back to defaults (mirrors the old Reset Filters button).
  onClearFilters?: () => void
  onSelectFile: (file: File) => void | Promise<void>
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
  keepUniquesEnabled: boolean
  onToggleKeepUniques: (next: boolean) => void
  hsfDirty: boolean
  building?: boolean
  testerBuilding?: boolean
  workloadProgressRatio: number
  limitHit?: boolean
  // Final sell remainder controls
  finalSell: FinalSellRemainderConfig
  onToggleFinalSell: (enabled: boolean) => void
  onOpenLogicHubDialog: () => void
  previewMode: 'rules' | 'tester'
  onChangePreviewMode: (mode: 'rules' | 'tester') => void
  filterOpen: boolean
  testerCount?: number
  testerFilteredCount?: number
  testerSubstatSort: TesterSubstatSortState
  // Mirrors the Rule Tester grid preference so the sort popover can match stat coloring.
  useStatButtonColors: boolean
  // Full color map so the sort popover can match the same per-stat colors as chips/toggles.
  substatColors: SubstatColorMap
  onClearTesterSubstatSort: () => void
  onSetTesterSubstatSortDirection: (direction: TesterSubstatSortDirection) => void
  onToggleTesterSubstatSortKeepSections: () => void
  onToggleTesterSubstatSortExcludeGlyphs: () => void
  onToggleTesterSubstatSortPriority: (variant: StatVariant) => void
  gearDbCommandError?: string | null
  onClearGearDbCommandError?: () => void
  gearDbCommandSuccess?: string | null
  onClearGearDbCommandSuccess?: () => void
  filtersSynced?: boolean
  onToggleFiltersSynced?: (next: boolean) => void
}) {
  const {
    mergedCount,
    filteredCount,
    filterActive,
    onToggleFilter,
    filtersDirty = false,
    onClearFilters,
    onSelectFile,
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
    keepUniquesEnabled,
    onToggleKeepUniques,
    onToggleFinalSell,
    onOpenLogicHubDialog,
    hsfDirty,
    building = false,
    limitHit = false,
    previewMode,
    onChangePreviewMode,
    filterOpen,
    testerCount,
    testerFilteredCount,
    testerSubstatSort,
    useStatButtonColors,
    substatColors,
    onClearTesterSubstatSort,
    onSetTesterSubstatSortDirection,
    onToggleTesterSubstatSortKeepSections,
    onToggleTesterSubstatSortExcludeGlyphs,
    onToggleTesterSubstatSortPriority,
    testerBuilding = false,
    workloadProgressRatio,
    gearDbCommandError,
    onClearGearDbCommandError,
    gearDbCommandSuccess,
    onClearGearDbCommandSuccess,
    filtersSynced = false,
    onToggleFiltersSynced,
  } = props
  const isRulesMode = previewMode === 'rules'
  const fsEnabled = (finalSell.artifacts || finalSell.accessories) && (finalSell.levels?.length ?? 0) > 0
  const { t } = useI18n()
  const mergedCountLabel = formatRulesCount(t, mergedCount, { limit: TOTAL_RULE_COUNT_LIMIT })
  const testerCountValue = Number.isFinite(testerCount) ? Math.max(0, Math.floor(testerCount ?? 0)) : 0
  const testerFilteredValue = Number.isFinite(testerFilteredCount) ? Math.max(0, Math.floor(testerFilteredCount ?? 0)) : testerCountValue
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(undefined), [])
  const formattedBaseRuleCount = typeof baseRuleCount === 'number' && baseRuleCount > 0
    ? numberFormatter.format(baseRuleCount)
    : null
  const baseRulesLabel = formattedBaseRuleCount
    ? (baseRuleCount === 1 ? t('loadedBaseRuleOne') : t('loadedBaseRuleMany', { n: formattedBaseRuleCount }))
    : null
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
  const rulesChipLabel = chipBaseLabel
  const rulesChipMinChars = React.useMemo(
    () => Array.from(chipBaseLabel).length,
    [chipBaseLabel],
  )
  const rulesChipMinWidth = rulesChipMinChars > 0 ? `${rulesChipMinChars}ch` : undefined
  // Clamp determinate values from both rule and tester builders so the UI never overflows.
  const chipProgressRatio = workloadProgressRatio
  const spinnerAriaLabel = chipProgressRatio > 0 ? buildingLabel : undefined
  const rulesChipBaseSx = React.useMemo(() => {
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
  const rulesChipSx = rulesChipBaseSx
  const limitTooltip = React.useMemo(() => {
    if (!limitHit || building || !isRulesMode) return ''
    const formattedLimit = new Intl.NumberFormat(undefined).format(TOTAL_RULE_COUNT_LIMIT)
    return t('rulesLimitExceeded', { limit: formattedLimit })
  }, [building, isRulesMode, limitHit, t])

  const rulesModeLabel = t('previewModeRules')
  const testerModeLabel = t('previewModeTester')
  const sortLabel = t('testerSortLabel')
  const sortClearLabel = t('testerSortClear')
  const sortDirectionLabel = t('testerSortDirection')
  const sortKeepSectionsLabel = t('testerSortKeepSections')
  const sortExcludeGlyphsLabel = t('testerSortExcludeGlyphs')
  const sortHighToLowLabel = t('testerSortHighToLow')
  const sortLowToHighLabel = t('testerSortLowToHigh')
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
  const filterMenuEnabled = React.useMemo(
    () => Boolean(onToggleFiltersSynced),
    [onToggleFiltersSynced],
  )
  const [filterMenuAnchor, setFilterMenuAnchor] = React.useState<HTMLElement | null>(null)
  const closeFilterMenu = React.useCallback(() => { setFilterMenuAnchor(null) }, [])
  const filterMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(filterMenuAnchor),
    onClose: closeFilterMenu,
    menuRef: filterMenuPaperRef,
  })
  const {
    shouldShow: showFilterHint,
    markSeen: markFilterHintSeen,
  } = useContextMenuHint('previewFilterMenu')
  const [filterHintPos, setFilterHintPos] = React.useState<{ x: number; y: number } | null>(null)
  const filterHintActive = showFilterHint && filterHintPos !== null && !filterMenuAnchor
  const filterLabel = filterActive ? t('filtersOn') : t('filtersOff')
  const keepUniquesToggleLabel = t('keepUniquesToggleLabel')
  const filterHeaderLabel = t('filterHeader')
  const finalSellLabel = t('finalSellToggleLabel')
  const filterToggleLabel = t('filterToggleLabel')
  const logicHubLabel = t('titleLogicHub')
  const keepUniquesLabel = t('keepUniquesToggleLabel')
  const longestWarningToggleWidth = React.useMemo(() => {
    const labels = [finalSellLabel, keepUniquesLabel]
    const ctx = document?.createElement?.('canvas')?.getContext?.('2d')
    const font = typeof window !== 'undefined'
      ? getComputedStyle(window.document.body).font || '500 14px Roboto'
      : '500 14px Roboto'
    if (!ctx) return FINAL_SELL_BUTTON_MIN_WIDTH_PX
    ctx.font = font
    const widths = labels.map((text) => ctx.measureText(text).width + 32)
    const longest = Math.max(...widths, FINAL_SELL_BUTTON_MIN_WIDTH_PX)
    return Math.min(longest, FINAL_SELL_BUTTON_WIDTH_PX)
  }, [finalSellLabel, keepUniquesLabel])
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

  const statusBadgeSx = React.useCallback((paletteKey: 'warning' | 'success') => (theme: Theme) => ({
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: theme.shadows[2],
    backgroundColor: theme.palette[paletteKey].main,
    color: theme.palette.getContrastText(theme.palette[paletteKey].main),
    border: `2px solid ${theme.palette.background.paper}`,
    fontWeight: theme.typography.fontWeightBold ?? 600,
    fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(12) : '0.75rem',
    lineHeight: 1,
    cursor: 'help',
    zIndex: 1,
    padding: 0,
  }), [])

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
  const sortPriorities = React.useMemo(() => {
    // Prefer the persisted ordering, but keep a stable empty array so hooks remain deterministic.
    return testerSubstatSort.priorities ?? []
  }, [testerSubstatSort.priorities])
  const sortActive = !isRulesMode && sortPriorities.length > 0
  const sortButtonLabel = React.useMemo(() => {
    if (isRulesMode) return sortLabel
    const [first] = sortPriorities
    if (typeof first !== 'number') return sortLabel
    const head = t(statVariantI18nKey(first))
    return sortPriorities.length > 1 ? `${head}...` : head
  }, [isRulesMode, sortLabel, sortPriorities, t])
  const sortSpec = React.useMemo(() => ({
    priorities: sortPriorities,
    direction: testerSubstatSort.direction,
    excludeGlyphs: testerSubstatSort.excludeGlyphs,
  }), [sortPriorities, testerSubstatSort.direction, testerSubstatSort.excludeGlyphs])
  const sortStatFg = React.useCallback((variant: StatVariant) => {
    if (!useStatButtonColors) return undefined
    return substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
  }, [substatColors, useStatButtonColors])

  const [sortMenuAnchor, setSortMenuAnchor] = React.useState<HTMLElement | null>(null)
  const sortMenuOpen = Boolean(sortMenuAnchor)
  const closeSortMenu = React.useCallback(() => { setSortMenuAnchor(null) }, [])
  const sortMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: sortMenuOpen,
    onClose: closeSortMenu,
    menuRef: sortMenuPaperRef,
  })
  React.useEffect(() => {
    // Switching back to Sellfile preview disables sorting, so close the menu to avoid a stuck popover.
    if (isRulesMode && sortMenuOpen) closeSortMenu()
  }, [closeSortMenu, isRulesMode, sortMenuOpen])

  const SORT_BUTTON_WIDTH_PX = 92
  // Keep clear icons from shifting layout when they appear/disappear.
  const HEADER_CLEAR_PLACEHOLDER_SX = {
    width: CLEAR_ICON_BUTTON_SIZE_PX,
    height: CLEAR_ICON_BUTTON_SIZE_PX,
    flexShrink: 0,
  } as const

  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={previewMode}
          exclusive
          onChange={(_, next) => { if (next === 'rules' || next === 'tester') onChangePreviewMode(next) }}
          aria-label={t('previewModeAria')}
          data-tour-id="preview.mode-toggle"
          sx={{
            height: SMALL_BUTTON_HEIGHT_PX,
            flexShrink: 0,
            minWidth: 0,
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
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, minWidth: 0 }}>
          {limitHit && !building && isRulesMode ? (
            <>
              {/* MarkdownTooltip ensures the limit warning uses the shared hover delay and Markdown formatting. */}
              <MarkdownTooltip markdown={limitTooltip}>
                <Box component="span" sx={{ display: 'inline-flex' }}>
                  <ProgressChip progressRatio={chipProgressRatio} ariaLabel={spinnerAriaLabel}>
                    <Chip label={rulesChipLabel} size="small" sx={rulesChipSx} aria-label={isBuilding ? buildingLabel : undefined} />
                  </ProgressChip>
                </Box>
              </MarkdownTooltip>
            </>
          ) : (
            <ProgressChip progressRatio={chipProgressRatio} ariaLabel={spinnerAriaLabel}>
              <Chip label={rulesChipLabel} size="small" sx={rulesChipSx} aria-label={isBuilding ? buildingLabel : undefined} />
            </ProgressChip>
          )}
          {baseRulesLabel ? (
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {baseRulesLabel}
            </Typography>
          ) : null}
        </Stack>
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
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{
          mb: 1,
          flexWrap: 'nowrap',
          minWidth: 0,
          '& > *': { minWidth: 0, flexShrink: 0 },
        }}
      >
        {onToggleFilter && (
          <>
            <Box sx={{ minWidth: 0, flexShrink: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {/* Filter toggle tooltip can now express list-style hints thanks to MarkdownTooltip. */}
              <MarkdownTooltip markdown={t('filterTooltip')}>
                <Box
                  component="span"
                  onMouseEnter={(event) => {
                    if (!filterMenuEnabled || !showFilterHint) return
                    setFilterHintPos({ x: event.clientX, y: event.clientY })
                  }}
                  onMouseMove={(event) => {
                    if (!filterMenuEnabled || !showFilterHint) return
                    setFilterHintPos({ x: event.clientX, y: event.clientY })
                  }}
                  onMouseLeave={() => {
                    setFilterHintPos(null)
                  }}
                  onContextMenu={(event) => {
                    if (!filterMenuEnabled) return
                    try {
                      event.preventDefault()
                      event.stopPropagation()
                    } catch {}
                    setFilterMenuAnchor(event.currentTarget as HTMLElement)
                    markFilterHintSeen()
                    setFilterHintPos(null)
                  }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color={filterActive ? 'warning' : 'success'}
                    onClick={onToggleFilter}
                    aria-pressed={filterActive}
                    aria-label={filterLabel}
                    sx={{
                      whiteSpace: 'nowrap',
                      px: 1.25,
                      height: SMALL_BUTTON_HEIGHT_PX,
                      minHeight: SMALL_BUTTON_HEIGHT_PX,
                      flexShrink: 1,
                      minWidth: 0,
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      py: 0,
                    }}
                  >
                    <EllipsisTooltip title={filterLabel} selector='[data-ellipsis-target]' wrap="block">
                      <Box
                        component="span"
                        sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, width: '100%', minWidth: 0 }}
                      >
                        <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, minWidth: 0 }} data-ellipsis-target>
                          {filterToggleLabel}
                        </Typography>
                        {filterOpen ? (
                          <ExpandLessIcon fontSize="small" />
                        ) : (
                          <ExpandMoreIcon fontSize="small" />
                        )}
                      </Box>
                    </EllipsisTooltip>
                  </Button>
                </Box>
              </MarkdownTooltip>
              {filtersDirty && onClearFilters ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('filterReset')}
                  tooltip={t('filterReset')}
                  onClick={() => onClearFilters()}
                />
              ) : (
                <Box sx={{ ...HEADER_CLEAR_PLACEHOLDER_SX, pointerEvents: 'none' }} />
              )}
            </Box>
            <Box sx={{ minWidth: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 1, mr: 1 }}>
              <MarkdownTooltip markdown={t('testerSortTooltip')}>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color={sortActive ? 'warning' : 'success'}
                    disabled={isRulesMode}
                    onClick={(event) => {
                      if (isRulesMode) return
                      setSortMenuAnchor(event.currentTarget)
                    }}
                    aria-label={sortLabel}
                    sx={{
                      whiteSpace: 'nowrap',
                      px: 1.25,
                      height: SMALL_BUTTON_HEIGHT_PX,
                      minHeight: SMALL_BUTTON_HEIGHT_PX,
                      minWidth: SORT_BUTTON_WIDTH_PX,
                      width: SORT_BUTTON_WIDTH_PX,
                      maxWidth: SORT_BUTTON_WIDTH_PX,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      py: 0,
                    }}
                  >
                    <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, width: '100%' }} data-ellipsis-target>
                      {sortButtonLabel}
                    </Typography>
                  </Button>
                </span>
              </MarkdownTooltip>
              {!isRulesMode && sortPriorities.length > 0 ? (
                <ClearIconButton
                  size="small"
                  aria-label={sortClearLabel}
                  tooltip={sortClearLabel}
                  onClick={() => onClearTesterSubstatSort()}
                />
              ) : (
                <Box sx={{ ...HEADER_CLEAR_PLACEHOLDER_SX, pointerEvents: 'none' }} />
              )}
            </Box>
            <ContextMenuHintOverlay text={t('contextMenuHint')} position={filterHintActive ? filterHintPos : null} />
            {filterMenuEnabled ? (
              <Menu
                anchorEl={filterMenuAnchor}
                open={Boolean(filterMenuAnchor)}
                onClose={closeFilterMenu}
                PaperProps={{ ref: filterMenuPaperRef }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                {onToggleFiltersSynced ? (
                  <MenuItem
                    onClick={() => onToggleFiltersSynced(!filtersSynced)}
                  >
                    <Checkbox
                      size="small"
                      checked={filtersSynced}
                      onChange={(event) => onToggleFiltersSynced(Boolean(event.target.checked))}
                      sx={{ mr: 1, p: 0.5 }}
                    />
                    {t('filterSyncViews')}
                  </MenuItem>
                ) : null}
              </Menu>
            ) : null}
            <Popover
              open={sortMenuOpen}
              anchorEl={sortMenuAnchor}
              onClose={closeSortMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  component: ContextMenuPaper,
                  onRequestClose: closeSortMenu,
                  closeLabel: t('close'),
                  ref: sortMenuPaperRef,
                  sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2.25 },
                } as unknown as MuiPaperProps,
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <MenuItem
                  sx={{ gap: 1, alignItems: 'center' }}
                  onClick={() => onSetTesterSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')}
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{sortDirectionLabel}</Typography>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSetTesterSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')
                    }}
                  >
                    {sortSpec.direction === 'desc' ? sortHighToLowLabel : sortLowToHighLabel}
                  </Button>
                </MenuItem>
                <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleTesterSubstatSortKeepSections()}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{sortKeepSectionsLabel}</Typography>
                  <Button
                    size="small"
                    variant={testerSubstatSort.keepSections ? 'contained' : 'outlined'}
                    color="success"
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleTesterSubstatSortKeepSections()
                    }}
                  >
                    {testerSubstatSort.keepSections ? t('commonOn') : t('commonOff')}
                  </Button>
                </MenuItem>
                <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleTesterSubstatSortExcludeGlyphs()}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{sortExcludeGlyphsLabel}</Typography>
                  <Button
                    size="small"
                    variant={testerSubstatSort.excludeGlyphs ? 'contained' : 'outlined'}
                    color="success"
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleTesterSubstatSortExcludeGlyphs()
                    }}
                  >
                    {testerSubstatSort.excludeGlyphs ? t('commonOn') : t('commonOff')}
                  </Button>
                </MenuItem>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {STAT_VARIANTS_PRIORITY.map((variant) => {
                    const idx = sortPriorities.findIndex((v) => Number(v) === Number(variant))
                    const label = t(statVariantI18nKey(variant))
                    const fg = sortStatFg(variant)
                    const active = idx >= 0
                    return (
                      <MenuItem
                        key={variant}
                        onClick={() => onToggleTesterSubstatSortPriority(variant)}
                        sx={(theme) => ({
                          gap: 1,
                          alignItems: 'center',
                          ...(active ? { backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) } : {}),
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
                          },
                        })}
                      >
                        <Typography
                          variant="body2"
                          sx={(theme) => ({
                            flex: 1,
                            minWidth: 0,
                            ...(active ? { fontWeight: theme.typography.fontWeightMedium ?? 600 } : {}),
                            ...(fg ? { color: fg } : {}),
                          })}
                        >
                          {label}
                        </Typography>
                        {active ? (
                          <Box
                            component="span"
                            sx={(theme) => ({
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 18,
                              minWidth: 20,
                              px: 0.75,
                              borderRadius: 999,
                              fontSize: theme.typography.pxToRem(11),
                              fontWeight: 700,
                              letterSpacing: 0.1,
                              border: `1px solid ${alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.7 : 0.55)}`,
                              backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                              color: theme.palette.success.main,
                              flexShrink: 0,
                            })}
                          >
                            [{idx + 1}]
                          </Box>
                        ) : null}
                      </MenuItem>
                    )
                  })}
                </Box>
              </Box>
            </Popover>
          </>
        )}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, minWidth: 0 }}>
          <ToggleButtonGroup
            size="small"
            sx={{
              height: SMALL_BUTTON_HEIGHT_PX,
              flexShrink: 0,
              minWidth: 0,
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
            <>
              {/* Final Sell toggle retains the warning palette so it is still visually linked to the catch-all sweeps. */}
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
                  flexShrink: 1,
                  minWidth: longestWarningToggleWidth,
                  width: longestWarningToggleWidth,
                  maxWidth: FINAL_SELL_BUTTON_WIDTH_PX,
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
                })}
              >
                <EllipsisTooltip title={finalSellLabel} selector='[data-ellipsis-target]' wrap="block">
                  <Box
                    component="span"
                    data-ellipsis-target
                    sx={{
                      ...ELLIPSIS_TEXT_SX,
                      width: '100%',
                      typography: 'button',
                      textAlign: 'center',
                      lineHeight: 1,
                      display: 'block',
                    }}
                  >
                    {finalSellLabel}
                  </Box>
                </EllipsisTooltip>
              </ToggleButton>
            </>
            <>
              {/* Keep Uniques shares the inline toggle treatment so users can pause/resume protections without leaving the preview. */}
              <ToggleButton
                value="keepUniquesToggle"
                selected={keepUniquesEnabled}
                onClick={() => onToggleKeepUniques(!keepUniquesEnabled)}
                data-tour-id="keepuniques.toggle"
                aria-label={keepUniquesToggleLabel}
                aria-pressed={keepUniquesEnabled}
                sx={(theme) => ({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                  flexShrink: 1,
                  minWidth: longestWarningToggleWidth,
                  width: longestWarningToggleWidth,
                  maxWidth: FINAL_SELL_BUTTON_WIDTH_PX,
                height: SMALL_BUTTON_HEIGHT_PX,
                minHeight: SMALL_BUTTON_HEIGHT_PX,
                lineHeight: 1,
                textTransform: 'none',
                  px: 1.25,
                  borderColor: theme.palette.success.main,
                  color: theme.palette.success.main,
                  '&.Mui-selected': {
                    color: theme.palette.success.contrastText,
                    backgroundColor: theme.palette.success.main,
                    '&:hover': {
                      backgroundColor: theme.palette.success.dark,
                    },
                  },
                  '&:hover': {
                    borderColor: theme.palette.success.dark,
                    backgroundColor: alpha(theme.palette.success.main, 0.08),
                  },
                })}
              >
                <EllipsisTooltip title={keepUniquesToggleLabel} selector='[data-ellipsis-target]' wrap="block">
                  <Typography
                    component="span"
                    noWrap
                    data-ellipsis-target
                    sx={{ ...ELLIPSIS_TEXT_SX, width: '100%', textAlign: 'center', lineHeight: 1, display: 'block' }}
                  >
                    {keepUniquesToggleLabel}
                  </Typography>
                </EllipsisTooltip>
              </ToggleButton>
            </>
          </ToggleButtonGroup>
          <Box sx={{ minWidth: 0, flexShrink: 0 }}>
            <MarkdownTooltip markdown={t('gearDialogOpenTooltip')}>
              <Button
                size="small"
                variant="outlined"
                onClick={onOpenLogicHubDialog}
                data-tour-id="finalsell.config"
                aria-label={t('openLogicHubAria')}
                sx={{
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  px: 1.25,
                  flexShrink: 0,
                  height: SMALL_BUTTON_HEIGHT_PX,
                  minHeight: SMALL_BUTTON_HEIGHT_PX,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 0,
                }}
              >
                <EllipsisTooltip title={logicHubLabel} selector='[data-ellipsis-target]' wrap="block">
                  <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, width: '100%' }} data-ellipsis-target>
                    {logicHubLabel}
                  </Typography>
                </EllipsisTooltip>
              </Button>
            </MarkdownTooltip>
          </Box>
        </Stack>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {baseRuleCount ? (
            <ClearIconButton
              size="small"
              aria-label={t('clear')}
              tooltip={t('clear')}
              onClick={onClearBase}
              sx={{ width: CLEAR_ICON_BUTTON_SIZE_PX, height: CLEAR_ICON_BUTTON_SIZE_PX, flexShrink: 0 }}
            />
          ) : null}
          <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <>
              {/* Load button uses MarkdownTooltip so the two-line explanation renders cleanly across locales. */}
              <MarkdownTooltip markdown={`${t('loadSellfile')}\n\n${t('optionalLoadSellfile')}`}>
                <FilePickerButton
                  label={t('loadSellfile')}
                  accept={ACCEPT_HSF_OR_DB_FILE_DIALOG}
                  onSelect={onSelectFile}
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
              </MarkdownTooltip>
            </>
            {gearDbCommandError ? (
              <>
                {/* Status badges use MarkdownTooltip so the success/error strings inherit the global delay. */}
                <MarkdownTooltip
                  markdown={gearDbCommandError}
                  placement="left"
                  onClose={() => { onClearGearDbCommandError?.() }}
                >
                  <Box component="span" sx={statusBadgeSx('warning')}>!</Box>
                </MarkdownTooltip>
              </>
            ) : null}
            {!gearDbCommandError && gearDbCommandSuccess ? (
              <>
                <MarkdownTooltip
                  markdown={gearDbCommandSuccess}
                  placement="left"
                  onClose={() => { onClearGearDbCommandSuccess?.() }}
                >
                  <Box component="span" sx={statusBadgeSx('success')}>{'✓'}</Box>
                </MarkdownTooltip>
              </>
            ) : null}
          </Box>
          {(exportTooltip?.trim().length ?? 0) > 0 ? (
            <>
              {/* Export tooltip strings can include lists, so route them through MarkdownTooltip for consistent formatting. */}
              <MarkdownTooltip markdown={exportTooltip}>
              <DirtyBadge
                active={hsfDirty}
                sx={{ display: 'flex', flexShrink: 1, minWidth: 0, ml: 1 }}
              >
                <Box
                  component="span"
                  sx={{ display: 'flex', flex: 1, minWidth: 0 }}
                  onMouseEnter={(event) => {
                    if (!exportMenuEnabled || !showExportHint) return
                    setExportHintPos({ x: event.clientX, y: event.clientY })
                  }}
                  onMouseMove={(event) => {
                    if (!exportMenuEnabled || !showExportHint) return
                    setExportHintPos({ x: event.clientX, y: event.clientY })
                  }}
                  onMouseLeave={() => {
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
                    sx={{
                      whiteSpace: 'nowrap',
                      px: 1.25,
                      minWidth: 0,
                      maxWidth: 320,
                      overflow: 'hidden',
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                    onClick={onExport}
                    disabled={exportDisabled}
                    data-tour-id="hsf.export"
                    aria-label={exportLabel}
                  >
                    <EllipsisTooltip title={exportLabel}>
                      <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>
                        {exportLabel}
                      </Typography>
                    </EllipsisTooltip>
                  </Button>
                </Box>
              </DirtyBadge>
              </MarkdownTooltip>
            </>
          ) : (
            <DirtyBadge
              active={hsfDirty}
              sx={{ display: 'flex', flexShrink: 1, ml: 1, minWidth: 0 }}
            >
              <Box
                component="span"
                sx={{ display: 'flex', flex: 1, minWidth: 0 }}
                onMouseEnter={(event) => {
                  if (!exportMenuEnabled || !showExportHint) return
                  setExportHintPos({ x: event.clientX, y: event.clientY })
                }}
                onMouseMove={(event) => {
                  if (!exportMenuEnabled || !showExportHint) return
                  setExportHintPos({ x: event.clientX, y: event.clientY })
                }}
                onMouseLeave={() => {
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
                  sx={{
                    whiteSpace: 'nowrap',
                    px: 1.25,
                    minWidth: 0,
                    maxWidth: 320,
                    overflow: 'hidden',
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                  onClick={onExport}
                  disabled={exportDisabled}
                  data-tour-id="hsf.export"
                  aria-label={exportLabel}
                >
                  <EllipsisTooltip title={exportLabel}>
                    <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>
                      {exportLabel}
                    </Typography>
                  </EllipsisTooltip>
                </Button>
              </Box>
            </DirtyBadge>
          )}
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
