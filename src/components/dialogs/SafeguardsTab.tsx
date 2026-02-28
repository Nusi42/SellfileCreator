import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputBase,
  Popover,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CheckIcon from '@mui/icons-material/Check'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import FilterListOffIcon from '@mui/icons-material/FilterListOff'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  buildSafeguardCombinationFromRecipe,
  cloneSafeguardCombination,
  cloneSafeguardRule,
  createEmptySafeguardCombination,
  createSafeguardRuleId,
  getSafeguardItemKey,
  normalizeSafeguardSubstatMatch,
  normalizeSafeguardRule,
  resolveSafeguardRulesWithMetasets,
  sanitizeSafeguardCountMode,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  pruneSafeguardsSubstatWeights,
  constrainSafeguardSubstats,
  safeguardWeightsEnabled,
  type SafeguardDetectionEntry,
  type SafeguardDetectionSnapshot,
  type SafeguardRule,
} from '../../lib/safeguards'
import { buildReadableSafeguardRuleEntry } from '../../lib/sfrIO'
import type { BuilderRecipe } from '../../lib/hsfBuilder/types'
import { parseRecipeNameDirectives } from '../../lib/recipeNameDirectives'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import type { ColorBlindMode } from '../../lib/constants'
import {
  BUILDER_AUTO_APPLY_DEBOUNCE_MS,
  ELLIPSIS_TEXT_SX,
  MENU_CONTROL_HEIGHT_PX,
  STANDARD_DIALOG_PADDING_BLOCK_UNITS,
  STANDARD_DIALOG_PADDING_INLINE_UNITS,
} from '../../lib/constants'
import type { StatVariant } from '../../lib/types'
import {
  StatVariant as StatVariantEnum,
  artifactTypeI18nKey,
  artifactTypeName,
  artifactSetName,
  compareArtifactTypes,
  factionI18nKey,
  formatRank,
  labelOfVariant,
  rarityCodeToName,
  statVariantI18nKey,
} from '../../lib/types'
import { slotSelectionAllowsAccessories } from '../../lib/gearInspectorDomain'
import { useI18n } from '../../lib/i18n'
import { readTextSafe, triggerCopyDialog, writeTextSafe } from '../../lib/clipboard'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSetsSelect, GearSlotSelect, GearSubstatSelect } from '../gear'
import { GearInspectorItemsGrid } from '../GearInspectorItemsGrid'
import GearInspectorOutcomeSummaryChip from '../GearInspectorOutcomeSummaryChip'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import WorkloadProgressIndicator from '../WorkloadProgressIndicator'
// MarkdownTooltip keeps the rule-count hints and info icons synchronized with the broader tooltip refactor.
import MarkdownTooltip from '../MarkdownTooltip'
import EllipsisTooltip from '../EllipsisTooltip'
import { RecipeContextMenu } from '../RecipeContextMenu'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from '../ContextMenuPaper'
import { summaryParts } from '../RecipeChip'
import PasteDialog from '../PasteDialog'
import type { SetStateAction } from 'react'
import type { Metaset } from '../../lib/metasets'
import { alpha, useTheme } from '@mui/material/styles'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { useSafeguardsGridColumnMode, useSafeguardsGridFilterMode } from '../../state/safeguardsPreferences'
import { useDisplayPreferences } from '../../state/preferencesState'
import { normalizeArtifactSetSelections } from '../../lib/gearSets/selection'
import { useKeepOverrideCombinationTools } from '../keepOverrides/useKeepOverrideCombinationTools'
import { KeepOverridePaneToggle } from '../keepOverrides/KeepOverridePaneToggle'
import { resolveAllowedSubstatsForSlotsAndMains } from '../../lib/statCompatibility'
import {
  KEEP_OVERRIDE_INLINE_SELECT_HEIGHT_PX,
  RuleSelectAffordances,
  dedupeNumericArray,
  dedupeStringArray,
  getMainStatOptionsForSlots,
  getRuleSelectPaddingSx,
} from '../keepOverrides/keepOverrideRuleUtils'
import {
  resolveKeepOverrideScopeActive,
  toggleKeepOverrideCountMode,
  type KeepOverrideScopeKey,
} from '../../lib/keepOverrideScope'
import { KeepOverrideScopeChip, KeepOverrideScopeField } from '../keepOverrides/KeepOverrideScopeChip'
import {
  KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_COMPACT_PX,
  KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_PX,
  resolveKeepOverrideGridPaneWidth,
} from '../../lib/keepOverrideLayout'
import {
  parseSpacingPx,
  GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS,
  GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS,
  GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS,
} from '../../lib/gearInspectorGridLayout'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT, GEAR_INSPECTOR_SORT_WEIGHT_STEP } from '../../lib/gearInspectorSort'
import { GearInspectorSortWeightControls } from '../GearInspectorSortWeightControls'
import { useContextMenuPaperGuard } from '../../hooks/useContextMenuPaperGuard'
import { createBuilderStatusChipSx } from '../builderStatusChipStyles'

// Keep-unique headers should stay a consistent height even when names wrap to two lines.
const SAFEGUARDS_RULE_HEADER_MIN_HEIGHT_PX = 56
// Collapse the intro copy once the user scrolls down in the rules pane.
const SAFEGUARDS_HEADER_COLLAPSE_SCROLL_PX = 4
// Chip labels should truncate consistently and rely on native ellipsis tooltips for overflow.
const SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX = {
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const
// Build a plain-text scope string used only for search filtering in the scaffold picker.
// The visual row uses summaryParts() from RecipeChip for full rich rendering.
function buildScaffoldScopeText(recipe: BuilderRecipe): string {
  const parts: string[] = []
  const rank = formatRank(recipe.rankCode)
  const rarity = rarityCodeToName(recipe.rarityCode)
  const scope = [rank, rarity].filter(Boolean).join('\u00A0')
  if (scope) parts.push(scope)
  if (recipe.artifactTypes && recipe.artifactTypes.length > 0) {
    const sorted = [...recipe.artifactTypes].sort(compareArtifactTypes)
    parts.push(sorted.map(id => artifactTypeName(id)).join(', '))
  }
  if (recipe.mainStatsV && recipe.mainStatsV.length > 0) {
    parts.push(recipe.mainStatsV.map(v => labelOfVariant(v)).join(', '))
  }
  if (recipe.artifactSets && recipe.artifactSets.length > 0) {
    const included = recipe.artifactSets.filter(e => !e.excluded)
    if (included.length > 0) {
      const shown = included.slice(0, 3).map(e => artifactSetName(e.id))
      const extra = included.length - 3
      parts.push(extra > 0 ? `${shown.join(', ')} +${extra}` : shown.join(', '))
    }
  }
  return parts.join(' | ')
}

// Extract the visible label from a separator recipe name, stripping color and style directives.
function parseSeparatorLabel(rawName: string | undefined): string {
  return parseRecipeNameDirectives(rawName, '').displayName.replace(/^#+\s*/, '').trim()
}



type SafeguardsTabProps = {
  rules: SafeguardRule[]
  enabled: boolean
  finalSellCoverageWarningActive: boolean
  onRulesChange: (next: SetStateAction<SafeguardRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: SafeguardDetectionSnapshot | null
  gearEntries: GearInspectorPreviewRow[]
  uniqueItemKeys: ReadonlySet<number>
  gearInspectorCardWidthPx: number | null
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  recipeNames: Array<string | null>
  metasets: Metaset[]
  recipes: readonly BuilderRecipe[]
  // One-shot parent request used by preview star clicks to focus this rule card.
  focusRuleRequest?: { ruleId: string; token: number } | null
  onJumpToRule?: ((ruleIndex: number, recipeIdx: number | null) => void) | undefined
  suppressMatchDetails?: boolean
  workloadProgressRatio: number
}

export default function SafeguardsTab({
  rules,
  enabled,
  finalSellCoverageWarningActive,
  onRulesChange,
  onToggleEnabled,
  detection,
  gearEntries,
  uniqueItemKeys,
  gearInspectorCardWidthPx,
  substatColors,
  useStatButtonColors,
  onToggleStatColors,
  onOpenManageColors,
  colorBlindMode,
  onChangeColorBlindMode,
  colorIconSrc,
  recipeNames,
  metasets,
  recipes,
  focusRuleRequest = null,
  onJumpToRule,
  suppressMatchDetails = false,
  workloadProgressRatio,
}: SafeguardsTabProps) {
  const { t, lang } = useI18n()
  const { showFactionIcons, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const { resolveAllowedSetPool, sanitizeCombinationForSlots } = useKeepOverrideCombinationTools(metasets)
  const theme = useTheme()
  // Keep builder-status chip styling centralized so match chips align with scope toggles.
  const builderStatusChipSx = useMemo(() => createBuilderStatusChipSx(theme), [theme])
  // Grid layout uses the same spacing units as the Gear Inspector grid.
  const gridGapPx = useMemo(() => parseSpacingPx(theme.spacing(GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS)), [theme])
  // Row padding is applied on both sides of the card row container.
  const gridRowPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS)), [theme])
  // Scroll container padding must be accounted for when sizing the grid pane.
  const gridContainerPaddingEndPx = useMemo(
    () => parseSpacingPx(theme.spacing(GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS)),
    [theme],
  )
  // Scrollbar width is measured from the grid so pane width stays aligned.
  const [gridScrollbarWidthPx, setGridScrollbarWidthPx] = useState(0)
  const clearLabel = t('clear')
  const ruleModeScopeTooltip = useMemo(() => (
    `${t('safeguardsRuleModeHint')}

${t('safeguardsCountModeHint')}

${t('safeguardsSubstatModeHint')}

${t('safeguardsIgnoreOptionsHint')}`
  ), [t])
  // Map substat match values to localized chip labels.
  const substatMatchLabels = useMemo(() => ({
    [SafeguardSubstatMatch.Any]: t('safeguardsSubstatRequirementAny'),
    [SafeguardSubstatMatch.All]: t('safeguardsSubstatRequirementAll'),
    [SafeguardSubstatMatch.PerSubstat]: t('safeguardsSubstatRequirementPer'),
  }), [t])
  // Match options keep the chip row ordering stable.
  const substatMatchOptions = useMemo(() => ([
    SafeguardSubstatMatch.Any,
    SafeguardSubstatMatch.All,
    SafeguardSubstatMatch.PerSubstat,
  ]), [])
  // Scope chip tooltips clarify how each toggle splits the quota.
  const safeguardScopeChipTooltips = useMemo(() => ({
    perSlot: t('safeguardsCountModePerSlotHint'),
    perSet: t('safeguardsCountModePerSetHint'),
    perFaction: t('safeguardsCountModePerFactionHint'),
    perMainStat: t('safeguardsCountModePerMainHint'),
  }), [t])
  // Warn when Safeguards runs without Final Sell covering 0–16 so users revisit the baseline sweep.
  const safeguardsFinalSellWarning = enabled && finalSellCoverageWarningActive
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id ?? null)
  const [respectManualDeselect, setRespectManualDeselect] = useState(false)
  // Keep expansion state separate from the selection used to highlight Gear Inspector rows; multiple cards can stay open.
  const [expandedRuleIds, setExpandedRuleIds] = useState<ReadonlySet<string>>(() => {
    const firstId = rules[0]?.id
    // When opening the tab, only auto-expand if there is exactly one rule; otherwise start fully collapsed.
    if (rules.length === 1 && firstId) return new Set([firstId])
    return new Set()
  })
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  const [scaffoldMenuAnchor, setScaffoldMenuAnchor] = useState<HTMLElement | null>(null)
  const [scaffoldSearchText, setScaffoldSearchText] = useState('')
  const [gridFilterMode, setGridFilterMode] = useSafeguardsGridFilterMode()
  const [gridColumnMode, setGridColumnMode] = useSafeguardsGridColumnMode()
  // Track which rule header is in inline rename mode.
  const [editingRuleNameId, setEditingRuleNameId] = useState<string | null>(null)
  // Hide the intro copy when the rules list scrolls down.
  const [rulesHeaderCollapsed, setRulesHeaderCollapsed] = useState(false)
  // Track which rule's action menu is currently open.
  const [ruleMenu, setRuleMenu] = useState<{ ruleId: string; x: number; y: number } | null>(null)
  // Manual paste dialog state when clipboard access is blocked or invalid.
  const [pasteDialogTarget, setPasteDialogTarget] = useState<{ mode: 'after' | 'end'; ruleId?: string } | null>(null)
  const [pasteDialogText, setPasteDialogText] = useState('')
  const [pasteDialogError, setPasteDialogError] = useState<string | null>(null)
  // Menu ref supports outside-click handling for the safeguard action menu.
  const ruleMenuRef = useRef<HTMLDivElement | null>(null)
  // Close handler keeps the menu in sync with rule edits.
  const closeRuleMenu = useCallback(() => {
    // Reset state so the menu unmounts.
    setRuleMenu(null)
  }, [])
  // Close helper resets the manual paste dialog state.
  const closePasteDialog = useCallback(() => {
    setPasteDialogTarget(null)
    setPasteDialogText('')
    setPasteDialogError(null)
  }, [])
  // Open the manual paste dialog for a specific target location.
  const openPasteDialog = useCallback((mode: 'after' | 'end', ruleId?: string, text = '') => {
    setPasteDialogTarget({ mode, ...(ruleId ? { ruleId } : {}) })
    setPasteDialogText(text)
    setPasteDialogError(null)
  }, [])
  // Guard ensures the menu closes cleanly when clicking outside.
  const { contextMenuGuard: ruleMenuGuard } = useContextMenuPaperGuard({
    open: Boolean(ruleMenu),
    onClose: closeRuleMenu,
    menuRef: ruleMenuRef,
  })
  const scaffoldMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeScaffoldMenu = useCallback(() => {
    setScaffoldMenuAnchor(null)
    setScaffoldSearchText('')
  }, [])
  const { contextMenuGuard: scaffoldMenuGuard } = useContextMenuPaperGuard({
    open: scaffoldMenuAnchor !== null,
    onClose: closeScaffoldMenu,
    menuRef: scaffoldMenuPaperRef,
  })
  // Column toggle between 1/2 keeps the grid width stable while changing density.
  const handleToggleGridColumns = useCallback(() => {
    // Flip between the only two supported modes.
    setGridColumnMode((prev) => (prev === 2 ? 1 : 2))
  }, [setGridColumnMode])
  const allRuleIds = useMemo(() => rules.map((rule) => rule.id), [rules])
  const rulesScrollRootRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  // Track scroll changes so the header can collapse without extra layout passes.
  const handleRulesScrollChange = useCallback((scrollTop: number) => {
    // Treat any scroll beyond the top edge as a collapse trigger.
    const nextCollapsed = scrollTop > SAFEGUARDS_HEADER_COLLAPSE_SCROLL_PX
    // Avoid redundant state updates during scroll.
    setRulesHeaderCollapsed((prev) => (prev === nextCollapsed ? prev : nextCollapsed))
  }, [])
  useEffect(() => {
    const scrollRoot = rulesScrollRootRef.current
    if (!scrollRoot) return
    // Sync once so the header state matches any retained scroll offset.
    handleRulesScrollChange(scrollRoot.scrollTop)
  }, [handleRulesScrollChange, rules.length])
  const scheduleScrollToRule = useCallback((ruleId: string) => {
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    // Adding/duplicating a rule updates state and triggers a render; retry for a few frames until the DOM node exists.
    const maxAttempts = 8
    const tryScroll = (attempt: number) => {
      const scrollRoot = rulesScrollRootRef.current
      const target = scrollRoot?.querySelector(`[data-safeguards-rule-id="${ruleId}"]`) as HTMLElement | null
      if (target) {
        target.scrollIntoView({ block: 'nearest' })
        scrollRafRef.current = null
        return
      }
      if (attempt >= maxAttempts) {
        scrollRafRef.current = null
        return
      }
      scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(attempt + 1))
    }
    scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(0))
  }, [])
  // Ensure pending scroll retries never outlive this tab instance.
  useEffect(() => () => {
    // Cancel the queued RAF and clear the handle to release captured refs.
    if (scrollRafRef.current === null) return
    window.cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = null
  }, [])
  const lastAppliedFocusTokenRef = useRef<number | null>(null)
  /* eslint-disable react-you-might-not-need-an-effect/no-derived-state -- External focus requests intentionally update local selection/expansion state. */
  useEffect(() => {
    if (!focusRuleRequest) return
    if (lastAppliedFocusTokenRef.current === focusRuleRequest.token) return
    lastAppliedFocusTokenRef.current = focusRuleRequest.token
    const requestedRuleId = focusRuleRequest.ruleId
    // Ignore stale requests when the referenced rule no longer exists.
    if (!rules.some((rule) => rule.id === requestedRuleId)) return
    // Keep selection/grid highlighting aligned with the externally requested rule.
    setSelectedRuleId(requestedRuleId)
    setRespectManualDeselect(false)
    // Ensure the requested card is visible and expanded for immediate editing.
    setExpandedRuleIds((prev) => {
      if (prev.has(requestedRuleId)) return prev
      const next = new Set(prev)
      next.add(requestedRuleId)
      return next
    })
    scheduleScrollToRule(requestedRuleId)
  }, [focusRuleRequest, rules, scheduleScrollToRule])
  /* eslint-enable react-you-might-not-need-an-effect/no-derived-state */
  const ensureSafeguardsEnabled = useCallback(() => {
    if (!enabled) onToggleEnabled(true)
  }, [enabled, onToggleEnabled])
  // Rule edits should immediately re-enable Safeguards so users never lose changes silently, except when disabling a rule.
  const mutateRules = useCallback(
    (action: SetStateAction<SafeguardRule[]>, ensureEnabled = true) => {
      if (ensureEnabled) ensureSafeguardsEnabled()
      onRulesChange(action)
    },
    [ensureSafeguardsEnabled, onRulesChange],
  )
  const effectiveSelectedRuleId = useMemo(() => {
    if (selectedRuleId === null) {
      if (respectManualDeselect) return null
      return rules[0]?.id ?? null
    }
    return rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : (rules[0]?.id ?? null)
  }, [respectManualDeselect, rules, selectedRuleId])

  const toggleAllExpandedRules = useCallback(() => {
    setExpandedRuleIds((prev) => {
      if (allRuleIds.length === 0) return prev
      const allExpanded = allRuleIds.every((id) => prev.has(id))
      return allExpanded ? new Set() : new Set(allRuleIds)
    })
  }, [allRuleIds])
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Rules can disappear outside local handlers, so we realign selection when the autosave payload swaps in. */
  useEffect(() => {
    if (rules.length !== 0) return
    if (selectedRuleId !== null) setSelectedRuleId(null)
    if (respectManualDeselect) setRespectManualDeselect(false)
  }, [respectManualDeselect, rules.length, selectedRuleId])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  const detectionEntries = useMemo(() => detection?.entries ?? [], [detection])
  // Resolve metaset-backed safeguards so the Gear Inspector overlay evaluates the same concrete set filters as detection.
  const resolvedRulesForUpgradeChance = useMemo(
    () => resolveSafeguardRulesWithMetasets(rules, metasets),
    [metasets, rules],
  )
  const detectionByRuleId = useMemo(() => {
    const map = new Map<string, SafeguardDetectionEntry>()
    for (const entry of detectionEntries) {
      if (entry.ruleId) map.set(entry.ruleId, entry)
    }
    return map
  }, [detectionEntries])
  const selectedEntry = effectiveSelectedRuleId ? detectionByRuleId.get(effectiveSelectedRuleId) ?? null : null
  const selectedItemKeys = useMemo(() => new Set<number>(selectedEntry?.itemKeys ?? []), [selectedEntry])
  const uniqueItemKeySet = uniqueItemKeys
  const uniqueRows = useMemo(() => {
    if (uniqueItemKeySet.size === 0) return []
    if (uniqueItemKeySet.size === gearEntries.length) return gearEntries
    return gearEntries.filter((row) => uniqueItemKeySet.has(getSafeguardItemKey(row.artifact)))
  }, [gearEntries, uniqueItemKeySet])
  const uniqueFilterActive = gearEntries.length > uniqueRows.length
  // Highlight callback lets the Gear Inspector grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedItemKeys.size === 0) return null
    return (row: GearInspectorPreviewRow) => selectedItemKeys.has(getSafeguardItemKey(row.artifact))
  }, [selectedEntry, selectedItemKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  // Treat selection mode as active whenever a rule is selected, even with zero matches.
  const selectionFilterApplied = gridFilterMode === 'selection' && Boolean(selectedEntry)
  const gridRows = useMemo(() => {
    if (!selectionFilterApplied) return uniqueRows
    // When a rule has zero matches, the selection filter should yield an empty grid.
    if (!highlightRowPredicate) return []
    return uniqueRows.filter((row) => highlightRowPredicate(row))
  }, [highlightRowPredicate, selectionFilterApplied, uniqueRows])
  const selectedVisibleRowCount = useMemo(() => {
    if (!selectedEntry || selectedEntry.itemKeys.length === 0) return 0
    let count = 0
    for (const key of selectedEntry.itemKeys) {
      if (uniqueItemKeySet.has(key)) count += 1
    }
    return count
  }, [selectedEntry, uniqueItemKeySet])
  const highlightFilterActive = highlightActive && !selectionFilterApplied && uniqueRows.length > selectedVisibleRowCount
  const gridFiltered = uniqueFilterActive || highlightFilterActive || selectionFilterApplied
  const hasPreviewGear = gearEntries.length > 0
  const selectionChipLabel = useMemo(() => {
    if (selectedEntry) {
      // Keep the detail chip focused on the highlighted combination whenever a rule is active.
      return t('safeguardsGridSelectedCount', { count: selectedVisibleRowCount })
    }
    if (gearEntries.length === 0 && uniqueRows.length === 0) return null
    // Reuse the shared count label for both selected and unique totals to keep localization simple.
    return t('safeguardsGridSelectedCount', { count: uniqueRows.length })
  }, [selectedEntry, selectedVisibleRowCount, gearEntries.length, t, uniqueRows.length])
  const selectionChipSummary = useMemo(() => {
    // Selected rule mode reports highlighted row count; default mode reports unique row count.
    const count = selectedEntry ? selectedVisibleRowCount : uniqueRows.length
    if (!selectedEntry && gearEntries.length === 0 && uniqueRows.length === 0) return null
    return {
      total: count,
      sold: 0,
      kept: count,
      keptBySafeguards: count,
    }
  }, [selectedEntry, selectedVisibleRowCount, gearEntries.length, uniqueRows.length])
  const gridFilterLabel = t('safeguardsGridFilterLabel', {
    mode: gridFilterMode === 'selection'
      ? t('safeguardsGridFilterModeSelection')
      : t('safeguardsGridFilterModeAll'),
  })

  const handleAddRule = useCallback(() => {
    const combination = createEmptySafeguardCombination()
    // Default new rules to per-set counting so cards immediately guard each combination.
    const newRule: SafeguardRule = {
      id: createSafeguardRuleId(),
      combination,
      name: '',
      requiredCount: 1,
      activation: SafeguardRuleActivation.ProtectExisting,
      countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
      ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
      ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
      ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
      substats: [],
      substatMatch: SafeguardSubstatMatch.Any,
      substatWeights: {},
    }
    mutateRules((prev) => [...prev, newRule])
    setSelectedRuleId(newRule.id)
    setRespectManualDeselect(false)
    setExpandedRuleIds((prev) => {
      const next = new Set(prev)
      next.add(newRule.id)
      return next
    })
    // Scroll only for explicit creation so normal edits never jump the list.
    scheduleScrollToRule(newRule.id)
  }, [mutateRules, scheduleScrollToRule, setRespectManualDeselect])

  const handleScaffoldFromRecipe = useCallback((recipeIndex: number) => {
    closeScaffoldMenu()
    const recipe = recipes[recipeIndex]
    if (!recipe || recipe.exportMode === 'separator') return
    const combination = buildSafeguardCombinationFromRecipe(recipe)
    const rawName = parseRecipeNameDirectives(recipe.name, '').displayName.trim()
    const fallback = `Recipe ${recipeIndex + 1}`
    const safeguardName = `Protect: ${rawName || fallback}`
    const newRule: SafeguardRule = {
      id: createSafeguardRuleId(),
      combination,
      name: safeguardName,
      requiredCount: 2,
      activation: SafeguardRuleActivation.AnticipateGaps,
      countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
      ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
      ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
      ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
      substats: [...(recipe.substatsV ?? [])],
      substatMatch: SafeguardSubstatMatch.Any,
      substatWeights: {},
    }
    mutateRules((prev) => {
      const idx = selectedRuleId !== null ? prev.findIndex((r) => r.id === selectedRuleId) : -1
      if (idx === -1) return [...prev, newRule]
      const next = [...prev]
      next.splice(idx + 1, 0, newRule)
      return next
    })
    setSelectedRuleId(newRule.id)
    setRespectManualDeselect(false)
    setExpandedRuleIds((prev) => { const next = new Set(prev); next.add(newRule.id); return next })
    scheduleScrollToRule(newRule.id)
  }, [closeScaffoldMenu, recipes, selectedRuleId, mutateRules, scheduleScrollToRule, setRespectManualDeselect])

  // Pre-compute display fields and apply search filter for the scaffold popover.
  const filteredScaffoldEntries = useMemo(() => {
    const query = scaffoldSearchText.trim().toLowerCase()
    const hasQuery = query.length > 0
    return recipes
      .map((recipe, originalIdx) => {
        const isSep = recipe.exportMode === 'separator'
        const nameDecoration = isSep ? null : parseRecipeNameDirectives(recipe.name, '')
        const displayName = nameDecoration?.displayName.trim() ?? ''
        const nameColor = nameDecoration?.hasExplicitColor ? nameDecoration.resolvedColor : undefined
        const scopeText = isSep ? '' : buildScaffoldScopeText(recipe)
        return { recipe, originalIdx, displayName, nameColor, scopeText }
      })
      .filter(({ recipe, displayName, scopeText }) => {
        if (recipe.exportMode === 'separator') return !hasQuery
        if (!hasQuery) return true
        return displayName.toLowerCase().includes(query) || scopeText.toLowerCase().includes(query)
      })
  }, [recipes, scaffoldSearchText])

  const handleDeleteRule = useCallback((ruleId: string) => {
    let filtered: SafeguardRule[] = []
    mutateRules((prev) => {
      filtered = prev.filter((rule) => rule.id !== ruleId)
      return filtered
    })
    // Close the rule menu when its target disappears.
    if (ruleMenu?.ruleId === ruleId) closeRuleMenu()
    if (filtered.length === 0) {
      if (selectedRuleId !== null) setSelectedRuleId(null)
      setRespectManualDeselect(false)
      return
    }
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(filtered[0]?.id ?? null)
      setRespectManualDeselect(false)
    }
    setExpandedRuleIds((prev) => {
      if (!prev.has(ruleId)) return prev
      const next = new Set(prev)
      next.delete(ruleId)
      return next
    })
  }, [closeRuleMenu, mutateRules, ruleMenu, selectedRuleId, setRespectManualDeselect])

  const handleCancelDeleteRule = useCallback(() => {
    setPendingDeleteRuleId(null)
  }, [])

  const handleConfirmDeleteRule = useCallback(() => {
    if (!pendingDeleteRuleId) return
    handleDeleteRule(pendingDeleteRuleId)
    setPendingDeleteRuleId(null)
  }, [handleDeleteRule, pendingDeleteRuleId])

  const handleDuplicateRule = useCallback((ruleId: string) => {
    // Resolve from the current rendered list so duplicate + selection stay in lockstep.
    const sourceIndex = rules.findIndex((rule) => rule.id === ruleId)
    if (sourceIndex === -1) return
    const source = rules[sourceIndex]
    if (!source) return
    // Generate the clone id up front so selection can reliably target the inserted rule.
    const cloneId = createSafeguardRuleId()
    const duplicated: SafeguardRule = {
      ...source,
      id: cloneId,
      combination: cloneSafeguardCombination(source.combination),
    }
    // Insert directly after the source rule so ordering mirrors the row action label.
    const next = rules.slice()
    next.splice(sourceIndex + 1, 0, duplicated)
    mutateRules(next)
    setSelectedRuleId(cloneId)
    setRespectManualDeselect(false)
    setExpandedRuleIds((prev) => {
      const next = new Set(prev)
      next.add(cloneId)
      return next
    })
    // Keep duplicate behavior aligned with add/paste: focus and reveal the new card.
    scheduleScrollToRule(cloneId)
  }, [mutateRules, rules, scheduleScrollToRule, setRespectManualDeselect])

  const updateRule = useCallback(
    (ruleId: string, updater: (rule: SafeguardRule) => SafeguardRule, ensureEnabled = true) => {
      mutateRules((prev) => prev.map((rule) => (rule.id === ruleId ? updater(rule) : rule)), ensureEnabled)
    },
    [mutateRules],
  )
  // Keep display-only name edits from waking the worker; buffer locally and commit on blur/Enter.
  // Use the shared debounce window so typing cadence matches other builder-side text inputs.
  const [pendingNameById, setPendingNameById] = useState<Map<string, string>>(() => new Map())
  // Track the active timer so fast typing only commits the last value.
  const nameCommitTimerRef = useRef<number | null>(null)
  const flushPendingName = useCallback((ruleId: string) => {
    // Read the staged value; if there is none, keep the persisted name untouched.
    const nextName = pendingNameById.get(ruleId)
    if (nextName === undefined) return
    // Only touch the rule when the value actually changed.
    updateRule(ruleId, (prev) => (prev.name === nextName ? prev : { ...prev, name: nextName }), true)
  }, [pendingNameById, updateRule])
  const cancelNameCommitTimer = useCallback(() => {
    // Cancel any pending commit so the next keypress replaces the draft schedule.
    if (nameCommitTimerRef.current !== null) {
      window.clearTimeout(nameCommitTimerRef.current)
      nameCommitTimerRef.current = null
    }
  }, [])
  const scheduleNameCommit = useCallback((ruleId: string) => {
    // Reset the debounce window on each keypress so we only persist once typing settles.
    cancelNameCommitTimer()
    nameCommitTimerRef.current = window.setTimeout(() => {
      nameCommitTimerRef.current = null
      // Flush the buffered name into the safeguard rule state once the debounce elapses.
      flushPendingName(ruleId)
    }, BUILDER_AUTO_APPLY_DEBOUNCE_MS)
  }, [cancelNameCommitTimer, flushPendingName])
  // Clean up the pending timer when the dialog unmounts.
  useEffect(() => () => cancelNameCommitTimer(), [cancelNameCommitTimer])
  // Enter inline rename mode and seed a draft value from the persisted rule name.
  const startRuleNameEdit = useCallback((ruleId: string, persistedName: string) => {
    setPendingNameById((prev) => {
      const next = new Map(prev)
      next.set(ruleId, persistedName ?? '')
      return next
    })
    setEditingRuleNameId(ruleId)
  }, [])
  // Leave inline rename mode, optionally committing the staged name.
  const finishRuleNameEdit = useCallback((ruleId: string, commit: boolean) => {
    cancelNameCommitTimer()
    if (commit) {
      flushPendingName(ruleId)
    } else {
      // Esc cancels edits by discarding the staged draft for this rule.
      setPendingNameById((prev) => {
        if (!prev.has(ruleId)) return prev
        const next = new Map(prev)
        next.delete(ruleId)
        return next
      })
    }
    setEditingRuleNameId((prev) => (prev === ruleId ? null : prev))
  }, [cancelNameCommitTimer, flushPendingName])

  const setRuleCombination = useCallback((
    ruleId: string,
    updater: (combination: SafeguardRule['combination']) => SafeguardRule['combination'],
  ) => {
    updateRule(ruleId, (rule) => {
      // Normalize combination ordering so UI chips and exports stay consistent.
      const nextCombination = sortSafeguardCombination(updater(rule.combination))
      return { ...rule, combination: nextCombination }
    })
  }, [updateRule])
  const handleToggleGridFilterMode = useCallback(() => {
    setGridFilterMode((prev) => (prev === 'all' ? 'selection' : 'all'))
  }, [setGridFilterMode])
  // Normalize clipboard payloads so paste accepts wrapper or raw rules.
  const parseSafeguardClipboardRules = useCallback((raw: string | null): SafeguardRule[] => {
    // Empty clipboard means nothing to paste.
    if (!raw || raw.trim().length === 0) return []
    try {
      // Parse JSON and strip the safeguard wrapper when present.
      const parsed = JSON.parse(raw)
      const candidate = (
        parsed && typeof parsed === 'object' && 'kind' in parsed && (parsed as { kind?: unknown }).kind === 'safeguardRule'
          ? (parsed as { rule?: unknown }).rule
          : parsed
      )
      const rawList = Array.isArray(candidate) ? candidate : [candidate]
      // Normalize into canonical rule shapes.
      const normalized = rawList
        .map((entry) => normalizeSafeguardRule(entry))
        .filter((entry): entry is SafeguardRule => Boolean(entry))
      if (normalized.length === 0) return []
      // Clone so future edits never mutate the parsed objects.
      return normalized.map((rule) => cloneSafeguardRule(rule))
    } catch {
      // Ignore malformed clipboard data.
      return []
    }
  }, [])
  // Insert cloned rules at the requested index and focus the first insertion.
  const insertSafeguardRulesAt = useCallback((rulesToInsert: SafeguardRule[], insertIndex: number) => {
    // Track new IDs for selection + scroll behavior.
    const newRuleIds: string[] = []
    mutateRules((prev) => {
      if (rulesToInsert.length === 0) return prev
      // Clamp the insertion index to a valid list position.
      const safeIndex = Math.min(Math.max(insertIndex, 0), prev.length)
      // Insert without mutating the previous array.
      const next = prev.slice()
      let offset = 0
      for (const sourceRule of rulesToInsert) {
        const clone = cloneSafeguardRule(sourceRule)
        const cloneId = createSafeguardRuleId()
        clone.id = cloneId
        newRuleIds.push(cloneId)
        next.splice(safeIndex + offset, 0, clone)
        offset += 1
      }
      return next
    })
    if (newRuleIds.length === 0) return
    const [firstId] = newRuleIds
    if (!firstId) return
    // Focus the inserted rule so the user sees the change.
    setSelectedRuleId(firstId)
    setRespectManualDeselect(false)
    setExpandedRuleIds((prev) => {
      const next = new Set(prev)
      next.add(firstId)
      return next
    })
    // Scroll the list to the newly inserted rule.
    scheduleScrollToRule(firstId)
  }, [mutateRules, scheduleScrollToRule, setRespectManualDeselect])
  // Copy a rule into memory + OS clipboard for reuse.
  const handleCopyRule = useCallback(async (ruleId: string) => {
    // Locate the source rule by id.
    const source = rules.find((rule) => rule.id === ruleId)
    if (!source) return
    // Convert to a readable SFR-style rule so clipboard JSON stays human-friendly.
    const snapshot = buildReadableSafeguardRuleEntry(source)
    // Wrap the payload to make safeguard rules detectable when pasting.
    const payload = { kind: 'safeguardRule', rule: snapshot }
    const text = JSON.stringify(payload, null, 2)
    // Write to clipboard, falling back to the manual copy dialog.
    const ok = await writeTextSafe(text)
    if (!ok) triggerCopyDialog(text)
  }, [rules])
  // Paste a rule after a given rule id.
  const handlePasteAfterRule = useCallback(async (ruleId: string) => {
    // Resolve the rule to paste.
    const text = await readTextSafe()
    const parsed = parseSafeguardClipboardRules(text)
    if (parsed.length > 0) {
      // Insert after the matching rule, or append if missing.
      const idx = rules.findIndex((entry) => entry.id === ruleId)
      const insertIndex = idx === -1 ? rules.length : idx + 1
      insertSafeguardRulesAt(parsed, insertIndex)
      return
    }
    // Fall back to the manual paste dialog if clipboard access fails or is invalid.
    openPasteDialog('after', ruleId, text ?? '')
  }, [insertSafeguardRulesAt, openPasteDialog, parseSafeguardClipboardRules, rules])
  // Paste a rule at the bottom of the list.
  const handlePasteAtEnd = useCallback(async () => {
    // Resolve the rule to paste.
    const text = await readTextSafe()
    const parsed = parseSafeguardClipboardRules(text)
    if (parsed.length > 0) {
      // Append so list order stays predictable.
      insertSafeguardRulesAt(parsed, rules.length)
      return
    }
    // Fall back to the manual paste dialog if clipboard access fails or is invalid.
    openPasteDialog('end', undefined, text ?? '')
  }, [insertSafeguardRulesAt, openPasteDialog, parseSafeguardClipboardRules, rules.length])
  // Reorder a rule to a specific index.
  const moveRule = useCallback((ruleId: string, targetIndex: number) => {
    mutateRules((prev) => {
      // Find the current index so we can move relative to it.
      const idx = prev.findIndex((rule) => rule.id === ruleId)
      if (idx === -1) return prev
      // Clamp to list bounds.
      const safeTarget = Math.min(Math.max(targetIndex, 0), prev.length - 1)
      if (safeTarget === idx) return prev
      // Splice out + reinsert the rule.
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      // Bail out if the splice failed to return an element.
      if (!moved) return prev
      next.splice(safeTarget, 0, moved)
      return next
    })
  }, [mutateRules])
  // Open the rule action menu at the pointer or button center.
  const openRuleMenu = useCallback((event: ReactMouseEvent<HTMLElement>, ruleId: string) => {
    // Prevent the native browser context menu.
    event.preventDefault()
    event.stopPropagation()
    // Align the selection with the menu target for predictable actions.
    setSelectedRuleId(ruleId)
    setRespectManualDeselect(false)
    // Fall back to the element center if pointer coords are unavailable.
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || Math.round(rect.left + rect.width / 2)
    const y = event.clientY || Math.round(rect.top + rect.height / 2)
    setRuleMenu({ ruleId, x, y })
  }, [setRespectManualDeselect, setSelectedRuleId])

  const renderRuleCard = (rule: SafeguardRule, ruleIndex: number) => {
    const ruleDisabled = rule.activation === SafeguardRuleActivation.Off
    const combination = rule.combination
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    const slotSelection = combination.slots
    // Build slot labels so the inline +X badge can count hidden selections.
    const slotSelectionLabels = slotSelection.map((slotId) => t(artifactTypeI18nKey(Number(slotId))))
    // Accessory-only sets (like no-set) are only valid when accessories are in scope.
    const hasAccessorySlot = slotSelectionAllowsAccessories(slotSelection)
    const allowedSetPool = resolveAllowedSetPool(slotSelection)
    const setSelection = normalizeArtifactSetSelections(combination.sets)
      .filter((entry) => allowedSetPool.includes(Number(entry.id)))
    const rankSelection = combination.ranks
    // Translate rank labels so the inline +X badge can count hidden selections.
    const rankSelectionLabels = rankSelection.map((rank) => {
      const clamped = Math.max(1, Math.min(6, Number(rank)))
      const key = clamped === 1 ? 'star1'
        : clamped === 2 ? 'star2'
          : clamped === 3 ? 'star3'
            : clamped === 4 ? 'star4'
              : clamped === 5 ? 'star5'
                : 'star6'
      return t(key)
    })
    const raritySelection = combination.rarities
    // Translate rarity labels so badge math matches the rendered summary text.
    const raritySelectionLabels = raritySelection.map((rarity) => {
      const clamped = Math.max(1, Math.min(6, Number(rarity)))
      return clamped === 1 ? t('rarityCommon')
        : clamped === 2 ? t('rarityUncommon')
          : clamped === 3 ? t('rarityRare')
            : clamped === 4 ? t('rarityEpic')
              : clamped === 5 ? t('rarityLegendary')
                : t('rarityMythical')
    })
    const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
    const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainStatOptions.includes(variant)))
    const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []
    // Translate faction labels so accessory filters report hidden entries precisely.
    const factionSelectionLabels = factionSelection.map((faction) => t(factionI18nKey(Number(faction))))
    // Substat selection is optional; leave empty to keep classic safeguard behavior.
    const allowedSubstatOptions = resolveAllowedSubstatsForSlotsAndMains({
      slots: slotSelection,
      mainStats: mainStatSelection,
    })
    const substatSelection = sortSafeguardSubstats((rule.substats ?? []).filter((variant) => (
      allowedSubstatOptions.includes(variant)
    )))
    // Translate substat labels so badge math stays consistent with the visible text.
    const substatSelectionLabels = substatSelection.map((variant) => t(statVariantI18nKey(variant)))
    const hasSubstatSelection = substatSelection.length > 0
    const effectiveSubstatMatch = hasSubstatSelection
      ? normalizeSafeguardSubstatMatch(rule.substatMatch)
      : SafeguardSubstatMatch.Any
    // SSOT: delegate to safeguardWeightsEnabled (only All mode qualifies).
    const showSubstatWeights = safeguardWeightsEnabled(rule.substatMatch, hasSubstatSelection)
    const selected = effectiveSelectedRuleId === rule.id
    const expanded = expandedRuleIds.has(rule.id)
    const selectRule = () => {
      // Keep selection synced to the most recent card interaction so the grid focus stays predictable.
      setSelectedRuleId(rule.id)
      // Explicit selection should clear manual deselect so defaults reapply on new interactions.
      setRespectManualDeselect(false)
    }
    const handleCardClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
      // Interactive controls manage their own clicks and should not trigger card-level capture selection.
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-rule-card-interactive="true"]')) return
      selectRule()
    }
    const toggleExpanded = () => {
      setExpandedRuleIds((prev) => {
        const next = new Set(prev)
        if (next.has(rule.id)) next.delete(rule.id)
        else next.add(rule.id)
        return next
      })
    }
    const handleRuleTitleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      // Title clicks now only control selection; disclosure is chevron-only.
      event.preventDefault()
      selectRule()
    }
    const beginRuleNameEdit = () => {
      // Keep selection aligned with the edited card.
      selectRule()
      startRuleNameEdit(rule.id, rule.name ?? '')
    }
    const handleStartRuleNameEdit = (event: ReactMouseEvent<HTMLElement>) => {
      // Editing should not trigger card capture handlers.
      event.preventDefault()
      event.stopPropagation()
      beginRuleNameEdit()
    }
    const deleteButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); setPendingDeleteRuleId(rule.id) }}
        aria-label={t('safeguardsDeleteRule')}
        color="error"
        sx={{ p: 0.5 }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )
    const duplicateButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); handleDuplicateRule(rule.id) }}
        aria-label={t('safeguardsDuplicateRule')}
        sx={{ p: 0.5 }}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    )
    const menuButton = (
      <IconButton
        size="small"
        aria-label={t('contextMenuHint')}
        data-rule-card-interactive="true"
        onClick={(event) => openRuleMenu(event, rule.id)}
        sx={{ p: 0.5, color: 'text.secondary' }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
    )
    const editNameButton = (
      <IconButton
        size="small"
        aria-label={t('safeguardsRuleNameLabel')}
        data-rule-card-interactive="true"
        onClick={handleStartRuleNameEdit}
        sx={{ p: 0.5, color: 'text.secondary' }}
      >
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
    )
    const actionButtons = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', flexShrink: 0 }}>
        {editNameButton}
        {menuButton}
        {duplicateButton}
        {deleteButton}
      </Box>
    )
    // Normalize the rule count mode so scope chips always reflect a stable shape.
    const countMode = sanitizeSafeguardCountMode(rule.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
    // Labels are shared between chips and the detection scope tooltip.
    const perSlotLabel = t('safeguardsCountModePerSlot')
    const perSetLabel = t('safeguardsCountModePerSet')
    const perFactionLabel = t('safeguardsCountModePerFaction')
    const perMainLabel = t('safeguardsCountModePerMain')
    // Ignore faction scope when accessories are not in this rule's slot filter.
    const effectiveCountMode = hasAccessorySlot
      ? countMode
      : sanitizeSafeguardCountMode({ ...countMode, perFaction: false })
    // Resolve which scope chips are currently active for the effective scope.
    const scopeActive = resolveKeepOverrideScopeActive(effectiveCountMode)
    // Legacy drafts may not have the new toggles persisted yet.
    const ignorePreviousSafeguards = rule.ignorePreviousSafeguards !== false
    // Equipped filters are opt-in and default to false for old payloads.
    const ignoreEquippedInCollection = rule.ignoreEquippedInCollection === true
    const ignoreEquippedInVault = rule.ignoreEquippedInVault === true
    const ignorePreviousLabel = t('safeguardsIgnorePreviousSafeguards')
    const ignoreCollectionLabel = t('safeguardsIgnoreEquippedInCollection')
    const ignoreVaultLabel = t('safeguardsIgnoreEquippedInVault')
    const ignorePreviousHint = t('safeguardsIgnorePreviousSafeguardsHint')
    const ignoreCollectionHint = t('safeguardsIgnoreEquippedInCollectionHint')
    const ignoreVaultHint = t('safeguardsIgnoreEquippedInVaultHint')
    // Toggle only the selected scope flag while preserving the rest.
    const handleScopeChipToggle = (scope: KeepOverrideScopeKey) => {
      if (ruleDisabled) return
      updateRule(rule.id, (prev) => {
        // Always toggle from a sanitized baseline to avoid drift.
        const prevMode = prev.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE
        const nextMode = toggleKeepOverrideCountMode(prevMode, scope)
        return { ...prev, countMode: nextMode }
      })
    }
    // Preconfigure the scope chips so each field can opt in easily.
    const renderScopeChip = (
      scope: KeepOverrideScopeKey,
      label: string,
      active: boolean,
      disabledOverride = false,
    ) => (
      <MarkdownTooltip markdown={safeguardScopeChipTooltips[scope]}>
        <span>
          <KeepOverrideScopeChip
            scope={scope}
            label={label}
            active={active}
            disabled={ruleDisabled || disabledOverride}
            onToggle={handleScopeChipToggle}
          />
        </span>
      </MarkdownTooltip>
    )

    const ruleCountsColor = (ruleDetection?.deficit ?? 0) > 0 ? 'error.main' : 'text.secondary'
    // Keep the quota explanation focused on scope; avoid mixing in raw "have/keep" labels.
    const detectionScopeLine = (() => {
      if (!ruleDetection) return ''
      // Mirror the same effective-scope rules used by the chips.
      const rawMode = sanitizeSafeguardCountMode(ruleDetection.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
      const mode = hasAccessorySlot
        ? rawMode
        : sanitizeSafeguardCountMode({ ...rawMode, perFaction: false })
      const scopeParts: string[] = []
      if (mode.perSlot) scopeParts.push(perSlotLabel)
      if (mode.perSet) scopeParts.push(perSetLabel)
      if (mode.perFaction) scopeParts.push(perFactionLabel)
      if (mode.perMainStat) scopeParts.push(perMainLabel)
      const scopeLabel = scopeParts.length > 0 ? scopeParts.join(' × ') : t('safeguardsCountModePerRule')
      return t('safeguardsRuleCountsPerGroupSuffix', {
        perGroup: ruleDetection.perGroupRequiredCount,
        scope: scopeLabel,
      })
    })()
    const ruleCountsMissingLine = ruleDetection
      ? t('safeguardsRuleCountsMissing', {
        missing: Math.max(0, Number(ruleDetection.deficit ?? 0)),
      })
      : ''
    const ruleCountsTooltip = [detectionScopeLine, ruleCountsMissingLine].filter(Boolean).join('\n')
    // Summary title: name is optional, so fall back to a muted placeholder for fast scanning.
    const rawName = (pendingNameById.get(rule.id) ?? rule.name ?? '').trim()
    const nameDecoration = parseRecipeNameDirectives(rawName || undefined, '')
    const summaryTitle = nameDecoration.displayName || `${t('testerRule')} ${ruleIndex + 1}`
    const isEditingRuleName = editingRuleNameId === rule.id
    // Summary status keeps the header scannable: checkmark when active, X when Off.
    const ruleActive = rule.activation !== SafeguardRuleActivation.Off
    const activeRuleLabel = (
      rule.activation === SafeguardRuleActivation.ProtectExisting
        ? t('safeguardsRuleModeProtect')
        : t('safeguardsRuleModeAnticipate')
    )
    const ruleStatus = ruleActive
      ? { label: activeRuleLabel, icon: <CheckIcon fontSize="small" />, color: 'success.main' }
      : { label: t('safeguardsRuleModeOff'), icon: <PauseCircleOutlineIcon fontSize="small" />, color: 'text.secondary' }
    return (
      <Box
        key={rule.id}
        // Capture clicks so any background or control interaction selects the card.
        onClickCapture={handleCardClickCapture}
        // Capture focus to support keyboard-driven activations selecting the card too.
        onFocusCapture={selectRule}
        sx={{
          borderRadius: '8px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider', // Selected rules now rely on the dialog's blue accent.
          bgcolor: 'inherit', // Match the surrounding dialog background so cards don't float on a separate surface.
          overflow: 'hidden', // Header/editor share an outline without double borders.
        }}
      >
        <Box
          // Header wrapper keeps the highlight while deferring toggle behavior to the title button.
          onContextMenu={(event) => openRuleMenu(event, rule.id)}
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gridTemplateRows: 'auto',
            columnGap: 1,
            alignItems: 'center',
            // Reserve space for a two-line name so expand/collapse never shifts the header height.
            minHeight: SAFEGUARDS_RULE_HEADER_MIN_HEIGHT_PX,
            px: 1.25,
            py: 0.875,
            textAlign: 'left',
            backgroundColor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
            borderBottom: expanded ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {/* Title area now separates select vs rename; chevron owns disclosure. */}
          <Box
            sx={{
              gridColumn: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              minWidth: 0,
              textAlign: 'left',
            }}
          >
            <Box
              component="span"
              aria-label={ruleStatus.label}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                flex: '0 0 auto',
                color: ruleStatus.color,
              }}
            >
              {ruleStatus.icon}
            </Box>
            {isEditingRuleName ? (
              <TextField
                fullWidth
                size="small"
                autoFocus
                data-rule-card-interactive="true"
                value={pendingNameById.get(rule.id) ?? rule.name ?? ''}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onChange={(event) => {
                  const raw = event.target.value ?? ''
                  setPendingNameById((prev) => {
                    const next = new Map(prev)
                    next.set(rule.id, raw)
                    return next
                  })
                  // Keep debounced persistence behavior while inline editing.
                  scheduleNameCommit(rule.id)
                }}
                onBlur={() => finishRuleNameEdit(rule.id, true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    finishRuleNameEdit(rule.id, true)
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    finishRuleNameEdit(rule.id, false)
                  }
                }}
              />
            ) : (
              <EllipsisTooltip title={summaryTitle}>
                <ButtonBase
                  onClick={handleRuleTitleClick}
                  onDoubleClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    beginRuleNameEdit()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'F2') return
                    event.preventDefault()
                    event.stopPropagation()
                    beginRuleNameEdit()
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: 0,
                    textAlign: 'left',
                    flex: 1,
                  }}
                >
                  <Typography
                    variant="body2"
                    data-ellipsis-target
                    sx={{
                      minWidth: 0,
                      fontWeight: 400,
                      fontStyle: rawName ? 'normal' : 'italic',
                      color: rawName
                        ? (nameDecoration.hasExplicitColor ? nameDecoration.resolvedColor : 'text.primary')
                        : 'text.secondary',
                      // Clamp to 2 lines (with ellipsis) without changing header height.
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {summaryTitle}
                  </Typography>
                </ButtonBase>
              </EllipsisTooltip>
            )}
          </Box>
          <Box
            sx={{
              gridColumn: 2,
              display: 'grid',
              gridAutoFlow: 'column',
              alignItems: 'center',
              justifyContent: 'end',
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            {actionButtons}
            <IconButton
              size="small"
              aria-label={expanded ? t('collapse') : t('expand')}
              sx={{ p: 0.5, color: 'text.secondary' }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.ctrlKey) {
                  // Ctrl+click on the chevron toggles all cards without changing per-rule selection.
                  toggleAllExpandedRules()
                  return
                }
                toggleExpanded()
              }}
              onContextMenu={(event) => {
                // Right-click on the chevron toggles all cards without showing the browser context menu.
                event.preventDefault()
                event.stopPropagation()
                toggleAllExpandedRules()
                // Expanding/collapsing all cards can shift content; restore the clicked card into view.
                scheduleScrollToRule(rule.id)
              }}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
        {expanded ? (
          <Stack spacing={1.5} sx={{ p: 1.25 }}>
          {/* Scope-aware filters and per-rule requirements live inside the expanded section. */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
              gap: 1,
            }}
          >
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: '1 1 320px', minWidth: 0 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={rule.activation}
                onChange={(_event, next) => {
                  if (!next) return
                  updateRule(
                    rule.id,
                    (prev) => (prev.activation === next ? prev : { ...prev, activation: next }),
                    next !== SafeguardRuleActivation.Off,
                  )
                }}
                data-rule-card-interactive="true"
                sx={{ display: 'flex', width: '100%', borderRadius: '8px', overflow: 'hidden' }}
              >
                <ToggleButton
                  value={SafeguardRuleActivation.Off}
                  aria-label={t('safeguardsRuleModeOff')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('safeguardsRuleModeOff')}>
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
                      {t('safeguardsRuleModeOffShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
                <ToggleButton
                  value={SafeguardRuleActivation.ProtectExisting}
                  aria-label={t('safeguardsRuleModeProtect')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('safeguardsRuleModeProtect')}>
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
                      {t('safeguardsRuleModeProtectShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
                <ToggleButton
                  value={SafeguardRuleActivation.AnticipateGaps}
                  aria-label={t('safeguardsRuleModeAnticipate')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('safeguardsRuleModeAnticipate')}>
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
                      {t('safeguardsRuleModeAnticipateShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                alignSelf: 'stretch',
                color: 'text.secondary',
                minWidth: 32,
              }}
            >
              <MarkdownTooltip markdown={ruleModeScopeTooltip}>
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label={t('safeguardsRuleModeHintLabel')}
                  sx={{
                    p: 0.25,
                    fontSize: 16,
                    '&:hover': { color: 'text.primary' },
                    '&:focus-visible': { color: 'text.primary' },
                  }}
                >
                  <InfoOutlinedIcon fontSize="inherit" />
                </IconButton>
              </MarkdownTooltip>
            </Box>
          </Box>
          <Stack spacing={1}>
            {/* Slots + sets anchor the per-group keep scope. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <KeepOverrideScopeField chip={renderScopeChip('perSlot', perSlotLabel, scopeActive.perSlot)}>
                {/* Slot filters drive the accessory/armor split and allowed set pool. */}
                <RuleSelectAffordances
                  selectionCount={slotSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  layoutVersion={gridColumnMode}
                  selectionLabels={slotSelectionLabels}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, slots: [] }))
                  }}
                >
                  <GearSlotSelect
                    multiple
                    anyLabel={t('anySlot')}
                    value={slotSelection}
                    onChange={(nextSlots) => {
                      if (ruleDisabled) return
                      updateRule(rule.id, (prev) => {
                        const nextCombination = sanitizeCombinationForSlots(nextSlots, prev.combination)
                        return constrainSafeguardSubstats(prev, nextCombination)
                      })
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(slotSelection.length, KEEP_OVERRIDE_INLINE_SELECT_HEIGHT_PX)}
                  />
                </RuleSelectAffordances>
              </KeepOverrideScopeField>
              <KeepOverrideScopeField chip={renderScopeChip('perSet', perSetLabel, scopeActive.perSet)}>
                {/* Set selection can be per-group scoped like slots. */}
                <GearSetsSelect
                  disabled={ruleDisabled}
                  value={setSelection}
                  onChange={(nextSets) => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, sets: normalizeArtifactSetSelections(nextSets) }))
                  }}
                  metasets={metasets}
                  selectedMetasetIds={combination.metaSetIds}
                  onChangeMetasetIds={(nextMetaIds) => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, metaSetIds: dedupeStringArray(nextMetaIds) }))
                  }}
                  allowedSetIds={allowedSetPool}
                  showMetasets
                  layoutVersion={gridColumnMode}
                  anyLabel={t('anySet')}
                  // Show the no-set option only when accessories are in scope.
                  includeNoSet={hasAccessorySlot}
                />
              </KeepOverrideScopeField>
            </Box>
            {/* Rank and rarity filters are always global per rule. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <KeepOverrideScopeField>
                {/* Rank selection controls which tiers count toward uniqueness. */}
                <RuleSelectAffordances
                  selectionCount={rankSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  layoutVersion={gridColumnMode}
                  selectionLabels={rankSelectionLabels}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, ranks: [] }))
                  }}
                >
                  <GearRankSelect
                    multiple
                    allowAny
                    anyLabel={t('anyRank')}
                    value={rankSelection}
                    onChange={(nextRanks) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, ranks: nextRanks }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(rankSelection.length)}
                  />
                </RuleSelectAffordances>
              </KeepOverrideScopeField>
              <KeepOverrideScopeField>
                {/* Rarity selection caps which tiers get counted. */}
                <RuleSelectAffordances
                  selectionCount={raritySelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  layoutVersion={gridColumnMode}
                  selectionLabels={raritySelectionLabels}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, rarities: [] }))
                  }}
                >
                  <GearRaritySelect
                    multiple
                    allowAny
                    anyLabel={t('anyRarity')}
                    value={raritySelection}
                    onChange={(nextRarities) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, rarities: nextRarities }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(raritySelection.length)}
                  />
                </RuleSelectAffordances>
              </KeepOverrideScopeField>
            </Box>
            {/* Main stats and faction scopes can be per-group if enabled. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <KeepOverrideScopeField chip={renderScopeChip('perMainStat', perMainLabel, scopeActive.perMainStat)}>
                {/* Main stat filters help separate duplicates across substat targets. */}
                <RuleSelectAffordances
                  selectionCount={mainStatSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  layoutVersion={gridColumnMode}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, mainStats: [] }))
                  }}
                >
                  <GearMainStatSelect
                    multiple
                    value={mainStatSelection}
                    options={mainStatOptions}
                    anyValue={StatVariantEnum.Any as StatVariant}
                    anyLabel={t('anyMainStat')}
                    onChange={(nextMain) => {
                      if (ruleDisabled) return
                      updateRule(rule.id, (prev) => {
                        const nextCombination = { ...prev.combination, mainStats: dedupeNumericArray(nextMain) }
                        return constrainSafeguardSubstats(prev, nextCombination)
                      })
                    }}
                    colorOverrides={substatColors}
                    showBorderColors={useStatButtonColors}
                    size="small"
                    sx={getRuleSelectPaddingSx(mainStatSelection.length)}
                  />
                </RuleSelectAffordances>
              </KeepOverrideScopeField>
              {/* Keep the faction selector visible so users understand why accessory-only filters are required. */}
              <KeepOverrideScopeField chip={renderScopeChip('perFaction', perFactionLabel, scopeActive.perFaction, !hasAccessorySlot)}>
                {/* Faction filters are restricted to accessory slots. */}
                <RuleSelectAffordances
                  selectionCount={factionSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  layoutVersion={gridColumnMode}
                  selectionLabels={factionSelectionLabels}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, factions: [] }))
                  }}
                >
                  <GearFactionSelect
                    multiple
                    disabled={ruleDisabled || !hasAccessorySlot}
                    anyLabel={t('anyFaction')}
                    value={factionSelection}
                    onChange={(nextFactions) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, factions: dedupeNumericArray(nextFactions) }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(factionSelection.length, KEEP_OVERRIDE_INLINE_SELECT_HEIGHT_PX)}
                  />
                </RuleSelectAffordances>
              </KeepOverrideScopeField>
            </Box>
            {/* Substat filters and ranking weights live together so users understand the linkage. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
              <KeepOverrideScopeField>
                <Stack spacing={0.75}>
                  {/* Substat selections filter eligible items before any ranking occurs. */}
                  <RuleSelectAffordances
                    selectionCount={substatSelection.length}
                    clearLabel={clearLabel}
                    disabled={ruleDisabled}
                    layoutVersion={gridColumnMode}
                    selectionLabels={substatSelectionLabels}
                    onClear={() => {
                      if (ruleDisabled) return
                      updateRule(rule.id, (prev) => ({
                        ...prev,
                        substats: [],
                        substatMatch: SafeguardSubstatMatch.Any,
                        substatWeights: {},
                      }))
                    }}
                  >
                    <GearSubstatSelect
                      multiple
                      anyLabel={t('anySubstat')}
                      value={substatSelection}
                      options={allowedSubstatOptions}
                      normalizedMenu
                      renderNormalizedMenuControl={({ variant, label, selected }) => {
                        // Hide weight controls unless Any/All is active (keeps Per Substat lightweight).
                        if (!showSubstatWeights) return null
                        // Only show weight controls for selected substats; unselected rows keep the ghost badge.
                        if (!selected) return null
                        // Normalize the stored weight so the control stays in the shared 0.05 step grid.
                        const rawWeight = Number(rule.substatWeights?.[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
                        const weight = normalizeGearInspectorSortWeight(rawWeight)
                        return (
                          <Box
                            // Stop menu row toggles when the user clicks the weight controls.
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            sx={{ display: 'inline-flex' }}
                          >
                            <GearInspectorSortWeightControls
                              label={label}
                              enabled={!ruleDisabled}
                              weight={weight}
                              onBump={(deltaSteps) => {
                                if (ruleDisabled) return
                                updateRule(rule.id, (prev) => {
                                  // Always normalize the weight so stored values stay consistent.
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
                                  return { ...prev, substatWeights: nextWeights }
                                })
                              }}
                              onReset={() => {
                                if (ruleDisabled) return
                                updateRule(rule.id, (prev) => {
                                  // Drop the key entirely to keep the payload sparse.
                                  const rawWeights = prev.substatWeights ?? {}
                                  if (!rawWeights[variant]) return prev
                                  const nextWeights = { ...rawWeights }
                                  delete nextWeights[variant]
                                  return { ...prev, substatWeights: nextWeights }
                                })
                              }}
                            />
                          </Box>
                        )
                      }}
                      onChange={(nextSubstats) => {
                        if (ruleDisabled) return
                        const filtered = nextSubstats.filter((variant) => allowedSubstatOptions.includes(variant))
                        const sorted = sortSafeguardSubstats(filtered)
                        updateRule(rule.id, (prev) => {
                          const nextMatch = sorted.length > 0
                            ? prev.substatMatch
                            : SafeguardSubstatMatch.Any
                          const nextWeights = pruneSafeguardsSubstatWeights(prev.substatWeights, sorted)
                          return {
                            ...prev,
                            substats: sorted,
                            substatMatch: nextMatch,
                            substatWeights: nextWeights,
                          }
                        })
                      }}
                      colorOverrides={substatColors}
                      showBorderColors={useStatButtonColors}
                      size="small"
                      sx={getRuleSelectPaddingSx(substatSelection.length, KEEP_OVERRIDE_INLINE_SELECT_HEIGHT_PX)}
                    />
                  </RuleSelectAffordances>
                  <Box sx={{ mb: 0.5 }}>
                    <MarkdownTooltip markdown={t('safeguardsSubstatRequirementHint')}>
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          gap: 1,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX,
                        }}
                      >
                        {substatMatchOptions.map((option) => {
                          const active = effectiveSubstatMatch === option
                          const label = substatMatchLabels[option]
                            ?? substatMatchLabels[SafeguardSubstatMatch.Any]
                          return (
                            <EllipsisTooltip key={option} title={label} selector=".MuiChip-label">
                              <Chip
                                size="small"
                                variant="filled"
                                label={label}
                                aria-label={t('safeguardsSubstatRequirementLabel')}
                                data-rule-card-interactive="true"
                                clickable
                                disabled={ruleDisabled || !hasSubstatSelection}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  if (ruleDisabled || !hasSubstatSelection) return
                                  if (option === effectiveSubstatMatch) return
                                  updateRule(rule.id, (prev) => ({ ...prev, substatMatch: option }))
                                }}
                                sx={builderStatusChipSx(active, { dimDisabled: true })}
                              />
                            </EllipsisTooltip>
                          )
                        })}
                      </Box>
                    </MarkdownTooltip>
                  </Box>
                </Stack>
              </KeepOverrideScopeField>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: '0 0 auto' }}>
                {/* Keep the info glyph on the same line as the quota so it no longer consumes a separate row. */}
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label={t('safeguardsRequiredCount')}
                  value={rule.requiredCount}
                  disabled={ruleDisabled}
                  onChange={(event) => {
                    const raw = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1)))
                    updateRule(rule.id, (prev) => ({ ...prev, requiredCount: raw }))
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">≥</InputAdornment>,
                    endAdornment: (
                      <NumberSpinnerAdornment
                        ariaLabel={t('safeguardsRequiredCount')}
                        onStep={(delta) => {
                          if (ruleDisabled) return
                          updateRule(rule.id, (prev) => {
                            const next = Math.max(1, Math.min(9999, Math.floor((prev.requiredCount ?? 1) + delta)))
                            return { ...prev, requiredCount: next }
                          })
                        }}
                      />
                    ),
                  }}
                  sx={(themeInner) => ({
                    flex: '0 0 auto',
                    maxWidth: 130, // Slightly wider so long translations can still read the quantity without wrapping.
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      WebkitAppearance: 'none',
                      margin: 0,
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                    '& input': {
                      textAlign: 'right',
                      paddingRight: themeInner.spacing(1),
                      paddingLeft: themeInner.spacing(0.5),
                    },
                  })}
                  inputProps={{
                    min: 1,
                    step: 1,
                    max: 9999, // UI enforces realistic quotas while still allowing manual entry if needed.
                  }}
                />
                {ruleDetection ? (
                  <MarkdownTooltip markdown={ruleCountsTooltip}>
                    <IconButton
                      size="small"
                      color="inherit"
                      aria-label={ruleCountsTooltip}
                      sx={{
                        p: 0.25,
                        fontSize: 16,
                        color: ruleCountsColor,
                        // Mirror the old label's warning color while keeping hover/focus consistent.
                        '&:hover': { color: ruleCountsColor === 'error.main' ? 'error.dark' : 'text.primary' },
                        '&:focus-visible': { color: ruleCountsColor === 'error.main' ? 'error.dark' : 'text.primary' },
                      }}
                    >
                      <InfoOutlinedIcon fontSize="inherit" />
                    </IconButton>
                  </MarkdownTooltip>
                ) : null}
              </Box>
              <Box
                sx={{
                  // Split safeguard toggles across two rows for better label readability.
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                  flex: 1,
                  minWidth: 0,
                  '& .MuiChip-root': {
                    width: '100%',
                  },
                  ...SAFEGUARDS_CHIP_LABEL_ELLIPSIS_SX,
                }}
              >
                {/* Keep toggles as chips so state styling matches other safeguard controls. */}
                <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                  <MarkdownTooltip
                    markdown={ignorePreviousHint}
                    ellipsisTitle={ignorePreviousLabel}
                    ellipsisSelector=".MuiChip-label"
                  >
                    <Chip
                      size="small"
                      variant="filled"
                      label={ignorePreviousLabel}
                      aria-label={ignorePreviousLabel}
                      data-rule-card-interactive="true"
                      clickable
                      // Keep these toggles editable even when mode is Off.
                      disabled={false}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        updateRule(rule.id, (prev) => ({
                          ...prev,
                          ignorePreviousSafeguards: !ignorePreviousSafeguards,
                        }))
                      }}
                      sx={builderStatusChipSx(ignorePreviousSafeguards, { dimDisabled: true })}
                    />
                  </MarkdownTooltip>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <MarkdownTooltip
                    markdown={ignoreCollectionHint}
                    ellipsisTitle={ignoreCollectionLabel}
                    ellipsisSelector=".MuiChip-label"
                  >
                    <Chip
                      size="small"
                      variant="filled"
                      label={ignoreCollectionLabel}
                      aria-label={ignoreCollectionLabel}
                      data-rule-card-interactive="true"
                      clickable
                      // Keep these toggles editable even when mode is Off.
                      disabled={false}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        updateRule(rule.id, (prev) => ({
                          ...prev,
                          ignoreEquippedInCollection: !ignoreEquippedInCollection,
                        }))
                      }}
                      sx={builderStatusChipSx(ignoreEquippedInCollection, { dimDisabled: true })}
                    />
                  </MarkdownTooltip>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <MarkdownTooltip
                    markdown={ignoreVaultHint}
                    ellipsisTitle={ignoreVaultLabel}
                    ellipsisSelector=".MuiChip-label"
                  >
                    <Chip
                      size="small"
                      variant="filled"
                      label={ignoreVaultLabel}
                      aria-label={ignoreVaultLabel}
                      data-rule-card-interactive="true"
                      clickable
                      // Keep these toggles editable even when mode is Off.
                      disabled={false}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        updateRule(rule.id, (prev) => ({
                          ...prev,
                          ignoreEquippedInVault: !ignoreEquippedInVault,
                        }))
                      }}
                      sx={builderStatusChipSx(ignoreEquippedInVault, { dimDisabled: true })}
                    />
                  </MarkdownTooltip>
                </Box>
              </Box>
            </Box>
          </Stack>
          </Stack>
        ) : null}
      </Box>
    )
  }

  const deleteDialogOpen = pendingDeleteRuleId !== null
  const pasteDialogOpen = Boolean(pasteDialogTarget)
  const pasteDialogConfirmLabel = pasteDialogTarget?.mode === 'after'
    ? t('chipMenuPasteAfter')
    : t('chipsMenuPasteAtEnd')
  const handleConfirmPasteDialog = useCallback(() => {
    // Parse the manual paste text into safeguard rules.
    const parsed = parseSafeguardClipboardRules(pasteDialogText)
    if (parsed.length === 0) {
      setPasteDialogError('No valid safeguard rule found in pasted text')
      return
    }
    // Decide insertion index based on the target mode.
    const mode = pasteDialogTarget?.mode ?? 'end'
    const insertIndex = mode === 'after'
      ? (() => {
        const idx = pasteDialogTarget?.ruleId
          ? rules.findIndex((rule) => rule.id === pasteDialogTarget.ruleId)
          : -1
        return idx === -1 ? rules.length : idx + 1
      })()
      : rules.length
    insertSafeguardRulesAt(parsed, insertIndex)
    closePasteDialog()
  }, [
    closePasteDialog,
    insertSafeguardRulesAt,
    parseSafeguardClipboardRules,
    pasteDialogTarget,
    pasteDialogText,
    rules,
  ])

  return (
    <>
      <RecipeContextMenu
        open={Boolean(ruleMenu)}
        anchorPosition={ruleMenu ? { top: ruleMenu.y, left: ruleMenu.x } : null}
        onClose={closeRuleMenu}
        paperRef={ruleMenuRef}
        paperDataTourId="keepuniques.rule-menu"
        onPaperContextMenu={(event) => {
          // Keep right-clicks inside the menu from showing the browser menu.
          event.preventDefault()
          event.stopPropagation()
        }}
        contextMenuGuard={ruleMenuGuard}
        actions={(() => {
          // Skip actions when the menu is closed to avoid stale handlers.
          if (!ruleMenu) return {}
          // Resolve the current index so move actions can disable correctly.
          const idx = rules.findIndex((rule) => rule.id === ruleMenu.ruleId)
          const isFirst = idx <= 0
          const isLast = idx < 0 || idx === rules.length - 1
          return {
            moveTop: { handler: () => moveRule(ruleMenu.ruleId, 0), disabled: isFirst },
            moveUp: { handler: () => moveRule(ruleMenu.ruleId, idx - 1), disabled: isFirst },
            moveDown: { handler: () => moveRule(ruleMenu.ruleId, idx + 1), disabled: isLast },
            moveBottom: { handler: () => moveRule(ruleMenu.ruleId, rules.length - 1), disabled: isLast },
            copyRecipe: () => handleCopyRule(ruleMenu.ruleId),
            pasteAfter: () => handlePasteAfterRule(ruleMenu.ruleId),
            pasteAtEnd: handlePasteAtEnd,
          }
        })()}
      />
      <PasteDialog
        open={pasteDialogOpen}
        text={pasteDialogText}
        error={pasteDialogError}
        confirmLabel={pasteDialogConfirmLabel}
        onTextChange={(value) => {
          setPasteDialogText(value)
          if (pasteDialogError) setPasteDialogError(null)
        }}
        onCancel={closePasteDialog}
        onConfirm={handleConfirmPasteDialog}
      />
      <Dialog open={deleteDialogOpen} onClose={handleCancelDeleteRule}>
        <DialogTitle>{t('safeguardsDeleteRuleTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('safeguardsDeleteRuleMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteRule}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmDeleteRule}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      <Box
        sx={{
          // Dialog body needs to stretch for the grid and rules list to scroll.
          flex: 1,
          minHeight: 0,
          height: '100%',
          // Reuse standard dialog spacing so tabs remain aligned.
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            display: { xs: 'block', md: 'grid' },
            // Keep-override grid pane matches the Rule Tester 4-column card width.
            gridTemplateColumns: { md: (() => {
              // Allow a tighter rules column in 2-column mode so the grid doesn't shift right.
              const rulesColumnMinWidth = gridColumnMode === 2
                ? KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_COMPACT_PX
                : KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_PX
              // Use the measured Gear Inspector card width so 1/2-column modes keep cards identical.
              const gridPaneWidth = resolveKeepOverrideGridPaneWidth({
                gridColumnMode,
                targetCardWidthPx: gearInspectorCardWidthPx,
                containerPaddingInlineEndPx: gridContainerPaddingEndPx,
                containerScrollbarWidthPx: gridScrollbarWidthPx,
                gridGapPx,
                rowPaddingPx: gridRowPaddingPx,
              })
              // Fall back to a flexible grid pane if the Gear Inspector card width is unknown.
              return gridPaneWidth
                ? `minmax(${rulesColumnMinWidth}px, 1fr) ${gridPaneWidth}`
                : `minmax(${rulesColumnMinWidth}px, 1fr) minmax(0, 1fr)`
            })() },
            height: '100%',
            gap: 2,
          }}
        >
          <Box data-tour-id="safeguards.rules" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  // Remove the gap when the intro copy is collapsed.
                  gap: rulesHeaderCollapsed ? 0 : 1,
                }}
              >
                <Box
                  sx={(theme) => ({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    // Collapse the intro with a subtle height + opacity transition.
                    maxHeight: rulesHeaderCollapsed ? 0 : theme.spacing(12),
                    opacity: rulesHeaderCollapsed ? 0 : 1,
                    transform: rulesHeaderCollapsed ? 'translateY(-4px)' : 'translateY(0)',
                    overflow: 'hidden',
                    pointerEvents: rulesHeaderCollapsed ? 'none' : 'auto',
                    transition: theme.transitions.create(['max-height', 'opacity', 'transform'], {
                      duration: theme.transitions.duration.shorter,
                    }),
                  })}
                >
                  <Typography variant="subtitle2">{t('safeguardsTabLabel')}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('safeguardsTabIntro')}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={enabled}
                        onChange={(_, checked) => onToggleEnabled(checked)}
                      />
                    )}
                    label={(
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography component="span">{t('safeguardsEnableLabel')}</Typography>
                        {safeguardsFinalSellWarning ? (
                          // Tooltip nudges users to align Safeguards with a full Final Sell sweep.
                          <MarkdownTooltip markdown={t('safeguardsFinalSellCoverageWarning')}>
                            <Box
                              component="span"
                              aria-label={t('safeguardsFinalSellCoverageWarning')}
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: 'warning.main',
                              }}
                            >
                              <WarningAmberRoundedIcon fontSize="small" />
                            </Box>
                          </MarkdownTooltip>
                        ) : null}
                      </Stack>
                    )}
                  />
                  {/* Column toggle sits beside the enable switch for quick 1/2 column switching. */}
                  <KeepOverridePaneToggle
                    gridColumnMode={gridColumnMode}
                    onToggle={handleToggleGridColumns}
                  />
                </Box>
              </Box>
            </Box>
            <SafeguardsRuleList
              rules={rules}
              renderRule={renderRuleCard}
              scrollRootRef={rulesScrollRootRef}
              onScrollChange={handleRulesScrollChange}
            />
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="contained" onClick={handleAddRule} sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}>
                {t('safeguardsAddRule')}
              </Button>
              <Button
                variant="outlined"
                disabled={recipes.length === 0}
                onClick={(e) => setScaffoldMenuAnchor(e.currentTarget)}
                sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}
                title={recipes.length === 0 ? t('safeguardsScaffoldFromRecipeEmpty') : undefined}
              >
                {t('safeguardsScaffoldFromRecipe')}
              </Button>
              <Popover
                anchorEl={scaffoldMenuAnchor}
                open={scaffoldMenuAnchor !== null}
                onClose={closeScaffoldMenu}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{
                  paper: buildContextMenuPaperSlotProps({
                    component: ContextMenuPaper,
                    contextMenuGuard: scaffoldMenuGuard,
                    onRequestClose: closeScaffoldMenu,
                    closeLabel: t('close'),
                    ref: scaffoldMenuPaperRef,
                    sx: { width: 480, maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', maxHeight: 'min(460px, 80vh)' },
                  }),
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
                        onClick={() => handleScaffoldFromRecipe(originalIdx)}
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
            </Box>
          </Box>
          <Box
            data-tour-id="keepuniques.grid"
            sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            {/* Grid header keeps filter + progress + count aligned. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                columnGap: 1,
                minWidth: 0,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <MarkdownTooltip
                  markdown={t('safeguardsGridFilterTooltip')}
                  ellipsisTitle={gridFilterLabel}
                  ellipsisSelector='[data-ellipsis-target]'
                >
                  <span>
                    <Button
                      size="small"
                      color="success"
                      variant={gridFilterMode === 'selection' ? 'contained' : 'outlined'}
                      // Toggle between all rows and current selection only.
                      onClick={handleToggleGridFilterMode}
                      aria-pressed={gridFilterMode === 'selection'}
                      startIcon={gridFilterMode === 'selection' ? <FilterListIcon fontSize="small" /> : <FilterListOffIcon fontSize="small" />}
                      // Keep the button compact until space is tight, then ellipsize the label.
                      sx={{
                        height: MENU_CONTROL_HEIGHT_PX,
                        minHeight: MENU_CONTROL_HEIGHT_PX,
                        px: 1.25,
                        minWidth: 0,
                        maxWidth: '100%',
                        justifyContent: 'flex-start',
                        justifySelf: 'start',
                        '& .MuiButton-startIcon': { flexShrink: 0 },
                      }}
                    >
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0, width: '100%', flex: '1 1 auto' }}>
                        <Typography
                          component="span"
                          noWrap
                          data-ellipsis-target
                          sx={{ ...ELLIPSIS_TEXT_SX, minWidth: 0 }}
                        >
                          {gridFilterLabel}
                        </Typography>
                      </Box>
                    </Button>
                  </span>
                </MarkdownTooltip>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: 0,
                  justifySelf: 'end',
                }}
              >
                {/* Shared spinner keeps the dialog aligned with the preview chip busy indicator. */}
                <WorkloadProgressIndicator progressRatio={workloadProgressRatio} ariaLabel={t('safeguardsScanPending')} />
                {selectionChipLabel ? (
                  <GearInspectorOutcomeSummaryChip
                    summary={selectionChipSummary}
                    showWhenEmpty
                    metricMode="safeguardsOnly"
                    ariaLabel={selectionChipLabel}
                  />
                ) : null}
              </Box>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <GearInspectorItemsGrid
                // Use keep-override variant for 1/2 column toggles and empty-state copy.
                rows={gridRows}
                allRows={uniqueRows}
                filterActive={gridFiltered}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
                onToggleStatColors={onToggleStatColors}
                onOpenManageColors={onOpenManageColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={onChangeColorBlindMode}
                colorIconSrc={colorIconSrc}
                recipeNames={recipeNames}
                onJumpToRule={onJumpToRule}
                variant="safeguards"
                keepOverrideColumnMode={gridColumnMode}
                onKeepOverrideColumnModeChange={setGridColumnMode}
                onScrollbarWidthMeasured={setGridScrollbarWidthPx}
                highlightedRowPredicate={highlightRowPredicate ?? null}
                dimUnhighlightedRows={highlightActive}
                suppressMatchDetails={suppressMatchDetails}
                safeguardsEnabled={enabled}
                safeguardUpgradeChanceRules={resolvedRulesForUpgradeChance}
                hasGearInspectorData={hasPreviewGear}
                emptyStateOptions={!hasPreviewGear ? {
                  borderVariant: 'dashed',
                  minHeight: '100%',
                  sx: { height: '100%', px: STANDARD_DIALOG_PADDING_INLINE_UNITS },
                } : undefined}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  )
}

type SafeguardsRuleListProps = {
  rules: SafeguardRule[]
  renderRule: (rule: SafeguardRule, ruleIndex: number) => ReactNode
  scrollRootRef: RefObject<HTMLDivElement | null>
  onScrollChange?: (scrollTop: number) => void
}

function SafeguardsRuleList({ rules, renderRule, scrollRootRef, onScrollChange }: SafeguardsRuleListProps) {
  const { t } = useI18n()
  // Bubble scroll changes so the parent can collapse the intro copy.
  const handleScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    onScrollChange?.(event.currentTarget.scrollTop)
  }, [onScrollChange])
  return (
    <Box
      ref={scrollRootRef}
      onScroll={handleScroll}
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // Virtual rows are absolutely positioned; disable scroll anchoring so expand/collapse never “moves” whitespace.
        overflowAnchor: 'none',
        pt: 2,
        pr: 1,
        ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(1) }),
      })}
    >
      {rules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('safeguardsNoRules')}</Typography>
      ) : (
        // Render a normal stacked list so expand/collapse never depends on cached measurements.
        // Use CSS gap directly (instead of Stack's spacing implementation) to keep spacing stable across toggles.
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 2 }}>
          {rules.map((rule, index) => (
            <Box
              key={rule.id}
              data-safeguards-rule-id={rule.id}
              sx={{ overflowAnchor: 'none' }}
            >
              {renderRule(rule, index)}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
