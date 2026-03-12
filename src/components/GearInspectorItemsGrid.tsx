import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SortIcon from '@mui/icons-material/Sort'
// alpha is used in the scroll-hint overlay background; the card's tints are handled in GearInspectorGridCard.
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import { useI18n } from '../lib/i18n'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import GearInspectorOutcomeSummaryChip from './GearInspectorOutcomeSummaryChip'
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
import { useGearInspectorGridPreferences } from '../state/gearInspectorGridPreferences'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardSubstatMatch,
  sanitizeSafeguardCountMode,
  type SafeguardRule,
} from '../lib/safeguards'
import { buildSafeguardUpgradeChanceByArtifactId } from '../lib/safeguardUpgradeChance'
import EmptyStateMessage, { type EmptyStateMessageProps } from './EmptyStateMessage'
import {
  computeGearInspectorNormalizedSubstatScore,
  isGearInspectorSyntheticSortKey,
  sortGearInspectorRowsBySubstats,
  GEAR_INSPECTOR_GROUPING_DEFAULT_STATE,
  isDefaultGearInspectorGroupingState,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE,
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
  GRID_CARD_SINGLE_COLUMN_TEMPLATE,
  GRID_CARD_CONTAINER_PADDING_UNITS,
  GRID_CARD_OFFSCREEN_PRIORITY_PENALTY,
  GRID_CARD_FOCUS_PULSE_DURATION_MS,
  flushGearInspectorGridCardRevealQueue,
  useGearInspectorGridLayoutMetrics,
  formatGearInspectorRankLabel,
  formatGearInspectorRarityLabel,
  parseCssColorToRgb,
  rgbToCss,
  mixRgb,
  type GearInspectorCardTopOverlay,
} from './GearInspectorGridCard'

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
  // Optional source rows for safeguard chance math (defaults to visible rows).
  safeguardUpgradeChanceRows?: readonly GearInspectorPreviewRow[]
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
  // Optional safeguard deep-link used by the upgrade chance overlay click action.
  onJumpToSafeguardRule?: ((ruleId: string) => void) | undefined
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
  // Resolved safeguard rules used by the Gear Inspector grid upgrade-chance overlay.
  safeguardUpgradeChanceRules?: readonly SafeguardRule[]
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

export function GearInspectorItemsGrid(props: GearInspectorItemsGridProps) {
  const {
    rows,
    allRows,
    safeguardUpgradeChanceRows,
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
    onCardWidthMeasured,
    onScrollbarWidthMeasured,
    substatSort = null,
    sortState = null,
    grouping = GEAR_INSPECTOR_GROUPING_DEFAULT_STATE,
    safeguardUpgradeChanceRules = [],
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
    showSafeguardUpgradeChance,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setHighlightKeepSell,
    setShowSafeguardUpgradeChance,
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
  // Keep chance source separate from visible rows so filters do not affect chance math.
  const safeguardChanceSourceRows = safeguardUpgradeChanceRows ?? rows
  // Group chips can optionally compare filtered rows against the original unfiltered dataset.
  const groupSummarySourceRows = allRows ?? rows
  // Sorting can request chance data even when the overlay itself is hidden.
  const safeguardChanceSortEnabled = useMemo(
    () => (effectiveSubstatSort?.priorities ?? []).some((key) => Number(key) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_UPGRADE_CHANCE),
    [effectiveSubstatSort?.priorities],
  )
  // Artifacts are projected as a batch once; tooltip-only updates should not rebuild this list.
  const safeguardChanceSourceArtifacts = useMemo(
    () => safeguardChanceSourceRows.map((row) => row.artifact),
    [safeguardChanceSourceRows],
  )
  const safeguardRuleById = useMemo(() => {
    const map = new Map<string, SafeguardRule>()
    for (const rule of safeguardUpgradeChanceRules) {
      const normalizedRuleId = typeof rule.id === 'string' ? rule.id.trim() : ''
      if (!normalizedRuleId) continue
      map.set(normalizedRuleId, rule)
    }
    return map
  }, [safeguardUpgradeChanceRules])
  const safeguardUpgradeChanceByArtifactId = useMemo(() => {
    // Keep heavy chance recursion disabled unless either overlay rendering or sorting needs this data.
    if (!showSafeguardUpgradeChance && !safeguardChanceSortEnabled) {
      return buildSafeguardUpgradeChanceByArtifactId([], [])
    }
    // Chance map is keyed by artifact id so re-grouping does not invalidate lookups.
    return buildSafeguardUpgradeChanceByArtifactId(
      safeguardChanceSourceArtifacts,
      safeguardUpgradeChanceRules,
    )
  }, [
    safeguardChanceSourceArtifacts,
    safeguardChanceSortEnabled,
    safeguardUpgradeChanceRules,
    showSafeguardUpgradeChance,
  ])
  const substatSortWithSafeguardChance = useMemo(() => {
    // When improvement-chance is not part of the current sort priorities, reuse the original spec unchanged.
    if (!effectiveSubstatSort || !safeguardChanceSortEnabled) return effectiveSubstatSort
    // Comparator only needs numeric chance values; omit non-matching safeguards so they sort as null/last.
    const chanceMap = new Map<number, number | null>()
    safeguardUpgradeChanceByArtifactId.forEach((entry, artifactId) => {
      if (!entry.hasMatchingSafeguard) return
      chanceMap.set(artifactId, entry.chancePercent)
    })
    return {
      ...effectiveSubstatSort,
      safeguardUpgradeChanceByArtifactId: chanceMap,
    }
  }, [
    effectiveSubstatSort,
    safeguardChanceSortEnabled,
    safeguardUpgradeChanceByArtifactId,
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
  const safeguardUpgradeOverlayByArtifactId = useMemo(() => {
    // Tooltip-rich overlays are only needed when the card overlay toggle is enabled.
    if (!showSafeguardUpgradeChance) {
      return new Map<number, GearInspectorCardTopOverlay>()
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
    const matchedEntries = Array.from(safeguardUpgradeChanceByArtifactId.entries()).filter(([, entry]) => entry.hasMatchingSafeguard)
    if (matchedEntries.length === 0) {
      return new Map<number, GearInspectorCardTopOverlay>()
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
    const overlays = new Map<number, GearInspectorCardTopOverlay>()
    for (const [artifactId, entry] of matchedEntries) {
      const ratio = range > 0 ? (entry.chancePercent - min) / range : 1
      const color = rgbToCss(mixRgb(lowRgb, highRgb, ratio))
      const normalizedRuleId = typeof entry.matchedRuleId === 'string' ? entry.matchedRuleId.trim() : ''
      const matchedRule = normalizedRuleId ? (safeguardRuleById.get(normalizedRuleId) ?? null) : null
      const selectedSubstats = entry.debug?.selectedSubstats?.length
        ? entry.debug.selectedSubstats
        : normalizeSelectedSubstatsForTooltip(matchedRule?.substats ?? [])
      const selectedSubstatLabel = selectedSubstats.length > 0
        ? selectedSubstats.map((variant) => t(statVariantI18nKey(variant))).join(', ')
        : t('any')
      const rawMatchMode = entry.debug?.substatMatch ?? matchedRule?.substatMatch ?? SafeguardSubstatMatch.Any
      const matchModeLabel = (
        rawMatchMode === SafeguardSubstatMatch.All
          ? t('testerGridSafeguardChanceMatchModeAll')
          : (
            rawMatchMode === SafeguardSubstatMatch.PerSubstat
              ? t('testerGridSafeguardChanceMatchModePerSubstat')
              : t('testerGridSafeguardChanceMatchModeAny')
          )
      )
      const safeguardName = (() => {
        const trimmedName = matchedRule?.name?.trim() ?? ''
        if (trimmedName.length > 0) return trimmedName
        return t('testerGridSafeguardChanceUnknownRule')
      })()
      const debug = entry.debug
      const tooltipHeader = t('testerGridSafeguardChanceTooltipHeader', { chance: `${entry.chancePercent}%` })
      const tooltipProjection = t('testerGridSafeguardChanceTooltipProjection')
      const tooltipDataset = t('testerGridSafeguardChanceTooltipDataset', {
        count: numberFormatter.format(debug?.sourceArtifactCount ?? safeguardChanceSourceRows.length),
      })
      const tooltipRule = t('testerGridSafeguardChanceTooltipRule', { name: safeguardName })
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
      const tooltipRequirementBase = t('testerGridSafeguardChanceTooltipRequirement', {
        matchMode: matchModeLabel,
        substats: selectedSubstatLabel,
      })
      const tooltipRequirement = tooltipRequirementBase
      const tooltipRequirementTemplateBase = t('testerGridSafeguardChanceTooltipRequirement', {
        matchMode: matchModeLabel,
        substats: requirementSubstatsToken,
      })
      const tooltipRequirementTemplate = tooltipRequirementTemplateBase
      const tooltipRequirementTemplateParts = tooltipRequirementTemplate.split(requirementSubstatsToken)
      const tooltipRequiredCount = debug
        ? `${t('testerGridSafeguardChanceTooltipRequiredCount', { count: numberFormatter.format(debug.requiredPerGroup) })}${requiredCountScopeSuffix}`
        : null
      const debugTooltipLines = debug
        ? [
          tooltipRequiredCount,
          t('testerGridSafeguardChanceTooltipBucketCount', { count: numberFormatter.format(debug.bucketCandidateCount) }),
          t('testerGridSafeguardChanceTooltipBetterCount', { count: numberFormatter.format(debug.betterCandidateCount) }),
          t('testerGridSafeguardChanceTooltipMatchedNow', { count: numberFormatter.format(debug.matchedSelectedNow) }),
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
      const canJumpToSafeguard = normalizedRuleId.length > 0 && typeof onJumpToSafeguardRule === 'function'
      overlays.set(artifactId, {
        text: `${entry.chancePercent}%`,
        color,
        tooltipMarkdown,
        ...(tooltipRender ? { tooltipRender } : {}),
        ...(canJumpToSafeguard ? { onClick: () => onJumpToSafeguardRule(normalizedRuleId) } : {}),
      })
    }
    return overlays
  }, [
    onJumpToSafeguardRule,
    numberFormatter,
    safeguardChanceSourceRows,
    safeguardRuleById,
    safeguardUpgradeChanceByArtifactId,
    showSafeguardUpgradeChance,
    substatColors,
    useStatButtonColors,
    t,
    theme.palette.error.main,
    theme.palette.success.main,
  ])
  // Gear actions only apply to the Gear Inspector grid and must be explicitly enabled.
  const canShowRuleTemplateActions = variant === 'gearInspector'
    && showRuleTemplates
    && typeof onCreateRuleTemplate === 'function'
  // Preferences keep the old 4/5 column toggle alive while keep-override tabs use their own 1/2 columns.
  const storedColumnPreference = gridColumnPreference === 5 ? 5 : 4
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
  // Ref-based setter so the ResizeObserver/rAF callback avoids the set-state-in-effect lint rule.
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
  // Default to 1 column whenever the keep-override preference is missing.
  const preferredColumnCount = keepOverrideVariant ? resolvedKeepOverrideColumnMode : storedColumnPreference
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
  const getFlattenedItemKey = useCallback(
    (index: number) => flattenedItems[index]?.key ?? `gear-inspector-grid-item-${index}`,
    [flattenedItems],
  )
  // Single virtualizer now covers headers + rows; item height hints keep scroll position stable when toggling groups.
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual's useVirtualizer returns unstable references; compiler skips this component
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
  // Keep overrides use their own 1/2 column preference; base Gear Inspector stays on 4/5.
  const handleColumnToggle = useCallback(() => {
    if (keepOverrideVariant) {
      if (typeof onKeepOverrideColumnModeChange !== 'function') return
      const next = resolvedKeepOverrideColumnMode === 2 ? 1 : 2
      onKeepOverrideColumnModeChange(next)
      return
    }
    setColumns(storedColumnPreference === 5 ? 4 : 5)
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
    const fallback = t('testerValueUnknown')
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
        if (!hasGearInspectorData) return t('safeguardsNoTesterData')
        if (!safeguardsEnabled) return t('testerTableEmptySafeguardsDisabled')
        if (filterActive) return t('testerTableEmptyFilter')
        return t('testerTableEmptySafeguardsNoMatches')
      }
      // Base Gear Inspector grid falls back to the generic filter/empty messages.
      return filterActive ? t('testerTableEmptyFilter') : t('testerGridEmpty')
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
            onClick={(event) => handleGroupToggle(group.key, !expanded, event)}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleGroupToggle(group.key, !expanded, event, { applyToAll: true })
              handleGridHintSeen()
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
            type="button"
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%', flexWrap: 'nowrap' }}>
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
              </Box>
              <Typography
                variant={nested ? 'subtitle2' : 'subtitle1'}
                sx={{ flex: 1, minWidth: 0 }}
                noWrap
              >
                {group.label}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <GearInspectorOutcomeSummaryChip
                  summary={groupOutcomeSummary}
                  totalSummary={groupTotalOutcomeSummary}
                  showWhenEmpty
                  showFilteredTotals={Boolean(filterActive)}
                  metricMode={safeguardsVariant ? 'safeguardsOnly' : 'all'}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </Box>
            </Stack>
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
              // Overlay lookup is keyed by artifact id so scoring stays stable across regrouping/sorting.
              const centerOverlay = Number.isFinite(artifactId)
                ? (normalizedOverlayByArtifactId.get(artifactId) ?? null)
                : null
              // Safeguard chance overlay lives above the center rating so both signals can coexist.
              const topOverlay = showSafeguardUpgradeChance
                ? (
                  Number.isFinite(artifactId)
                    ? (safeguardUpgradeOverlayByArtifactId.get(artifactId) ?? null)
                    : null
                )
                : null
              return (
                <GearInspectorGridCard
                  key={row.artifact.id}
                  row={row}
                  centerOverlay={centerOverlay}
                  topOverlay={topOverlay}
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
                  focusPulseActive={Number(row.artifact?.id) === focusPulseArtifactId}
                  cardPriority={{ base: scrollVersion, order: cardPriorityOrder }}
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
            {t('testerGridCompactGroup')}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={() => setShowSafeguardUpgradeChance(!showSafeguardUpgradeChance)}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {t('testerGridShowSafeguardUpgradeChance')}
          </Typography>
          <Button
            size="small"
            variant={showSafeguardUpgradeChance ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              setShowSafeguardUpgradeChance(!showSafeguardUpgradeChance)
            }}
          >
            {showSafeguardUpgradeChance ? t('commonOn') : t('commonOff')}
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
          <MarkdownTooltip markdown={t('testerGridNormalizedTooltip')} placement="top-start">
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
              {t('testerGridNormalizedLabel')}
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
              <MarkdownTooltip markdown={t('testerGridNormalizedSortSourceTooltip')} placement="top-start">
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
                    aria-label={t('testerSortLabel')}
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
                      title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('testerNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('testerNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('testerNormalizedPresetTooltipEmpty')
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
                      title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('testerNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('testerNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('testerNormalizedPresetTooltipEmpty')
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
            {t('testerSortGlyphsLabel')}
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
            {normalizedOverlayExcludeGlyphs ? t('testerSortGlyphsExclude') : t('testerSortGlyphsInclude')}
          </Button>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          sx={{ gap: 1, alignItems: 'center' }}
          onClick={handleColumnToggle}
          disabled={!canToggleColumns}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuGridColumns')}</Typography>
          <Button
            size="small"
            variant="contained"
            color="success"
            disabled={!canToggleColumns}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              handleColumnToggle()
            }}
          >
            {t('rulesMenuGridColumnsValue', { count: preferredColumnCount })}
          </Button>
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
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('testerGridShowRuleTemplates')}</Typography>
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
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => {
          const nextMode = colorBlindMode === 'normal'
            ? 'okabeIto'
            : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
          onChangeColorBlindMode(nextMode)
        }}
        >
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorBlindPalette')}</Typography>
          <Button
            size="small"
            variant={colorBlindMode === 'normal' ? 'outlined' : 'contained'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(event) => {
              event.stopPropagation()
              const nextMode = colorBlindMode === 'normal'
                ? 'okabeIto'
                : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
              onChangeColorBlindMode(nextMode)
            }}
          >
            {colorBlindMode === 'normal'
              ? t('colorBlindNormal')
              : (colorBlindMode === 'okabeIto' ? t('colorBlindOkabeIto') : t('colorBlindTritan'))}
          </Button>
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
    // "No headers" renders everything in a single headerless group.
    const group: GearInspectorGroup = {
      key: 'gear-inspector:all',
      label: '',
      setId: null,
      slot: null,
      factionId: null,
      rows: sortedRows.slice(),
      order: 0,
      kind: 'artifactSet',
      showHeader: false,
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
    if (!Number.isFinite(slotValue)) return translate('testerValueUnknown')
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
        const factionLabel = factionId > 0 ? translate(factionI18nKey(factionId)) : translate('testerValueUnknown')
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
