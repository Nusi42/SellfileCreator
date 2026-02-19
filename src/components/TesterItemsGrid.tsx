import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Divider,
  Menu,
  MenuItem,
  Skeleton,
  Popover,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SellIcon from '@mui/icons-material/Sell'
import { alpha, keyframes, useTheme, type Theme } from '@mui/material/styles'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import MailOutlineIcon from '@mui/icons-material/MailOutline'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SortIcon from '@mui/icons-material/Sort'
import { useI18n } from '../lib/i18n'
import type { TesterPreviewRow } from '../types/testerPreview'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { NoGearSetIcon } from './NoGearSetIcon'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import {
  artifactSetName,
  artifactTypeI18nKey,
  artifactTypeName,
  compareArtifactTypes,
  factionI18nKey,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  formatLevel,
  statVariantI18nKey,
  type ArtifactTypeId,
  type ArtifactSetId,
  type FactionId,
  StatVariant,
} from '../lib/types'
import { resolveRarityAccentColor } from '../lib/rarityColors'
import { formatTesterSetLabel } from '../lib/testerFormatters'
import { artifactTypeIconFor } from './artifactTypeIcons'
import {
  formatCircledDigit,
  formatStatNumber,
  formatStatPreGlyph,
  getItemSourceDescriptor,
} from '../lib/testerPreviewFormatting'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'
import { isAccessorySlot } from '../lib/testerDomain'
import type { TesterSourceFilter } from '../lib/rulesFilter'
import { TesterSummaryLabel } from './TesterSummaryLabel'
import { TesterRuleReferenceChip } from './TesterRuleReferenceChip'
import { getTesterMatchBorderColor } from './testerMatchStyles'
import { RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
import { KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT } from '../lib/keepOverrideLayout'
// MarkdownTooltip unifies the tester’s tooltip behavior (source glyphs, manage colors, etc.) with the rest of the UI.
import MarkdownTooltip from './MarkdownTooltip'
import { WithSetTooltip, buildNoSetTooltipMarkdown } from './SetTooltip'
import { formatLocalDateTime } from '../lib/dateDisplay'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import GridIconBox from './GridIconBox'
import { buildTesterNormalizedPresetTooltipMarkdown, formatTesterNormalizedPresetButtonLabel } from '../lib/testerNormalizedPresets'
import {
  ACCESSORY_NO_SET_ID,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
  MATCHING_RECIPE_CHIP_MIN_WIDTH_PX,
  RULES_TABLE_SCROLL_HINT_HIDE_MS,
  SMALL_BUTTON_HEIGHT_PX,
  CHAMPION_ICON_BASE_SIZE,
  CHAMPION_ICON_LARGE_SIZE,
  CHAMPION_ICON_LARGE_THRESHOLD,
  CHAMPION_ICON_BORDER_RADIUS_PX,
  type ColorBlindMode,
} from '../lib/constants'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useTesterGridPreferences } from '../state/testerGridPreferences'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardSubstatMatch,
  sanitizeSafeguardCountMode,
  type SafeguardRule,
} from '../lib/safeguards'
import { buildSafeguardUpgradeChanceByArtifactId } from '../lib/safeguardUpgradeChance'
import { championIconUrl } from '../lib/iconMaps/championIconMap'
import EmptyStateMessage, { type EmptyStateMessageProps } from './EmptyStateMessage'
import {
  computeTesterNormalizedSubstatScore,
  sortTesterRowsBySubstats,
  TESTER_GROUPING_DEFAULT_STATE,
  isDefaultTesterGroupingState,
  TESTER_SORT_KEY_LAST_USAGE,
  type TesterGroupingState,
  type TesterSubstatSortSpec,
} from '../lib/testerSort'
import { TESTER_NORMALIZED_PRESET_COUNT } from '../lib/testerNormalizedPresets'
import type { TesterSubstatSortState } from '../state/testerSubstatSortPreferences'
import { useTesterSubstatSortPreferences } from '../state/testerSubstatSortPreferences'
import {
  type TesterGridNormalizedPresetId,
  useTesterGridNormalizedOverlayPreferences,
} from '../state/testerGridNormalizedOverlayPreferences'
import { TesterNormalizedPresetEditorMenu } from './TesterNormalizedPresetEditorMenu'
import type { TesterRuleTemplateIntent } from '../lib/testerRuleTemplates'
import {
  parseSpacingPx,
  TESTER_GRID_COLUMN_GAP_UNITS,
  TESTER_GRID_CONTAINER_PADDING_END_UNITS,
  TESTER_GRID_ROW_PADDING_UNITS,
} from '../lib/testerGridLayout'

type EmptyStateWrapperProps = Omit<EmptyStateMessageProps, 'children'>

const GRID_CARD_SINGLE_COLUMN_TEMPLATE = 'minmax(0, 1fr)'
const TESTER_GRID_ICON_BOX_SIZE_PX = 72
const GRID_CARD_ICON_COLUMN_PX = TESTER_GRID_ICON_BOX_SIZE_PX
const GRID_CARD_STATS_MIN_COLUMN_PX = 112
const GRID_CARD_TEMPLATE = `${GRID_CARD_ICON_COLUMN_PX}px minmax(${GRID_CARD_STATS_MIN_COLUMN_PX}px, 1fr)`
const GRID_GAP = TESTER_GRID_COLUMN_GAP_UNITS
const CARD_COLUMN_GAP_UNITS = 1.5
const CARD_BORDER_RADIUS_PX = 8
const CARD_PADDING_UNITS = 1
const CARD_MATCH_ROW_HEIGHT_PX = 24
const CARD_MATCH_ROW_GAP_PX = 2
const CARD_MATCH_ROW_MARGIN_PX = 2
const GRID_CARD_CONTAINER_PADDING_UNITS = TESTER_GRID_ROW_PADDING_UNITS
const GRID_CARD_LEFT_COLUMN_GAP_UNITS = 0.5
const GRID_CARD_SOURCE_ICON_SIZE_PX = 24
const VAULT_GLYPH_SIZE_PX = 20
const CARD_TEXT_STACK_GAP_UNITS = 0.75
const CARD_SUBSTAT_ROW_GAP_UNITS = 0.25
const CARD_SUBSTAT_LINE_HEIGHT = 1.1
const CARD_SUBSTAT_LINE_COUNT = 4
// Shadow blur matches the requested glow size.
const MYTHIC_SUBSTAT_SHADOW_BLUR_PX = 2
// Shadow spread gives the glow a crisp edge without padding.
const MYTHIC_SUBSTAT_SHADOW_SPREAD_PX = 1
// Soft tint keeps mythic bonuses visible against any card tint.
const MYTHIC_SUBSTAT_BG_ALPHA = 0.12
// Halo blur radius keeps red-on-red combos legible without overriding text colors.
const MYTHIC_SUBSTAT_TEXT_SHADOW_BLUR_PX = 2
// Alpha keeps the halo subtle so the text color remains primary.
const MYTHIC_SUBSTAT_TEXT_SHADOW_ALPHA = 0.6
// Rounded corners stop the mythic highlight from feeling harsh.
const MYTHIC_SUBSTAT_RADIUS_PX = 4
// Shared padding keeps substat text readable against the mythic glow.
const SUBSTAT_ROW_HORIZONTAL_PADDING_UNITS = 0.25
const CARD_SUMMARY_FONT_SIZE_REM = 0.9375
const CARD_SUMMARY_LINE_HEIGHT_REM = 1.25
const CARD_ASC_LINE_HEIGHT = 1.1
const CARD_ASC_FONT_DECREMENT_PX = 1.5
const CARD_ASC_BLOCK_MARGIN_TOP_UNITS = 0.125
const CARD_COLUMN_HEIGHT_BUFFER_PX = 0
const MAX_MATCHING_CHIPS = 6
const ACCORDION_MARGIN_UNITS = 0.75
const ACCORDION_BORDER_RADIUS_PX = 8
// Keep the per-card gear action compact so the stats column stays readable.
const CARD_ACTION_BUTTON_SIZE_PX = 28
const CARD_ACTION_ICON_SIZE_PX = 18
// Group-level virtualization uses light overscan because the heavy lifting happens at the card row level.
const GRID_GROUP_VIRTUAL_OVERSCAN_ROWS = 2
// Penalize off-screen rows so the reveal queue prefers on-screen cards even while overscanning nested accordions.
const GRID_CARD_OFFSCREEN_PRIORITY_PENALTY = 1_000_000

type Rgb = { r: number; g: number; b: number }

const clamp01 = (value: number): number => (
  // Clamp ratios so invalid min/max inputs cannot generate invalid CSS colors.
  Math.max(0, Math.min(1, value))
)

const parseHexChannel = (value: string): number => {
  // Hex parsing is tolerant of invalid inputs; callers treat NaN as "parse failed".
  const parsed = Number.parseInt(value, 16)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const parseCssColorToRgb = (color: string): Rgb | null => {
  // Theme palette values are usually hex, but may be rgb()/rgba(); normalize both.
  const raw = String(color).trim()
  if (!raw) return null
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      // `charAt` returns '' for out-of-range, so we never build "undefinedundefined" strings.
      const rNibble = hex.charAt(0)
      const gNibble = hex.charAt(1)
      const bNibble = hex.charAt(2)
      const r = parseHexChannel(rNibble + rNibble)
      const g = parseHexChannel(gNibble + gNibble)
      const b = parseHexChannel(bNibble + bNibble)
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
      return { r, g, b }
    }
    if (hex.length === 6) {
      const r = parseHexChannel(hex.slice(0, 2))
      const g = parseHexChannel(hex.slice(2, 4))
      const b = parseHexChannel(hex.slice(4, 6))
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
      return { r, g, b }
    }
    return null
  }
  const rgbMatch = raw.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i)
  if (!rgbMatch) return null
  const r = Number(rgbMatch[1])
  const g = Number(rgbMatch[2])
  const b = Number(rgbMatch[3])
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null
  return { r: Math.max(0, Math.min(255, r)), g: Math.max(0, Math.min(255, g)), b: Math.max(0, Math.min(255, b)) }
}

const mixRgb = (low: Rgb, high: Rgb, ratio: number): Rgb => {
  // Linear interpolation keeps the red→green gradient predictable and cheap to compute.
  const t = clamp01(ratio)
  const lerp = (a: number, b: number) => a + ((b - a) * t)
  return { r: lerp(low.r, high.r), g: lerp(low.g, high.g), b: lerp(low.b, high.b) }
}

const rgbToCss = (rgb: Rgb): string => {
  // Round to integers so the output stays stable between renders.
  const r = Math.round(Math.max(0, Math.min(255, rgb.r)))
  const g = Math.round(Math.max(0, Math.min(255, rgb.g)))
  const b = Math.round(Math.max(0, Math.min(255, rgb.b)))
  return `rgb(${r}, ${g}, ${b})`
}
// Keep the reveal queue short by pruning rows that are multiple viewports away; scrolling back to them re-enqueues a fresh task.
const GRID_CARD_REVEAL_MAX_OFFSCREEN_DISTANCE_PX = 4_000
const GRID_CARD_REVEAL_FAST_BATCH_THRESHOLD = 50
const GRID_CARD_REVEAL_EMERGENCY_THRESHOLD = 100
const GRID_CARD_REVEAL_FRAME_BUDGET_MS = 6
const GRID_CARD_REVEAL_PRUNE_THRESHOLD = 72
const GRID_CARD_REVEAL_BATCH_MULTIPLIER = 4
const GRID_CARD_REVEAL_IDLE_DRAIN_DELAY_MS = 180
const MATCHING_POPOVER_MAX_WIDTH_PX = 360
const MATCHING_CHIP_GAP_UNITS = 0.5
const MATCHING_RECIPE_CHIP_SX = {
  flexShrink: 0,
  minWidth: MATCHING_RECIPE_CHIP_MIN_WIDTH_PX,
  maxWidth: '100%',
  overflow: 'hidden',
  borderRadius: '8px',
  flexBasis: 'auto',
  flexGrow: 0,
  '& .MuiChip-label': {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const
const MATCHING_CHIP_WRAPPER_SX = {
  display: 'inline-flex',
  maxWidth: '100%',
  minWidth: 0,
  flexBasis: 'auto',
  flexGrow: 0,
  flexShrink: 0,
} as const

// Skeleton batches spread icon decoding across frames so collapsed accordions can re-open instantly.
const GRID_CARD_SKELETON_BATCH_SIZE = 6
const GRID_CARD_SKELETON_FRAME_DELAY_MS = 24
// Focused cards briefly glow so programmatic jumps are visible even without persistent selection state.
// Two slower pulses make cross-view jumps easier to notice without looking like a persistent selection.
const GRID_CARD_FOCUS_PULSE_DURATION_MS = 1500
// Pulse keyframes intentionally return to baseline so focused cards never look permanently selected.
// CSS variables provide theme-aware colors without rebuilding keyframes at runtime.
const TESTER_GRID_CARD_FOCUS_PULSE_KEYFRAMES = keyframes`
  0% {
    border-color: var(--tester-focus-border-base);
    background-color: var(--tester-focus-bg-base);
    box-shadow: var(--tester-focus-shadow-base);
  }
  18% {
    border-color: var(--tester-focus-border-peak);
    background-color: var(--tester-focus-bg-peak);
    box-shadow: var(--tester-focus-shadow-peak);
  }
  36% {
    border-color: var(--tester-focus-border-base);
    background-color: var(--tester-focus-bg-base);
    box-shadow: var(--tester-focus-shadow-base);
  }
  62% {
    border-color: var(--tester-focus-border-peak);
    background-color: var(--tester-focus-bg-peak);
    box-shadow: var(--tester-focus-shadow-peak);
  }
  80% {
    border-color: var(--tester-focus-border-base);
    background-color: var(--tester-focus-bg-base);
    box-shadow: var(--tester-focus-shadow-base);
  }
  100% {
    border-color: var(--tester-focus-border-base);
    background-color: var(--tester-focus-bg-base);
    box-shadow: var(--tester-focus-shadow-base);
  }
`

const SOURCE_ICON_MAP: Record<TesterSourceFilter, React.ElementType | null> = {
  manual: BuildOutlinedIcon,
  inventory: null,
  collection: PersonOutlineIcon,
  vault: Inventory2OutlinedIcon,
  inbox: MailOutlineIcon,
}

const measureMatchingRowContentWidth = (node: HTMLElement): number => {
  if (typeof window === 'undefined') {
    return node.clientWidth
  }
  const style = window.getComputedStyle(node)
  const paddingLeft = parseSpacingPx(style.paddingLeft)
  const paddingRight = parseSpacingPx(style.paddingRight)
  return Math.max(0, node.clientWidth - paddingLeft - paddingRight)
}
type TranslateFn = ReturnType<typeof useI18n>['t']

// Variant toggles keep-override specific layout while keeping the base tester grid intact.
type TesterItemsGridVariant = 'tester' | 'safeguards'

type TesterItemsGridProps = {
  rows: TesterPreviewRow[]
  // Optional source rows for safeguard chance math (defaults to visible rows).
  safeguardUpgradeChanceRows?: readonly TesterPreviewRow[]
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
  // Optional callback when the requested artifact is hidden by active tester filters.
  onFocusArtifactFilteredOut?: ((artifactId: number) => void) | undefined
  onJumpToRule?: ((ruleIndex: number, recipeIdx: number | null) => void) | undefined
  // Optional safeguard deep-link used by the upgrade chance overlay click action.
  onJumpToSafeguardRule?: ((ruleId: string) => void) | undefined
  onCreateRuleTemplate?: ((row: TesterPreviewRow, intent: TesterRuleTemplateIntent) => void) | undefined
  variant?: TesterItemsGridVariant
  safeguardsEnabled?: boolean
  keepOverrideColumnMode?: 1 | 2
  onKeepOverrideColumnModeChange?: (next: 1 | 2) => void
  hasTesterData?: boolean
  emptyStateOptions?: Partial<EmptyStateMessageProps> | undefined
  // Vertical anchoring for empty-state messaging: stacked layout reads better when top-aligned,
  // side-by-side layout looks balanced when centered.
  emptyStateVerticalAlign?: EmptyStateMessageProps['verticalAlign']
  suppressMatchDetails?: boolean
  // Optional highlighter lets Safeguards fade non-matching cards without forking the grid.
  highlightedRowPredicate?: ((row: TesterPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  // Optional card-width tap for keep-override layout (measures Rule Tester 4-col cards).
  onCardWidthMeasured?: (widthPx: number) => void
  // Optional scrollbar-width tap for keep-override layout (keeps pane width aligned).
  onScrollbarWidthMeasured?: (widthPx: number) => void
  // Optional Rule Tester sort controls; view-only ordering that does not affect exports.
  substatSort?: TesterSubstatSortSpec | null
  // Full sort preference state so the grid can gate the [S] overlay option.
  sortState?: TesterSubstatSortState | null
  // Grouping settings for the tester grid; independent of sorting.
  grouping?: TesterGroupingState
  // Resolved safeguard rules used by the tester-grid upgrade-chance overlay.
  safeguardUpgradeChanceRules?: readonly SafeguardRule[]
}

type TesterGroupKind = 'artifactSet' | 'artifactSlot' | 'accessorySet' | 'accessoryFaction'

type TesterGroup = {
  key: string
  label: string
  setId: number | null
  slot: ArtifactTypeId | null
  factionId: FactionId | null
  rows: TesterPreviewRow[]
  order: number
  kind: TesterGroupKind
  showHeader?: boolean
  children?: TesterGroup[]
  parentKey?: string | null
}

type GroupRowsBySetOptions = {
  grouping: TesterGroupingState
  substatSort: TesterSubstatSortSpec | null
}

type MatchingRecipeEntry = {
  recipeIdx: number
  label: string
  textColor: string | null
  keep: boolean | null
}

type TesterCardTopOverlay = {
  text: string
  color?: string
  onClick?: () => void
  tooltipMarkdown?: string
  tooltipRender?: React.ReactNode
}

export function TesterItemsGrid(props: TesterItemsGridProps) {
  const {
    rows,
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
    variant = 'tester',
    safeguardsEnabled = true,
    keepOverrideColumnMode,
    onKeepOverrideColumnModeChange,
    hasTesterData = true,
    emptyStateOptions,
    emptyStateVerticalAlign = 'center',
    suppressMatchDetails: suppressMatchDetailsProp = false,
    highlightedRowPredicate = null,
    dimUnhighlightedRows = false,
    onCardWidthMeasured,
    onScrollbarWidthMeasured,
    substatSort = null,
    sortState = null,
    grouping = TESTER_GROUPING_DEFAULT_STATE,
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
  const testerSubstatSortPreferences = useTesterSubstatSortPreferences()
  const effectiveSubstatSort = useMemo(
    () => (
      // Keep the parent-provided spec (priorities, direction, normalized sources) but force the shared glyph toggle.
      // Why: the grid context menu edits the shared preference store directly.
      substatSort ? { ...substatSort, excludeGlyphs: testerSubstatSortPreferences.state.excludeGlyphs } : substatSort
    ),
    [substatSort, testerSubstatSortPreferences.state.excludeGlyphs],
  )
  const normalizedOverlayPrefs = useTesterGridNormalizedOverlayPreferences()
  const normalizedOverlayUseSortWeights = normalizedOverlayPrefs.state.useSortWeights
  const toggleNormalizedOverlayUseSortWeights = normalizedOverlayPrefs.toggleUseSortWeights
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
    presetId: TesterGridNormalizedPresetId
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
  // Group tree is recalculated only when the dataset, locale, or sort mode changes so TanStack can reuse measured rows.
  const groups = useMemo(
    () => groupRowsBySet(rows, t, lang, { grouping, substatSort: effectiveSubstatSort }),
    [rows, t, lang, grouping, effectiveSubstatSort],
  )
  const {
    columns: gridColumnPreference,
    showFirstMatch,
    showMatchRecipeIndex,
    showMatchLine: showMatchLineNumber,
    showOtherMatches,
    showChampionIcons,
    showRuleTemplates,
    showSafeguardUpgradeChance,
    setColumns,
    setShowFirstMatch,
    setShowMatchRecipeIndex,
    setShowMatchLine,
    setShowOtherMatches,
    setShowChampionIcons,
    setShowRuleTemplates,
    setShowSafeguardUpgradeChance,
  } = useTesterGridPreferences()
  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined), [])
  // Overlay score uses the same glyph inclusion policy as the Sort UI (default excludes glyphs).
  // Why: avoids confusing users with two independent "glyph counting" toggles for the same scores.
  const normalizedOverlayExcludeGlyphs = testerSubstatSortPreferences.state.excludeGlyphs !== false
  const normalizedOverlayByArtifactId = useMemo(() => {
    // When nothing is enabled, keep the fast path obvious: no overlay map.
    if (!normalizedOverlayEnabled) return new Map<number, { text: string; color?: string }>()
    const useSortWeights = normalizedOverlayPrefs.state.useSortWeights === true
    const enabledPresetIds = normalizedOverlayPrefs.state.enabledPresetIds
    const presets = normalizedOverlayPrefs.state.presets
    // [S] uses the Sort popout’s currently selected substats + weights.
    const sortSelectedVariants = useSortWeights
      ? (effectiveSubstatSort?.priorities ?? []).filter((key) => Number(key) !== Number(TESTER_SORT_KEY_LAST_USAGE)) as StatVariant[]
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
          return computeTesterNormalizedSubstatScore(row, {
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
          const score = computeTesterNormalizedSubstatScore(row, {
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
  const safeguardUpgradeOverlayByArtifactId = useMemo(() => {
    // Keep the fast path empty when the feature toggle is off.
    if (!showSafeguardUpgradeChance) {
      return new Map<number, TesterCardTopOverlay>()
    }
    // Full-dataset mode uses caller-provided rows; fallback keeps legacy visible-rows behavior.
    const chanceRows = safeguardUpgradeChanceRows ?? rows
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
    const safeguardRuleById = new Map<string, SafeguardRule>()
    for (const rule of safeguardUpgradeChanceRules) {
      const normalizedRuleId = typeof rule.id === 'string' ? rule.id.trim() : ''
      if (!normalizedRuleId) continue
      safeguardRuleById.set(normalizedRuleId, rule)
    }
    // Chance map is keyed by artifact id so re-grouping does not invalidate lookups.
    const chanceByArtifactId = buildSafeguardUpgradeChanceByArtifactId(
      chanceRows.map((row) => row.artifact),
      safeguardUpgradeChanceRules,
    )
    // Hide overlay chips when the artifact does not match any substat safeguard.
    const matchedEntries = Array.from(chanceByArtifactId.entries()).filter(([, entry]) => entry.hasMatchingSafeguard)
    if (matchedEntries.length === 0) {
      return new Map<number, TesterCardTopOverlay>()
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
    const overlays = new Map<number, TesterCardTopOverlay>()
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
        count: numberFormatter.format(debug?.sourceArtifactCount ?? chanceRows.length),
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
                key={`safeguard-requirement-substat-${artifactId}-${variant}-${idx}`}
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
            {debugTooltipLines.map((line, idx) => (
              <Box key={`safeguard-tooltip-debug-${artifactId}-${idx}`} component="li" sx={{ p: 0, listStylePosition: 'outside' }}>
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
    rows,
    safeguardUpgradeChanceRows,
    safeguardUpgradeChanceRules,
    showSafeguardUpgradeChance,
    substatColors,
    useStatButtonColors,
    t,
    theme.palette.error.main,
    theme.palette.success.main,
  ])
  // Gear actions only apply to the Rule Tester grid and must be explicitly enabled.
  const canShowRuleTemplateActions = variant === 'tester'
    && showRuleTemplates
    && typeof onCreateRuleTemplate === 'function'
  // Preferences keep the old 4/5 column toggle alive while keep-override tabs use their own 1/2 columns.
  const storedColumnPreference = gridColumnPreference === 5 ? 5 : 4
  // Context-menu helper drives the "long press for menu" overlay when users have not seen it yet.
  const {
    shouldShow: shouldShowGridContextHint,
    markSeen: markGridContextHintSeen,
  } = useContextMenuHint('testerGridContextMenu')
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
  useEffect(() => {
    if (!shouldShowGridContextHint) {
      setGridContextHintPos(null)
    }
  }, [shouldShowGridContextHint])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const allGroupKeys = useMemo(() => {
    const keys = new Set<string>()
    const addKeys = (group: TesterGroup) => {
      keys.add(group.key)
      group.children?.forEach(addKeys)
    }
    groups.forEach(addKeys)
    return keys
  }, [groups])
  const groupLookup = useMemo(() => {
    const map = new Map<string, TesterGroup>()
    const addGroup = (group: TesterGroup) => {
      map.set(group.key, group)
      group.children?.forEach(addGroup)
    }
    groups.forEach(addGroup)
    return map
  }, [groups])
  const getMultiToggleScope = useCallback((groupKey: string): Iterable<string> => {
    const group = groupLookup.get(groupKey)
    if (!group || !group.parentKey) {
      return allGroupKeys
    }
    const parent = groupLookup.get(group.parentKey)
    if (parent?.children?.length) {
      return parent.children.map((child) => child.key)
    }
    return [groupKey]
  }, [allGroupKeys, groupLookup])

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
      `[data-tester-grid-header="true"][data-header-key="${groupKey}"]`,
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
      const headerNode = (event.currentTarget as HTMLElement).closest('[data-tester-grid-header="true"]')
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

  useEffect(() => {
    setCollapsedGroups((prev) => {
      let changed = false
      const next = new Set<string>()
      prev.forEach((key) => {
        if (allGroupKeys.has(key)) {
          next.add(key)
        } else {
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [allGroupKeys])
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
      setViewportHeight(nextHeight)
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
        flushTesterGridCardRevealQueue(true)
      }, GRID_CARD_REVEAL_IDLE_DRAIN_DELAY_MS)
    }
  }, [])
  // Keep overrides rely on a dedicated 1/2 column preference to widen the rule list when desired.
  const resolvedKeepOverrideColumnMode = keepOverrideColumnMode === 2 ? 2 : 1
  // Default to 1 column whenever the keep-override preference is missing.
  const preferredColumnCount = keepOverrideVariant ? resolvedKeepOverrideColumnMode : storedColumnPreference
  const {
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx: gridLeafPaddingPx,
  } = useTesterGridLayoutMetrics({
    preferredColumnCount,
    showFirstMatch,
    showOtherMatches,
    theme,
  })
  // Only measure card width in the Rule Tester so keep-override tabs can mirror it.
  const shouldMeasureCardWidth = variant === 'tester' && typeof onCardWidthMeasured === 'function'
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
      const cardNode = container.querySelector<HTMLElement>('[data-tester-grid-card="true"]')
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
  const groupCountChipBg = theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100]
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
    (index: number) => flattenedItems[index]?.key ?? `tester-grid-item-${index}`,
    [flattenedItems],
  )
  // Single virtualizer now covers headers + rows; item height hints keep scroll position stable when toggling groups.
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
    const targetNode = container.querySelector<HTMLElement>(`[data-tester-grid-header="true"][data-header-key="${pending.key}"]`)
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
    const map = new Map<number, TesterPreviewRow>()
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
    const assignGroup = (group: TesterGroup) => {
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
  const focusPulseClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerFocusPulse = useCallback((artifactId: number) => {
    // Replace any prior pulse so rapid star-clicks always emphasize the latest card.
    if (focusPulseClearTimeoutRef.current) {
      clearTimeout(focusPulseClearTimeoutRef.current)
      focusPulseClearTimeoutRef.current = null
    }
    setFocusPulseArtifactId(artifactId)
    focusPulseClearTimeoutRef.current = setTimeout(() => {
      setFocusPulseArtifactId((current) => (current === artifactId ? null : current))
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
        setCollapsedGroups((prev) => {
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
          `[data-tester-grid-card="true"][data-row-id="${targetArtifactId}"]`,
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
    const headerNode = element.closest<HTMLElement>('[data-tester-grid-header="true"]')
    const headerKey = headerNode?.getAttribute('data-header-key')
    if (headerKey && groupLookup.has(headerKey)) {
      // Clicking inside a header keeps the lookup cheap by reading the exported data attribute.
      return headerKey
    }
    const cardNode = element.closest<HTMLElement>('[data-tester-grid-card="true"]')
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
  // Keep overrides use their own 1/2 column preference; base tester stays on 4/5.
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
    const setLabel = formatTesterSetLabel({
      setId: artifact.set ?? null,
      slot: resolvedSlotId,
      translate: t,
      lang,
    })
    const slotLabel = Number.isFinite(slotValue)
      ? t(artifactTypeI18nKey(resolvedSlotId))
      : fallback
    const rankLabel = formatTesterRankLabel(artifact.rank, t)
    const rarityLabel = formatTesterRarityLabel(artifact.rarity, t)
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
        // Safeguards empty states explain missing tester data or disabled rules.
        if (!hasTesterData) return t('safeguardsNoTesterData')
        if (!safeguardsEnabled) return t('testerTableEmptySafeguardsDisabled')
        if (filterActive) return t('testerTableEmptyFilter')
        return t('testerTableEmptySafeguardsNoMatches')
      }
      // Base tester grid falls back to the generic filter/empty messages.
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
      const groupCountLabel = group.rows.length === 1
        ? t('testerItemsCountOne')
        : t('testerItemsCountMany', { n: numberFormatter.format(group.rows.length) })
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
          data-tester-grid-header="true"
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
              <Chip
                size="small"
                label={groupCountLabel}
                sx={{ bgcolor: groupCountChipBg, flexShrink: 0 }}
              />
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
              columnGap: theme.spacing(GRID_GAP),
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
                <TesterGridCard
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
                  cardHeightPx={cardHeightPx}
                  gridColumnCount={gridColumnCount}
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
        data-tester-grid-container="true"
        sx={(theme) => ({
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          // Prevent Firefox from surfacing a horizontal scrollbar due to box-shadow overflow.
          overflowX: 'hidden',
          pr: TESTER_GRID_CONTAINER_PADDING_END_UNITS,
          ...reserveScrollbarGutterSpace({
            reserveStart: false,
            basePaddingInlineEnd: theme.spacing(TESTER_GRID_CONTAINER_PADDING_END_UNITS),
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
          paper: buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: gridMenuGuard,
            onRequestClose: closeGridMenu,
            closeLabel: t('close'),
            ref: gridMenuPaperRef,
          }),
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
                    key="tester-grid-normalized-preset-s"
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
                const presetId = idx as TesterGridNormalizedPresetId
                const enabled = normalizedOverlayEnabledPresetSet.has(presetId)
                const preset = normalizedOverlayPrefs.state.presets[presetId]
                const label = preset
                  ? formatTesterNormalizedPresetButtonLabel(presetId, preset.iconId)
                  : String(presetId + 1)
                const tooltipMarkdown = preset
                  ? buildTesterNormalizedPresetTooltipMarkdown({
                      title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('testerNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('testerNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('testerNormalizedPresetTooltipEmpty')
                return (
                  <MarkdownTooltip
                    key={`tester-grid-normalized-preset-tooltip-${presetId}`}
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
              {Array.from({ length: TESTER_NORMALIZED_PRESET_COUNT - 4 }).map((_, offset) => {
                const idx = offset + 4
                const presetId = idx as TesterGridNormalizedPresetId
                const enabled = normalizedOverlayEnabledPresetSet.has(presetId)
                const preset = normalizedOverlayPrefs.state.presets[presetId]
                const label = preset
                  ? formatTesterNormalizedPresetButtonLabel(presetId, preset.iconId)
                  : String(presetId + 1)
                const tooltipMarkdown = preset
                  ? buildTesterNormalizedPresetTooltipMarkdown({
                      title: t('testerGridNormalizedPresetTitle', { n: presetId + 1 }),
                      preset,
                      labelForVariant: (variant) => t(statVariantI18nKey(variant)),
                      emptyLabel: t('testerNormalizedPresetTooltipEmpty'),
                      rightClickHint: t('testerNormalizedPresetTooltipRightClickHint'),
                    })
                  : t('testerNormalizedPresetTooltipEmpty')
                return (
                  <MarkdownTooltip
                    key={`tester-grid-normalized-preset-tooltip-${presetId}`}
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
            testerSubstatSortPreferences.toggleExcludeGlyphs()
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
              testerSubstatSortPreferences.toggleExcludeGlyphs()
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
        {/* Rule template button is opt-in so we surface it only for the main tester grid. */}
        {variant === 'tester' ? (
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
        <TesterNormalizedPresetEditorMenu
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
      group: TesterGroup
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
      group: TesterGroup
      depth: number
      position: 'top' | 'bottom'
      height: number
    }
  | {
      kind: 'cardRow'
      key: string
      group: TesterGroup
      depth: number
      rowEntries: TesterPreviewRow[]
      rowIndex: number
      rowCount: number
      height: number
    }

// Leaf grids still render as chunked rows per column count so Safeguards + tester variants share one calculator.
function chunkGroupRows(group: TesterGroup, gridColumnCount: number): TesterPreviewRow[][] {
  // Every chunk mirrors one rendered row so the flattened list can translate heights straight into DOM slots.
  const columns = Math.max(1, gridColumnCount)
  const rows: TesterPreviewRow[][] = []
  for (let idx = 0; idx < group.rows.length; idx += columns) {
    rows.push(group.rows.slice(idx, idx + columns))
  }
  return rows
}

type BuildFlattenedGridItemsOptions = {
  groups: TesterGroup[]
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
  const rowChunkCache = new Map<string, TesterPreviewRow[][]>()
  const getRowChunks = (group: TesterGroup): TesterPreviewRow[][] => {
    // Chunked rows depend solely on the column count, so keep a short-lived cache per flatten pass.
    let cached = rowChunkCache.get(group.key)
    if (!cached) {
      cached = chunkGroupRows(group, gridColumnCount)
      rowChunkCache.set(group.key, cached)
    }
    return cached
  }
  const visit = (group: TesterGroup, depth: number) => {
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

// Exported for endpoint diff previews that need the exact tester card visuals.
export const TesterGridCard = React.memo(function TesterGridCard({
  row,
  centerOverlay,
  topOverlay,
  substatColors,
  useStatButtonColors,
  suppressMatchDetails,
  showFirstMatchRow,
  showOtherMatchesRow,
  showMatchRecipeIndex,
  showMatchLineNumber,
  showChampionIcons,
  cardHeightPx,
  gridColumnCount,
  recipeNames,
  onJumpToRule,
  onCreateRuleTemplate,
  highlightedRowPredicate = null,
  dimUnhighlightedRows = false,
  focusPulseActive = false,
  cardPriority,
}: {
  row: TesterPreviewRow
  centerOverlay?: { text: string; color?: string } | null
  topOverlay?: TesterCardTopOverlay | null
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  suppressMatchDetails: boolean
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  showMatchRecipeIndex: boolean
  showMatchLineNumber: boolean
  showChampionIcons: boolean
  cardHeightPx: number
  gridColumnCount: number
  recipeNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, recipeIdx: number | null) => void) | undefined
  onCreateRuleTemplate?: ((row: TesterPreviewRow, intent: TesterRuleTemplateIntent) => void) | undefined
  highlightedRowPredicate?: ((row: TesterPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  focusPulseActive?: boolean
  cardPriority: { base: number; order: number }
}) {
  // Highlight state lets Safeguards call attention to the at-risk combinations without mutating the dataset.
  const highlightFn = typeof highlightedRowPredicate === 'function' ? highlightedRowPredicate : null
  const cardHighlighted = highlightFn ? Boolean(highlightFn(row)) : false
  const cardDimmed = Boolean(highlightFn && dimUnhighlightedRows && !cardHighlighted && !focusPulseActive)
  // Frozen match rows keep stale data visible but low-opacity until the rebuild commits.
  const matchDetailsFrozen = Boolean(suppressMatchDetails)
  const matchDetailsOpacity = matchDetailsFrozen ? 0.45 : 1
  const { t, lang } = useI18n()
  const theme = useTheme()
  const recipeTextFallbackColor = theme.palette.primary.main
  const artifact = row.artifact
  const priorityBase = Number(cardPriority?.base) || 0
  const priorityOrder = Number(cardPriority?.order) || 0
  const rawArtifactId = Number(artifact?.id)
  const normalizedArtifactId = Number.isFinite(rawArtifactId) ? rawArtifactId : null
  const mightShowOtherMatchesRow = useMemo(() => {
    if (!Array.isArray(row.matchingRecipeIndices)) return false
    const seen = new Set<number>()
    for (const rawIdx of row.matchingRecipeIndices) {
      const numericIdx = Number(rawIdx)
      if (!Number.isFinite(numericIdx)) continue
      if (seen.has(numericIdx)) continue
      seen.add(numericIdx)
      if (seen.size > 1) {
        return true
      }
    }
    return false
  }, [row.matchingRecipeIndices])
  // Match rows stay mounted even while frozen so the stale data can be seen at a glance.
  const basePrimaryMatchRowVisible = showFirstMatchRow
  const baseOtherMatchesRowVisible = showOtherMatchesRow && mightShowOtherMatchesRow
  const { leftColumnHeightPx, rightColumnHeightPx } = useMemo(
    () => getTesterGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardContentReady = useTesterGridCardContentReady(normalizedArtifactId, priorityBase, priorityOrder)
  const match = row.match
  const primaryRuleIndex = typeof match?.ruleIndex === 'number' ? match.ruleIndex : null
  const primaryRecipeIndex = typeof match?.recipeIdx === 'number' ? match.recipeIdx : null
  const canJumpToPrimaryMatch = typeof onJumpToRule === 'function' && primaryRuleIndex != null
  // Jump affordances stay disabled until the rebuild commits so stale matches never focus the wrong recipe.
  const allowPrimaryMatchJump = Boolean(!matchDetailsFrozen && canJumpToPrimaryMatch)
  const handlePrimaryMatchClick = () => {
    if (!allowPrimaryMatchJump || primaryRuleIndex == null) return
    onJumpToRule?.(primaryRuleIndex, primaryRecipeIndex ?? null)
  }
  // Template actions only appear when the parent supplies a handler.
  const canCreateRuleTemplate = typeof onCreateRuleTemplate === 'function'
  // Anchor state keeps the menu positioned relative to the gear button.
  const [ruleTemplateAnchor, setRuleTemplateAnchor] = useState<HTMLElement | null>(null)
  // Menu is considered open when the gear button has an anchor.
  const ruleTemplateMenuOpen = Boolean(ruleTemplateAnchor)
  // Menu ref lets the guard detect outside clicks reliably.
  const ruleTemplateMenuRef = useRef<HTMLDivElement | null>(null)
  const handleRuleTemplateClose = useCallback(() => {
    // Closing clears the anchor so the menu can unmount.
    setRuleTemplateAnchor(null)
  }, [])
  // Guard the rule template menu so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: ruleTemplateMenuGuard } = useContextMenuPaperGuard({
    open: ruleTemplateMenuOpen,
    onClose: handleRuleTemplateClose,
    menuRef: ruleTemplateMenuRef,
  })
  // The gear button opens the menu without affecting card focus.
  const handleRuleTemplateOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setRuleTemplateAnchor(event.currentTarget)
  }
  // Picking an action forwards the intent to the parent for recipe creation.
  const handleRuleTemplateSelect = (intent: TesterRuleTemplateIntent) => {
    onCreateRuleTemplate?.(row, intent)
    handleRuleTemplateClose()
  }
  // Map caches the first keep/sell decision per recipe so overflow chips reuse the same tint.
  const matchingRecipeKeepMap = useMemo(() => {
    const map = new Map<number, boolean>()
    if (!Array.isArray(row.matchingRecipeDecisions)) return map
    for (const decision of row.matchingRecipeDecisions) {
      const recipeIdx = Number(decision?.recipeIdx)
      if (!Number.isFinite(recipeIdx) || map.has(recipeIdx)) continue
      map.set(recipeIdx, Boolean(decision.keep))
    }
    return map
  }, [row.matchingRecipeDecisions])
  // Matching chips hydrate lazily so skeleton rows can avoid heavy string work until revealed.
  const matchingEntries: MatchingRecipeEntry[] = useMemo(() => {
    if (!cardContentReady) return []
    if (!Array.isArray(row.matchingRecipeIndices)) return []
    const seen = new Set<number>()
    const entries: MatchingRecipeEntry[] = []
    for (const rawIdx of row.matchingRecipeIndices) {
      const numericIdx = Number(rawIdx)
      if (!Number.isFinite(numericIdx) || seen.has(numericIdx)) continue
      seen.add(numericIdx)
      const decoration = parseRecipeNameDirectives(
        recipeNames[numericIdx] ?? undefined,
        recipeTextFallbackColor,
      )
      const cleanedLabel = decoration.displayName.trim()
      entries.push({
        recipeIdx: numericIdx,
        label: cleanedLabel.length > 0
          ? cleanedLabel
          : `#${numericIdx + 1}`,
        textColor: decoration.hasExplicitColor ? decoration.resolvedColor : null,
        keep: matchingRecipeKeepMap.get(numericIdx) ?? null,
      })
    }
    return entries
  }, [cardContentReady, row.matchingRecipeIndices, matchingRecipeKeepMap, recipeNames, recipeTextFallbackColor])
  const shouldShowPrimaryMatchRow = basePrimaryMatchRowVisible
  // Keep-override primary matches are not tied to a recipe, so keep all recipe matches visible.
  const keepOverridePrimaryMatch = match?.ruleSource === RULE_SOURCE_SAFEGUARDS
  // Remove only the recipe that actually won primary match.
  // Do not drop by position because matcher recipe lists are not guaranteed to start with primary.
  const otherMatchingEntries = useMemo(() => {
    // Keep-override rows stay fully visible because primary match has no recipe scope.
    if (keepOverridePrimaryMatch) return matchingEntries
    // Final Sell and other recipe-less primaries should not hide any recipe chips.
    if (primaryRecipeIndex == null) return matchingEntries
    // Hide only the actual primary recipe entry to avoid duplicate chips.
    return matchingEntries.filter((entry) => entry.recipeIdx !== primaryRecipeIndex)
  }, [keepOverridePrimaryMatch, matchingEntries, primaryRecipeIndex])
  const shouldShowOtherMatchesRow = showOtherMatchesRow && otherMatchingEntries.length > 0
  const totalOtherMatches = otherMatchingEntries.length
  const otherMatchingEntriesSignature = useMemo(
    () => otherMatchingEntries.map((entry) => `${entry.recipeIdx}:${entry.label}`).join('|'),
    [otherMatchingEntries],
  )
  const [otherMatchesRowEl, setOtherMatchesRowEl] = useState<HTMLDivElement | null>(null)
  const handleOtherMatchesRowRef = useCallback((node: HTMLDivElement | null) => {
    setOtherMatchesRowEl(node)
  }, [])
  const [otherMatchesRowWidth, setOtherMatchesRowWidth] = useState<number>(0)
  useEffect(() => {
    if (!otherMatchesRowEl) return undefined
    const node = otherMatchesRowEl
    const updateWidth = () => {
      setOtherMatchesRowWidth(measureMatchingRowContentWidth(node))
    }
    updateWidth()
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [otherMatchesRowEl])
  const desiredOtherMatchingCount = Math.min(MAX_MATCHING_CHIPS, totalOtherMatches)
  const [visibleOtherMatchingLimit, setVisibleOtherMatchingLimit] = useState(desiredOtherMatchingCount)
  useEffect(() => {
    setVisibleOtherMatchingLimit(desiredOtherMatchingCount)
  }, [desiredOtherMatchingCount, otherMatchesRowWidth, otherMatchingEntriesSignature])
  const normalizedVisibleLimit = Math.max(
    0,
    Math.min(visibleOtherMatchingLimit, totalOtherMatches),
  )
  const needsPrefixChip = totalOtherMatches > normalizedVisibleLimit
  const effectiveVisibleOtherMatchingLimit = needsPrefixChip
    ? Math.max(1, normalizedVisibleLimit)
    : normalizedVisibleLimit
  const visibleOtherMatching = otherMatchingEntries.slice(0, effectiveVisibleOtherMatchingLimit)
  const hiddenOtherMatching = otherMatchingEntries.slice(effectiveVisibleOtherMatchingLimit)
  // Gap + refs let us squeeze as many chips as possible before handing the overflow to a popover.
  const matchingChipGapPx = parseSpacingPx(String(theme.spacing(MATCHING_CHIP_GAP_UNITS)))
  const visibleChipsContainerRef = useRef<HTMLDivElement | null>(null)
  const handleVisibleChipsContainerRef = useCallback((node: HTMLDivElement | null) => {
    visibleChipsContainerRef.current = node
  }, [])
  const moreChipRef = useRef<HTMLSpanElement | null>(null)
  const handleMoreChipRef = useCallback((node: HTMLSpanElement | null) => {
    moreChipRef.current = node
  }, [])
  const [moreChipWidth, setMoreChipWidth] = useState(0)
  useLayoutEffect(() => {
    const node = moreChipRef.current
    if (!node) {
      setMoreChipWidth(0)
      return
    }
    const measure = () => {
      setMoreChipWidth(node.getBoundingClientRect().width)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [hiddenOtherMatching.length])
  const hasHiddenMatches = hiddenOtherMatching.length > 0
  // Available width is recalculated whenever the +N chip resizes so text never overflows.
  const visibleChipsAvailableWidth = hasHiddenMatches
    ? Math.max(0, otherMatchesRowWidth - (moreChipWidth + matchingChipGapPx))
    : otherMatchesRowWidth
  useLayoutEffect(() => {
    if (!totalOtherMatches) return
    const minVisible = hasHiddenMatches ? 1 : 0
    if (normalizedVisibleLimit < minVisible) {
      setVisibleOtherMatchingLimit(minVisible)
      return
    }
    const node = visibleChipsContainerRef.current
    if (!node) return
    const scrollDiff = node.scrollWidth - node.clientWidth
    if (scrollDiff <= 0.5) return
    if (normalizedVisibleLimit > minVisible) {
      setVisibleOtherMatchingLimit(normalizedVisibleLimit - 1)
    }
  }, [
    normalizedVisibleLimit,
    hasHiddenMatches,
    totalOtherMatches,
    visibleChipsAvailableWidth,
    otherMatchingEntriesSignature,
  ])
  const [matchingPopoverAnchor, setMatchingPopoverAnchor] = useState<HTMLElement | null>(null)
  const matchingPopoverOpen = Boolean(matchingPopoverAnchor) && hiddenOtherMatching.length > 0
  // Keep a ref for the popover so outside clicks can close cleanly.
  const matchingPopoverPaperRef = useRef<HTMLDivElement | null>(null)
  const handleMatchingPopoverClose = useCallback(() => {
    setMatchingPopoverAnchor(null)
  }, [])
  // Guard the matching popover so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: matchingPopoverGuard } = useContextMenuPaperGuard({
    open: matchingPopoverOpen,
    onClose: handleMatchingPopoverClose,
    menuRef: matchingPopoverPaperRef,
  })
  // Overflow chip defers the popover until the user explicitly taps it to keep VT tree shallow.
  const handleMatchingMoreClick = (event: React.MouseEvent<HTMLElement>) => {
    if (hiddenOtherMatching.length === 0) return
    setMatchingPopoverAnchor(event.currentTarget)
  }
  const handleMatchingRecipeJump = (recipeIdx: number) => {
    if (!allowPrimaryMatchJump || primaryRuleIndex == null) return
    if (!Number.isFinite(recipeIdx)) return
    onJumpToRule?.(primaryRuleIndex, recipeIdx)
  }
  const renderMatchingChip = (
    entry: MatchingRecipeEntry,
    options?: { onSelect?: () => void },
  ): React.ReactNode => {
    const key = `matching-chip-${entry.recipeIdx}`
    const clickable = allowPrimaryMatchJump
    const textColor = entry.textColor ?? null
    // Dimmed outline mirrors the keep/sell outcome without overpowering the primary chip.
    const borderColor = typeof entry.keep === 'boolean'
      ? getTesterMatchBorderColor(theme, entry.keep, { dimmed: true })
      : null
    const sharedChipProps = {
      label: entry.label,
      size: 'small' as const,
      variant: 'outlined' as const,
      title: entry.label,
      sx: [
        MATCHING_RECIPE_CHIP_SX,
        { cursor: clickable ? 'pointer' : 'default' },
        ...(textColor ? [{ color: textColor, '& .MuiChip-label': { color: textColor } }] : []),
        ...(borderColor ? [{ borderColor }] : []),
      ],
    }
    const chipNode = (
      <Chip
        {...sharedChipProps}
        {...(clickable
          ? {
              component: 'button' as const,
              type: 'button' as const,
              onClick: () => {
                options?.onSelect?.()
                handleMatchingRecipeJump(entry.recipeIdx)
              },
            }
          : {})}
      />
    )

    const wrappedChip = (
      <Box
        component="span"
        sx={MATCHING_CHIP_WRAPPER_SX}
      >
        {chipNode}
      </Box>
    )

    if (!clickable) {
      return (
        <React.Fragment key={key}>
          {wrappedChip}
        </React.Fragment>
      )
    }

    return (
      <MarkdownTooltip key={key} markdown={t('testerJumpToRecipe')}>
        {wrappedChip}
      </MarkdownTooltip>
    )
  }
  if (!cardContentReady) {
    return (
      <TesterGridCardSkeleton
        cardHeightPx={cardHeightPx}
        leftColumnHeightPx={leftColumnHeightPx}
        rightColumnHeightPx={rightColumnHeightPx}
        showPrimaryMatchRow={basePrimaryMatchRowVisible}
        showOtherMatchesRow={baseOtherMatchesRowVisible}
        highlighted={cardHighlighted}
        dimmed={cardDimmed}
      />
    )
  }
  const setIdNumber = Number(artifact.set) || 0
  const setLabelRaw = formatTesterSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t, lang })
  const setLabel = setLabelRaw.trim().length > 0 ? setLabelRaw : undefined
  const setTooltipName = Number.isFinite(setIdNumber) ? artifactSetName(setIdNumber as ArtifactSetId) : null
  const levelBucketLabel = formatLevel(artifact.level)
  const hasExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
  const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(artifact.exactLevel))))) : null
  const levelLabel = exactLevelLabel ?? levelBucketLabel
  const levelChipLabel = levelLabel || t('any')
  const mainLabel = artifact.mainStat ? t(statVariantI18nKey(artifact.mainStat.variant)) : t('any')
  const mainValue = formatStatPreGlyph(artifact.mainStat ?? null)
  const mainInline = mainValue ? t('testerMainStatInline', { stat: mainLabel, value: mainValue }) : mainLabel
  const mainVariant = artifact.mainStat?.variant
  const mainColor = useStatButtonColors && typeof mainVariant === 'number'
    ? (substatColors[mainVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainVariant])
    : undefined
  const glyphDeltaColor = theme.palette.success.main
  const substatEntries = artifact.substats
    .filter((stat) => stat.variant !== StatVariant.Any)
    .map((stat) => {
      const statLabel = t(statVariantI18nKey(stat.variant))
      const statValue = formatStatPreGlyph(stat) || t('testerValueUnknown')
      const statColor = useStatButtonColors
        ? (substatColors[stat.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[stat.variant])
        : undefined
      const glyphMagnitude = Math.abs(Number(stat.glyphValue) || 0)
      const glyphDelta = glyphMagnitude >= 0.01
        ? `${Number(stat.glyphValue) >= 0 ? '+' : '-'}${formatStatNumber(glyphMagnitude)}`
        : null
      const mythMagnitude = Math.abs(Number(stat.mythValue) || 0)
      const hasMythBonus = mythMagnitude >= 0.01
      const rollGlyph = (typeof stat.rolls === 'number' && stat.rolls > 0)
        ? formatCircledDigit(stat.rolls)
        : null
      const rollAriaLabel = (typeof stat.rolls === 'number' && stat.rolls > 0)
        ? t('testerRollsLabel', { rolls: stat.rolls })
        : null
      return {
        variant: stat.variant,
        isMythicBonus: hasMythBonus,
        content: (
          <>
            <Box component="span" sx={{ color: statColor ?? 'inherit' }}>
              {statLabel} {statValue}
            </Box>
            {rollGlyph ? (
              <Box
                component="span"
                sx={{
                  ml: 0.5,
                  fontSize: '1rem',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  position: 'relative',
                  top: '0.06em',
                }}
                aria-label={rollAriaLabel ?? undefined}
              >
                {rollGlyph}
              </Box>
            ) : null}
            {glyphDelta ? (
              <Box component="span" sx={{ color: glyphDeltaColor, fontWeight: 600, ml: 0.5 }}>
                {glyphDelta}
              </Box>
            ) : null}
          </>
        ),
      }
});
  const ascVariant = artifact.ascension?.variant
  const ascValue = artifact.ascension ? formatStatNumber(artifact.ascension.baseValue) : ''
  const ascLabel = artifact.ascension ? t(statVariantI18nKey(artifact.ascension.variant)) : ''
  const ascStatColor = useStatButtonColors && typeof ascVariant === 'number'
    ? (substatColors[ascVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ascVariant])
    : undefined
  const ascInlineFontSize = 'calc(100% - 1.5px)'
  const ascLabelNode = ascLabel ? (
    <Box component="span" sx={{ color: ascStatColor ?? 'inherit', fontSize: ascInlineFontSize }}>
      {ascLabel}
    </Box>
  ) : null
  const ascValueNode = ascValue ? (
    <Box
      component="span"
      sx={{ color: theme.palette.secondary.main, fontWeight: 600, fontSize: ascInlineFontSize }}
    >
      {ascValue}
    </Box>
  ) : null
  const ascSummary = (() => {
    if (!artifact.ascension) return null
    if (ascValue && ascLabelNode && ascValueNode) {
      const statToken = '__STAT__'
      const valueToken = '__VALUE__'
      const template = t('testerMainStatInline', { stat: statToken, value: valueToken })
      const replacements = [
        { token: statToken, node: ascLabelNode },
        { token: valueToken, node: ascValueNode },
      ]
      const parts: React.ReactNode[] = []
      let remaining = template
      while (remaining.length > 0) {
        let matchIdx = -1
        let match: { token: string; node: React.ReactNode } | null = null
        for (const rep of replacements) {
          const idx = remaining.indexOf(rep.token)
          if (idx === -1) continue
          if (matchIdx === -1 || idx < matchIdx) {
            matchIdx = idx
            match = rep
          }
        }
        if (!match || matchIdx === -1) {
          if (remaining) parts.push(remaining)
          break
        }
        if (matchIdx > 0) {
          parts.push(remaining.slice(0, matchIdx))
        }
        parts.push(match.node)
        remaining = remaining.slice(matchIdx + match.token.length)
      }
      return (
        <>
          {parts.map((part, idx) => (
            typeof part === 'string'
              ? <React.Fragment key={`asc-str-${idx}`}>{part}</React.Fragment>
              : <React.Fragment key={`asc-node-${idx}`}>{part}</React.Fragment>
          ))}
        </>
      )
    }
    return ascLabelNode ?? ascValueNode ?? null
  })()
  const sourceDescriptor = getItemSourceDescriptor(artifact, t)
  const SourceIcon = sourceDescriptor ? SOURCE_ICON_MAP[sourceDescriptor.category] : null
  const sourceTooltipTitle = (() => {
    const base = sourceDescriptor ? (sourceDescriptor.tooltip ?? sourceDescriptor.label ?? '') : ''
    if (!import.meta.env.DEV) return base
    const equippedToChampionId = artifact.equippedToChampionId
    if (typeof equippedToChampionId !== 'number' || !Number.isFinite(equippedToChampionId) || equippedToChampionId <= 0) return base
    const baseHeroId = artifact.equippedChampionBaseId
    const baseHeroLabel = (typeof baseHeroId === 'number' && Number.isFinite(baseHeroId) && baseHeroId > 0) ? String(baseHeroId) : '?'
    return `${base} (${baseHeroLabel} / ${equippedToChampionId})`
  })()
  const championIconSrc = championIconUrl(artifact.equippedChampionBaseId ?? artifact.equippedToChampionId)
  // Champion avatars only render for collection/vault sources so the extra visuals stay meaningful.
  const championIconEligible = Boolean(
    showChampionIcons
    && sourceDescriptor
    && (sourceDescriptor.category === 'collection' || sourceDescriptor.category === 'vault'),
  )
  // Large avatars only appear when the grid has enough horizontal room to avoid crushing the stats column.
  const championIconMode = championIconEligible
    ? (gridColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? 'large' : 'compact')
    : 'none'
  // Champion images render inside the avatar frame; missing images fall back to the dropdown-style initial.
  const shouldShowChampionIcon = Boolean(championIconEligible && championIconSrc)
  // Missing avatars still render the rarity border to make gaps obvious in dev builds.
  const shouldShowMissingChampionIconFallback = Boolean(championIconEligible && !championIconSrc)
  const sourceCategory = sourceDescriptor?.category
  const isVaultSource = sourceCategory === 'vault'
  // Vault avatars show a badge even when the champ image is missing so source stays visible.
  const shouldShowVaultBadgeIcon = Boolean(championIconEligible && isVaultSource && SourceIcon)
  // Standalone glyph badges are reserved for sources without an avatar slot (or when avatars are disabled).
  const shouldShowStandaloneSourceIcon = Boolean(sourceDescriptor && SourceIcon && !championIconEligible)
  // Smaller badges fall back to a single glyph so collapsed accordions stay lightweight.
  const SourceGlyph = shouldShowStandaloneSourceIcon && SourceIcon ? SourceIcon : null
  const sourceIconLabel = sourceDescriptor?.label ?? ''
  const championIconSize = championIconMode === 'large'
    ? CHAMPION_ICON_LARGE_SIZE
    : CHAMPION_ICON_BASE_SIZE
  // Champion avatars reuse the rarity palette so imported pieces surface their quality immediately.
  const rarityAccentColor = resolveRarityAccentColor(artifact.equippedChampionRarity)
  // Avatar frames fall back to the neutral divider so unknown rarities still look intentional.
  const championBorderColor = rarityAccentColor ?? theme.palette.divider
  // Glyph-only source icons use the accent when available so missing champ icons are easier to spot.
  const championGlyphColor = rarityAccentColor ?? theme.palette.text.secondary
  // Mirror the champion dropdown fallback: render the first initial when an avatar image is missing.
  const missingChampionFallbackInitial = (() => {
    const name = artifact.equippedChampionName?.trim() ?? ''
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  })()
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? t('testerRerollLabel') : ''
  // Tooltip copy surfaces the localized last-used timestamp whenever the DB provided one.
  const lastUseTooltip = (() => {
    if (!artifact.lastUseLocalTimestamp) return null
    const formatted = formatLocalDateTime(artifact.lastUseLocalTimestamp, { dateStyle: 'medium', timeStyle: 'medium' })
    const displayTimestamp = formatted ?? artifact.lastUseLocalTimestamp
    return t('testerLastUsedTooltip', { timestamp: displayTimestamp })
  })()
  const ascSummaryContent = ascSummary
  const shouldInlineAscension = gridColumnCount <= 4
  const ascSummaryInline = ascSummaryContent ? (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.25,
        ml: 0.75,
        flexWrap: 'wrap',
      }}
    >
      <Box component="span" sx={{ color: theme.palette.text.secondary, fontWeight: 600 }}>+</Box>
      {ascSummaryContent}
    </Box>
  ) : null
  const ascSummaryBlock = ascSummaryContent ? (
    <Box
      component="span"
      sx={{
        display: 'block',
        mt: CARD_ASC_BLOCK_MARGIN_TOP_UNITS,
        pl: 1,
        color: theme.palette.text.secondary,
        fontWeight: 600,
        fontSize: ascInlineFontSize,
        lineHeight: 1.1,
      }}
    >
      +
      {' '}
      {ascSummaryContent}
    </Box>
  ) : null
  // Keep/sell outcome surfaces the rule chip inline so keyboard users do not need to open popovers.
  const cardOutcome = match
    ? {
        tone: match.keep === false ? theme.palette.error.main : theme.palette.success.main,
        glyph: match.keep === false ? <SellIcon fontSize="inherit" aria-hidden /> : '✓',
        label: match.keep === false ? t('testerMatchSell') : t('testerMatchKeep'),
        canJump: allowPrimaryMatchJump,
        ...(allowPrimaryMatchJump ? { onClick: handlePrimaryMatchClick } : {}),
        inactive: matchDetailsFrozen,
      }
    : undefined
  // Surface stable match metadata for automation without forcing DOM text scraping.
  const cardMatchOutcome = match ? (match.keep === false ? 'sell' : 'keep') : 'none'
  const cardMatchRecipeIdx = match?.recipeIdx != null ? String(match.recipeIdx) : 'none'
  const mainSummaryLabel = (
    <>
      <Box component="span" sx={{ color: mainColor ?? 'inherit' }}>
        {mainInline}
      </Box>
      {shouldInlineAscension ? ascSummaryInline : ascSummaryBlock}
    </>
  )
  // Gear action button opens the keep/sell template menu.
  const ruleTemplateButton = canCreateRuleTemplate ? (
    // Tooltip clarifies the action without cluttering the card.
    <MarkdownTooltip markdown={t('testerRuleTemplateTooltip')}>
      <ButtonBase
        onClick={handleRuleTemplateOpen}
        aria-label={t('testerRuleTemplateButtonAria')}
        aria-haspopup="menu"
        sx={{
          width: CARD_ACTION_BUTTON_SIZE_PX,
          height: CARD_ACTION_BUTTON_SIZE_PX,
          borderRadius: '50%',
          border: `1px solid ${theme.palette.divider}`,
          color: theme.palette.text.secondary,
          // Overlay buttons do not participate in the text layout flow.
          flexShrink: 0,
        }}
      >
        <SettingsOutlinedIcon sx={{ fontSize: CARD_ACTION_ICON_SIZE_PX }} />
      </ButtonBase>
    </MarkdownTooltip>
  ) : null
  // Overlay keeps the action available without shrinking the main stat row.
  const ruleTemplateOverlay = ruleTemplateButton ? (
    <Box
      sx={{
        // Absolute positioning prevents the main stat line from getting squeezed.
        position: 'absolute',
        top: theme.spacing(0.5),
        right: theme.spacing(0.5),
        // Lift above card content so the button stays clickable.
        zIndex: 2,
      }}
    >
      {ruleTemplateButton}
    </Box>
  ) : null
  // Split marker lets locales place Keep/Sell naturally inside the action phrase.
  const ruleTemplateOutcomeMarker = '__OUTCOME__'
  // Build one localized menu label while keeping the outcome colorized.
  const renderRuleTemplateActionLabel = (
    outcomeLabel: string,
    outcomeColor: string,
  ) => {
    // Resolve one template so languages can choose their own word order.
    const template = t('testerRuleTemplateActionTemplate', { outcome: ruleTemplateOutcomeMarker })
    // Locate the marker once and split prefix/suffix around it.
    const markerIndex = template.indexOf(ruleTemplateOutcomeMarker)
    // Fallback: if marker is missing, just show the outcome word.
    if (markerIndex < 0) {
      return (
        <Typography variant="body2" component="span" sx={{ color: outcomeColor, fontWeight: 700 }}>
          {outcomeLabel}
        </Typography>
      )
    }
    // Prefix includes any needed spaces or punctuation before the outcome.
    const prefix = template.slice(0, markerIndex)
    // Suffix includes any needed spaces or punctuation after the outcome.
    const suffix = template.slice(markerIndex + ruleTemplateOutcomeMarker.length)
    return (
      <Typography variant="body2" component="span">
        {prefix}
        <Box component="span" sx={{ color: outcomeColor, fontWeight: 700 }}>
          {outcomeLabel}
        </Box>
        {suffix}
      </Typography>
    )
  }
  // Menu presents the keep/sell actions and reuses the context menu styling.
  const ruleTemplateMenu = canCreateRuleTemplate ? (
    <Menu
      open={ruleTemplateMenuOpen}
      anchorEl={ruleTemplateAnchor}
      onClose={handleRuleTemplateClose}
      disableAutoFocusItem
      slotProps={{
        paper: buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard: ruleTemplateMenuGuard,
          onRequestClose: handleRuleTemplateClose,
          closeLabel: t('close'),
          ref: ruleTemplateMenuRef,
        }),
      }}
    >
      {/* Keep actions create a keep template tied to the current item. */}
      <MenuItem onClick={() => handleRuleTemplateSelect('keep')}>
        <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
          {renderRuleTemplateActionLabel(t('testerMatchKeep'), theme.palette.success.main)}
        </Box>
      </MenuItem>
      {/* Sell actions create a sell template tied to the current item. */}
      <MenuItem onClick={() => handleRuleTemplateSelect('sell')}>
        <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
          {renderRuleTemplateActionLabel(t('testerMatchSell'), theme.palette.error.main)}
        </Box>
      </MenuItem>
    </Menu>
  ) : null

  const cardHeightStyle = `${cardHeightPx}px`
  const matchRowHeight = `${CARD_MATCH_ROW_HEIGHT_PX}px`

  // Cards tint when highlighted so Safeguards can spotlight the matching combinations.
  return (
    <Box
      data-tester-grid-card="true"
      data-row-id={artifact.id}
      data-match-outcome={cardMatchOutcome}
      data-match-recipe-index={cardMatchRecipeIdx}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        columnGap: theme.spacing(CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${CARD_BORDER_RADIUS_PX}px`,
        border: `1px solid ${cardHighlighted ? theme.palette.info.light : theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        // Expose baseline/peak palette values so the pulse animation can resolve to theme-safe colors.
        '--tester-focus-border-base': cardHighlighted ? theme.palette.info.light : theme.palette.divider,
        '--tester-focus-border-peak': theme.palette.info.main,
        '--tester-focus-bg-base': theme.palette.background.paper,
        '--tester-focus-bg-peak': alpha(theme.palette.info.main, 0.07),
        '--tester-focus-shadow-base': cardHighlighted ? `0 0 0 1px ${alpha(theme.palette.info.main, 0.3)}` : 'none',
        '--tester-focus-shadow-peak': `0 0 0 2px ${alpha(theme.palette.info.main, 0.26)}, 0 8px 18px ${alpha(theme.palette.info.main, 0.2)}`,
        // Relative positioning anchors the overlay button to the card frame.
        position: 'relative',
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        // Clip horizontal overflow so scrollbars never appear in grid cards.
        overflowX: 'hidden',
        // Keep the fixed-height card from leaking extra rows.
        overflowY: 'hidden',
        alignContent: 'start',
        boxShadow: cardHighlighted ? `0 0 0 1px ${alpha(theme.palette.info.main, 0.3)}` : 'none',
        // Card content must stay readable even inside colored containers (for example success toasts).
        color: theme.palette.text.primary,
        opacity: cardDimmed ? 0.35 : 1,
        transition: 'opacity 220ms ease, border-color 260ms ease, box-shadow 280ms ease, background-color 280ms ease',
        // Programmatic focus should blink once and then settle back to baseline (no persistent selection affordance).
        animation: focusPulseActive
          ? `${TESTER_GRID_CARD_FOCUS_PULSE_KEYFRAMES} ${GRID_CARD_FOCUS_PULSE_DURATION_MS}ms ease-in-out 1`
          : 'none',
      })}
    >
      {/* Overlay keeps the gear action out of the main stat row flow. */}
      {ruleTemplateOverlay}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: GRID_CARD_LEFT_COLUMN_GAP_UNITS,
          textAlign: 'center',
          minHeight: leftColumnHeightPx,
          height: leftColumnHeightPx,
          maxHeight: leftColumnHeightPx,
          justifyContent: 'flex-start',
        }}
      >
        <GridIconBox
          setId={setIdNumber as ArtifactSetId}
          slotId={artifact.slot as ArtifactTypeId}
          factionId={artifact.faction as FactionId}
          rank={artifact.rank}
          rarity={artifact.rarity}
          ascensionRolls={artifact.ascension?.rolls}
          {...(setLabel ? { setLabel } : {})}
          setTooltipName={setTooltipName}
          slotLabel={artifactTypeName(artifact.slot as ArtifactTypeId)}
          rerollLabel={rerollLabel || undefined}
          rerollTooltip={rerollTooltip || undefined}
          levelLabel={levelChipLabel}
          size={TESTER_GRID_ICON_BOX_SIZE_PX}
          gearTooltip={lastUseTooltip}
          // Center overlay is informational and is rendered click-through by GridIconBox.
          {...(centerOverlay ? { centerOverlay } : {})}
          // Top overlay stacks above the center score (used for safeguard upgrade chance).
          {...(topOverlay ? { topOverlay } : {})}
          {...(cardOutcome ? { outcome: cardOutcome } : {})}
        />
        {shouldShowChampionIcon || shouldShowMissingChampionIconFallback ? (
          <Box
            sx={{
              width: TESTER_GRID_ICON_BOX_SIZE_PX,
              height: championIconSize.height,
              position: 'relative',
              mt: championIconMode === 'large' ? 1.25 : -0.25,
            }}
          >
            {/* Source badges consistently run through MarkdownTooltip so the rich copy stays readable. */}
            <MarkdownTooltip markdown={sourceTooltipTitle}>
              <Box
                component="span"
                role="img"
                aria-label={sourceDescriptor?.label}
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: championIconSize.width,
                  height: championIconSize.height,
                  borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
                  overflow: 'hidden',
                  border: '2px solid',
                  borderColor: championBorderColor,
                  boxShadow: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Missing champion images reuse the rarity border to keep the UI consistent.
                  bgcolor: shouldShowChampionIcon ? 'transparent' : alpha(championBorderColor, 0.14),
                }}
              >
                {shouldShowChampionIcon ? (
                  <Box
                    component="img"
                    src={championIconSrc}
                    alt={sourceTooltipTitle}
                    draggable={false}
                    onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      userSelect: 'none',
                      WebkitUserDrag: 'none',
                      display: 'block',
                    }}
                  />
                ) : shouldShowMissingChampionIconFallback ? (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      // Keep contrast high but avoid looking like a "real" avatar image.
                      color: theme.palette.text.secondary,
                      fontWeight: 700,
                      fontSize: theme.typography.pxToRem(13),
                      textTransform: 'uppercase',
                    }}
                  >
                    {missingChampionFallbackInitial}
                  </Box>
                ) : null}
              </Box>
            </MarkdownTooltip>
            {shouldShowVaultBadgeIcon && SourceIcon ? (
              <MarkdownTooltip markdown={sourceTooltipTitle}>
                <Box
                  component="span"
                  role="img"
                  aria-label={sourceIconLabel}
                  sx={{
                    position: 'absolute',
                    top: `calc(50% + ${championIconMode === 'large' ? 0 : 3}px)`,
                    left: `${TESTER_GRID_ICON_BOX_SIZE_PX - 5}px`,
                    transform: 'translate(-50%, -50%)',
                    width: VAULT_GLYPH_SIZE_PX,
                    height: VAULT_GLYPH_SIZE_PX,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.secondary',
                    fontSize: '0.95rem',
                  }}
                >
                  <SourceIcon fontSize="inherit" />
                </Box>
              </MarkdownTooltip>
            ) : null}
          </Box>
        ) : null}
        {SourceGlyph ? (
          // The smaller glyph badges reuse MarkdownTooltip as well, so tooltip styling stays aligned.
          <MarkdownTooltip markdown={sourceTooltipTitle}>
            {/*
              When champion icons are disabled, collection/vault rows still benefit from matching the avatar footprint
              so the source icon doesn't look "misaligned" compared to the layout users expect when avatars are on.
            */}
            <Box
              component="span"
              role="img"
              aria-label={sourceIconLabel}
              // Use the avatar size that *would* be rendered for collection/vault when icons are enabled.
              // This keeps the source glyph readable without turning the full avatar feature back on.
                sx={{
                  ...(sourceCategory === 'collection' || sourceCategory === 'vault'
                    ? {
                      width: gridColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.width : CHAMPION_ICON_BASE_SIZE.width,
                      height: gridColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.height : CHAMPION_ICON_BASE_SIZE.height,
                      borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
                      fontSize: `${Math.max(16, Math.round((gridColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.height : CHAMPION_ICON_BASE_SIZE.height) * 0.78))}px`,
                    }
                    : {
                      width: GRID_CARD_SOURCE_ICON_SIZE_PX,
                      height: GRID_CARD_SOURCE_ICON_SIZE_PX,
                      borderRadius: 1,
                      fontSize: '1rem',
                    }),
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // When champion icons are toggled off, use the champion rarity accent for visibility.
                  color: championGlyphColor,
                }}
            >
              <SourceGlyph fontSize="inherit" />
            </Box>
          </MarkdownTooltip>
        ) : null}
      </Box>
      <Stack
        spacing={CARD_TEXT_STACK_GAP_UNITS}
        minWidth={0}
        sx={{
          gridColumn: '2',
          gridRow: '1',
          minWidth: 0,
          minHeight: rightColumnHeightPx,
          height: rightColumnHeightPx,
          maxHeight: rightColumnHeightPx,
          // Let the card container handle clipping so mythic glow can escape horizontally.
          overflow: 'visible',
        }}
      >
        <TesterSummaryLabel label={mainSummaryLabel} wrap />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: CARD_SUBSTAT_ROW_GAP_UNITS,
            width: '100%',
            flexGrow: 1,
            // Clip horizontal overflow so cards never trigger a scrollbar.
            overflowX: 'hidden',
            // Clip vertical overflow so substat columns never show scrollbars.
            overflowY: 'hidden',
          }}
        >
          {substatEntries.length > 0 ? (
            substatEntries.map((entry) => {
                // Use a bar + tint for mythic bonuses to avoid the underline cue.
                const mythicAccentColor = theme.palette.error.main
                // Alpha tint keeps the highlight readable without overpowering.
                const mythicAccentBg = alpha(mythicAccentColor, MYTHIC_SUBSTAT_BG_ALPHA)
                // Only apply the accent when the stat actually has a mythic bonus.
                const mythicIndicatorSx = entry.isMythicBonus
                  ? {
                      // Outer glow keeps spacing identical while still calling attention.
                      boxShadow: `0 0 ${MYTHIC_SUBSTAT_SHADOW_BLUR_PX}px ${MYTHIC_SUBSTAT_SHADOW_SPREAD_PX}px ${mythicAccentColor}`,
                      // Soft fill keeps the text legible on tinted cards.
                      backgroundColor: mythicAccentBg,
                      // Rounded corners keep the indicator subtle.
                      borderRadius: `${MYTHIC_SUBSTAT_RADIUS_PX}px`,
                      // Raise the glow above adjacent grid cells so it isn't visually clipped.
                      position: 'relative',
                      zIndex: 1,
                    }
                  : undefined
                // Neutral halo offsets red-tinted text without replacing user-configured colors.
                const mythicTextShadow = entry.isMythicBonus
                  ? `0 0 ${MYTHIC_SUBSTAT_TEXT_SHADOW_BLUR_PX}px ${alpha(theme.palette.background.paper, MYTHIC_SUBSTAT_TEXT_SHADOW_ALPHA)}`
                  : undefined

                // Return a single inline row so ellipsis behavior stays consistent.
                return (
                  <Box
                    key={`sub-${entry.variant}`}
                    sx={{
                      // Inline flex keeps the stat label/value aligned with roll glyphs.
                      display: 'inline-flex',
                      alignItems: 'center',
                      // Fit-content avoids stretching short stats across the column.
                      width: 'fit-content',
                      maxWidth: '100%',
                      alignSelf: 'flex-start',
                      // Preserve shrink behavior so long stats still ellipsize.
                      flexShrink: 1,
                      minWidth: 0,
                      // Uniform padding keeps spacing consistent across mythic and non-mythic rows.
                      px: SUBSTAT_ROW_HORIZONTAL_PADDING_UNITS,
                      // Merge the mythic indicator only when the bonus is present.
                      ...(mythicIndicatorSx ?? {}),
                    }}
                  >
                      <Typography
                        variant="body2"
                        component="span"
                        noWrap
                        sx={{
                          // Tight line-height keeps substats compact within the fixed card height.
                          lineHeight: 1.1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          // Keep ellipsis stable when the stat text is long.
                          width: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'inherit',
                          // Subtle halo keeps tinted text legible over the mythic background.
                          textShadow: mythicTextShadow,
                        }}
                      >
                        {entry.content}
                      </Typography>
                  </Box>
              )
            })
          ) : (
            <TesterSummaryLabel label="—" />
          )}
        </Box>
      </Stack>
      {ruleTemplateMenu}
      {shouldShowPrimaryMatchRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
            opacity: matchDetailsOpacity,
          }}
        >
          {match ? (
            <TesterRuleReferenceChip
              match={match}
              {...(!matchDetailsFrozen && onJumpToRule ? { onJump: onJumpToRule } : {})}
              showRecipeIndex={showMatchRecipeIndex}
              showLineNumber={showMatchLineNumber}
              sx={{ width: '100%' }}
            />
          ) : null}
        </Box>
      ) : null}
      {shouldShowOtherMatchesRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            opacity: matchDetailsOpacity,
          }}
        >
          <Box
            ref={handleOtherMatchesRowRef}
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: MATCHING_CHIP_GAP_UNITS,
              alignItems: 'center',
              minWidth: 0,
              width: '100%',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: MATCHING_CHIP_GAP_UNITS,
                minWidth: 0,
                width: '100%',
              }}
            >
              <Box
                ref={handleVisibleChipsContainerRef}
                sx={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  gap: MATCHING_CHIP_GAP_UNITS,
                  minWidth: 0,
                  width: hasHiddenMatches
                    ? `${visibleChipsAvailableWidth}px`
                    : '100%',
                  maxWidth: hasHiddenMatches
                    ? `${visibleChipsAvailableWidth}px`
                    : '100%',
                }}
              >
                {visibleOtherMatching.map((entry) => renderMatchingChip(entry))}
              </Box>
            </Box>
            {hiddenOtherMatching.length > 0 ? (
              <>
                {/* MarkdownTooltip keeps the “+N” overflow chip consistent with other tester tooltips. */}
                <MarkdownTooltip markdown={`${t('testerRecipeMatches')} (+${hiddenOtherMatching.length})`}>
                  <Box component="span" ref={handleMoreChipRef} sx={MATCHING_CHIP_WRAPPER_SX}>
                    <Chip
                      label={`+${hiddenOtherMatching.length}`}
                      size="small"
                      variant="outlined"
                      component="button"
                      type="button"
                      onClick={handleMatchingMoreClick}
                      sx={{
                        ...MATCHING_RECIPE_CHIP_SX,
                        minWidth: 'auto',
                        cursor: 'pointer',
                      }}
                    />
                  </Box>
                </MarkdownTooltip>
                <Popover
                  open={matchingPopoverOpen}
                  anchorEl={matchingPopoverAnchor}
                  onClose={handleMatchingPopoverClose}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  disableRestoreFocus
                  slotProps={{
                    paper: buildContextMenuPaperSlotProps({
                      component: ContextMenuPaper,
                      contextMenuGuard: matchingPopoverGuard,
                      onRequestClose: handleMatchingPopoverClose,
                      closeLabel: t('close'),
                      ref: matchingPopoverPaperRef,
                      sx: {
                        maxWidth: MATCHING_POPOVER_MAX_WIDTH_PX,
                        width: `min(80vw, ${MATCHING_POPOVER_MAX_WIDTH_PX}px)`,
                      },
                    }),
                  }}
                >
                  <Box
                    sx={{
                      p: 1,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 0.5,
                      maxWidth: MATCHING_POPOVER_MAX_WIDTH_PX,
                      width: `min(80vw, ${MATCHING_POPOVER_MAX_WIDTH_PX}px)`,
                    }}
                  >
                    {hiddenOtherMatching.map((entry) => renderMatchingChip(entry, { onSelect: handleMatchingPopoverClose }))}
                  </Box>
                </Popover>
              </>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
});


type TesterGridCardSkeletonProps = {
  cardHeightPx: number
  leftColumnHeightPx: number
  rightColumnHeightPx: number
  showPrimaryMatchRow: boolean
  showOtherMatchesRow: boolean
  highlighted: boolean
  dimmed: boolean
}

// Skeleton cards borrow the real grid metrics so TanStack virtualization keeps accurate heights while assets defer.
function TesterGridCardSkeleton({
  cardHeightPx,
  leftColumnHeightPx,
  rightColumnHeightPx,
  showPrimaryMatchRow,
  showOtherMatchesRow,
  highlighted,
  dimmed,
}: TesterGridCardSkeletonProps) {
  const skeletonTheme = useTheme()
  const cardHeightStyle = `${cardHeightPx}px`
  const matchRowHeight = `${CARD_MATCH_ROW_HEIGHT_PX}px`
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: GRID_CARD_TEMPLATE,
        columnGap: theme.spacing(CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${CARD_BORDER_RADIUS_PX}px`,
        border: `1px solid ${highlighted ? theme.palette.info.light : theme.palette.divider}`,
        bgcolor: theme.palette.background.paper,
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        overflow: 'hidden',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 120ms ease',
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: GRID_CARD_LEFT_COLUMN_GAP_UNITS,
          minHeight: leftColumnHeightPx,
          height: leftColumnHeightPx,
          maxHeight: leftColumnHeightPx,
          justifyContent: 'flex-start',
        }}
      >
        <Skeleton variant="rounded" width={TESTER_GRID_ICON_BOX_SIZE_PX} height={TESTER_GRID_ICON_BOX_SIZE_PX} />
        <Skeleton
          variant="rounded"
          width={CHAMPION_ICON_LARGE_SIZE.width}
          height={CHAMPION_ICON_LARGE_SIZE.height}
        />
        <Skeleton variant="circular" width={GRID_CARD_SOURCE_ICON_SIZE_PX} height={GRID_CARD_SOURCE_ICON_SIZE_PX} />
      </Box>
      <Stack
        spacing={CARD_TEXT_STACK_GAP_UNITS}
        minWidth={0}
        sx={{
          gridColumn: '2',
          gridRow: '1',
          minWidth: 0,
          minHeight: rightColumnHeightPx,
          height: rightColumnHeightPx,
          maxHeight: rightColumnHeightPx,
          overflow: 'hidden',
        }}
      >
        <Skeleton variant="text" width="75%" sx={{ fontSize: `${CARD_SUMMARY_FONT_SIZE_REM}rem` }} />
        <Skeleton variant="text" width="50%" />
        {Array.from({ length: CARD_SUBSTAT_LINE_COUNT }).map((_, idx) => (
          <Skeleton
            key={`sub-skeleton-${idx}`}
            variant="text"
            width={`${80 - (idx * 8)}%`}
            sx={{ fontSize: skeletonTheme.typography.body2?.fontSize ?? '0.875rem' }}
          />
        ))}
      </Stack>
      {showPrimaryMatchRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
          }}
        >
          <Skeleton variant="rounded" width="100%" height={CARD_MATCH_ROW_HEIGHT_PX - 6} />
        </Box>
      ) : null}
      {showOtherMatchesRow ? (
        <Box
          sx={{
            gridColumn: '1 / -1',
            width: '100%',
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
            display: 'flex',
            alignItems: 'center',
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
          }}
        >
          <Skeleton variant="rounded" width="60%" height={CARD_MATCH_ROW_HEIGHT_PX - 6} />
        </Box>
      ) : null}
    </Box>
  )
}

type TesterGridCardRevealTask = {
  priorityBase: number
  priorityOrder: number
  run: () => void
}

// Queue gated reveals throttle IMG decode churn so expanding large accordions stays interactive.
const testerGridCardRevealQueue: TesterGridCardRevealTask[] = []
let testerGridCardRevealScheduled = false
let testerGridCardRevealQueueDirty = false
const testerGridCardSeenIds = new Set<number>()

function useTesterGridCardContentReady(rowId: number | null, priorityBase: number, priorityOrder: number): boolean {
  // Priority values keep row order deterministic while cards are still in their skeleton state.
  const normalizedBase = Number.isFinite(priorityBase) ? Math.max(0, priorityBase) : 0
  const normalizedOrder = Number.isFinite(priorityOrder) ? Math.max(0, priorityOrder) : 0
  const [ready, setReady] = useState(() => (
    typeof window === 'undefined' || rowId === null || testerGridCardSeenIds.has(rowId)
  ))
  useEffect(() => {
    if (ready) return undefined
    if (rowId !== null && testerGridCardSeenIds.has(rowId)) {
      setReady(true)
      return undefined
    }
    let cancelled = false
    const cleanup = enqueueTesterGridCardReveal(normalizedBase, normalizedOrder, () => {
      if (cancelled) return
      if (rowId !== null) {
        testerGridCardSeenIds.add(rowId)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [ready, rowId, normalizedBase, normalizedOrder])
  return ready
}

function enqueueTesterGridCardReveal(priorityBase: number, priorityOrder: number, run: () => void): () => void {
  if (typeof window === 'undefined') {
    run()
    return () => {}
  }
  const task: TesterGridCardRevealTask = {
    priorityBase,
    priorityOrder,
    run,
  }
  testerGridCardRevealQueue.push(task)
  testerGridCardRevealQueueDirty = true
  const queueSize = testerGridCardRevealQueue.length
  if (queueSize >= GRID_CARD_REVEAL_EMERGENCY_THRESHOLD) {
    flushTesterGridCardRevealQueue(true)
  } else {
    scheduleTesterGridCardRevealFlush()
  }
  return () => {
    const idx = testerGridCardRevealQueue.indexOf(task)
    if (idx >= 0) {
      testerGridCardRevealQueue.splice(idx, 1)
    }
  }
}

function scheduleTesterGridCardRevealFlush() {
  if (testerGridCardRevealScheduled) return
  if (typeof window === 'undefined') {
    flushTesterGridCardRevealQueue()
    return
  }
  testerGridCardRevealScheduled = true
  const scheduleFrame: (cb: FrameRequestCallback) => number = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (cb) => window.setTimeout(
      () => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()),
      GRID_CARD_SKELETON_FRAME_DELAY_MS,
    )
  scheduleFrame(() => {
    testerGridCardRevealScheduled = false
    flushTesterGridCardRevealQueue()
  })
}

// Off-screen pruning trims queued rows that are several viewports away; they re-enqueue automatically when scroll moves.
const shouldPruneRevealTask = (task: TesterGridCardRevealTask): boolean => (
  task.priorityOrder >= GRID_CARD_OFFSCREEN_PRIORITY_PENALTY
    && task.priorityOrder > (GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + GRID_CARD_REVEAL_MAX_OFFSCREEN_DISTANCE_PX)
)

// Mutates the queue in place so stale rows never dominate the backlog; returns the number of discarded tasks.
const pruneOffscreenRevealTasks = (): number => {
  if (testerGridCardRevealQueue.length < GRID_CARD_REVEAL_PRUNE_THRESHOLD) {
    return 0
  }
  let writeIdx = 0
  let dropped = 0
  for (let idx = 0; idx < testerGridCardRevealQueue.length; idx += 1) {
    const task = testerGridCardRevealQueue[idx]
    if (!task) {
      continue
    }
    if (shouldPruneRevealTask(task)) {
      dropped += 1
      continue
    }
    testerGridCardRevealQueue[writeIdx] = task
    writeIdx += 1
  }
  if (dropped > 0) {
    testerGridCardRevealQueue.length = writeIdx
  }
  return dropped
}

function flushTesterGridCardRevealQueue(forceDrain = false) {
  if (!testerGridCardRevealQueue.length) return
  if (!forceDrain) {
    pruneOffscreenRevealTasks()
  }
  if (testerGridCardRevealQueueDirty) {
    testerGridCardRevealQueue.sort((a, b) => {
      if (a.priorityBase !== b.priorityBase) {
        return b.priorityBase - a.priorityBase
      }
      return a.priorityOrder - b.priorityOrder
    })
    testerGridCardRevealQueueDirty = false
  }
  const flushStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const frameBudgetMs = forceDrain ? Number.POSITIVE_INFINITY : GRID_CARD_REVEAL_FRAME_BUDGET_MS
  const maxBatchSize = forceDrain
    ? testerGridCardRevealQueue.length
    : (
      testerGridCardRevealQueue.length >= GRID_CARD_REVEAL_FAST_BATCH_THRESHOLD
        ? GRID_CARD_SKELETON_BATCH_SIZE * GRID_CARD_REVEAL_BATCH_MULTIPLIER
        : GRID_CARD_SKELETON_BATCH_SIZE
    )
  let processed = 0
  while (testerGridCardRevealQueue.length && processed < maxBatchSize) {
    const task = testerGridCardRevealQueue.shift()!
    processed += 1
    task.run()
    if (!forceDrain) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if ((now - flushStart) >= frameBudgetMs) {
        break
      }
    }
  }
  if (testerGridCardRevealQueue.length) {
    scheduleTesterGridCardRevealFlush()
  }
}

type AccessorySetGroupBuilder = {
  group: TesterGroup
  slots: Map<string, TesterGroup>
}

type FactionGroupBuilder = {
  group: TesterGroup
  sets: Map<string, AccessorySetGroupBuilder>
  slots: Map<string, TesterGroup>
}

function groupRowsBySet(
  rows: readonly TesterPreviewRow[],
  translate: TranslateFn,
  lang: string,
  options: GroupRowsBySetOptions,
): TesterGroup[] {
  // Artifact sets form flat accordions, while accessories can nest faction->set->slot accordions.
  const grouping = options.grouping ?? TESTER_GROUPING_DEFAULT_STATE
  const substatSort = options.substatSort
  // Sorting stays orthogonal to grouping; grouping only controls section boundaries.
  const hasSubstatOrdering = Boolean(
    substatSort && (substatSort.priorities.length > 0 || substatSort.normalized === true),
  )
  // Non-default grouping uses a global sort order instead of per-section sorting.
  const useGlobalSort = hasSubstatOrdering && !isDefaultTesterGroupingState(grouping)
  const sortedRows = useGlobalSort && substatSort
    ? sortTesterRowsBySubstats(rows, substatSort)
    : rows

  if (grouping.hideHeaders) {
    // "No headers" renders everything in a single headerless group.
    const group: TesterGroup = {
      key: 'tester:all',
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
  const artifactSetGroups = new Map<string, { group: TesterGroup; slots: Map<string, TesterGroup> }>()
  const artifactSlotGroups = new Map<string, TesterGroup>()
  let artifactFlatGroup: TesterGroup | null = null
  const accessorySetGroups = new Map<string, AccessorySetGroupBuilder>()
  const accessorySlotGroups = new Map<string, TesterGroup>()
  let accessoryFlatGroup: TesterGroup | null = null
  // Faction groups only populate when faction grouping is enabled.
  const factionGroups = new Map<string, FactionGroupBuilder>()

  const formatSlotLabel = (slotId: ArtifactTypeId): string => {
    // Invalid slots should render as "Unknown" instead of throwing on i18n lookup.
    const slotValue = Number(slotId)
    if (!Number.isFinite(slotValue)) return translate('testerValueUnknown')
    return translate(artifactTypeI18nKey(slotValue as ArtifactTypeId))
  }

  const ensureArtifactFlatGroup = (index: number): TesterGroup => {
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

  const ensureAccessoryFlatGroup = (index: number): TesterGroup => {
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
          const setLabel = formatTesterSetLabel({ setId, slot, translate, lang })
          const group: TesterGroup = {
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
          const next = { group, slots: new Map<string, TesterGroup>() }
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
          const setLabel = accessoryHasNoSet ? translate('noSetAccessories') : formatTesterSetLabel({ setId, slot, translate, lang })
          const group: TesterGroup = {
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
          const next: AccessorySetGroupBuilder = { group, slots: new Map<string, TesterGroup>() }
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
        const setLabel = accessoryHasNoSet ? translate('noSetAccessories') : formatTesterSetLabel({ setId, slot, translate, lang })
        const group: TesterGroup = {
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
        const next: AccessorySetGroupBuilder = { group, slots: new Map<string, TesterGroup>() }
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

  const sortSlotGroups = (groups: TesterGroup[]): TesterGroup[] => {
    // Slot groups follow the canonical slot ordering unless global sort is active.
    if (useGlobalSort) return groups.sort((a, b) => a.order - b.order)
    return groups.sort((a, b) => compareArtifactTypes(a.slot ?? 0, b.slot ?? 0))
  }

  const resolveArtifactGroups = (): TesterGroup[] => {
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

  const resolveAccessoryGroups = (): TesterGroup[] => {
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

  const applySort = (group: TesterGroup) => {
    // Substat sorting is per-group; we keep group order stable for predictability.
    if (!hasSubstatOrdering || !substatSort) return
    if (useGlobalSort) return
    // Sort every group deterministically; leaf groups render cards while parents mainly provide counts.
    group.rows = sortTesterRowsBySubstats(group.rows, substatSort)
    group.children?.forEach(applySort)
  }

  grouped.forEach(applySort)
  return grouped
}

function getTesterCardHeight(
  showFirst: boolean,
  showOther: boolean,
  cardVerticalPaddingPx: number,
  firstRowHeightPx: number,
): number {
  // Card height is deterministic so TanStack can predict row heights without sampling.
  let height = firstRowHeightPx + cardVerticalPaddingPx
  const visibleRows = (showFirst ? 1 : 0) + (showOther ? 1 : 0)
  if (visibleRows > 0) {
    const perRowHeight = CARD_MATCH_ROW_HEIGHT_PX + (CARD_MATCH_ROW_MARGIN_PX * 2)
    height += visibleRows * perRowHeight
    if (visibleRows > 1) {
      height += (visibleRows - 1) * CARD_MATCH_ROW_GAP_PX
    }
  }
  return height
}

export type TesterGridCardSizing = {
  // Fixed height used for the card container so layout stays stable.
  cardHeightPx: number
  // Minimum width needed for icon + stats columns before scaling.
  minWidthPx: number
}

/**
 * Compute card sizing for external previews (diff toasts, history tooltips).
 */
export function getTesterGridCardSizing(
  theme: Theme,
  gridColumnCount: number,
  options: { showFirstMatchRow: boolean; showOtherMatchesRow: boolean },
): TesterGridCardSizing {
  // Vertical padding uses the same units as the main grid cards.
  const cardVerticalPaddingPx = parseSpacingPx(theme.spacing(CARD_PADDING_UNITS)) * 2
  // Column heights feed the deterministic card height calculation.
  const { firstRowHeightPx } = getTesterGridCardColumnHeights(theme, gridColumnCount)
  // Match rows add fixed-height blocks beneath the main summary row.
  const cardHeightPx = getTesterCardHeight(
    options.showFirstMatchRow,
    options.showOtherMatchesRow,
    cardVerticalPaddingPx,
    firstRowHeightPx,
  )
  // Horizontal padding keeps the icon + stats columns aligned with the grid.
  const horizontalPaddingPx = parseSpacingPx(theme.spacing(CARD_PADDING_UNITS))
  // Column gap matches the standard grid card spacing.
  const columnGapPx = parseSpacingPx(theme.spacing(CARD_COLUMN_GAP_UNITS))
  // Minimum width mirrors the two-column template used in the grid.
  const minWidthPx = GRID_CARD_ICON_COLUMN_PX
    + GRID_CARD_STATS_MIN_COLUMN_PX
    + columnGapPx
    + (horizontalPaddingPx * 2)
  return {
    cardHeightPx,
    minWidthPx,
  }
}

type GridCardColumnHeights = {
  leftColumnHeightPx: number
  rightColumnHeightPx: number
  firstRowHeightPx: number
}

const DEFAULT_HTML_FONT_SIZE_PX = 16

const typographySizeToPx = (value: string | number | undefined, htmlFontSize: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return 0
  }
  const trimmed = value.trim()
  if (trimmed.endsWith('rem')) {
    return Number.parseFloat(trimmed) * htmlFontSize
  }
  if (trimmed.endsWith('px')) {
    return Number.parseFloat(trimmed)
  }
  const numeric = Number.parseFloat(trimmed)
  return Number.isFinite(numeric) ? numeric : 0
}

function getTesterGridCardColumnHeights(theme: Theme, gridColumnCount: number): GridCardColumnHeights {
  // Both columns feed into card height + virtualization, so we translate theme typography to raw px once.
  const htmlFontSize = Number(theme.typography.htmlFontSize) || DEFAULT_HTML_FONT_SIZE_PX
  const summaryFontSizePx = CARD_SUMMARY_FONT_SIZE_REM * htmlFontSize
  const summaryLineHeightPx = CARD_SUMMARY_LINE_HEIGHT_REM * htmlFontSize
  const stackGapPx = parseSpacingPx(theme.spacing(CARD_TEXT_STACK_GAP_UNITS))
  const fallbackFontSizePx = typographySizeToPx(theme.typography.fontSize, htmlFontSize) || htmlFontSize
  const substatFontSizePx = typographySizeToPx(theme.typography.body2?.fontSize, htmlFontSize) || fallbackFontSizePx
  const substatLineHeightPx = CARD_SUBSTAT_LINE_HEIGHT * substatFontSizePx
  const substatGapPx = parseSpacingPx(theme.spacing(CARD_SUBSTAT_ROW_GAP_UNITS))
  const totalSubstatHeightPx = (CARD_SUBSTAT_LINE_COUNT * substatLineHeightPx)
    + (Math.max(0, CARD_SUBSTAT_LINE_COUNT - 1) * substatGapPx)
  const shouldInlineAscension = gridColumnCount <= 4
  const ascMarginPx = shouldInlineAscension ? 0 : parseSpacingPx(theme.spacing(CARD_ASC_BLOCK_MARGIN_TOP_UNITS))
  const ascFontSizePx = Math.max(0, summaryFontSizePx - CARD_ASC_FONT_DECREMENT_PX)
  const ascLineHeightPx = shouldInlineAscension ? 0 : CARD_ASC_LINE_HEIGHT * ascFontSizePx
  const summarySectionHeightPx = summaryLineHeightPx + ascMarginPx + ascLineHeightPx
  const rightColumnHeightPx = summarySectionHeightPx + stackGapPx + totalSubstatHeightPx
  const leftColumnGapPx = parseSpacingPx(theme.spacing(GRID_CARD_LEFT_COLUMN_GAP_UNITS))
  const leftColumnHeightPx = TESTER_GRID_ICON_BOX_SIZE_PX + GRID_CARD_SOURCE_ICON_SIZE_PX + leftColumnGapPx
  const normalizedLeftPx = Math.max(0, Math.ceil(leftColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  const normalizedRightPx = Math.max(0, Math.ceil(rightColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  return {
    leftColumnHeightPx: normalizedLeftPx,
    rightColumnHeightPx: normalizedRightPx,
    firstRowHeightPx: Math.max(normalizedLeftPx, normalizedRightPx),
  }
}

type TesterGridLayoutMetrics = {
  accordionSpacingPx: number
  cardHeightPx: number
  gridColumnCount: number
  gridGapPx: number
  leafPaddingPx: number
}

type UseTesterGridLayoutMetricsOptions = {
  preferredColumnCount: number
  showFirstMatch: boolean
  showOtherMatches: boolean
  theme: Theme
}

function useTesterGridLayoutMetrics({
  preferredColumnCount,
  showFirstMatch,
  showOtherMatches,
  theme,
}: UseTesterGridLayoutMetricsOptions): TesterGridLayoutMetrics {
  // Layout metrics re-run only on breakpoint or toggle changes so the cards stay stable across renders.
  const isMultiColumn = useMediaQuery(theme.breakpoints.up('sm'))
  const gridColumnCount = isMultiColumn ? preferredColumnCount : 1
  const accordionSpacingPx = useMemo(() => parseSpacingPx(theme.spacing(ACCORDION_MARGIN_UNITS)), [theme])
  const gridGapPx = useMemo(() => parseSpacingPx(theme.spacing(GRID_GAP)), [theme])
  const leafPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(GRID_CARD_CONTAINER_PADDING_UNITS)), [theme])
  const cardVerticalPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(CARD_PADDING_UNITS)) * 2, [theme])
  const { firstRowHeightPx: cardFirstRowHeightPx } = useMemo(
    () => getTesterGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardHeightPx = useMemo(
    () => getTesterCardHeight(showFirstMatch, showOtherMatches, cardVerticalPaddingPx, cardFirstRowHeightPx),
    [cardFirstRowHeightPx, cardVerticalPaddingPx, showFirstMatch, showOtherMatches],
  )
  return useMemo(() => ({
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx,
  }), [
    accordionSpacingPx,
    cardHeightPx,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx,
  ])
}

const STAR_LABEL_KEYS: readonly ['star1', 'star2', 'star3', 'star4', 'star5', 'star6'] = [
  'star1',
  'star2',
  'star3',
  'star4',
  'star5',
  'star6',
] as const

function formatTesterRankLabel(rank: number | null | undefined, translate: TranslateFn): string {
  if (rank === null || rank === undefined) return ''
  const numeric = Number(rank)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(1, Math.min(6, Math.round(numeric)))
  return translate(STAR_LABEL_KEYS[clamped - 1] ?? 'star1')
}

function formatTesterRarityLabel(rarity: number | null | undefined, translate: TranslateFn): string {
  if (rarity === null || rarity === undefined) return ''
  const numeric = Number(rarity)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(1, Math.min(6, Math.round(numeric))) as 1 | 2 | 3 | 4 | 5 | 6
  switch (clamped) {
    case 1: return translate('rarityCommon')
    case 2: return translate('rarityUncommon')
    case 3: return translate('rarityRare')
    case 4: return translate('rarityEpic')
    case 5: return translate('rarityLegendary')
    case 6: default: return translate('rarityMythical')
  }
}

export default TesterItemsGrid
