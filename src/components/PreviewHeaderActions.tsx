import React from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
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
	  STATUS_CHIP_BORDER_RADIUS_PX,
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
import ContextMenuTitle from './ContextMenuTitle'
import DeleteIcon from '@mui/icons-material/Delete'
import GridViewIcon from '@mui/icons-material/GridView'
import {
  TESTER_SORT_KEY_LAST_USAGE,
  TESTER_SORT_WEIGHT_DEFAULT,
  isNeutralTesterSortWeight,
  type TesterSortKey,
  type TesterSubstatSortDirection,
} from '../lib/testerSort'
import {
  TESTER_NORMALIZED_PRESET_COUNT,
  buildTesterNormalizedPresetTooltipMarkdown,
  formatTesterNormalizedPresetButtonLabel,
  type TesterNormalizedPresetId,
} from '../lib/testerNormalizedPresets'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, StatVariant, statVariantI18nKey } from '../lib/types'
import type { TesterSubstatSortState } from '../state/testerSubstatSortPreferences'
import { useTesterGridNormalizedOverlayPreferences } from '../state/testerGridNormalizedOverlayPreferences'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import type { FilterPreset } from '../state/filterPresetsPreference'
import { formatLocalDateTime } from '../lib/dateDisplay'
import { useTesterSortPopoutEasterEgg } from '../hooks/useTesterSortPopoutEasterEgg'
import TesterSortPopoutEasterEggOverlay from './TesterSortPopoutEasterEggOverlay'
import { TesterSortWeightControls } from './TesterSortWeightControls'
import { TesterNormalizedPresetEditorMenu } from './TesterNormalizedPresetEditorMenu'
import { DEFAULT_METASET_ICON_ID } from '../lib/metasetIcons'


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
	  onSetTesterSubstatSortState: (next: TesterSubstatSortState) => void
	  onSetTesterSubstatSortDirection: (direction: TesterSubstatSortDirection) => void
	  onToggleTesterSubstatSortKeepSections: () => void
	  onToggleTesterSubstatSortExcludeGlyphs: () => void
	  onToggleTesterSubstatSortPriority: (key: TesterSortKey) => void
	  onToggleTesterSubstatSortPriorityFlipped: (key: TesterSortKey) => void
	  onSetTesterSubstatSortWeight: (variant: StatVariant, next: number) => void
	  onBumpTesterSubstatSortWeight: (variant: StatVariant, deltaSteps: number) => void
	  gearDbCommandError?: string | null
	  onClearGearDbCommandError?: () => void
	  gearDbCommandSuccess?: string | null
	  onClearGearDbCommandSuccess?: () => void
  filtersSynced?: boolean
  onToggleFiltersSynced?: (next: boolean) => void
  filterPresets?: readonly FilterPreset[]
  onSaveFilterPreset?: (name: string) => void
  onApplyFilterPreset?: (presetId: string) => void
  onDeleteFilterPreset?: (presetId: string) => void
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
    onSetTesterSubstatSortState,
	    onSetTesterSubstatSortDirection,
	    onToggleTesterSubstatSortKeepSections,
	    onToggleTesterSubstatSortExcludeGlyphs,
		    onToggleTesterSubstatSortPriority,
		    onToggleTesterSubstatSortPriorityFlipped,
		    onSetTesterSubstatSortWeight,
		    onBumpTesterSubstatSortWeight,
		    testerBuilding = false,
		    workloadProgressRatio,
		    gearDbCommandError,
		    onClearGearDbCommandError,
	    gearDbCommandSuccess,
    onClearGearDbCommandSuccess,
    filtersSynced = false,
    onToggleFiltersSynced,
    filterPresets = [],
    onSaveFilterPreset,
    onApplyFilterPreset,
    onDeleteFilterPreset,
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
	  const sortGlyphsLabel = t('testerSortGlyphsLabel')
	  const sortGlyphsExcludeLabel = t('testerSortGlyphsExclude')
	  const sortGlyphsIncludeLabel = t('testerSortGlyphsInclude')
	  const sortNormalizedLabel = t('testerSortNormalized')
	  const sortNormalizedTooltip = t('testerSortNormalizedTooltip')
  const sortNormalizedUseActiveLabel = t('testerSortNormalizedUseActive')
  const sortNormalizedUseActiveTooltip = t('testerSortNormalizedUseActiveTooltip')
  const normalizedPresetTooltipEmptyLabel = t('testerNormalizedPresetTooltipEmpty')
  const normalizedPresetTooltipRightClickHint = t('testerNormalizedPresetTooltipRightClickHint')
  const sortNormalizedPresetActionsOverwriteLabel = t('testerSortNormalizedPresetActionsOverwrite')
	  const sortHighToLowLabel = t('testerSortHighToLow')
	  const sortLowToHighLabel = t('testerSortLowToHigh')
	  const sortLastUsedLabel = t('testerLastUsedFilterLabel')
	  const sortGlyphInheritDirectionLabel = t('testerSortPerKeyInheritDirection')
	  const sortGlyphFlippedDirectionLabel = t('testerSortPerKeyFlippedDirection')
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
  const filterMenuEnabled = React.useMemo(() => {
    // The filter button menu is the entry point for presets + sync, so enable it when any are available.
    return Boolean(onToggleFiltersSynced) || Boolean(onSaveFilterPreset) || (filterPresets?.length ?? 0) > 0
  }, [filterPresets, onSaveFilterPreset, onToggleFiltersSynced])
  const [filterMenuAnchor, setFilterMenuAnchor] = React.useState<HTMLElement | null>(null)
  // Keep the close path stable so menu items can reuse it without re-render churn.
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

  const formatPresetSavedAt = React.useCallback((value: string) => {
    // Presets store ISO timestamps; local formatting keeps the menu scan-friendly.
    return formatLocalDateTime(value) ?? value
  }, [])

  const [savePresetOpen, setSavePresetOpen] = React.useState(false)
  const [savePresetName, setSavePresetName] = React.useState('')
  // Delete confirmation stores the target ID + label so duplicates remain unambiguous.
  const [deletePresetTarget, setDeletePresetTarget] = React.useState<{ id: string; name: string } | null>(null)

  const openSavePresetDialog = React.useCallback(() => {
    // Default to an empty field so repeated saves don't accidentally reuse prior input.
    setSavePresetName('')
    setSavePresetOpen(true)
  }, [])

  const closeSavePresetDialog = React.useCallback(() => {
    setSavePresetOpen(false)
  }, [])

  const confirmSavePreset = React.useCallback(() => {
    const name = savePresetName.trim()
    // Skip empty names; the dialog keeps the user in-context until it's valid.
    if (!name) return
    onSaveFilterPreset?.(name)
    setSavePresetOpen(false)
  }, [onSaveFilterPreset, savePresetName])

  const requestDeletePreset = React.useCallback((presetId: string, presetName: string) => {
    // Store a snapshot so list reorders never change which entry is being deleted.
    setDeletePresetTarget({ id: presetId, name: presetName })
  }, [])

  const cancelDeletePreset = React.useCallback(() => {
    setDeletePresetTarget(null)
  }, [])

  const confirmDeletePreset = React.useCallback(() => {
    if (!deletePresetTarget) return
    onDeleteFilterPreset?.(deletePresetTarget.id)
    setDeletePresetTarget(null)
  }, [deletePresetTarget, onDeleteFilterPreset])
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
	  // Normalized presets live in the tester-grid preference store; Sort reuses them for source selection + overwrite.
	  const normalizedOverlayPrefs = useTesterGridNormalizedOverlayPreferences()
	  const normalizedOverlayActive = normalizedOverlayPrefs.state.useSortWeights
	    || normalizedOverlayPrefs.state.enabledPresetIds.length > 0
	  const normalizedOverlayActiveAllowed = normalizedOverlayActive && !normalizedOverlayPrefs.state.useSortWeights
	  const sortPriorities = React.useMemo<readonly TesterSortKey[]>(() => {
	    // Prefer the persisted ordering, but keep a stable empty array so hooks remain deterministic.
	    return testerSubstatSort.priorities ?? []
	  }, [testerSubstatSort.priorities])
	  const sortFlipped = React.useMemo<readonly TesterSortKey[]>(() => {
	    // "Flipped" is a UI convenience: it means "sort opposite of the global direction for this key."
	    return testerSubstatSort.flipped ?? []
	  }, [testerSubstatSort.flipped])
	  const sortSelectedSubstats = React.useMemo(
	    () => sortPriorities.filter((key) => Number(key) !== TESTER_SORT_KEY_LAST_USAGE),
	    [sortPriorities],
	  )
	  const sortNormalizedPresetIdSet = React.useMemo(
	    () => new Set<number>((testerSubstatSort.normalizedSourcePresetIds ?? []).map((id) => Number(id))),
	    [testerSubstatSort.normalizedSourcePresetIds],
	  )
	  const sortNormalizedHasPresets = (testerSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 0
	  // Normalized is allowed when the current mode has at least one score source:
	  // - Active: uses the tester-grid overlay selection (but never when the overlay is [S] to avoid circular scoring).
	  // - Presets: best-of [1..9]
	  // - Custom: current selection/weights above
	  const sortNormalizedAllowed = testerSubstatSort.normalizedUseActiveOverlay
	    ? normalizedOverlayActiveAllowed
	    : (sortNormalizedHasPresets || sortSelectedSubstats.length > 0)
	  const sortNormalizedEnabled = Boolean(testerSubstatSort.normalized)
	  const sortNormalizedEffective = sortNormalizedEnabled && sortNormalizedAllowed
	  const sortNormalizedMultiPresetMode = sortNormalizedEffective
	    && testerSubstatSort.normalizedUseActiveOverlay !== true
	    && (testerSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 1
	  const sortNormalizedAmbiguousWeights = sortNormalizedEffective
	    // In Active mode we may be sourcing from multiple overlay presets, so no single weight vector can be shown.
	    && (testerSubstatSort.normalizedUseActiveOverlay === true || sortNormalizedMultiPresetMode)
	  const sortNormalizedDisplayedVariantSet = React.useMemo(() => {
	    // In Normalized mode, the "selected substats" row should reflect the *source* selection, not the transient
	    // weights/ordering state (especially when multiple sources are selected and we cannot show a single weight).
	    const set = new Set<number>()
	    if (!sortNormalizedEffective) {
	      sortSelectedSubstats.forEach((key) => set.add(Number(key)))
	      return set
	    }
	    // Active overlay = union of the tester-grid enabled preset variants.
	    if (testerSubstatSort.normalizedUseActiveOverlay) {
	      normalizedOverlayPrefs.state.enabledPresetIds.forEach((presetId) => {
	        const preset = normalizedOverlayPrefs.state.presets[presetId]
	        preset?.variants?.forEach((variant) => set.add(Number(variant)))
	      })
	      return set
	    }
	    // Presets mode = union of enabled preset variants.
	    const presetIds = testerSubstatSort.normalizedSourcePresetIds ?? []
	    presetIds.forEach((presetId) => {
	      const preset = normalizedOverlayPrefs.state.presets[presetId]
	      preset?.variants?.forEach((variant) => set.add(Number(variant)))
	    })
	    // Custom weights can be included as an extra source; include its selected keys in the union as well.
	    if (testerSubstatSort.normalizedSourceIncludeCustom) {
	      sortSelectedSubstats.forEach((key) => set.add(Number(key)))
	    }
	    return set
	  }, [
	    normalizedOverlayPrefs.state.enabledPresetIds,
	    normalizedOverlayPrefs.state.presets,
	    sortNormalizedEffective,
	    sortSelectedSubstats,
	    testerSubstatSort.normalizedSourceIncludeCustom,
	    testerSubstatSort.normalizedSourcePresetIds,
	    testerSubstatSort.normalizedUseActiveOverlay,
	  ])
	  const sortActive = !isRulesMode && (sortPriorities.length > 0 || sortNormalizedEffective)
	  // Disable non-normalized controls when they would do nothing (no priorities and normalized isn't effective).
	  const sortControlsDisabled = !sortActive
	  const sortLabelForKey = React.useCallback((key: TesterSortKey): string => {
	    if (Number(key) === TESTER_SORT_KEY_LAST_USAGE) return sortLastUsedLabel
	    return t(statVariantI18nKey(key as StatVariant))
	  }, [sortLastUsedLabel, t])
	  const sortButtonLabel = React.useMemo(() => {
	    if (isRulesMode) return sortLabel
	    if (sortNormalizedEffective) return sortNormalizedLabel
	    const [first] = sortPriorities
	    if (typeof first !== 'number') return sortLabel
	    const head = sortLabelForKey(first)
	    return sortPriorities.length > 1 ? `${head}...` : head
	  }, [isRulesMode, sortLabel, sortLabelForKey, sortNormalizedEffective, sortNormalizedLabel, sortPriorities])
	  const sortSpec = React.useMemo(() => ({
	    priorities: sortPriorities,
	    direction: testerSubstatSort.direction,
	    flipped: sortFlipped,
	    excludeGlyphs: testerSubstatSort.excludeGlyphs,
	    normalized: sortNormalizedEffective,
	  }), [sortFlipped, sortNormalizedEffective, sortPriorities, testerSubstatSort.direction, testerSubstatSort.excludeGlyphs])
  const sortStatFg = React.useCallback((variant: StatVariant) => {
    if (!useStatButtonColors) return undefined
    return substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
  }, [substatColors, useStatButtonColors])

	  const [sortMenuAnchor, setSortMenuAnchor] = React.useState<HTMLElement | null>(null)
	  const sortMenuOpen = Boolean(sortMenuAnchor)
	  const closeSortMenu = React.useCallback(() => { setSortMenuAnchor(null) }, [])
	  const sortMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
	  const [sortNormalizedPresetEditor, setSortNormalizedPresetEditor] = React.useState<{
	    presetId: TesterNormalizedPresetId
	    position: { x: number; y: number }
	  } | null>(null)
	  const sortNormalizedPresetEditorPaperRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: sortMenuOpen,
    onClose: closeSortMenu,
    menuRef: sortMenuPaperRef,
    // Treat nested preset menus as "inside" so editing/overwriting doesn't close the Sort popout.
    ...(sortNormalizedPresetEditor
      ? { insideRefs: [sortNormalizedPresetEditorPaperRef] }
      : {}),
  })
  React.useEffect(() => {
    // Switching back to Sellfile preview disables sorting, so close the menu to avoid a stuck popover.
    if (isRulesMode && sortMenuOpen) closeSortMenu()
  }, [closeSortMenu, isRulesMode, sortMenuOpen])

  const SORT_BUTTON_WIDTH_PX = 92
	  const breakNormalizedLinkToCustom = React.useCallback(() => {
	    // When a preset/active source is selected, editing should "fork" into custom weights.
	    const linked = testerSubstatSort.normalizedUseActiveOverlay
	      || (testerSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 0
	    if (!linked) return
	    onSetTesterSubstatSortState({
	      ...testerSubstatSort,
	      normalizedUseActiveOverlay: false,
	      normalizedSourcePresetIds: [],
	      normalizedSourceIncludeCustom: true,
	    })
	  }, [onSetTesterSubstatSortState, testerSubstatSort])
	  const handleToggleFlippedKey = React.useCallback((key: TesterSortKey) => {
	    breakNormalizedLinkToCustom()
	    onToggleTesterSubstatSortPriorityFlipped(key)
	  }, [breakNormalizedLinkToCustom, onToggleTesterSubstatSortPriorityFlipped])
	  const handleBumpWeight = React.useCallback((variant: StatVariant, deltaSteps: number) => {
	    breakNormalizedLinkToCustom()
	    onBumpTesterSubstatSortWeight(variant, deltaSteps)
	  }, [breakNormalizedLinkToCustom, onBumpTesterSubstatSortWeight])
	  const handleSetWeight = React.useCallback((variant: StatVariant, next: number) => {
	    breakNormalizedLinkToCustom()
	    onSetTesterSubstatSortWeight(variant, next)
	  }, [breakNormalizedLinkToCustom, onSetTesterSubstatSortWeight])
  const sortPopoutEasterEgg = useTesterSortPopoutEasterEgg({
    // Keep the “punishment” scoped to the open Sort popout so we don’t animate hidden nodes.
    enabled: sortMenuOpen,
    getPaperEl: () => sortMenuPaperRef.current,
	    onTogglePriority: (key) => {
	      breakNormalizedLinkToCustom()
	      onToggleTesterSubstatSortPriority(key)
	    },
	  })
	  React.useEffect(() => {
	    // Guardrail: "Active" mode cannot mirror an overlay that is itself [S] (it would be circular).
	    // Important: do NOT unlink just because the overlay is temporarily "off" (no preset selected).
	    // Why: the tester-grid context menu can clear presets briefly while switching combinations; Sort should
	    // remain in "Active/Grid" mode and resume once the overlay has a valid selection again.
	    if (!testerSubstatSort.normalizedUseActiveOverlay) return
	    if (!normalizedOverlayPrefs.state.useSortWeights) return
	    onSetTesterSubstatSortState({
	      ...testerSubstatSort,
	      normalizedUseActiveOverlay: false,
	      normalizedSourceIncludeCustom: (testerSubstatSort.normalizedSourcePresetIds?.length ?? 0) === 0,
	    })
	  }, [
	    normalizedOverlayPrefs.state.useSortWeights,
	    onSetTesterSubstatSortState,
	    testerSubstatSort,
	    testerSubstatSort.normalizedUseActiveOverlay,
	  ])
	  const buildCustomNormalizedPresetSnapshot = React.useCallback(() => {
	    // Preset overwrite uses the current Sort selection+weights as the snapshot source.
	    const variants = sortSelectedSubstats.map((key) => key as StatVariant)
	    const weights: Partial<Record<StatVariant, number>> = {}
	    variants.forEach((variant) => {
	      const raw = Number(testerSubstatSort.weights?.[variant] ?? TESTER_SORT_WEIGHT_DEFAULT)
	      // Neutral weights are omitted so preset storage stays compact and unambiguous.
	      if (isNeutralTesterSortWeight(raw)) return
	      weights[variant] = raw
	    })
	    return { variants, weights }
	  }, [sortSelectedSubstats, testerSubstatSort.weights])
	  // Keep clear icons from shifting layout when they appear/disappear.
	  const HEADER_CLEAR_PLACEHOLDER_SX = {
	    width: CLEAR_ICON_BUTTON_SIZE_PX,
	    height: CLEAR_ICON_BUTTON_SIZE_PX,
	    flexShrink: 0,
	  } as const

	  // Weight controls now live in `TesterSortWeightControls` so the Sort popout and tester-grid presets stay in sync.

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
                    // Left click toggles the filter panel; the preset menu is context-menu only.
                    onClick={() => onToggleFilter?.()}
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
              {!isRulesMode && (
                sortPriorities.length > 0
                || Boolean(testerSubstatSort.normalized)
              ) ? (
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
                {/* Always show Save-as so users can start capturing filter presets immediately. */}
                {onSaveFilterPreset ? (
                  <MenuItem
                    onClick={() => {
                      closeFilterMenu()
                      openSavePresetDialog()
                    }}
                  >
                    {t('filterPresetsSaveAs')}
                  </MenuItem>
                ) : null}
                {/* Saved presets are ordered newest-first and allow duplicate names. */}
                {filterPresets.length > 0 ? (
                  filterPresets.map((preset) => (
                    <MenuItem
                      key={preset.id}
                      onClick={() => {
                        onApplyFilterPreset?.(preset.id)
                        closeFilterMenu()
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        // Slight extra vertical padding keeps the 2-line label visually centered.
                        py: 0.75,
                      }}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          // Keep the text block vertically centered relative to the delete icon.
                          lineHeight: 1,
                        }}
                      >
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ ...ELLIPSIS_TEXT_SX, lineHeight: 1.2 }}
                        >
                          {preset.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          noWrap
                          sx={{
                            lineHeight: 1.1,
                            // Slightly lighter than standard secondary text so the name remains the focal point.
                            color: 'text.secondary',
                            opacity: 0.78,
                          }}
                        >
                          {formatPresetSavedAt(preset.savedAt)}
                        </Typography>
                      </Box>
                      {onDeleteFilterPreset ? (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={t('delete')}
                          onClick={(event) => {
                            // Prevent the parent MenuItem from applying while we're requesting delete.
                            try { event.stopPropagation() } catch {}
                            closeFilterMenu()
                            requestDeletePreset(preset.id, preset.name)
                          }}
                          sx={{ p: 0.5, alignSelf: 'center' }}
                        >
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      ) : null}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>
                    {t('filterPresetsEmpty')}
                  </MenuItem>
                )}
                {onToggleFiltersSynced ? (
                  <MenuItem
                    onClick={() => onToggleFiltersSynced(!filtersSynced)}
                    sx={{ mt: 0.5 }}
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
            <Dialog open={savePresetOpen} onClose={closeSavePresetDialog} maxWidth="xs" fullWidth>
              <DialogTitle>{t('filterPresetsSaveDialogTitle')}</DialogTitle>
              <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('filterPresetsSaveDialogHelper')}
                  </Typography>
                  <TextField
                    autoFocus
                    label={t('filterPresetsNameLabel')}
                    value={savePresetName}
                    onChange={(event) => setSavePresetName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmSavePreset()
                    }}
                    inputProps={{ maxLength: 80 }}
                  />
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={closeSavePresetDialog}>{t('cancel')}</Button>
                <Button variant="contained" onClick={confirmSavePreset} disabled={!savePresetName.trim()}>
                  {t('save')}
                </Button>
              </DialogActions>
            </Dialog>
            <Dialog open={Boolean(deletePresetTarget)} onClose={cancelDeletePreset} maxWidth="xs" fullWidth>
              <DialogTitle>{t('filterPresetsDeleteDialogTitle')}</DialogTitle>
              <DialogContent>
                <Typography variant="body2">
                  {t('filterPresetsDeleteDialogMessage', { name: deletePresetTarget?.name ?? '' })}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={cancelDeletePreset}>{t('cancel')}</Button>
                <Button color="error" variant="contained" onClick={confirmDeletePreset}>
                  {t('delete')}
                </Button>
              </DialogActions>
            </Dialog>
            <Menu
              open={sortMenuOpen}
              anchorEl={sortMenuAnchor}
              onClose={closeSortMenu}
              // MenuList adds default padding (8px) which makes the title block sit lower than other popovers (e.g., Rolls).
              MenuListProps={{ disablePadding: true }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  component: ContextMenuPaper,
                  onRequestClose: closeSortMenu,
                  closeLabel: t('close'),
                  overlay: (
                    <TesterSortPopoutEasterEggOverlay
                      state={sortPopoutEasterEgg.overlay}
                      onMicroConfirmYep={sortPopoutEasterEgg.microConfirmToggle}
                      onMicroConfirmStop={sortPopoutEasterEgg.forceExit}
                    />
                  ),
                  ref: sortMenuPaperRef,
                  sx: { width: 320, maxWidth: 'calc(100vw - 32px)', px: 0, py: 0 },
                } as unknown as MuiPaperProps,
              }}
            >
              {/* Title block mirrors the filter panel popouts so "Sort" feels like a first-class control. */}
              <Box sx={{ px: 2.25, pt: 2.25, pb: 1 }}>
                <ContextMenuTitle title={sortLabel} description={t('testerSortPopoverDescription')} />
              </Box>
	              {[...STAT_VARIANTS_PRIORITY, TESTER_SORT_KEY_LAST_USAGE as TesterSortKey].map((key) => {
	                const idx = sortPriorities.findIndex((v) => Number(v) === Number(key))
	                const label = sortLabelForKey(key)
	                const fg = Number(key) === TESTER_SORT_KEY_LAST_USAGE ? undefined : sortStatFg(key as StatVariant)
	                const active = sortNormalizedEffective
	                  ? sortNormalizedDisplayedVariantSet.has(Number(key))
	                  : idx >= 0
	                const perKeyFlipped = sortFlipped.some((v) => Number(v) === Number(key))
	                const priorityDisabled = sortNormalizedEffective
	                const isSyntheticKey = Number(key) === TESTER_SORT_KEY_LAST_USAGE
	                const rowDisabled = priorityDisabled && isSyntheticKey
	                const showPriorityBadges = active && !sortNormalizedEffective
	                // Weight controls only replace the active badges. When the row is not selected, always show the two ghost badges
	                // so the control column stays visually consistent in both Normalized and priority modes.
	                const showNormalizedSelectedBadge = sortNormalizedAmbiguousWeights && active && !isSyntheticKey
	                const showWeightControls = sortNormalizedEffective && active && !isSyntheticKey && !sortNormalizedAmbiguousWeights
	                const weightControlsEnabled = showWeightControls
	                const rawWeight = isSyntheticKey
	                  ? TESTER_SORT_WEIGHT_DEFAULT
	                  : Number(testerSubstatSort.weights?.[key as StatVariant] ?? TESTER_SORT_WEIGHT_DEFAULT)
		                return (
		                  <MenuItem
		                    key={key}
		                    data-tester-sort-key={Number(key)}
	                    disabled={rowDisabled}
	                    onClick={(event) => {
	                      if (rowDisabled) return
	                      sortPopoutEasterEgg.onPriorityToggle(key, event)
	                    }}
	                    sx={(theme) => ({
	                      gap: 1,
	                      alignItems: 'center',
	                      ...(rowDisabled ? { opacity: theme.palette.action.disabledOpacity } : {}),
                      ...(active ? { backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) } : {}),
                      '&:hover': {
                        backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
                      },
                    })}
                  >
                    <Typography
                      variant="body2"
                      // Prevent layout shifts when selecting rows: font weight + badges should never cause text wrapping.
                      noWrap
                      sx={(theme) => ({
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        ...(showPriorityBadges ? { fontWeight: theme.typography.fontWeightMedium ?? 600 } : {}),
                        ...(fg ? { color: fg } : {}),
                      })}
                      data-sort-popout-text
	                    >
	                      {label}
	                    </Typography>
	                    {/* Match the control column width used by the rows below (Direction/flags) so badges align visually. */}
	                    <Box
	                      sx={{
                        width: MENU_CONTROL_MIN_WIDTH_PX,
                        minWidth: MENU_CONTROL_MIN_WIDTH_PX,
                        // Keep the row height stable when the priority badges appear/disappear.
                        height: MENU_CONTROL_HEIGHT_PX,
                        minHeight: MENU_CONTROL_HEIGHT_PX,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
	                        justifyContent: 'center',
	                      }}
	                    >
	                      {showPriorityBadges ? (
	                        <Box
	                          component="span"
	                          onClick={priorityDisabled ? undefined : (event) => {
	                            // Badge clicks should never toggle the entire row; keep the behavior explicit and predictable.
                            event.preventDefault()
                            event.stopPropagation()
                            sortPopoutEasterEgg.onPriorityToggle(key, event)
                          }}
                          sx={(theme) => ({
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 22,
                            minWidth: 34,
                            px: 0.75,
                            // Priorities are interactive, so use the same rounded-rect radius as other clickable chips (e.g., Flex).
                            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                            fontSize: theme.typography.pxToRem(15),
                            fontWeight: 700,
                            letterSpacing: 0.1,
                            fontVariantNumeric: 'tabular-nums',
                            border: `1px solid ${alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.7 : 0.55)}`,
                            backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                            color: theme.palette.success.main,
                            cursor: priorityDisabled ? 'default' : 'pointer',
                            opacity: priorityDisabled ? 0.35 : 1,
                          })}
                          data-sort-popout-badge
	                        >
	                          {idx + 1}
	                        </Box>
	                      ) : showWeightControls ? (
		                        <TesterSortWeightControls
		                          label={label}
		                          enabled={weightControlsEnabled}
		                          weight={rawWeight}
		                          onBump={(deltaSteps) => handleBumpWeight(key as StatVariant, deltaSteps)}
		                          onReset={() => handleSetWeight(key as StatVariant, TESTER_SORT_WEIGHT_DEFAULT)}
		                        />
	                      ) : showNormalizedSelectedBadge ? (
	                        <Box
	                          component="span"
	                          aria-hidden
	                          // In multi-preset mode, weights cannot be represented per-row; show a simple "selected" badge instead.
	                          sx={(theme) => ({
	                            display: 'inline-flex',
	                            alignItems: 'center',
	                            justifyContent: 'center',
	                            height: 22,
	                            minWidth: 34,
	                            px: 0.75,
	                            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
	                            fontSize: theme.typography.pxToRem(14),
	                            fontWeight: 800,
	                            letterSpacing: 0.1,
	                            border: `1px solid ${alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.7 : 0.55)}`,
	                            backgroundColor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
	                            color: theme.palette.success.main,
	                            userSelect: 'none',
	                          })}
	                        >
	                          ✓
	                        </Box>
	                      ) : (
	                        <Box
	                          component="span"
	                          aria-hidden
                          // Show a subtle "ghost" priority badge so each row still reads as a selectable sort field,
                          // even before the user picks it (requested for Last Used + all substats).
                          sx={(theme) => ({
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 22,
                            minWidth: 34,
                            px: 0.75,
                            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                            boxSizing: 'border-box',
                            border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.22 : 0.14)}`,
                            backgroundColor: 'transparent',
                            cursor: priorityDisabled ? 'default' : 'pointer',
                            opacity: priorityDisabled ? 0.35 : 1,
	                          })}
	                        />
	                      )}
		                      {showPriorityBadges ? (
		                        <MarkdownTooltip markdown={perKeyFlipped ? sortGlyphFlippedDirectionLabel : sortGlyphInheritDirectionLabel}>
		                          <Box
		                            component="button"
		                            type="button"
                            aria-label={perKeyFlipped ? sortGlyphFlippedDirectionLabel : sortGlyphInheritDirectionLabel}
                            onClick={priorityDisabled ? undefined : (event) => {
                              // Per-key direction toggles should not affect the priority selection itself.
	                              event.preventDefault()
	                              event.stopPropagation()
	                              handleToggleFlippedKey(key)
	                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              margin: 0,
                              cursor: priorityDisabled ? 'default' : 'pointer',
                              font: 'inherit',
                              opacity: priorityDisabled ? 0.35 : 1,
                            }}
                          >
                            <Box
                              component="span"
                              sx={(theme) => ({
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: 22,
                                minWidth: 34,
                                px: 0.75,
                                borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                                fontSize: theme.typography.pxToRem(14),
                                fontWeight: 700,
                                letterSpacing: 0.1,
                                border: `1px solid ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.65 : 0.5)}`,
                                backgroundColor: alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.12 : 0.08),
                                color: theme.palette.info.main,
                              })}
                            >
                              {perKeyFlipped ? '⇵' : '⇅'}
                            </Box>
                          </Box>
	                        </MarkdownTooltip>
	                      ) : (showWeightControls || sortNormalizedAmbiguousWeights) ? null : (
	                        <Box
	                          component="span"
	                          aria-hidden
	                          // Render a second ghost badge slot (⇅/⇵ lives here in priority mode) so the control column feels consistent.
	                          sx={(theme) => ({
	                            display: 'inline-flex',
	                            alignItems: 'center',
	                            justifyContent: 'center',
	                            height: 22,
	                            minWidth: 34,
	                            px: 0.75,
	                            borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
	                            boxSizing: 'border-box',
	                            border: `1px solid ${alpha(theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.18 : 0.12)}`,
	                            backgroundColor: 'transparent',
	                            cursor: priorityDisabled ? 'default' : 'pointer',
	                            opacity: priorityDisabled ? 0.35 : 1,
	                          })}
	                        />
	                      )}
                    </Box>
                  </MenuItem>
                )
              })}
              <MenuItem
                sx={{ gap: 1, alignItems: 'center' }}
                disabled={sortControlsDisabled}
                onClick={() => onSetTesterSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortDirectionLabel}</Typography>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={sortControlsDisabled}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSetTesterSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')
                  }}
                >
	                  {sortSpec.direction === 'desc' ? sortHighToLowLabel : sortLowToHighLabel}
	                </Button>
	              </MenuItem>
	              <MenuItem
	                disableRipple
	                sx={{ gap: 1, alignItems: 'flex-start' }}
	              >
	                <MarkdownTooltip markdown={sortNormalizedTooltip} placement="top-start">
	                  <Typography
	                    variant="body2"
	                    sx={{ flex: 1, minWidth: 0, pt: 0.25 }}
	                    data-sort-popout-text
	                  >
	                    {sortNormalizedLabel}
	                  </Typography>
	                </MarkdownTooltip>
	                <Box component="span">
	                  <Stack direction="column" spacing={0.75} alignItems="flex-end">
	                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
	                        <MarkdownTooltip markdown={sortNormalizedTooltip} placement="top-start">
	                          <Box component="span">
	                            <Button
	                              size="small"
	                              variant={sortNormalizedEnabled ? 'contained' : 'outlined'}
	                              color="success"
	                              disabled={!sortNormalizedAllowed && !sortNormalizedEnabled}
	                              sx={{ minWidth: 54, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
	                              onClick={(event) => {
	                                event.stopPropagation()
	                                if (!sortNormalizedAllowed && !sortNormalizedEnabled) return
	                                // Turning Normalized off clears source selection so the UI is unambiguous.
	                                if (sortNormalizedEnabled) {
	                                  onSetTesterSubstatSortState({
	                                    ...testerSubstatSort,
	                                    normalized: false,
	                                    normalizedUseActiveOverlay: false,
	                                    normalizedSourcePresetIds: [],
	                                    normalizedSourceIncludeCustom: true,
	                                  })
	                                  return
	                                }
	                                onSetTesterSubstatSortState({ ...testerSubstatSort, normalized: true })
	                              }}
	                            >
	                              {t('commonOn')}
	                            </Button>
	                          </Box>
	                        </MarkdownTooltip>
	                      </Box>
	                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
	                        <MarkdownTooltip markdown={sortNormalizedUseActiveTooltip} placement="top-start">
	                          <Box component="span">
	                            <Button
	                              size="small"
	                              variant={testerSubstatSort.normalizedUseActiveOverlay ? 'contained' : 'outlined'}
	                              color="success"
	                              disabled={!normalizedOverlayActiveAllowed}
	                              sx={{
	                                minWidth: 28,
	                                width: 28,
	                                height: MENU_CONTROL_HEIGHT_PX,
	                                minHeight: MENU_CONTROL_HEIGHT_PX,
	                                lineHeight: 1,
	                                py: 0,
	                                px: 0,
	                              }}
	                              onClick={(event) => {
	                                event.stopPropagation()
	                                if (!normalizedOverlayActiveAllowed) return
	                                const enabling = !testerSubstatSort.normalizedUseActiveOverlay
	                                if (enabling) {
	                                  const overlayPresetId = normalizedOverlayPrefs.state.enabledPresetIds.length === 1
	                                    ? normalizedOverlayPrefs.state.enabledPresetIds[0] ?? null
	                                    : null
	                                  const overlayPreset = overlayPresetId != null ? normalizedOverlayPrefs.state.presets[overlayPresetId] : null
	                                  const overlayWeights: Partial<Record<StatVariant, number>> = {}
	                                  if (overlayPreset?.weights) {
	                                    for (const [variantRaw, weightRaw] of Object.entries(overlayPreset.weights)) {
	                                      const variant = Number(variantRaw) as StatVariant
	                                      const weight = Number(weightRaw)
	                                      if (!Number.isFinite(weight)) continue
	                                      if (isNeutralTesterSortWeight(weight)) continue
	                                      overlayWeights[variant] = weight
	                                    }
	                                  }
	                                  onSetTesterSubstatSortState({
	                                    ...testerSubstatSort,
	                                    normalized: true,
	                                    normalizedUseActiveOverlay: true,
	                                    normalizedSourcePresetIds: [],
	                                    normalizedSourceIncludeCustom: false,
	                                    ...(overlayPreset ? { priorities: overlayPreset.variants.slice(), flipped: [], weights: overlayWeights } : {}),
	                                  })
	                                  return
	                                }
	                                onSetTesterSubstatSortState({
	                                  ...testerSubstatSort,
	                                  normalizedUseActiveOverlay: false,
	                                  normalizedSourceIncludeCustom: (testerSubstatSort.normalizedSourcePresetIds?.length ?? 0) === 0,
	                                })
	                              }}
	                              aria-label={sortNormalizedUseActiveLabel}
	                            >
	                              <GridViewIcon sx={{ fontSize: 18 }} />
	                            </Button>
	                          </Box>
	                        </MarkdownTooltip>
	                        {Array.from({ length: 4 }).map((_, idx) => {
	                          const presetId = idx as TesterNormalizedPresetId
	                          const enabled = sortNormalizedPresetIdSet.has(presetId)
	                          const preset = normalizedOverlayPrefs.state.presets[presetId]
	                          const label = preset
	                            ? formatTesterNormalizedPresetButtonLabel(presetId, preset.iconId)
	                            : String(presetId + 1)
	                          const tooltipMarkdown = preset
	                            ? buildTesterNormalizedPresetTooltipMarkdown({
	                                title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
	                                preset,
	                                labelForVariant: (variant) => t(statVariantI18nKey(variant)),
	                                emptyLabel: normalizedPresetTooltipEmptyLabel,
	                                rightClickHint: normalizedPresetTooltipRightClickHint,
	                              })
	                            : normalizedPresetTooltipEmptyLabel
	                          return (
	                            <MarkdownTooltip
	                              key={`tester-sort-normalized-preset-tooltip-${presetId}`}
	                              markdown={tooltipMarkdown}
	                              placement="top-start"
	                            >
	                              <Box component="span">
	                                <Button
	                                  size="small"
	                                  variant={enabled ? 'contained' : 'outlined'}
	                                  color="success"
	                                  sx={{
	                                    minWidth: 28,
	                                    width: 28,
	                                    height: MENU_CONTROL_HEIGHT_PX,
	                                    minHeight: MENU_CONTROL_HEIGHT_PX,
	                                    lineHeight: 1,
	                                    py: 0,
	                                    px: 0,
	                                    fontSize: 18,
	                                  }}
	                                  onClick={(event) => {
	                                    event.stopPropagation()
	                                    const nextPresetIds = (() => {
	                                      // When Normalized is off, selecting a preset immediately enables Normalized and uses that preset.
	                                      if (!sortNormalizedEnabled) return [presetId]
	                                      const current = testerSubstatSort.normalizedSourcePresetIds ?? []
	                                      const set = new Set<number>(current.map((id) => Number(id)))
	                                      if (set.has(presetId)) {
	                                        set.delete(presetId)
	                                      } else {
	                                        set.add(presetId)
	                                      }
	                                      return [...set].sort((a, b) => a - b).map((id) => id as TesterNormalizedPresetId)
	                                    })()
	                                    const singlePresetId = nextPresetIds.length === 1 ? nextPresetIds[0]! : null
	                                    const singlePreset = singlePresetId != null ? normalizedOverlayPrefs.state.presets[singlePresetId] : null
	                                    const presetWeights: Partial<Record<StatVariant, number>> = {}
	                                    if (singlePreset?.weights) {
	                                      for (const [variantRaw, weightRaw] of Object.entries(singlePreset.weights)) {
	                                        const variant = Number(variantRaw) as StatVariant
	                                        const weight = Number(weightRaw)
	                                        if (!Number.isFinite(weight)) continue
	                                        if (isNeutralTesterSortWeight(weight)) continue
	                                        presetWeights[variant] = weight
	                                      }
	                                    }
	                                    onSetTesterSubstatSortState({
	                                      ...testerSubstatSort,
	                                      ...(sortNormalizedEnabled ? {} : { normalized: true }),
	                                      normalizedUseActiveOverlay: false,
	                                      normalizedSourcePresetIds: nextPresetIds,
	                                      normalizedSourceIncludeCustom: nextPresetIds.length === 0,
	                                      ...(singlePreset ? { priorities: singlePreset.variants.slice(), flipped: [], weights: presetWeights } : {}),
	                                    })
	                                  }}
	                                  onContextMenu={(event) => {
	                                    event.preventDefault()
	                                    event.stopPropagation()
	                                    // Presets can still be edited/overwritten even when Normalized is off.
	                                    setSortNormalizedPresetEditor({ presetId, position: { x: event.clientX, y: event.clientY } })
	                                  }}
	                                >
	                                  {label}
	                                </Button>
	                              </Box>
	                            </MarkdownTooltip>
	                          )
	                        })}
	                      </Stack>
	                      <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
	                        {Array.from({ length: TESTER_NORMALIZED_PRESET_COUNT - 4 }).map((_, offset) => {
	                          const idx = offset + 4
	                          const presetId = idx as TesterNormalizedPresetId
	                          const enabled = sortNormalizedPresetIdSet.has(presetId)
	                          const preset = normalizedOverlayPrefs.state.presets[presetId]
	                          const label = preset
	                            ? formatTesterNormalizedPresetButtonLabel(presetId, preset.iconId)
	                            : String(presetId + 1)
	                          const tooltipMarkdown = preset
	                            ? buildTesterNormalizedPresetTooltipMarkdown({
	                                title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
	                                preset,
	                                labelForVariant: (variant) => t(statVariantI18nKey(variant)),
	                                emptyLabel: normalizedPresetTooltipEmptyLabel,
	                                rightClickHint: normalizedPresetTooltipRightClickHint,
	                              })
	                            : normalizedPresetTooltipEmptyLabel
	                          return (
	                            <MarkdownTooltip
	                              key={`tester-sort-normalized-preset-tooltip-${presetId}`}
	                              markdown={tooltipMarkdown}
	                              placement="top-start"
	                            >
	                              <Box component="span">
	                                <Button
	                                  size="small"
	                                  variant={enabled ? 'contained' : 'outlined'}
	                                  color="success"
	                                  sx={{
	                                    minWidth: 28,
	                                    width: 28,
	                                    height: MENU_CONTROL_HEIGHT_PX,
	                                    minHeight: MENU_CONTROL_HEIGHT_PX,
	                                    lineHeight: 1,
	                                    py: 0,
	                                    px: 0,
	                                    fontSize: 18,
	                                  }}
	                                  onClick={(event) => {
	                                    event.stopPropagation()
	                                    const nextPresetIds = (() => {
	                                      // When Normalized is off, selecting a preset immediately enables Normalized and uses that preset.
	                                      if (!sortNormalizedEnabled) return [presetId]
	                                      const current = testerSubstatSort.normalizedSourcePresetIds ?? []
	                                      const set = new Set<number>(current.map((id) => Number(id)))
	                                      if (set.has(presetId)) {
	                                        set.delete(presetId)
	                                      } else {
	                                        set.add(presetId)
	                                      }
	                                      return [...set].sort((a, b) => a - b).map((id) => id as TesterNormalizedPresetId)
	                                    })()
	                                    const singlePresetId = nextPresetIds.length === 1 ? nextPresetIds[0]! : null
	                                    const singlePreset = singlePresetId != null ? normalizedOverlayPrefs.state.presets[singlePresetId] : null
	                                    const presetWeights: Partial<Record<StatVariant, number>> = {}
	                                    if (singlePreset?.weights) {
	                                      for (const [variantRaw, weightRaw] of Object.entries(singlePreset.weights)) {
	                                        const variant = Number(variantRaw) as StatVariant
	                                        const weight = Number(weightRaw)
	                                        if (!Number.isFinite(weight)) continue
	                                        if (isNeutralTesterSortWeight(weight)) continue
	                                        presetWeights[variant] = weight
	                                      }
	                                    }
	                                    onSetTesterSubstatSortState({
	                                      ...testerSubstatSort,
	                                      ...(sortNormalizedEnabled ? {} : { normalized: true }),
	                                      normalizedUseActiveOverlay: false,
	                                      normalizedSourcePresetIds: nextPresetIds,
	                                      normalizedSourceIncludeCustom: nextPresetIds.length === 0,
	                                      ...(singlePreset ? { priorities: singlePreset.variants.slice(), flipped: [], weights: presetWeights } : {}),
	                                    })
	                                  }}
	                                  onContextMenu={(event) => {
	                                    event.preventDefault()
	                                    event.stopPropagation()
	                                    // Presets can still be edited/overwritten even when Normalized is off.
	                                    setSortNormalizedPresetEditor({ presetId, position: { x: event.clientX, y: event.clientY } })
	                                  }}
	                                >
	                                  {label}
	                                </Button>
	                              </Box>
	                            </MarkdownTooltip>
	                          )
	                        })}
	                      </Stack>
	                  </Stack>
	                </Box>
	              </MenuItem>
              <MenuItem
                sx={{ gap: 1, alignItems: 'center' }}
	                disabled={sortControlsDisabled}
	                onClick={() => onToggleTesterSubstatSortKeepSections()}
	              >
	                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortKeepSectionsLabel}</Typography>
	                <Button
	                  size="small"
	                  variant={testerSubstatSort.keepSections ? 'contained' : 'outlined'}
	                  color="success"
                  disabled={sortControlsDisabled}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleTesterSubstatSortKeepSections()
                  }}
                >
	                  {testerSubstatSort.keepSections ? t('commonOn') : t('commonOff')}
	                </Button>
	              </MenuItem>
              <MenuItem
                sx={{ gap: 1, alignItems: 'center' }}
                disabled={sortControlsDisabled}
                onClick={() => onToggleTesterSubstatSortExcludeGlyphs()}
              >
	                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortGlyphsLabel}</Typography>
	                <Button
	                  size="small"
	                  // Keep both states visually consistent; the label communicates exclude vs include.
	                  variant="contained"
                  color="success"
                  disabled={sortControlsDisabled}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleTesterSubstatSortExcludeGlyphs()
                  }}
                >
                  {testerSubstatSort.excludeGlyphs ? sortGlyphsExcludeLabel : sortGlyphsIncludeLabel}
                </Button>
              </MenuItem>
            </Menu>
	            <TesterNormalizedPresetEditorMenu
	              open={Boolean(sortNormalizedPresetEditor)}
	              anchorPosition={sortNormalizedPresetEditor?.position ?? null}
	              presetId={(sortNormalizedPresetEditor?.presetId ?? 0) as TesterNormalizedPresetId}
	              preset={normalizedOverlayPrefs.state.presets[(sortNormalizedPresetEditor?.presetId ?? 0) as TesterNormalizedPresetId] ?? { iconId: DEFAULT_METASET_ICON_ID, variants: [], weights: {} }}
	              onClose={() => setSortNormalizedPresetEditor(null)}
	              onSetIconId={normalizedOverlayPrefs.setPresetIconId}
	              onOverwriteFromCurrent={(presetId) => {
	                const snapshot = buildCustomNormalizedPresetSnapshot()
	                if (snapshot.variants.length === 0) return
	                normalizedOverlayPrefs.overwritePreset(presetId, snapshot)
	              }}
	              overwriteFromCurrentLabel={sortNormalizedPresetActionsOverwriteLabel}
	              overwriteFromCurrentDisabled={sortSelectedSubstats.length === 0}
	              useStatButtonColors={useStatButtonColors}
	              substatColors={substatColors}
	              onToggleVariant={(presetId, variant) => normalizedOverlayPrefs.toggleVariant(presetId, variant)}
	              onBumpWeight={(presetId, variant, deltaSteps) => normalizedOverlayPrefs.bumpWeight(presetId, variant, deltaSteps)}
	              onSetWeight={(presetId, variant, next) => normalizedOverlayPrefs.setWeight(presetId, variant, next)}
	              onResetPreset={(presetId) => normalizedOverlayPrefs.resetPreset(presetId)}
	              paperRef={sortNormalizedPresetEditorPaperRef}
	            />
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
                  <Typography
                    component="span"
                    noWrap
                    // Match the inline toggle label treatment so the Button's fixed height stays visually centered.
                    sx={{ ...ELLIPSIS_TEXT_SX, width: '100%', textAlign: 'center', lineHeight: 1, display: 'block' }}
                    data-ellipsis-target
                  >
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
