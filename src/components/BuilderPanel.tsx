/**
 * BuilderPanel
 *
 * Main rule-builder UI. Edits a BuilderConfig, manages metasets and minima, and
 * previews generated HSF rules plus obsolete detection. Stateless except for
 * local UI state; all persisted state lives in App.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { rarityCodeToName, StatVariant, RankCode, RarityCode, Faction, type FactionId, filterAndSortSetEntries, statVariantI18nKey, artifactSetI18nKey } from '../lib/types'
import { NBSP } from '../lib/constants'
import SetMenuSection from './SetMenuSection'
import MetasetsDialog from './MetasetsDialog'
import { useMetasetsDialog } from '../hooks/useMetasetsDialog'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import type { HistoryPreview, DescribeNextChangeFn, HistoryTimelineEntry } from '../hooks/useHsfcHistory'
import { formatHistoryTooltipText } from '../history/historyTooltip'
import { buildHsfRules, LEVELS, normalizeExportModeFields, resolveAutoRarityCode, type BuilderConfig, type MinimaTable, type SellfileExportMode } from '../lib/hsfBuilder'
import {
  canEnableSubstatFlex,
  isMilestoneThresholdsActive,
  normalizeAutoRaritySupplements,
  normalizeAutoSubstatFlex,
  normalizeKeepMode,
  normalizeLevelWindow,
  normalizeSubstatMinTarget,
  type AutoRaritySupplementsThreshold,
} from '../lib/keepMode'
import { findObsoleteRules } from '../lib/hsfObsolete'
import { type Metaset, metasetGlyph, orderMetasetIds } from '../lib/metasets'
import { fingerprintConfigForRules } from '../lib/ruleCache'



//

import { Box, Button, Divider, Stack, Typography, TextField, Chip, FormControl, FormLabel, Select, MenuItem, ListSubheader, InputAdornment, Menu, Badge } from '@mui/material'
import SetsOrderControls from './SetsOrderControls'
import MinimaDialog from './MinimaDialog'
import type { SelectChangeEvent } from '@mui/material/Select'
import { IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { artifactTypeIconList } from './artifactTypeIcons'
import EllipsisTooltip from './EllipsisTooltip'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import InlineSelectClearButton from './InlineSelectClearButton'
import SelectDropdownActivator from './SelectDropdownActivator'
import BuilderCheatSheetPopover from './BuilderCheatSheetPopover'
import { SubstatToggleDisplay, substatToggleGroupSx } from './SubstatToggleDisplay'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ClearIconButton from './ClearIconButton'
import { UI_BG_HOVER_DANGER_TRANSITION, DANGER_TINT_BG, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, MENU_MAX_HEIGHT_EXTRA_BUFFER, SETS_MENU_WIDTH_PX, UI_SUBSTAT_WARNING_ROW_HEIGHT_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, BUILDER_USER_DEFAULTS_KEY, BUILDER_DEFAULT_SAVE_TARGET, BUILDER_DIRTY_NUDGE_IDLE_MS, BUILDER_DIRTY_ATTENTION_INTERVAL_MS, FONT_SIZE_BASE_PX, ELLIPSIS_TEXT_SX, BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX, BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX, SMALL_BUTTON_HEIGHT_PX, SETS_SELECT_INLINE_GUTTER_PX, CLEAR_ICON_BUTTON_SIZE_PX, SETS_TOOLTIP_MAX_WIDTH_PX, MULTI_EDIT_MIXED_BG_ALPHA, MULTI_EDIT_MIXED_BORDER_ALPHA, MULTI_EDIT_MIXED_TEXT_ALPHA, MENU_LABEL_WIDTH_PX, MENU_CONTROL_MIN_WIDTH_PX, MENU_CONTROL_HEIGHT_PX, ROLL_BADGE_SIZE_PX, ROLL_BADGE_SCALE, FONT_SIZE_SECONDARY_PX } from '../lib/constants'
import Checkbox from '@mui/material/Checkbox'
import { useAttentionEffectStyles, useFortyTwoLegendaryOverlay } from '../lib/attentionEffects'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { useI18n, formatRulesCount } from '../lib/i18n'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { FactionOptionLabel } from './FactionIcon'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import {
  type MultiEditDraftHandle,
  type MultiEditFieldState,
  type MultiEditArrayPatch,
  type MultiEditRollPatch,
  type MultiEditRollPatchEntry,
  applyMultiEditFieldsToConfig,
  getDirtyBuilderFieldKeys,
} from '../lib/multiEditDraft'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSetsOrderPreference } from '../state/setsOrderPreference'
import { useAutoResetAfterInsertPreference } from '../state/builderPreferences'
import { HistoryContextMenu } from './HistoryContextMenu'

const MAIN_STAT_VARIANTS_ROW1 = [StatVariant.HP_FLAT, StatVariant.HP, StatVariant.ATK_FLAT, StatVariant.ATK, StatVariant.DEF_FLAT, StatVariant.DEF] as const
const MAIN_STAT_VARIANTS_ROW2 = [StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG] as const
// Factory builder defaults used for resets and stored overrides.
const MULTI_VALUE_SENTINEL = '__multi__mixed__'
const MIN_REQUIRED_ROLL_OPTIONS = [0, 1, 2, 3, 4, 5] as const
const REQUIRED_SUBSTAT_MIN_OPTIONS = [1, 2, 3, 4] as const
const HISTORY_TOOLTIP_MAX_WIDTH_PX = 728

type TriStateBase = 'all' | 'mixed' | 'none'

const EMPTY_SELECTION: readonly number[] = []

const deriveBaseTriState = (count: number, total: number): TriStateBase => {
  if (total <= 0 || count <= 0) return 'none'
  if (count >= total) return 'all'
  return 'mixed'
}

const deriveLockBaseState = (locked: number, presence: number): TriStateBase => {
  if (presence <= 0 || locked <= 0) return 'none'
  if (locked >= presence) return 'all'
  return 'mixed'
}

const toTriStateBase = (state: 'none' | 'partial' | 'all'): TriStateBase => (
  state === 'partial' ? 'mixed' : state
)

const cloneNumberArrayPatch = (
  patch: MultiEditArrayPatch<number> | null | undefined,
): MultiEditArrayPatch<number> | null => {
  if (!patch) return null
  return {
    clear: patch.clear,
    replace: patch.replace ? [...patch.replace] : undefined,
    add: patch.add ? [...patch.add] : undefined,
    remove: patch.remove ? [...patch.remove] : undefined,
  }
}

const computeNumberPatchToggle = (
  patch: MultiEditArrayPatch<number> | null | undefined,
  variant: number,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<number> | null => {
  const draft = cloneNumberArrayPatch(patch)
  if (draft?.clear) {
    if (target === 'all') {
      return { replace: [variant] }
    }
    return { clear: true }
  }
  if (draft?.replace) {
    const values = new Set(draft.replace.map(Number))
    if (target === 'all') {
      values.add(variant)
    } else {
      values.delete(variant)
    }
    if (values.size === 0) {
      return { clear: true }
    }
    return { replace: Array.from(values).sort((a, b) => a - b) }
  }
  const addSet = new Set<number>((draft?.add ?? []).map(Number))
  const removeSet = new Set<number>((draft?.remove ?? []).map(Number))

  if (target === 'all') {
    removeSet.delete(variant)
    if (baseState !== 'all') {
      addSet.add(variant)
    } else {
      addSet.delete(variant)
    }
  } else {
    addSet.delete(variant)
    if (baseState !== 'none') {
      removeSet.add(variant)
    } else {
      removeSet.delete(variant)
    }
  }

  const nextPatch: MultiEditArrayPatch<number> = {}
  if (addSet.size > 0) nextPatch.add = Array.from(addSet)
  if (removeSet.size > 0) nextPatch.remove = Array.from(removeSet)
  return (nextPatch.add || nextPatch.remove) ? nextPatch : null
}

const cloneStringArrayPatch = (
  patch: MultiEditArrayPatch<string> | null | undefined,
): MultiEditArrayPatch<string> | null => {
  if (!patch) return null
  return {
    clear: patch.clear,
    replace: patch.replace ? [...patch.replace] : undefined,
    add: patch.add ? [...patch.add] : undefined,
    remove: patch.remove ? [...patch.remove] : undefined,
  }
}

const computeStringPatchToggle = (
  patch: MultiEditArrayPatch<string> | null | undefined,
  token: string,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<string> | null => {
  const draft = cloneStringArrayPatch(patch)
  if (draft?.clear) {
    if (target === 'all') {
      return { replace: [token] }
    }
    return { clear: true }
  }
  if (draft?.replace) {
    const values = new Set(draft.replace.map(String))
    if (target === 'all') {
      values.add(token)
    } else {
      values.delete(token)
    }
    if (values.size === 0) {
      return { clear: true }
    }
    return { replace: Array.from(values).sort((a, b) => a.localeCompare(b)) }
  }
  const addSet = new Set<string>((draft?.add ?? []).map(String))
  const removeSet = new Set<string>((draft?.remove ?? []).map(String))

  if (target === 'all') {
    removeSet.delete(token)
    if (baseState !== 'all') {
      addSet.add(token)
    } else {
      addSet.delete(token)
    }
  } else {
    addSet.delete(token)
    if (baseState !== 'none') {
      removeSet.add(token)
    } else {
      removeSet.delete(token)
    }
  }

  const nextPatch: MultiEditArrayPatch<string> = {}
  if (addSet.size > 0) nextPatch.add = Array.from(addSet)
  if (removeSet.size > 0) nextPatch.remove = Array.from(removeSet)
  return (nextPatch.add || nextPatch.remove) ? nextPatch : null
}

const applyNumberPatchPreview = (
  source: readonly number[],
  patch: MultiEditArrayPatch<number> | null | undefined,
): number[] => {
  if (!patch || (!patch.clear && !patch.replace && !patch.add && !patch.remove)) {
    return [...source]
  }
  if (patch.clear) return []
  if (patch.replace && patch.replace.length >= 0) {
    return Array.from(new Set(patch.replace.map(Number))).sort((a, b) => a - b)
  }
  const set = new Set(source.map(Number))
  if (patch.remove) {
    for (const value of patch.remove) set.delete(Number(value))
  }
  if (patch.add) {
    for (const value of patch.add) set.add(Number(value))
  }
  return Array.from(set).sort((a, b) => a - b)
}

const applyStringPatchPreview = (
  source: readonly string[],
  patch: MultiEditArrayPatch<string> | null | undefined,
): string[] => {
  if (!patch || (!patch.clear && !patch.replace && !patch.add && !patch.remove)) {
    return [...source]
  }
  if (patch.clear) return []
  if (patch.replace && patch.replace.length >= 0) {
    return Array.from(new Set(patch.replace.map(String))).sort((a, b) => a.localeCompare(b))
  }
  const set = new Set(source.map(String))
  if (patch.remove) {
    for (const value of patch.remove) set.delete(String(value))
  }
  if (patch.add) {
    for (const value of patch.add) set.add(String(value))
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

type SubstatRollBoundsEntry = { min?: number; max?: number; any?: boolean }

type SubstatMenuInfo = {
  variant: StatVariant
  presence: 'all' | 'partial'
  lockState: 'none' | 'partial' | 'all'
  minValue: number | null
  maxValue: number | null
  minMixed: boolean
  maxMixed: boolean
  wildcard: boolean
  rollKind: 'none' | 'any' | 'min' | 'max' | 'mixed'
}

const clampRollMin = (value: number): number => Math.max(0, Math.min(5, Math.round(Number(value))))
const clampRollMax = (value: number): number => Math.max(0, Math.min(4, Math.round(Number(value))))

const normalizeRollBoundsEntry = (entry: SubstatRollBoundsEntry | null | undefined): SubstatRollBoundsEntry | null => {
  if (!entry) return null
  const next: SubstatRollBoundsEntry = {}
  const hasMin = typeof entry.min === 'number' && Number.isFinite(entry.min)
  const hasMax = typeof entry.max === 'number' && Number.isFinite(entry.max)
  if (hasMin) next.min = clampRollMin(entry.min!)
  if (hasMax) next.max = clampRollMax(entry.max!)
  if (typeof next.min === 'number' && typeof next.max === 'number' && next.max < Math.min(next.min, 4)) {
    next.max = Math.min(4, next.min)
  }
  if (!hasMin && !hasMax) {
    return entry.any ? { any: true } : null
  }
  return next
}

const rollBoundsEqual = (a: SubstatRollBoundsEntry | null, b: SubstatRollBoundsEntry | null): boolean => (
  ((a?.min ?? null) === (b?.min ?? null))
  && ((a?.max ?? null) === (b?.max ?? null))
  && (Boolean(a?.any) === Boolean(b?.any))
)

const SUBSTAT_MENU_ROLL_COLUMNS = 7 as const
const SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX = Math.round(ROLL_BADGE_SIZE_PX * ROLL_BADGE_SCALE)
const SUBSTAT_MENU_ROLL_GAP_PX = 12 as const
const SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX = (SUBSTAT_MENU_ROLL_COLUMNS * SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX)
  + ((SUBSTAT_MENU_ROLL_COLUMNS - 1) * SUBSTAT_MENU_ROLL_GAP_PX)
const SUBSTAT_MENU_CONTROL_WIDTH_PX = Math.max(MENU_CONTROL_MIN_WIDTH_PX, SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX)
const SUBSTAT_MENU_WIDTH_PX = MENU_LABEL_WIDTH_PX + SUBSTAT_MENU_CONTROL_WIDTH_PX + 32
const SUBSTAT_MENU_ROLL_FONT_SIZE_PX = Math.round(FONT_SIZE_SECONDARY_PX * ROLL_BADGE_SCALE)
const LOCK_MENU_BUTTON_WIDTH_PX = MENU_CONTROL_HEIGHT_PX + 4
const LOCK_MENU_GAP_PX = (SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX + SUBSTAT_MENU_ROLL_GAP_PX) - LOCK_MENU_BUTTON_WIDTH_PX
const LOCK_MENU_OFFSET_PX = (SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX - LOCK_MENU_BUTTON_WIDTH_PX) / 2
const LOCK_MENU_BORDER_RADIUS_PX = 3
const ROLL_ANY_STAR = '★' as const

const createFactoryBuilderDefaults = (): BuilderConfig => ({
  name: '',
  keep: true,
  exportMode: 'active',
  rankCode: 0,
  rarityCode: 0,
  rarityMode: 'auto',
  autoRaritySupplementsThreshold: 'rare',
  factionCode: 0,
  mainStatsV: [],
  minLevel: 0,
  maxLevel: 16,
  rollBaseline: 'afterStart',
  earlyKeepMode: 'early',
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 0,
  autoMinCount: true,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  substatRollBoundsV: {},
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
  substatMinTarget: 'selected',
})

const MAX_CONFIG_INDEX_FOR_BUTTON_WIDTH = 999_999 as const
export default function BuilderPanel({ cfg, onChange, onAddToCustom, editingIndex, onUpdateSelected, onApplyMultiEdit, onUndo, onRedo, canUndo, canRedo, undoPreview, redoPreview, historyTimeline, onJumpToHistoryIndex, onRequestClearHistory, metasets, onMetasetsChange, describeNextChange, onDeleteMetaset, onResetMetasets, minima, onMinimaChange, setUsageCounts, metasetUsageCounts, substatColors: _substatColors, configCount: _configCount, configRuleCounts, configRuleFingerprints, ruleMinimaKey, selectedIsDirty, configHiddenByFilters, onSelectConfigsByMetaset, minimaDialogOpen, onCloseMinimaDialog, multiEdit: _multiEdit = null, multiSelectedConfigs = null }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onAddToCustom: () => void
  editingIndex: number | null
  onUpdateSelected: () => void
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
  minima: MinimaTable
  onMinimaChange: (m: MinimaTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
  setUsageCounts: Record<number, number>
  metasetUsageCounts: Record<string, number>
  substatColors: Record<number, { fg: string; bg: string }>
  configCount: number
  configRuleCounts: ReadonlyMap<number, number>
  configRuleFingerprints: readonly string[]
  ruleMinimaKey: string
  selectedIsDirty: boolean
  configHiddenByFilters: boolean
  // Select all configs that reference a given metaset ID (used from Metasets dialog "Used" chip)
  onSelectConfigsByMetaset: (id: string) => void
  minimaDialogOpen: boolean
  onCloseMinimaDialog: () => void
  multiEdit?: MultiEditDraftHandle | null
  multiSelectedConfigs?: readonly BuilderConfig[] | null
}) {
  const multiEdit = _multiEdit
  const multiEditSelectionCount = multiEdit?.state.selection.length ?? 0
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
  const multiMainStatsField = multiFields?.mainStatsV ?? null
  const multiSubstatsField = multiFields?.substatsV ?? null
  const multiFixedSubstatsField = multiFields?.fixedSubstatsV ?? null
  const multiRollField = multiFields?.substatRollBoundsV ?? null
  const multiAutoRaritySupplementsField = multiFields?.autoRaritySupplementsThreshold ?? null
  const multiSlotsField = multiFields?.artifactTypes ?? null
  const multiSetsField = multiFields?.artifactSets ?? null
  const multiMetasetsField = multiFields?.artifactMetaSets ?? null
  const multiAutoMinRequiredRollsField = multiFields?.autoMinRequiredRolls ?? null
  const multiMinRequiredRollsField = multiFields?.minRequiredRolls ?? null
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
  const pickAutoRarityFallback = React.useCallback((target: BuilderConfig): AutoRaritySupplementsThreshold => {
    const code = resolveAutoRarityCode(target)
    return (code >= 9) ? 'epic' : 'rare'
  }, [])
  const normalizeKeepWithAuto = React.useCallback((next: BuilderConfig): BuilderConfig => {
    const withKeep = normalizeKeepMode(next)
    const withSubstatTarget = normalizeSubstatMinTarget(withKeep)
    const shouldApplyAuto = (withSubstatTarget.rarityMode === 'auto')
      && ((withSubstatTarget.earlyKeepMode ?? 'early') === 'late')
      && isMilestoneThresholdsActive(withSubstatTarget)
    const fallback = shouldApplyAuto ? pickAutoRarityFallback(withSubstatTarget) : undefined
    const withAuto = normalizeAutoRaritySupplements(
      withSubstatTarget,
      fallback ? { defaultThreshold: fallback } : undefined,
    )
    return normalizeAutoSubstatFlex(withAuto)
  }, [pickAutoRarityFallback])
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
const [substatMenu, setSubstatMenu] = React.useState<{ variant: StatVariant; anchor: { x: number; y: number } } | null>(null)
const [substatMenuDraft, setSubstatMenuDraft] = React.useState<{ min: number | null; max: number | null } | null>(null)
const substatMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
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
const multiSummary = useMemo(() => {
    if (!multiEditActive || !multiSourceConfigs) return null
    const total = multiSourceConfigs.length
    const mainCounts = new Map<number, number>()
    const subCounts = new Map<number, { present: number; locked: number }>()
    const rollSummary = new Map<number, { any: number; minValues: Set<number>; maxValues: Set<number> }>()
    const slotCounts = new Map<number, number>()
    const setCounts = new Map<number, number>()
    const metaCounts = new Map<string, number>()
    for (const config of multiSourceConfigs) {
      const main = Array.isArray(config.mainStatsV) ? config.mainStatsV : []
      for (const variant of main) {
        mainCounts.set(variant, (mainCounts.get(variant) ?? 0) + 1)
      }
      const substats = Array.isArray(config.substatsV) ? config.substatsV : []
      const fixed = new Set<number>(Array.isArray(config.fixedSubstatsV) ? config.fixedSubstatsV : [])
      const bounds = (config.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
      for (const variant of substats) {
        const entry = subCounts.get(variant) ?? { present: 0, locked: 0 }
        entry.present += 1
        if (fixed.has(variant)) entry.locked += 1
        subCounts.set(variant, entry)
        const roll = rollSummary.get(variant) ?? { any: 0, minValues: new Set<number>(), maxValues: new Set<number>() }
        const b = bounds[variant]
        if (b?.any) roll.any += 1
        if (typeof b?.min === 'number') roll.minValues.add(Math.max(0, Math.min(5, Number(b.min))))
        if (typeof b?.max === 'number') roll.maxValues.add(Math.max(0, Math.min(4, Number(b.max))))
        rollSummary.set(variant, roll)
      }
      for (const variant of fixed) {
        if (!subCounts.has(variant)) {
          subCounts.set(variant, { present: 0, locked: 1 })
        }
      }
      const slots = Array.isArray(config.artifactTypes) ? config.artifactTypes : []
      for (const slot of slots) {
        slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
      }
      const sets = Array.isArray(config.artifactSets) ? config.artifactSets : []
      for (const set of sets) {
        setCounts.set(set, (setCounts.get(set) ?? 0) + 1)
      }
      const metas = Array.isArray(config.artifactMetaSets) ? config.artifactMetaSets : []
      for (const meta of metas) {
        metaCounts.set(meta, (metaCounts.get(meta) ?? 0) + 1)
      }
    }
    return {
      total,
      mainCounts,
      subCounts,
      rollSummary,
      slotCounts,
      setCounts,
      metaCounts,
    }
  }, [multiEditActive, multiSourceConfigs])
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
    multiEdit.updateField('substatRollBoundsV', {
      value: (multiRollField?.value as BuilderConfig['substatRollBoundsV']) ?? (cfg.substatRollBoundsV ?? {}),
      status: 'common',
      patch: {
        [variant]: entry,
      },
    })
  }, [cfg.substatRollBoundsV, multiEdit, multiEditActive, multiRollField?.value])
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
          if (mode.minValues.length === 1) {
            info.minValue = clampRollMin(mode.minValues[0]!)
          } else if (mode.minValues.length > 1) {
            info.minMixed = true
          }
          if (mode.maxValues.length === 1) {
            info.maxValue = clampRollMax(mode.maxValues[0]!)
          } else if (mode.maxValues.length > 1) {
            info.maxMixed = true
          }
          info.wildcard = mode.wildcardCount > 0
          break
        }
        default:
          break
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
  React.useEffect(() => {
    if (!substatMenu) {
      if (substatMenuDraft !== null) setSubstatMenuDraft(null)
      return
    }
    const info = deriveSubstatMenuInfo(substatMenu.variant)
    if (!info) {
      setSubstatMenu(null)
      setSubstatMenuDraft(null)
      return
    }
    setSubstatMenuDraft((prev) => {
      if (prev && prev.min === info.minValue && prev.max === info.maxValue) return prev
      return { min: info.minValue, max: info.maxValue }
    })
  }, [deriveSubstatMenuInfo, substatMenu, substatMenuDraft])
  const handleSubstatMenuClose = React.useCallback(() => {
    setSubstatMenu(null)
    setSubstatMenuDraft(null)
  }, [])
  const activeMenuInfo = React.useMemo(
    () => (substatMenu ? deriveSubstatMenuInfo(substatMenu.variant) : null),
    [deriveSubstatMenuInfo, substatMenu],
  )
  const menuOpen = Boolean(substatMenu && activeMenuInfo)
  const menuAnchor = substatMenu?.anchor ?? { x: 0, y: 0 }
  useContextMenuCloseOnOutsideRightClick({
    open: menuOpen,
    onClose: handleSubstatMenuClose,
    menuRef: substatMenuPaperRef,
  })
  const multiToggleSubstat = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    const presence = getSubstatPresence(variant)
    const baseEntry = multiSummary.subCounts.get(variant)
    const basePresenceCount = baseEntry?.present ?? 0
    const basePresenceState = deriveBaseTriState(basePresenceCount, multiSummary.total)
    const substatsBase = Array.isArray(cfg.substatsV) ? cfg.substatsV : []
    const fixedBase = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV : []

    let nextSubstatsPatch: MultiEditArrayPatch<number> | null = null
    let nextFixedPatch: MultiEditArrayPatch<number> | null = null

    if (presence !== 'all') {
      nextSubstatsPatch = computeNumberPatchToggle(substatsPatch, variant, basePresenceState, 'all')
    } else {
      nextSubstatsPatch = computeNumberPatchToggle(substatsPatch, variant, basePresenceState, 'none')
      const baseLockedCount = baseEntry?.locked ?? 0
      const baseLockState = deriveLockBaseState(baseLockedCount, basePresenceCount)
      nextFixedPatch = computeNumberPatchToggle(fixedSubstatsPatch, variant, baseLockState, 'none')
    }

    const nextSubstatsValue = applyNumberPatchPreview(substatsBase, nextSubstatsPatch)
    const nextFixedValue = applyNumberPatchPreview(fixedBase, nextFixedPatch)

    multiEdit.updateField('substatsV', {
      value: nextSubstatsValue as BuilderConfig['substatsV'],
      status: 'common',
      patch: nextSubstatsPatch ?? undefined,
    })
    multiEdit.updateField('fixedSubstatsV', {
      value: nextFixedValue as BuilderConfig['fixedSubstatsV'],
      status: 'common',
      patch: nextFixedPatch ?? undefined,
    })
    if (presence === 'all') {
      commitRollPatch(variant, { any: false, min: null, max: null })
    }
  }, [cfg.substatsV, cfg.fixedSubstatsV, commitRollPatch, fixedSubstatsPatch, getSubstatPresence, multiEdit, multiEditActive, multiSummary, substatsPatch])
  // Multi-edit lock toggle keeps substat presence aligned while flipping the fixed state.
  const multiToggleSubstatLock = React.useCallback((variant: number) => {
    if (!multiEditActive || !multiEdit || !multiSummary) return
    const presence = getSubstatPresence(variant)
    const lockState = getSubstatLockState(variant)
    const baseEntry = multiSummary.subCounts.get(variant)
    const basePresenceCount = baseEntry?.present ?? 0
    const basePresenceState = deriveBaseTriState(basePresenceCount, multiSummary.total)
    const baseLockedCount = baseEntry?.locked ?? 0
    const baseLockState = deriveLockBaseState(baseLockedCount, basePresenceCount)
    const substatsBase = Array.isArray(cfg.substatsV) ? cfg.substatsV : []
    const fixedBase = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV : []

    let nextSubstatsPatch: MultiEditArrayPatch<number> | null = null
    let nextFixedPatch: MultiEditArrayPatch<number> | null = null

    if (lockState === 'all' && presence !== 'none') {
      nextFixedPatch = computeNumberPatchToggle(fixedSubstatsPatch, variant, baseLockState, 'none')
    } else {
      if (presence !== 'all') {
        nextSubstatsPatch = computeNumberPatchToggle(substatsPatch, variant, basePresenceState, 'all')
      }
      nextFixedPatch = computeNumberPatchToggle(fixedSubstatsPatch, variant, baseLockState, 'all')
    }

    const nextSubstatsValue = applyNumberPatchPreview(substatsBase, nextSubstatsPatch)
    const nextFixedValue = applyNumberPatchPreview(fixedBase, nextFixedPatch)

    multiEdit.updateField('substatsV', {
      value: nextSubstatsValue as BuilderConfig['substatsV'],
      status: 'common',
      patch: nextSubstatsPatch ?? undefined,
    })
    multiEdit.updateField('fixedSubstatsV', {
      value: nextFixedValue as BuilderConfig['fixedSubstatsV'],
      status: 'common',
      patch: nextFixedPatch ?? undefined,
    })
  }, [cfg.substatsV, cfg.fixedSubstatsV, fixedSubstatsPatch, getSubstatLockState, getSubstatPresence, multiEdit, multiEditActive, multiSummary, substatsPatch])
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
  const setsPatch = (multiSetsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null
  const metasetsPatch = (multiMetasetsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
  const getSetState = React.useCallback((id: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      const selected = Array.isArray(cfg.artifactSets) ? cfg.artifactSets.includes(id) : false
      return selected ? 'all' : 'none'
    }
    const base = multiSummary.setCounts.get(id) ?? 0
    const final = resolveTokenPresence(id, base, setsPatch)
    if (final === 0) return 'none'
    if (final === multiSummary.total) return 'all'
    return 'partial'
  }, [cfg.artifactSets, multiEditActive, multiSummary, resolveTokenPresence, setsPatch])
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
    return (cfg.artifactSets ?? []).includes(id) ? 'all' : 'none'
  }, [cfg.artifactSets, getSetState, multiEditActive])
  const toggleSet = React.useCallback((id: number) => {
    if (!multiEditActive || !multiEdit) return
    const state = getSetState(id)
    const baseState = toTriStateBase(state)
    const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
    const nextPatch = computeNumberPatchToggle(
      (multiSetsField?.patch as MultiEditArrayPatch<number> | null | undefined) ?? null,
      id,
      baseState,
      target,
    )
    const baseArray = Array.isArray(cfg.artifactSets) ? cfg.artifactSets : []
    const preview = applyNumberPatchPreview(baseArray, nextPatch)
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
  const exportModeValue: SellfileExportMode | null = multiEditActive
    ? (exportModeMixed ? null : (multiExportModeField?.value as SellfileExportMode | undefined ?? 'active'))
    : cfg.exportMode
  const rankMixed = multiEditActive && (multiRankField?.status === 'mixed')
  const rankValue = multiEditActive
    ? (rankMixed ? '' : String((multiRankField?.value as number | undefined) ?? cfg.rankCode))
    : String(cfg.rankCode)
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
    : (cfg.rarityMode === 'auto' ? 'auto' : String(cfg.rarityCode))
  const factionMixed = multiEditActive && (multiFactionField?.status === 'mixed')
  const factionValue = multiEditActive
    ? (factionMixed ? '' : String((multiFactionField?.value as number | undefined) ?? cfg.factionCode ?? 0))
    : String(cfg.factionCode ?? 0)
  const singleMinLevel = Number((cfg as BuilderConfig).minLevel ?? 0) as 0 | 4 | 8 | 12 | 16
  const singleMaxLevel = Number((cfg as BuilderConfig).maxLevel ?? 16) as 0 | 4 | 8 | 12 | 16
  const aggregatedMinLevel = multiEditActive
    ? (() => {
        if (!multiMinLevelField) return singleMinLevel
        if (multiMinLevelField.status === 'common') {
          const value = Number(multiMinLevelField.value)
          return Number.isFinite(value) ? (value as 0 | 4 | 8 | 12 | 16) : singleMinLevel
        }
        const values = (multiMinLevelField.mixedValues ?? [])
          .map((entry) => Number(entry))
          .filter((num): num is number => Number.isFinite(num))
        if (!values.length) return singleMinLevel
        const min = Math.min(...values)
        return [0, 4, 8, 12, 16].includes(min) ? (min as 0 | 4 | 8 | 12 | 16) : singleMinLevel
      })()
    : singleMinLevel
  const aggregatedMaxLevel = multiEditActive
    ? (() => {
        if (!multiMaxLevelField) return singleMaxLevel
        if (multiMaxLevelField.status === 'common') {
          const value = Number(multiMaxLevelField.value)
          return Number.isFinite(value) ? (value as 0 | 4 | 8 | 12 | 16) : singleMaxLevel
        }
        const values = (multiMaxLevelField.mixedValues ?? [])
          .map((entry) => Number(entry))
          .filter((num): num is number => Number.isFinite(num))
        if (!values.length) return singleMaxLevel
        const max = Math.max(...values)
        return [0, 4, 8, 12, 16].includes(max) ? (max as 0 | 4 | 8 | 12 | 16) : singleMaxLevel
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
    if (!multiEditActive || !multiSourceConfigs) {
      const auto = cfg.autoMinRequiredRolls !== false
      if (target === 'auto') return auto ? 'on' : 'off'
      const value = Number(cfg.minRequiredRolls ?? 0)
      return (!auto && value === target) ? 'on' : 'off'
    }
    const autoField = multiAutoMinRequiredRollsField
    const manualField = multiMinRequiredRollsField
    if (autoField) {
      if (autoField.status === 'common') {
        const autoOn = autoField.value !== false
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
      const auto = config.autoMinRequiredRolls !== false
      if (target === 'auto') {
        if (auto) matches += 1
        continue
      }
      if (!auto && Number(config.minRequiredRolls ?? 0) === target) {
        matches += 1
      }
    }
    return computeTriState(matches, total)
  }, [cfg, computeTriState, multiAutoMinRequiredRollsField, multiEditActive, multiMinRequiredRollsField, multiSourceConfigs])
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
      const mode = ((cfg as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late'
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
  }, [cfg, computeTriState, multiEditActive, multiEarlyKeepModeField, multiSourceConfigs])
  const getAutoRarityTriState = React.useCallback((): 'on' | 'mixed' | 'off' | 'disabled' => {
    if (!multiEditActive || !multiSourceConfigs) {
      const active = milestoneThresholdsActive &&
        (cfg.rarityMode === 'auto') &&
        (((cfg as BuilderConfig).earlyKeepMode ?? 'early') === 'late')
      if (!active) return 'disabled'
      return cfg.autoRaritySupplementsThreshold ? 'on' : 'off'
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
  }, [cfg, computeTriState, milestoneThresholdsActive, multiAutoRaritySupplementsField, multiEditActive, multiSourceConfigs])
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
  const { t } = useI18n()
  const isMacPlatform = React.useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const platform = navigator.platform || navigator.userAgent || ''
    return /Mac|iPhone|iPad|iPod/i.test(platform)
  }, [])
  const undoShortcutLabel = isMacPlatform ? '⌘+Z' : 'Ctrl+Z'
  const redoShortcutLabel = isMacPlatform ? '⌘+Shift+Z' : 'Ctrl+Y'
  const undoTooltipText = useMemo(
    () => formatHistoryTooltipText({
      descriptor: undoPreview?.descriptor ?? null,
      fallbackText: t('builderUndoTooltip', { shortcut: undoShortcutLabel }),
      shortcutHintText: t('builderHistoryShortcutHint', { shortcut: undoShortcutLabel }),
    }),
    [undoPreview, t, undoShortcutLabel],
  )
  const redoTooltipText = useMemo(
    () => formatHistoryTooltipText({
      descriptor: redoPreview?.descriptor ?? null,
      fallbackText: t('builderRedoTooltip', { shortcut: redoShortcutLabel }),
      shortcutHintText: t('builderHistoryShortcutHint', { shortcut: redoShortcutLabel }),
    }),
    [redoPreview, t, redoShortcutLabel],
  )
  const [historyMenuState, setHistoryMenuState] = useState<{ open: boolean; x: number; y: number } | null>(null)
  const historyMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const historyMenuOpen = Boolean(historyMenuState?.open)
  const historyMenuAnchor = historyMenuOpen && historyMenuState ? { top: historyMenuState.y, left: historyMenuState.x } : null
  const closeHistoryMenu = React.useCallback(() => { setHistoryMenuState(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: historyMenuOpen,
    onClose: closeHistoryMenu,
    menuRef: historyMenuPaperRef,
  })
  const { shouldShow: shouldShowHistoryHint, markSeen: markHistoryHintSeen } = useContextMenuHint('builderHistoryMenu')
  const [historyHintPos, setHistoryHintPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!shouldShowHistoryHint) setHistoryHintPos(null)
  }, [shouldShowHistoryHint])
  const historyHintActive = shouldShowHistoryHint && historyHintPos !== null && !historyMenuOpen
  const handleHistoryContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setHistoryMenuState({ open: true, x: event.clientX, y: event.clientY })
    if (shouldShowHistoryHint) {
      markHistoryHintSeen()
      setHistoryHintPos(null)
    }
  }, [markHistoryHintSeen, shouldShowHistoryHint])
  const handleHistoryMouseMove = React.useCallback((event: React.MouseEvent) => {
    if (!shouldShowHistoryHint || historyMenuOpen) return
    setHistoryHintPos({ x: event.clientX, y: event.clientY })
  }, [historyMenuOpen, shouldShowHistoryHint])
  const handleHistoryMouseLeave = React.useCallback(() => {
    setHistoryHintPos(null)
  }, [])
  const handleHistoryMenuContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])
  const handleRequestClearHistory = React.useCallback(() => {
    if (shouldShowHistoryHint) {
      markHistoryHintSeen()
    }
    onRequestClearHistory()
  }, [markHistoryHintSeen, onRequestClearHistory, shouldShowHistoryHint])
  const handleHistoryEntrySelect = React.useCallback((index: number) => {
    if (shouldShowHistoryHint) {
      markHistoryHintSeen()
    }
    closeHistoryMenu()
    setHistoryHintPos(null)
    onJumpToHistoryIndex(index)
  }, [closeHistoryMenu, markHistoryHintSeen, onJumpToHistoryIndex, shouldShowHistoryHint])
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
  const singleMinRequiredValue = cfg.autoMinRequiredRolls !== false ? 'auto' : String(Number(cfg.minRequiredRolls ?? 0))
  const minRequiredValue = multiEditActive
    ? (() => {
        if (getMinRequiredRollsTriState('auto') === 'on') return 'auto'
        const manualMatch = MIN_REQUIRED_ROLL_OPTIONS.find((option) => getMinRequiredRollsTriState(option) === 'on')
        return manualMatch != null ? String(manualMatch) : MULTI_VALUE_SENTINEL
      })()
    : singleMinRequiredValue
  const singleRequiredCountValue = cfg.autoMinCount ? 'auto' : ((cfg.minCount ?? 0) > 0 ? String(cfg.minCount) : 'auto')
  const requiredCountValue = multiEditActive
    ? (() => {
        if (getRequiredCountTriState('auto') === 'on') return 'auto'
        const manualMatch = REQUIRED_SUBSTAT_MIN_OPTIONS.find((option) => getRequiredCountTriState(option) === 'on')
        return manualMatch != null ? String(manualMatch) : MULTI_VALUE_SENTINEL
      })()
    : singleRequiredCountValue
  const singleKeepModeValue = ((cfg as BuilderConfig).earlyKeepMode ?? 'early') as 'early' | 'late'
  const keepModeValue = multiEditActive
    ? (() => {
        if (getKeepModeTriState('late') === 'on') return 'late'
        if (getKeepModeTriState('early') === 'on') return 'early'
        return MULTI_VALUE_SENTINEL
      })()
    : singleKeepModeValue
  const thresholdsActiveAny = multiEditActive && multiSourceConfigs
    ? multiSourceConfigs.some((config) => isMilestoneThresholdsActive(config))
    : milestoneThresholdsActive
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
  const updateExportMode = (next: SellfileExportMode) => {
    onChange({ ...cfg, exportMode: next })
  }
  const [nameDraft, setNameDraft] = useState<string>('')
  const [nameDraftKey, setNameDraftKey] = useState<number | 'builder' | null>(null)
  const currentDraftKey: number | 'builder' = editingIndex ?? 'builder'
  const nameDraftDirty = nameDraftKey === currentDraftKey
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
  const isDirty = multiEditActive ? multiDraftDirty : (selectedIsDirty || nameDraftDirty)
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
  const saveTooltipScope = `${configHiddenByFilters ? 'visible' : 'hidden'}:${saveDisabled ? 'disabled' : 'active'}`
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
  const hiddenBadgeSx = useMemo(() => ({
    '& .MuiBadge-badge': {
      minWidth: 18,
      height: 18,
      borderRadius: '50%',
      top: 4,
      right: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: theme.shadows[2],
      backgroundColor: theme.palette.warning.main,
      color: theme.palette.getContrastText(theme.palette.warning.main),
      border: `2px solid ${theme.palette.background.paper}`,
      fontWeight: theme.typography.fontWeightBold ?? 600,
      fontSize: theme.typography.pxToRem ? theme.typography.pxToRem(12) : '0.75rem',
      lineHeight: 1,
    },
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
  useEffect(() => {
    const fixed = Array.isArray((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV)
      ? ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[])
      : []
    if (fixed.length === 0 && ((cfg as unknown as { substatMinTarget?: 'locked' | 'selected' }).substatMinTarget === 'locked')) {
      onChange({ ...cfg, substatMinTarget: 'selected' })
    }
  }, [cfg, onChange])
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
  const { open: metaDlgOpen, openDialog: openMetaDlg, closeDialog: closeMetaDlg } = useMetasetsDialog()
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
  const scrollSetsMenuToSelected = React.useCallback((orderOverride?: 'game' | 'az' | 'icons') => {
    if (!metaSetsMenuOpen) return
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
  const deferredMultiProjectedConfigs = React.useDeferredValue(multiProjectedConfigs)
  const deferredCfg = React.useDeferredValue(cfg)
  const deferredMinima = React.useDeferredValue(minima)
  const builderRuleFingerprint = React.useMemo(
    () => fingerprintConfigForRules(deferredCfg, ruleMinimaKey),
    [deferredCfg, ruleMinimaKey],
  )
  const selectedRuleFingerprint = (typeof editingIndex === 'number' && editingIndex >= 0)
    ? (configRuleFingerprints[editingIndex] ?? null)
    : null
  const multiEditSelection = multiEdit?.state.selection ?? EMPTY_SELECTION

  const singleRuleCacheRef = useRef<{ cfgRef: BuilderConfig | null; minimaRef: MinimaTable | null; fingerprint: string | null; count: number | null }>({
    cfgRef: null,
    minimaRef: null,
    fingerprint: null,
    count: null,
  })

  const precomputedRuleCount = React.useMemo((): number | null => {
    if (multiEditActive) {
      if (multiDirtyKeys.length > 0) return null
      if (multiEditSelection.length === 0) {
        return 0
      }
      let total = 0
      for (const idx of multiEditSelection) {
        total += configRuleCounts.get(idx) ?? 0
      }
      return total
    }
    if (typeof editingIndex === 'number' && editingIndex >= 0) {
      const cachedCount = configRuleCounts.get(editingIndex) ?? 0
      if (!selectedIsDirty) {
        return cachedCount
      }
      if (selectedRuleFingerprint && builderRuleFingerprint === selectedRuleFingerprint) {
        return cachedCount
      }
    }
    if (!multiEditActive) {
      const cache = singleRuleCacheRef.current
      if (cache.cfgRef === deferredCfg && cache.minimaRef === deferredMinima) {
        return cache.count ?? null
      }
      if (cache.fingerprint && cache.fingerprint === builderRuleFingerprint) {
        return cache.count ?? null
      }
    }
    return null
  }, [
    builderRuleFingerprint,
    configRuleCounts,
    editingIndex,
    multiDirtyKeys,
    multiEditActive,
    multiEditSelection,
    selectedIsDirty,
    selectedRuleFingerprint,
    deferredCfg,
    deferredMinima,
  ])

  const latestRuleCountRef = useRef<number | null>(null)
  const computedRuleCount = React.useMemo(() => {
    if (precomputedRuleCount !== null) {
      latestRuleCountRef.current = precomputedRuleCount
      return precomputedRuleCount
    }
    try {
      const countRulesForConfig = (config: BuilderConfig): number => {
        const built = buildHsfRules(config, deferredMinima)
        if (built.length === 0) {
          return 0
        }
        const { obsolete } = findObsoleteRules(built)
        if (obsolete.length === 0) {
          return built.length
        }
        const removed = new Set<number>(obsolete.map(o => o.index))
        let kept = 0
        for (let i = 0; i < built.length; i += 1) {
          if (!removed.has(i)) kept += 1
        }
        return kept
      }
      if (multiEditActive && deferredMultiProjectedConfigs && deferredMultiProjectedConfigs.length > 0) {
        let total = 0
        deferredMultiProjectedConfigs.forEach((source) => {
          const count = countRulesForConfig(source)
          total += count
        })
        latestRuleCountRef.current = total
        return total
      }
      const count = countRulesForConfig(deferredCfg)
      singleRuleCacheRef.current = {
        cfgRef: deferredCfg,
        minimaRef: deferredMinima,
        fingerprint: builderRuleFingerprint,
        count,
      }
      latestRuleCountRef.current = count
      return count
    } catch (_err) {
      singleRuleCacheRef.current = {
        cfgRef: null,
        minimaRef: null,
        fingerprint: null,
        count: null,
      }
      latestRuleCountRef.current = null
      return null
    }
  }, [
    builderRuleFingerprint,
    deferredCfg,
    deferredMinima,
    deferredMultiProjectedConfigs,
    multiEditActive,
    precomputedRuleCount,
  ])
  const counting = (precomputedRuleCount === null)
    && ((deferredCfg !== cfg)
    || (deferredMinima !== minima)
    || (deferredMultiProjectedConfigs !== multiProjectedConfigs))
  const ruleCount = counting ? latestRuleCountRef.current : computedRuleCount
  const warnEligibleExportMode = useMemo(() => {
    if (multiEditActive) {
      const projected = deferredMultiProjectedConfigs ?? multiProjectedConfigs ?? multiSourceConfigs
      if (!projected || projected.length === 0) return false
      return projected.every((config) => {
        const mode = (config.exportMode ?? 'active') as SellfileExportMode
        return mode === 'active' || mode === 'disabled'
      })
    }
    const singleMode = (cfg.exportMode ?? 'active') as SellfileExportMode
    return singleMode === 'active' || singleMode === 'disabled'
  }, [cfg.exportMode, deferredMultiProjectedConfigs, multiEditActive, multiProjectedConfigs, multiSourceConfigs])
  // Flag zero-rule outputs so we can warn via the status chip before committing.
  const zeroRuleCountWarning = !counting && ruleCount === 0 && warnEligibleExportMode
  const ruleCountChipSx = useMemo<SxProps<Theme>>(() => {
    if (!zeroRuleCountWarning) return { ml: 0.5 }
    return {
      ml: 0.5,
      bgcolor: theme.palette.error.main,
      color: theme.palette.error.contrastText,
      '.MuiChip-label': { color: theme.palette.error.contrastText },
    }
  }, [theme, zeroRuleCountWarning])
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
    const substatMinTarget = (cfg as unknown as { substatMinTarget?: 'locked'|'selected' }).substatMinTarget ?? 'selected'
    return (
      (cfg.name ?? '') === (target.name ?? '') &&
      cfg.keep === Boolean(target.keep) &&
      cfg.exportMode === target.exportMode &&
      Number(cfg.rankCode) === Number(target.rankCode) &&
      Number((cfg as unknown as { rarityCode?: number }).rarityCode ?? 0) === Number((target as unknown as { rarityCode?: number }).rarityCode ?? 0) &&
      (((cfg as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'auto') === ((target as unknown as { rarityMode?: 'auto' | 'code' }).rarityMode ?? 'auto')) &&
      (((cfg as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare') === ((target as unknown as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? 'rare')) &&
      Number((cfg as unknown as { factionCode?: number }).factionCode ?? 0) === Number((target as unknown as { factionCode?: number }).factionCode ?? 0) &&
      JSON.stringify(asNumArr((cfg as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { mainStatsV?: number[] }).mainStatsV).slice().sort()) &&
      (cfg as unknown as { minLevel?: 0|4|8|12|16 }).minLevel === (target as unknown as { minLevel?: 0|4|8|12|16 }).minLevel &&
      (cfg as unknown as { maxLevel?: 0|4|8|12|16 }).maxLevel === (target as unknown as { maxLevel?: 0|4|8|12|16 }).maxLevel &&
      ((cfg as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') === ((target as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early') &&
      ((cfg as unknown as { rollBaseline?: 'afterStart'|'upToLevel' }).rollBaseline ?? 'afterStart') === ((target as unknown as { rollBaseline?: 'afterStart'|'upToLevel' }).rollBaseline ?? 'afterStart') &&
      JSON.stringify(asNumArr((cfg as unknown as { substatsV?: number[] }).substatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { substatsV?: number[] }).substatsV).slice().sort()) &&
      JSON.stringify(asNumArr((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV).slice().sort()) &&
      Number(cfg.minCount) === Number(target.minCount) &&
      Boolean(cfg.autoMinCount) === Boolean(target.autoMinCount) &&
      Boolean((cfg as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) === Boolean((target as unknown as { autoSubstatFlex?: boolean }).autoSubstatFlex ?? false) &&
      Number((cfg as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) === Number((target as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0) &&
      Boolean((cfg as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) === Boolean((target as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true) &&
      empty((cfg as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) === empty((target as unknown as { substatRollBoundsV?: Record<number, unknown> }).substatRollBoundsV ?? {}) &&
      JSON.stringify(asNumArr((cfg as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactTypes?: number[] }).artifactTypes).slice().sort()) &&
      JSON.stringify(asNumArr((cfg as unknown as { artifactSets?: number[] }).artifactSets).slice().sort()) === JSON.stringify(asNumArr((target as unknown as { artifactSets?: number[] }).artifactSets).slice().sort()) &&
      JSON.stringify(((cfg as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) === JSON.stringify(((target as unknown as { artifactMetaSets?: string[] }).artifactMetaSets ?? []).slice().sort()) &&
      substatMinTarget === ((target as unknown as { substatMinTarget?: 'locked'|'selected' }).substatMinTarget ?? 'selected')
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

  // Context menu for Reset to defaults
  const [resetMenuAnchor, setResetMenuAnchor] = useState<HTMLElement | null>(null)
  const resetMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const closeResetMenu = React.useCallback(() => { setResetMenuAnchor(null) }, [])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(resetMenuAnchor),
    onClose: closeResetMenu,
    menuRef: resetMenuPaperRef,
  })
const {
  shouldShow: showResetHint,
  markSeen: markResetHintSeen,
} = useContextMenuHint('builderReset')
const [resetHintPos, setResetHintPos] = useState<{ x: number; y: number } | null>(null)
const resetHintActive = showResetHint && resetHintPos !== null && !resetMenuAnchor && !multiEditActive && !isDefaultBuilder
useEffect(() => {
  if (!showResetHint) setResetHintPos(null)
}, [showResetHint])
  // Persisted toggle: auto reset the builder after inserting a config
  const [autoResetAfterInsert, setAutoResetAfterInsert] = useAutoResetAfterInsertPreference()

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
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderActionHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderAction')}</span>
            </Tooltip>
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
                  sx={(theme) => ({
                    px: 1.5,
                    '&.Mui-selected': {
                      bgcolor: theme.palette.success.main,
                      color: theme.palette.common.black,
                      borderColor: theme.palette.success.main,
                      '&:hover': { bgcolor: theme.palette.success.light },
                    },
                  })}
                >
                  <Tooltip
                    placement="top"
                    title={<BuilderTooltipContent text={t('builderExportModeActiveTooltip')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeActive')}
                    </Box>
                  </Tooltip>
                </ToggleButton>
                <ToggleButton
                  value="disabled"
                  sx={(theme) => ({
                    px: 1.5,
                    '&.Mui-selected': {
                      color: theme.palette.success.main,
                      bgcolor: 'transparent',
                      borderColor: theme.palette.success.main,
                      '&:hover': { bgcolor: alpha(theme.palette.success.main, 0.12) },
                    },
                  })}
                >
                  <Tooltip
                    placement="top"
                    title={<BuilderTooltipContent text={t('builderExportModeDisabledTooltip')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeDisabled')}
                    </Box>
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="separator" sx={{ px: 1.5 }}>
                  <Tooltip
                    placement="top"
                    title={<BuilderTooltipContent text={t('builderExportModeSeparatorTooltip')} />}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', width: '100%', justifyContent: 'center' }}>
                      {t('builderExportModeSeparator')}
                    </Box>
                  </Tooltip>
                </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            <Box
              sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}
              onContextMenu={handleHistoryContextMenu}
              onMouseMove={handleHistoryMouseMove}
              onMouseLeave={handleHistoryMouseLeave}
            >
              <Tooltip
                title={<BuilderTooltipContent text={undoTooltipText} colorizeStats substatColors={substatColors} />}
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
              </Tooltip>
              <Tooltip
                title={<BuilderTooltipContent text={redoTooltipText} colorizeStats substatColors={substatColors} />}
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
              </Tooltip>
              <Tooltip title={t('builderHelpOpen')}>
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => setHelpAnchor(e.currentTarget as HTMLElement)}
                  aria-label={t('builderHelpOpen')}
                  sx={{ width: SMALL_BUTTON_HEIGHT_PX, height: SMALL_BUTTON_HEIGHT_PX }}
                >
                  <HelpOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <ContextMenuHintOverlay text={t('contextMenuHint')} position={historyHintActive ? historyHintPos : null} />
            <HistoryContextMenu
              open={historyMenuOpen}
              anchorPosition={historyMenuAnchor}
              onClose={closeHistoryMenu}
              paperRef={historyMenuPaperRef}
              onPaperContextMenu={handleHistoryMenuContextMenu}
              entries={historyTimeline}
              t={t}
              onSelectEntry={handleHistoryEntrySelect}
              onRequestClearHistory={handleRequestClearHistory}
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
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderRankHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderRank')}</span>
            </Tooltip>
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
              sx={{
                flex: 1,
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
                <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
              {[RankCode.GTE_One,RankCode.GTE_Two,RankCode.GTE_Three,RankCode.GTE_Four,RankCode.GTE_Five].map((code) => (
                <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
              {[RankCode.LTE_Two,RankCode.LTE_Three,RankCode.LTE_Four,RankCode.LTE_Five,RankCode.LTE_Six].map((code) => (
                <MenuItem key={code} value={String(code)}>{rankOptionLabel(Number(code))}</MenuItem>
              ))}
            </Select>
          </Box>
        </FormControl>

        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderRarityHelpIntro'),
                    `• ${t('builderRarityHelpNoMinRolls')}`,
                    `• ${t('builderRarityHelpStartSubs')}`,
                    `• ${t('builderRarityHelpMinTotalRolls')}`,
                    `• ${t('builderAutoPlusLateHelp')}`,
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('filterRarity')}</span>
            </Tooltip>
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
                    onChange(normalizeKeepWithAuto({ ...cfg, rarityMode: 'auto' }))
                  } else {
                    onChange(normalizeKeepWithAuto({ ...cfg, rarityMode: 'code', rarityCode: Number(v) }))
                  }
                }
              }}
              MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              data-tour-id="builder.rarity"
              sx={{
                flex: 1,
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
                return rarityCodeToName(numeric) || t('any')
              }}
            >
              <MenuItem value={'auto'}>{t('headerMenuAuto')}</MenuItem>
              <MenuItem value={String(0)}>{rarityCodeToName(0) || t('any')}</MenuItem>
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityExact')}</ListSubheader>
              {[RarityCode.Common,RarityCode.Uncommon,RarityCode.Rare,RarityCode.Epic,RarityCode.Legendary,RarityCode.Mythical].map((code) => (
                <MenuItem key={code} value={String(code)}>{
                  code === RarityCode.Common ? t('rarityCommon') :
                  code === RarityCode.Uncommon ? t('rarityUncommon') :
                  code === RarityCode.Rare ? t('rarityRare') :
                  code === RarityCode.Epic ? t('rarityEpic') :
                  code === RarityCode.Legendary ? t('rarityLegendary') :
                  code === RarityCode.Mythical ? t('rarityMythical') : rarityCodeToName(code)
                }</MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityGte')}</ListSubheader>
              {[RarityCode.GTE_Common,RarityCode.GTE_Uncommon,RarityCode.GTE_Rare,RarityCode.GTE_Epic,RarityCode.GTE_Legendary].map((code) => (
                <MenuItem key={code} value={String(code)}>{
                  code === RarityCode.GTE_Common ? `≥${NBSP}${t('rarityCommon')}` :
                  code === RarityCode.GTE_Uncommon ? `≥${NBSP}${t('rarityUncommon')}` :
                  code === RarityCode.GTE_Rare ? `≥${NBSP}${t('rarityRare')}` :
                  code === RarityCode.GTE_Epic ? `≥${NBSP}${t('rarityEpic')}` :
                  code === RarityCode.GTE_Legendary ? `≥${NBSP}${t('rarityLegendary')}` : rarityCodeToName(code)
                }</MenuItem>
              ))}
              <ListSubheader sx={LIST_SUBHEADER_SX}>{t('builderRarityLte')}</ListSubheader>
              {[RarityCode.LTE_Uncommon,RarityCode.LTE_Rare,RarityCode.LTE_Epic,RarityCode.LTE_Legendary,RarityCode.LTE_Mythical].map((code) => (
                <MenuItem key={code} value={String(code)}>{
                  code === RarityCode.LTE_Uncommon ? `≤${NBSP}${t('rarityUncommon')}` :
                  code === RarityCode.LTE_Rare ? `≤${NBSP}${t('rarityRare')}` :
                  code === RarityCode.LTE_Epic ? `≤${NBSP}${t('rarityEpic')}` :
                  code === RarityCode.LTE_Legendary ? `≤${NBSP}${t('rarityLegendary')}` :
                  code === RarityCode.LTE_Mythical ? `≤${NBSP}${t('rarityMythical')}` : rarityCodeToName(code)
                }</MenuItem>
              ))}
            </Select>
          </Box>
        </FormControl>

        {/* Faction selection (accessories only) */}
        <FormControl fullWidth>
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderFactionHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderFaction')}</span>
            </Tooltip>
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
                  <Box component="span" title={label} sx={{ display: 'inline-flex', alignItems: 'center', width: '100%' }}>
                    <FactionOptionLabel faction={numeric as FactionId} label={label} truncate textSx={{ fontSize: FONT_SIZE_BASE_PX }} />
                  </Box>
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
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderMinLevelHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderMinLevel')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={minLevelValue}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if (![0, 4, 8, 12, 16].includes(num)) return
                const nextMin = num as 0 | 4 | 8 | 12 | 16
                if (multiEditActive) {
                  multiEdit?.updateField('minLevel', { value: nextMin, status: 'common' })
                  const currentMax = aggregatedMaxLevel
                  if (currentMax < nextMin) {
                    multiEdit?.updateField('maxLevel', { value: nextMin, status: 'common' })
                  }
                } else {
                  const currentMax = ((cfg as BuilderConfig).maxLevel ?? 16) as 0 | 4 | 8 | 12 | 16
                  const nextMax = (nextMin > currentMax ? nextMin : currentMax) as 0 | 4 | 8 | 12 | 16
                  onChange(normalizeLevelWindow({ ...cfg, minLevel: nextMin, maxLevel: nextMax }))
                }
              }}
              sx={{
                height: TOGGLE_BUTTON_HEIGHT_PX,
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                  justifyContent: 'center',
                },
              }}
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
                  >
                    +{l}
                  </ToggleButton>
                )
              })}
            </ToggleButtonGroup>
          </Box>
        </FormControl>

        <FormControl data-tour-id="builder.max-level">
          <FormLabel sx={{ mb: 0.5 }}>
            <Tooltip
              title={(
                <BuilderTooltipContent
                  text={[
                    t('builderMaxLevelHelp'),
                    t('builderMultiMixedTooltipSuffix'),
                  ].join('\n')}
                />
              )}
            >
              <span>{t('builderMaxLevel')}</span>
            </Tooltip>
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={maxLevelValue}
              onChange={(_, v) => {
                if (!v) return
                const num = Number(v)
                if (![0, 4, 8, 12, 16].includes(num)) return
                const nextMax = num as 0 | 4 | 8 | 12 | 16
                if (multiEditActive) {
                  multiEdit?.updateField('maxLevel', { value: nextMax, status: 'common' })
                  const currentMin = aggregatedMinLevel
                  if (nextMax < currentMin) {
                    multiEdit?.updateField('minLevel', { value: nextMax, status: 'common' })
                  }
                } else {
                  const currentMin = ((cfg as BuilderConfig).minLevel ?? 0) as 0 | 4 | 8 | 12 | 16
                  const nextMin = (nextMax < currentMin ? nextMax : currentMin) as 0 | 4 | 8 | 12 | 16
                  onChange(normalizeLevelWindow({ ...cfg, minLevel: nextMin, maxLevel: nextMax }))
                }
              }}
              sx={{
                height: TOGGLE_BUTTON_HEIGHT_PX,
                '& .MuiToggleButton-root': {
                  height: TOGGLE_BUTTON_HEIGHT_PX,
                  justifyContent: 'center',
                },
              }}
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
            <FormLabel sx={{ m: 0 }}>
              <Tooltip
                title={(
                  <BuilderTooltipContent
                    text={[t('builderMainHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <span>{t('builderMain')}</span>
              </Tooltip>
            </FormLabel>
            {(() => {
              const baseMainSelected = (((cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []).length > 0)
              const hasMainSelection = multiEditActive && multiSummary
                ? [...MAIN_STAT_VARIANTS_ROW1, ...MAIN_STAT_VARIANTS_ROW2].some((variant) => resolveMainStatTriState(variant) !== 'none')
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
                  {/* Row 1: HP, HP%, ATK, ATK%, DEF, DEF% */}
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
                    {MAIN_STAT_VARIANTS_ROW1.map((variant) => {
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
                        >
                          {t(statVariantI18nKey(variant))}
                        </ToggleButton>
                      )
                    })}
                  </ToggleButtonGroup>
                  {/* Row 2: SPD, RES, ACC, CR%, CDMG% */}
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
                    {MAIN_STAT_VARIANTS_ROW2.map((variant) => {
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
            <FormLabel sx={{ m: 0 }}>
              <Tooltip
                title={(
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
                <span>{t('builderSubstats')}</span>
              </Tooltip>
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

              const rollIndicatorTooltip = (
                <BuilderTooltipContent
                  text={[
                    t('rollIndicatorTip1'),
                    `• ${t('rollIndicatorTip2')}`,
                    `• ${t('rollIndicatorTip3')}`,
                    `• ${t('rollIndicatorTip4')}`,
                  ].join('\n')}
                />
              )

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
                  if (presenceState !== 'all') {
                    multiToggleSubstat(variant)
                  }
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
                  if (!info) {
                    if (!wasSelected && typeof window !== 'undefined') {
                      window.setTimeout(() => {
                        setSubstatMenu({
                          variant,
                          anchor: anchorPosition,
                        })
                        setSubstatMenuDraft(null)
                      }, 0)
                    }
                    return
                  }
                  setSubstatMenu({
                    variant,
                    anchor: anchorPosition,
                  })
                  setSubstatMenuDraft({ min: info.minValue, max: info.maxValue })
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
              const lockMixed = activeMenuInfo?.lockState === 'partial'
              const minMixed = Boolean(activeMenuInfo?.minMixed && effectiveMinDraft == null)
              const maxMixed = Boolean(activeMenuInfo?.maxMixed && effectiveMaxDraft == null)
              const lockGroupValue: 'locked' | 'unlocked' | null = !activeMenuInfo
                ? null
                : (activeMenuInfo.lockState === 'all'
                  ? 'locked'
                  : (activeMenuInfo.lockState === 'none' ? 'unlocked' : null))
              const minGroupValue: number | null = typeof effectiveMinDraft === 'number'
                ? clampRollMin(effectiveMinDraft)
                : null
              const maxGroupValue: number | null = typeof effectiveMaxDraft === 'number'
                ? clampRollMax(effectiveMaxDraft)
                : null
              const statLabelText = activeMenuInfo ? t(statVariantI18nKey(activeMenuInfo.variant)) : ''
              const statHighlightColor = activeMenuInfo && colorStatTexts
                ? (substatColors[activeMenuInfo.variant]?.fg ?? theme.palette.primary.main)
                : undefined
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
                  const presence = getSubstatPresence(variantId)
                  if (presence !== 'all') {
                    multiToggleSubstat(variantId)
                  }
                  return
                }
                if (!isSelected(variantId)) {
                  cycleSubstat(variantId)
                }
              }
              const applyMenuSelection = (nextMin: number | null, nextMax: number | null, options?: { requirePresence?: boolean }) => {
                if (!activeMenuInfo) return
                const requirePresence = options?.requirePresence ?? false
                if (requirePresence && (nextMin != null || nextMax != null)) {
                  ensureSubstatPresenceForBounds(activeMenuInfo.variant)
                }
                setSubstatMenuDraft({ min: nextMin, max: nextMax })
                if (multiEditActive && multiEdit) {
                  commitMultiBounds(activeMenuInfo.variant, nextMin, nextMax)
                } else {
                  commitSingleBounds(activeMenuInfo.variant, nextMin, nextMax)
                }
              }
              const applyLockSelection = (value: 'locked' | 'unlocked') => {
                if (!activeMenuInfo) return
                if (multiEditActive && multiEdit) {
                  if (value === 'locked' && activeMenuInfo.lockState !== 'all') {
                    multiToggleSubstatLock(activeMenuInfo.variant)
                  } else if (value === 'unlocked' && activeMenuInfo.lockState === 'all') {
                    multiToggleSubstatLock(activeMenuInfo.variant)
                  }
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
                  applyMenuSelection(null, null)
                  return
                }
                applyMenuSelection(clampRollMin(Number(key)), null, { requirePresence: true })
              }
              const applyMaxSelection = (key: MaxOption) => {
                if (key === 'any') {
                  applyMenuSelection(null, null)
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
              const menuRowSx: SxProps<Theme> = (theme) => ({
                display: 'grid',
                gridTemplateColumns: `minmax(0, 1fr) ${SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX}px`,
                alignItems: 'center',
                columnGap: theme.spacing(1.5),
                rowGap: theme.spacing(0.5),
                px: 2,
                py: 0.75,
              })
              const menuLabelSx = (theme: Theme): SystemStyleObject<Theme> => ({
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing(0.75),
                color: theme.palette.text.secondary,
                fontSize: theme.typography.body2.fontSize,
              })
              const relationWrapSx = (theme: Theme): SystemStyleObject<Theme> => ({
                display: 'inline-flex',
                alignItems: 'center',
                gap: theme.spacing(0.25),
                color: theme.palette.text.secondary,
              })
              const statNameSx = (theme: Theme): SystemStyleObject<Theme> => ({
                color: statHighlightColor ?? theme.palette.text.primary,
                fontWeight: theme.typography.fontWeightMedium ?? 600,
              })
              const mixedBadgeSx = (theme: Theme): SystemStyleObject<Theme> => ({
                marginLeft: theme.spacing(0.5),
                color: theme.palette.text.secondary,
                fontSize: theme.typography.caption.fontSize,
              })
              const relationalSymbolSx = (mode: 'min' | 'max') => (theme: Theme): SystemStyleObject<Theme> => ({
                color: mode === 'min' ? theme.palette.success.main : theme.palette.error.main,
                fontWeight: theme.typography.fontWeightMedium ?? 600,
              })
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
              }
              const createRollGroupSx = (mode: 'min' | 'max'): SxProps<Theme> => (themeInner) => {
                const highlight = mode === 'min' ? themeInner.palette.success.main : themeInner.palette.error.main
                const selectedText = themeInner.palette.common.white
                const baseBorder = themeInner.palette.text.secondary
                const hoverGlow = alpha(
                  themeInner.palette.text.primary,
                  themeInner.palette.mode === 'dark' ? 0.22 : 0.14,
                )
                return {
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
                }
              }
              const toggleGroupContent = (
                <>
                  {/* Row 1: HP, HP%, ATK, ATK%, DEF, DEF% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={() => {}}
                    sx={substatToggleGroupSx}
                  >
                    {renderSubstatToggle(StatVariant.HP_FLAT)}
                    {renderSubstatToggle(StatVariant.HP)}
                    {renderSubstatToggle(StatVariant.ATK_FLAT)}
                    {renderSubstatToggle(StatVariant.ATK)}
                    {renderSubstatToggle(StatVariant.DEF_FLAT)}
                    {renderSubstatToggle(StatVariant.DEF)}
                  </ToggleButtonGroup>
                  {/* Row 2: SPD, RES, ACC, CR%, CDMG% */}
                  <ToggleButtonGroup
                    size="small"
                    value={value}
                    onChange={() => {}}
                    sx={substatToggleGroupSx}
                  >
                    {renderSubstatToggle(StatVariant.SPD, { dataTourId: 'builder.substat.spd' })}
                    {renderSubstatToggle(StatVariant.RES)}
                    {renderSubstatToggle(StatVariant.ACC)}
                    {renderSubstatToggle(StatVariant.CR, { dataTourId: 'builder.substat.cr' })}
                    {renderSubstatToggle(StatVariant.CDMG, { dataTourId: 'builder.substat.cdmg' })}
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
                PaperProps={{ ref: substatMenuPaperRef, sx: { minWidth: SUBSTAT_MENU_WIDTH_PX } }}
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
                      <Typography variant="body2" sx={(theme) => menuLabelSx(theme)}>
                        {t('builderSubstatMenuLock')}
                        {lockMixed ? (
                          <Box component="span" sx={(theme) => mixedBadgeSx(theme)}>{t('builderMultiMixedValue')}</Box>
                        ) : null}
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={lockGroupValue}
                        onChange={handleLockGroupChange}
                        onClick={(event) => { event.stopPropagation() }}
                        sx={lockGroupSx}
                      >
                        <ToggleButton value="unlocked" aria-label={t('builderSubstatMenuUnlock')}>
                          <LockOpenOutlinedIcon fontSize="small" />
                        </ToggleButton>
                        <ToggleButton value="locked" aria-label={t('builderSubstatMenuLock')}>
                          <LockIcon fontSize="small" />
                        </ToggleButton>
                      </ToggleButtonGroup>
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
                      <Typography variant="body2" sx={(theme) => menuLabelSx(theme)}>
                        {t('builderSubstatMenuMinRolls')}
                        <Box component="span" sx={(theme) => relationWrapSx(theme)}>
                          (
                          <Box component="span" sx={(theme) => statNameSx(theme)}>{statLabelText}</Box>
                          <Box component="span" sx={(theme) => relationalSymbolSx('min')(theme)}>≥</Box>
                          )
                        </Box>
                        {minMixed ? (
                          <Box component="span" sx={(theme) => mixedBadgeSx(theme)}>{t('builderMultiMixedValue')}</Box>
                        ) : null}
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={minToggleValue ?? undefined}
                        onChange={handleMinGroupChange}
                        onClick={(event) => { event.stopPropagation() }}
                        sx={createRollGroupSx('min')}
                      >
                        <ToggleButton value="any" aria-label={t('builderSubstatMenuAny')}>
                          <Box component="span" className="menu-roll-label">{ROLL_ANY_STAR}</Box>
                        </ToggleButton>
                        {MIN_LABEL_SEQUENCE.slice(1).map((valueOption) => (
                          <ToggleButton key={valueOption} value={valueOption} aria-label={valueOption}>
                            <Box component="span" className="menu-roll-label">{valueOption}</Box>
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
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
                      <Typography variant="body2" sx={(theme) => menuLabelSx(theme)}>
                        {t('builderSubstatMenuMaxRolls')}
                        <Box component="span" sx={(theme) => relationWrapSx(theme)}>
                          (
                          <Box component="span" sx={(theme) => statNameSx(theme)}>{statLabelText}</Box>
                          <Box component="span" sx={(theme) => relationalSymbolSx('max')(theme)}>≤</Box>
                          )
                        </Box>
                        {maxMixed ? (
                          <Box component="span" sx={(theme) => mixedBadgeSx(theme)}>{t('builderMultiMixedValue')}</Box>
                        ) : null}
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={maxToggleValue ?? undefined}
                        onChange={handleMaxGroupChange}
                        onClick={(event) => { event.stopPropagation() }}
                        sx={createRollGroupSx('max')}
                      >
                        {['0', '1', '2', '3', '4'].map((valueOption) => (
                          <ToggleButton key={valueOption} value={valueOption} aria-label={valueOption}>
                            <Box component="span" className="menu-roll-label">{valueOption}</Box>
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </MenuItem>
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
            <FormLabel sx={{ m: 0 }}>
              <Tooltip
                title={(
                  <BuilderTooltipContent
                    text={[t('builderSlotsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <span>{t('builderSlots')}</span>
              </Tooltip>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
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
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {/* Min required rolls */}
            <FormControl sx={{ m: 0 }}>
              {(() => {
                const baseLockedCount = Array.isArray((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV)
                  ? ((cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV as number[]).length
                  : 0
                const baseTarget = ((cfg as unknown as { substatMinTarget?: 'locked' | 'selected' }).substatMinTarget === 'locked') ? 'locked' : 'selected'
                type LockChipState = 'locked' | 'available' | 'disabled' | 'mixed'
                let chipState: LockChipState
                let chipEnabled: boolean
                if (!multiEditActive || !multiSourceConfigs) {
                  chipEnabled = baseLockedCount > 0
                  chipState = (() => {
                    if (!chipEnabled) return 'disabled'
                    return baseTarget === 'locked' ? 'locked' : 'available'
                  })()
                } else {
                  const total = multiSourceConfigs.length
                  let lockedEligible = 0
                  let lockedTargetCount = 0
                  let selectedTargetCount = 0
                  for (const config of multiSourceConfigs) {
                    const locked = Array.isArray(config.fixedSubstatsV) ? config.fixedSubstatsV.length : 0
                    const target = (config.substatMinTarget ?? 'selected') === 'locked' ? 'locked' : 'selected'
                    if (locked > 0) lockedEligible += 1
                    if (target === 'locked') {
                      lockedTargetCount += 1
                    } else {
                      selectedTargetCount += 1
                    }
                  }
                chipEnabled = lockedEligible > 0
                if (!chipEnabled) {
                  chipState = 'disabled'
                } else if (lockedTargetCount === total) {
                  chipState = 'locked'
                } else if (selectedTargetCount === total) {
                  chipState = 'available'
                } else {
                  chipState = 'mixed'
                }
                if (chipEnabled) {
                  const stagedTarget = multiFields?.substatMinTarget
                  if (stagedTarget) {
                    if (stagedTarget.status === 'common') {
                      chipState = (stagedTarget.value === 'locked') ? 'locked' : 'available'
                    } else if (stagedTarget.status === 'mixed') {
                      chipState = 'mixed'
                    }
                  }
                }
                }
                const label = chipState === 'locked'
                  ? t('builderMinRequiredRollsChipLocked')
                  : t('builderMinRequiredRollsChipSelected')
                const tooltipLines = (() => {
                  switch (chipState) {
                    case 'locked':
                      return [t('builderMinRequiredRollsChipLockedTooltip')]
                    case 'available':
                      return [t('builderMinRequiredRollsChipSelectedTooltip')]
                    case 'disabled':
                      return [t('builderMinRequiredRollsChipDisabledTooltip')]
                    default:
                      return [
                        t('builderMinRequiredRollsChipSelectedTooltip'),
                        t('builderMultiMixedTriStateHint'),
                      ]
                  }
                })()
                const tooltipContent = (<BuilderTooltipContent text={tooltipLines.join('\n')} />)
                const nextLockIcon = chipState === 'locked' ? <LockIcon fontSize="small" /> : <LockOpenOutlinedIcon fontSize="small" />
                const handleToggleTarget = () => {
                  if (!chipEnabled) return
                  if (multiEditActive && multiEdit) {
                    const next = chipState === 'locked' ? 'selected' : 'locked'
                    multiEdit.updateField('substatMinTarget', { value: next as BuilderConfig['substatMinTarget'], status: 'common' })
                    return
                  }
                  const next = baseTarget === 'locked' ? 'selected' : 'locked'
                  onChange(normalizeKeepWithAuto({ ...cfg, substatMinTarget: next }))
                }
                const currentTargetForAria = chipState === 'locked' ? 'locked' : 'selected'
                const autoState = getMinRequiredRollsTriState('auto')
                return (
                  <>
                    <FormLabel sx={{ mb: 0.5 }} data-tour-id="builder.min-rolls.label">
                      <Tooltip
                        title={(
                          <BuilderTooltipContent
                            text={[
                              t('builderMinRequiredRollsTipSummary'),
                              `• ${t('builderMinRequiredRollsTip1')}`,
                              `• ${t('builderMinRequiredRollsTip2')}`,
                              `• ${t('builderMinRequiredRollsTip3')}`,
                              t('builderMultiMixedTooltipSuffix'),
                            ].join('\n')}
                          />
                        )}
                      >
                        <span>{t('builderMinRequiredRolls')}</span>
                      </Tooltip>
                    </FormLabel>
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={minRequiredValue}
                      onChange={(_, v) => {
                        if (!v) return
                        if (multiEditActive && multiEdit) {
                          if (v === 'auto') {
                            multiEdit.updateField('autoMinRequiredRolls', { value: true, status: 'common' })
                            multiEdit.updateField('minRequiredRolls', { value: 0 as BuilderConfig['minRequiredRolls'], status: 'common' })
                          } else {
                            const next = Math.max(0, Math.min(5, Number(v))) as 0 | 1 | 2 | 3 | 4 | 5
                            multiEdit.updateField('autoMinRequiredRolls', { value: false, status: 'common' })
                            multiEdit.updateField('minRequiredRolls', { value: next, status: 'common' })
                          }
                          return
                        }
                        if (v === 'auto') {
                          onChange(normalizeKeepWithAuto({
                            ...cfg,
                            autoMinRequiredRolls: true,
                            minRequiredRolls: 0,
                          }))
                          return
                        }
                        const next = Math.max(0, Math.min(5, Number(v))) as 0 | 1 | 2 | 3 | 4 | 5
                        onChange(normalizeKeepWithAuto({
                          ...cfg,
                          autoMinRequiredRolls: false,
                          minRequiredRolls: next,
                        }))
                      }}
                      data-tour-id="builder.min-rolls"
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
                        const state = getMinRequiredRollsTriState(n)
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
                      <Tooltip title={tooltipContent}>
                        <Box component="span" sx={{ display: 'inline-flex' }}>
                          <Chip
                            icon={nextLockIcon}
                            label={label}
                            size="small"
                            variant="filled"
                            clickable={chipEnabled}
                            onClick={chipEnabled ? handleToggleTarget : undefined}
                            disabled={!chipEnabled}
                            aria-pressed={chipState === 'locked'}
                            aria-label={t('builderMinRequiredRollsToggleAria', { target: currentTargetForAria })}
                            data-tour-id="builder.min-rolls.toggle"
                            sx={{
                              ...(builderToggleChipSx(chipEnabled) as SystemStyleObject<Theme>),
                              ...(chipState === 'mixed'
                                ? {
                                    borderStyle: 'dashed',
                                    borderColor: mixedBorderColor,
                                    color: mixedTextColor,
                                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                                  } as SystemStyleObject<Theme>
                                : {}),
                            }}
                          />
                        </Box>
                      </Tooltip>
                    </Box>
                  </>
                )
              })()}
            </FormControl>
            {/* Required substats */}
            <FormControl sx={{ ml: 1 }}>
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
                const FlexIconComponent = flexState === 'on' ? AutoFixHighIcon : AutoFixHighOutlinedIcon
                const label = flexState === 'on'
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
                    <FormLabel sx={{ mb: 0.5 }} data-tour-id="builder.required.label">
                      <Tooltip
                        title={(
                          <BuilderTooltipContent
                            text={[
                              t('builderRequiredSubstatsHelp'),
                              t('builderMultiMixedTooltipSuffix'),
                            ].join('\n')}
                          />
                        )}
                      >
                        <span>{t('builderRequiredSubstats')}</span>
                      </Tooltip>
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
                      <Tooltip title={<BuilderTooltipContent text={t('builderSubstatFlexToggleTooltip')} />}>
                        <Box component="span" sx={{ display: 'inline-flex' }}>
                          <Chip
                            icon={<FlexIconComponent fontSize="small" />}
                            label={label}
                            size="small"
                            variant="filled"
                            clickable={chipEnabled}
                            onClick={chipEnabled ? handleFlexToggle : undefined}
                            disabled={!chipEnabled}
                            aria-pressed={chipEnabled ? flexState === 'on' : undefined}
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
                      </Tooltip>
                    </Box>
                  </>
                )
              })()}
            </FormControl>
            {/* Milestone Thresholds (right of Min required rolls) */}
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
                const raw = cfg.autoRaritySupplementsThreshold ?? pickAutoRarityFallback(cfg)
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
                      : pickAutoRarityFallback(cfg)
                    multiEdit.updateField('autoRaritySupplementsThreshold', { value: next, status: 'common' })
                    return
                  }
                  const curr = (cfg.autoRaritySupplementsThreshold ?? pickAutoRarityFallback(cfg)) as 'uncommon' | 'rare' | 'epic'
                  const next = cycleThreshold(curr, true)
                  onChange(normalizeKeepWithAuto({ ...cfg, autoRaritySupplementsThreshold: next }))
                }
              const autoChipLabel = autoRarityChipState === 'on'
                ? t('builderAutoGeLabel', { tier: tierLabel })
                : t('builderAutoPlusLate')
              return (
                <FormControl sx={{ ml: 1 }}>
                  <FormLabel sx={{ mb: 0.5 }} data-tour-id="builder.thresholds.label">
                    <Tooltip
                      title={(
                        <BuilderTooltipContent
                          text={[
                            t('builderMilestoneThresholdsHelp'),
                            t('builderMultiMixedTooltipSuffix'),
                          ].join('\n')}
                        />
                      )}
                    >
                      <span>{t('builderMilestoneThresholds')}</span>
                    </Tooltip>
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
                        onChange(normalizeKeepWithAuto({ ...cfg, earlyKeepMode: mode }))
                      }}
                      disabled={!thresholdsActiveAny}
                      data-tour-id="builder.thresholds"
                      sx={{
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
                          >
                            {mode === 'early' ? t('builderEarlyLabel') : t('builderLateLabel')}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                  </Box>
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Tooltip title={<BuilderTooltipContent text={tooltipLines.join('\n')} />}>
                      <Box component="span" sx={{ display: 'inline-flex' }}>
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
                      </Box>
                    </Tooltip>
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
                            : ''))))
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
            <FormLabel sx={{ mb: 0, mr: 1 }}>
              <Tooltip
                title={(
                  <BuilderTooltipContent
                    text={[t('builderSetsHelp'), t('builderMultiMixedTriStateHint')].join('\n')}
                  />
                )}
              >
                <span>{t('setsTitle')}</span>
              </Tooltip>
            </FormLabel>
            {/* Flexible spacer keeps the label left-aligned and the button right-aligned */}
            <Box ref={setsLeftRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
            <Button
              size="small"
              variant="outlined"
              onClick={openMetaDlg}
              sx={{ minWidth: 160, whiteSpace: 'nowrap', ml: 'auto' }}
              data-tour-id="builder.manage-metasets"
              title={t('builderManageMetasetsButton')}
            >
              {t('builderManageMetasetsButton')}
            </Button>
          </Box>
          {(() => {
            const tokenOf = {
              meta: (id: string) => `m:${id}`,
              set: (id: number) => `s:${id}`,
            }
            const visibleMetasets = metasets.filter(m => m.show !== false)
            const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
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
              if (!multiEditActive || !multiSummary) {
                return [...(cfg.artifactSets ?? [])].sort((a, b) => a - b)
              }
              const union = new Set<number>()
              for (const key of multiSummary.setCounts.keys()) union.add(Number(key))
              for (const id of cfg.artifactSets ?? []) union.add(id)
              for (const id of setsPatch?.add ?? []) union.add(Number(id))
              for (const id of setsPatch?.replace ?? []) union.add(Number(id))
              return Array.from(union).sort((a, b) => a - b)
            })()
            const selectedMetaIds = multiEditActive && multiSummary
              ? metaDisplayIds.filter((id) => getMetasetState(id) === 'all')
              : baseMetaIds
            const selectedSetIds = multiEditActive && multiSummary
              ? setDisplayIds.filter((id) => getSetState(id) === 'all')
              : [...(cfg.artifactSets ?? [])].sort((a, b) => a - b)
            const selectedTokens: string[] = [
              ...selectedMetaIds.map(tokenOf.meta),
              ...selectedSetIds.map(tokenOf.set),
            ]
            const projectedMetaActive = multiEditActive && multiSummary
              ? metaDisplayIds.some((id) => getMetasetState(id) !== 'none')
              : (cfg.artifactMetaSets?.length ?? 0) > 0
            const projectedSetActive = multiEditActive && multiSummary
              ? setDisplayIds.some((id) => getSetState(id) !== 'none')
              : (cfg.artifactSets?.length ?? 0) > 0
            const hasAnySelection = projectedMetaActive || projectedSetActive
            const handleChange = (e: SelectChangeEvent<string[]>) => {
              if (multiEditActive) return
              const tokens = e.target.value as string[]
              const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
              const metaIds = orderMetasetIds(metaIdsRaw, orderBasis)
              const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
              onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
            }
            const handleToggleSet = (id: number) => {
              if (multiEditActive && multiEdit) {
                toggleSet(id)
                return
              }
              const prev = new Set<number>(cfg.artifactSets ?? [])
              if (prev.has(id)) prev.delete(id); else prev.add(id)
              const nextSets = Array.from(prev).sort((a, b) => a - b)
              onChange({ ...cfg, artifactSets: nextSets })
            }
            const renderValue = (tokens: string[]) => {
              if (multiEditActive && multiSummary) {
                const names: string[] = []
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
                for (const id of setDisplayIds) {
                  const state = getSetState(id)
                  if (state === 'none') continue
                  const baseName = t(artifactSetI18nKey(id))
                  names.push(state === 'partial' ? `${baseName} – ${t('builderMultiMixedValue')}` : baseName)
                }
                const text = names.length > 0 ? names.join(', ') : t('any')
                return (
                  <EllipsisTooltip title={text} wrap="block">
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
                  </EllipsisTooltip>
                )
              }
              const any = !tokens || tokens.length === 0
              const names: string[] = []
              if (!any) {
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
                    names.push(t(artifactSetI18nKey(id)))
                  }
                }
              }
              const text = (any || names.length === 0) ? t('any') : names.join(', ')
              return (
                <EllipsisTooltip title={text} wrap="block">
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
                </EllipsisTooltip>
              )
            }
            const fullRenderedValue = renderValue(selectedTokens)
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
                              scrollSetsMenuToSelected(setsOrder)
                            }
                            // Double rAF to wait for mount + layout
                            requestAnimationFrame(() => requestAnimationFrame(refine))
                          } catch { setSetsMenuAnchorPos(null) }
                        }}
                        onClose={() => { setMetaSetsMenuOpen(false); setHoveredSetMetaId(null); setSetsMenuAnchorPos(null) }}
                        renderValue={renderValue}
                        displayEmpty
                        sx={{
                          ...selectBoxHeightSx,
                          width: '100%',
                          minWidth: 0,
                          pr: `${SETS_SELECT_INLINE_GUTTER_PX}px`,
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
                              scrollbarGutter: 'stable both-edges',
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
                              const setNames = m.sets.map((id) => t(artifactSetI18nKey(id))).filter(Boolean)
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
                                    onChange({ ...cfg, artifactMetaSets: metaIds, artifactSets: setIds })
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
                                        disablePortal={false}
                                        maxWidth={SETS_TOOLTIP_MAX_WIDTH_PX}
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
                                        disablePortal={false}
                                        maxWidth={SETS_TOOLTIP_MAX_WIDTH_PX}
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
                                    scrollSetsMenuToSelected(v)
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
                            scrollbarGutter: 'stable both-edges' as const,
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
                          onToggleSet={handleToggleSet}
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
                        />
                      </Box>
                    )
                    // Keep a stable wrapper to prevent the Select from remounting
                    // when transitioning from empty to non-empty selections, which
                    // could close the menu after the first click.
                    return (
                      <EllipsisTooltip
                        title={fullRenderedValue}
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
          onSelectConfigsByMetaset={onSelectConfigsByMetaset}
          setsSearch={setsSearch}
          onSetsSearchChange={setSetsSearch}
          setsOrder={setsOrder}
          onSetsOrderChange={(v) => {
            if (!v) return
            setSetsOrder(v)
            if (metaSetsMenuOpen) {
              scrollSetsMenuToSelected(v)
            }
          }}
          metaSetsMenuOpen={metaSetsMenuOpen}
          setMetaSetsMenuOpen={setMetaSetsMenuOpen}
        />

        <MinimaDialog
          open={minimaDialogOpen}
          onClose={onCloseMinimaDialog}
          minima={minima}
          onMinimaChange={onMinimaChange}
          substatColors={substatColors}
        />

      {/* Small separator above action buttons (matching the one below) */}
      <Divider sx={{ my: 1, opacity: 0.5 }} />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Tooltip title={t('builderInsertHiddenTooltip')} disableInteractive disableHoverListener={!configHiddenByFilters || !builderCanAdd}>
          <Badge
            overlap="rectangular"
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            invisible={!configHiddenByFilters || !builderCanAdd}
            sx={hiddenBadgeSx}
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
        </Tooltip>
        <Tooltip
          key={saveTooltipScope}
          title={t('builderSaveHiddenTooltip')}
          disableInteractive
          disableHoverListener={!configHiddenByFilters || saveDisabled}
          open={saveTooltipOpen && configHiddenByFilters && !saveDisabled}
          onOpen={() => setSaveTooltipOpen(true)}
          onClose={() => setSaveTooltipOpen(false)}
        >
          <Badge
            overlap="rectangular"
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            invisible={!configHiddenByFilters || saveDisabled}
            sx={hiddenBadgeSx}
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
              title={saveButtonLabel}
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
        </Tooltip>
        <Chip
          size="small"
          label={
            counting
              ? t('counting')
              : (ruleCount === null
                ? '—'
                : formatRulesCount(t, ruleCount))
          }
          sx={ruleCountChipSx}
        />
        <Box sx={{ flex: 1 }} />
        <Box
          component="span"
          onContextMenu={(e) => {
            try {
              e.preventDefault()
              e.stopPropagation()
            } catch {}
            if (multiEditActive) return
            markResetHintSeen()
            setResetHintPos(null)
            setResetMenuAnchor(e.currentTarget as HTMLElement)
          }}
          onMouseEnter={(e) => {
            if (!multiEditActive && !isDefaultBuilder && showResetHint) {
              setResetHintPos({ x: e.clientX, y: e.clientY })
            }
          }}
          onMouseLeave={() => {
            setResetHintPos(null)
          }}
        >
          <Button
            size="small"
            color="warning"
            disabled={isDefaultBuilder || multiEditActive}
            onMouseEnter={(e) => {
              setHoverReset(true)
              if (!multiEditActive && !isDefaultBuilder && showResetHint) {
                setResetHintPos({ x: e.clientX, y: e.clientY })
              }
            }}
            onMouseLeave={() => setHoverReset(false)}
            onClick={handleResetBuilder}
            onFocus={(e) => {
              if (multiEditActive || isDefaultBuilder || !showResetHint) return
              const rect = e.currentTarget.getBoundingClientRect()
              setResetHintPos({ x: rect.right, y: rect.top })
            }}
            onBlur={() => setResetHintPos(null)}
            onMouseMove={(e) => {
              if (!showResetHint || multiEditActive || isDefaultBuilder) return
              setResetHintPos({ x: e.clientX, y: e.clientY })
            }}
            sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
          >
            {t('builderResetButton')}
          </Button>
        </Box>
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={resetHintActive ? resetHintPos : null} />
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={closeResetMenu}
          PaperProps={{ ref: resetMenuPaperRef }}
        >
          {(() => { void defaultsEpoch; return null })()}
          <MenuItem
            onClick={() => setAutoResetAfterInsert(v => !v)}
          >
            <Checkbox
              size="small"
              checked={autoResetAfterInsert}
              onChange={(e) => setAutoResetAfterInsert(Boolean(e.target.checked))}
              sx={{ mr: 1, p: 0.5 }}
            />
            Auto reset after Insert
          </MenuItem>
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
                rarityMode: (cfg.rarityMode ?? 'auto'),
                autoRaritySupplementsThreshold: (cfg.autoRaritySupplementsThreshold ?? 'rare'),
                factionCode: (cfg.factionCode ?? 0),
                mainStatsV: (cfg.mainStatsV ?? []),
                minLevel: (cfg.minLevel ?? 0),
                maxLevel: (cfg.maxLevel ?? 16),
                rollBaseline: (cfg.rollBaseline ?? 'afterStart'),
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
                substatMinTarget: ((cfg.substatMinTarget === 'locked') ? 'locked' : 'selected'),
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
            Save local settings as user defaults
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
            Reset to factory defaults
          </MenuItem>
        </Menu>
      </Stack>
      <Divider sx={{ mt: 1, opacity: 0.5 }} />
    </Box>
  )
}
