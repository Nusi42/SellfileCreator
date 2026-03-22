/**
 * SafeguardBuilderPanel
 *
 * Inline editor for a single SafeguardRule. Controls mirror BuilderPanel styling and layout:
 * - Row 1: Mode toggle + Required count
 * - Row 2: [Rank | Rarity | Faction Select (nested 3-col)] | [hidden level-window spacer col 3]
 * - Row 3: [Main stat toggles + perMainStat chip] | [Substats toggles + match chips + beat-equipped floor chip + weights]
 * - Row 4: [Slots icon grid + perSlot chip] | [Sets selector + perSet chip]
 *
 * When no rule is selected the form renders disabled so the panel height remains stable.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  InputAdornment,
  InputBase,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import RedoIcon from '@mui/icons-material/Redo'
import TuneIcon from '@mui/icons-material/Tune'
import UndoIcon from '@mui/icons-material/Undo'
import {
  SAFEGUARD_DEFAULT_BEAT_EQUIPPED_PERCENTILE,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  constrainSafeguardSubstats,
  normalizeSafeguardSubstatMatch,
  normalizeSafeguardRule,
  pruneSafeguardsSubstatWeights,
  sanitizeSafeguardCountMode,
  scoreSafeguardCandidates,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  type SafeguardCandidateOut,
  type SafeguardDetectionEntry,
  type SafeguardRule,
} from '../lib/safeguards'
import type { ColorBlindMode } from '../lib/constants'
import {
  MULTI_EDIT_MIXED_BG_ALPHA,
  MULTI_EDIT_MIXED_BORDER_ALPHA,
  MULTI_EDIT_MIXED_TEXT_ALPHA,
  SAFEGUARD_BUILDER_USER_DEFAULTS_KEY,
} from '../lib/constants'
import {
  LEVEL_MILESTONES,
  STAT_VARIANTS_PRIORITY_ROW1,
  STAT_VARIANTS_PRIORITY_ROW2,
  statVariantI18nKey,
  type StatVariant,
} from '../lib/types'
import {
  BUILDER_LABEL_INLINE_SX,
  BUILDER_LABEL_TEXT_SX,
  BUILDER_STATUS_CHIP_HEIGHT_PX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  CLEAR_ICON_BUTTON_SIZE_PX,
  DANGER_TINT_BG,
  FONT_SIZE_BASE_PX,
  GLYPH_IGNORE_COLLECTION,
  GLYPH_IGNORE_PREVIOUS,
  GLYPH_IGNORE_VAULT,
  HISTORY_TOOLTIP_MAX_WIDTH_PX,
  NBSP,
  SMALL_BUTTON_HEIGHT_PX,
  STATUS_CHIP_BORDER_RADIUS_PX,
  UI_BG_HOVER_DANGER_TRANSITION,
} from '../lib/constants'

import type { BuilderRecipe } from '../lib/hsfBuilder/types'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useBuilderPanelActionMenus } from './builderPanel/useBuilderPanelActionMenus'
import { useBuilderHistoryMenu } from './builderPanel/useBuilderHistoryMenu'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { HistoryContextMenu } from './HistoryContextMenu'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import type { HistoryPreview, HistoryTimelineEntry } from '../hooks/useSfrHistory'
import { useAutoResetAfterInsertPreference, useAutoApplySelectedRecipePreference, useBuilderSafeguardCollapsedPreference } from '../state/builderPreferences'
import BuilderSectionToggle from './BuilderSectionToggle'
import { summaryParts } from './RecipeChip'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSlotMetrics } from '../hooks/useSlotMetrics'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'
import { isAccessorySlot, slotSelectionAllowsAccessories } from '../lib/gearInspectorDomain'
import { useI18n } from '../lib/i18n'
import { GearFactionSelect, GearRankSelect, GearRaritySelect, GearSetsSelect } from './gear'
import { NumberSpinnerAdornment } from './NumberSpinnerAdornment'
import MarkdownTooltip from './MarkdownTooltip'
import { GearInspectorSortWeightControls } from './GearInspectorSortWeightControls'
import { useKeepOverrideCombinationTools } from './keepOverrides/useKeepOverrideCombinationTools'
import {
  dedupeNumericArray,
  dedupeStringArray,
  getMainStatOptionsForSlots,
} from './keepOverrides/keepOverrideRuleUtils'
import {
  resolveKeepOverrideScopeActive,
  toggleKeepOverrideCountMode,
  type KeepOverrideScopeKey,
} from '../lib/keepOverrideScope'
import { KeepOverrideScopeChip } from './keepOverrides/KeepOverrideScopeChip'
import { normalizeArtifactSetSelections } from '../lib/gearSets/selection'
import { resolveAllowedSubstatsForSlotsAndMains } from '../lib/statCompatibility'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT, GEAR_INSPECTOR_SORT_WEIGHT_STEP } from '../lib/gearInspectorSort'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { artifactTypeIconList } from './artifactTypeIcons'
import ClearIconButton from './ClearIconButton'
import SafeguardCandidateRankList, { measureStatCellWidths } from './SafeguardCandidateRankList'
import { SUBSTAT_SLOT_COUNT } from '../lib/generated/domainConstants'
import { mainStatToggleGroupSx, substatToggleGroupSx } from './SubstatToggleDisplay'
import { alpha, useTheme } from '@mui/material/styles'
import type { Metaset } from '../lib/metasets'
import type { SafeguardMultiEditDraftHandle } from '../lib/safeguardMultiEditDraft'
import {
  deriveBaseTriState,
  applyArrayPatchCount,
  computeSlotPatchToggle,
  computeMainStatPatchToggle,
  computeSubstatPatchToggle,
} from './builderPanel/safeguardMultiEditHelpers'
import type { MultiEditArrayPatch } from '../lib/recipeMultiEditDraft'
import { useSafeguardMultiEditSummary } from './builderPanel/useSafeguardMultiEditSummary'

// ── constants ────────────────────────────────────────────────────────────────

const SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX = {
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const

const CLEAR_PLACEHOLDER_SX = {
  width: CLEAR_ICON_BUTTON_SIZE_PX,
  height: CLEAR_ICON_BUTTON_SIZE_PX,
  flexShrink: 0,
} as const

// Mirrors BuilderPanel's selectBoxHeightSx / selectContentHeightSx.
// width: '100% ensures the Select fills its FormControl column rather than
// growing to fit the rendered value text when items are selected.
const SELECT_BOX_HEIGHT_SX = {
  width: '100%',
  height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  '& .MuiSelect-select': {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset',
    paddingTop: 0,
    paddingBottom: 0,
  },
} as const



// ── multi-edit mixed-state toggle styling ──────────────────────────────────
// Applied as a CSS selector override on top of existing toggle groups.
// Mirrors RecipeBuilderPanel's data-mixed pattern.
const MIXED_TOGGLE_GROUP_OVERRIDES = (mixedBorderColor: string, mixedTextColor: string, mixedPatternColor: string) => ({
  '& .MuiToggleButton-root[data-mixed="true"]': {
    borderStyle: 'dashed',
    borderColor: mixedBorderColor,
    color: mixedTextColor,
    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
  },
} as const)

// ── helpers ──────────────────────────────────────────────────────────────────

// Strips heading markers and color/style directives from separator names for display.
function parseSeparatorLabel(rawName: string | undefined): string {
  return parseRecipeNameDirectives(rawName, '').displayName.replace(/^#+\s*/, '').trim()
}

// ── component ────────────────────────────────────────────────────────────────

export type SafeguardBuilderPanelProps = {
  rule: SafeguardRule
  onChange: (next: SafeguardRule | ((prev: SafeguardRule) => SafeguardRule)) => void
  editingRuleId: string | null
  editingRuleIndex: number | null
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  colorBlindMode: ColorBlindMode
  recipes: readonly BuilderRecipe[]
  // True when the builder state differs from the currently-selected rule's saved content.
  selectedIsDirty: boolean
  onInsertSafeguard: () => void
  onApplySafeguard: () => void
  onResetSafeguard: () => void
  onScaffoldFromRecipe: (recipeIndex: number) => void
  registerAutoApplyHandler?: ((fn: (() => boolean) | null) => void) | undefined
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  undoPreview: HistoryPreview
  redoPreview: HistoryPreview
  historyTimeline: HistoryTimelineEntry[]
  onJumpToHistoryIndex: (index: number) => void
  onRequestClearHistory: () => void
  onManageMetasets: () => void
  // Detection snapshot entry for the currently-editing rule (null when not yet run or rule not found).
  // Used to populate the candidate rank list in the weight popover.
  detectionEntry?: SafeguardDetectionEntry | null
  // Preview rows keyed by safeguard item key — used for the hover card tooltip on candidate rows.
  previewRowByItemKey?: ReadonlyMap<number, GearInspectorPreviewRow> | null
  // Clicking a candidate row selects it in the Gear Inspector, scrolls to it, and switches tabs.
  onSelectCandidate?: (itemKey: number) => void
  // Multi-edit props — all optional; absent means single-rule editing mode.
  multiEdit?: SafeguardMultiEditDraftHandle | null
  multiSelectedRules?: readonly SafeguardRule[] | null
  onApplyMultiEdit?: (() => void) | null
  // When provided, candidates whose itemKey is absent from this set are dimmed in the list
  // (they are currently hidden by the Gear Inspector filter).
  visibleItemKeys?: ReadonlySet<number> | null
}

export default function SafeguardBuilderPanel({
  rule,
  onChange,
  editingRuleId,
  editingRuleIndex,
  metasets,
  substatColors,
  useStatButtonColors,
  recipes,
  selectedIsDirty,
  onInsertSafeguard,
  onApplySafeguard,
  onResetSafeguard,
  onScaffoldFromRecipe,
  registerAutoApplyHandler,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoPreview,
  redoPreview,
  historyTimeline,
  onJumpToHistoryIndex,
  onRequestClearHistory,
  onManageMetasets,
  detectionEntry,
  previewRowByItemKey,
  onSelectCandidate,
  multiEdit,
  multiSelectedRules,
  onApplyMultiEdit,
  visibleItemKeys,
}: SafeguardBuilderPanelProps) {
  const { t, lang } = useI18n()
  // ── multi-edit mode derived state ─────────────────────────────────────────
  const multiEditSelectionCount = multiEdit?.state.selection.length ?? 0
  // Multi-edit is active when 2+ rules are selected together.
  const multiEditActive = multiEditSelectionCount >= 2
  const multiFields = multiEdit?.state.fields ?? null
  // Per-field state shortcuts — null when single-edit mode.
  const multiNameField = multiFields?.name ?? null
  const multiActivationField = multiFields?.activation ?? null
  // True when the selected rules have different activation modes and no staged change yet.
  const activationMixed = multiEditActive && multiActivationField?.status === 'mixed' && !multiActivationField.dirty
  const multiRequiredCountField = multiFields?.requiredCount ?? null
  const multiIgnorePreviousField = multiFields?.ignorePreviousSafeguards ?? null
  const multiIgnoreCollectionField = multiFields?.ignoreEquippedInCollection ?? null
  const multiIgnoreVaultField = multiFields?.ignoreEquippedInVault ?? null
  const multiSlotsField = multiFields?.slots ?? null
  // Ranks/rarities/factions are select-based; summary counts drive their mixed badge only.
  const multiMainStatsField = multiFields?.mainStats ?? null
  const multiSubstatsField = multiFields?.substats ?? null
  const multiSubstatMatchField = multiFields?.substatMatch ?? null
  const multiSubstatWeightsField = multiFields?.substatWeights ?? null
  const multiBeatEquippedField = multiFields?.beatEquippedPercentile ?? null
  // True when at least one field has a staged (unsaved) change.
  const multiDraftDirty = multiEditActive && multiFields
    ? Object.values(multiFields).some((field) => field?.dirty)
    : false
  // Per-element count aggregates for tri-state toggle derivation.
  const multiSummary = useSafeguardMultiEditSummary(multiEditActive, multiSelectedRules ?? null)
  // Rank is mixed when any rank value appears in some but not all selected rules.
  const rankMixed = multiEditActive && multiSummary !== null
    && Array.from(multiSummary.rankCounts.values()).some(c => c > 0 && c < multiSummary.total)
  // Rarity is mixed by the same logic applied to rarity counts.
  const rarityMixed = multiEditActive && multiSummary !== null
    && Array.from(multiSummary.rarityCounts.values()).some(c => c > 0 && c < multiSummary.total)
  const theme = useTheme()
  const builderStatusChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  // Mixed-state colors — mirror RecipeBuilderPanel: use text.primary + shared alpha constants.
  const mixedBorderColor = useMemo(
    () => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BORDER_ALPHA.dark : MULTI_EDIT_MIXED_BORDER_ALPHA.light),
    [theme],
  )
  const mixedPatternColor = useMemo(
    () => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BG_ALPHA.dark : MULTI_EDIT_MIXED_BG_ALPHA.light),
    [theme],
  )
  const mixedTextColor = useMemo(
    () => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_TEXT_ALPHA.dark : MULTI_EDIT_MIXED_TEXT_ALPHA.light),
    [theme],
  )
  const mixedToggleOverrides = useMemo(
    () => MIXED_TOGGLE_GROUP_OVERRIDES(mixedBorderColor, mixedTextColor, mixedPatternColor),
    [mixedBorderColor, mixedTextColor, mixedPatternColor],
  )
  const { showFactionIcons, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const { resolveAllowedSetPool, sanitizeCombinationForSlots } = useKeepOverrideCombinationTools(metasets)

  // ── auto-apply / auto-reset preferences (shared with recipe builder) ───────
  const [autoResetAfterInsert, setAutoResetAfterInsert] = useAutoResetAfterInsertPreference()
  const [autoApplySelectedRecipe, setAutoApplySelectedRecipe] = useAutoApplySelectedRecipePreference()

  const setAutoResetExclusive = useCallback((next: boolean) => {
    setAutoResetAfterInsert(next)
    if (next && autoApplySelectedRecipe) setAutoApplySelectedRecipe(false)
  }, [autoApplySelectedRecipe, setAutoResetAfterInsert, setAutoApplySelectedRecipe])

  const setAutoApplyExclusive = useCallback((next: boolean) => {
    setAutoApplySelectedRecipe(next)
    if (next && autoResetAfterInsert) setAutoResetAfterInsert(false)
  }, [autoResetAfterInsert, setAutoApplySelectedRecipe, setAutoResetAfterInsert])

  // ── undo/redo history context menu (mirrors RecipeBuilderPanel) ──────────
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
  } = useBuilderHistoryMenu({ undoPreview, redoPreview, t, lang, onRequestClearHistory, onJumpToHistoryIndex })

  // ── action menus (Insert / Apply / Reset context menus + hover hints) ─────
  // Incremented whenever user defaults are saved/cleared so isDefaultRule re-evaluates.
  const [defaultsEpoch, setDefaultsEpoch] = useState(0)

  const isDefaultRule = useMemo(() => {
    void defaultsEpoch // recompute when user defaults change
    // Build effective defaults: user-saved if present, factory otherwise.
    const factory = createFactorySafeguardBuilderDefaults()
    let effectiveDefaults: Omit<SafeguardRule, 'id'> = factory
    try {
      const raw = localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        const normalized = normalizeSafeguardRule(JSON.parse(raw))
        if (normalized) {
          const { id: _id, ...rest } = normalized
          effectiveDefaults = { ...factory, ...rest }
        }
      }
    } catch {}
    // Compare via SSOT snapshot so key order matches createFactorySafeguardBuilderDefaults.
    return JSON.stringify(createSafeguardRuleContentSnapshot(rule)) === JSON.stringify(effectiveDefaults)
  }, [rule, defaultsEpoch])

  const [builderCollapsed, setBuilderCollapsed] = useBuilderSafeguardCollapsedPreference()


  // Apply is only meaningful when a rule is selected AND the builder state differs from it.
  const applyDisabled = editingRuleId === null || !selectedIsDirty

  const {
    insert: {
      menu: { anchor: insertMenuAnchor, paperRef: insertMenuPaperRef, close: closeInsertMenu, onContextMenu: handleInsertContextMenu },
      hint: { active: insertHintActive, pos: insertHintPos, onMouseEnter: handleInsertHintMouseEnter, onMouseMove: handleInsertHintMouseMove, onMouseLeave: handleInsertHintMouseLeave },
    },
    apply: {
      menu: { anchor: applyMenuAnchor, paperRef: applyMenuPaperRef, close: closeApplyMenu, onContextMenu: handleApplyContextMenu },
      hint: { active: applyHintActive, pos: applyHintPos, onMouseEnter: handleApplyHintMouseEnter, onMouseMove: handleApplyHintMouseMove, onMouseLeave: handleApplyHintMouseLeave },
    },
    reset: {
      menu: { anchor: resetMenuAnchor, paperRef: resetMenuPaperRef, close: closeResetMenu, onContextMenu: handleResetContextMenu },
      hint: { active: resetHintActive, pos: resetHintPos, onMouseEnter: handleResetHintMouseEnter, onMouseMove: handleResetHintMouseMove, onMouseLeave: handleResetHintMouseLeave },
    },
  } = useBuilderPanelActionMenus({
    builderCanAdd: !multiEditActive,
    multiEditActive,
    saveDisabled: multiEditActive ? !multiDraftDirty : applyDisabled,
    isDefaultBuilder: isDefaultRule,
  })

  // Register auto-apply handler so selection changes can trigger it.
  useEffect(() => {
    if (!registerAutoApplyHandler) return
    registerAutoApplyHandler(() => {
      if (!autoApplySelectedRecipe) return false
      if (editingRuleId === null) return false
      onApplySafeguard()
      return true
    })
    return () => { registerAutoApplyHandler(null) }
  }, [registerAutoApplyHandler, autoApplySelectedRecipe, editingRuleId, onApplySafeguard])

  const ruleModeScopeTooltip = useMemo(() => (
    `${t('safeguardsRuleModeHint')}\n\n${t('safeguardsCountModeHint')}\n\n${t('safeguardsSubstatModeHint')}\n\n${t('safeguardsIgnoreOptionsHint')}`
  ), [t])


  const safeguardScopeChipTooltips = useMemo(() => ({
    perSlot: t('safeguardsCountModePerSlotHint'),
    perSet: t('safeguardsCountModePerSetHint'),
    perFaction: t('safeguardsCountModePerFactionHint'),
    perMainStat: t('safeguardsCountModePerMainHint'),
  }), [t])

  // ── slot metrics — SSOT resolver shared with RecipeBuilderPanel and SafeguardChipsPanel ──
  const slotMetrics = useSlotMetrics()
  // slotLabel is now owned by the hook; no local switch/case needed.
  const { slotLabel } = slotMetrics

  // ── state helpers ─────────────────────────────────────────────────────────

  const [weightsAnchorEl, setWeightsAnchorEl] = useState<HTMLElement | null>(null)
  // Live preview candidates computed by debounced WASM rescore when weights change in the popover.
  // null = not yet computed (use detectionEntry.candidates); undefined = rescore in progress (show stale).
  const [livePreviewCandidates, setLivePreviewCandidates] = useState<SafeguardCandidateOut[] | null>(null)
  // Ref used to cancel in-flight debounce timers when the popover closes or weights change quickly.
  const livePreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [beatEquippedAnchorEl, setBeatEquippedAnchorEl] = useState<HTMLElement | null>(null)
  const [scaffoldAnchorEl, setScaffoldAnchorEl] = useState<HTMLElement | null>(null)
  // Tracks whether the Reset button is being hovered so all resettable sections
  // can show a red tint — mirrors RecipeBuilderPanel's hoverReset pattern.
  const [hoverReset, setHoverReset] = useState(false)
  const [scaffoldSearchText, setScaffoldSearchText] = useState('')
  const scaffoldMenuRef = React.useRef<HTMLDivElement | null>(null)
  const closeScaffoldMenu = useCallback(() => {
    setScaffoldAnchorEl(null)
    setScaffoldSearchText('')
  }, [])
  const { contextMenuGuard: scaffoldMenuGuard } = useContextMenuPaperGuard({
    open: scaffoldAnchorEl !== null,
    onClose: closeScaffoldMenu,
    menuRef: scaffoldMenuRef,
  })

  const filteredScaffoldEntries = useMemo(() => {
    const query = scaffoldSearchText.trim().toLowerCase()
    const hasQuery = query.length > 0
    return recipes
      .map((recipe, originalIdx) => {
        const isSep = recipe.exportMode === 'separator'
        const nameDecoration = isSep ? null : parseRecipeNameDirectives(recipe.name, '')
        const displayName = nameDecoration?.displayName.trim() ?? ''
        const nameColor = nameDecoration?.hasExplicitColor ? nameDecoration.resolvedColor : undefined
        return { recipe, originalIdx, displayName, nameColor }
      })
      .filter(({ recipe, displayName }) => {
        if (recipe.exportMode === 'separator') return !hasQuery
        if (!hasQuery) return true
        return displayName.toLowerCase().includes(query)
      })
  }, [recipes, scaffoldSearchText])

  const updateRule = useCallback((updater: (prev: SafeguardRule) => SafeguardRule) => {
    onChange((prev) => updater(prev))
  }, [onChange])

  const combination = rule.combination
  const activation = rule.activation

  const slotSelection = combination.slots
  const hasAccessorySlot = slotSelectionAllowsAccessories(slotSelection)
  const allowedSetPool = resolveAllowedSetPool(slotSelection)
  const setSelection = normalizeArtifactSetSelections(combination.sets)
    .filter((entry) => allowedSetPool.includes(Number(entry.id)))
  const rankSelection = combination.ranks
  const raritySelection = combination.rarities
  const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
  const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((v) => mainStatOptions.includes(v)))
  const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []

  const allowedSubstatOptions = resolveAllowedSubstatsForSlotsAndMains({
    slots: slotSelection,
    mainStats: mainStatSelection,
  })
  const substatSelection = sortSafeguardSubstats((rule?.substats ?? []).filter((v) => allowedSubstatOptions.includes(v)))
  const hasSubstatSelection = substatSelection.length > 0
  const effectiveSubstatMatch = hasSubstatSelection
    ? normalizeSafeguardSubstatMatch(rule?.substatMatch)
    : SafeguardSubstatMatch.Any
  const countMode = sanitizeSafeguardCountMode(rule?.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
  const effectiveCountMode = hasAccessorySlot
    ? countMode
    : sanitizeSafeguardCountMode({ ...countMode, perFaction: false })
  const scopeActive = resolveKeepOverrideScopeActive(effectiveCountMode)

  const ignorePreviousSafeguards = rule?.ignorePreviousSafeguards !== false
  const ignoreEquippedInCollection = rule?.ignoreEquippedInCollection === true
  const ignoreEquippedInVault = rule?.ignoreEquippedInVault === true
  // beatEquippedPercentile: null means disabled; a number (0–100) means active.
  const beatEquippedPercentile = rule?.beatEquippedPercentile ?? null
  const beatEquippedEnabled = beatEquippedPercentile !== null

  // ── multi-edit derived display values for substat/beat-equipped chips ─────
  // Staged substat match value: prefer staged if active, else live effective value.
  const displaySubstatMatch = multiEditActive
    ? (multiSubstatMatchField?.value as SafeguardSubstatMatch ?? effectiveSubstatMatch)
    : effectiveSubstatMatch
  // Mixed indicator: true when selection has differing values not yet staged.
  const substatMatchMixed = multiEditActive && multiSubstatMatchField?.status === 'mixed' && !multiSubstatMatchField.dirty
  const displayMatchLabel = displaySubstatMatch === SafeguardSubstatMatch.Any ? t('safeguardsSubstatRequirementAny')
    : displaySubstatMatch === SafeguardSubstatMatch.All ? t('safeguardsSubstatRequirementAll')
    : t('safeguardsSubstatRequirementPer')
  // Beat-equipped display and mixed state for multi-edit.
  const displayBeatEquippedPercentile = multiEditActive
    ? (multiBeatEquippedField?.value !== undefined && multiBeatEquippedField.value !== null
      ? (multiBeatEquippedField.value as number)
      : beatEquippedPercentile)
    : beatEquippedPercentile
  const beatEquippedMixed = multiEditActive && multiBeatEquippedField?.status === 'mixed' && !multiBeatEquippedField.dirty
  // In multi-edit, enabled = any rule has it on OR it has been staged as a change.
  const displayBeatEquippedEnabled = multiEditActive
    ? (multiBeatEquippedField?.dirty ? displayBeatEquippedPercentile !== null : beatEquippedEnabled)
    : beatEquippedEnabled

  const handleScopeChipToggle = (scope: KeepOverrideScopeKey) => {
    updateRule((prev) => {
      const prevMode = prev.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE
      const nextMode = toggleKeepOverrideCountMode(prevMode, scope)
      return { ...prev, countMode: nextMode }
    })
  }

  // Per-scope mixed state: some selected rules have the scope on while others have it off.
  // Computed directly from multiSelectedRules since countMode is tracked as a whole object,
  // not per individual scope key — so we derive scope-level granularity here.
  const perScopeMixed = useMemo(() => {
    if (!multiEditActive || !multiSelectedRules) {
      return { perSlot: false, perSet: false, perFaction: false, perMainStat: false }
    }
    const hasSome = (key: KeepOverrideScopeKey) => multiSelectedRules.some(r => r.countMode?.[key] ?? false)
    const hasMissing = (key: KeepOverrideScopeKey) => multiSelectedRules.some(r => !(r.countMode?.[key] ?? false))
    return {
      perSlot: hasSome('perSlot') && hasMissing('perSlot'),
      perSet: hasSome('perSet') && hasMissing('perSet'),
      perFaction: hasSome('perFaction') && hasMissing('perFaction'),
      perMainStat: hasSome('perMainStat') && hasMissing('perMainStat'),
    }
  }, [multiEditActive, multiSelectedRules])

  const renderScopeChip = (
    scope: KeepOverrideScopeKey,
    label: string,
    active: boolean,
    disabledOverride = false,
    mixed = false,
  ) => (
    <MarkdownTooltip key={scope} markdown={safeguardScopeChipTooltips[scope]}>
      <span>
        <KeepOverrideScopeChip
          scope={scope}
          label={label}
          active={active}
          mixed={mixed}
          disabled={disabledOverride}
          onToggle={handleScopeChipToggle}
        />
      </span>
    </MarkdownTooltip>
  )

  const setRuleCombination = (updater: (combination: SafeguardRule['combination']) => SafeguardRule['combination']) => {
    updateRule((prev) => {
      const nextCombination = sortSafeguardCombination(updater(prev.combination))
      return { ...prev, combination: nextCombination }
    })
  }

  // Shared onChange for main-stat ToggleButtonGroup rows.
  // MUI passes the full updated value array (preserving values from the other row).
  const handleMainStatChange = (_: React.SyntheticEvent, nextValues: string[]) => {
    if (!Array.isArray(nextValues)) return
    const nextMain = dedupeNumericArray(
      nextValues.map(Number).filter((n) => Number.isFinite(n) && mainStatOptions.includes(n)),
    )
    updateRule((prev) => constrainSafeguardSubstats(prev, { ...prev.combination, mainStats: nextMain }))
  }

  // Shared onChange for substat ToggleButtonGroup rows.
  const handleSubstatChange = (_: React.SyntheticEvent, nextValues: string[]) => {
    if (!Array.isArray(nextValues)) return
    const sorted = sortSafeguardSubstats(
      dedupeNumericArray(
        nextValues.map(Number).filter((n) => Number.isFinite(n) && allowedSubstatOptions.includes(n as StatVariant)),
      ) as StatVariant[],
    )
    // Weights are irrelevant with no substats — close the popover immediately so
    // it does not stay open after the last substat is deselected.
    if (sorted.length === 0) setWeightsAnchorEl(null)
    updateRule((prev) => {
      const nextMatch = sorted.length > 0 ? prev.substatMatch : SafeguardSubstatMatch.Any
      const nextWeights = pruneSafeguardsSubstatWeights(prev.substatWeights, sorted)
      return { ...prev, substats: sorted, substatMatch: nextMatch, substatWeights: nextWeights }
    })
  }

  const mainStatValueStrings = mainStatSelection.map(String)
  const substatValueStrings = substatSelection.map(String)

  // ── weight popover: candidate ranking ────────────────────────────────────

  // Artifact lookup from the detection entry — stable map rebuilt only when entry changes.
  const artifactsByItemKey = useMemo<ReadonlyMap<number, SafeguardDetectionEntry['artifacts'][number]>>(() => {
    const map = new Map<number, SafeguardDetectionEntry['artifacts'][number]>()
    if (detectionEntry?.artifacts) {
      for (const artifact of detectionEntry.artifacts) map.set(artifact.itemKey, artifact)
    }
    return map
  }, [detectionEntry])

  // Trigger a debounced WASM rescore with the current unsaved weights.
  // Substats are passed as a parameter (not closed over) to avoid React Compiler memoization issues
  // with inline arrays that may be treated as mutable by the compiler analysis.
  const triggerLiveRescore = useCallback((
    nextWeights: Partial<Record<StatVariant, number>>,
    currentSubstats: readonly StatVariant[],
  ) => {
    // Only rescore when we have detection artifacts to score against.
    if (!detectionEntry?.artifacts?.length || !currentSubstats.length) return
    // Cancel any previous pending timer.
    if (livePreviewTimerRef.current !== null) clearTimeout(livePreviewTimerRef.current)
    livePreviewTimerRef.current = setTimeout(() => {
      livePreviewTimerRef.current = null
      try {
        const weightRecord: Record<number, number> = {}
        for (const v of currentSubstats) {
          weightRecord[v] = normalizeGearInspectorSortWeight(Number(nextWeights[v] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT))
        }
        // Call WASM to re-score; result is sorted by rank ascending.
        const result = scoreSafeguardCandidates({
          artifacts: detectionEntry.artifacts,
          substats: currentSubstats as StatVariant[],
          weights: weightRecord,
          requiredCount: rule?.requiredCount ?? 1,
        })
        setLivePreviewCandidates(result)
      } catch {
        // Scoring failed (WASM not ready); clear live preview to fall back to snapshot.
        setLivePreviewCandidates(null)
      }
    }, 150)
  }, [detectionEntry, rule])

  // Reset live preview and cancel any pending debounce timer when the weights popover closes.
  const handleWeightsPopoverClose = useCallback(() => {
    if (livePreviewTimerRef.current !== null) {
      clearTimeout(livePreviewTimerRef.current)
      livePreviewTimerRef.current = null
    }
    setLivePreviewCandidates(null)
    setWeightsAnchorEl(null)
  }, [])

  // Close-button guard for the weights popover — same ContextMenuPaper pattern used for other popovers.
  // menuRef must be forwarded to slotProps.paper so isTargetInsideAnyMenu can distinguish inside clicks.
  const { contextMenuGuard: weightsPopoverGuard, menuRef: weightsPopoverMenuRef } = useContextMenuPaperGuard({
    open: Boolean(weightsAnchorEl),
    onClose: handleWeightsPopoverClose,
  })

  // Candidate list shown in the popover right column:
  // prefer live preview (from unsaved weight edits) over the detection snapshot.
  const popoverCandidates = livePreviewCandidates ?? detectionEntry?.candidates

  // Measured cell widths — same canvas pass used by SafeguardCandidateRankList;
  // drives the popover right-column width so it fits the list content exactly.
  const { mainstatCellWidthPx, substatCellWidthPx } = useMemo(() => measureStatCellWidths(t, theme), [t, theme])

  // Number of substat columns the list always renders (present cells + placeholders).
  const substatColumnCount = Math.min(substatSelection.length, SUBSTAT_SLOT_COUNT)

  // Right column width — sum of every fixed element in a candidate row plus the substat columns.
  // Components: rank(38) + identifier(130) + mainstat + mr-gap(6) + substats + score(44) +
  //             badge(14) + match(130) + row-gaps(7×4=28) + left-padding(12) + safety(8)
  const rightColumnWidthPx = 38 + 130 + mainstatCellWidthPx + 6 + substatCellWidthPx * substatColumnCount + 44 + 14 + 130 + 28 + 12 + 8

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box
      data-tour-id="safeguards.builder"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
        columnGap: 1,
        rowGap: 1,
      }}
    >

      {/* ── Row 0: Rule name (full-width) ─── */}
      <Box sx={(theme) => ({ gridColumn: '1 / -1', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <TextField
          label={t('safeguardBuilderRuleName')}
          // In multi-edit mode show staged name value (or placeholder when mixed).
          value={multiEditActive
            ? (multiNameField?.status === 'mixed' && !multiNameField.dirty
              ? ''
              : String(multiNameField?.value ?? rule.name ?? ''))
            : (rule.name ?? '')}
          {...(multiEditActive && multiNameField?.status === 'mixed' && !multiNameField.dirty
            ? { placeholder: t('builderMultiEditMixedPlaceholder') }
            : {})}
          onChange={(e) => {
            if (multiEditActive && multiEdit) {
              multiEdit.updateField('name', { value: e.target.value, status: 'common' })
            } else {
              updateRule((prev) => ({ ...prev, name: e.target.value }))
            }
          }}
          InputProps={{
            endAdornment: (multiEditActive ? (multiNameField?.dirty) : rule.name) ? (
              <InputAdornment position="end">
                <ClearIconButton
                  size="small"
                  edge="end"
                  aria-label={t('builderClearRecipeName')}
                  tooltip={t('builderClearRecipeName')}
                  onClick={() => {
                    if (multiEditActive && multiEdit) {
                      multiEdit.updateField('name', { value: '', status: 'common' })
                    } else {
                      updateRule((prev) => ({ ...prev, name: '' }))
                    }
                  }}
                />
              </InputAdornment>
            ) : undefined,
          }}
          fullWidth
        />
      </Box>

      {/* ── Row 1: Mode toggle + Required count + Ignore chips + undo/redo (full-width) ── */}
      <Box sx={{ gridColumn: '1 / -1' }}>
        {/* Header row: chevron + Mode label + info icon + undo/redo (always visible).
            position+zIndex keep the label and undo/redo controls on top of the toggle row bleed. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, position: 'relative', zIndex: 1 }}>
          <BuilderSectionToggle id="action" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
          <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
            <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('safeguardsRuleModeLabel')}</Box>
          </FormLabel>
          <MarkdownTooltip markdown={ruleModeScopeTooltip}>
            <IconButton
              size="small"
              color="inherit"
              aria-label={t('safeguardsRuleModeHintLabel')}
              sx={{ p: 0.25, fontSize: 16, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
            >
              <InfoOutlinedIcon fontSize="inherit" />
            </IconButton>
          </MarkdownTooltip>
          {/* Undo/Redo: pinned right so it stays visible when mode section is collapsed. */}
          <Box
            sx={{ ml: 'auto', display: 'flex', alignItems: 'flex-end', gap: 0.5, flexShrink: 0, pb: 0, position: 'relative' }}
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
              lang={lang}
              onSelectEntry={handleHistoryEntrySelect}
              onRequestClearHistory={handleRequestClearHistory}
              substatColors={substatColors}
            />
          </Box>
        </Box>
        {/* Collapsible content: mode toggle + count + ignore chips.
            mt: -14px (½·SMALL_BUTTON_HEIGHT_PX) bleeds the toggle row into the label row so its
            visual center aligns with the label — matching the recipe builder's action subgroup.
            The header row uses zIndex:1 to stay interactive on top of the bleed. */}
        <Collapse in={!builderCollapsed.action} timeout="auto" unmountOnExit>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, flexWrap: 'nowrap', overflow: 'hidden', mt: `-${SMALL_BUTTON_HEIGHT_PX / 2}px` }}>
        {/* Mode toggle — label moved to header row above */}
        <FormControl sx={(theme) => ({ flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>

          {/* Relative-positioned wrapper enables the mixed-state ::before overlay pattern. */}
          <Box sx={{ position: 'relative' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            // In multi-edit mode, show the staged value; null when mixed (no button highlighted).
            value={multiEditActive
              ? (activationMixed
                ? null
                : (multiActivationField?.value as SafeguardRuleActivation ?? activation))
              : activation}
            onChange={(_event, next) => {
              if (!next) return
              if (multiEditActive && multiEdit) {
                multiEdit.updateField('activation', { value: next as SafeguardRuleActivation, status: 'common' })
              } else {
                updateRule((prev) => (prev.activation === next ? prev : { ...prev, activation: next }))
              }
            }}
            sx={{ borderRadius: '8px', overflow: 'hidden' }}
          >
            <ToggleButton value={SafeguardRuleActivation.Off} aria-label={t('safeguardsRuleModeOff')} sx={{ flex: 1, minWidth: 0, px: 1.5 }}>
              {t('safeguardsRuleModeOffShort')}
            </ToggleButton>
            <ToggleButton
              value={SafeguardRuleActivation.ProtectExisting}
              aria-label={t('safeguardsRuleModeProtect')}
              sx={(muiTheme) => ({
                flex: 1,
                minWidth: 0,
                px: 1.5,
                '&.Mui-selected': {
                  bgcolor: muiTheme.palette.success.main,
                  borderColor: muiTheme.palette.success.main,
                  color: muiTheme.palette.common.black,
                  '&:hover': { bgcolor: muiTheme.palette.success.light },
                },
              })}
            >
              {t('safeguardsRuleModeProtectShort')}
            </ToggleButton>
            <ToggleButton
              value={SafeguardRuleActivation.AnticipateGaps}
              aria-label={t('safeguardsRuleModeAnticipate')}
              sx={(muiTheme) => ({
                flex: 1,
                minWidth: 0,
                px: 1.5,
                '&.Mui-selected': {
                  bgcolor: muiTheme.palette.warning.main,
                  borderColor: muiTheme.palette.warning.main,
                  color: muiTheme.palette.getContrastText(muiTheme.palette.warning.main),
                  '&:hover': { bgcolor: muiTheme.palette.warning.dark },
                },
              })}
            >
              {t('safeguardsRuleModeAnticipateShort')}
            </ToggleButton>
          </ToggleButtonGroup>
          {/* Dashed-border gradient overlay when activation modes differ across selected rules. */}
          {activationMixed && (
            <Box sx={{
              position: 'absolute', inset: 0, borderRadius: '8px',
              border: `1px dashed ${mixedBorderColor}`,
              backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              pointerEvents: 'none', zIndex: 1,
            }} />
          )}
          </Box>
        </FormControl>

        {/* Required count */}
        <Box sx={(theme) => ({ flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
          <TextField
            size="small"
            type="number"
            label={t('safeguardsRequiredCount')}
            // In multi-edit mode show staged value; when mixed (not yet staged) placeholder shows.
            value={multiEditActive
              ? (multiRequiredCountField?.status === 'mixed' && !multiRequiredCountField.dirty
                ? ''
                : Number(multiRequiredCountField?.value ?? rule.requiredCount ?? 1))
              : (rule.requiredCount ?? 1)}
            {...(multiEditActive && multiRequiredCountField?.status === 'mixed' && !multiRequiredCountField.dirty
              ? { placeholder: t('builderMultiEditMixedPlaceholder') }
              : {})}
            onChange={(event) => {
              const raw = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1)))
              if (multiEditActive && multiEdit) {
                multiEdit.updateField('requiredCount', { value: raw, status: 'common' })
              } else {
                updateRule((prev) => ({ ...prev, requiredCount: raw }))
              }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start">≥</InputAdornment>,
              endAdornment: (
                <NumberSpinnerAdornment
                  ariaLabel={t('safeguardsRequiredCount')}
                  onStep={(delta) => {
                    if (multiEditActive && multiEdit) {
                      const current = Number(multiRequiredCountField?.value ?? rule.requiredCount ?? 1)
                      const next = Math.max(1, Math.min(9999, Math.floor(current + delta)))
                      multiEdit.updateField('requiredCount', { value: next, status: 'common' })
                    } else {
                      updateRule((prev) => {
                        const next = Math.max(1, Math.min(9999, Math.floor((prev.requiredCount ?? 1) + delta)))
                        return { ...prev, requiredCount: next }
                      })
                    }
                  }}
                />
              ),
            }}
            sx={(themeInner) => ({
              width: 130,
              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
              '& input[type=number]': { MozAppearance: 'textfield' },
              '& input': { textAlign: 'right', paddingRight: themeInner.spacing(1), paddingLeft: themeInner.spacing(0.5) },
            })}
            inputProps={{ min: 1, step: 1, max: 9999 }}
          />
        </Box>

        {/* Ignore chips — right of required count, stacked in 2 rows */}
        <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: 0.75, flex: '1 1 auto', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
          {/* Row 1: ignore previous safeguards */}
          {(() => {
            // Derive effective value and mixed indicator for each ignore toggle.
            const prevMixed = multiEditActive && multiIgnorePreviousField?.status === 'mixed' && !multiIgnorePreviousField.dirty
            const prevValue = multiEditActive
              ? Boolean(multiIgnorePreviousField?.value ?? ignorePreviousSafeguards)
              : ignorePreviousSafeguards
            const collMixed = multiEditActive && multiIgnoreCollectionField?.status === 'mixed' && !multiIgnoreCollectionField.dirty
            const collValue = multiEditActive
              ? Boolean(multiIgnoreCollectionField?.value ?? ignoreEquippedInCollection)
              : ignoreEquippedInCollection
            const vaultMixed = multiEditActive && multiIgnoreVaultField?.status === 'mixed' && !multiIgnoreVaultField.dirty
            const vaultValue = multiEditActive
              ? Boolean(multiIgnoreVaultField?.value ?? ignoreEquippedInVault)
              : ignoreEquippedInVault
            return (
              <>
                <Box sx={{ display: 'flex' }}>
                  <MarkdownTooltip markdown={t('safeguardsIgnorePreviousSafeguardsHint')} ellipsisTitle={t('safeguardsIgnorePreviousSafeguards')} ellipsisSelector=".MuiChip-label">
                    <Chip
                      size="small"
                      variant="filled"
                      label={`${GLYPH_IGNORE_PREVIOUS}${NBSP}${t('safeguardsIgnorePreviousSafeguards')}`}
                      aria-label={t('safeguardsIgnorePreviousSafeguards')}
                      clickable
                      onClick={() => {
                        if (multiEditActive && multiEdit) {
                          multiEdit.updateField('ignorePreviousSafeguards', { value: !prevValue, status: 'common' })
                        } else {
                          updateRule((prev) => ({ ...prev, ignorePreviousSafeguards: !ignorePreviousSafeguards }))
                        }
                      }}
                      sx={{
                        // Green when enabled OR mixed — base matches recipe builder flex chip.
                        ...builderStatusChipSx(prevValue || prevMixed, { dimDisabled: true }),
                        // Full mixed overlay: dashed border + hatched gradient + muted text,
                        // identical to the flex chip pattern in RecipeBuilderPanel.
                        ...(prevMixed ? {
                          borderStyle: 'dashed',
                          borderColor: mixedBorderColor,
                          color: mixedTextColor,
                          backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                        } : {}),
                      }}
                    />
                  </MarkdownTooltip>
                </Box>
                {/* Row 2: ignore equipped in collection + vault */}
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInCollectionHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInCollection')} ellipsisSelector=".MuiChip-label">
                    <Chip
                      size="small"
                      variant="filled"
                      label={`${GLYPH_IGNORE_COLLECTION}${NBSP}${t('safeguardsIgnoreEquippedInCollection')}`}
                      aria-label={t('safeguardsIgnoreEquippedInCollection')}
                      clickable
                      onClick={() => {
                        if (multiEditActive && multiEdit) {
                          multiEdit.updateField('ignoreEquippedInCollection', { value: !collValue, status: 'common' })
                        } else {
                          updateRule((prev) => ({ ...prev, ignoreEquippedInCollection: !ignoreEquippedInCollection }))
                        }
                      }}
                      sx={{
                        ...builderStatusChipSx(collValue || collMixed, { dimDisabled: true }),
                        ...(collMixed ? {
                          borderStyle: 'dashed',
                          borderColor: mixedBorderColor,
                          color: mixedTextColor,
                          backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                        } : {}),
                      }}
                    />
                  </MarkdownTooltip>
                  <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInVaultHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInVault')} ellipsisSelector=".MuiChip-label">
                    <Chip
                      size="small"
                      variant="filled"
                      label={`${GLYPH_IGNORE_VAULT}${NBSP}${t('safeguardsIgnoreEquippedInVault')}`}
                      aria-label={t('safeguardsIgnoreEquippedInVault')}
                      clickable
                      onClick={() => {
                        if (multiEditActive && multiEdit) {
                          multiEdit.updateField('ignoreEquippedInVault', { value: !vaultValue, status: 'common' })
                        } else {
                          updateRule((prev) => ({ ...prev, ignoreEquippedInVault: !ignoreEquippedInVault }))
                        }
                      }}
                      sx={{
                        ...builderStatusChipSx(vaultValue || vaultMixed, { dimDisabled: true }),
                        ...(vaultMixed ? {
                          borderStyle: 'dashed',
                          borderColor: mixedBorderColor,
                          color: mixedTextColor,
                          backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                        } : {}),
                      }}
                    />
                  </MarkdownTooltip>
                </Box>
              </>
            )
          })()}
        </Box>
        </Box>
        </Collapse>
      </Box>

      {/* ── Row 2 left: Rank | Rarity | Faction (flex row; each section shrinks when collapsed) ── */}
      <Box sx={(theme) => ({
        gridColumn: '1 / 3',
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
        borderRadius: 1,
        transition: UI_BG_HOVER_DANGER_TRANSITION,
        backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent',
      })}>

        {/* Rank — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rank ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="rank" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderRank')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.rank} timeout="auto" unmountOnExit>
            <GearRankSelect
              multiple
              // When mixed, collapse to empty so renderValue shows the mixed label instead of
              // a potentially-misleading partial rank list from only one of the selected rules.
              value={rankMixed ? [] : rankSelection}
              onChange={(nextRanks) => {
                setRuleCombination((prev) => ({ ...prev, ranks: nextRanks }))
              }}
              allowAny
              anyLabel={t('any')}
              // Override closed-select display text to "Mixed" when state differs across rules.
              {...(rankMixed ? { mixedLabel: t('builderMultiMixedValue') } : {})}
              menuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              sx={rankMixed ? {
                ...SELECT_BOX_HEIGHT_SX,
                // Dashed border + diagonal gradient mirrors the data-mixed toggle button pattern.
                '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: mixedBorderColor },
                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              } : SELECT_BOX_HEIGHT_SX}
            />
          </Collapse>
        </FormControl>

        {/* Rarity — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rarity ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="rarity" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('filterRarity')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.rarity} timeout="auto" unmountOnExit>
            <GearRaritySelect
              multiple
              // When mixed, collapse to empty so renderValue shows the mixed label.
              value={rarityMixed ? [] : raritySelection}
              onChange={(nextRarities) => {
                setRuleCombination((prev) => ({ ...prev, rarities: nextRarities }))
              }}
              allowAny
              anyLabel={t('any')}
              {...(rarityMixed ? { mixedLabel: t('builderMultiMixedValue') } : {})}
              menuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
              sx={rarityMixed ? {
                ...SELECT_BOX_HEIGHT_SX,
                '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: mixedBorderColor },
                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              } : SELECT_BOX_HEIGHT_SX}
            />
          </Collapse>
        </FormControl>

        {/* Faction — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.faction ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }} disabled={!hasAccessorySlot}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="faction" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderFaction')}</Box>
            </FormLabel>
          </Box>
          <Collapse in={!builderCollapsed.faction} timeout="auto" unmountOnExit>
            <GearFactionSelect
              multiple
              disabled={!hasAccessorySlot}
              value={factionSelection}
              onChange={(nextFactions) => {
                if (!hasAccessorySlot) return
                setRuleCombination((prev) => ({ ...prev, factions: nextFactions }))
              }}
              anyLabel={t('any')}
              sx={SELECT_BOX_HEIGHT_SX}
            />
            {/* Negative mb cancels the chip's contribution to the Collapse height so the
                faction section does not inflate the grid row. MUI Collapse switches to
                overflow:visible when fully open, letting the chip render past its boundary. */}
            <Box sx={{ mt: 0.75, mb: `-${BUILDER_STATUS_CHIP_HEIGHT_PX}px` }}>
              {renderScopeChip('perFaction', t('safeguardsCountModePerFaction'), scopeActive.perFaction, !hasAccessorySlot, perScopeMixed.perFaction)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 2 right: Hidden level-window spacer (col 3, mirrors recipe builder) ─── */}
      {/* Invisible structural placeholder — same MUI Slider as the recipe builder's level-window
          so Row 2's grid height is always determined by the same element on both panels.
          The per-faction chip's negative mb keeps it out of the faction section's height, so
          this spacer (not the chip) becomes the tallest item in the row. */}
      <Box aria-hidden="true" sx={{ gridColumn: '3 / 4', visibility: 'hidden' }}>
        {/* Label row mirrors the recipe builder's level-window header exactly (same components,
            same sx) so this spacer's height is always pixel-identical on every screen/zoom. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <BuilderSectionToggle id="mainStat" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
          <FormLabel sx={BUILDER_LABEL_INLINE_SX} />
        </Box>
        <Box sx={{ px: 1.5 }}>
          <Slider
            size="small"
            min={0}
            max={16}
            step={null}
            disableSwap
            marks={LEVEL_MILESTONES.map((v) => ({ value: v, label: `+${v}` }))}
            value={[0, 16]}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `+${v}`}
            onChange={() => { /* spacer — no-op */ }}
            sx={{
              '& .MuiSlider-track': { height: 4 },
              '& .MuiSlider-rail': { height: 4 },
              '& .MuiSlider-thumb': { width: 16, height: 16 },
              '& .MuiSlider-mark': { height: 8 },
              '& .MuiSlider-markLabel': { fontSize: '0.75rem', mt: 0.5 },
            }}
          />
        </Box>
      </Box>

      {/* ── Row 3 left: Main stat + perMainStat chip ──────────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="mainStat" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderMain')}</Box>
            </FormLabel>
            {mainStatSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('builderClearMainStats')}
                  tooltip={t('builderClearMainStats')}
                  onClick={() => {
                    updateRule((prev) => constrainSafeguardSubstats(prev, { ...prev.combination, mainStats: [] }))
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.mainStat} timeout="auto" unmountOnExit>
            {/* Toggle rows + perMainStat chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {(() => {
                // Multi-edit: compute per-variant presence from summary + pending patch.
                const getMainStatPresence = (variant: number): 'none' | 'partial' | 'all' => {
                  if (!multiEditActive || !multiSummary) {
                    return mainStatSelection.includes(variant) ? 'all' : 'none'
                  }
                  const base = multiSummary.mainStatCounts.get(variant) ?? 0
                  const state = deriveBaseTriState(applyArrayPatchCount(base, multiSummary.total, multiMainStatsField?.patch as MultiEditArrayPatch<number> | null, variant), multiSummary.total)
                  return state === 'mixed' ? 'partial' : state
                }
                // Shared sx: add mixed-toggle overrides on top of base.
                const groupSx = multiEditActive ? [mainStatToggleGroupSx, mixedToggleOverrides] : mainStatToggleGroupSx
                // In multi-edit, group value must list only 'all' variants so MUI renders
                // selected state correctly (MUI overrides individual button selected prop).
                // Buttons with 'partial' presence show the data-mixed CSS indicator instead.
                const groupProps = multiEditActive
                  ? {
                      value: [...STAT_VARIANTS_PRIORITY_ROW1, ...STAT_VARIANTS_PRIORITY_ROW2]
                        .filter(v => getMainStatPresence(v) === 'all').map(String),
                    }
                  : { value: mainStatValueStrings, onChange: handleMainStatChange }
                return (
                  <>
                    {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                    <ToggleButtonGroup size="small" {...groupProps} sx={groupSx}>
                      {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => {
                        const presence = getMainStatPresence(variant)
                        const isMixed = presence === 'partial'
                        const handleMultiClick = (multiEditActive && multiEdit && multiSummary) ? () => {
                          // Determine the next target: mixed/none → 'all', all → 'none'.
                          const target = presence === 'all' ? 'none' : 'all'
                          const base = deriveBaseTriState(
                            multiSummary.mainStatCounts.get(variant) ?? 0,
                            multiSummary.total,
                          )
                          const nextPatch = computeMainStatPatchToggle(
                            multiMainStatsField?.patch as MultiEditArrayPatch<number> | null,
                            variant,
                            base,
                            target,
                          )
                          multiEdit.updateField('mainStats', { value: mainStatSelection as number[], status: 'common', patch: nextPatch ?? null })
                        } : undefined
                        return (
                          <ToggleButton
                            key={variant}
                            value={String(variant)}
                            disabled={!mainStatOptions.includes(variant)}
                            {...(isMixed ? { 'data-mixed': 'true' } : {})}
                            {...(handleMultiClick ? { onClick: handleMultiClick } : {})}
                          >
                            {t(statVariantI18nKey(variant))}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                    {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                    <ToggleButtonGroup size="small" {...groupProps} sx={groupSx}>
                      {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => {
                        const presence = getMainStatPresence(variant)
                        const isMixed = presence === 'partial'
                        const handleMultiClick = (multiEditActive && multiEdit && multiSummary) ? () => {
                          const target = presence === 'all' ? 'none' : 'all'
                          const base = deriveBaseTriState(
                            multiSummary.mainStatCounts.get(variant) ?? 0,
                            multiSummary.total,
                          )
                          const nextPatch = computeMainStatPatchToggle(
                            multiMainStatsField?.patch as MultiEditArrayPatch<number> | null,
                            variant,
                            base,
                            target,
                          )
                          multiEdit.updateField('mainStats', { value: mainStatSelection as number[], status: 'common', patch: nextPatch ?? null })
                        } : undefined
                        return (
                          <ToggleButton
                            key={variant}
                            value={String(variant)}
                            disabled={!mainStatOptions.includes(variant)}
                            {...(isMixed ? { 'data-mixed': 'true' } : {})}
                            {...(handleMultiClick ? { onClick: handleMultiClick } : {})}
                          >
                            {t(statVariantI18nKey(variant))}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                  </>
                )
              })()}
              {renderScopeChip('perMainStat', t('safeguardsCountModePerMain'), scopeActive.perMainStat, false, perScopeMixed.perMainStat)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 3 right: Substats + match chips + weights ─────────────────── */}
      {/* gap: 0 so the Collapse wrapper div (height:0 when collapsed) does not create phantom spacing.
          The chips row adds its own mt: 0.75 inside the Collapse instead, which unmounts with the content. */}
      <Box sx={(theme) => ({ gridColumn: '3 / 5', display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="substats" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderSubstats')}</Box>
            </FormLabel>
            {substatSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('clear')}
                  tooltip={t('clear')}
                  onClick={() => {
                    updateRule((prev) => ({ ...prev, substats: [], substatMatch: SafeguardSubstatMatch.Any, substatWeights: {} }))
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {(() => {
                // Multi-edit: compute per-variant presence from summary + pending patch.
                const getSubstatPresence = (variant: number): 'none' | 'partial' | 'all' => {
                  if (!multiEditActive || !multiSummary) {
                    return substatSelection.includes(variant as StatVariant) ? 'all' : 'none'
                  }
                  const base = multiSummary.substatCounts.get(variant) ?? 0
                  const state = deriveBaseTriState(applyArrayPatchCount(base, multiSummary.total, multiSubstatsField?.patch as MultiEditArrayPatch<number> | null, variant), multiSummary.total)
                  return state === 'mixed' ? 'partial' : state
                }
                // Group value lists only 'all' variants — MUI uses it to compute each button's
                // selected state; 'partial' variants stay unselected and get data-mixed CSS instead.
                const groupProps = multiEditActive
                  ? {
                      value: [...STAT_VARIANTS_PRIORITY_ROW1, ...STAT_VARIANTS_PRIORITY_ROW2]
                        .filter(v => getSubstatPresence(v) === 'all').map(String),
                    }
                  : { value: substatValueStrings, onChange: handleSubstatChange }
                const groupSx = multiEditActive ? [substatToggleGroupSx, mixedToggleOverrides] : substatToggleGroupSx
                return (
                  <>
                    {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                    <ToggleButtonGroup size="small" {...groupProps} sx={groupSx}>
                      {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => {
                        const presence = getSubstatPresence(variant)
                        const isMixed = presence === 'partial'
                        // Hoist multi-edit click handler to satisfy exactOptionalPropertyTypes.
                        const handleMultiClick = (multiEditActive && multiEdit && multiSummary) ? () => {
                          const target = presence === 'all' ? 'none' : 'all'
                          const base = deriveBaseTriState(
                            multiSummary.substatCounts.get(variant) ?? 0,
                            multiSummary.total,
                          )
                          const nextPatch = computeSubstatPatchToggle(
                            multiSubstatsField?.patch as MultiEditArrayPatch<number> | null,
                            variant as StatVariant,
                            base,
                            target,
                          )
                          multiEdit.updateField('substats', { value: substatSelection as number[], status: 'common', patch: nextPatch ?? null })
                        } : undefined
                        return (
                          <ToggleButton
                            key={variant}
                            value={String(variant)}
                            disabled={!allowedSubstatOptions.includes(variant as StatVariant)}
                            {...(isMixed ? { 'data-mixed': 'true' } : {})}
                            {...(handleMultiClick ? { onClick: handleMultiClick } : {})}
                          >
                            {t(statVariantI18nKey(variant))}
                          </ToggleButton>
                        )
                      })}
                    </ToggleButtonGroup>
                    {/* Row 2: HP, HP%, ATK, ATK%, DEF, DEF% */}
                    <ToggleButtonGroup size="small" {...groupProps} sx={groupSx}>
                      {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => {
                        const presence = getSubstatPresence(variant)
                        const isMixed = presence === 'partial'
                        // Hoist multi-edit click handler to satisfy exactOptionalPropertyTypes.
                        const handleMultiClick = (multiEditActive && multiEdit && multiSummary) ? () => {
                          const target = presence === 'all' ? 'none' : 'all'
                          const base = deriveBaseTriState(
                            multiSummary.substatCounts.get(variant) ?? 0,
                            multiSummary.total,
                          )
                          const nextPatch = computeSubstatPatchToggle(
                            multiSubstatsField?.patch as MultiEditArrayPatch<number> | null,
                            variant as StatVariant,
                            base,
                            target,
                          )
                          multiEdit.updateField('substats', { value: substatSelection as number[], status: 'common', patch: nextPatch ?? null })
                        } : undefined
                        return (
                          <ToggleButton
                            key={variant}
                            value={String(variant)}
                            disabled={!allowedSubstatOptions.includes(variant as StatVariant)}
                            {...(isMixed ? { 'data-mixed': 'true' } : {})}
                            {...(handleMultiClick ? { onClick: handleMultiClick } : {})}
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
          </Collapse>
        </FormControl>
        {/* Substat match mode chips + weights button + beat-equipped quality floor — all inline */}
        <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
        {/* mt: 0.75 provides the same 6px spacing that the outer Box gap used to supply, but only
            while the Collapse is mounted — preventing phantom height when the section is collapsed. */}
        <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap', overflow: 'hidden', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX }}>
          {/* Match mode chip woven with weights configure button.
              Chip cycles Any→All→Per Substat; button opens weights popover.
              Split-button pattern mirrors Final Sell: chip has flat right side,
              button attaches with matching background and a thin separator. */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <MarkdownTooltip markdown={t('safeguardsSubstatRequirementHint')}>
              <Chip
                size="small"
                variant="filled"
                label={substatMatchMixed
                  ? `${t('filterMatch')}:${NBSP}(${t('builderMultiEditMixedShort')})`
                  : `${t('filterMatch')}:${NBSP}${displayMatchLabel}`}
                aria-label={t('safeguardsSubstatRequirementLabel')}
                clickable
                disabled={!hasSubstatSelection && !multiEditActive}
                onClick={() => {
                  if (!hasSubstatSelection && !multiEditActive) return
                  if (multiEditActive && multiEdit) {
                    // Cycle from current staged match value.
                    const next = displaySubstatMatch === SafeguardSubstatMatch.Any ? SafeguardSubstatMatch.All
                      : displaySubstatMatch === SafeguardSubstatMatch.All ? SafeguardSubstatMatch.PerSubstat
                      : SafeguardSubstatMatch.Any
                    if (next === SafeguardSubstatMatch.PerSubstat) setWeightsAnchorEl(null)
                    multiEdit.updateField('substatMatch', { value: next, status: 'common' })
                    return
                  }
                  // Single-edit: cycle Any → All → PerSubstat → Any.
                  const next = effectiveSubstatMatch === SafeguardSubstatMatch.Any ? SafeguardSubstatMatch.All
                    : effectiveSubstatMatch === SafeguardSubstatMatch.All ? SafeguardSubstatMatch.PerSubstat
                    : SafeguardSubstatMatch.Any
                  // Per Substat disables weights — close the popover so it doesn't linger.
                  if (next === SafeguardSubstatMatch.PerSubstat) setWeightsAnchorEl(null)
                  updateRule((prev) => ({ ...prev, substatMatch: next }))
                }}
                sx={{
                  ...builderStatusChipSx(true, { dimDisabled: true }),
                  // Flatten right corners so the configure button fits flush.
                  borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px 0 0 ${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                  // Mixed overlay: dashed border + hatched gradient + muted text.
                  ...(substatMatchMixed ? {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  } : {}),
                }}
              />
            </MarkdownTooltip>
            {/* Weights configure button — square left side continues the chip shape */}
            <IconButton
              size="small"
              aria-label={t('safeguardsSubstatWeightsLabel')}
              disabled={!hasSubstatSelection && !multiEditActive}
              onClick={(e) => setWeightsAnchorEl(e.currentTarget)}
              sx={(theme) => {
                // Button is enabled whenever substats are selected, regardless of match mode.
                // The candidate list is useful even in PerSubstat mode (equal-weight ranking).
                const canInteract = hasSubstatSelection || multiEditActive
                // Match chip background uses green when substats are selected (always green-colored).
                const chipEnabled = hasSubstatSelection
                const bg = chipEnabled ? alpha(theme.palette.success.main, 0.18) : alpha(theme.palette.text.disabled, 0.08)
                const color = chipEnabled
                  ? (theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark)
                  : theme.palette.text.disabled
                return {
                  height: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  width: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  borderRadius: `0 ${STATUS_CHIP_BORDER_RADIUS_PX}px ${STATUS_CHIP_BORDER_RADIUS_PX}px 0`,
                  backgroundColor: bg,
                  color: canInteract ? color : alpha(color, 0.45),
                  borderLeft: `1px solid ${chipEnabled ? alpha(theme.palette.success.main, 0.28) : alpha(theme.palette.divider, 0.5)}`,
                  '&:hover': canInteract ? { backgroundColor: alpha(theme.palette.success.main, 0.28) } : {},
                  '&.Mui-disabled': { backgroundColor: bg, opacity: 0.5, color: alpha(color, 0.35) },
                  // Mixed overlay when match mode differs across selected rules.
                  ...(substatMatchMixed ? {
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    color: mixedTextColor,
                  } : {}),
                }
              }}
            >
              <TuneIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
          {/* Beat-equipped quality floor chip woven with configure button.
              Chip toggles the floor on/off; button opens the percentile popover.
              Same split-button pattern as Match: flat right side on chip, button attaches flush. */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <MarkdownTooltip markdown={t('safeguardsBeatEquippedPercentileHint')} ellipsisTitle={t('safeguardsBeatEquippedPercentile')} ellipsisSelector=".MuiChip-label">
              <Chip
                size="small"
                variant="filled"
                label={beatEquippedMixed
                  ? `${t('safeguardsBeatEquippedShort')}${NBSP}(${t('builderMultiEditMixedShort')})`
                  : (displayBeatEquippedEnabled
                    ? t('safeguardsBeatEquippedWithValue', { value: displayBeatEquippedPercentile ?? 50 })
                    : t('safeguardsBeatEquippedShort'))}
                aria-label={t('safeguardsBeatEquippedPercentile')}
                clickable
                disabled={!hasSubstatSelection && !multiEditActive}
                onClick={() => {
                  if (!hasSubstatSelection && !multiEditActive) return
                  if (multiEditActive && multiEdit) {
                    // Toggle: null ↔ 50 in multi-edit mode.
                    const next = displayBeatEquippedEnabled ? SAFEGUARD_DEFAULT_BEAT_EQUIPPED_PERCENTILE : 50
                    multiEdit.updateField('beatEquippedPercentile', { value: next, status: 'common' })
                    return
                  }
                  // Single-edit toggle.
                  updateRule((prev) => ({
                    ...prev,
                    beatEquippedPercentile: prev.beatEquippedPercentile !== null
                      ? SAFEGUARD_DEFAULT_BEAT_EQUIPPED_PERCENTILE
                      : 50,
                  }))
                }}
                sx={{
                  // Show enabled (green) color when mixed — mirrors the flex chip pattern.
                  ...builderStatusChipSx(displayBeatEquippedEnabled || beatEquippedMixed, { dimDisabled: true }),
                  // Flatten right corners so the configure button fits flush.
                  borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px 0 0 ${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                  // Full mixed overlay: dashed border + hatched gradient + muted text.
                  ...(beatEquippedMixed ? {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  } : {}),
                }}
              />
            </MarkdownTooltip>
            {/* Configure button — interactive when the floor is active or mixed across rules */}
            <IconButton
              size="small"
              aria-label={t('safeguardsBeatEquippedPercentile')}
              disabled={(!hasSubstatSelection && !multiEditActive) || (!displayBeatEquippedEnabled && !beatEquippedMixed)}
              onClick={(e) => setBeatEquippedAnchorEl(e.currentTarget)}
              sx={(theme) => {
                // Treat mixed as effectively enabled so the button stays interactive.
                const isEffectivelyEnabled = displayBeatEquippedEnabled || beatEquippedMixed
                const canInteract = (hasSubstatSelection || multiEditActive) && isEffectivelyEnabled
                const chipEnabled = isEffectivelyEnabled
                const bg = chipEnabled ? alpha(theme.palette.success.main, 0.18) : alpha(theme.palette.text.disabled, 0.08)
                const color = chipEnabled
                  ? (theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark)
                  : theme.palette.text.disabled
                return {
                  height: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  width: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  borderRadius: `0 ${STATUS_CHIP_BORDER_RADIUS_PX}px ${STATUS_CHIP_BORDER_RADIUS_PX}px 0`,
                  backgroundColor: bg,
                  color: canInteract ? color : alpha(color, 0.45),
                  borderLeft: `1px solid ${chipEnabled ? alpha(theme.palette.success.main, 0.28) : alpha(theme.palette.divider, 0.5)}`,
                  '&:hover': canInteract ? { backgroundColor: alpha(theme.palette.success.main, 0.28) } : {},
                  '&.Mui-disabled': { backgroundColor: bg, opacity: 0.5, color: alpha(color, 0.35) },
                  // Mixed overlay when beat-equipped differs across selected rules.
                  ...(beatEquippedMixed ? {
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    color: mixedTextColor,
                  } : {}),
                }
              }}
            >
              <TuneIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        </Box>
        </Collapse>
      </Box>

      {/* ── Row 4: Slots (left) + Sets (right) — flex row; each always takes 50%, collapses vertically ── */}
      <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      {/* ── Row 4 left: Slots icon grid + perSlot chip ────────────────────── */}
      {/* flex: '0 1 50%' always — collapses vertically to header only, never shrinks horizontally */}
      <Box sx={(theme) => ({ flex: '0 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="slots" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('builderSlots')}</Box>
            </FormLabel>
            {slotSelection.length > 0
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('builderClearSlots')}
                  tooltip={t('builderClearSlots')}
                  onClick={() => {
                    updateRule((prev) => {
                      const nextCombination = sanitizeCombinationForSlots([], prev.combination)
                      return constrainSafeguardSubstats(prev, nextCombination)
                    })
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
          </Box>
          <Collapse in={!builderCollapsed.slots} timeout="auto" unmountOnExit>
            {/* Slot grid and perSlot chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={multiEditActive ? [{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }, mixedToggleOverrides] : { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                {artifactTypeIconList.map(({ id, Icon }) => {
                  // Multi-edit: derive per-slot tri-state presence.
                  const slotPresence = multiEditActive && multiSummary
                    ? deriveBaseTriState(applyArrayPatchCount(multiSummary.slotCounts.get(id) ?? 0, multiSummary.total, multiSlotsField?.patch as MultiEditArrayPatch<number> | null, id), multiSummary.total)
                    : (slotSelection.includes(id) ? 'all' : 'none')
                  const slotMixed = slotPresence === 'mixed'
                  // Selected only when ALL rules include the slot; mixed shows dashed indicator only.
                  const selected = slotPresence === 'all'
                  return (
                    <ToggleButton
                      key={id}
                      value={`${id}`}
                      selected={selected}
                      {...(slotMixed ? { 'data-mixed': 'true' } : {})}
                      onClick={() => {
                        if (multiEditActive && multiEdit && multiSummary) {
                          // Compute patch: mixed/none → add (target='all'), all → remove (target='none').
                          const target = slotPresence === 'all' ? 'none' : 'all'
                          const base = deriveBaseTriState(multiSummary.slotCounts.get(id) ?? 0, multiSummary.total)
                          const nextPatch = computeSlotPatchToggle(
                            multiSlotsField?.patch as MultiEditArrayPatch<number> | null,
                            id,
                            base,
                            target,
                          )
                          multiEdit.updateField('slots', { value: slotSelection as number[], status: 'common', patch: nextPatch })
                        } else {
                          updateRule((prev) => {
                            const set = new Set(prev.combination.slots)
                            if (set.has(id)) set.delete(id); else set.add(id)
                            const nextCombination = sanitizeCombinationForSlots(Array.from(set), prev.combination)
                            return constrainSafeguardSubstats(prev, nextCombination)
                          })
                        }
                      }}
                      onDoubleClick={(e) => {
                        // Double-click selects/deselects the entire group (artifacts or accessories).
                        // The two single-click events that precede dblclick toggle the same slot twice
                        // and cancel out, so this functional update sees the correct pre-click state.
                        e.preventDefault(); e.stopPropagation()
                        // Multi-edit double-click not implemented; defer to single-rule path.
                        if (multiEditActive) return
                        const groupIds = artifactTypeIconList
                          .map((entry) => entry.id)
                          .filter((sid) => isAccessorySlot(sid) === isAccessorySlot(id))
                        updateRule((prev) => {
                          const slots = prev.combination.slots
                          const allSelected = groupIds.every((sid) => slots.includes(sid))
                          const set = new Set(slots)
                          if (allSelected) groupIds.forEach((sid) => set.delete(sid))
                          else groupIds.forEach((sid) => set.add(sid))
                          const nextCombination = sanitizeCombinationForSlots(Array.from(set), prev.combination)
                          return constrainSafeguardSubstats(prev, nextCombination)
                        })
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        minWidth: 0,
                        height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
                        px: 1,
                        py: 0,
                        textTransform: 'none',
                        gap: slotMetrics.iconGapCss,
                        borderRadius: 1,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: slotMetrics.contentWidthPx ?? 'auto',
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
                            width: slotMetrics.iconSizePx,
                            minWidth: slotMetrics.iconSizePx,
                            mr: slotMetrics.iconGapCss,
                          }}
                        >
                          <Icon fontSize="small" />
                        </Box>
                        <Typography
                          variant="button"
                          component="span"
                          sx={(themeCtx) => ({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            minWidth: slotMetrics.labelFlexBasis,
                            flex: slotMetrics.labelFlexBasis ? `0 0 ${slotMetrics.labelFlexBasis}` : undefined,
                            fontSize: FONT_SIZE_BASE_PX,
                            fontFamily: themeCtx.typography.button?.fontFamily ?? themeCtx.typography.fontFamily,
                            fontWeight: themeCtx.typography.button?.fontWeight ?? themeCtx.typography.fontWeightMedium ?? 500,
                            letterSpacing: themeCtx.typography.button?.letterSpacing,
                            lineHeight: themeCtx.typography.button?.lineHeight ?? 1.2,
                          })}
                        >
                          {slotLabel(Number(id))}
                        </Typography>
                      </Box>
                    </ToggleButton>
                  )
                })}
              </Box>
              {renderScopeChip('perSlot', t('safeguardsCountModePerSlot'), scopeActive.perSlot, false, perScopeMixed.perSlot)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 4 right: Sets selector + perSet chip ──────────────────────── */}
      {/* flex: '0 1 50%' always — collapses vertically to header only, never shrinks horizontally */}
      <Box sx={(theme) => ({ flex: '0 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? (theme.palette.mode === 'dark' ? DANGER_TINT_BG.dark : DANGER_TINT_BG.light) : 'transparent' })}>
        <FormControl fullWidth>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionToggle id="sets" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
            <FormLabel sx={[BUILDER_LABEL_INLINE_SX, { m: 0, flex: 1 }]}>
              <Box component="span" sx={BUILDER_LABEL_TEXT_SX}>{t('setsTitle')}</Box>
            </FormLabel>
            <MarkdownTooltip markdown={t('builderManageMetasetsTooltip')}>
              <Button
                size="small"
                variant="outlined"
                onClick={onManageMetasets}
                sx={{ minWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('builderManageMetasetsButton')}
                </Box>
              </Button>
            </MarkdownTooltip>
          </Box>
          <Collapse in={!builderCollapsed.sets} timeout="auto" unmountOnExit>
            {/* Sets selector and perSet chip collapse together as a unit */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <GearSetsSelect
                value={setSelection}
                onChange={(nextSets) => {
                  setRuleCombination((prev) => ({ ...prev, sets: normalizeArtifactSetSelections(nextSets) }))
                }}
                metasets={metasets}
                selectedMetasetIds={combination.metaSetNames}
                onChangeMetasetIds={(nextMetaIds) => {
                  setRuleCombination((prev) => ({ ...prev, metaSetNames: dedupeStringArray(nextMetaIds) }))
                }}
                allowedSetIds={allowedSetPool}
                showMetasets
                layoutVersion={1}
                anyLabel={t('anySet')}
                includeNoSet={hasAccessorySlot}
              />
              {renderScopeChip('perSet', t('safeguardsCountModePerSet'), scopeActive.perSet, false, perScopeMixed.perSet)}
            </Box>
          </Collapse>
        </FormControl>
      </Box>
      </Box>{/* end Row 4 flex wrapper */}

      {/* ── Insert / Apply / Reset buttons + Scaffold (mirrors recipe builder) ── */}
      <Box sx={{ gridColumn: '1 / -1' }}>
        <Divider sx={{ my: 1, opacity: 0.5 }} />
        {/* Unified action row — Insert/Scaffold/Reset hidden in multi-edit mode;
            Apply label and handler adapt to single vs. multi-edit. Mirrors RecipeBuilderPanel. */}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center' }}>
          {/* Insert button — disabled in multi-edit mode, mirrors RecipeBuilderPanel. */}
          <Box
            component="span"
            onContextMenu={handleInsertContextMenu}
            onMouseEnter={handleInsertHintMouseEnter}
            onMouseMove={handleInsertHintMouseMove}
            onMouseLeave={handleInsertHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Button
              startIcon={<PlaylistAddIcon fontSize="small" />}
              disabled={multiEditActive}
              sx={{ whiteSpace: 'nowrap', gap: 0.75, '& .MuiButton-startIcon': { marginLeft: 0, marginRight: 0 } }}
              onClick={() => {
                onInsertSafeguard()
                if (autoResetAfterInsert) onResetSafeguard()
              }}
            >
              {editingRuleIndex !== null ? t('safeguardsBuilderInsertAs', { n: editingRuleIndex + 2 }) : t('safeguardsAddRule')}
            </Button>
          </Box>

          {/* Apply / multi-edit apply — label and handler adapt to mode */}
          <Box
            component="span"
            onContextMenu={handleApplyContextMenu}
            onMouseEnter={handleApplyHintMouseEnter}
            onMouseMove={handleApplyHintMouseMove}
            onMouseLeave={handleApplyHintMouseLeave}
            sx={{ display: 'inline-flex' }}
          >
            <Button
              startIcon={<PlaylistAddCheckIcon fontSize="small" />}
              disabled={multiEditActive ? !multiDraftDirty : applyDisabled}
              sx={{ whiteSpace: 'nowrap', gap: 0.75, '& .MuiButton-startIcon': { marginLeft: 0, marginRight: 0 } }}
              onClick={() => {
                if (multiEditActive) { if (multiDraftDirty) onApplyMultiEdit?.() }
                else { if (!applyDisabled) onApplySafeguard() }
              }}
            >
              {multiEditActive
                ? t('builderApplyToRecipes', { n: multiEditSelectionCount })
                : (editingRuleIndex !== null ? t('safeguardsBuilderApplyAs', { n: editingRuleIndex + 1 }) : t('safeguardsBuilderApply'))}
            </Button>
          </Box>

          {/* Scaffold from Recipe — hidden in multi-edit mode */}
          {!multiEditActive && (
            <Button
              variant="outlined"
              disabled={recipes.length === 0}
              sx={{ whiteSpace: 'nowrap' }}
              title={recipes.length === 0 ? t('safeguardsScaffoldFromRecipeEmpty') : undefined}
              onClick={(e) => setScaffoldAnchorEl(e.currentTarget)}
            >
              {t('safeguardsScaffoldFromRecipe')}
            </Button>
          )}

          {/* Spacer — pushes Reset to the right */}
          <Box sx={{ flex: 1 }} />

          {/* Reset button — hidden in multi-edit mode */}
          {!multiEditActive && (
            <Box
              component="span"
              onContextMenu={handleResetContextMenu}
              onMouseEnter={(e) => { setHoverReset(true); handleResetHintMouseEnter(e) }}
              onMouseMove={handleResetHintMouseMove}
              onMouseLeave={() => { setHoverReset(false); handleResetHintMouseLeave() }}
            >
              <Button
                size="small"
                color="warning"
                disabled={isDefaultRule}
                onClick={onResetSafeguard}
                sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
              >
                {t('safeguardsBuilderReset')}
              </Button>
            </Box>
          )}
        </Stack>

        {/* Context menu hint overlays */}
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={insertHintActive ? insertHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={applyHintActive ? applyHintPos : null} />
        <ContextMenuHintOverlay text={t('contextMenuHint')} position={resetHintActive ? resetHintPos : null} />

        {/* Insert context menu — auto reset after insert */}
        <Menu
          anchorEl={insertMenuAnchor}
          open={Boolean(insertMenuAnchor)}
          onClose={closeInsertMenu}
          PaperProps={{ ref: insertMenuPaperRef }}
        >
          <MenuItem onClick={() => { setAutoResetExclusive(!autoResetAfterInsert); closeInsertMenu() }}>
            <Checkbox size="small" checked={autoResetAfterInsert} onChange={() => {}} sx={{ mr: 1, p: 0.5 }} />
            {t('builderMenuAutoResetAfterInsert')}
          </MenuItem>
        </Menu>

        {/* Apply context menu — auto apply to selected */}
        <Menu
          anchorEl={applyMenuAnchor}
          open={Boolean(applyMenuAnchor)}
          onClose={closeApplyMenu}
          PaperProps={{ ref: applyMenuPaperRef }}
        >
          <MenuItem onClick={() => { setAutoApplyExclusive(!autoApplySelectedRecipe); closeApplyMenu() }}>
            <Checkbox size="small" checked={autoApplySelectedRecipe} onChange={() => {}} sx={{ mr: 1, p: 0.5 }} />
            {t('safeguardsBuilderMenuAutoApplySelected')}
          </MenuItem>
        </Menu>

        {/* Reset context menu — save user defaults or revert to factory, mirrors recipe builder */}
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
              // Save current rule (minus id) as user defaults; if identical to factory, clear the override.
              const factory = createFactorySafeguardBuilderDefaults()
              const current: Omit<SafeguardRule, 'id'> = {
                combination: rule.combination,
                name: rule.name ?? '',
                requiredCount: rule.requiredCount,
                activation: rule.activation,
                countMode: rule.countMode,
                ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
                ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
                ignoreEquippedInVault: rule.ignoreEquippedInVault,
                beatEquippedPercentile: rule.beatEquippedPercentile ?? null,
                substats: rule.substats ?? [],
                substatMatch: rule.substatMatch ?? SafeguardSubstatMatch.Any,
                substatWeights: rule.substatWeights ?? {},
              }
              const same = JSON.stringify(current) === JSON.stringify(factory)
              try {
                if (same) {
                  localStorage.removeItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
                } else {
                  // Store with a placeholder id so normalizeSafeguardRule can parse it on read.
                  localStorage.setItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY, JSON.stringify({ id: '__defaults__', ...current }))
                }
              } catch {}
              setDefaultsEpoch((x) => x + 1)
            }}
          >
            {t('builderMenuSaveUserDefaults')}
          </MenuItem>
          <MenuItem
            disabled={(() => { try { return !localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY) } catch { return true } })()}
            onClick={() => {
              closeResetMenu()
              // Apply factory defaults to the current draft (keeps the same id).
              const factory = createFactorySafeguardBuilderDefaults()
              onChange((prev) => ({ id: prev.id, ...factory }))
            }}
          >
            {t('builderMenuResetFactoryDefaults')}
          </MenuItem>
        </Menu>
      </Box>

      {/* ── Scaffold from Recipe popover ──────────────────────────────────── */}
      <Popover
        anchorEl={scaffoldAnchorEl}
        open={scaffoldAnchorEl !== null}
        onClose={closeScaffoldMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: scaffoldMenuGuard,
            onRequestClose: closeScaffoldMenu,
            closeLabel: t('close'),
            sx: { width: 480, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', maxHeight: 'min(460px, 80vh)' },
          }), ref: scaffoldMenuRef },
        }}
      >
        <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <InputBase
            autoFocus
            fullWidth
            placeholder={t('safeguardsScaffoldSearchPlaceholder')}
            value={scaffoldSearchText}
            onChange={(e) => setScaffoldSearchText(e.target.value)}
            inputProps={{ 'aria-label': t('safeguardsScaffoldSearchPlaceholder') }}
          />
        </Box>
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {filteredScaffoldEntries.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('safeguardsScaffoldNoMatch')}
              </Typography>
            </Box>
          )}
          {filteredScaffoldEntries.map(({ recipe, originalIdx, displayName, nameColor }) => {
            if (recipe.exportMode === 'separator') {
              const sepLabel = parseSeparatorLabel(recipe.name)
              return (
                <Box key={originalIdx} sx={{ py: 0.5, px: 1.5 }}>
                  <Divider>
                    {sepLabel ? (
                      <Typography variant="caption" sx={{ color: 'text.disabled', px: 0.5 }}>
                        {sepLabel}
                      </Typography>
                    ) : null}
                  </Divider>
                </Box>
              )
            }
            const isDisabled = recipe.exportMode === 'disabled'
            const recipeSummary = summaryParts(recipe, metasets, {
              substatColors,
              useStatButtonColors,
              showFactionIcons,
              showSetIcons,
              showSlotIcons,
              t,
              lang,
              tooltipsDisabled: true,
            })
            return (
              <ButtonBase
                key={originalIdx}
                onClick={() => {
                  closeScaffoldMenu()
                  onScaffoldFromRecipe(originalIdx)
                }}
                sx={{
                  display: 'flex',
                  width: '100%',
                  px: 1.5,
                  py: 0.75,
                  textAlign: 'left',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    opacity: isDisabled ? 0.55 : 1,
                  }}
                >
                  <Box component="span" sx={{ color: 'text.disabled', mr: 0.5 }}>
                    {originalIdx + 1}.
                  </Box>
                  <Box component="span" sx={{ color: recipe.keep ? 'success.main' : 'error.main', fontWeight: 700 }}>
                    {recipe.keep ? t('keepValueKeep') : t('keepValueSell')}
                  </Box>
                  {displayName ? (
                    <>
                      <Box component="span" sx={{ px: 0.25 }}>—</Box>
                      <Box component="span" sx={{ color: nameColor || undefined }}>
                        {displayName}
                      </Box>
                    </>
                  ) : null}
                  {recipeSummary && (
                    <>
                      {' | '}
                      {recipeSummary}
                    </>
                  )}
                </Typography>
              </ButtonBase>
            )
          })}
        </Box>
      </Popover>

      {/* ── Beat-equipped quality floor configure popover ────────────────── */}
      <Popover
        open={Boolean(beatEquippedAnchorEl)}
        anchorEl={beatEquippedAnchorEl}
        onClose={() => setBeatEquippedAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.25 }}>
            {t('safeguardsBeatEquippedPercentile')}
          </Typography>
          <TextField
            size="small"
            type="number"
            autoFocus
            InputProps={{
              startAdornment: <InputAdornment position="start">≥</InputAdornment>,
              endAdornment: (
                <NumberSpinnerAdornment
                  ariaLabel={t('safeguardsBeatEquippedPercentile')}
                  onStep={(delta) => {
                    if (multiEditActive && multiEdit) {
                      const current = displayBeatEquippedPercentile ?? 50
                      const next = Math.max(0, Math.min(100, Math.floor(current + delta)))
                      multiEdit.updateField('beatEquippedPercentile', { value: next, status: 'common' })
                    } else {
                      updateRule((prev) => {
                        const next = Math.max(0, Math.min(100, Math.floor((prev.beatEquippedPercentile ?? 50) + delta)))
                        return { ...prev, beatEquippedPercentile: next }
                      })
                    }
                  }}
                />
              ),
            }}
            value={displayBeatEquippedPercentile ?? 50}
            onChange={(event) => {
              const raw = Math.min(100, Math.max(0, Math.floor(Number(event.target.value) || 0)))
              if (multiEditActive && multiEdit) {
                multiEdit.updateField('beatEquippedPercentile', { value: raw, status: 'common' })
              } else {
                updateRule((prev) => ({ ...prev, beatEquippedPercentile: raw }))
              }
            }}
            sx={(themeInner) => ({
              width: 120,
              '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
              '& input[type=number]': { MozAppearance: 'textfield' },
              '& input': { textAlign: 'right', paddingRight: themeInner.spacing(1), paddingLeft: themeInner.spacing(0.5) },
            })}
            inputProps={{ min: 0, step: 1, max: 100 }}
          />
        </Box>
      </Popover>

      {/* ── Substat weights popover — two-column: controls (left) + candidate list (right) ── */}
      <Popover
        open={Boolean(weightsAnchorEl)}
        anchorEl={weightsAnchorEl}
        onClose={handleWeightsPopoverClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            // eslint-disable-next-line react-hooks/refs -- handleWeightsPopoverClose reads livePreviewTimerRef only when invoked as an event handler, never during this render-time spread call.
            ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard: weightsPopoverGuard,
              onRequestClose: handleWeightsPopoverClose,
              closeLabel: t('close'),
            }),
            // ref must be forwarded separately (React Compiler restriction on refs in render-time spreads).
            // Without this, isTargetInsideAnyMenu always returns false → every click closes the popover.
            // Cast required: useContextMenuPaperGuard types the ref as Element, but Paper is always a div.
            ref: weightsPopoverMenuRef as React.RefObject<HTMLDivElement | null>,
          },
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'flex-start' }}>
          {/* Left column: weight controls (unchanged layout) */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 220 }}>
            <MarkdownTooltip markdown={t('safeguardsSubstatWeightsLabelTooltip')} placement="top">
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.25, display: 'inline-block' }}>
                {t('safeguardsSubstatWeightsLabel')}
              </Typography>
            </MarkdownTooltip>
            {substatSelection.map((variant) => {
              // In multi-edit mode, read staged weight from draft; fall back to rule's weight.
              const stagedWeights = multiEditActive && multiSubstatWeightsField?.dirty
                ? (multiSubstatWeightsField.value as Partial<Record<StatVariant, number>> ?? {})
                : (rule?.substatWeights ?? {})
              // Flag when the weight for this substat differs across the selection (and not yet staged).
              const weightMixed = multiEditActive
                && multiSubstatWeightsField?.status === 'mixed'
                && !multiSubstatWeightsField.dirty
              const rawWeight = Number(stagedWeights[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
              const weight = normalizeGearInspectorSortWeight(rawWeight)
              return (
                <Box key={variant} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t(statVariantI18nKey(variant))}
                    {/* Mixed indicator shown when weights differ across the selection */}
                    {weightMixed && (
                      <Box component="span" sx={{ ml: 0.5, color: 'text.disabled', fontSize: '0.7em' }}>
                        ({t('builderMultiEditMixedShort')})
                      </Box>
                    )}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <GearInspectorSortWeightControls
                      label={t(statVariantI18nKey(variant))}
                      enabled={true}
                      weight={weight}
                      onBump={(deltaSteps) => {
                        if (multiEditActive && multiEdit) {
                          // Stage a full weight-map replacement with the new value for this variant.
                          const current = normalizeGearInspectorSortWeight(rawWeight)
                          const nextValue = normalizeGearInspectorSortWeight(current + (deltaSteps * GEAR_INSPECTOR_SORT_WEIGHT_STEP))
                          const nextWeights = { ...stagedWeights }
                          if (nextValue === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) {
                            delete nextWeights[variant]
                          } else {
                            nextWeights[variant] = nextValue
                          }
                          multiEdit.updateField('substatWeights', { value: nextWeights, status: 'common' })
                          // Trigger live preview with the new weights.
                          triggerLiveRescore(nextWeights, substatSelection)
                        } else {
                          let nextWeightsForPreview: Partial<Record<StatVariant, number>> = rule?.substatWeights ?? {}
                          updateRule((prev) => {
                            const rawWeights = prev.substatWeights ?? {}
                            const currentRaw = Number(rawWeights[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
                            const current = normalizeGearInspectorSortWeight(currentRaw)
                            const nextValue = normalizeGearInspectorSortWeight(current + (deltaSteps * GEAR_INSPECTOR_SORT_WEIGHT_STEP))
                            const nextWeights = { ...rawWeights }
                            if (nextValue === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) {
                              delete nextWeights[variant]
                            } else {
                              nextWeights[variant] = nextValue
                            }
                            nextWeightsForPreview = nextWeights
                            return { ...prev, substatWeights: nextWeights }
                          })
                          // Trigger live preview after the state update is queued.
                          triggerLiveRescore(nextWeightsForPreview, substatSelection)
                        }
                      }}
                      onReset={() => {
                        if (multiEditActive && multiEdit) {
                          const nextWeights = { ...stagedWeights }
                          delete nextWeights[variant]
                          multiEdit.updateField('substatWeights', { value: nextWeights, status: 'common' })
                          triggerLiveRescore(nextWeights, substatSelection)
                        } else {
                          let nextWeightsForPreview: Partial<Record<StatVariant, number>> = rule?.substatWeights ?? {}
                          updateRule((prev) => {
                            const rawWeights = prev.substatWeights ?? {}
                            if (!rawWeights[variant]) return prev
                            const nextWeights = { ...rawWeights }
                            delete nextWeights[variant]
                            nextWeightsForPreview = nextWeights
                            return { ...prev, substatWeights: nextWeights }
                          })
                          triggerLiveRescore(nextWeightsForPreview, substatSelection)
                        }
                      }}
                    />
                  </Box>
                </Box>
              )
            })}
          </Box>
          {/* Right column: candidate rank list — width computed from measured cell widths so it
              fits the list content without wasted space or clipping. */}
          <Box sx={{ width: rightColumnWidthPx, flexShrink: 0, borderLeft: 1, borderColor: 'divider', pl: 1.5 }}>
            <MarkdownTooltip markdown={t('safeguardsCandidatesLabelTooltip')} placement="top">
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'inline-block' }}>
                {t('safeguardsCandidatesLabel')}
              </Typography>
            </MarkdownTooltip>
            <SafeguardCandidateRankList
              candidates={popoverCandidates}
              quota={rule?.requiredCount ?? 1}
              countMode={rule?.countMode}
              artifactsByItemKey={artifactsByItemKey}
              substats={substatSelection}
              weights={rule?.substatWeights ?? {}}
              noMatchesYet={detectionEntry !== null && detectionEntry !== undefined && (detectionEntry.candidates?.length ?? 0) === 0}
              showSlotIcons={showSlotIcons}
              showSetIcons={showSetIcons}
              showFactionIcons={showFactionIcons}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonColors}
              previewRowByItemKey={previewRowByItemKey ?? null}
              {...(rule?.name ? { ruleName: rule.name } : {})}
              {...(visibleItemKeys != null ? { visibleItemKeys } : {})}
              {...(onSelectCandidate ? { onSelectCandidate } : {})}
            />
          </Box>
        </Box>
      </Popover>

    </Box>
  )
}
