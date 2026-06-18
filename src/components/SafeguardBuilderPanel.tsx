/**
 * SafeguardBuilderPanel
 *
 * Inline editor for a single SafeguardRule. Controls mirror BuilderPanel styling and layout:
 * - Row 1: Mode toggle + Required count
 * - Row 2: [Rank | Rarity | Faction Select (nested 3-col)] | [hidden level-window spacer col 3]
 * - Row 3: [Main stat toggles + perMainStat chip] | [Substats toggles + match chips + improvement-chance threshold chip + weights]
 * - Row 4: [Slots icon grid + perSlot chip] | [Sets selector + perSet chip]
 *
 * When no rule is selected the form renders disabled so the panel height remains stable.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Collapse,
  Divider,
  FormControl,
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
  SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SAFEGUARD_SUBSTAT_MIN_COUNTS,
  SAFEGUARD_IMPROVEMENT_CHANCE_DEFAULT_THRESHOLD,
  IMPROVEMENT_CHANCE_PRESETS,
  IMPROVEMENT_CHANCE_LAST_USED_KEY,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  constrainSafeguardSubstats,
  normalizeSafeguardSubstatMatch,
  normalizeSafeguardRule,
  normalizeSafeguardSubstatDependents,
  pruneSafeguardsSubstatWeights,
  sanitizeSafeguardCountMode,
  safeguardRedundantCountModeDimensions,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  detectImprovementChancePresetId,
  resolveImprovementChanceThresholds,
  type SafeguardCandidateOut,
  type SafeguardDetectionEntry,
  type SafeguardImprovementChanceLevelThresholds,
  type SafeguardRule,
} from '../lib/safeguards'
import type { ColorBlindMode } from '../lib/constants'
import {
  SAFEGUARD_BUILDER_USER_DEFAULTS_KEY,
} from '../lib/constants'
import { APP_CSS_VAR, resolveSchemePalette, schemeModeFromColorScheme } from '../lib/themeCustomTokens'
import {
  LEVEL_MILESTONES,
  STAT_VARIANTS_PRIORITY_ROW1,
  STAT_VARIANTS_PRIORITY_ROW2,
  statVariantI18nKey,
  type StatVariant,
  type FactionId,
  factionI18nKey,
} from '../lib/types'
import {
  BUILDER_LABEL_TEXT_SX,
  BUILDER_STATUS_CHIP_HEIGHT_PX,
  BUILDER_TOGGLE_BUTTON_HEIGHT_PX,
  CLEAR_ICON_BUTTON_SIZE_PX,
  COMPACT_HEADER_ACTION_BUTTON_SX,
  ELLIPSIS_TEXT_SX,
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
// SSOT request shape for live-preview scoring — keeps the prop signature in
// lockstep with the worker request type (countMode, requiredCount, …).
import type { ScoreCandidatesParams } from '../hooks/useRuleCacheWorker'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useBuilderPanelActionMenus } from './builderPanel/useBuilderPanelActionMenus'
import { useBuilderHistoryMenu } from './builderPanel/useBuilderHistoryMenu'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import { HistoryContextMenu } from './HistoryContextMenu'
import { BuilderTooltipContent } from './BuilderTooltipContent'
import type { HistoryPreview, HistoryTimelineEntry } from '../hooks/useSfcHistory'
import { useBuilderSafeguardCollapsedPreference } from '../state/builderPreferences'
import { useBuilderPanelPrefs } from './builderPanel/useBuilderPanelPrefs'
import BuilderSectionHeader from './BuilderSectionToggle'
import { summaryParts } from './RecipeChip'
import { useDisplayPreferences } from '../state/preferencesState'
import { useSlotMetrics } from '../hooks/useSlotMetrics'
import { isAccessorySlot, slotSelectionAllowsAccessories, ACCESSORY_SLOT_IDS } from '../lib/gearInspectorDomain'
import { useI18n } from '../lib/i18n'
import { GearFactionSelect, GearRankSelect, GearRaritySelect, GearSetsSelect } from './gear'
import { NumberSpinnerAdornment, HIDE_NATIVE_NUMBER_SPINNER_SX } from './NumberSpinnerAdornment'
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
import { normalizeArtifactSetSelections, splitArtifactSetSelections, pruneImplicitAnyExclusions } from '../lib/gearSets/selection'
import { resolveAllowedSubstatsForSlotsAndMains } from '../lib/statCompatibility'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT, GEAR_INSPECTOR_SORT_WEIGHT_STEP } from '../lib/gearInspectorSort'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { artifactTypeIconList } from './artifactTypeIcons'
import ClearIconButton from './ClearIconButton'
import { ColorField } from './ColorField'
import SafeguardCandidateRankList from './SafeguardCandidateRankList'
import { SUBSTAT_SLOT_COUNT } from '../lib/generated/domainConstants'
import { mainStatToggleGroupSx, substatToggleGroupSx } from './SubstatToggleDisplay'
import { useTheme, useColorScheme } from '@mui/material/styles'
import type { Metaset } from '../lib/metasets'
import type { SafeguardMultiEditDraftHandle } from '../lib/safeguardMultiEditDraft'
import {
  getDirtySafeguardFieldKeys,
  applyMultiEditFieldsToSafeguardRule,
} from '../lib/safeguardMultiEditDraft'
import {
  deriveBaseTriState,
  applyArrayPatchCount,
  computeSlotPatchToggle,
  computeMainStatPatchToggle,
  computeSubstatPatchToggle,
  computeStringPatchToggle,
  computeArtifactSetPatchToggle,
  computeArtifactSetExclusionToggle,
  resolveSetTriState,
  resolveSetExclusionTriState,
  resolveMetasetTriState,
  resolveExcludedSetUnion,
  applyArtifactSetPatchPreview,
  applyStringPatchPreview,
  toTriStateBase,
  type TriStateBase,
  type SetTriState,
} from './builderPanel/safeguardMultiEditHelpers'
import type { MultiEditArrayPatch } from '../lib/recipeMultiEditDraft'
import type { ArtifactSetSelectionEntry } from '../lib/gearSets/selection'
import { useSafeguardMultiEditSummary } from './builderPanel/useSafeguardMultiEditSummary'
import { resolveSafeguardActivationTextColor } from './safeguardSummaryParts'
import { normalizeTagValue, mergeTagList, summarizeTagPresence } from '../lib/tagHelpers'
import { BuilderTagChipStrip, BuilderTagChipList } from './BuilderTagChips'
import { useShowTagsChipsPreference } from '../state/builderPreferences'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { buildWarningBadgeBase } from '../lib/badgeStyles'
import {
  resolveEffectiveSafeguardRule,
  type SafeguardOverridesInstruction,
} from '../lib/noteSafeguardOverrides'
import ClearTagsConfirmDialog from './dialogs/ClearTagsConfirmDialog'
import { MenuToggleRow } from './MenuToggleRow'
import { TINT } from '../lib/colorTints'

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

// Strips leading "#" heading markers from separator names for display (color directives no longer live in the name).
function parseSeparatorLabel(rawName: string | undefined): string {
  return (rawName ?? '').replace(/^#+\s*/, '').trim()
}

// ── component ────────────────────────────────────────────────────────────────

export type SafeguardBuilderPanelProps = {
  rule: SafeguardRule
  onChange: (next: SafeguardRule | ((prev: SafeguardRule) => SafeguardRule)) => void
  editingRuleIdx: number | null
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
  // Override instructions from the current note's safeguard-overrides block.
  // Used to compare stored vs effective field values and show warning badges on overridden controls.
  safeguardOverridesInstructions?: readonly SafeguardOverridesInstruction[] | null
  // Off-main-thread candidate scoring for the live-preview weights popover.
  // Routed through the shared rule-cache worker so the rule-engine WASM is inlined
  // into the bundle only once per worker instead of once per consumer.
  // Uses ScoreCandidatesParams (SSOT) so countMode and other live-preview fields
  // can be threaded without redeclaring the request shape in two places.
  scoreCandidates: (params: ScoreCandidatesParams) => Promise<SafeguardCandidateOut[]>
}

export default function SafeguardBuilderPanel({
  rule,
  onChange,
  editingRuleIdx,
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
  safeguardOverridesInstructions,
  scoreCandidates,
}: SafeguardBuilderPanelProps) {
  const { t, lang } = useI18n()
  // ── multi-edit mode derived state ─────────────────────────────────────────
  const multiEditSelectionCount = multiEdit?.state.selection.length ?? 0
  // Multi-edit is active when 2+ rules are selected together.
  const multiEditActive = multiEditSelectionCount >= 2
  const multiFields = multiEdit?.state.fields ?? null
  // Per-field state shortcuts — null when single-edit mode.
  const multiNameField = multiFields?.appearanceName ?? null
  const multiFgColorField = multiFields?.appearanceFgColor ?? null
  const multiActivationField = multiFields?.activation ?? null
  // True when the selected rules have different activation modes and no staged change yet.
  const activationMixed = multiEditActive && multiActivationField?.status === 'mixed' && !multiActivationField.dirty
  const multiRequiredCountField = multiFields?.requiredCount ?? null
  const multiIgnorePreviousField = multiFields?.ignorePreviousSafeguards ?? null
  const multiIgnoreCollectionField = multiFields?.ignoreEquippedInCollection ?? null
  const multiIgnoreVaultField = multiFields?.ignoreEquippedInVault ?? null
  const multiSlotsField = multiFields?.slots ?? null
  // Sets field shortcut + staged patch — drives the tri-state right-click "NOT".
  const multiSetsField = multiFields?.sets ?? null
  const setsPatch = (multiSetsField?.patch as MultiEditArrayPatch<ArtifactSetSelectionEntry> | null | undefined) ?? null
  // Metaset-names field shortcut + staged patch — drives metaset tri-state display.
  const multiMetaSetNamesField = multiFields?.metaSetNames ?? null
  const metaSetNamesPatch = (multiMetaSetNamesField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
  // Faction edits flow through the multi-edit draft so Apply activates on toggle
  // and the staged selection lands on every selected rule. Rank/rarity remain
  // summary-driven (mixed badge only) until they get the same treatment.
  const multiFactionsField = multiFields?.factions ?? null
  const multiMainStatsField = multiFields?.mainStats ?? null
  const multiSubstatsField = multiFields?.substats ?? null
  const multiSubstatMatchField = multiFields?.substatMatch ?? null
  const multiSubstatWeightsField = multiFields?.substatWeights ?? null
  const multiImprovementChanceField = multiFields?.improvementChanceThreshold ?? null
  // Tags field shortcut — used for the tags popover and multi-edit tag patches.
  const multiTagsField = multiFields?.tags ?? null
  // True when at least one field has a staged (unsaved) change.
  const multiDraftDirty = multiEditActive && multiFields
    ? Object.values(multiFields).some((field) => field?.dirty)
    : false
  // Dirty field keys used to limit the projection to only changed fields.
  const multiDirtyKeys = useMemo(() => (
    multiEditActive && multiFields ? getDirtySafeguardFieldKeys(multiFields) : []
  ), [multiEditActive, multiFields])
  // Rules with staged patches applied — drives tag display so chips reflect pending changes.
  const multiProjectedRules = useMemo<readonly SafeguardRule[] | null>(() => {
    if (!multiEditActive || !multiSelectedRules || !multiFields) return null
    if (multiDirtyKeys.length === 0) return multiSelectedRules
    let changed = false
    const projected = multiSelectedRules.map((source) => {
      const next = applyMultiEditFieldsToSafeguardRule(source, multiFields, multiDirtyKeys)
      if (next !== source) changed = true
      return next
    })
    return changed ? projected : multiSelectedRules
  }, [multiDirtyKeys, multiEditActive, multiFields, multiSelectedRules])
  // Per-element count aggregates for tri-state toggle derivation.
  const multiSummary = useSafeguardMultiEditSummary(multiEditActive, multiSelectedRules ?? null)
  // Rank is mixed when any rank value appears in some but not all selected rules.
  const rankMixed = multiEditActive && multiSummary !== null
    && Array.from(multiSummary.rankCounts.values()).some(c => c > 0 && c < multiSummary.total)
  // Rarity is mixed by the same logic applied to rarity counts.
  const rarityMixed = multiEditActive && multiSummary !== null
    && Array.from(multiSummary.rarityCounts.values()).some(c => c > 0 && c < multiSummary.total)
  // Factions are mixed by the same rule; a staged (dirty) edit overrides the mixed
  // badge so the user sees the value they're about to apply, not the prior state.
  const factionMixed = multiEditActive && multiSummary !== null
    && !multiFactionsField?.dirty
    && Array.from(multiSummary.factionCounts.values()).some(c => c > 0 && c < multiSummary.total)
  const theme = useTheme()
  // Runtime scheme palette for contrast math — theme.palette.* is frozen to light with cssVariables.
  const { colorScheme } = useColorScheme()
  const schemePalette = resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme))
  const builderStatusChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  // Mixed-state colors — use theme.custom tokens (CSS variable-backed, no alpha() needed).
  const mixedBorderColor = theme.custom.multiEditMixedBorder
  const mixedPatternColor = theme.custom.multiEditMixedBg
  const mixedTextColor = theme.custom.multiEditMixedText
  const mixedToggleOverrides = useMemo(
    () => MIXED_TOGGLE_GROUP_OVERRIDES(mixedBorderColor, mixedTextColor, mixedPatternColor),
    [mixedBorderColor, mixedTextColor, mixedPatternColor],
  )
  const { showFactionIcons, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const { resolveAllowedSetPool, sanitizeCombinationForSlots } = useKeepOverrideCombinationTools(metasets)

  // ── auto-apply / auto-reset preferences (via shared hook) ───────────────
  const {
    autoApply: autoApplySelectedRecipe,
    autoReset: autoResetAfterInsert,
    setAutoApplyExclusive,
    setAutoResetExclusive,
  } = useBuilderPanelPrefs()

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
    historyHintTriggerProps,
    handleHistoryMenuContextMenu,
    handleRequestClearHistory,
    handleHistoryEntrySelect,
    historyHintOverlay,
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
          // Merge user defaults over factory values; no id field exists on SafeguardRule.
          effectiveDefaults = { ...factory, ...normalized }
        }
      }
    } catch {}
    // Compare via SSOT snapshot so key order matches createFactorySafeguardBuilderDefaults.
    return JSON.stringify(createSafeguardRuleContentSnapshot(rule)) === JSON.stringify(effectiveDefaults)
  }, [rule, defaultsEpoch])

  const [builderCollapsed, setBuilderCollapsed] = useBuilderSafeguardCollapsedPreference()

  // Apply is only meaningful when a rule is selected AND the builder state differs from it.
  const applyDisabled = editingRuleIdx === null || !selectedIsDirty

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
      if (editingRuleIdx === null) return false
      onApplySafeguard()
      return true
    })
    return () => { registerAutoApplyHandler(null) }
  }, [registerAutoApplyHandler, autoApplySelectedRecipe, editingRuleIdx, onApplySafeguard])

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
  // Monotonic id used to discard stale scoreCandidates responses when newer requests
  // supersede them. Scoring runs in the shared rule-cache worker (see scoreCandidates
  // prop) so this panel no longer owns a dedicated worker instance.
  const scoringRequestIdRef = useRef(0)
  const [improvementChanceAnchorEl, setImprovementChanceAnchorEl] = useState<HTMLElement | null>(null)
  // Frozen position captured at open time — prevents the popover from drifting when the
  // chip label resizes (which moves the anchor button) while the user edits values.
  const [improvementChanceAnchorPos, setImprovementChanceAnchorPos] = useState<{ top: number; left: number } | null>(null)
  // Ref tracks the latest threshold so the close callback can persist it without stale closure.
  const improvementChanceThresholdRef = useRef<SafeguardImprovementChanceLevelThresholds | null>(null)
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
        const displayName = isSep ? '' : (recipe.appearance?.name ?? '').trim()
        const nameColor = isSep ? undefined : recipe.appearance?.fgColor
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

  const commitFgColor = useCallback((color: string | undefined) => {
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('appearanceFgColor', { value: color, status: 'common' })
    } else {
      updateRule((prev) => {
        const currentName = prev.appearance?.name ?? ''
        const nextAppearance = (currentName || color)
          ? { name: currentName, ...(color ? { fgColor: color } : {}) }
          : undefined
        const base = { ...prev }
        if (nextAppearance) return { ...base, appearance: nextAppearance }
        delete (base as { appearance?: typeof prev.appearance }).appearance
        return base
      })
    }
  }, [multiEditActive, multiEdit, updateRule])

  // Resolve effective rule up front — used both for override badge tooltips and for displaying
  // effective values in controls when a safeguard-overrides block is active (consistent with the
  // recipe builder). In multi-edit mode the instructions are ignored (overrides apply per-rule,
  // not per-selection), so instructions default to an empty array.
  const effectiveRule = useMemo(
    () => resolveEffectiveSafeguardRule(rule, !multiEditActive ? (safeguardOverridesInstructions ?? []) : []),
    [rule, multiEditActive, safeguardOverridesInstructions],
  )

  const combination = rule.combination
  // Which per-X scope chips are no-ops given the current combination filters.
  const redundantDimensions = safeguardRedundantCountModeDimensions(combination)
  const activation = rule.activation
  // Display activation: read from effectiveRule; in multi-edit mode effectiveRule equals the
  // stored rule (empty instructions path above), so the guard lives in one place only.
  const displayActivation = effectiveRule.activation
  // Mode label color: SSOT via resolveSafeguardActivationTextColor; only shown when collapsed.
  // Uses displayActivation so the collapsed color reflects the override when one is active, and
  // contrast-adapts Protect/Anticipate against the builder paper surface (parallel to the chip).
  const modeLabelColor = builderCollapsed.action
    ? resolveSafeguardActivationTextColor(displayActivation, schemePalette, schemePalette.background.paper)
    : undefined

  const slotSelection = combination.slots
  // Section dirty flag: shared by the label color and the X-clear button (SSOT).
  const slotSectionDirty = slotSelection.length > 0
  const hasAccessorySlot = slotSelectionAllowsAccessories(slotSelection)
  const allowedSetPool = resolveAllowedSetPool(slotSelection)
  const setSelection = normalizeArtifactSetSelections(combination.sets)
    .filter((entry) => allowedSetPool.includes(Number(entry.id)))
  const setsSectionDirty = setSelection.length > 0 || (combination.metaSetNames ?? []).length > 0
  const rankSelection = combination.ranks
  const rankSectionDirty = rankSelection.length > 0
  // Display values read from effectiveRule so the select reflects active overrides,
  // mirroring the displayActivation pattern.  Dirty flags stay on stored values.
  const displayRanks = effectiveRule.combination.ranks
  const raritySelection = combination.rarities
  const raritySectionDirty = raritySelection.length > 0
  const displayRarities = effectiveRule.combination.rarities
  // In multi-edit mode, expand the slot/mainstat inputs to the union across all selected rules
  // so the exclusion mask reflects what any selected safeguard allows, not just the focused one.
  const effectiveSlotsForMask = multiEditActive && multiSummary
    ? Array.from(multiSummary.slotCounts.keys())
    : slotSelection
  const mainStatOptions = getMainStatOptionsForSlots(effectiveSlotsForMask)
  const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((v) => mainStatOptions.includes(v)))
  const mainStatSectionDirty = mainStatSelection.length > 0
  const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []
  const displayFactions  = hasAccessorySlot ? dedupeNumericArray(effectiveRule.combination.factions ?? []) : []
  // In multi-edit, disable armor only when EVERY selected rule has faction set.
  // If any rule uses faction=Any the interaction is mixed — keep armor enabled.
  const factionSectionDirty = multiEditActive && multiSummary != null
    ? multiSummary.rulesWithFactionCount === multiSummary.total && multiSummary.total > 0
    : factionSelection.length > 0
  const effectiveMainStatsForMask = multiEditActive && multiSummary
    ? Array.from(multiSummary.mainStatCounts.keys())
    : mainStatSelection

  const allowedSubstatOptions = resolveAllowedSubstatsForSlotsAndMains({
    slots: effectiveSlotsForMask,
    mainStats: effectiveMainStatsForMask,
  })
  // Use effectiveRule for all display-facing derived values — effectiveRule already equals the
  // stored rule in multi-edit mode (empty instructions), so no per-variable guard is needed.
  const substatSelection = sortSafeguardSubstats(
    (effectiveRule.substats ?? []).filter((v) => allowedSubstatOptions.includes(v))
  )
  const hasSubstatSelection = substatSelection.length > 0
  const effectiveSubstatMatch = hasSubstatSelection
    ? normalizeSafeguardSubstatMatch(effectiveRule.substatMatch)
    : SafeguardSubstatMatch.Min1
  // Display count mode: derived from effectiveRule so scope chips reflect active overrides.
  const displayCountMode = sanitizeSafeguardCountMode(effectiveRule.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
  const effectiveCountMode = hasAccessorySlot
    ? displayCountMode
    : sanitizeSafeguardCountMode({ ...displayCountMode, perFaction: false })
  const scopeActive = resolveKeepOverrideScopeActive(effectiveCountMode)

  const ignorePreviousSafeguards = rule?.ignorePreviousSafeguards !== false
  const ignoreEquippedInCollection = rule?.ignoreEquippedInCollection === true
  const ignoreEquippedInVault = rule?.ignoreEquippedInVault === true
  // improvementChanceThreshold: null means disabled; an object means active with per-level gates.
  const improvementChanceThreshold = rule?.improvementChanceThreshold ?? null
  const improvementChanceEnabled = improvementChanceThreshold !== null

  // ── multi-edit derived display values for substat/improvement-chance chips ────
  // Staged substat match value: prefer staged if active, else live effective value.
  const displaySubstatMatch = multiEditActive
    ? (multiSubstatMatchField?.value as SafeguardSubstatMatch ?? effectiveSubstatMatch)
    : effectiveSubstatMatch
  // Mixed indicator: true when selection has differing values not yet staged.
  const substatMatchMixed = multiEditActive && multiSubstatMatchField?.status === 'mixed' && !multiSubstatMatchField.dirty
  // Improvement-chance display and mixed state for multi-edit.
  // Single-edit: use effectiveRule so the chip reflects the active override (effectiveRule equals
  // the stored rule in multi-edit mode via empty instructions — guard lives in one place only).
  const displayImprovementChanceThreshold: SafeguardImprovementChanceLevelThresholds | null = multiEditActive
    ? (multiImprovementChanceField?.value !== undefined && multiImprovementChanceField.value !== null
      ? (multiImprovementChanceField.value as SafeguardImprovementChanceLevelThresholds)
      : improvementChanceThreshold)
    : effectiveRule.improvementChanceThreshold
  const improvementChanceMixed = multiEditActive && multiImprovementChanceField?.status === 'mixed' && !multiImprovementChanceField.dirty
  // In multi-edit, enabled = staged value is non-null (dirty) or any rule has it on (not yet staged).
  // Use the raw staged field value when dirty — displayImprovementChanceThreshold falls back to the
  // focused rule's threshold when the staged value is null, which would falsely report "enabled".
  const displayImprovementChanceEnabled = multiEditActive
    ? (multiImprovementChanceField?.dirty ? multiImprovementChanceField.value !== null : improvementChanceEnabled)
    : (effectiveRule.improvementChanceThreshold !== null)

  // Keep the threshold ref current so handleImprovementChancePopoverClose persists
  // the latest value without a stale closure over displayImprovementChanceThreshold.
  useEffect(() => { improvementChanceThresholdRef.current = displayImprovementChanceThreshold })

  // ── improvement-chance helpers ────────────────────────────────────────────────

  // Build the enable-default when the user first enables the threshold. Restores the
  // last-used config from localStorage, or falls back to Lenient (all-25%) preset.
  const getImprovementChanceEnableDefault = (): SafeguardImprovementChanceLevelThresholds => {
    try {
      const raw = localStorage.getItem(IMPROVEMENT_CHANCE_LAST_USED_KEY)
      if (raw) return JSON.parse(raw) as SafeguardImprovementChanceLevelThresholds
    } catch { /* ignore corrupt storage */ }
    return IMPROVEMENT_CHANCE_PRESETS[0]!.thresholds // Lenient
  }

  // Summarise threshold as a chip label. Matches preset name (via resolved values),
  // or "≥N%" when all stages equal, or "N–M%" range when mixed.
  const formatThresholdChipLabel = (thr: SafeguardImprovementChanceLevelThresholds): string => {
    const presetId = detectImprovementChancePresetId(thr)
    if (presetId) {
      // Uniform presets (all stages equal after resolution): show "≥N%" for compactness.
      // Non-uniform presets (graduated, soft, …): show the preset's localized name.
      const preset = IMPROVEMENT_CHANCE_PRESETS.find((p) => p.id === presetId)!
      const [l0, l4, l8, l12] = resolveImprovementChanceThresholds(preset.thresholds)
      if (l0 === l4 && l4 === l8 && l8 === l12) return t('safeguardsImprovementChanceWithValue', { value: l0 })
      return t(`safeguardsImprovementChancePreset${presetId.charAt(0).toUpperCase()}${presetId.slice(1)}` as Parameters<typeof t>[0])
    }
    const [l0, l4, l8, l12] = resolveImprovementChanceThresholds(thr)
    const allSame = l0 === l4 && l4 === l8 && l8 === l12
    if (allSame) return t('safeguardsImprovementChanceWithValue', { value: l0 })
    const minVal = Math.min(l0, l4, l8, l12)
    const maxVal = Math.max(l0, l4, l8, l12)
    return `${minVal}–${maxVal}%`
  }

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

  // Override-active flags — each is true when the overrides DSL changes this field for the current rule.
  // All flags are suppressed in multi-edit mode since overrides apply per-rule, not per-selection.
  const activationOverrideActive = !multiEditActive && effectiveRule.activation !== rule.activation
  const requiredCountOverrideActive = !multiEditActive
    && (effectiveRule.requiredCount ?? 1) !== (rule.requiredCount ?? 1)
  const ignPrevOverrideActive = !multiEditActive
    && !!effectiveRule.ignorePreviousSafeguards !== !!rule.ignorePreviousSafeguards
  const ignCollOverrideActive = !multiEditActive
    && !!effectiveRule.ignoreEquippedInCollection !== !!rule.ignoreEquippedInCollection
  const ignVaultOverrideActive = !multiEditActive
    && !!effectiveRule.ignoreEquippedInVault !== !!rule.ignoreEquippedInVault
  const perFactionOverrideActive = !multiEditActive
    && !!effectiveRule.countMode?.perFaction !== !!rule.countMode?.perFaction
  const perMainStatOverrideActive = !multiEditActive
    && !!effectiveRule.countMode?.perMainStat !== !!rule.countMode?.perMainStat
  const perSlotOverrideActive = !multiEditActive
    && !!effectiveRule.countMode?.perSlot !== !!rule.countMode?.perSlot
  const perSetOverrideActive = !multiEditActive
    && !!effectiveRule.countMode?.perSet !== !!rule.countMode?.perSet
  const substatsOverrideActive = !multiEditActive
    && JSON.stringify([...(effectiveRule.substats ?? [])].sort())
       !== JSON.stringify([...(rule.substats ?? [])].sort())
  const substatMatchOverrideActive = !multiEditActive && effectiveRule.substatMatch !== rule.substatMatch
  const substatWeightsOverrideActive = !multiEditActive && (() => {
    // Compare each substat's weight treating absent entries as the default (1×).
    // Object.keys returns strings, so convert to the numeric StatVariant before indexing.
    const stored = rule.substatWeights ?? {}
    const eff = effectiveRule.substatWeights ?? {}
    const allStats = new Set([...Object.keys(stored), ...Object.keys(eff)])
    return [...allStats].some((k) => {
      const stat = Number(k) as StatVariant
      return (stored[stat] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
        !== (eff[stat] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
    })
  })()
  const improvementChanceOverrideActive = !multiEditActive && (() => {
    // Improvement chance only matters when the effective rule has substats.
    // If there are none, the threshold has no effect regardless of its value.
    if (!hasSubstatSelection) return false
    const stored = rule.improvementChanceThreshold
    const eff = effectiveRule.improvementChanceThreshold
    if (stored === eff) return false                     // same reference — no override applied
    if (stored === null || eff === null) return true     // enabled ↔ disabled
    // Compare resolved values so that null-inheriting stages are treated as equivalent to
    // explicit copies of the previous stage's value:
    //   { atLevel0: 25, atLevel4: null } resolves the same as { atLevel0: 25, atLevel4: 25 }.
    const [s0, s4, s8, s12] = resolveImprovementChanceThresholds(stored)
    const [e0, e4, e8, e12] = resolveImprovementChanceThresholds(eff)
    return s0 !== e0 || s4 !== e4 || s8 !== e8 || s12 !== e12
  })()

  // Combination filter override-active flags — compare sorted numeric arrays.
  const _sortedNums = (arr: readonly number[]) => [...arr].sort((a, b) => a - b)
  const rankOverrideActive    = !multiEditActive
    && JSON.stringify(_sortedNums(effectiveRule.combination.ranks ?? []))
       !== JSON.stringify(_sortedNums(rule.combination.ranks ?? []))
  const rarityOverrideActive  = !multiEditActive
    && JSON.stringify(_sortedNums(effectiveRule.combination.rarities ?? []))
       !== JSON.stringify(_sortedNums(rule.combination.rarities ?? []))
  const factionOverrideActive = !multiEditActive
    && JSON.stringify(_sortedNums(effectiveRule.combination.factions ?? []))
       !== JSON.stringify(_sortedNums(rule.combination.factions ?? []))

  // Maps SafeguardRuleActivation to the short display label used in override badge tooltips.
  const activationLabel = React.useCallback((a: SafeguardRuleActivation): string => {
    if (a === SafeguardRuleActivation.Off) return t('safeguardsRuleModeOffShort')
    if (a === SafeguardRuleActivation.ProtectExisting) return t('safeguardsRuleModeProtectShort')
    return t('safeguardsRuleModeAnticipateShort')
  }, [t])

  // Maps SafeguardSubstatMatch to a short label for override badge tooltips.
  const substatMatchLabel = React.useCallback((m: SafeguardSubstatMatch | undefined): string => {
    const normalized = normalizeSafeguardSubstatMatch(m)
    if (normalized === SafeguardSubstatMatch.PerSubstat) return t('safeguardsSubstatRequirementPer')
    return `\u2265${normalized}`
  }, [t])

  // Formats a substat array as a comma-separated stat-name list for badge tooltips.
  const substatsLabel = React.useCallback((stats: readonly StatVariant[]): string => {
    if (stats.length === 0) return '\u2014'
    return stats.map((s) => t(statVariantI18nKey(s))).join(', ')
  }, [t])

  // Formats non-default substat weights as "STAT ×N, …" for badge tooltips.
  // Only lists stats whose weight deviates from the default (1×); returns "—" when all are default.
  const weightsLabel = React.useCallback((
    weights: Partial<Record<StatVariant, number>> | undefined,
    substats: readonly StatVariant[],
  ): string => {
    const parts = substats
      .filter((s) => (weights?.[s] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) !== GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
      .map((s) => `${t(statVariantI18nKey(s))} \u00d7${weights?.[s] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT}`)
    return parts.length > 0 ? parts.join(', ') : '\u2014'
  }, [t])

  // Formats an improvement-chance threshold for override badge tooltips.
  // Disabled (null) renders as an em dash; active thresholds reuse formatThresholdChipLabel.
  // Plain function (not memoized) because formatThresholdChipLabel is also not memoized —
  // wrapping in useCallback with an unstable dep would provide no benefit.
  const improvementChanceLabel = (thr: SafeguardImprovementChanceLevelThresholds | null): string =>
    thr === null ? '\u2014' : formatThresholdChipLabel(thr)

  // Label formatters for rank/rarity/faction combination filter override badge tooltips.
  // Reuse the same i18n keys as GearRankSelect / GearRaritySelect / GearFactionSelect (SSOT).
  const RANK_I18N = ['star1', 'star2', 'star3', 'star4', 'star5', 'star6'] as const
  const RARITY_I18N = ['rarityCommon', 'rarityUncommon', 'rarityRare', 'rarityEpic', 'rarityLegendary', 'rarityMythical'] as const
  const formatRankList = (ranks: readonly number[]) =>
    ranks.length === 0 ? t('any') : ranks.map((r) => t(RANK_I18N[r - 1] ?? 'star1')).join(', ')
  const formatRarityList = (rarities: readonly number[]) =>
    rarities.length === 0 ? t('any') : rarities.map((r) => t(RARITY_I18N[r - 1] ?? 'rarityCommon')).join(', ')
  const formatFactionList = (factions: readonly FactionId[]) =>
    factions.length === 0 ? t('any') : factions.map((f) => t(factionI18nKey(f))).join(', ')

  // Builds the tooltip string for a safeguard override badge from stored/effective display strings.
  const buildSafeguardOverrideBadgeTooltip = React.useCallback(
    (stored: string, effective: string): string =>
      t('builderSafeguardOverridesOverrideBadgeTooltip', { stored, effective }),
    [t],
  )

  // Renders a warning "!" badge absolutely positioned inside its relative-positioned parent.
  // zIndex: 2 ensures the badge paints above sibling stacking contexts (e.g. MUI TextField).
  const renderSafeguardOverrideBadge = React.useCallback((tooltip: string) => (
    <MarkdownTooltip markdown={tooltip}>
      <Box
        component="span"
        sx={(theme) => ({
          // Centre the badge on the chip's top edge: top:0 + translateY(-50%) puts the
          // badge's geometric centre exactly at y=0, so the badge straddles the chip's
          // top (half above, half inside) — the standard Material badge-on-element look.
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          ...buildWarningBadgeBase(theme),
        })}
      >
        !
      </Box>
    </MarkdownTooltip>
  ), [])

  const renderScopeChip = (
    scope: KeepOverrideScopeKey,
    label: string,
    active: boolean,
    disabledOverride = false,
    mixed = false,
    overrideBadge?: React.ReactNode,
  ) => (
    // key on the outer span so React can reconcile multiple scope chips correctly.
    // MarkdownTooltip wraps only the chip, not the badge — hovering the badge must not
    // simultaneously trigger the chip's explanation tooltip.
    <span key={scope} style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
      <MarkdownTooltip markdown={safeguardScopeChipTooltips[scope]}>
        <KeepOverrideScopeChip
          scope={scope}
          label={label}
          active={active}
          mixed={mixed}
          disabled={disabledOverride}
          onToggle={handleScopeChipToggle}
        />
      </MarkdownTooltip>
      {overrideBadge}
    </span>
  )

  const setRuleCombination = (updater: (combination: SafeguardRule['combination']) => SafeguardRule['combination']) => {
    updateRule((prev) => {
      const nextCombination = sortSafeguardCombination(updater(prev.combination))
      return { ...prev, combination: nextCombination }
    })
  }

  // Multi-edit tri-state for an included set across the selection — mirrors the
  // recipe builder's getSetState so the menu shows the blue ring / mixed styling.
  // All three resolvers delegate to the shared SSOT tri-state helpers; only the
  // data sources (summary maps, staged patch, single-edit fallback) are panel-local.
  const triActive = multiEditActive && !!multiSummary
  const getSetState = useCallback((id: number): SetTriState => resolveSetTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.setCounts.get(id) ?? 0,
    patch: setsPatch,
    setId: id,
    singleEditIncluded: splitArtifactSetSelections(combination.sets).included.includes(id),
  }), [triActive, multiSummary, combination.sets, setsPatch])

  const getMetasetState = useCallback((name: string): SetTriState => resolveMetasetTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.metaSetIdCounts.get(name) ?? 0,
    patch: metaSetNamesPatch,
    name,
    singleEditSelected: (combination.metaSetNames ?? []).includes(name),
  }), [triActive, multiSummary, combination.metaSetNames, metaSetNamesPatch])

  const getSetExclusionState = useCallback((id: number): SetTriState => resolveSetExclusionTriState({
    active: triActive,
    total: multiSummary?.total ?? 0,
    baseCount: multiSummary?.excludedCounts.get(id) ?? 0,
    patch: setsPatch,
    setId: id,
    singleEditExcluded: splitArtifactSetSelections(combination.sets).excluded.includes(id),
  }), [triActive, multiSummary, combination.sets, setsPatch])

  // Excluded-set union across the selection for the menu's red NOT ring + label.
  const excludedSetUnion = useMemo(() => (
    triActive
      ? resolveExcludedSetUnion({ total: multiSummary!.total, excludedCounts: multiSummary!.excludedCounts, patch: setsPatch })
      : splitArtifactSetSelections(combination.sets).excluded
  ), [triActive, multiSummary, combination.sets, setsPatch])

  // Metaset include toggle — mirrors the recipe panel's toggleMetaset so multi-edit
  // stages a per-rule tri-state string patch instead of replacing every rule.
  const toggleMetaset = (name: string) => {
    if (multiEditActive && multiEdit) {
      const state = getMetasetState(name)
      const baseState = toTriStateBase(state)
      const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
      const nextPatch = computeStringPatchToggle(metaSetNamesPatch, name, baseState, target)
      const baseArray = combination.metaSetNames ?? []
      const preview = applyStringPatchPreview(baseArray, nextPatch)
      // Keep the local draft in sync so the closed Select label updates immediately.
      setRuleCombination((prev) => ({ ...prev, metaSetNames: dedupeStringArray(preview) }))
      multiEdit.updateField('metaSetNames', {
        value: dedupeStringArray(preview),
        status: 'common',
        patch: nextPatch ?? undefined,
      })
      return
    }
    // Single-edit: plain membership toggle on the focused rule.
    const current = combination.metaSetNames ?? []
    const next = current.includes(name)
      ? current.filter((entry) => entry !== name)
      : [...current, name]
    setRuleCombination((prev) => ({ ...prev, metaSetNames: dedupeStringArray(next) }))
  }

  // Include toggle (left-click) — mirrors the recipe panel's toggleSet so multi-edit
  // stages a per-rule tri-state include patch. Toggling a set ON also clears any
  // existing exclusion for it (the shared helper stages add+remove), so left-click
  // un-NOTs a set identically in both builders.
  const toggleSet = (id: number) => {
    if (multiEditActive && multiEdit) {
      const state = getSetState(id)
      const baseState = toTriStateBase(state)
      const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
      const nextPatch = computeArtifactSetPatchToggle(setsPatch, id, baseState, target)
      const baseArray = Array.isArray(combination.sets) ? combination.sets : []
      const preview = applyArtifactSetPatchPreview(baseArray, nextPatch)
      // Keep the local draft in sync so the closed Select label updates immediately.
      setRuleCombination((prev) => ({ ...prev, sets: normalizeArtifactSetSelections(preview) }))
      multiEdit.updateField('sets', {
        value: preview as ArtifactSetSelectionEntry[],
        status: 'common',
        patch: nextPatch ?? undefined,
      })
      return
    }
    // Single-edit: toggle the explicit include, dropping any exclusion for the set.
    const split = splitArtifactSetSelections(combination.sets ?? [])
    const included = new Set(split.included.map(Number))
    if (included.has(id)) included.delete(id); else included.add(id)
    const nextExcluded = split.excluded.filter((entry) => !included.has(entry))
    const next = normalizeArtifactSetSelections([
      ...Array.from(included).map((entry) => ({ id: entry })),
      ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
    ])
    setRuleCombination((prev) => ({ ...prev, sets: next }))
  }

  // Right-click "NOT" handler — one code path for single- and multi-select so the
  // two panels behave identically (SSOT via the shared exclusion helpers). Plain
  // function (not memoized) to mirror the recipe panel's handleExcludeSet. NOT is
  // allowed on any set; the implicit-any guard (below / at apply time) drops a
  // bare exclusion when nothing constrains the pool.
  const handleExcludeSet = (id: number) => {
    // Multi-edit: stage a tri-state exclusion patch across every selected rule.
    if (multiEditActive && multiEdit) {
      const state = getSetExclusionState(id)
      const baseState = toTriStateBase(state)
      // Tri-state: all excluded -> clear; otherwise -> exclude everywhere.
      const target: 'all' | 'none' = state === 'all' ? 'none' : 'all'
      const nextPatch = computeArtifactSetExclusionToggle(setsPatch, id, baseState, target)
      const baseArray = Array.isArray(combination.sets) ? combination.sets : []
      const preview = applyArtifactSetPatchPreview(baseArray, nextPatch)
      // Reflect the change in the local draft so the closed Select label updates.
      setRuleCombination((prev) => ({ ...prev, sets: normalizeArtifactSetSelections(preview) }))
      multiEdit.updateField('sets', {
        value: preview as ArtifactSetSelectionEntry[],
        status: 'common',
        patch: nextPatch ?? undefined,
      })
      return
    }
    // Single-edit: flip the exclusion flag on the focused rule's selection only.
    const split = splitArtifactSetSelections(combination.sets ?? [])
    const isExcluded = split.excluded.includes(id)
    const nextIncluded = split.included.filter((entry) => entry !== id)
    const nextExcluded = isExcluded
      ? split.excluded.filter((entry) => entry !== id)
      : [...split.excluded, id]
    // Strip the exclusion when the result is implicit-any (no include + no metaset).
    const hasMetaset = (combination.metaSetNames ?? []).length > 0
    const next = pruneImplicitAnyExclusions([
      ...nextIncluded.map((entry) => ({ id: entry })),
      ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
    ], hasMetaset)
    setRuleCombination((prev) => ({ ...prev, sets: next }))
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
      const nextMatch = sorted.length > 0 ? prev.substatMatch : SafeguardSubstatMatch.Min1
      const nextWeights = pruneSafeguardsSubstatWeights(prev.substatWeights, sorted)
      // Clamp substatMatch threshold when selected substat count drops below it.
      return normalizeSafeguardSubstatDependents({ ...prev, substats: sorted, substatMatch: nextMatch, substatWeights: nextWeights })
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
      const weightRecord: Record<number, number> = {}
      for (const v of currentSubstats) {
        weightRecord[v] = normalizeGearInspectorSortWeight(Number(nextWeights[v] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT))
      }
      // Dispatch through the shared rule-cache worker. Discard responses whose id
      // does not match the latest scoringRequestIdRef so a slow run that completes
      // after a newer one no longer overwrites the preview.
      const id = ++scoringRequestIdRef.current
      void scoreCandidates({
        artifacts: detectionEntry.artifacts,
        substats: Array.from(currentSubstats),
        weights: weightRecord,
        requiredCount: rule?.requiredCount ?? 1,
        // Mirror detection's count-mode so the WASM preview's isWithinQuota
        // partition (perSet/perFaction/perMain/perSlot bucketing with tie
        // extension) matches what populated the candidate list on first open.
        // Without this, weight nudges would snap the cutoff divider to row
        // `requiredCount`, drifting away from detection's grouped quota.
        // detectionEntry.countMode is authoritative because it is the exact
        // mode the snapshot was computed under — even when the editing rule
        // has since drifted (multi-edit / pending re-detection).
        countMode: detectionEntry.countMode,
      }).then((candidates) => {
        if (id !== scoringRequestIdRef.current) return
        setLivePreviewCandidates(candidates)
      }).catch(() => {
        if (id !== scoringRequestIdRef.current) return
        setLivePreviewCandidates(null)
      })
    }, 150)
  }, [detectionEntry, rule, scoreCandidates])

  // Reset live preview and cancel any pending debounce timer when the weights popover closes.
  const handleWeightsPopoverClose = useCallback(() => {
    if (livePreviewTimerRef.current !== null) {
      clearTimeout(livePreviewTimerRef.current)
      livePreviewTimerRef.current = null
    }
    setLivePreviewCandidates(null)
    setWeightsAnchorEl(null)
  }, [])

  const weightsPopoverMenuRef = useRef<Element | null>(null)
  // Close-button guard for the weights popover — same ContextMenuPaper pattern used for other popovers.
  // menuRef must be forwarded to slotProps.paper so isTargetInsideAnyMenu can distinguish inside clicks.
  const { contextMenuGuard: weightsPopoverGuard } = useContextMenuPaperGuard({
    open: Boolean(weightsAnchorEl),
    onClose: handleWeightsPopoverClose,
    menuRef: weightsPopoverMenuRef,
  })

  // Close-button guard for the improvement-chance threshold popover.
  // Saves current threshold to localStorage ("last used") on every close.
  const handleImprovementChancePopoverClose = useCallback(() => {
    const thr = improvementChanceThresholdRef.current
    if (thr !== null) {
      try { localStorage.setItem(IMPROVEMENT_CHANCE_LAST_USED_KEY, JSON.stringify(thr)) } catch { /* ignore */ }
    }
    setImprovementChanceAnchorEl(null)
    setImprovementChanceAnchorPos(null)
  }, [])
  const improvementChancePopoverMenuRef = useRef<Element | null>(null)
  const { contextMenuGuard: improvementChancePopoverGuard } =
    useContextMenuPaperGuard({ open: Boolean(improvementChanceAnchorEl), onClose: handleImprovementChancePopoverClose, menuRef: improvementChancePopoverMenuRef })

  // Candidate list shown in the popover right column:
  // prefer live preview (from unsaved weight edits) over the detection snapshot.
  const popoverCandidates = livePreviewCandidates ?? detectionEntry?.candidates

  // Number of substat columns per row: max across candidates of how many rule-selected substats
  // the artifact actually has. Tighter than min(substats.length, SUBSTAT_SLOT_COUNT) when not all
  // selected substats appear on any candidate. Falls back to the rule selection count before detection runs.
  const substatColumnCount = (() => {
    if (!popoverCandidates || popoverCandidates.length === 0) {
      return Math.min(substatSelection.length, SUBSTAT_SLOT_COUNT)
    }
    let max = 0
    for (const c of popoverCandidates) {
      const art = artifactsByItemKey.get(c.itemKey)
      if (!art) continue
      const count = substatSelection.filter((v) => art.substats.some((s) => Number(s.variant) === v)).length
      if (count > max) max = count
    }
    return Math.min(max, SUBSTAT_SLOT_COUNT)
  })()

  // ── tags state, derived values, and handlers ──────────────────────────────

  // Dialog open state for the "Clear tags?" confirmation (shown when overrides are active).
  const [clearTagsConfirmOpen, setClearTagsConfirmOpen] = useState(false)
  const [tagsAnchor, setTagsAnchor] = useState<HTMLElement | null>(null)
  const [tagsDraft, setTagsDraft] = useState<string>('')
  // Keep a ref to the tags menu so outside clicks can dismiss stuck backdrops.
  const tagsMenuPaperRef = useRef<HTMLDivElement | null>(null)
  // Track Escape-driven closes so blur does not auto-commit tags.
  const tagsEscapeCloseRef = useRef(false)
  // Context menu anchor and paper ref for the Tags button preferences popover.
  const [tagsContextAnchor, setTagsContextAnchor] = useState<HTMLElement | null>(null)
  const tagsContextPaperRef = useRef<HTMLDivElement | null>(null)
  // Persisted preference for whether tag chips render inline next to the button.
  const [showTagsChips, setShowTagsChips] = useShowTagsChipsPreference()
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
  // Shared hint key with RecipeBuilderPanel — one seen = both seen.
  const { triggerProps: tagsHintTriggerProps, overlay: tagsHintOverlay, onOpen: onTagsHintOpen } = useContextMenuButtonHint(CONTEXT_HINT_IDS.builderTagsMenu, {
    enabled: !tagsContextAnchor && !tagsPopoverOpen,
    text: t('contextMenuHint'),
  })
  // Open the Tags context menu on right-click and mark the hint as seen.
  const handleTagsContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {}
    onTagsHintOpen()
    setTagsContextAnchor(event.currentTarget as HTMLElement)
  }, [onTagsHintOpen])
  // ContextMenuPaper guard for the tags popover — consistent with other popovers.
  const { contextMenuGuard: tagsMenuGuard } = useContextMenuPaperGuard({
    open: tagsPopoverOpen,
    onClose: closeTagsPopover,
    menuRef: tagsMenuPaperRef,
  })
  // Memoize single-rule tags so callbacks get stable dependencies.
  const tagsValue = useMemo(() => (rule.tags ?? []), [rule.tags])
  // Summarize tag presence across all selected rules for multi-edit mixed styling.
  const tagPresence = useMemo(() => {
    if (!multiEditActive) return null
    // Prefer projected rules so staged patches are reflected in the tag chips.
    const source = (multiProjectedRules && multiProjectedRules.length > 0)
      ? multiProjectedRules
      : (multiSelectedRules ?? [])
    const lists = source.map((r) => (Array.isArray(r.tags) ? r.tags.map(String) : []))
    return summarizeTagPresence(lists)
  }, [multiEditActive, multiProjectedRules, multiSelectedRules])
  // Expose the displayed tags based on single vs multi-edit state.
  const tagDisplay = useMemo(
    () => (multiEditActive ? (tagPresence?.all ?? []) : tagsValue),
    [multiEditActive, tagPresence, tagsValue],
  )
  const tagsButtonLabel = t('builderTagsLabel')
  // Treat any visible tags as an "active" state for the button color.
  const tagsButtonActive = tagDisplay.length > 0
  const tagsClearLabel = t('builderClearTags')
  // Treat any visible tags (single or multi-edit) as eligible for the clear affordance.
  const tagsClearable = multiEditActive ? tagDisplay.length > 0 : tagsValue.length > 0
  const showTagsClear = tagsClearable
  // Precompute mixed tag membership so chips can share the mixed styling.
  const mixedTagSet = useMemo(() => new Set(tagPresence?.mixed ?? []), [tagPresence])
  // Shared mixed chip style mirrors other multi-edit mixed states.
  const mixedTagChipSx = useMemo(() => ({
    border: `1px dashed ${mixedBorderColor}`,
    color: mixedTextColor,
    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
  }), [mixedBorderColor, mixedPatternColor, mixedTextColor])
  // Return the base tri-state for a tag in multi-edit (all/mixed/none).
  const getTagBaseState = useCallback((tag: string): TriStateBase => {
    if (!tagPresence) return 'none'
    const count = tagPresence.counts[tag] ?? 0
    return deriveBaseTriState(count, tagPresence.total)
  }, [tagPresence])
  // Build or update the multi-edit patch for a batch of tags (add or remove).
  const stageTagPatch = useCallback((tokens: readonly string[], target: 'all' | 'none') => {
    if (!multiEditActive || !multiEdit || !tagPresence) return
    let nextPatch = (multiTagsField?.patch as MultiEditArrayPatch<string> | null | undefined) ?? null
    tokens.forEach((tag) => {
      const baseState = getTagBaseState(tag)
      nextPatch = computeStringPatchToggle(nextPatch, tag, baseState, target)
    })
    multiEdit.updateField('tags', {
      value: (multiTagsField?.value as string[]) ?? [],
      status: multiTagsField?.status ?? 'mixed',
      patch: nextPatch ?? null,
    })
  }, [getTagBaseState, multiEdit, multiEditActive, multiTagsField, tagPresence])
  // Commit comma-separated tag input from the draft TextField.
  const commitTagsFromDraft = useCallback(() => {
    const raw = tagsDraft.trim()
    if (!raw) return
    const normalizedAdds: string[] = []
    raw.split(',').map((p) => p.trim()).filter(Boolean).forEach((part) => {
      const tag = normalizeTagValue(part)
      if (tag) normalizedAdds.push(tag)
    })
    if (normalizedAdds.length === 0) return
    if (multiEditActive) {
      stageTagPatch(normalizedAdds, 'all')
    } else {
      // Merge into the current tag list (order-preserving, deduped).
      updateRule((prev) => ({ ...prev, tags: mergeTagList(prev.tags ?? [], normalizedAdds) }))
    }
    setTagsDraft('')
  }, [multiEditActive, stageTagPatch, tagsDraft, updateRule])
  // Remove a single tag from the rule or from all selected rules via patch.
  const removeTag = useCallback((tag: string) => {
    if (multiEditActive) {
      stageTagPatch([tag], 'none')
      return
    }
    updateRule((prev) => ({ ...prev, tags: (prev.tags ?? []).filter((v) => v !== tag) }))
  }, [multiEditActive, stageTagPatch, updateRule])
  // Clear all tags — resets via patch in multi-edit, direct update otherwise.
  const clearTags = useCallback(() => {
    if (!tagsClearable) return
    if (multiEditActive && multiEdit) {
      multiEdit.updateField('tags', {
        value: (multiTagsField?.value as string[]) ?? (rule.tags ?? []),
        status: 'common',
        patch: { clear: true },
      })
      return
    }
    // Single-edit: if override values differ from stored values, let the user decide
    // whether to bake those values in before clearing the tags.
    if (effectiveRule !== rule) {
      setClearTagsConfirmOpen(true)
      return
    }
    // No active overrides — clear directly.
    updateRule((prev) => ({ ...prev, tags: [] }))
  }, [effectiveRule, rule, multiEdit, multiEditActive, multiTagsField?.value, tagsClearable, updateRule])
  // Handles "Clear Without Applying" — discards any active override values and clears tags.
  const handleClearTagsConfirm = useCallback(() => {
    setClearTagsConfirmOpen(false)
    updateRule((prev) => ({ ...prev, tags: [] }))
  }, [updateRule])
  // Handles "Apply and Clear" — bakes the current override-derived values into the rule,
  // then removes the tags so overrides no longer target it.
  const handleClearTagsApplyAndClear = useCallback(() => {
    setClearTagsConfirmOpen(false)
    updateRule(() => ({ ...effectiveRule, tags: [] }))
  }, [effectiveRule, updateRule])

  // ── render ────────────────────────────────────────────────────────────────

  // Pre-compute main-stat toggle group props so no IIFE appears inside JSX.
  // Returns 'none' | 'partial' | 'all' presence for a given main-stat variant under multi-edit.
  const getMainStatPresence = (variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      return mainStatSelection.includes(variant) ? 'all' : 'none'
    }
    const base = multiSummary.mainStatCounts.get(variant) ?? 0
    const triState = deriveBaseTriState(applyArrayPatchCount(base, multiSummary.total, multiMainStatsField?.patch as MultiEditArrayPatch<number> | null, variant), multiSummary.total)
    return triState === 'mixed' ? 'partial' : triState
  }
  // Shared sx: add mixed-toggle overrides on top of base.
  const mainStatGroupSx = multiEditActive ? [mainStatToggleGroupSx, mixedToggleOverrides] : mainStatToggleGroupSx
  // In multi-edit, group value must list only 'all' variants so MUI renders selected state correctly.
  // Buttons with 'partial' presence show the data-mixed CSS indicator instead.
  const mainStatGroupProps = multiEditActive
    ? {
        value: [...STAT_VARIANTS_PRIORITY_ROW1, ...STAT_VARIANTS_PRIORITY_ROW2]
          .filter(v => getMainStatPresence(v) === 'all').map(String),
      }
    : { value: mainStatValueStrings, onChange: handleMainStatChange }

  // Pre-compute substat toggle group props so no IIFE appears inside JSX.
  // Returns 'none' | 'partial' | 'all' presence for a given substat variant under multi-edit.
  const getSubstatPresence = (variant: number): 'none' | 'partial' | 'all' => {
    if (!multiEditActive || !multiSummary) {
      return substatSelection.includes(variant as StatVariant) ? 'all' : 'none'
    }
    const base = multiSummary.substatCounts.get(variant) ?? 0
    const triState = deriveBaseTriState(applyArrayPatchCount(base, multiSummary.total, multiSubstatsField?.patch as MultiEditArrayPatch<number> | null, variant), multiSummary.total)
    return triState === 'mixed' ? 'partial' : triState
  }
  // Group value lists only 'all' variants — MUI uses it to compute each button's
  // selected state; 'partial' variants stay unselected and get data-mixed CSS instead.
  const substatGroupProps = multiEditActive
    ? {
        value: [...STAT_VARIANTS_PRIORITY_ROW1, ...STAT_VARIANTS_PRIORITY_ROW2]
          .filter(v => getSubstatPresence(v) === 'all').map(String),
      }
    : { value: substatValueStrings, onChange: handleSubstatChange }
  const substatGroupSx = multiEditActive ? [substatToggleGroupSx, mixedToggleOverrides] : substatToggleGroupSx

  // Pre-compute the improvement-chance popover body so no IIFE appears inside JSX.
  // Rendered only when the threshold is active; null when disabled or not yet opened.
  const improvementChancePopoverBody = (() => {
    if (displayImprovementChanceThreshold === null) return null
    const thr = displayImprovementChanceThreshold
    const [resolvedL0, resolvedL4, resolvedL8, resolvedL12] = resolveImprovementChanceThresholds(thr)

    // Helper: apply a full threshold update (single-edit and multi-edit paths).
    const applyThreshold = (next: SafeguardImprovementChanceLevelThresholds) => {
      if (multiEditActive && multiEdit) {
        multiEdit.updateField('improvementChanceThreshold', { value: next, status: 'common' })
      } else {
        updateRule((prev) => ({ ...prev, improvementChanceThreshold: next }))
      }
    }

    // Helper: clamp to 1-decimal precision within [0, 100].
    const clampSlot = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
    const updateSlot = (slot: 'atLevel0' | 'atLevel4' | 'atLevel8' | 'atLevel12', raw: string) => {
      if (slot === 'atLevel0') {
        applyThreshold({ ...thr, atLevel0: clampSlot(Number(raw) || SAFEGUARD_IMPROVEMENT_CHANCE_DEFAULT_THRESHOLD) })
      } else {
        const parsed = raw === '' ? null : clampSlot(Number(raw))
        applyThreshold({ ...thr, [slot]: parsed })
      }
    }
    const stepSlot = (slot: 'atLevel0' | 'atLevel4' | 'atLevel8' | 'atLevel12', delta: number) => {
      const resolved = slot === 'atLevel0' ? resolvedL0
        : slot === 'atLevel4' ? resolvedL4
        : slot === 'atLevel8' ? resolvedL8
        : resolvedL12
      const current = thr[slot] !== null && thr[slot] !== undefined ? (thr[slot] as number) : resolved
      applyThreshold(slot === 'atLevel0'
        ? { ...thr, atLevel0: clampSlot(current + delta) }
        : { ...thr, [slot]: clampSlot(current + delta) })
    }

    // Last-used: read from localStorage; fall back to 25% (Lenient) when nothing is stored yet.
    let lastUsedThreshold: SafeguardImprovementChanceLevelThresholds =
      { atLevel0: SAFEGUARD_IMPROVEMENT_CHANCE_DEFAULT_THRESHOLD, atLevel4: null, atLevel8: null, atLevel12: null }
    try {
      const raw = localStorage.getItem(IMPROVEMENT_CHANCE_LAST_USED_KEY)
      if (raw) lastUsedThreshold = JSON.parse(raw) as SafeguardImprovementChanceLevelThresholds
    } catch { /* ignore */ }

    // Per-level column configuration (side-by-side, labels above inputs).
    const levelCols: {
      slot: 'atLevel0' | 'atLevel4' | 'atLevel8' | 'atLevel12'
      labelKey: string
      value: number | null
      resolved: number
    }[] = [
      { slot: 'atLevel0',  labelKey: 'safeguardsImprovementChanceLevelLabel0',  value: thr.atLevel0,        resolved: resolvedL0 },
      { slot: 'atLevel4',  labelKey: 'safeguardsImprovementChanceLevelLabel4',  value: thr.atLevel4 ?? null, resolved: resolvedL4 },
      { slot: 'atLevel8',  labelKey: 'safeguardsImprovementChanceLevelLabel8',  value: thr.atLevel8 ?? null, resolved: resolvedL8 },
      { slot: 'atLevel12', labelKey: 'safeguardsImprovementChanceLevelLabel12', value: thr.atLevel12 ?? null, resolved: resolvedL12 },
    ]

    const activePresetId = detectImprovementChancePresetId(thr)
    const inputWidth = 72

    return (
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Preset chips — all always visible; Last used disabled when absent or already active. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {IMPROVEMENT_CHANCE_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              size="small"
              label={t(`safeguardsImprovementChancePreset${preset.id.charAt(0).toUpperCase()}${preset.id.slice(1)}` as Parameters<typeof t>[0])}
              variant={activePresetId === preset.id ? 'filled' : 'outlined'}
              color={activePresetId === preset.id ? 'primary' : 'default'}
              onClick={() => applyThreshold(preset.thresholds)}
              sx={{ height: 22, cursor: 'pointer' }}
            />
          ))}
          {/* Last used: always clickable — applies whatever was last persisted (or 25% default). */}
          <Chip
            size="small"
            label={t('safeguardsImprovementChancePresetLastUsed')}
            variant="outlined"
            onClick={() => applyThreshold(lastUsedThreshold)}
            sx={{ height: 22, cursor: 'pointer' }}
          />
        </Box>

        {/* Row: label left, inputs right — mirrors Roll Targets two-column layout. */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
          {/* Left: feature label with tooltip explaining the input fields. */}
          <MarkdownTooltip markdown={t('safeguardsImprovementChanceThresholdHint')} placement="top">
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ cursor: 'default', whiteSpace: 'nowrap', pb: '6px' }}
            >
              {t('safeguardsImprovementChanceThreshold')}
            </Typography>
          </MarkdownTooltip>

          {/* Right: side-by-side inputs with column labels above. */}
          {levelCols.map((col, idx) => (
            <Box key={col.slot} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t(col.labelKey as Parameters<typeof t>[0])}
              </Typography>
              <TextField
                size="small"
                type="number"
                autoFocus={idx === 0}
                // Empty string when null (inherited); placeholder shows the inherited resolved value.
                value={col.value !== null ? String(col.value) : ''}
                placeholder={String(col.resolved)}
                onChange={(e) => updateSlot(col.slot, e.target.value)}
                onKeyDown={(e) => {
                  // Clear to null (inherit) on Delete/Backspace when the field is already empty.
                  if ((e.key === 'Delete' || e.key === 'Backspace') && col.slot !== 'atLevel0' && col.value === null) {
                    updateSlot(col.slot, '')
                  }
                }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <NumberSpinnerAdornment
                        ariaLabel={t(col.labelKey as Parameters<typeof t>[0])}
                        onStep={(delta) => stepSlot(col.slot, delta)}
                      />
                    ),
                    sx: { ...HIDE_NATIVE_NUMBER_SPINNER_SX },
                  },
                  htmlInput: { min: 0, step: 0.1, max: 100 },
                }}
                sx={(themeInner) => ({
                  width: inputWidth,
                  '& input': { textAlign: 'right', paddingRight: themeInner.spacing(1), paddingLeft: themeInner.spacing(0.25) },
                })}
              />
            </Box>
          ))}
        </Box>
      </Box>
    )
  })()

  // Force a read of defaultsEpoch so the reset menu re-evaluates when user defaults change.
  // The value itself is unused; only the dependency on the epoch state matters.
  void defaultsEpoch
  // Pre-compute the disabled state for "Reset to Factory Defaults" so no IIFE appears inside JSX.
  const resetFactoryDefaultsDisabled = (() => {
    try { return !localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY) } catch { return true }
  })()

  // Pre-compute the name field end adornment so no IIFE appears inside JSX.
  const currentNameFgColor = multiEditActive
    ? ((multiFgColorField?.value as string) ?? '')
    : (rule.appearance?.fgColor ?? '')
  const showNameClear = multiEditActive ? Boolean(multiNameField?.dirty) : Boolean(rule.appearance?.name)

  // Pre-compute ignore-chip display values so no IIFE appears inside JSX.
  // Single-edit: use effective (overridden) value for chip color/state; stored value is
  // still used in onClick handlers so toggling mutates the stored field correctly.
  const ignPrevMixed = multiEditActive && multiIgnorePreviousField?.status === 'mixed' && !multiIgnorePreviousField.dirty
  const ignPrevValue = multiEditActive
    ? Boolean(multiIgnorePreviousField?.value ?? ignorePreviousSafeguards)
    : (effectiveRule.ignorePreviousSafeguards !== false)
  const ignCollMixed = multiEditActive && multiIgnoreCollectionField?.status === 'mixed' && !multiIgnoreCollectionField.dirty
  const ignCollValue = multiEditActive
    ? Boolean(multiIgnoreCollectionField?.value ?? ignoreEquippedInCollection)
    : (effectiveRule.ignoreEquippedInCollection === true)
  const ignVaultMixed = multiEditActive && multiIgnoreVaultField?.status === 'mixed' && !multiIgnoreVaultField.dirty
  const ignVaultValue = multiEditActive
    ? Boolean(multiIgnoreVaultField?.value ?? ignoreEquippedInVault)
    : (effectiveRule.ignoreEquippedInVault === true)
  const nameFieldEndAdornment = (
    <InputAdornment position="end" sx={{ gap: 0.5 }}>
      <ColorField
        value={currentNameFgColor}
        onChange={commitFgColor}
        onClear={() => commitFgColor(undefined)}
      />
      {showNameClear && (
        <ClearIconButton
          size="small"
          edge="end"
          aria-label={t('builderClearRecipeName')}
          tooltip={t('builderClearRecipeName')}
          // Prevent mousedown from blurring the input before click fires (MUI9 behavior change).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (multiEditActive && multiEdit) {
              multiEdit.updateField('appearanceName', { value: '', status: 'common' })
            } else {
              updateRule((prev) => {
                const fgColor = prev.appearance?.fgColor
                // Keep fgColor when set; otherwise drop the whole appearance key — spreading {}
                // would leave the old name intact.
                if (fgColor) return { ...prev, appearance: { name: '', fgColor } }
                const { appearance: _dropped, ...base } = prev
                return base
              })
            }
          }}
        />
      )}
    </InputAdornment>
  )

  return (
    <Box
      data-tour-id="safeguards.builder"
    >
      {/* ── Name field above scroll zone — floating label extends ~9 px above the input
          border when shrunk; keeping it outside overflowX:auto prevents the scroll
          container's implicit overflow-y from clipping it. ── */}
      <Box sx={(theme) => ({ borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
        <TextField
          label={t('safeguardBuilderRuleName')}
          // In multi-edit mode show staged name value (or placeholder when mixed).
          value={multiEditActive
            ? (multiNameField?.status === 'mixed' && !multiNameField.dirty
              ? ''
              : ((multiNameField?.value as string) ?? rule.appearance?.name ?? ''))
            : (rule.appearance?.name ?? '')}
          {...(multiEditActive && multiNameField?.status === 'mixed' && !multiNameField.dirty
            ? { placeholder: t('builderMultiEditMixedPlaceholder') }
            : {})}
          onChange={(e) => {
            const newName = e.target.value
            if (multiEditActive && multiEdit) {
              multiEdit.updateField('appearanceName', { value: newName, status: 'common' })
            } else {
              updateRule((prev) => {
                const fgColor = prev.appearance?.fgColor
                return { ...prev, ...(newName || fgColor
                  ? { appearance: { name: newName, ...(fgColor ? { fgColor } : {}) } }
                  : {}) }
              })
            }
          }}
          slotProps={{ input: { endAdornment: nameFieldEndAdornment } }}
          fullWidth
        />
      </Box>
      {/* Scroll wrapper: gives the toggle-button grid a horizontal scrollbar when wider
          than the splitter-controlled panel; name field above avoids label clipping.
          Tags group lives inside Row 1's flex row to the right of the ignore chips — see below. */}
      <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
          columnGap: 1,
          rowGap: 1,
        }}
      >

      {/* ── Row 1: Mode toggle + Required count + Ignore chips + undo/redo (full-width) ── */}
      <Box sx={{ gridColumn: '1 / -1' }}>
        {/* Header row: chevron + Mode label + info icon + undo/redo (always visible).
            position+zIndex keep the label and undo/redo controls on top of the toggle row bleed. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, position: 'relative', zIndex: 1 }}>
          <BuilderSectionHeader id="action" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
            <Box component="span" sx={modeLabelColor ? [BUILDER_LABEL_TEXT_SX, { color: modeLabelColor }] : BUILDER_LABEL_TEXT_SX}>{t('safeguardsRuleModeLabel')}</Box>
          </BuilderSectionHeader>
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
        </Box>
        {/* Collapsible content: mode toggle + count + ignore chips.
            mt: -14px (½·SMALL_BUTTON_HEIGHT_PX) bleeds the toggle row into the label row so its
            visual center aligns with the label — matching the recipe builder's action subgroup.
            The header row uses zIndex:1 to stay interactive on top of the bleed. */}
        <Collapse in={!builderCollapsed.action} timeout="auto" unmountOnExit>
        {/* overflowX:'clip' prevents horizontal layout bleed while leaving overflowY:'visible' so
            absolutely-positioned override badges (top:-6) are not clipped by this flex row.
            Using 'clip' (not 'hidden') avoids the CSS forced-auto promotion of overflow-y. */}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, flexWrap: 'nowrap', overflowX: 'clip', mt: `-${SMALL_BUTTON_HEIGHT_PX / 2}px` }}>
        {/* Mode toggle — label moved to header row above */}
        <FormControl sx={(theme) => ({ flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>

          {/* Relative-positioned wrapper enables the mixed-state ::before overlay pattern. */}
          <Box sx={{ position: 'relative' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            // In multi-edit mode, show the staged value; null when mixed (no button highlighted).
            // In single-edit mode, show the effective (overridden) activation when applicable.
            value={multiEditActive
              ? (activationMixed
                ? null
                : (multiActivationField?.value as SafeguardRuleActivation ?? activation))
              : displayActivation}
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
                '&.Mui-selected': { borderColor: muiTheme.vars?.palette.success.main ?? muiTheme.palette.success.main },
                ...muiTheme.applyStyles('light', {
                  '&.Mui-selected': {
                    bgcolor: TINT.successSelectedBg,
                    color: muiTheme.vars?.palette.success.main ?? muiTheme.palette.success.main,
                    '&:hover': { bgcolor: TINT.successSelectedHover },
                  },
                }),
                ...muiTheme.applyStyles('dark', {
                  '&.Mui-selected': {
                    bgcolor: muiTheme.vars?.palette.success.main ?? muiTheme.palette.success.main,
                    color: muiTheme.vars?.palette.common.black ?? muiTheme.palette.common.black,
                    '&:hover': { bgcolor: muiTheme.vars?.palette.success.light ?? muiTheme.palette.success.light },
                  },
                }),
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
                  bgcolor: muiTheme.vars?.palette.warning.main ?? muiTheme.palette.warning.main,
                  borderColor: muiTheme.vars?.palette.warning.main ?? muiTheme.palette.warning.main,
                  color: muiTheme.vars?.palette.warning.contrastText ?? muiTheme.palette.warning.contrastText,
                  '&:hover': { bgcolor: muiTheme.vars?.palette.warning.dark ?? muiTheme.palette.warning.dark },
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
          {/* Override badge: shown when a safeguard-overrides block changes the activation mode. */}
          {activationOverrideActive && renderSafeguardOverrideBadge(
            buildSafeguardOverrideBadgeTooltip(
              activationLabel(rule.activation),
              activationLabel(effectiveRule.activation),
            ),
          )}
          </Box>
        </FormControl>

        {/* Required count */}
        <Box sx={(theme) => ({ position: 'relative', flex: '0 0 auto', borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
          {/* Override badge: shown when a safeguard-overrides block changes the required count. */}
          {requiredCountOverrideActive && renderSafeguardOverrideBadge(
            buildSafeguardOverrideBadgeTooltip(
              String(rule.requiredCount ?? 1),
              String(effectiveRule.requiredCount ?? 1),
            ),
          )}
          <TextField
            size="small"
            type="number"
            label={t('safeguardsRequiredCount')}
            // In multi-edit mode show staged value; when mixed (not yet staged) placeholder shows.
            value={multiEditActive
              ? (multiRequiredCountField?.status === 'mixed' && !multiRequiredCountField.dirty
                ? ''
                : Number(multiRequiredCountField?.value ?? rule.requiredCount ?? 1))
              // Single-edit: show effective count so the control reflects the active override.
              : (effectiveRule.requiredCount ?? 1)}
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
            slotProps={{
              input: {
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
              },
              htmlInput: { min: 1, step: 1, max: 9999 },
            }}
            sx={(themeInner) => ({
              width: 130,
              ...HIDE_NATIVE_NUMBER_SPINNER_SX,
              '& input': { textAlign: 'right', paddingRight: themeInner.spacing(1), paddingLeft: themeInner.spacing(0.5) },
            })}
          />
        </Box>

        {/* Ignore chips — right of required count, stacked in 2 rows */}
        {/* position+zIndex raise this column above the header row's zIndex:1 stacking context.
            The content flex row bleeds 14px upward into the header (mt:-½·SMALL_BUTTON_HEIGHT_PX),
            so without elevation the header's z=1 intercepts clicks on the top strip of Row 1. */}
        <Box sx={(theme) => ({ display: 'flex', flexDirection: 'column', gap: 0.5, flex: '0 0 auto', position: 'relative', zIndex: 2, ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>

          {/* Row 1: ignore previous safeguards */}
          {/* Derived values (ignPrevMixed, ignPrevValue, …) are computed before the return statement. */}
          {/* alignSelf:flex-start collapses this box to chip width so the badge's left:50%
              centres on the chip, not on the full-width column stretch. */}
          <Box sx={{ position: 'relative', alignSelf: 'flex-start' }}>
            <MarkdownTooltip markdown={t('safeguardsIgnorePreviousSafeguardsHint')} ellipsisTitle={t('safeguardsIgnorePreviousSafeguards')} ellipsisSelector=".MuiChip-label">
              <Chip
                size="small"
                variant="filled"
                label={`${GLYPH_IGNORE_PREVIOUS}${NBSP}${t('safeguardsIgnorePreviousSafeguards')}`}
                aria-label={t('safeguardsIgnorePreviousSafeguards')}
                clickable
                onClick={() => {
                  if (multiEditActive && multiEdit) {
                    multiEdit.updateField('ignorePreviousSafeguards', { value: !ignPrevValue, status: 'common' })
                  } else {
                    updateRule((prev) => ({ ...prev, ignorePreviousSafeguards: !ignorePreviousSafeguards }))
                  }
                }}
                sx={{
                  // Green when enabled OR mixed — base matches recipe builder flex chip.
                  ...builderStatusChipSx(ignPrevValue || ignPrevMixed, { dimDisabled: true }),
                  // Full mixed overlay: dashed border + hatched gradient + muted text,
                  // identical to the flex chip pattern in RecipeBuilderPanel.
                  ...(ignPrevMixed ? {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  } : {}),
                }}
              />
            </MarkdownTooltip>
            {/* Override badge: shown when a safeguard-overrides block flips this toggle. */}
            {ignPrevOverrideActive && renderSafeguardOverrideBadge(
              buildSafeguardOverrideBadgeTooltip(
                ignorePreviousSafeguards ? 'on' : 'off',
                effectiveRule.ignorePreviousSafeguards !== false ? 'on' : 'off',
              ),
            )}
          </Box>
          {/* Row 2: ignore equipped in collection + vault */}
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <Box sx={{ position: 'relative' }}>
              <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInCollectionHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInCollection')} ellipsisSelector=".MuiChip-label">
                <Chip
                  size="small"
                  variant="filled"
                  label={`${GLYPH_IGNORE_COLLECTION}${NBSP}${t('safeguardsIgnoreEquippedInCollection')}`}
                  aria-label={t('safeguardsIgnoreEquippedInCollection')}
                  clickable
                  onClick={() => {
                    if (multiEditActive && multiEdit) {
                      multiEdit.updateField('ignoreEquippedInCollection', { value: !ignCollValue, status: 'common' })
                    } else {
                      updateRule((prev) => ({ ...prev, ignoreEquippedInCollection: !ignoreEquippedInCollection }))
                    }
                  }}
                  sx={{
                    ...builderStatusChipSx(ignCollValue || ignCollMixed, { dimDisabled: true }),
                    ...(ignCollMixed ? {
                      borderStyle: 'dashed',
                      borderColor: mixedBorderColor,
                      color: mixedTextColor,
                      backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    } : {}),
                  }}
                />
              </MarkdownTooltip>
              {/* Override badge: shown when a safeguard-overrides block flips this toggle. */}
              {ignCollOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  ignoreEquippedInCollection ? 'on' : 'off',
                  effectiveRule.ignoreEquippedInCollection ? 'on' : 'off',
                ),
              )}
            </Box>
            <Box sx={{ position: 'relative' }}>
              <MarkdownTooltip markdown={t('safeguardsIgnoreEquippedInVaultHint')} ellipsisTitle={t('safeguardsIgnoreEquippedInVault')} ellipsisSelector=".MuiChip-label">
                <Chip
                  size="small"
                  variant="filled"
                  label={`${GLYPH_IGNORE_VAULT}${NBSP}${t('safeguardsIgnoreEquippedInVault')}`}
                  aria-label={t('safeguardsIgnoreEquippedInVault')}
                  clickable
                  onClick={() => {
                    if (multiEditActive && multiEdit) {
                      multiEdit.updateField('ignoreEquippedInVault', { value: !ignVaultValue, status: 'common' })
                    } else {
                      updateRule((prev) => ({ ...prev, ignoreEquippedInVault: !ignoreEquippedInVault }))
                    }
                  }}
                  sx={{
                    ...builderStatusChipSx(ignVaultValue || ignVaultMixed, { dimDisabled: true }),
                    ...(ignVaultMixed ? {
                      borderStyle: 'dashed',
                      borderColor: mixedBorderColor,
                      color: mixedTextColor,
                      backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    } : {}),
                  }}
                />
              </MarkdownTooltip>
              {/* Override badge: shown when a safeguard-overrides block flips this toggle. */}
              {ignVaultOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  ignoreEquippedInVault ? 'on' : 'off',
                  effectiveRule.ignoreEquippedInVault ? 'on' : 'off',
                ),
              )}
            </Box>
          </Box>
        </Box>
        {/* Tags group — right of the ignore flags chips in the same flex row.
            Single row: [Tags button] [X clear] [inline chips…] */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, alignSelf: 'flex-end' }}
          onContextMenu={handleTagsContextMenu}
          {...tagsHintTriggerProps}
        >
          <MarkdownTooltip markdown={tagsButtonLabel} placement="top">
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
              sx={COMPACT_HEADER_ACTION_BUTTON_SX}
            >
              <Typography component="span" noWrap sx={{ ...ELLIPSIS_TEXT_SX, width: '100%' }} data-ellipsis-target>
                {tagsButtonLabel}
              </Typography>
            </Button>
          </MarkdownTooltip>
          {/* Only show the clear affordance when tags exist for this rule. */}
          {showTagsClear ? (
            <ClearIconButton
              size="small"
              aria-label={tagsClearLabel}
              tooltip={tagsClearLabel}
              onClick={clearTags}
            />
          ) : null}
          {/* Inline tag chips to the right of the X — capped at 3 + "+N" badge. */}
          {showTagsChips ? (
            <BuilderTagChipStrip tags={tagDisplay} mixedTagSet={mixedTagSet} mixedTagChipSx={mixedTagChipSx} multiEditActive={multiEditActive} />
          ) : null}
          {/* Tags popover: removable chip list + draft TextField for adding new tags. */}
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
            <Box sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                {/* Tag chips are removable; empty state shows a placeholder. */}
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
          {tagsHintOverlay}
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
        backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent',
      })}>

        {/* Rank — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rank ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="rank" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.rank && rankSectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('builderRank')}</Box>
            </BuilderSectionHeader>
          </Box>
          <Collapse in={!builderCollapsed.rank} timeout="auto" unmountOnExit>
            <Box sx={{ position: 'relative' }}>
              {rankOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  formatRankList(rule.combination.ranks ?? []),
                  formatRankList(effectiveRule.combination.ranks ?? []),
                ),
              )}
            <GearRankSelect
              multiple
              // When mixed, collapse to empty so renderValue shows the mixed label instead of
              // a potentially-misleading partial rank list from only one of the selected rules.
              value={rankMixed ? [] : displayRanks}
              onChange={(nextRanks) => {
                setRuleCombination((prev) => ({ ...prev, ranks: nextRanks }))
              }}
              allowAny
              anyLabel={t('any')}
              // Override closed-select display text to "Mixed" when state differs across rules.
              {...(rankMixed ? { mixedLabel: t('builderMultiMixedValue') } : {})}
              menuProps={{ slotProps: { paper: { sx: { maxHeight: 340 } } } }}
              sx={rankMixed ? {
                ...SELECT_BOX_HEIGHT_SX,
                // Dashed border + diagonal gradient mirrors the data-mixed toggle button pattern.
                '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: mixedBorderColor },
                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              } : SELECT_BOX_HEIGHT_SX}
            />
            </Box>
          </Collapse>
        </FormControl>

        {/* Rarity — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.rarity ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="rarity" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.rarity && raritySectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('filterRarity')}</Box>
            </BuilderSectionHeader>
          </Box>
          <Collapse in={!builderCollapsed.rarity} timeout="auto" unmountOnExit>
            <Box sx={{ position: 'relative' }}>
              {rarityOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  formatRarityList(rule.combination.rarities ?? []),
                  formatRarityList(effectiveRule.combination.rarities ?? []),
                ),
              )}
            <GearRaritySelect
              multiple
              // When mixed, collapse to empty so renderValue shows the mixed label.
              value={rarityMixed ? [] : displayRarities}
              onChange={(nextRarities) => {
                setRuleCombination((prev) => ({ ...prev, rarities: nextRarities }))
              }}
              allowAny
              anyLabel={t('any')}
              {...(rarityMixed ? { mixedLabel: t('builderMultiMixedValue') } : {})}
              menuProps={{ slotProps: { paper: { sx: { maxHeight: 340 } } } }}
              sx={rarityMixed ? {
                ...SELECT_BOX_HEIGHT_SX,
                '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: mixedBorderColor },
                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              } : SELECT_BOX_HEIGHT_SX}
            />
            </Box>
          </Collapse>
        </FormControl>

        {/* Faction — shrinks to header width when collapsed */}
        <FormControl sx={{ flex: builderCollapsed.faction ? '0 0 auto' : '0 1 33.333%', minWidth: 0 }} disabled={!hasAccessorySlot}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="faction" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.faction && factionSectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('builderFaction')}</Box>
            </BuilderSectionHeader>
          </Box>
          <Collapse in={!builderCollapsed.faction} timeout="auto" unmountOnExit>
            <Box sx={{ position: 'relative' }}>
              {factionOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  formatFactionList(rule.combination.factions ?? []),
                  formatFactionList(effectiveRule.combination.factions ?? []),
                ),
              )}
            <GearFactionSelect
              multiple
              disabled={!hasAccessorySlot}
              // Mixed display collapses to empty so the dropdown can render the
              // "Mixed" label; a staged multi-edit value wins over the mixed badge.
              value={
                multiEditActive && multiFactionsField?.dirty
                  ? (multiFactionsField.value as FactionId[] ?? [])
                  : (factionMixed ? [] : displayFactions)
              }
              onChange={(nextFactions) => {
                if (!hasAccessorySlot) return
                if (multiEditActive && multiEdit) {
                  // Multi-edit: stage a replace patch so every selected rule converges
                  // to the picked factions. The faction→accessory-slots invariant is
                  // enforced by the apply-time normalizer, not here, so the slot
                  // selection stays untouched while the user is still editing.
                  const patch: MultiEditArrayPatch<FactionId> = nextFactions.length > 0
                    ? { replace: nextFactions }
                    : { clear: true }
                  multiEdit.updateField('factions', {
                    value: nextFactions,
                    status: 'common',
                    patch,
                  })
                  return
                }
                if (nextFactions.length > 0) {
                  // Single-edit: faction set → restrict slots to accessories
                  // (mirrors normalizeFactionSlotScope on the recipe side).
                  updateRule((prev) => {
                    const slotsAreAccessoryOnly = prev.combination.slots.length > 0
                      && prev.combination.slots.every((s) => isAccessorySlot(s))
                    const nextSlots = slotsAreAccessoryOnly
                      ? prev.combination.slots
                      : (ACCESSORY_SLOT_IDS as typeof prev.combination.slots)
                    const nextCombo = sanitizeCombinationForSlots(nextSlots, { ...prev.combination, factions: nextFactions })
                    return constrainSafeguardSubstats(prev, nextCombo)
                  })
                } else {
                  setRuleCombination((prev) => ({ ...prev, factions: nextFactions }))
                }
              }}
              anyLabel={t('any')}
              {...(factionMixed ? { mixedLabel: t('builderMultiMixedValue') } : {})}
              sx={factionMixed ? {
                ...SELECT_BOX_HEIGHT_SX,
                // Dashed border + diagonal gradient mirrors rank/rarity mixed display.
                '& .MuiOutlinedInput-notchedOutline': { borderStyle: 'dashed', borderColor: mixedBorderColor },
                backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
              } : SELECT_BOX_HEIGHT_SX}
            />
            </Box>
            <Box sx={{ mt: 0.75 }}>
              {renderScopeChip('perFaction', t('safeguardsCountModePerFaction'), scopeActive.perFaction, !hasAccessorySlot || redundantDimensions.perFaction, perScopeMixed.perFaction,
                perFactionOverrideActive ? renderSafeguardOverrideBadge(
                  buildSafeguardOverrideBadgeTooltip(
                    rule.countMode?.perFaction ? 'on' : 'off',
                    effectiveRule.countMode?.perFaction ? 'on' : 'off',
                  ),
                ) : undefined,
              )}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 2 right: Hidden level-window spacer (col 3, mirrors recipe builder) ─── */}
      {/* Invisible structural placeholder — same MUI Slider as the recipe builder's level-window
          so Row 2's grid height is always determined by the same element on both panels.
          When all three RRF sections are collapsed the slider collapses too, letting the row
          shrink to label-row height instead of remaining slider-tall. */}
      <Box aria-hidden="true" sx={{ gridColumn: '3 / 4', visibility: 'hidden' }}>
        {/* Label row mirrors the recipe builder's level-window header exactly (same components,
            same sx) so this spacer's height is always pixel-identical on every screen/zoom. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <BuilderSectionHeader id="mainStat" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} />
        </Box>
        {/* Collapse mirrors left columns: hide the slider when every RRF section is collapsed so
            the grid row height tracks the content rather than always being slider-tall. */}
        <Collapse in={!builderCollapsed.rank || !builderCollapsed.rarity || !builderCollapsed.faction} timeout="auto" unmountOnExit>
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
              display: 'block',
              '& .MuiSlider-track': { height: 4 },
              '& .MuiSlider-rail': { height: 4 },
              '& .MuiSlider-thumb': { width: 16, height: 16 },
            }}
          />
        </Box>
        </Collapse>
      </Box>

      {/* ── Row 3 left: Main stat + perMainStat chip ──────────────────────── */}
      <Box sx={(theme) => ({ gridColumn: '1 / 3', display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="mainStat" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.mainStat && mainStatSectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('builderMain')}</Box>
            </BuilderSectionHeader>
            {mainStatSectionDirty
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
              {/* mainStatGroupProps and mainStatGroupSx are pre-computed before the return statement. */}
              <>
                {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                <ToggleButtonGroup size="small" {...mainStatGroupProps} sx={mainStatGroupSx}>
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
                <ToggleButtonGroup size="small" {...mainStatGroupProps} sx={mainStatGroupSx}>
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
              {renderScopeChip('perMainStat', t('safeguardsCountModePerMain'), scopeActive.perMainStat, redundantDimensions.perMainStat, perScopeMixed.perMainStat,
                perMainStatOverrideActive ? renderSafeguardOverrideBadge(
                  buildSafeguardOverrideBadgeTooltip(
                    rule.countMode?.perMainStat ? 'on' : 'off',
                    effectiveRule.countMode?.perMainStat ? 'on' : 'off',
                  ),
                ) : undefined,
              )}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 3 right: Substats + match chips + weights ─────────────────── */}
      {/* gap: 0 so the Collapse wrapper div (height:0 when collapsed) does not create phantom spacing.
          The chips row adds its own mt: 0.75 inside the Collapse instead, which unmounts with the content. */}
      <Box sx={(theme) => ({ gridColumn: '3 / 5', display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
        <FormControl>
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="substats" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.substats && hasSubstatSelection ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('builderSubstats')}</Box>
            </BuilderSectionHeader>
            {hasSubstatSelection
              ? (
                <ClearIconButton
                  size="small"
                  aria-label={t('clear')}
                  tooltip={t('clear')}
                  onClick={() => {
                    updateRule((prev) => ({ ...prev, substats: [], substatMatch: SafeguardSubstatMatch.Min1, substatWeights: {} }))
                  }}
                />
              )
              : <Box sx={CLEAR_PLACEHOLDER_SX} />
            }
            {/* Override badge: shown when a safeguard-overrides block changes the required substats. */}
            {substatsOverrideActive && renderSafeguardOverrideBadge(
              buildSafeguardOverrideBadgeTooltip(
                substatsLabel(sortSafeguardSubstats(rule.substats ?? [])),
                substatsLabel(sortSafeguardSubstats(effectiveRule.substats ?? [])),
              ),
            )}
          </Box>
          <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {/* substatGroupProps and substatGroupSx are pre-computed before the return statement. */}
              <>
                {/* Row 1: SPD, CR%, CDMG%, ACC, RES */}
                <ToggleButtonGroup size="small" {...substatGroupProps} sx={substatGroupSx}>
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
                <ToggleButtonGroup size="small" {...substatGroupProps} sx={substatGroupSx}>
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
            </Box>
          </Collapse>
        </FormControl>
        {/* Substat match mode chips + weights button + improvement-chance threshold — all inline */}
        <Collapse in={!builderCollapsed.substats} timeout="auto" unmountOnExit>
        {/* mt: 0.75 provides the same 6px spacing that the outer Box gap used to supply, but only
            while the Collapse is mounted — preventing phantom height when the section is collapsed. */}
        {/* Same overflowX:'clip' trick as the mode row — allows badge protrusion while clipping horizontal */}
        <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap', overflowX: 'clip', ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX }}>
          {/* Min-count chips (≥1–≥4) + Per Substat chip + weights button.
              Clicking a count chip sets substatMatch to the corresponding threshold.
              Chips above the current substat selection count are disabled (can't be met).
              Per Substat applies the quota independently to each substat and closes weights. */}
          {/* Outer Box: position:relative anchors the substatMatch badge; MarkdownTooltip is moved
              inside to wrap only the chips so hovering either override badge does not
              simultaneously trigger the hint tooltip. */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0, gap: 0.5 }}>
          <MarkdownTooltip markdown={t('safeguardsSubstatRequirementHint')}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, gap: 0.5 }}>
              {SAFEGUARD_SUBSTAT_MIN_COUNTS.map((count) => {
                const countNum = parseInt(count, 10)
                // Chip is active when it matches the current (non-mixed) display mode.
                const isActive = !substatMatchMixed && displaySubstatMatch === count
                // Chips beyond the selection size cannot be satisfied; disable them.
                const overLimit = countNum > substatSelection.length
                const chipDisabled = (!hasSubstatSelection && !multiEditActive) || overLimit
                return (
                  <Chip
                    key={count}
                    size="small"
                    variant={isActive ? 'filled' : 'outlined'}
                    label={`\u2265${count}`}
                    aria-label={`${t('safeguardsSubstatRequirementLabel')} \u2265${count}`}
                    clickable={!chipDisabled}
                    disabled={chipDisabled}
                    onClick={() => {
                      if (chipDisabled) return
                      if (multiEditActive && multiEdit) {
                        multiEdit.updateField('substatMatch', { value: count, status: 'common' })
                        return
                      }
                      updateRule((prev) => ({ ...prev, substatMatch: count }))
                    }}
                    sx={{
                      ...builderStatusChipSx(isActive, { dimDisabled: true }),
                      ...(substatMatchMixed ? {
                        borderStyle: 'dashed',
                        borderColor: mixedBorderColor,
                        color: mixedTextColor,
                        backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                      } : {}),
                    }}
                  />
                )
              })}
              {/* Per Substat chip — mutually exclusive with count chips */}
              <Chip
                size="small"
                variant={!substatMatchMixed && displaySubstatMatch === SafeguardSubstatMatch.PerSubstat ? 'filled' : 'outlined'}
                label={t('safeguardsSubstatRequirementPer')}
                aria-label={t('safeguardsSubstatRequirementPer')}
                clickable={hasSubstatSelection || multiEditActive}
                disabled={!hasSubstatSelection && !multiEditActive}
                onClick={() => {
                  if (!hasSubstatSelection && !multiEditActive) return
                  // Close weights popover — Per Substat disables weight controls.
                  setWeightsAnchorEl(null)
                  if (multiEditActive && multiEdit) {
                    multiEdit.updateField('substatMatch', { value: SafeguardSubstatMatch.PerSubstat, status: 'common' })
                    return
                  }
                  updateRule((prev) => ({ ...prev, substatMatch: SafeguardSubstatMatch.PerSubstat }))
                }}
                sx={{
                  ...builderStatusChipSx(
                    !substatMatchMixed && displaySubstatMatch === SafeguardSubstatMatch.PerSubstat,
                    { dimDisabled: true },
                  ),
                  ...(substatMatchMixed ? {
                    borderStyle: 'dashed',
                    borderColor: mixedBorderColor,
                    color: mixedTextColor,
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                  } : {}),
                }}
              />
            </Box>
          </MarkdownTooltip>
          {/* Override badge on substat match chips: outside MarkdownTooltip so it has its own tooltip. */}
          {substatMatchOverrideActive && renderSafeguardOverrideBadge(
            buildSafeguardOverrideBadgeTooltip(
              substatMatchLabel(rule.substatMatch),
              substatMatchLabel(effectiveRule.substatMatch),
            ),
          )}
          {/* Weights configure button — attaches flush to the right of the chip row */}
          {/* Relative wrapper so the substat-weights override badge can float above the button. */}
          <Box sx={{ position: 'relative' }}>
            <IconButton
              size="small"
              aria-label={t('safeguardsSubstatWeightsLabel')}
              disabled={!hasSubstatSelection && !multiEditActive}
              onClick={(e) => setWeightsAnchorEl(e.currentTarget)}
              sx={(theme) => {
                const canInteract = hasSubstatSelection || multiEditActive
                const chipEnabled = hasSubstatSelection
                const bg = chipEnabled ? theme.custom.statusChipSuccessEnabledBg : theme.custom.statusChipDisabledBg
                // Light-mode base: darker success tone; dark-mode override via applyStyles.
                const color = chipEnabled
                  ? (theme.vars?.palette.success.dark ?? theme.palette.success.dark)
                  : (theme.vars?.palette.text.disabled ?? theme.palette.text.disabled)
                const colorDim = chipEnabled
                  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
                  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
                const colorDisabled = chipEnabled
                  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`
                  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`
                return {
                  height: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  width: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                  backgroundColor: bg,
                  color: canInteract ? color : colorDim,
                  '&:hover': canInteract ? { backgroundColor: theme.custom.statusChipSuccessHoverBg } : {},
                  '&.Mui-disabled': { backgroundColor: bg, opacity: 0.5, color: colorDisabled },
                  ...(chipEnabled ? theme.applyStyles('dark', {
                    color: canInteract
                      ? (theme.vars?.palette.success.light ?? theme.palette.success.light)
                      : `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`,
                    '&.Mui-disabled': { color: `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))` },
                  }) : {}),
                  ...(substatMatchMixed ? {
                    backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    color: mixedTextColor,
                  } : {}),
                }
              }}
            >
              <TuneIcon sx={{ fontSize: 14 }} />
            </IconButton>
            {/* Override badge: outside MarkdownTooltip so it has its own isolated tooltip. */}
            {substatWeightsOverrideActive && renderSafeguardOverrideBadge(
              buildSafeguardOverrideBadgeTooltip(
                weightsLabel(rule.substatWeights, sortSafeguardSubstats(rule.substats ?? [])),
                weightsLabel(effectiveRule.substatWeights, sortSafeguardSubstats(effectiveRule.substats ?? [])),
              ),
            )}
          </Box>
          </Box>{/* end outer position:relative anchor */}
          {/* Improvement-chance threshold chip woven with configure button.
              Chip toggles the threshold on/off; button opens the percentile popover.
              Same split-button pattern as Match: flat right side on chip, button attaches flush. */}
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Box sx={{ position: 'relative' }}>
              <MarkdownTooltip markdown={t('safeguardsImprovementChanceThresholdHint')} ellipsisTitle={t('safeguardsImprovementChanceThreshold')} ellipsisSelector=".MuiChip-label">
                <Chip
                  size="small"
                  variant="filled"
                  label={improvementChanceMixed
                    ? `${t('safeguardsImprovementChanceShort')}${NBSP}(${t('builderMultiEditMixedShort')})`
                    : (displayImprovementChanceEnabled && displayImprovementChanceThreshold
                      ? formatThresholdChipLabel(displayImprovementChanceThreshold)
                      : t('safeguardsImprovementChanceShort'))}
                  aria-label={t('safeguardsImprovementChanceThreshold')}
                  clickable
                  disabled={!hasSubstatSelection && !multiEditActive}
                  onClick={() => {
                    if (!hasSubstatSelection && !multiEditActive) return
                    if (multiEditActive && multiEdit) {
                      // Toggle: null ↔ last-used-or-Lenient in multi-edit mode.
                      const next = displayImprovementChanceEnabled
                        ? SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD
                        : getImprovementChanceEnableDefault()
                      multiEdit.updateField('improvementChanceThreshold', { value: next, status: 'common' })
                      return
                    }
                    // Single-edit toggle.
                    updateRule((prev) => ({
                      ...prev,
                      improvementChanceThreshold: prev.improvementChanceThreshold !== null
                        ? SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD
                        : getImprovementChanceEnableDefault(),
                    }))
                  }}
                  sx={{
                    // Show enabled (green) color when mixed — mirrors the flex chip pattern.
                    ...builderStatusChipSx(displayImprovementChanceEnabled || improvementChanceMixed, { dimDisabled: true }),
                    // Flatten right corners so the configure button fits flush.
                    borderRadius: `${STATUS_CHIP_BORDER_RADIUS_PX}px 0 0 ${STATUS_CHIP_BORDER_RADIUS_PX}px`,
                    // Full mixed overlay: dashed border + hatched gradient + muted text.
                    ...(improvementChanceMixed ? {
                      borderStyle: 'dashed',
                      borderColor: mixedBorderColor,
                      color: mixedTextColor,
                      backgroundImage: `linear-gradient(135deg, ${mixedPatternColor} 50%, transparent 50%)`,
                    } : {}),
                  }}
                />
              </MarkdownTooltip>
              {/* Override badge — shown in single-edit when a safeguard-overrides DSL block
                  has changed the improvement-chance threshold from its stored value. */}
              {improvementChanceOverrideActive && renderSafeguardOverrideBadge(
                buildSafeguardOverrideBadgeTooltip(
                  improvementChanceLabel(rule.improvementChanceThreshold),
                  improvementChanceLabel(effectiveRule.improvementChanceThreshold),
                ),
              )}
            </Box>
            {/* Configure button — interactive when the floor is active or mixed across rules */}
            <IconButton
              size="small"
              aria-label={t('safeguardsImprovementChanceThreshold')}
              disabled={(!hasSubstatSelection && !multiEditActive) || (!displayImprovementChanceEnabled && !improvementChanceMixed)}
              onClick={(e) => {
                // Capture the current bounding rect so the popover position is frozen
                // at open time — prevents drift when chip label resizes during editing.
                const rect = e.currentTarget.getBoundingClientRect()
                setImprovementChanceAnchorPos({ top: rect.bottom, left: rect.left })
                setImprovementChanceAnchorEl(e.currentTarget)
              }}
              sx={(theme) => {
                // Treat mixed as effectively enabled so the button stays interactive.
                const isEffectivelyEnabled = displayImprovementChanceEnabled || improvementChanceMixed
                const canInteract = (hasSubstatSelection || multiEditActive) && isEffectivelyEnabled
                const chipEnabled = isEffectivelyEnabled
                const bg = chipEnabled ? theme.custom.statusChipSuccessEnabledBg : theme.custom.statusChipDisabledBg
                // Light-mode base: darker success tone; dark-mode override via applyStyles.
                const color = chipEnabled
                  ? (theme.vars?.palette.success.dark ?? theme.palette.success.dark)
                  : (theme.vars?.palette.text.disabled ?? theme.palette.text.disabled)
                const colorDim = chipEnabled
                  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
                  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
                const colorDisabled = chipEnabled
                  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`
                  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`
                return {
                  height: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  width: BUILDER_STATUS_CHIP_HEIGHT_PX,
                  borderRadius: `0 ${STATUS_CHIP_BORDER_RADIUS_PX}px ${STATUS_CHIP_BORDER_RADIUS_PX}px 0`,
                  backgroundColor: bg,
                  color: canInteract ? color : colorDim,
                  borderLeft: `1px solid ${chipEnabled ? theme.custom.statusChipSuccessHoverBg : (theme.vars?.palette.divider ?? theme.palette.divider)}`,
                  '&:hover': canInteract ? { backgroundColor: theme.custom.statusChipSuccessHoverBg } : {},
                  '&.Mui-disabled': { backgroundColor: bg, opacity: 0.5, color: colorDisabled },
                  ...(chipEnabled ? theme.applyStyles('dark', {
                    color: canInteract
                      ? (theme.vars?.palette.success.light ?? theme.palette.success.light)
                      : `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`,
                    '&.Mui-disabled': { color: `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))` },
                  }) : {}),
                  // Mixed overlay when improvement-chance differs across selected rules.
                  ...(improvementChanceMixed ? {
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
      <Box sx={(theme) => ({ flex: '0 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
        <FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="slots" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0 }}>
              <Box component="span" sx={builderCollapsed.slots && slotSectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('builderSlots')}</Box>
            </BuilderSectionHeader>
            {slotSectionDirty
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
                      // Armor slots are incompatible with faction filters; disable when faction is active.
                      disabled={factionSectionDirty && !isAccessorySlot(id)}
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
              {renderScopeChip('perSlot', t('safeguardsCountModePerSlot'), scopeActive.perSlot, redundantDimensions.perSlot, perScopeMixed.perSlot,
                perSlotOverrideActive ? renderSafeguardOverrideBadge(
                  buildSafeguardOverrideBadgeTooltip(
                    rule.countMode?.perSlot ? 'on' : 'off',
                    effectiveRule.countMode?.perSlot ? 'on' : 'off',
                  ),
                ) : undefined,
              )}
            </Box>
          </Collapse>
        </FormControl>
      </Box>

      {/* ── Row 4 right: Sets selector + perSet chip ──────────────────────── */}
      {/* flex: '0 1 50%' always — collapses vertically to header only, never shrinks horizontally */}
      <Box sx={(theme) => ({ flex: '0 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75, borderRadius: 1, transition: UI_BG_HOVER_DANGER_TRANSITION, backgroundColor: hoverReset ? theme.custom.dangerTintBg : 'transparent' })}>
        <FormControl fullWidth>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BuilderSectionHeader id="sets" collapsed={builderCollapsed} onCollapsedChange={setBuilderCollapsed} labelSx={{ m: 0, flex: 1 }}>
              <Box component="span" sx={builderCollapsed.sets && setsSectionDirty ? [BUILDER_LABEL_TEXT_SX, { color: 'primary.main' }] : BUILDER_LABEL_TEXT_SX}>{t('setsTitle')}</Box>
            </BuilderSectionHeader>
            <MarkdownTooltip markdown={t('builderManageMetasetsTooltip')}>
              <Button
                size="small"
                variant="outlined"
                onClick={onManageMetasets}
                data-tour-id="builder.manage-metasets"
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
                  const normalized = normalizeArtifactSetSelections(nextSets)
                  // Always update the builder draft so the select reflects the new value immediately.
                  setRuleCombination((prev) => ({ ...prev, sets: normalized }))
                  // In multi-edit mode, also stage the change in the draft so the apply button enables.
                  if (multiEditActive && multiEdit) {
                    multiEdit.updateField('sets', { value: normalized, status: 'common' })
                  }
                }}
                metasets={metasets}
                selectedMetasetIds={combination.metaSetNames}
                onChangeMetasetIds={(nextMetaIds) => {
                  const deduped = dedupeStringArray(nextMetaIds)
                  setRuleCombination((prev) => ({ ...prev, metaSetNames: deduped }))
                  if (multiEditActive && multiEdit) {
                    multiEdit.updateField('metaSetNames', { value: deduped, status: 'common' })
                  }
                }}
                allowedSetIds={allowedSetPool}
                showMetasets
                layoutVersion={1}
                anyLabel={t('anySet')}
                onContextMenuSet={handleExcludeSet}
                onToggleSet={toggleSet}
                onToggleMetaset={toggleMetaset}
                {...(multiEditActive ? {
                  triStateForSet: getSetState,
                  triStateForMetaset: getMetasetState,
                  excludedSetIds: excludedSetUnion,
                  mixedLabel: t('builderMultiMixedValue'),
                } : {})}
              />
              {renderScopeChip('perSet', t('safeguardsCountModePerSet'), scopeActive.perSet, redundantDimensions.perSet, perScopeMixed.perSet,
                perSetOverrideActive ? renderSafeguardOverrideBadge(
                  buildSafeguardOverrideBadgeTooltip(
                    rule.countMode?.perSet ? 'on' : 'off',
                    effectiveRule.countMode?.perSet ? 'on' : 'off',
                  ),
                ) : undefined,
              )}
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
            {...insertHint.triggerProps}
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
            {...applyHint.triggerProps}
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
                ? t('builderApplyToSafeguards', { n: multiEditSelectionCount })
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
              onMouseEnter={(e) => { setHoverReset(true); resetHint.triggerProps.onMouseEnter(e) }}
              onMouseMove={resetHint.triggerProps.onMouseMove}
              onMouseLeave={() => { setHoverReset(false); resetHint.triggerProps.onMouseLeave() }}
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
        {insertHint.overlay}
        {applyHint.overlay}
        {resetHint.overlay}

        {/* Insert context menu — auto reset after insert */}
        <Menu
          anchorEl={insertMenuAnchor}
          open={Boolean(insertMenuAnchor)}
          onClose={closeInsertMenu}
          slotProps={{ paper: { ref: insertMenuPaperRef } }}
        >
          <MenuToggleRow label={t('builderMenuAutoResetAfterInsert')} checked={autoResetAfterInsert} onChange={() => { setAutoResetExclusive(!autoResetAfterInsert); closeInsertMenu() }} />
        </Menu>

        {/* Apply context menu — auto apply to selected */}
        <Menu
          anchorEl={applyMenuAnchor}
          open={Boolean(applyMenuAnchor)}
          onClose={closeApplyMenu}
          slotProps={{ paper: { ref: applyMenuPaperRef } }}
        >
          <MenuToggleRow label={t('safeguardsBuilderMenuAutoApplySelected')} checked={autoApplySelectedRecipe} onChange={() => { setAutoApplyExclusive(!autoApplySelectedRecipe); closeApplyMenu() }} />
        </Menu>

        {/* Reset context menu — save user defaults or revert to factory, mirrors recipe builder */}
        <Menu
          anchorEl={resetMenuAnchor}
          open={Boolean(resetMenuAnchor)}
          onClose={closeResetMenu}
          slotProps={{ paper: { ref: resetMenuPaperRef } }}
        >
          <MenuItem
            onClick={() => {
              closeResetMenu()
              // Save current rule (minus id) as user defaults; if identical to factory, clear the override.
              const factory = createFactorySafeguardBuilderDefaults()
              const current: Omit<SafeguardRule, 'id'> = {
                combination: rule.combination,
                ...(rule.appearance ? { appearance: rule.appearance } : {}),
                requiredCount: rule.requiredCount,
                activation: rule.activation,
                countMode: rule.countMode,
                ignorePreviousSafeguards: rule.ignorePreviousSafeguards,
                ignoreEquippedInCollection: rule.ignoreEquippedInCollection,
                ignoreEquippedInVault: rule.ignoreEquippedInVault,
                improvementChanceThreshold: rule.improvementChanceThreshold ?? null,
                substats: rule.substats ?? [],
                substatMatch: rule.substatMatch ?? SafeguardSubstatMatch.Min1,
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
            disabled={resetFactoryDefaultsDisabled}
            onClick={() => {
              closeResetMenu()
              // Factory defaults are already normalized at the source.
              const factory = createFactorySafeguardBuilderDefaults()
              onChange(() => ({ ...factory }))
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
              const sepLabel = parseSeparatorLabel(recipe.appearance?.name)
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

      {/* ── Improvement-chance threshold configure popover ───────────────────── */}
      <Popover
        open={Boolean(improvementChanceAnchorEl)}
        anchorEl={improvementChanceAnchorEl}
        onClose={handleImprovementChancePopoverClose}
        // Use a frozen position so the popover doesn't drift when the chip label
        // resizes (which shifts the anchor button) while the user edits values.
        anchorReference={improvementChanceAnchorPos ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={improvementChanceAnchorPos ?? undefined}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard: improvementChancePopoverGuard,
              onRequestClose: handleImprovementChancePopoverClose,
              closeLabel: t('close'),
            }),
            // ref must be forwarded separately (React Compiler restriction on refs in render-time spreads).
            // Without this, isTargetInsideAnyMenu always returns false → every click closes the popover.
            // Cast required: useContextMenuPaperGuard types the ref as Element, but Paper is always a div.
            ref: improvementChancePopoverMenuRef as React.RefObject<HTMLDivElement | null>,
          },
        }}
      >
        {/* Render body only while threshold is active to avoid stale layout during close animation. */}
        {improvementChancePopoverBody}
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
              // In multi-edit mode, read staged weight from draft; in single-edit use the effective
              // (overridden) weights so the slider reflects what will actually be evaluated.
              // effectiveRule equals the stored rule in multi-edit mode (empty instructions), so
              // no extra guard is needed here — consistent with other override display variables.
              const stagedWeights = multiEditActive && multiSubstatWeightsField?.dirty
                ? (multiSubstatWeightsField.value as Partial<Record<StatVariant, number>> ?? {})
                : (effectiveRule.substatWeights ?? {})
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
          <Box sx={{ flexShrink: 0, borderLeft: 1, borderColor: 'divider', pl: 1.5 }}>
            <MarkdownTooltip markdown={t('safeguardsCandidatesLabelTooltip')} placement="top">
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'inline-block' }}>
                {t('safeguardsCandidatesLabel')}
              </Typography>
            </MarkdownTooltip>
            <SafeguardCandidateRankList
              candidates={popoverCandidates}
              quota={rule?.requiredCount ?? 1}
              countMode={rule?.countMode}
              combination={rule?.combination}
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
              substatColumnCount={substatColumnCount}
              {...(rule?.appearance ? { ruleAppearance: rule.appearance } : {})}
              {...(editingRuleIdx !== null ? { ruleOrdinal: editingRuleIdx + 1 } : {})}
              {...(visibleItemKeys != null ? { visibleItemKeys } : {})}
              {...(onSelectCandidate ? { onSelectCandidate } : {})}
            />
          </Box>
        </Box>
      </Popover>
      </Box>{/* end inner grid */}
      </Box>{/* end scroll wrapper */}
      <ClearTagsConfirmDialog
        open={clearTagsConfirmOpen}
        context="safeguard"
        onClose={() => setClearTagsConfirmOpen(false)}
        onClear={handleClearTagsConfirm}
        onApplyAndClear={handleClearTagsApplyAndClear}
      />
    </Box>
  )
}
