/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and substatTargets, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
// React drives the builder UI; hooks keep state localized while config flows from App.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rarityCodeToName, StatVariant, RankCode, RarityCode, Faction, type FactionId, filterAndSortSetEntries, statVariantI18nKey, LEVEL_MILESTONES, type LevelMilestone, STAT_VARIANTS_PRIORITY_ROW1, STAT_VARIANTS_PRIORITY_ROW2, getLocalizedGearSetName } from '../lib/types'
import { variantToSub } from '../lib/hsfTypes'
import { NBSP, GLYPH_TOGGLE_ON, GLYPH_TOGGLE_OFF } from '../lib/constants'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { focusCycleWithin } from '../lib/focusCycle'
import SetMenuSection from './SetMenuSection'
import MetasetsDialog from './MetasetsDialog'
import { useMetasetsDialog } from '../hooks/useMetasetsDialog'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import type { HistoryPreview, DescribeNextChangeFn, HistoryTimelineEntry } from '../hooks/useHsfcHistory'
import {
  LEVELS,
  normalizeExportModeFields,
  resolveAutoRarityCode,
  baseMinForStarV,
  starForRankCode,
  rollLevelsForRarityCode,
  rarityIncludesMythical,
  type BuilderConfig,
  type SubstatTargetTable,
  type SellfileExportMode,
  type Star,
  type SubstatRollTargets,
  type SubstatRollTargetEntry,
} from '../lib/hsfBuilder'
import {
  canEnableSubstatFlex,
  deriveRollBaselineMode,
  isMilestoneThresholdsActive,
  normalizeAggregateRollTargets,
  normalizeAutoRaritySupplements,
  normalizeAutoSubstatFlex,
  normalizeKeepMode,
  normalizeLevelWindow,
} from '../lib/configNormalization'
import { pickAutoRaritySupplementsThreshold } from '../lib/raritySupplements'
import {
  aggregateRollStateFromConfig,
  aggregateRollStateToConfig,
  applyAggregateRollAction,
  clampAggregateRollValue,
  normalizeAggregateRollState as normalizeAggregateRollStateHelper,
  type AggregateRollAction,
  type AggregateRollState,
} from '../lib/aggregateRollState'
import { type Metaset, metasetGlyph, orderMetasetIds, resolveMetasetIds } from '../lib/metasets'
import type { ArtifactSetSelectionEntry } from '../lib/gearSets/selection'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'

import { Box, Button, Divider, Stack, Typography, TextField, Chip, FormControl, FormLabel, Select, MenuItem, ListSubheader, InputAdornment, Menu, Badge } from '@mui/material'
import SetsOrderControls from './SetsOrderControls'
import SubstatTargetsDialog from './SubstatTargetsDialog'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import MarkdownTooltip from './MarkdownTooltip'
import WorkloadProgressIndicator from './WorkloadProgressIndicator'
import InlineSelectClearButton from './InlineSelectClearButton'
import SelectDropdownActivator from './SelectDropdownActivator'
import BuilderCheatSheetPopover from './BuilderCheatSheetPopover'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { SubstatToggleDisplay, substatToggleGroupSx } from './SubstatToggleDisplay'
import { resolveSubstatChipPalette, SUBSTAT_CHIP_BORDER_RADIUS_PX } from './RuleSubstatChips'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ClearIconButton from './ClearIconButton'
import { UI_BG_HOVER_DANGER_TRANSITION, DANGER_TINT_BG, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, BUILDER_USER_DEFAULTS_KEY, BUILDER_DEFAULT_SAVE_TARGET, BUILDER_DIRTY_NUDGE_IDLE_MS, BUILDER_DIRTY_ATTENTION_INTERVAL_MS, FONT_SIZE_BASE_PX, ELLIPSIS_TEXT_SX, COMPACT_HEADER_ACTION_BUTTON_SX, BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX, BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX, SMALL_BUTTON_HEIGHT_PX, SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX, SETS_SELECT_INLINE_GUTTER_PX, CLEAR_ICON_BUTTON_SIZE_PX, MULTI_EDIT_MIXED_BG_ALPHA, MULTI_EDIT_MIXED_BORDER_ALPHA, MULTI_EDIT_MIXED_TEXT_ALPHA, MENU_LABEL_WIDTH_PX, MENU_CONTROL_HEIGHT_PX, SUBSTAT_TARGET_MAX_ROLLS, HISTORY_TOOLTIP_MAX_WIDTH_PX, BUILDER_AUTO_APPLY_DEBOUNCE_MS, BUILDER_LABEL_INLINE_SX, BUILDER_LABEL_TEXT_SX, BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX, BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX, BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX, BUILDER_AUTO_TOGGLE_WIDTH_PX } from '../lib/constants'
import Checkbox from '@mui/material/Checkbox'
import { useAttentionEffectStyles, useFortyTwoLegendaryOverlay } from '../lib/attentionEffects'
import { buildWarningBadgeIndicatorSx, warningBadgeSx } from '../lib/badgeStyles'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { substatSupportsColor } from '../lib/substatDisplay'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { FactionOptionLabel } from './FactionIcon'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { resolveConfigOptionsEffectiveConfig, type ConfigOptionsTagInstructions } from '../lib/noteConfigOptions'
import {
  type MultiEditDraftHandle,
  type MultiEditFieldState,
  type MultiEditArrayPatch,
  type MultiEditRollPatch,
  type MultiEditRollPatchEntry,
  type MultiEditTargetPatch,
  applyMultiEditFieldsToConfig,
  getDirtyBuilderFieldKeys,
} from '../lib/multiEditDraft'
import { mergeTagList, normalizeTagValue, summarizeTagPresence } from '../lib/tagHelpers'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSetsOrderPreference } from '../state/setsOrderPreference'
import { useAutoApplySelectedConfigPreference, useAutoResetAfterInsertPreference, useShowTagsChipsPreference } from '../state/builderPreferences'
import { HistoryContextMenu } from './HistoryContextMenu'
import { NumberSpinnerAdornment } from './NumberSpinnerAdornment'
import { createFactoryBuilderDefaults } from './builderPanel/defaults'
import {
  applyArtifactSetPatchPreview,
  applyNumberPatchPreview,
  applyStringPatchPreview,
  computeArtifactSetPatchToggle,
  computeNumberPatchToggle,
  computeStringPatchToggle,
  deriveBaseTriState,
  type TriStateBase,
  mergeRollPatchForVariant,
  mergeTargetPatchForVariant,
  toTriStateBase,
} from './builderPanel/multiEditHelpers'
import {
  buildTargetEntryFromDraft,
  clampRollMax,
  clampRollMin,
  clampTargetValue,
  cloneTargetRolls,
  createEmptyTargetRolls,
  normalizeRollBoundsEntry,
  normalizeRollTargetEntry,
  parseNumericInput,
  rollBoundsEqual,
  targetEntriesEqual,
  type SubstatMenuDraftState,
  type SubstatMenuInfo,
  type SubstatRollBoundsEntry,
} from './builderPanel/substatMenuHelpers'
import { useBuilderHistoryMenu } from './builderPanel/useBuilderHistoryMenu'
import { useRuleCountBadge } from './builderPanel/useRuleCountBadge'
import { useMultiEditSummary } from './builderPanel/useMultiEditSummary'
import { useBuilderPanelActionMenus } from './builderPanel/useBuilderPanelActionMenus'
import {
  computeRollBudgetForConfig,
  EMPTY_SELECTION,
  LOCK_MENU_BORDER_RADIUS_PX,
  LOCK_MENU_BUTTON_WIDTH_PX,
  LOCK_MENU_GAP_PX,
  LOCK_MENU_OFFSET_PX,
  LOCK_TOGGLE_HIT_SIZE_PX,
  MAX_CONFIG_INDEX_FOR_BUTTON_WIDTH,
  MIN_REQUIRED_ROLL_OPTIONS,
  MULTI_VALUE_SENTINEL,
  REQUIRED_SUBSTAT_MIN_OPTIONS,
  ROLL_ANY_STAR,
  SUBSTAT_MENU_COLUMN_GAP_PX,
  SUBSTAT_MENU_EXPECTATION_INPUT_HEIGHT_PX,
  SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX,
  SUBSTAT_MENU_EXPECTATION_SECTION_MIN_WIDTH_PX,
  SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX,
  SUBSTAT_MENU_ROLL_COLUMNS,
  SUBSTAT_MENU_ROLL_FONT_SIZE_PX,
  SUBSTAT_MENU_ROLL_GAP_PX,
  SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX,
  SUBSTAT_MENU_VALUE_COLUMN_WIDTH_PX,
  SUBSTAT_MENU_VALUE_PILL_MIN_HEIGHT_PX,
  SUBSTAT_MENU_WIDTH_PX,
} from './builderPanel/constants'

export { createFactoryBuilderDefaults } from './builderPanel/defaults'

export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, registerAutoApplyHandler, onApplyMultiEdit, onUndo, onRedo, canUndo, canRedo, undoPreview, redoPreview, historyTimeline, onJumpToHistoryIndex, onRequestClearHistory, metasets, onMetasetsChange, describeNextChange, onDeleteMetaset, onResetMetasets, substatTargets, onSubstatTargetsChange, setUsageCounts, metasetUsageCounts, keepUniqueMetasetUsageCounts, substatColors: _substatColors, configCount: _configCount, configRuleCounts, configRuleFingerprints, configsExcludedByTotalLimit, ruleSubstatTargetsKey, rulesBuilding, awaitRuleCounts, countRulesForConfigs, selectedIsDirty, insertHiddenByFilters, saveHiddenByFilters, onSelectConfigsByMetaset, substatTargetsDialogOpen, onCloseSubstatTargetsDialog, configOptionsTagInstructions, multiEdit: _multiEdit = null, multiSelectedConfigs = null, onBeforeMetasetsDialogClose }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
  registerAutoApplyHandler?: ((fn: (() => boolean) | null) => void) | undefined
  onApplyMultiEdit?: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  historyTimeline: HistoryTimelineEntry[]
  onJumpToHistoryIndex: (index: number) => void
  onRequestClearHistory: () => void
  metasets: Metaset[]
  onMetasetsChange: (next: Metaset[]) => void
  describeNextChange: DescribeNextChangeFn
  onDeleteMetaset: (id: string, opts?: { replaceWithSets?: boolean; replaceWithMetaId?: string }) => void
  onResetMetasets: (mode: 'delete' | 'replaceSets' | 'replaceMeta', replacementMetaId?: string) => void
  substatTargets: SubstatTargetTable
  onSubstatTargetsChange: (m: SubstatTargetTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  keepUniqueMetasetUsageCounts: Record<string, number>
  substatColors: Record<number, { fg: string; bg: string }>
  configCount: number
  configRuleCounts: ReadonlyMap<number, number>
  configRuleFingerprints: readonly string[]
  configsExcludedByTotalLimit: ReadonlySet<number>
  ruleSubstatTargetsKey: string
  rulesBuilding: boolean
  awaitRuleCounts?: () => { token: number; promise: Promise<Map<number, number>> } | null
  countRulesForConfigs: (params: { configs: readonly BuilderConfig[]; substatTargets: SubstatTargetTable }, options?: { signal?: AbortSignal }) => Promise<number[]>
  selectedIsDirty: boolean
  // Flag Insert/Apply actions that will not appear under "Preview configs".
  insertHiddenByFilters: boolean
  saveHiddenByFilters: boolean
  // Select all configs that reference a given metaset ID (used from Metasets dialog "Used" chip)
  onSelectConfigsByMetaset: (id: string) => void
  substatTargetsDialogOpen: boolean
  onCloseSubstatTargetsDialog: () => void
  configOptionsTagInstructions: ConfigOptionsTagInstructions
  multiEdit?: MultiEditDraftHandle | null
  multiSelectedConfigs?: readonly BuilderConfig[] | null
  onBeforeMetasetsDialogClose?: () => Promise<void> | void
}) {
  const multiEdit = _multiEdit
  const multiEditSelectionCount = multiEdit?.state.selection.length ?? 0
  const multiEditSelection: readonly number[] = multiEdit?.state.selection ?? EMPTY_SELECTION
  const multiEditActive = multiEditSelectionCount >= 2
  const multiFields = multiEdit?.state.fields ?? null
  const multiKeepField = multiFields?.keep ?? null
  const multiExportModeField = multiFields?.exportMode ?? null
  const multiRankField = multiFields?.rankCode ?? null
  const multiRarityModeField = multiFields?.rarityMode ?? null
  const multiRarityCodeField = multiFields?.rarityCode ?? null
  const multiFactionField = multiFields?.factionCode ?? null
  const multiMinLevelField = multiFields?.minLevel ?? null
  const multiMaxLevelField = multiFields?.maxLevel ?? null
  const multiNameField = multiFields?.name ?? null
  const multiTagsField = multiFields?.tags ?? null
  const multiMainStatsField = multiFields?.mainStatsV ?? null
  const multiSubstatsField = multiFields?.substatsV ?? null
  const multiFixedSubstatsField = multiFields?.fixedSubstatsV ?? null
  const multiRollField = multiFields?.substatRollBoundsV ?? null
  const multiTargetField = multiFields?.substatRollTargetsV ?? null
  const multiAutoRaritySupplementsField = multiFields?.autoRaritySupplementsThreshold ?? null
  const multiSlotsField = multiFields?.artifactTypes ?? null
  const multiSetsField = multiFields?.artifactSets ?? null
  const multiMetasetsField = multiFields?.artifactMetaSets ?? null
  const multiAutoMinRequiredRollsField = multiFields?.autoMinRequiredRolls ?? null
  const multiMinRequiredRollsField = multiFields?.minRequiredRolls ?? null
  const multiLockedMinRequiredRollsField = multiFields?.lockedMinRequiredRolls ?? null
  const multiAutoMinCountField = multiFields?.autoMinCount ?? null
  const multiMinCountField = multiFields?.minCount ?? null
  const multiEarlyKeepModeField = multiFields?.earlyKeepMode ?? null
  const multiDraftDirty = multiEditActive && multiFields
    ? Object.values(multiFields).some((field) => field?.dirty)
    : false
  const multiSourceConfigs = multiEditActive && multiSelectedConfigs && multiSelectedConfigs.length >= 2
    ? multiSelectedConfigs
    : null
  const multiDirtyKeys = React.useMemo(() => (
    multiEditActive && multiFields ? getDirtyBuilderFieldKeys(multiFields) : []
  ), [multiEditActive, multiFields])
  const multiProjectedConfigs = React.useMemo<readonly BuilderConfig[] | null>(() => {
    if (!multiEditActive || !multiSourceConfigs || !multiFields) return null
    if (multiDirtyKeys.length === 0) return multiSourceConfigs
    let changed = false
    const projected = multiSourceConfigs.map((source) => {
      const next = applyMultiEditFieldsToConfig(source, multiFields, multiDirtyKeys)
      if (next !== source) changed = true
      return next
    })
    return changed ? projected : multiSourceConfigs
  }, [multiDirtyKeys, multiEditActive, multiFields, multiSourceConfigs])
  const aggregateRollConfigs = React.useMemo<readonly BuilderConfig[]>(() => {
    // Prefer projected configs while staging multi-edit changes so the toggles mirror the preview.
    if (multiEditActive) {
      const staged = (multiProjectedConfigs && multiProjectedConfigs.length > 0)
        ? multiProjectedConfigs
        : (multiSourceConfigs ?? [])
      if (staged.length > 0) return staged
    }
    // Fall back to the live config when multi-edit is inactive.
    return [cfg]
  }, [cfg, multiEditActive, multiProjectedConfigs, multiSourceConfigs])
  const aggregateRollSnapshots = React.useMemo(() => (
    aggregateRollConfigs.map((config) => ({
      // Auto mode uses `false` as the opt-out flag, so everything else is considered manual.
      auto: config.autoMinRequiredRolls !== false,
      manual: clampAggregateRollValue(Number(config.minRequiredRolls ?? 0)),
      locked: clampAggregateRollValue(Number(config.lockedMinRequiredRolls ?? 0)),
    }))
  ), [aggregateRollConfigs])
  const lockedSubstatsExist = React.useMemo(() => (
    aggregateRollConfigs.some((config) => {
      const locked = (config as { fixedSubstatsV?: number[] }).fixedSubstatsV
      return Array.isArray(locked) && locked.length > 0
    })
  ), [aggregateRollConfigs])
  const normalizeKeepWithAuto = React.useCallback((next: BuilderConfig): BuilderConfig => {
    // Normalize keep mode and aggregate rolls first.
    const withKeep = normalizeKeepMode(next)
    const withAggregate = normalizeAggregateRollTargets(withKeep)
    // Pick the default Auto rarity supplements threshold from the resolved rarity.
    const fallback = pickAutoRaritySupplementsThreshold(withAggregate)
    // Ensure Auto rarity supplements stay aligned with the current config.
    const withAuto = normalizeAutoRaritySupplements(
      withAggregate,
      { defaultThreshold: fallback },
    )
    // Clamp auto substat flex after all rarity/keep normalization.
    return normalizeAutoSubstatFlex(withAuto)
  }, [])
  const commitRollState = React.useCallback((nextState: AggregateRollState) => {
    onChange(normalizeKeepWithAuto({
      ...cfg,
      ...aggregateRollStateToConfig(nextState),
    }))
  }, [cfg, normalizeKeepWithAuto, onChange])

  const readMultiRollState = React.useCallback((): AggregateRollState | null => {
    if (!multiEditActive) return null
    const autoField = multiAutoMinRequiredRollsField
    const manualField = multiMinRequiredRollsField
    const lockedField = multiLockedMinRequiredRollsField
    if (autoField?.status === 'common' && manualField?.status === 'common' && lockedField?.status === 'common') {
      return normalizeAggregateRollStateHelper({
        auto: autoField.value !== false,
        manual: clampAggregateRollValue(manualField.value ?? 0),
        locked: clampAggregateRollValue(lockedField.value ?? 0),
      })
    }
    return null
  }, [multiAutoMinRequiredRollsField, multiEditActive, multiLockedMinRequiredRollsField, multiMinRequiredRollsField])

  const commitMultiRollState = React.useCallback((nextState: AggregateRollState) => {
    if (!multiEditActive || !multiEdit) return
    const normalizedState = normalizeAggregateRollStateHelper(nextState)
    multiEdit.updateField('autoMinRequiredRolls', { value: normalizedState.auto ? true : false, status: 'common' })
    multiEdit.updateField('minRequiredRolls', { value: normalizedState.manual, status: 'common' })
    multiEdit.updateField('lockedMinRequiredRolls', { value: normalizedState.locked, status: 'common' })
  }, [multiEdit, multiEditActive])

  const applyRollAction = React.useCallback((action: AggregateRollAction) => {
    if (multiEditActive && multiEdit) {
      const baseState = readMultiRollState() ?? aggregateRollStateFromConfig(cfg)
      commitMultiRollState(applyAggregateRollAction(baseState, action))
      return
    }
    const currentState = aggregateRollStateFromConfig(cfg)
    commitRollState(applyAggregateRollAction(currentState, action))
  }, [cfg, commitMultiRollState, commitRollState, multiEdit, multiEditActive, readMultiRollState])

  const handleAutoMinRequiredRolls = React.useCallback(() => {
    applyRollAction({ type: 'set-auto' })
  }, [applyRollAction])

  const handleManualMinRequiredRolls = React.useCallback((value: number) => {
    applyRollAction({ type: 'toggle-manual', value: clampAggregateRollValue(value) })
  }, [applyRollAction])

  const handleLockedMinRequiredRolls = React.useCallback((value: number) => {
    applyRollAction({ type: 'toggle-lock', value: clampAggregateRollValue(value) })
  }, [applyRollAction])
const applySingleSubstatBounds = React.useCallback((variant: number, builder: (current: SubstatRollBoundsEntry | undefined) => SubstatRollBoundsEntry | null) => {
  const prevMap = (cfg.substatRollBoundsV ?? {}) as Record<number, SubstatRollBoundsEntry>
  const prevRaw = prevMap[variant]
  const prevNormalized = normalizeRollBoundsEntry(prevRaw ?? null)
  const nextRaw = builder(prevRaw ? { ...prevRaw } : undefined)
  const nextNormalized = normalizeRollBoundsEntry(nextRaw)
  if (rollBoundsEqual(prevNormalized, nextNormalized)) return
  let nextMap: Record<number, SubstatRollBoundsEntry> | undefined
  if (!nextNormalized) {
    if (prevRaw === undefined) return
    const { [variant]: _omit, ...rest } = prevMap
    nextMap = Object.keys(rest).length > 0 ? rest : undefined
  } else {
    nextMap = { ...prevMap, [variant]: nextNormalized }
  }
  const normalizedBounds: BuilderConfig['substatRollBoundsV'] = nextMap
    ? nextMap
    : ({} as BuilderConfig['substatRollBoundsV'])
  const baseCfg = {
    ...cfg,
    substatRollBoundsV: normalizedBounds,
  } as BuilderConfig
  onChange(normalizeKeepWithAuto(baseCfg))
}, [cfg, normalizeKeepWithAuto, onChange])
const applySingleSubstatTargets = React.useCallback((variant: number, builder: (current: SubstatRollTargetEntry | undefined) => SubstatRollTargetEntry | null) => {
  const prevMap = (cfg.substatRollTargetsV ?? {}) as SubstatRollTargets
  const prevRaw = prevMap[variant]
  const nextRaw = builder(prevRaw ? {
    ...(typeof prevRaw.base === 'number' ? { base: prevRaw.base } : {}),
    ...(Array.isArray(prevRaw.increments) ? { increments: [...prevRaw.increments] } : {}),
  } : undefined)
  const nextNormalized = normalizeRollTargetEntry(nextRaw)
  if (targetEntriesEqual(prevRaw, nextNormalized)) return
  let nextMap: SubstatRollTargets | undefined
  if (!nextNormalized) {
    if (prevRaw === undefined) return
    const { [variant]: _omit, ...rest } = prevMap
    nextMap = Object.keys(rest).length > 0 ? rest : undefined
  } else {
    nextMap = { ...prevMap, [variant]: nextNormalized }
  }
  const normalizedTargets: BuilderConfig['substatRollTargetsV'] = nextMap
    ? nextMap
    : ({} as SubstatRollTargets)
  const baseCfg = {
    ...cfg,
    substatRollTargetsV: normalizedTargets,
  } as BuilderConfig
  onChange(normalizeKeepWithAuto(baseCfg))
}, [cfg, normalizeKeepWithAuto, onChange])
const [substatMenu, setSubstatMenu] = React.useState<{ variant: StatVariant; anchor: { x: number; y: number } } | null>(null)
const [substatMenuDraft, setSubstatMenuDraft] = React.useState<SubstatMenuDraftState | null>(null)
const [substatMenuChipWidths, setSubstatMenuChipWidths] = React.useState<{ min: number; max: number }>({ min: 0, max: 0 })
const resetSubstatMenuChipWidths = React.useCallback(() => {
  setSubstatMenuChipWidths((prev) => {
    if (prev.min === 0 && prev.max === 0) return prev
    return { min: 0, max: 0 }
  })
}, [])
const { t, lang } = useI18n()
useGearSetCatalogVersion()
const numberFormatter = React.useMemo(() => new Intl.NumberFormat(lang), [lang])
const substatMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
// Keep Tab/Shift+Tab within the Roll Targets value inputs and wrap at the ends
// so keyboard editing stays in the grid instead of landing on spinner/clear controls.
const substatMenuRollTargetsRef = React.useRef<HTMLDivElement | null>(null)
const SUBSTAT_MENU_ROLL_TARGET_INPUT_ATTR = 'data-substat-roll-target-input' as const
const SUBSTAT_MENU_ROLL_TARGET_INPUT_SELECTOR = `input[${SUBSTAT_MENU_ROLL_TARGET_INPUT_ATTR}="true"]` as const
const {
  shouldShow: showSubstatHint,
  markSeen: markSubstatHintSeen,
} = useContextMenuHint('builderSubstats')
const [substatHintPos, setSubstatHintPos] = React.useState<{ x: number; y: number } | null>(null)
const substatHintActive = showSubstatHint && substatHintPos !== null && !substatMenu
const clearSubstatHint = React.useCallback(() => {
  setSubstatHintPos(null)
}, [])
const markSubstatHintSeenAndClear = React.useCallback(() => {
  markSubstatHintSeen()
  clearSubstatHint()
}, [markSubstatHintSeen, clearSubstatHint])
const [interactiveHoverVariant, setInteractiveHoverVariant] = React.useState<StatVariant | null>(null)
const canFlexSubstats = canEnableSubstatFlex(cfg)
const milestoneThresholdsActive = isMilestoneThresholdsActive(cfg)
const multiSummary = useMultiEditSummary(multiEditActive, multiSourceConfigs)
  const resolveTokenPresence = React.useCallback((token: number, baseCount: number, patch: MultiEditArrayPatch<number> | null | undefined): number => {
    if (!multiSummary) return baseCount
    if (!patch) return baseCount
    if (patch.clear) return 0
    if (patch.replace && patch.replace.length >= 0) {
      return patch.replace.map(Number).includes(token) ? multiSummary.total : 0
    }
    let next = baseCount
    if (patch.remove && patch.remove.map(Number).includes(token)) {
      next = 0
    }
    if (patch.add && patch.add.map(Number).includes(token)) {
      next = multiSummary.total
    }
    return Math.max(0, Math.min(multiSummary.total, next))
  }, [multiSummary])
  const resolveSetPresence = React.useCallback((
    token: number,
    baseCount: number,
    patch: MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined,
  ): number => {
    if (!multiSummary) return baseCount
    if (!patch) return baseCount
    if (patch.clear) return 0
    if (patch.replace && patch.replace.length >= 0) {
      const normalized = normalizeArtifactSetSelections(patch.replace)
      const split = splitArtifactSetSelections(normalized)
      return split.included.map(Number).includes(token) ? multiSummary.total : 0
    }
    let next = baseCount
    const removeEntries = normalizeArtifactSetSelections(patch.remove ?? [])
    const addEntries = normalizeArtifactSetSelections(patch.add ?? [])
    const removeIds = new Set(removeEntries.filter((entry) => !entry.excluded).map((entry) => Number(entry.id)))
    const addIds = new Set(addEntries.filter((entry) => !entry.excluded).map((entry) => Number(entry.id)))
    if (removeIds.has(token)) {
      next = 0
    }
    if (addIds.has(token)) {
      next = multiSummary.total
    }
    return Math.max(0, Math.min(multiSummary.total, next))
  }, [multiSummary])
  const resolveMetaPresence = React.useCallback((token: string, baseCount: number, patch: MultiEditArrayPatch<string> | null | undefined): number => {
    if (!multiSummary) return baseCount
    if (!patch) return baseCount
    if (patch.clear) return 0
    if (patch.replace && patch.replace.length >= 0) {
      return patch.replace.map(String).includes(token) ? multiSummary.total : 0
    }
    let next = baseCount
    if (patch.remove && patch.remove.map(String).includes(token)) {
      next = 0
    }
    if (patch.add && patch.add.map(String).includes(token)) {
      next = multiSummary.total
    }
    return Math.max(0, Math.min(multiSummary.total, next))
  }, [multiSummary])
  const mainStatsPatch = (multiMainStatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const resolveMainStatTriState = (variant: number): 'all' | 'none' | 'mixed' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray(cfg.mainStatsV) ? cfg.mainStatsV.includes(variant) : false
      return selected ? 'all' : 'none'
    }
    const baseCount = multiSummary.mainCounts.get(variant) ?? 0
    const finalCount = resolveTokenPresence(variant, baseCount, mainStatsPatch)
    if (finalCount === 0) return 'none'
    if (finalCount === multiSummary.total) return 'all'
    return 'mixed'
  }
  const toggleMainStat = (variant: number) => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    const state = resolveMainStatTriState(variant)
    const baseCount = multiSummary.mainCounts.get(variant) ?? 0
    const baseState = deriveBaseTriState(baseCount, multiSummary.total)
    const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
    const nextPatch = computeNumberPatchToggle(mainStatsPatch, variant, baseState, target)
    const baseArray = Array.isArray(cfg.mainStatsV) ? cfg.mainStatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('mainStatsV', {
      value: preview as BuilderConfig['mainStatsV'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }
  const clearMainSelection = () => {
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('mainStatsV', {
        value: (multiMainStatsField?.value as BuilderConfig['mainStatsV']) ?? (cfg.mainStatsV ?? []),
        status: 'common',
        patch: { clear: true },
      })
    } else {
      onChange({ ...cfg, mainStatsV: [] })
    }
  }
  const substatsPatch = (multiSubstatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const fixedSubstatsPatch = (multiFixedSubstatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const rollPatch = (multiRollField?.patch as MultiEditRollPatch | null | undefined) ?? null
  const getSubstatPresenceCount = React.useCallback((variant: number): number => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray((cfg as { substatsV?: number[] }).substatsV)
        ? ((cfg as { substatsV?: number[] }).substatsV as number[]).includes(variant)
        : false
      return selected ? 1 : 0
    }
    const base = multiSummary.subCounts.get(variant)?.present ?? 0
    return resolveTokenPresence(variant, base, substatsPatch)
  }, [cfg, multiEditActive, multiSummary, resolveTokenPresence, substatsPatch])
  const getSubstatPresence = React.useCallback((variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray((cfg as { substatsV?: number[] }).substatsV)
        ? ((cfg as { substatsV?: number[] }).substatsV as number[]).includes(variant)
        : false
      return selected ? 'all' : 'none'
    }
    const finalCount = getSubstatPresenceCount(variant)
    if (finalCount === 0) return 'none'
    if (finalCount === multiSummary.total) return 'all'
    return 'partial'
  }, [cfg, getSubstatPresenceCount, multiEditActive, multiSummary])
  const getSubstatLockCount = React.useCallback((variant: number): number => {
    if (!multiEditActive || !multiSummary) {
      const locked = Array.isArray((cfg as { fixedSubstatsV?: number[] }).fixedSubstatsV)
        ? ((cfg as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).includes(variant)
        : false
      return locked ? 1 : 0
    }
    const presenceCount = getSubstatPresenceCount(variant)
    if (presenceCount === 0) return 0
    const baseLocked = multiSummary.subCounts.get(variant)?.locked ?? 0
    let nextLocked = Math.min(baseLocked, presenceCount)
    if (fixedSubstatsPatch) {
      if (fixedSubstatsPatch.clear) {
        nextLocked = 0
      } else if (fixedSubstatsPatch.replace && fixedSubstatsPatch.replace.length >= 0) {
        const includes = fixedSubstatsPatch.replace.map(Number).includes(variant)
        nextLocked = includes ? presenceCount : 0
      } else {
        if (fixedSubstatsPatch.remove && fixedSubstatsPatch.remove.map(Number).includes(variant)) {
          nextLocked = 0
        }
        if (fixedSubstatsPatch.add && fixedSubstatsPatch.add.map(Number).includes(variant)) {
          nextLocked = presenceCount
        }
      }
    }
    return Math.min(nextLocked, presenceCount)
  }, [cfg, fixedSubstatsPatch, getSubstatPresenceCount, multiEditActive, multiSummary])
  const getSubstatLockState = React.useCallback((variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const locked = Array.isArray((cfg as { fixedSubstatsV?: number[] }).fixedSubstatsV)
        ? ((cfg as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).includes(variant)
        : false
      return locked ? 'all' : 'none'
    }
    const presenceCount = getSubstatPresenceCount(variant)
    if (presenceCount === 0) return 'none'
    const lockedCount = getSubstatLockCount(variant)
    if (lockedCount === 0) return 'none'
    if (lockedCount === presenceCount) return 'all'
    return 'partial'
  }, [cfg, getSubstatLockCount, getSubstatPresenceCount, multiEditActive, multiSummary])
  type RollMode =
    | { kind: 'none'; presence: number }
    | { kind: 'any'; presence: number }
    | { kind: 'min'; presence: number; min: number; max?: number }
    | { kind: 'max'; presence: number; max: number; min?: number }
    | { kind: 'mixed'; presence: number; wildcardCount: number; minValues: number[]; maxValues: number[] }
  const getRollMode = React.useCallback((variant: number): RollMode => {
    const boundsForSingle = (key: number) => (cfg.substatRollBoundsV ?? {})[key]
    if (!multiEditActive || !multiSummary) {
      const hasStat = Array.isArray(cfg.substatsV) ? cfg.substatsV.includes(variant) : false
      if (!hasStat) return { kind: 'none', presence: hasStat ? 1 : 0 }
      const bounds = boundsForSingle(variant)
      if (!bounds || bounds.any) return { kind: 'any', presence: 1 }
      const min = typeof bounds.min === 'number' ? Math.max(0, Math.min(5, Number(bounds.min))) : undefined
      const max = typeof bounds.max === 'number' ? Math.max(0, Math.min(4, Number(bounds.max))) : undefined
      if (typeof max === 'number') {
        return { kind: 'max', presence: 1, max, ...(typeof min === 'number' ? { min } : {}) }
      }
      if (typeof min === 'number') {
        return { kind: 'min', presence: 1, min, ...(typeof max === 'number' ? { max } : {}) }
      }
      return { kind: 'any', presence: 1 }
    }
    const presenceCount = getSubstatPresenceCount(variant)
    if (presenceCount === 0) return { kind: 'none', presence: 0 }
    const base = multiSummary.rollSummary.get(variant)
    let anyCount = base?.any ?? 0
    let minValues = new Set(base?.minValues ?? [])
    let maxValues = new Set(base?.maxValues ?? [])
    const patchEntry = rollPatch?.[variant]
    if (patchEntry) {
      if (patchEntry.any !== undefined) {
        if (patchEntry.any) {
          anyCount = presenceCount
          minValues = new Set<number>()
          maxValues = new Set<number>()
        } else {
          anyCount = 0
        }
      }
      if (patchEntry.min !== undefined) {
        if (patchEntry.min == null) {
          minValues = new Set<number>()
        } else {
          const clamped = Math.max(0, Math.min(5, Number(patchEntry.min)))
          minValues = new Set<number>([clamped])
          anyCount = 0
        }
      }
      if (patchEntry.max !== undefined) {
        if (patchEntry.max == null) {
          maxValues = new Set<number>()
        } else {
          const clamped = Math.max(0, Math.min(4, Number(patchEntry.max)))
          maxValues = new Set<number>([clamped])
          anyCount = 0
        }
      }
    }
    anyCount = Math.min(anyCount, presenceCount)
    if (anyCount === presenceCount && minValues.size === 0 && maxValues.size === 0) {
      return { kind: 'any', presence: presenceCount }
    }
    const minArray = Array.from(minValues).map((v) => Math.max(0, Math.min(5, Number(v))))
    const maxArray = Array.from(maxValues).map((v) => Math.max(0, Math.min(4, Number(v))))
    const minUnique = minArray.length === 1 ? minArray[0] : undefined
    const maxUnique = maxArray.length === 1 ? maxArray[0] : undefined
    let mixed = false
    if (anyCount > 0 && anyCount < presenceCount) {
      mixed = true
    }
    if (anyCount > 0 && (minArray.length > 0 || maxArray.length > 0)) {
      mixed = true
    }
    if (minArray.length > 1 || maxArray.length > 1) {
      mixed = true
    }
    if (minArray.length === 0 && maxArray.length === 0 && anyCount === 0) {
      return { kind: 'any', presence: presenceCount }
    }
    if (!mixed && typeof maxUnique === 'number' && minArray.length <= 1) {
      return { kind: 'max', presence: presenceCount, max: maxUnique, ...(typeof minUnique === 'number' ? { min: minUnique } : {}) }
    }
    if (!mixed && typeof minUnique === 'number' && maxArray.length <= 1 && anyCount === 0) {
      return { kind: 'min', presence: presenceCount, min: minUnique, ...(typeof maxUnique === 'number' ? { max: maxUnique } : {}) }
    }
    return {
      kind: 'mixed',
      presence: presenceCount,
      wildcardCount: anyCount,
      minValues: minArray,
      maxValues: maxArray,
    }
  }, [cfg.substatRollBoundsV, cfg.substatsV, getSubstatPresenceCount, multiEditActive, multiSummary, rollPatch])
  const commitRollPatch = React.useCallback((variant: number, entry: MultiEditRollPatchEntry) => {
    if (!multiEditActive || !multiEdit) return
    const mergedPatch = mergeRollPatchForVariant(
      (multiRollField?.patch as MultiEditRollPatch | null | undefined) ?? null,
      variant,
      entry,
    )
    multiEdit.updateField('substatRollBoundsV', {
      value: (multiRollField?.value as BuilderConfig['substatRollBoundsV']) ?? (cfg.substatRollBoundsV ?? {}),
      status: 'common',
      patch: mergedPatch ?? null,
    })
  }, [cfg.substatRollBoundsV, multiEdit, multiEditActive, multiRollField?.patch, multiRollField?.value])
  const commitTargetPatch = React.useCallback((variant: number, entry: SubstatRollTargetEntry | null) => {
    if (!multiEditActive || !multiEdit) return
    const mergedPatch = mergeTargetPatchForVariant(
      (multiTargetField?.patch as MultiEditTargetPatch | null | undefined) ?? null,
      variant,
      entry,
    )
    multiEdit.updateField('substatRollTargetsV', {
      value: (multiTargetField?.value as BuilderConfig['substatRollTargetsV']) ?? (cfg.substatRollTargetsV ?? {}),
      status: 'common',
      patch: mergedPatch ?? null,
    })
  }, [cfg.substatRollTargetsV, multiEdit, multiEditActive, multiTargetField?.patch, multiTargetField?.value])
  const deriveSubstatMenuInfo = React.useCallback((variant: StatVariant): SubstatMenuInfo | null => {
    const presenceState = multiEditActive
      ? getSubstatPresence(variant)
      : (Array.isArray(cfg.substatsV) && cfg.substatsV.includes(variant) ? 'all' : 'none')
    if (presenceState === 'none') return null
    const lockState = getSubstatLockState(variant)
    const info: SubstatMenuInfo = {
      variant,
      presence: presenceState === 'all' ? 'all' : 'partial',
      lockState,
      minValue: null,
      maxValue: null,
      minMixed: false,
      maxMixed: false,
      wildcard: false,
      rollKind: 'any',
    }
    if (multiEditActive) {
      const mode = getRollMode(variant)
      if (mode.kind === 'none') return null
      info.rollKind = mode.kind
      switch (mode.kind) {
        case 'any': {
          info.wildcard = true
          break
        }
        case 'min': {
          info.minValue = clampRollMin(mode.min)
          info.maxValue = typeof mode.max === 'number' ? clampRollMax(mode.max) : null
          info.wildcard = false
          break
        }
        case 'max': {
          info.maxValue = clampRollMax(mode.max)
          info.minValue = typeof mode.min === 'number' ? clampRollMin(mode.min) : null
          info.wildcard = false
          break
        }
        case 'mixed': {
          info.rollKind = 'mixed'
          const presenceMixed = presenceState === 'partial'
          const hasWildcard = mode.wildcardCount > 0
          if (mode.minValues.length > 1) {
            info.minMixed = true
          } else if (mode.minValues.length === 1) {
            const nextMin = clampRollMin(mode.minValues[0]!)
            if (hasWildcard) {
              info.minMixed = true
            } else {
              info.minValue = nextMin
            }
          } else if (hasWildcard || presenceMixed) {
            info.minMixed = true
          }
          if (mode.maxValues.length > 1) {
            info.maxMixed = true
          } else if (mode.maxValues.length === 1) {
            const nextMax = clampRollMax(mode.maxValues[0]!)
            if (hasWildcard) {
              info.maxMixed = true
            } else {
              info.maxValue = nextMax
            }
          } else if (hasWildcard || presenceMixed) {
            info.maxMixed = true
          }
          info.wildcard = hasWildcard
          if (presenceMixed) {
            info.minMixed = true
            info.maxMixed = true
          }
          break
        }
        default:
          break
      }
      if (presenceState === 'partial') {
        info.minMixed = true
        info.maxMixed = true
        if (info.lockState !== 'partial') {
          info.lockState = 'partial'
        }
      }
      if (info.minValue === null && info.maxValue === null && !info.wildcard && mode.kind === 'any') {
        info.wildcard = true
      }
    } else {
      const bounds = (cfg.substatRollBoundsV ?? {})[variant]
      if (typeof bounds?.min === 'number') info.minValue = clampRollMin(bounds.min)
      if (typeof bounds?.max === 'number') info.maxValue = clampRollMax(bounds.max)
      info.wildcard = Boolean(bounds?.any) || (info.minValue == null && info.maxValue == null)
      if (info.wildcard) {
        info.rollKind = 'any'
      } else if (info.minValue != null && info.maxValue != null) {
        info.rollKind = 'mixed'
      } else if (info.maxValue != null) {
        info.rollKind = 'max'
      } else if (info.minValue != null) {
        info.rollKind = 'min'
      }
    }
    return info
  }, [cfg.substatRollBoundsV, cfg.substatsV, getRollMode, getSubstatLockState, getSubstatPresence, multiEditActive])
const resolveSubstatTargetEntry = React.useCallback((variant: StatVariant): SubstatRollTargetEntry | null => {
    if (!multiEditActive) {
      const raw = (cfg.substatRollTargetsV ?? {})[variant]
      return normalizeRollTargetEntry(raw)
    }
    const configs = (() => {
      if (multiProjectedConfigs && multiProjectedConfigs.length > 0) return multiProjectedConfigs
      if (multiSourceConfigs && multiSourceConfigs.length > 0) return multiSourceConfigs
      return []
    })()
    if (configs.length === 0) return null
    let baseline: SubstatRollTargetEntry | null | undefined
    for (const config of configs) {
      const entry = normalizeRollTargetEntry((config.substatRollTargetsV ?? {})[variant])
      if (baseline === undefined) {
        baseline = entry ?? null
        continue
      }
      if (!targetEntriesEqual(baseline ?? null, entry ?? null)) {
        return null
      }
    }
    return baseline ?? null
  }, [cfg.substatRollTargetsV, multiEditActive, multiProjectedConfigs, multiSourceConfigs])
  const handleSubstatMenuClose = React.useCallback(() => {
    setSubstatMenu(null)
    setSubstatMenuDraft(null)
    resetSubstatMenuChipWidths()
  }, [resetSubstatMenuChipWidths])
  const activeMenuInfo = React.useMemo(
    () => (substatMenu ? deriveSubstatMenuInfo(substatMenu.variant) : null),
    [deriveSubstatMenuInfo, substatMenu],
  )
  const menuTargetEntry = React.useMemo(() => {
    if (!substatMenu) return null
    return resolveSubstatTargetEntry(substatMenu.variant)
  }, [resolveSubstatTargetEntry, substatMenu])
  const targetDraftBase = substatMenuDraft?.targetBase
    ?? (typeof menuTargetEntry?.base === 'number' && Number.isFinite(menuTargetEntry.base)
      ? menuTargetEntry.base
      : null)
  const targetDraftRolls = React.useMemo<Array<number | null>>(() => {
    if (substatMenuDraft?.targetRolls) return substatMenuDraft.targetRolls
    if (menuTargetEntry?.increments) {
      return cloneTargetRolls(menuTargetEntry.increments)
    }
    return createEmptyTargetRolls()
  }, [menuTargetEntry, substatMenuDraft])
  React.useEffect(() => {
    if (!substatMenu) return
    if (activeMenuInfo) return
    setSubstatMenu(null)
    setSubstatMenuDraft(null)
    resetSubstatMenuChipWidths()
  }, [activeMenuInfo, resetSubstatMenuChipWidths, substatMenu])
  const menuOpen = Boolean(substatMenu && activeMenuInfo)
  const menuAnchor = substatMenu?.anchor ?? { x: 0, y: 0 }
  const chipWidth = Math.max(substatMenuChipWidths.min, substatMenuChipWidths.max)
  // Target fallback context: resolves the baseline substatTargets value for the
  // selected variant given the config’s current rank window plus roll budget.
  // When multi-edit is active we disable overrides, so the fallback only applies
  // to single-config edits.
  const targetContext = React.useMemo(() => {
    if (!activeMenuInfo || multiEditActive) return null
    const starFallback = (substatTargets.anyRankDefaultsTo ?? 6) as Star
    const star = starForRankCode(Number(cfg.rankCode ?? 0), starFallback)
    const baseValue = Math.max(0, baseMinForStarV(Number(activeMenuInfo.variant), star, substatTargets))
    const rollBudget = computeRollBudgetForConfig(cfg)
    return {
      baseValue,
      rollBudget,
      star,
    }
  }, [activeMenuInfo, cfg, substatTargets, multiEditActive])
  // Shared fallback when a specific roll override is blank. Keeps the UX honest
  // by previewing the same value that will be used when exporting the config.
  const resolveTargetFallbackValue = React.useCallback((rollIndex: number): number | null => {
    if (!targetContext) return null
    const base = targetContext.baseValue
    const total = Math.max(0, base + (rollIndex * base))
    return Math.round(total)
  }, [targetContext])
  const formatTargetFallback = React.useCallback((rollIndex: number): string => {
    const fallbackValue = resolveTargetFallbackValue(rollIndex)
    if (fallbackValue == null) return ''
    return `${Math.round(fallbackValue)}`
  }, [resolveTargetFallbackValue])
  const resolveComparableTargetValue = React.useCallback((rollIndex: number): number | null => {
    if (rollIndex === 0) {
      if (typeof targetDraftBase === 'number' && Number.isFinite(targetDraftBase)) {
        return targetDraftBase
      }
      return resolveTargetFallbackValue(0)
    }
    const entry = targetDraftRolls[rollIndex - 1]
    if (typeof entry === 'number' && Number.isFinite(entry)) return entry
    return resolveTargetFallbackValue(rollIndex)
  }, [targetDraftBase, targetDraftRolls, resolveTargetFallbackValue])
  // Close the substat menu on outside clicks to prevent stuck overlays.
  const { contextMenuGuard: substatMenuGuard } = useContextMenuPaperGuard({
    open: menuOpen,
    onClose: handleSubstatMenuClose,
    menuRef: substatMenuPaperRef,
  })
  // Shared helper: update fixedSubstatsV via multi-edit so every entry point (toggle, menu, etc.)
  // produces the same patch behavior without collapsing other stats’ mixed states.
  const applyMultiFixedState = React.useCallback((variant: number, target: 'locked' | 'unlocked'): boolean => {
    if (!multiEditActive || !multiEdit || !multiSummary) return false
    const desired: 'all' | 'none' = target === 'locked' ? 'all' : 'none'
    const lockState = getSubstatLockState(variant)
    if (desired === 'all' && lockState === 'all') return true
    if (desired === 'none' && lockState === 'none') return true
    const baseLocked = multiSummary.subCounts.get(variant)?.locked ?? 0
    const baseState = deriveBaseTriState(baseLocked, multiSummary.total)
    const nextPatch = computeNumberPatchToggle(
      fixedSubstatsPatch,
      variant,
      baseState,
      desired,
    )
    const baseArray = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('fixedSubstatsV', {
      value: preview as BuilderConfig['fixedSubstatsV'],
      status: 'common',
      patch: nextPatch ?? null,
    })
    return true
  }, [
    cfg.fixedSubstatsV,
    fixedSubstatsPatch,
    getSubstatLockState,
    multiEdit,
    multiEditActive,
    multiSummary,
  ])
  // Shared helper for presence adjustments; keeps selection, lock, and roll helpers in sync.
  const applyMultiSubstatPresence = React.useCallback((variant: number, target: 'all' | 'none'): boolean => {
    if (!multiEditActive || !multiEdit || !multiSummary) return false
    const presenceState = getSubstatPresence(variant)
    if (target === 'all' && presenceState === 'all') return true
    if (target === 'none' && presenceState === 'none') return true
    const basePresent = multiSummary.subCounts.get(variant)?.present ?? 0
    const baseState = deriveBaseTriState(basePresent, multiSummary.total)
    const nextPatch = computeNumberPatchToggle(
      substatsPatch,
      variant,
      baseState,
      target,
    )
    const baseArray = Array.isArray(cfg.substatsV) ? cfg.substatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('substatsV', {
      value: preview as BuilderConfig['substatsV'],
      status: 'common',
      patch: nextPatch ?? null,
    })
    if (target === 'none') {
      applyMultiFixedState(variant, 'unlocked')
      commitRollPatch(variant, { any: false, min: null, max: null })
    }
    return true
  }, [
    applyMultiFixedState,
    cfg.substatsV,
    commitRollPatch,
    getSubstatPresence,
    multiEdit,
    multiEditActive,
    multiSummary,
    substatsPatch,
  ])
  const ensureMultiSubstatPresence = React.useCallback((variant: number): boolean => (
    applyMultiSubstatPresence(variant, 'all')
  ), [applyMultiSubstatPresence])
  const multiToggleSubstat = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    const presenceState = getSubstatPresence(variant)
    const target: 'all' | 'none' = presenceState === 'all' ? 'none' : 'all'
    applyMultiSubstatPresence(variant, target)
  }, [applyMultiSubstatPresence, getSubstatPresence, multiEdit, multiEditActive, multiSummary])
  const multiSetSubstatLockState = React.useCallback((variant: number, target: 'locked' | 'unlocked') => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    if (getSubstatPresence(variant) !== 'all') ensureMultiSubstatPresence(variant)
    applyMultiFixedState(variant, target)
  }, [
    applyMultiFixedState,
    ensureMultiSubstatPresence,
    getSubstatPresence,
    multiEdit,
    multiEditActive,
    multiSummary,
  ])
  // Multi-edit lock toggle keeps substat presence aligned while flipping the fixed state.
  const multiToggleSubstatLock = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    const lockState = getSubstatLockState(variant)
    const target: 'locked' | 'unlocked' = (lockState === 'all') ? 'unlocked' : 'locked'
    multiSetSubstatLockState(variant, target)
  }, [getSubstatLockState, multiEdit, multiEditActive, multiSetSubstatLockState, multiSummary])
  const multiCycleRollForward = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit) return
    const mode = getRollMode(variant)
    switch (mode.kind) {
      case 'none':
      case 'any':
      case 'mixed':
        commitRollPatch(variant, { any: false, min: 0, max: null })
        break
      case 'min':
        if (mode.min >= 5) {
          commitRollPatch(variant, { any: true, min: null, max: null })
        } else {
          commitRollPatch(variant, { any: false, min: Math.min(5, mode.min + 1), max: mode.max ?? null })
        }
        break
      case 'max':
        if (mode.max <= 0) {
          commitRollPatch(variant, { any: true, min: null, max: null })
        } else {
          commitRollPatch(variant, { any: false, max: Math.max(0, mode.max - 1), min: mode.min ?? null })
        }
        break
      default:
        break
    }
  }, [commitRollPatch, getRollMode, multiEdit, multiEditActive])
  const multiCycleRollBackward = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit) return
    const mode = getRollMode(variant)
    switch (mode.kind) {
      case 'none':
      case 'any':
      case 'mixed':
        commitRollPatch(variant, { any: false, max: 0, min: null })
        break
      case 'max':
        if (mode.max >= 4) {
          commitRollPatch(variant, { any: true, min: null, max: null })
        } else {
          commitRollPatch(variant, { any: false, max: Math.min(4, mode.max + 1), min: mode.min ?? null })
        }
        break
      case 'min':
        if (mode.min <= 0) {
          commitRollPatch(variant, { any: true, min: null, max: null })
        } else {
          commitRollPatch(variant, { any: false, min: Math.max(0, mode.min - 1), max: mode.max ?? null })
        }
        break
      default:
        break
    }
  }, [commitRollPatch, getRollMode, multiEdit, multiEditActive])
  const slotsPatch = (multiSlotsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const getSlotState = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray(cfg.artifactTypes) ? cfg.artifactTypes.includes(id) : false
      return selected ? 'all' : 'none'
    }
    const base = multiSummary.slotCounts.get(id) ?? 0
    const final = resolveTokenPresence(id, base, slotsPatch)
    if (final === 0) return 'none'
    if (final === multiSummary.total) return 'all'
    return 'partial'
  }, [cfg.artifactTypes, multiEditActive, multiSummary, resolveTokenPresence, slotsPatch])
  const toggleSlot = React.useCallback((id: number) => {
    if (!multiEditActive || !multiEdit) return
    const state = getSlotState(id)
    const baseState = toTriStateBase(state)
    const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
    const nextPatch = computeNumberPatchToggle(
      (multiSlotsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null,
      id,
      baseState,
      target,
    )
    const baseArray = Array.isArray(cfg.artifactTypes) ? cfg.artifactTypes : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactTypes', {
      value: preview as BuilderConfig['artifactTypes'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [cfg.artifactTypes, getSlotState, multiEdit, multiEditActive, multiSlotsField?.patch])
  const setsPatch = (multiSetsField?.patch as MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined) ?? null
  const metasetsPatch = (multiMetasetsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
  const getSetState = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = splitArtifactSetSelections(cfg.artifactSets).included.includes(id)
      return selected ? 'all' : 'none'
    }
    const base = multiSummary.setCounts.get(id) ?? 0
    const final = resolveSetPresence(id, base, setsPatch)
    if (final === 0) return 'none'
    if (final === multiSummary.total) return 'all'
    return 'partial'
  }, [cfg.artifactSets, multiEditActive, multiSummary, resolveSetPresence, setsPatch])
const getMetasetState = React.useCallback((id: string): 'none' | 'partial' | 'all' => {
  if (!multiEditActive || !multiSummary) {
    const selected = Array.isArray(cfg.artifactMetaSets) ? cfg.artifactMetaSets.includes(id) : false
    return selected ? 'all' : 'none'
  }
  const base = multiSummary.metaCounts.get(id) ?? 0
  const final = resolveMetaPresence(id, base, metasetsPatch)
  if (final === 0) return 'none'
  if (final === multiSummary.total) return 'all'
  return 'partial'
}, [cfg.artifactMetaSets, metasetsPatch, multiEditActive, multiSummary, resolveMetaPresence])
  const getSetStateForScroll = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (multiEditActive) return getSetState(id)
    return splitArtifactSetSelections(cfg.artifactSets).included.includes(id) ? 'all' : 'none'
  }, [cfg.artifactSets, getSetState, multiEditActive])
  const toggleSet = React.useCallback((id: number) => {
    if (!multiEditActive || !multiEdit) return
    const state = getSetState(id)
    const baseState = toTriStateBase(state)
    const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
    const nextPatch = computeArtifactSetPatchToggle(
      (multiSetsField?.patch as MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined) ?? null,
      id,
      baseState,
      target,
    )
    const baseArray = Array.isArray(cfg.artifactSets) ? cfg.artifactSets : []
    const preview = applyArtifactSetPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactSets', {
      value: preview as BuilderConfig['artifactSets'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [cfg.artifactSets, getSetState, multiEdit, multiEditActive, multiSetsField?.patch])
  const toggleMetaset = React.useCallback((id: string) => {
    if (!multiEditActive || !multiEdit) return
    const state = getMetasetState(id)
    const baseState = toTriStateBase(state)
    const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
    const nextPatch = computeStringPatchToggle(
      (multiMetasetsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null,
      id,
      baseState,
      target,
    )
    const baseArray = Array.isArray(cfg.artifactMetaSets) ? cfg.artifactMetaSets : []
    const preview = applyStringPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactMetaSets', {
      value: preview as BuilderConfig['artifactMetaSets'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [cfg.artifactMetaSets, getMetasetState, multiEdit, multiEditActive, multiMetasetsField?.patch])
  const keepMixed = multiEditActive && (multiKeepField?.status === 'mixed')
  const keepValue: 'keep' | 'sell' | null = multiEditActive
    ? (keepMixed ? null : ((multiKeepField?.value as boolean | undefined) ? 'keep' : 'sell'))
    : (cfg.keep ? 'keep' : 'sell')
  const exportModeMixed = multiEditActive && (multiExportModeField?.status === 'mixed')
  // Resolve config options overrides for the active config.
  const effectiveConfig = useMemo(
    () => resolveConfigOptionsEffectiveConfig(cfg, configOptionsTagInstructions),
    [cfg, configOptionsTagInstructions],
  )
  // Read the effective export mode from the resolved config.
  const effectiveExportMode = effectiveConfig.exportMode
  // Only mark an override when the config options flip the stored selection.
  const exportModeOverrideActive = !multiEditActive && effectiveExportMode !== cfg.exportMode
  // Track rank, rarity, and level overrides for UI indicators.
  const storedRarityMode: 'auto' | 'code' = (cfg.rarityMode ?? 'code')
  const effectiveRarityMode: 'auto' | 'code' = (effectiveConfig.rarityMode ?? 'code')
  const rankOverrideActive = !multiEditActive && effectiveConfig.rankCode !== cfg.rankCode
  const rarityOverrideActive = !multiEditActive && (
    effectiveRarityMode !== storedRarityMode
    || (effectiveRarityMode === 'code' && effectiveConfig.rarityCode !== cfg.rarityCode)
  )
  const storedMinLevel = ((cfg as BuilderConfig).minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
  const storedMaxLevel = ((cfg as BuilderConfig).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
  const effectiveMinLevel = ((effectiveConfig as BuilderConfig).minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
  const effectiveMaxLevel = ((effectiveConfig as BuilderConfig).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
  const levelOverrideActive = !multiEditActive && (
    effectiveMinLevel !== storedMinLevel || effectiveMaxLevel !== storedMaxLevel
  )
  const keepOverrideActive = !multiEditActive && effectiveConfig.earlyKeepMode !== cfg.earlyKeepMode
  const autoLateOverrideActive = !multiEditActive && (
    effectiveConfig.autoRaritySupplementsThreshold !== cfg.autoRaritySupplementsThreshold
  )
  // Prefer the config options-resolved mode for the single-config display.
  const exportModeValue: SellfileExportMode | null = multiEditActive
    ? (exportModeMixed ? null : (multiExportModeField?.value as SellfileExportMode | undefined ?? 'active'))
    : effectiveExportMode
  // Surface the stored selection when config options tags override the effective mode.
  const exportModeOverrideTarget = exportModeOverrideActive && cfg.exportMode !== 'separator'
    ? cfg.exportMode
    : null
  // Map export modes to their localized labels for tooltip messaging.
  const exportModeLabel = React.useCallback((mode: SellfileExportMode): string => {
    // Keep the labels in sync with the toggle button text.
    if (mode === 'active') return t('builderExportModeActive')
    if (mode === 'disabled') return t('builderExportModeDisabled')
    return t('builderExportModeSeparator')
  }, [t])
  // Extend the tooltip when config options tags override the stored selection.
  const buildExportModeTooltip = React.useCallback((base: string, mode: SellfileExportMode): string => {
    // Default to the base tooltip when there is no override for this button.
    if (!exportModeOverrideActive || exportModeOverrideTarget !== mode) return base
    // Explain the override using the stored and effective labels.
    const storedLabel = exportModeLabel(mode)
    const effectiveLabel = exportModeLabel(effectiveExportMode)
    const overrideLine = t('builderExportModeConfigOptionsOverrideTooltip', {
      stored: storedLabel,
      effective: effectiveLabel,
    })
    // Add the override message after the base meaning text.
    return `${base}\n\n${overrideLine}`
  }, [exportModeLabel, exportModeOverrideActive, exportModeOverrideTarget, effectiveExportMode, t])
  // Extend generic tooltips with config options override messaging.
  const buildOverrideTooltip = React.useCallback(
    (base: string, stored: string, effective: string, active: boolean): string => {
      // Return the base tooltip when no override is active.
      if (!active) return base
      // Explain the stored vs effective values.
      const overrideLine = t('builderExportModeConfigOptionsOverrideTooltip', { stored, effective })
      // Append the override line to the base text.
      return `${base}\n\n${overrideLine}`
    },
    [t],
  )
  const rankMixed = multiEditActive && (multiRankField?.status === 'mixed')
  const rankValue = multiEditActive
    ? (rankMixed ? '' : String((multiRankField?.value as number | undefined) ?? cfg.rankCode))
    : String(effectiveConfig.rankCode)
  const rarityMixed = multiEditActive && (
    (multiRarityModeField?.status === 'mixed')
    || (multiRarityCodeField?.status === 'mixed')
  )
  const rarityValue = multiEditActive
    ? (rarityMixed
      ? ''
      : ((multiRarityModeField?.value as BuilderConfig['rarityMode'] | undefined) === 'auto'
        ? 'auto'
        : String((multiRarityCodeField?.value as number | undefined) ?? cfg.rarityCode)))
    : (effectiveRarityMode === 'auto' ? 'auto' : String(effectiveConfig.rarityCode))
  const factionMixed = multiEditActive && (multiFactionField?.status === 'mixed')
  const factionValue = multiEditActive
    ? (factionMixed ? '' : String((multiFactionField?.value as number | undefined) ?? cfg.factionCode ?? 0))
    : String(cfg.factionCode ?? 0)
  const singleMinLevel = (multiEditActive ? storedMinLevel : effectiveMinLevel)
  const singleMaxLevel = (multiEditActive ? storedMaxLevel : effectiveMaxLevel)
  const aggregatedMinLevel = multiEditActive
    ? (() => {
        if (!multiMinLevelField) return singleMinLevel
        if (multiMinLevelField.status === 'common') {
          const value = Number(multiMinLevelField.value)
          return LEVEL_MILESTONES.includes(value as LevelMilestone) ? (value as LevelMilestone) : singleMinLevel
        }
        const values = (multiMinLevelField.mixedValues ?? [])
          .map((entry) => Number(entry))
          .filter((num): num is LevelMilestone => LEVEL_MILESTONES.includes(num as LevelMilestone))
        if (!values.length) return singleMinLevel
        const min = Math.min(...values)
        return min as LevelMilestone
      })()
    : singleMinLevel
  const aggregatedMaxLevel = multiEditActive
    ? (() => {
        if (!multiMaxLevelField) return singleMaxLevel
        if (multiMaxLevelField.status === 'common') {
          const value = Number(multiMaxLevelField.value)
          return LEVEL_MILESTONES.includes(value as LevelMilestone) ? (value as LevelMilestone) : singleMaxLevel
        }
        const values = (multiMaxLevelField.mixedValues ?? [])
          .map((entry) => Number(entry))
          .filter((num): num is LevelMilestone => LEVEL_MILESTONES.includes(num as LevelMilestone))
        if (!values.length) return singleMaxLevel
        const max = Math.max(...values)
        return max as LevelMilestone
      })()
    : singleMaxLevel
  const minLevelValue = multiEditActive
    ? (multiMinLevelField?.status === 'common'
      ? String((multiMinLevelField?.value as number | undefined) ?? aggregatedMinLevel)
      : MULTI_VALUE_SENTINEL)
    : String(singleMinLevel)
const maxLevelValue = multiEditActive
  ? (multiMaxLevelField?.status === 'common'
    ? String((multiMaxLevelField?.value as number | undefined) ?? aggregatedMaxLevel)
    : MULTI_VALUE_SENTINEL)
  : String(singleMaxLevel)
  const computeTriState = React.useCallback((matches: number, total: number): 'on' | 'mixed' | 'off' => {
    if (matches <= 0) return 'off'
    if (matches >= total) return 'on'
    return 'mixed'
  }, [])
  const getMinRequiredRollsTriState = React.useCallback((target: 'auto' | 0 | 1 | 2 | 3 | 4 | 5): 'on' | 'mixed' | 'off' => {
    const total = aggregateRollSnapshots.length
    if (total <= 0) return 'off'
    if (target === 'auto') {
      // Auto state is simply the count of configs that have not opted into manual mode.
      const autoMatches = aggregateRollSnapshots.reduce((sum, snapshot) => sum + (snapshot.auto ? 1 : 0), 0)
      return computeTriState(autoMatches, total)
    }
    let matches = 0
    for (const snapshot of aggregateRollSnapshots) {
      if (snapshot.auto) continue
      if (target === 0) {
        // The "0" button only lights up when both manual and locked floors are cleared.
        if (snapshot.manual === 0 && snapshot.locked === 0) {
          matches += 1
        }
        continue
      }
      if (snapshot.manual === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [aggregateRollSnapshots, computeTriState])
  const getLockedMinRequiredRollsTriState = React.useCallback((target: 0 | 1 | 2 | 3 | 4 | 5): 'on' | 'mixed' | 'off' => {
    if (target === 0) return 'off'
    if (!lockedSubstatsExist) return 'off'
    const total = aggregateRollSnapshots.length
    if (total <= 0) return 'off'
    let matches = 0
    for (const snapshot of aggregateRollSnapshots) {
      if (snapshot.locked > 0 && snapshot.locked === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [aggregateRollSnapshots, computeTriState, lockedSubstatsExist])
  const getRequiredCountTriState = React.useCallback((target: 'auto' | 1 | 2 | 3 | 4): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !multiSourceConfigs) {
      const auto = cfg.autoMinCount === true
      if (target === 'auto') return auto ? 'on' : 'off'
      const value = Number(cfg.minCount ?? 0)
      return (!auto && value === target) ? 'on' : 'off'
    }
    const autoField = multiAutoMinCountField
    const manualField = multiMinCountField
    if (autoField) {
      if (autoField.status === 'common') {
        const autoOn = autoField.value === true
        if (target === 'auto') {
          return autoOn ? 'on' : 'off'
        }
        if (autoOn) {
          return 'off'
        }
        if (manualField) {
          if (manualField.status === 'common') {
            const manualValue = Number(manualField.value ?? 0)
            return manualValue === target ? 'on' : 'off'
          }
          if (manualField.status === 'mixed') {
            const values = manualField.mixedValues ?? []
            return values.some((entry) => Number(entry) === target) ? 'mixed' : 'off'
          }
        }
        return 'off'
      }
      if (autoField.status === 'mixed') {
        return 'mixed'
      }
    }
    const total = multiSourceConfigs.length
    let matches = 0
    for (const config of multiSourceConfigs) {
      const auto = config.autoMinCount === true
      if (target === 'auto') {
        if (auto) matches += 1
        continue
      }
      if (!auto && Number(config.minCount ?? 0) === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [cfg, computeTriState, multiAutoMinCountField, multiEditActive, multiMinCountField, multiSourceConfigs])
  const getKeepModeTriState = React.useCallback((target: 'early' | 'late'): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !multiSourceConfigs) {
      const mode = ((effectiveConfig as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late'
      return mode === target ? 'on' : 'off'
    }
    const staged = multiEarlyKeepModeField
    if (staged) {
      if (staged.status === 'common') {
        const mode = (staged.value as 'early' | 'late' | undefined) ?? 'early'
        return mode === target ? 'on' : 'off'
      }
      if (staged.status === 'mixed') {
        return 'mixed'
      }
    }
    const total = multiSourceConfigs.length
    let matches = 0
    for (const config of multiSourceConfigs) {
      const mode = (config.earlyKeepMode ?? 'early') as 'early' | 'late'
      if (mode === target) matches += 1
    }
    return computeTriState(matches, total)
  }, [computeTriState, effectiveConfig, multiEditActive, multiEarlyKeepModeField, multiSourceConfigs])
  const getAutoRarityTriState = React.useCallback((): 'on' | 'mixed' | 'off' | 'disabled' => {
    if (!multiEditActive || !multiSourceConfigs) {
      const active = isMilestoneThresholdsActive(effectiveConfig) &&
        ((effectiveConfig as BuilderConfig).rarityMode === 'auto') &&
        (((effectiveConfig as BuilderConfig).earlyKeepMode ?? 'early') === 'late')
      if (!active) return 'disabled'
      return (effectiveConfig as BuilderConfig).autoRaritySupplementsThreshold ? 'on' : 'off'
    }
    let eligible = 0
    let enabled = 0
    for (const config of multiSourceConfigs) {
      const active = isMilestoneThresholdsActive(config)
      const applicable = (config.rarityMode === 'auto') && ((config.earlyKeepMode ?? 'early') === 'late') && active
      if (!applicable) continue
      eligible += 1
      if (config.autoRaritySupplementsThreshold) enabled += 1
    }
    if (eligible === 0) return 'disabled'
    if (multiAutoRaritySupplementsField) {
      if (multiAutoRaritySupplementsField.status === 'common') {
        return multiAutoRaritySupplementsField.value ? 'on' : 'off'
      }
      if (multiAutoRaritySupplementsField.status === 'mixed') {
        return 'mixed'
      }
    }
    return computeTriState(enabled, eligible)
  }, [computeTriState, effectiveConfig, multiAutoRaritySupplementsField, multiEditActive, multiSourceConfigs])
  const getLevelTriState = (field: MultiEditFieldState | null, fallback: number, level: number): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !field) {
      return fallback === level ? 'on' : 'off'
    }
    if (field.status === 'common') {
      return Number(field.value) === level ? 'on' : 'off'
    }
    const values = field.mixedValues ?? []
    for (const entry of values) {
      if (Number(entry) === level) {
        return 'mixed'
      }
    }
    return 'off'
  }
  const {
    undoTooltipText,
    redoTooltipText,
    historyMenuOpen,
    historyMenuAnchor,
    historyMenuPaperRef,
    historyMenuGuard,
    closeHistoryMenu,
    handleHistoryContextMenu,
    handleHistoryMouseMove,
    handleHistoryMouseLeave,
    handleHistoryMenuContextMenu,
    handleRequestClearHistory,
    handleHistoryEntrySelect,
    historyHintActive,
    historyHintPos,
  } = useBuilderHistoryMenu({
    undoPreview,
    redoPreview,
    t,
    onRequestClearHistory,
    onJumpToHistoryIndex,
  })
  const theme = useTheme()
  const { statButtonBorders: colorStatTexts } = useDisplayPreferences()
  const mixedBorderColor = useMemo(
    () => alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BORDER_ALPHA.dark : MULTI_EDIT_MIXED_BORDER_ALPHA.light,
    ),
    [theme],
  )
  const mixedPatternColor = useMemo(
    () => alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BG_ALPHA.dark : MULTI_EDIT_MIXED_BG_ALPHA.light,
    ),
    [theme],
  )
  const mixedTextColor = useMemo(
    () => alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_TEXT_ALPHA.dark : MULTI_EDIT_MIXED_TEXT_ALPHA.light,
    ),
    [theme],
  )
  const substatColors = _substatColors
  const configCount = _configCount
  // Shared styling for the builder’s status chips (Flex, Only locked, Auto ≥ …). The helper keeps
  // BuilderPanel and the cheat sheet visuals in sync.
  const builderToggleChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const singleRequiredCountValue = cfg.autoMinCount ? 'auto' : ((cfg.minCount ?? 0) > 0 ? String(cfg.minCount) : 'auto')
  const requiredCountValue = multiEditActive
    ? (() => {
        if (getRequiredCountTriState('auto') === 'on') return 'auto'
        const manualMatch = REQUIRED_SUBSTAT_MIN_OPTIONS.find((option) => getRequiredCountTriState(option) === 'on')
        return manualMatch != null ? String(manualMatch) : MULTI_VALUE_SENTINEL
      })()
    : singleRequiredCountValue
  const singleKeepModeValue = ((effectiveConfig as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late'
  const keepModeValue = multiEditActive
    ? (() => {
        if (getKeepModeTriState('late') === 'on') return 'late'
        if (getKeepModeTriState('early') === 'on') return 'early'
        return MULTI_VALUE_SENTINEL
      })()
    : singleKeepModeValue
  const thresholdsActiveAny = multiEditActive && multiSourceConfigs
    ? multiSourceConfigs.some((config) => isMilestoneThresholdsActive(config))
    : isMilestoneThresholdsActive(effectiveConfig)
  const autoRarityChipState = getAutoRarityTriState()
  // Localized label for rank/star options in the Rank select.
  // Uses i18n star keys so locales can customize the star text.
  const rankOptionLabel = (code: number): string => {
    const n = Number(code)
    type StarKey = 'star1' | 'star2' | 'star3' | 'star4' | 'star5' | 'star6'
    const starKey = (s: number): StarKey => {
      switch (s) {
        case 1: return 'star1'
        case 2: return 'star2'
        case 3: return 'star3'
        case 4: return 'star4'
        case 5: return 'star5'
        case 6: return 'star6'
        default: return 'star1'
      }
    }
    if (n === 0) return t('any')
    if (n >= 1 && n <= 6) return t(starKey(n))
    if (n >= 7 && n <= 11) return `≥${NBSP}${t(starKey(n - 6))}`
    if (n >= 12 && n <= 16) return `≤${NBSP}${t(starKey(n - 10))}`
    return String(n)
  }
  // Localized label for rarity options (including ≥/≤ prefixes and Auto).
  const rarityOptionLabel = (mode: 'auto' | 'code', code: number): string => {
    // Auto uses the shared label so it mirrors the select menu.
    if (mode === 'auto') return t('headerMenuAuto')
    // Map exact rarity values to localized names.
    if (code === RarityCode.Common) return t('rarityCommon')
    if (code === RarityCode.Uncommon) return t('rarityUncommon')
    if (code === RarityCode.Rare) return t('rarityRare')
    if (code === RarityCode.Epic) return t('rarityEpic')
    if (code === RarityCode.Legendary) return t('rarityLegendary')
    if (code === RarityCode.Mythical) return t('rarityMythical')
    // Map ≥ rarity values to localized names.
    if (code === RarityCode.GTE_Common) return `≥${NBSP}${t('rarityCommon')}`
    if (code === RarityCode.GTE_Uncommon) return `≥${NBSP}${t('rarityUncommon')}`
    if (code === RarityCode.GTE_Rare) return `≥${NBSP}${t('rarityRare')}`
    if (code === RarityCode.GTE_Epic) return `≥${NBSP}${t('rarityEpic')}`
    if (code === RarityCode.GTE_Legendary) return `≥${NBSP}${t('rarityLegendary')}`
    // Map ≤ rarity values to localized names.
    if (code === RarityCode.LTE_Uncommon) return `≤${NBSP}${t('rarityUncommon')}`
    if (code === RarityCode.LTE_Rare) return `≤${NBSP}${t('rarityRare')}`
    if (code === RarityCode.LTE_Epic) return `≤${NBSP}${t('rarityEpic')}`
    if (code === RarityCode.LTE_Legendary) return `≤${NBSP}${t('rarityLegendary')}`
    if (code === RarityCode.LTE_Mythical) return `≤${NBSP}${t('rarityMythical')}`
    // Fall back to the Any label when a code is unknown or empty.
    return t('any')
  }
  // Format a level milestone value for tooltips.
  const levelLabel = (level: LevelMilestone): string => `+${level}`
  const keepModeLabel = (mode: 'early' | 'late'): string => (
    mode === 'late' ? t('builderLateLabel') : t('builderEarlyLabel')
  )
  const autoLateLabel = (value?: 'uncommon' | 'rare' | 'epic'): string => {
    if (value === 'uncommon') return t('rarityUncommon')
    if (value === 'epic') return t('rarityEpic')
    return t('rarityRare')
  }
  const slotLabel = React.useCallback((id: number): string => {
    switch (Number(id)) {
      case 5: return t('slotWeapon')
      case 1: return t('slotHelmet')
      case 6: return t('slotShield')
      case 3: return t('slotGauntlets')
      case 2: return t('slotChestplate')
      case 4: return t('slotBoots')
      case 7: return t('slotRing')
      case 8: return t('slotAmulet')
      case 9: return t('slotBanner')
      default: return String(id)
    }
  }, [t])
  // Pre-compute localized slot labels so we can measure their widths once per render.
  const builderRootRef = useRef<HTMLDivElement | null>(null)
  const [cheatSheetMaxHeight, setCheatSheetMaxHeight] = useState<number | null>(null)
  const slotLabels = React.useMemo(
    () => artifactTypeIconList.map(({ id }) => slotLabel(Number(id))),
    [slotLabel]
  )
  // Icon fontSize="small" renders at 20px in our inline SVGs (see artifactTypeIcons).
  const SLOT_ICON_SIZE_PX = 20
  // Measure the longest button label in the current theme to keep slot icons aligned, including the icon/text gap.
  const slotMetrics = React.useMemo(() => {
    const defaultResult = {
      labelWidthPx: 0,
      labelFlexBasis: undefined as string | undefined,
      contentWidthPx: undefined as string | undefined,
      iconGapCss: theme.spacing(0.75),
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
    if (!slotLabels.length) return defaultResult
    if (typeof document === 'undefined') return defaultResult
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return defaultResult
    const buttonTypography = theme.typography.button ?? {}
    const fontFamily = buttonTypography.fontFamily ?? theme.typography.fontFamily ?? 'sans-serif'
    const fontStyle = buttonTypography.fontStyle ?? 'normal'
    const fontWeight = `${buttonTypography.fontWeight ?? theme.typography.fontWeightMedium ?? 500}`
    const htmlFontSize = typeof theme.typography.htmlFontSize === 'number'
      ? theme.typography.htmlFontSize
      : Number(theme.typography.htmlFontSize) || 16
    const parentFontSize = typeof theme.typography.fontSize === 'number'
      ? theme.typography.fontSize
      : parseFloat(String(theme.typography.fontSize)) || 14
    const parseSizeToPx = (value: unknown, fallbackPx: number, relativeToPx: number): number => {
      if (typeof value === 'number') return value
      if (value == null) return fallbackPx
      const str = String(value).trim()
      if (!str) return fallbackPx
      if (str.endsWith('rem')) return parseFloat(str) * htmlFontSize
      if (str.endsWith('em')) return parseFloat(str) * relativeToPx
      if (str.endsWith('px')) return parseFloat(str)
      const numeric = parseFloat(str)
      return Number.isNaN(numeric) ? fallbackPx : numeric
    }
    const fontSizePx = parseSizeToPx(buttonTypography.fontSize, parentFontSize, parentFontSize)
    const letterSpacingPx = parseSizeToPx(buttonTypography.letterSpacing, 0, fontSizePx)
    context.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`
    let maxWidth = 0
    for (const label of slotLabels) {
      const measured = context.measureText(label).width
      const spacing = Math.max(label.length - 1, 0) * letterSpacingPx
      const total = measured + spacing
      if (total > maxWidth) maxWidth = total
    }
    const labelWidthPx = Math.ceil(maxWidth + BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX)
    // Account for icon/text gap (theme.spacing uses px units) so icons line up even with padding applied.
    const gapCss = theme.spacing(0.75)
    const gapPx = parseSizeToPx(gapCss, 0, fontSizePx)
    // Icon components render 20px when fontSize="small" (matches artifactTypeIcons sizeFor('small')).
    const contentWidthPx = Math.ceil(labelWidthPx + gapPx + SLOT_ICON_SIZE_PX)
    return {
      labelWidthPx,
      labelFlexBasis: labelWidthPx > 0 ? `${labelWidthPx}px` : undefined,
      contentWidthPx: contentWidthPx > 0 ? `${contentWidthPx}px` : undefined,
      iconGapCss: gapCss,
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
  }, [slotLabels, theme])
  useEffect(() => {
    const node = builderRootRef.current
    if (!node) return
    const setHeight = (next: number) => {
      if (!Number.isFinite(next) || next <= 0) return
      setCheatSheetMaxHeight((prev) => (prev === next ? prev : next))
    }
    setHeight(Math.round(node.getBoundingClientRect().height))
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setHeight(Math.round(entry.contentRect.height))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const slotLabelFlexBasis = slotMetrics.labelFlexBasis
  const slotContentWidth = slotMetrics.contentWidthPx
  const slotIconGap = slotMetrics.iconGapCss
  const slotIconSize = slotMetrics.iconSizePx
  const factionLabel = (code: number): string => {
    switch (Number(code)) {
      case Faction.BannerLords: return t('factionBannerLords')
      case Faction.HighElves: return t('factionHighElves')
      case Faction.SacredOrder: return t('factionSacredOrder')
      case Faction.Barbarians: return t('factionBarbarians')
      case Faction.OgrynTribes: return t('factionOgrynTribes')
      case Faction.Lizardmen: return t('factionLizardmen')
      case Faction.Skinwalkers: return t('factionSkinwalkers')
      case Faction.Orcs: return t('factionOrcs')
      case Faction.Demonspawn: return t('factionDemonspawn')
      case Faction.UndeadHordes: return t('factionUndeadHordes')
      case Faction.DarkElves: return t('factionDarkElves')
      case Faction.KnightRevenant: return t('factionKnightRevenant')
      case Faction.Dwarves: return t('factionDwarves')
      case Faction.Shadowkin: return t('factionShadowkin')
      case Faction.SylvanWatchers: return t('factionSylvanWatchers')
      default: return String(code)
    }
  }
  // Roll indicator sizing and hover gutter come from centralized constants.
  // Toggle button sizing stays centralized so widths remain aligned across builder surfaces.
  const TOGGLE_BUTTON_HEIGHT_PX = BUILDER_TOGGLE_BUTTON_HEIGHT_PX
  const TOGGLE_BUTTON_MIN_WIDTH_PX = BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX
  const CLEAR_BUTTON_PLACEHOLDER_SX = useMemo(() => ({
    width: CLEAR_ICON_BUTTON_SIZE_PX,
    height: CLEAR_ICON_BUTTON_SIZE_PX,
    flexShrink: 0,
  }), [])
  const selectBoxHeightSx = {
    height: TOGGLE_BUTTON_HEIGHT_PX,
    minHeight: TOGGLE_BUTTON_HEIGHT_PX,
    cursor: 'pointer',
  } as const
  const selectContentHeightSx = {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    paddingTop: 0,
    paddingBottom: 0,
    cursor: 'pointer',
  } as const
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })
  const updateExportMode = useCallback((next: SellfileExportMode) => {
    onChange({ ...cfg, exportMode: next })
  }, [cfg, onChange])
  const updateLevelWindow = useCallback((min: LevelMilestone, max: LevelMilestone) => {
    // Keep level window updates normalized so min/max stay consistent.
    onChange(normalizeLevelWindow({ ...cfg, minLevel: min, maxLevel: max }))
  }, [cfg, onChange])
  const updateKeepMode = useCallback((mode: 'early' | 'late') => {
    // Normalize keep mode so Auto+Late and roll targets stay aligned.
    onChange(normalizeKeepWithAuto({ ...cfg, earlyKeepMode: mode }))
  }, [cfg, onChange, normalizeKeepWithAuto])
  const updateAutoLateThreshold = useCallback((nextTier: 'uncommon' | 'rare' | 'epic') => {
    // Normalize after setting the Auto+Late tier so related flags stay in sync.
    onChange(normalizeKeepWithAuto({ ...cfg, autoRaritySupplementsThreshold: nextTier }))
  }, [cfg, onChange, normalizeKeepWithAuto])
  const updateRaritySelection = useCallback((mode: 'auto' | 'code', code?: number) => {
    // Normalize to keep Auto+Late behavior consistent with the selection.
    if (mode === 'auto') {
      onChange(normalizeKeepWithAuto({ ...cfg, rarityMode: 'auto' }))
      return
    }
    onChange(normalizeKeepWithAuto({ ...cfg, rarityMode: 'code', rarityCode: Number(code ?? 0) }))
  }, [cfg, onChange, normalizeKeepWithAuto])
  const handleExportModeOverrideClick = React.useCallback((mode: SellfileExportMode) => {
    if (multiEditActive) return
    if (!exportModeOverrideActive) return
    if (exportModeValue !== mode) return
    updateExportMode(mode)
  }, [exportModeOverrideActive, exportModeValue, multiEditActive, updateExportMode])
  const [nameDraft, setNameDraft] = useState<string>('')
  const [nameDraftKey, setNameDraftKey] = useState<number | 'builder' | null>(null)
  // Popover anchor and draft state for tag editing.
  const [tagsAnchor, setTagsAnchor] = useState<HTMLElement | null>(null)
  const [tagsDraft, setTagsDraft] = useState<string>('')
  // Keep a ref to the tags menu so outside clicks can dismiss stuck backdrops.
  const tagsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  // Track Escape-driven closes so blur does not auto-commit tags.
  const tagsEscapeCloseRef = useRef(false)
  // Context menu anchor for the Tags button preferences.
  const [tagsContextAnchor, setTagsContextAnchor] = useState<HTMLElement | null>(null)
  // Store a ref so outside clicks close the Tags context menu reliably.
  const tagsContextPaperRef = useRef<HTMLDivElement | null>(null)
  // Context menu hint wiring for the Tags button.
  const {
    shouldShow: showTagsHint,
    markSeen: markTagsHintSeen,
  } = useContextMenuHint('builderTagsMenu')
  // Pointer-driven hint position for the Tags context menu overlay.
  const [tagsHintPos, setTagsHintPos] = useState<{ x: number; y: number } | null>(null)
  const currentDraftKey: number | 'builder' = editingIndex ?? 'builder'
  const nameDraftDirty = nameDraftKey === currentDraftKey
  // Derived UI state for tags in single vs multi-edit.
  const tagsPopoverOpen = Boolean(tagsAnchor)
  // Show the hint only when the menu is closed and the popover is idle.
  const tagsHintActive = showTagsHint && tagsHintPos !== null && !tagsContextAnchor && !tagsPopoverOpen
  // Centralize the close handler so onClose + outside-click cleanup stay aligned.
  const closeTagsPopover = useCallback(() => {
    setTagsAnchor(null)
  }, [])
  // Centralize the Tags context menu close to keep hint state in sync.
  const closeTagsContextMenu = useCallback(() => {
    setTagsContextAnchor(null)
  }, [])
  // Close the tags context menu on outside interactions so backdrops do not linger.
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(tagsContextAnchor),
    onClose: closeTagsContextMenu,
    menuRef: tagsContextPaperRef,
  })
  // Reset the hint position when the user has already seen the prompt.
  useEffect(() => {
    if (!showTagsHint) setTagsHintPos(null)
  }, [showTagsHint])
  // Track pointer entry to show the tags context menu hint.
  const handleTagsHintMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showTagsHint) return
    if (tagsContextAnchor) return
    if (tagsPopoverOpen) return
    setTagsHintPos({ x: event.clientX, y: event.clientY })
  }, [showTagsHint, tagsContextAnchor, tagsPopoverOpen])
  // Keep the hint anchored to the pointer as it moves.
  const handleTagsHintMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!showTagsHint) return
    if (tagsContextAnchor) return
    if (tagsPopoverOpen) return
    setTagsHintPos({ x: event.clientX, y: event.clientY })
  }, [showTagsHint, tagsContextAnchor, tagsPopoverOpen])
  // Clear the hint when the pointer leaves the Tags button area.
  const handleTagsHintMouseLeave = useCallback(() => {
    setTagsHintPos(null)
  }, [])
  // Open the Tags context menu on right-click and mark the hint as seen.
  const handleTagsContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    markTagsHintSeen()
    setTagsHintPos(null)
    setTagsContextAnchor(event.currentTarget as HTMLElement)
  }, [markTagsHintSeen])
  // Memoize single-config tags so callbacks get stable dependencies.
  const tagsValue = useMemo(() => (cfg.tags ?? []), [cfg.tags])
  // Summarize tag presence for multi-edit so mixed tags are styled separately.
  const tagPresence = useMemo(() => {
    if (!multiEditActive) return null
    // Prefer projected configs so staged patches are reflected in the tag chips.
    const source = (multiProjectedConfigs && multiProjectedConfigs.length > 0)
      ? multiProjectedConfigs
      : (multiSourceConfigs ?? [])
    // Convert each config’s tag list into a stable string array.
    const lists = source.map((config) => (
      Array.isArray(config.tags) ? config.tags.map(String) : []
    ))
    return summarizeTagPresence(lists)
  }, [multiEditActive, multiProjectedConfigs, multiSourceConfigs])
  // Expose the displayed tags based on single vs multi-edit state.
  const tagDisplay = useMemo(
    () => (multiEditActive ? (tagPresence?.all ?? []) : tagsValue),
    [multiEditActive, tagPresence, tagsValue],
  )
  // Keep the tags label stable for the tooltip + button text.
  const tagsButtonLabel = t('builderTagsLabel')
  // Treat any visible tags as an "active" state for the button color.
  const tagsButtonActive = tagDisplay.length > 0
  // Reuse a dedicated label for the clear-tags affordance so tooltips stay consistent.
  const tagsClearLabel = t('builderClearTags')
  // Treat any visible tags (single or multi-edit) as eligible for the clear affordance.
  const tagsClearable = multiEditActive ? tagDisplay.length > 0 : tagsValue.length > 0
  // Only show the clear button when there is something to reset.
  const showTagsClear = tagsClearable
  // Precompute mixed tag membership so chips can share the mixed styling.
  const mixedTagSet = useMemo(() => (
    new Set(tagPresence?.mixed ?? [])
  ), [tagPresence])
  // Shared mixed chip style mirrors other multi-edit mixed states.
  const mixedTagChipSx = useMemo(() => ({
    border: `1px dashed ${mixedBorderColor}`,
    color: mixedTextColor,
    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
  }), [mixedBorderColor, mixedPatternColor, mixedTextColor])
  // Close the tag popover on outside interactions to avoid stuck overlays.
  const { contextMenuGuard: tagsMenuGuard } = useContextMenuPaperGuard({
    open: tagsPopoverOpen,
    onClose: closeTagsPopover,
    menuRef: tagsMenuPaperRef,
  })
  const usingMultiName = multiEditActive && Boolean(multiEdit)
  const multiNameMixed = usingMultiName && multiNameField?.status === 'mixed' && !(multiNameField?.dirty)
  const multiNameDraftValue = usingMultiName
    ? (() => {
        if (!multiNameField) return ''
        if (multiNameField.status === 'mixed' && !multiNameField.dirty) return ''
        const value = multiNameField.value
        if (typeof value === 'string') return value
        if (value == null) return ''
        return String(value)
      })()
    : ''
  const commitName = React.useCallback((value: string) => {
    const next = value
    const current = cfg.name ?? ''
    if (current === next) {
      setNameDraft('')
      setNameDraftKey(null)
      return next
    }
    onChange({ ...cfg, name: next })
    setNameDraft('')
    setNameDraftKey(null)
    return next
  }, [cfg, onChange])
  const commitNameDraftIfNeeded = React.useCallback(() => {
    if (multiEditActive) return
    if (!nameDraftDirty) return
    commitName(nameDraft)
  }, [commitName, multiEditActive, nameDraft, nameDraftDirty])
  const getTagBaseState = useCallback((tag: string): TriStateBase => {
    // Default to "none" when multi-edit has no aggregate tag data yet.
    if (!tagPresence) return 'none'
    // Look up the number of configs currently containing the tag.
    const count = tagPresence.counts[tag] ?? 0
    // Convert the count into all/mixed/none for patch toggling.
    return deriveBaseTriState(count, tagPresence.total)
  }, [tagPresence])
  const stageTagPatch = useCallback((tokens: readonly string[], target: 'all' | 'none') => {
    // Only multi-edit uses tag patches; single edit still replaces the array.
    if (!multiEditActive || !multiEdit || !tagPresence) return
    // Start from any existing patch so multiple edits compose together.
    let nextPatch = (multiTagsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
    tokens.forEach((tag) => {
      // Use the current base state so toggles reflect the mixed/common baseline.
      const baseState = getTagBaseState(tag)
      nextPatch = computeStringPatchToggle(nextPatch, tag, baseState, target)
    })
    // Persist the patch without clobbering the underlying tag values.
    multiEdit.updateField('tags', {
      value: (multiTagsField?.value as BuilderConfig['tags']) ?? [],
      status: multiTagsField?.status ?? 'mixed',
      patch: nextPatch ?? null,
    })
  }, [getTagBaseState, multiEdit, multiEditActive, multiTagsField, tagPresence])
  const commitTags = useCallback((rawTags: readonly string[]) => {
    // Normalize and de-dupe tags before persisting.
    const seen = new Set<string>()
    const normalized: string[] = []
    rawTags.forEach((tag) => {
      const normalizedTag = normalizeTagValue(String(tag))
      if (!normalizedTag) return
      if (seen.has(normalizedTag)) return
      seen.add(normalizedTag)
      normalized.push(normalizedTag)
    })
    // Route updates through multi-edit patches when active.
    if (multiEditActive) {
      stageTagPatch(normalized, 'all')
      return
    }
    // Persist tags onto the single builder config.
    onChange({ ...cfg, tags: normalized })
  }, [cfg, multiEditActive, onChange, stageTagPatch])
  const commitTagsFromDraft = useCallback(() => {
    // Split comma-separated input and normalize each tag.
    const raw = tagsDraft.trim()
    if (!raw) return
    const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
    const normalizedAdds: string[] = []
    parts.forEach((part) => {
      const normalizedTag = normalizeTagValue(part)
      if (!normalizedTag) return
      normalizedAdds.push(normalizedTag)
    })
    // Abort if no valid tags were found.
    if (normalizedAdds.length === 0) return
    // Apply multi-edit patches or merge into the single-config list.
    if (multiEditActive) {
      stageTagPatch(normalizedAdds, 'all')
    } else {
      // Merge additions into the current tag list.
      const next = mergeTagList(tagsValue, normalizedAdds)
      commitTags(next)
    }
    setTagsDraft('')
  }, [commitTags, multiEditActive, stageTagPatch, tagsDraft, tagsValue])
  const removeTag = useCallback((tag: string) => {
    // Multi-edit removes tags via patch so it does not overwrite other tags.
    if (multiEditActive) {
      stageTagPatch([tag], 'none')
      return
    }
    // Remove a single tag and persist in single-edit mode.
    const filtered = tagsValue.filter((value) => value !== tag)
    commitTags(filtered)
  }, [commitTags, multiEditActive, stageTagPatch, tagsValue])
  const clearTags = useCallback(() => {
    // Bail if there is nothing to clear so we do not spam history.
    if (!tagsClearable) return
    // Multi-edit clears tags with a patch so every selected config resets together.
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('tags', {
        value: (multiTagsField?.value as BuilderConfig['tags']) ?? (cfg.tags ?? []),
        status: 'common',
        patch: { clear: true },
      })
      return
    }
    // Persist the empty tag list for the current config.
    onChange({ ...cfg, tags: [] })
  }, [cfg, multiEdit, multiEditActive, multiTagsField?.value, onChange, tagsClearable])
  const singleBuilderDirty = selectedIsDirty || nameDraftDirty
  const isDirty = multiEditActive ? multiDraftDirty : singleBuilderDirty
  const insertButtonLabel = editingIndex !== null
    ? t('builderInsertAsConfig', { n: editingIndex + 2 })
    : t('builderAddAsNew')
  const defaultSaveTarget = configCount > 0 ? configCount : BUILDER_DEFAULT_SAVE_TARGET
  const saveButtonLabel = multiEditActive
    ? t('builderApplyToConfigs', { n: multiEditSelectionCount })
    : (editingIndex !== null
      ? t('builderSaveAsConfig', { n: editingIndex + 1 })
      : t('builderSaveAsConfig', { n: defaultSaveTarget }))
  const builderCanAdd = !multiEditActive
  const saveDisabled = multiEditActive ? !multiDraftDirty : (editingIndex === null || !isDirty)
  // Controlled so the warning tooltip disappears when the button disables; scope key forces a remount on state changes.
  const [saveTooltipOpen, setSaveTooltipOpen] = useState(false)
  const saveTooltipScope = `${saveHiddenByFilters ? 'visible' : 'hidden'}:${saveDisabled ? 'disabled' : 'active'}`
  const actionButtonWidthPx = useMemo(() => {
    const samples = [
      t('builderAddAsNew'),
      t('builderInsertAsConfig', { n: MAX_CONFIG_INDEX_FOR_BUTTON_WIDTH }),
      t('builderSaveAsConfig', { n: MAX_CONFIG_INDEX_FOR_BUTTON_WIDTH }),
    ].filter((label): label is string => Boolean(label))
    if (samples.length === 0) return null
    if (typeof document === 'undefined') {
      const approxCharWidth = 8
      const iconWidthFallback = 20
      const paddingFallback = 40
      const longest = samples.reduce((max, label) => Math.max(max, label.length), 0)
      return Math.ceil(longest * approxCharWidth + iconWidthFallback + paddingFallback)
    }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const { typography } = theme
    const buttonTypography = typography.button ?? {}
    const fontFamily = buttonTypography.fontFamily ?? typography.fontFamily ?? 'sans-serif'
    const fontWeightValue = buttonTypography.fontWeight ?? typography.fontWeightMedium ?? 500
    const fontWeight = typeof fontWeightValue === 'number' ? String(fontWeightValue) : fontWeightValue
    const fontSizeValue = buttonTypography.fontSize ?? typography.fontSize ?? 14
    let fontSizePx: number
    if (typeof fontSizeValue === 'number') {
      fontSizePx = fontSizeValue
    } else {
      const raw = String(fontSizeValue).trim()
      if (raw.endsWith('rem')) {
        const numeric = Number.parseFloat(raw.slice(0, -3))
        const htmlFontSize = typography.htmlFontSize ?? 16
        fontSizePx = Number.isFinite(numeric) ? numeric * htmlFontSize : htmlFontSize
      } else if (raw.endsWith('px')) {
        const numeric = Number.parseFloat(raw.slice(0, -2))
        fontSizePx = Number.isFinite(numeric) ? numeric : 14
      } else {
        const numeric = Number.parseFloat(raw)
        fontSizePx = Number.isFinite(numeric) ? numeric : 14
      }
    }
    if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) return null
    ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`
    const textWidth = samples.reduce((max, label) => Math.max(max, ctx.measureText(label).width), 0)
    const iconWidthPx = 20
    const iconGapPx = 8
    const horizontalPaddingPx = 16 * 2
    const safetyBufferPx = 12
    return Math.ceil(textWidth + iconWidthPx + iconGapPx + horizontalPaddingPx + safetyBufferPx)
  }, [theme, t])
  const actionButtonSx: SxProps<Theme> = useMemo(() => ({
    whiteSpace: 'nowrap',
    justifyContent: 'center',
    textAlign: 'center',
    minWidth: actionButtonWidthPx ?? undefined,
    maxWidth: actionButtonWidthPx ?? undefined,
    gap: 0.75,
    '& .MuiButton-startIcon': {
      marginLeft: 0,
      marginRight: 0,
    },
  }), [actionButtonWidthPx])
  const targetWarningBadgeSx = useMemo(() => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 16,
    height: 16,
    borderRadius: '50%',
    backgroundColor: theme.palette.warning.main,
    color: theme.palette.getContrastText(theme.palette.warning.main),
    fontWeight: theme.typography.fontWeightBold ?? 600,
    fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(10) : '0.65rem',
    lineHeight: 1,
    boxShadow: theme.shadows[1],
  }), [theme])
  const renderedName = usingMultiName
    ? multiNameDraftValue
    : (nameDraftDirty ? nameDraft : (cfg.name ?? ''))
  const namePlaceholder = usingMultiName && multiNameMixed ? t('builderMultiNamePlaceholder') : undefined
  const userDisabledFlexRef = useRef(false)
  const userKeepModeRef = useRef<'auto' | 'early' | 'late'>('auto')
  const builderIdentity: number | 'builder' = editingIndex ?? 'builder'
  const lastBuilderIdentityRef = useRef<number | 'builder'>(builderIdentity)
  // When the active builder changes, capture its saved flex toggles so we preserve per-config intent.
  if (lastBuilderIdentityRef.current !== builderIdentity) {
    lastBuilderIdentityRef.current = builderIdentity
    userDisabledFlexRef.current = builderIdentity === 'builder'
      ? false
      : !cfg.autoSubstatFlex
    userKeepModeRef.current = builderIdentity === 'builder'
      ? 'auto'
      : (((cfg as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late')
  }
  const toggleSubstatFlex = () => {
    if (!canFlexSubstats) return
    const next = !cfg.autoSubstatFlex
    userDisabledFlexRef.current = !next
    onChange({ ...cfg, autoSubstatFlex: next })
  }

  const prevThresholdsActiveRef = useRef<boolean>(milestoneThresholdsActive)
  useEffect(() => {
    const prev = prevThresholdsActiveRef.current
    prevThresholdsActiveRef.current = milestoneThresholdsActive
    if (!prev && milestoneThresholdsActive) {
      const currentMode = ((cfg as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late'
      if (currentMode !== 'late' && userKeepModeRef.current === 'auto') {
        onChange({ ...cfg, earlyKeepMode: 'late' })
      }
    }
  }, [cfg, milestoneThresholdsActive, onChange])

  const prevCanFlexRef = useRef<boolean>(canFlexSubstats)
  useEffect(() => {
    const prev = prevCanFlexRef.current
    prevCanFlexRef.current = canFlexSubstats
    if (!prev && canFlexSubstats) {
      if (!cfg.autoSubstatFlex && !userDisabledFlexRef.current) {
        onChange({ ...cfg, autoSubstatFlex: true })
      }
    }
  }, [canFlexSubstats, cfg, onChange])
  // Note: We no longer color the stat toggle button borders. The preference
  // now controls coloring of stat texts in chips and preview only.
  const buttonBorderSx = (_variant: number) => {
    return {}
  }
  // Help popover (legacy copy still present); retained to avoid unused code churn.
  const [helpAnchor, setHelpAnchor] = useState<HTMLElement | null>(null)
  const [helpPos, setHelpPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => {
    const updateHelpPos = () => {
      try {
        setHelpPos({ top: Math.round(window.innerHeight / 2), left: Math.round(window.innerWidth / 2) })
      } catch {}
    }
    const cleanup = helpAnchor
      ? (() => {
        updateHelpPos()
        window.addEventListener('resize', updateHelpPos)
        return () => window.removeEventListener('resize', updateHelpPos)
      })()
      : undefined
    return cleanup
  }, [helpAnchor])
  // Sets selector ordering/display mode. 'icons' switches the regular Sets list
  // to an icon-only grid; metasets continue to render as a text list.
  const [setsOrder, setSetsOrder] = useSetsOrderPreference()
  const [setsSearch, setSetsSearch] = useState('')
  const { open: metaDlgOpen, openDialog: openMetaDlg, closeDialog: rawCloseMetaDlg } = useMetasetsDialog()
  const closeMetaDlg = useCallback(() => {
    void (async () => {
      try {
        await onBeforeMetasetsDialogClose?.()
      } catch (error) {
        console.error('Failed to flush rule cache before closing metasets dialog', error)
      } finally {
        rawCloseMetaDlg()
      }
    })()
  }, [onBeforeMetasetsDialogClose, rawCloseMetaDlg])
  const [metaSetsMenuOpen, setMetaSetsMenuOpen] = useState(false)
  // Fixed screen anchor for the Sets menu so header position doesn't move when height changes
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = useState<{ top: number; left: number } | null>(null)
  // While the Sets select menu is open, track which metaset the user is hovering
  // to temporarily highlight member gear sets in the Sets list/grid.
  const [hoveredSetMetaId, setHoveredSetMetaId] = useState<string | null>(null)
  
  const setsLeftRef = useRef<HTMLDivElement | null>(null)
  const setsSelectContainerRef = useRef<HTMLDivElement | null>(null)
  const setsMenuListRef = useRef<HTMLUListElement | null>(null)
  const metasetsMenuListRef = useRef<HTMLUListElement | null>(null)
  // Paper element for the Sets select menu; used to measure actual height
  // after mount so we can refine the anchor position precisely.
  const setsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const scrollSetsMenuToSelected = React.useCallback((orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && !metaSetsMenuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRef.current
    if (!list) return
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, { translate: t })
    let targetSetId: number | null = null
    for (const [id] of sortedForOrder) {
      const idNum = Number(id)
      if (getSetStateForScroll(idNum) === 'all') {
        targetSetId = idNum
        break
      }
    }
    if (targetSetId === null) {
      for (const [id] of sortedForOrder) {
        const idNum = Number(id)
        if (getSetStateForScroll(idNum) === 'partial') {
          targetSetId = idNum
          break
        }
      }
    }
    if (targetSetId === null) return
    requestAnimationFrame(() => {
      const item = list.querySelector<HTMLElement>(`[data-set-id="${targetSetId}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    })
  }, [getSetStateForScroll, metaSetsMenuOpen, setsMenuListRef, setsOrder, setsSearch, t])
  // Subtle highlight of controls affected by Reset when hovering the button
  const [hoverReset, setHoverReset] = useState(false)
  // Debounced rule count for the current builder config
  const {
    counting,
    displayRuleCount,
    countingLabel,
    ruleCountLimitValue,
    limitExceededWarning,
    limitWarningTooltip,
    ruleCountChipSx,
  } = useRuleCountBadge({
    cfg,
    substatTargets,
    ruleSubstatTargetsKey,
    multiEditActive,
    multiProjectedConfigs,
    multiSourceConfigs,
    multiEditSelection,
    multiDirtyKeys,
    configRuleCounts,
    configRuleFingerprints,
    selectedIsDirty,
    editingIndex,
    countRulesForConfigs,
    awaitRuleCounts: awaitRuleCounts ?? null,
    rulesBuilding,
    configsExcludedByTotalLimit,
    t,
  })
  // Chip text stays stable even when the spinner is active so tooltips + badges reuse the same string.
  const ruleCountChipText = useMemo(() => {
    if (displayRuleCount === null) return '—'
    return formatRulesCount(t, displayRuleCount, { limit: ruleCountLimitValue })
  }, [displayRuleCount, ruleCountLimitValue, t])
  // Aligns with the preview paper layout: chip first, spinner immediately to the right while counts resolve.
  const ruleCountChipWithSpinner = useMemo(() => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: counting ? 0.75 : 0 }}>
      <Chip
        size="small"
        data-testid="builder-rule-count-chip"
        label={ruleCountChipText}
        sx={ruleCountChipSx}
      />
      {counting
        ? <WorkloadProgressIndicator progressRatio={0.01} ariaLabel={countingLabel} />
        : null}
    </Box>
  ), [counting, countingLabel, ruleCountChipSx, ruleCountChipText])

  // setsLeftRef is used to align the Sets search row menu. No width measuring needed here.

  // Config name is edited directly on the builder state; no local draft needed.
  // Whether the current builder matches the built-in defaults.
  // Keep this aligned with the Reset-to-defaults payload below.
  const [defaultsEpoch, setDefaultsEpoch] = useState(0)
  const isDefaultBuilder = React.useMemo(() => {
    void defaultsEpoch // intentionally depend on defaultsEpoch to recompute when user defaults change
    const factoryDefaults = (): BuilderConfig => createFactoryBuilderDefaults()
    const loadUserDefaults = (): BuilderConfig | null => {
      try {
        const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const normalized = normalizeExportModeFields(parsed as Record<string, unknown>)
        return { ...createFactoryBuilderDefaults(), ...normalized } as BuilderConfig
      } catch { return null }
    }
    const target = loadUserDefaults() ?? factoryDefaults()
    const asNumArr = (v: unknown): number[] => Array.isArray(v) ? (v as number[]) : []
    const empty = (v: unknown) => {
      if (Array.isArray(v)) return v.length === 0
      if (v && typeof v === 'object') return Object.keys(v as object).length === 0
      return !v
    }
    return (
      (cfg.name ?? '') === (target.name ?? '') &&
      cfg.keep === Boolean(target.keep) &&
      cfg.exportMode === target.exportMode &&
      Number(cfg.rankCode) === Number(target.rankCode) &&
      Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0) === Number((target as unknown as { rarityCode?: number }).rarityCode ?? 0) &&
      (((cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'code') === ((target as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'code')) &&
      (((cfg as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare') === ((target as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare')) &&
      Number((cfg as unknown as { factionCode?: number }).factionCode ?? 0) === Number((target as unknown as { factionCode?: number }).factionCode ?? 0) &&
      JSON.stringify(asNumArr((cfg as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) &&
      (cfg as unknown as { minLevel?: LevelMilestone }).minLevel === (target as unknown as { minLevel?: LevelMilestone }).minLevel &&
      (cfg as unknown as { maxLevel?: LevelMilestone }).maxLevel === (target as unknown as { maxLevel?: LevelMilestone }).maxLevel &&
      ((cfg as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') === ((target as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') &&
      JSON.stringify(asNumArr((cfg as unknown as { substatsV?: number[] }).substatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { substatsV?: number[] }).substatsV).slice().sort()) &&
      JSON.stringify(asNumArr((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) &&
      Number(cfg.minCount) === Number(target.minCount) &&
      Boolean(cfg.autoMinCount) === Boolean(target.autoMinCount) &&
      Boolean((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) === Boolean((target as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) &&
      Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === Number((target as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) &&
      Boolean((cfg as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) === Boolean((target as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) &&
      empty((cfg as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) === empty((target as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) &&
      JSON.stringify(asNumArr((cfg as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) &&
      JSON.stringify(normalizeArtifactSetSelections((cfg as unknown as { artifactSets?: ArtifactSetSelectionEntry[] }).artifactSets ?? [])) === JSON.stringify(normalizeArtifactSetSelections((target as unknown as { artifactSets?: ArtifactSetSelectionEntry[] }).artifactSets ?? [])) &&
      JSON.stringify(((cfg as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) === JSON.stringify(((target as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort())
    )
  }, [cfg, defaultsEpoch])
  // Default builders reset the cached toggles so they mirror the factory state.
  if (isDefaultBuilder) {
    userDisabledFlexRef.current = false
    userKeepModeRef.current = 'auto'
  }

  // Compute the effective defaults (user overrides if present; otherwise factory)
  const getEffectiveDefaults = React.useCallback((): BuilderConfig => {
    try {
      const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const normalized = normalizeExportModeFields(parsed as Record<string, unknown>)
          return { ...createFactoryBuilderDefaults(), ...normalized } as BuilderConfig
        }
      }
    } catch {}
    return createFactoryBuilderDefaults()
  }, [])

  const {
    insert: {
      menu: {
        anchor: insertMenuAnchor,
        paperRef: insertMenuPaperRef,
        close: closeInsertMenu,
        onContextMenu: handleInsertContextMenu,
      },
      hint: {
        active: insertHintActive,
        pos: insertHintPos,
        onMouseEnter: handleInsertHintMouseEnter,
        onMouseMove: handleInsertHintMouseMove,
        onMouseLeave: handleInsertHintMouseLeave,
      },
    },
    apply: {
      menu: {
        anchor: applyMenuAnchor,
        paperRef: applyMenuPaperRef,
        close: closeApplyMenu,
        onContextMenu: handleApplyContextMenu,
      },
      hint: {
        active: applyHintActive,
        pos: applyHintPos,
        onMouseEnter: handleApplyHintMouseEnter,
        onMouseMove: handleApplyHintMouseMove,
        onMouseLeave: handleApplyHintMouseLeave,
      },
    },
    reset: {
      menu: {
        anchor: resetMenuAnchor,
        paperRef: resetMenuPaperRef,
        close: closeResetMenu,
        onContextMenu: handleResetContextMenu,
      },
      hint: {
        shouldShow: showResetHint,
        active: resetHintActive,
        pos: resetHintPos,
        onMouseEnter: handleResetHintMouseEnter,
        onMouseMove: handleResetHintMouseMove,
        onMouseLeave: handleResetHintMouseLeave,
        setPosition: setResetHintPos,
      },
    },
  } = useBuilderPanelActionMenus({
    builderCanAdd,
    multiEditActive,
    saveDisabled,
    isDefaultBuilder,
  })
  // Persisted toggle: auto reset the builder after inserting a config
  const [autoResetAfterInsert, setAutoResetAfterInsert] = useAutoResetAfterInsertPreference()
  // Persisted toggle: auto apply edits to the selected config after a short debounce.
  const [autoApplySelectedConfig, setAutoApplySelectedConfig] = useAutoApplySelectedConfigPreference()
  // Persisted toggle: show tag chips next to the Tags button.
  const [showTagsChips, setShowTagsChips] = useShowTagsChipsPreference()
  const autoApplyTimeoutRef = useRef<number | null>(null)
  const clearAutoApplyTimeout = useCallback(() => {
    const handle = autoApplyTimeoutRef.current
    if (handle !== null) {
      window.clearTimeout(handle)
      autoApplyTimeoutRef.current = null
    }
  }, [])
  const setAutoResetAfterInsertExclusive = useCallback((next: boolean) => {
    setAutoResetAfterInsert(next)
    if (next && autoApplySelectedConfig) {
      setAutoApplySelectedConfig(false)
      clearAutoApplyTimeout()
    }
  }, [autoApplySelectedConfig, clearAutoApplyTimeout, setAutoApplySelectedConfig, setAutoResetAfterInsert])
  const setAutoApplySelectedConfigExclusive = useCallback((next: boolean) => {
    setAutoApplySelectedConfig(next)
    if (next && autoResetAfterInsert) {
      setAutoResetAfterInsert(false)
    }
    if (!next) {
      clearAutoApplyTimeout()
    }
  }, [autoResetAfterInsert, clearAutoApplyTimeout, setAutoApplySelectedConfig, setAutoResetAfterInsert])
  useEffect(() => {
    if (autoApplySelectedConfig && autoResetAfterInsert) {
      setAutoResetAfterInsertExclusive(false)
    }
  }, [autoApplySelectedConfig, autoResetAfterInsert, setAutoResetAfterInsertExclusive])

  const handleResetBuilder = React.useCallback(() => {
    const eff = getEffectiveDefaults()
    onChange({ ...cfg, ...eff })
    setHoverReset(false)
  }, [cfg, getEffectiveDefaults, onChange])

  // Wrap insert to optionally reset builder controls to defaults (no dialog)
  const handleAddToCustom = () => {
    commitNameDraftIfNeeded()
    onAddToCustom()
    if (autoResetAfterInsert) {
      const eff = getEffectiveDefaults()
      onChange({ ...cfg, ...eff })
    }
  }
  // Attention phase: After idle threshold while dirty, replay suite effects every interval.
  const [attentionState, setAttentionState] = useState<{ phase: boolean; burst: boolean }>({ phase: false, burst: false })
  const attentionPhase = attentionState.phase
  const attentionBurst = attentionState.burst
  const [interactionNonce, setInteractionNonce] = useState(0)
  // Arm idle timer when dirty and reset whenever builder changes or user interacts
  useEffect(() => {
    setAttentionState({ phase: false, burst: false })
    const idle = isDirty
      ? window.setTimeout(() => setAttentionState({ phase: true, burst: true }), BUILDER_DIRTY_NUDGE_IDLE_MS)
      : null
    return () => { idle !== null && window.clearTimeout(idle) }
  }, [cfg, interactionNonce, isDirty])
  // When phase starts, trigger immediate burst and then repeat every interval until cancelled
  useEffect(() => {
    const activate = () => {
      setAttentionState(prev => ({ ...prev, burst: true }))
      const clearBurst = window.setTimeout(() => setAttentionState(prev => ({ ...prev, burst: false })), 1300)
      const iv = window.setInterval(() => {
        setAttentionState(prev => ({ ...prev, burst: true }))
        window.setTimeout(() => setAttentionState(prev => ({ ...prev, burst: false })), 1300)
      }, BUILDER_DIRTY_ATTENTION_INTERVAL_MS)
      return () => { window.clearTimeout(clearBurst); window.clearInterval(iv) }
    }
    return attentionPhase ? activate() : undefined
  }, [attentionPhase])
  const autoApplyEnabled = autoApplySelectedConfig && !multiEditActive && editingIndex !== null
  const performAutoApply = useCallback((): boolean => {
    if (!autoApplyEnabled) return false
    if (!singleBuilderDirty) return false
    clearAutoApplyTimeout()
    setSaveTooltipOpen(false)
    commitNameDraftIfNeeded()
    onUpdateSelected()
    if (attentionPhase) {
      setAttentionState({ phase: false, burst: false })
      setInteractionNonce((n) => n + 1)
    }
    return true
  }, [
    attentionPhase,
    autoApplyEnabled,
    clearAutoApplyTimeout,
    commitNameDraftIfNeeded,
    onUpdateSelected,
    setSaveTooltipOpen,
    setAttentionState,
    setInteractionNonce,
    singleBuilderDirty,
  ])
  useEffect(() => {
    if (!registerAutoApplyHandler) return undefined
    registerAutoApplyHandler(performAutoApply)
    return () => { registerAutoApplyHandler(null) }
  }, [performAutoApply, registerAutoApplyHandler])
  useEffect(() => {
    clearAutoApplyTimeout()
    if (!autoApplySelectedConfig) return
    if (multiEditActive) return
    if (editingIndex === null) return
    if (!singleBuilderDirty) return
    const handle = window.setTimeout(() => {
      autoApplyTimeoutRef.current = null
      void performAutoApply()
    }, BUILDER_AUTO_APPLY_DEBOUNCE_MS)
    autoApplyTimeoutRef.current = handle
    return () => { clearAutoApplyTimeout() }
  }, [
    autoApplySelectedConfig,
    clearAutoApplyTimeout,
    cfg,
    editingIndex,
    multiEditActive,
    performAutoApply,
    singleBuilderDirty,
  ])
  useEffect(() => {
    return () => { clearAutoApplyTimeout() }
  }, [clearAutoApplyTimeout])
  // Suite style only when we are in a burst window
  const suiteSx = useAttentionEffectStyles(attentionBurst)
  const resolveSx = React.useCallback((theme: Theme, sx: SxProps<Theme> | undefined): Record<string, unknown> => {
    // Normalize SxProps into a plain style object so base and highlight styles compose predictably.
    if (!sx) return {}
    if (Array.isArray(sx)) {
      return sx.reduce<Record<string, unknown>>((acc, entry) => {
        if (!entry) return acc
        return {
          ...acc,
          ...resolveSx(theme, entry as SxProps<Theme>),
        }
      }, {})
    }
    if (typeof sx === 'function') {
      const result = sx(theme)
      return result && typeof result === 'object' ? (result as Record<string, unknown>) : {}
    }
    return sx as Record<string, unknown>
  }, [])
  const saveButtonSx = React.useCallback((theme: Theme): SystemStyleObject<Theme> => {
    const base = { ...resolveSx(theme, actionButtonSx) } as SystemStyleObject<Theme>
    if (!(isDirty && editingIndex !== null)) {
      return base
    }
    const highlight = resolveSx(theme, suiteSx)
    const hasHighlight = Object.keys(highlight).length > 0
    // Merge the idle attention highlight while keeping the base visuals identical to Insert.
    return hasHighlight ? { ...base, ...(highlight as SystemStyleObject<Theme>) } : base
  }, [actionButtonSx, editingIndex, isDirty, resolveSx, suiteSx])

  // Legendary 42 overlay (centralized in attentionEffects). Triggers when the builder expects 2 required substats and 4 min required rolls.
  const fortyTwoOverlay = useFortyTwoLegendaryOverlay((Number(cfg.minCount) === 2) && (Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === 4))

  return (
    <Box ref={builderRootRef} sx={{ position: 'relative' }}>
      {fortyTwoOverlay}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 2,
      }}>
        <Box sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              label={t('builderConfigName')}
              value={renderedName}
              {...(namePlaceholder ? { placeholder: namePlaceholder } : {})}
              onChange={(e) => {
                if (usingMultiName) {
                  multiEdit?.updateField('name', { value: e.target.value, status: 'common' })
                } else {
                  setNameDraft(e.target.value)
                  setNameDraftKey(currentDraftKey)
                }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
              onBlur={commitNameDraftIfNeeded}
              InputProps={{
                endAdornment: (() => {
                  const showClear = usingMultiName
                    ? Boolean(multiNameField && String(multiNameField.value ?? '') !== '' && multiNameField.status !== 'mixed')
                    : renderedName !== ''
                  if (!showClear) return undefined
                  return (
                    <InputAdornment position="end">
                      <ClearIconButton
                        size="small"
                        edge="end"
                        aria-label={t('builderClearConfigName')}
                        tooltip={t('builderClearConfigName')}
                        onClick={() => {
                          if (usingMultiName) {
                            multiEdit?.updateField('name', { value: '', status: 'common' })
                          } else if (renderedName !== '') {
                            commitName('')
                          }
                        }}
                      />
                    </InputAdornment>
                  )
                })(),
              }}
              fullWidth
              inputProps={{ 'data-tour-id': 'builder.name' }}
            />
          </Box>
        </Box>

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })}>
          {/* Keep the Action label glued to the toggle width so translations never wrap. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              // ellipsisTitle mirrors the inline ellipsis span so DE strings expose their full text via
              // the OS tooltip without stacking another Markdown popper.
              ellipsisTitle={t('builderAction')}
              render={(
                <BuilderTooltipContent
                  text={[
                    t('builderActionHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderAction')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={keepValue}
                  onChange={(_, v) => {
                    if (!v) return
                    if (multiEditActive) {
                      multiEdit?.updateField('keep', { value: v === 'keep', status: 'common' })
                    } else {
                      update('keep', v === 'keep')
                    }
                  }}
                  sx={(theme) => ({
                    height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    position: 'relative',
                    '& .MuiToggleButton-root': {
                      position: 'relative',
                      zIndex: 1,
                      height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                      minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    },
                    ...(keepMixed ? {
                      borderRadius: theme.shape.borderRadius,
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        borderRadius: theme.shape.borderRadius,
                        border: `1px dashed ${mixedBorderColor}`,
                        backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                        pointerEvents: 'none',
                        zIndex: 0,
                      },
                    } : {}),
                  })}
                  data-tour-id="builder.action"
                >
                <ToggleButton
                  value="keep"
                  data-tour-id="builder.action.keep"
                  sx={(muiTheme) => {
                    const selected = keepValue === 'keep'
                    const baseBorder = selected
                      ? muiTheme.palette.success.main
                      : alpha(
                          muiTheme.palette.mode === 'dark'
                            ? muiTheme.palette.common.white
                            : muiTheme.palette.common.black,
                          0.12,
                        )
                    return {
                      borderColor: baseBorder,
                      color: selected ? muiTheme.palette.common.black : muiTheme.palette.text.primary,
                      '&.Mui-selected': {
                        borderColor: muiTheme.palette.success.main,
                        bgcolor: muiTheme.palette.success.main,
                        color: muiTheme.palette.common.black,
                        '&:hover': { bgcolor: muiTheme.palette.success.light },
                      },
                    }
                  }}
                >
                  {t('keepValueKeep')}
                </ToggleButton>
                <ToggleButton
                  value="sell"
                  data-tour-id="builder.action.sell"
                  sx={keepValue === 'sell' ? {
                    borderColor: 'error.main',
                    color: 'error.main',
                    '&.Mui-selected': {
                      bgcolor: 'error.main',
                      color: '#fff',
                      '&:hover': { bgcolor: 'error.dark' },
                    },
                  } : {}}
                >
                  {t('keepValueSell')}
                </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={exportModeValue}
                  onChange={(_, value) => {
                    if (!value) return
                    if (multiEditActive) {
                      multiEdit?.updateField('exportMode', { value: value as SellfileExportMode, status: 'common' })
                    } else {
                      updateExportMode(value as SellfileExportMode)
                    }
                  }}
                  sx={(theme) => ({
                    ml: 1,
                    position: 'relative',
                    height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    '& .MuiToggleButton-root': {
                      position: 'relative',
                      zIndex: 1,
                      height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                      minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    },
                    ...(exportModeMixed ? {
                      borderRadius: theme.shape.borderRadius,
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        borderRadius: theme.shape.borderRadius,
                        border: `1px dashed ${mixedBorderColor}`,
                        backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                        pointerEvents: 'none',
                        zIndex: 0,
                      },
                    } : {}),
                  })}
                  data-tour-id="builder.exportMode"
                >
                <ToggleButton
                  value="active"
                  onClick={() => handleExportModeOverrideClick('active')}
                  sx={(theme) => ({
                    px: 1.5,
                    ...(exportModeOverrideTarget === 'active' ? {
                      '&::before': {
                        // Use the same warning bubble used by the View Note button.
                        ...buildWarningBadgeIndicatorSx(theme),
                      },
                    } : {}),
                    '&.Mui-selected': {
                      bgcolor: theme.palette.success.main,
                      color: theme.palette.common.black,
                      borderColor: theme.palette.success.main,
                      '&:hover': { bgcolor: theme.palette.success.light },
                    },
                  })}
                >
                  <MarkdownTooltip
                    placement="top"
                    render={<BuilderTooltipContent text={buildExportModeTooltip(t('builderExportModeActiveTooltip'), 'active')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeActive')}
                    </Box>
                  </MarkdownTooltip>
                </ToggleButton>
                <ToggleButton
                  value="disabled"
                  onClick={() => handleExportModeOverrideClick('disabled')}
                  sx={(theme) => ({
                    px: 1.5,
                    ...(exportModeOverrideTarget === 'disabled' ? {
                      '&::before': {
                        // Use the same warning bubble used by the View Note button.
                        ...buildWarningBadgeIndicatorSx(theme),
                      },
                    } : {}),
                    '&.Mui-selected': {
                      color: theme.palette.success.main,
                      bgcolor: 'transparent',
                      borderColor: theme.palette.success.main,
                      '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.12) },
                    },
                  })}
                >
                  <MarkdownTooltip
                    placement="top"
                    render={<BuilderTooltipContent text={buildExportModeTooltip(t('builderExportModeDisabledTooltip'), 'disabled')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeDisabled')}
                    </Box>
                  </MarkdownTooltip>
                </ToggleButton>
                <ToggleButton value="separator" sx={{ px: 1.5 }}>
                  <MarkdownTooltip
                    placement="top"
                    render={<BuilderTooltipContent text={t('builderExportModeSeparatorTooltip')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeSeparator')}
                    </Box>
                  </MarkdownTooltip>
                </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            {/* Tags sit next to export mode to reinforce the enable/disable connection. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 1 }}>
              <Box
                component="span"
                onContextMenu={handleTagsContextMenu}
                onMouseEnter={handleTagsHintMouseEnter}
                onMouseMove={handleTagsHintMouseMove}
                onMouseLeave={handleTagsHintMouseLeave}
                sx={{ display: 'inline-flex' }}
              >
                <MarkdownTooltip
                  markdown={tagsButtonLabel}
                  placement="top"
                >
                  <Button
                    size="small"
                    variant="outlined"
                    color={tagsButtonActive ? 'warning' : 'success'}
                    onClick={(event) => {
                      // Reset any stale Escape marker before opening the popover.
                      tagsEscapeCloseRef.current = false
                      setTagsAnchor(event.currentTarget)
                    }}
                    aria-label={tagsButtonLabel}
                    // Match the preview Sort button sizing so the controls feel aligned.
                    sx={COMPACT_HEADER_ACTION_BUTTON_SX}
                  >
                    <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, width: '100%' }} data-ellipsis-target>
                      {tagsButtonLabel}
                    </Typography>
                  </Button>
                </MarkdownTooltip>
              </Box>
              {/* Only show the clear affordance when tags exist for this config. */}
              {showTagsClear ? (
                <ClearIconButton
                  size="small"
                  aria-label={tagsClearLabel}
                  tooltip={tagsClearLabel}
                  onClick={clearTags}
                />
              ) : null}
              {showTagsChips ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  {tagDisplay.slice(0, 3).map((tag) => (
                    <Chip
                      key={tag}
                      size="small"
                      label={tag}
                      sx={{
                        maxWidth: 120,
                        ...(multiEditActive && mixedTagSet.has(tag) ? mixedTagChipSx : null),
                      }}
                    />
                  ))}
                  {tagDisplay.length > 3 ? (
                    <Chip
                      size="small"
                      label={`+${tagDisplay.length - 3}`}
                      sx={{ opacity: 0.7 }}
                    />
                  ) : null}
                </Box>
              ) : null}
              {/* Reuse the ContextMenuPaper style so the tags popup matches substat context menus. */}
              {/* Disable menu padding so the inner box owns spacing. */}
              <Menu
                open={tagsPopoverOpen}
                anchorEl={tagsAnchor}
                onClose={closeTagsPopover}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                MenuListProps={{ disablePadding: true }}
                slotProps={{
                  paper: buildContextMenuPaperSlotProps({
                    component: ContextMenuPaper,
                    contextMenuGuard: tagsMenuGuard,
                    onRequestClose: closeTagsPopover,
                    closeLabel: t('close'),
                    ref: tagsMenuPaperRef,
                    sx: { minWidth: 260, maxWidth: 'calc(100vw - 32px)' },
                  }),
                }}
              >
                {/* Content block keeps spacing predictable inside the menu shell. */}
                <Box sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    {/* Tag chips are removable; empty state stays compact. */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {tagDisplay.length > 0 ? (
                        tagDisplay.map((tag) => (
                          <Chip
                            key={tag}
                            size="small"
                            label={tag}
                            onDelete={() => removeTag(tag)}
                            {...(multiEditActive && mixedTagSet.has(tag) ? { sx: mixedTagChipSx } : {})}
                          />
                        ))
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {t('builderTagsEmpty')}
                        </Typography>
                      )}
                    </Box>
                    {/* Input accepts comma/enter to append multiple tags quickly. */}
                    <TextField
                      size="small"
                      value={tagsDraft}
                      placeholder={t('builderTagsPlaceholder')}
                      onChange={(event) => setTagsDraft(event.target.value)}
                      onKeyDown={(event) => {
                        const key = event.key
                        // Escape should always close the popover so the modal backdrop clears.
                        if (key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          // Mark this close so blur does not apply draft tags.
                          tagsEscapeCloseRef.current = true
                          closeTagsPopover()
                          return
                        }
                        // Keep listbox shortcuts from hijacking typing/navigation.
                        event.stopPropagation()
                        // Enter or comma commits the draft tags in-place.
                        if (key === 'Enter' || key === ',') {
                          event.preventDefault()
                          commitTagsFromDraft()
                        }
                      }}
                      onBlur={() => {
                        // Ignore blur that was triggered by an Escape close.
                        if (tagsEscapeCloseRef.current) {
                          tagsEscapeCloseRef.current = false
                          return
                        }
                        commitTagsFromDraft()
                      }}
                    />
                  </Stack>
                </Box>
              </Menu>
              {/* Tags context menu: toggle whether tag chips render inline. */}
              <Menu
                anchorEl={tagsContextAnchor}
                open={Boolean(tagsContextAnchor)}
                onClose={closeTagsContextMenu}
                PaperProps={{ ref: tagsContextPaperRef }}
              >
                <MenuItem onClick={() => setShowTagsChips(!showTagsChips)}>
                  <Checkbox
                    size="small"
                    checked={showTagsChips}
                    onChange={(event) => setShowTagsChips(Boolean(event.target.checked))}
                    sx={{ mr: 1, p: 0.5 }}
                  />
                  {t('builderMenuShowTags')}
                </MenuItem>
              </Menu>
              {/* Context menu hint overlay matches the rest of the builder controls. */}
              <ContextMenuHintOverlay text={t('contextMenuHint')} position={tagsHintActive ? tagsHintPos : null} />
            </Box>
            <Box
              sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}
              onContextMenu={handleHistoryContextMenu}
              onMouseMove={handleHistoryMouseMove}
              onMouseLeave={handleHistoryMouseLeave}
            >
              <MarkdownTooltip
                render={<BuilderTooltipContent text={undoTooltipText} colorizeStats substatColors={substatColors} />}
                slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={onUndo}
                    disabled={!canUndo}
                    aria-label={t('builderUndo')}
                    sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
                  >
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </MarkdownTooltip>
              <MarkdownTooltip
                render={<BuilderTooltipContent text={redoTooltipText} colorizeStats substatColors={substatColors} />}
                slotProps={{ tooltip: { sx: { maxWidth: HISTORY_TOOLTIP_MAX_WIDTH_PX } } }}
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={onRedo}
                    disabled={!canRedo}
                    aria-label={t('builderRedo')}
                    sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
                  >
                    <RedoIcon fontSize="small" />
                  </IconButton>
                </span>
              </MarkdownTooltip>
              <MarkdownTooltip markdown={t('builderHelpOpen')}>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => setHelpAnchor(e.currentTarget as HTMLElement)}
                  aria-label={t('builderHelpOpen')}
                  sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
                >
                  <HelpOutlineIcon fontSize="small" />
                </IconButton>
              </MarkdownTooltip>
            </Box>
            <ContextMenuHintOverlay text={t('contextMenuHint')} position={historyHintActive ? historyHintPos : null} />
            <HistoryContextMenu
              open={historyMenuOpen}
              anchorPosition={historyMenuAnchor}
              onClose={closeHistoryMenu}
              paperRef={historyMenuPaperRef}
              onPaperContextMenu={handleHistoryMenuContextMenu}
              contextMenuGuard={historyMenuGuard}
              entries={historyTimeline}
              t={t}
              onSelectEntry={handleHistoryEntrySelect}
              onRequestClearHistory={handleRequestClearHistory}
              substatColors={substatColors}
            />
          </Box>
        </FormControl>

        {/* Row 2: Left half (Rank, Rarity, Faction) */}
        <Box sx={(theme) => ({
          gridColumn: '1 / 3',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
          columnGap: 1,
          rowGap: 2,
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })}>
        <FormControl fullWidth sx={{ position: 'relative' }}>
          {/* Rank label mirrors the select width and ellipsizes when German strings run long. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              ellipsisTitle={t('builderRank')}
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    [
                      t('builderRankHelp'),
                      t('builderMultiMixedTooltipSuffix'),
                    ].join('\n'),
                    rankOptionLabel(cfg.rankCode),
                    rankOptionLabel(effectiveConfig.rankCode),
                    rankOverrideActive,
                  )}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderRank')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Select
              size="small"
              value={rankValue}
              displayEmpty
              onChange={(e: SelectChangeEvent<string>) => {
                const raw = e.target.value
                if (multiEditActive) {
                  if (raw === '') return
                  const next = Number(raw)
                  if (!Number.isFinite(next)) return
                  multiEdit?.updateField('rankCode', { value: next as BuilderConfig['rankCode'], status: 'common' })
                } else {
                  update('rankCode', Number(raw))
                }
              }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              data-tour-id="builder.rank"
              sx={(theme) => ({
                flex: 1,
                position: 'relative',
                ...selectBoxHeightSx,
                '& .MuiSelect-select': selectContentHeightSx,
                ...(multiEditActive && rankMixed ? {
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderStyle: 'dashed',
                  },
                } : {}),
                ...(rankOverrideActive ? {
                  '&::after': {
                    ...buildWarningBadgeIndicatorSx(theme),
                  },
                } : {}),
              })}
              renderValue={(selected) => {
                if (multiEditActive && selected === '') {
                  return (
                    <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      {t('builderMultiMixedValue')}
                    </Box>
                  )
                }
                const numeric = Number(selected)
                return rankOptionLabel(Number.isNaN(numeric) ? 0 : numeric)
              }}
            >
              <MenuItem value={String(0)}>{t('any')}</MenuItem>
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityExact')}</ListSubheader>
              {[RankCode.One,RankCode.Two,RankCode.Three,RankCode.Four,RankCode.Five,RankCode.Six].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rankOverrideActive) return
                    if (cfg.rankCode === effectiveConfig.rankCode) return
                    if (Number(code) !== effectiveConfig.rankCode) return
                    update('rankCode', effectiveConfig.rankCode)
                  }}
                >
                  {rankOptionLabel(Number(code))}
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
              {[RankCode.GTE_One,RankCode.GTE_Two,RankCode.GTE_Three,RankCode.GTE_Four,RankCode.GTE_Five].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rankOverrideActive) return
                    if (cfg.rankCode === effectiveConfig.rankCode) return
                    if (Number(code) !== effectiveConfig.rankCode) return
                    update('rankCode', effectiveConfig.rankCode)
                  }}
                >
                  {rankOptionLabel(Number(code))}
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
              {[RankCode.LTE_Two,RankCode.LTE_Three,RankCode.LTE_Four,RankCode.LTE_Five,RankCode.LTE_Six].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rankOverrideActive) return
                    if (cfg.rankCode === effectiveConfig.rankCode) return
                    if (Number(code) !== effectiveConfig.rankCode) return
                    update('rankCode', effectiveConfig.rankCode)
                  }}
                >
                  {rankOptionLabel(Number(code))}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </FormControl>

        <FormControl fullWidth>
          {/* Rarity label uses the shared inline span so Auto/GTE text stays single-line. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              ellipsisTitle={t('filterRarity')}
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    [
                      t('builderRarityHelpIntro'),
                      `• ${t('builderRarityHelpNoMinRolls')}`,
                      `• ${t('builderRarityHelpStartSubs')}`,
                      `• ${t('builderRarityHelpMinTotalRolls')}`,
                      `• ${t('builderAutoPlusLateHelp')}`,
                      t('builderMultiMixedTooltipSuffix'),
                    ].join('\n'),
                    rarityOptionLabel(storedRarityMode, cfg.rarityCode),
                    rarityOptionLabel(effectiveRarityMode, effectiveConfig.rarityCode),
                    rarityOverrideActive,
                  )}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('filterRarity')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Select
              size="small"
              value={rarityValue}
              displayEmpty
              onChange={(e: SelectChangeEvent<string>) => {
                const v = e.target.value
                if (multiEditActive) {
                  if (v === '') return
                  if (v === 'auto') {
                    multiEdit?.updateField('rarityMode', { value: 'auto', status: 'common' })
                    multiEdit?.resetField('rarityCode')
                  } else {
                    const numeric = Number(v)
                    if (!Number.isFinite(numeric)) return
                    multiEdit?.updateField('rarityMode', { value: 'code', status: 'common' })
                    multiEdit?.updateField('rarityCode', { value: numeric as BuilderConfig['rarityCode'], status: 'common' })
                  }
                } else {
                  if (v === 'auto') {
                    updateRaritySelection('auto')
                  } else {
                    updateRaritySelection('code', Number(v))
                  }
                }
              }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              data-tour-id="builder.rarity"
              sx={(theme) => ({
                flex: 1,
                position: 'relative',
                ...selectBoxHeightSx,
                '& .MuiSelect-select': selectContentHeightSx,
                ...(multiEditActive && rarityMixed ? {
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderStyle: 'dashed',
                  },
                } : {}),
                ...(rarityOverrideActive ? {
                  '&::after': {
                    ...buildWarningBadgeIndicatorSx(theme),
                  },
                } : {}),
              })}
              renderValue={(selected) => {
                if (multiEditActive && selected === '') {
                  return (
                    <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      {t('builderMultiMixedValue')}
                    </Box>
                  )
                }
                if (selected === 'auto') {
                  return t('headerMenuAuto')
                }
                const numeric = Number(selected)
                return rarityCodeToName(numeric) || t('any')
              }}
            >
              <MenuItem
                value={'auto'}
                onClick={() => {
                  // When an override is active, allow clicking the effective value to accept it.
                  if (multiEditActive || !rarityOverrideActive) return
                  if (cfg.rarityMode === effectiveRarityMode && cfg.rarityCode === effectiveConfig.rarityCode) return
                  if (effectiveRarityMode !== 'auto') return
                  updateRaritySelection('auto')
                }}
              >
                {t('headerMenuAuto')}
              </MenuItem>
              <MenuItem
                value={String(0)}
                onClick={() => {
                  // When an override is active, allow clicking the effective value to accept it.
                  if (multiEditActive || !rarityOverrideActive) return
                  if (cfg.rarityMode === effectiveRarityMode && cfg.rarityCode === effectiveConfig.rarityCode) return
                  if (effectiveRarityMode !== 'code') return
                  if (effectiveConfig.rarityCode !== 0) return
                  updateRaritySelection('code', 0)
                }}
              >
                {rarityCodeToName(0) || t('any')}
              </MenuItem>
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityExact')}</ListSubheader>
              {[RarityCode.Common,RarityCode.Uncommon,RarityCode.Rare,RarityCode.Epic,RarityCode.Legendary,RarityCode.Mythical].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rarityOverrideActive) return
                    if (cfg.rarityMode === effectiveRarityMode && cfg.rarityCode === effectiveConfig.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveConfig.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  {code === RarityCode.Common ? t('rarityCommon') :
                    code === RarityCode.Uncommon ? t('rarityUncommon') :
                    code === RarityCode.Rare ? t('rarityRare') :
                    code === RarityCode.Epic ? t('rarityEpic') :
                    code === RarityCode.Legendary ? t('rarityLegendary') :
                    code === RarityCode.Mythical ? t('rarityMythical') : rarityCodeToName(code)}
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
              {[RarityCode.GTE_Common,RarityCode.GTE_Uncommon,RarityCode.GTE_Rare,RarityCode.GTE_Epic,RarityCode.GTE_Legendary].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rarityOverrideActive) return
                    if (cfg.rarityMode === effectiveRarityMode && cfg.rarityCode === effectiveConfig.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveConfig.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  {code === RarityCode.GTE_Common ? `≥${NBSP}${t('rarityCommon')}` :
                    code === RarityCode.GTE_Uncommon ? `≥${NBSP}${t('rarityUncommon')}` :
                    code === RarityCode.GTE_Rare ? `≥${NBSP}${t('rarityRare')}` :
                    code === RarityCode.GTE_Epic ? `≥${NBSP}${t('rarityEpic')}` :
                    code === RarityCode.GTE_Legendary ? `≥${NBSP}${t('rarityLegendary')}` : rarityCodeToName(code)}
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
              {[RarityCode.LTE_Uncommon,RarityCode.LTE_Rare,RarityCode.LTE_Epic,RarityCode.LTE_Legendary,RarityCode.LTE_Mythical].map((code) => (
                <MenuItem
                  key={code}
                  value={String(code)}
                  onClick={() => {
                    // When an override is active, allow clicking the effective value to accept it.
                    if (multiEditActive || !rarityOverrideActive) return
                    if (cfg.rarityMode === effectiveRarityMode && cfg.rarityCode === effectiveConfig.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveConfig.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  {code === RarityCode.LTE_Uncommon ? `≤${NBSP}${t('rarityUncommon')}` :
                    code === RarityCode.LTE_Rare ? `≤${NBSP}${t('rarityRare')}` :
                    code === RarityCode.LTE_Epic ? `≤${NBSP}${t('rarityEpic')}` :
                    code === RarityCode.LTE_Legendary ? `≤${NBSP}${t('rarityLegendary')}` :
                    code === RarityCode.LTE_Mythical ? `≤${NBSP}${t('rarityMythical')}` : rarityCodeToName(code)}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          {/* Faction label stays constrained to the Select width for DE translations. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              ellipsisTitle={t('builderFaction')}
              render={(
                <BuilderTooltipContent
                  text={[
                    t('builderFactionHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderFaction')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Select
              size="small"
              value={factionValue}
              displayEmpty
              onChange={(e: SelectChangeEvent<string>) => {
                const raw = e.target.value
                if (multiEditActive) {
                  if (raw === '') return
                  const next = Number(raw)
                  if (!Number.isFinite(next)) return
                  multiEdit?.updateField('factionCode', { value: next as BuilderConfig['factionCode'], status: 'common' })
                } else {
                  update('factionCode', Number(raw))
                }
              }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
              data-tour-id="builder.faction"
              sx={{
                flex: 1,
                ...selectBoxHeightSx,
                '& .MuiSelect-select': selectContentHeightSx,
                ...(multiEditActive && factionMixed ? {
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderStyle: 'dashed',
                  },
                } : {}),
              }}
              renderValue={(selected) => {
                if (multiEditActive && selected === '') {
                  return (
                    <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      {t('builderMultiMixedValue')}
                    </Box>
                  )
                }
                const numeric = Number(selected)
                if (!numeric) return t('any')
                const label = factionLabel(numeric)
                return (
                  <EllipsisTooltip title={label}>
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                      <FactionOptionLabel faction={numeric as FactionId} label={label} truncate textSx={{ fontSize: FONT_SIZE_BASE_PX }} />
                    </Box>
                  </EllipsisTooltip>
                )
              }}
            >
              <MenuItem value={String(0)}>{t('any')}</MenuItem>
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTelerianLeague')}</ListSubheader>
              {[Faction.BannerLords,Faction.HighElves,Faction.SacredOrder,Faction.Barbarians].map((code) => (
                <MenuItem key={code} value={String(code)}>
                  <FactionOptionLabel faction={code} label={factionLabel(Number(code))} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupGaellenPact')}</ListSubheader>
              {[Faction.OgrynTribes,Faction.Lizardmen,Faction.Skinwalkers,Faction.Orcs].map((code) => (
                <MenuItem key={code} value={String(code)}>
                  <FactionOptionLabel faction={code} label={factionLabel(Number(code))} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTheCorrupted')}</ListSubheader>
              {[Faction.Demonspawn,Faction.UndeadHordes,Faction.DarkElves,Faction.KnightRevenant].map((code) => (
                <MenuItem key={code} value={String(code)}>
                  <FactionOptionLabel faction={code} label={factionLabel(Number(code))} />
                </MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupNyresanUnion')}</ListSubheader>
              {[Faction.Dwarves,Faction.Shadowkin,Faction.SylvanWatchers].map((code) => (
                <MenuItem key={code} value={String(code)}>
                  <FactionOptionLabel faction={code} label={factionLabel(Number(code))} />
                </MenuItem>
              ))}
            </Select>
          </Box>
        </FormControl>
        </Box>
        {/* Row 2: Right half (Count Rolls, Evaluate From, Roll Strategy) */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })}>
        <FormControl data-tour-id="builder.min-level">
          {/* Min level header shares the ellipsis style with the toggle group. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              ellipsisTitle={t('builderMinLevel')}
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    [
                      t('builderMinLevelHelp'),
                      t('builderMultiMixedTooltipSuffix'),
                    ].join('\n'),
                    levelLabel(storedMinLevel),
                    levelLabel(effectiveMinLevel),
                    levelOverrideActive,
                  )}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderMinLevel')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={minLevelValue}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if (!LEVEL_MILESTONES.includes(num as LevelMilestone)) return
                const nextMin = num as LevelMilestone
                if (multiEditActive) {
                  multiEdit?.updateField('minLevel', { value: nextMin, status: 'common' })
                  const currentMax = aggregatedMaxLevel
                  if (currentMax < nextMin) {
                    multiEdit?.updateField('maxLevel', { value: nextMin, status: 'common' })
                  }
                } else {
                  const currentMax = ((cfg as BuilderConfig).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
                  const nextMax = (nextMin > currentMax ? nextMin : currentMax) as LevelMilestone
                  updateLevelWindow(nextMin, nextMax)
                }
              }}
              sx={(theme) => ({
                height: TOGGLE_BUTTON_HEIGHT_PX,
                position: 'relative',
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                  justifyContent: 'center',
                },
                ...(levelOverrideActive ? {
                  '&::after': {
                    ...buildWarningBadgeIndicatorSx(theme),
                  },
                } : {}),
              })}
            >
              {LEVELS.map((l) => {
                const state = getLevelTriState(multiMinLevelField, singleMinLevel, l)
                return (
                  <ToggleButton
                    key={l}
                    value={String(l)}
                    selected={state === 'on'}
                    sx={(theme) => ({
                      ...(state === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                      ...(state === 'mixed' ? {
                        borderStyle: 'dashed',
                        borderColor: mixedBorderColor,
                        color: mixedTextColor,
                        backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                      } : {}),
                    })}
                    onClick={() => {
                      // When an override is active, allow clicking the effective value to accept it.
                      if (multiEditActive || !levelOverrideActive) return
                      if (storedMinLevel === effectiveMinLevel && storedMaxLevel === effectiveMaxLevel) return
                      if (effectiveMinLevel !== l) return
                      updateLevelWindow(effectiveMinLevel, effectiveMaxLevel)
                    }}
                  >
                    +{l}
                  </ToggleButton>
                )
              })}
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl data-tour-id="builder.max-level">
          {/* Max level header also clamps to the toggle button row to avoid wraps. */}
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]}>
            <MarkdownTooltip
              ellipsisTitle={t('builderMaxLevel')}
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    [
                      t('builderMaxLevelHelp'),
                      t('builderMultiMixedTooltipSuffix'),
                    ].join('\n'),
                    levelLabel(storedMaxLevel),
                    levelLabel(effectiveMaxLevel),
                    levelOverrideActive,
                  )}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderMaxLevel')}</Box>
            </MarkdownTooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={maxLevelValue}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if (!LEVEL_MILESTONES.includes(num as LevelMilestone)) return
                const nextMax = num as LevelMilestone
                if (multiEditActive) {
                  multiEdit?.updateField('maxLevel', { value: nextMax, status: 'common' })
                  const currentMin = aggregatedMinLevel
                  if (nextMax < currentMin) {
                    multiEdit?.updateField('minLevel', { value: nextMax, status: 'common' })
                  }
                } else {
                  const currentMin = ((cfg as BuilderConfig).minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
                  const nextMin = (nextMax < currentMin ? nextMax : currentMin) as LevelMilestone
                  updateLevelWindow(nextMin, nextMax)
                }
              }}
              sx={(theme) => ({
                height: TOGGLE_BUTTON_HEIGHT_PX,
                position: 'relative',
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                  justifyContent: 'center',
                },
                ...(levelOverrideActive ? {
                  '&::after': {
                    ...buildWarningBadgeIndicatorSx(theme),
                  },
                } : {}),
              })}
            >
              {LEVELS.map((l) => {
                const state = getLevelTriState(multiMaxLevelField, singleMaxLevel, l)
                return (
                  <ToggleButton
                    key={l}
                    value={String(l)}
                    selected={state === 'on'}
                    sx={(theme) => ({
                      ...(state === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                      ...(state === 'mixed' ? {
                        borderStyle: 'dashed',
                        borderColor: mixedBorderColor,
                        color: mixedTextColor,
                        backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                      } : {}),
                    })}
                    onClick={() => {
                      // When an override is active, allow clicking the effective value to accept it.
                      if (multiEditActive || !levelOverrideActive) return
                      if (storedMinLevel === effectiveMinLevel && storedMaxLevel === effectiveMaxLevel) return
                      if (effectiveMaxLevel !== l) return
                      updateLevelWindow(effectiveMinLevel, effectiveMaxLevel)
                    }}
                  >
                    +{l}
                  </ToggleButton>
                )
              })}
            </ToggleButtonGroup>
          </Box>
        </FormControl>
        {/* Roll Strategy removed — level window controls replace it. */}
        
        </Box>
        {/* Help popover */}
        <BuilderCheatSheetPopover
          open={Boolean(helpAnchor)}
          anchorPosition={helpAnchor ? helpPos : undefined}
          maxHeight={cheatSheetMaxHeight ?? null}
          onClose={() => setHelpAnchor(null)}
          substatColors={substatColors}
        />
        {/* Row 3: Mainstat (left), Substats (right) */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          // Align hover timing with other groups for Reset hover tint
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })} data-tour-id="builder.mainstat">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Mainstat label tracks the toggle width so it never pushes the clear button. */}
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <MarkdownTooltip
                ellipsisTitle={t('builderMain')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderMainHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderMain')}</Box>
              </MarkdownTooltip>
            </FormLabel>
            {(() => {
              const baseMainSelected = (((cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []).length > 0)
              const hasMainSelection = multiEditActive && multiSummary
                ? [...STAT_VARIANTS_PRIORITY_ROW1, ...STAT_VARIANTS_PRIORITY_ROW2].some((variant) => resolveMainStatTriState(variant) !== 'none')
                : baseMainSelected
              return hasMainSelection
                ? (
                  <ClearIconButton
                    size="small"
                    aria-label={t('builderClearMainStats')}
                    tooltip={t('builderClearMainStats')}
                    onClick={() => clearMainSelection()}
                  />
                )
                : (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
            })()}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              const value: string[] = ((cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []).map(String)
              const handleChange = (_: React.SyntheticEvent, v: string[]) => {
                if (!Array.isArray(v)) return
                const nextNumbers = Array.from(new Set(v.map((token) => Number(token)).filter((n) => Number.isFinite(n))))
                if (nextNumbers.length === 0) {
                  onChange({ ...cfg, mainStatsV: [] })
                  return
                }
                onChange({ ...cfg, mainStatsV: nextNumbers as number[] })
              }
              return (
                <>
                  {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={(event, v) => {
                      if (multiEditActive) return
                      handleChange(event, v as string[])
                    }}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': {
                        px: 0.75,
                        minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX,
                        width: TOGGLE_BUTTON_MIN_WIDTH_PX,
                        height: TOGGLE_BUTTON_HEIGHT_PX,
                        justifyContent: 'center',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      },
                      '& .MuiToggleButton-root.Mui-selected': {
                        borderColor: (theme) => theme.palette.divider,
                      },
                      '& .MuiToggleButtonGroup-grouped': {
                        margin: '0 !important',
                        borderRadius: 1,
                      },
                    }}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => {
                      const state = resolveMainStatTriState(variant)
                      return (
                        <ToggleButton
                          key={variant}
                          value={`${variant}`}
                          selected={multiEditActive ? state === 'all' : value.includes(String(variant))}
                          onClick={(event) => {
                            if (!multiEditActive) return
                            event.preventDefault()
                            event.stopPropagation()
                            toggleMainStat(variant)
                          }}
                          sx={{
                            ...buttonBorderSx(variant),
                            ...(multiEditActive && state === 'mixed' ? {
                              borderStyle: 'dashed',
                              borderColor: mixedBorderColor,
                              color: mixedTextColor,
                              backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                            } : {}),
                          }}
                          data-tour-id={variant === StatVariant.SPD ? 'builder.mainstat.spd' : undefined}
                        >
                          {t(statVariantI18nKey(variant))}
                        </ToggleButton>
                      )
                    })}
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={(event, v) => {
                      if (multiEditActive) return
                      handleChange(event, v as string[])
                    }}
                    sx={{
                      gap: 0.5,
                      '& .MuiToggleButton-root': {
                        px: 0.75,
                        minWidth: TOGGLE_BUTTON_MIN_WIDTH_PX,
                        width: TOGGLE_BUTTON_MIN_WIDTH_PX,
                        height: TOGGLE_BUTTON_HEIGHT_PX,
                        justifyContent: 'center',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      },
                      '& .MuiToggleButton-root.Mui-selected': {
                        borderColor: (theme) => theme.palette.divider,
                      },
                      '& .MuiToggleButtonGroup-grouped': {
                        margin: '0 !important',
                        borderRadius: 1,
                      },
                    }}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => {
                      const state = resolveMainStatTriState(variant)
                      return (
                        <ToggleButton
                          key={variant}
                          value={`${variant}`}
                          selected={multiEditActive ? state === 'all' : value.includes(String(variant))}
                          onClick={(event) => {
                            if (!multiEditActive) return
                            event.preventDefault()
                            event.stopPropagation()
                            toggleMainStat(variant)
                          }}
                          sx={{
                            ...buttonBorderSx(variant),
                            ...(multiEditActive && state === 'mixed' ? {
                              borderStyle: 'dashed',
                              borderColor: mixedBorderColor,
                              color: mixedTextColor,
                              backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                            } : {}),
                          }}
                          data-tour-id={variant === StatVariant.SPD ? 'builder.mainstat.spd' : undefined}
                        >
                          {t(statVariantI18nKey(variant))}
                        </ToggleButton>
                      )
                    })}
                  </ToggleButtonGroup>
                </>
              )
            })()}
          </Box>
        </FormControl>

        <FormControl sx={(theme) => ({
          gridColumn: '3 / 5',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })} data-tour-id="builder.substats">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Substats label uses the same inline span to keep the reset button aligned. */}
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <MarkdownTooltip
                ellipsisTitle={t('builderSubstats')}
                render={(
                  <BuilderTooltipContent
                    text={[
                      t('builderSubstatsPickHelp'),
                      t('builderMultiMixedTriStateHint'),
                      `• ${t('builderSubstatsClickHint')}`,
                      `• ${t('rollIndicatorTip1')}`,
                      `• ${t('rollIndicatorTip2')}`,
                      `• ${t('rollIndicatorTip3')}`,
                      `• ${t('rollIndicatorTip4')}`,
                    ].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderSubstats')}</Box>
              </MarkdownTooltip>
            </FormLabel>
            {(() => {
              if (multiEditActive && multiSummary) {
                if (substatsPatch?.clear) {
                  return (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
                }
                const projectedHas = (() => {
                  if (substatsPatch?.replace) return substatsPatch.replace.length > 0
                  const variants = new Set<number>()
                  for (const key of multiSummary.subCounts.keys()) variants.add(Number(key))
                  if (substatsPatch?.add) substatsPatch.add.forEach((v) => variants.add(Number(v)))
                  if (substatsPatch?.remove) substatsPatch.remove.forEach((v) => variants.add(Number(v)))
                  for (const variant of variants) {
                    if (getSubstatPresenceCount(variant) > 0) return true
                  }
                  return false
                })()
                return projectedHas
                  ? (
                    <ClearIconButton
                      size="small"
                      aria-label={t('builderClearSubstats')}
                      tooltip={t('builderClearSubstats')}
                      onClick={() => {
                        multiEdit?.updateField('substatsV', {
                          value: (multiSubstatsField?.value as BuilderConfig['substatsV']) ?? (cfg.substatsV ?? []),
                          status: 'common',
                          patch: { clear: true },
                        })
                        multiEdit?.updateField('fixedSubstatsV', {
                          value: (multiFixedSubstatsField?.value as BuilderConfig['fixedSubstatsV']) ?? (cfg.fixedSubstatsV ?? []),
                          status: 'common',
                          patch: { clear: true },
                        })
                        multiEdit?.updateField('substatRollBoundsV', {
                          value: (multiRollField?.value as BuilderConfig['substatRollBoundsV']) ?? (cfg.substatRollBoundsV ?? {}),
                          status: 'common',
                          patch: {},
                        })
                      }}
                    />
                  )
                  : (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
              }
              const substatsSelection = (((cfg as unknown) as { substatsV?: number[] }).substatsV) ?? []
              const hasSubstats = substatsSelection.length > 0
              return hasSubstats
                ? (
                  <ClearIconButton
                    size="small"
                    aria-label={t('builderClearSubstats')}
                    tooltip={t('builderClearSubstats')}
                  onClick={() => onChange(normalizeKeepWithAuto({
                      ...cfg,
                      substatsV: [],
                      fixedSubstatsV: [],
                      minCount: 0,
                      substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }>,
                      substatRollTargetsV: {} as SubstatRollTargets,
                    }))}
                  />
                )
                : (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
            })()}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {(() => {
              
              const value: string[] = ((((cfg as unknown) as { substatsV?: number[] }).substatsV) ?? []).map(String)
              const isSelected = (v: number) => {
                const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                return subsV.includes(v)
              }
              const isFixed = (v: number) => {
                const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                return fixedV.includes(v)
              }
              const getBounds = (vKey: number) => {
                return (cfg.substatRollBoundsV)?.[vKey]
              }
              const setBounds = (vKey: number, bounds?: { min?: number; max?: number; any?: boolean }) => {
                applySingleSubstatBounds(vKey, () => {
                  if (!bounds) return null
                  return { ...bounds }
                })
              }
              // No unset: default is star (any).
              // New interaction model:
              // - Left click increases current sequence.
              //   From ★: enters Min (0), then 1→…→5→★.
              //   From Roll Upper Limit: 0→…→4→★.
              // - Right click decreases current sequence.
              //   From ★: enters Roll Upper Limit (4), then 3→…→0→★.
              const cycleMin = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 0 (Min)
                  setBounds(vKey, { min: 0 })
                } else if (hasMin && curMin < 5) {
                  // 1..4 -> +1; 5 handled below
                  setBounds(vKey, { min: curMin + 1 })
                } else {
                  // none or 5 -> ★
                  setBounds(vKey, { any: true })
                }
              }

              const cycleForward = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined))
                const hasMax = typeof b?.max === 'number'
                const hasMin = typeof b?.min === 'number'
                if (isAny) {
                  // ★ -> Min 0
                  setBounds(vKey, { min: 0 })
                } else if (hasMax) {
                  // Left-click on the Roll Upper Limit goes down (1→0→★)
                  cycleMaxBack(vKey)
                } else if (hasMin) {
                  cycleMin(vKey)
                } else {
                  setBounds(vKey, { any: true })
                }
              }

              const cycleBackward = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined))
                const hasMax = typeof b?.max === 'number'
                const hasMin = typeof b?.min === 'number'
                if (isAny) {
                  // ★ -> Roll Upper Limit 0 (forbid rolls)
                  setBounds(vKey, { max: 0 })
                } else if (hasMax) {
                  // On the Roll Upper Limit, right‑click increases (0→1→…→4→★)
                  const curMax = Math.max(0, Math.min(4, Number(b?.max)))
                  if (curMax < 4) setBounds(vKey, { max: curMax + 1 })
                  else setBounds(vKey, { any: true })
                } else if (hasMin) {
                  cycleMinBack(vKey)
                } else {
                  setBounds(vKey, { any: true })
                }
              }

              const cycleMinBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMin = typeof b?.min === 'number'
                const curMin = hasMin ? Math.max(0, Math.min(5, Number(b?.min))) : 0
                if (isAny) {
                  // ★ -> 5 (Min)
                  setBounds(vKey, { min: 5 })
                } else if (hasMin && curMin > 0) {
                  // 1..5 -> -1; 0 handled below
                  setBounds(vKey, { min: curMin - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleMaxBack = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                const b = getBounds(vKey)
                const isAny = Boolean(b?.any)
                const hasMax = typeof b?.max === 'number'
                const curMax = hasMax ? Math.max(0, Math.min(4, Number(b?.max))) : 0
                if (isAny) {
                  // ★ -> 4 (Max)
                  setBounds(vKey, { max: 4 })
                } else if (hasMax && curMax > 0) {
                  // 1..4 -> -1; 0 handled below
                  setBounds(vKey, { max: curMax - 1 })
                } else {
                  // 0 or none -> ★
                  setBounds(vKey, { any: true })
                }
              }
              
              const cycleSubstat = (vKey: number, e?: React.MouseEvent) => {
                if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
                if (multiEditActive && multiEdit) {
                  multiToggleSubstat(vKey)
                  return
                }
                const selected = isSelected(vKey)
                if (!selected) {
                  const prevV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                  const nextV = [...prevV, vKey]
                  const nextLen = nextV.length
                  const nextMin = (cfg.autoMinCount ? Math.min(4, nextLen) : ((cfg.minCount === 0 && nextLen > 0) ? 1 : cfg.minCount)) as 0 | 1 | 2 | 3 | 4
                  const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>) }
                  bVAll[vKey] = { any: true }
                  onChange(normalizeKeepWithAuto({ ...cfg, substatsV: nextV, minCount: nextMin, substatRollBoundsV: bVAll }))
                  return
                }
                // Selected (locked or not) -> remove entirely
                const prevSubsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const nextSubsV = prevSubsV.filter((v) => v !== vKey)
                const prevFixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                const nextFixedV = prevFixedV.filter((v) => v !== vKey)
                // prune bounds for substat (variant-keyed)
                const bVAll = { ...((cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>) }
                const { [vKey]: _omit, ...restV } = bVAll
                const prunedV: Record<number, { min?: number; max?: number; any?: boolean }> = restV
                const nextMin = (cfg.autoMinCount ? Math.min(4, nextSubsV.length) : (cfg.minCount > nextSubsV.length ? (nextSubsV.length as 0 | 1 | 2 | 3 | 4) : cfg.minCount)) as 0 | 1 | 2 | 3 | 4
                // Check if this removal deactivates Milestone Thresholds; if so, normalize to Early.
                onChange(normalizeKeepWithAuto({ ...cfg, substatsV: nextSubsV, fixedSubstatsV: nextFixedV, substatRollBoundsV: prunedV, minCount: nextMin }))
              }
              // Lock badge toggle: ensures the substat is selected before flipping fixed state.
              const toggleSubstatLock = (vKey: number) => {
                const selected = isSelected(vKey)
                const fixed = isFixed(vKey)
                const prevSubs = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                const prevFixed = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
                const boundsSource = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
                if (!selected) {
                  const nextSubs = [...prevSubs, vKey]
                  const nextFixed = Array.from(new Set([...prevFixed, vKey]))
                  const nextLen = nextSubs.length
                  const nextMin = (cfg.autoMinCount ? Math.min(4, nextLen) : ((cfg.minCount === 0 && nextLen > 0) ? 1 : Math.min(cfg.minCount, nextLen))) as 0 | 1 | 2 | 3 | 4
                  const nextBounds = { ...boundsSource, [vKey]: { any: true } }
                  const nextCfg = normalizeKeepWithAuto({
                    ...cfg,
                    substatsV: nextSubs,
                    fixedSubstatsV: nextFixed,
                    minCount: nextMin,
                    substatRollBoundsV: nextBounds,
                  })
                  onChange(nextCfg)
                  return
                }
                if (!fixed) {
                  const nextFixed = Array.from(new Set([...prevFixed, vKey]))
                  onChange(normalizeKeepWithAuto({ ...cfg, fixedSubstatsV: nextFixed }))
                  return
                }
                const nextFixed = prevFixed.filter((v) => v !== vKey)
                const nextCfg = normalizeKeepWithAuto({ ...cfg, fixedSubstatsV: nextFixed })
                onChange(nextCfg)
              }

              // Emit Markdown-friendly copy so the substat roll indicator can drop straight into MarkdownTooltip without JSX wrappers.
              const rollIndicatorTooltip = [
                t('rollIndicatorTip1'),
                `- ${t('rollIndicatorTip2')}`,
                `- ${t('rollIndicatorTip3')}`,
                `- ${t('rollIndicatorTip4')}`,
              ].join('\n')

              const renderSubstatToggle = (variant: StatVariant, options?: { dataTourId?: string }) => {
                const singleBounds = getBounds(variant)
                const presenceState = multiEditActive ? getSubstatPresence(variant) : (isSelected(variant) ? 'all' : 'none')
                const lockState = multiEditActive ? getSubstatLockState(variant) : (isFixed(variant) ? 'all' : 'none')
                const rollMode = multiEditActive ? getRollMode(variant) : (() => {
                  if (!singleBounds || singleBounds.any) return { kind: 'any', presence: isSelected(variant) ? 1 : 0 } as RollMode
                  const hasMin = typeof singleBounds.min === 'number'
                  const hasMax = typeof singleBounds.max === 'number'
                  if (hasMax) {
                    return {
                      kind: 'max',
                      presence: 1,
                      max: Math.max(0, Math.min(4, Number(singleBounds.max))),
                      ...(hasMin ? { min: Math.max(0, Math.min(5, Number(singleBounds.min))) } : {}),
                    } as RollMode
                  }
                  if (hasMin) {
                    return { kind: 'min', presence: 1, min: Math.max(0, Math.min(5, Number(singleBounds.min))) } as RollMode
                  }
                  return { kind: 'any', presence: isSelected(variant) ? 1 : 0 } as RollMode
                })()
                const buttonSelected = multiEditActive ? (presenceState === 'all') : isSelected(variant)
                const displaySelected = multiEditActive ? (presenceState !== 'none') : isSelected(variant)
                const indicatorMixed = multiEditActive && (rollMode.kind === 'mixed' || presenceState === 'partial')
                const indicator = (() => {
                  if (indicatorMixed) return undefined
                  if (multiEditActive) {
                    if (rollMode.kind === 'any') {
                      return displaySelected ? { wildcard: true, tooltip: rollIndicatorTooltip } : undefined
                    }
                    if (rollMode.kind === 'min') {
                      return {
                        wildcard: false,
                        min: rollMode.min,
                        ...(typeof rollMode.max === 'number' ? { max: rollMode.max } : {}),
                        tooltip: rollIndicatorTooltip,
                      }
                    }
                    if (rollMode.kind === 'max') {
                      return {
                        wildcard: false,
                        max: rollMode.max,
                        ...(typeof rollMode.min === 'number' ? { min: rollMode.min } : {}),
                        tooltip: rollIndicatorTooltip,
                      }
                    }
                    return undefined
                  }
                  const hasMin = typeof singleBounds?.min === 'number'
                  const minVal = hasMin ? Math.max(0, Math.min(5, Number(singleBounds?.min))) : undefined
                  const hasMax = typeof singleBounds?.max === 'number' && isFinite(singleBounds.max ?? NaN)
                  const maxVal = hasMax ? Math.max(0, Math.min(4, Number(singleBounds?.max))) : undefined
                  const wildcard = Boolean(singleBounds?.any) || (!hasMin && !hasMax)
                  return displaySelected
                    ? {
                        wildcard,
                        ...(typeof minVal === 'number' ? { min: minVal } : {}),
                        ...(typeof maxVal === 'number' ? { max: maxVal } : {}),
                        tooltip: rollIndicatorTooltip,
                      }
                    : undefined
                })()
                const lockIsMixed = multiEditActive && (presenceState === 'partial' || lockState === 'partial')
                const lockHoverBaseOpacity = (lockState === 'all' || lockIsMixed) ? 1 : 0
                const lockSx: SxProps<Theme> = lockIsMixed
                  ? {
                      color: mixedTextColor,
                      textShadow: 'none',
                    }
                  : {
                      color: theme.palette.text.primary,
                      textShadow: 'none',
                    }
                const handleClick = (event: React.MouseEvent) => {
                  if (multiEditActive && multiEdit) {
                    try { event.preventDefault(); event.stopPropagation() } catch {}
                    multiToggleSubstat(variant)
                    return
                  }
                  cycleSubstat(variant, event)
                }
                const ensurePresenceBeforeRollAdjust = () => {
                  if (!multiEditActive || !multiEdit) return
                  if (presenceState !== 'all') ensureMultiSubstatPresence(variant)
                }
                const handleIndicatorClick = (event: React.MouseEvent) => {
                  try { event.stopPropagation() } catch {}
                  if (multiEditActive && multiEdit) {
                    ensurePresenceBeforeRollAdjust()
                    multiCycleRollForward(variant)
                    return
                  }
                  cycleForward(variant, event)
                }
                const handleIndicatorContext = (event: React.MouseEvent) => {
                  event.preventDefault()
                  try { event.stopPropagation() } catch {}
                  if (multiEditActive && multiEdit) {
                    ensurePresenceBeforeRollAdjust()
                    multiCycleRollBackward(variant)
                    return
                  }
                  cycleBackward(variant, event)
                }
                const handleLockToggle = (event: React.MouseEvent | React.KeyboardEvent) => {
                  try { event.preventDefault(); event.stopPropagation() } catch {}
                  if (multiEditActive && multiEdit) {
                    multiToggleSubstatLock(variant)
                    return
                  }
                  toggleSubstatLock(variant)
                }
                const handleContextMenu = (event: React.MouseEvent) => {
                  try { event.preventDefault(); event.stopPropagation() } catch {}
                  markSubstatHintSeenAndClear()
                  const anchorPosition = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY }
                  const wasSelected = displaySelected
                  if (!wasSelected) {
                    if (multiEditActive && multiEdit) {
                      multiToggleSubstat(variant)
                    } else {
                      cycleSubstat(variant)
                    }
                  }
                const info = deriveSubstatMenuInfo(variant)
                const openMenu = () => {
                  setSubstatMenu({
                    variant,
                    anchor: anchorPosition,
                  })
                  setSubstatMenuDraft(null)
                  resetSubstatMenuChipWidths()
                }
                if (!info) {
                  if (!wasSelected && typeof window !== 'undefined') {
                    window.setTimeout(() => {
                      openMenu()
                    }, 0)
                  }
                  return
                }
                openMenu()
                }
                const lockTooltip = (() => {
                  if (multiEditActive) {
                    if (lockIsMixed) return t('builderSubstatLockTooltipMixed')
                    return lockState === 'all'
                      ? t('builderSubstatLockTooltipUnlock')
                      : t('builderSubstatLockTooltipLock')
                  }
                  return isFixed(variant)
                    ? t('builderSubstatLockTooltipUnlock')
                    : t('builderSubstatLockTooltipLock')
                })()
                const interactiveHover = interactiveHoverVariant === variant
                const toggleButtonSx = (theme: Theme): SystemStyleObject<Theme> => {
                  const base = {
                    ...buttonBorderSx(variant),
                    '--sub-lock-hover-opacity': lockHoverBaseOpacity,
                    ...(multiEditActive && presenceState === 'partial'
                      ? {
                          borderStyle: 'dashed',
                          borderColor: mixedBorderColor,
                          color: mixedTextColor,
                          backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                      }
                      : {}),
                    color: theme.palette.text.primary,
                    transition: 'background-color .15s, border-color .15s, color .15s',
                    '&[data-interactive-hover="true"]': {
                      '--sub-lock-hover-opacity': lockHoverBaseOpacity,
                    },
                    '&[data-interactive-hover="true"]:not(.Mui-selected)': {
                      backgroundColor: 'transparent !important',
                    },
                    '&.Mui-selected[data-interactive-hover="true"]': {
                      backgroundColor: theme.palette.action.selected,
                      color: theme.palette.text.primary,
                    },
                    '&.Mui-selected[data-interactive-hover="true"] .roll-label': {
                      color: theme.palette.text.primary,
                    },
                  } as (SystemStyleObject<Theme> & Record<string, unknown>)
                  return base
                }
                return (
                  <ToggleButton
                    key={variant}
                    value={`${variant}`}
                    selected={buttonSelected}
                    onClick={handleClick}
                    onMouseMove={(e) => {
                      if (!showSubstatHint || substatMenu) return
                      setSubstatHintPos({ x: e.clientX, y: e.clientY })
                    }}
                    onContextMenu={handleContextMenu}
                    onMouseLeave={() => {
                      setInteractiveHoverVariant((current) => (current === variant ? null : current))
                      clearSubstatHint()
                    }}
                    sx={toggleButtonSx}
                    data-tour-id={options?.dataTourId}
                    data-interactive-hover={interactiveHover ? 'true' : undefined}
                  >
                    <SubstatToggleDisplay
                      label={t(statVariantI18nKey(variant))}
                      locked={lockState !== 'none'}
                      selected={displaySelected}
                      {...(indicator ? { indicator } : {})}
                      indicatorMixed={indicatorMixed}
                      onIndicatorClick={handleIndicatorClick}
                      onIndicatorContextMenu={handleIndicatorContext}
                      lockSx={lockSx}
                      onLockToggle={handleLockToggle}
                      lockTooltip={lockTooltip}
                      lockAriaLabel={t('builderSubstatLockControlLabel', { stat: t(statVariantI18nKey(variant)) })}
                      lockIsMixed={lockIsMixed}
                      onInteractiveHoverChange={(hovering) => {
                        setInteractiveHoverVariant((current) => {
                          if (hovering) return variant
                          return current === variant ? null : current
                        })
                      }}
                    />
                  </ToggleButton>
                )
              }
              const effectiveMinDraft = substatMenuDraft?.min ?? activeMenuInfo?.minValue ?? null
              const effectiveMaxDraft = substatMenuDraft?.max ?? activeMenuInfo?.maxValue ?? null
              const statLabelText = activeMenuInfo ? t(statVariantI18nKey(activeMenuInfo.variant)) : ''
              const statHighlightColor = activeMenuInfo && colorStatTexts
                ? (substatColors[activeMenuInfo.variant]?.fg ?? theme.palette.primary.main)
                : undefined
              // Summarize the currently opened substat across the active config(s).
              // Reuses the Builder math so we can display lock/min/max/target
              // pills without rebuilding the entire rule set.
              const computeMenuValueSummary = () => {
                if (!activeMenuInfo) return null
                const label = statLabelText
                if (!label) return null
                const variantId = activeMenuInfo.variant
                const configs = (() => {
                  if (multiEditActive) {
                    if (multiProjectedConfigs && multiProjectedConfigs.length > 0) return multiProjectedConfigs
                    if (multiSourceConfigs && multiSourceConfigs.length > 0) return multiSourceConfigs
                    return []
                  }
                  return [cfg]
                })()
                if (!configs || configs.length === 0) return null
                const starFallback = (substatTargets.anyRankDefaultsTo ?? 6) as Star
                const isRollCount = Number(variantId) === StatVariant.RollCount
                const normalizeLevel = (value: number | undefined | null): LevelMilestone => {
                  if (value != null && LEVEL_MILESTONES.includes(value as LevelMilestone)) return value as LevelMilestone
                  return LEVEL_MILESTONES[0]!
                }
                const metrics = configs.map((config) => {
                  const star = starForRankCode(Number(config.rankCode ?? 0), starFallback)
                  const baseValueRaw = baseMinForStarV(Number(variantId), star, substatTargets)
                  const baseValue = Math.max(0, baseValueRaw ?? 0)
                  const rarityCode = (config.rarityMode === 'auto') ? resolveAutoRarityCode(config) : config.rarityCode
                  const rollLevels = Array.from(rollLevelsForRarityCode(rarityCode)).sort((a, b) => a - b)
                const baselineMode = deriveRollBaselineMode(config)
                const minLevel = normalizeLevel(config.minLevel)
                const maxLevel = normalizeLevel(config.maxLevel)
                const windowMin = Math.min(minLevel, maxLevel)
                const windowMax = Math.max(minLevel, maxLevel)
                  const preRolls = rarityIncludesMythical(rarityCode) ? 1 : 0
                  const countUpTo = (limit: number) => {
                    let total = 0
                    for (const lvl of rollLevels) {
                      if (lvl <= limit) total += 1
                    }
                    return total
                  }
                  let maxRolls = 0
                  if (baselineMode === 'upToLevel') {
                    maxRolls = countUpTo(windowMax) + preRolls
                  } else {
                    maxRolls = Math.max(0, countUpTo(windowMax) - countUpTo(windowMin))
                    if (windowMin <= 0) {
                      maxRolls += preRolls
                    }
                  }
                  const hardCap = rarityIncludesMythical(rarityCode) ? 5 : 4
                  maxRolls = Math.max(0, Math.min(maxRolls, hardCap))
                  return {
                    baseValue,
                    maxRolls,
                  }
                })
                if (metrics.length === 0) return null
                const computeThreshold = (base: number, rolls: number): number => (
                  isRollCount ? rolls : Math.max(0, base + (rolls * base))
                )
                const targetValueForRoll = (base: number, rolls: number): number => {
                  if (rolls <= 0) {
                    if (targetDraftBase != null) return targetDraftBase
                    return computeThreshold(base, 0)
                  }
                  const idx = Math.min(SUBSTAT_TARGET_MAX_ROLLS - 1, Math.max(0, rolls - 1))
                  const override = targetDraftRolls[idx]
                  if (override != null) return override
                  return computeThreshold(base, rolls)
                }
                const formatValue = (value: number) => numberFormatter.format(Math.round(value))
                const formatRange = (minVal: number, maxVal: number) => {
                  const low = Math.min(minVal, maxVal)
                  const high = Math.max(minVal, maxVal)
                  if (low === high) return formatValue(low)
                  return `${formatValue(low)}…${formatValue(high)}`
                }
                const mixedLabel = t('builderMultiMixedValue')
                const minMixedFlag = Boolean(activeMenuInfo?.minMixed && effectiveMinDraft == null)
                const maxMixedFlag = Boolean(activeMenuInfo?.maxMixed && effectiveMaxDraft == null)
                const minGroupValueLocal = typeof effectiveMinDraft === 'number'
                  ? clampRollMin(effectiveMinDraft)
                  : null
                const maxGroupValueLocal = typeof effectiveMaxDraft === 'number'
                  ? clampRollMax(effectiveMaxDraft)
                  : null
                let minText: string | null = null
                if (minMixedFlag) {
                  minText = mixedLabel
                } else if (typeof minGroupValueLocal === 'number') {
                  const values = metrics.map((metric) => targetValueForRoll(metric.baseValue, minGroupValueLocal))
                  const low = Math.min(...values)
                  const high = Math.max(...values)
                  minText = formatRange(low, high)
                } else if (activeMenuInfo.wildcard) {
                  const lows = metrics.map((metric) => targetValueForRoll(metric.baseValue, 0))
                  const highs = metrics.map((metric) => targetValueForRoll(metric.baseValue, metric.maxRolls))
                  const low = Math.min(...lows)
                  const high = Math.max(...highs)
                  minText = formatRange(low, high)
                }
                let maxText: string | null = null
                if (maxMixedFlag) {
                  maxText = mixedLabel
                } else if (typeof maxGroupValueLocal === 'number') {
                  const values = metrics.map((metric) => targetValueForRoll(metric.baseValue, maxGroupValueLocal))
                  const low = Math.min(...values)
                  const high = Math.max(...values)
                  maxText = formatRange(low, high)
                }
                const lockMixedFlag = activeMenuInfo?.lockState === 'partial'
                const lockGroupValueLocal: 'locked' | 'unlocked' | null = activeMenuInfo.lockState === 'all'
                  ? 'locked'
                  : (activeMenuInfo.lockState === 'none' ? 'unlocked' : null)
                return {
                  label,
                  minText,
                  maxText,
                  minMixed: minMixedFlag,
                  maxMixed: maxMixedFlag,
                  minGroupValue: minGroupValueLocal,
                  maxGroupValue: maxGroupValueLocal,
                  lockMixed: lockMixedFlag,
                  lockGroupValue: lockGroupValueLocal,
                }
              }
              const substatMenuValueSummary = computeMenuValueSummary()
              const minMixed = substatMenuValueSummary?.minMixed ?? Boolean(activeMenuInfo?.minMixed && effectiveMinDraft == null)
              const maxMixed = substatMenuValueSummary?.maxMixed ?? Boolean(activeMenuInfo?.maxMixed && effectiveMaxDraft == null)
              const lockMixed = substatMenuValueSummary?.lockMixed ?? (activeMenuInfo?.lockState === 'partial')
              const lockGroupValue: 'locked' | 'unlocked' | null = substatMenuValueSummary?.lockGroupValue ?? (!activeMenuInfo
                ? null
                : (activeMenuInfo.lockState === 'all'
                  ? 'locked'
                  : (activeMenuInfo.lockState === 'none' ? 'unlocked' : null)))
              const minGroupValue: number | null = substatMenuValueSummary?.minGroupValue ?? (typeof effectiveMinDraft === 'number'
                ? clampRollMin(effectiveMinDraft)
                : null)
              const maxGroupValue: number | null = substatMenuValueSummary?.maxGroupValue ?? (typeof effectiveMaxDraft === 'number'
                ? clampRollMax(effectiveMaxDraft)
                : null)
              const targetInputsDisabled = !activeMenuInfo
              const lockTooltipText = t('builderSubstatMenuLockTooltip')
              const minRollTooltipText = t('builderSubstatMenuMinRollsTooltip')
              const maxRollTooltipText = t('builderSubstatMenuMaxRollsTooltip')
              const rollTargetsTooltipText = targetContext
                ? t('builderSubstatMenuRollTargetsHint', { value: numberFormatter.format(Math.round(targetContext.baseValue)) })
                : t('builderSubstatMenuRollTargetsHintFallback')
              const stepTargetBase = (delta: number) => {
                if (!activeMenuInfo) return
                const seedValue = targetDraftBase ?? resolveTargetFallbackValue(0)
                const nextValue = clampTargetValue((seedValue ?? 0) + delta)
                applyTargetSelection(nextValue, targetDraftRolls)
              }
              const stepTargetRoll = (index: number, delta: number) => {
                if (!activeMenuInfo) return
                const nextRolls = cloneTargetRolls(targetDraftRolls)
                const current = nextRolls[index]
                const seedValue = current ?? resolveTargetFallbackValue(index + 1)
                nextRolls[index] = clampTargetValue((seedValue ?? 0) + delta)
                applyTargetSelection(targetDraftBase, nextRolls)
              }
              const renderRequirementChip = (mode: 'min' | 'max') => {
                if (!activeMenuInfo) {
                  return <Box sx={menuValuePillPlaceholderSx} />
                }
                const text = substatMenuValueSummary
                  ? (mode === 'min' ? substatMenuValueSummary.minText : substatMenuValueSummary.maxText)
                  : null
                const mixed = substatMenuValueSummary
                  ? (mode === 'min' ? substatMenuValueSummary.minMixed : substatMenuValueSummary.maxMixed)
                  : false
                const hasValue = Boolean(text && text.trim().length > 0)
                const displayText = mixed
                  ? ''
                  : (hasValue ? text! : '')
                const statId = variantToSub(activeMenuInfo.variant).id
                const shouldColorize = colorStatTexts && substatSupportsColor(statId)
                const label = substatMenuValueSummary?.label ?? t(statVariantI18nKey(activeMenuInfo.variant))
                const { labelColor, chipBg, chipBorder } = resolveSubstatChipPalette(theme, {
                  variant: activeMenuInfo.variant,
                  substatColors,
                  colorize: shouldColorize,
                  fallbackLabelColor: statHighlightColor ?? theme.palette.text.primary,
                })
                const glyph = mixed ? '' : (mode === 'min' ? '≥' : '≤')
                const glyphColor = mode === 'min' ? theme.palette.success.main : theme.palette.error.main
                const rowWidth = mode === 'min' ? substatMenuChipWidths.min : substatMenuChipWidths.max
                const enforcedWidth = (() => {
                  if (chipWidth === 0) return undefined
                  if (rowWidth < chipWidth) return `${chipWidth}px`
                  return undefined
                })()
                const chipRef = (node: HTMLDivElement | null) => {
                  if (!node) return
                  const width = node.offsetWidth
                  if (width <= 0 || enforcedWidth) return
                  setSubstatMenuChipWidths((prev) => {
                    if (mode === 'min') {
                      if (prev.min === width) return prev
                      return { ...prev, min: width }
                    }
                    if (prev.max === width) return prev
                    return { ...prev, max: width }
                  })
                }
                const chipStyles: SystemStyleObject<Theme> = {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: theme.spacing(0.75),
                  maxWidth: '100%',
                  borderRadius: `${SUBSTAT_CHIP_BORDER_RADIUS_PX}px`,
                  padding: theme.spacing(0.5, 1),
                  backgroundColor: chipBg,
                  border: `1px solid ${chipBorder}`,
                  minHeight: `${SUBSTAT_MENU_VALUE_PILL_MIN_HEIGHT_PX}px`,
                  ...(enforcedWidth ? { width: enforcedWidth } : {}),
                }
                if (mixed) {
                  Object.assign(chipStyles, {
                    border: `1px dashed ${mixedBorderColor}`,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  })
                }
                const effectiveLabelColor = mixed ? mixedTextColor : labelColor
                const valueColor = mixed ? mixedTextColor : glyphColor
                return (
                  <Box
                    sx={chipStyles}
                    ref={chipRef}
                  >
                    <Box
                      component="span"
                      sx={{
                        color: effectiveLabelColor,
                        fontWeight: theme.typography.fontWeightMedium ?? 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'baseline',
                        gap: theme.spacing(0.25),
                        color: valueColor,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                     }}
                    >
                      {glyph ? (<Box component="span">{glyph}</Box>) : null}
                      {(mixed || hasValue) ? (
                        <Box component="span">{displayText}</Box>
                      ) : null}
                    </Box>
                  </Box>
                )
              }
              const commitSingleBounds = (variantId: number, nextMin: number | null, nextMax: number | null) => {
                applySingleSubstatBounds(variantId, (current) => {
                  if (nextMin == null && nextMax == null) return null
                  const draft = { ...(current ?? {}) }
                  if (nextMin == null) delete draft.min
                  else draft.min = nextMin
                  if (nextMax == null) delete draft.max
                  else draft.max = nextMax
                  delete draft.any
                  return draft
                })
              }
              const commitMultiBounds = (variantId: number, nextMin: number | null, nextMax: number | null) => {
                if (!multiEditActive || !multiEdit) return
                if (nextMin == null && nextMax == null) {
                  commitRollPatch(variantId, { any: true, min: null, max: null })
                } else {
                  commitRollPatch(variantId, {
                    any: false,
                    ...(nextMin === null ? { min: null } : { min: nextMin }),
                    ...(nextMax === null ? { max: null } : { max: nextMax }),
                  })
                }
              }
              const ensureSubstatPresenceForBounds = (variantId: number) => {
                if (multiEditActive && multiEdit) {
                  ensureMultiSubstatPresence(variantId)
                  return
                }
                if (!isSelected(variantId)) {
                  cycleSubstat(variantId)
                }
              }
              const applyMenuSelection = (
                nextMin: number | null,
                nextMax: number | null,
                options?: { requirePresence?: boolean; ensurePresenceWhenMixed?: boolean },
              ) => {
                if (!activeMenuInfo) return
                const requirePresence = options?.requirePresence ?? false
                const ensurePresenceWhenMixed = options?.ensurePresenceWhenMixed ?? false
                const shouldEnsurePresence = (() => {
                  if (!multiEditActive || !multiEdit) {
                    return requirePresence && (nextMin != null || nextMax != null)
                  }
                  if (requirePresence && (nextMin != null || nextMax != null)) return true
                  if (ensurePresenceWhenMixed && activeMenuInfo.presence !== 'all') return true
                  return false
                })()
    if (shouldEnsurePresence) ensureSubstatPresenceForBounds(activeMenuInfo.variant)
                setSubstatMenuDraft((prev) => ({
                  min: nextMin,
                  max: nextMax,
                  targetBase: prev?.targetBase ?? null,
                  targetRolls: cloneTargetRolls(prev?.targetRolls),
                }))
                if (multiEditActive && multiEdit) {
                  commitMultiBounds(activeMenuInfo.variant, nextMin, nextMax)
                } else {
                  commitSingleBounds(activeMenuInfo.variant, nextMin, nextMax)
                }
              }
              const applyTargetSelection = (nextBase: number | null, nextRolls: Array<number | null>) => {
                if (!activeMenuInfo) return
                const draftRolls = cloneTargetRolls(nextRolls)
                setSubstatMenuDraft((prev) => ({
                  min: prev?.min ?? activeMenuInfo.minValue ?? null,
                  max: prev?.max ?? activeMenuInfo.maxValue ?? null,
                  targetBase: nextBase,
                  targetRolls: draftRolls,
                }))
                const entry = buildTargetEntryFromDraft(nextBase, draftRolls)
                if (multiEditActive && multiEdit) {
                  commitTargetPatch(activeMenuInfo.variant, entry)
                  return
                }
                applySingleSubstatTargets(activeMenuInfo.variant, () => {
                  if (!entry) return null
                  return {
                    ...(typeof entry.base === 'number' ? { base: entry.base } : {}),
                    ...(Array.isArray(entry.increments) ? { increments: [...entry.increments] } : {}),
                  }
                })
              }
              const handleTargetBaseChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                if (!activeMenuInfo) return
                const nextValue = clampTargetValue(parseNumericInput(event.target.value))
                applyTargetSelection(nextValue, targetDraftRolls)
              }
              const handleTargetRollChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                if (!activeMenuInfo) return
                const nextValue = clampTargetValue(parseNumericInput(event.target.value))
                const nextRolls = cloneTargetRolls(targetDraftRolls)
                nextRolls[index] = nextValue
                applyTargetSelection(targetDraftBase, nextRolls)
              }
              const handleTargetReset = () => {
                if (!activeMenuInfo) return
                applyTargetSelection(null, createEmptyTargetRolls())
              }
              const applyLockSelection = (value: 'locked' | 'unlocked') => {
                if (!activeMenuInfo) return
                if (multiEditActive && multiEdit) {
                  multiSetSubstatLockState(activeMenuInfo.variant, value)
                  return
                }
                const currentlyLocked = isFixed(activeMenuInfo.variant)
                if (value === 'locked' && !currentlyLocked) {
                  toggleSubstatLock(activeMenuInfo.variant)
                } else if (value === 'unlocked' && currentlyLocked) {
                  toggleSubstatLock(activeMenuInfo.variant)
                }
              }
              const handleLockGroupChange = (_event: React.SyntheticEvent<Element, Event>, value: 'locked' | 'unlocked' | null) => {
                if (value === null) return
                applyLockSelection(value)
              }
              const MIN_SEQUENCE = ['any', '0', '1', '2', '3', '4', '5'] as const
              const MAX_SEQUENCE = ['any', '0', '1', '2', '3', '4'] as const
              type MinOption = (typeof MIN_SEQUENCE)[number]
              type MaxOption = (typeof MAX_SEQUENCE)[number]
              const MIN_CYCLE_SEQUENCE: MinOption[] = ['any', '0', '1', '2', '3', '4', '5']
              const MIN_LABEL_SEQUENCE: MinOption[] = ['any', '0', '1', '2', '3', '4', '5']
              const MAX_LABEL_SEQUENCE: MaxOption[] = ['0', '1', '2', '3', '4']
              const normalizeMinOption = (raw: string | null): MinOption => {
                if (!raw) return 'any'
                return (MIN_SEQUENCE.includes(raw as MinOption) ? raw : 'any') as MinOption
              }
              const normalizeMaxOption = (raw: string | null): MaxOption => {
                if (!raw) return 'any'
                return (MAX_SEQUENCE.includes(raw as MaxOption) ? raw : 'any') as MaxOption
              }
              const minToggleValue: MinOption | undefined | null = minMixed
                ? null
                : (minGroupValue == null
                  ? (maxGroupValue == null ? 'any' : undefined)
                  : (String(minGroupValue) as MinOption))
              const maxToggleValue: MaxOption | undefined | null = maxMixed
                ? null
                : (maxGroupValue == null
                  ? (minGroupValue == null ? 'any' : undefined)
                  : (String(maxGroupValue) as MaxOption))
              const applyMinSelection = (key: MinOption) => {
                if (key === 'any') {
                  applyMenuSelection(null, null, { ensurePresenceWhenMixed: true })
                  return
                }
                applyMenuSelection(clampRollMin(Number(key)), null, { requirePresence: true })
              }
              const applyMaxSelection = (key: MaxOption) => {
                if (key === 'any') {
                  applyMenuSelection(null, null, { ensurePresenceWhenMixed: true })
                  return
                }
                applyMenuSelection(null, clampRollMax(Number(key)), { requirePresence: true })
              }
              const handleMinGroupChange = (_event: React.SyntheticEvent<Element, Event>, rawValue: string | null) => {
                applyMinSelection(normalizeMinOption(rawValue))
              }
              const handleMaxGroupChange = (_event: React.SyntheticEvent<Element, Event>, rawValue: string | null) => {
                applyMaxSelection(normalizeMaxOption(rawValue))
              }
              const resolveMinCycleKey = (): MinOption => {
                if (minMixed) return 'any'
                const key = minToggleValue
                if (key && MIN_SEQUENCE.includes(key as MinOption)) {
                  return key as MinOption
                }
                return 'any'
              }
              const resolveMaxCycleKey = (): MaxOption => {
                if (maxMixed) return 'any'
                const key = maxToggleValue
                if (key && MAX_SEQUENCE.includes(key as MaxOption)) {
                  return key as MaxOption
                }
                return 'any'
              }
              const cycleMinRequirement = () => {
                if (minMixed) {
                  applyMinSelection('any')
                  return
                }
                if (minGroupValue == null && maxGroupValue != null) {
                  applyMinSelection('any')
                  return
                }
                const current = resolveMinCycleKey()
                const startIndex = MIN_CYCLE_SEQUENCE.indexOf(current)
                const next = MIN_CYCLE_SEQUENCE[(startIndex + 1) % MIN_CYCLE_SEQUENCE.length] ?? 'any'
                applyMinSelection(next)
              }
              const cycleMaxLimit = () => {
                if (maxMixed) {
                  applyMaxSelection('0')
                  return
                }
                if (maxGroupValue == null) {
                  if (minGroupValue != null) {
                    applyMaxSelection('0')
                    return
                  }
                }
                const current = resolveMaxCycleKey()
                if (current === 'any') {
                  applyMaxSelection('0')
                  return
                }
                const idx = MAX_LABEL_SEQUENCE.indexOf(current)
                if (idx === -1) {
                  applyMaxSelection('0')
                  return
                }
                const nextIdx = idx + 1
                if (nextIdx >= MAX_LABEL_SEQUENCE.length) {
                  applyMaxSelection('any')
                  return
                }
                applyMaxSelection(MAX_LABEL_SEQUENCE[nextIdx] as MaxOption)
              }
              const cycleLockState = () => {
                const next = lockGroupValue === 'locked' ? 'unlocked' : 'locked'
                applyLockSelection(next)
              }
              const menuRowSx: SxProps<Theme> = () => ({
                display: 'grid',
                gridTemplateColumns: `minmax(0, ${MENU_LABEL_WIDTH_PX}px) ${SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX}px ${SUBSTAT_MENU_VALUE_COLUMN_WIDTH_PX}px`,
                alignItems: 'center',
                columnGap: `${SUBSTAT_MENU_COLUMN_GAP_PX}px`,
                rowGap: theme.spacing(0.5),
                px: 2,
                py: 0.75,
              })
              const menuValueColumnSx: SxProps<Theme> = {
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                width: `${SUBSTAT_MENU_VALUE_COLUMN_WIDTH_PX}px`,
              }
              const menuValuePillPlaceholderSx: SxProps<Theme> = {
                width: '100%',
                minHeight: `${SUBSTAT_MENU_VALUE_PILL_MIN_HEIGHT_PX}px`,
              }
const menuLabelSx = (theme: Theme): SystemStyleObject<Theme> => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  color: theme.palette.text.secondary,
  fontSize: theme.typography.body2.fontSize,
  flexWrap: 'wrap',
  wordBreak: 'break-word',
  whiteSpace: 'normal',
})
const renderMenuHeading = (label: string, tooltipText: string | null) => (
  <MarkdownTooltip
    render={(
      <BuilderTooltipContent
        text={(tooltipText && tooltipText.trim().length > 0) ? tooltipText : label}
      />
    )}
  >
    <Typography
      variant="body2"
      sx={(themeInner) => ({
        ...menuLabelSx(themeInner),
        lineHeight: `${SUBSTAT_MENU_EXPECTATION_INPUT_HEIGHT_PX}px`,
      })}
    >
      {label}
    </Typography>
  </MarkdownTooltip>
)
              const lockGroupSx: SxProps<Theme> = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${LOCK_MENU_GAP_PX}px`,
                  width: SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX,
                  marginLeft: `${LOCK_MENU_OFFSET_PX}px`,
                  justifyContent: 'flex-start',
                  '& .MuiToggleButton-root': {
                    minWidth: LOCK_MENU_BUTTON_WIDTH_PX,
                    width: LOCK_MENU_BUTTON_WIDTH_PX,
                    height: MENU_CONTROL_HEIGHT_PX,
                    px: 0,
                    borderRadius: `${LOCK_MENU_BORDER_RADIUS_PX}px`,
                  },
                  '& .MuiToggleButtonGroup-grouped': {
                    margin: '0 !important',
                    borderRadius: `${LOCK_MENU_BORDER_RADIUS_PX}px !important`,
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                  },
                  '& .MuiToggleButton-root[data-mixed="true"]': {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  },
                }
              const createRollGroupSx = (mode: 'min' | 'max'): SxProps<Theme> => (themeInner) => {
                const highlight = mode === 'min' ? themeInner.palette.success.main : themeInner.palette.error.main
                const selectedText = themeInner.palette.common.white
                const baseBorder = themeInner.palette.text.secondary
                const hoverGlow = alpha(
                  themeInner.palette.text.primary,
                  themeInner.palette.mode === 'dark' ? 0.22 : 0.14,
                )
                const base: SystemStyleObject<Theme> = {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${SUBSTAT_MENU_ROLL_COLUMNS}, ${SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX}px)`,
                  columnGap: `${SUBSTAT_MENU_ROLL_GAP_PX}px`,
                  rowGap: `${SUBSTAT_MENU_ROLL_GAP_PX}px`,
                  width: SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX,
                  justifyContent: 'flex-start',
                  '& .MuiToggleButtonGroup-grouped': {
                    margin: '0 !important',
                    borderRadius: '50% !important',
                    borderLeft: '1px solid transparent',
                  },
                  '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
                    marginLeft: '0 !important',
                  },
                  '& .MuiToggleButton-root': {
                    minWidth: SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX,
                    width: SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX,
                    height: SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX,
                    px: 0,
                    borderRadius: '50%',
                    border: `1px solid ${baseBorder}`,
                    color: themeInner.palette.text.secondary,
                    backgroundColor: 'transparent',
                    clipPath: 'circle(50% at 50% 50%)',
                    transition: 'background-color .15s, border-color .15s, color .15s, box-shadow .15s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'none',
                  },
                  '& .MuiToggleButton-root:hover': {
                    boxShadow: `0 0 0 1px ${hoverGlow}`,
                    backgroundColor: themeInner.palette.action.hover,
                    borderColor: baseBorder,
                  },
                  '& .MuiToggleButton-root .menu-roll-label': {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    fontSize: `${SUBSTAT_MENU_ROLL_FONT_SIZE_PX}px`,
                    lineHeight: 1,
                    fontWeight: themeInner.typography.fontWeightMedium ?? 600,
                  },
                  '& .MuiToggleButton-root.Mui-selected': {
                    color: selectedText,
                    backgroundColor: highlight,
                    borderColor: highlight,
                    boxShadow: `0 0 0 1px ${highlight}`,
                  },
                  '& .MuiToggleButton-root.Mui-selected:hover': {
                    backgroundColor: highlight,
                    borderColor: highlight,
                    boxShadow: `0 0 0 1px ${highlight}`,
                  },
                  '& .MuiToggleButton-root[data-mixed="true"]': {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  },
                }
                return base
              }
              const toggleGroupContent = (
                <>
                  {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={() => {}}
                    sx={substatToggleGroupSx}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => {
                      const dataTourId = variant === StatVariant.SPD
                        ? 'builder.substat.spd'
                        : variant === StatVariant.CR
                          ? 'builder.substat.cr'
                          : variant === StatVariant.CDMG
                            ? 'builder.substat.cdmg'
                            : undefined
                      return renderSubstatToggle(variant, dataTourId ? { dataTourId } : undefined)
                    })}
                  </ToggleButtonGroup>
                  {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={() => {}}
                    sx={substatToggleGroupSx}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => renderSubstatToggle(variant))}
                  </ToggleButtonGroup>
                </>
              )
              return (
                <>
                  {toggleGroupContent}
                  <ContextMenuHintOverlay text={t('contextMenuHint')} position={substatHintActive ? substatHintPos : null} />
                  <Menu
                    open={menuOpen}
                    onClose={handleSubstatMenuClose}
                    anchorReference="anchorPosition"
                    {...(menuOpen ? { anchorPosition: { top: menuAnchor.y, left: menuAnchor.x } } : {})}
                    keepMounted
                    slotProps={{
                      paper: buildContextMenuPaperSlotProps({
                        component: ContextMenuPaper,
                        contextMenuGuard: substatMenuGuard,
                        onRequestClose: handleSubstatMenuClose,
                        closeLabel: t('close'),
                        ref: substatMenuPaperRef,
                        sx: { minWidth: SUBSTAT_MENU_WIDTH_PX },
                      }),
                    }}
                    MenuListProps={{ dense: true, disablePadding: true, sx: { py: 0 } }}
                  >
                    {activeMenuInfo ? (
                      <>
                        <MenuItem
                          disableRipple
                          disableTouchRipple
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            cycleLockState()
                          }}
                          sx={menuRowSx}
                        >
                          {renderMenuHeading(t('builderSubstatMenuLock'), lockTooltipText)}
                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={lockGroupValue}
                          onChange={handleLockGroupChange}
                          onClick={(event) => { event.stopPropagation() }}
                          sx={lockGroupSx}
                        >
                          <MarkdownTooltip
                            render={<BuilderTooltipContent text={t('builderSubstatLockTooltipUnlock')} />}
                          >
                            <ToggleButton
                              value="unlocked"
                              aria-label={t('builderSubstatMenuUnlock')}
                              data-mixed={lockMixed ? 'true' : undefined}
                            >
                              <LockOpenOutlinedIcon fontSize="small" />
                            </ToggleButton>
                          </MarkdownTooltip>
                          <MarkdownTooltip
                            render={<BuilderTooltipContent text={t('builderSubstatLockTooltipLock')} />}
                          >
                            <ToggleButton
                              value="locked"
                              aria-label={t('builderSubstatMenuLock')}
                              data-mixed={lockMixed ? 'true' : undefined}
                            >
                              <LockIcon fontSize="small" />
                            </ToggleButton>
                          </MarkdownTooltip>
                        </ToggleButtonGroup>
                        <Box sx={menuValueColumnSx}>
                          <Box sx={menuValuePillPlaceholderSx} />
                        </Box>
                      </MenuItem>
                        <MenuItem
                          disableRipple
                          disableTouchRipple
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            cycleMinRequirement()
                          }}
                          sx={menuRowSx}
                        >
                          {renderMenuHeading(t('builderSubstatMenuMinRolls'), minRollTooltipText)}
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={minToggleValue ?? undefined}
                            onChange={handleMinGroupChange}
                            onClick={(event) => { event.stopPropagation() }}
                            sx={createRollGroupSx('min')}
                          >
                            <ToggleButton
                              value="any"
                              aria-label={t('builderSubstatMenuAny')}
                              data-mixed={minMixed ? 'true' : undefined}
                            >
                              <Box component="span" className="menu-roll-label">{ROLL_ANY_STAR}</Box>
                            </ToggleButton>
                            {MIN_LABEL_SEQUENCE.slice(1).map((valueOption) => (
                              <ToggleButton
                                key={valueOption}
                                value={valueOption}
                                aria-label={valueOption}
                                data-mixed={minMixed ? 'true' : undefined}
                              >
                                <Box component="span" className="menu-roll-label">{valueOption}</Box>
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        <Box sx={menuValueColumnSx}>
                          {renderRequirementChip('min')}
                        </Box>
                      </MenuItem>
                        <MenuItem
                          disableRipple
                          disableTouchRipple
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            cycleMaxLimit()
                          }}
                          sx={menuRowSx}
                        >
                          {renderMenuHeading(t('builderSubstatMenuMaxRolls'), maxRollTooltipText)}
                          <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={maxToggleValue ?? undefined}
                            onChange={handleMaxGroupChange}
                            onClick={(event) => { event.stopPropagation() }}
                            sx={createRollGroupSx('max')}
                          >
                            {['0', '1', '2', '3', '4'].map((valueOption) => (
                              <ToggleButton
                                key={valueOption}
                                value={valueOption}
                                aria-label={valueOption}
                                data-mixed={maxMixed ? 'true' : undefined}
                              >
                                <Box component="span" className="menu-roll-label">{valueOption}</Box>
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        <Box sx={menuValueColumnSx}>
                          {renderRequirementChip('max')}
                        </Box>
                      </MenuItem>
                      {activeMenuInfo ? (
                        <MenuItem
                          disableRipple
                          disableTouchRipple
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          sx={(theme) => ({
                            ...menuRowSx(theme),
                            gridTemplateColumns: `minmax(0, ${MENU_LABEL_WIDTH_PX}px) minmax(${SUBSTAT_MENU_EXPECTATION_SECTION_MIN_WIDTH_PX}px, 1fr)`,
                            alignItems: 'flex-end',
                            rowGap: theme.spacing(1),
                          })}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'flex-end', height: `${SUBSTAT_MENU_EXPECTATION_INPUT_HEIGHT_PX}px`, mb: 0.5 }}>
                            {renderMenuHeading(t('builderSubstatMenuRollTargets'), rollTargetsTooltipText)}
	                          </Box>
	                          <Box
	                            ref={substatMenuRollTargetsRef}
	                            sx={(theme) => ({
	                              gridColumn: '2 / 3',
	                              display: 'grid',
	                              gridTemplateColumns: `repeat(6, minmax(${SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX}px, auto)) auto`,
	                              alignItems: 'flex-end',
                              justifyContent: 'flex-start',
                              columnGap: theme.spacing(1),
                              width: '100%',
                              minWidth: `${SUBSTAT_MENU_EXPECTATION_SECTION_MIN_WIDTH_PX}px`,
                              overflow: 'visible',
                            })}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                {t('builderSubstatMenuRollTargetsBase')}
                              </Typography>
                              <TextField
                                size="small"
                                type="number"
                                value={targetDraftBase ?? ''}
                                onChange={handleTargetBaseChange}
	                                inputProps={{
	                                  inputMode: 'numeric',
	                                  pattern: '[0-9]*',
	                                  min: 0,
	                                  // Focus-cycling hook: keep Tab within the Roll Targets inputs.
	                                  [SUBSTAT_MENU_ROLL_TARGET_INPUT_ATTR]: 'true',
	                                  'aria-label': t('builderSubstatMenuRollTargetsBase'),
	                                  placeholder: formatTargetFallback(0),
	                                  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
	                                    // Match browser semantics: ignore modified Tab presses (e.g. Ctrl+Tab).
	                                    if (event.key !== 'Tab') return
	                                    if (event.altKey || event.ctrlKey || event.metaKey) return
	                                    const moved = focusCycleWithin({
	                                      container: substatMenuRollTargetsRef.current,
	                                      selector: SUBSTAT_MENU_ROLL_TARGET_INPUT_SELECTOR,
	                                      current: event.currentTarget,
	                                      delta: event.shiftKey ? -1 : 1,
	                                      wrap: true,
	                                    })
	                                    if (!moved) return
	                                    event.preventDefault()
	                                    // MUI MenuList listens for Tab to close the menu; stop bubbling so it stays open.
	                                    event.stopPropagation()
	                                  },
	                                }}
                                onClick={(event) => { event.stopPropagation() }}
                                disabled={targetInputsDisabled}
                                sx={(theme) => ({
                                  width: `${SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX}px`,
                                  '& input': {
                                    textAlign: 'right',
                                    paddingRight: theme.spacing(1),
                                    paddingLeft: theme.spacing(0.25),
                                  },
                                  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                    WebkitAppearance: 'none',
                                    margin: 0,
                                  },
                                  '& input[type=number]': {
                                    MozAppearance: 'textfield',
                                  },
                                })}
                                InputProps={{
                                  endAdornment: (
                                    <NumberSpinnerAdornment
                                      ariaLabel={t('builderSubstatMenuRollTargetsBase')}
                                      disabled={targetInputsDisabled}
                                      onStep={stepTargetBase}
                                    />
                                  ),
                                }}
                              />
                            </Box>
                            {[1, 2, 3, 4, 5].map((rollIndex) => {
                              const label = t('builderSubstatMenuRollTargetsPlus', { roll: rollIndex })
                              const rollValue = targetDraftRolls[rollIndex - 1] ?? null
                              const disabled = targetInputsDisabled
                              const comparableValue = resolveComparableTargetValue(rollIndex)
                              const previousComparableValue = resolveComparableTargetValue(rollIndex - 1)
                              const showWarning = previousComparableValue != null
                                && comparableValue != null
                                && comparableValue < previousComparableValue
                              const warningTooltip = showWarning
                                ? t('builderSubstatMenuRollTargetsWarning', {
                                  current: numberFormatter.format(Math.round(comparableValue)),
                                  previous: numberFormatter.format(Math.round(previousComparableValue)),
                                })
                                : null
                              return (
                                <Box key={`target-roll-${rollIndex}`} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      {label}
                                    </Typography>
                                    {showWarning && warningTooltip ? (
                                      <MarkdownTooltip markdown={warningTooltip}>
                                        <Box
                                          component="span"
                                          role="img"
                                          aria-label={warningTooltip}
                                          sx={targetWarningBadgeSx}
                                        >
                                          !
                                        </Box>
                                      </MarkdownTooltip>
                                    ) : null}
                                  </Box>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={rollValue ?? ''}
                                    onChange={handleTargetRollChange(rollIndex - 1)}
	                                  inputProps={{
	                                    inputMode: 'numeric',
	                                    pattern: '[0-9]*',
	                                    min: 0,
	                                    // Focus-cycling hook: keep Tab within the Roll Targets inputs.
	                                    [SUBSTAT_MENU_ROLL_TARGET_INPUT_ATTR]: 'true',
	                                    'aria-label': label,
	                                    placeholder: formatTargetFallback(rollIndex),
	                                    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
	                                      // Match browser semantics: ignore modified Tab presses (e.g. Ctrl+Tab).
	                                      if (event.key !== 'Tab') return
	                                      if (event.altKey || event.ctrlKey || event.metaKey) return
	                                      const moved = focusCycleWithin({
	                                        container: substatMenuRollTargetsRef.current,
	                                        selector: SUBSTAT_MENU_ROLL_TARGET_INPUT_SELECTOR,
	                                        current: event.currentTarget,
	                                        delta: event.shiftKey ? -1 : 1,
	                                        wrap: true,
	                                      })
	                                      if (!moved) return
	                                      event.preventDefault()
	                                      // MUI MenuList listens for Tab to close the menu; stop bubbling so it stays open.
	                                      event.stopPropagation()
	                                    },
	                                  }}
                                    onClick={(event) => { event.stopPropagation() }}
                                    disabled={disabled}
                                    sx={(themeInner) => ({
                                      width: `${SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX}px`,
                                      '& input': {
                                        textAlign: 'right',
                                        paddingRight: themeInner.spacing(1),
                                        paddingLeft: themeInner.spacing(0.25),
                                      },
                                      '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                        WebkitAppearance: 'none',
                                        margin: 0,
                                      },
                                      '& input[type=number]': {
                                        MozAppearance: 'textfield',
                                      },
                                    })}
                                    InputProps={{
                                      endAdornment: (
                                        <NumberSpinnerAdornment
                                          ariaLabel={label}
                                          disabled={disabled}
                                          onStep={(delta) => stepTargetRoll(rollIndex - 1, delta)}
                                        />
                                      ),
                                      sx: { '& > *': { alignItems: 'center' } },
                                    }}
                                  />
                                </Box>
                              )
                            })}
                            <Box sx={{ display: 'flex', alignItems: 'center', pl: 0.5, height: `${SUBSTAT_MENU_EXPECTATION_INPUT_HEIGHT_PX}px` }}>
                              <ClearIconButton
                                aria-label={t('clear')}
                                tooltip={t('clear')}
                                disabled={targetInputsDisabled}
                                onClick={handleTargetReset}
                                sx={{
                                  width: `${CLEAR_ICON_BUTTON_SIZE_PX}px`,
                                  height: `${CLEAR_ICON_BUTTON_SIZE_PX}px`,
                                  alignSelf: 'center',
                                  transform: 'translateY(-4px)', // optical tweak: match text-field baseline
                                }}
                              />
                            </Box>
                          </Box>
                        </MenuItem>
                      ) : null}
                      </>
                    ) : null}
                  </Menu>
                </>
              )
            })()}
          </Box>
        </FormControl>

        {/* Slots grid 3x3 with icons */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })} data-tour-id="builder.slots">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Slot label clamps to the toggle width so translations don't wrap under icons. */}
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <MarkdownTooltip
                ellipsisTitle={t('builderSlots')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderSlotsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderSlots')}</Box>
              </MarkdownTooltip>
            </FormLabel>
            {(() => {
              if (multiEditActive && multiSummary) {
                if (slotsPatch?.clear) {
                  return (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
                }
                const projectedHas = (() => {
                  if (slotsPatch?.replace) return slotsPatch.replace.length > 0
                  const slotIds = new Set<number>()
                  for (const key of multiSummary.slotCounts.keys()) slotIds.add(Number(key))
                  if (slotsPatch?.add) slotsPatch.add.forEach((v) => slotIds.add(Number(v)))
                  if (slotsPatch?.remove) slotsPatch.remove.forEach((v) => slotIds.add(Number(v)))
                  for (const slotId of slotIds) {
                    if (getSlotState(slotId) !== 'none') return true
                  }
                  return false
                })()
                return projectedHas
                  ? (
                    <ClearIconButton
                      size="small"
                      aria-label={t('builderClearSlots')}
                      tooltip={t('builderClearSlots')}
                      onClick={() => {
                        multiEdit?.updateField('artifactTypes', {
                          value: (multiSlotsField?.value as BuilderConfig['artifactTypes']) ?? (cfg.artifactTypes ?? []),
                          status: 'common',
                          patch: { clear: true },
                        })
                      }}
                    />
                  )
                  : (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
              }
              const hasSlots = Array.isArray(cfg.artifactTypes) && (cfg.artifactTypes?.length ?? 0) > 0
              return hasSlots
                ? (
                  <ClearIconButton
                    size="small"
                    aria-label={t('builderClearSlots')}
                    tooltip={t('builderClearSlots')}
                    onClick={() => update('artifactTypes', [])}
                  />
                )
                : (<Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />)
            })()}
          </Box>
          {/* Tighten the slot matrix spacing to 4px (0.5 spacing unit) so nine buttons remain compact. */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
            {artifactTypeIconList.map(({ id, name, Icon }) => {
              const slotState = multiEditActive ? getSlotState(id) : ((cfg.artifactTypes ?? []).includes(id) ? 'all' : 'none')
              const selected = slotState === 'all' || (!multiEditActive && (cfg.artifactTypes ?? []).includes(id))
              return (
                <ToggleButton
                  key={id}
                  value={`${id}`}
                  selected={selected}
                  onClick={(event) => {
                    if (multiEditActive && multiEdit) {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleSlot(id)
                      return
                    }
                    const set = new Set(cfg.artifactTypes ?? [])
                    if (set.has(id)) set.delete(id); else set.add(id)
                    update('artifactTypes', Array.from(set))
                  }}
                  sx={(theme) => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    minWidth: 0,
                    height: TOGGLE_BUTTON_HEIGHT_PX,
                    px: 1,
                    py: 0,
                    textTransform: 'none',
                    gap: slotIconGap,
                    borderRadius: 1,
                    ...(multiEditActive && slotState === 'partial'
                      ? {
                          borderStyle: 'dashed',
                          borderColor: mixedBorderColor,
                          backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                          color: mixedTextColor,
                        }
                      : {}),
                    '&:hover': {
                      backgroundColor: slotState === 'partial'
                        ? theme.palette.action.selected
                        : undefined,
                    },
                  })}
                  data-tour-id={name === 'Boots' ? 'builder.slot.boots' : undefined}
                >
                  {/* Icons share the same left edge via a fixed-width flex row; text stays centered within its own column. */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: slotContentWidth ?? 'auto',
                      maxWidth: '100%',
                      height: '100%',
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        width: slotIconSize,
                        minWidth: slotIconSize,
                        mr: slotIconGap,
                      }}
                    >
                      <Icon fontSize="small" />
                    </Box>
                    <Typography
                      variant="button"
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        minWidth: slotLabelFlexBasis,
                        flex: slotLabelFlexBasis ? `0 0 ${slotLabelFlexBasis}` : undefined,
                        fontSize: FONT_SIZE_BASE_PX,
                        fontFamily: theme.typography.button?.fontFamily ?? theme.typography.fontFamily,
                        fontWeight: theme.typography.button?.fontWeight ?? theme.typography.fontWeightMedium ?? 500,
                        letterSpacing: theme.typography.button?.letterSpacing,
                        lineHeight: theme.typography.button?.lineHeight ?? 1.2,
                      }}
                    >
                      {slotLabel(Number(id))}
                    </Typography>
                  </Box>
                </ToggleButton>
              )
            })}
          </Box>
        </FormControl>

        {/* Right column combined: Required substats + Sets in one grid cell */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          alignSelf: 'stretch',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
        })}>
        <FormControl sx={{ m: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              columnGap: 1,
              rowGap: 1,
            }}
          >
            {/* Min Required Rolls */}
            {/* Anchor Min Required Rolls to its English width so buttons never wrap in DE. */}
            <FormControl
              sx={{
                m: 0,
                width: `${BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX}px`,
                flex: `0 0 ${BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX}px`,
              }}
            >
              {(() => {
                const tooltipLines = [
                  t('builderMinRequiredRollsTipSummary'),
                  `• ${t('builderMinRequiredRollsTip1')}`,
                  `• ${t('builderMinRequiredRollsTip2')}`,
                  t('builderMultiMixedTooltipSuffix'),
                ]
                const resolvedLockedMin = (() => {
                  const source = multiEditActive && multiLockedMinRequiredRollsField
                    ? multiLockedMinRequiredRollsField
                    : null
                  if (source) {
                    if (source.status === 'common') {
                      const value = Number(source.value ?? 0)
                      if (Number.isFinite(value) && value > 0) return Math.max(0, Math.min(5, value))
                    }
                    return null
                  }
                  const value = Number(cfg.lockedMinRequiredRolls ?? 0)
                  if (Number.isFinite(value) && value > 0) return Math.max(0, Math.min(5, value))
                  return null
                })()
                if (resolvedLockedMin) {
                  tooltipLines.push(t('builderLockedMinRequiredRollsLabel', { count: resolvedLockedMin }))
                }
                const tooltipContent = (<BuilderTooltipContent text={tooltipLines.join('\n')} />)
                const lockIconEnabled = lockedSubstatsExist
                const autoState = getMinRequiredRollsTriState('auto')
                return (
                  <>
                    {/* Keep the German “Mindestwürfe” label from wrapping under the toggles. */}
                    <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]} data-tour-id="builder.min-rolls.label">
                      <MarkdownTooltip render={tooltipContent} ellipsisTitle={t('builderMinRequiredRolls')}>
                        <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderMinRequiredRolls')}</Box>
                      </MarkdownTooltip>
                    </FormLabel>
                    <Box
                      data-tour-id="builder.min-rolls"
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        '& .MuiToggleButton-root': {
                          height: TOGGLE_BUTTON_HEIGHT_PX,
                          minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                        },
                      }}
                    >
                      <ToggleButton
                        value="auto"
                        selected={autoState === 'on'}
                        onClick={handleAutoMinRequiredRolls}
                        sx={(theme) => ({
                          minWidth: BUILDER_AUTO_TOGGLE_WIDTH_PX,
                          width: BUILDER_AUTO_TOGGLE_WIDTH_PX,
                          ...(autoState === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                          ...(autoState === 'mixed' ? {
                            borderStyle: 'dashed',
                            borderColor: mixedBorderColor,
                            color: mixedTextColor,
                            backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                          } : {}),
                        })}
                      >
                        {t('headerMenuAuto')}
                      </ToggleButton>
                      {MIN_REQUIRED_ROLL_OPTIONS.map((n) => {
                        const manualState = getMinRequiredRollsTriState(n)
                        const lockedState = getLockedMinRequiredRollsTriState(n)
                        const manualActive = manualState === 'on'
                        const lockedActive = lockedState === 'on'
                        const lockedMixed = lockedState === 'mixed'
                        const isSelected = manualActive || lockedActive
                        const isMixed = (manualState === 'mixed') || lockedMixed
                        const lockable = n > 0
                        const lockTooltip = !lockable
                          ? ''
                          : lockedActive
                            ? t('builderMinRequiredRollsLockIconClear')
                            : lockIconEnabled
                              ? t('builderMinRequiredRollsLockIconSet', { count: n })
                              : t('builderMinRequiredRollsLockIconDisabled')
                        return (
                          <ToggleButton
                            key={n}
                            value={String(n)}
                            selected={isSelected}
                            onClick={() => handleManualMinRequiredRolls(n)}
                            sx={(theme) => ({
                              position: 'relative',
                              minWidth: 24,
                              padding: 0,
                              overflow: 'visible',
                              ...(manualActive || lockedActive
                                ? { fontWeight: theme.typography.fontWeightMedium ?? 500 }
                                : {}),
                              ...(isMixed ? {
                                borderStyle: 'dashed',
                                borderColor: mixedBorderColor,
                                color: mixedTextColor,
                                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                              } : {}),
                            })}
                          >
                            <Box component="span" sx={{ fontSize: FONT_SIZE_BASE_PX }}>
                              {n}
                            </Box>
                            {lockable ? (
                              <MarkdownTooltip
                                markdown={lockTooltip ?? ''}
                                disableHoverListener={!lockIconEnabled}
                              >
                                <Box
                                  component="span"
                                  role="button"
                                  aria-pressed={lockedMixed ? 'mixed' : lockedActive}
                                  aria-label={lockTooltip || undefined}
                                  aria-disabled={lockIconEnabled ? undefined : true}
                                  tabIndex={lockIconEnabled ? 0 : -1}
                                  className="builder-min-roll-lock-icon"
                                  data-tour-id={`builder.min-rolls.lock-icon.${n}`}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    if (!lockIconEnabled) return
                                    handleLockedMinRequiredRolls(n)
                                  }}
                                  onKeyDown={(event) => {
                                    if (!lockIconEnabled) return
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      event.stopPropagation()
                                      handleLockedMinRequiredRolls(n)
                                    }
                                  }}
                                  sx={(theme) => {
                                    const glow = alpha(
                                      theme.palette.text.primary,
                                      theme.palette.mode === 'dark' ? 0.22 : 0.14,
                                    )
                                    return {
                                      position: 'absolute',
                                      top: -13,
                                      left: -10,
                                      width: LOCK_TOGGLE_HIT_SIZE_PX,
                                      height: LOCK_TOGGLE_HIT_SIZE_PX,
                                      p: 0,
                                      pointerEvents: lockIconEnabled ? 'auto' : 'none',
                                      borderRadius: LOCK_TOGGLE_HIT_SIZE_PX / 2,
                                      opacity: lockedActive ? 1 : (lockedMixed ? 0.7 : 0),
                                      visibility: lockIconEnabled ? 'visible' : 'hidden',
                                      transition: 'background-color .15s, box-shadow .15s, opacity .15s, visibility .15s',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: 'transparent',
                                      color: lockedActive ? theme.palette.text.primary : (lockedMixed ? mixedTextColor : theme.palette.text.primary),
                                      cursor: lockIconEnabled ? 'pointer' : 'default',
                                      '--sub-lock-hover-opacity': lockedActive ? 1 : (lockedMixed ? 0.7 : 0),
                                      boxShadow: 'none',
                                      textShadow: 'none',
                                      '& svg': {
                                        fontSize: 14,
                                      },
                                      '&:hover, &:focus-visible': {
                                        opacity: lockIconEnabled ? 1 : 0,
                                        visibility: lockIconEnabled ? 'visible' : 'hidden',
                                        backgroundColor: glow,
                                        boxShadow: `0 0 0 1px ${glow}`,
                                      },
                                      '&:focus-visible': {
                                        outline: 'none',
                                      },
                                    }
                                  }}
                                >
                                  {(lockedActive || lockedMixed)
                                    ? <LockIcon fontSize="small" />
                                    : <LockOpenOutlinedIcon fontSize="small" />}
                                </Box>
                              </MarkdownTooltip>
                            ) : null}
                          </ToggleButton>
                        )
                      })}
                    </Box>
                  </>
                )
              })()}
            </FormControl>
            {/* Required substats */}
            {/* Required substats column mirrors the English 135px width for parity. */}
            <FormControl
              sx={{
                m: 0,
                width: `${BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX}px`,
                flex: `0 0 ${BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX}px`,
              }}
            >
              {(() => {
                type FlexChipState = 'on' | 'off' | 'disabled' | 'mixed'
                let flexState: FlexChipState
                let chipEnabled: boolean
                if (!multiEditActive || !multiSourceConfigs) {
                  chipEnabled = canFlexSubstats
                  flexState = chipEnabled
                    ? (cfg.autoSubstatFlex ? 'on' : 'off')
                    : 'disabled'
                } else {
                  const total = multiSourceConfigs.length
                  const enabledCount = multiSourceConfigs.filter((config) => canEnableSubstatFlex(config)).length
                  const onCount = multiSourceConfigs.filter((config) => config.autoSubstatFlex === true).length
                  chipEnabled = enabledCount > 0
                  if (!chipEnabled) {
                    flexState = 'disabled'
                  } else if (onCount === total) {
                    flexState = 'on'
                  } else if (onCount === 0 && enabledCount === total) {
                    flexState = 'off'
                  } else {
                    flexState = 'mixed'
                  }
                  if (chipEnabled) {
                    const stagedFlex = multiFields?.autoSubstatFlex
                    if (stagedFlex) {
                      if (stagedFlex.status === 'common') {
                        flexState = stagedFlex.value ? 'on' : 'off'
                      } else if (stagedFlex.status === 'mixed') {
                        flexState = 'mixed'
                      }
                    }
                  }
                }
                const flexGlyph = flexState === 'on' ? GLYPH_TOGGLE_ON : GLYPH_TOGGLE_OFF
                const label = t('builderFlexGlyphChipLabel', { glyph: flexGlyph })
                const stateLabel = flexState === 'on'
                  ? t('builderFlexChipOn')
                  : t('builderFlexChipOff')
                const handleFlexToggle = () => {
                  if (!chipEnabled) return
                  if (multiEditActive && multiEdit) {
                    const next = flexState === 'on' ? false : true
                    multiEdit.updateField('autoSubstatFlex', { value: next, status: 'common' })
                    return
                  }
                  toggleSubstatFlex()
                }
                const autoState = getRequiredCountTriState('auto')
                return (
                  <>
                    {/* Required substats caption exposes overflow through the shared label helper. */}
                    <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]} data-tour-id="builder.required.label">
                      <MarkdownTooltip
                        ellipsisTitle={t('builderRequiredSubstats')}
                        render={(
                          <BuilderTooltipContent
                            text={[
                              t('builderRequiredSubstatsHelp'),
                              t('builderMultiMixedTooltipSuffix'),
                            ].join('\n')}
                          />
                        )}
                      >
                        <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderRequiredSubstats')}</Box>
                      </MarkdownTooltip>
                    </FormLabel>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={requiredCountValue}
                      onChange={(_, v) => {
                        if (!v) return
                        if (multiEditActive && multiEdit) {
                          if (v === 'auto') {
                            multiEdit.updateField('autoMinCount', { value: true, status: 'common' })
                            multiEdit.updateField('minCount', { value: 0 as BuilderConfig['minCount'], status: 'common' })
                            multiEdit.updateField('autoSubstatFlex', { value: false, status: 'common' })
                          } else {
                            const next = Number(v) as 1 | 2 | 3 | 4
                            multiEdit.updateField('autoMinCount', { value: false, status: 'common' })
                            multiEdit.updateField('minCount', { value: next as BuilderConfig['minCount'], status: 'common' })
                            multiEdit.updateField('autoSubstatFlex', { value: false, status: 'common' })
                          }
                          return
                        }
                        if (v === 'auto') {
                          const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
                          const nextMin = Math.min(4, subsV.length) as 0 | 1 | 2 | 3 | 4
                          userDisabledFlexRef.current = true
                          onChange(normalizeKeepWithAuto({
                            ...cfg,
                            autoMinCount: true,
                            minCount: nextMin,
                          }))
                          return
                        }
                        const next = Number(v) as 1 | 2 | 3 | 4
                        onChange(normalizeKeepWithAuto({
                          ...cfg,
                          autoMinCount: false,
                          minCount: next,
                        }))
                      }}
                      data-tour-id="builder.required"
                      sx={{
                        '& .MuiToggleButton-root': {
                          height: TOGGLE_BUTTON_HEIGHT_PX,
                          minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                        },
                      }}
                    >
                      <ToggleButton
                        value="auto"
                        selected={autoState === 'on'}
                        sx={(theme) => ({
                          minWidth: BUILDER_AUTO_TOGGLE_WIDTH_PX,
                          width: BUILDER_AUTO_TOGGLE_WIDTH_PX,
                          ...(autoState === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                          ...(autoState === 'mixed' ? {
                            borderStyle: 'dashed',
                            borderColor: mixedBorderColor,
                            color: mixedTextColor,
                            backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                          } : {}),
                        })}
                      >
                        {t('headerMenuAuto')}
                      </ToggleButton>
                      {REQUIRED_SUBSTAT_MIN_OPTIONS.map((n) => {
                        const state = getRequiredCountTriState(n)
                        return (
                          <ToggleButton
                            key={n}
                            value={String(n)}
                            selected={state === 'on'}
                            sx={(theme) => ({
                              ...(state === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                              ...(state === 'mixed' ? {
                                borderStyle: 'dashed',
                                borderColor: mixedBorderColor,
                                color: mixedTextColor,
                                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                              } : {}),
                            })}
                          >
                            {n}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <MarkdownTooltip render={<BuilderTooltipContent text={t('builderSubstatFlexToggleTooltip')} />}>
                        <Box component="span" sx={{ display: 'inline-flex' }}>
                          <Chip
                            label={label}
                            size="small"
                            variant="filled"
                            clickable={chipEnabled}
                            onClick={chipEnabled ? handleFlexToggle : undefined}
                            disabled={!chipEnabled}
                            aria-pressed={chipEnabled ? flexState === 'on' : undefined}
                            aria-label={stateLabel}
                            sx={{
                              ...(builderToggleChipSx(chipEnabled) as SystemStyleObject<Theme>),
                              ...(flexState === 'mixed'
                                ? {
                                    borderStyle: 'dashed',
                                    borderColor: mixedBorderColor,
                                    color: mixedTextColor,
                                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                                  } as SystemStyleObject<Theme>
                                : {}),
                            }}
                            data-tour-id="builder.flex-chip"
                          />
                        </Box>
                      </MarkdownTooltip>
                    </Box>
                  </>
                )
              })()}
            </FormControl>
            {/* Milestone Thresholds (right of Min Required Rolls) */}
            {(() => {
              const tierForLabel = (() => {
                if (multiEditActive) {
                  const fieldValue = multiAutoRaritySupplementsField
                  if (fieldValue?.status === 'common') {
                    const raw = fieldValue.value
                    if (raw === 'uncommon' || raw === 'rare' || raw === 'epic') {
                      return raw
                    }
                  }
                }
                const raw = (multiEditActive ? cfg : effectiveConfig).autoRaritySupplementsThreshold
                  ?? pickAutoRaritySupplementsThreshold(multiEditActive ? cfg : effectiveConfig)
                return (raw === 'uncommon' || raw === 'epic') ? raw : 'rare'
              })()
              const tierLabel = tierForLabel === 'uncommon'
                ? t('rarityUncommon')
                : tierForLabel === 'epic'
                  ? t('rarityEpic')
                  : t('rarityRare')
              const autoChipEnabled = autoRarityChipState !== 'disabled'
              const tooltipLines = [
                t('builderAutoLateTitle'),
                `• ${t('builderAutoLateIntro')}`,
                `• ${t('builderAutoGeExample', { tier: t('rarityRare') })}`,
                `• ${t('builderAutoLateL4', { rare: t('rarityRare'), uncommon: t('rarityUncommon') })}`,
                `• ${t('builderAutoLateL8', { epic: t('rarityEpic') })}`,
                `• ${t('builderAutoLateL12', { legendary: t('rarityLegendary') })}`,
                `• ${t('builderAutoLateDisabledNote')}`,
              ]
              if (autoRarityChipState === 'mixed') {
                tooltipLines.push(t('builderMultiMixedTriStateHint'))
              }
              const cycleThreshold = (current: 'uncommon' | 'rare' | 'epic' | null, advance: boolean): 'uncommon' | 'rare' | 'epic' => {
                if (!advance || current == null) return 'rare'
                if (current === 'uncommon') return 'rare'
                if (current === 'rare') return 'epic'
                return 'uncommon'
              }
                const handleAutoChip = () => {
                  if (!autoChipEnabled) return
                  if (multiEditActive && multiEdit) {
                    const next = autoRarityChipState === 'on'
                      ? cycleThreshold(tierForLabel, true)
                      : pickAutoRaritySupplementsThreshold(cfg)
                    multiEdit.updateField('autoRaritySupplementsThreshold', { value: next, status: 'common' })
                    return
                  }
                  // When an override is active, allow clicking the effective value to accept it.
                  if (autoLateOverrideActive) {
                    const stored = cfg.autoRaritySupplementsThreshold
                    const effective = effectiveConfig.autoRaritySupplementsThreshold
                    if (stored !== effective && effective) {
                      updateAutoLateThreshold(effective)
                      return
                    }
                  }
                  const curr = (cfg.autoRaritySupplementsThreshold ?? pickAutoRaritySupplementsThreshold(cfg)) as 'uncommon' | 'rare' | 'epic'
                  const next = cycleThreshold(curr, true)
                  updateAutoLateThreshold(next)
                }
              const autoChipLabel = autoRarityChipState === 'on'
                ? t('builderAutoGeLabel', { tier: tierLabel })
                : t('builderAutoPlusLate')
              // Milestone Thresholds keeps the remaining 146px slice so chip spacing matches EN.
              return (
                <FormControl
                  sx={{
                    m: 0,
                    width: `${BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX}px`,
                    flex: `0 0 ${BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX}px`,
                  }}
                >
                  {/* Milestone Thresholds label also clamps to the 146px column width. */}
                  <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0.5 }]} data-tour-id="builder.thresholds.label">
                    <MarkdownTooltip
                      ellipsisTitle={t('builderMilestoneThresholds')}
                      render={(
                        <BuilderTooltipContent
                          text={buildOverrideTooltip(
                            [
                              t('builderMilestoneThresholdsHelp'),
                              t('builderMultiMixedTooltipSuffix'),
                            ].join('\n'),
                            keepModeLabel((cfg.earlyKeepMode ?? 'early') as 'early' | 'late'),
                            keepModeLabel((effectiveConfig.earlyKeepMode ?? 'early') as 'early' | 'late'),
                            keepOverrideActive,
                          )}
                        />
                      )}
                    >
                      <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('builderMilestoneThresholds')}</Box>
                    </MarkdownTooltip>
                  </FormLabel>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={keepModeValue}
                      onChange={(_, v) => {
                        if (!v) return
                        const mode = (v === 'late' ? 'late' : 'early') as 'early' | 'late'
                        if (multiEditActive && multiEdit) {
                          multiEdit.updateField('earlyKeepMode', { value: mode, status: 'common' })
                          return
                        }
                        userKeepModeRef.current = mode
                        updateKeepMode(mode)
                      }}
                      disabled={!thresholdsActiveAny}
                      data-tour-id="builder.thresholds"
                      sx={(theme) => ({
                        position: 'relative',
                        '& .MuiToggleButton-root': {
                          height: TOGGLE_BUTTON_HEIGHT_PX,
                          minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                        },
                        ...(keepOverrideActive ? {
                          '&::after': {
                            ...buildWarningBadgeIndicatorSx(theme),
                          },
                        } : {}),
                      })}
                    >
                      {(['early', 'late'] as const).map((mode) => {
                        const state = getKeepModeTriState(mode)
                        return (
                          <ToggleButton
                            key={mode}
                            value={mode}
                            selected={state === 'on'}
                            sx={(theme) => ({
                              ...(state === 'on' ? { fontWeight: theme.typography.fontWeightMedium ?? 500 } : {}),
                              ...(state === 'mixed' ? {
                                borderStyle: 'dashed',
                                borderColor: mixedBorderColor,
                                color: mixedTextColor,
                                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                              } : {}),
                            })}
                            onClick={() => {
                              // When an override is active, allow clicking the effective value to accept it.
                              if (multiEditActive || !keepOverrideActive) return
                              if ((cfg.earlyKeepMode ?? 'early') === (effectiveConfig.earlyKeepMode ?? 'early')) return
                              if (mode !== (effectiveConfig.earlyKeepMode ?? 'early')) return
                              updateKeepMode(mode)
                            }}
                          >
                            {mode === 'early' ? t('builderEarlyLabel') : t('builderLateLabel')}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                  </Box>
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <MarkdownTooltip
                      render={(
                        <BuilderTooltipContent
                          text={buildOverrideTooltip(
                            tooltipLines.join('\n'),
                            autoLateLabel(cfg.autoRaritySupplementsThreshold),
                            autoLateLabel(effectiveConfig.autoRaritySupplementsThreshold),
                            autoLateOverrideActive,
                          )}
                        />
                      )}
                    >
                      <Box component="span" sx={{ display: 'inline-flex', position: 'relative' }}>
                        <Chip
                          size="small"
                          variant="filled"
                          label={autoChipLabel}
                          onClick={autoChipEnabled ? handleAutoChip : undefined}
                          disabled={!autoChipEnabled}
                          sx={{
                            ...(builderToggleChipSx(autoChipEnabled, { dimDisabled: true }) as SystemStyleObject<Theme>),
                            ...(autoRarityChipState === 'mixed'
                              ? {
                                  borderStyle: 'dashed',
                                  borderColor: mixedBorderColor,
                                  color: mixedTextColor,
                                  backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                                } as SystemStyleObject<Theme>
                              : {}),
                            ...(autoLateOverrideActive
                              ? (theme) => ({
                                  position: 'relative',
                                  '&::after': {
                                    ...buildWarningBadgeIndicatorSx(theme),
                                  },
                                })
                              : {}),
                          }}
                          data-tour-id="builder.thresholds.auto-chip"
                        />
                      </Box>
                    </MarkdownTooltip>
                  </Box>
                </FormControl>
              )
            })()}
            {/* Substat Values… moved to top row (right of Max Level) */}
          </Box>
        </FormControl>
        {/* Warning area (fixed height, single line, ellipsed, always reserved) */}
        {(() => {
          const subsV = ((cfg as unknown as { substatsV?: number[] }).substatsV) ?? []
          const fixedV = ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
          const chosenCount = subsV.length
          const fixedCount = fixedV.length
          const warnMin = (chosenCount < cfg.minCount) && !(chosenCount === 0 && (cfg.autoMinRequiredRolls !== false))
          const warnFixed = fixedCount > 4
          // When Flex is off and Required equals the number of locked substats while
          // other unlocked substats are also selected, the unlocked ones never fire.
          // Skip this warning when Flex permutations are active because the builder
          // rotates those optional picks into separate rules instead of dropping them.
          const hasUnlockedSelected = chosenCount > fixedCount
          const flexActive = cfg.autoSubstatFlex === true && canFlexSubstats
          const warnReqBelowLocked = (cfg.minCount ?? 0) < fixedCount
          const warnReqEqLocked = (cfg.minCount === fixedCount) && hasUnlockedSelected && !flexActive
          // Aggregate floors without any tracked substats confuse users because they
          // never fire; warn whenever a manual global Min Required Rolls is set
          // while zero selections keep the builder idle.
          const warnMinRollsWithoutSubstats = (() => {
            if (chosenCount !== 0) return false
            if (cfg.autoMinRequiredRolls !== false) return false
            return (cfg.minRequiredRolls ?? 0) > 0
          })()
          // New: detect an impossible-by-target case under simple sufficient conditions:
          // If a global MinRequiredRolls is set and even the best-case sum of per‑stat caps
          // across the required number of selected substats is below that minimum, then
          // the target cannot be met. This mirrors cases like single SPD with Max=0 and MinRequired=1.
          const warnImpossible = (() => {
            if (!(cfg.autoMinRequiredRolls === false) || !cfg.minRequiredRolls || cfg.minRequiredRolls <= 0) return false
            if (!Array.isArray(subsV) || subsV.length === 0) return false
            const m = Math.max(cfg.minCount, fixedCount)
            if (m <= 0) return false
            // Build caps per selected variant
            // UI heuristic: default per‑stat cap is 4 rolls, except when the
            // selected rarity can feasibly reach 5 rolls on a single substat
            // (e.g., exact Mythical, ≤ Mythical), or when rarity is Any — the
            // builder models Mythical when needed. This avoids false
            // "impossible" warnings for legitimate 5‑roll targets like ACC
            // with a global MinRequired=5.
            const supportsFive = (() => {
              const rc = Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0)
              const mode = (cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode
              if (rc === RarityCode.Mythical || rc === RarityCode.LTE_Mythical) return true
              if (rc === RarityCode.Any) return true
              // When Auto and the global target is 5, treat as 5‑cap capable.
              if (mode === 'auto' && (cfg.minRequiredRolls ?? 0) >= 5) return true
              return false
            })()
            const defaultCap = supportsFive ? 5 : 4
            const capFor = (v: number): number => {
              const b = (cfg.substatRollBoundsV ?? {})[Number(v)]
              const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
              const raw = hasMax ? Number(b!.max) : defaultCap
              return Math.max(0, Math.min(defaultCap, raw))
            }
            const fixedCaps = fixedV.map(capFor)
            const optional = subsV.filter(v => !fixedV.includes(v))
            const optCaps = optional.map(capFor).sort((a,b)=>b-a)
            let sumCaps = 0
            // Include all fixed, then highest optional caps to fill to m
            for (const c of fixedCaps) sumCaps += c
            for (let i = 0; i < Math.max(0, m - fixedCaps.length); i++) { sumCaps += (optCaps[i] ?? 0) }
            return sumCaps < (cfg.minRequiredRolls ?? 0)
          })()
          const msg = warnMin
            ? `Warning: Required (${cfg.minCount}) > chosen (${chosenCount})`
            : (warnFixed
                ? `Warning: Fixed substats (${fixedCount}) exceed 4 — extra will be ignored`
                : (warnReqBelowLocked
                    ? `Warning: Required (${cfg.minCount}) is below locked (${fixedCount}); requirement will clamp to ${fixedCount}`
                    : (warnReqEqLocked
                        ? `Warning: Required (${cfg.minCount}) equals locked (${fixedCount}); other selected (${chosenCount - fixedCount}) will be ignored`
                        : (warnImpossible
                            ? t('builderMinRequiredRollsImpossibleWarn')
                            : (warnMinRollsWithoutSubstats
                                ? t('builderMinRequiredRollsNoSubstatsWarn')
                                : '')))))
          return (
            // Always reserve a compact space to avoid layout shift while keeping the gap minimal
            <Box sx={{ height: UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%', lineHeight: 1.2 }}
              >
                {msg}
              </Typography>
            </Box>
          )
        })()}

        {/* Sets multi-select with order toggle and search */}
        <FormControl sx={{ m: 0 }}>
          {/* Header row: label on the left, Manage metasets on the right */}
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, mb: 0.5 }}>
            {/* Sets label mirrors the ellipsis span so the Manage Metasets button stays put. */}
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { mb: 0, mr: 1, flex: '0 1 auto' }]}>
              <MarkdownTooltip
                ellipsisTitle={t('setsTitle')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderSetsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={BUILDER_LABEL_TEXT_SX}>{t('setsTitle')}</Box>
              </MarkdownTooltip>
            </FormLabel>
            {/* Flexible spacer keeps the label left-aligned and the button right-aligned */}
            <Box ref={setsLeftRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
            <MarkdownTooltip markdown={t('builderManageMetasetsTooltip')}>
              <Button
                size="small"
                variant="outlined"
                onClick={openMetaDlg}
                sx={{ minWidth: 160, whiteSpace: 'nowrap', ml: 'auto', overflow: 'hidden', textOverflow: 'ellipsis' }}
                data-tour-id="builder.manage-metasets"
              >
                <Box component="span" data-ellipsis-target sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('builderManageMetasetsButton')}
                </Box>
              </Button>
            </MarkdownTooltip>
          </Box>
          {(() => {
            // Token helpers keep metasets + sets in a single select control.
            const tokenOf = {
              meta: (id: string) => `m:${id}`,
              set: (id: number) => `s:${id}`,
            }
            // Filter to visible metasets so hidden ones never show in the menu.
            const visibleMetasets = metasets.filter(m => m.show !== false)
            // Keep order stable by preferring visible metasets when present.
            const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
            // Normalize set selections so excluded entries are retained.
            const baseSetSelections = normalizeArtifactSetSelections(cfg.artifactSets ?? [])
            // Split include/exclude lists so UI can render both states.
            const baseSetSplit = splitArtifactSetSelections(baseSetSelections)
            // Resolve metaset order for the base config (or multi-edit union).
            const baseMetaIds = orderMetasetIds(cfg.artifactMetaSets, orderBasis)
            const metaDisplayIds = multiEditActive && multiSummary
              ? orderMetasetIds(
                  Array.from(new Set<string>([
                    ...baseMetaIds,
                    ...Array.from(multiSummary.metaCounts.keys()),
                    ...((metasetsPatch?.add ?? []).map(String)),
                    ...((metasetsPatch?.replace ?? []).map(String)),
                  ])),
                  orderBasis,
                )
              : baseMetaIds
            const setDisplayIds = (() => {
              // In single-edit, show only the current include list.
              if (!multiEditActive || !multiSummary) {
                return baseSetSplit.included.slice().sort((a, b) => a - b)
              }
              // Multi-edit: union all included sets + staged patch entries.
              const union = new Set<number>()
              for (const key of multiSummary.setCounts.keys()) union.add(Number(key))
              for (const id of baseSetSplit.included) union.add(Number(id))
              // Patch entries may include new includes; merge them into the display list.
              const patchEntries = normalizeArtifactSetSelections([
                ...((setsPatch?.add ?? []) as ArtifactSetSelectionEntry[]),
                ...((setsPatch?.replace ?? []) as ArtifactSetSelectionEntry[]),
              ])
              const patchSplit = splitArtifactSetSelections(patchEntries)
              for (const id of patchSplit.included) union.add(Number(id))
              return Array.from(union).sort((a, b) => a - b)
            })()
            const excludedDisplayIds = (() => {
              // Single-edit: use just the current exclusions.
              if (!multiEditActive || !multiSelectedConfigs) {
                return baseSetSplit.excluded.slice().sort((a, b) => a - b)
              }
              // Multi-edit: union all excluded sets + staged patch entries.
              const union = new Set<number>()
              for (const cfgEntry of multiSelectedConfigs) {
                const split = splitArtifactSetSelections(cfgEntry.artifactSets)
                for (const id of split.excluded) union.add(Number(id))
              }
              // Patch entries may add exclusions; merge them into the display list.
              const patchEntries = normalizeArtifactSetSelections([
                ...((setsPatch?.add ?? []) as ArtifactSetSelectionEntry[]),
                ...((setsPatch?.replace ?? []) as ArtifactSetSelectionEntry[]),
              ])
              const patchSplit = splitArtifactSetSelections(patchEntries)
              for (const id of patchSplit.excluded) union.add(Number(id))
              return Array.from(union).sort((a, b) => a - b)
            })()
            // Collapse tri-state selections into the "all" set for display/tokens.
            const selectedMetaIds = multiEditActive && multiSummary
              ? metaDisplayIds.filter((id) => getMetasetState(id) === 'all')
              : baseMetaIds
            const selectedSetIds = multiEditActive && multiSummary
              ? setDisplayIds.filter((id) => getSetState(id) === 'all')
              : baseSetSplit.included.slice().sort((a, b) => a - b)
            // Keep excluded ids separate so the UI can render them with a red indicator.
            const excludedSetIds = multiEditActive
              ? excludedDisplayIds
              : baseSetSplit.excluded.slice().sort((a, b) => a - b)
            // Build the Select token list from explicit metasets + includes.
            const selectedTokens: string[] = [
              ...selectedMetaIds.map(tokenOf.meta),
              ...selectedSetIds.map(tokenOf.set),
            ]
            // Track sets introduced by metasets so right-click exclusion is scoped.
            const metaDerivedSetIds = new Set<number>(resolveMetasetIds(selectedMetaIds, metasets).map(Number))
            const handleExcludeSet = (id: number) => {
              // Multi-edit exclusion UI is intentionally disabled.
              if (multiEditActive) return
              // Ignore items not introduced by metasets.
              if (!metaDerivedSetIds.has(id)) return
              // Flip the exclude flag for this set id.
              const isExcluded = excludedSetIds.includes(id)
              // Exclusions should clear explicit includes for the same set.
              const nextIncluded = selectedSetIds.filter((entry) => entry !== id)
              const nextExcluded = isExcluded
                ? excludedSetIds.filter((entry) => entry !== id)
                : [...excludedSetIds, id]
              const nextSelections = normalizeArtifactSetSelections([
                ...nextIncluded.map((entry) => ({ id: entry })),
                ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
              ])
              onChange({ ...cfg, artifactSets: nextSelections })
            }
            // Evaluate "Any" state based on metasets, sets, and exclusions.
            const projectedMetaActive = multiEditActive && multiSummary
              ? metaDisplayIds.some((id) => getMetasetState(id) !== 'none')
              : (cfg.artifactMetaSets?.length ?? 0) > 0
            const projectedSetActive = multiEditActive && multiSummary
              ? setDisplayIds.some((id) => getSetState(id) !== 'none')
              : baseSetSelections.length > 0
            const projectedExcludeActive = excludedSetIds.length > 0
            const hasAnySelection = projectedMetaActive || projectedSetActive || projectedExcludeActive
            // Inline padding grows when the clear button is visible.
            const inlinePaddingPx = hasAnySelection ? SETS_SELECT_INLINE_GUTTER_PX : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX
            const handleChange = (e: SelectChangeEvent<string[]>) => {
              // Multi-edit handles tokens via patch controls instead.
              if (multiEditActive) return
              const tokens = e.target.value as string[]
              // Resolve metaset IDs using the same ordering basis.
              const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
              const metaIds = orderMetasetIds(metaIdsRaw, orderBasis)
              // Capture explicit includes from set tokens.
              const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
              // Keep exclusions unless the user explicitly selected the set.
              const nextExcluded = excludedSetIds.filter((id) => !setIds.includes(id))
              const nextSelections = normalizeArtifactSetSelections([
                ...setIds.map((id) => ({ id })),
                ...nextExcluded.map((id) => ({ id, excluded: true })),
              ])
              onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: nextSelections })
            }
            const handleToggleSet = (id: number) => {
              // Multi-edit toggles are handled via patch helpers.
              if (multiEditActive && multiEdit) {
                toggleSet(id)
                return
              }
              // Toggle only the explicit include list for single-config edits.
              const prev = new Set<number>(baseSetSplit.included.map(Number))
              if (prev.has(id)) prev.delete(id); else prev.add(id)
              const nextSets = Array.from(prev).sort((a, b) => a - b)
              // Remove exclusions when a set is explicitly re-added.
              const nextExcluded = baseSetSplit.excluded.filter((entry) => Number(entry) !== id)
              const nextSelections = normalizeArtifactSetSelections([
                ...nextSets.map((entry) => ({ id: entry })),
                ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
              ])
              onChange({ ...cfg, artifactSets: nextSelections })
            }
            const getSetsSelectionDisplay = (tokens: readonly string[]) => {
              // Multi-edit needs mixed-value labels for tri-state tokens.
              if (multiEditActive && multiSummary) {
                const names: string[] = []
                // Metaset labels reflect tri-state status.
                for (const id of metaDisplayIds) {
                  const state = getMetasetState(id)
                  if (state === 'none') continue
                  const meta = metasets.find(x => x.id === id)
                  if (meta) {
                    const { glyph, iconId } = metasetGlyph(meta)
                    const hasGlyph = glyph != null && !!iconId
                    const needsGap = hasGlyph && iconId !== 'empty'
                    const label = hasGlyph
                      ? `${glyph}${needsGap ? ` ${meta.name}` : meta.name}`
                      : meta.name
                    names.push(state === 'partial' ? `${label} – ${t('builderMultiMixedValue')}` : label)
                  }
                }
                // Set labels reflect tri-state status as well.
                for (const id of setDisplayIds) {
                  const state = getSetState(id)
                  if (state === 'none') continue
                  const baseName = getLocalizedGearSetName(id, t, lang)
                  names.push(state === 'partial' ? `${baseName} – ${t('builderMultiMixedValue')}` : baseName)
                }
                // Exclusions always show with a "not" prefix.
                for (const id of excludedDisplayIds) {
                  const baseName = getLocalizedGearSetName(id, t, lang)
                  names.push(`not ${baseName}`)
                }
                const text = names.length > 0 ? names.join(', ') : t('any')
                return {
                  node: (
                    <Box
                      component="span"
                      data-ellipsis-target
                      sx={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {text}
                    </Box>
                  ),
                  text,
                }
              }
              // Single-edit: render plain labels with exclusions appended.
              const any = (!tokens || tokens.length === 0) && excludedSetIds.length === 0
              const names: string[] = []
              if (!any) {
                // Metaset tokens reuse glyphs to match the menu.
                for (const token of tokens) {
                  if (token.startsWith('m:')) {
                    const id = token.slice(2)
                    const m = metasets.find(x => x.id === id)
                    if (m) {
                      const { glyph, iconId } = metasetGlyph(m)
                      if (glyph != null && iconId) {
                        const needsGap = iconId !== 'empty'
                        names.push(`${glyph}${needsGap ? ` ${m.name}` : m.name}`)
                      } else {
                        names.push(m.name)
                      }
                    }
                  } else if (token.startsWith('s:')) {
                    const id = Number(token.slice(2))
                    names.push(getLocalizedGearSetName(id, t, lang))
                  }
                }
                // Exclusions show as "not X" entries.
                for (const id of excludedSetIds) {
                  names.push(`not ${getLocalizedGearSetName(id, t, lang)}`)
                }
              }
              const text = (any || names.length === 0) ? t('any') : names.join(', ')
              return {
                node: (
                  <Box
                    component="span"
                    data-ellipsis-target
                    sx={{
                      display: 'block',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {text}
                  </Box>
                ),
                text,
              }
            }
            const { text: setsSelectionTooltip } = getSetsSelectionDisplay(selectedTokens)
            // Build set list per order/search (shared helper keeps behavior consistent)
            const sorted = filterAndSortSetEntries(setsSearch, setsOrder, { translate: t })

            // Show metasets section only when there is at least one visible user metaset. Avoid empty metasets UI.
            const hasMetasetsSection = visibleMetasets.length > 0
            const metasetsMenu: Metaset[] = visibleMetasets

            return (
              <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
                <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'hidden' }}>
                  {(() => {
                    const baseSelect = (
                      <Select
                        size="small"
                        multiple
                        value={selectedTokens}
                        onChange={handleChange}
                        onOpen={(e) => {
                          setMetaSetsMenuOpen(true)
                          requestAnimationFrame(() => requestAnimationFrame(() => {
                            scrollSetsMenuToSelected(setsOrder, { force: true })
                          }))
                          try {
                            const el = (e?.currentTarget as HTMLElement | null)
                            const rect = el?.getBoundingClientRect()
                            const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                            const margin = 8
                            const selectedMetaState = (id: string): 'none' | 'partial' | 'all' => {
                              if (multiEditActive) return getMetasetState(id)
                              return (cfg.artifactMetaSets ?? []).includes(id) ? 'all' : 'none'
                            }
                            const targetMetasetId = (() => {
                              if (!hasMetasetsSection) return null
                              const firstFull = metasetsMenu.find((meta) => selectedMetaState(meta.id) === 'all')
                              if (firstFull) return firstFull.id
                              const firstPartial = metasetsMenu.find((meta) => selectedMetaState(meta.id) === 'partial')
                              return firstPartial?.id ?? null
                            })()
                            // Theoretical max height depends on whether the Metasets section is present.
                            const theoreticalMax = hasMetasetsSection
                              ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                              : (MENU_MAX_HEIGHT_SETS_LIST_PX + MENU_MAX_HEIGHT_EXTRA_BUFFER)
                            const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                            const desiredLeft = rect ? Math.floor(rect.left) : margin
                            setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                            // After the menu mounts, measure and refine the anchor using real height.
                            const refine = () => {
                              try {
                                const paper = setsMenuPaperRef.current
                                const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                                if (rect && measured > 0) {
                                  const maxHeight = Math.min(measured, viewportH - margin * 2) + MENU_MAX_HEIGHT_EXTRA_BUFFER
                                  const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                                  setSetsMenuAnchorPos({ top, left: desiredLeft })
                                }
                              } catch {}
                              if (targetMetasetId) {
                                try {
                                  const list = metasetsMenuListRef.current
                                  if (!list) return
                                  const items = list.querySelectorAll<HTMLElement>('[data-metaset-id]')
                                  for (const item of items) {
                                    if (item.getAttribute('data-metaset-id') === targetMetasetId) {
                                      item.scrollIntoView({ block: 'nearest' })
                                      break
                                    }
                                  }
                                } catch {}
                              }
                              scrollSetsMenuToSelected(setsOrder, { force: true })
                            }
                            // Double rAF to wait for mount + layout
                            requestAnimationFrame(() => requestAnimationFrame(refine))
                          } catch { setSetsMenuAnchorPos(null) }
                        }}
                        onClose={() => { setMetaSetsMenuOpen(false); setHoveredSetMetaId(null); setSetsMenuAnchorPos(null) }}
                        renderValue={(value) => {
                          const tokens = Array.isArray(value) ? value : []
                          return getSetsSelectionDisplay(tokens).node
                        }}
                        displayEmpty
                        sx={{
                          ...selectBoxHeightSx,
                          width: '100%',
                          minWidth: 0,
                          pr: `${inlinePaddingPx}px`,
                          '& .MuiSelect-select': {
                            ...selectContentHeightSx,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                          },
                          '& .MuiSelect-icon': {
                            right: 8,
                          },
                        }}
                        data-tour-id="builder.sets"
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                              maxWidth: SETS_MENU_WIDTH_PX,
                              overflowX: 'hidden',
                            },
                            ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
                          },
                          MenuListProps: {
                            sx: { width: '100%', maxWidth: '100%' },
                          },
                          ...(setsMenuAnchorPos
                            ? {
                                anchorReference: 'anchorPosition' as const,
                                anchorPosition: setsMenuAnchorPos,
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }
                            : {
                                transformOrigin: { vertical: 'top', horizontal: 'left' as const },
                              }),
                        }}
                      >
                      {/* Metasets section in its own scroll area (hidden if none) */}
                      {hasMetasetsSection && (
                        <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                          <Box
                            component="ul"
                            ref={metasetsMenuListRef}
                            sx={{
                              listStyle: 'none',
                              p: 0,
                              m: 0,
                              maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                              overflowY: 'auto',
                              pr: `${MENU_SCROLL_GUTTER_PX}px`,
                              // Firefox manually pads here so Chrome keeps native scrollbar-gutter behavior.
                              ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                            }}
                            data-tour-id="menu.metasets.section"
                          >
                            <ListSubheader sx={LIST_SUBHEADER_SX}>Metasets</ListSubheader>
                            {metasetsMenu.map((m) => {
                              const { glyph, iconId } = metasetGlyph(m)
                              const hasGlyph = glyph != null && !!iconId
                              const needsGap = iconId !== null && iconId !== 'empty'
                              const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${m.name}` : m.name}` : m.name
                              const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                              const setNames = m.sets.map((id) => getLocalizedGearSetName(id, t, lang)).filter(Boolean)
                              const joined = setNames.join(', ')
                              const usedMeta = metasetUsageCounts[m.id] || 0
                              const metaState = multiEditActive ? getMetasetState(m.id) : (selectedMetaIds.includes(m.id) ? 'all' : 'none')
                              const isSelectedMeta = metaState === 'all'
                              const isPartialMeta = metaState === 'partial'
                              return (
                                <MenuItem
                                  key={m.id}
                                  value={`m:${m.id}`}
                                  selected={isSelectedMeta}
                                  data-metaset-id={m.id}
                                  onMouseEnter={() => setHoveredSetMetaId(m.id)}
                                  onMouseLeave={() => setHoveredSetMetaId((prev) => (prev === m.id ? null : prev))}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (multiEditActive && multiEdit) {
                                      toggleMetaset(m.id)
                                      return
                                    }
                                    const token = `m:${m.id}`
                                    const tokensSet = new Set<string>(selectedTokens)
                                    if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                    const tokens = Array.from(tokensSet)
                                    const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                    const metaIds = orderMetasetIds(metaIdsRaw, orderBasis)
                                    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                    const nextExcluded = excludedSetIds.filter((id) => !setIds.includes(id))
                                    const nextSelections = normalizeArtifactSetSelections([
                                      ...setIds.map((id) => ({ id })),
                                      ...nextExcluded.map((id) => ({ id, excluded: true })),
                                    ])
                                    onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: nextSelections })
                                  }}
                                  sx={(theme) => ({
                                    '&.Mui-selected': {
                                      backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                                      '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                                    },
                                    ...(isPartialMeta ? {
                                      borderStyle: 'dashed',
                                      borderColor: mixedBorderColor,
                                      backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                                      color: mixedTextColor,
                                    } : {}),
                                  })}
                                >
                                  <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                                      <EllipsisTooltip
                                        title={tooltipName}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: displayGap, minWidth: 0 }}>
                                          {hasGlyph ? (
                                            <Box component="span" aria-hidden sx={{ fontSize: 18, width: 22, textAlign: 'center', lineHeight: 1 }}>
                                              {glyph}
                                            </Box>
                                          ) : null}
                                          <Typography noWrap data-ellipsis-target sx={{ minWidth: 0 }}>{m.name}</Typography>
                                        </Box>
                                      </EllipsisTooltip>
                                      {m.sets.length > 0 && (
                                        <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                          ({m.sets.length} set(s))
                                        </Typography>
                                      )}
                                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('setsUsageInConfigs', { n: usedMeta })}</Typography>
                                    </Box>
                                    {setNames.length > 0 && (
                                      <EllipsisTooltip
                                        title={joined}
                                        selector=".MuiTypography-caption"
                                        wrap="block"
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                                        >
                                          {joined}
                                        </Typography>
                                      </EllipsisTooltip>
                                    )}
                                  </Box>
                                </MenuItem>
                              )
                            })}
                          </Box>
                        </Box>
                      )}
                      {/* Sets section in its own scroll area (icons or list) */}
                      <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                        {/* Keep header outside the scrollable list to avoid width changes when scrollbars appear */}
                        <ListSubheader sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'center', pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SetsOrderControls
                                setsSearch={setsSearch}
                                onSetsSearchChange={setSetsSearch}
                                setsOrder={setsOrder}
                                onSetsOrderChange={(v: 'game' | 'az' | 'icons') => {
                                  if (!v) return
                                  setSetsOrder(v)
                                  if (metaSetsMenuOpen) {
                                scrollSetsMenuToSelected(v, { force: true })
                                  }
                                }}
                                zeroResults={filterAndSortSetEntries(setsSearch, setsOrder, { translate: t }).length === 0}
                              />
                            </Box>
                          </Box>
                        </ListSubheader>
                        <Box
                          component="ul"
                          ref={setsMenuListRef}
                          sx={{
                            listStyle: 'none',
                            p: 0,
                            m: 0,
                            ...(setsOrder === 'icons'
                              ? {
                                  // Icon mode: never scroll; grid expands with content
                                  maxHeight: 'none',
                                  height: 'auto',
                                  overflowY: 'visible',
                                }
                              : {
                                  // List modes: fixed height with scrolling
                                  maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  height: MENU_MAX_HEIGHT_SETS_LIST_PX,
                                  overflowY: 'auto',
                                }),
                            // Reserve a stable right padding so hover indicators
                            // remain visible and width does not change when scrollbars appear
                            pr: `${MENU_SCROLL_GUTTER_PX}px`,
                            ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                          }}
                        >
                        <SetMenuSection
                          title={t('setsTitle')}
                          sorted={sorted}
                          setsOrder={setsOrder}
                          metasets={metasets}
                          excludeMetasetId={null}
                          setUsageCounts={setUsageCounts}
                          valueForSet={(id) => `s:${id}`}
                          // Header rendered above; keep items-only here
                          hideHeader
                          hoveredMetasetId={hoveredSetMetaId}
                          selectedMetasetIds={selectedMetaIds}
                          selectedSetIds={selectedSetIds}
                          excludedSetIds={excludedSetIds}
                          onToggleSet={handleToggleSet}
                          onContextMenuSet={(id) => handleExcludeSet(id)}
                          {...(multiEditActive ? { triStateForSet: getSetState } : {})}
                        />
                        </Box>
                      </Box>
                      </Select>
                    )
                    const selectEl = (
                      <Box ref={setsSelectContainerRef} sx={{ position: 'relative' }}>
                        {baseSelect}
                        <InlineSelectClearButton
                          disabled={!hasAnySelection}
                          label={t('clear')}
                          onClear={() => {
                            if (!hasAnySelection) return
                            if (multiEditActive && multiEdit) {
                              multiEdit.updateField('artifactSets', {
                                value: (multiSetsField?.value as BuilderConfig['artifactSets']) ?? (cfg.artifactSets ?? []),
                                status: 'common',
                                patch: { clear: true },
                              })
                              multiEdit.updateField('artifactMetaSets', {
                                value: (multiMetasetsField?.value as BuilderConfig['artifactMetaSets']) ?? (cfg.artifactMetaSets ?? []),
                                status: 'common',
                                patch: { clear: true },
                              })
                              return
                            }
                            onChange({ ...cfg, artifactSets: [], artifactMetaSets: [] })
                          }}
                        />
                        <SelectDropdownActivator
                          getDisplayNode={() => {
                            const root = setsSelectContainerRef.current
                            if (!root) return null
                            return root.querySelector('[role="combobox"]') as HTMLElement | null
                          }}
                          widthPx={hasAnySelection ? undefined : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX}
                        />
                      </Box>
                    )
                    // Keep a stable wrapper to prevent the Select from remounting
                    // when transitioning from empty to non-empty selections, which
                    // could close the menu after the first click.
                    return (
                      <EllipsisTooltip
                        title={setsSelectionTooltip}
                        selector=".MuiSelect-select"
                        wrap="block"
                        // Disable while menu is open to avoid layout measurements.
                        disabled={metaSetsMenuOpen}
                      >
                        {selectEl}
                      </EllipsisTooltip>
                    )
                  })()}
                </Box>
              </Box>
            )
          })()}
        </FormControl>
        {/* Reserved spacer keeps layout consistent even without a dirty indicator. */}
        <Box sx={{ mt: 'auto', height: 6 }} />
        </Box>

      </Box>

        {/* Metasets dialog (separate component) */}
        {metaDlgOpen ? (
          <MetasetsDialog
            open={metaDlgOpen}
            onClose={closeMetaDlg}
            metasets={metasets}
            onMetasetsChange={onMetasetsChange}
            describeNextChange={describeNextChange}
            onDeleteMetaset={onDeleteMetaset}
            onResetMetasets={onResetMetasets}
            setUsageCounts={setUsageCounts}
            metasetUsageCounts={metasetUsageCounts}
            keepUniqueMetasetUsageCounts={keepUniqueMetasetUsageCounts}
            onSelectConfigsByMetaset={onSelectConfigsByMetaset}
            setsSearch={setsSearch}
            onSetsSearchChange={setSetsSearch}
            setsOrder={setsOrder}
            onSetsOrderChange={(v) => {
              if (!v) return
              setSetsOrder(v)
              if (metaSetsMenuOpen) {
                scrollSetsMenuToSelected(v, { force: true })
              }
            }}
            metaSetsMenuOpen={metaSetsMenuOpen}
            setMetaSetsMenuOpen={setMetaSetsMenuOpen}
          />
        ) : null}

        {substatTargetsDialogOpen ? (
          <SubstatTargetsDialog
            open={substatTargetsDialogOpen}
            onClose={onCloseSubstatTargetsDialog}
            substatTargets={substatTargets}
            onSubstatTargetsChange={onSubstatTargetsChange}
            substatColors={substatColors}
          />
        ) : null}

      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <MarkdownTooltip markdown={t('builderInsertHiddenTooltip')} disableHoverListener={!insertHiddenByFilters || !builderCanAdd}>
          <Box
            component="span"
            onContextMenu={handleInsertContextMenu}
            onMouseEnter={handleInsertHintMouseEnter}
            onMouseMove={handleInsertHintMouseMove}
            onMouseLeave={handleInsertHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Badge
              overlap="rectangular"
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              invisible={!insertHiddenByFilters || !builderCanAdd}
              sx={warningBadgeSx}
              badgeContent="!"
            >
              <Button
                onClick={handleAddToCustom}
                data-tour-id="builder.add-config"
                startIcon={<PlaylistAddIcon fontSize="small" />}
                sx={actionButtonSx}
                disabled={!builderCanAdd}
              >
                <Typography component="span" sx={[ELLIPSIS_TEXT_SX, { fontSize: FONT_SIZE_BASE_PX }]}>
                  {insertButtonLabel}
                </Typography>
              </Button>
            </Badge>
          </Box>
        </MarkdownTooltip>
        <MarkdownTooltip
          key={saveTooltipScope}
          markdown={t('builderSaveHiddenTooltip')}
          disableHoverListener={!saveHiddenByFilters || saveDisabled}
          open={saveTooltipOpen && saveHiddenByFilters && !saveDisabled}
          onOpen={() => setSaveTooltipOpen(true)}
          onClose={() => setSaveTooltipOpen(false)}
        >
          <Box
            component="span"
            onContextMenu={handleApplyContextMenu}
            onMouseEnter={handleApplyHintMouseEnter}
            onMouseMove={handleApplyHintMouseMove}
            onMouseLeave={handleApplyHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Badge
              overlap="rectangular"
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              invisible={!saveHiddenByFilters || saveDisabled}
              sx={warningBadgeSx}
              badgeContent="!"
            >
              <Button
                onClick={() => {
                  setSaveTooltipOpen(false)
                  if (multiEditActive) {
                    if (!multiDraftDirty) return
                    onApplyMultiEdit?.()
                    if (attentionPhase) {
                      setAttentionState({ phase: false, burst: false })
                      setInteractionNonce(n => n + 1)
                    }
                    return
                  }
                  if (editingIndex === null) return
                  commitNameDraftIfNeeded()
                  onUpdateSelected()
                }}
                disabled={saveDisabled}
                startIcon={<PlaylistAddCheckIcon fontSize="small" />}
                sx={saveButtonSx}
                onMouseEnter={() => {
                  if (attentionPhase) {
                    setAttentionState({ phase: false, burst: false })
                    setInteractionNonce(n => n + 1)
                  }
                }}
              >
                <Typography component="span" className="attention-text" sx={[ELLIPSIS_TEXT_SX, { fontSize: FONT_SIZE_BASE_PX }]}>
                  {saveButtonLabel}
                </Typography>
              </Button>
            </Badge>
          </Box>
        </MarkdownTooltip>
        {(limitExceededWarning && limitWarningTooltip)
          ? (
            <MarkdownTooltip markdown={limitWarningTooltip}>
              {ruleCountChipWithSpinner}
            </MarkdownTooltip>
          )
          : ruleCountChipWithSpinner}
        <Box sx={{ flex: 1 }} />
        <Box
          component="span"
          onContextMenu={handleResetContextMenu}
          onMouseEnter={handleResetHintMouseEnter}
          onMouseMove={handleResetHintMouseMove}
          onMouseLeave={handleResetHintMouseLeave}
        >
          <Button
            size="small"
            color="warning"
            disabled={isDefaultBuilder || multiEditActive}
            onMouseEnter={(e) => {
              setHoverReset(true)
              handleResetHintMouseEnter(e)
            }}
            onMouseLeave={() => setHoverReset(false)}
            onClick={handleResetBuilder}
            onFocus={(e) => {
              if (multiEditActive || isDefaultBuilder || !showResetHint) return
              const rect = e.currentTarget.getBoundingClientRect()
              setResetHintPos?.({ x: rect.right, y: rect.top })
            }}
            onBlur={() => setResetHintPos?.(null)}
            onMouseMove={handleResetHintMouseMove}
            sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
          >
            {t('builderResetButton')}
          </Button>
        </Box>
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={insertHintActive ? insertHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={applyHintActive ? applyHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={resetHintActive ? resetHintPos : null} />
        <Menu
          anchorEl={insertMenuAnchor}
          open={Boolean(insertMenuAnchor)}
          onClose={closeInsertMenu}
          PaperProps={{ ref: insertMenuPaperRef }}
        >
          <MenuItem
            onClick={() => setAutoResetAfterInsertExclusive(!autoResetAfterInsert)}
          >
            <Checkbox
              size="small"
              checked={autoResetAfterInsert}
              onChange={(e) => setAutoResetAfterInsertExclusive(Boolean(e.target.checked))}
              sx={{ mr: 1, p: 0.5 }}
            />
            {t('builderMenuAutoResetAfterInsert')}
          </MenuItem>
        </Menu>
        <Menu
          anchorEl={applyMenuAnchor}
          open={Boolean(applyMenuAnchor)}
          onClose={closeApplyMenu}
          PaperProps={{ ref: applyMenuPaperRef }}
        >
          <MenuItem
            onClick={() => setAutoApplySelectedConfigExclusive(!autoApplySelectedConfig)}
          >
            <Checkbox
              size="small"
              checked={autoApplySelectedConfig}
              onChange={(e) => setAutoApplySelectedConfigExclusive(Boolean(e.target.checked))}
              sx={{ mr: 1, p: 0.5 }}
            />
            {t('builderMenuAutoApplySelected')}
          </MenuItem>
        </Menu>
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={closeResetMenu}
          PaperProps={{ ref: resetMenuPaperRef }}
        >
          {(() => { void defaultsEpoch; return null })()}
          <MenuItem
            onClick={() => {
              closeResetMenu()
              // Save current as user defaults. If identical to factory defaults,
              // remove the override to keep storage clean and restore factory behavior.
              const factory = createFactoryBuilderDefaults()
              const current: BuilderConfig = {
                name: cfg.name ?? '',
                keep: cfg.keep,
                exportMode: cfg.exportMode,
                rankCode: cfg.rankCode,
                rarityCode: cfg.rarityCode,
                rarityMode: (cfg.rarityMode ?? 'code'),
                autoRaritySupplementsThreshold: (cfg.autoRaritySupplementsThreshold ?? 'rare'),
                factionCode: (cfg.factionCode ?? 0),
                mainStatsV: (cfg.mainStatsV ?? []),
                minLevel: (cfg.minLevel ?? 0),
                maxLevel: (cfg.maxLevel ?? 16),
                earlyKeepMode: (cfg.earlyKeepMode ?? 'early'),
                substatsV: (cfg.substatsV ?? []),
                fixedSubstatsV: (cfg.fixedSubstatsV ?? []),
                minCount: cfg.minCount,
                autoMinCount: Boolean(cfg.autoMinCount ?? true),
                autoSubstatFlex: Boolean((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false),
                minRequiredRolls: Number(cfg.minRequiredRolls ?? 0) as 0|1|2|3|4|5,
                autoMinRequiredRolls: Boolean(cfg.autoMinRequiredRolls ?? true),
                substatRollBoundsV: (cfg.substatRollBoundsV ?? {}),
                artifactTypes: (cfg.artifactTypes ?? []),
                artifactSets: (cfg.artifactSets ?? []),
                artifactMetaSets: (cfg.artifactMetaSets ?? []),
              }
              const same = JSON.stringify(current) === JSON.stringify(factory)
              try {
                if (same) {
                  localStorage.removeItem(BUILDER_USER_DEFAULTS_KEY)
                } else {
                  localStorage.setItem(BUILDER_USER_DEFAULTS_KEY, JSON.stringify(current))
                }
              } catch {}
              setDefaultsEpoch((x) => x + 1)
            }}
          >
            {t('builderMenuSaveUserDefaults')}
          </MenuItem>
          <MenuItem
            disabled={(() => { try { return !localStorage.getItem(BUILDER_USER_DEFAULTS_KEY) } catch { return true } })()}
            onClick={() => {
              closeResetMenu()
              // Reset the builder to factory defaults explicitly
              const factory = createFactoryBuilderDefaults()
              onChange({
                ...cfg,
                ...factory,
              })
            }}
          >
            {t('builderMenuResetFactoryDefaults')}
          </MenuItem>
        </Menu>
      </Stack>
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
    </Box>
  )
}
