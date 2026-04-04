import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove'
import SortIcon from '@mui/icons-material/Sort'
// alpha is used in the scroll-hint overlay background; the card's tints are handled in GearInspectorGridCard.
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import GearInspectorOutcomeSummaryChip, { GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_MS } from './GearInspectorOutcomeSummaryChip'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { NoGearSetIcon } from './NoGearSetIcon'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import {
  artifactSetName,
  artifactTypeI18nKey,
  compareArtifactTypes,
  factionI18nKey,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  statVariantI18nKey,
  type ArtifactTypeId,
  type ArtifactSetId,
  type FactionId,
  StatVariant,
} from '../lib/types'
import { resolveRarityAccentColor } from '../lib/rarityColors'
import { formatGearInspectorSetLabel } from '../lib/gearInspectorFormatters'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { isAccessorySlot } from '../lib/gearInspectorDomain'
import type { GearInspectorContextGroup } from '../lib/rulesFilter'
import { KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT } from '../lib/keepOverrideLayout'
// MarkdownTooltip unifies the Gear Inspector's tooltip behavior (source glyphs, manage colors, etc.) with the rest of the UI.
import MarkdownTooltip from './MarkdownTooltip'
import { WithSetTooltip, buildNoSetTooltipMarkdown } from './SetTooltip'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { buildGearInspectorNormalizedPresetTooltipMarkdown, formatGearInspectorNormalizedPresetButtonLabel } from '../lib/gearInspectorNormalizedPresets'
import {
  ACCESSORY_NO_SET_ID,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
  RULES_TABLE_SCROLL_HINT_HIDE_MS,
  SMALL_BUTTON_HEIGHT_PX,
  type ColorBlindMode,
} from '../lib/constants'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import {
  useGearInspectorGridPreferences,
  type GearInspectorGridColumnMode,
} from '../state/gearInspectorGridPreferences'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardSubstatMatch,
  sanitizeSafeguardCountMode,
  type SafeguardRule,
} from '../lib/safeguards'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
import EmptyStateMessage, { type EmptyStateMessageProps } from './EmptyStateMessage'
import {
  computeGearInspectorNormalizedSubstatScore,
  isGearInspectorSyntheticSortKey,
  sortGearInspectorRowsBySubstats,
  GEAR_INSPECTOR_GROUPING_DEFAULT_STATE,
  isDefaultGearInspectorGroupingState,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK,
  type GearInspectorGroupingState,
  type GearInspectorSubstatSortSpec,
} from '../lib/gearInspectorSort'
import { GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT } from '../lib/gearInspectorNormalizedPresets'
import type { GearInspectorSubstatSortState } from '../state/gearInspectorSubstatSortPreferences'
import { useGearInspectorSubstatSortPreferences } from '../state/gearInspectorSubstatSortPreferences'
import {
  type GearInspectorGridNormalizedPresetId,
  useGearInspectorGridNormalizedOverlayPreferences,
} from '../state/gearInspectorGridNormalizedOverlayPreferences'
import { GearInspectorNormalizedPresetEditorMenu } from './GearInspectorNormalizedPresetEditorMenu'
import { CycleButton } from './CycleButton'
import type { GearInspectorRuleTemplateIntent } from '../lib/gearInspectorRuleTemplates'
import {
  parseSpacingPx,
  GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS,
  GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS,
} from '../lib/gearInspectorGridLayout'
import { buildGearInspectorOutcomeSummary } from '../lib/gearInspectorOutcomeSummary'
// Card component + shared metrics/constants are defined in GearInspectorGridCard to keep this file under 1,500 lines.
import {
  GearInspectorGridCard,
  GearInspectorCardTopOverlay,
  GRID_CARD_SINGLE_COLUMN_TEMPLATE,
  GRID_CARD_CONTAINER_PADDING_UNITS,
  GRID_CARD_OFFSCREEN_PRIORITY_PENALTY,
  GRID_CARD_FOCUS_PULSE_DURATION_MS,
  GRID_CARD_ENTER_ANIMATION_MS,
  flushGearInspectorGridCardRevealQueue,
  isGearInspectorCardRevealed,
  useGearInspectorGridLayoutMetrics,
  formatGearInspectorRankLabel,
  formatGearInspectorRarityLabel,
  parseCssColorToRgb,
  rgbToCss,
  mixRgb,
} from './GearInspectorGridCard'

// Stable sentinel passed to already-revealed cards so scroll events do not trigger re-renders.
// Revealed cards ignore priorityBase/priorityOrder in their content-ready hook, so this is safe.
const STABLE_CARD_PRIORITY = { base: 0, order: 0 } as const

type EmptyStateWrapperProps = Omit<EmptyStateMessageProps, 'children'>

// Rounded corners for accordion headers and card row containers to match the card border radius.
const ACCORDION_BORDER_RADIUS_PX = 8
// Group-level virtualization uses light overscan because the heavy lifting happens at the card row level.
const GRID_GROUP_VIRTUAL_OVERSCAN_ROWS = 2
// Idle drain fires after scroll activity calms down so reverse-scroll hits already-hydrated cards.
const GRID_CARD_REVEAL_IDLE_DRAIN_DELAY_MS = 180

// TranslateFn is a locally-defined alias; both files define it identically without duplicating a domain literal.
type TranslateFn = ReturnType<typeof useI18n>['t']

// Variant toggles keep-override specific layout while keeping the base Gear Inspector grid intact.
type GearInspectorItemsGridVariant = 'gearInspector' | 'safeguards'

type GearInspectorItemsGridProps = {
  rows: GearInspectorPreviewRow[]
  // Optional unfiltered source rows so group chips can show filtered/total pairs.
  allRows?: readonly GearInspectorPreviewRow[]
  // Pre-computed improvement-chance map from the WASM worker pipeline; null when not computed.
  improvementChanceByArtifactId?: Map<number, ImprovementChanceWasmEntry> | null
  filterActive?: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors?: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  recipeNames: Array<string | null>
  // Optional one-shot request to expand + scroll to a concrete artifact card.
  focusArtifactRequest?: { artifactId: number; token: number } | null
  // Optional callback when the requested artifact is hidden by active Gear Inspector filters.
  onFocusArtifactFilteredOut?: ((artifactId: number) => void) | undefined
  onJumpToRule?: ((ruleIndex: number, recipeIdx: number | null) => void) | undefined
  // Navigate to the safeguard rule at this 0-based index in the Safeguard Builder.
  onJumpToSafeguardRule?: ((ruleIdx: number) => void) | undefined
  onCreateRuleTemplate?: ((row: GearInspectorPreviewRow, intent: GearInspectorRuleTemplateIntent) => void) | undefined
  variant?: GearInspectorItemsGridVariant
  safeguardsEnabled?: boolean
  keepOverrideColumnMode?: 1 | 2
  onKeepOverrideColumnModeChange?: (next: 1 | 2) => void
  hasGearInspectorData?: boolean
  emptyStateOptions?: Partial<EmptyStateMessageProps> | undefined
  // Vertical anchoring for empty-state messaging: stacked layout reads better when top-aligned,
  // side-by-side layout looks balanced when centered.
  emptyStateVerticalAlign?: EmptyStateMessageProps['verticalAlign']
  suppressMatchDetails?: boolean
  // Optional highlighter lets Safeguards fade non-matching cards without forking the grid.
  highlightedRowPredicate?: ((row: GearInspectorPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  /** Maps artifact ID → context group when result-filter context mode is active. */
  contextGroupById?: Map<number, GearInspectorContextGroup> | null
  // Optional card-width tap for keep-override layout (measures Gear Inspector 4-col cards).
  onCardWidthMeasured?: (widthPx: number) => void
  // Optional scrollbar-width tap for keep-override layout (keeps pane width aligned).
  onScrollbarWidthMeasured?: (widthPx: number) => void
  // Optional Gear Inspector sort controls; view-only ordering that does not affect exports.
  substatSort?: GearInspectorSubstatSortSpec | null
  // Full sort preference state so the grid can gate the [S] overlay option.
  sortState?: GearInspectorSubstatSortState | null
  // Grouping settings for the Gear Inspector grid; independent of sorting.
  grouping?: GearInspectorGroupingState
  // Resolved safeguard rules used for tooltip rule-name lookup in the improvement-chance overlay.
  safeguardRules?: readonly SafeguardRule[]
  // Optional safeguard rank overlay: artifact-id → { rank, isWithinQuota, ruleOrdinal, otherRules }.
  // When present, ranked items show "#N" bottom chip.
  // ruleOrdinal (1-based): the rule that gave this artifact its best rank (click-to-jump + tooltip).
  // otherRules: up to 3 other rules where this artifact is also a candidate (rank + ruleOrdinal).
  safeguardRankByArtifactId?: ReadonlyMap<number, { rank: number; isWithinQuota: boolean; ruleOrdinal: number | null; otherRules: Array<{ ruleOrdinal: number; rank: number }> }> | null
  // Opaque key that changes when the active filter selection changes (not on DB updates).
  // When this key changes, card entering animations are suppressed (the filter changed,
  // not the underlying data) while group chips can still pulse for newly-visible groups.
  enterKey?: string
  // Gear-inspector item selection: only active when a WebSocket push endpoint is connected.
  selectedGearItemIds?: ReadonlySet<number>
  // Called after each click-driven selection change; receives the full new selection set.
  onGearItemsSelect?: (next: ReadonlySet<number>) => void
  // When false (default) cards are not clickable for selection; gates cursor + click handler.
  gearSelectionEnabled?: boolean
  // Outer width of the preview Paper in CSS px, as reported by the splitter.
  // When provided, the dynamic column count adjusts automatically as the panel resizes.
  panelWidthPx?: number
}

type GearInspectorGroupKind ='artifactSet' | 'artifactSlot' | 'accessorySet' | 'accessoryFaction'

type GearInspectorGroup = {
  key: string
  label: string
  setId: number | null
  slot: ArtifactTypeId | null
  factionId: FactionId | null
  rows: GearInspectorPreviewRow[]
  order: number
  kind: GearInspectorGroupKind
  showHeader?: boolean
  children?: GearInspectorGroup[]
  parentKey?: string | null
}

type GroupRowsBySetOptions = {
  grouping: GearInspectorGroupingState
  substatSort: GearInspectorSubstatSortSpec | null
}

// GearInspectorCardTopOverlay is defined and exported from GearInspectorGridCard.
// It is imported at the top of this file so the main component can reference it without duplication.

// Maps each card size mode to the i18n key that labels it in the grid-columns menu button.

export function GearInspectorItemsGrid(props: GearInspectorItemsGridProps) {
  const {
    rows,
    allRows,
    filterActive = false,
    substatColors,
    useStatButtonColors = false,
    onToggleStatColors,
    onOpenManageColors,
    colorBlindMode,
    onChangeColorBlindMode,
    colorIconSrc,
    recipeNames,
    focusArtifactRequest = null,
    onFocusArtifactFilteredOut,
    onJumpToRule,
    onJumpToSafeguardRule,
    onCreateRuleTemplate,
    variant = 'gearInspector',
    safeguardsEnabled = true,
    keepOverrideColumnMode,
    onKeepOverrideColumnModeChange,
    hasGearInspectorData = true,
    emptyStateOptions,
    emptyStateVerticalAlign = 'center',
    suppressMatchDetails: suppressMatchDetailsProp = false,
    highlightedRowPredicate = null,
    dimUnhighlightedRows = false,
    contextGroupById = null,
    onCardWidthMeasured,
    onScrollbarWidthMeasured,
    substatSort = null,
    sortState = null,
    grouping = GEAR_INSPECTOR_GROUPING_DEFAULT_STATE,
    improvementChanceByArtifactId = null,
    safeguardRules,
    safeguardRankByArtifactId = null,
    enterKey = undefined,
    selectedGearItemIds,
    onGearItemsSelect,
    gearSelectionEnabled = false,
    panelWidthPx,
  } = props
  // Variant flags control keep-override behavior without forking the grid.
  const safeguardsVariant = variant === 'safeguards'
  // Safeguards is the only keep-override variant now.
  const keepOverrideVariant = safeguardsVariant
  // Memoized predicates avoid re-render churn when Safeguards toggles highlighting.
  const highlightRowPredicate = typeof highlightedRowPredicate === 'function' ? highlightedRowPredicate : null
  const shouldDimUnhighlightedRows = Boolean(dimUnhighlightedRows && highlightRowPredicate)
  const { t, lang } = useI18n()
  const theme = useTheme()
  // Sort prefs are the SSOT for glyph inclusion so the Sort popout and grid context menu stay in sync.
  const gearInspectorSubstatSortPreferences = useGearInspectorSubstatSortPreferences()
  const effectiveSubstatSort = useMemo(
    () => (
      // Keep the parent-provided spec (priorities, direction, normalized sources) but force the shared glyph toggle.
      // Why: the grid context menu edits the shared preference store directly.
      substatSort ? { ...substatSort, excludeGlyphs: gearInspectorSubstatSortPreferences.state.excludeGlyphs } : substatSort
    ),
    [substatSort, gearInspectorSubstatSortPreferences.state.excludeGlyphs],
  )
  const normalizedOverlayPrefs = useGearInspectorGridNormalizedOverlayPreferences()
  const normalizedOverlayUseSortWeights = normalizedOverlayPrefs.state.useSortWeights
  const toggleNormalizedOverlayUseSortWeights = normalizedOverlayPrefs.toggleUseSortWeights
  const toggleNormalizedOverlayEnabledPresetsFromLastUsed = normalizedOverlayPrefs.toggleEnabledPresetsFromLastUsed
  const normalizedOverlaySortSourceAllowed = Boolean(
    // [S] is only meaningful when sort is actively using normalized scoring (and is not in "Active" mode).
    effectiveSubstatSort?.normalized === true
    && sortState?.normalizedUseActiveOverlay !== true,
  )
  // Enabled presets are a simple set lookup for button styling + per-row score computation.
  const normalizedOverlayEnabledPresetSet = useMemo(
    () => new Set<number>(normalizedOverlayPrefs.state.enabledPresetIds.map((id) => Number(id))),
    [normalizedOverlayPrefs.state.enabledPresetIds],
  )
  // Overlay is enabled when either [S] or any numbered preset is enabled.
  const normalizedOverlayEnabled = normalizedOverlayUseSortWeights
    || normalizedOverlayPrefs.state.enabledPresetIds.length > 0
  const [normalizedPresetEditor, setNormalizedPresetEditor] = useState<{
    presetId: GearInspectorGridNormalizedPresetId
    position: { x: number; y: number }
  } | null>(null)
  useEffect(() => {
    // If the user turns off Normalized sorting (or enters "Active" mode), auto-disable the [S] overlay so UI stays consistent.
    if (!normalizedOverlayUseSortWeights) return
    if (normalizedOverlaySortSourceAllowed) return
    toggleNormalizedOverlayUseSortWeights()
  }, [normalizedOverlaySortSourceAllowed, normalizedOverlayUseSortWeights, toggleNormalizedOverlayUseSortWeights])
  // Frozen match details stay rendered but dimmed so users remember the last result during rebuilds.
  const matchDetailsFrozen = Boolean(suppressMatchDetailsProp)
  const {
    columns: gridColumnPreference,
    showFirstMatch,
    showMatchRecipeIndex,
    showMatchLine: showMatchLineNumber,
    showOtherMatches,
    showChampionIcons,
    showRuleTemplates,
    highlightKeepSell,
    showSafeguardImprovementChance,
    showSafeguardRank,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setHighlightKeepSell,
    setShowSafeguardImprovementChance,
    setShowSafeguardRank,
  } = useGearInspectorGridPreferences(variant)
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), [])
  // Overlay score uses the same glyph inclusion policy as the Sort UI (default excludes glyphs).
  // Why: avoids confusing users with two independent "glyph counting" toggles for the same scores.
  const normalizedOverlayExcludeGlyphs = gearInspectorSubstatSortPreferences.state.excludeGlyphs !== false
  const normalizedOverlayByArtifactId = useMemo(() => {
    // When nothing is enabled, keep the fast path obvious: no overlay map.
    if (!normalizedOverlayEnabled) return new Map<number, { text: string; color?: string }>()
    const useSortWeights = normalizedOverlayPrefs.state.useSortWeights === true
    const enabledPresetIds = normalizedOverlayPrefs.state.enabledPresetIds
    const presets = normalizedOverlayPrefs.state.presets
    // [S] uses the Sort popout's currently selected substats + weights.
    const sortSelectedVariants = useSortWeights
      ? (effectiveSubstatSort?.priorities ?? []).filter((key) => !isGearInspectorSyntheticSortKey(Number(key))) as StatVariant[]
      : []
    const sortWeights = useSortWeights ? (effectiveSubstatSort?.weights ?? {}) : {}

    // First pass computes per-row "best of enabled presets" and tracks the global min/max.
    const scores = new Map<number, number>()
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let idx = 0; idx < rows.length; idx += 1) {
      // Bounds check above guarantees this row exists; non-null assertion keeps strict indexing happy.
      const row = rows[idx]!
      const artifactId = Number(row?.artifact?.id)
      if (!Number.isFinite(artifactId)) continue
      const best = (() => {
        // [S] is exclusive: score comes from the Sort popout state only.
        if (useSortWeights) {
          return computeGearInspectorNormalizedSubstatScore(row, {
            variants: sortSelectedVariants,
            weights: sortWeights,
            excludeGlyphs: normalizedOverlayExcludeGlyphs,
          })
        }
        // Presets mode: use the best (max) score across enabled presets.
        let bestPreset: number | null = null
        for (let presetIdx = 0; presetIdx < enabledPresetIds.length; presetIdx += 1) {
          // Bounds check above guarantees this id exists; non-null assertion keeps strict indexing happy.
          const presetId = enabledPresetIds[presetIdx]!
          const preset = presets[presetId]
          if (!preset) continue
          const score = computeGearInspectorNormalizedSubstatScore(row, {
            variants: preset.variants,
            weights: preset.weights,
            excludeGlyphs: normalizedOverlayExcludeGlyphs,
          })
          if (score == null) continue
          if (bestPreset == null || score > bestPreset) bestPreset = score
        }
        return bestPreset
      })()
      if (best == null) continue
      scores.set(artifactId, best)
      min = Math.min(min, best)
      max = Math.max(max, best)
    }
    if (scores.size === 0 || !Number.isFinite(min) || !Number.isFinite(max)) {
      return new Map<number, { text: string; color?: string }>()
    }

    // Theme palette endpoints drive the red→green gradient; fall back to hardcoded RGB if parsing fails.
    const lowRgb = parseCssColorToRgb(theme.palette.error.main) ?? { r: 220, g: 38, b: 38 }
    const highRgb = parseCssColorToRgb(theme.palette.success.main) ?? { r: 22, g: 163, b: 74 }
    const range = max - min

    // Second pass converts scores into overlay text + range-mapped colors.
    const overlays = new Map<number, { text: string; color?: string }>()
    scores.forEach((score, artifactId) => {
      // When the range collapses, treat every score as "highest" so users still get a strong signal.
      const ratio = range > 0 ? (score - min) / range : 1
      const color = rgbToCss(mixRgb(lowRgb, highRgb, ratio))
      overlays.set(artifactId, { text: score.toFixed(2), color })
    })
    return overlays
  }, [
    normalizedOverlayEnabled,
    normalizedOverlayExcludeGlyphs,
    normalizedOverlayPrefs.state.useSortWeights,
    normalizedOverlayPrefs.state.enabledPresetIds,
    normalizedOverlayPrefs.state.presets,
    rows,
    effectiveSubstatSort?.priorities,
    effectiveSubstatSort?.weights,
    theme.palette.error.main,
    theme.palette.success.main,
  ])
  // Group chips can optionally compare filtered rows against the original unfiltered dataset.
  const groupSummarySourceRows = allRows ?? rows
  // Sorting can request chance data even when the overlay itself is hidden.
  const safeguardChanceSortEnabled = useMemo(
    () => (effectiveSubstatSort?.priorities ?? []).some((key) => Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE),
    [effectiveSubstatSort?.priorities],
  )
  // Whether the safeguard rank synthetic sort key is active in the current sort spec.
  const safeguardRankSortEnabled = useMemo(
    () => (effectiveSubstatSort?.priorities ?? []).some((key) => Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_RANK),
    [effectiveSubstatSort?.priorities],
  )
  // Pre-computed by the WASM worker; coalesce null to a stable empty map so downstream memo deps don't thrash.
  const safeguardImprovementChanceByArtifactId = useMemo<Map<number, ImprovementChanceWasmEntry>>(
    () => improvementChanceByArtifactId ?? new Map(),
    [improvementChanceByArtifactId],
  )
  const substatSortWithSafeguardChance = useMemo(() => {
    if (!effectiveSubstatSort) return effectiveSubstatSort
    // Thread the improvement-chance map only when the sort key is active (avoid unnecessary work).
    const withChance: GearInspectorSubstatSortSpec = safeguardChanceSortEnabled
      ? (() => {
        // Comparator only needs numeric chance values; omit non-matching safeguards so they sort as null/last.
        const chanceMap = new Map<number, number | null>()
        safeguardImprovementChanceByArtifactId.forEach((entry, artifactId) => {
          if (!entry.hasMatchingSafeguard) return
          chanceMap.set(artifactId, entry.chancePercent)
        })
        return { ...effectiveSubstatSort, safeguardImprovementChanceByArtifactId: chanceMap }
      })()
      : effectiveSubstatSort
    // Thread the safeguard rank map only when the sort key is active.
    if (safeguardRankSortEnabled && safeguardRankByArtifactId) {
      // Flatten { rank, isWithinQuota } to just rank (null = not ranked) for the comparator.
      const rankMap = new Map<number, number | null>()
      safeguardRankByArtifactId.forEach(({ rank }, artifactId) => {
        rankMap.set(artifactId, rank > 0 ? rank : null)
      })
      return { ...withChance, safeguardRankByArtifactId: rankMap }
    }
    return withChance
  }, [
    effectiveSubstatSort,
    safeguardChanceSortEnabled,
    safeguardRankSortEnabled,
    safeguardImprovementChanceByArtifactId,
    safeguardRankByArtifactId,
  ])
  // Group tree is recalculated only when the dataset, locale, or sort mode changes so TanStack can reuse measured rows.
  const groups = useMemo(
    () => groupRowsBySet(rows, t, lang, { grouping, substatSort: substatSortWithSafeguardChance }),
    [rows, t, lang, grouping, substatSortWithSafeguardChance],
  )
  const summaryGroups = useMemo(
    () => groupRowsBySet(groupSummarySourceRows, t, lang, { grouping, substatSort: substatSortWithSafeguardChance }),
    [groupSummarySourceRows, t, lang, grouping, substatSortWithSafeguardChance],
  )
  // Upgrade overlay entry: chip data (click only) + tooltip content (surfaces on card icon level).
  // Tooltip content is extracted at render time and NOT passed as chip tooltip props.
  type ImprovementChanceOverlayEntry = { text: string; color: string; onClick?: () => void; tooltipMarkdown: string; tooltipRender?: React.ReactNode }
  const safeguardUpgradeOverlayByArtifactId = useMemo(() => {
    // Tooltip-rich overlays are only needed when the card overlay toggle is enabled.
    if (!showSafeguardImprovementChance) {
      return new Map<number, ImprovementChanceOverlayEntry>()
    }
    const normalizeSelectedSubstatsForTooltip = (values: readonly number[]): number[] => {
      const out: number[] = []
      const seen = new Set<number>()
      for (const raw of values) {
        const numeric = Number(raw)
        if (!Number.isFinite(numeric)) continue
        const variant = Math.floor(numeric)
        if (variant <= 0) continue
        if (variant === Number(StatVariant.Any) || variant === Number(StatVariant.RollCount)) continue
        if (seen.has(variant)) continue
        seen.add(variant)
        out.push(variant)
      }
      return out
    }
    // Hide overlay chips when the artifact does not match any substat safeguard.
    const matchedEntries = Array.from(safeguardImprovementChanceByArtifactId.entries()).filter(([, entry]) => entry.hasMatchingSafeguard)
    if (matchedEntries.length === 0) {
      return new Map<number, ImprovementChanceOverlayEntry>()
    }
    // Color scale mirrors normalized substat ratings: low=red, high=green.
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const [, entry] of matchedEntries) {
      min = Math.min(min, entry.chancePercent)
      max = Math.max(max, entry.chancePercent)
    }
    const lowRgb = parseCssColorToRgb(theme.palette.error.main) ?? { r: 220, g: 38, b: 38 }
    const highRgb = parseCssColorToRgb(theme.palette.success.main) ?? { r: 22, g: 163, b: 74 }
    const range = max - min
    const requirementSubstatsToken = '__REQUIREMENT_SUBSTATS__'
    // Pre-format percentage labels + click handlers so row rendering stays allocation-light.
    const overlays = new Map<number, ImprovementChanceOverlayEntry>()
    for (const [artifactId, entry] of matchedEntries) {
      const ratio = range > 0 ? (entry.chancePercent - min) / range : 1
      const color = rgbToCss(mixRgb(lowRgb, highRgb, ratio))
      // Ordinal is 1-based; convert to 0-based index for the safeguardRules array.
      const matchedRule = (entry.ruleOrdinal != null && safeguardRules)
        ? (safeguardRules[entry.ruleOrdinal - 1] ?? null)
        : null
      const selectedSubstats = entry.debug?.selectedSubstats?.length
        ? entry.debug.selectedSubstats
        : normalizeSelectedSubstatsForTooltip(matchedRule?.substats ?? [])
      const selectedSubstatLabel = selectedSubstats.length > 0
        ? selectedSubstats.map((variant) => t(statVariantI18nKey(variant))).join(', ')
        : t('any')
      const rawMatchMode = entry.debug?.substatMatch ?? matchedRule?.substatMatch ?? SafeguardSubstatMatch.Min1
      // PerSubstat uses an i18n label; numeric min-count tokens use language-agnostic ≥N format.
      const matchModeLabel = (() => {
        if (rawMatchMode === SafeguardSubstatMatch.PerSubstat) return t('gearInspectorGridSafeguardChanceMatchModePerSubstat')
        const n = parseInt(rawMatchMode, 10)
        return `\u2265${Number.isFinite(n) && n >= 1 ? n : 1}`
      })()
      const safeguardName = (() => {
        const trimmedName = matchedRule?.name?.trim() ?? ''
        if (trimmedName.length > 0) return trimmedName
        return t('gearInspectorGridSafeguardChanceUnknownRule')
      })()
      const debug = entry.debug
      const tooltipHeader = t('gearInspectorGridSafeguardChanceTooltipHeader', { chance: `${entry.chancePercent}%` })
      const tooltipProjection = t('gearInspectorGridSafeguardChanceTooltipProjection')
      const tooltipDataset = t('gearInspectorGridSafeguardChanceTooltipDataset', {
        count: numberFormatter.format(debug?.sourceArtifactCount ?? (allRows ?? rows).length),
      })
      const tooltipRule = t('gearInspectorGridSafeguardChanceTooltipRule', { name: safeguardName })
      const tooltipRuleNameIndex = tooltipRule.indexOf(safeguardName)
      const tooltipRuleNameHighlightedMarkdown = tooltipRuleNameIndex >= 0
        ? `${tooltipRule.slice(0, tooltipRuleNameIndex)}*${safeguardName}*${tooltipRule.slice(tooltipRuleNameIndex + safeguardName.length)}`
        : tooltipRule
      const tooltipRulePrefix = tooltipRuleNameIndex >= 0 ? tooltipRule.slice(0, tooltipRuleNameIndex) : tooltipRule
      const tooltipRuleSuffix = tooltipRuleNameIndex >= 0
        ? tooltipRule.slice(tooltipRuleNameIndex + safeguardName.length)
        : ''
      const normalizedCountMode = sanitizeSafeguardCountMode(matchedRule?.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
      const countModeScopeLabels: string[] = []
      if (normalizedCountMode.perSet) countModeScopeLabels.push(t('safeguardsCountModePerSet'))
      if (normalizedCountMode.perFaction) countModeScopeLabels.push(t('safeguardsCountModePerFaction'))
      if (normalizedCountMode.perMainStat) countModeScopeLabels.push(t('safeguardsCountModePerMain'))
      if (normalizedCountMode.perSlot) countModeScopeLabels.push(t('safeguardsCountModePerSlot'))
      const requiredCountScopeSuffix = countModeScopeLabels.length > 0
        ? ` (${countModeScopeLabels.join(', ')})`
        : ''
      const tooltipRequirementBase = t('gearInspectorGridSafeguardChanceTooltipRequirement', {
        matchMode: matchModeLabel,
        substats: selectedSubstatLabel,
      })
      const tooltipRequirement = tooltipRequirementBase
      const tooltipRequirementTemplateBase = t('gearInspectorGridSafeguardChanceTooltipRequirement', {
        matchMode: matchModeLabel,
        substats: requirementSubstatsToken,
      })
      const tooltipRequirementTemplate = tooltipRequirementTemplateBase
      const tooltipRequirementTemplateParts = tooltipRequirementTemplate.split(requirementSubstatsToken)
      const tooltipRequiredCount = debug
        ? `${t('gearInspectorGridSafeguardChanceTooltipRequiredCount', { count: numberFormatter.format(debug.requiredPerGroup) })}${requiredCountScopeSuffix}`
        : null
      const debugTooltipLines = debug
        ? [
          tooltipRequiredCount,
          t('gearInspectorGridSafeguardChanceTooltipBucketCount', { count: numberFormatter.format(debug.bucketCandidateCount) }),
          t('gearInspectorGridSafeguardChanceTooltipBetterCount', { count: numberFormatter.format(debug.betterCandidateCount) }),
          t('gearInspectorGridSafeguardChanceTooltipMatchedNow', { count: numberFormatter.format(debug.matchedSelectedNow) }),
        ]
        : []
      const resolveTooltipSubstatColor = (variant: number): string | undefined => (
        substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]
      )
      const requirementSupportsColor = useStatButtonColors && selectedSubstats.some((variant) => Boolean(resolveTooltipSubstatColor(variant)))
      const requirementColoredSubstatsNode = requirementSupportsColor ? (
        <>
          {selectedSubstats.map((variant, idx) => {
            const statLabel = t(statVariantI18nKey(variant))
            const statColor = resolveTooltipSubstatColor(variant)
            return (
              <Box
                key={`safeguard-requirement-substat-${artifactId}-${variant}`}
                component="span"
                sx={statColor ? { color: statColor } : {}}
              >
                {statLabel}
                {idx < selectedSubstats.length - 1 ? ', ' : ''}
              </Box>
            )
          })}
        </>
      ) : null
      const tooltipRequirementNode = (
        requirementSupportsColor
        && requirementColoredSubstatsNode
        && tooltipRequirementTemplateParts.length === 2
      )
        ? (
          <>
            {tooltipRequirementTemplateParts[0]}
            {requirementColoredSubstatsNode}
            {tooltipRequirementTemplateParts[1]}
          </>
        )
        : tooltipRequirement
      const chanceTooltipLines = [
        `**${tooltipHeader}**`,
        tooltipProjection,
        `- ${tooltipDataset}`,
        `- ${tooltipRuleNameHighlightedMarkdown}`,
        `- ${tooltipRequirement}`,
        ...debugTooltipLines.map((line) => `- ${line}`),
      ]
      const tooltipMarkdown = chanceTooltipLines.join('\n')
      const tooltipRender = requirementSupportsColor ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography variant="body2" component="p" sx={{ m: 0, fontWeight: 700 }}>
            {tooltipHeader}
          </Typography>
          <Typography variant="body2" component="p" sx={{ m: 0 }}>
            {tooltipProjection}
          </Typography>
          <Box component="ul" sx={{ pl: 2.25, m: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box component="li" sx={{ p: 0, listStylePosition: 'outside' }}>
              <Typography variant="body2" component="span">
                {tooltipDataset}
              </Typography>
            </Box>
            <Box component="li" sx={{ p: 0, listStylePosition: 'outside' }}>
              <Typography variant="body2" component="span">
                {tooltipRulePrefix}
                <Box component="span" sx={{ fontStyle: 'italic' }}>
                  {safeguardName}
                </Box>
                {tooltipRuleSuffix}
              </Typography>
            </Box>
            <Box component="li" sx={{ p: 0, listStylePosition: 'outside' }}>
              <Typography variant="body2" component="span">
                {tooltipRequirementNode}
              </Typography>
            </Box>
            {debugTooltipLines.map((line) => (
              <Box key={`safeguard-tooltip-debug-${artifactId}-${line}`} component="li" sx={{ p: 0, listStylePosition: 'outside' }}>
                <Typography variant="body2" component="span">
                  {line}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : undefined
      // Click navigates to the matched safeguard rule in the builder; requires a valid ordinal.
      const ruleIdx = entry.ruleOrdinal != null ? entry.ruleOrdinal - 1 : -1
      const canJumpToSafeguard = ruleIdx >= 0 && typeof onJumpToSafeguardRule === 'function'
      overlays.set(artifactId, {
        text: `${entry.chancePercent}%`,
        color,
        tooltipMarkdown,
        ...(tooltipRender ? { tooltipRender } : {}),
        ...(canJumpToSafeguard ? { onClick: () => onJumpToSafeguardRule(ruleIdx) } : {}),
      })
    }
    return overlays
  }, [
    allRows,
    numberFormatter,
    onJumpToSafeguardRule,
    rows,
    safeguardRules,
    safeguardImprovementChanceByArtifactId,
    showSafeguardImprovementChance,
    substatColors,
    useStatButtonColors,
    t,
    theme.palette.error.main,
    theme.palette.success.main,
  ])
  // Safeguard rank bottom chip: "#N" for ranked items with table-format tooltip (primary bold + others).
  // green = kept (within quota), red = sold.
  // Chip carries click-to-jump only; all tooltip content surfaces on the card icon level.
  const safeguardRankOverlayByArtifactId = useMemo(() => {
    if (!safeguardRankByArtifactId || safeguardRankByArtifactId.size === 0) {
      return null
    }
    // Entry shape: chip data + JSX tooltipRender (MarkdownTooltip custom parser has no table support).
    const overlays = new Map<number, { text: string; color?: string; onClick?: () => void; tooltipRender: React.ReactNode }>()
    safeguardRankByArtifactId.forEach(({ rank, isWithinQuota, ruleOrdinal, otherRules }, artifactId) => {
      if (rank <= 0) return
      // Resolve chip color: green = kept, red = sold.
      const color = isWithinQuota
        ? theme.palette.success.main
        : theme.palette.error.main
      // Collect named rows: primary rule bold, other rules plain — each with a rank badge.
      // ruleOrdinal is 1-based; safeguardRules array is 0-based.
      const primaryRule = ruleOrdinal != null ? (safeguardRules?.[ruleOrdinal - 1] ?? null) : null
      const primaryRuleName = primaryRule?.name?.trim() || null
      type RankRow = { rank: number; name: string; isPrimary: boolean }
      const rankRows: RankRow[] = []
      if (primaryRuleName) rankRows.push({ rank, name: primaryRuleName, isPrimary: true })
      for (const other of otherRules) {
        const otherRule = safeguardRules?.[other.ruleOrdinal - 1]
        const otherName = otherRule?.name?.trim()
        if (otherName) rankRows.push({ rank: other.rank, name: otherName, isPrimary: false })
      }
      // JSX table: localized title + rank badge column (monospace, fixed width) + name column.
      const tooltipRender = rankRows.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
            {t('safeguardRankTooltipTitle')}
          </Typography>
          {rankRows.map((row) => (
            <Box key={`${row.rank}-${row.name}`} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
              <Typography
                variant="body2"
                component="span"
                sx={{ fontFamily: 'monospace', fontWeight: row.isPrimary ? 700 : 400, minWidth: 32, flexShrink: 0 }}
              >
                #{row.rank}
              </Typography>
              <Typography variant="body2" component="span" sx={{ fontWeight: row.isPrimary ? 600 : 400 }}>
                {row.name}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null
      // Click navigates to the primary rule if a valid ordinal and jump callback are available.
      const ruleIdx = ruleOrdinal != null ? ruleOrdinal - 1 : -1
      const canJump = ruleIdx >= 0 && typeof onJumpToSafeguardRule === 'function'
      const onClick = canJump ? () => onJumpToSafeguardRule!(ruleIdx) : undefined
      overlays.set(artifactId, { text: `#${rank}`, color, tooltipRender, ...(onClick ? { onClick } : {}) })
    })
    return overlays.size > 0 ? overlays : null
  }, [safeguardRankByArtifactId, onJumpToSafeguardRule, safeguardRules, theme.palette.success.main, theme.palette.error.main, t])

  // Gear actions only apply to the Gear Inspector grid and must be explicitly enabled.
  const canShowRuleTemplateActions = variant === 'gearInspector'
    && showRuleTemplates
    && typeof onCreateRuleTemplate === 'function'
  // The store returns the validated mode string directly; no coercion needed here.
  const storedColumnPreference = gridColumnPreference
  // Context-menu helper drives the "long press for menu" overlay when users have not seen it yet.
  const {
    shouldShow: shouldShowGridContextHint,
    markSeen: markGridContextHintSeen,
  } = useContextMenuHint('gearInspectorGridContextMenu')
  const [gridContextHintPos, setGridContextHintPos] = useState<{ x: number; y: number } | null>(null)
  const handleGridHintPointerMove = useCallback((event: React.MouseEvent<Element>) => {
    if (!shouldShowGridContextHint) return
    setGridContextHintPos({ x: event.clientX, y: event.clientY })
  }, [shouldShowGridContextHint])
  const handleGridHintPointerLeave = useCallback(() => {
    setGridContextHintPos(null)
  }, [])
  const handleGridHintSeen = useCallback(() => {
    markGridContextHintSeen()
    setGridContextHintPos(null)
  }, [markGridContextHintSeen])
  // Render-time state adjustment: clear hint position when the hint is dismissed.
  const [prevShouldShowGridContextHint, setPrevShouldShowGridContextHint] = useState(shouldShowGridContextHint)
  if (shouldShowGridContextHint !== prevShouldShowGridContextHint) {
    setPrevShouldShowGridContextHint(shouldShowGridContextHint)
    if (!shouldShowGridContextHint) setGridContextHintPos(null)
  }
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  // Ref-based setter so the focus-scroll layout effect avoids the set-state-in-effect lint rule.
  const setCollapsedGroupsRef = useRef(setCollapsedGroups)
  useEffect(() => { setCollapsedGroupsRef.current = setCollapsedGroups }, [setCollapsedGroups])
  const visibleGroupKeys = useMemo(() => {
    const keys = new Set<string>()
    const addKeys = (group: GearInspectorGroup) => {
      keys.add(group.key)
      group.children?.forEach(addKeys)
    }
    groups.forEach(addKeys)
    return keys
  }, [groups])
  const persistentGroupKeys = useMemo(() => {
    const keys = new Set<string>()
    const addKeys = (group: GearInspectorGroup) => {
      keys.add(group.key)
      group.children?.forEach(addKeys)
    }
    // Keep collapse state keyed to the unfiltered tree so temporary filters do not wipe hidden groups.
    summaryGroups.forEach(addKeys)
    return keys
  }, [summaryGroups])
  const groupLookup = useMemo(() => {
    const map = new Map<string, GearInspectorGroup>()
    const addGroup = (group: GearInspectorGroup) => {
      map.set(group.key, group)
      group.children?.forEach(addGroup)
    }
    groups.forEach(addGroup)
    return map
  }, [groups])
  const groupOutcomeSummaryByKey = useMemo(() => {
    // Cache one outcome summary per group so header rendering avoids repeated row scans.
    const map = new Map<string, ReturnType<typeof buildGearInspectorOutcomeSummary>>()
    const addGroupSummary = (group: GearInspectorGroup) => {
      map.set(group.key, buildGearInspectorOutcomeSummary(group.rows))
      group.children?.forEach(addGroupSummary)
    }
    groups.forEach(addGroupSummary)
    return map
  }, [groups])
  const groupTotalOutcomeSummaryByKey = useMemo(() => {
    // Mirror the same lookup for unfiltered rows so filtered views can show X / Y like the global chip.
    const map = new Map<string, ReturnType<typeof buildGearInspectorOutcomeSummary>>()
    const addGroupSummary = (group: GearInspectorGroup) => {
      map.set(group.key, buildGearInspectorOutcomeSummary(group.rows))
      group.children?.forEach(addGroupSummary)
    }
    summaryGroups.forEach(addGroupSummary)
    return map
  }, [summaryGroups])
  const getMultiToggleScope = useCallback((groupKey: string): Iterable<string> => {
    const group = groupLookup.get(groupKey)
    if (!group || !group.parentKey) {
      return visibleGroupKeys
    }
    const parent = groupLookup.get(group.parentKey)
    if (parent?.children?.length) {
      return parent.children.map((child) => child.key)
    }
    return [groupKey]
  }, [groupLookup, visibleGroupKeys])

  // Scroll anchors keep the toggled header pinned in place even when expansion collapses a large subtree.
  const pendingScrollAnchorRef = useRef<{
    key: string
    targetOffset: number
    attemptedMount?: boolean
  } | null>(null)
  const recordScrollAnchor = useCallback((groupKey: string, node?: Element | null) => {
    const container = containerRef.current
    if (!container) return
    // When we have a live header node (e.g., header click) use it; otherwise defer and let the virtualizer jump later.
    const resolvedNode = node ?? container.querySelector<HTMLElement>(
      `[data-gear-inspector-grid-header="true"][data-header-key="${groupKey}"]`,
    )
    if (!resolvedNode) {
      pendingScrollAnchorRef.current = {
        key: groupKey,
        targetOffset: 0,
      }
      return
    }
    const containerRect = container.getBoundingClientRect()
    const targetRect = resolvedNode.getBoundingClientRect()
    pendingScrollAnchorRef.current = {
      key: groupKey,
      targetOffset: targetRect.top - containerRect.top,
    }
  }, [])
  const handleGroupToggle = useCallback((
    groupKey: string,
    shouldExpand: boolean,
    event?: React.SyntheticEvent<Element, Event> | null,
    options?: { applyToAll?: boolean },
  ) => {
    if (event?.currentTarget) {
      const headerNode = (event.currentTarget as HTMLElement).closest('[data-gear-inspector-grid-header="true"]')
      recordScrollAnchor(groupKey, headerNode)
    } else {
      recordScrollAnchor(groupKey)
    }
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      const isMultiToggle = Boolean(options?.applyToAll)
        || Boolean((event && 'ctrlKey' in event && (event as React.MouseEvent).ctrlKey)
          || (event && 'metaKey' in event && (event as React.MouseEvent).metaKey))
      if (isMultiToggle) {
        let changed = false
        for (const key of getMultiToggleScope(groupKey)) {
          if (shouldExpand) {
            if (next.delete(key)) changed = true
          } else if (!next.has(key)) {
            next.add(key)
            changed = true
          }
        }
        return changed ? next : prev
      }
      if (shouldExpand) {
        if (!next.has(groupKey)) return prev
        next.delete(groupKey)
        return next
      }
      if (next.has(groupKey)) return prev
      next.add(groupKey)
      return next
    })
  }, [getMultiToggleScope, recordScrollAnchor])

  // Render-time state adjustment: prune collapsed groups that no longer exist in the persistent set.
  const [prevPersistentGroupKeys, setPrevPersistentGroupKeys] = useState(persistentGroupKeys)
  if (persistentGroupKeys !== prevPersistentGroupKeys) {
    setPrevPersistentGroupKeys(persistentGroupKeys)
    // Check if any collapsed groups need pruning.
    let needsPrune = false
    collapsedGroups.forEach((key) => {
      if (!persistentGroupKeys.has(key)) needsPrune = true
    })
    if (needsPrune) {
      const next = new Set<string>()
      collapsedGroups.forEach((key) => {
        if (persistentGroupKeys.has(key)) next.add(key)
      })
      setCollapsedGroups(next)
    }
  }
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Cache the last scrollbar width so we only notify on real changes.
  const scrollbarWidthRef = useRef<number | null>(null)
  // Cache the last measured card width so we only notify on real changes.
  const cardWidthMeasureRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [showScrollGroupHint, setShowScrollGroupHint] = useState(false)
  const scrollHintVisibleRef = useRef(false)
  const scrollHintHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const scrollHintRef = useRef<HTMLDivElement | null>(null)
  const scrollHintWidthMeasureRafRef = useRef<number | null>(null)
  const [scrollHintMinWidthPx, setScrollHintMinWidthPx] = useState(0)
  const viewportMeasureRafRef = useRef<number | null>(null)
  const revealIdleDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref-based setter so ResizeObserver/rAF callbacks avoid the set-state-in-effect lint rule.
  const setViewportHeightRef = useRef(setViewportHeight)
  useEffect(() => { setViewportHeightRef.current = setViewportHeight }, [setViewportHeight])
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const scheduleViewportMeasure = () => {
      if (typeof window === 'undefined') return
      if (viewportMeasureRafRef.current != null) return
      viewportMeasureRafRef.current = window.requestAnimationFrame(() => {
        viewportMeasureRafRef.current = null
        measure()
      })
    }
    const measure = () => {
      const nextHeight = node.clientHeight
      setViewportHeightRef.current(nextHeight)
      if (nextHeight <= 0) {
        scheduleViewportMeasure()
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    // Observe the container so width updates propagate as layout shifts.
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (viewportMeasureRafRef.current != null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(viewportMeasureRafRef.current)
        viewportMeasureRafRef.current = null
      }
    }
  }, [])
  const [scrollVersion, setScrollVersion] = useState(0)
  // Scroll handler feeds TanStack, the scroll hint, and the on-demand card reveal queue.
  const handleScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((event) => {
    const nextScrollTop = event.currentTarget.scrollTop
    setScrollTop(nextScrollTop)
    if (!scrollHintVisibleRef.current) {
      scrollHintVisibleRef.current = true
      setShowScrollGroupHint(true)
    }
    if (scrollHintHideTimerRef.current) {
      clearTimeout(scrollHintHideTimerRef.current)
      scrollHintHideTimerRef.current = null
    }
    scrollHintHideTimerRef.current = window.setTimeout(() => {
      scrollHintVisibleRef.current = false
      setShowScrollGroupHint(false)
      scrollHintHideTimerRef.current = null
    }, RULES_TABLE_SCROLL_HINT_HIDE_MS)
    setScrollVersion((prev) => (prev + 1) % Number.MAX_SAFE_INTEGER)
    // After scrolling calms down, drain the reveal queue so reverse scrolling hits hydrated cards.
    if (typeof window !== 'undefined') {
      if (revealIdleDrainTimerRef.current != null) {
        window.clearTimeout(revealIdleDrainTimerRef.current)
      }
      revealIdleDrainTimerRef.current = window.setTimeout(() => {
        revealIdleDrainTimerRef.current = null
        flushGearInspectorGridCardRevealQueue(true)
      }, GRID_CARD_REVEAL_IDLE_DRAIN_DELAY_MS)
    }
  }, [])
  // Keep overrides rely on a dedicated 1/2 column preference to widen the rule list when desired.
  const resolvedKeepOverrideColumnMode = keepOverrideColumnMode === 2 ? 2 : 1
  // preferredColumnCount carries the numeric keep-override value (1 or 2).
  // For the Gear Inspector path the column count is derived dynamically from cardSizeMode + containerWidthPx instead.
  const preferredColumnCount = resolvedKeepOverrideColumnMode
  // Safeguards keeps its 1/2-column layout, but card internals should mirror the Gear Inspector 4-column profile.
  const keepOverrideCardStyleColumnCount = keepOverrideVariant ? KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT : undefined
  const {
    accordionSpacingPx,
    cardHeightPx,
    cardStyleColumnCount: cardStyleProfileColumnCount,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx: gridLeafPaddingPx,
  } = useGearInspectorGridLayoutMetrics({
    preferredColumnCount,
    ...(keepOverrideCardStyleColumnCount != null ? { cardStyleColumnCount: keepOverrideCardStyleColumnCount } : {}),
    // Gear Inspector path: panelWidthPx carries the live right-panel width during drag
    // (App.tsx updates it via rAF-throttled onResizeLive) and the committed width at rest.
    ...(!keepOverrideVariant ? { cardSizeMode: storedColumnPreference, panelWidthPx } : {}),
    showFirstMatch,
    showOtherMatches,
    theme,
  })
  // Only measure card width in the Gear Inspector so keep-override tabs can mirror it.
  const shouldMeasureCardWidth = variant === 'gearInspector' && typeof onCardWidthMeasured === 'function'
  const shouldMeasureScrollbarWidth = typeof onScrollbarWidthMeasured === 'function'
  // Re-run on row-count changes so late-loading data still triggers a measurement.
  useLayoutEffect(() => {
    // Bail fast when measurement is disabled.
    if (!shouldMeasureCardWidth) return undefined
    // Measurement needs the scroll container to query cards.
    const container = containerRef.current
    if (!container) return undefined
    // Measure the first rendered card so keep-override tabs can match its width.
    const measure = () => {
      // Grab the first visible card; virtualization may render only a subset.
      const cardNode = container.querySelector<HTMLElement>('[data-gear-inspector-grid-card="true"]')
      if (!cardNode) return
      // Read both CSS and visible widths so keep-override math stays zoom-safe.
      const cardRect = cardNode.getBoundingClientRect()
      if (!Number.isFinite(cardRect.width) || cardRect.width <= 0) return
      // Offset width is the CSS pixel width (unscaled), even when the root is zoomed.
      const offsetWidth = Math.max(0, cardNode.offsetWidth || 0)
      const scaleFactor = offsetWidth > 0 ? (cardRect.width / offsetWidth) : 1
      const normalizedScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1
      // Prefer CSS pixels so the keep-override pane width does not double-apply zoom.
      const cardCssWidth = offsetWidth > 0 ? offsetWidth : Math.round(cardRect.width / normalizedScale)
      if (!Number.isFinite(cardCssWidth) || cardCssWidth <= 0) return
      // Grid gap stays in CSS pixels so it matches the layout widths we apply.
      const normalizedGap = Math.max(0, gridGapPx)
      const targetColumns = KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT
      const currentColumns = Math.max(1, gridColumnCount)
      const gridWidth = (cardCssWidth * currentColumns)
        + (normalizedGap * Math.max(0, currentColumns - 1))
      const availableWidth = Math.max(0, gridWidth - (normalizedGap * Math.max(0, targetColumns - 1)))
      if (availableWidth <= 0) return
      const rawWidth = availableWidth / targetColumns
      if (!Number.isFinite(rawWidth) || rawWidth <= 0) return
      // Normalize to two decimals to avoid subpixel jitter churn.
      const normalizedWidth = Math.round(rawWidth * 100) / 100
      // Skip updates when width is unchanged.
      if (cardWidthMeasureRef.current === normalizedWidth) return
      // Cache and forward the new measurement.
      cardWidthMeasureRef.current = normalizedWidth
      onCardWidthMeasured?.(normalizedWidth)
    }
    measure()
    // ResizeObserver tracks layout changes; fallback to window resize when unavailable.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [gridColumnCount, gridGapPx, onCardWidthMeasured, rows.length, shouldMeasureCardWidth])
  // Track scrollbar width so keep-override panes can account for gutter space.
  useLayoutEffect(() => {
    if (!shouldMeasureScrollbarWidth) return undefined
    const container = containerRef.current
    if (!container) return undefined
    const measure = () => {
      const rawWidth = container.offsetWidth - container.clientWidth
      const nextWidth = Math.max(0, Number(rawWidth))
      if (!Number.isFinite(nextWidth)) return
      if (scrollbarWidthRef.current === nextWidth) return
      scrollbarWidthRef.current = nextWidth
      onScrollbarWidthMeasured?.(nextWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(container)
    return () => observer.disconnect()
  }, [onScrollbarWidthMeasured, shouldMeasureScrollbarWidth])
  const accordionSummaryHeightPx = useMemo(() => parseSpacingPx(theme.spacing(5)), [theme])
  useEffect(() => () => {
    if (scrollHintHideTimerRef.current) {
      clearTimeout(scrollHintHideTimerRef.current)
      scrollHintHideTimerRef.current = null
    }
    if (scrollHintWidthMeasureRafRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(scrollHintWidthMeasureRafRef.current)
      scrollHintWidthMeasureRafRef.current = null
    }
    if (typeof window !== 'undefined' && revealIdleDrainTimerRef.current != null) {
      window.clearTimeout(revealIdleDrainTimerRef.current)
      revealIdleDrainTimerRef.current = null
    }
  }, [])
  // Flatten the accordion tree whenever layout inputs change so item heights stay deterministic across renders.
  const flattenedItems = useMemo(() => buildFlattenedGridItems({
    groups,
    collapsedGroups,
    gridColumnCount,
    accordionSummaryHeightPx,
    accordionSpacingPx,
    leafPaddingPx: gridLeafPaddingPx,
    gridGapPx,
    cardHeightPx,
  }), [
    accordionSpacingPx,
    accordionSummaryHeightPx,
    cardHeightPx,
    collapsedGroups,
    gridColumnCount,
    gridGapPx,
    gridLeafPaddingPx,
    groups,
  ])
  // Anchor for shift-range selection: the last item clicked without shift held.
  const [anchorArtifactId, setAnchorArtifactId] = useState<number | null>(null)
  // Flat ordered list of artifact IDs in display order; used for shift-range selection.
  const flatOrderedArtifactIds = useMemo(() => {
    const ids: number[] = []
    for (const item of flattenedItems) {
      if (item.kind !== 'cardRow') continue
      for (const entry of item.rowEntries) {
        const id = Number(entry.artifact?.id)
        if (Number.isFinite(id)) ids.push(id)
      }
    }
    return ids
  }, [flattenedItems])
  // Click handler for individual gear cards — standard multi-select behavior:
  // plain/Ctrl = toggle item; Shift = add range; Shift+Ctrl = remove range.
  const handleCardSelect = useCallback((artifactId: number, event: React.MouseEvent) => {
    if (!gearSelectionEnabled || !onGearItemsSelect) return
    const isCtrl = event.ctrlKey || event.metaKey
    const isShift = event.shiftKey && anchorArtifactId !== null
    let nextSelection: Set<number>
    if (isShift && isCtrl) {
      // Shift+Ctrl: remove the anchor→current range from selection; anchor unchanged.
      const anchorIdx = flatOrderedArtifactIds.indexOf(anchorArtifactId!)
      const currentIdx = flatOrderedArtifactIds.indexOf(artifactId)
      if (anchorIdx < 0 || currentIdx < 0) {
        // Either endpoint not found; fall back to removing only this item.
        nextSelection = new Set(selectedGearItemIds)
        nextSelection.delete(artifactId)
      } else {
        const lo = Math.min(anchorIdx, currentIdx)
        const hi = Math.max(anchorIdx, currentIdx)
        const rangeIds = new Set(flatOrderedArtifactIds.slice(lo, hi + 1))
        nextSelection = new Set([...(selectedGearItemIds ?? [])].filter(id => !rangeIds.has(id)))
      }
      // Anchor does not change on shift-click.
    } else if (isShift) {
      // Shift: add the anchor→current range to the existing selection; anchor unchanged.
      const anchorIdx = flatOrderedArtifactIds.indexOf(anchorArtifactId!)
      const currentIdx = flatOrderedArtifactIds.indexOf(artifactId)
      if (anchorIdx < 0 || currentIdx < 0) {
        // Either endpoint not found; fall back to adding only this item.
        nextSelection = new Set(selectedGearItemIds)
        nextSelection.add(artifactId)
      } else {
        const lo = Math.min(anchorIdx, currentIdx)
        const hi = Math.max(anchorIdx, currentIdx)
        nextSelection = new Set([...(selectedGearItemIds ?? []), ...flatOrderedArtifactIds.slice(lo, hi + 1)])
      }
      // Anchor does not change on shift-click.
    } else {
      // Plain click or Ctrl+click: toggle this item and update the anchor.
      // Ctrl held alone is treated identically to a plain click — standard multi-select behavior.
      nextSelection = new Set(selectedGearItemIds)
      if (selectedGearItemIds?.has(artifactId)) {
        nextSelection.delete(artifactId)
      } else {
        nextSelection.add(artifactId)
      }
      setAnchorArtifactId(artifactId)
    }
    onGearItemsSelect(nextSelection)
  }, [
    gearSelectionEnabled,
    onGearItemsSelect,
    anchorArtifactId,
    flatOrderedArtifactIds,
    selectedGearItemIds,
  ])
  const getFlattenedItemKey = useCallback(
    (index: number) => flattenedItems[index]?.key ?? `gear-inspector-grid-item-${index}`,
    [flattenedItems],
  )
  // Single virtualizer now covers headers + rows; item height hints keep scroll position stable when toggling groups.
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual v3 is not React Compiler-compatible yet; tracked at https://github.com/TanStack/virtual/issues/736
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => flattenedItems[index]?.height ?? accordionSummaryHeightPx,
    overscan: GRID_GROUP_VIRTUAL_OVERSCAN_ROWS,
    getItemKey: getFlattenedItemKey,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  const virtualizedHeight = Math.max(rowVirtualizer.getTotalSize(), 0)
  const virtualizationRangeStartIndex = virtualItems.length > 0 ? virtualItems[0]!.index : 0
  const virtualizationRangeEndIndex = virtualItems.length > 0
    ? virtualItems[virtualItems.length - 1]!.index + 1
    : flattenedItems.length
  useLayoutEffect(() => {
    const pending = pendingScrollAnchorRef.current
    if (!pending) return
    const container = containerRef.current
    if (!container) {
      // Container unmounted; nothing to keep in view.
      pendingScrollAnchorRef.current = null
      return
    }
    // After the flattened list settles, measure the header again and nudge scrollTop so it stays in-frame.
    const targetNode = container.querySelector<HTMLElement>(`[data-gear-inspector-grid-header="true"][data-header-key="${pending.key}"]`)
    if (!targetNode) {
      // Header is not in the DOM yet (collapsed list, new sibling), so scroll the virtualizer to it explicitly.
      const targetIndex = flattenedItems.findIndex(
        (item) => item.kind === 'groupHeader' && item.group.key === pending.key,
      )
      if (targetIndex >= 0) {
        rowVirtualizer.scrollToIndex(targetIndex, { align: 'start' })
        pending.attemptedMount = true
        return
      }
      pendingScrollAnchorRef.current = null
      return
    }
    const containerRect = container.getBoundingClientRect()
    const targetRect = targetNode.getBoundingClientRect()
    const delta = (targetRect.top - containerRect.top) - pending.targetOffset
    if (Math.abs(delta) > 0.5) {
      container.scrollTop += delta
    }
    pendingScrollAnchorRef.current = null
  }, [flattenedItems, rowVirtualizer, virtualizationRangeStartIndex, virtualizationRangeEndIndex])
  const rowLookup = useMemo(() => {
    const map = new Map<number, GearInspectorPreviewRow>()
    rows.forEach((row) => {
      const artifactId = Number(row.artifact?.id)
      if (Number.isFinite(artifactId)) {
        map.set(artifactId, row)
      }
    })
    return map
  }, [rows])
  const rowGroupKeyLookup = useMemo(() => {
    // Map every rendered artifact id to its leaf group so context-menu actions can scope themselves correctly.
    const map = new Map<number, string>()
    const assignGroup = (group: GearInspectorGroup) => {
      const hasChildren = Boolean(group.children?.length)
      if (hasChildren) {
        // Keep walking to leaves so nested accessories resolve to the concrete accordion we can collapse.
        group.children?.forEach(assignGroup)
        return
      }
      // Leaf groups own the actual cards; capture their artifact ids for quick reverse lookup.
      group.rows.forEach((row) => {
        const artifactId = Number(row.artifact?.id)
        if (Number.isFinite(artifactId)) {
          map.set(artifactId, group.key)
        }
      })
    }
    groups.forEach(assignGroup)
    return map
  }, [groups])
  // Capsule for all entering/leaving detection state.  Keeping everything in one ref
  // prevents the ref-mutation-in-useMemo anti-pattern that React StrictMode double-invocation
  // would corrupt (StrictMode invokes useMemo twice; the second call must see the same ref
  // state as the first so it returns an identical result rather than an empty entering set).
  type EnterDetectionState = {
    rows: readonly GearInspectorPreviewRow[] | null
    enterKey: string | undefined
    clearGen: number
    prevIds: ReadonlySet<number>
    result: ReadonlySet<number>
    // Monotonically increments each time items leave the result set; used to bump
    // leavingGeneration so summary chips pulse even on neutral-total changes.
    leavingEpoch: number
  }
  const enterDetectionRef = useRef<EnterDetectionState>({
    rows: null, enterKey: undefined, clearGen: -1,
    prevIds: new Set(), result: new Set(), leavingEpoch: 0,
  })
  // clearGeneration bumps via setTimeout after the animation window to force the
  // memo below to recompute and return an empty entering set.
  const [clearGeneration, setClearGeneration] = useState(0)
  const clearEnterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enterDetection = useMemo((): { entering: ReadonlySet<number>; leavingEpoch: number } => {
    const state = enterDetectionRef.current
    // StrictMode guard: React may invoke useMemo twice with identical inputs and discard the
    // first result, but ref mutations from the first call persist.  When inputs match the
    // last committed run, return the cached result to avoid re-computing against a stale ref.
    if (state.rows === rows && state.enterKey === enterKey && state.clearGen === clearGeneration) {
      return { entering: state.result, leavingEpoch: state.leavingEpoch }
    }
    const filterChanged = state.enterKey !== enterKey
    // clearGen bump: animation window elapsed — empty the entering set, keep prevIds intact
    // so the next real rows change still computes the correct delta.
    const isClearGen = !filterChanged && state.rows === rows && state.clearGen !== clearGeneration
    let nextResult: ReadonlySet<number>
    let nextPrevIds: ReadonlySet<number>
    let leavingEpoch = state.leavingEpoch
    if (isClearGen) {
      nextResult = new Set()
      nextPrevIds = state.prevIds
    } else if (filterChanged) {
      // Filter selection changed: update the ID baseline so the next DB update computes
      // the correct delta, but return an empty entering set — the user switched chips,
      // not the underlying data, so no card animations should fire.
      const currentIds = new Set<number>()
      for (const row of rows) {
        const id = Number(row.artifact?.id)
        if (Number.isFinite(id)) currentIds.add(id)
      }
      nextResult = new Set()
      nextPrevIds = currentIds
    } else {
      // rows changed due to a DB update or rule change with the same filter: compute delta.
      // Cards animate for IDs that were absent from the previous rows array.
      const currentIds = new Set<number>()
      const entering = new Set<number>()
      let leavingCount = 0
      for (const row of rows) {
        const id = Number(row.artifact?.id)
        if (!Number.isFinite(id)) continue
        currentIds.add(id)
        if (!state.prevIds.has(id)) entering.add(id)
      }
      for (const id of state.prevIds) {
        if (!currentIds.has(id)) leavingCount++
      }
      // Each leaving batch gets its own epoch so the summary chip always pulses,
      // even when total count is unchanged (e.g. one item added, one removed).
      if (leavingCount > 0) leavingEpoch++
      nextResult = entering
      nextPrevIds = currentIds
    }
    // Commit new state; safe to mutate here because the StrictMode guard above ensures
    // a true second invocation returns early before reaching this point.
    state.rows = rows
    state.enterKey = enterKey
    state.clearGen = clearGeneration
    state.prevIds = nextPrevIds
    state.result = nextResult
    state.leavingEpoch = leavingEpoch
    return { entering: nextResult, leavingEpoch }
    // enterDetectionRef is a ref; refs are intentionally omitted from the dependency array.
  }, [rows, enterKey, clearGeneration])
  const enteringArtifactIds = enterDetection.entering
  // leavingEpoch is a memo-derived number that increments each time items leave the result
  // set.  Passing it directly to the chip fingerprint is sufficient — no extra state layer
  // or effect needed.  When rows change and items leave, the memo re-runs (rows is a dep),
  // increments leavingEpoch, and the chip's useChangePulse detects the fingerprint change.
  const leavingGeneration = enterDetection.leavingEpoch
  useEffect(() => {
    // Schedule clearing the entering set after the animation window elapses.
    if (enteringArtifactIds.size === 0) return // eslint-disable-line react-you-might-not-need-an-effect/no-event-handler -- timer teardown driven by derived memo state, not a user event
    if (clearEnterTimerRef.current !== null) clearTimeout(clearEnterTimerRef.current)
    clearEnterTimerRef.current = setTimeout(
      () => setClearGeneration((g) => g + 1),
      GRID_CARD_ENTER_ANIMATION_MS + 50,
    )
  }, [enteringArtifactIds])
  // Track which group keys are newly visible so their summary chips can play an animateIn
  // pulse.  useChangePulse skips the first mount, so without this chips stay silent when
  // a group appears for the first time after a filter change or a DB update.
  type GroupEnterState = {
    groups: readonly GearInspectorGroup[] | null
    clearGen: number
    prevKeys: ReadonlySet<string>
    result: ReadonlySet<string>
  }
  const groupEnterRef = useRef<GroupEnterState>({
    groups: null, clearGen: -1, prevKeys: new Set(), result: new Set(),
  })
  const [clearGroupGeneration, setClearGroupGeneration] = useState(0)
  const clearGroupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enteringGroupKeys = useMemo((): ReadonlySet<string> => {
    const state = groupEnterRef.current
    // StrictMode guard: same inputs → return cached result.
    if (state.groups === groups && state.clearGen === clearGroupGeneration) return state.result
    const isClearGen = state.groups === groups && state.clearGen !== clearGroupGeneration
    let result: ReadonlySet<string>
    let nextPrevKeys: ReadonlySet<string>
    if (isClearGen) {
      result = new Set()
      nextPrevKeys = state.prevKeys
    } else {
      // Collect all current group keys (including children) and find newly-appeared ones.
      const currentKeys = new Set<string>()
      const entering = new Set<string>()
      const visit = (g: GearInspectorGroup) => {
        currentKeys.add(g.key)
        if (!state.prevKeys.has(g.key)) entering.add(g.key)
        g.children?.forEach(visit)
      }
      groups.forEach(visit)
      result = entering
      nextPrevKeys = currentKeys
    }
    state.groups = groups
    state.clearGen = clearGroupGeneration
    state.prevKeys = nextPrevKeys
    state.result = result
    return result
    // groupEnterRef is a ref; intentionally omitted from the dependency array.
  }, [groups, clearGroupGeneration])
  useEffect(() => {
    // Clear the entering group set after the chip pulse animation window.
    if (enteringGroupKeys.size === 0) return
    if (clearGroupTimerRef.current !== null) clearTimeout(clearGroupTimerRef.current)
    clearGroupTimerRef.current = setTimeout(
      () => setClearGroupGeneration((g) => g + 1),
      GEAR_INSPECTOR_SUMMARY_CHIP_PULSE_MS + 50,
    )
    // Cancel the pending timer if enteringGroupKeys changes again or the component unmounts.
    return () => {
      if (clearGroupTimerRef.current !== null) {
        clearTimeout(clearGroupTimerRef.current)
        clearGroupTimerRef.current = null
      }
    }
  }, [enteringGroupKeys])
  const [focusPulseArtifactId, setFocusPulseArtifactId] = useState<number | null>(null)
  // Ref-based setter so the timer callback and layout effect avoid the set-state-in-effect lint rule.
  const setFocusPulseArtifactIdRef = useRef(setFocusPulseArtifactId)
  useEffect(() => { setFocusPulseArtifactIdRef.current = setFocusPulseArtifactId }, [setFocusPulseArtifactId])
  const focusPulseClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerFocusPulse = useCallback((artifactId: number) => {
    // Replace any prior pulse so rapid star-clicks always emphasize the latest card.
    if (focusPulseClearTimeoutRef.current) {
      clearTimeout(focusPulseClearTimeoutRef.current)
      focusPulseClearTimeoutRef.current = null
    }
    setFocusPulseArtifactIdRef.current(artifactId)
    focusPulseClearTimeoutRef.current = setTimeout(() => {
      setFocusPulseArtifactIdRef.current((current) => (current === artifactId ? null : current))
      focusPulseClearTimeoutRef.current = null
    }, GRID_CARD_FOCUS_PULSE_DURATION_MS)
  }, [])
  useEffect(() => () => {
    if (focusPulseClearTimeoutRef.current) {
      clearTimeout(focusPulseClearTimeoutRef.current)
      focusPulseClearTimeoutRef.current = null
    }
  }, [])
  const lastAppliedFocusTokenRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!focusArtifactRequest) return
    if (lastAppliedFocusTokenRef.current === focusArtifactRequest.token) return
    const targetArtifactId = Number(focusArtifactRequest.artifactId)
    if (!Number.isFinite(targetArtifactId)) {
      lastAppliedFocusTokenRef.current = focusArtifactRequest.token
      return
    }
    // Ensure the owning accordion branch is expanded before we attempt to scroll.
    const targetGroupKey = rowGroupKeyLookup.get(targetArtifactId)
    if (targetGroupKey) {
      const keysToExpand: string[] = []
      let cursor: string | null = targetGroupKey
      while (cursor) {
        keysToExpand.push(cursor)
        cursor = groupLookup.get(cursor)?.parentKey ?? null
      }
      const shouldExpand = keysToExpand.some((key) => collapsedGroups.has(key))
      if (shouldExpand) {
        setCollapsedGroupsRef.current((prev) => {
          const next = new Set(prev)
          for (const key of keysToExpand) {
            next.delete(key)
          }
          return next.size === prev.size ? prev : next
        })
        return
      }
    }
    const targetIndex = flattenedItems.findIndex((item) => (
      item.kind === 'cardRow'
      && item.rowEntries.some((entry) => Number(entry.artifact?.id) === targetArtifactId)
    ))
    if (targetIndex < 0) {
      // If filters hide the row we still consume the request to avoid retry loops.
      if (filterActive) {
        onFocusArtifactFilteredOut?.(targetArtifactId)
      }
      lastAppliedFocusTokenRef.current = focusArtifactRequest.token
      return
    }
    // Programmatic jumps get a temporary visual pulse because cards have no persistent selection state yet.
    triggerFocusPulse(targetArtifactId)
    rowVirtualizer.scrollToIndex(targetIndex, { align: 'center' })
    // Virtualizer scroll is index-based; follow with DOM centering for the exact card within its row.
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const container = containerRef.current
        const card = container?.querySelector<HTMLElement>(
          `[data-gear-inspector-grid-card="true"][data-row-id="${targetArtifactId}"]`,
        )
        card?.scrollIntoView({ block: 'center', inline: 'nearest' })
      })
    }
    lastAppliedFocusTokenRef.current = focusArtifactRequest.token
  }, [
    collapsedGroups,
    filterActive,
    flattenedItems,
    focusArtifactRequest,
    groupLookup,
    onFocusArtifactFilteredOut,
    rowGroupKeyLookup,
    rowVirtualizer,
    triggerFocusPulse,
  ])
  const fallbackScrollHintRowId = useMemo(() => {
    for (let idx = 0; idx < rows.length; idx += 1) {
      const candidateId = Number(rows[idx]?.artifact?.id)
      if (Number.isFinite(candidateId)) {
        return candidateId
      }
    }
    return null
  }, [rows])
  // Context menu state tracks the pointer anchor plus the owning group so actions stay scoped.
  const [gridMenuGroupKey, setGridMenuGroupKey] = useState<string | null>(null)
  const [gridMenuPosition, setGridMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const gridMenuOpen = Boolean(gridMenuPosition)
  const gridMenuPaperRef = useRef<HTMLDivElement | null>(null)
  // Nested preset editor menu should not close the parent grid menu when clicked.
  const normalizedPresetEditorPaperRef = useRef<HTMLDivElement | null>(null)
  const gridContextHintActive = shouldShowGridContextHint && gridContextHintPos !== null && !gridMenuOpen
  const resolveGridContextGroupKey = useCallback((target: EventTarget | null): string | null => {
    // Headers expose their group key directly while cards rely on the artifact id to locate the owning group.
    const element = target as Element | null
    if (!element || typeof element.closest !== 'function') return null
    const headerNode = element.closest<HTMLElement>('[data-gear-inspector-grid-header="true"]')
    const headerKey = headerNode?.getAttribute('data-header-key')
    if (headerKey && groupLookup.has(headerKey)) {
      // Clicking inside a header keeps the lookup cheap by reading the exported data attribute.
      return headerKey
    }
    const cardNode = element.closest<HTMLElement>('[data-gear-inspector-grid-card="true"]')
    const rowIdAttr = cardNode?.getAttribute('data-row-id')
    if (rowIdAttr) {
      const rowId = Number(rowIdAttr)
      if (Number.isFinite(rowId)) {
        // Cards only know their artifact id, so pivot through the lookup we built above.
        return rowGroupKeyLookup.get(rowId) ?? null
      }
    }
    return null
  }, [groupLookup, rowGroupKeyLookup])
  const handleGridContextMenu = useCallback((event: React.MouseEvent<Element>) => {
    event.preventDefault()
    event.stopPropagation()
    // Track the pointer target so the menu actions know which group to mutate.
    setGridMenuGroupKey(resolveGridContextGroupKey(event.target))
    setGridMenuPosition({ x: event.clientX, y: event.clientY })
    handleGridHintSeen()
  }, [handleGridHintSeen, resolveGridContextGroupKey])
  const closeGridMenu = useCallback(() => {
    // Closing the parent menu should never leave the nested preset editor orphaned.
    setNormalizedPresetEditor(null)
    setGridMenuPosition(null)
    setGridMenuGroupKey(null)
  }, [])
  const closeGridMenuOrPresetEditor = useCallback(() => {
    // UX: when the preset editor is open, a dismiss click should close the editor first,
    // but keep the parent context menu open so users can continue interacting with it.
    if (normalizedPresetEditor) {
      setNormalizedPresetEditor(null)
      return
    }
    closeGridMenu()
  }, [closeGridMenu, normalizedPresetEditor])
  // Keep overrides use their own 1/2 column preference; Gear Inspector cycles large/medium/small card sizes.
  const handleColumnToggle = useCallback(() => {
    if (keepOverrideVariant) {
      if (typeof onKeepOverrideColumnModeChange !== 'function') return
      const next = resolvedKeepOverrideColumnMode === 2 ? 1 : 2
      onKeepOverrideColumnModeChange(next)
      return
    }
    // Cycle through card size modes: large → medium → small → large.
    setColumns(
      storedColumnPreference === 'large' ? 'medium'
      : storedColumnPreference === 'medium' ? 'small'
      : 'large',
    )
  }, [
    keepOverrideVariant,
    onKeepOverrideColumnModeChange,
    resolvedKeepOverrideColumnMode,
    setColumns,
    storedColumnPreference,
  ])
  const canToggleColumns = keepOverrideVariant
    ? typeof onKeepOverrideColumnModeChange === 'function'
    : true
  const handleCompactCurrentGroup = useCallback(() => {
    if (!gridMenuGroupKey) return
    setCollapsedGroups((prev) => {
      if (prev.has(gridMenuGroupKey)) return prev
      const next = new Set(prev)
      // Collapsing is just a set insert; keep the mutation scoped to the resolved group key.
      next.add(gridMenuGroupKey)
      return next
    })
    closeGridMenu()
  }, [closeGridMenu, gridMenuGroupKey])
  // Guard the grid context menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: gridMenuGuard } = useContextMenuPaperGuard({
    open: gridMenuOpen,
    onClose: closeGridMenuOrPresetEditor,
    menuRef: gridMenuPaperRef,
    // Treat the preset editor menu as "inside" so the parent menu remains open while editing.
    ...(normalizedPresetEditor ? { insideRefs: [normalizedPresetEditorPaperRef] } : {}),
  })
  // Virtualizer data exposes row bounds immediately after scroll, so resolve the first visible card without waiting for DOM effects.
  const firstVisibleRowId = useMemo(() => {
    const viewportStartPx = scrollTop
    const viewportEndPx = viewportStartPx + viewportHeight
    for (let idx = 0; idx < virtualItems.length; idx += 1) {
      const virtualItem = virtualItems[idx]! // Length check above guarantees this entry exists.
      const flattenedItem = flattenedItems[virtualItem.index]
      if (!flattenedItem || flattenedItem.kind !== 'cardRow') continue
      const rowTopPx = virtualItem.start
      const rowBottomPx = rowTopPx + virtualItem.size
      if (rowBottomPx <= viewportStartPx) continue
      if (rowTopPx >= viewportEndPx && idx > 0) break
      for (let entryIdx = 0; entryIdx < flattenedItem.rowEntries.length; entryIdx += 1) {
        const artifactId = Number(flattenedItem.rowEntries[entryIdx]?.artifact?.id)
        if (Number.isFinite(artifactId)) {
          return artifactId
        }
      }
    }
    return fallbackScrollHintRowId
  }, [fallbackScrollHintRowId, flattenedItems, scrollTop, viewportHeight, virtualItems])
  const effectiveScrollHintRowId = useMemo(() => {
    if (firstVisibleRowId != null && rowLookup.has(firstVisibleRowId)) {
      return firstVisibleRowId
    }
    return fallbackScrollHintRowId
  }, [fallbackScrollHintRowId, firstVisibleRowId, rowLookup])
  const scrollHintDetails = useMemo(() => {
    if (effectiveScrollHintRowId == null) return null
    const row = rowLookup.get(effectiveScrollHintRowId)
    if (!row) return null
    const artifact = row.artifact
    if (!artifact) return null
    const fallback = t('gearInspectorValueUnknown')
    const slotValue = Number(artifact.slot)
    const resolvedSlotId = Number.isFinite(slotValue) ? (slotValue as ArtifactTypeId) : (1 as ArtifactTypeId)
    const slotIsAccessory = Number.isFinite(slotValue) && isAccessorySlot(resolvedSlotId)
    const factionLabel = slotIsAccessory && typeof artifact.faction === 'number'
      ? t(factionI18nKey(artifact.faction as FactionId))
      : ''
    const setLabel = formatGearInspectorSetLabel({
      setId: artifact.set ?? null,
      slot: resolvedSlotId,
      translate: t,
      lang,
    })
    const slotLabel = Number.isFinite(slotValue)
      ? t(artifactTypeI18nKey(resolvedSlotId))
      : fallback
    const rankLabel = formatGearInspectorRankLabel(artifact.rank, t)
    const rarityLabel = formatGearInspectorRarityLabel(artifact.rarity, t)
    return {
      factionLabel,
      showFactionRow: factionLabel.length > 0,
      setLabel: setLabel || fallback,
      slotLabel: slotLabel || fallback,
      rankLabel: rankLabel || fallback,
      rarityLabel: rarityLabel || fallback,
      rarityAccentColor: resolveRarityAccentColor(artifact.rarity) ?? undefined,
    }
  }, [effectiveScrollHintRowId, lang, rowLookup, t])
  const measureScrollHintWidth = useCallback(() => {
    const node = scrollHintRef.current
    if (!node) return
    const width = node.offsetWidth
    if (!Number.isFinite(width) || width <= 0) return
    setScrollHintMinWidthPx((prev) => (width > prev ? width : prev))
  }, [])
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!scrollHintDetails) return undefined
    if (scrollHintWidthMeasureRafRef.current != null) {
      window.cancelAnimationFrame(scrollHintWidthMeasureRafRef.current)
    }
    scrollHintWidthMeasureRafRef.current = window.requestAnimationFrame(() => {
      scrollHintWidthMeasureRafRef.current = null
      measureScrollHintWidth()
    })
    return () => {
      if (scrollHintWidthMeasureRafRef.current != null) {
        window.cancelAnimationFrame(scrollHintWidthMeasureRafRef.current)
        scrollHintWidthMeasureRafRef.current = null
      }
    }
  }, [measureScrollHintWidth, scrollHintDetails])
  if (rows.length === 0) {
    // Empty-state copy depends on whether we are in a keep-override tab.
    const emptyStateMessage = (() => {
      if (safeguardsVariant) {
        // Safeguards empty states explain missing Gear Inspector data or disabled rules.
        if (!hasGearInspectorData) return t('safeguardsNoGearInspectorData')
        if (!safeguardsEnabled) return t('gearInspectorTableEmptySafeguardsDisabled')
        if (filterActive) return t('gearInspectorTableEmptyFilter')
        return t('gearInspectorTableEmptySafeguardsNoMatches')
      }
      // Base Gear Inspector grid falls back to the generic filter/empty messages.
      return filterActive ? t('gearInspectorTableEmptyFilter') : t('gearInspectorGridEmpty')
    })()
    const emptyStateProps: EmptyStateWrapperProps = {
      borderVariant: 'none',
      // Fill the available pane so the alignment choice is visible (vs collapsing to content height).
      minHeight: '100%',
      verticalAlign: emptyStateVerticalAlign,
      ...(emptyStateOptions ?? {}),
    }
    return (
      <EmptyStateMessage {...emptyStateProps}>
        {emptyStateMessage}
      </EmptyStateMessage>
    )
  }
  const renderFlattenedItem = (item: FlattenedGridItem, virtualItem: ReturnType<typeof rowVirtualizer.getVirtualItems>[number]) => {
    if (!item) return null
    const nested = item.depth > 0
    // Inner slices reuse the same border + background logic so nested accordions still look layered.
    const sharedBodySx = (theme: Theme) => ({
      borderLeft: `1px solid ${theme.palette.divider}`,
      borderRight: `1px solid ${theme.palette.divider}`,
      backgroundColor: nested ? theme.palette.background.default : theme.palette.background.paper,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    })
    if (item.kind === 'groupHeader') {
      const group = item.group
      const groupOutcomeSummary = groupOutcomeSummaryByKey.get(group.key) ?? null
      const groupTotalOutcomeSummary = groupTotalOutcomeSummaryByKey.get(group.key) ?? groupOutcomeSummary
      // Count of selected items in this group's direct rows only — children are excluded so
      // parent and sub-accordion headers each show their own independent tally without overlap.
      const groupSelectedCount = gearSelectionEnabled && selectedGearItemIds
        ? group.rows.filter(row => {
            const id = Number(row.artifact?.id)
            return Number.isFinite(id) && selectedGearItemIds.has(id)
          }).length
        : 0
      const expanded = item.expanded
      const numericSetId = typeof group.setId === 'number' && group.setId > 0 ? group.setId : null
      const groupSetTooltipName = numericSetId != null ? artifactSetName(numericSetId as ArtifactSetId) : null
      const trimmedGroupLabel = group.label.trim()
      const groupDisplayName = trimmedGroupLabel.length > 0 ? trimmedGroupLabel : undefined
      const groupSetTooltipProps = groupDisplayName
        ? { displayName: groupDisplayName, showName: true }
        : undefined
      const headerIconSizePx = 24
      const summarySetIcon = numericSetId != null ? (
        <Box sx={{ lineHeight: 0, display: 'flex', alignItems: 'center' }}>
          <SetIcon
            setId={numericSetId as ArtifactSetId}
            size={headerIconSizePx}
            {...(groupDisplayName ? { label: groupDisplayName } : {})}
          />
        </Box>
      ) : null
      // Slot groups should always show their icon so headers stay scannable.
      const SlotIcon = group.kind === 'artifactSlot' && group.slot != null
        ? artifactTypeIconFor(group.slot)
        : null
      const slotIconNode = SlotIcon ? (
        <Box
          sx={{
            lineHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: headerIconSizePx,
            height: headerIconSizePx,
            fontSize: headerIconSizePx,
          }}
        >
          <SlotIcon fontSize="inherit" />
        </Box>
      ) : null
      // No-set accessories need a visible glyph when no set icon exists.
      const noSetGroup = group.kind === 'accessorySet'
        && (group.setId === 0 || group.setId === ACCESSORY_NO_SET_ID)
      // No-set accessories use a custom tooltip describing the Spider drop source.
      const noSetTooltipMarkdown = noSetGroup ? buildNoSetTooltipMarkdown(t) : null
      const noSetIconInner = noSetGroup ? (
        <Box
          component="span"
          sx={{
            lineHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: headerIconSizePx,
            height: headerIconSizePx,
            fontSize: headerIconSizePx,
            // Mirror SetIcon's built-in trailing margin so no-set/faction spacing matches set/faction spacing.
            mr: 0.75,
          }}
        >
          <NoGearSetIcon fontSize="inherit" />
        </Box>
      ) : null
      const noSetIconNode = noSetTooltipMarkdown && noSetIconInner ? (
        <MarkdownTooltip markdown={noSetTooltipMarkdown} placement="right">
          {noSetIconInner}
        </MarkdownTooltip>
      ) : noSetIconInner
      const headerRadius = Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)
      return (
        <Box
          data-gear-inspector-grid-header="true"
          data-header-key={group.key}
          sx={(theme) => ({
            borderRadius: `${headerRadius}px`,
            border: `1px solid ${theme.palette.divider}`,
            borderBottomLeftRadius: expanded ? 0 : `${headerRadius}px`,
            borderBottomRightRadius: expanded ? 0 : `${headerRadius}px`,
            backgroundColor: nested ? theme.palette.background.default : theme.palette.background.paper,
            height: '100%',
            overflow: 'hidden',
          })}
        >
          <ButtonBase
            component="div"
            role="button"
            tabIndex={0}
            onClick={(event) => handleGroupToggle(group.key, !expanded, event)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleGroupToggle(group.key, !expanded, event, { applyToAll: true })
              handleGridHintSeen()
            }}
            onKeyDown={(event) => {
              // Activate on Enter/Space like a native button when rendered as div
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleGroupToggle(group.key, !expanded, event as unknown as React.MouseEvent)
              }
            }}
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              textAlign: 'left',
              justifyContent: 'flex-start',
              px: theme.spacing(1.5),
              py: theme.spacing(1),
              minHeight: `${item.height}px`,
              borderBottom: expanded ? `1px solid ${theme.palette.divider}` : 'none',
            })}
            aria-expanded={expanded}
          >
            {/* 3-column grid: left (icon+title), center (chip, always centered), right (buttons). */}
            <Box sx={(theme) => ({ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', width: '100%', columnGap: theme.spacing(1.5) })}>
              {/* Left: set/slot icons followed by the group label. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                {groupSetTooltipName && summarySetIcon ? (
                  <WithSetTooltip name={groupSetTooltipName} {...(groupSetTooltipProps ?? {})}>
                    {summarySetIcon}
                  </WithSetTooltip>
                ) : summarySetIcon}
                {noSetIconNode}
                {slotIconNode}
                {group.factionId ? (
                  <FactionIcon
                    faction={group.factionId}
                    size={group.kind === 'accessoryFaction' ? 24 : 18}
                  />
                ) : null}
                <Typography
                  variant={nested ? 'subtitle2' : 'subtitle1'}
                  sx={{ minWidth: 0 }}
                  noWrap
                >
                  {group.label}
                </Typography>
              </Box>
              {/* Center column: chip always centered in the header row. */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GearInspectorOutcomeSummaryChip
                  summary={groupOutcomeSummary}
                  totalSummary={groupTotalOutcomeSummary}
                  showWhenEmpty
                  showFilteredTotals={Boolean(filterActive)}
                  metricMode={safeguardsVariant ? 'safeguardsOnly' : 'all'}
                  leavingGeneration={leavingGeneration}
                  animateIn={enteringGroupKeys.has(group.key)}
                />
              </Box>
              {/* Right: select buttons (when active) + expand/collapse icon, aligned to the end. */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                {gearSelectionEnabled && onGearItemsSelect && (
                  // Stop propagation on the container and both buttons so clicks never reach the
                  // accordion ButtonBase and accidentally expand/collapse the group.
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {groupSelectedCount > 0 && (
                      <Chip
                        size="small"
                        label={t('gearInspectorSelectionCount', { count: groupSelectedCount })}
                      />
                    )}
                    <Tooltip title={t('gearInspectorSelectionSelectAll')}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          const ids = collectGroupArtifactIds(group)
                          onGearItemsSelect(new Set([...(selectedGearItemIds ?? []), ...ids]))
                        }}
                        aria-label={t('gearInspectorSelectionSelectAll')}
                      >
                        <PlaylistAddCheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('gearInspectorSelectionClearAll')}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          const groupIds = new Set(collectGroupArtifactIds(group))
                          onGearItemsSelect(
                            new Set([...(selectedGearItemIds ?? [])].filter((id) => !groupIds.has(id))),
                          )
                        }}
                        aria-label={t('gearInspectorSelectionClearAll')}
                      >
                        <PlaylistRemoveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </Box>
              </Box>
            </Box>
          </ButtonBase>
        </Box>
      )
    }
    if (item.kind === 'spacer') {
      return (
        <Box
          sx={(theme) => ({
            ...(item.variant === 'top'
              ? {
                height: '100%',
                ml: 0,
              }
              : {
                // Spacers sit between bordered slices; keep the left/right grid rails continuous.
                ...sharedBodySx(theme),
                ml: 0,
              }),
          })}
        />
      )
    }
    if (item.kind === 'cardPadding') {
      return (
        <Box
          sx={(theme) => ({
            ...sharedBodySx(theme),
            borderBottom: item.position === 'bottom'
              ? `1px solid ${theme.palette.divider}`
              : 'none',
            borderBottomLeftRadius: item.position === 'bottom'
              ? `${Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)}px`
              : 0,
            borderBottomRightRadius: item.position === 'bottom'
              ? `${Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)}px`
              : 0,
          })}
        />
      )
    }
    if (item.kind === 'cardRow') {
      const isLastRow = item.rowIndex === item.rowCount - 1
      // Bottom padding owns the rounded border so the last card row doesn't double-round the container edge.
      const ownsBottomBorder = isLastRow && gridLeafPaddingPx <= 0
      const rowAbsoluteTopPx = virtualItem.start
      const rowAbsoluteBottomPx = rowAbsoluteTopPx + virtualItem.size
      const viewportStartPx = scrollTop
      const viewportEndPx = viewportStartPx + viewportHeight
      const viewportReady = viewportHeight > 0
      const intersectsViewport = viewportReady
        ? (rowAbsoluteBottomPx >= viewportStartPx && rowAbsoluteTopPx <= viewportEndPx)
        : true
      // Reveal queue still orders tasks by absolute Y with heavy penalties for off-screen rows.
      let positionOrder = rowAbsoluteTopPx
      if (viewportReady && !intersectsViewport) {
        if (rowAbsoluteBottomPx < viewportStartPx) {
          positionOrder = GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + (viewportStartPx - rowAbsoluteBottomPx)
        } else if (rowAbsoluteTopPx > viewportEndPx) {
          positionOrder = GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + (rowAbsoluteTopPx - viewportEndPx)
        }
      }
      return (
        <Box
          sx={(theme) => ({
            ...sharedBodySx(theme),
            borderBottom: ownsBottomBorder ? `1px solid ${theme.palette.divider}` : 'none',
            borderBottomLeftRadius: ownsBottomBorder
              ? `${Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)}px`
              : 0,
            borderBottomRightRadius: ownsBottomBorder
              ? `${Math.max(ACCORDION_BORDER_RADIUS_PX - (nested ? 2 : 0), 2)}px`
              : 0,
            px: theme.spacing(GRID_CARD_CONTAINER_PADDING_UNITS),
            // Let card-level glows escape the row container without affecting layout.
            overflow: 'visible',
          })}
        >
          <Box
            sx={(theme) => ({
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.max(1, gridColumnCount)}, ${GRID_CARD_SINGLE_COLUMN_TEMPLATE})`,
              columnGap: theme.spacing(GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS),
              rowGap: 0,
              width: '100%',
              // Allow card shadows to render into the column gaps.
              overflow: 'visible',
            })}
          >
            {item.rowEntries.map((row, columnIdx) => {
              const cardPriorityOrder = positionOrder + (columnIdx * 0.01)
              const artifactId = Number(row.artifact?.id)
              // Chip slot assignment (fixed, never reordered):
              // top = improvement chance %, center = safeguard rank #N, bottom = substat rating score.
              // Each chip carries its own tooltip so hovering a chip shows only that chip's content.

              // Top slot: improvement chance — chip text + per-chip tooltip (markdown + rich render).
              // Pass the stable useMemo entry directly so reference equality is preserved across renders.
              const topOverlay: GearInspectorCardTopOverlay | null = showSafeguardImprovementChance && Number.isFinite(artifactId)
                ? (safeguardUpgradeOverlayByArtifactId.get(artifactId) ?? null)
                : null

              // Center slot: safeguard rank — chip text + per-chip rank table tooltip.
              // Hidden when the showSafeguardRank toggle is off.
              // Pass the stable useMemo entry directly so reference equality is preserved across renders.
              const centerOverlay = showSafeguardRank && Number.isFinite(artifactId)
                ? (safeguardRankOverlayByArtifactId?.get(artifactId) ?? null)
                : null

              // Bottom slot: substat rating score — no tooltip, no click.
              const bottomOverlay = Number.isFinite(artifactId)
                ? (normalizedOverlayByArtifactId.get(artifactId) ?? null)
                : null

              // overlaySlotCount determines chip size + Y positions uniformly across all cards
              // (based on globally-toggled types, not per-card data availability).
              const overlaySlotCount = Math.max(1, Math.min(3,
                (normalizedOverlayEnabled ? 1 : 0) +
                (showSafeguardImprovementChance ? 1 : 0) +
                (showSafeguardRank && safeguardRankByArtifactId != null ? 1 : 0),
              )) as 1 | 2 | 3
              return (
                <GearInspectorGridCard
                  key={row.artifact.id}
                  row={row}
                  centerOverlay={centerOverlay}
                  topOverlay={topOverlay}
                  bottomOverlay={bottomOverlay}
                  overlaySlotCount={overlaySlotCount}
                  substatColors={substatColors}
                  useStatButtonColors={useStatButtonColors}
                  suppressMatchDetails={matchDetailsFrozen}
                  showFirstMatchRow={showFirstMatch}
                  showOtherMatchesRow={showOtherMatches}
                  showMatchRecipeIndex={showMatchRecipeIndex}
                  showMatchLineNumber={showMatchLineNumber}
                  showChampionIcons={showChampionIcons}
                  highlightKeepSell={highlightKeepSell}
                  cardHeightPx={cardHeightPx}
                  // Preserve real row chunking (1/2) while card internals use the 4-column visual profile.
                  gridColumnCount={cardStyleProfileColumnCount}
                  recipeNames={recipeNames}
                  onJumpToRule={onJumpToRule}
                  onCreateRuleTemplate={canShowRuleTemplateActions ? onCreateRuleTemplate : undefined}
                  highlightedRowPredicate={highlightRowPredicate}
                  dimUnhighlightedRows={shouldDimUnhighlightedRows}
                  contextGroupById={contextGroupById}
                  focusPulseActive={Number(row.artifact?.id) === focusPulseArtifactId}
                  animateIn={enteringArtifactIds.has(artifactId)}
                  cardPriority={isGearInspectorCardRevealed(artifactId)
                    ? STABLE_CARD_PRIORITY
                    : { base: scrollVersion, order: cardPriorityOrder }}
                  selectionEnabled={gearSelectionEnabled}
                  selected={gearSelectionEnabled && !!selectedGearItemIds?.has(artifactId)}
                  {...(gearSelectionEnabled ? { onSelect: (e: React.MouseEvent) => handleCardSelect(artifactId, e) } : {})}
                />
              )
            })}
          </Box>
        </Box>
      )
    }
    return null
  }
  // Disable group-compaction when we cannot resolve the group or it is already collapsed.
  const canCompactCurrentGroup = Boolean(
    gridMenuGroupKey
    && groupLookup.has(gridMenuGroupKey)
    && !collapsedGroups.has(gridMenuGroupKey),
  )
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        onMouseMove={handleGridHintPointerMove}
        onMouseLeave={handleGridHintPointerLeave}
        onContextMenu={handleGridContextMenu}
        data-gear-inspector-grid-container="true"
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // Prevent Firefox from surfacing a horizontal scrollbar due to box-shadow overflow.
          overflowX: 'hidden',
          pr: GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS,
          ...reserveScrollbarGutterSpace({
            reserveStart: false,
            basePaddingInlineEnd: theme.spacing(GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS),
          }),
        })}
      >
        <Box
          sx={{
            position: 'relative',
            height: `${virtualizedHeight}px`,
            minHeight: `${virtualizedHeight}px`,
          }}
        >
          {/* Flattened virtualization keeps only the visible headers, spacers, and card rows in the DOM. */}
          {virtualItems.map((virtualItem) => {
            const item = flattenedItems[virtualItem.index]
            if (!item) return null
            return (
              <Box
                key={item.key}
                data-index={virtualItem.index}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  height: `${virtualItem.size}px`,
                  // Let child glows render beyond the virtual row wrapper.
                  overflow: 'visible',
                }}
              >
                {renderFlattenedItem(item, virtualItem)}
              </Box>
            )
          })}
        </Box>
      </Box>
      {/* Flyout floats above the grid but ignores all pointer/touch events so cards stay interactive. */}
      {scrollHintDetails ? (
        <Box
          ref={scrollHintRef}
          aria-hidden={!showScrollGroupHint}
          aria-live="polite"
          sx={(theme) => ({
            position: 'absolute',
            top: theme.spacing(1.5),
            right: theme.spacing(1.5),
            zIndex: theme.zIndex.tooltip,
            px: 1.25,
            py: 0.5,
            borderRadius: `${Math.max(2, Math.round(Number(theme.shape.borderRadius) / 2))}px`,
            backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.9 : 0.92),
            boxShadow: theme.shadows[3],
            color: theme.palette.text.primary,
            transition: theme.transitions.create(['opacity', 'transform'], { duration: theme.transitions.duration.shorter }),
            opacity: showScrollGroupHint ? 1 : 0,
            transform: showScrollGroupHint ? 'translateY(0)' : 'translateY(-6px)',
            pointerEvents: 'none',
            minWidth: scrollHintMinWidthPx > 0 ? `${scrollHintMinWidthPx}px` : undefined,
            '& *': { pointerEvents: 'none' },
          })}
        >
          <Typography
            variant="caption"
            component="div"
            sx={{ fontWeight: 600, letterSpacing: 0.15, display: 'flex', flexDirection: 'column', gap: 0.25 }}
          >
            {scrollHintDetails.showFactionRow ? (
              <Box component="span">{scrollHintDetails.factionLabel}</Box>
            ) : null}
            <Box component="span">{scrollHintDetails.setLabel}</Box>
            <Box component="span">{scrollHintDetails.slotLabel}</Box>
            <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              <Box component="span">{scrollHintDetails.rankLabel}</Box>
              <Box component="span" sx={{ opacity: 0.8 }}>•</Box>
              <Box component="span" sx={{ color: scrollHintDetails.rarityAccentColor ?? 'inherit' }}>
                {scrollHintDetails.rarityLabel}
              </Box>
            </Box>
          </Typography>
        </Box>
      ) : null}
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={gridContextHintActive ? gridContextHintPos : null} />
        <Menu
        open={gridMenuOpen}
        onClose={closeGridMenuOrPresetEditor}
        anchorReference="anchorPosition"
        {...(gridMenuPosition ? { anchorPosition: { top: gridMenuPosition.y, left: gridMenuPosition.x } } : {})}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: gridMenuGuard,
            onRequestClose: closeGridMenu,
            closeLabel: t('close'),
          }), ref: gridMenuPaperRef },
        }}
      >
        {/* Place "Compact Current Group" first so it remains easily reachable (it is a frequent action). */}
        <MenuItem
          disableRipple
          disabled={!canCompactCurrentGroup}
          sx={{ justifyContent: 'center', py: 0.5 }}
        >
          <Button
            // Mirror the RulesFilterPanel close button styling so this action reads as a centered primary control.
            size="small"
            variant="contained"
            color="primary"
            disabled={!canCompactCurrentGroup}
            onClick={(event) => {
              event.stopPropagation()
              handleCompactCurrentGroup()
            }}
            sx={{
              px: 1.25,
              minWidth: MENU_CONTROL_MIN_WIDTH_PX,
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
            }}
          >
            {t('gearInspectorGridCompactGroup')}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={() => setShowSafeguardImprovementChance(!showSafeguardImprovementChance)}
        >
          <MarkdownTooltip markdown={t('gearInspectorGridShowSafeguardImprovementChanceTooltip')} placement="top-start">
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
              {t('gearInspectorGridShowSafeguardImprovementChance')}
            </Typography>
          </MarkdownTooltip>
          <Button
            size="small"
            variant={showSafeguardImprovementChance ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowSafeguardImprovementChance(!showSafeguardImprovementChance)
            }}
          >
            {showSafeguardImprovementChance ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={() => setShowSafeguardRank(!showSafeguardRank)}
        >
          <MarkdownTooltip markdown={t('gearInspectorGridShowSafeguardRankTooltip')} placement="top-start">
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
              {t('gearInspectorGridShowSafeguardRank')}
            </Typography>
          </MarkdownTooltip>
          <Button
            size="small"
            variant={showSafeguardRank ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowSafeguardRank(!showSafeguardRank)
            }}
          >
            {showSafeguardRank ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem
          disableRipple
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={() => {
            // Row click acts as a quick show/hide for preset overlays:
            // non-empty -> hide all, empty -> restore last used (or first-run 1..6 fallback).
            toggleNormalizedOverlayEnabledPresetsFromLastUsed()
          }}
        >
          <MarkdownTooltip markdown={t('gearInspectorGridNormalizedTooltip')} placement="top-start">
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
              {t('gearInspectorGridNormalizedLabel')}
            </Typography>
          </MarkdownTooltip>
          <Box
            // Button clicks should not trigger menu item selection; keep toggles local and explicit.
            onClick={(event) => { event.stopPropagation() }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              minWidth: MENU_CONTROL_MIN_WIDTH_PX,
              alignItems: 'flex-end',
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
              <MarkdownTooltip markdown={t('gearInspectorGridNormalizedSortSourceTooltip')} placement="top-start">
                <Box component="span">
                  <Button
                    key="gear-inspector-grid-normalized-preset-s"
                    size="small"
                    variant={normalizedOverlayPrefs.state.useSortWeights ? 'contained' : 'outlined'}
                    color="success"
                    disabled={!normalizedOverlaySortSourceAllowed}
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
                      if (!normalizedOverlaySortSourceAllowed) return
                      normalizedOverlayPrefs.toggleUseSortWeights()
                    }}
                    onContextMenu={(event) => {
                      // Sort-source button has no editor; keep right-click from opening the browser menu.
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    aria-label={t('gearInspectorSortLabel')}
                  >
                    <SortIcon sx={{ fontSize: 18 }} />
                  </Button>
                </Box>
              </MarkdownTooltip>
              {Array.from({ length: 4 }).map((_, idx) => {
                const presetId = idx as GearInspectorGridNormalizedPresetId
                const enabled = normalizedOverlayEnabledPresetSet.has(presetId)
                const preset = normalizedOverlayPrefs.state.presets[presetId]
                const label = preset
                  ? formatGearInspectorNormalizedPresetButtonLabel(presetId, preset.iconId)
                  : String(presetId + 1)
                const tooltipMarkdown = preset
                  ? buildGearInspectorNormalizedPresetTooltipMarkdown({
                      title: t('gearInspectorGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('gearInspectorNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('gearInspectorNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('gearInspectorNormalizedPresetTooltipEmpty')
                return (
                  <MarkdownTooltip
                    key={`gear-inspector-grid-normalized-preset-tooltip-${presetId}`}
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
                          normalizedOverlayPrefs.togglePresetEnabled(presetId)
                        }}
                        onContextMenu={(event) => {
                          // Right-click opens the editor for this preset (similar to Sort's weight controls).
                          event.preventDefault()
                          event.stopPropagation()
                          setNormalizedPresetEditor({ presetId, position: { x: event.clientX, y: event.clientY } })
                        }}
                      >
                        {label}
                      </Button>
                    </Box>
                  </MarkdownTooltip>
                )
              })}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
              {Array.from({ length: GEAR_INSPECTOR_NORMALIZED_PRESET_COUNT - 4 }).map((_, offset) => {
                const idx = offset + 4
                const presetId = idx as GearInspectorGridNormalizedPresetId
                const enabled = normalizedOverlayEnabledPresetSet.has(presetId)
                const preset = normalizedOverlayPrefs.state.presets[presetId]
                const label = preset
                  ? formatGearInspectorNormalizedPresetButtonLabel(presetId, preset.iconId)
                  : String(presetId + 1)
                const tooltipMarkdown = preset
                  ? buildGearInspectorNormalizedPresetTooltipMarkdown({
                      title: t('gearInspectorGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('gearInspectorNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('gearInspectorNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('gearInspectorNormalizedPresetTooltipEmpty')
                return (
                  <MarkdownTooltip
                    key={`gear-inspector-grid-normalized-preset-tooltip-${presetId}`}
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
                          normalizedOverlayPrefs.togglePresetEnabled(presetId)
                        }}
                        onContextMenu={(event) => {
                          // Right-click opens the editor for this preset (similar to Sort's weight controls).
                          event.preventDefault()
                          event.stopPropagation()
                          setNormalizedPresetEditor({ presetId, position: { x: event.clientX, y: event.clientY } })
                        }}
                      >
                        {label}
                      </Button>
                    </Box>
                  </MarkdownTooltip>
                )
              })}
            </Box>
          </Box>
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          // Glyph inclusion only matters when the overlay is actively showing a rating.
          disabled={!normalizedOverlayEnabled}
          onClick={() => {
            if (!normalizedOverlayEnabled) return
            gearInspectorSubstatSortPreferences.toggleExcludeGlyphs()
          }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {t('gearInspectorSortGlyphsLabel')}
          </Typography>
          <Button
            size="small"
            // Keep both states visually consistent; the label communicates exclude vs include.
            variant="contained"
            color="success"
            disabled={!normalizedOverlayEnabled}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              if (!normalizedOverlayEnabled) return
              gearInspectorSubstatSortPreferences.toggleExcludeGlyphs()
            }}
          >
            {normalizedOverlayExcludeGlyphs ? t('gearInspectorSortGlyphsExclude') : t('gearInspectorSortGlyphsInclude')}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} disabled={!canToggleColumns}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuGridColumns')}</Typography>
          <CycleButton
            options={[
              { value: 'large',  label: t('rulesMenuGridColumnsLarge')  },
              { value: 'medium', label: t('rulesMenuGridColumnsMedium') },
              { value: 'small',  label: t('rulesMenuGridColumnsSmall')  },
            ]}
            value={storedColumnPreference}
            onChange={(v) => {
              if (keepOverrideVariant) {
                // Keep-override mode uses a numeric 2-state column count; re-use existing handler.
                handleColumnToggle()
                return
              }
              setColumns(v as GearInspectorGridColumnMode)
            }}
            disabled={!canToggleColumns}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
          />
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowFirstMatch(!showFirstMatch)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowFirstMatch')}</Typography>
          <Button
            size="small"
            variant={showFirstMatch ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowFirstMatch(!showFirstMatch)
            }}
          >
            {showFirstMatch ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          disabled={!showFirstMatch}
          onClick={() => {
            if (!showFirstMatch) return
            setShowMatchRecipeIndex(!showMatchRecipeIndex)
          }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowMatchRecipeIndex')}</Typography>
          <Button
            size="small"
            variant={showMatchRecipeIndex ? 'contained' : 'outlined'}
            color="success"
            disabled={!showFirstMatch}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              if (!showFirstMatch) return
              setShowMatchRecipeIndex(!showMatchRecipeIndex)
            }}
          >
            {showMatchRecipeIndex ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          disabled={!showFirstMatch}
          onClick={() => {
            if (!showFirstMatch) return
            setShowMatchLine(!showMatchLineNumber)
          }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowMatchLine')}</Typography>
          <Button
            size="small"
            variant={showMatchLineNumber ? 'contained' : 'outlined'}
            color="success"
            disabled={!showFirstMatch}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              if (!showFirstMatch) return
              setShowMatchLine(!showMatchLineNumber)
            }}
          >
            {showMatchLineNumber ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowOtherMatches(!showOtherMatches)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowOtherMatches')}</Typography>
          <Button
            size="small"
            variant={showOtherMatches ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowOtherMatches(!showOtherMatches)
            }}
          >
            {showOtherMatches ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowChampionIcons(!showChampionIcons)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuShowChampionIcons')}</Typography>
          <Button
            size="small"
            variant={showChampionIcons ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowChampionIcons(!showChampionIcons)
            }}
          >
            {showChampionIcons ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        {/* Rule template button is opt-in so we surface it only for the main Gear Inspector grid. */}
        {variant === 'gearInspector' ? (
          <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowRuleTemplates(!showRuleTemplates)}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('gearInspectorGridShowRuleTemplates')}</Typography>
            <Button
              size="small"
              variant={showRuleTemplates ? 'contained' : 'outlined'}
              color="success"
              sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
              onClick={(event) => {
                event.stopPropagation()
                setShowRuleTemplates(!showRuleTemplates)
              }}
            >
              {showRuleTemplates ? t('commonOn') : t('commonOff')}
            </Button>
          </MenuItem>
        ) : null}
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setHighlightKeepSell(!highlightKeepSell)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuHighlightKeepSell')}</Typography>
          <Button
            size="small"
            variant={highlightKeepSell ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setHighlightKeepSell(!highlightKeepSell)
            }}
          >
            {highlightKeepSell ? t('commonOn') : t('commonOff')}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.75 }} />
        {/* Keep appearance controls grouped at the bottom so the grid actions stay front-loaded. */}
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleStatColors(!useStatButtonColors)}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorStatTexts')}</Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 0.5,
              width: MENU_CONTROL_MIN_WIDTH_PX,
              height: MENU_CONTROL_HEIGHT_PX,
              minHeight: MENU_CONTROL_HEIGHT_PX,
            }}
            onClick={(event) => { event.stopPropagation() }}
          >
            <Button
              size="small"
              variant={useStatButtonColors ? 'contained' : 'outlined'}
              color="success"
              sx={{ flex: '1 1 auto', minWidth: 0, height: '100%', lineHeight: 1, py: 0, px: 1 }}
              onClick={(event) => { event.stopPropagation(); onToggleStatColors(!useStatButtonColors) }}
            >
              {useStatButtonColors ? t('commonOn') : t('commonOff')}
            </Button>
            {/* Manage colors button now uses MarkdownTooltip so its multi-line hint inherits the global delay. */}
            <MarkdownTooltip markdown={t('manageColors')}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  disabled={!useStatButtonColors}
                  sx={{ flex: '0 0 auto', minWidth: 28, width: 28, height: '100%', lineHeight: 1, py: 0, ml: 'auto', px: 0.25 }}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!useStatButtonColors) return
                    onOpenManageColors()
                  }}
                  aria-label={t('manageColorsAria')}
                >
                  <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                </Button>
              </span>
            </MarkdownTooltip>
          </Box>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorBlindPalette')}</Typography>
          <CycleButton
            options={[
              { value: 'normal',   label: t('colorBlindNormal')   },
              { value: 'okabeIto', label: t('colorBlindOkabeIto') },
              { value: 'tritan',   label: t('colorBlindTritan')   },
            ]}
            value={colorBlindMode}
            variant={colorBlindMode === 'normal' ? 'outlined' : 'contained'}
            onChange={(v) => onChangeColorBlindMode(v as ColorBlindMode)}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
          />
        </MenuItem>
      </Menu>
      {normalizedPresetEditor ? (
        <GearInspectorNormalizedPresetEditorMenu
          open
          anchorPosition={normalizedPresetEditor.position}
          presetId={normalizedPresetEditor.presetId}
          preset={normalizedOverlayPrefs.state.presets[normalizedPresetEditor.presetId]!}
          onClose={() => setNormalizedPresetEditor(null)}
          onSetIconId={normalizedOverlayPrefs.setPresetIconId}
          useStatButtonColors={useStatButtonColors}
          substatColors={substatColors}
          onToggleVariant={normalizedOverlayPrefs.toggleVariant}
          onBumpWeight={normalizedOverlayPrefs.bumpWeight}
          onSetWeight={normalizedOverlayPrefs.setWeight}
          onResetPreset={normalizedOverlayPrefs.resetPreset}
          paperRef={normalizedPresetEditorPaperRef}
        />
      ) : null}
      {/* Slim bottom bar: global select-all / unselect-all + running count.
          Always visible when selection mode is active, regardless of grouping. */}
      {gearSelectionEnabled && onGearItemsSelect && (
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.5,
            borderTop: `1px solid ${theme.palette.divider}`,
            flexShrink: 0,
          })}
        >
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            label={t('gearInspectorSelectionCount', { count: selectedGearItemIds?.size ?? 0 })}
          />
          <Tooltip title={t('gearInspectorSelectionSelectAll')}>
            <IconButton
              size="small"
              onClick={() => onGearItemsSelect(new Set(flatOrderedArtifactIds))}
              aria-label={t('gearInspectorSelectionSelectAll')}
            >
              <PlaylistAddCheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('gearInspectorSelectionClearAll')}>
            <IconButton
              size="small"
              onClick={() => onGearItemsSelect(new Set())}
              disabled={!(selectedGearItemIds?.size)}
              aria-label={t('gearInspectorSelectionClearAll')}
            >
              <PlaylistRemoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  )
}

// Flattened items treat headers, spacers, and card rows uniformly so TanStack only mounts what's visible.
type FlattenedGridSpacerVariant = 'top' | 'child' | 'row'

type FlattenedGridItem =
  | {
      kind: 'groupHeader'
      key: string
      group: GearInspectorGroup
      depth: number
      expanded: boolean
      height: number
    }
  | {
      kind: 'spacer'
      key: string
      depth: number
      height: number
      variant: FlattenedGridSpacerVariant
    }
  | {
      kind: 'cardPadding'
      key: string
      group: GearInspectorGroup
      depth: number
      position: 'top' | 'bottom'
      height: number
    }
  | {
      kind: 'cardRow'
      key: string
      group: GearInspectorGroup
      depth: number
      rowEntries: GearInspectorPreviewRow[]
      rowIndex: number
      rowCount: number
      height: number
    }

// Recursively collect all artifact IDs from a group and its descendants in display order.
// Used by group header selection buttons to build the per-subtree add/remove sets.
function collectGroupArtifactIds(group: GearInspectorGroup): number[] {
  const ids: number[] = []
  for (const row of group.rows) {
    const id = Number(row.artifact?.id)
    if (Number.isFinite(id)) ids.push(id)
  }
  if (group.children) {
    for (const child of group.children) ids.push(...collectGroupArtifactIds(child))
  }
  return ids
}

// Leaf grids still render as chunked rows per column count so Safeguards + Gear Inspector variants share one calculator.
function chunkGroupRows(group: GearInspectorGroup, gridColumnCount: number): GearInspectorPreviewRow[][] {
  // Every chunk mirrors one rendered row so the flattened list can translate heights straight into DOM slots.
  const columns = Math.max(1, gridColumnCount)
  const rows: GearInspectorPreviewRow[][] = []
  for (let idx = 0; idx < group.rows.length; idx += columns) {
    rows.push(group.rows.slice(idx, idx + columns))
  }
  return rows
}

type BuildFlattenedGridItemsOptions = {
  groups: GearInspectorGroup[]
  collapsedGroups: Set<string>
  gridColumnCount: number
  accordionSummaryHeightPx: number
  accordionSpacingPx: number
  leafPaddingPx: number
  gridGapPx: number
  cardHeightPx: number
}

// Recursively convert the nested accordion tree into fixed-height slices so the virtual list stays deterministic.
function buildFlattenedGridItems({
  groups,
  collapsedGroups,
  gridColumnCount,
  accordionSummaryHeightPx,
  accordionSpacingPx,
  leafPaddingPx,
  gridGapPx,
  cardHeightPx,
}: BuildFlattenedGridItemsOptions): FlattenedGridItem[] {
  const items: FlattenedGridItem[] = []
  const rowChunkCache = new Map<string, GearInspectorPreviewRow[][]>()
  const getRowChunks = (group: GearInspectorGroup): GearInspectorPreviewRow[][] => {
    // Chunked rows depend solely on the column count, so keep a short-lived cache per flatten pass.
    let cached = rowChunkCache.get(group.key)
    if (!cached) {
      cached = chunkGroupRows(group, gridColumnCount)
      rowChunkCache.set(group.key, cached)
    }
    return cached
  }
  const visit = (group: GearInspectorGroup, depth: number) => {
    // Headerless groups render as a plain grid slice; they never collapse.
    const hasHeader = group.showHeader !== false
    const expanded = hasHeader ? !collapsedGroups.has(group.key) : true
    if (hasHeader) {
      items.push({
        kind: 'groupHeader',
        key: `header:${group.key}`,
        group,
        depth,
        expanded,
        height: accordionSummaryHeightPx,
      })
    }
    if (expanded) {
      if (group.children?.length) {
        group.children.forEach((child, idx) => {
          if (idx > 0) {
            // Preserve nested accordion spacing between sibling sets/factions.
            items.push({
              kind: 'spacer',
              key: `child-gap:${group.key}:${child.key}:${idx}`,
              depth: depth + 1,
              height: accordionSpacingPx,
              variant: 'child',
            })
          }
          visit(child, depth + 1)
        })
      } else if (group.rows.length > 0 || leafPaddingPx > 0) {
        if (leafPaddingPx > 0) {
          // Top padding emulates the original card container inset.
          items.push({
            kind: 'cardPadding',
            key: `pad-top:${group.key}`,
            group,
            depth,
            position: 'top',
            height: leafPaddingPx,
          })
        }
        const rowChunks = getRowChunks(group)
        rowChunks.forEach((rowEntries, rowIdx) => {
          if (rowIdx > 0 && gridGapPx > 0) {
            // Row spacers give TanStack the exact per-row gap budget and avoid stacking DOM nodes for empty space.
            items.push({
              kind: 'spacer',
              key: `row-gap:${group.key}:${rowIdx}`,
              depth,
              height: gridGapPx,
              variant: 'row',
            })
          }
          items.push({
            kind: 'cardRow',
            key: `row:${group.key}:${rowIdx}`,
            group,
            depth,
            rowEntries,
            rowIndex: rowIdx,
            rowCount: rowChunks.length,
            height: cardHeightPx,
          })
        })
        if (leafPaddingPx > 0) {
          // Bottom padding mirrors the accordion body padding so the card grid looks unchanged.
          items.push({
            kind: 'cardPadding',
            key: `pad-bottom:${group.key}`,
            group,
            depth,
            position: 'bottom',
            height: leafPaddingPx,
          })
        }
      }
    }
  }
  groups.forEach((group, idx) => {
    visit(group, 0)
    if (idx < groups.length - 1 && accordionSpacingPx > 0) {
      // Top level still keeps the classic accordion margin between sibling groups.
      items.push({
        kind: 'spacer',
        key: `top-gap:${group.key}:${idx}`,
        depth: 0,
        height: accordionSpacingPx,
        variant: 'top',
      })
    }
  })
  return items
}

type AccessorySetGroupBuilder = {
  group: GearInspectorGroup
  slots: Map<string, GearInspectorGroup>
}

type FactionGroupBuilder = {
  group: GearInspectorGroup
  sets: Map<string, AccessorySetGroupBuilder>
  slots: Map<string, GearInspectorGroup>
}

function groupRowsBySet(
  rows: readonly GearInspectorPreviewRow[],
  translate: TranslateFn,
  lang: string,
  options: GroupRowsBySetOptions,
): GearInspectorGroup[] {
  // Artifact sets form flat accordions, while accessories can nest faction->set->slot accordions.
  const grouping = options.grouping ?? GEAR_INSPECTOR_GROUPING_DEFAULT_STATE
  const substatSort = options.substatSort
  // Sorting stays orthogonal to grouping; grouping only controls section boundaries.
  const hasSubstatOrdering = Boolean(
    substatSort && (substatSort.priorities.length > 0 || substatSort.normalized === true),
  )
  // Non-default grouping uses a global sort order instead of per-section sorting.
  const useGlobalSort = hasSubstatOrdering && !isDefaultGearInspectorGroupingState(grouping)
  const sortedRows = useGlobalSort && substatSort
    ? sortGearInspectorRowsBySubstats(rows, substatSort)
    : rows

  if (grouping.hideHeaders) {
    // "No headers" still renders a single "Gear" accordion so the header machinery (select buttons,
    // expand/collapse) is available consistently regardless of grouping mode.
    const group: GearInspectorGroup = {
      key: 'gear-inspector:all',
      label: translate('gearInspectorAllGearLabel'),
      setId: null,
      slot: null,
      factionId: null,
      rows: sortedRows.slice(),
      order: 0,
      kind: 'artifactSet',
      showHeader: true,
      parentKey: null,
    }
    return [group]
  }

  // Normalize grouping choices once so the branching logic stays readable.
  const artifactBySet = grouping.artifacts.bySet
  const artifactBySlot = grouping.artifacts.bySlot
  const accessoryByFaction = grouping.accessories.byFaction
  const accessoryBySet = grouping.accessories.bySet
  const accessoryBySlot = grouping.accessories.bySlot
  // Flat sections are used when no grouping toggles are enabled.
  const useArtifactFlat = !artifactBySet && !artifactBySlot
  const useAccessoryFlat = !accessoryByFaction && !accessoryBySet && !accessoryBySlot

  // Map structures keep group creation cheap during the row scan.
  const artifactSetGroups = new Map<string, { group: GearInspectorGroup; slots: Map<string, GearInspectorGroup> }>()
  const artifactSlotGroups = new Map<string, GearInspectorGroup>()
  let artifactFlatGroup: GearInspectorGroup | null = null
  const accessorySetGroups = new Map<string, AccessorySetGroupBuilder>()
  const accessorySlotGroups = new Map<string, GearInspectorGroup>()
  let accessoryFlatGroup: GearInspectorGroup | null = null
  // Faction groups only populate when faction grouping is enabled.
  const factionGroups = new Map<string, FactionGroupBuilder>()

  const formatSlotLabel = (slotId: ArtifactTypeId): string => {
    // Invalid slots should render as "Unknown" instead of throwing on i18n lookup.
    const slotValue = Number(slotId)
    if (!Number.isFinite(slotValue)) return translate('gearInspectorValueUnknown')
    return translate(artifactTypeI18nKey(slotValue as ArtifactTypeId))
  }

  const ensureArtifactFlatGroup = (index: number): GearInspectorGroup => {
    if (artifactFlatGroup) return artifactFlatGroup
    artifactFlatGroup = {
      key: 'art:all',
      label: translate('artifacts'),
      setId: null,
      slot: null,
      factionId: null,
      rows: [],
      order: index,
      kind: 'artifactSet',
      parentKey: null,
    }
    return artifactFlatGroup
  }

  const ensureAccessoryFlatGroup = (index: number): GearInspectorGroup => {
    if (accessoryFlatGroup) return accessoryFlatGroup
    accessoryFlatGroup = {
      key: 'acc:all',
      label: translate('accessories'),
      setId: null,
      slot: null,
      factionId: null,
      rows: [],
      order: index,
      kind: 'accessoryFaction',
      parentKey: null,
    }
    return accessoryFlatGroup
  }

  sortedRows.forEach((row, index) => {
    // Normalize set ids so invalid input always buckets into a predictable key.
    const artifact = row.artifact
    const slot = artifact.slot as ArtifactTypeId
    const rawSetId = Number(artifact.set)
    const setId = Number.isFinite(rawSetId) ? rawSetId : 0
    if (!isAccessorySlot(slot)) {
      // Artifact grouping fans out depending on the active toggles.
      if (useArtifactFlat) {
        ensureArtifactFlatGroup(index).rows.push(row)
        return
      }
      if (artifactBySet) {
        const key = `art:set:${setId}`
        const builder = artifactSetGroups.get(key) ?? (() => {
          const setLabel = formatGearInspectorSetLabel({ setId, slot, translate, lang })
          const group: GearInspectorGroup = {
            key,
            label: setLabel,
            setId,
            slot,
            factionId: null,
            rows: [],
            order: index,
            kind: 'artifactSet',
            ...(artifactBySlot ? { children: [] } : {}),
            parentKey: null,
          }
          const next = { group, slots: new Map<string, GearInspectorGroup>() }
          artifactSetGroups.set(key, next)
          return next
        })()
        builder.group.rows.push(row)
        if (index < builder.group.order) {
          builder.group.order = index
        }
        if (artifactBySlot) {
          const slotKey = `${key}:slot:${Number(slot)}`
          let slotGroup = builder.slots.get(slotKey)
          if (!slotGroup) {
            slotGroup = {
              key: slotKey,
              label: formatSlotLabel(slot),
              setId: null,
              slot,
              factionId: null,
              rows: [],
              order: index,
              kind: 'artifactSlot',
              parentKey: key,
            }
            builder.slots.set(slotKey, slotGroup)
          }
          slotGroup.rows.push(row)
          if (index < slotGroup.order) {
            slotGroup.order = index
          }
        }
        return
      }
      if (artifactBySlot) {
        const slotKey = `art:slot:${Number(slot)}`
        let slotGroup = artifactSlotGroups.get(slotKey)
        if (!slotGroup) {
          slotGroup = {
            key: slotKey,
            label: formatSlotLabel(slot),
            setId: null,
            slot,
            factionId: null,
            rows: [],
            order: index,
            kind: 'artifactSlot',
            parentKey: null,
          }
          artifactSlotGroups.set(slotKey, slotGroup)
        }
        slotGroup.rows.push(row)
        if (index < slotGroup.order) {
          slotGroup.order = index
        }
      }
      return
    }

    // Accessories follow a parallel grouping model using faction/set/slot toggles.
    if (useAccessoryFlat) {
      ensureAccessoryFlatGroup(index).rows.push(row)
      return
    }
      if (accessoryByFaction) {
      const rawFactionId = Number(artifact.faction) || 0
      const factionId = (rawFactionId > 0 ? rawFactionId : 0) as FactionId
      const factionKey = `faction:${factionId}`
      let factionGroup = factionGroups.get(factionKey)
      if (!factionGroup) {
        const factionLabel = factionId > 0 ? translate(factionI18nKey(factionId)) : translate('gearInspectorValueUnknown')
        factionGroup = {
          group: {
            key: factionKey,
            label: factionLabel,
            setId: null,
            slot: null,
            factionId: factionId > 0 ? factionId : null,
            rows: [],
            order: index,
            kind: 'accessoryFaction',
            children: [],
            parentKey: null,
          },
          sets: new Map(),
          slots: new Map(),
        }
        factionGroups.set(factionKey, factionGroup)
      }
      factionGroup.group.rows.push(row)
      if (index < factionGroup.group.order) {
        factionGroup.group.order = index
      }
      if (accessoryBySet) {
        const setKey = `${factionKey}:set:${setId}`
        const setBuilder = factionGroup.sets.get(setKey) ?? (() => {
          const accessoryHasNoSet = setId === 0 || setId === ACCESSORY_NO_SET_ID
          // No-set accessories should still surface a readable header.
          const setLabel = accessoryHasNoSet ? translate('noSetAccessories') : formatGearInspectorSetLabel({ setId, slot, translate, lang })
          const group: GearInspectorGroup = {
            key: setKey,
            label: setLabel,
            setId,
            slot,
            factionId: factionId > 0 ? factionId : null,
            rows: [],
            order: index,
            kind: 'accessorySet',
            ...(accessoryBySlot ? { children: [] } : {}),
            parentKey: factionKey,
          }
          const next: AccessorySetGroupBuilder = { group, slots: new Map<string, GearInspectorGroup>() }
          factionGroup.sets.set(setKey, next)
          return next
        })()
        setBuilder.group.rows.push(row)
        if (index < setBuilder.group.order) {
          setBuilder.group.order = index
        }
        if (accessoryBySlot) {
          const slotKey = `${setKey}:slot:${Number(slot)}`
          let slotGroup = setBuilder.slots.get(slotKey)
          if (!slotGroup) {
            slotGroup = {
              key: slotKey,
              label: formatSlotLabel(slot),
              setId: null,
              slot,
              factionId: factionId > 0 ? factionId : null,
              rows: [],
              order: index,
              kind: 'artifactSlot',
              parentKey: setKey,
            }
            setBuilder.slots.set(slotKey, slotGroup)
          }
          slotGroup.rows.push(row)
          if (index < slotGroup.order) {
            slotGroup.order = index
          }
        }
        return
      }
      if (accessoryBySlot) {
        const slotKey = `${factionKey}:slot:${Number(slot)}`
        let slotGroup = factionGroup.slots.get(slotKey)
        if (!slotGroup) {
          slotGroup = {
            key: slotKey,
            label: formatSlotLabel(slot),
            setId: null,
            slot,
            factionId: factionId > 0 ? factionId : null,
            rows: [],
            order: index,
            kind: 'artifactSlot',
            parentKey: factionKey,
          }
          factionGroup.slots.set(slotKey, slotGroup)
        }
        slotGroup.rows.push(row)
        if (index < slotGroup.order) {
          slotGroup.order = index
        }
      }
      return
    }

    if (accessoryBySet) {
      const setKey = `acc:set:${setId}`
      const setBuilder = accessorySetGroups.get(setKey) ?? (() => {
        const accessoryHasNoSet = setId === 0 || setId === ACCESSORY_NO_SET_ID
        // Keep the no-set group labeled so headers don't collapse to blank.
        const setLabel = accessoryHasNoSet ? translate('noSetAccessories') : formatGearInspectorSetLabel({ setId, slot, translate, lang })
        const group: GearInspectorGroup = {
          key: setKey,
          label: setLabel,
          setId,
          slot,
          factionId: null,
          rows: [],
          order: index,
          kind: 'accessorySet',
          ...(accessoryBySlot ? { children: [] } : {}),
          parentKey: null,
        }
        const next: AccessorySetGroupBuilder = { group, slots: new Map<string, GearInspectorGroup>() }
        accessorySetGroups.set(setKey, next)
        return next
      })()
      setBuilder.group.rows.push(row)
      if (index < setBuilder.group.order) {
        setBuilder.group.order = index
      }
      if (accessoryBySlot) {
        const slotKey = `${setKey}:slot:${Number(slot)}`
        let slotGroup = setBuilder.slots.get(slotKey)
        if (!slotGroup) {
          slotGroup = {
            key: slotKey,
            label: formatSlotLabel(slot),
            setId: null,
            slot,
            factionId: null,
            rows: [],
            order: index,
            kind: 'artifactSlot',
            parentKey: setKey,
          }
          setBuilder.slots.set(slotKey, slotGroup)
        }
        slotGroup.rows.push(row)
        if (index < slotGroup.order) {
          slotGroup.order = index
        }
      }
      return
    }

    if (accessoryBySlot) {
      const slotKey = `acc:slot:${Number(slot)}`
      let slotGroup = accessorySlotGroups.get(slotKey)
      if (!slotGroup) {
        slotGroup = {
          key: slotKey,
          label: formatSlotLabel(slot),
          setId: null,
          slot,
          factionId: null,
          rows: [],
          order: index,
          kind: 'artifactSlot',
          parentKey: null,
        }
        accessorySlotGroups.set(slotKey, slotGroup)
      }
      slotGroup.rows.push(row)
      if (index < slotGroup.order) {
        slotGroup.order = index
      }
    }
  })

  const sortSlotGroups = (groups: GearInspectorGroup[]): GearInspectorGroup[] => {
    // Slot groups follow the canonical slot ordering unless global sort is active.
    if (useGlobalSort) return groups.sort((a, b) => a.order - b.order)
    return groups.sort((a, b) => compareArtifactTypes(a.slot ?? 0, b.slot ?? 0))
  }

  const resolveArtifactGroups = (): GearInspectorGroup[] => {
    if (useArtifactFlat) {
      return artifactFlatGroup ? [artifactFlatGroup] : []
    }
    if (artifactBySet) {
      return Array.from(artifactSetGroups.values()).map(({ group, slots }) => {
        if (!artifactBySlot) return group
        const children = sortSlotGroups(Array.from(slots.values()))
        return { ...group, children }
      }).sort((a, b) => a.order - b.order)
    }
    if (artifactBySlot) {
      return sortSlotGroups(Array.from(artifactSlotGroups.values()))
    }
    return []
  }

  const resolveAccessoryGroups = (): GearInspectorGroup[] => {
    if (useAccessoryFlat) {
      return accessoryFlatGroup ? [accessoryFlatGroup] : []
    }
    if (accessoryByFaction) {
      return Array.from(factionGroups.values()).map(({ group, sets, slots }) => {
        if (accessoryBySet) {
          const children = Array.from(sets.values()).map(({ group: setGroup, slots: setSlots }) => {
            if (!accessoryBySlot) return setGroup
            const setChildren = sortSlotGroups(Array.from(setSlots.values()))
            return { ...setGroup, children: setChildren }
          }).sort((a, b) => a.order - b.order)
          return { ...group, children }
        }
        if (accessoryBySlot) {
          return { ...group, children: sortSlotGroups(Array.from(slots.values())) }
        }
        return { ...group, children: [] }
      }).sort((a, b) => a.order - b.order)
    }
    if (accessoryBySet) {
      return Array.from(accessorySetGroups.values()).map(({ group, slots }) => {
        if (!accessoryBySlot) return group
        const children = sortSlotGroups(Array.from(slots.values()))
        return { ...group, children }
      }).sort((a, b) => a.order - b.order)
    }
    if (accessoryBySlot) {
      return sortSlotGroups(Array.from(accessorySlotGroups.values()))
    }
    return []
  }

  const resolvedArtifactGroups = resolveArtifactGroups()
  const resolvedAccessoryGroups = resolveAccessoryGroups()

  const grouped = useGlobalSort
    ? [...resolvedArtifactGroups, ...resolvedAccessoryGroups].sort((a, b) => a.order - b.order)
    : [...resolvedArtifactGroups, ...resolvedAccessoryGroups]

  const applySort = (group: GearInspectorGroup) => {
    // Substat sorting is per-group; we keep group order stable for predictability.
    if (!hasSubstatOrdering || !substatSort) return
    if (useGlobalSort) return
    // Sort every group deterministically; leaf groups render cards while parents mainly provide counts.
    group.rows = sortGearInspectorRowsBySubstats(group.rows, substatSort)
    group.children?.forEach(applySort)
  }

  grouped.forEach(applySort)
  return grouped
}

// Memoized variant — prevents re-renders when the parent re-renders but props are unchanged.
// Used wherever the grid can be skipped (e.g. recipe selection that doesn't affect the gear set).
export const GearInspectorItemsGridMemo = React.memo(GearInspectorItemsGrid)
export default GearInspectorItemsGrid
