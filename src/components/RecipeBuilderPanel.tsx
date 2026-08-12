/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderRecipe, manages metasets and substatTargets, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
// React drives the builder UI; hooks keep state localized while recipe flows from App.
import { scopeColorsText } from '../lib/colorScope'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rarityCodeToName, rarityCodeParts, StatVariant, RankCode, RarityCode, Faction, type FactionId, filterAndSortSetEntries, statVariantI18nKey, LEVEL_MILESTONES, type LevelMilestone, STAT_VARIANTS_PRIORITY_ROW1, STAT_VARIANTS_PRIORITY_ROW2, getLocalizedGearSetName } from '../lib/types'
import { RarityCodeLabel } from './RarityLabel'
import { StatLabel } from './StatLabel'
import { SlotTintControlScope } from '../lib/slotTintContext'
import { useStatControlColorMap } from '../lib/statColorContext'
import { variantToSub } from '../lib/hsfTypes'
import { ACCESSORY_NO_SET_ID, NBSP, GLYPH_TOGGLE_ON, GLYPH_TOGGLE_OFF } from '../lib/constants'
import { reserveScrollbarGutterSpace, visibleScrollbarTrack } from '../lib/scrollbar'
import { focusCycleWithin } from '../lib/focusCycle'
import SetMenuSection from './SetMenuSection'
import MetasetsDialog from './MetasetsDialog'
import ClearTagsConfirmDialog from './dialogs/ClearTagsConfirmDialog'
import { useMetasetsDialog } from '../hooks/useMetasetsDialog'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { useSlotMetrics } from '../hooks/useSlotMetrics'
import type { HistoryPreview, DescribeNextChangeFn, HistoryTimelineEntry } from '../hooks/useSfcHistory'
import {
  normalizeExportModeFields,
  resolveAutoRarityCode,
  baseMinForStarV,
  starForRankCode,
  rollLevelsForRarityCode,
  rarityIncludesMythical,
  engineAppliedTargetValue,
  resolveRollTargetValue,
  targetValueStepForVariant,
  type BuilderRecipe,
  type SubstatTargetTable,
  type SellfileExportMode,
  type Star,
  type SubstatRollTargets,
  type SubstatRollTargetEntry,
} from '../lib/hsfBuilder'
import {
  canEnableSubstatFlex,
  countPositiveSubstats,
  deriveRollBaselineMode,
  isMilestoneThresholdsActive,
  normalizeRecipeKeepState,
  normalizeLevelWindow,
  normalizeSlotsOverrideFaction,
  pruneSubstatDependents,
} from '../lib/recipeNormalization'
import { pickAutoRaritySupplementsThreshold } from '../lib/raritySupplements'
import {
  aggregateRollStateFromRecipe,
  aggregateRollStateToRecipe,
  applyAggregateRollAction,
  clampAggregateRollValue,
  normalizeAggregateRollState as normalizeAggregateRollStateHelper,
  type AggregateRollAction,
  type AggregateRollState,
} from '../lib/aggregateRollState'
import { type Metaset, metasetGlyph, orderMetasets } from '../lib/metasets'
import type { ArtifactSetSelectionEntry } from '../lib/gearSets/selection'
import { buildArtifactSetSelectionKey, formatArtifactSetSelectionLabel, normalizeArtifactSetSelections, pruneAccessoryNoSetSelections, pruneImplicitAnyExclusions, splitArtifactSetSelections } from '../lib/gearSets/selection'
import { isAccessorySlot } from '../lib/gearInspectorDomain'
import { getMainStatOptionsForSlots } from './keepOverrides/keepOverrideRuleUtils'
import { resolveAllowedSubstatsForSlotsAndMains, retainAllowedSubstats } from '../lib/statCompatibility'
// Accessory-only substat rows + the decimal-target gating.
import {
  ANOMALOUS_SUBSTAT_VARIANTS_ROW_MINUS,
  ANOMALOUS_SUBSTAT_VARIANTS_ROW_PLUS,
  includesAnomalousSubstatVariant,
  isAnomalousSubstatVariant,
} from '../lib/anomalousAccessories'
import { useKeepOverrideCombinationTools } from './keepOverrides/useKeepOverrideCombinationTools'

import { Box, Button, Collapse, Divider, Slider, Stack, Typography, TextField, Chip, FormControl, Select, MenuItem, ListSubheader, InputAdornment, Menu, Badge } from '@mui/material'
import SetsOrderControls from './SetsOrderControls'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import MarkdownTooltip from './MarkdownTooltip'
import WorkloadProgressIndicator from './WorkloadProgressIndicator'
import InlineSelectClearButton from './InlineSelectClearButton'
import SelectDropdownActivator from './SelectDropdownActivator'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { SubstatToggleDisplay, substatToggleGroupSx, mainStatToggleGroupSx } from './SubstatToggleDisplay'
import { resolveSubstatChipPalette, SUBSTAT_CHIP_BORDER_RADIUS_PX } from './RuleSubstatChips'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ClearIconButton, { CLEAR_BUTTON_STRUT_SX } from './ClearIconButton'
import { ColorField } from './ColorField'
import { UI_BG_HOVER_DANGER_TRANSITION, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, BUILDER_STATUS_CHIP_HEIGHT_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, BUILDER_USER_DEFAULTS_KEY, BUILDER_DEFAULT_SAVE_TARGET, BUILDER_DIRTY_NUDGE_IDLE_MS, BUILDER_DIRTY_ATTENTION_INTERVAL_MS, FONT_SIZE_BASE_PX, ELLIPSIS_TEXT_SX, COMPACT_HEADER_ACTION_BUTTON_SX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX, SMALL_BUTTON_HEIGHT_PX, SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX, SETS_SELECT_INLINE_GUTTER_PX, CLEAR_ICON_BUTTON_SIZE_PX, MENU_LABEL_WIDTH_PX, MENU_CONTROL_HEIGHT_PX, HISTORY_TOOLTIP_MAX_WIDTH_PX, BUILDER_AUTO_APPLY_DEBOUNCE_MS, BUILDER_LABEL_TEXT_SX, BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX, BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX, BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX, BUILDER_AUTO_TOGGLE_WIDTH_PX, builderSectionLabelSx } from '../lib/constants'
import { useAttentionEffectStyles, useFortyTwoLegendaryOverlay } from '../lib/attentionEffects'
import { buildWarningBadgeBase, warningBadgeSx } from '../lib/badgeStyles'
import { alpha, useTheme, useColorScheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { anomalousSubstatTooltipMarkdown, substatSupportsColor } from '../lib/substatDisplay'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { FactionOptionLabel } from './FactionIcon'
import { resolveRecipeOverridesEffectiveRecipe, type RecipeOverridesInstructions } from '../lib/noteRecipeOverrides'
import {
  type MultiEditDraftHandle,

  type MultiEditArrayPatch,
  type MultiEditRollPatch,
  type MultiEditRollPatchEntry,
  type MultiEditTargetPatch,
  applyMultiEditFieldsToRecipe,
  getDirtyBuilderFieldKeys,
} from '../lib/recipeMultiEditDraft'
import { mergeTagList, normalizeTagValue, summarizeTagPresence } from '../lib/tagHelpers'
import { BuilderTagChipStrip, BuilderTagChipList } from './BuilderTagChips'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSetsOrderPreference } from '../state/setsOrderPreference'
import { useShowTagsChipsPreference, useBuilderRecipeCollapsedPreference, isAnySubstatSectionExpanded } from '../state/builderPreferences'
import { useBuilderPanelPrefs } from './builderPanel/useBuilderPanelPrefs'
import BuilderSectionHeader from './BuilderSectionToggle'
import { HistoryContextMenu } from './HistoryContextMenu'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from './NumberSpinnerAdornment'
import { createFactoryBuilderDefaults } from './builderPanel/defaults'
import {
  applyArtifactSetPatchPreview,
  applyArrayPatchCount,
  applyNumberPatchPreview,
  applyStringPatchPreview,
  computeArtifactSetPatchToggle,
  computeArtifactSetExclusionToggle,
  resolveSetTriState,
  resolveSetExclusionTriState,
  resolveMetasetTriState,
  computeNumberPatchToggle,
  computeStringPatchToggle,
  deriveBaseTriState,
  type TriStateBase,
  type SetTriState,
  mergeRollPatchForVariant,
  mergeTargetPatchForVariant,
  toTriStateBase,
} from './builderPanel/recipeMultiEditHelpers'
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
import { useMultiEditSummary } from './builderPanel/useRecipeMultiEditSummary'
import { useBuilderPanelActionMenus } from './builderPanel/useBuilderPanelActionMenus'
import { MenuToggleRow } from './MenuToggleRow'
import {
  computeRollBudgetForRecipe,
  EMPTY_SELECTION,
  LOCK_MENU_BORDER_RADIUS_PX,
  LOCK_MENU_BUTTON_WIDTH_PX,
  LOCK_MENU_GAP_PX,
  LOCK_MENU_OFFSET_PX,
  LOCK_TOGGLE_HIT_SIZE_PX,
  MAX_RECIPE_INDEX_FOR_BUTTON_WIDTH,
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
  separatorDisabledSectionSx,
} from './builderPanel/constants'
import { SeparatorToggleButton } from './SeparatorToggleButton'
import { TINT } from '../lib/colorTints'

export { createFactoryBuilderDefaults } from './builderPanel/defaults'

export default function BuilderPanel({ recipe, onChange, onAddToCustom, editingIndex, onUpdateSelected, registerAutoApplyHandler, onApplyMultiEdit, onUndo, onRedo, canUndo, canRedo, undoPreview, redoPreview, historyTimeline, onJumpToHistoryIndex, onRequestClearHistory, metasets, onMetasetsChange, describeNextChange, onDeleteMetaset, onMetasetRenamed, onResetMetasets, substatTargets, setUsageCounts, metasetUsageCounts, safeguardMetasetUsageCounts, substatColors: _substatColors, recipeCount: _recipeCount, recipeRuleCounts, recipesExcludedByTotalLimit, countRulesForRecipes, selectedIsDirty, insertHiddenByFilters, saveHiddenByFilters, onSelectRecipesByMetaset, onSelectSafeguardsByMetaset, recipeOverridesInstructions, multiEdit: _multiEdit = null, multiSelectedRecipes = null, onBeforeMetasetsDialogClose, onRegisterOpenMetasetsDialog }: {
  recipe: BuilderRecipe,
  onChange: (c: BuilderRecipe) => void
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
  onMetasetRenamed: (previousName: string, nextName: string) => void
  onResetMetasets: (mode: 'delete' | 'replaceSets' | 'replaceMeta', replacementMetaId?: string) => void
  substatTargets: SubstatTargetTable
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  safeguardMetasetUsageCounts: Record<string, number>
  substatColors: Record<number, { fg: string; bg: string }>
  recipeCount: number
  recipeRuleCounts: ReadonlyMap<number, number>
  recipesExcludedByTotalLimit: ReadonlySet<number>
  countRulesForRecipes: (params: { recipes: readonly BuilderRecipe[]; substatTargets: SubstatTargetTable }, options?: { signal?: AbortSignal }) => Promise<number[]>
  selectedIsDirty: boolean
  // Flag Insert/Apply actions that will not appear under "Preview recipes".
  insertHiddenByFilters: boolean
  saveHiddenByFilters: boolean
  // Select all recipes/safeguards that reference a given metaset ID (used from Metasets dialog chips)
  onSelectRecipesByMetaset: (id: string) => void
  onSelectSafeguardsByMetaset: (id: string) => void
  recipeOverridesInstructions: RecipeOverridesInstructions
  multiEdit?: MultiEditDraftHandle | null
  multiSelectedRecipes?: readonly BuilderRecipe[] | null
  onBeforeMetasetsDialogClose?: () => Promise<void> | void
  /** Optional registration callback: receives openMetaDlg so sibling panels can share the dialog. */
  onRegisterOpenMetasetsDialog?: (opener: () => void) => void
}) {
  const { resolveAllowedSetPool } = useKeepOverrideCombinationTools(metasets)
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
  const multiNameField = multiFields?.appearanceName ?? null
  const multiFgColorField = multiFields?.appearanceFgColor ?? null
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
  const multiSourceRecipes = multiEditActive && multiSelectedRecipes && multiSelectedRecipes.length >= 2
    ? multiSelectedRecipes
    : null
  const multiDirtyKeys = React.useMemo(() => (
    multiEditActive && multiFields ? getDirtyBuilderFieldKeys(multiFields) : []
  ), [multiEditActive, multiFields])
  const multiProjectedRecipes = React.useMemo<readonly BuilderRecipe[] | null>(() => {
    if (!multiEditActive || !multiSourceRecipes || !multiFields) return null
    if (multiDirtyKeys.length === 0) return multiSourceRecipes
    let changed = false
    const projected = multiSourceRecipes.map((source) => {
      const next = applyMultiEditFieldsToRecipe(source, multiFields, multiDirtyKeys)
      if (next !== source) changed = true
      return next
    })
    return changed ? projected : multiSourceRecipes
  }, [multiDirtyKeys, multiEditActive, multiFields, multiSourceRecipes])
  const aggregateRollRecipes = React.useMemo<readonly BuilderRecipe[]>(() => {
    // Prefer projected recipes while staging multi-edit changes so the toggles mirror the preview.
    if (multiEditActive) {
      const staged = (multiProjectedRecipes && multiProjectedRecipes.length > 0)
        ? multiProjectedRecipes
        : (multiSourceRecipes ?? [])
      if (staged.length > 0) return staged
    }
    // Fall back to the live recipe when multi-edit is inactive.
    return [recipe]
  }, [recipe, multiEditActive, multiProjectedRecipes, multiSourceRecipes])
  const aggregateRollSnapshots = React.useMemo(() => (
    aggregateRollRecipes.map((recipe) => ({
      // Auto mode uses `false` as the opt-out flag, so everything else is considered manual.
      auto: recipe.autoMinRequiredRolls !== false,
      manual: clampAggregateRollValue(Number(recipe.minRequiredRolls ?? 0)),
      locked: clampAggregateRollValue(Number(recipe.lockedMinRequiredRolls ?? 0)),
    }))
  ), [aggregateRollRecipes])
  const lockedSubstatsExist = React.useMemo(() => (
    aggregateRollRecipes.some((recipe) => {
      const locked = (recipe as { fixedSubstatsV?: number[] }).fixedSubstatsV
      return Array.isArray(locked) && locked.length > 0
    })
  ), [aggregateRollRecipes])
  const normalizeKeepWithAuto = React.useCallback((next: BuilderRecipe): BuilderRecipe => {
    // Compute the WASM-derived threshold before delegating to the WASM-free pipeline.
    const fallback = pickAutoRaritySupplementsThreshold(next)
    return normalizeRecipeKeepState(next, { defaultThreshold: fallback })
  }, [])
  const commitRollState = React.useCallback((nextState: AggregateRollState) => {
    onChange(normalizeKeepWithAuto({
      ...recipe,
      ...aggregateRollStateToRecipe(nextState),
    }))
  }, [recipe, normalizeKeepWithAuto, onChange])

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
      const baseState = readMultiRollState() ?? aggregateRollStateFromRecipe(recipe)
      commitMultiRollState(applyAggregateRollAction(baseState, action))
      return
    }
    const currentState = aggregateRollStateFromRecipe(recipe)
    commitRollState(applyAggregateRollAction(currentState, action))
  }, [recipe, commitMultiRollState, commitRollState, multiEdit, multiEditActive, readMultiRollState])

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
  const prevMap = (recipe.substatRollBoundsV ?? {}) as Record<number, SubstatRollBoundsEntry>
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
  const normalizedBounds: BuilderRecipe['substatRollBoundsV'] = nextMap
    ? nextMap
    : ({} as BuilderRecipe['substatRollBoundsV'])
  let baseRecipe = {
    ...recipe,
    substatRollBoundsV: normalizedBounds,
  } as BuilderRecipe
  // Bounds changes can flip a substat between positive and "not"; re-sync minCount so
  // autoMinCount always reflects the current positive-substat count.
  if (baseRecipe.autoMinCount) {
    const positiveCount = countPositiveSubstats(baseRecipe.substatsV, normalizedBounds as Record<number, { not?: boolean }>)
    baseRecipe = { ...baseRecipe, minCount: Math.min(4, Math.max(0, positiveCount)) as 0 | 1 | 2 | 3 | 4 }
  }
  onChange(normalizeKeepWithAuto(baseRecipe))
}, [recipe, normalizeKeepWithAuto, onChange])
const applySingleSubstatTargets = React.useCallback((variant: number, builder: (current: SubstatRollTargetEntry | undefined) => SubstatRollTargetEntry | null) => {
  const prevMap = (recipe.substatRollTargetsV ?? {}) as SubstatRollTargets
  const prevRaw = prevMap[variant]
  const nextRaw = builder(prevRaw ? {
    ...(typeof prevRaw.base === 'number' ? { base: prevRaw.base } : {}),
    ...(Array.isArray(prevRaw.increments) ? { increments: [...prevRaw.increments] } : {}),
  } : undefined)
  const nextNormalized = normalizeRollTargetEntry(nextRaw, Number(variant))
  if (targetEntriesEqual(prevRaw, nextNormalized, Number(variant))) return
  let nextMap: SubstatRollTargets | undefined
  if (!nextNormalized) {
    if (prevRaw === undefined) return
    const { [variant]: _omit, ...rest } = prevMap
    nextMap = Object.keys(rest).length > 0 ? rest : undefined
  } else {
    nextMap = { ...prevMap, [variant]: nextNormalized }
  }
  const normalizedTargets: BuilderRecipe['substatRollTargetsV'] = nextMap
    ? nextMap
    : ({} as SubstatRollTargets)
  const baseRecipe = {
    ...recipe,
    substatRollTargetsV: normalizedTargets,
  } as BuilderRecipe
  onChange(normalizeKeepWithAuto(baseRecipe))
}, [recipe, normalizeKeepWithAuto, onChange])
const [substatMenu, setSubstatMenu] = React.useState<{ variant: StatVariant; anchor: { x: number; y: number } } | null>(null)
const [substatMenuDraft, setSubstatMenuDraft] = React.useState<SubstatMenuDraftState | null>(null)
// Focused target-input raw text ("base" or "roll:<idx>") so intermediate decimal
// input ("1.", "1.2") survives the controlled re-render; blur drops back to numbers.
// Needed since target values accept 2-decimal precision (anomalous 1.25% bases).
const [substatMenuTargetText, setSubstatMenuTargetText] = React.useState<{ key: string; text: string } | null>(null)
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
// Substat hint — disabled while the context menu is open so the overlay doesn't compete.
const substatHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderSubstats, {
  enabled: !substatMenu,
  text: t('contextMenuHint'),
})
const [interactiveHoverVariant, setInteractiveHoverVariant] = React.useState<StatVariant | null>(null)
const canFlexSubstats = canEnableSubstatFlex(recipe)
const milestoneThresholdsActive = isMilestoneThresholdsActive(recipe)
const multiSummary = useMultiEditSummary(multiEditActive, multiSourceRecipes)
  // Delegates to applyArrayPatchCount (shared SSOT in recipeMultiEditHelpers) so the
  // patch-application logic lives in exactly one place across recipe and safeguard panels.
  const resolveTokenPresence = React.useCallback((token: number, baseCount: number, patch: MultiEditArrayPatch<number> | null | undefined): number => {
    if (!multiSummary) return baseCount
    return applyArrayPatchCount(baseCount, multiSummary.total, patch, token)
  }, [multiSummary])
  const mainStatsPatch = (multiMainStatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const resolveMainStatTriState = (variant: number): 'all' | 'none' | 'mixed' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray(recipe.mainStatsV) ? recipe.mainStatsV.includes(variant) : false
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
    const baseArray = Array.isArray(recipe.mainStatsV) ? recipe.mainStatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('mainStatsV', {
      value: preview as BuilderRecipe['mainStatsV'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }
  const clearMainSelection = () => {
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('mainStatsV', {
        value: (multiMainStatsField?.value as BuilderRecipe['mainStatsV']) ?? (recipe.mainStatsV ?? []),
        status: 'common',
        patch: { clear: true },
      })
    } else {
      onChange({ ...recipe, mainStatsV: [] })
    }
  }
  const substatsPatch = (multiSubstatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const fixedSubstatsPatch = (multiFixedSubstatsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const rollPatch = (multiRollField?.patch as MultiEditRollPatch | null | undefined) ?? null
  const getSubstatPresenceCount = React.useCallback((variant: number): number => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray((recipe as { substatsV?: number[] }).substatsV)
        ? ((recipe as { substatsV?: number[] }).substatsV as number[]).includes(variant)
        : false
      return selected ? 1 : 0
    }
    const base = multiSummary.subCounts.get(variant)?.present ?? 0
    return resolveTokenPresence(variant, base, substatsPatch)
  }, [recipe, multiEditActive, multiSummary, resolveTokenPresence, substatsPatch])
  const getSubstatPresence = React.useCallback((variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray((recipe as { substatsV?: number[] }).substatsV)
        ? ((recipe as { substatsV?: number[] }).substatsV as number[]).includes(variant)
        : false
      return selected ? 'all' : 'none'
    }
    const finalCount = getSubstatPresenceCount(variant)
    if (finalCount === 0) return 'none'
    if (finalCount === multiSummary.total) return 'all'
    return 'partial'
  }, [recipe, getSubstatPresenceCount, multiEditActive, multiSummary])
  const getSubstatLockCount = React.useCallback((variant: number): number => {
    if (!multiEditActive || !multiSummary) {
      const locked = Array.isArray((recipe as { fixedSubstatsV?: number[] }).fixedSubstatsV)
        ? ((recipe as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).includes(variant)
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
  }, [recipe, fixedSubstatsPatch, getSubstatPresenceCount, multiEditActive, multiSummary])
  const getSubstatLockState = React.useCallback((variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const locked = Array.isArray((recipe as { fixedSubstatsV?: number[] }).fixedSubstatsV)
        ? ((recipe as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).includes(variant)
        : false
      return locked ? 'all' : 'none'
    }
    const presenceCount = getSubstatPresenceCount(variant)
    if (presenceCount === 0) return 'none'
    const lockedCount = getSubstatLockCount(variant)
    if (lockedCount === 0) return 'none'
    if (lockedCount === presenceCount) return 'all'
    return 'partial'
  }, [recipe, getSubstatLockCount, getSubstatPresenceCount, multiEditActive, multiSummary])
  type RollMode =
    | { kind: 'none'; presence: number }
    | { kind: 'any'; presence: number }
    | { kind: 'min'; presence: number; min: number; max?: number }
    | { kind: 'max'; presence: number; max: number; min?: number }
    | { kind: 'not'; presence: number }
    | { kind: 'mixed'; presence: number; wildcardCount: number; minValues: number[]; maxValues: number[] }
  const getRollMode = React.useCallback((variant: number): RollMode => {
    const boundsForSingle = (key: number) => (recipe.substatRollBoundsV ?? {})[key]
    if (!multiEditActive || !multiSummary) {
      const hasStat = Array.isArray(recipe.substatsV) ? recipe.substatsV.includes(variant) : false
      if (!hasStat) return { kind: 'none', presence: hasStat ? 1 : 0 }
      const bounds = boundsForSingle(variant)
      if (bounds?.not === true) return { kind: 'not', presence: 1 }
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
    let notCount = base?.notCount ?? 0
    let minValues = new Set(base?.minValues ?? [])
    let maxValues = new Set(base?.maxValues ?? [])
    const patchEntry = rollPatch?.[variant]
    if (patchEntry) {
      if (patchEntry.not !== undefined) {
        if (patchEntry.not) {
          notCount = presenceCount
          anyCount = 0
          minValues = new Set<number>()
          maxValues = new Set<number>()
        } else {
          notCount = 0
        }
      }
      if (patchEntry.any !== undefined) {
        if (patchEntry.any) {
          anyCount = presenceCount
          notCount = 0
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
          notCount = 0
        }
      }
      if (patchEntry.max !== undefined) {
        if (patchEntry.max == null) {
          maxValues = new Set<number>()
        } else {
          const clamped = Math.max(0, Math.min(4, Number(patchEntry.max)))
          maxValues = new Set<number>([clamped])
          anyCount = 0
          notCount = 0
        }
      }
    }
    anyCount = Math.min(anyCount, presenceCount)
    notCount = Math.min(notCount, presenceCount)
    // All recipes agree on "not" — return the not kind.
    if (notCount === presenceCount && anyCount === 0 && minValues.size === 0 && maxValues.size === 0) {
      return { kind: 'not', presence: presenceCount }
    }
    if (anyCount === presenceCount && notCount === 0 && minValues.size === 0 && maxValues.size === 0) {
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
    if (notCount > 0 && notCount < presenceCount) {
      mixed = true
    }
    if (anyCount > 0 && (minArray.length > 0 || maxArray.length > 0 || notCount > 0)) {
      mixed = true
    }
    if (notCount > 0 && (minArray.length > 0 || maxArray.length > 0 || anyCount > 0)) {
      mixed = true
    }
    if (minArray.length > 1 || maxArray.length > 1) {
      mixed = true
    }
    if (minArray.length === 0 && maxArray.length === 0 && anyCount === 0 && notCount === 0) {
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
  }, [recipe.substatRollBoundsV, recipe.substatsV, getSubstatPresenceCount, multiEditActive, multiSummary, rollPatch])
  const commitRollPatch = React.useCallback((variant: number, entry: MultiEditRollPatchEntry) => {
    if (!multiEditActive || !multiEdit) return
    const mergedPatch = mergeRollPatchForVariant(
      (multiRollField?.patch as MultiEditRollPatch | null | undefined) ?? null,
      variant,
      entry,
    )
    multiEdit.updateField('substatRollBoundsV', {
      value: (multiRollField?.value as BuilderRecipe['substatRollBoundsV']) ?? (recipe.substatRollBoundsV ?? {}),
      status: 'common',
      patch: mergedPatch ?? null,
    })
  }, [recipe.substatRollBoundsV, multiEdit, multiEditActive, multiRollField?.patch, multiRollField?.value])
  const commitTargetPatch = React.useCallback((variant: number, entry: SubstatRollTargetEntry | null) => {
    if (!multiEditActive || !multiEdit) return
    const mergedPatch = mergeTargetPatchForVariant(
      (multiTargetField?.patch as MultiEditTargetPatch | null | undefined) ?? null,
      variant,
      entry,
    )
    multiEdit.updateField('substatRollTargetsV', {
      value: (multiTargetField?.value as BuilderRecipe['substatRollTargetsV']) ?? (recipe.substatRollTargetsV ?? {}),
      status: 'common',
      patch: mergedPatch ?? null,
    })
  }, [recipe.substatRollTargetsV, multiEdit, multiEditActive, multiTargetField?.patch, multiTargetField?.value])
  const deriveSubstatMenuInfo = React.useCallback((variant: StatVariant): SubstatMenuInfo | null => {
    const presenceState = multiEditActive
      ? getSubstatPresence(variant)
      : (Array.isArray(recipe.substatsV) && recipe.substatsV.includes(variant) ? 'all' : 'none')
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
        case 'not': {
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
      const bounds = (recipe.substatRollBoundsV ?? {})[variant]
      const isNotBound = bounds?.not === true
      if (!isNotBound && typeof bounds?.min === 'number') info.minValue = clampRollMin(bounds.min)
      if (!isNotBound && typeof bounds?.max === 'number') info.maxValue = clampRollMax(bounds.max)
      info.wildcard = !isNotBound && (Boolean(bounds?.any) || (info.minValue == null && info.maxValue == null))
      if (isNotBound) {
        info.rollKind = 'not'
      } else if (info.wildcard) {
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
  }, [recipe.substatRollBoundsV, recipe.substatsV, getRollMode, getSubstatLockState, getSubstatPresence, multiEditActive])
const resolveSubstatTargetEntry = React.useCallback((variant: StatVariant): SubstatRollTargetEntry | null => {
    if (!multiEditActive) {
      const raw = (recipe.substatRollTargetsV ?? {})[variant]
      return normalizeRollTargetEntry(raw, Number(variant))
    }
    const recipes = (() => {
      if (multiProjectedRecipes && multiProjectedRecipes.length > 0) return multiProjectedRecipes
      if (multiSourceRecipes && multiSourceRecipes.length > 0) return multiSourceRecipes
      return []
    })()
    if (recipes.length === 0) return null
    let baseline: SubstatRollTargetEntry | null | undefined
    for (const recipe of recipes) {
      const entry = normalizeRollTargetEntry((recipe.substatRollTargetsV ?? {})[variant], Number(variant))
      if (baseline === undefined) {
        baseline = entry ?? null
        continue
      }
      if (!targetEntriesEqual(baseline ?? null, entry ?? null, Number(variant))) {
        return null
      }
    }
    return baseline ?? null
  }, [recipe.substatRollTargetsV, multiEditActive, multiProjectedRecipes, multiSourceRecipes])
  const handleSubstatMenuClose = React.useCallback(() => {
    setSubstatMenu(null)
    setSubstatMenuDraft(null)
    // Drop any in-progress target text so the next open starts from stored values.
    setSubstatMenuTargetText(null)
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
  // Close the substat menu when the active menu info disappears — the React-blessed
  // "Storing information from previous renders" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // The setters below are guarded by an inequality check, so React skips the second render
  // when nothing changed. The lint rule does not distinguish this guarded render-time use
  // from unguarded setState-in-effect, so we disable it for the whole guarded block.
  const [prevActiveMenuInfo, setPrevActiveMenuInfo] = React.useState(activeMenuInfo)
  if (activeMenuInfo !== prevActiveMenuInfo) {
    /* eslint-disable @eslint-react/set-state-in-effect -- see block comment above */
    setPrevActiveMenuInfo(activeMenuInfo)
    if (substatMenu && !activeMenuInfo) {
      setSubstatMenu(null)
      setSubstatMenuDraft(null)
      resetSubstatMenuChipWidths()
    }
    /* eslint-enable @eslint-react/set-state-in-effect */
  }
  const menuOpen = Boolean(substatMenu && activeMenuInfo)
  const menuAnchor = substatMenu?.anchor ?? { x: 0, y: 0 }
  const chipWidth = Math.max(substatMenuChipWidths.min, substatMenuChipWidths.max)
  // Target fallback context: resolves the baseline substatTargets value for the
  // selected variant given the recipe's current rank window plus roll budget.
  // When multi-edit is active we disable overrides, so the fallback only applies
  // to single-recipe edits.
  const targetContext = React.useMemo(() => {
    if (!activeMenuInfo || multiEditActive) return null
    const starFallback = (substatTargets.anyRankDefaultsTo ?? 6) as Star
    const star = starForRankCode(Number(recipe.rankCode ?? 0), starFallback)
    const baseValue = Math.max(0, baseMinForStarV(Number(activeMenuInfo.variant), star, substatTargets))
    const rollBudget = computeRollBudgetForRecipe(recipe)
    return {
      baseValue,
      rollBudget,
      star,
      // The stat being edited — the engine-applied floor is per-variant (an
      // anomalous target floors to hundredths, a classic one to whole numbers).
      variant: Number(activeMenuInfo.variant),
    }
  }, [activeMenuInfo, recipe, substatTargets, multiEditActive])
  // Shared fallback when a specific roll override is blank. Keeps the UX honest
  // by previewing the same value that will be used when exporting the recipe.
  const resolveTargetFallbackValue = React.useCallback((rollIndex: number): number | null => {
    if (!targetContext) return null
    return resolveRollTargetValue(null, rollIndex, targetContext.baseValue, targetContext.variant)
  }, [targetContext])
  const formatTargetFallback = React.useCallback((rollIndex: number): string => {
    const fallbackValue = resolveTargetFallbackValue(rollIndex)
    if (fallbackValue == null) return ''
    // Already engine-applied by resolveRollTargetValue — render as-is.
    return `${fallbackValue}`
  }, [resolveTargetFallbackValue])
  const resolveComparableTargetValue = React.useCallback((rollIndex: number): number | null => {
    // Compare ENGINE-APPLIED values on both sides so a 2.5 draft never
    // false-positives the "target decreases" warning against a floored 2.
    if (!targetContext) return null
    const { variant } = targetContext
    if (rollIndex === 0) {
      if (typeof targetDraftBase === 'number' && Number.isFinite(targetDraftBase)) {
        return engineAppliedTargetValue(targetDraftBase, variant)
      }
      return resolveTargetFallbackValue(0)
    }
    const entry = targetDraftRolls[rollIndex - 1]
    if (typeof entry === 'number' && Number.isFinite(entry)) return engineAppliedTargetValue(entry, variant)
    return resolveTargetFallbackValue(rollIndex)
  }, [targetContext, targetDraftBase, targetDraftRolls, resolveTargetFallbackValue])
  // Close the substat menu on outside clicks to prevent stuck overlays.
  const { contextMenuGuard: substatMenuGuard } = useContextMenuPaperGuard({
    open: menuOpen,
    onClose: handleSubstatMenuClose,
    menuRef: substatMenuPaperRef,
  })
  // Shared helper: update fixedSubstatsV via multi-edit so every entry point (toggle, menu, etc.)
  // produces the same patch behavior without collapsing other stats' mixed states.
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
    const baseArray = Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('fixedSubstatsV', {
      value: preview as BuilderRecipe['fixedSubstatsV'],
      status: 'common',
      patch: nextPatch ?? null,
    })
    return true
  }, [
    recipe.fixedSubstatsV,
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
    const baseArray = Array.isArray(recipe.substatsV) ? recipe.substatsV : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('substatsV', {
      value: preview as BuilderRecipe['substatsV'],
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
    recipe.substatsV,
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
    // Scale (left→right): max:4 ← … ← max:0 ← ¬ ← ★ → min:0 → … → min:5
    // Left-click (forward) steps rightward; min:5 wraps back to ★.
    switch (mode.kind) {
      case 'none':
      case 'any':
      case 'mixed':
        commitRollPatch(variant, { any: false, not: null, min: 0, max: null })                           // ★ → min:0
        break
      case 'min':
        if (mode.min >= 5) commitRollPatch(variant, { any: true, not: null, min: null, max: null })      // min:5 → ★
        else commitRollPatch(variant, { any: false, min: Math.min(5, mode.min + 1), max: null })
        break
      case 'not':
        commitRollPatch(variant, { any: true, not: null, min: null, max: null })                         // ¬ → ★
        break
      case 'max':
        if (mode.max <= 0) commitRollPatch(variant, { any: false, not: true, min: null, max: null })     // max:0 → ¬
        else commitRollPatch(variant, { any: false, max: Math.max(0, mode.max - 1), min: null })         // max:n → max:(n-1)
        break
      default:
        break
    }
  }, [commitRollPatch, getRollMode, multiEdit, multiEditActive])
  const multiCycleRollBackward = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit) return
    const mode = getRollMode(variant)
    // Scale (left→right): max:4 ← … ← max:0 ← ¬ ← ★ → min:0 → … → min:5
    // Right-click (backward) steps leftward; max:4 wraps back to ★.
    switch (mode.kind) {
      case 'none':
      case 'any':
      case 'mixed':
        commitRollPatch(variant, { any: false, not: true, min: null, max: null })                        // ★ → ¬
        break
      case 'not':
        commitRollPatch(variant, { any: false, not: null, max: 0, min: null })                           // ¬ → max:0
        break
      case 'max':
        if (mode.max >= 4) commitRollPatch(variant, { any: true, not: null, min: null, max: null })      // max:4 → ★
        else commitRollPatch(variant, { any: false, max: Math.min(4, mode.max + 1), min: null })         // max:n → max:(n+1)
        break
      case 'min':
        if (mode.min <= 0) commitRollPatch(variant, { any: true, not: null, min: null, max: null })      // min:0 → ★
        else commitRollPatch(variant, { any: false, min: Math.max(0, mode.min - 1), max: null })         // min:n → min:(n-1)
        break
      default:
        break
    }
  }, [commitRollPatch, getRollMode, multiEdit, multiEditActive])
  const slotsPatch = (multiSlotsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const getSlotState = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray(recipe.artifactTypes) ? recipe.artifactTypes.includes(id) : false
      return selected ? 'all' : 'none'
    }
    const base = multiSummary.slotCounts.get(id) ?? 0
    const final = resolveTokenPresence(id, base, slotsPatch)
    if (final === 0) return 'none'
    if (final === multiSummary.total) return 'all'
    return 'partial'
  }, [recipe.artifactTypes, multiEditActive, multiSummary, resolveTokenPresence, slotsPatch])
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
    const baseArray = Array.isArray(recipe.artifactTypes) ? recipe.artifactTypes : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactTypes', {
      value: preview as BuilderRecipe['artifactTypes'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [recipe.artifactTypes, getSlotState, multiEdit, multiEditActive, multiSlotsField?.patch])
  // Slot-based filtering: compute allowed options for main stats, substats, and sets.
  const slotSelection = recipe.artifactTypes ?? []
  // Section dirty flags: shared by label color and X-clear button visibility (SSOT).
  const slotSectionDirty = slotSelection.length > 0
  const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
  // Prune mainstats no longer valid for the selected slots (single-edit only).
  const sanitizedMainStats = multiEditActive
    ? (recipe.mainStatsV ?? [])
    : (recipe.mainStatsV ?? []).filter((v) => mainStatOptions.includes(Number(v)))
  const mainStatSectionDirty = sanitizedMainStats.length > 0
  // Feed pruned mains into substat constraint so disabled mainstats don't widen the substat pool.
  const allowedSubstatOptions = resolveAllowedSubstatsForSlotsAndMains({
    slots: slotSelection,
    mainStats: sanitizedMainStats,
  })
  // Prune recipe substats that conflict with the updated slot/main scope (single-edit only).
  const sanitizedSubstatsV = multiEditActive
    ? (recipe.substatsV ?? [])
    : retainAllowedSubstats(recipe.substatsV ?? [], (v) => v, {
        slots: slotSelection,
        mainStats: sanitizedMainStats,
      })
  const substatSectionDirty = sanitizedSubstatsV.length > 0
  // Split the same selection by family so each chevron reports only its own half:
  // each half highlights its own label when collapsed while holding a selection.
  const anomalousSubstatSectionDirty = includesAnomalousSubstatVariant(sanitizedSubstatsV)
  const setsSectionDirty = (recipe.artifactSets ?? []).length > 0 || (recipe.artifactMetaSets ?? []).length > 0
  // rank/rarity/faction: non-default when anything other than "any" is selected.
  const levelSectionDirty = (recipe.minLevel ?? 0) !== 0 || (recipe.maxLevel ?? 16) !== 16
  const rankSectionDirty = (recipe.rankCode ?? 0) !== 0
  // The factory default is rarityMode 'auto' (see createFactoryBuilderDefaults), so the section is
  // non-default whenever it leaves Auto — any explicit code mode, including Any/0. Clearing returns to Auto.
  const raritySectionDirty = (recipe.rarityMode ?? 'auto') !== 'auto'
  // In multi-edit, disable artifact only when ALL selected recipes share the same non-zero
  // faction (status='common', value≠0). Mixed (some Any, some N) → keep artifact enabled.
  const factionSectionDirty = multiEditActive && multiFactionField != null
    ? multiFactionField.status === 'common' && (multiFactionField.value as number ?? 0) !== 0
    : (recipe.factionCode ?? 0) !== 0
  // Faction is irrelevant for artifact pieces; disable it whenever any artifact slot is selected.
  const hasArtifactSlot = (recipe.artifactTypes ?? []).some((s) => !isAccessorySlot(s))
  // minRollsSectionDirty: also fires when auto mode is turned off (even with value 0),
  // since hasManualAggregateMin inside milestoneThresholdsActive requires value > 0.
  const minRollsSectionDirty = recipe.autoMinRequiredRolls === false || milestoneThresholdsActive
  const requiredSubstatsSectionDirty =
    recipe.autoMinCount === false ||
    (recipe.minCount ?? 0) > 0 ||
    (recipe.fixedSubstatsV ?? []).length > 0
  // milestoneThresholds section only controls earlyKeepMode; default is 'early'.
  const milestoneThresholdsSectionDirty = (recipe.earlyKeepMode ?? 'early') !== 'early'
  const allowedSetPool = resolveAllowedSetPool(slotSelection)
  // Accessory-only sets (like no-set) appear only when the resolved pool includes them.
  const allowNoSet = (allowedSetPool as readonly number[]).includes(ACCESSORY_NO_SET_ID)
  // Prune accessory no-set selections at render time when constraints change.
  const sanitizedSets = React.useMemo(
    () => multiEditActive ? (recipe.artifactSets ?? []) : pruneAccessoryNoSetSelections(recipe.artifactSets ?? [], allowNoSet),
    [recipe.artifactSets, allowNoSet, multiEditActive],
  )
  const sanitizedSetKey = buildArtifactSetSelectionKey(sanitizedSets)
  const rawSetKey = buildArtifactSetSelectionKey(recipe.artifactSets ?? [])
  const [prevSanitizedSetKey, setPrevSanitizedSetKey] = React.useState(sanitizedSetKey)
  if (sanitizedSetKey !== prevSanitizedSetKey) {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- guarded render-time state adjustment, see substat-menu block above for full rationale
    setPrevSanitizedSetKey(sanitizedSetKey)
    // Notify the parent only when pruning actually changed the selection.
    if (rawSetKey !== sanitizedSetKey) {
      onChange({ ...recipe, artifactSets: sanitizedSets })
    }
  }
  // Prune invalid main-stat and substat selections when constraints tighten.
  const sanitizedMainStatsKey = sanitizedMainStats.map(Number).sort((a, b) => a - b).join(',')
  const rawMainStatsKey = (recipe.mainStatsV ?? []).map(Number).sort((a, b) => a - b).join(',')
  const sanitizedSubstatsKey = sanitizedSubstatsV.map(Number).join(',')
  const rawSubstatsKey = (recipe.substatsV ?? []).map(Number).join(',')
  const [prevSanitizedStatKeys, setPrevSanitizedStatKeys] = React.useState(
    `${sanitizedMainStatsKey}|${sanitizedSubstatsKey}`,
  )
  const nextStatKeys = `${sanitizedMainStatsKey}|${sanitizedSubstatsKey}`
  if (nextStatKeys !== prevSanitizedStatKeys) {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- guarded render-time state adjustment, see substat-menu block above for full rationale
    setPrevSanitizedStatKeys(nextStatKeys)
    const mainChanged = rawMainStatsKey !== sanitizedMainStatsKey
    const subChanged  = rawSubstatsKey  !== sanitizedSubstatsKey
    if (mainChanged || subChanged) {
      onChange({
        ...recipe,
        ...(mainChanged ? { mainStatsV: sanitizedMainStats } : {}),
        ...(subChanged ? { substatsV: sanitizedSubstatsV, ...pruneSubstatDependents(recipe, sanitizedSubstatsV) } : {}),
      })
    }
  }
  const setsPatch = (multiSetsField?.patch as MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined) ?? null
  const metasetsPatch = (multiMetasetsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
  // All three tri-state resolvers delegate to the shared SSOT helpers; only the
  // data sources (summary maps, staged patch, single-edit fallback) are panel-local.
  const triActive = multiEditActive && !!multiSummary
  const getSetState = React.useCallback((id: number): SetTriState => resolveSetTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.setCounts.get(id) ?? 0,
    patch: setsPatch,
    setId: id,
    singleEditIncluded: splitArtifactSetSelections(recipe.artifactSets).included.includes(id),
  }), [triActive, multiSummary, recipe.artifactSets, setsPatch])
  // Exclusion tri-state mirrors getSetState but reads the excluded baseline so
  // right-click "NOT" can toggle exclusion consistently across the selection.
  const getSetExclusionState = React.useCallback((id: number): SetTriState => resolveSetExclusionTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.excludedCounts.get(id) ?? 0,
    patch: setsPatch,
    setId: id,
    singleEditExcluded: splitArtifactSetSelections(recipe.artifactSets).excluded.includes(id),
  }), [triActive, multiSummary, recipe.artifactSets, setsPatch])
  const getMetasetState = React.useCallback((id: string): SetTriState => resolveMetasetTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.metaCounts.get(id) ?? 0,
    patch: metasetsPatch,
    name: id,
    singleEditSelected: Array.isArray(recipe.artifactMetaSets) ? recipe.artifactMetaSets.includes(id) : false,
  }), [triActive, multiSummary, recipe.artifactMetaSets, metasetsPatch])
  const getSetStateForScroll = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (multiEditActive) return getSetState(id)
    return splitArtifactSetSelections(recipe.artifactSets).included.includes(id) ? 'all' : 'none'
  }, [recipe.artifactSets, getSetState, multiEditActive])
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
    const baseArray = Array.isArray(recipe.artifactSets) ? recipe.artifactSets : []
    const preview = applyArtifactSetPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactSets', {
      value: preview as BuilderRecipe['artifactSets'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [recipe.artifactSets, getSetState, multiEdit, multiEditActive, multiSetsField?.patch])
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
    const baseArray = Array.isArray(recipe.artifactMetaSets) ? recipe.artifactMetaSets : []
    const preview = applyStringPatchPreview(baseArray, nextPatch)
    multiEdit.updateField('artifactMetaSets', {
      value: preview as BuilderRecipe['artifactMetaSets'],
      status: 'common',
      patch: nextPatch ?? undefined,
    })
  }, [recipe.artifactMetaSets, getMetasetState, multiEdit, multiEditActive, multiMetasetsField?.patch])
  const keepMixed = multiEditActive && (multiKeepField?.status === 'mixed')
  const exportModeMixed = multiEditActive && (multiExportModeField?.status === 'mixed')
  // Resolve recipe overrides for the active recipe.
  const effectiveRecipe = useMemo(
    () => resolveRecipeOverridesEffectiveRecipe(recipe, recipeOverridesInstructions),
    [recipe, recipeOverridesInstructions],
  )
  // Keep/Sell value: single-edit shows the override-resolved (effective) flag so an active
  // `action=…` override is reflected in the control, mirroring exportModeValue below.
  const keepValue: 'keep' | 'sell' | null = multiEditActive
    ? (keepMixed ? null : ((multiKeepField?.value as boolean | undefined) ? 'keep' : 'sell'))
    : (effectiveRecipe.keep ? 'keep' : 'sell')
  // True when a recipe override flips the stored Keep/Sell flag (distinct from the
  // keepOverrideActive timing field below). Drives the override badge on the Keep/Sell control.
  const keepBooleanOverrideActive = !multiEditActive && Boolean(effectiveRecipe.keep) !== Boolean(recipe.keep)
  // Read the effective export mode from the resolved recipe.
  const effectiveExportMode = effectiveRecipe.exportMode
  // Only mark an override when the recipe overrides flip the stored selection.
  const exportModeOverrideActive = !multiEditActive && effectiveExportMode !== recipe.exportMode
  // Track rank, rarity, and level overrides for UI indicators.
  const storedRarityMode: 'auto' | 'code' = (recipe.rarityMode ?? 'code')
  const effectiveRarityMode: 'auto' | 'code' = (effectiveRecipe.rarityMode ?? 'code')
  const rankOverrideActive = !multiEditActive && effectiveRecipe.rankCode !== recipe.rankCode
  const rarityOverrideActive = !multiEditActive && (
    effectiveRarityMode !== storedRarityMode
    || (effectiveRarityMode === 'code' && effectiveRecipe.rarityCode !== recipe.rarityCode)
  )
  const storedMinLevel = ((recipe as BuilderRecipe).minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
  const storedMaxLevel = ((recipe as BuilderRecipe).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
  const effectiveMinLevel = ((effectiveRecipe as BuilderRecipe).minLevel ?? LEVEL_MILESTONES[0]!) as LevelMilestone
  const effectiveMaxLevel = ((effectiveRecipe as BuilderRecipe).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!) as LevelMilestone
  const levelOverrideActive = !multiEditActive && (
    effectiveMinLevel !== storedMinLevel || effectiveMaxLevel !== storedMaxLevel
  )
  const keepOverrideActive = !multiEditActive && effectiveRecipe.earlyKeepMode !== recipe.earlyKeepMode
  // True when a recipe override changes the effective gear-set selection vs. the stored one.
  const setsOverrideActive = !multiEditActive && (
    buildArtifactSetSelectionKey(effectiveRecipe.artifactSets ?? []) !== buildArtifactSetSelectionKey(recipe.artifactSets ?? [])
    || (effectiveRecipe.artifactMetaSets ?? []).join('\0') !== (recipe.artifactMetaSets ?? []).join('\0')
  )
  // Separator drafts: only the name/color field and the ━ toggle stay interactive.
  // Every other control remains MOUNTED at factory defaults (stable layout when
  // switching chips) but disabled+dimmed via separatorDisabledSectionSx on the row
  // wrappers. Multi-edit is unaffected (the toggle is single-edit only).
  const isSeparatorDraft = !multiEditActive && recipe.exportMode === 'separator'
  const autoLateOverrideActive = !multiEditActive && (
    effectiveRecipe.autoRaritySupplementsThreshold !== recipe.autoRaritySupplementsThreshold
  )
  // True when a recipe override changes the effective min required rolls or auto/manual mode.
  const minRequiredRollsOverrideActive = !multiEditActive && (
    (effectiveRecipe.autoMinRequiredRolls ?? true) !== (recipe.autoMinRequiredRolls ?? true)
    || (effectiveRecipe.minRequiredRolls ?? 0) !== (recipe.minRequiredRolls ?? 0)
  )
  // True when a recipe override changes the effective required substat count or auto mode.
  const minCountOverrideActive = !multiEditActive && (
    Boolean(effectiveRecipe.autoMinCount) !== Boolean(recipe.autoMinCount)
    || (effectiveRecipe.minCount ?? 0) !== (recipe.minCount ?? 0)
  )
  // True when a recipe override changes which gear slots are selected.
  const slotsOverrideActive = !multiEditActive && (
    [...(effectiveRecipe.artifactTypes ?? [])].sort((a, b) => a - b).join(',') !==
    [...(recipe.artifactTypes ?? [])].sort((a, b) => a - b).join(',')
  )
  // True when a recipe override changes which substats are selected.
  const substatsVOverrideActive = !multiEditActive && (
    [...(effectiveRecipe.substatsV ?? [])].sort((a, b) => a - b).join(',') !==
    [...(recipe.substatsV ?? [])].sort((a, b) => a - b).join(',')
  )
  // Mirror the displayRecipe pattern: show effective slot selection when an override is active.
  const displayArtifactTypes = (!multiEditActive && slotsOverrideActive)
    ? (effectiveRecipe.artifactTypes ?? [])
    : (recipe.artifactTypes ?? [])
  // True when a recipe override changes the effective mainstat selection.
  const mainStatsVOverrideActive = !multiEditActive && (
    [...(effectiveRecipe.mainStatsV ?? [])].sort((a, b) => a - b).join(',') !==
    [...(recipe.mainStatsV ?? [])].sort((a, b) => a - b).join(',')
  )
  // Show effective mainstats and only enable buttons valid for effective slots.
  const displayMainStatsV = (!multiEditActive && mainStatsVOverrideActive)
    ? (effectiveRecipe.mainStatsV ?? [])
    : (recipe.mainStatsV ?? [])
  const displayMainStatOptions = getMainStatOptionsForSlots(displayArtifactTypes)
  // Prefer the recipe overrides-resolved mode for the single-recipe display.
  const exportModeValue: SellfileExportMode | null = multiEditActive
    ? (exportModeMixed ? null : (multiExportModeField?.value as SellfileExportMode | undefined ?? 'active'))
    : effectiveExportMode
  // Surface the stored selection when recipe overrides tags override the effective mode.
  const exportModeOverrideTarget = exportModeOverrideActive && recipe.exportMode !== 'separator'
    ? recipe.exportMode
    : null
  // Surface the stored Keep/Sell selection when a recipe override flips the effective flag.
  const keepActionOverrideTarget: 'keep' | 'sell' | null = keepBooleanOverrideActive
    ? (recipe.keep ? 'keep' : 'sell')
    : null
  // Override badges live on their individual controls inside each section's <Collapse>, so they
  // unmount when the section is collapsed. Collapsed sections intentionally show no override
  // marker on the chevron — the detail is only relevant while the user has the section expanded.
  // Localized Keep/Sell label for the override badge tooltip (in sync with the toggle text).
  const keepActionLabel = React.useCallback(
    (value: 'keep' | 'sell'): string => (value === 'keep' ? t('keepValueKeep') : t('keepValueSell')),
    [t],
  )
  // Map export modes to their localized labels for tooltip messaging.
  const exportModeLabel = React.useCallback((mode: SellfileExportMode): string => {
    // Keep the labels in sync with the toggle button text.
    if (mode === 'active') return t('builderExportModeActive')
    if (mode === 'disabled') return t('builderExportModeDisabled')
    return t('builderExportModeSeparator')
  }, [t])
  // Keep primary tooltips focused on control behavior; override details live on badges.
  const buildExportModeTooltip = React.useCallback((base: string): string => base, [])
  const buildOverrideTooltip = React.useCallback(
    (base: string): string => base,
    [],
  )
  // Keep badge tooltips short so the warning callouts stay readable.
  const buildRecipeOverridesBadgeTooltip = React.useCallback(
    (stored: string, effective: string): string => (
      t('builderRecipeOverridesOverrideBadgeTooltip', { stored, effective })
    ),
    [t],
  )
  // Render a warning badge anchored to a relative parent, with its own tooltip.
  const renderWarningBadgeOverlay = React.useCallback((tooltip: string) => (
    <MarkdownTooltip markdown={tooltip}>
      <Box
        component="span"
        sx={(theme) => ({
          position: 'absolute',
          top: -6,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          ...buildWarningBadgeBase(theme),
        })}
      >
        !
      </Box>
    </MarkdownTooltip>
  ), [])
  const rankMixed = multiEditActive && (multiRankField?.status === 'mixed')
  const rankValue = multiEditActive
    ? (rankMixed ? '' : String((multiRankField?.value as number | undefined) ?? recipe.rankCode))
    : String(effectiveRecipe.rankCode)
  const rarityMixed = multiEditActive && (
    (multiRarityModeField?.status === 'mixed')
    || (multiRarityCodeField?.status === 'mixed')
  )
  const rarityValue = multiEditActive
    ? (rarityMixed
      ? ''
      : ((multiRarityModeField?.value as BuilderRecipe['rarityMode'] | undefined) === 'auto'
        ? 'auto'
        : String((multiRarityCodeField?.value as number | undefined) ?? recipe.rarityCode)))
    : (effectiveRarityMode === 'auto' ? 'auto' : String(effectiveRecipe.rarityCode))
  const factionMixed = multiEditActive && (multiFactionField?.status === 'mixed')
  const factionValue = multiEditActive
    ? (factionMixed ? '' : String((multiFactionField?.value as number | undefined) ?? recipe.factionCode ?? 0))
    : String(recipe.factionCode ?? 0)
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
  const computeTriState = React.useCallback((matches: number, total: number): 'on' | 'mixed' | 'off' => {
    if (matches <= 0) return 'off'
    if (matches >= total) return 'on'
    return 'mixed'
  }, [])
  const getMinRequiredRollsTriState = React.useCallback((target: 'auto' | 0 | 1 | 2 | 3 | 4 | 5): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !multiSourceRecipes) {
      // Use effectiveRecipe so recipe overrides are reflected in the button selection state.
      const auto = effectiveRecipe.autoMinRequiredRolls !== false
      if (target === 'auto') return auto ? 'on' : 'off'
      if (auto) return 'off'
      const manual = clampAggregateRollValue(Number(effectiveRecipe.minRequiredRolls ?? 0))
      if (target === 0) {
        const locked = clampAggregateRollValue(Number(effectiveRecipe.lockedMinRequiredRolls ?? 0))
        return (manual === 0 && locked === 0) ? 'on' : 'off'
      }
      return manual === target ? 'on' : 'off'
    }
    const total = aggregateRollSnapshots.length
    if (total <= 0) return 'off'
    if (target === 'auto') {
      // Auto state is simply the count of recipes that have not opted into manual mode.
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
  }, [effectiveRecipe, multiEditActive, multiSourceRecipes, aggregateRollSnapshots, computeTriState])
  const getLockedMinRequiredRollsTriState = React.useCallback((target: 0 | 1 | 2 | 3 | 4 | 5): 'on' | 'mixed' | 'off' => {
    if (target === 0) return 'off'
    if (!lockedSubstatsExist) return 'off'
    if (!multiEditActive || !multiSourceRecipes) {
      // Use effectiveRecipe so recipe overrides are reflected in the button selection state.
      const locked = clampAggregateRollValue(Number(effectiveRecipe.lockedMinRequiredRolls ?? 0))
      return locked === target ? 'on' : 'off'
    }
    const total = aggregateRollSnapshots.length
    if (total <= 0) return 'off'
    let matches = 0
    for (const snapshot of aggregateRollSnapshots) {
      if (snapshot.locked > 0 && snapshot.locked === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [effectiveRecipe, aggregateRollSnapshots, computeTriState, lockedSubstatsExist, multiEditActive, multiSourceRecipes])
  const getRequiredCountTriState = React.useCallback((target: 'auto' | 1 | 2 | 3 | 4): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !multiSourceRecipes) {
      // Use effectiveRecipe so recipe overrides are reflected in the button selection state.
      const auto = effectiveRecipe.autoMinCount === true
      if (target === 'auto') return auto ? 'on' : 'off'
      const value = Number(effectiveRecipe.minCount ?? 0)
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
    const total = multiSourceRecipes.length
    let matches = 0
    for (const recipe of multiSourceRecipes) {
      const auto = recipe.autoMinCount === true
      if (target === 'auto') {
        if (auto) matches += 1
        continue
      }
      if (!auto && Number(recipe.minCount ?? 0) === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [effectiveRecipe, computeTriState, multiAutoMinCountField, multiEditActive, multiMinCountField, multiSourceRecipes])
  const getKeepModeTriState = React.useCallback((target: 'early' | 'late'): 'on' | 'mixed' | 'off' => {
    if (!multiEditActive || !multiSourceRecipes) {
      const mode = ((effectiveRecipe as BuilderRecipe).earlyKeepMode ?? 'early') as 'early' | 'late'
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
    const total = multiSourceRecipes.length
    let matches = 0
    for (const recipe of multiSourceRecipes) {
      const mode = (recipe.earlyKeepMode ?? 'early') as 'early' | 'late'
      if (mode === target) matches += 1
    }
    return computeTriState(matches, total)
  }, [computeTriState, effectiveRecipe, multiEditActive, multiEarlyKeepModeField, multiSourceRecipes])
  const getAutoRarityTriState = React.useCallback((): 'on' | 'mixed' | 'off' | 'disabled' => {
    if (!multiEditActive || !multiSourceRecipes) {
      const active = isMilestoneThresholdsActive(effectiveRecipe) &&
        ((effectiveRecipe as BuilderRecipe).rarityMode === 'auto') &&
        (((effectiveRecipe as BuilderRecipe).earlyKeepMode ?? 'early') === 'late')
      if (!active) return 'disabled'
      return (effectiveRecipe as BuilderRecipe).autoRaritySupplementsThreshold ? 'on' : 'off'
    }
    let eligible = 0
    let enabled = 0
    for (const recipe of multiSourceRecipes) {
      const active = isMilestoneThresholdsActive(recipe)
      const applicable = (recipe.rarityMode === 'auto') && ((recipe.earlyKeepMode ?? 'early') === 'late') && active
      if (!applicable) continue
      eligible += 1
      if (recipe.autoRaritySupplementsThreshold) enabled += 1
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
  }, [computeTriState, effectiveRecipe, multiAutoRaritySupplementsField, multiEditActive, multiSourceRecipes])
  const {
    undoTooltipText,
    redoTooltipText,
    historyMenuOpen,
    historyMenuAnchor,
    historyMenuPaperRef,
    historyMenuGuard,
    closeHistoryMenu,
    handleHistoryContextMenu,
    historyHintTriggerProps,
    handleHistoryMenuContextMenu,
    handleRequestClearHistory,
    handleHistoryEntrySelect,
    historyHintOverlay,
  } = useBuilderHistoryMenu({
    undoPreview,
    redoPreview,
    t,
    lang,
    onRequestClearHistory,
    onJumpToHistoryIndex,
  })
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const { statColorScope } = useDisplayPreferences()
  const colorStatTexts = scopeColorsText(statColorScope)
  // Button-scoped stat-name colours for the substat TOGGLE labels (empty unless stat scope 'everything').
  const statTextColors = useStatControlColorMap()
  // Mixed-state colors — use theme.custom tokens (CSS variable-backed, no alpha() needed).
  const mixedBorderColor = theme.custom.multiEditMixedBorder
  const mixedPatternColor = theme.custom.multiEditMixedBg
  const mixedTextColor = theme.custom.multiEditMixedText
  const substatColors = _substatColors
  const recipeCount = _recipeCount
  // Shared styling for the builder's status chips (Flex, Only locked, Auto ≥ …).
  const builderToggleChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  // Use effectiveRecipe so the selected button reflects any active recipe overrides.
  const singleRequiredCountValue = effectiveRecipe.autoMinCount ? 'auto' : ((effectiveRecipe.minCount ?? 0) > 0 ? String(effectiveRecipe.minCount) : 'auto')
  const requiredCountValue = multiEditActive
    ? (() => {
        if (getRequiredCountTriState('auto') === 'on') return 'auto'
        const manualMatch = REQUIRED_SUBSTAT_MIN_OPTIONS.find((option) => getRequiredCountTriState(option) === 'on')
        return manualMatch != null ? String(manualMatch) : MULTI_VALUE_SENTINEL
      })()
    : singleRequiredCountValue
  const singleKeepModeValue = ((effectiveRecipe as BuilderRecipe).earlyKeepMode ?? 'early') as 'early' | 'late'
  const keepModeValue = multiEditActive
    ? (() => {
        if (getKeepModeTriState('late') === 'on') return 'late'
        if (getKeepModeTriState('early') === 'on') return 'early'
        return MULTI_VALUE_SENTINEL
      })()
    : singleKeepModeValue
  const thresholdsActiveAny = multiEditActive && multiSourceRecipes
    ? multiSourceRecipes.some((recipe) => isMilestoneThresholdsActive(recipe))
    : isMilestoneThresholdsActive(effectiveRecipe)
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
  // Format a min required rolls state as a short label for override badge tooltips.
  const rollStateLabel = (auto: boolean | undefined, manual: number | undefined): string => {
    if (auto !== false) return t('headerMenuAuto')
    const v = clampAggregateRollValue(manual ?? 0)
    return v === 0 ? t('headerMenuAuto') : String(v)
  }
  // Format a required substat count state as a short label for override badge tooltips.
  // `autoMinCount === true` means auto; falsy means manual with the given count.
  const minCountStateLabel = (auto: boolean | undefined, count: number | undefined): string => {
    if (auto) return t('headerMenuAuto')
    const v = count ?? 0
    return v === 0 ? t('headerMenuAuto') : String(v)
  }
  const slotMetrics = useSlotMetrics()
  // Use the SSOT slot-label resolver from the hook (removes duplicate switch/case).
  const { slotLabel } = slotMetrics
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
      // Argonites are treated as a first-class faction label in the builder.
      case Faction.Argonites: return t('factionArgonites')
      default: return String(code)
    }
  }
  // Roll indicator sizing and hover gutter come from centralized constants.
  // Toggle button sizing stays centralized so widths remain aligned across builder surfaces.
  const TOGGLE_BUTTON_HEIGHT_PX = BUILDER_TOGGLE_BUTTON_HEIGHT_PX
  // SSOT for collapsible-section header clear buttons: render the ✕ whenever the section is
  // non-default (dirty), otherwise the shared zero-width strut (CLEAR_BUTTON_STRUT_SX) —
  // row height stays stable while long labels keep the space until the ✕ actually appears.
  // Keeps every section consistent — blue label + clear ✕ go together (see filter panels).
  const renderSectionClearButton = useCallback((dirty: boolean, label: string, onClear: () => void) => (
    dirty
      ? <ClearIconButton size="small" aria-label={label} tooltip={label} onClick={onClear} />
      : <Box sx={CLEAR_BUTTON_STRUT_SX} />
  ), [])
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
  const update = <K extends keyof BuilderRecipe>(k: K, v: BuilderRecipe[K]) => onChange({ ...recipe, [k]: v })
  const updateExportMode = useCallback((next: SellfileExportMode) => {
    onChange({ ...recipe, exportMode: next })
  }, [recipe, onChange])
  const updateLevelWindow = useCallback((min: LevelMilestone, max: LevelMilestone) => {
    // Keep level window updates normalized so min/max stay consistent.
    onChange(normalizeLevelWindow({ ...recipe, minLevel: min, maxLevel: max }))
  }, [recipe, onChange])
  const updateKeepMode = useCallback((mode: 'early' | 'late') => {
    // Normalize keep mode so Auto+Late and roll targets stay aligned.
    onChange(normalizeKeepWithAuto({ ...recipe, earlyKeepMode: mode }))
  }, [recipe, onChange, normalizeKeepWithAuto])
  const updateAutoLateThreshold = useCallback((nextTier: 'uncommon' | 'rare' | 'epic') => {
    // Normalize after setting the Auto+Late tier so related flags stay in sync.
    onChange(normalizeKeepWithAuto({ ...recipe, autoRaritySupplementsThreshold: nextTier }))
  }, [recipe, onChange, normalizeKeepWithAuto])
  const updateRaritySelection = useCallback((mode: 'auto' | 'code', code?: number) => {
    // Normalize to keep Auto+Late behavior consistent with the selection.
    if (mode === 'auto') {
      onChange(normalizeKeepWithAuto({ ...recipe, rarityMode: 'auto' }))
      return
    }
    onChange(normalizeKeepWithAuto({ ...recipe, rarityMode: 'code', rarityCode: Number(code ?? 0) }))
  }, [recipe, onChange, normalizeKeepWithAuto])
  const handleExportModeOverrideClick = React.useCallback((mode: SellfileExportMode) => {
    if (multiEditActive) return
    if (!exportModeOverrideActive) return
    if (exportModeValue !== mode) return
    updateExportMode(mode)
  }, [exportModeOverrideActive, exportModeValue, multiEditActive, updateExportMode])
  // Clicking the override-resolved Keep/Sell value accepts it into the stored recipe.
  // Plain function (mirrors the inline keep-timing accept handler) so it doesn't pull the
  // non-memoized `update` into a useCallback dependency list.
  const handleKeepActionOverrideClick = (value: 'keep' | 'sell') => {
    if (multiEditActive) return
    if (!keepBooleanOverrideActive) return
    if (keepValue !== value) return
    update('keep', value === 'keep')
  }
  const [nameDraft, setNameDraft] = useState<string>('')
  const [nameDraftKey, setNameDraftKey] = useState<number | 'builder' | null>(null)
  // Dialog open state for the "Clear tags?" confirmation (shown when overrides are active).
  const [clearTagsConfirmOpen, setClearTagsConfirmOpen] = useState(false)
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
  const currentDraftKey: number | 'builder' = editingIndex ?? 'builder'
  const nameDraftDirty = nameDraftKey === currentDraftKey
  // Derived UI state for tags in single vs multi-edit.
  const tagsPopoverOpen = Boolean(tagsAnchor)
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
  // Tags hint — disabled while the context menu or popover is open.
  const tagsHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderTagsMenu, {
    enabled: !tagsContextAnchor && !tagsPopoverOpen,
    text: t('contextMenuHint'),
  })
  const { onOpen: onTagsHintOpen } = tagsHint
  // Open the Tags context menu on right-click and mark the hint as seen.
  const handleTagsContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    onTagsHintOpen()
    setTagsContextAnchor(event.currentTarget as HTMLElement)
  }, [onTagsHintOpen])
  // Memoize single-recipe tags so callbacks get stable dependencies.
  const tagsValue = useMemo(() => (recipe.tags ?? []), [recipe.tags])
  // Summarize tag presence for multi-edit so mixed tags are styled separately.
  const tagPresence = useMemo(() => {
    if (!multiEditActive) return null
    // Prefer projected recipes so staged patches are reflected in the tag chips.
    const source = (multiProjectedRecipes && multiProjectedRecipes.length > 0)
      ? multiProjectedRecipes
      : (multiSourceRecipes ?? [])
    // Convert each recipe's tag list into a stable string array.
    const lists = source.map((recipe) => (
      Array.isArray(recipe.tags) ? recipe.tags.map(String) : []
    ))
    return summarizeTagPresence(lists)
  }, [multiEditActive, multiProjectedRecipes, multiSourceRecipes])
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
        return (multiNameField.value as string) ?? ''
      })()
    : ''
  const commitName = React.useCallback((value: string) => {
    const next = value
    const current = recipe.appearance?.name ?? ''
    if (current === next) {
      setNameDraft('')
      setNameDraftKey(null)
      return next
    }
    const fgColor = recipe.appearance?.fgColor
    const nextAppearance = (next || fgColor) ? { name: next, ...(fgColor ? { fgColor } : {}) } : undefined
    // Explicitly drop the appearance key when nextAppearance is undefined — spreading {} over
    // the existing recipe would silently preserve the old name.
    if (nextAppearance) {
      onChange({ ...recipe, appearance: nextAppearance })
    } else {
      const { appearance: _dropped, ...base } = recipe
      onChange(base)
    }
    setNameDraft('')
    setNameDraftKey(null)
    return next
  }, [recipe, onChange])
  const commitNameDraftIfNeeded = React.useCallback(() => {
    if (multiEditActive) return
    if (!nameDraftDirty) return
    commitName(nameDraft)
  }, [commitName, multiEditActive, nameDraft, nameDraftDirty])
  const commitFgColor = React.useCallback((color: string | undefined) => {
    if (multiEditActive) {
      multiEdit?.updateField('appearanceFgColor', { value: color, status: 'common' })
    } else {
      const currentName = recipe.appearance?.name ?? ''
      const nextAppearance = (currentName || color)
        ? { name: currentName, ...(color ? { fgColor: color } : {}) }
        : undefined
      onChange({ ...recipe, ...(nextAppearance ? { appearance: nextAppearance } : {}) })
    }
  }, [multiEditActive, multiEdit, recipe, onChange])
  const getTagBaseState = useCallback((tag: string): TriStateBase => {
    // Default to "none" when multi-edit has no aggregate tag data yet.
    if (!tagPresence) return 'none'
    // Look up the number of recipes currently containing the tag.
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
      value: (multiTagsField?.value as BuilderRecipe['tags']) ?? [],
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
    // Persist tags onto the single builder recipe.
    onChange({ ...recipe, tags: normalized })
  }, [recipe, multiEditActive, onChange, stageTagPatch])
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
    // Apply multi-edit patches or merge into the single-recipe list.
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
    // Multi-edit clears tags with a patch so every selected recipe resets together.
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('tags', {
        value: (multiTagsField?.value as BuilderRecipe['tags']) ?? (recipe.tags ?? []),
        status: 'common',
        patch: { clear: true },
      })
      return
    }
    // Single-edit: if override values differ from stored values, let the user decide
    // whether to bake those values in before clearing the tags.
    if (effectiveRecipe !== recipe) {
      setClearTagsConfirmOpen(true)
      return
    }
    // No active overrides — clear directly.
    onChange({ ...recipe, tags: [] })
  }, [effectiveRecipe, recipe, multiEdit, multiEditActive, multiTagsField?.value, onChange, tagsClearable])
  // Handles "Clear Without Applying" — discards any active override values and clears tags.
  const handleClearTagsConfirm = useCallback(() => {
    setClearTagsConfirmOpen(false)
    onChange({ ...recipe, tags: [] })
  }, [recipe, onChange])
  // Handles "Apply and Clear" — bakes the current override-derived values into the recipe,
  // then removes the tags so overrides no longer target it.
  const handleClearTagsApplyAndClear = useCallback(() => {
    setClearTagsConfirmOpen(false)
    onChange({ ...effectiveRecipe, tags: [] })
  }, [effectiveRecipe, onChange])
  const singleBuilderDirty = selectedIsDirty || nameDraftDirty
  const isDirty = multiEditActive ? multiDraftDirty : singleBuilderDirty
  const insertButtonLabel = editingIndex !== null
    ? t('builderInsertAsRecipe', { n: editingIndex + 2 })
    : t('builderAddAsNew')
  const defaultSaveTarget = recipeCount > 0 ? recipeCount : BUILDER_DEFAULT_SAVE_TARGET
  const saveButtonLabel = multiEditActive
    ? t('builderApplyToRecipes', { n: multiEditSelectionCount })
    : (editingIndex !== null
      ? t('builderSaveAsRecipe', { n: editingIndex + 1 })
      : t('builderSaveAsRecipe', { n: defaultSaveTarget }))
  const builderCanAdd = !multiEditActive
  const saveDisabled = multiEditActive ? !multiDraftDirty : (editingIndex === null || !isDirty)
  // Controlled so the warning tooltip disappears when the button disables.
  const [saveTooltipOpen, setSaveTooltipOpen] = useState(false)
  // Keep badge tooltips attached to the warning bubble, not the whole button.
  const renderWarningBadgeContent = React.useCallback((params: {
    tooltip: string
    disabled?: boolean
    open?: boolean
    onOpen?: () => void
    onClose?: () => void
  }) => (
    <MarkdownTooltip
      markdown={params.tooltip}
      {...(typeof params.disabled === 'boolean' ? { disableHoverListener: params.disabled } : {})}
      {...(typeof params.open === 'boolean' ? { open: params.open } : {})}
      {...(params.onOpen ? { onOpen: params.onOpen } : {})}
      {...(params.onClose ? { onClose: params.onClose } : {})}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        !
      </Box>
    </MarkdownTooltip>
  ), [])
  const actionButtonWidthPx = useMemo(() => {
    const samples = [
      t('builderAddAsNew'),
      t('builderInsertAsRecipe', { n: MAX_RECIPE_INDEX_FOR_BUTTON_WIDTH }),
      t('builderSaveAsRecipe', { n: MAX_RECIPE_INDEX_FOR_BUTTON_WIDTH }),
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
    backgroundColor: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
    // getContrastText requires a concrete hex/rgb value; CSS var strings are not supported.
    color: theme.palette.getContrastText(theme.palette.warning.main),
    fontWeight: theme.typography.fontWeightBold ?? 600,
    fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(10) : '0.65rem',
    lineHeight: 1,
    boxShadow: theme.shadows[1],
  }), [theme])
  const renderedName = usingMultiName
    ? multiNameDraftValue
    : (nameDraftDirty ? nameDraft : (recipe.appearance?.name ?? ''))
  const namePlaceholder = usingMultiName && multiNameMixed ? t('builderMultiNamePlaceholder') : undefined
  const userDisabledFlexRef = useRef(false)
  const userKeepModeRef = useRef<'auto' | 'early' | 'late'>('auto')
  const builderIdentity: number | 'builder' = editingIndex ?? 'builder'
  const lastBuilderIdentityRef = useRef<number | 'builder'>(builderIdentity)
  // When the active builder changes, capture its saved flex toggles so we preserve per-recipe intent.
  if (lastBuilderIdentityRef.current !== builderIdentity) {
    lastBuilderIdentityRef.current = builderIdentity
    userDisabledFlexRef.current = builderIdentity === 'builder'
      ? false
      : !recipe.autoSubstatFlex
    userKeepModeRef.current = builderIdentity === 'builder'
      ? 'auto'
      : (((recipe as BuilderRecipe).earlyKeepMode ?? 'early') as 'early' | 'late')
  }
  const toggleSubstatFlex = () => {
    if (!canFlexSubstats) return
    const next = !recipe.autoSubstatFlex
    userDisabledFlexRef.current = !next
    onChange({ ...recipe, autoSubstatFlex: next })
  }

  const prevThresholdsActiveRef = useRef<boolean>(milestoneThresholdsActive)
  useEffect(() => {
    const prev = prevThresholdsActiveRef.current
    prevThresholdsActiveRef.current = milestoneThresholdsActive
    if (!prev && milestoneThresholdsActive) {
      const currentMode = ((recipe as BuilderRecipe).earlyKeepMode ?? 'early') as 'early' | 'late'
      if (currentMode !== 'late' && userKeepModeRef.current === 'auto') {
        onChange({ ...recipe, earlyKeepMode: 'late' })
      }
    }
  }, [recipe, milestoneThresholdsActive, onChange])

  const prevCanFlexRef = useRef<boolean>(canFlexSubstats)
  useEffect(() => {
    const prev = prevCanFlexRef.current
    prevCanFlexRef.current = canFlexSubstats
    if (!prev && canFlexSubstats) {
      if (!recipe.autoSubstatFlex && !userDisabledFlexRef.current) {
        onChange({ ...recipe, autoSubstatFlex: true })
      }
    }
  }, [canFlexSubstats, recipe, onChange])
  // Note: We no longer color the stat toggle button borders. The preference
  // now controls coloring of stat texts in chips and preview only.
  const buttonBorderSx = (_variant: number) => {
    return {}
  }
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
  // Register the opener so sibling panels (e.g. SafeguardBuilderPanel) can trigger this dialog.
  // Imperative registration: we push a stable function reference up to the parent so it can
  // call openMetaDlg without knowing the implementation. This effect is the correct pattern
  // for wiring an imperative handle; the parent never needs to "fetch" data here.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onRegisterOpenMetasetsDialog?.(openMetaDlg)
  }, [onRegisterOpenMetasetsDialog, openMetaDlg])
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
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, {
      translate: t,
      // Always include no-set so scroll can target it even when disabled.
      includeNoSet: true,
      noSetLabel: t('noSetAccessories'),
    })
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
  // Debounced rule count for the current builder recipe
  const {
    counting,
    displayRuleCount,
    countingLabel,
    ruleCountLimitValue,
    limitExceededWarning,
    limitWarningTooltip,
    ruleCountChipSx,
  } = useRuleCountBadge({
    recipe,
    substatTargets,
    multiEditActive,
    multiProjectedRecipes,
    multiSourceRecipes,
    multiEditSelection,
    multiDirtyKeys,
    recipeRuleCounts,
    selectedIsDirty,
    editingIndex,
    countRulesForRecipes,
    recipesExcludedByTotalLimit,
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

  // Recipe name is edited directly on the builder state; no local draft needed.
  // Whether the current builder matches the built-in defaults.
  // Keep this aligned with the Reset-to-defaults payload below.
  const [defaultsEpoch, setDefaultsEpoch] = useState(0)
  const isDefaultBuilder = React.useMemo(() => {
    void defaultsEpoch // intentionally depend on defaultsEpoch to recompute when user defaults change
    const factoryDefaults = (): BuilderRecipe => createFactoryBuilderDefaults()
    const loadUserDefaults = (): BuilderRecipe | null => {
      try {
        const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const normalized = normalizeExportModeFields(parsed as Record<string, unknown>)
        return { ...createFactoryBuilderDefaults(), ...normalized } as BuilderRecipe
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
      (recipe.appearance?.name ?? '') === (target.appearance?.name ?? '') &&
      (recipe.appearance?.fgColor ?? '') === (target.appearance?.fgColor ?? '') &&
      recipe.keep === Boolean(target.keep) &&
      recipe.exportMode === target.exportMode &&
      Number(recipe.rankCode) === Number(target.rankCode) &&
      Number((recipe as unknown as { rarityCode?: number }).rarityCode ?? 0) === Number((target as unknown as { rarityCode?: number }).rarityCode ?? 0) &&
      (((recipe as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'code') === ((target as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'code')) &&
      (((recipe as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare') === ((target as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare')) &&
      Number((recipe as unknown as { factionCode?: number }).factionCode ?? 0) === Number((target as unknown as { factionCode?: number }).factionCode ?? 0) &&
      JSON.stringify(asNumArr((recipe as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) &&
      (recipe as unknown as { minLevel?: LevelMilestone }).minLevel === (target as unknown as { minLevel?: LevelMilestone }).minLevel &&
      (recipe as unknown as { maxLevel?: LevelMilestone }).maxLevel === (target as unknown as { maxLevel?: LevelMilestone }).maxLevel &&
      ((recipe as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') === ((target as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') &&
      JSON.stringify(asNumArr((recipe as unknown as { substatsV?: number[] }).substatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { substatsV?: number[] }).substatsV).slice().sort()) &&
      JSON.stringify(asNumArr((recipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) &&
      Number(recipe.minCount) === Number(target.minCount) &&
      Boolean(recipe.autoMinCount) === Boolean(target.autoMinCount) &&
      Boolean((recipe as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) === Boolean((target as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) &&
      Number((recipe as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === Number((target as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) &&
      Boolean((recipe as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) === Boolean((target as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) &&
      empty((recipe as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) === empty((target as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) &&
      JSON.stringify(asNumArr((recipe as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) &&
      JSON.stringify(normalizeArtifactSetSelections((recipe as unknown as { artifactSets?: ArtifactSetSelectionEntry[] }).artifactSets ?? [])) === JSON.stringify(normalizeArtifactSetSelections((target as unknown as { artifactSets?: ArtifactSetSelectionEntry[] }).artifactSets ?? [])) &&
      JSON.stringify(((recipe as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) === JSON.stringify(((target as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort())
    )
  }, [recipe, defaultsEpoch])
  // Default builders reset the cached toggles so they mirror the factory state.
  if (isDefaultBuilder) {
    userDisabledFlexRef.current = false
    userKeepModeRef.current = 'auto'
  }

  // Compute the effective defaults (user overrides if present; otherwise factory)
  const getEffectiveDefaults = React.useCallback((): BuilderRecipe => {
    try {
      const raw = localStorage.getItem(BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const normalized = normalizeExportModeFields(parsed as Record<string, unknown>)
          return { ...createFactoryBuilderDefaults(), ...normalized } as BuilderRecipe
        }
      }
    } catch {}
    return createFactoryBuilderDefaults()
  }, [])

  const {
    insert: {
      menu: { anchor: insertMenuAnchor, paperRef: insertMenuPaperRef, close: closeInsertMenu, onContextMenu: handleInsertContextMenu },
      hint: insertHint,
    },
    apply: {
      menu: { anchor: applyMenuAnchor, paperRef: applyMenuPaperRef, close: closeApplyMenu, onContextMenu: handleApplyContextMenu },
      hint: applyHint,
    },
    reset: {
      menu: { anchor: resetMenuAnchor, paperRef: resetMenuPaperRef, close: closeResetMenu, onContextMenu: handleResetContextMenu },
      hint: resetHint,
    },
  } = useBuilderPanelActionMenus({
    builderCanAdd,
    multiEditActive,
    saveDisabled,
    isDefaultBuilder,
  })
  // Persisted toggle: show tag chips next to the Tags button.
  const [showTagsChips, setShowTagsChips] = useShowTagsChipsPreference()
  // Persisted collapsed state for the 7 per-group collapsible sections.
  const [builderCollapsed, setBuilderCollapsed] = useBuilderRecipeCollapsedPreference()
  // Action label color mirrors the keep/sell color used in recipe chips.
  // Only applied when collapsed so the color acts as a summary signal.
  const actionLabelColor = builderCollapsed.action
    ? recipe.exportMode === 'disabled'
      ? 'text.disabled'
      : recipe.exportMode === 'separator'
        ? 'text.secondary'
        : recipe.keep
          ? 'success.main'
          : 'error.main' // active sell (default)
    : undefined
  // Debounce handle for auto-apply; cleared when auto-apply is disabled.
  const autoApplyTimeoutRef = useRef<number | null>(null)
  const clearAutoApplyTimeout = useCallback(() => {
    const handle = autoApplyTimeoutRef.current
    if (handle !== null) {
      window.clearTimeout(handle)
      autoApplyTimeoutRef.current = null
    }
  }, [])
  // ── auto-apply / auto-reset preferences (via shared hook) ───────────────
  const {
    autoApply: autoApplySelectedRecipe,
    autoReset: autoResetAfterInsert,
    setAutoApplyExclusive: setAutoApplySelectedRecipeExclusive,
    setAutoResetExclusive: setAutoResetAfterInsertExclusive,
  } = useBuilderPanelPrefs({ onAutoApplyDisabled: clearAutoApplyTimeout })

  const handleResetBuilder = React.useCallback(() => {
    const eff = getEffectiveDefaults()
    // Drop appearance before spreading so the reset never inherits the old name — factory
    // defaults have no appearance key, so a plain spread would silently preserve it.
    const { appearance: _dropped, ...recipeBase } = recipe
    // Normalize after merge so transient fields like autoRaritySupplementsThreshold are
    // stripped when they don't apply (e.g. early-mode recipes don't use the supplements floor).
    onChange(normalizeKeepWithAuto({ ...recipeBase, ...eff }))
    // Clear any uncommitted name draft so the field reflects the reset state immediately.
    setNameDraft('')
    setNameDraftKey(null)
    setHoverReset(false)
  }, [recipe, getEffectiveDefaults, normalizeKeepWithAuto, onChange])

  // Wrap insert to optionally reset builder controls to defaults (no dialog)
  const handleAddToCustom = () => {
    commitNameDraftIfNeeded()
    onAddToCustom()
    if (autoResetAfterInsert) {
      const eff = getEffectiveDefaults()
      // Drop appearance before spreading — same reasoning as handleResetBuilder.
      const { appearance: _dropped, ...recipeBase } = recipe
      // Same normalization as handleResetBuilder to avoid stale threshold in next builder state.
      onChange(normalizeKeepWithAuto({ ...recipeBase, ...eff }))
    }
  }
  // Attention phase: After idle threshold while dirty, replay suite effects every interval.
  const [attentionState, setAttentionState] = useState<{ phase: boolean; burst: boolean }>({ phase: false, burst: false })
  // Ref-based setter so timer callbacks inside effects avoid the set-state-in-effect lint rule.
  const setAttentionStateRef = useRef(setAttentionState)
  useEffect(() => { setAttentionStateRef.current = setAttentionState }, [setAttentionState])
  const attentionPhase = attentionState.phase
  const attentionBurst = attentionState.burst
  const [interactionNonce, setInteractionNonce] = useState(0)
  // Track the composite trigger key so we can reset attention on change at render time.
  const attentionTriggerKey = `${JSON.stringify(recipe)}|${interactionNonce}|${isDirty}`
  const [prevAttentionTriggerKey, setPrevAttentionTriggerKey] = useState(attentionTriggerKey)
  if (attentionTriggerKey !== prevAttentionTriggerKey) {
    /* eslint-disable @eslint-react/set-state-in-effect -- guarded render-time state adjustment, see substat-menu block above for full rationale */
    setPrevAttentionTriggerKey(attentionTriggerKey)
    if (attentionState.phase || attentionState.burst) {
      setAttentionState({ phase: false, burst: false })
    }
    /* eslint-enable @eslint-react/set-state-in-effect */
  }
  // Arm idle timer when dirty and reset whenever builder changes or user interacts.
  // The effect only manages the timer; state reset happens at render time above.
  useEffect(() => {
    const idle = isDirty
      ? window.setTimeout(() => setAttentionStateRef.current({ phase: true, burst: true }), BUILDER_DIRTY_NUDGE_IDLE_MS)
      : null
    return () => { idle !== null && window.clearTimeout(idle) }
  }, [recipe, interactionNonce, isDirty])
  // When phase starts, trigger immediate burst and then repeat every interval until cancelled.
  // Each burst-clear timeout is tracked so cleanup can cancel leaked timers.
  useEffect(() => {
    const activate = () => {
      setAttentionStateRef.current(prev => ({ ...prev, burst: true }))
      let burstClearId: number | null = window.setTimeout(() => { burstClearId = null; setAttentionStateRef.current(prev => ({ ...prev, burst: false })) }, 1300)
      const iv = window.setInterval(() => {
        setAttentionStateRef.current(prev => ({ ...prev, burst: true }))
        // Track the burst-clear timer so the effect cleanup can cancel it.
        burstClearId = window.setTimeout(() => { burstClearId = null; setAttentionStateRef.current(prev => ({ ...prev, burst: false })) }, 1300)
      }, BUILDER_DIRTY_ATTENTION_INTERVAL_MS)
      return () => { if (burstClearId !== null) window.clearTimeout(burstClearId); window.clearInterval(iv) }
    }
    return attentionPhase ? activate() : undefined
  }, [attentionPhase])
  const autoApplyEnabled = autoApplySelectedRecipe && !multiEditActive && editingIndex !== null
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
  // Register auto-apply handler with parent via ref indirection to avoid effect-based re-registration.
  const performAutoApplyRef = useRef(performAutoApply)
  performAutoApplyRef.current = performAutoApply
  const stableAutoApplyHandler = useCallback((): boolean => performAutoApplyRef.current(), [])
  // Track the registration function in a ref so we can de-register from the previous
  // callback when the prop identity changes. Using a render-time `useState` comparison
  // on a function prop caused infinite re-renders because every render produced a new
  // function reference, so the `!==` check always fired setState → re-render → loop.
  const registerAutoApplyHandlerRef = useRef(registerAutoApplyHandler)
  useEffect(() => {
    const prev = registerAutoApplyHandlerRef.current
    registerAutoApplyHandlerRef.current = registerAutoApplyHandler
    // De-register from old callback when the identity changes.
    if (prev !== registerAutoApplyHandler && prev !== undefined) prev?.(null)
    // Register with the current callback. This is a callback-registration pattern
    // (child tells parent "call me when you need auto-apply"), not derived-state push.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    registerAutoApplyHandler?.(stableAutoApplyHandler)
    // Cleanup on unmount or when the registration function changes.
    return () => { registerAutoApplyHandler?.(null) }
  }, [registerAutoApplyHandler, stableAutoApplyHandler])
  useEffect(() => {
    clearAutoApplyTimeout()
    if (!autoApplySelectedRecipe) return
    if (multiEditActive) return
    if (editingIndex === null) return
    if (!singleBuilderDirty) return
    const handle = window.setTimeout(() => {
      autoApplyTimeoutRef.current = null
      void performAutoApply()
    }, BUILDER_AUTO_APPLY_DEBOUNCE_MS)
    autoApplyTimeoutRef.current = handle
    // Direct clearTimeout so the lint rule can statically verify the cleanup.
    return () => { window.clearTimeout(handle); autoApplyTimeoutRef.current = null }
  }, [
    autoApplySelectedRecipe,
    clearAutoApplyTimeout,
    recipe,
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
  const fortyTwoOverlay = useFortyTwoLegendaryOverlay((Number(recipe.minCount) === 2) && (Number((recipe as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === 4))


  // Show clear button when any mainstat is selected, placeholder otherwise.
  const mainStatClearButton = (() => {
    const baseMainSelected = (((recipe as (BuilderRecipe & { mainStatsV?: number[] })).mainStatsV ?? []).length > 0)
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
      : (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
  })()

  // Mainstat toggle button rows (row1: SPD/CR/CDMG/ACC/RES, row2: HP/ATK/DEF and % variants).
  const mainStatValue: string[] = displayMainStatsV.map(String)
  const handleMainStatChange = (_: React.SyntheticEvent, v: string[]) => {
    if (!Array.isArray(v)) return
    const nextNumbers = Array.from(new Set(v.map((token) => Number(token)).filter((n) => Number.isFinite(n))))
    if (nextNumbers.length === 0) {
      onChange({ ...recipe, mainStatsV: [] })
      return
    }
    onChange({ ...recipe, mainStatsV: nextNumbers as number[] })
  }
  const mainStatToggleRows = (
    <>
      {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
      <ToggleButtonGroup
        size="small"
        value={mainStatValue}
        onChange={(event, v) => {
          if (multiEditActive) return
          handleMainStatChange(event, v as string[])
        }}
        sx={mainStatToggleGroupSx}
      >
        {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => {
          const state = resolveMainStatTriState(variant)
          return (
            <ToggleButton
              key={variant}
              value={`${variant}`}
              disabled={!displayMainStatOptions.includes(variant)}
              selected={multiEditActive ? state === 'all' : mainStatValue.includes(String(variant))}
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
              <StatLabel variant={variant} inControl />
            </ToggleButton>
          )
        })}
      </ToggleButtonGroup>
      {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
      <ToggleButtonGroup
        size="small"
        value={mainStatValue}
        onChange={(event, v) => {
          if (multiEditActive) return
          handleMainStatChange(event, v as string[])
        }}
        sx={mainStatToggleGroupSx}
      >
        {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => {
          const state = resolveMainStatTriState(variant)
          return (
            <ToggleButton
              key={variant}
              value={`${variant}`}
              disabled={!displayMainStatOptions.includes(variant)}
              selected={multiEditActive ? state === 'all' : mainStatValue.includes(String(variant))}
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
              <StatLabel variant={variant} inControl />
            </ToggleButton>
          )
        })}
      </ToggleButtonGroup>
    </>
  )

  // Show clear button for substats when any are selected; placeholder otherwise.
  const substatsClearButton = (() => {
    if (multiEditActive && multiSummary) {
      if (substatsPatch?.clear) {
        return (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
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
                value: (multiSubstatsField?.value as BuilderRecipe['substatsV']) ?? (recipe.substatsV ?? []),
                status: 'common',
                patch: { clear: true },
              })
              multiEdit?.updateField('fixedSubstatsV', {
                value: (multiFixedSubstatsField?.value as BuilderRecipe['fixedSubstatsV']) ?? (recipe.fixedSubstatsV ?? []),
                status: 'common',
                patch: { clear: true },
              })
              multiEdit?.updateField('substatRollBoundsV', {
                value: (multiRollField?.value as BuilderRecipe['substatRollBoundsV']) ?? (recipe.substatRollBoundsV ?? {}),
                status: 'common',
                patch: {},
              })
            }}
          />
        )
        : (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
    }
    const substatsSelection = (((recipe as unknown) as { substatsV?: number[] }).substatsV) ?? []
    const hasSubstats = substatsSelection.length > 0
    return hasSubstats
      ? (
        <ClearIconButton
          size="small"
          aria-label={t('builderClearSubstats')}
          tooltip={t('builderClearSubstats')}
          onClick={() => onChange(normalizeKeepWithAuto({
            ...recipe,
            substatsV: [],
            fixedSubstatsV: [],
            minCount: 0,
            substatRollBoundsV: {} as Record<number, { min?: number; max?: number; any?: boolean }>,
            substatRollTargetsV: {} as SubstatRollTargets,
          }))}
        />
      )
      : (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
  })()

  // Compute name field end adornment (color picker + optional clear button) before JSX.
  const nameEndAdornment = (() => {
    const currentFgColor = usingMultiName
      ? ((multiFgColorField?.value as string) ?? '')
      : (recipe.appearance?.fgColor ?? '')
    const showClear = usingMultiName
      ? Boolean(multiNameField && (multiNameField.value as string) && multiNameField.status !== 'mixed')
      : renderedName !== ''
    return (
      <InputAdornment position="end" sx={{ gap: 0.5 }}>
        <ColorField
          value={currentFgColor}
          onChange={commitFgColor}
          onClear={() => commitFgColor(undefined)}
        />
        {showClear && (
          <ClearIconButton
            size="small"
            edge="end"
            aria-label={t('builderClearRecipeName')}
            tooltip={t('builderClearRecipeName')}
            // Prevent mousedown from blurring the input before click fires (MUI9 changed
            // InputAdornment focus-retention behavior relative to MUI5/6).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (usingMultiName) {
                multiEdit?.updateField('appearanceName', { value: '', status: 'common' })
              } else if (renderedName !== '') {
                commitName('')
              }
            }}
          />
        )}
      </InputAdornment>
    )
  })()

  // Substats section content: toggle buttons, roll menu, and substat menu.
  const substatsContent = (() => {

    // Prefer recipe-overrides overrides for display-only UI so roll badges match previews.
    // Keep edits bound to the stored recipe so interactions stay deterministic.
    const displayRecipe = (!multiEditActive && effectiveRecipe !== recipe) ? effectiveRecipe : recipe
    // Normalize roll bounds so override comparisons use stable, clamped values.
    const normalizeBounds = (bounds?: { min?: number; max?: number; any?: boolean; not?: boolean }) => ({
      // Keep the wildcard flag explicit to avoid false positives.
      any: Boolean(bounds?.any),
      not: Boolean((bounds as { not?: boolean } | undefined)?.not),
      // Clamp min to the roll bounds the builder enforces.
      min: (typeof bounds?.min === 'number' && Number.isFinite(bounds.min))
        ? Math.max(0, Math.min(5, Math.floor(bounds.min)))
        : undefined,
      // Clamp max to the cap the builder exposes.
      max: (typeof bounds?.max === 'number' && Number.isFinite(bounds.max))
        ? Math.max(0, Math.min(4, Math.floor(bounds.max)))
        : undefined,
    })
    // Compare normalized bounds to detect recipe-overrides overrides.
    const boundsEqual = (
      left: ReturnType<typeof normalizeBounds>,
      right: ReturnType<typeof normalizeBounds>,
    ) => left.any === right.any && left.not === right.not && left.min === right.min && left.max === right.max
    const value: string[] = ((((displayRecipe as unknown) as { substatsV?: number[] }).substatsV) ?? []).map(String)
    const isSelected = (v: number) => {
      const subsV = ((displayRecipe as unknown as { substatsV?: number[] }).substatsV) ?? []
      return subsV.includes(v)
    }
    const isFixed = (v: number) => {
      const fixedV = ((displayRecipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
      return fixedV.includes(v)
    }
    const getBounds = (vKey: number) => {
      return (recipe.substatRollBoundsV)?.[vKey]
    }
    const getDisplayBounds = (vKey: number) => {
      return (displayRecipe.substatRollBoundsV)?.[vKey]
    }
    const setBounds = (vKey: number, bounds?: { min?: number; max?: number; any?: boolean; not?: boolean }) => {
      applySingleSubstatBounds(vKey, () => {
        if (!bounds) return null
        return { ...bounds }
      })
    }
    // Badge scale (left → right): max:4 ← max:3 ← … ← max:0 ← ¬ ← ★ → min:0 → min:1 → … → min:5
    // Left-click (cycleForward) steps rightward; right-click (cycleBackward) steps leftward.
    // At min:5, left-click wraps back to ★. At max:4, right-click wraps back to ★.
    const cycleForward = (vKey: number, e?: React.MouseEvent) => {
      if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
      const b = getBounds(vKey)
      const isNot = b?.not === true
      const isAny = !isNot && (Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined)))
      const hasMax = !isNot && typeof b?.max === 'number'
      const hasMin = !isNot && typeof b?.min === 'number'
      if (isAny) {
        setBounds(vKey, { min: 0 })                                          // ★ → min:0
      } else if (hasMin) {
        const n = Math.max(0, Math.min(5, Number(b?.min)))
        if (n < 5) setBounds(vKey, { min: n + 1 })                           // min:n → min:(n+1)
        else setBounds(vKey, { any: true })                                  // min:5 → ★ (right-end wrap)
      } else if (isNot) {
        setBounds(vKey, { any: true })                                       // ¬ → ★
      } else if (hasMax) {
        const n = Math.max(0, Math.min(4, Number(b?.max)))
        if (n > 0) setBounds(vKey, { max: n - 1 })                           // max:n → max:(n-1)
        else setBounds(vKey, { not: true })                                  // max:0 → ¬
      } else {
        setBounds(vKey, { any: true })
      }
    }

    const cycleBackward = (vKey: number, e?: React.MouseEvent) => {
      if (e) { try { e.preventDefault(); e.stopPropagation() } catch {} }
      const b = getBounds(vKey)
      const isNot = b?.not === true
      const isAny = !isNot && (Boolean(b?.any) || (!b || (b.min === undefined && b.max === undefined)))
      const hasMax = !isNot && typeof b?.max === 'number'
      const hasMin = !isNot && typeof b?.min === 'number'
      if (isAny) {
        setBounds(vKey, { not: true })                                       // ★ → ¬
      } else if (isNot) {
        setBounds(vKey, { max: 0 })                                          // ¬ → max:0
      } else if (hasMax) {
        const n = Math.max(0, Math.min(4, Number(b?.max)))
        if (n < 4) setBounds(vKey, { max: n + 1 })                           // max:n → max:(n+1)
        else setBounds(vKey, { any: true })                                  // max:4 → ★ (left-end wrap)
      } else if (hasMin) {
        const n = Math.max(0, Math.min(5, Number(b?.min)))
        if (n <= 0) setBounds(vKey, { any: true })                           // min:0 → ★
        else setBounds(vKey, { min: n - 1 })                                 // min:n → min:(n-1)
      } else {
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
        const prevV = ((recipe as unknown as { substatsV?: number[] }).substatsV) ?? []
        const nextV = [...prevV, vKey]
        const nextLen = nextV.length
        const bVAll = { ...((recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>) }
        bVAll[vKey] = { any: true }
        const nextMin = (recipe.autoMinCount ? Math.min(4, countPositiveSubstats(nextV, bVAll)) : ((recipe.minCount === 0 && nextLen > 0) ? 1 : recipe.minCount)) as 0 | 1 | 2 | 3 | 4
        onChange(normalizeKeepWithAuto({ ...recipe, substatsV: nextV, minCount: nextMin, substatRollBoundsV: bVAll }))
        return
      }
      // Selected (locked or not) -> remove entirely
      const prevSubsV = ((recipe as unknown as { substatsV?: number[] }).substatsV) ?? []
      const nextSubsV = prevSubsV.filter((v) => v !== vKey)
      const prevFixedV = ((recipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
      const nextFixedV = prevFixedV.filter((v) => v !== vKey)
      // prune bounds for substat (variant-keyed)
      const bVAll = { ...((recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>) }
      const { [vKey]: _omit, ...restV } = bVAll
      const prunedV: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = restV
      const nextMin = (recipe.autoMinCount ? Math.min(4, countPositiveSubstats(nextSubsV, prunedV)) : (recipe.minCount > nextSubsV.length ? (nextSubsV.length as 0 | 1 | 2 | 3 | 4) : recipe.minCount)) as 0 | 1 | 2 | 3 | 4
      // Check if this removal deactivates Milestone Thresholds; if so, normalize to Early.
      onChange(normalizeKeepWithAuto({ ...recipe, substatsV: nextSubsV, fixedSubstatsV: nextFixedV, substatRollBoundsV: prunedV, minCount: nextMin }))
    }
    // Lock badge toggle: ensures the substat is selected before flipping fixed state.
    const toggleSubstatLock = (vKey: number) => {
      const selected = isSelected(vKey)
      const fixed = isFixed(vKey)
      const prevSubs = ((recipe as unknown as { substatsV?: number[] }).substatsV) ?? []
      const prevFixed = ((recipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
      const boundsSource = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
      if (!selected) {
        const nextSubs = [...prevSubs, vKey]
        const nextFixed = Array.from(new Set([...prevFixed, vKey]))
        const nextLen = nextSubs.length
        const nextBounds: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = { ...(boundsSource as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>), [vKey]: { any: true } }
        const nextMin = (recipe.autoMinCount ? Math.min(4, countPositiveSubstats(nextSubs, nextBounds)) : ((recipe.minCount === 0 && nextLen > 0) ? 1 : Math.min(recipe.minCount, nextLen))) as 0 | 1 | 2 | 3 | 4
        const nextRecipe = normalizeKeepWithAuto({
          ...recipe,
          substatsV: nextSubs,
          fixedSubstatsV: nextFixed,
          minCount: nextMin,
          substatRollBoundsV: nextBounds,
        })
        onChange(nextRecipe)
        return
      }
      if (!fixed) {
        const nextFixed = Array.from(new Set([...prevFixed, vKey]))
        onChange(normalizeKeepWithAuto({ ...recipe, fixedSubstatsV: nextFixed }))
        return
      }
      const nextFixed = prevFixed.filter((v) => v !== vKey)
      const nextRecipe = normalizeKeepWithAuto({ ...recipe, fixedSubstatsV: nextFixed })
      onChange(nextRecipe)
    }

    // Emit Markdown-friendly copy so the substat roll indicator can drop straight into MarkdownTooltip without JSX wrappers.
    const rollIndicatorTooltip = [
      t('rollIndicatorTip1'),
      t('rollIndicatorTip2'),
      t('rollIndicatorTip3'),
    ].join('\n')

    const renderSubstatToggle = (variant: StatVariant, options?: { dataTourId?: string }) => {
      const singleBounds = getBounds(variant)
      const presenceState = multiEditActive ? getSubstatPresence(variant) : (isSelected(variant) ? 'all' : 'none')
      const lockState = multiEditActive ? getSubstatLockState(variant) : (isFixed(variant) ? 'all' : 'none')
      const rollMode = multiEditActive ? getRollMode(variant) : (() => {
        if (singleBounds?.not === true) return { kind: 'not', presence: isSelected(variant) ? 1 : 0 } as RollMode
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
      const displayBounds = multiEditActive ? getBounds(variant) : getDisplayBounds(variant)
      const indicatorWarning = (() => {
        // Avoid mixing recipe-overrides overlays with multi-edit preview.
        if (multiEditActive) return false
        // Only show overrides when recipe overrides altered the display recipe.
        if (displayRecipe === recipe) return false
        // Keep warnings off hidden indicators to reduce noise.
        if (!displaySelected) return false
        // Compare the stored vs effective bounds for this variant.
        const baseBounds = normalizeBounds(getBounds(variant))
        const overrideBounds = normalizeBounds(getDisplayBounds(variant))
        return !boundsEqual(baseBounds, overrideBounds)
      })()
      const indicatorWarningTooltip = indicatorWarning
        ? t('builderSubstatMinRecipeOverridesOverrideTooltip')
        : ''
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
          if (rollMode.kind === 'not') {
            return displaySelected ? { wildcard: false, not: true, tooltip: rollIndicatorTooltip } : undefined
          }
          return undefined
        }
        const isNotSub = displayBounds?.not === true
        const hasMin = !isNotSub && typeof displayBounds?.min === 'number'
        const minVal = hasMin ? Math.max(0, Math.min(5, Number(displayBounds?.min))) : undefined
        const hasMax = !isNotSub && typeof displayBounds?.max === 'number' && isFinite(displayBounds.max ?? NaN)
        const maxVal = hasMax ? Math.max(0, Math.min(4, Number(displayBounds?.max))) : undefined
        const wildcard = !isNotSub && (Boolean(displayBounds?.any) || (!hasMin && !hasMax))
        return displaySelected
          ? {
              wildcard,
              ...(isNotSub ? { not: true } : {}),
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
            color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
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
        substatHint.onOpen()
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
        setSubstatMenuTargetText(null)
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
          color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
          transition: 'background-color .15s, border-color .15s, color .15s',
          '&[data-interactive-hover="true"]': {
            '--sub-lock-hover-opacity': lockHoverBaseOpacity,
          },
          '&[data-interactive-hover="true"]:not(.Mui-selected)': {
            backgroundColor: 'transparent !important',
          },
          '&.Mui-selected[data-interactive-hover="true"]': {
            backgroundColor: (theme.vars?.palette.action.selected ?? theme.palette.action.selected),
            color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
          },
          '&.Mui-selected[data-interactive-hover="true"] .roll-label': {
            color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
          },
        } as (SystemStyleObject<Theme> & Record<string, unknown>)
        return base
      }
      // The unfamiliar mode-damage chips explain themselves on
      // hover (description + shared context note); classic chips keep no whole-chip tooltip.
      const anomalousTooltip = anomalousSubstatTooltipMarkdown(Number(variant), t)
      const toggleButtonNode = (
        <ToggleButton
          key={variant}
          value={`${variant}`}
          selected={buttonSelected}
          disabled={!allowedSubstatOptions.includes(variant)}
          onClick={handleClick}
          onMouseMove={substatHint.triggerProps.onMouseMove}
          onContextMenu={handleContextMenu}
          onMouseLeave={() => {
            setInteractiveHoverVariant((current) => (current === variant ? null : current))
            substatHint.triggerProps.onMouseLeave()
          }}
          sx={toggleButtonSx}
          data-tour-id={options?.dataTourId}
          data-interactive-hover={interactiveHover ? 'true' : undefined}
        >
          <SubstatToggleDisplay
            label={t(statVariantI18nKey(variant))}
            labelColor={statTextColors[variant]}
            locked={lockState !== 'none'}
            selected={displaySelected}
            {...(indicator ? { indicator } : {})}
            indicatorWarning={indicatorWarning}
            {...(indicatorWarningTooltip ? { indicatorWarningTooltip } : {})}
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
      // Wrap only anomalous chips; MUI's context-based ToggleButtonGroup tolerates the wrapper.
      return anomalousTooltip
        ? <MarkdownTooltip key={variant} markdown={anomalousTooltip}>{toggleButtonNode}</MarkdownTooltip>
        : toggleButtonNode
    }
    const effectiveMinDraft = substatMenuDraft?.min ?? activeMenuInfo?.minValue ?? null
    const effectiveMaxDraft = substatMenuDraft?.max ?? activeMenuInfo?.maxValue ?? null
    // Derive the "not" state: explicit draft wins, then fall back to the active info rollKind.
    const effectiveNotDraft: boolean = substatMenuDraft
      ? (substatMenuDraft.not === true)
      : (activeMenuInfo?.rollKind === 'not')
    const statLabelText = activeMenuInfo ? t(statVariantI18nKey(activeMenuInfo.variant)) : ''
    const statHighlightColor = activeMenuInfo && colorStatTexts
      ? (substatColors[activeMenuInfo.variant]?.fg ?? theme.palette.primary.main)
      : undefined
    // Summarize the currently opened substat across the active recipe(s).
    // Reuses the Builder math so we can display lock/min/max/target
    // pills without rebuilding the entire rule set.
    const computeMenuValueSummary = () => {
      if (!activeMenuInfo) return null
      const label = statLabelText
      if (!label) return null
      const variantId = activeMenuInfo.variant
      const recipes = (() => {
        if (multiEditActive) {
          if (multiProjectedRecipes && multiProjectedRecipes.length > 0) return multiProjectedRecipes
          if (multiSourceRecipes && multiSourceRecipes.length > 0) return multiSourceRecipes
          return []
        }
        return [recipe]
      })()
      if (!recipes || recipes.length === 0) return null
      const starFallback = (substatTargets.anyRankDefaultsTo ?? 6) as Star
      const isRollCount = Number(variantId) === StatVariant.RollCount
      const normalizeLevel = (value: number | undefined | null): LevelMilestone => {
        if (value != null && LEVEL_MILESTONES.includes(value as LevelMilestone)) return value as LevelMilestone
        return LEVEL_MILESTONES[0]!
      }
      const metrics = recipes.map((recipe) => {
        const star = starForRankCode(Number(recipe.rankCode ?? 0), starFallback)
        const baseValueRaw = baseMinForStarV(Number(variantId), star, substatTargets)
        const baseValue = Math.max(0, baseValueRaw ?? 0)
        const rarityCode = (recipe.rarityMode === 'auto') ? resolveAutoRarityCode(recipe) : recipe.rarityCode
        const rollLevels = Array.from(rollLevelsForRarityCode(rarityCode)).sort((a, b) => a - b)
      const baselineMode = deriveRollBaselineMode(recipe)
      const minLevel = normalizeLevel(recipe.minLevel)
      const maxLevel = normalizeLevel(recipe.maxLevel)
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
        let maxRolls: number
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
      // Draft overrides as an entry so the shared resolver — not a local copy of its
      // math — answers "threshold at roll N". It handles the factory fallback, the
      // explicit overrides, the omitted-position clamp, AND the engine-applied floor,
      // so these chips agree with the roll-target placeholders and the engine.
      const draftTargetEntry = buildTargetEntryFromDraft(targetDraftBase, targetDraftRolls)
      const targetValueForRoll = (base: number, rolls: number): number => (
        // Roll Count is a literal count, not a stat threshold — no target math applies.
        isRollCount ? rolls : resolveRollTargetValue(draftTargetEntry, rolls, base, Number(variantId))
      )
      // Values are already engine-applied integers; format without re-rounding.
      const formatValue = (value: number) => numberFormatter.format(value)
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
      // Advertise the applied threshold, like every other non-editable surface.
      ? t('builderSubstatMenuRollTargetsHint', { value: numberFormatter.format(engineAppliedTargetValue(targetContext.baseValue, targetContext.variant)) })
      : t('builderSubstatMenuRollTargetsHintFallback')
    // Anomalous mode-damage targets are decimal (HSF stores hundredths of a
    // percent); classic stats stay integral. Step size comes from the shared
    // spinner-step SSOT so the arrows move by the granularity RSL Helper shows.
    const targetAllowsDecimals = activeMenuInfo ? isAnomalousSubstatVariant(Number(activeMenuInfo.variant)) : false
    const targetStepSize = activeMenuInfo ? targetValueStepForVariant(Number(activeMenuInfo.variant)) : 1
    const stepTargetBase = (delta: number) => {
      if (!activeMenuInfo) return
      const seedValue = targetDraftBase ?? resolveTargetFallbackValue(0)
      const nextValue = clampTargetValue((seedValue ?? 0) + delta * targetStepSize, Number(activeMenuInfo.variant))
      applyTargetSelection(nextValue, targetDraftRolls)
    }
    const stepTargetRoll = (index: number, delta: number) => {
      if (!activeMenuInfo) return
      const nextRolls = cloneTargetRolls(targetDraftRolls)
      const current = nextRolls[index]
      const seedValue = current ?? resolveTargetFallbackValue(index + 1)
      nextRolls[index] = clampTargetValue((seedValue ?? 0) + delta * targetStepSize, Number(activeMenuInfo.variant))
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
      // When the "not" toggle is active on the max row, show ¬ and suppress the value.
      const isNotActive = mode === 'max' && effectiveNotDraft
      const displayText = (mixed || isNotActive)
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
        isLight: colorScheme === 'light',
      })
      const glyph = mixed ? '' : isNotActive ? '¬' : (mode === 'min' ? '≥' : '≤')
      const glyphColor = (mode === 'max') ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.success.main ?? theme.palette.success.main)
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
    const applyNotSelection = () => {
      if (!activeMenuInfo) return
      ensureSubstatPresenceForBounds(activeMenuInfo.variant)
      setSubstatMenuDraft((prev) => ({
        min: null,
        max: null,
        not: true,
        targetBase: prev?.targetBase ?? null,
        targetRolls: cloneTargetRolls(prev?.targetRolls),
      }))
      if (multiEditActive && multiEdit) {
        commitRollPatch(activeMenuInfo.variant, { not: true, any: false, min: null, max: null })
      } else {
        applySingleSubstatBounds(activeMenuInfo.variant, () => ({ not: true }))
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
      // Keep the raw text so partially-typed decimals ("1.") are not eaten mid-keystroke.
      setSubstatMenuTargetText({ key: 'base', text: event.target.value })
      const nextValue = clampTargetValue(parseNumericInput(event.target.value), Number(activeMenuInfo.variant))
      applyTargetSelection(nextValue, targetDraftRolls)
    }
    const handleTargetRollChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!activeMenuInfo) return
      // Keep the raw text so partially-typed decimals ("1.") are not eaten mid-keystroke.
      setSubstatMenuTargetText({ key: `roll:${index}`, text: event.target.value })
      const nextValue = clampTargetValue(parseNumericInput(event.target.value), Number(activeMenuInfo.variant))
      const nextRolls = cloneTargetRolls(targetDraftRolls)
      nextRolls[index] = nextValue
      applyTargetSelection(targetDraftBase, nextRolls)
    }
    // Blur handler shared by the base + roll inputs: drop the text draft for that key.
    const releaseTargetText = (key: string) => () => {
      setSubstatMenuTargetText((current) => (current?.key === key ? null : current))
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
    // 'not' appears first in the max group (before 0), reflecting the badge cycle order.
    const MAX_SEQUENCE = ['any', 'not', '0', '1', '2', '3', '4'] as const
    type MinOption = (typeof MIN_SEQUENCE)[number]
    type MaxOption = (typeof MAX_SEQUENCE)[number]
    const MIN_CYCLE_SEQUENCE: MinOption[] = ['any', '0', '1', '2', '3', '4', '5']
    const MIN_LABEL_SEQUENCE: MinOption[] = ['any', '0', '1', '2', '3', '4', '5']
    const MAX_LABEL_SEQUENCE: MaxOption[] = ['not', '0', '1', '2', '3', '4']
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
        ? (maxGroupValue == null && !effectiveNotDraft ? 'any' : undefined)
        : (String(minGroupValue) as MinOption))
    const maxToggleValue: MaxOption | undefined | null = maxMixed
      ? null
      : (effectiveNotDraft
        ? 'not'
        : (maxGroupValue == null
          ? (minGroupValue == null ? 'any' : undefined)
          : (String(maxGroupValue) as MaxOption)))
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
      if (key === 'not') {
        applyNotSelection()
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
      if (effectiveNotDraft) return 'not'
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
      if (minGroupValue == null && (maxGroupValue != null || effectiveNotDraft)) {
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
        applyMaxSelection('not')
        return
      }
      if (!effectiveNotDraft && maxGroupValue == null) {
        if (minGroupValue != null) {
          applyMaxSelection('not')
          return
        }
      }
      const current = resolveMaxCycleKey()
      if (current === 'any') {
        applyMaxSelection('not')
        return
      }
      const idx = MAX_LABEL_SEQUENCE.indexOf(current)
      if (idx === -1) {
        applyMaxSelection('not')
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
  color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
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
      const highlight = mode === 'min'
        ? (themeInner.vars?.palette.success.main ?? themeInner.palette.success.main)
        : (themeInner.vars?.palette.error.main ?? themeInner.palette.error.main)
      const selectedText = themeInner.vars?.palette.common.white ?? themeInner.palette.common.white
      const baseBorder = themeInner.vars?.palette.text.secondary ?? themeInner.palette.text.secondary
      const hoverGlow = TINT.neutralHoverGlow
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
          color: themeInner.vars?.palette.text.secondary ?? themeInner.palette.text.secondary,
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
          backgroundColor: themeInner.vars?.palette.action.hover ?? themeInner.palette.action.hover,
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
    // Tour ids live only on three row-1 chips; passing them per variant keeps the row renderer
    // uniform instead of forking row 1 into its own block.
    const substatTourId = (variant: StatVariant): string | undefined => variant === StatVariant.SPD
      ? 'builder.substat.spd'
      : variant === StatVariant.CR
        ? 'builder.substat.cr'
        : variant === StatVariant.CDMG
          ? 'builder.substat.cdmg'
          : undefined
    // One row of substat chips. Extracted so the classic and anomalous Collapse halves render
    // from a single definition — mirrors SafeguardBuilderPanel's renderSubstatRow (SSOT).
    const renderSubstatRow = (rowVariants: readonly StatVariant[]) => (
      // Each row's first variant is unique and stable — use it as the row key.
      <ToggleButtonGroup
        key={String(rowVariants[0])}
        size="small"
        value={value}
        onChange={() => {}}
        sx={substatToggleGroupSx}
      >
        {rowVariants.map((variant) => {
          const dataTourId = substatTourId(variant)
          return renderSubstatToggle(variant, dataTourId ? { dataTourId } : undefined)
        })}
      </ToggleButtonGroup>
    )
    const toggleGroupContent = (
      <>
        {/* Classic rows collapse under the FIRST header chevron ('substats'):
            row 1 SPD/CR%/CDMG%/ACC/RES, row 2 the HP/ATK/DEF flats+percents. */}
        <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {[STAT_VARIANTS_PRIORITY_ROW1, STAT_VARIANTS_PRIORITY_ROW2].map(renderSubstatRow)}
          </Box>
        </Collapse>
        {/* Accessory-only mode-scoped damage substats (⚔ dealt, 🛡 taken), collapsed under their
            OWN chevron ('substatsAnomalous') and folded away by default. Rows render
            unconditionally like every other stat row; the per-chip disabled state (via
            allowedSubstatOptions) greys them out when the slot scope has no jewelry slot. */}
        <Collapse in={!builderCollapsed.substatsAnomalous} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {[ANOMALOUS_SUBSTAT_VARIANTS_ROW_PLUS, ANOMALOUS_SUBSTAT_VARIANTS_ROW_MINUS].map(renderSubstatRow)}
          </Box>
        </Collapse>
      </>
    )
    return (
      <>
        {toggleGroupContent}
        {substatHint.overlay}
        <Menu
          open={menuOpen}
          onClose={handleSubstatMenuClose}
          anchorReference="anchorPosition"
          {...(menuOpen ? { anchorPosition: { top: menuAnchor.y, left: menuAnchor.x } } : {})}
          keepMounted
          slotProps={{
            paper: { ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard: substatMenuGuard,
              onRequestClose: handleSubstatMenuClose,
              closeLabel: t('close'),
              sx: { minWidth: SUBSTAT_MENU_WIDTH_PX },
            }), ref: substatMenuPaperRef },
            list: { dense: true, disablePadding: true, sx: { py: 0 } },
          }}
        >
          {activeMenuInfo ? [
              <MenuItem
                key="lock"
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
            </MenuItem>,
              <MenuItem
                key="min"
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
            </MenuItem>,
              <MenuItem
                key="max"
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
                  <MarkdownTooltip
                    render={<BuilderTooltipContent text={t('builderSubstatNotTooltip')} />}
                  >
                    <ToggleButton
                      value="not"
                      aria-label={t('builderSubstatMenuNot')}
                      data-mixed={maxMixed ? 'true' : undefined}
                    >
                      <Box component="span" className="menu-roll-label">{'¬'}</Box>
                    </ToggleButton>
                  </MarkdownTooltip>
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
            </MenuItem>,
            activeMenuInfo ? (
              <MenuItem
                key="targets"
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
                      value={(substatMenuTargetText?.key === 'base' ? substatMenuTargetText.text : null) ?? targetDraftBase ?? ''}
                      onChange={handleTargetBaseChange}
                      onBlur={releaseTargetText('base')}
                      onClick={(event) => { event.stopPropagation() }}
                      disabled={targetInputsDisabled}
                      sx={(theme) => ({
                        width: `${SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX}px`,
                        '& input': {
                          textAlign: 'right',
                          paddingRight: theme.spacing(1),
                          paddingLeft: theme.spacing(0.25),
                        },
                        ...HIDE_NATIVE_NUMBER_SPINNER_SX,
                      })}
                      slotProps={{
                        htmlInput: {
                          // Decimal affordances only where decimals are legal (anomalous grid).
                          ...(targetAllowsDecimals
                            ? { inputMode: 'decimal' as const, step: 'any' }
                            : { inputMode: 'numeric' as const, pattern: '[0-9]*' }),
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
                        },
                        input: {
                          endAdornment: (
                            <NumberSpinnerAdornment
                              ariaLabel={t('builderSubstatMenuRollTargetsBase')}
                              disabled={targetInputsDisabled}
                              onStep={stepTargetBase}
                            />
                          ),
                        },
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
                      // Both sides are already engine-applied — format without re-rounding.
                      ? t('builderSubstatMenuRollTargetsWarning', {
                        current: numberFormatter.format(comparableValue),
                        previous: numberFormatter.format(previousComparableValue),
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
                          value={(substatMenuTargetText?.key === `roll:${rollIndex - 1}` ? substatMenuTargetText.text : null) ?? rollValue ?? ''}
                          onChange={handleTargetRollChange(rollIndex - 1)}
                          onBlur={releaseTargetText(`roll:${rollIndex - 1}`)}
                          onClick={(event) => { event.stopPropagation() }}
                          disabled={disabled}
                          sx={(themeInner) => ({
                            width: `${SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX}px`,
                            '& input': {
                              textAlign: 'right',
                              paddingRight: themeInner.spacing(1),
                              paddingLeft: themeInner.spacing(0.25),
                            },
                            ...HIDE_NATIVE_NUMBER_SPINNER_SX,
                          })}
                          slotProps={{
                            htmlInput: {
                              // Decimal affordances only where decimals are legal (anomalous grid).
                              ...(targetAllowsDecimals
                                ? { inputMode: 'decimal' as const, step: 'any' }
                                : { inputMode: 'numeric' as const, pattern: '[0-9]*' }),
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
                            },
                            input: {
                              endAdornment: (
                                <NumberSpinnerAdornment
                                  ariaLabel={label}
                                  disabled={disabled}
                                  onStep={(delta) => stepTargetRoll(rollIndex - 1, delta)}
                                />
                              ),
                              sx: { '& > *': { alignItems: 'center' } },
                            },
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
            ) : null,
          ] : null}
        </Menu>
      </>
    )
  })()

  // Show clear button for slots when any are selected; placeholder otherwise.
  const slotsClearButton = (() => {
    if (multiEditActive && multiSummary) {
      if (slotsPatch?.clear) {
        return (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
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
                value: (multiSlotsField?.value as BuilderRecipe['artifactTypes']) ?? (recipe.artifactTypes ?? []),
                status: 'common',
                patch: { clear: true },
              })
            }}
          />
        )
        : (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
    }
    const hasSlots = Array.isArray(recipe.artifactTypes) && (recipe.artifactTypes?.length ?? 0) > 0
    return hasSlots
      ? (
        <ClearIconButton
          size="small"
          aria-label={t('builderClearSlots')}
          tooltip={t('builderClearSlots')}
          onClick={() => update('artifactTypes', [])}
        />
      )
      : (<Box sx={CLEAR_BUTTON_STRUT_SX} />)
  })()

  // Min required rolls section: auto + manual toggles + warning text.
  const minRollsContent = (() => {
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
      const value = Number(recipe.lockedMinRequiredRolls ?? 0)
      if (Number.isFinite(value) && value > 0) return Math.max(0, Math.min(5, value))
      return null
    })()
    if (resolvedLockedMin) {
      tooltipLines.push(t('builderLockedMinRequiredRollsLabel', { count: resolvedLockedMin }))
    }
    const tooltipContent = (<BuilderTooltipContent text={tooltipLines.join('\n')} />)
    const lockIconEnabled = lockedSubstatsExist
    const autoState = getMinRequiredRollsTriState('auto')
    // Warning text shown in the chip-like area below the toggle buttons.
    // Moved here from the old standalone warning row so it collapses with Min Rolls.
    const allSubsV = ((recipe as unknown as { substatsV?: number[] }).substatsV) ?? []
    const allFixedV = ((recipe as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV) ?? []
    // "Not" substats carry a ¬ condition and are orthogonal to min-rolls warnings;
    // exclude them so positive-substat-only counts feed all warning thresholds.
    const boundsV = (recipe.substatRollBoundsV ?? {}) as Record<number, { not?: boolean }>
    const subsV = allSubsV.filter(v => boundsV[v]?.not !== true)
    const fixedV = allFixedV.filter(v => boundsV[v]?.not !== true)
    const chosenCount = subsV.length
    const fixedCount = fixedV.length
    const warnMin = (chosenCount < recipe.minCount) && !(chosenCount === 0 && (recipe.autoMinRequiredRolls !== false))
    const warnFixed = fixedCount > 4
    // Locked substats that fill all Required slots make any additional selections dead weight
    // (unless Flex is active, which rotates them into separate rules instead).
    const hasUnlockedSelected = chosenCount > fixedCount
    const flexActive = recipe.autoSubstatFlex === true && canFlexSubstats
    const warnReqBelowLocked = (recipe.minCount ?? 0) < fixedCount
    const warnReqEqLocked = (recipe.minCount === fixedCount) && hasUnlockedSelected && !flexActive
    // Warn when a manual global Min Required Rolls is set but zero substats are selected — it will never fire.
    const warnMinRollsWithoutSubstats = (() => {
      if (chosenCount !== 0) return false
      if (recipe.autoMinRequiredRolls !== false) return false
      return (recipe.minRequiredRolls ?? 0) > 0
    })()
    // Detect an impossible-by-target case: best-case sum of per-stat caps is below the global min.
    const warnImpossible = (() => {
      if (!(recipe.autoMinRequiredRolls === false) || !recipe.minRequiredRolls || recipe.minRequiredRolls <= 0) return false
      if (!Array.isArray(subsV) || subsV.length === 0) return false
      const m = Math.max(recipe.minCount, fixedCount)
      if (m <= 0) return false
      const supportsFive = (() => {
        const rc = Number((recipe as unknown as { rarityCode?: number }).rarityCode ?? 0)
        const mode = (recipe as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode
        if (rc === RarityCode.Mythical || rc === RarityCode.LTE_Mythical) return true
        if (rc === RarityCode.Any) return true
        // When Auto and the global target is 5, treat as 5-cap capable.
        if (mode === 'auto' && (recipe.minRequiredRolls ?? 0) >= 5) return true
        return false
      })()
      const defaultCap = supportsFive ? 5 : 4
      const capFor = (v: number): number => {
        const b = (recipe.substatRollBoundsV ?? {})[Number(v)]
        const hasMax = (typeof b?.max === 'number' && isFinite(b.max))
        const raw = hasMax ? Number(b!.max) : defaultCap
        return Math.max(0, Math.min(defaultCap, raw))
      }
      const fixedCaps = fixedV.map(capFor)
      const optional = subsV.filter(v => !fixedV.includes(v))
      const optCaps = optional.map(capFor).sort((a, b) => b - a)
      let sumCaps = 0
      // Include all fixed caps, then highest optional caps to fill to m.
      for (const c of fixedCaps) sumCaps += c
      for (let i = 0; i < Math.max(0, m - fixedCaps.length); i++) { sumCaps += (optCaps[i] ?? 0) }
      return sumCaps < (recipe.minRequiredRolls ?? 0)
    })()
    const warnMsg = warnMin
      ? `Warning: Required (${recipe.minCount}) > chosen (${chosenCount})`
      : (warnFixed
          ? `Warning: Fixed substats (${fixedCount}) exceed 4 — extra will be ignored`
          : (warnReqBelowLocked
              ? `Warning: Required (${recipe.minCount}) is below locked (${fixedCount}); requirement will clamp to ${fixedCount}`
              : (warnReqEqLocked
                  ? `Warning: Required (${recipe.minCount}) equals locked (${fixedCount}); other selected (${chosenCount - fixedCount}) will be ignored`
                  : (warnImpossible
                      ? t('builderMinRequiredRollsImpossibleWarn')
                      : (warnMinRollsWithoutSubstats
                          ? t('builderMinRequiredRollsNoSubstatsWarn')
                          : '')))))
    return (
      <>
        {/* Keep the German "Mindestwürfe" label from wrapping under the toggles. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <BuilderSectionHeader
            id="minRolls"
            collapsed={builderCollapsed}
            onCollapsedChange={setBuilderCollapsed}
            labelSx={{ m: 0 }}
            dataTourId="builder.min-rolls.label"
          >
            <MarkdownTooltip render={tooltipContent} ellipsisTitle={t('builderMinRequiredRolls')}>
              <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.minRolls, minRollsSectionDirty)}>{t('builderMinRequiredRolls')}</Box>
            </MarkdownTooltip>
          </BuilderSectionHeader>
          {/* Reset routes through the same set-auto action the Auto toggle uses, so the aggregate-min
              state is normalized (commitRollState/commitMultiRollState → normalizeKeepWithAuto). */}
          {renderSectionClearButton(minRollsSectionDirty, t('builderClearMinRolls'), () => {
            if (multiEditActive && multiEdit) commitMultiRollState({ auto: true, manual: 0, locked: 0 })
            else commitRollState(applyAggregateRollAction(aggregateRollStateFromRecipe(recipe), { type: 'set-auto' }))
          })}
        </Box>
        <Collapse in={!builderCollapsed.minRolls} timeout="auto" unmountOnExit>
        {/* Inline-flex column wrapper so the warning row below is exactly as wide as the buttons row.
            inline-flex shrinks to content; the buttons determine the width; the warning row inherits it. */}
        <Box sx={{ display: 'inline-flex', flexDirection: 'column', maxWidth: '100%' }}>
        {/* Relative wrapper so the recipe-overrides badge can be anchored above the button row. */}
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <Box
          data-tour-id="builder.min-rolls"
          sx={{
            display: 'flex',
            gap: 0.5,
            // Buttons shrink instead of wrapping when the panel is narrowed by the splitter.
            flexWrap: 'nowrap',
            // overflow:visible so the absolutely-positioned lock icon can paint outside the button bounds.
            overflow: 'visible',
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
                data-tour-id={`builder.min-rolls.button.${n}`}
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
                        // Shared neutral hover-glow tint — adapts per scheme, legible in both dark and light.
                        const glow = TINT.neutralHoverGlow
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
                          color: lockedActive ? (theme.vars?.palette.text.primary ?? theme.palette.text.primary) : (lockedMixed ? mixedTextColor : (theme.vars?.palette.text.primary ?? theme.palette.text.primary)),
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
        {minRequiredRollsOverrideActive
          ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
              rollStateLabel(recipe.autoMinRequiredRolls, recipe.minRequiredRolls),
              rollStateLabel(effectiveRecipe.autoMinRequiredRolls, effectiveRecipe.minRequiredRolls),
            ))
          : null}
        </Box>{/* end relative badge wrapper */}
        {/* Warning chip row — always reserves chip height (same as Flex chip in Required Substats).
            lineHeight:0.9 makes 2 caption lines = 21.6px ≤ BUILDER_STATUS_CHIP_HEIGHT_PX (22px)
            so WebkitLineClamp:2 can draw the ellipsis within the fixed area.
            width:0 + minWidth:'100%' is the circular-dependency trick: the warning contributes 0
            to the inline-flex container's intrinsic-size calculation (so the buttons drive the width),
            then stretches to 100% of the resolved container — avoiding animation-time layout blowout. */}
        <Box sx={{ mt: 0.5, width: 0, minWidth: '100%', height: BUILDER_STATUS_CHIP_HEIGHT_PX, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {warnMsg && (
            <EllipsisTooltip title={warnMsg} wrap="block">
              <Typography
                data-ellipsis-target
                variant="caption"
                color="warning.main"
                sx={{
                  // 2 lines × 12px × 0.9 = 21.6px ≤ BUILDER_STATUS_CHIP_HEIGHT_PX (22px)
                  // so both lines fit and WebkitLineClamp can draw the ellipsis within the container
                  lineHeight: 0.9,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {warnMsg}
              </Typography>
            </EllipsisTooltip>
          )}
        </Box>
        </Box>{/* end inline-flex column wrapper */}
        </Collapse>
      </>
    )
  })()

  // Required substats section: flex chip + required count toggles.
  const requiredSubstatsContent = (() => {
    type FlexChipState = 'on' | 'off' | 'disabled' | 'mixed'
    let flexState: FlexChipState
    let chipEnabled: boolean
    if (!multiEditActive || !multiSourceRecipes) {
      chipEnabled = canFlexSubstats
      flexState = chipEnabled
        ? (recipe.autoSubstatFlex ? 'on' : 'off')
        : 'disabled'
    } else {
      const total = multiSourceRecipes.length
      const enabledCount = multiSourceRecipes.filter((recipe) => canEnableSubstatFlex(recipe)).length
      const onCount = multiSourceRecipes.filter((recipe) => recipe.autoSubstatFlex === true).length
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <BuilderSectionHeader
            id="requiredSubstats"
            collapsed={builderCollapsed}
            onCollapsedChange={setBuilderCollapsed}
            labelSx={{ m: 0 }}
            dataTourId="builder.required.label"
          >
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
              <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.requiredSubstats, requiredSubstatsSectionDirty)}>{t('builderRequiredSubstats')}</Box>
            </MarkdownTooltip>
          </BuilderSectionHeader>
          {/* Reset to the section's default (Auto count, no locked substats); minCount is re-derived by
              normalizeKeepWithAuto under autoMinCount, so we never end up in a conflicting state. */}
          {renderSectionClearButton(requiredSubstatsSectionDirty, t('builderClearRequiredSubstats'), () => {
            if (multiEditActive && multiEdit) {
              // Mirror the Auto toggle's multi-edit path, plus drop locked substats.
              multiEdit.updateField('autoMinCount', { value: true, status: 'common' })
              multiEdit.updateField('minCount', { value: 0 as BuilderRecipe['minCount'], status: 'common' })
              multiEdit.updateField('autoSubstatFlex', { value: false, status: 'common' })
              multiEdit.updateField('fixedSubstatsV', { value: [] as BuilderRecipe['fixedSubstatsV'], status: 'common' })
            } else {
              userDisabledFlexRef.current = true
              onChange(normalizeKeepWithAuto({ ...recipe, autoMinCount: true, minCount: 0, fixedSubstatsV: [] }))
            }
          })}
        </Box>
        <Collapse in={!builderCollapsed.requiredSubstats} timeout="auto" unmountOnExit>
        {/* Relative wrapper so the recipe-overrides badge can be anchored above the button row. */}
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={requiredCountValue}
          onChange={(_, v) => {
            if (!v) return
            if (multiEditActive && multiEdit) {
              if (v === 'auto') {
                multiEdit.updateField('autoMinCount', { value: true, status: 'common' })
                multiEdit.updateField('minCount', { value: 0 as BuilderRecipe['minCount'], status: 'common' })
                multiEdit.updateField('autoSubstatFlex', { value: false, status: 'common' })
              } else {
                const next = Number(v) as 1 | 2 | 3 | 4
                multiEdit.updateField('autoMinCount', { value: false, status: 'common' })
                multiEdit.updateField('minCount', { value: next as BuilderRecipe['minCount'], status: 'common' })
                multiEdit.updateField('autoSubstatFlex', { value: false, status: 'common' })
              }
              return
            }
            if (v === 'auto') {
              const subsV = ((recipe as unknown as { substatsV?: number[] }).substatsV) ?? []
              const nextMin = Math.min(4, subsV.length) as 0 | 1 | 2 | 3 | 4
              userDisabledFlexRef.current = true
              onChange(normalizeKeepWithAuto({
                ...recipe,
                autoMinCount: true,
                minCount: nextMin,
              }))
              return
            }
            const next = Number(v) as 1 | 2 | 3 | 4
            onChange(normalizeKeepWithAuto({
              ...recipe,
              autoMinCount: false,
              minCount: next,
            }))
          }}
          data-tour-id="builder.required"
          sx={{
            // Buttons shrink in-place instead of wrapping to a new row.
            flexWrap: 'nowrap',
            overflow: 'hidden',
            '& .MuiToggleButton-root': {
              height: TOGGLE_BUTTON_HEIGHT_PX,
              minHeight: TOGGLE_BUTTON_HEIGHT_PX,
              flex: '0 1 auto',
              minWidth: 0,
              overflow: 'hidden',
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
        {minCountOverrideActive
          ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
              minCountStateLabel(recipe.autoMinCount, recipe.minCount),
              minCountStateLabel(effectiveRecipe.autoMinCount, effectiveRecipe.minCount),
            ))
          : null}
        </Box>{/* end relative badge wrapper */}
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
        </Collapse>
      </>
    )
  })()

  // Milestone Thresholds section: early/late toggle + Auto chip.
  const milestoneThresholdsContent = (() => {
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
      const raw = (multiEditActive ? recipe : effectiveRecipe).autoRaritySupplementsThreshold
        ?? pickAutoRaritySupplementsThreshold(multiEditActive ? recipe : effectiveRecipe)
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
            : pickAutoRaritySupplementsThreshold(recipe)
          multiEdit.updateField('autoRaritySupplementsThreshold', { value: next, status: 'common' })
          return
        }
        // When an override is active, allow clicking the effective value to accept it.
        if (autoLateOverrideActive) {
          const stored = recipe.autoRaritySupplementsThreshold
          const effective = effectiveRecipe.autoRaritySupplementsThreshold
          if (stored !== effective && effective) {
            updateAutoLateThreshold(effective)
            return
          }
        }
        const curr = (recipe.autoRaritySupplementsThreshold ?? pickAutoRaritySupplementsThreshold(recipe)) as 'uncommon' | 'rare' | 'epic'
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
          // flex-shrink:1 lets this column compress under splitter pressure.
          flex: builderCollapsed.milestoneThresholds ? '0 1 auto' : `0 1 ${BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX}px`,
          width: builderCollapsed.milestoneThresholds ? 'auto' : `${BUILDER_MILESTONE_THRESHOLDS_COLUMN_WIDTH_PX}px`,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Milestone Thresholds label also clamps to the 146px column width. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <BuilderSectionHeader
            id="milestoneThresholds"
            collapsed={builderCollapsed}
            onCollapsedChange={setBuilderCollapsed}
            labelSx={{ m: 0 }}
            dataTourId="builder.thresholds.label"
          >
            <MarkdownTooltip
              ellipsisTitle={t('builderMilestoneThresholds')}
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    [
                      t('builderMilestoneThresholdsHelp'),
                      t('builderMultiMixedTooltipSuffix'),
                    ].join('\n'),
                  )}
                />
              )}
            >
              <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.milestoneThresholds, milestoneThresholdsSectionDirty)}>{t('builderMilestoneThresholds')}</Box>
            </MarkdownTooltip>
          </BuilderSectionHeader>
          {renderSectionClearButton(milestoneThresholdsSectionDirty, t('builderClearMilestoneThresholds'), () => {
            // Default keep timing is 'early'; mirror the toggle group's change paths.
            if (multiEditActive && multiEdit) multiEdit.updateField('earlyKeepMode', { value: 'early', status: 'common' })
            else updateKeepMode('early')
          })}
        </Box>
        <Collapse in={!builderCollapsed.milestoneThresholds} timeout="auto" unmountOnExit>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
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
              sx={{
                position: 'relative',
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                  minHeight: TOGGLE_BUTTON_HEIGHT_PX,
                },
              }}
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
                      if ((recipe.earlyKeepMode ?? 'early') === (effectiveRecipe.earlyKeepMode ?? 'early')) return
                      if (mode !== (effectiveRecipe.earlyKeepMode ?? 'early')) return
                      updateKeepMode(mode)
                    }}
                  >
                    {mode === 'early' ? t('builderEarlyLabel') : t('builderLateLabel')}
                  </ToggleButton>
                )
              })}
            </ToggleButtonGroup>
            {keepOverrideActive
              ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                  keepModeLabel((recipe.earlyKeepMode ?? 'early') as 'early' | 'late'),
                  keepModeLabel((effectiveRecipe.earlyKeepMode ?? 'early') as 'early' | 'late'),
                ))
              : null}
          </Box>
        </Box>
        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box component="span" sx={{ display: 'inline-flex', position: 'relative' }}>
            <MarkdownTooltip
              render={(
                <BuilderTooltipContent
                  text={buildOverrideTooltip(
                    tooltipLines.join('\n'),
                  )}
                />
              )}
            >
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
                }}
                data-tour-id="builder.thresholds.auto-chip"
              />
            </MarkdownTooltip>
            {autoLateOverrideActive
              ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                  autoLateLabel(recipe.autoRaritySupplementsThreshold),
                  autoLateLabel(effectiveRecipe.autoRaritySupplementsThreshold),
                ))
              : null}
          </Box>
        </Box>
        </Collapse>
      </FormControl>
    )
  })()

  // Sets section: metasets + sets Select, clear button, and tri-state patch controls.
  const setsContent = (() => {
    // Token helpers keep metasets + sets in a single select control.
    const tokenOf = {
      meta: (id: string) => `m:${id}`,
      set: (id: number) => `s:${id}`,
    }
    // Filter to visible metasets so hidden ones never show in the menu.
    const visibleMetasets = metasets.filter(m => m.show !== false)
    // Keep order stable by preferring visible metasets when present.
    const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
    // Normalize set selections while respecting accessory-only constraints.
    const baseSetSelections = pruneAccessoryNoSetSelections(recipe.artifactSets ?? [], allowNoSet)
    // Split include/exclude lists so UI can render both states.
    const baseSetSplit = splitArtifactSetSelections(baseSetSelections)
    // Resolve metaset order for the base recipe (or multi-edit union).
    const baseMetaIds = orderMetasets(recipe.artifactMetaSets, orderBasis)
    const metaDisplayIds = multiEditActive && multiSummary
      ? orderMetasets(
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
      // Drop the accessory-only sentinel when accessories are not in scope.
      if (!allowNoSet) union.delete(ACCESSORY_NO_SET_ID)
      return Array.from(union).sort((a, b) => a - b)
    })()
    const excludedDisplayIds = (() => {
      // Single-edit: use just the current exclusions.
      if (!multiEditActive || !multiSelectedRecipes) {
        return baseSetSplit.excluded.slice().sort((a, b) => a - b)
      }
      // Multi-edit: union all excluded sets + staged patch entries.
      const union = new Set<number>()
      for (const recipeEntry of multiSelectedRecipes) {
        const split = splitArtifactSetSelections(recipeEntry.artifactSets)
        for (const id of split.excluded) union.add(Number(id))
      }
      // Patch entries may add exclusions; merge them into the display list.
      const patchEntries = normalizeArtifactSetSelections([
        ...((setsPatch?.add ?? []) as ArtifactSetSelectionEntry[]),
        ...((setsPatch?.replace ?? []) as ArtifactSetSelectionEntry[]),
      ])
      const patchSplit = splitArtifactSetSelections(patchEntries)
      for (const id of patchSplit.excluded) union.add(Number(id))
      // Drop the accessory-only sentinel when accessories are not in scope.
      if (!allowNoSet) union.delete(ACCESSORY_NO_SET_ID)
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
    // When a recipe override is active use the effective exclusions so the
    // grid visually reflects what the override does (e.g. red border for +-Daze).
    const excludedSetIds = multiEditActive
      ? excludedDisplayIds
      : setsOverrideActive
        ? splitArtifactSetSelections(effectiveRecipe.artifactSets ?? []).excluded.slice().sort((a, b) => a - b)
        : baseSetSplit.excluded.slice().sort((a, b) => a - b)
    // Build the Select token list from explicit metasets + includes.
    const selectedTokens: string[] = [
      ...selectedMetaIds.map(tokenOf.meta),
      ...selectedSetIds.map(tokenOf.set),
    ]
    const handleExcludeSet = (id: number) => {
      // NOT is allowed on any set; the implicit-any guard (below / at apply time)
      // drops a bare exclusion when nothing constrains the pool.
      // Multi-edit: stage a tri-state exclusion patch across the whole selection,
      // mirroring toggleSet so include/exclude behave identically in multi-edit.
      if (multiEditActive && multiEdit) {
        const state = getSetExclusionState(id)
        const baseState = toTriStateBase(state)
        // Tri-state: all excluded -> clear; otherwise -> exclude everywhere.
        const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
        const nextPatch = computeArtifactSetExclusionToggle(setsPatch, id, baseState, target)
        const baseArray = Array.isArray(recipe.artifactSets) ? recipe.artifactSets : []
        const preview = applyArtifactSetPatchPreview(baseArray, nextPatch)
        multiEdit.updateField('artifactSets', {
          value: preview as BuilderRecipe['artifactSets'],
          status: 'common',
          patch: nextPatch ?? undefined,
        })
        return
      }
      // Flip the exclude flag for this set id.
      const isExcluded = excludedSetIds.includes(id)
      // Exclusions should clear explicit includes for the same set.
      const nextIncluded = selectedSetIds.filter((entry) => entry !== id)
      const nextExcluded = isExcluded
        ? excludedSetIds.filter((entry) => entry !== id)
        : [...excludedSetIds, id]
      // Strip the exclusion when the result is implicit-any (no include + no metaset).
      const hasMetaset = (recipe.artifactMetaSets?.length ?? 0) > 0
      const nextSelections = pruneImplicitAnyExclusions([
        ...nextIncluded.map((entry) => ({ id: entry })),
        ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
      ], hasMetaset)
      onChange({ ...recipe, artifactSets: nextSelections })
    }
    // Evaluate "Any" state based on metasets, sets, and exclusions.
    const projectedMetaActive = multiEditActive && multiSummary
      ? metaDisplayIds.some((id) => getMetasetState(id) !== 'none')
      : (recipe.artifactMetaSets?.length ?? 0) > 0
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
      const metaIds = orderMetasets(metaIdsRaw, orderBasis)
      // Capture explicit includes from set tokens.
      const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
      // Keep exclusions unless the user explicitly selected the set.
      const nextExcluded = excludedSetIds.filter((id) => !setIds.includes(id))
      const nextSelections = normalizeArtifactSetSelections([
        ...setIds.map((id) => ({ id })),
        ...nextExcluded.map((id) => ({ id, excluded: true })),
      ])
      onChange({ ...recipe, artifactMetaSets: metaIds, artifactSets: nextSelections })
    }
    const handleToggleSet = (id: number) => {
      // Multi-edit toggles are handled via patch helpers.
      if (multiEditActive && multiEdit) {
        toggleSet(id)
        return
      }
      // Toggle only the explicit include list for single-recipe edits.
      const prev = new Set<number>(baseSetSplit.included.map(Number))
      if (prev.has(id)) prev.delete(id); else prev.add(id)
      const nextSets = Array.from(prev).sort((a, b) => a - b)
      // Remove exclusions when a set is explicitly re-added.
      const nextExcluded = baseSetSplit.excluded.filter((entry) => Number(entry) !== id)
      const nextSelections = normalizeArtifactSetSelections([
        ...nextSets.map((entry) => ({ id: entry })),
        ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
      ])
      onChange({ ...recipe, artifactSets: nextSelections })
    }
    const getSetsSelectionDisplay = (tokens: readonly string[]) => {
      // Multi-edit needs mixed-value labels for tri-state tokens.
      if (multiEditActive && multiSummary) {
        const names: string[] = []
        // Metaset labels reflect tri-state status.
        for (const id of metaDisplayIds) {
          const state = getMetasetState(id)
          if (state === 'none') continue
          const meta = metasets.find(x => x.name === id)
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
            const m = metasets.find(x => x.name === id)
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
    const sorted = filterAndSortSetEntries(setsSearch, setsOrder, {
      translate: t,
      // Always include no-set; disabledSetIds below marks it disabled when out of scope —
      // consistent with Reaction/Refresh (shown disabled, not hidden).
      includeNoSet: true,
      noSetLabel: t('noSetAccessories'),
    })
    const allowedSetIdsSet = new Set(allowedSetPool.map(Number))
    const disabledSetIds = sorted
      .map(([id]) => Number(id))
      .filter((id) => !allowedSetIdsSet.has(id))

    // Show metasets section only when there is at least one visible user metaset. Avoid empty metasets UI.
    const hasMetasetsSection = visibleMetasets.length > 0
    const metasetsMenu: Metaset[] = visibleMetasets
    // Disable a meta-set only when every member set is outside the allowed pool.
    const disabledMetasetIds = new Set(
      metasetsMenu
        .filter((meta) => meta.sets.every((setId) => !allowedSetIdsSet.has(Number(setId))))
        .map((meta) => meta.name)
    )

    // Select node: sets+metasets dropdown wrapped in EllipsisTooltip.
    const setsSelectNode = (() => {
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
                return (recipe.artifactMetaSets ?? []).includes(id) ? 'all' : 'none'
              }
              // Determine which metaset to scroll into view when the menu opens.
              let targetMetasetId: string | null = null
              if (hasMetasetsSection) {
                const firstFull = metasetsMenu.find((meta) => selectedMetaState(meta.name) === 'all')
                if (firstFull) {
                  targetMetasetId = firstFull.name
                } else {
                  const firstPartial = metasetsMenu.find((meta) => selectedMetaState(meta.name) === 'partial')
                  targetMetasetId = firstPartial?.name ?? null
                }
              }
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
            slotProps: {
              paper: {
                sx: {
                  width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                  maxWidth: SETS_MENU_WIDTH_PX,
                  overflowX: 'hidden',
                },
                ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el }
              },
              list: {
                sx: { width: '100%', maxWidth: '100%' },
              },
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
                ...visibleScrollbarTrack(),
              }}
              data-tour-id="menu.metasets.section"
            >
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
              {metasetsMenu.map((m) => {
                const { glyph, iconId } = metasetGlyph(m)
                const hasGlyph = glyph != null && !!iconId
                const needsGap = iconId !== null && iconId !== 'empty'
                const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${m.name}` : m.name}` : m.name
                const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                const setNames = m.sets.map((id) => getLocalizedGearSetName(id, t, lang)).filter(Boolean)
                const joined = setNames.join(', ')
                const usedMeta = metasetUsageCounts[m.name] || 0
                const metaState = multiEditActive ? getMetasetState(m.name) : (selectedMetaIds.includes(m.name) ? 'all' : 'none')
                const isSelectedMeta = metaState === 'all'
                const isPartialMeta = metaState === 'partial'
                const isMetaDisabled = disabledMetasetIds.has(m.name)
                return (
                  <MenuItem
                    key={m.name}
                    value={`m:${m.name}`}
                    selected={isSelectedMeta}
                    disabled={isMetaDisabled}
                    data-metaset-id={m.name}
                    onMouseEnter={() => setHoveredSetMetaId(m.name)}
                    onMouseLeave={() => setHoveredSetMetaId((prev) => (prev === m.name ? null : prev))}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (isMetaDisabled) return
                      if (multiEditActive && multiEdit) {
                        toggleMetaset(m.name)
                        return
                      }
                      const token = `m:${m.name}`
                      const tokensSet = new Set<string>(selectedTokens)
                      if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                      const tokens = Array.from(tokensSet)
                      const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                      const metaIds = orderMetasets(metaIdsRaw, orderBasis)
                      const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                      const nextExcluded = excludedSetIds.filter((id) => !setIds.includes(id))
                      const nextSelections = normalizeArtifactSetSelections([
                        ...setIds.map((id) => ({ id })),
                        ...nextExcluded.map((id) => ({ id, excluded: true })),
                      ])
                      onChange({ ...recipe, artifactMetaSets: metaIds, artifactSets: nextSelections })
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
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('setsUsageInRecipes', { n: usedMeta })}</Typography>
                      </Box>
                      {setNames.length > 0 && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'primary.main', opacity: 0.9, display: 'block', width: '100%', whiteSpace: 'normal', overflowWrap: 'break-word' }}
                        >
                          {joined}
                        </Typography>
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
                  zeroResults={filterAndSortSetEntries(setsSearch, setsOrder, {
                    translate: t,
                    // Always include no-set in empty-state math to match rendered list.
                    includeNoSet: true,
                    noSetLabel: t('noSetAccessories'),
                  }).length === 0}
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
              ...(setsOrder !== 'icons' ? visibleScrollbarTrack() : {}),
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
            disabledSetIds={disabledSetIds}
            onToggleSet={handleToggleSet}
            onContextMenuSet={(id) => handleExcludeSet(id)}
            {...(multiEditActive ? { triStateForSet: getSetState } : {})}
          />
          </Box>
        </Box>
        </Select>
      )
      // Human-readable sets+metasets label for the badge tooltip (shared formatter —
      // the safeguard builder's sets badge uses the identical rendering).
      const setsLabel = (sets: typeof recipe.artifactSets, metas: typeof recipe.artifactMetaSets): string =>
        formatArtifactSetSelectionLabel(sets, metas, (id) => getLocalizedGearSetName(id, t, lang), t('any'))
      const selectEl = (
        <Box ref={setsSelectContainerRef} sx={{ position: 'relative' }}>
          {baseSelect}
          {setsOverrideActive && renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
            setsLabel(recipe.artifactSets, recipe.artifactMetaSets),
            setsLabel(effectiveRecipe.artifactSets, effectiveRecipe.artifactMetaSets),
          ))}
          <InlineSelectClearButton
            disabled={!hasAnySelection}
            label={t('clear')}
            onClear={() => {
              if (!hasAnySelection) return
              if (multiEditActive && multiEdit) {
                multiEdit.updateField('artifactSets', {
                  value: (multiSetsField?.value as BuilderRecipe['artifactSets']) ?? (recipe.artifactSets ?? []),
                  status: 'common',
                  patch: { clear: true },
                })
                multiEdit.updateField('artifactMetaSets', {
                  value: (multiMetasetsField?.value as BuilderRecipe['artifactMetaSets']) ?? (recipe.artifactMetaSets ?? []),
                  status: 'common',
                  patch: { clear: true },
                })
                return
              }
              onChange({ ...recipe, artifactSets: [], artifactMetaSets: [] })
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
    })()

    return (
      <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
        {/* overflow:visible so the absolutely-positioned gear-set override badge can paint above the row. */}
        <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, minHeight: 32, overflow: 'visible' }}>
          {setsSelectNode}
        </Box>
      </Box>
    )
  })()

  // Disable "Reset to factory defaults" when no user defaults have been saved.
  const resetFactoryDisabled = (() => { try { return !localStorage.getItem(BUILDER_USER_DEFAULTS_KEY) } catch { return true } })()

  return (
    <Box sx={{ position: 'relative' }}>
      {fortyTwoOverlay}
      {/* Name field above the scroll zone — the MUI outlined TextField floating label
          extends ~9 px above the input border when shrunk; keeping it outside the
          overflowX:auto wrapper prevents the scroll container's implicit overflow-y
          from clipping it. */}
      <Box sx={(theme) => ({
        borderRadius: 1,
        transition: UI_BG_HOVER_DANGER_TRANSITION,
        boxShadow: 'none',
        backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
      })}>
        {/* gap: 1 matches the safeguard builder's name row — the ━ toggle spacing is part of the shared separator UX. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            label={t('builderRecipeName')}
            value={renderedName}
            {...(namePlaceholder ? { placeholder: namePlaceholder } : {})}
            onChange={(e) => {
              if (usingMultiName) {
                multiEdit?.updateField('appearanceName', { value: e.target.value, status: 'common' })
              } else {
                setNameDraft(e.target.value)
                setNameDraftKey(currentDraftKey)
              }
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            onBlur={commitNameDraftIfNeeded}
            slotProps={{
              input: { endAdornment: nameEndAdornment },
              htmlInput: { 'data-tour-id': 'builder.name' },
            }}
            fullWidth
          />
          {/* ━ separator on/off toggle — shared control, identical UX in the safeguard builder.
              Single-edit only; multi-edit stages exportMode through its own field instead. */}
          {!multiEditActive ? (
            <SeparatorToggleButton
              active={isSeparatorDraft}
              tooltip={t('builderExportModeSeparatorTooltip')}
              dataTourId="builder.separator"
              onChange={(nextActive) => {
                if (!nextActive) {
                  updateExportMode('active')
                  return
                }
                // Turning a recipe into a divider resets every other field to factory
                // defaults — that is exactly what a separator persists as (name + color
                // only), so the disabled controls show the truth; undo restores the recipe.
                onChange({
                  ...createFactoryBuilderDefaults(),
                  ...(recipe.appearance ? { appearance: recipe.appearance } : {}),
                  exportMode: 'separator',
                })
              }}
            />
          ) : null}
        </Box>
      </Box>
      {/* Scroll wrapper: gives the toggle-button grid a horizontal scrollbar when wider
          than the splitter-controlled panel; name field above avoids label clipping. */}
      <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 1,
      }}>

        <FormControl sx={(theme) => ({
          gridColumn: '1 / -1',
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
        })}>
          {/* Action header row: chevron + label + info icon + undo/redo (always visible). */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader
              id="action"
              collapsed={builderCollapsed}
              onCollapsedChange={setBuilderCollapsed}
              labelSx={{ mb: 0 }}
            >
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
                <Box component="span" data-ellipsis-target sx={actionLabelColor ? [BUILDER_LABEL_TEXT_SX, { color: actionLabelColor }] : BUILDER_LABEL_TEXT_SX}>{t('builderAction')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {/* Info icon beside the Action label — hover to see builder overview. */}
            <MarkdownTooltip markdown={t('builderInfoTooltip')}>
              <IconButton
                size="small"
                color="inherit"
                aria-label={t('builderHelpOpen')}
                sx={{ p: 0.25, fontSize: 16, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
              >
                <InfoOutlinedIcon fontSize="inherit" />
              </IconButton>
            </MarkdownTooltip>
            {/* Undo/Redo: pinned to the right of the header so it stays visible when action is collapsed. */}
            <Box
              sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}
              onContextMenu={handleHistoryContextMenu}
              {...historyHintTriggerProps}
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
            </Box>
            {historyHintOverlay}
            <HistoryContextMenu
              open={historyMenuOpen}
              anchorPosition={historyMenuAnchor}
              onClose={closeHistoryMenu}
              paperRef={historyMenuPaperRef}
              onPaperContextMenu={handleHistoryMenuContextMenu}
              contextMenuGuard={historyMenuGuard}
              entries={historyTimeline}
              t={t}
              lang={lang}
              onSelectEntry={handleHistoryEntrySelect}
              onRequestClearHistory={handleRequestClearHistory}
              substatColors={substatColors}
            />
          </Box>
          <Collapse in={!builderCollapsed.action} timeout="auto" unmountOnExit>
          {/* overflow:visible so the absolutely-positioned export-mode override badge can paint above the row. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', overflow: 'visible' }}>
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
                  sx={(builtTheme) => ({
                    height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    position: 'relative',
                    borderRadius: `${builtTheme.shape.borderRadius}px`,
                    overflow: 'hidden',
                    '& .MuiToggleButton-root': {
                      position: 'relative',
                      zIndex: 1,
                      height: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                      minHeight: `${TOGGLE_BUTTON_HEIGHT_PX}px`,
                    },
                    ...(keepMixed ? {
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        borderRadius: `${builtTheme.shape.borderRadius}px`,
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
                  onClick={() => handleKeepActionOverrideClick('keep')}
                  sx={(muiTheme) => {
                    const selected = keepValue === 'keep'
                    const successMain = muiTheme.vars?.palette.success.main ?? muiTheme.palette.success.main
                    const successLight = muiTheme.vars?.palette.success.light ?? muiTheme.palette.success.light
                    const baseBorder = selected
                      ? successMain
                      : TINT.neutralActiveBg
                    return {
                      // relative so the absolutely-positioned override badge anchors here.
                      position: 'relative',
                      borderColor: baseBorder,
                      // Default (light) outer color when selected; dark overrides below.
                      color: selected ? successMain : (muiTheme.vars?.palette.text.primary ?? muiTheme.palette.text.primary),
                      '&.Mui-selected': { borderColor: successMain },
                      // Light: tinted bg + success.main text, matching the blue toggle style.
                      ...muiTheme.applyStyles('light', {
                        '&.Mui-selected': {
                          bgcolor: TINT.successSelectedBg,
                          color: successMain,
                          '&:hover': { bgcolor: TINT.successSelectedHover },
                        },
                      }),
                      // Dark: filled solid green + black text; also override outer color.
                      ...muiTheme.applyStyles('dark', {
                        ...(selected ? { color: muiTheme.vars?.palette.common.black ?? muiTheme.palette.common.black } : {}),
                        '&.Mui-selected': {
                          bgcolor: successMain,
                          color: muiTheme.vars?.palette.common.black ?? muiTheme.palette.common.black,
                          '&:hover': { bgcolor: successLight },
                        },
                      }),
                    }
                  }}
                >
                  {t('keepValueKeep')}
                  {keepActionOverrideTarget === 'keep'
                    ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                        keepActionLabel('keep'),
                        keepActionLabel(effectiveRecipe.keep ? 'keep' : 'sell'),
                      ))
                    : null}
                </ToggleButton>
                <ToggleButton
                  value="sell"
                  data-tour-id="builder.action.sell"
                  onClick={() => handleKeepActionOverrideClick('sell')}
                  sx={(theme) => ({
                    // relative so the absolutely-positioned override badge anchors here.
                    position: 'relative',
                    '&.Mui-selected': { borderColor: theme.vars?.palette.error.main ?? theme.palette.error.main },
                    ...theme.applyStyles('light', {
                      '&.Mui-selected': {
                        bgcolor: TINT.errorActiveBg,
                        color: theme.vars?.palette.error.main ?? theme.palette.error.main,
                        '&:hover': { bgcolor: TINT.errorActiveHover },
                      },
                    }),
                    ...theme.applyStyles('dark', {
                      '&.Mui-selected': {
                        bgcolor: theme.vars?.palette.error.main ?? theme.palette.error.main,
                        color: '#fff',
                        '&:hover': { bgcolor: theme.vars?.palette.error.dark ?? theme.palette.error.dark },
                      },
                    }),
                  })}
                >
                  {t('keepValueSell')}
                  {keepActionOverrideTarget === 'sell'
                    ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                        keepActionLabel('sell'),
                        keepActionLabel(effectiveRecipe.keep ? 'keep' : 'sell'),
                      ))
                    : null}
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
                    position: 'relative',
                    '&.Mui-selected': { borderColor: theme.vars?.palette.success.main ?? theme.palette.success.main },
                    ...theme.applyStyles('light', {
                      '&.Mui-selected': {
                        bgcolor: TINT.successSelectedBg,
                        color: theme.vars?.palette.success.main ?? theme.palette.success.main,
                        '&:hover': { bgcolor: TINT.successSelectedHover },
                      },
                    }),
                    ...theme.applyStyles('dark', {
                      '&.Mui-selected': {
                        bgcolor: theme.vars?.palette.success.main ?? theme.palette.success.main,
                        color: theme.vars?.palette.common.black ?? theme.palette.common.black,
                        '&:hover': { bgcolor: theme.vars?.palette.success.light ?? theme.palette.success.light },
                      },
                    }),
                  })}
                >
                  <MarkdownTooltip
                    placement="top"
                    render={<BuilderTooltipContent text={buildExportModeTooltip(t('builderExportModeActiveTooltip'))} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeActive')}
                    </Box>
                  </MarkdownTooltip>
                  {exportModeOverrideTarget === 'active'
                    ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                        exportModeLabel('active'),
                        exportModeLabel(effectiveExportMode),
                      ))
                    : null}
                </ToggleButton>
                <ToggleButton
                  value="disabled"
                  onClick={() => handleExportModeOverrideClick('disabled')}
                  sx={(theme) => ({
                    px: 1.5,
                    position: 'relative',
                    '&.Mui-selected': {
                      color: (theme.vars?.palette.success.main ?? theme.palette.success.main),
                      bgcolor: 'transparent',
                      borderColor: (theme.vars?.palette.success.main ?? theme.palette.success.main),
                      '&:hover': { bgcolor: TINT.successSelectedBg },
                    },
                  })}
                >
                  <MarkdownTooltip
                    placement="top"
                    render={<BuilderTooltipContent text={buildExportModeTooltip(t('builderExportModeDisabledTooltip'))} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeDisabled')}
                    </Box>
                  </MarkdownTooltip>
                  {exportModeOverrideTarget === 'disabled'
                    ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                        exportModeLabel('disabled'),
                        exportModeLabel(effectiveExportMode),
                      ))
                    : null}
                </ToggleButton>
                {/* Separator mode moved out of this group: the shared ━ on/off toggle
                    next to the name field owns it (identical UX to the safeguard builder). */}
                </ToggleButtonGroup>
              </Box>
            </Box>
            {/* Tags sit next to export mode to reinforce the enable/disable connection. */}
            {/* flex + minWidth let the chip strip measure against real remaining width
                instead of sizing to content and clipping at the paper border. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 1, flex: '1 1 auto', minWidth: 0 }}>
              <Box
                component="span"
                onContextMenu={handleTagsContextMenu}
                {...tagsHint.triggerProps}
                sx={{ display: 'inline-flex', flexShrink: 0 }}
              >
                <EllipsisTooltip title={tagsButtonLabel} selector="[data-ellipsis-target]">
                  <Button
                    size="small"
                    variant={tagsButtonActive ? 'contained' : 'outlined'}
                    color="success"
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
                </EllipsisTooltip>
              </Box>
              {/* Only show the clear affordance when tags exist for this recipe. */}
              {showTagsClear ? (
                <ClearIconButton
                  size="small"
                  aria-label={tagsClearLabel}
                  tooltip={tagsClearLabel}
                  onClick={clearTags}
                />
              ) : null}
              {/* Strip is its own width-aware flex container — overflow collapses into "+N". */}
              {showTagsChips ? (
                <BuilderTagChipStrip tags={tagDisplay} mixedTagSet={mixedTagSet} mixedTagChipSx={mixedTagChipSx} multiEditActive={multiEditActive} />
              ) : null}
              {/* Reuse the ContextMenuPaper style so the tags popup matches substat context menus. */}
              {/* Disable menu padding so the inner box owns spacing. */}
              <Menu
                open={tagsPopoverOpen}
                anchorEl={tagsAnchor}
                onClose={closeTagsPopover}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                  list: { disablePadding: true },
                  paper: { ...buildContextMenuPaperSlotProps({
                    component: ContextMenuPaper,
                    contextMenuGuard: tagsMenuGuard,
                    onRequestClose: closeTagsPopover,
                    closeLabel: t('close'),
                    sx: { minWidth: 260, maxWidth: 'calc(100vw - 32px)' },
                  }), ref: tagsMenuPaperRef },
                }}
              >
                {/* Content block keeps spacing predictable inside the menu shell. */}
                <Box sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    {/* Tag chips are removable; empty state stays compact. */}
                    <BuilderTagChipList
                      tags={tagDisplay}
                      mixedTagSet={mixedTagSet}
                      mixedTagChipSx={mixedTagChipSx}
                      multiEditActive={multiEditActive}
                      onRemove={removeTag}
                      emptyLabel={t('builderTagsEmpty')}
                    />
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
                slotProps={{ paper: { ref: tagsContextPaperRef } }}
              >
                <MenuToggleRow label={t('builderMenuShowTags')} checked={showTagsChips} onChange={() => setShowTagsChips(!showTagsChips)} />
              </Menu>
              {/* Context menu hint overlay matches the rest of the builder controls. */}
              {tagsHint.overlay}
            </Box>
          </Box>
          </Collapse>
        </FormControl>

        {/* Row 2: Left half (Rank, Rarity, Faction) — flex within cols 1-2; right half Level at col 3 */}
        <Box sx={(theme) => ({
          gridColumn: '1 / 3',
          display: 'flex',
          gap: 1,
          alignItems: 'flex-start',
          borderRadius: 1,
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })}>
        {/* Rank — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rank ? '0 0 auto' : '0 1 33.333%', minWidth: 0, position: 'relative' }}>
          {/* Rank label mirrors the select width and ellipsizes when German strings run long. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader
              id="rank"
              collapsed={builderCollapsed}
              onCollapsedChange={setBuilderCollapsed}
            >
              <MarkdownTooltip
                ellipsisTitle={t('builderRank')}
                render={(
                  <BuilderTooltipContent
                    text={buildOverrideTooltip(
                      [
                        t('builderRankHelp'),
                        t('builderMultiMixedTooltipSuffix'),
                      ].join('\n'),
                    )}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.rank, rankSectionDirty)}>{t('builderRank')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {renderSectionClearButton(rankSectionDirty, t('builderClearRank'), () => {
              if (multiEditActive) multiEdit?.updateField('rankCode', { value: 0 as BuilderRecipe['rankCode'], status: 'common' })
              else update('rankCode', 0)
            })}
          </Box>
          <Collapse in={!builderCollapsed.rank} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ flex: 1, position: 'relative', display: 'flex' }}>
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
                    multiEdit?.updateField('rankCode', { value: next as BuilderRecipe['rankCode'], status: 'common' })
                  } else {
                    update('rankCode', Number(raw))
                  }
                }}
                MenuProps={{ slotProps: { paper: { sx: { maxHeight: 340 } } } }}
                data-tour-id="builder.rank"
                sx={{
                  flex: 1,
                  position: 'relative',
                  ...selectBoxHeightSx,
                  '& .MuiSelect-select': selectContentHeightSx,
                  ...(multiEditActive && rankMixed ? {
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
                    if (recipe.rankCode === effectiveRecipe.rankCode) return
                    if (Number(code) !== effectiveRecipe.rankCode) return
                    update('rankCode', effectiveRecipe.rankCode)
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
                    if (recipe.rankCode === effectiveRecipe.rankCode) return
                    if (Number(code) !== effectiveRecipe.rankCode) return
                    update('rankCode', effectiveRecipe.rankCode)
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
                    if (recipe.rankCode === effectiveRecipe.rankCode) return
                    if (Number(code) !== effectiveRecipe.rankCode) return
                    update('rankCode', effectiveRecipe.rankCode)
                  }}
                >
                  {rankOptionLabel(Number(code))}
                </MenuItem>
              ))}
              </Select>
              {rankOverrideActive
                ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                    rankOptionLabel(recipe.rankCode),
                    rankOptionLabel(effectiveRecipe.rankCode),
                  ))
                : null}
            </Box>
          </Box>
          </Collapse>
        </FormControl>

        {/* Rarity — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rarity ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }}>
          {/* Rarity label uses the shared inline span so Auto/GTE text stays single-line. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader
              id="rarity"
              collapsed={builderCollapsed}
              onCollapsedChange={setBuilderCollapsed}
            >
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
                    )}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.rarity, raritySectionDirty)}>{t('filterRarity')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {renderSectionClearButton(raritySectionDirty, t('builderClearRarity'), () => {
              // Factory default is rarity mode 'auto'; mirror the Select's onChange auto path exactly.
              if (multiEditActive) {
                multiEdit?.updateField('rarityMode', { value: 'auto', status: 'common' })
                multiEdit?.resetField('rarityCode')
              } else {
                updateRaritySelection('auto')
              }
            })}
          </Box>
          <Collapse in={!builderCollapsed.rarity} timeout="auto" unmountOnExit>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ flex: 1, position: 'relative', display: 'flex' }}>
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
                      multiEdit?.updateField('rarityCode', { value: numeric as BuilderRecipe['rarityCode'], status: 'common' })
                    }
                  } else {
                    if (v === 'auto') {
                      updateRaritySelection('auto')
                    } else {
                      updateRaritySelection('code', Number(v))
                    }
                  }
                }}
                MenuProps={{ slotProps: { paper: { sx: { maxHeight: 340 } } } }}
                data-tour-id="builder.rarity"
                sx={{
                  flex: 1,
                  position: 'relative',
                  ...selectBoxHeightSx,
                  '& .MuiSelect-select': selectContentHeightSx,
                  ...(multiEditActive && rarityMixed ? {
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
                  if (selected === 'auto') {
                    return t('headerMenuAuto')
                  }
                  const numeric = Number(selected)
                  // Tint the closed-select rarity word; Any (no rank) falls back to the plain label.
                  return rarityCodeParts(numeric).rank != null
                    ? <RarityCodeLabel code={numeric} inControl />
                    : (rarityCodeToName(numeric) || t('any'))
                }}
              >
              <MenuItem
                value={'auto'}
                onClick={() => {
                  // When an override is active, allow clicking the effective value to accept it.
                  if (multiEditActive || !rarityOverrideActive) return
                  if (recipe.rarityMode === effectiveRarityMode && recipe.rarityCode === effectiveRecipe.rarityCode) return
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
                  if (recipe.rarityMode === effectiveRarityMode && recipe.rarityCode === effectiveRecipe.rarityCode) return
                  if (effectiveRarityMode !== 'code') return
                  if (effectiveRecipe.rarityCode !== 0) return
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
                    if (recipe.rarityMode === effectiveRarityMode && recipe.rarityCode === effectiveRecipe.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveRecipe.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  <RarityCodeLabel code={code} inControl />
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
                    if (recipe.rarityMode === effectiveRarityMode && recipe.rarityCode === effectiveRecipe.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveRecipe.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  <RarityCodeLabel code={code} inControl />
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
                    if (recipe.rarityMode === effectiveRarityMode && recipe.rarityCode === effectiveRecipe.rarityCode) return
                    if (effectiveRarityMode !== 'code') return
                    if (effectiveRecipe.rarityCode !== Number(code)) return
                    updateRaritySelection('code', Number(code))
                  }}
                >
                  <RarityCodeLabel code={code} inControl />
                </MenuItem>
              ))}
              </Select>
              {rarityOverrideActive
                ? renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                    rarityOptionLabel(storedRarityMode, recipe.rarityCode),
                    rarityOptionLabel(effectiveRarityMode, effectiveRecipe.rarityCode),
                  ))
                : null}
            </Box>
          </Box>
          </Collapse>
        </FormControl>

        {/* Faction selection (accessories only) — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.faction ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }} disabled={hasArtifactSlot}>
          {/* Faction label stays constrained to the Select width for DE translations. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="faction" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed}>
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
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.faction, factionSectionDirty)}>{t('builderFaction')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {renderSectionClearButton(factionSectionDirty, t('builderClearFaction'), () => {
              if (multiEditActive) multiEdit?.updateField('factionCode', { value: 0 as BuilderRecipe['factionCode'], status: 'common' })
              else onChange(normalizeKeepWithAuto({ ...recipe, factionCode: 0 as FactionId }))
            })}
          </Box>
          <Collapse in={!builderCollapsed.faction} timeout="auto" unmountOnExit>
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
                  multiEdit?.updateField('factionCode', { value: next as BuilderRecipe['factionCode'], status: 'common' })
                } else {
                  onChange(normalizeKeepWithAuto({ ...recipe, factionCode: Number(raw) as FactionId }))
                }
              }}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
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
              {[
                Faction.Dwarves,
                Faction.Shadowkin,
                Faction.SylvanWatchers,
                // Keep Argonites visible alongside the rest of Nyresan Union.
                Faction.Argonites,
              ].map((code) => (
                <MenuItem key={code} value={String(code)}>
                  <FactionOptionLabel faction={code} label={factionLabel(Number(code))} />
                </MenuItem>
              ))}
            </Select>
          </Box>
          </Collapse>
        </FormControl>
        </Box>
        {/* Row 2 right: Level Window — col 3 only */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 4',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })} data-tour-id="builder.level-window">
          {/* Level label row mirrors Rank/Rarity/Faction pattern with a collapsible chevron. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <BuilderSectionHeader id="level" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed}>
              <Box component="span" sx={builderSectionLabelSx(builderCollapsed.level, levelSectionDirty)}>{t('builderLevelWindow')}</Box>
            </BuilderSectionHeader>
            {renderSectionClearButton(levelSectionDirty, t('builderClearLevel'), () => {
              // Default window is the full 0–16 range; mirror the slider's min/max change paths.
              if (multiEditActive) {
                multiEdit?.updateField('minLevel', { value: 0 as LevelMilestone, status: 'common' })
                multiEdit?.updateField('maxLevel', { value: 16 as LevelMilestone, status: 'common' })
              } else {
                updateLevelWindow(0 as LevelMilestone, 16 as LevelMilestone)
              }
            })}
          </Box>
          <Collapse in={!builderCollapsed.level} timeout="auto" unmountOnExit>
          <Box sx={{ px: 1.5, position: 'relative' }}>
            {/* Override badge on the level control; unmounts with the section when collapsed. */}
            {levelOverrideActive && renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
              `${levelLabel(storedMinLevel)}–${levelLabel(storedMaxLevel)}`,
              `${levelLabel(effectiveMinLevel)}–${levelLabel(effectiveMaxLevel)}`,
            ))}
            <Slider
              size="small"
              min={0}
              max={16}
              step={null}
              disableSwap
              marks={LEVEL_MILESTONES.map((v) => ({ value: v, label: `+${v}` }))}
              value={[aggregatedMinLevel, aggregatedMaxLevel]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `+${v}`}
              getAriaLabel={() => t('builderLevelWindow')}
              getAriaValueText={(v) => `+${v}`}
              onChange={(_, value) => {
                if (!Array.isArray(value) || value.length !== 2) return
                const [rawMin, rawMax] = value as [number, number]
                if (!LEVEL_MILESTONES.includes(rawMin as LevelMilestone) || !LEVEL_MILESTONES.includes(rawMax as LevelMilestone)) return
                const nextMin = rawMin as LevelMilestone
                const nextMax = rawMax as LevelMilestone
                if (multiEditActive) {
                  if (nextMin !== aggregatedMinLevel) multiEdit?.updateField('minLevel', { value: nextMin, status: 'common' })
                  if (nextMax !== aggregatedMaxLevel) multiEdit?.updateField('maxLevel', { value: nextMax, status: 'common' })
                } else {
                  if (nextMin === aggregatedMinLevel && nextMax === aggregatedMaxLevel) return
                  updateLevelWindow(nextMin, nextMax)
                }
              }}
              sx={{
                display: 'block',
                '& .MuiSlider-track': { height: 4 },
                '& .MuiSlider-rail': { height: 4 },
                '& .MuiSlider-thumb': { width: 16, height: 16 },
              }}
            />
          </Box>
          </Collapse>
        </Box>
        {/* Row 3: Mainstat (left cols 1-2), Substats (right cols 3-4) */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          // Align hover timing with other groups for Reset hover tint
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })} data-tour-id="builder.mainstat">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Mainstat label tracks the toggle width so it never pushes the clear button. */}
            <BuilderSectionHeader id="mainStat" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <MarkdownTooltip
                ellipsisTitle={t('builderMain')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderMainHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.mainStat, mainStatSectionDirty)}>{t('builderMain')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {mainStatClearButton}
          </Box>
          <Collapse in={!builderCollapsed.mainStat} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, position: 'relative' }}>
              {/* Override badge on the mainstat toggles; unmounts with the section when collapsed. */}
              {mainStatsVOverrideActive && renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
                (recipe.mainStatsV ?? []).map((v) => t(statVariantI18nKey(v))).join(', ') || t('any'),
                (effectiveRecipe.mainStatsV ?? []).map((v) => t(statVariantI18nKey(v))).join(', ') || t('any'),
              ))}
              {mainStatToggleRows}
            </Box>
          </Collapse>
        </FormControl>

        {/* Substats — cols 3-4 */}
        <FormControl sx={(theme) => ({
          gridColumn: '3 / 5',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })} data-tour-id="builder.substats">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Substats label uses the same inline span to keep the reset button aligned. */}
            {/* Two chevrons + two labels on one row: the first pair collapses the classic rows,
                the second the anomalous ones. The anomalous LABEL carries the collapsed-with-content
                highlight, exactly like every other section — the chevron icon is never tinted. */}
            <BuilderSectionHeader
              id="substats"
              collapsed={builderCollapsed}
              onCollapsedChange={setBuilderCollapsed}
              labelSx={{ m: 0 }}
              secondaryId="substatsAnomalous"
              // Both chevrons name their own sub-group: two "Expand" buttons in one row are
              // indistinguishable to a screen reader.
              primaryAriaLabel={t('substatsToggleClassicAria')}
              secondaryLabel={t('substatsGroupAnomalous')}
              secondaryDirty={anomalousSubstatSectionDirty}
              secondaryAriaLabel={t('substatsToggleAnomalousAria')}
            >
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
                    ].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.substats, substatSectionDirty)}>{t('builderSubstats')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {substatsClearButton}
          </Box>
          {/* No outer Collapse: substatsContent wraps each half in its own Collapse so the two
              chevrons act independently. */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, position: 'relative' }}>
            {/* Override badge on the substat toggles; hidden once BOTH halves are collapsed. */}
            {substatsVOverrideActive && isAnySubstatSectionExpanded(builderCollapsed) && renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
              (recipe.substatsV ?? []).map((v) => t(statVariantI18nKey(v))).join(', ') || t('any'),
              (effectiveRecipe.substatsV ?? []).map((v) => t(statVariantI18nKey(v))).join(', ') || t('any'),
            ))}
            {substatsContent}
          </Box>
        </FormControl>

        {/* Slots — cols 1-2, spans rows 4a + 4b so it sits flush alongside both right-column items */}
        <FormControl sx={(theme) => ({
          gridColumn: '1 / 3',
          gridRow: 'span 2',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })} data-tour-id="builder.slots">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            {/* Slot label clamps to the toggle width so translations don't wrap under icons. */}
            <BuilderSectionHeader id="slots" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <MarkdownTooltip
                ellipsisTitle={t('builderSlots')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderSlotsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.slots, slotSectionDirty)}>{t('builderSlots')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {slotsClearButton}
          </Box>
          <Collapse in={!builderCollapsed.slots} timeout="auto" unmountOnExit>
          {/* Tighten the slot matrix spacing to 4px (0.5 spacing unit) so nine buttons remain compact. */}
          {/* SlotTintControlScope: glyphs in these toggle buttons use the button-scoped slot tint. */}
          <SlotTintControlScope>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5, position: 'relative' }}>
            {/* Override badge on the slot grid; unmounts with the section when collapsed. */}
            {slotsOverrideActive && renderWarningBadgeOverlay(buildRecipeOverridesBadgeTooltip(
              (recipe.artifactTypes ?? []).map((id) => slotLabel(Number(id))).join(', ') || t('any'),
              (effectiveRecipe.artifactTypes ?? []).map((id) => slotLabel(Number(id))).join(', ') || t('any'),
            ))}
            {artifactTypeIconList.map(({ id, name, Icon }) => {
              const slotState = multiEditActive ? getSlotState(id) : (displayArtifactTypes.includes(id) ? 'all' : 'none')
              const selected = slotState === 'all' || (!multiEditActive && displayArtifactTypes.includes(id))
              return (
                <ToggleButton
                  key={id}
                  value={`${id}`}
                  selected={selected}
                  // Artifact slots are incompatible with a faction filter; block when faction is active.
                  disabled={factionSectionDirty && !isAccessorySlot(id)}
                  onClick={(event) => {
                    if (multiEditActive && multiEdit) {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleSlot(id)
                      return
                    }
                    const set = new Set(recipe.artifactTypes ?? [])
                    if (set.has(id)) set.delete(id); else set.add(id)
                    // If an artifact slot was toggled, clear faction (slots take priority).
                    onChange(normalizeSlotsOverrideFaction({ ...recipe, artifactTypes: Array.from(set) }))
                  }}
                  onDoubleClick={(event) => {
                    // Double-click selects/deselects the entire group (artefacts or accessories).
                    // Multi-edit uses a different toggle model; skip there.
                    event.preventDefault(); event.stopPropagation()
                    if (multiEditActive && multiEdit) return
                    const groupIds = artifactTypeIconList
                      .map((entry) => entry.id)
                      .filter((sid) => isAccessorySlot(sid) === isAccessorySlot(id))
                    const current = recipe.artifactTypes ?? []
                    const allSelected = groupIds.every((sid) => current.includes(sid))
                    const set = new Set(current)
                    if (allSelected) groupIds.forEach((sid) => set.delete(sid))
                    else groupIds.forEach((sid) => set.add(sid))
                    // Clear faction if the resulting slot set includes any artifact piece.
                    onChange(normalizeSlotsOverrideFaction({ ...recipe, artifactTypes: Array.from(set) }))
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
                        ? (theme.vars?.palette.action.selected ?? theme.palette.action.selected)
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
          </SlotTintControlScope>
          </Collapse>
        </FormControl>

        {/* Row 4a right: Min Rolls + Required Substats + Milestones — direct grid item at cols 3-4 */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })}>
        <FormControl sx={{ m: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              // Prevent Min Rolls / Required Substats / Milestone from jumping to a new row
              // when the builder panel is narrowed via the splitter — they shrink instead.
              flexWrap: 'nowrap',
              columnGap: 1,
              rowGap: 1,
              overflow: 'hidden',
            }}
          >
            {/* Min Required Rolls */}
            {/* Anchor to English-sized width so "Mindestwürfe" (DE) doesn't cause button overflow. */}
            <FormControl
              sx={{
                m: 0,
                // flex-shrink:1 allows this column to compress when the builder panel is narrowed.
                flex: builderCollapsed.minRolls ? '0 1 auto' : `0 1 ${BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX}px`,
                width: builderCollapsed.minRolls ? 'auto' : `${BUILDER_MIN_ROLLS_COLUMN_WIDTH_PX}px`,
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {minRollsContent}
            </FormControl>
            {/* Required substats */}
            {/* Required substats column mirrors the English 135px width for parity. */}
            <FormControl
              sx={{
                m: 0,
                // flex-shrink:1 lets this column compress under splitter pressure.
                flex: builderCollapsed.requiredSubstats ? '0 1 auto' : `0 1 ${BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX}px`,
                width: builderCollapsed.requiredSubstats ? 'auto' : `${BUILDER_REQUIRED_SUBSTATS_COLUMN_WIDTH_PX}px`,
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              {requiredSubstatsContent}
            </FormControl>
            {/* Milestone Thresholds (right of Min Required Rolls) */}
            {milestoneThresholdsContent}
            {/* Substat Values… moved to top row (right of Max Level) */}
          </Box>
        </FormControl>
        </Box>{/* end Row 4a right */}

        {/* Row 4b right: Sets — auto-placed by grid to cols 3-4, row below Slots/Min Rolls */}
        <Box sx={(theme) => ({
          gridColumn: '3 / 5',
          ...(isSeparatorDraft ? separatorDisabledSectionSx(theme) : {}),
          borderRadius: 1,
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          boxShadow: 'none',
          backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
        })}>
        {/* Sets multi-select with order toggle and search */}
        <FormControl fullWidth sx={{ m: 0 }}>
          {/* Header row: label on the left, Manage metasets on the right */}
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, mb: 0.5 }}>
            {/* Sets label mirrors the ellipsis span so the Manage Metasets button stays put. */}
            <BuilderSectionHeader
              id="sets"
              collapsed={builderCollapsed}
              onCollapsedChange={setBuilderCollapsed}
              labelSx={{ mb: 0, mr: 1, flex: '0 1 auto' }}
            >
              <MarkdownTooltip
                ellipsisTitle={t('setsTitle')}
                render={(
                  <BuilderTooltipContent
                    text={[t('builderSetsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <Box component="span" data-ellipsis-target sx={builderSectionLabelSx(builderCollapsed.sets, setsSectionDirty)}>{t('setsTitle')}</Box>
              </MarkdownTooltip>
            </BuilderSectionHeader>
            {/* Clear ✕ mirrors the in-content sets clear (see InlineSelectClearButton): wipes sets + metasets. */}
            <Box sx={{ flexShrink: 0, mr: 1 }}>
              {renderSectionClearButton(setsSectionDirty, t('builderClearSets'), () => {
                if (multiEditActive && multiEdit) {
                  multiEdit.updateField('artifactSets', {
                    value: (multiSetsField?.value as BuilderRecipe['artifactSets']) ?? (recipe.artifactSets ?? []),
                    status: 'common',
                    patch: { clear: true },
                  })
                  multiEdit.updateField('artifactMetaSets', {
                    value: (multiMetasetsField?.value as BuilderRecipe['artifactMetaSets']) ?? (recipe.artifactMetaSets ?? []),
                    status: 'common',
                    patch: { clear: true },
                  })
                  return
                }
                onChange({ ...recipe, artifactSets: [], artifactMetaSets: [] })
              })}
            </Box>
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
          <Collapse in={!builderCollapsed.sets} timeout="auto" unmountOnExit>
          {setsContent}
          </Collapse>
        </FormControl>
        </Box>{/* end Row 4b right (Sets) */}

      </Box>
      </Box>{/* end scroll wrapper */}

        {/* Metasets dialog (separate component) */}
        {metaDlgOpen ? (
          <MetasetsDialog
            open={metaDlgOpen}
            onClose={closeMetaDlg}
            metasets={metasets}
            onMetasetsChange={onMetasetsChange}
            describeNextChange={describeNextChange}
            onDeleteMetaset={onDeleteMetaset}
            onMetasetRenamed={onMetasetRenamed}
            onResetMetasets={onResetMetasets}
            setUsageCounts={setUsageCounts}
            metasetUsageCounts={metasetUsageCounts}
            safeguardMetasetUsageCounts={safeguardMetasetUsageCounts}
            onSelectRecipesByMetaset={onSelectRecipesByMetaset}
            onSelectSafeguardsByMetaset={onSelectSafeguardsByMetaset}
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


      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center' }}>
        <Box
          component="span"
          onContextMenu={handleInsertContextMenu}
          {...insertHint.triggerProps}
          sx={{ display: 'inline-flex' }}
        >
          <Badge
            overlap="rectangular"
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            invisible={!insertHiddenByFilters || !builderCanAdd}
            sx={warningBadgeSx}
            badgeContent={renderWarningBadgeContent({
              tooltip: t('builderInsertHiddenTooltip'),
              disabled: !insertHiddenByFilters || !builderCanAdd,
            })}
          >
            <Button
              onClick={handleAddToCustom}
              data-tour-id="builder.add-recipe"
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
        <Box
          component="span"
          onContextMenu={handleApplyContextMenu}
          {...applyHint.triggerProps}
          sx={{ display: 'inline-flex' }}
        >
          <Badge
            overlap="rectangular"
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            invisible={!saveHiddenByFilters || saveDisabled}
            sx={warningBadgeSx}
            badgeContent={renderWarningBadgeContent({
              tooltip: t('builderSaveHiddenTooltip'),
              disabled: !saveHiddenByFilters || saveDisabled,
              open: saveTooltipOpen && saveHiddenByFilters && !saveDisabled,
              onOpen: () => setSaveTooltipOpen(true),
              onClose: () => setSaveTooltipOpen(false),
            })}
          >
            <Button
              data-tour-id="builder.apply-recipe"
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
          {...resetHint.triggerProps}
        >
          <Button
            size="small"
            color="warning"
            disabled={isDefaultBuilder || multiEditActive}
            onMouseEnter={(e) => {
              setHoverReset(true)
              resetHint.triggerProps.onMouseEnter(e)
            }}
            onMouseLeave={() => setHoverReset(false)}
            onClick={handleResetBuilder}
            onFocus={(e) => {
              if (multiEditActive || isDefaultBuilder) return
              const rect = e.currentTarget.getBoundingClientRect()
              resetHint.setPosition?.({ x: rect.right, y: rect.top })
            }}
            onBlur={() => resetHint.setPosition?.(null)}
            onMouseMove={resetHint.triggerProps.onMouseMove}
            sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
          >
            {t('builderResetButton')}
          </Button>
        </Box>
        {insertHint.overlay}
        {applyHint.overlay}
        {resetHint.overlay}
        <Menu
          anchorEl={insertMenuAnchor}
          open={Boolean(insertMenuAnchor)}
          onClose={closeInsertMenu}
          slotProps={{ paper: { ref: insertMenuPaperRef } }}
        >
          <MenuToggleRow label={t('builderMenuAutoResetAfterInsert')} checked={autoResetAfterInsert} onChange={() => setAutoResetAfterInsertExclusive(!autoResetAfterInsert)} />
        </Menu>
        <Menu
          anchorEl={applyMenuAnchor}
          open={Boolean(applyMenuAnchor)}
          onClose={closeApplyMenu}
          slotProps={{ paper: { ref: applyMenuPaperRef } }}
        >
          <MenuToggleRow label={t('builderMenuAutoApplySelected')} checked={autoApplySelectedRecipe} onChange={() => setAutoApplySelectedRecipeExclusive(!autoApplySelectedRecipe)} />
        </Menu>
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={closeResetMenu}
          slotProps={{ paper: { ref: resetMenuPaperRef } }}
        >
          {/* Reference defaultsEpoch so the reset menu re-evaluates when user defaults change. */}
          {(void defaultsEpoch, null)}
          <MenuItem
            onClick={() => {
              closeResetMenu()
              // Save current as user defaults. If identical to factory defaults,
              // remove the override to keep storage clean and restore factory behavior.
              const factory = createFactoryBuilderDefaults()
              const current: BuilderRecipe = {
                ...(recipe.appearance ? { appearance: recipe.appearance } : {}),
                keep: recipe.keep,
                exportMode: recipe.exportMode,
                rankCode: recipe.rankCode,
                rarityCode: recipe.rarityCode,
                rarityMode: (recipe.rarityMode ?? 'code'),
                autoRaritySupplementsThreshold: (recipe.autoRaritySupplementsThreshold ?? 'rare'),
                factionCode: (recipe.factionCode ?? 0),
                mainStatsV: (recipe.mainStatsV ?? []),
                minLevel: (recipe.minLevel ?? 0),
                maxLevel: (recipe.maxLevel ?? 16),
                earlyKeepMode: (recipe.earlyKeepMode ?? 'early'),
                substatsV: (recipe.substatsV ?? []),
                fixedSubstatsV: (recipe.fixedSubstatsV ?? []),
                minCount: recipe.minCount,
                autoMinCount: Boolean(recipe.autoMinCount ?? true),
                autoSubstatFlex: Boolean((recipe as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false),
                minRequiredRolls: Number(recipe.minRequiredRolls ?? 0) as 0|1|2|3|4|5,
                autoMinRequiredRolls: Boolean(recipe.autoMinRequiredRolls ?? true),
                substatRollBoundsV: (recipe.substatRollBoundsV ?? {}),
                artifactTypes: (recipe.artifactTypes ?? []),
                artifactSets: (recipe.artifactSets ?? []),
                artifactMetaSets: (recipe.artifactMetaSets ?? []),
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
            disabled={resetFactoryDisabled}
            onClick={() => {
              closeResetMenu()
              // Reset the builder to factory defaults explicitly
              const factory = createFactoryBuilderDefaults()
              onChange(normalizeKeepWithAuto({ ...recipe, ...factory }))
            }}
          >
            {t('builderMenuResetFactoryDefaults')}
          </MenuItem>
        </Menu>
      </Stack>
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
      <ClearTagsConfirmDialog
        open={clearTagsConfirmOpen}
        context="recipe"
        onClose={() => setClearTagsConfirmOpen(false)}
        onClear={handleClearTagsConfirm}
        onApplyAndClear={handleClearTagsApplyAndClear}
      />
    </Box>
  )
}
