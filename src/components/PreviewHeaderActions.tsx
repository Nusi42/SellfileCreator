import React from 'react'
import { Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Menu, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { keyframes, type Theme } from '@mui/material/styles'
import {
  ELLIPSIS_TEXT_SX,
  SAFE_TEXT_LINE_HEIGHT,
  COMPACT_HEADER_ACTION_BUTTON_BASE_SX,
  COMPACT_HEADER_ACTION_BUTTON_SX,
  SMALL_BUTTON_HEIGHT_PX,
	  CLEAR_ICON_BUTTON_SIZE_PX,
	  FILTER_HEADER_LABEL_MAX_WIDTH_PX,
	  SELLFILE_BUTTON_HEIGHT_PX,
	  TOTAL_RULE_COUNT_LIMIT,
	  ACCEPT_HSF_OR_DB_FILE_DIALOG,
	  MENU_CONTROL_HEIGHT_PX,
	  MENU_CONTROL_MIN_WIDTH_PX,
	  STATUS_CHIP_BORDER_RADIUS_PX,
	  SPLIT_BUTTON_MAIN_SX,
	  SPLIT_BUTTON_CHEVRON_SX,
	} from '../lib/constants'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import PublishIcon from '@mui/icons-material/Publish'
import FilePickerButton from './FilePickerButton'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { exportLabelTiers } from '../lib/exportLabelTiers'
import { useFittingLabel } from '../hooks/useFittingLabel'
import { EXPORT_LABEL_RESERVED_PX, EXPORT_BUTTON_MAX_WIDTH_PX, EXPORT_CHEVRON_RESERVED_PX } from '../lib/constants'
import ClearIconButton from './ClearIconButton'
import DirtyBadge from './DirtyBadge'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
// MarkdownTooltip keeps all preview tooltips (filter toggle, export warnings, etc.) aligned with the global styling/delay.
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'

import WorkloadProgressIndicator from './WorkloadProgressIndicator'
import GearInspectorOutcomeSummaryChip from './GearInspectorOutcomeSummaryChip'
import GearDiffDeltaChip from './GearDiffDeltaChip'
import type { GearDiffDelta } from '../hooks/useGearDiffCompare'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { MenuCycleRow } from './MenuCycleRow'
import { MenuToggleRow } from './MenuToggleRow'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import GridViewIcon from '@mui/icons-material/GridView'
import CategoryIcon from '@mui/icons-material/Category'
import GroupsIcon from '@mui/icons-material/Groups'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import VisibilityIcon from '@mui/icons-material/Visibility'
import HistoryIcon from '@mui/icons-material/History'
import {
  GEAR_INSPECTOR_SORT_KEY_NEWEST,
  isGearInspectorSyntheticSortKey,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE,
  GEAR_INSPECTOR_SORT_KEY_LAST_USAGE,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_GROUP_RANK,
  GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT,
  isNeutralGearInspectorSortWeight,
  isDefaultGearInspectorGroupingState,
  type GearInspectorSortKey,
  type GearInspectorSubstatSortDirection,
} from '../lib/gearInspectorSort'
import {
  GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT,
  buildGearInspectorNormalizedPresetTooltipMarkdown,
  formatGearInspectorNormalizedPresetButtonLabel,
  type GearInspectorNormalizedPresetId,
} from '../lib/gearInspectorNormalizedPresets'
import { DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, STAT_VARIANTS_PRIORITY, StatVariant, statVariantI18nKey } from '../lib/types'
import { useSubstatFgAdapter } from '../lib/themeContrastHooks'
import type { GearInspectorSubstatSortState } from '../state/gearInspectorSubstatSortPreferences'
import { useGearInspectorGridNormalizedOverlayPreferences } from '../state/gearInspectorGridNormalizedOverlayPreferences'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import type { FilterPreset } from '../state/filterPresetsPreference'
import type { SortPreset } from '../state/sortPresetsPreference'
import { formatLocalDateTime, buildDirtyTooltip } from '../lib/dateDisplay'
import { useGearInspectorSortPopoutEasterEgg } from '../hooks/useGearInspectorSortPopoutEasterEgg'
import GearInspectorSortPopoutEasterEggOverlay from './GearInspectorSortPopoutEasterEggOverlay'
import { GearInspectorSortWeightControls } from './GearInspectorSortWeightControls'
import { GearInspectorNormalizedPresetEditorMenu } from './GearInspectorNormalizedPresetEditorMenu'
import { DEFAULT_METASET_ICON_ID, metasetIconOptionById, type MetasetIconId } from '../lib/metasetIcons'
import { GlyphPicker } from './GlyphPicker'
import { PinnedPresetButtons, type PinnedPresetButtonDescriptor } from './PinnedPresetButtons'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import type { GearInspectorOutcomeSummary } from '../types/gearInspectorPreview'
import { GearDbHistoryMenu } from './GearDbHistoryMenu'
import type { GearDbDiffHistoryEntry } from '../lib/gearDbDiffToast'
import { ColorField, COLOR_FIELD_DEFAULT_VALUE } from './ColorField'


type ProgressChipProps = {
  progressRatio: number
  ariaLabel?: string | undefined
  children: React.ReactElement
}

// Match the Normalized preset buttons so grouping controls stay compact.
const GROUPING_ICON_BUTTON_SIZE_PX = 28
const GROUPING_ICON_PRIMARY_SX = { fontSize: 18 } as const

function ProgressChip({ progressRatio, ariaLabel, children }: ProgressChipProps) {
  const clampedRatio = Math.max(0, Math.min(1, progressRatio))
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {children}
      <WorkloadProgressIndicator progressRatio={clampedRatio} ariaLabel={ariaLabel} />
    </Box>
  )
}

// "Reference moved" cue: a highlighted arc chases once around the Diff button's border.
// Drives the registered --gd-ref-angle (see styles.css) so the conic-gradient angle
// interpolates; the gradient lives on a masked ::after ring so only the border lights up.
const diffReferenceBorderSpin = keyframes`
  to { --gd-ref-angle: 360deg; }
`

export default function PreviewHeaderActions(props: {
  mergedCount: number
  filteredCount?: number
  filterActive?: boolean
  onToggleFilter?: () => void
  // True when any filter-related setting deviates from defaults (including recipe filters).
  filtersDirty?: boolean
  // Clears filter state back to defaults (mirrors the old Reset Filters button).
  onClearFilters?: () => void
  onSelectFile: (file: File, context?: { shiftKey?: boolean }) => void | Promise<void>
  onClearBase: () => void
  baseRuleCount?: number
  onExport: () => void
  // Secondary action shown in the dropdown when a push endpoint is active — always downloads locally.
  onExportLocal?: () => void
  dedupeDefault: boolean
  onToggleDedupeDefault: (next: boolean) => void
  omitDisabledForExport: boolean
  onToggleOmitDisabled: (next: boolean) => void
  // When true, the sellfile is automatically pushed whenever unsaved changes are detected.
  // Only relevant when a push endpoint is active.
  autoPushEnabled: boolean
  onToggleAutoPush: (next: boolean) => void
  exportDisabled: boolean
  pushEndpoint?: string
  hsfDirty: boolean
  // Timestamp (ms) when the current unexported state began; drives the badge tooltip.
  hsfDirtySince?: number | null
  building?: boolean
  gearInspectorBuilding?: boolean
  workloadProgressRatio: number
  limitHit?: boolean
  previewMode: 'rules' | 'gearInspector'
  onChangePreviewMode: (mode: 'rules' | 'gearInspector') => void
  filterOpen: boolean
  gearInspectorCount?: number
  gearInspectorFilteredCount?: number
  // Outcome summary for the Gear Inspector header chip (filtered to current view).
  gearInspectorOutcomeSummary: GearInspectorOutcomeSummary
  // Unfiltered outcome summary so filtered ratios can show total context.
  gearInspectorOutcomeSummaryTotal: GearInspectorOutcomeSummary
  gearInspectorSubstatSort: GearInspectorSubstatSortState
  // Mirrors the Gear Inspector grid preference so the sort popover can match stat coloring.
  useStatButtonColors: boolean
  // Full color map so the sort popover can match the same per-stat colors as chips/toggles.
  substatColors: SubstatColorMap
	  onClearGearInspectorSubstatSort: () => void
	  onSetGearInspectorSubstatSortState: (next: GearInspectorSubstatSortState) => void
	  onSetGearInspectorSubstatSortDirection: (direction: GearInspectorSubstatSortDirection) => void
	  onToggleGearInspectorArtifactGroupBySet: () => void
	  onToggleGearInspectorArtifactGroupBySlot: () => void
	  onToggleGearInspectorAccessoryGroupByFaction: () => void
	  onToggleGearInspectorAccessoryGroupBySet: () => void
	  onToggleGearInspectorAccessoryGroupBySlot: () => void
	  onToggleGearInspectorGroupingHeaders: () => void
	  onToggleGearInspectorSubstatSortExcludeGlyphs: () => void
	  onToggleGearInspectorSubstatSortPriority: (key: GearInspectorSortKey) => void
	  onToggleGearInspectorSubstatSortPriorityFlipped: (key: GearInspectorSortKey) => void
	  onSetGearInspectorSubstatSortWeight: (variant: StatVariant, next: number) => void
	  onBumpGearInspectorSubstatSortWeight: (variant: StatVariant, deltaSteps: number) => void
	  gearDbCommandError?: string | null
	  onClearGearDbCommandError?: () => void
	  gearDbCommandSuccess?: string | null
	  onClearGearDbCommandSuccess?: () => void
	  // Session-only endpoint update history shown next to the Load button.
	  gearDbHistoryEntries: GearDbDiffHistoryEntry[]
  // Clears the endpoint update history list.
  onClearGearDbHistory: () => void
  // Hide endpoint success toast when enabled.
  hideGearDbUpdateToast: boolean
  // Toggle the endpoint success toast visibility.
  onToggleHideGearDbUpdateToast: (next: boolean) => void
  // Silently drops endpoint pushes while enabled; does not queue them for later.
  pauseEndpointUpdates: boolean
  // Toggle the endpoint push pause state.
  onTogglePauseEndpointUpdates: (next: boolean) => void
  filtersSynced?: boolean
  onToggleFiltersSynced?: (next: boolean) => void
  filterPresets?: readonly FilterPreset[]
  onSaveFilterPreset?: (name: string, includeSort: boolean, color: string | undefined, iconId: MetasetIconId | undefined, pinned: boolean, exclusive: boolean) => void
  onApplyFilterPreset?: (presetId: string) => void
  // Untoggle a pinned preset: OR presets subtract their selections; exclusive presets clear the filter.
  onUnapplyFilterPreset?: (presetId: string) => void
  onDeleteFilterPreset?: (presetId: string) => void
  onMoveFilterPreset?: (presetId: string, direction: 'up' | 'down') => void
  // Toggles hidden state; called with the new desired value so callers don't need to read current state.
  onHideFilterPreset?: (presetId: string, hidden: boolean) => void
  // Toggles the pinned (quick-toggle button) state; called with the new desired value.
  onTogglePinFilterPreset?: (presetId: string, pinned: boolean) => void
  // True when the preset's conditions are present in the live filter (containment for OR; exact snapshot for exclusive).
  isFilterPresetApplied?: (preset: FilterPreset) => boolean
  // True when the live filter state equals exactly what applying this preset from default produces (no extra conditions).
  isFilterPresetExactMatch?: (preset: FilterPreset) => boolean
  // False when the preset has no effect on the current panel (e.g. a Gear-Inspector-only preset
  // while the Sellfile preview is active) — such pinned buttons render disabled.
  isFilterPresetApplicable?: (preset: FilterPreset) => boolean
  sortPresets?: readonly SortPreset[]
  onSaveSortPreset?: (name: string, includeFilter: boolean, color: string | undefined, iconId: MetasetIconId | undefined, pinned: boolean, exclusive: boolean) => void
  onApplySortPreset?: (presetId: string) => void
  // Untoggle a pinned sort preset: OR presets subtract their stacked levels; exclusive presets clear the sort.
  onUnapplySortPreset?: (presetId: string) => void
  onDeleteSortPreset?: (presetId: string) => void
  onMoveSortPreset?: (presetId: string, direction: 'up' | 'down') => void
  onHideSortPreset?: (presetId: string, hidden: boolean) => void
  // Toggles the pinned (quick-toggle button) state; called with the new desired value.
  onTogglePinSortPreset?: (presetId: string, pinned: boolean) => void
  // True when the preset's sort conditions are present in the live sort state.
  isSortPresetApplied?: (preset: SortPreset) => boolean
  // Gear-diff mode (sell/keep before-vs-after). Only meaningful in Gear Inspector mode.
  // True when the diff split-view is currently shown in the preview area.
  diffModeActive?: boolean
  // True when auto-baseline mode is on (re-pins against the last undo checkpoint).
  diffAutoMode?: boolean
  // Toggle the diff split-view on/off (left-click on the diff button).
  onToggleDiffMode?: () => void
  // Pin the current state as the diff reference baseline (context-menu "Set reference").
  onSetDiffReference?: () => void
  // Toggle auto-baseline mode (context-menu "Auto").
  onToggleDiffAuto?: () => void
  // Whether the delta chip is visible. 'auto' shows it when a meaningful delta exists; 'off' hides it.
  diffChipMode?: 'off' | 'auto'
  onChangeDiffChipMode?: (mode: 'off' | 'auto') => void
  // Which verdict side the active Gear Inspector filter tests in the diff split-view.
  diffFilterMode?: 'any' | 'before' | 'after'
  onChangeDiffFilterMode?: (mode: 'any' | 'before' | 'after') => void
  // Signed before→after outcome deltas; rendered as a chip beside the Diff button when
  // the split-view is active.
  diffDelta?: GearDiffDelta | null
  // True briefly when the diff reference just changed; runs the Diff-button border-chase.
  diffReferencePulsing?: boolean
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
    onExportLocal,
    dedupeDefault,
    onToggleDedupeDefault,
    omitDisabledForExport,
    onToggleOmitDisabled,
    autoPushEnabled,
    onToggleAutoPush,
    exportDisabled,
    pushEndpoint,
    hsfDirty,
    hsfDirtySince,
    building = false,
    limitHit = false,
    previewMode,
    onChangePreviewMode,
    filterOpen,
    gearInspectorCount,
    gearInspectorFilteredCount,
    gearInspectorOutcomeSummary,
    gearInspectorOutcomeSummaryTotal,
    gearInspectorSubstatSort,
    useStatButtonColors,
    substatColors,
    onClearGearInspectorSubstatSort,
    onSetGearInspectorSubstatSortState,
	    onSetGearInspectorSubstatSortDirection,
	    onToggleGearInspectorArtifactGroupBySet,
	    onToggleGearInspectorArtifactGroupBySlot,
	    onToggleGearInspectorAccessoryGroupByFaction,
	    onToggleGearInspectorAccessoryGroupBySet,
	    onToggleGearInspectorAccessoryGroupBySlot,
	    onToggleGearInspectorGroupingHeaders,
	    onToggleGearInspectorSubstatSortExcludeGlyphs,
		    onToggleGearInspectorSubstatSortPriority,
		    onToggleGearInspectorSubstatSortPriorityFlipped,
		    onSetGearInspectorSubstatSortWeight,
		    onBumpGearInspectorSubstatSortWeight,
		    gearInspectorBuilding = false,
		    workloadProgressRatio,
		    gearDbCommandError,
		    onClearGearDbCommandError,
    gearDbCommandSuccess,
    onClearGearDbCommandSuccess,
    gearDbHistoryEntries,
    onClearGearDbHistory,
    hideGearDbUpdateToast,
    onToggleHideGearDbUpdateToast,
    pauseEndpointUpdates,
    onTogglePauseEndpointUpdates,
    filtersSynced = false,
    onToggleFiltersSynced,
    filterPresets = [],
    onSaveFilterPreset,
    onApplyFilterPreset,
    onUnapplyFilterPreset,
    onDeleteFilterPreset,
    onMoveFilterPreset,
    onHideFilterPreset,
    onTogglePinFilterPreset,
    isFilterPresetApplied,
    isFilterPresetExactMatch,
    isFilterPresetApplicable,
    sortPresets = [],
    onSaveSortPreset,
    onApplySortPreset,
    onUnapplySortPreset,
    onDeleteSortPreset,
    onMoveSortPreset,
    onHideSortPreset,
    onTogglePinSortPreset,
    isSortPresetApplied,
    diffModeActive = false,
    diffAutoMode = false,
    onToggleDiffMode,
    onSetDiffReference,
    onToggleDiffAuto,
    diffChipMode = 'auto',
    onChangeDiffChipMode,
    diffFilterMode = 'any',
    onChangeDiffFilterMode,
    diffDelta,
    diffReferencePulsing,
  } = props
  const isRulesMode = previewMode === 'rules'
  const { t } = useI18n()
  // Resolve the localized display name for a built-in filter preset; user presets use their stored name.
  // useCallback keeps identity stable so the pinned-button memos don't recompute every render.
  const filterPresetDisplayName = React.useCallback((p: FilterPreset): string => {
    if (!p.builtin) return p.name
    switch (p.id) {
      case 'builtin:all-artifacts':  return t('builtinFilterPresetAllArtifacts')
      case 'builtin:all-accessories': return t('builtinFilterPresetAllAccessories')
      case 'builtin:sell':            return t('builtinFilterPresetShowOnlySell')
      case 'builtin:scoped-sell':     return t('builtinFilterPresetScopedSell')
      default: return p.name
    }
  }, [t])
  // Resolve the localized display name for a built-in sort preset; user presets use their stored name.
  const sortPresetDisplayName = React.useCallback((p: SortPreset): string => {
    if (!p.builtin) return p.name
    switch (p.id) {
      case 'builtin:newest':             return t('builtinSortPresetNewest')
      case 'builtin:latest-used':        return t('builtinSortPresetLatestUsed')
      case 'builtin:spd':                return t('builtinSortPresetSpd')
      case 'builtin:spd-per-slot':       return t('builtinSortPresetSpdPerSlot')
      case 'builtin:improvement-chance': return t('builtinSortPresetImprovementChance')
      case 'builtin:safeguard-group-rank': return t('builtinSortPresetSafeguardGroupRank')
      case 'builtin:sort-ascending':     return t('builtinSortPresetAscending')
      case 'builtin:group-top-level':    return t('builtinSortPresetTopLevel')
      default: return p.name
    }
  }, [t])
  const mergedCountLabel = formatRulesCount(t, mergedCount, { limit: TOTAL_RULE_COUNT_LIMIT })
  const gearInspectorCountValue = Number.isFinite(gearInspectorCount) ? Math.max(0, Math.floor(gearInspectorCount ?? 0)) : 0
  const gearInspectorFilteredValue = Number.isFinite(gearInspectorFilteredCount) ? Math.max(0, Math.floor(gearInspectorFilteredCount ?? 0)) : gearInspectorCountValue
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(undefined), [])
  const formattedBaseRuleCount = typeof baseRuleCount === 'number' && baseRuleCount > 0
    ? numberFormatter.format(baseRuleCount)
    : null
  const baseRulesLabel = formattedBaseRuleCount
    ? (baseRuleCount === 1 ? t('loadedBaseRuleOne') : t('loadedBaseRuleMany', { n: formattedBaseRuleCount }))
    : null
  const gearInspectorTotalLabel = gearInspectorCountValue === 1
    ? t('gearInspectorItemsCountOne')
    : t('gearInspectorItemsCountMany', { n: numberFormatter.format(gearInspectorCountValue) })
  const gearInspectorFilteredLabel = gearInspectorFilteredValue === 1
    ? t('gearInspectorItemsCountOne')
    : t('gearInspectorItemsCountMany', { n: numberFormatter.format(gearInspectorFilteredValue) })
  const chipBaseLabel = isRulesMode
    ? (filterActive && typeof filteredCount === 'number'
      ? `${formatRulesCount(t, filteredCount, { limit: TOTAL_RULE_COUNT_LIMIT })} / ${mergedCountLabel}`
      : mergedCountLabel)
    : (filterActive && Number.isFinite(gearInspectorFilteredCount)
      ? `${gearInspectorFilteredLabel} / ${gearInspectorTotalLabel}`
      : gearInspectorTotalLabel)
  const buildingLabel = t('rulesBuilding')
  const isBuilding = isRulesMode ? building : gearInspectorBuilding
  const rulesChipLabel = chipBaseLabel
  const rulesChipMinChars = React.useMemo(
    () => Array.from(chipBaseLabel).length,
    [chipBaseLabel],
  )
  const rulesChipMinWidth = rulesChipMinChars > 0 ? `${rulesChipMinChars}ch` : undefined
  // Clamp determinate values from both rule and Gear Inspector builders so the UI never overflows.
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
  // Filtered totals only apply to the Gear Inspector header chip. The diff view is itself a filter
  // (it narrows the grid to changed rows), so render the scoped/total pair when it is active too.
  const showGearInspectorFilteredTotals = !isRulesMode && (Boolean(filterActive) || diffModeActive)
  // Build the rules-mode chip once so limit warnings can wrap it cleanly.
  const rulesModeChip = (
    <Chip label={rulesChipLabel} size="small" sx={rulesChipSx} aria-label={isBuilding ? buildingLabel : undefined} />
  )
  // Build the Gear Inspector summary chip so the header mirrors the note dialog.
  const gearInspectorModeChip = (
    <GearInspectorOutcomeSummaryChip
      summary={gearInspectorOutcomeSummary}
      totalSummary={gearInspectorOutcomeSummaryTotal}
      dimmed={chipProgressRatio > 0}
      showWhenEmpty
      showFilteredTotals={showGearInspectorFilteredTotals}
      ariaLabel={isBuilding ? buildingLabel : undefined}
    />
  )
  // Pick the chip that matches the active preview mode.
  const previewModeChip = isRulesMode ? rulesModeChip : gearInspectorModeChip

  const rulesModeLabel = t('previewModeRules')
  const gearInspectorModeLabel = t('previewModeGearInspector')
  const sortLabel = t('gearInspectorSortLabel')
  const sortClearLabel = t('gearInspectorSortClear')
  const sortDirectionLabel = t('gearInspectorSortDirection')
  const sortGlyphsLabel = t('gearInspectorSortGlyphsLabel')
	  const sortGlyphsExcludeLabel = t('gearInspectorSortGlyphsExclude')
	  const sortGlyphsIncludeLabel = t('gearInspectorSortGlyphsInclude')
	  const sortNormalizedLabel = t('gearInspectorSortNormalized')
	  const sortNormalizedTooltip = t('gearInspectorSortNormalizedTooltip')
  const sortNormalizedUseActiveLabel = t('gearInspectorSortNormalizedUseActive')
  const sortNormalizedUseActiveTooltip = t('gearInspectorSortNormalizedUseActiveTooltip')
  const normalizedPresetTooltipEmptyLabel = t('gearInspectorNormalizedPresetTooltipEmpty')
  const normalizedPresetTooltipRightClickHint = t('gearInspectorNormalizedPresetTooltipRightClickHint')
  const sortNormalizedPresetActionsOverwriteLabel = t('gearInspectorSortNormalizedPresetActionsOverwrite')
	  const sortHighToLowLabel = t('gearInspectorSortHighToLow')
	  const sortLowToHighLabel = t('gearInspectorSortLowToHigh')
	  const sortLastUsedLabel = t('gearInspectorLastUsedFilterLabel')
	  const sortNewestLabel = t('gearInspectorSortNewestLabel')
	  const sortImprovementChanceLabel = t('gearInspectorSortImprovementChanceLabel')
	  const sortSafeguardRankLabel = t('gearInspectorSortSafeguardRankLabel')
	  const sortSafeguardGroupRankLabel = t('gearInspectorSortSafeguardGroupRankLabel')
	  const sortGlyphInheritDirectionLabel = t('gearInspectorSortPerKeyInheritDirection')
	  const sortGlyphFlippedDirectionLabel = t('gearInspectorSortPerKeyFlippedDirection')
	  const sortGroupingArtifactsLabel = t('gearInspectorSortGroupingArtifactsLabel')
	  const sortGroupingAccessoriesLabel = t('gearInspectorSortGroupingAccessoriesLabel')
	  const sortGroupingNoHeadersLabel = t('gearInspectorSortGroupingNoHeadersLabel')
	  const sortGroupingNoHeadersTooltip = t('gearInspectorSortGroupingNoHeadersTooltip')
  const exportMenuEnabled = React.useMemo(
    // Also enabled when a local-export fallback is provided (push-mode split button).
    () => typeof onToggleDedupeDefault === 'function' || typeof onToggleOmitDisabled === 'function' || !!onExportLocal,
    [onToggleDedupeDefault, onToggleOmitDisabled, onExportLocal],
  )
  // Export options now open from a chevron (left-click menu); a standard MUI Menu
  // handles outside-click/Escape, so no right-click close guard or hint is needed.
  const [exportMenuAnchor, setExportMenuAnchor] = React.useState<HTMLElement | null>(null)
  const closeExportMenu = () => { setExportMenuAnchor(null) }
  const exportChevronRef = React.useRef<HTMLButtonElement | null>(null)
  // The header control row; its stable content width is useFittingLabel's measuring
  // boundary (budget = row width minus the left groups + the export group's fixed buttons),
  // so the export label shrinks to fit instead of overlapping or wrapping its neighbours.
  const exportHeaderRowRef = React.useRef<HTMLDivElement | null>(null)
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
  const filterHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.previewFilterMenu, {
    enabled: filterMenuEnabled && !filterMenuAnchor,
    text: t('contextMenuHint'),
  })

  // Sort preset context menu — right-click on the sort button, same pattern as the filter menu.
  const sortPresetMenuEnabled = React.useMemo(() => {
    return !isRulesMode && (Boolean(onSaveSortPreset) || (sortPresets?.length ?? 0) > 0)
  }, [isRulesMode, onSaveSortPreset, sortPresets])
  const [sortPresetMenuAnchor, setSortPresetMenuAnchor] = React.useState<HTMLElement | null>(null)
  const closeSortPresetMenu = React.useCallback(() => { setSortPresetMenuAnchor(null) }, [])
  const sortPresetMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(sortPresetMenuAnchor),
    onClose: closeSortPresetMenu,
    menuRef: sortPresetMenuPaperRef,
  })
  const sortPresetHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.previewSortPresetMenu, {
    enabled: sortPresetMenuEnabled && !sortPresetMenuAnchor,
    text: t('contextMenuHint'),
  })

  // Endpoint history icon should only appear when an endpoint is configured.
  const historyMenuEnabled = Boolean(pushEndpoint)
  // Anchor element for the endpoint update history menu.
  const [gearDbHistoryAnchor, setGearDbHistoryAnchor] = React.useState<HTMLElement | null>(null)
  // Close helper keeps the menu dismissal consistent across triggers.
  const closeGearDbHistoryMenu = React.useCallback(() => { setGearDbHistoryAnchor(null) }, [])
  // Anchor element for the endpoint history settings context menu.
  const [gearDbHistorySettingsAnchor, setGearDbHistorySettingsAnchor] = React.useState<HTMLElement | null>(null)
  // Close helper keeps the settings menu dismissal consistent across triggers.
  const closeGearDbHistorySettingsMenu = React.useCallback(() => { setGearDbHistorySettingsAnchor(null) }, [])
  // Paper ref enables right-click outside detection for the settings menu.
  const gearDbHistorySettingsMenuRef = React.useRef<HTMLDivElement | null>(null)
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(gearDbHistorySettingsAnchor),
    onClose: closeGearDbHistorySettingsMenu,
    menuRef: gearDbHistorySettingsMenuRef,
  })
  // Drop the menu if the endpoint disappears mid-session — render-time comparison pattern.
  const [prevHistoryMenuEnabled, setPrevHistoryMenuEnabled] = React.useState(historyMenuEnabled)
  if (historyMenuEnabled !== prevHistoryMenuEnabled) {
    setPrevHistoryMenuEnabled(historyMenuEnabled)
    if (!historyMenuEnabled) {
      if (gearDbHistoryAnchor) setGearDbHistoryAnchor(null)
      if (gearDbHistorySettingsAnchor) setGearDbHistorySettingsAnchor(null)
    }
  }
  // Open helper pins the menu to the icon button.
  const openGearDbHistoryMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    // Close settings if the user left-clicks the history button.
    setGearDbHistorySettingsAnchor(null)
    setGearDbHistoryAnchor(event.currentTarget)
  }, [])
  // Right-click opens the settings context menu instead of the history list.
  const openGearDbHistorySettingsMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!historyMenuEnabled) return
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    setGearDbHistoryAnchor(null)
    setGearDbHistorySettingsAnchor(event.currentTarget)
  }, [historyMenuEnabled])

  const formatPresetSavedAt = React.useCallback((value: string) => {
    // Presets store ISO timestamps; local formatting keeps the menu scan-friendly.
    return formatLocalDateTime(value) ?? value
  }, [])

  // When true, hidden presets are shown in the filter menu (dimmed) so users can unhide them.
  const [showHiddenFilterPresets, setShowHiddenFilterPresets] = React.useState(false)
  // Presets visible in the filter menu — hidden entries are suppressed unless show-hidden is on.
  const visibleFilterPresets = React.useMemo(
    () => filterPresets.filter((p) => !p.hidden || showHiddenFilterPresets),
    [filterPresets, showHiddenFilterPresets],
  )
  const hasHiddenFilterPresets = React.useMemo(() => filterPresets.some((p) => p.hidden), [filterPresets])

  // Same show-hidden toggle for the sort preset menu.
  const [showHiddenSortPresets, setShowHiddenSortPresets] = React.useState(false)
  const visibleSortPresets = React.useMemo(
    () => sortPresets.filter((p) => !p.hidden || showHiddenSortPresets),
    [sortPresets, showHiddenSortPresets],
  )
  const hasHiddenSortPresets = React.useMemo(() => sortPresets.some((p) => p.hidden), [sortPresets])

  // Resolve the glyph face for a preset: its catalog icon, or the name's first letter as a fallback.
  const presetButtonGlyph = React.useCallback((iconId: MetasetIconId | undefined, name: string): string => {
    if (iconId) return metasetIconOptionById(iconId).glyph
    const first = Array.from(name)[0]
    return first ? first.toUpperCase() : '•'
  }, [])

  // Pinned filter presets become quick-toggle buttons; hidden ones are excluded so the header matches the menu.
  const pinnedFilterButtons = React.useMemo<PinnedPresetButtonDescriptor[]>(
    () => filterPresets
      .filter((p) => p.pinned && !p.hidden)
      .map((p) => {
        const name = filterPresetDisplayName(p)
        // exactOptionalPropertyTypes: include color only when set so the descriptor stays field-absent.
        const colorField = p.color ? { color: p.color } : {}
        // Disable when the preset has no effect on the current panel (Gear-Inspector-only preset in Sellfile preview).
        const disabled = !(isFilterPresetApplicable?.(p) ?? true)
        return { id: p.id, name, glyph: presetButtonGlyph(p.iconId, name), active: isFilterPresetApplied?.(p) ?? false, disabled, ...colorField }
      }),
    [filterPresets, filterPresetDisplayName, presetButtonGlyph, isFilterPresetApplied, isFilterPresetApplicable],
  )
  // Same for sort presets — these sit next to the Sort button and only act in Gear Inspector mode.
  const pinnedSortButtons = React.useMemo<PinnedPresetButtonDescriptor[]>(
    () => sortPresets
      .filter((p) => p.pinned && !p.hidden)
      .map((p) => {
        const name = sortPresetDisplayName(p)
        const colorField = p.color ? { color: p.color } : {}
        return { id: p.id, name, glyph: presetButtonGlyph(p.iconId, name), active: isSortPresetApplied?.(p) ?? false, ...colorField }
      }),
    [sortPresets, sortPresetDisplayName, presetButtonGlyph, isSortPresetApplied],
  )
  // Show ✕ only when filters are dirty and the state doesn't exactly match exactly one pinned preset.
  const exactlyMatchedPinnedFilterCount = React.useMemo(
    () => (filterPresets ?? []).filter((p) => p.pinned && !p.hidden && (isFilterPresetExactMatch?.(p) ?? false)).length,
    [filterPresets, isFilterPresetExactMatch],
  )
  const anyPinnedSortActive = React.useMemo(() => pinnedSortButtons.some((b) => b.active), [pinnedSortButtons])

  const [savePresetOpen, setSavePresetOpen] = React.useState(false)
  const [savePresetName, setSavePresetName] = React.useState('')
  // Whether to include the current sort config in the filter preset snapshot (default off).
  const [savePresetIncludeSort, setSavePresetIncludeSort] = React.useState(false)
  // Empty string means "no color" (default); a #RRGGBB value sets the label text color.
  const [savePresetColor, setSavePresetColor] = React.useState('')
  // Chosen glyph for the preset; 'none' means no icon (the catalog's no-icon sentinel).
  const [savePresetIconId, setSavePresetIconId] = React.useState<MetasetIconId>(DEFAULT_METASET_ICON_ID)
  // Whether to surface the preset as a quick-toggle button next to the Filter button (default on).
  const [savePresetPinned, setSavePresetPinned] = React.useState(true)
  // When true, applying replaces the whole filter; when false (default), it ORs/merges into it.
  const [savePresetExclusive, setSavePresetExclusive] = React.useState(false)
  // Delete confirmation stores the target ID + label so duplicates remain unambiguous.
  const [deletePresetTarget, setDeletePresetTarget] = React.useState<{ id: string; name: string } | null>(null)

  const openSavePresetDialog = React.useCallback(() => {
    // Default to an empty field so repeated saves don't accidentally reuse prior input.
    setSavePresetName('')
    // Default the "include sort" opt-in to off so a saved filter preset stays filter-only unless asked.
    setSavePresetIncludeSort(false)
    // Reset color so the default (no color) is shown each time the dialog opens.
    setSavePresetColor('')
    // Reset icon to no-icon; pin defaults ON so saved presets surface as a header quick-toggle.
    setSavePresetIconId(DEFAULT_METASET_ICON_ID)
    setSavePresetPinned(true)
    // Default to OR/merge apply (exclusive off), matching the built-in presets.
    setSavePresetExclusive(false)
    setSavePresetOpen(true)
  }, [])

  const closeSavePresetDialog = React.useCallback(() => {
    setSavePresetOpen(false)
  }, [])

  const confirmSavePreset = React.useCallback(() => {
    const name = savePresetName.trim()
    // Skip empty names; the dialog keeps the user in-context until it's valid.
    if (!name) return
    // 'none' is the no-icon sentinel; pass undefined so the store keeps the field absent.
    const iconId = savePresetIconId === DEFAULT_METASET_ICON_ID ? undefined : savePresetIconId
    onSaveFilterPreset?.(name, savePresetIncludeSort, savePresetColor || undefined, iconId, savePresetPinned, savePresetExclusive)
    setSavePresetOpen(false)
  }, [onSaveFilterPreset, savePresetName, savePresetIncludeSort, savePresetColor, savePresetIconId, savePresetPinned, savePresetExclusive])

  // --- Sort preset dialog state ---------------------------------------------

  const [saveSortPresetOpen, setSaveSortPresetOpen] = React.useState(false)
  const [saveSortPresetName, setSaveSortPresetName] = React.useState('')
  // Default filter inclusion to true so the checkbox matches an "include everything" expectation.
  const [saveSortPresetIncludeFilter, setSaveSortPresetIncludeFilter] = React.useState(false)
  // Empty string means "no color" (default); a #RRGGBB value sets the label text color.
  const [saveSortPresetColor, setSaveSortPresetColor] = React.useState('')
  // Chosen glyph for the sort preset; 'none' means no icon.
  const [saveSortPresetIconId, setSaveSortPresetIconId] = React.useState<MetasetIconId>(DEFAULT_METASET_ICON_ID)
  // Whether to surface the sort preset as a quick-toggle button next to the Sort button (default on).
  const [saveSortPresetPinned, setSaveSortPresetPinned] = React.useState(true)
  // When true, applying replaces the whole sort; when false (default), it ORs/stacks onto it.
  const [saveSortPresetExclusive, setSaveSortPresetExclusive] = React.useState(false)
  const [deleteSortPresetTarget, setDeleteSortPresetTarget] = React.useState<{ id: string; name: string } | null>(null)

  const openSaveSortPresetDialog = React.useCallback(() => {
    setSaveSortPresetName('')
    // Default the "include filter" opt-in to off so a saved sort preset stays sort-only unless asked.
    setSaveSortPresetIncludeFilter(false)
    // Reset color so the default (no color) is shown each time the dialog opens.
    setSaveSortPresetColor('')
    // Reset icon to no-icon; pin defaults ON so saved presets surface as a header quick-toggle.
    setSaveSortPresetIconId(DEFAULT_METASET_ICON_ID)
    setSaveSortPresetPinned(true)
    // Default to OR/stack apply (exclusive off), matching the built-in sort presets.
    setSaveSortPresetExclusive(false)
    setSaveSortPresetOpen(true)
  }, [])

  const closeSaveSortPresetDialog = React.useCallback(() => {
    setSaveSortPresetOpen(false)
  }, [])

  const confirmSaveSortPreset = React.useCallback(() => {
    const name = saveSortPresetName.trim()
    if (!name) return
    // 'none' is the no-icon sentinel; pass undefined so the store keeps the field absent.
    const iconId = saveSortPresetIconId === DEFAULT_METASET_ICON_ID ? undefined : saveSortPresetIconId
    onSaveSortPreset?.(name, saveSortPresetIncludeFilter, saveSortPresetColor || undefined, iconId, saveSortPresetPinned, saveSortPresetExclusive)
    setSaveSortPresetOpen(false)
  }, [onSaveSortPreset, saveSortPresetName, saveSortPresetIncludeFilter, saveSortPresetColor, saveSortPresetIconId, saveSortPresetPinned, saveSortPresetExclusive])

  const requestDeleteSortPreset = React.useCallback((presetId: string, presetName: string) => {
    setDeleteSortPresetTarget({ id: presetId, name: presetName })
  }, [])

  const cancelDeleteSortPreset = React.useCallback(() => {
    setDeleteSortPresetTarget(null)
  }, [])

  const confirmDeleteSortPreset = React.useCallback(() => {
    if (!deleteSortPresetTarget) return
    onDeleteSortPreset?.(deleteSortPresetTarget.id)
    setDeleteSortPresetTarget(null)
  }, [deleteSortPresetTarget, onDeleteSortPreset])

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

  // "Hide" button in the filter delete-confirmation dialog — hides instead of destroying.
  const hideFilterPresetFromDialog = React.useCallback(() => {
    if (!deletePresetTarget) return
    onHideFilterPreset?.(deletePresetTarget.id, true)
    setDeletePresetTarget(null)
  }, [deletePresetTarget, onHideFilterPreset])

  // "Hide" button in the sort delete-confirmation dialog.
  const hideSortPresetFromDialog = React.useCallback(() => {
    if (!deleteSortPresetTarget) return
    onHideSortPreset?.(deleteSortPresetTarget.id, true)
    setDeleteSortPresetTarget(null)
  }, [deleteSortPresetTarget, onHideSortPreset])

  const filterLabel = filterActive ? t('filtersOn') : t('filtersOff')
  // When a push endpoint is active the destructive-export wording becomes "Push…",
  // mirroring the export/push button label toggle below.
  const pushActive = !!pushEndpoint
  const filterHeaderLabel = pushActive ? t('filterHeaderPush') : t('filterHeader')
  const filterTooltipLabel = pushActive ? t('filterTooltipPush') : t('filterTooltip')
  const filterToggleLabel = t('filterToggleLabel')
  // History menu toggle label keeps the context menu consistent across locales.
  const gearDbHistoryHideToastLabel = t('gearDbHistoryHideToast')
  const gearDbHistoryPauseUpdatesLabel = t('gearDbHistoryPauseUpdates')
  // Progressively-shortened label tiers (full → short → min); useFittingLabel below
  // picks the widest that fits the split button, collapsing to icon-only otherwise.
  // exportLabel stays the FULL tier — it backs the always-on tooltip and aria-label so
  // the full wording is discoverable even when the visible text is shortened or hidden.
  // Memoized so the array identity is stable across renders — useFittingLabel's measure
  // effect re-subscribes its ResizeObserver only when the tiers actually change.
  const exportLabelTierList = React.useMemo(
    () => exportLabelTiers(t, pushActive, !!baseRuleCount),
    [t, pushActive, baseRuleCount],
  )
  const exportLabel = exportLabelTierList[0]
  // Measure the button and pick the widest tier that fits; null → render icon-only.
  // idealWidth is the full label's footprint, requested as the wrapper width so a roomy
  // header lays the button out full-size while flex-shrink collapses it when tight.
  const { text: fittedExportLabel, idealWidth: exportIdealWidth, ref: exportLabelRef } = useFittingLabel({
    tiers: exportLabelTierList,
    reservedPx: EXPORT_LABEL_RESERVED_PX,
    // The chevron split-button (when shown) sits after the label inside the bounded row.
    trailingReservedPx: exportMenuEnabled ? EXPORT_CHEVRON_RESERVED_PX : 0,
    boundaryRef: exportHeaderRowRef,
  })
  const exportIcon = pushActive ? <PublishIcon /> : <FileDownloadIcon />
  const exportTooltipParts: string[] = []
  // When the visible label is shortened (or hidden in icon-only mode) surface the full
  // wording at the top of the tooltip so it stays discoverable; skip it when the full
  // tier is already shown to avoid redundant hover text. (aria-label always carries it.)
  if (fittedExportLabel !== exportLabel) {
    exportTooltipParts.push(exportLabel)
  }
  if (pushActive && pushEndpoint) {
    exportTooltipParts.push(t('pushSellfileTooltip', { endpoint: pushEndpoint }))
  }
  if (filterActive) {
    exportTooltipParts.push(pushActive ? t('pushIgnoresFilters') : t('exportIgnoresFilters'))
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
    backgroundColor: theme.vars?.palette[paletteKey].main ?? theme.palette[paletteKey].main,
    color: theme.vars?.palette[paletteKey].contrastText ?? theme.palette.getContrastText(theme.palette[paletteKey].main),
    border: `2px solid ${(theme.vars?.palette.divider ?? theme.palette.divider)}`,
    fontWeight: theme.typography.fontWeightBold ?? 600,
    fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(12) : '0.75rem',
    lineHeight: 1,
    zIndex: 1,
    padding: 0,
  }), [])

  // Close the export menu when its prerequisites disappear (e.g. mode switch).
  const [prevExportMenuEnabled, setPrevExportMenuEnabled] = React.useState(exportMenuEnabled)
  if (exportMenuEnabled !== prevExportMenuEnabled) {
    setPrevExportMenuEnabled(exportMenuEnabled)
    if (!exportMenuEnabled && exportMenuAnchor) setExportMenuAnchor(null)
  }
	  // Normalized presets live in the gear-inspector-grid preference store; Sort reuses them for source selection + overwrite.
	  const normalizedOverlayPrefs = useGearInspectorGridNormalizedOverlayPreferences()
	  const normalizedOverlayActive = normalizedOverlayPrefs.state.useSortWeights
	    || normalizedOverlayPrefs.state.enabledPresetIds.length > 0
	  const normalizedOverlayActiveAllowed = normalizedOverlayActive && !normalizedOverlayPrefs.state.useSortWeights
	  const sortPriorities = React.useMemo<readonly GearInspectorSortKey[]>(() => {
	    // Prefer the persisted ordering, but keep a stable empty array so hooks remain deterministic.
	    return gearInspectorSubstatSort.priorities ?? []
	  }, [gearInspectorSubstatSort.priorities])
	  const sortFlipped = React.useMemo<readonly GearInspectorSortKey[]>(() => {
	    // "Flipped" is a UI convenience: it means "sort opposite of the global direction for this key."
	    return gearInspectorSubstatSort.flipped ?? []
	  }, [gearInspectorSubstatSort.flipped])
	  const sortSelectedSubstats = React.useMemo(
	    () => sortPriorities.filter((key) => !isGearInspectorSyntheticSortKey(Number(key))),
	    [sortPriorities],
	  )
	  const sortNormalizedPresetIdSet = React.useMemo(
	    () => new Set<number>((gearInspectorSubstatSort.normalizedSourcePresetIds ?? []).map((id) => Number(id))),
	    [gearInspectorSubstatSort.normalizedSourcePresetIds],
	  )
	  const sortNormalizedHasPresets = (gearInspectorSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 0
	  // Normalized is allowed when the current mode has at least one score source:
	  // - Active: uses the gear-inspector-grid overlay selection (but never when the overlay is [S] to avoid circular scoring).
	  // - Presets: best-of [1..9]
	  // - Custom: current selection/weights above
	  const sortNormalizedAllowed = gearInspectorSubstatSort.normalizedUseActiveOverlay
	    ? normalizedOverlayActiveAllowed
	    : (sortNormalizedHasPresets || sortSelectedSubstats.length > 0)
	  const sortNormalizedEnabled = Boolean(gearInspectorSubstatSort.normalized)
	  const sortNormalizedEffective = sortNormalizedEnabled && sortNormalizedAllowed
	  const sortNormalizedMultiPresetMode = sortNormalizedEffective
	    && gearInspectorSubstatSort.normalizedUseActiveOverlay !== true
	    && (gearInspectorSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 1
	  const sortNormalizedAmbiguousWeights = sortNormalizedEffective
	    // In Active mode we may be sourcing from multiple overlay presets, so no single weight vector can be shown.
	    && (gearInspectorSubstatSort.normalizedUseActiveOverlay === true || sortNormalizedMultiPresetMode)
	  const sortNormalizedDisplayedVariantSet = React.useMemo(() => {
	    // In Normalized mode, the "selected substats" row should reflect the *source* selection, not the transient
	    // weights/ordering state (especially when multiple sources are selected and we cannot show a single weight).
	    const set = new Set<number>()
	    if (!sortNormalizedEffective) {
	      sortSelectedSubstats.forEach((key) => set.add(Number(key)))
	      return set
	    }
	    // Active overlay = union of the gear-inspector-grid enabled preset variants.
	    if (gearInspectorSubstatSort.normalizedUseActiveOverlay) {
	      normalizedOverlayPrefs.state.enabledPresetIds.forEach((presetId) => {
	        const preset = normalizedOverlayPrefs.state.presets[presetId]
	        preset?.variants?.forEach((variant) => set.add(Number(variant)))
	      })
	      return set
	    }
	    // Presets mode = union of enabled preset variants.
	    const presetIds = gearInspectorSubstatSort.normalizedSourcePresetIds ?? []
	    presetIds.forEach((presetId) => {
	      const preset = normalizedOverlayPrefs.state.presets[presetId]
	      preset?.variants?.forEach((variant) => set.add(Number(variant)))
	    })
	    // Custom weights can be included as an extra source; include its selected keys in the union as well.
	    if (gearInspectorSubstatSort.normalizedSourceIncludeCustom) {
	      sortSelectedSubstats.forEach((key) => set.add(Number(key)))
	    }
	    return set
	  }, [
	    normalizedOverlayPrefs.state.enabledPresetIds,
	    normalizedOverlayPrefs.state.presets,
	    sortNormalizedEffective,
	    sortSelectedSubstats,
	    gearInspectorSubstatSort.normalizedSourceIncludeCustom,
	    gearInspectorSubstatSort.normalizedSourcePresetIds,
	    gearInspectorSubstatSort.normalizedUseActiveOverlay,
	  ])
	  // A non-default direction ('asc') counts as an active sort even with no priorities, since it
	  // reverses the natural order (so the Sort button reflects it and the clear ✕ is offered).
	  const sortActive = !isRulesMode && (sortPriorities.length > 0 || sortNormalizedEffective || gearInspectorSubstatSort.direction === 'asc')
	  // Direction + glyph toggles stay enabled throughout Gear Inspector (even with no priorities) so a
	  // direction-only / glyphs-only sort preset can be configured and saved; only Rules mode disables them.
	  // Grouping is independent of sorting, but still irrelevant in Rules mode.
	  const groupingControlsDisabled = isRulesMode
	  // Grouping defaults keep the Sort clear button hidden until a user actually changes layout.
	  const groupingIsDefault = isDefaultGearInspectorGroupingState(gearInspectorSubstatSort.grouping)
	  // Snapshot the grouping choices once so the render logic stays readable.
	  const artifactGroupBySet = gearInspectorSubstatSort.grouping.artifacts.bySet
	  const artifactGroupBySlot = gearInspectorSubstatSort.grouping.artifacts.bySlot
	  const accessoryGroupByFaction = gearInspectorSubstatSort.grouping.accessories.byFaction
	  const accessoryGroupBySet = gearInspectorSubstatSort.grouping.accessories.bySet
	  const accessoryGroupBySlot = gearInspectorSubstatSort.grouping.accessories.bySlot
	  const groupingHideHeaders = gearInspectorSubstatSort.grouping.hideHeaders
	  // Localized grouping toggles drive the artifact/accessory rows in the sort popover.
	  const artifactGroupingToggles = [
	    {
	      key: 'set',
	      label: t('gearInspectorSortGroupingArtifactsSetLabel'),
	      tooltip: t('gearInspectorSortGroupingArtifactsSetTooltip'),
	      icon: <CategoryIcon sx={GROUPING_ICON_PRIMARY_SX} />,
	      active: artifactGroupBySet,
	      onToggle: onToggleGearInspectorArtifactGroupBySet,
	    },
	    {
	      key: 'slot',
	      label: t('gearInspectorSortGroupingArtifactsSlotLabel'),
	      tooltip: t('gearInspectorSortGroupingArtifactsSlotTooltip'),
	      icon: <GridViewIcon sx={GROUPING_ICON_PRIMARY_SX} />,
	      active: artifactGroupBySlot,
	      onToggle: onToggleGearInspectorArtifactGroupBySlot,
	    },
	  ] as const
	  const accessoryGroupingToggles = [
	    {
	      key: 'faction',
	      label: t('gearInspectorSortGroupingAccessoriesFactionLabel'),
	      tooltip: t('gearInspectorSortGroupingAccessoriesFactionTooltip'),
	      icon: <GroupsIcon sx={GROUPING_ICON_PRIMARY_SX} />,
	      active: accessoryGroupByFaction,
	      onToggle: onToggleGearInspectorAccessoryGroupByFaction,
	    },
	    {
	      key: 'set',
	      label: t('gearInspectorSortGroupingAccessoriesSetLabel'),
	      tooltip: t('gearInspectorSortGroupingAccessoriesSetTooltip'),
	      icon: <CategoryIcon sx={GROUPING_ICON_PRIMARY_SX} />,
	      active: accessoryGroupBySet,
	      onToggle: onToggleGearInspectorAccessoryGroupBySet,
	    },
	    {
	      key: 'slot',
	      label: t('gearInspectorSortGroupingAccessoriesSlotLabel'),
	      tooltip: t('gearInspectorSortGroupingAccessoriesSlotTooltip'),
	      icon: <GridViewIcon sx={GROUPING_ICON_PRIMARY_SX} />,
	      active: accessoryGroupBySlot,
	      onToggle: onToggleGearInspectorAccessoryGroupBySlot,
	    },
	  ] as const
	  const sortLabelForKey = React.useCallback((key: GearInspectorSortKey): string => {
	    if (Number(key) === GEAR_INSPECTOR_SORT_KEY_LAST_USAGE) return sortLastUsedLabel
	    if (Number(key) === GEAR_INSPECTOR_SORT_KEY_NEWEST) return sortNewestLabel
	    if (Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE) return sortImprovementChanceLabel
	    if (Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK) return sortSafeguardRankLabel
	    if (Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_GROUP_RANK) return sortSafeguardGroupRankLabel
	    return t(statVariantI18nKey(key as StatVariant))
	  }, [sortImprovementChanceLabel, sortLastUsedLabel, sortNewestLabel, sortSafeguardRankLabel, sortSafeguardGroupRankLabel, t])
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
	    direction: gearInspectorSubstatSort.direction,
	    flipped: sortFlipped,
	    excludeGlyphs: gearInspectorSubstatSort.excludeGlyphs,
	    normalized: sortNormalizedEffective,
	  }), [sortFlipped, sortNormalizedEffective, sortPriorities, gearInspectorSubstatSort.direction, gearInspectorSubstatSort.excludeGlyphs])
  const adaptStatFg = useSubstatFgAdapter()
  const sortStatFg = React.useCallback((variant: StatVariant) => {
    if (!useStatButtonColors) return undefined
    // Contrast-correct the user/preset color for legible text on the active scheme's surface.
    return adaptStatFg(substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant])
  }, [substatColors, useStatButtonColors, adaptStatFg])

	  const [sortMenuAnchor, setSortMenuAnchor] = React.useState<HTMLElement | null>(null)
	  const sortMenuOpen = Boolean(sortMenuAnchor)
	  const closeSortMenu = React.useCallback(() => { setSortMenuAnchor(null) }, [])
	  const sortMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
	  // Gear-diff button context menu (Set reference / Auto). Same anchored-Menu pattern as
	  // the sort/filter buttons. Diff mode is only available in Gear Inspector mode.
	  const [diffMenuAnchor, setDiffMenuAnchor] = React.useState<HTMLElement | null>(null)
	  const closeDiffMenu = React.useCallback(() => { setDiffMenuAnchor(null) }, [])
	  const diffModeEnabled = !isRulesMode && typeof onToggleDiffMode === 'function'
	  // Guard the diff menu so a right-click on another control cannot strand it open.
	  const diffMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
	  useContextMenuCloseOnOutsideRightClick({
	    open: Boolean(diffMenuAnchor),
	    onClose: closeDiffMenu,
	    menuRef: diffMenuPaperRef,
	  })
	  // Diff button "right-click for actions" hint, mirroring the filter/sort buttons.
	  const diffHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.previewDiffMenu, {
	    enabled: diffModeEnabled && !diffMenuAnchor,
	    text: t('contextMenuHint'),
	  })
	  const [sortNormalizedPresetEditor, setSortNormalizedPresetEditor] = React.useState<{
	    presetId: GearInspectorNormalizedPresetId
	    position: { x: number; y: number }
	  } | null>(null)
	  const sortNormalizedPresetEditorPaperRef = React.useRef<HTMLDivElement | null>(null)
  // Guard the sort menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: sortMenuGuard } = useContextMenuPaperGuard({
    open: sortMenuOpen,
    onClose: closeSortMenu,
    menuRef: sortMenuPaperRef,
    // Treat nested preset menus as "inside" so editing/overwriting doesn't close the Sort popout.
    ...(sortNormalizedPresetEditor
      ? { insideRefs: [sortNormalizedPresetEditorPaperRef] }
      : {}),
  })
  // Switching back to Sellfile preview disables sorting — render-time comparison pattern.
  const [prevIsRulesMode, setPrevIsRulesMode] = React.useState(isRulesMode)
  if (isRulesMode !== prevIsRulesMode) {
    setPrevIsRulesMode(isRulesMode)
    if (isRulesMode && sortMenuOpen) closeSortMenu()
  }

	  const breakNormalizedLinkToCustom = React.useCallback(() => {
	    // When a preset/active source is selected, editing should "fork" into custom weights.
	    const linked = gearInspectorSubstatSort.normalizedUseActiveOverlay
	      || (gearInspectorSubstatSort.normalizedSourcePresetIds?.length ?? 0) > 0
	    if (!linked) return
	    onSetGearInspectorSubstatSortState({
	      ...gearInspectorSubstatSort,
	      normalizedUseActiveOverlay: false,
	      normalizedSourcePresetIds: [],
	      normalizedSourceIncludeCustom: true,
	    })
	  }, [onSetGearInspectorSubstatSortState, gearInspectorSubstatSort])
	  const handleToggleFlippedKey = React.useCallback((key: GearInspectorSortKey) => {
	    breakNormalizedLinkToCustom()
	    onToggleGearInspectorSubstatSortPriorityFlipped(key)
	  }, [breakNormalizedLinkToCustom, onToggleGearInspectorSubstatSortPriorityFlipped])
	  const handleBumpWeight = React.useCallback((variant: StatVariant, deltaSteps: number) => {
	    breakNormalizedLinkToCustom()
	    onBumpGearInspectorSubstatSortWeight(variant, deltaSteps)
	  }, [breakNormalizedLinkToCustom, onBumpGearInspectorSubstatSortWeight])
	  const handleSetWeight = React.useCallback((variant: StatVariant, next: number) => {
	    breakNormalizedLinkToCustom()
	    onSetGearInspectorSubstatSortWeight(variant, next)
	  }, [breakNormalizedLinkToCustom, onSetGearInspectorSubstatSortWeight])
  const sortPopoutEasterEgg = useGearInspectorSortPopoutEasterEgg({
    // Keep the “punishment” scoped to the open Sort popout so we don’t animate hidden nodes.
    enabled: sortMenuOpen,
    getPaperEl: () => sortMenuPaperRef.current,
	    onTogglePriority: (key) => {
	      breakNormalizedLinkToCustom()
	      onToggleGearInspectorSubstatSortPriority(key)
	    },
	  })
	  React.useEffect(() => {
	    // Guardrail: "Active" mode cannot mirror an overlay that is itself [S] (it would be circular).
	    // Important: do NOT unlink just because the overlay is temporarily "off" (no preset selected).
	    // Why: the gear-inspector-grid context menu can clear presets briefly while switching combinations; Sort should
	    // remain in "Active/Grid" mode and resume once the overlay has a valid selection again.
	    if (!gearInspectorSubstatSort.normalizedUseActiveOverlay) return
	    if (!normalizedOverlayPrefs.state.useSortWeights) return
	    onSetGearInspectorSubstatSortState({
	      ...gearInspectorSubstatSort,
	      normalizedUseActiveOverlay: false,
	      normalizedSourceIncludeCustom: (gearInspectorSubstatSort.normalizedSourcePresetIds?.length ?? 0) === 0,
	    })
	  }, [
	    normalizedOverlayPrefs.state.useSortWeights,
	    onSetGearInspectorSubstatSortState,
	    gearInspectorSubstatSort,
	    gearInspectorSubstatSort.normalizedUseActiveOverlay,
	  ])
	  const buildCustomNormalizedPresetSnapshot = React.useCallback(() => {
	    // Preset overwrite uses the current Sort selection+weights as the snapshot source.
	    const variants = sortSelectedSubstats.map((key) => key as StatVariant)
	    const weights: Partial<Record<StatVariant, number>> = {}
	    variants.forEach((variant) => {
	      const raw = Number(gearInspectorSubstatSort.weights?.[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
	      // Neutral weights are omitted so preset storage stays compact and unambiguous.
	      if (isNeutralGearInspectorSortWeight(raw)) return
	      weights[variant] = raw
	    })
	    return { variants, weights }
	  }, [sortSelectedSubstats, gearInspectorSubstatSort.weights])
	  // Keep clear icons from shifting layout when they appear/disappear.
	  const HEADER_CLEAR_PLACEHOLDER_SX = {
	    width: CLEAR_ICON_BUTTON_SIZE_PX,
	    height: CLEAR_ICON_BUTTON_SIZE_PX,
	    flexShrink: 0,
	  } as const

	  // Weight controls now live in `GearInspectorSortWeightControls` so the Sort popout and gear-inspector-grid presets stay in sync.

  // Single source for the export control — the primary button plus, when options
  // exist, an attached chevron that opens the export menu. The dirty dot wraps ONLY
  // the primary button (not the chevron) so it sits over the action, not the menu
  // affordance. A flex row with a 1px gap keeps the theme's contained styling on
  // both halves (no ButtonGroup); the gap reads as a seam.
  // Localized "not saved since <time>" tooltip for the export badge dot.
  const hsfDirtyTooltip = buildDirtyTooltip(hsfDirtySince, t)
  // The export-action explanation wraps ONLY the button (not the badge/chevron) so
  // it never stacks with the dirty-dot's own tooltip when the cursor is on the dot.
  // Icon-only when the label is fully collapsed; affects icon placement + height locking.
  const exportIconOnly = fittedExportLabel === null
  const exportButtonNode = (
    <Button
      // Keep the icon as a leading startIcon when there's a label (gets margin-right);
      // icon-only renders it centered as the child. Either way the button height is locked
      // (below) so the glyph box stays identical — icon size never jumps between modes.
      startIcon={exportIconOnly ? undefined : exportIcon}
      // Fill the measured wrapper (which caps the width); the wrapper, not the button, owns
      // width so the label can shrink. Fixed height = the icon's box is constant whether or
      // not the label is shown, so collapsing to icon-only does not resize the glyph.
      sx={{
        whiteSpace: 'nowrap',
        px: 1.25,
        minWidth: 0,
        width: '100%',
        height: SELLFILE_BUTTON_HEIGHT_PX,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        // Drop the startIcon's trailing margin in icon-only mode so the glyph stays centered.
        ...(exportIconOnly ? { '& .MuiButton-startIcon': { mx: 0 } } : {}),
        ...(exportMenuEnabled ? SPLIT_BUTTON_MAIN_SX : {}),
      }}
      onClick={onExport}
      disabled={exportDisabled}
      data-tour-id="hsf.export"
      aria-label={exportLabel}
    >
      {/* Render the fitted tier; null → icon-only (the full label lives in the tooltip
          and aria-label). No EllipsisTooltip: we pre-fit, so the text never overflows. */}
      {exportIconOnly ? (
        exportIcon
      ) : (
        <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>
          {fittedExportLabel}
        </Typography>
      )}
    </Button>
  )
  const exportControl = (
    // Content-sized (NOT flex:1, so it never stretches and leaves a gap before the button).
    // useFittingLabel derives the budget from the boundary row's other children, so it needs
    // no stretch here. The hook reads the inner <button> for font; the fitted label means no
    // fixed width and no icon-only latch.
    <Box
      ref={exportLabelRef as React.Ref<HTMLDivElement>}
      component="span"
      sx={{ display: 'inline-flex', gap: '1px', flexShrink: 0, minWidth: 0, ml: 1 }}
    >
      <Box
        sx={{
          display: 'flex',
          minWidth: 0,
          flexShrink: 0,
          // Cap at the full label's footprint so a roomy row shows full text at natural size.
          maxWidth: exportIdealWidth > 0 ? Math.min(exportIdealWidth, EXPORT_BUTTON_MAX_WIDTH_PX) : EXPORT_BUTTON_MAX_WIDTH_PX,
        }}
      >
        <DirtyBadge active={hsfDirty} tooltip={hsfDirtyTooltip} sx={{ display: 'flex', flex: 1, minWidth: 0 }}>
          {(exportTooltip?.trim().length ?? 0) > 0 ? (
            /* Export tooltip strings can include lists, so route them through MarkdownTooltip for consistent formatting. */
            <MarkdownTooltip markdown={exportTooltip}>{exportButtonNode}</MarkdownTooltip>
          ) : exportButtonNode}
        </DirtyBadge>
      </Box>
      {/* Chevron opens the export options menu (no right-click anymore). */}
      {exportMenuEnabled ? (
        <Button
          ref={exportChevronRef}
          aria-label={t('exportSellfileMoreOptions')}
          aria-haspopup="menu"
          disabled={exportDisabled}
          onClick={() => setExportMenuAnchor(exportChevronRef.current)}
          // Match the main button's locked height so the split halves stay aligned.
          sx={{ ...SPLIT_BUTTON_CHEVRON_SX, height: SELLFILE_BUTTON_HEIGHT_PX }}
        >
          <ArrowDropDownIcon fontSize="small" />
        </Button>
      ) : null}
    </Box>
  )

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
        <ToggleButtonGroup
          size="small"
          value={previewMode}
          exclusive
          onChange={(_, next) => { if (next === 'rules' || next === 'gearInspector') onChangePreviewMode(next) }}
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
          <MarkdownTooltip markdown={t('previewModeRulesTooltip')}>
            <ToggleButton
              value="rules"
              aria-label={rulesModeLabel}
              sx={{ px: 1.25, minWidth: 0, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, textTransform: 'none' }}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{rulesModeLabel}</Typography>
            </ToggleButton>
          </MarkdownTooltip>
          <MarkdownTooltip markdown={t('previewModeGearInspectorTooltip')}>
            <ToggleButton
              value="gearInspector"
              aria-label={gearInspectorModeLabel}
              sx={{ px: 1.25, minWidth: 0, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, textTransform: 'none' }}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{gearInspectorModeLabel}</Typography>
            </ToggleButton>
          </MarkdownTooltip>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, minWidth: 0, alignItems: 'center' }}>
          {limitHit && !building && isRulesMode ? (
            <>
              {/* MarkdownTooltip ensures the limit warning uses the shared hover delay and Markdown formatting. */}
              <MarkdownTooltip markdown={limitTooltip}>
                <Box component="span" sx={{ display: 'inline-flex' }}>
                  <ProgressChip progressRatio={chipProgressRatio} ariaLabel={spinnerAriaLabel}>
                    {previewModeChip}
                  </ProgressChip>
                </Box>
              </MarkdownTooltip>
            </>
          ) : (
            <ProgressChip progressRatio={chipProgressRatio} ariaLabel={spinnerAriaLabel}>
              {previewModeChip}
            </ProgressChip>
          )}
          {baseRulesLabel ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ lineHeight: SAFE_TEXT_LINE_HEIGHT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {baseRulesLabel}
            </Typography>
          ) : null}
        </Stack>
        <Box sx={{ flex: 1 }} />
        {filterActive ? (
          // EllipsisTooltip surfaces the full label when it is clipped by a narrow panel.
          <EllipsisTooltip title={filterHeaderLabel}>
            <Typography
              variant="caption"
              noWrap
              data-ellipsis-target
              sx={{
                color: 'text.disabled',
                lineHeight: 1.2,
                maxWidth: FILTER_HEADER_LABEL_MAX_WIDTH_PX,
                textAlign: 'right',
                // Clip at one line; the tooltip carries the full text when truncated.
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {filterHeaderLabel}
            </Typography>
          </EllipsisTooltip>
        ) : null}
      </Stack>
      <Stack
        // Boundary for useFittingLabel: its stable, viewport-driven content width (minus the
        // left control groups + the export group's own fixed buttons) is the export label's
        // budget, so the budget never feeds back on the current label.
        ref={exportHeaderRowRef}
        direction="row"
        spacing={1}
        sx={{
          mb: 1,
          // Wrap control groups onto additional rows rather than overflowing/scrolling the header.
          flexWrap: 'wrap',
          rowGap: 1,
          minWidth: 0,
          alignItems: 'center',
          // Each group caps at the row width so its own contents wrap instead of overflowing.
          '& > *': { minWidth: 0, maxWidth: '100%' },
        }}
      >
        {onToggleFilter && (
          <>
            <Box sx={{ minWidth: 0, flexShrink: 1, display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
              {/* Filter toggle tooltip can now express list-style hints thanks to MarkdownTooltip. */}
              <MarkdownTooltip markdown={filterTooltipLabel}>
                <Box
                  component="span"
                  {...filterHint.triggerProps}
                  onContextMenu={(event) => {
                    if (!filterMenuEnabled) return
                    try {
                      event.preventDefault()
                      event.stopPropagation()
                    } catch {}
                    setFilterMenuAnchor(event.currentTarget as HTMLElement)
                    filterHint.onOpen()
                  }}
                >
                  <Button
                    size="small"
                    variant={filterActive ? 'contained' : 'outlined'}
                    color="success"
                    // Left click toggles the filter panel; the preset menu is context-menu only.
                    onClick={() => onToggleFilter?.()}
                    aria-pressed={filterActive}
                    aria-label={filterLabel}
                    // Share the compact sizing while keeping the chevron room flexible.
                    sx={{
                      ...COMPACT_HEADER_ACTION_BUTTON_BASE_SX,
                      flexShrink: 1,
                      minWidth: 0,
                      maxWidth: 220,
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
              {/* Pinned filter presets: icon-only quick toggles, sitting left of the clear ✕. Apply on click; clear when active. */}
              <PinnedPresetButtons
                buttons={pinnedFilterButtons}
                onToggle={(id, active) => { if (active) onUnapplyFilterPreset?.(id); else onApplyFilterPreset?.(id) }}
                ariaLabel={(name) => name}
                tooltip={(name) => name}
              />
              {/* Show the clear ✕ when dirty and the state doesn't match exactly one pinned preset. */}
              {filtersDirty && onClearFilters && exactlyMatchedPinnedFilterCount !== 1 ? (
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
            <Box sx={{ minWidth: 0, flexShrink: 1, display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, ml: 1, mr: 1 }}>
              <MarkdownTooltip markdown={t('gearInspectorSortTooltip')}>
                {/* Outer span carries the hint-tracking and right-click handlers. */}
                <Box
                  component="span"
                  {...sortPresetHint.triggerProps}
                  onContextMenu={(event) => {
                    if (!sortPresetMenuEnabled) return
                    try { event.preventDefault(); event.stopPropagation() } catch {}
                    // Close the sort popover if it happens to be open.
                    setSortMenuAnchor(null)
                    setSortPresetMenuAnchor(event.currentTarget as HTMLElement)
                    sortPresetHint.onOpen()
                  }}
                >
                  <Button
                    size="small"
                    variant={sortActive ? 'contained' : 'outlined'}
                    color="success"
                    disabled={isRulesMode}
                    onClick={(event) => {
                      if (isRulesMode) return
                      setSortMenuAnchor(event.currentTarget)
                    }}
                    aria-label={sortLabel}
                    // Shared sizing keeps Sort aligned with other compact header buttons.
                    sx={COMPACT_HEADER_ACTION_BUTTON_SX}
                  >
                    <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, width: '100%' }} data-ellipsis-target>
                      {sortButtonLabel}
                    </Typography>
                  </Button>
                </Box>
              </MarkdownTooltip>
              {/* Pinned sort presets sit left of the clear ✕; only act in Gear Inspector mode, so disable in Rules mode. */}
              <PinnedPresetButtons
                buttons={pinnedSortButtons}
                disabled={isRulesMode}
                onToggle={(id, active) => { if (active) onUnapplySortPreset?.(id); else onApplySortPreset?.(id) }}
                ariaLabel={(name) => name}
                tooltip={(name) => name}
              />
              {/* Hide the clear ✕ when a pinned sort preset is active — its button already clears. */}
              {!isRulesMode && !anyPinnedSortActive && (
                sortPriorities.length > 0
                || Boolean(gearInspectorSubstatSort.normalized)
                || gearInspectorSubstatSort.direction === 'asc'
                || !groupingIsDefault
              ) ? (
                <ClearIconButton
                  size="small"
                  aria-label={sortClearLabel}
                  tooltip={sortClearLabel}
                  onClick={() => onClearGearInspectorSubstatSort()}
                />
              ) : (
                <Box sx={{ ...HEADER_CLEAR_PLACEHOLDER_SX, pointerEvents: 'none' }} />
              )}
            </Box>
            {/* Gear-diff toggle: left-click shows/hides the before-vs-after split-view;
                right-click opens the Set reference / Auto context menu. Sits to the right
                of the sort cluster's clear ✕. */}
            <Box sx={{ minWidth: 0, flexShrink: 0, display: 'inline-flex', alignItems: 'center', ml: 1, mr: 1 }}>
              <MarkdownTooltip markdown={t('gearDiffToggleTooltip')}>
                <Box
                  component="span"
                  {...diffHint.triggerProps}
                  onContextMenu={(event) => {
                    if (!diffModeEnabled) return
                    try { event.preventDefault(); event.stopPropagation() } catch {}
                    setDiffMenuAnchor(event.currentTarget as HTMLElement)
                    diffHint.onOpen()
                  }}
                >
                  <Button
                    size="small"
                    variant={diffModeActive ? 'contained' : 'outlined'}
                    color={diffModeActive ? 'warning' : 'success'}
                    disabled={!diffModeEnabled}
                    onClick={() => { onToggleDiffMode?.() }}
                    aria-label={t('gearDiffToggleLabel')}
                    sx={[
                      COMPACT_HEADER_ACTION_BUTTON_SX,
                      // A highlighted arc chases once around the border when the reference moves.
                      diffReferencePulsing ? {
                        position: 'relative',
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 'inherit',
                          // Ring thickness: the conic gradient shows only in this padding band.
                          padding: '1.5px',
                          background: 'conic-gradient(from var(--gd-ref-angle, 0deg), transparent 0deg 250deg, var(--mui-palette-info-main) 312deg, transparent 360deg)',
                          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                          WebkitMaskComposite: 'xor',
                          maskComposite: 'exclude',
                          animation: `${diffReferenceBorderSpin} 1s linear`,
                          pointerEvents: 'none',
                        },
                      } : null,
                    ]}
                  >
                    <CompareArrowsIcon fontSize="small" sx={{ mr: 0.5 }} />
                    <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX }} data-ellipsis-target>
                      {t('gearDiffToggleLabel')}
                    </Typography>
                  </Button>
                </Box>
              </MarkdownTooltip>
            </Box>
            {/* Delta chip sits to the right of the Diff button whenever a meaningful diff
                exists (any non-zero metric), regardless of whether the split-view is open. */}
            {diffChipMode !== 'off' && diffDelta && (diffDelta.sold !== 0 || diffDelta.kept !== 0 || diffDelta.keptBySafeguards !== 0) ? (
              <Box sx={{ mr: 1, display: 'inline-flex', alignItems: 'center' }}>
                <GearDiffDeltaChip delta={diffDelta} />
              </Box>
            ) : null}
            {diffModeEnabled ? (
              <Menu
                anchorEl={diffMenuAnchor}
                open={Boolean(diffMenuAnchor)}
                onClose={closeDiffMenu}
                slotProps={{ paper: { ref: diffMenuPaperRef } }}
                // Left-align under the button like the Sort menu, not right-anchored.
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                {/* Manual pin: freeze the current state as the comparison baseline. */}
                <MenuItem onClick={() => { onSetDiffReference?.(); closeDiffMenu() }}>
                  {t('gearDiffSetReference')}
                </MenuItem>
                {/* Auto: re-pin the baseline against the last undo checkpoint automatically. */}
                <MenuToggleRow label={t('gearDiffAutoMode')} checked={diffAutoMode} onChange={() => { onToggleDiffAuto?.() }} />
                {/* Diff chip visibility: 'auto' shows the delta chip when non-zero; 'off' hides it. */}
                <MenuToggleRow label={t('gearDiffChipLabel')} checked={diffChipMode !== 'off'} onChange={() => { onChangeDiffChipMode?.(diffChipMode === 'off' ? 'auto' : 'off') }} />
                {/* Diff filter mode: which verdict side the active Gear Inspector filter tests. */}
                <MenuCycleRow
                  label={t('gearDiffFilterLabel')}
                  options={[
                    { value: 'before', label: t('gearDiffFilterBefore') },
                    { value: 'any', label: t('gearDiffFilterAny') },
                    { value: 'after', label: t('gearDiffFilterAfter') },
                  ]}
                  value={diffFilterMode}
                  onChange={(v) => { onChangeDiffFilterMode?.(v as 'any' | 'before' | 'after') }}
                />
              </Menu>
            ) : null}
            {filterHint.overlay}
            {sortPresetHint.overlay}
            {diffHint.overlay}
            {filterMenuEnabled ? (
              <Menu
                anchorEl={filterMenuAnchor}
                open={Boolean(filterMenuAnchor)}
                onClose={closeFilterMenu}
                slotProps={{ paper: { ref: filterMenuPaperRef } }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                {/* Saved presets: built-ins first, then user-defined with move/delete controls. */}
                {visibleFilterPresets.length > 0 ? (
                  visibleFilterPresets.map((preset, index) => (
                    <MenuItem
                      key={preset.id}
                      onClick={() => {
                        onApplyFilterPreset?.(preset.id)
                        closeFilterMenu()
                      }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.75, ...(preset.hidden ? { opacity: 0.45 } : {}) }}
                    >
                      {/* Glyph face mirrors the pinned button; tinted with the preset color when set. */}
                      {preset.iconId ? (
                        <Box component="span" aria-hidden sx={{ flexShrink: 0, fontSize: 16, width: 22, textAlign: 'center', ...(preset.color ? { color: preset.color } : {}) }}>
                          {metasetIconOptionById(preset.iconId).glyph}
                        </Box>
                      ) : null}
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1 }}>
                        {/* Apply label color when set; fall back to default inherited text color. */}
                        <Typography variant="body2" noWrap sx={{ ...ELLIPSIS_TEXT_SX, ...(preset.color ? { color: preset.color } : {}) }}>
                          {filterPresetDisplayName(preset)}
                        </Typography>
                        {/* Built-in presets carry no meaningful timestamp; show it only for user presets. */}
                        {!preset.builtin ? (
                          <Typography variant="caption" noWrap sx={{ lineHeight: SAFE_TEXT_LINE_HEIGHT, color: 'text.secondary', opacity: 0.78 }}>
                            {formatPresetSavedAt(preset.savedAt)}
                          </Typography>
                        ) : null}
                      </Box>
                      {onMoveFilterPreset ? (
                        <>
                          <IconButton
                            size="small"
                            aria-label={t('filterPresetsMoveUp')}
                            disabled={index === 0}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onMoveFilterPreset(preset.id, 'up')
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <ArrowUpwardIcon fontSize="inherit" />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={t('filterPresetsMoveDown')}
                            disabled={index === visibleFilterPresets.length - 1}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onMoveFilterPreset(preset.id, 'down')
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <ArrowDownwardIcon fontSize="inherit" />
                          </IconButton>
                        </>
                      ) : null}
                      {/* Thin separator visually splits the move controls from the pin toggle. */}
                      {onMoveFilterPreset && onTogglePinFilterPreset ? (
                        <Box sx={{ width: '1px', height: 16, bgcolor: 'divider', mx: 0.25, alignSelf: 'center', flexShrink: 0 }} />
                      ) : null}
                      {/* Pin/unpin toggle: surfaces (or removes) this preset as a header quick-toggle button. */}
                      {onTogglePinFilterPreset ? (
                        <MarkdownTooltip markdown={preset.pinned ? t('presetUnpin') : t('presetPin')}>
                          <IconButton
                            size="small"
                            aria-label={preset.pinned ? t('presetUnpin') : t('presetPin')}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onTogglePinFilterPreset(preset.id, !preset.pinned)
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            {preset.pinned ? <PushPinIcon fontSize="inherit" /> : <PushPinOutlinedIcon fontSize="inherit" />}
                          </IconButton>
                        </MarkdownTooltip>
                      ) : null}
                      {/* Builtin presets: hide/unhide toggle. User presets: delete button. */}
                      {preset.builtin ? (
                        onHideFilterPreset ? (
                          <MarkdownTooltip markdown={preset.hidden ? t('presetUnhide') : t('presetHide')}>
                            <IconButton
                              size="small"
                              aria-label={preset.hidden ? t('presetUnhide') : t('presetHide')}
                              onClick={(event) => {
                                try { event.stopPropagation() } catch {}
                                onHideFilterPreset(preset.id, !preset.hidden)
                              }}
                              sx={{ p: 0.5, alignSelf: 'center' }}
                            >
                              {preset.hidden ? <VisibilityIcon fontSize="inherit" /> : <VisibilityOffIcon fontSize="inherit" />}
                            </IconButton>
                          </MarkdownTooltip>
                        ) : null
                      ) : (
                        onDeleteFilterPreset ? (
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={t('delete')}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              closeFilterMenu()
                              requestDeletePreset(preset.id, filterPresetDisplayName(preset))
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        ) : null
                      )}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>
                    {t('filterPresetsEmpty')}
                  </MenuItem>
                )}
                {onToggleFiltersSynced ? (
                  <MenuToggleRow label={t('filterSyncViews')} checked={Boolean(filtersSynced)} onChange={() => onToggleFiltersSynced(!filtersSynced)} menuItemSx={{ mt: 0.5 }} />
                ) : null}
                {/* Save-as row: always last and non-reorderable. Show-hidden toggle lives at the right edge. */}
                {onSaveFilterPreset ? (
                  <MenuItem
                    onClick={() => {
                      closeFilterMenu()
                      openSavePresetDialog()
                    }}
                    sx={{ fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}
                  >
                    {t('filterPresetsSaveAs')}
                    {/* Show the toggle only when hidden presets exist; otherwise there's nothing to reveal. */}
                    {hasHiddenFilterPresets ? (
                      <MarkdownTooltip markdown={showHiddenFilterPresets ? t('presetsHideHidden') : t('presetsShowHidden')}>
                        <IconButton
                          size="small"
                          aria-label={showHiddenFilterPresets ? t('presetsHideHidden') : t('presetsShowHidden')}
                          onClick={(event) => {
                            try { event.stopPropagation() } catch {}
                            setShowHiddenFilterPresets((v) => !v)
                          }}
                          sx={{ p: 0.25, ml: 'auto', flexShrink: 0 }}
                        >
                          {showHiddenFilterPresets ? <VisibilityOffIcon fontSize="inherit" /> : <VisibilityIcon fontSize="inherit" />}
                        </IconButton>
                      </MarkdownTooltip>
                    ) : null}
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
                  {/* Name field + color swatch share one row via endAdornment — no extra layout needed. */}
                  <TextField
                    autoFocus
                    label={t('filterPresetsNameLabel')}
                    value={savePresetName}
                    onChange={(event) => setSavePresetName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmSavePreset()
                    }}
                    slotProps={{
                      htmlInput: { maxLength: 80 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            {/* Grey swatch = no color (click to start picking); colored swatch = active color + clear. */}
                            {savePresetColor ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                <ColorField value={savePresetColor} onChange={setSavePresetColor} />
                                <ClearIconButton tooltip={t('clear')} onClick={() => setSavePresetColor('')} />
                              </Box>
                            ) : (
                              <MarkdownTooltip markdown={t('presetLabelColor')}>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => setSavePresetColor(COLOR_FIELD_DEFAULT_VALUE)}
                                  sx={{ minWidth: 0, p: 0.25, color: 'text.disabled' }}
                                >
                                  <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: 'action.disabled', border: '1px solid', borderColor: 'divider' }} />
                                </Button>
                              </MarkdownTooltip>
                            )}
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  {/* Icon + pin row: choose a glyph and optionally surface a header quick-toggle button. */}
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" color="text.secondary">{t('presetIconLabel')}</Typography>
                      <GlyphPicker
                        value={savePresetIconId}
                        ariaLabel={t('presetIconPickerAria')}
                        onChange={setSavePresetIconId}
                      />
                    </Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={savePresetPinned}
                          onChange={(event) => setSavePresetPinned(event.target.checked)}
                        />
                      }
                      label={t('presetPinToHeader')}
                    />
                  </Stack>
                  {/* Allow the user to exclude sort so applying the preset preserves their current sort config. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={savePresetIncludeSort}
                        onChange={(event) => setSavePresetIncludeSort(event.target.checked)}
                      />
                    }
                    label={t('filterPresetsSaveIncludeSort')}
                  />
                  {/* Apply mode: unchecked (default) ORs the preset into the current filter; checked replaces it. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={savePresetExclusive}
                        onChange={(event) => setSavePresetExclusive(event.target.checked)}
                      />
                    }
                    label={t('filterPresetsSaveExclusive')}
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
                {/* Hide is a non-destructive alternative — keeps the preset in storage but removes it from the menu. */}
                {onHideFilterPreset ? (
                  <Button onClick={hideFilterPresetFromDialog}>{t('presetHide')}</Button>
                ) : null}
                <Button color="error" variant="contained" onClick={confirmDeletePreset}>
                  {t('delete')}
                </Button>
              </DialogActions>
            </Dialog>
            {/* Sort preset context menu — mirrors the filter preset menu, opened via right-click on Sort. */}
            {sortPresetMenuEnabled ? (
              <Menu
                anchorEl={sortPresetMenuAnchor}
                open={Boolean(sortPresetMenuAnchor)}
                onClose={closeSortPresetMenu}
                slotProps={{ paper: { ref: sortPresetMenuPaperRef } }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                {visibleSortPresets.length > 0 ? (
                  visibleSortPresets.map((preset, index) => (
                    <MenuItem
                      key={preset.id}
                      onClick={() => {
                        onApplySortPreset?.(preset.id)
                        closeSortPresetMenu()
                      }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.75, ...(preset.hidden ? { opacity: 0.45 } : {}) }}
                    >
                      {/* Glyph face mirrors the pinned button; tinted with the preset color when set. */}
                      {preset.iconId ? (
                        <Box component="span" aria-hidden sx={{ flexShrink: 0, fontSize: 16, width: 22, textAlign: 'center', ...(preset.color ? { color: preset.color } : {}) }}>
                          {metasetIconOptionById(preset.iconId).glyph}
                        </Box>
                      ) : null}
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1 }}>
                        {/* Apply label color when set; fall back to default inherited text color. */}
                        <Typography variant="body2" noWrap sx={{ ...ELLIPSIS_TEXT_SX, ...(preset.color ? { color: preset.color } : {}) }}>
                          {sortPresetDisplayName(preset)}
                        </Typography>
                        {/* Built-in presets have no meaningful timestamp; skip the caption. */}
                        {!preset.builtin ? (
                          <Typography variant="caption" noWrap sx={{ lineHeight: SAFE_TEXT_LINE_HEIGHT, color: 'text.secondary', opacity: 0.78 }}>
                            {formatPresetSavedAt(preset.savedAt)}
                          </Typography>
                        ) : null}
                      </Box>
                      {onMoveSortPreset ? (
                        <>
                          <IconButton
                            size="small"
                            aria-label={t('filterPresetsMoveUp')}
                            disabled={index === 0}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onMoveSortPreset(preset.id, 'up')
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <ArrowUpwardIcon fontSize="inherit" />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={t('filterPresetsMoveDown')}
                            disabled={index === visibleSortPresets.length - 1}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onMoveSortPreset(preset.id, 'down')
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <ArrowDownwardIcon fontSize="inherit" />
                          </IconButton>
                        </>
                      ) : null}
                      {/* Thin separator visually splits the move controls from the pin toggle. */}
                      {onMoveSortPreset && onTogglePinSortPreset ? (
                        <Box sx={{ width: '1px', height: 16, bgcolor: 'divider', mx: 0.25, alignSelf: 'center', flexShrink: 0 }} />
                      ) : null}
                      {/* Pin/unpin toggle: surfaces (or removes) this preset as a header quick-toggle button. */}
                      {onTogglePinSortPreset ? (
                        <MarkdownTooltip markdown={preset.pinned ? t('presetUnpin') : t('presetPin')}>
                          <IconButton
                            size="small"
                            aria-label={preset.pinned ? t('presetUnpin') : t('presetPin')}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              onTogglePinSortPreset(preset.id, !preset.pinned)
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            {preset.pinned ? <PushPinIcon fontSize="inherit" /> : <PushPinOutlinedIcon fontSize="inherit" />}
                          </IconButton>
                        </MarkdownTooltip>
                      ) : null}
                      {/* Builtin presets: hide/unhide toggle. User presets: delete button. */}
                      {preset.builtin ? (
                        onHideSortPreset ? (
                          <MarkdownTooltip markdown={preset.hidden ? t('presetUnhide') : t('presetHide')}>
                            <IconButton
                              size="small"
                              aria-label={preset.hidden ? t('presetUnhide') : t('presetHide')}
                              onClick={(event) => {
                                try { event.stopPropagation() } catch {}
                                onHideSortPreset(preset.id, !preset.hidden)
                              }}
                              sx={{ p: 0.5, alignSelf: 'center' }}
                            >
                              {preset.hidden ? <VisibilityIcon fontSize="inherit" /> : <VisibilityOffIcon fontSize="inherit" />}
                            </IconButton>
                          </MarkdownTooltip>
                        ) : null
                      ) : (
                        onDeleteSortPreset ? (
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={t('delete')}
                            onClick={(event) => {
                              try { event.stopPropagation() } catch {}
                              closeSortPresetMenu()
                              requestDeleteSortPreset(preset.id, sortPresetDisplayName(preset))
                            }}
                            sx={{ p: 0.5, alignSelf: 'center' }}
                          >
                            <DeleteIcon fontSize="inherit" />
                          </IconButton>
                        ) : null
                      )}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>{t('sortPresetsEmpty')}</MenuItem>
                )}
                {/* Save-as row: always last and non-reorderable. Show-hidden toggle lives at the right edge. */}
                {onSaveSortPreset ? (
                  <MenuItem
                    onClick={() => {
                      closeSortPresetMenu()
                      openSaveSortPresetDialog()
                    }}
                    sx={{ fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}
                  >
                    {t('sortPresetsSaveAs')}
                    {hasHiddenSortPresets ? (
                      <MarkdownTooltip markdown={showHiddenSortPresets ? t('presetsHideHidden') : t('presetsShowHidden')}>
                        <IconButton
                          size="small"
                          aria-label={showHiddenSortPresets ? t('presetsHideHidden') : t('presetsShowHidden')}
                          onClick={(event) => {
                            try { event.stopPropagation() } catch {}
                            setShowHiddenSortPresets((v) => !v)
                          }}
                          sx={{ p: 0.25, ml: 'auto', flexShrink: 0 }}
                        >
                          {showHiddenSortPresets ? <VisibilityOffIcon fontSize="inherit" /> : <VisibilityIcon fontSize="inherit" />}
                        </IconButton>
                      </MarkdownTooltip>
                    ) : null}
                  </MenuItem>
                ) : null}
              </Menu>
            ) : null}
            <Dialog open={saveSortPresetOpen} onClose={closeSaveSortPresetDialog} maxWidth="xs" fullWidth>
              <DialogTitle>{t('sortPresetsSaveDialogTitle')}</DialogTitle>
              <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('sortPresetsSaveDialogHelper')}
                  </Typography>
                  {/* Name field + color swatch share one row via endAdornment — no extra layout needed. */}
                  <TextField
                    autoFocus
                    label={t('filterPresetsNameLabel')}
                    value={saveSortPresetName}
                    onChange={(event) => setSaveSortPresetName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmSaveSortPreset()
                    }}
                    slotProps={{
                      htmlInput: { maxLength: 80 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            {/* Grey swatch = no color (click to start picking); colored swatch = active color + clear. */}
                            {saveSortPresetColor ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                <ColorField value={saveSortPresetColor} onChange={setSaveSortPresetColor} />
                                <ClearIconButton tooltip={t('clear')} onClick={() => setSaveSortPresetColor('')} />
                              </Box>
                            ) : (
                              <MarkdownTooltip markdown={t('presetLabelColor')}>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => setSaveSortPresetColor(COLOR_FIELD_DEFAULT_VALUE)}
                                  sx={{ minWidth: 0, p: 0.25, color: 'text.disabled' }}
                                >
                                  <Box sx={{ width: 14, height: 14, borderRadius: 0.5, bgcolor: 'action.disabled', border: '1px solid', borderColor: 'divider' }} />
                                </Button>
                              </MarkdownTooltip>
                            )}
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  {/* Icon + pin row: choose a glyph and optionally surface a header quick-toggle button. */}
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body2" color="text.secondary">{t('presetIconLabel')}</Typography>
                      <GlyphPicker
                        value={saveSortPresetIconId}
                        ariaLabel={t('presetIconPickerAria')}
                        onChange={setSaveSortPresetIconId}
                      />
                    </Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={saveSortPresetPinned}
                          onChange={(event) => setSaveSortPresetPinned(event.target.checked)}
                        />
                      }
                      label={t('presetPinToHeader')}
                    />
                  </Stack>
                  {/* Allow the user to exclude filter state so applying the preset preserves their current filters. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={saveSortPresetIncludeFilter}
                        onChange={(event) => setSaveSortPresetIncludeFilter(event.target.checked)}
                      />
                    }
                    label={t('sortPresetsSaveIncludeFilter')}
                  />
                  {/* Apply mode: unchecked (default) stacks the preset onto the current sort; checked replaces it. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={saveSortPresetExclusive}
                        onChange={(event) => setSaveSortPresetExclusive(event.target.checked)}
                      />
                    }
                    label={t('sortPresetsSaveExclusive')}
                  />
                </Stack>
              </DialogContent>
              <DialogActions>
                <Button onClick={closeSaveSortPresetDialog}>{t('cancel')}</Button>
                <Button variant="contained" onClick={confirmSaveSortPreset} disabled={!saveSortPresetName.trim()}>
                  {t('save')}
                </Button>
              </DialogActions>
            </Dialog>
            <Dialog open={Boolean(deleteSortPresetTarget)} onClose={cancelDeleteSortPreset} maxWidth="xs" fullWidth>
              <DialogTitle>{t('sortPresetsDeleteDialogTitle')}</DialogTitle>
              <DialogContent>
                <Typography variant="body2">
                  {t('sortPresetsDeleteDialogMessage', { name: deleteSortPresetTarget?.name ?? '' })}
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={cancelDeleteSortPreset}>{t('cancel')}</Button>
                {onHideSortPreset ? (
                  <Button onClick={hideSortPresetFromDialog}>{t('presetHide')}</Button>
                ) : null}
                <Button color="error" variant="contained" onClick={confirmDeleteSortPreset}>
                  {t('delete')}
                </Button>
              </DialogActions>
            </Dialog>
            <Menu
              open={sortMenuOpen}
              anchorEl={sortMenuAnchor}
              onClose={closeSortMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                // MenuList adds default padding (8px) which makes the title block sit lower than other popovers (e.g., Rolls).
                list: {
                  disablePadding: true,
                  // Keep long sort menus inside the popover background instead of spilling past the paper edge.
                  sx: {
                    maxHeight: 'calc(100vh - 128px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                  },
                },
                paper: { ...buildContextMenuPaperSlotProps({
                  component: ContextMenuPaper,
                  contextMenuGuard: sortMenuGuard,
                  onRequestClose: closeSortMenu,
                  closeLabel: t('close'),
                  overlay: (
                    <GearInspectorSortPopoutEasterEggOverlay
                      state={sortPopoutEasterEgg.overlay}
                      onMicroConfirmYep={sortPopoutEasterEgg.microConfirmToggle}
                      onMicroConfirmStop={sortPopoutEasterEgg.forceExit}
                    />
                  ),
                  // Widened from 320 so the longest sort labels (e.g. "Safeguard Group Rank") fit on one line.
                  sx: { width: 360, maxWidth: 'calc(100vw - 32px)', px: 0, py: 0 },
                }), ref: sortMenuPaperRef },
              }}
            >
              {/* Title block mirrors the filter panel popouts so "Sort" feels like a first-class control. */}
              <Box sx={{ px: 2.25, pt: 2.25, pb: 1 }}>
                <ContextMenuTitle title={sortLabel} description={t('gearInspectorSortPopoverDescription')} />
              </Box>
	              {[
	                ...STAT_VARIANTS_PRIORITY,
	                GEAR_INSPECTOR_SORT_KEY_LAST_USAGE as GearInspectorSortKey,
	                GEAR_INSPECTOR_SORT_KEY_NEWEST as GearInspectorSortKey,
	                GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE as GearInspectorSortKey,
	                GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK as GearInspectorSortKey,
	                GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_GROUP_RANK as GearInspectorSortKey,
	              ].map((key) => {
	                const idx = sortPriorities.findIndex((v) => Number(v) === Number(key))
	                const label = sortLabelForKey(key)
	                const fg = isGearInspectorSyntheticSortKey(Number(key)) ? undefined : sortStatFg(key as StatVariant)
	                const active = sortNormalizedEffective
	                  ? sortNormalizedDisplayedVariantSet.has(Number(key))
	                  : idx >= 0
	                const perKeyFlipped = sortFlipped.some((v) => Number(v) === Number(key))
	                const priorityDisabled = sortNormalizedEffective
	                const isSyntheticKey = isGearInspectorSyntheticSortKey(Number(key))
	                const rowDisabled = priorityDisabled && isSyntheticKey
	                const showPriorityBadges = active && !sortNormalizedEffective
	                // Weight controls only replace the active badges. When the row is not selected, always show the two ghost badges
	                // so the control column stays visually consistent in both Normalized and priority modes.
	                const showNormalizedSelectedBadge = sortNormalizedAmbiguousWeights && active && !isSyntheticKey
	                const showWeightControls = sortNormalizedEffective && active && !isSyntheticKey && !sortNormalizedAmbiguousWeights
	                const weightControlsEnabled = showWeightControls
	                const rawWeight = isSyntheticKey
	                  ? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT
	                  : Number(gearInspectorSubstatSort.weights?.[key as StatVariant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
		                return (
		                  <MenuItem
		                    key={key}
		                    data-gear-inspector-sort-key={Number(key)}
	                    disabled={rowDisabled}
	                    onClick={(event) => {
	                      if (rowDisabled) return
	                      sortPopoutEasterEgg.onPriorityToggle(key, event)
	                    }}
	                    sx={(theme) => ({
	                      gap: 1,
	                      alignItems: 'center',
	                      ...(rowDisabled ? { opacity: (theme.vars?.palette.action.disabledOpacity ?? theme.palette.action.disabledOpacity) } : {}),
                      ...(active ? { backgroundColor: theme.custom.successActiveBg } : {}),
                      '&:hover': {
                        backgroundColor: theme.custom.successHoverBg,
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
                            border: `1px solid ${theme.custom.successBorder}`,
                            backgroundColor: theme.custom.successBg,
                            color: (theme.vars?.palette.success.main ?? theme.palette.success.main),
                            cursor: priorityDisabled ? 'default' : 'pointer',
                            opacity: priorityDisabled ? 0.35 : 1,
                          })}
                          data-sort-popout-badge
	                        >
	                          {idx + 1}
	                        </Box>
	                      ) : showWeightControls ? (
		                        <GearInspectorSortWeightControls
		                          label={label}
		                          enabled={weightControlsEnabled}
		                          weight={rawWeight}
		                          onBump={(deltaSteps) => handleBumpWeight(key as StatVariant, deltaSteps)}
		                          onReset={() => handleSetWeight(key as StatVariant, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)}
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
	                            border: `1px solid ${theme.custom.successBorder}`,
	                            backgroundColor: theme.custom.successBg,
	                            color: (theme.vars?.palette.success.main ?? theme.palette.success.main),
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
                            border: `1px solid ${theme.custom.neutralBorder}`,
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
                                border: `1px solid ${theme.custom.infoBorder}`,
                                backgroundColor: theme.custom.infoBg,
                                color: (theme.vars?.palette.info.main ?? theme.palette.info.main),
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
	                            border: `1px solid ${theme.custom.ghostBorder}`,
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
                disabled={isRulesMode}
                onClick={() => onSetGearInspectorSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortDirectionLabel}</Typography>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={isRulesMode}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSetGearInspectorSubstatSortDirection(sortSpec.direction === 'desc' ? 'asc' : 'desc')
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
	                  <Stack direction="column" spacing={0.75} sx={{ alignItems: 'flex-end' }}>
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
	                                  onSetGearInspectorSubstatSortState({
	                                    ...gearInspectorSubstatSort,
	                                    normalized: false,
	                                    normalizedUseActiveOverlay: false,
	                                    normalizedSourcePresetIds: [],
	                                    normalizedSourceIncludeCustom: true,
	                                  })
	                                  return
	                                }
	                                onSetGearInspectorSubstatSortState({ ...gearInspectorSubstatSort, normalized: true })
	                              }}
	                            >
	                              {t('commonOn')}
	                            </Button>
	                          </Box>
	                        </MarkdownTooltip>
	                      </Box>
	                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
	                        <MarkdownTooltip markdown={sortNormalizedUseActiveTooltip} placement="top-start">
	                          <Box component="span">
	                            <Button
	                              size="small"
	                              variant={gearInspectorSubstatSort.normalizedUseActiveOverlay ? 'contained' : 'outlined'}
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
	                                const enabling = !gearInspectorSubstatSort.normalizedUseActiveOverlay
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
	                                      if (isNeutralGearInspectorSortWeight(weight)) continue
	                                      overlayWeights[variant] = weight
	                                    }
	                                  }
	                                  onSetGearInspectorSubstatSortState({
	                                    ...gearInspectorSubstatSort,
	                                    normalized: true,
	                                    normalizedUseActiveOverlay: true,
	                                    normalizedSourcePresetIds: [],
	                                    normalizedSourceIncludeCustom: false,
	                                    ...(overlayPreset ? { priorities: overlayPreset.variants.slice(), flipped: [], weights: overlayWeights } : {}),
	                                  })
	                                  return
	                                }
	                                onSetGearInspectorSubstatSortState({
	                                  ...gearInspectorSubstatSort,
	                                  normalizedUseActiveOverlay: false,
	                                  normalizedSourceIncludeCustom: (gearInspectorSubstatSort.normalizedSourcePresetIds?.length ?? 0) === 0,
	                                })
	                              }}
	                              aria-label={sortNormalizedUseActiveLabel}
	                            >
	                              <GridViewIcon sx={{ fontSize: 18 }} />
	                            </Button>
	                          </Box>
	                        </MarkdownTooltip>
	                        {Array.from({ length: 4 }).map((_, idx) => {
	                          const presetId = idx as GearInspectorNormalizedPresetId
	                          const enabled = sortNormalizedPresetIdSet.has(presetId)
	                          const preset = normalizedOverlayPrefs.state.presets[presetId]
	                          const label = preset
	                            ? formatGearInspectorNormalizedPresetButtonLabel(presetId, preset.iconId)
	                            : String(presetId + 1)
	                          const tooltipMarkdown = preset
	                            ? buildGearInspectorNormalizedPresetTooltipMarkdown({
	                                title: t('gearInspectorGridNormalizedPresetTitle', { n: presetId + 1 }),
	                                preset,
	                                labelForVariant: (variant) => t(statVariantI18nKey(variant)),
	                                emptyLabel: normalizedPresetTooltipEmptyLabel,
	                                rightClickHint: normalizedPresetTooltipRightClickHint,
	                              })
	                            : normalizedPresetTooltipEmptyLabel
	                          return (
	                            <MarkdownTooltip
	                              key={`gear-inspector-sort-normalized-preset-tooltip-${presetId}`}
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
	                                    // Compute next preset ids without an IIFE.
	                                    // When Normalized is off, selecting a preset immediately enables Normalized and uses that preset.
	                                    let nextPresetIds: GearInspectorNormalizedPresetId[]
	                                    if (!sortNormalizedEnabled) {
	                                      nextPresetIds = [presetId]
	                                    } else {
	                                      const current = gearInspectorSubstatSort.normalizedSourcePresetIds ?? []
	                                      const set = new Set<number>(current.map((id) => Number(id)))
	                                      if (set.has(presetId)) {
	                                        set.delete(presetId)
	                                      } else {
	                                        set.add(presetId)
	                                      }
	                                      nextPresetIds = [...set].sort((a, b) => a - b).map((id) => id as GearInspectorNormalizedPresetId)
	                                    }
	                                    const singlePresetId = nextPresetIds.length === 1 ? nextPresetIds[0]! : null
	                                    const singlePreset = singlePresetId != null ? normalizedOverlayPrefs.state.presets[singlePresetId] : null
	                                    const presetWeights: Partial<Record<StatVariant, number>> = {}
	                                    if (singlePreset?.weights) {
	                                      for (const [variantRaw, weightRaw] of Object.entries(singlePreset.weights)) {
	                                        const variant = Number(variantRaw) as StatVariant
	                                        const weight = Number(weightRaw)
	                                        if (!Number.isFinite(weight)) continue
	                                        if (isNeutralGearInspectorSortWeight(weight)) continue
	                                        presetWeights[variant] = weight
	                                      }
	                                    }
	                                    onSetGearInspectorSubstatSortState({
	                                      ...gearInspectorSubstatSort,
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
	                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
	                        {Array.from({ length: GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT - 4 }).map((_, offset) => {
	                          const idx = offset + 4
	                          const presetId = idx as GearInspectorNormalizedPresetId
	                          const enabled = sortNormalizedPresetIdSet.has(presetId)
	                          const preset = normalizedOverlayPrefs.state.presets[presetId]
	                          const label = preset
	                            ? formatGearInspectorNormalizedPresetButtonLabel(presetId, preset.iconId)
	                            : String(presetId + 1)
	                          const tooltipMarkdown = preset
	                            ? buildGearInspectorNormalizedPresetTooltipMarkdown({
	                                title: t('gearInspectorGridNormalizedPresetTitle', { n: presetId + 1 }),
	                                preset,
	                                labelForVariant: (variant) => t(statVariantI18nKey(variant)),
	                                emptyLabel: normalizedPresetTooltipEmptyLabel,
	                                rightClickHint: normalizedPresetTooltipRightClickHint,
	                              })
	                            : normalizedPresetTooltipEmptyLabel
	                          return (
	                            <MarkdownTooltip
	                              key={`gear-inspector-sort-normalized-preset-tooltip-${presetId}`}
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
	                                    // Compute next preset ids without an IIFE.
	                                    // When Normalized is off, selecting a preset immediately enables Normalized and uses that preset.
	                                    let nextPresetIds: GearInspectorNormalizedPresetId[]
	                                    if (!sortNormalizedEnabled) {
	                                      nextPresetIds = [presetId]
	                                    } else {
	                                      const current = gearInspectorSubstatSort.normalizedSourcePresetIds ?? []
	                                      const set = new Set<number>(current.map((id) => Number(id)))
	                                      if (set.has(presetId)) {
	                                        set.delete(presetId)
	                                      } else {
	                                        set.add(presetId)
	                                      }
	                                      nextPresetIds = [...set].sort((a, b) => a - b).map((id) => id as GearInspectorNormalizedPresetId)
	                                    }
	                                    const singlePresetId = nextPresetIds.length === 1 ? nextPresetIds[0]! : null
	                                    const singlePreset = singlePresetId != null ? normalizedOverlayPrefs.state.presets[singlePresetId] : null
	                                    const presetWeights: Partial<Record<StatVariant, number>> = {}
	                                    if (singlePreset?.weights) {
	                                      for (const [variantRaw, weightRaw] of Object.entries(singlePreset.weights)) {
	                                        const variant = Number(variantRaw) as StatVariant
	                                        const weight = Number(weightRaw)
	                                        if (!Number.isFinite(weight)) continue
	                                        if (isNeutralGearInspectorSortWeight(weight)) continue
	                                        presetWeights[variant] = weight
	                                      }
	                                    }
	                                    onSetGearInspectorSubstatSortState({
	                                      ...gearInspectorSubstatSort,
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
                disabled={isRulesMode}
                onClick={() => onToggleGearInspectorSubstatSortExcludeGlyphs()}
              >
	                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortGlyphsLabel}</Typography>
	                <Button
	                  size="small"
	                  // Keep both states visually consistent; the label communicates exclude vs include.
	                  variant="contained"
                  color="success"
                  disabled={isRulesMode}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleGearInspectorSubstatSortExcludeGlyphs()
                  }}
                >
                  {gearInspectorSubstatSort.excludeGlyphs ? sortGlyphsExcludeLabel : sortGlyphsIncludeLabel}
                </Button>
              </MenuItem>
              <MenuItem
                sx={{ gap: 1, alignItems: 'center' }}
                disabled={groupingControlsDisabled}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortGroupingArtifactsLabel}</Typography>
                {/* Icon-only buttons keep the row compact; tooltips + aria labels carry the text. */}
                {/* Accessory grouping mirrors the artifact row but uses faction-centric icons. */}
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  {artifactGroupingToggles.map((option) => {
                    // Active artifact toggles are stored in the shared sort preference store.
                    const active = option.active
                    return (
                      <MarkdownTooltip
                        key={option.key}
                        markdown={option.tooltip}
                        placement="top-start"
                      >
                        <Box component="span">
                          <Button
                            size="small"
                            variant={active ? 'contained' : 'outlined'}
                            color="success"
                            disabled={groupingControlsDisabled}
                            aria-label={option.label}
                            aria-pressed={active}
                            sx={{
                              minWidth: GROUPING_ICON_BUTTON_SIZE_PX,
                              width: GROUPING_ICON_BUTTON_SIZE_PX,
                              height: MENU_CONTROL_HEIGHT_PX,
                              minHeight: MENU_CONTROL_HEIGHT_PX,
                              lineHeight: 1,
                              py: 0,
                              px: 0,
                            }}
                            onClick={(event) => {
                              event.stopPropagation()
                              option.onToggle()
                            }}
                          >
                            {option.icon}
                          </Button>
                        </Box>
                      </MarkdownTooltip>
                    )
                  })}
                  {/* "No headers" appears in both rows but flips a single shared flag. */}
                  {/* Shared header toggle is duplicated for quick access. */}
                  <MarkdownTooltip markdown={sortGroupingNoHeadersTooltip} placement="top-start">
                    <Box component="span">
                      <Button
                        size="small"
                        variant={groupingHideHeaders ? 'contained' : 'outlined'}
                        color="success"
                        disabled={groupingControlsDisabled}
                        aria-label={sortGroupingNoHeadersLabel}
                        aria-pressed={groupingHideHeaders}
                        sx={{
                          minWidth: GROUPING_ICON_BUTTON_SIZE_PX,
                          width: GROUPING_ICON_BUTTON_SIZE_PX,
                          height: MENU_CONTROL_HEIGHT_PX,
                          minHeight: MENU_CONTROL_HEIGHT_PX,
                          lineHeight: 1,
                          py: 0,
                          px: 0,
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleGearInspectorGroupingHeaders()
                        }}
                      >
                        <VisibilityOffIcon sx={GROUPING_ICON_PRIMARY_SX} />
                      </Button>
                    </Box>
                  </MarkdownTooltip>
                </Stack>
              </MenuItem>
              <MenuItem
                sx={{ gap: 1, alignItems: 'center' }}
                disabled={groupingControlsDisabled}
              >
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} data-sort-popout-text>{sortGroupingAccessoriesLabel}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  {accessoryGroupingToggles.map((option) => {
                    // Active accessory toggles are stored in the shared sort preference store.
                    const active = option.active
                    return (
                      <MarkdownTooltip
                        key={option.key}
                        markdown={option.tooltip}
                        placement="top-start"
                      >
                        <Box component="span">
                          <Button
                            size="small"
                            variant={active ? 'contained' : 'outlined'}
                            color="success"
                            disabled={groupingControlsDisabled}
                            aria-label={option.label}
                            aria-pressed={active}
                            sx={{
                              minWidth: GROUPING_ICON_BUTTON_SIZE_PX,
                              width: GROUPING_ICON_BUTTON_SIZE_PX,
                              height: MENU_CONTROL_HEIGHT_PX,
                              minHeight: MENU_CONTROL_HEIGHT_PX,
                              lineHeight: 1,
                              py: 0,
                              px: 0,
                            }}
                            onClick={(event) => {
                              event.stopPropagation()
                              option.onToggle()
                            }}
                          >
                            {option.icon}
                          </Button>
                        </Box>
                      </MarkdownTooltip>
                    )
                  })}
                  <MarkdownTooltip markdown={sortGroupingNoHeadersTooltip} placement="top-start">
                    <Box component="span">
                      <Button
                        size="small"
                        variant={groupingHideHeaders ? 'contained' : 'outlined'}
                        color="success"
                        disabled={groupingControlsDisabled}
                        aria-label={sortGroupingNoHeadersLabel}
                        aria-pressed={groupingHideHeaders}
                        sx={{
                          minWidth: GROUPING_ICON_BUTTON_SIZE_PX,
                          width: GROUPING_ICON_BUTTON_SIZE_PX,
                          height: MENU_CONTROL_HEIGHT_PX,
                          minHeight: MENU_CONTROL_HEIGHT_PX,
                          lineHeight: 1,
                          py: 0,
                          px: 0,
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onToggleGearInspectorGroupingHeaders()
                        }}
                      >
                        <VisibilityOffIcon sx={GROUPING_ICON_PRIMARY_SX} />
                      </Button>
                    </Box>
                  </MarkdownTooltip>
                </Stack>
              </MenuItem>
            </Menu>
	            <GearInspectorNormalizedPresetEditorMenu
	              open={Boolean(sortNormalizedPresetEditor)}
	              anchorPosition={sortNormalizedPresetEditor?.position ?? null}
	              presetId={(sortNormalizedPresetEditor?.presetId ?? 0) as GearInspectorNormalizedPresetId}
	              preset={normalizedOverlayPrefs.state.presets[(sortNormalizedPresetEditor?.presetId ?? 0) as GearInspectorNormalizedPresetId] ?? { iconId: DEFAULT_METASET_ICON_ID, variants: [], weights: {} }}
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
        {/* The boundary row for useFittingLabel. Right-aligned via marginLeft:auto (it sits
            after the left control groups). flex `0 1 auto` (content basis, shrinkable) is
            deliberate: with flex-basis:0 the fixed action buttons would overflow the box and
            OVERLAP the Diff group; auto basis lets flex-wrap measure the real content and
            wrap the whole group to a clean new row when it truly can't fit. Until then the
            hook shrinks the export label (full→short→min→icon) from the row's free space.
            nowrap keeps the buttons on one line; fixed siblings stay flexShrink:0. */}
        <Stack
          direction="row"
          spacing={1}
          sx={{ flex: '0 1 auto', minWidth: 0, ml: 'auto', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'flex-end' }}
        >
          {historyMenuEnabled ? (
            <>
              <Box
                sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
                onContextMenu={openGearDbHistorySettingsMenu}
              >
                {/* Right-click opens the settings menu for endpoint update toasts. */}
                {/* History button mirrors the load button sizing so the cluster stays aligned. */}
                <MarkdownTooltip markdown={t('builderHistoryMenuHeader')}>
                  <Button
                    size="small"
                    onClick={openGearDbHistoryMenu}
                    aria-label={t('builderHistoryMenuHeader')}
                    sx={{
                      minWidth: SELLFILE_BUTTON_HEIGHT_PX,
                      width: SELLFILE_BUTTON_HEIGHT_PX,
                      height: SELLFILE_BUTTON_HEIGHT_PX,
                      minHeight: SELLFILE_BUTTON_HEIGHT_PX,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 0,
                      flexShrink: 0,
                    }}
                  >
                    <HistoryIcon fontSize="small" />
                  </Button>
                </MarkdownTooltip>
                {gearDbCommandError ? (
                  <MarkdownTooltip
                    markdown={gearDbCommandError}
                    placement="left"
                    onClose={() => { onClearGearDbCommandError?.() }}
                  >
                    <Box component="span" sx={statusBadgeSx('warning')}>!</Box>
                  </MarkdownTooltip>
                ) : gearDbCommandSuccess ? (
                  <MarkdownTooltip
                    markdown={gearDbCommandSuccess}
                    placement="left"
                    onClose={() => { onClearGearDbCommandSuccess?.() }}
                  >
                    <Box component="span" sx={statusBadgeSx('success')}>{'✓'}</Box>
                  </MarkdownTooltip>
                ) : null}
              </Box>
              <GearDbHistoryMenu
                open={Boolean(gearDbHistoryAnchor)}
                anchorEl={gearDbHistoryAnchor}
                entries={gearDbHistoryEntries}
                onClose={closeGearDbHistoryMenu}
                onRequestClearHistory={onClearGearDbHistory}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
              />
              {/* Context menu mirrors the export menu styling for quick toggle access. */}
              <Menu
                anchorEl={gearDbHistorySettingsAnchor}
                open={Boolean(gearDbHistorySettingsAnchor)}
                onClose={closeGearDbHistorySettingsMenu}
                slotProps={{ paper: { ref: gearDbHistorySettingsMenuRef } }}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                {/* Toggles whether endpoint success toasts appear. */}
                <MenuToggleRow label={gearDbHistoryHideToastLabel} checked={hideGearDbUpdateToast} onChange={() => onToggleHideGearDbUpdateToast(!hideGearDbUpdateToast)} />
                {/* Pauses endpoint pushes; arriving commands are dropped, not queued. */}
                <MenuToggleRow label={gearDbHistoryPauseUpdatesLabel} checked={pauseEndpointUpdates} onChange={() => onTogglePauseEndpointUpdates(!pauseEndpointUpdates)} />
              </Menu>
            </>
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
          </Box>
          {baseRuleCount ? (
            <ClearIconButton
              size="small"
              aria-label={t('clear')}
              tooltip={t('clear')}
              onClick={onClearBase}
              sx={{ width: CLEAR_ICON_BUTTON_SIZE_PX, height: CLEAR_ICON_BUTTON_SIZE_PX, flexShrink: 0 }}
            />
          ) : null}
          {exportControl}
          {exportMenuEnabled ? (
            <Menu
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={closeExportMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {/* Local-download fallback when a push endpoint is active. */}
              {pushActive && onExportLocal ? (
                <MenuItem onClick={() => { onExportLocal(); closeExportMenu() }}>
                  <FileDownloadIcon fontSize="small" sx={{ mr: 1 }} />
                  {baseRuleCount ? t('exportMergedSellfile') : t('exportSellfile')}
                </MenuItem>
              ) : null}
              {/* Auto-push only makes sense when a push endpoint is configured. */}
              {pushActive ? (
                <MenuToggleRow label={t('exportSellfileAutoPush')} checked={autoPushEnabled} onChange={() => onToggleAutoPush(!autoPushEnabled)} />
              ) : null}
              <MenuToggleRow label={t('exportSellfileOmitDisabled')} checked={omitDisabledForExport} onChange={() => onToggleOmitDisabled(!omitDisabledForExport)} />
              <MenuToggleRow label={t('exportSellfileDedupDefault')} checked={dedupeDefault} onChange={() => onToggleDedupeDefault(!dedupeDefault)} />
            </Menu>
          ) : null}
        </Stack>
      </Stack>
    </>
  )
}
