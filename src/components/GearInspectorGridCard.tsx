import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  ButtonBase,
  Chip,
  Menu,
  MenuItem,
  Skeleton,
  Popover,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import SellIcon from '@mui/icons-material/Sell'
import { alpha, keyframes, useTheme, useColorScheme, type Theme } from '@mui/material/styles'
import { adaptSubstatFgForScheme } from '../lib/themeCustomTokens'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import MailOutlineIcon from '@mui/icons-material/MailOutlineOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { useI18n } from '../lib/i18n'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import {
  artifactSetName,
  artifactTypeName,
  factionCodeToName,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  formatLevel,
  statVariantI18nKey,
  type ArtifactTypeId,
  type ArtifactSetId,
  type FactionId,
  StatVariant,
} from '../lib/types'
import { resolveRarityAccentColor, resolveRarityTextColor } from '../lib/rarityColors'
import { formatGearInspectorSetLabel } from '../lib/gearInspectorFormatters'
import {
  formatStatNumber,
  formatStatPreGlyph,
  getItemSourceDescriptor,
} from '../lib/gearInspectorPreviewFormatting'
import { CircledDigitBadge } from './CircledDigitBadge'
import type { GearInspectorContextGroup, GearInspectorSourceFilter } from '../lib/rulesFilter'
import { GearInspectorSummaryLabel } from './GearInspectorSummaryLabel'
import { GearInspectorRuleReferenceChip } from './GearInspectorRuleReferenceChip'
import { getGearInspectorMatchBorderColor, getGearInspectorMatchSurfaceColors } from './gearInspectorMatchStyles'
import { ensureContrastOnBg, blendAlpha } from '../lib/colorUtils'
import { resolveContrastSurfaceScheme, resolveCardChipBaseBg, resolveSchemePalette, schemeModeFromColorScheme, MYTHIC_SUBSTAT_BG_ALPHA, MYTHIC_SUBSTAT_TEXT_SHADOW_ALPHA } from '../lib/themeCustomTokens'
import { RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
// MarkdownTooltip unifies the Gear Inspector's tooltip behavior (source glyphs, manage colors, etc.) with the rest of the UI.
import MarkdownTooltip from './MarkdownTooltip'
import EllipsisTooltip from './EllipsisTooltip'
import { formatLocalDateTime } from '../lib/dateDisplay'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import GridIconBox from './GridIconBox'
import {
  MATCHING_RECIPE_CHIP_MIN_WIDTH_PX,
  CHAMPION_ICON_BASE_SIZE,
  CHAMPION_ICON_LARGE_SIZE,
  CHAMPION_ICON_LARGE_THRESHOLD,
  CHAMPION_ICON_BORDER_RADIUS_PX,
  PREVIEW_PAPER_PADDING_UNITS,
} from '../lib/constants'
import { championIconUrl } from '../lib/iconMaps/championIconMap'
import {
  parseSpacingPx,
  GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS,
  GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS,
  GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS,
  GEAR_INSPECTOR_CARD_TARGET_WIDTH_PX,
  GEAR_INSPECTOR_CARD_FALLBACK_COLUMN_COUNT,
} from '../lib/gearInspectorGridLayout'
import type { GearInspectorGridColumnMode } from '../state/gearInspectorGridPreferences'
import type { GearInspectorRuleTemplateIntent } from '../lib/gearInspectorRuleTemplates'
import { useChangePulse } from '../hooks/useChangePulse'
import { TINT, ALPHA } from '../lib/colorTints'

// TranslateFn is a locally-defined alias; both files define it identically without duplicating a domain literal.
type TranslateFn = ReturnType<typeof useI18n>['t']

// Card-level grid template uses a fixed icon column followed by a flexible stats column.
export const GRID_CARD_SINGLE_COLUMN_TEMPLATE = 'minmax(0, 1fr)'
const GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX = 72
const GRID_CARD_ICON_COLUMN_PX = GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX
const GRID_CARD_STATS_MIN_COLUMN_PX = 112
const GRID_CARD_TEMPLATE = `${GRID_CARD_ICON_COLUMN_PX}px minmax(${GRID_CARD_STATS_MIN_COLUMN_PX}px, 1fr)`
// GRID_GAP is a local alias so card internals don't need to reference the layout module constant by its long name.
const GRID_GAP = GEAR_INSPECTOR_GRID_COLUMN_GAP_UNITS
const CARD_COLUMN_GAP_UNITS = 1.5
const CARD_PADDING_UNITS = 1
const CARD_MATCH_ROW_HEIGHT_PX = 24
const CARD_MATCH_ROW_GAP_PX = 2
const CARD_MATCH_ROW_MARGIN_PX = 2
// Container padding mirrors the row padding defined in the layout module.
export const GRID_CARD_CONTAINER_PADDING_UNITS = GEAR_INSPECTOR_GRID_ROW_PADDING_UNITS
const GRID_CARD_LEFT_COLUMN_GAP_UNITS = 0.5
const GRID_CARD_SOURCE_ICON_SIZE_PX = 24
const VAULT_GLYPH_SIZE_PX = 20
const CARD_TEXT_STACK_GAP_UNITS = 0.75
const CARD_SUBSTAT_ROW_GAP_UNITS = 0.25
const CARD_SUBSTAT_LINE_HEIGHT = 1.1
const CARD_SUBSTAT_LINE_COUNT = 4
// Pre-computed skeleton widths so the loading placeholder avoids index-based keys.
const SKELETON_SUBSTAT_WIDTHS = Array.from(
  { length: CARD_SUBSTAT_LINE_COUNT },
  (_, i) => `${80 - i * 8}%`,
)
// Shadow blur matches the requested glow size.
const MYTHIC_SUBSTAT_SHADOW_BLUR_PX = 2
// Shadow spread gives the glow a crisp edge without padding.
const MYTHIC_SUBSTAT_SHADOW_SPREAD_PX = 1
// Halo blur radius keeps red-on-red combos legible without overriding text colors.
const MYTHIC_SUBSTAT_TEXT_SHADOW_BLUR_PX = 2
// MYTHIC_SUBSTAT_BG_ALPHA + MYTHIC_SUBSTAT_TEXT_SHADOW_ALPHA are imported from themeCustomTokens (SSOT).
// Rounded corners stop the mythic highlight from feeling harsh.
const MYTHIC_SUBSTAT_RADIUS_PX = 4
// Shared padding keeps substat text readable against the mythic glow.
const SUBSTAT_ROW_HORIZONTAL_PADDING_UNITS = 0.25
// Compact-mode substats align like a fixed-width table.
const COMPACT_SUBSTAT_NAME_COL_PX = 50
const COMPACT_SUBSTAT_VALUE_COL_PX = 34
const COMPACT_SUBSTAT_ROLL_COL_PX = 18
const COMPACT_SUBSTAT_GLYPH_COL_PX = 38
const CARD_SUMMARY_FONT_SIZE_REM = 0.9375
const CARD_SUMMARY_LINE_HEIGHT_REM = 1.25
const CARD_ASC_LINE_HEIGHT = 1.1
const CARD_ASC_FONT_DECREMENT_PX = 1.5
const CARD_ASC_BLOCK_MARGIN_TOP_UNITS = 0.125
const CARD_COLUMN_HEIGHT_BUFFER_PX = 0
const MAX_MATCHING_CHIPS = 6
// Keep the accordion border radius consistent across the card and the main grid.
const ACCORDION_MARGIN_UNITS = 0.75
// Match the card language: soft rounded rectangle, slightly tighter than the outer frame.
const CARD_STATS_DIM_RADIUS_PX = 6
// Expand the dim panel by 2px on every side to create breathing room around the stat text block.
const CARD_STATS_DIM_OUTSET_PX = 2
// Keep/sell button kept small so the stats column stays readable.
const CARD_ACTION_BUTTON_SIZE_PX = 28
const CARD_ACTION_ICON_SIZE_PX = 18
// Penalize off-screen rows so the reveal queue prefers on-screen cards even while overscanning nested accordions.
export const GRID_CARD_OFFSCREEN_PRIORITY_PENALTY = 1_000_000
// Static CSS channel expressions for mythic substat decorations — alpha is scheme-independent.
const MYTHIC_SUBSTAT_BG_CSS = `rgba(var(--mui-palette-error-mainChannel) / ${MYTHIC_SUBSTAT_BG_ALPHA})`
const MYTHIC_TEXT_SHADOW_CSS = `rgba(var(--mui-palette-background-paperChannel) / ${MYTHIC_SUBSTAT_TEXT_SHADOW_ALPHA})`
// Pulse duration exported so the main grid can clear the pulse timeout after the same window.
export const GRID_CARD_FOCUS_PULSE_DURATION_MS = 1500
// Match-change pulse fires once when a card's keep/sell outcome changes.
// Single forward pass, shorter than the focus double-pulse.
export const GRID_CARD_MATCH_CHANGE_PULSE_MS = 700
// Enter animation plays when a card first appears in the filtered result set.
// Exported so GearInspectorItemsGrid can clear the entering-ID set after this window.
export const GRID_CARD_ENTER_ANIMATION_MS = 220

// Keep the reveal queue short by pruning rows that are multiple viewports away; scrolling back to them re-enqueues a fresh task.
const GRID_CARD_REVEAL_MAX_OFFSCREEN_DISTANCE_PX = 4_000
const GRID_CARD_REVEAL_FAST_BATCH_THRESHOLD = 50
const GRID_CARD_REVEAL_EMERGENCY_THRESHOLD = 100
const GRID_CARD_REVEAL_FRAME_BUDGET_MS = 6
const GRID_CARD_REVEAL_PRUNE_THRESHOLD = 72
const GRID_CARD_REVEAL_BATCH_MULTIPLIER = 4
// GRID_CARD_REVEAL_IDLE_DRAIN_DELAY_MS is owned by GearInspectorItemsGrid (the scroll handler that fires the drain).
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
// Pulse keyframes intentionally return to baseline so focused cards never look permanently selected.
// CSS variables provide theme-aware colors without rebuilding keyframes at runtime.
const GEAR_INSPECTOR_GRID_CARD_FOCUS_PULSE_KEYFRAMES = keyframes`
  0% {
    border-color: var(--gear-inspector-focus-border-base);
    background-color: var(--gear-inspector-focus-bg-base);
    box-shadow: var(--gear-inspector-focus-shadow-base);
  }
  18% {
    border-color: var(--gear-inspector-focus-border-peak);
    background-color: var(--gear-inspector-focus-bg-peak);
    box-shadow: var(--gear-inspector-focus-shadow-peak);
  }
  36% {
    border-color: var(--gear-inspector-focus-border-base);
    background-color: var(--gear-inspector-focus-bg-base);
    box-shadow: var(--gear-inspector-focus-shadow-base);
  }
  62% {
    border-color: var(--gear-inspector-focus-border-peak);
    background-color: var(--gear-inspector-focus-bg-peak);
    box-shadow: var(--gear-inspector-focus-shadow-peak);
  }
  80% {
    border-color: var(--gear-inspector-focus-border-base);
    background-color: var(--gear-inspector-focus-bg-base);
    box-shadow: var(--gear-inspector-focus-shadow-base);
  }
  100% {
    border-color: var(--gear-inspector-focus-border-base);
    background-color: var(--gear-inspector-focus-bg-base);
    box-shadow: var(--gear-inspector-focus-shadow-base);
  }
`

// Match-change: single forward pass using a warm primary tint distinct from the focus-pulse blue.
// Returns to baseline at 100% so the card never stays tinted after the pulse.
const GEAR_INSPECTOR_GRID_CARD_MATCH_CHANGE_KEYFRAMES = keyframes`
  0% { background-color: var(--gear-inspector-focus-bg-base); }
  25% { background-color: var(--gear-inspector-focus-bg-peak); }
  100% { background-color: var(--gear-inspector-focus-bg-base); }
`

// Enter animation: card fades in from transparent and slides up 8px into place.
// GPU-accelerated (opacity + transform only) so it doesn't trigger layout recalcs.
const GEAR_INSPECTOR_GRID_CARD_ENTER_KEYFRAMES = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

const SOURCE_ICON_MAP: Record<GearInspectorSourceFilter, React.ElementType | null> = {
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

export type MatchingRecipeEntry = {
  recipeIdx: number
  label: string
  textColor: string | null
  keep: boolean | null
}

export type GearInspectorCardTopOverlay = {
  text: string
  color?: string
  // Click handler for overlay navigation (e.g. jump to safeguard rule).
  onClick?: () => void
  // Per-chip tooltip content — shown when hovering this chip only, isolated from the card icon tooltip.
  tooltipMarkdown?: string
  tooltipRender?: React.ReactNode
}

// Exported for endpoint diff previews that need the exact Gear Inspector card visuals.
export const GearInspectorGridCard = React.memo(function GearInspectorGridCard({
  row,
  centerOverlay,
  topOverlay,
  bottomOverlay,
  overlaySlotCount = 1,
  substatColors,
  useStatButtonColors,
  suppressMatchDetails,
  showFirstMatchRow,
  showOtherMatchesRow,
  showMatchRecipeIndex,
  showMatchLineNumber,
  showChampionIcons,
  highlightKeepSell = false,
  cardHeightPx,
  gridColumnCount,
  recipeNames,
  recipeFgColors,
  onJumpToRule,
  onJumpToRecipeMatch,
  onCreateRuleTemplate,
  highlightedRowPredicate = null,
  dimUnhighlightedRows = false,
  focusPulseActive = false,
  animateIn = false,
  cardPriority,
  contextGroupById = null,
  selected = false,
  onSelect,
  selectionEnabled = false,
}: {
  row: GearInspectorPreviewRow
  // Substat rating chip — bottom in triple mode, center otherwise.
  centerOverlay?: { text: string; color?: string; onClick?: () => void; tooltipMarkdown?: string; tooltipRender?: React.ReactNode } | null
  topOverlay?: GearInspectorCardTopOverlay | null
  // Safeguard rank chip — center in triple mode, collapses to center in single/double.
  bottomOverlay?: { text: string; color?: string; onClick?: () => void; tooltipMarkdown?: string; tooltipRender?: React.ReactNode } | null
  // How many overlay types are globally active; drives chip size + Y positions in GridIconBox.
  overlaySlotCount?: 1 | 2 | 3
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  suppressMatchDetails: boolean
  showFirstMatchRow: boolean
  showOtherMatchesRow: boolean
  showMatchRecipeIndex: boolean
  showMatchLineNumber: boolean
  showChampionIcons: boolean
  highlightKeepSell?: boolean
  cardHeightPx: number
  gridColumnCount: number
  recipeNames: Array<string | null>
  recipeFgColors?: Array<string | null>
  // Primary match chip jump. artifactId lets a safeguard primary match seed the weights-flyout focus
  // group (so it behaves like the rank / improvement-chance chips).
  onJumpToRule?: ((ruleIndex: number, recipeIdx: number | null, artifactId?: number) => void) | undefined
  // "Other matches" recipe chip jump — routes to THAT recipe, independent of the primary match.
  onJumpToRecipeMatch?: ((recipeIdx: number) => void) | undefined
  onCreateRuleTemplate?: ((row: GearInspectorPreviewRow, intent: GearInspectorRuleTemplateIntent) => void) | undefined
  highlightedRowPredicate?: ((row: GearInspectorPreviewRow) => boolean) | null
  dimUnhighlightedRows?: boolean
  focusPulseActive?: boolean
  /** When true, plays a one-shot enter animation (fade + slide-up).  Set by the grid for
   *  newly-appeared artifact IDs; cleared after GRID_CARD_ENTER_ANIMATION_MS. */
  animateIn?: boolean
  cardPriority: { base: number; order: number }
  /** When the result-filter context mode is active, maps artifact ID → display group for opacity. */
  contextGroupById?: Map<number, GearInspectorContextGroup> | null
  /** When true, the card is part of the current gear-inspector selection (endpoint must be active). */
  selected?: boolean
  /** Called when the card is clicked and selectionEnabled is true; event carries modifier keys. */
  onSelect?: (event: React.MouseEvent) => void
  /** When true, the card is clickable for selection and shows cursor:pointer. */
  selectionEnabled?: boolean
}) {
  // Highlight state lets Safeguards call attention to the at-risk combinations without mutating the dataset.
  const highlightFn = typeof highlightedRowPredicate === 'function' ? highlightedRowPredicate : null
  const cardHighlighted = highlightFn ? Boolean(highlightFn(row)) : false
  const cardDimmed = Boolean(highlightFn && dimUnhighlightedRows && !cardHighlighted && !focusPulseActive)
  // Context-mode opacity from result-filter companion grouping: primary=100%, companion=65%, other=25%.
  const artifactIdForContext = Number(row.artifact?.id)
  const contextGroup = contextGroupById != null && Number.isFinite(artifactIdForContext)
    ? (contextGroupById.get(artifactIdForContext) ?? null)
    : null
  const contextOpacity = contextGroup === 'companion' ? 0.65
    : contextGroup === 'other' ? 0.25
    : null
  // Frozen match rows keep stale data visible but low-opacity until the rebuild commits.
  const matchDetailsFrozen = Boolean(suppressMatchDetails)
  const matchDetailsOpacity = matchDetailsFrozen ? 0.45 : 1
  const { t, lang } = useI18n()
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  // Resolve the ACTUAL runtime-scheme surface colors (theme.palette.* is frozen to light).
  const scheme = resolveContrastSurfaceScheme(theme, schemeModeFromColorScheme(colorScheme))
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
    () => getGearInspectorGridCardColumnHeights(theme, gridColumnCount),
    [theme, gridColumnCount],
  )
  const cardContentReady = useGearInspectorGridCardContentReady(normalizedArtifactId, priorityBase, priorityOrder)
  const match = row.match
  // JS-resolved card surface: paper + outcome-tint layer at cardOutcomeTintAlpha.
  // Chips inside the card sit on top of this, so blending chip tints over cardChipBaseBg
  // (not raw paper) gives the actual rendered surface for contrast checks.
  const cardChipBaseBg = (highlightKeepSell && match)
    ? resolveCardChipBaseBg(scheme, match.keep)
    : scheme.paper
  // Stable string that changes whenever the match outcome flips (keep/sell/none, recipe index).
  // Used to trigger the match-change pulse animation so the user can see which cards updated.
  const matchFingerprint = match == null ? 'none' : `${match.keep ? 'k' : 's'}:${match.recipeIdx ?? -1}`
  const matchChangePulsing = useChangePulse(matchFingerprint, GRID_CARD_MATCH_CHANGE_PULSE_MS)
  const primaryRuleIndex = typeof match?.ruleIndex === 'number' ? match.ruleIndex : null
  const primaryRecipeIndex = typeof match?.recipeIdx === 'number' ? match.recipeIdx : null
  const canJumpToPrimaryMatch = typeof onJumpToRule === 'function' && primaryRuleIndex != null
  // Jump affordances stay disabled until the rebuild commits so stale matches never focus the wrong recipe.
  const allowPrimaryMatchJump = Boolean(!matchDetailsFrozen && canJumpToPrimaryMatch)
  // Recipe-match (other matches) chips navigate via onJumpToRecipeMatch, independent of the primary
  // rule index; gated on the same freeze flag so stale matches never navigate.
  const allowRecipeMatchJump = Boolean(!matchDetailsFrozen && typeof onJumpToRecipeMatch === 'function')
  const handlePrimaryMatchClick = () => {
    if (!allowPrimaryMatchJump || primaryRuleIndex == null) return
    // Pass the card's artifactId so a safeguard primary match seeds the weights-flyout focus group.
    const artifactId = Number(artifact?.id)
    onJumpToRule?.(primaryRuleIndex, primaryRecipeIndex ?? null, Number.isFinite(artifactId) ? artifactId : undefined)
  }
  // Wrapper for the primary GearInspectorRuleReferenceChip's onJump (signature has no artifactId):
  // injects the card's artifactId so a safeguard primary match seeds the weights-flyout focus group,
  // matching the rank / improvement-chance chips. undefined when no handler so the chip stays inert.
  const handleRuleReferenceJump = onJumpToRule
    ? (ruleIndex: number, recipeIdx: number | null) => {
        const artifactId = Number(artifact?.id)
        onJumpToRule(ruleIndex, recipeIdx, Number.isFinite(artifactId) ? artifactId : undefined)
      }
    : undefined
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
  const handleRuleTemplateSelect = (intent: GearInspectorRuleTemplateIntent) => {
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
      const cleanedLabel = (recipeNames[numericIdx] ?? '').trim()
      const textColor = recipeFgColors?.[numericIdx] ?? null
      entries.push({
        recipeIdx: numericIdx,
        label: cleanedLabel.length > 0
          ? cleanedLabel
          : `#${numericIdx + 1}`,
        textColor,
        keep: matchingRecipeKeepMap.get(numericIdx) ?? null,
      })
    }
    return entries
  }, [cardContentReady, row.matchingRecipeIndices, matchingRecipeKeepMap, recipeNames, recipeFgColors])
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
  // Ref-based setter so the ResizeObserver callback avoids the set-state-in-effect lint rule.
  const setOtherMatchesRowWidthRef = useRef(setOtherMatchesRowWidth)
  useEffect(() => {
    if (!otherMatchesRowEl) return undefined
    const node = otherMatchesRowEl
    const updateWidth = () => {
      setOtherMatchesRowWidthRef.current(measureMatchingRowContentWidth(node))
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
  // Reset the visible limit whenever the desired count or measurement inputs change.
  // Track the previous key in state so the comparison doesn't trigger the
  // react-hooks/refs lint rule during render.
  const limitResetKey = `${desiredOtherMatchingCount}|${otherMatchesRowWidth}|${otherMatchingEntriesSignature}`
  const [prevLimitResetKey, setPrevLimitResetKey] = useState(limitResetKey)
  if (limitResetKey !== prevLimitResetKey) {
    setPrevLimitResetKey(limitResetKey)
    setVisibleOtherMatchingLimit(desiredOtherMatchingCount)
  }
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
  // When "other matches" is off, keep first-match text visible and expose all others behind a +N chip.
  const shouldPinOtherMatchesToPrimaryRow = Boolean(!showOtherMatchesRow && shouldShowPrimaryMatchRow && totalOtherMatches > 0)
  const matchingOverflowEntries = shouldPinOtherMatchesToPrimaryRow
    ? otherMatchingEntries
    : (shouldShowOtherMatchesRow ? hiddenOtherMatching : [])
  const matchingOverflowCount = matchingOverflowEntries.length
  // Gap + refs let us squeeze as many chips as possible before handing the overflow to a popover.
  // matchingChipGapPx is no longer needed; chips container uses flex:1 so the +N button
  // naturally claims its own space without a pixel-width calculation.
  const visibleChipsContainerRef = useRef<HTMLDivElement | null>(null)
  const handleVisibleChipsContainerRef = useCallback((node: HTMLDivElement | null) => {
    visibleChipsContainerRef.current = node
  }, [])
  const hasHiddenMatches = hiddenOtherMatching.length > 0
  // Ref-based setter so the layout effect avoids the set-state-in-effect lint rule.
  const setVisibleOtherMatchingLimitRef = useRef(setVisibleOtherMatchingLimit)
  useLayoutEffect(() => {
    if (!totalOtherMatches) return
    const minVisible = hasHiddenMatches ? 1 : 0
    if (normalizedVisibleLimit < minVisible) {
      setVisibleOtherMatchingLimitRef.current(minVisible)
      return
    }
    const node = visibleChipsContainerRef.current
    if (!node) return
    const scrollDiff = node.scrollWidth - node.clientWidth
    if (scrollDiff <= 0.5) return
    if (normalizedVisibleLimit > minVisible) {
      setVisibleOtherMatchingLimitRef.current(normalizedVisibleLimit - 1)
    }
  }, [
    normalizedVisibleLimit,
    hasHiddenMatches,
    totalOtherMatches,
    otherMatchesRowWidth,
    otherMatchingEntriesSignature,
  ])
  const [matchingPopoverAnchor, setMatchingPopoverAnchor] = useState<HTMLElement | null>(null)
  const matchingPopoverOpen = Boolean(matchingPopoverAnchor) && matchingOverflowCount > 0
  // Switching row modes should dismiss stale popovers anchored to unmounted chips.
  // Track previous value in state so the comparison doesn't trigger the react-hooks/refs rule.
  const [prevShouldPin, setPrevShouldPin] = useState(shouldPinOtherMatchesToPrimaryRow)
  if (prevShouldPin !== shouldPinOtherMatchesToPrimaryRow) {
    setPrevShouldPin(shouldPinOtherMatchesToPrimaryRow)
    if (matchingPopoverAnchor !== null) {
      setMatchingPopoverAnchor(null)
    }
  }
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
    event.stopPropagation()
    if (matchingOverflowCount <= 0) return
    setMatchingPopoverAnchor(event.currentTarget)
  }
  const handleMatchingRecipeJump = (recipeIdx: number) => {
    // Match chips are recipe-source; jump to THAT recipe rather than the card's primary match rule.
    if (!allowRecipeMatchJump) return
    if (!Number.isFinite(recipeIdx)) return
    onJumpToRecipeMatch?.(recipeIdx)
  }
  const renderMatchingChip = (
    entry: MatchingRecipeEntry,
    options?: { onSelect?: () => void },
  ): React.ReactNode => {
    const key = `matching-chip-${entry.recipeIdx}`
    const clickable = allowRecipeMatchJump
    // Blend the chip tint over the card base (paper + card outcome tint) to get the actual surface.
    const chipBg = typeof entry.keep === 'boolean'
      ? blendAlpha(cardChipBaseBg, entry.keep ? scheme.successMain : scheme.errorMain, scheme.alphas.matchSurfaceAlpha)
      : cardChipBaseBg
    const textColor = entry.textColor
      ? ensureContrastOnBg(entry.textColor, chipBg)
      : null
    // Match first-row chips: same border and subtle surface tint for keep/sell.
    const borderColor = typeof entry.keep === 'boolean'
      ? getGearInspectorMatchBorderColor(theme, entry.keep)
      : null
    const surfaceColors = typeof entry.keep === 'boolean'
      ? getGearInspectorMatchSurfaceColors(theme, entry.keep)
      : null
    const sharedChipProps = {
      label: entry.label,
      size: 'small' as const,
      variant: 'outlined' as const,
      sx: [
        MATCHING_RECIPE_CHIP_SX,
        {
          cursor: clickable ? 'pointer' : 'default',
          bgcolor: surfaceColors?.surface ?? 'background.paper',
          ...(clickable
            ? { '&:hover': { bgcolor: surfaceColors?.hover ?? 'action.hover' } }
            : {}),
        },
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
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation()
                options?.onSelect?.()
                handleMatchingRecipeJump(entry.recipeIdx)
              },
            }
          : {})}
      />
    )

    // Inner chip box — shared between both return paths below.
    const chipBox = (
      <Box
        component="span"
        sx={MATCHING_CHIP_WRAPPER_SX}
      >
        {chipNode}
      </Box>
    )

    // flexShrink: 0 keeps each chip at its natural pixel width as a flex item of the visible-chips
    // container. Without this the browser shrinks items to fit and scrollWidth === clientWidth always,
    // so the overflow-detection useLayoutEffect never fires and chips that genuinely don't fit are
    // never trimmed — their padding and minimum widths effectively get ignored.
    // EllipsisTooltip must be inside the outer wrapper, not the outermost element itself, so that
    // MarkdownTooltip.cloneElement (which injects title=undefined onto its direct child) targets the
    // inner Box rather than EllipsisTooltip's title prop (which would produce "undefined" tooltips).
    return (
      <Box key={key} component="span" sx={{ flexShrink: 0, display: 'inline-flex', minWidth: 0, maxWidth: '100%' }}>
        {/* Use the chip-label class as the ellipsis target so native tooltips only appear for clipped labels. */}
        <EllipsisTooltip title={entry.label} selector=".MuiChip-label">
          {clickable
            ? (
                <MarkdownTooltip markdown={t('gearInspectorJumpToRecipe')}>
                  {chipBox}
                </MarkdownTooltip>
              )
            : chipBox
          }
        </EllipsisTooltip>
      </Box>
    )
  }
  if (!cardContentReady) {
    return (
      <GearInspectorGridCardSkeleton
        cardHeightPx={cardHeightPx}
        leftColumnHeightPx={leftColumnHeightPx}
        rightColumnHeightPx={rightColumnHeightPx}
        showPrimaryMatchRow={basePrimaryMatchRowVisible}
        showOtherMatchesRow={baseOtherMatchesRowVisible}
        highlighted={cardHighlighted}
        dimmed={cardDimmed}
        gridColumnCount={gridColumnCount}
      />
    )
  }
  const setIdNumber = Number(artifact.set) || 0
  const setLabelRaw = formatGearInspectorSetLabel({ setId: setIdNumber, slot: artifact.slot as ArtifactTypeId, translate: t, lang })
  const setLabel = setLabelRaw.trim().length > 0 ? setLabelRaw : undefined
  const setTooltipName = Number.isFinite(setIdNumber) ? artifactSetName(setIdNumber as ArtifactSetId) : null
  const levelBucketLabel = formatLevel(artifact.level)
  const hasExactLevel = typeof artifact.exactLevel === 'number' && Number.isFinite(artifact.exactLevel)
  const exactLevelLabel = hasExactLevel ? String(Math.max(0, Math.min(16, Math.round(Number(artifact.exactLevel))))) : null
  const levelLabel = exactLevelLabel ?? levelBucketLabel
  const levelChipLabel = levelLabel || t('any')
  const mainLabel = artifact.mainStat ? t(statVariantI18nKey(artifact.mainStat.variant)) : t('any')
  // Manual/custom gear items carry totalValue:NaN because the actual value is unknown.
  // Skip the numeric portion for those so the card doesn't display a spurious "0".
  const mainStatValueKnown = artifact.mainStat != null && Number.isFinite(artifact.mainStat.totalValue)
  const mainValue = mainStatValueKnown ? formatStatPreGlyph(artifact.mainStat ?? null) : ''
  const mainInline = mainValue ? t('gearInspectorMainStatInline', { stat: mainLabel, value: mainValue }) : mainLabel
  const mainVariant = artifact.mainStat?.variant
  const mainColor = useStatButtonColors && typeof mainVariant === 'number'
    ? adaptSubstatFgForScheme(substatColors[mainVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[mainVariant], theme, colorScheme)
    : undefined
  const glyphDeltaColor = (theme.vars?.palette.success.main ?? theme.palette.success.main)
  // Compact (<=4 columns) cards need explicit per-field alignment for substats.
  const compactSubstatColumnLayout = gridColumnCount <= 4
  // Ultra-dense (8-column) cards omit stat values to preserve readability at minimal width.
  const isUltraDense = gridColumnCount >= 8
  // Scale the icon box down ~40% in ultra-dense mode so it doesn't dominate the narrow card.
  const iconBoxSizePx = isUltraDense
    ? Math.round(GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX * 0.6)
    : GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX
  // Dynamic card template matches the (possibly reduced) icon column width.
  // Ultra-dense uses minmax(0, 1fr) — the 112 px floor would overflow the ~114 px content
  // area available inside a 130 px card (8 px padding each side + 43 px icon + gap).
  const cardGridTemplate = isUltraDense
    ? `${iconBoxSizePx}px minmax(0, 1fr)`
    : GRID_CARD_TEMPLATE
  const substatEntries = artifact.substats
    .filter((stat) => stat.variant !== StatVariant.Any)
    .map((stat) => {
      const statLabel = t(statVariantI18nKey(stat.variant))
      const statValue = formatStatPreGlyph(stat) || t('gearInspectorValueUnknown')
      const statColor = useStatButtonColors
        ? adaptSubstatFgForScheme(substatColors[stat.variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[stat.variant], theme, colorScheme)
        : undefined
      const glyphMagnitude = Math.abs(Number(stat.glyphValue) || 0)
      const glyphDelta = glyphMagnitude >= 0.01
        ? `${Number(stat.glyphValue) >= 0 ? '+' : '-'}${formatStatNumber(glyphMagnitude)}`
        : null
      const mythMagnitude = Math.abs(Number(stat.mythValue) || 0)
      const hasMythBonus = mythMagnitude >= 0.01
      const rollCount = (typeof stat.rolls === 'number' && stat.rolls > 0) ? stat.rolls : null
      const rollAriaLabel = rollCount != null
        ? t('gearInspectorRollsLabel', { rolls: rollCount })
        : null
      return {
        variant: stat.variant,
        isMythicBonus: hasMythBonus,
        statLabel,
        statValue,
        statColor,
        rollCount,
        rollAriaLabel,
        glyphDelta,
        hasValue: statValue.trim().length > 0,
        hasRoll: rollCount != null,
        hasGlyph: Boolean(glyphDelta),
        content: (
          <>
            <Box component="span" sx={{ color: statColor ?? 'inherit' }}>
              {/* In ultra-dense 8-col mode, omit the numeric value to save horizontal space. */}
              {statLabel}{isUltraDense ? null : <> {statValue}</>}
            </Box>
            {rollCount != null ? (
              <Box
                component="span"
                sx={{
                  ml: 0.5,
                  fontSize: '1rem',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
                aria-label={rollAriaLabel ?? undefined}
              >
                <CircledDigitBadge value={rollCount} />
              </Box>
            ) : null}
            {/* Glyph delta (green delta value) is omitted in 8-col ultra-dense mode. */}
            {(!isUltraDense && glyphDelta) ? (
              <Box component="span" sx={{ color: glyphDeltaColor, fontWeight: 600, ml: 0.5 }}>
                {glyphDelta}
              </Box>
            ) : null}
          </>
        ),
      }
});
  const compactHasValueColumnContent = substatEntries.some((entry) => entry.statValue.trim().length > 0)
  const compactHasRollColumnContent = substatEntries.some((entry) => entry.hasRoll)
  const compactHasGlyphColumnContent = substatEntries.some((entry) => entry.hasGlyph)
  const ascVariant = artifact.ascension?.variant
  const ascValue = artifact.ascension ? formatStatNumber(artifact.ascension.baseValue) : ''
  const ascLabel = artifact.ascension ? t(statVariantI18nKey(artifact.ascension.variant)) : ''
  const ascStatColor = useStatButtonColors && typeof ascVariant === 'number'
    ? adaptSubstatFgForScheme(substatColors[ascVariant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[ascVariant], theme, colorScheme)
    : undefined
  const ascInlineFontSize = 'calc(100% - 1.5px)'
  const ascLabelNode = ascLabel ? (
    <Box component="span" sx={{ color: ascStatColor ?? 'inherit', fontSize: ascInlineFontSize }}>
      {ascLabel}
    </Box>
  ) : null
  // Adapt the secondary accent against the actual card surface so the ascension value stays
  // legible in both schemes (mirrors how the ascension label is contrast-adapted above).
  const ascValueColor = ensureContrastOnBg(resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme)).secondary.main, cardChipBaseBg)
  const ascValueNode = ascValue ? (
    <Box
      component="span"
      sx={{ color: ascValueColor, fontWeight: 600, fontSize: ascInlineFontSize }}
    >
      {ascValue}
    </Box>
  ) : null
  const ascSummary = (() => {
    if (!artifact.ascension) return null
    if (ascValue && ascLabelNode && ascValueNode) {
      const statToken = '__STAT__'
      const valueToken = '__VALUE__'
      const template = t('gearInspectorMainStatInline', { stat: statToken, value: valueToken })
      const replacements = [
        { token: statToken, node: ascLabelNode },
        { token: valueToken, node: ascValueNode },
      ]
      // Each entry is either a literal string fragment or a tagged token node.
      const parts: Array<{ key: string; node: React.ReactNode }> = []
      let remaining = template
      let strSeq = 0
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
          if (remaining) { strSeq += 1; parts.push({ key: `asc-str-${strSeq}`, node: remaining }) }
          break
        }
        if (matchIdx > 0) {
          strSeq += 1
          parts.push({ key: `asc-str-${strSeq}`, node: remaining.slice(0, matchIdx) })
        }
        // Token name is unique within the template, making a stable key.
        parts.push({ key: `asc-${match.token}`, node: match.node })
        remaining = remaining.slice(matchIdx + match.token.length)
      }
      return (
        <>
          {parts.map((p) => (
            <React.Fragment key={p.key}>{p.node}</React.Fragment>
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
    const equippedToChampionId = artifact.equippedChampion?.id
    if (typeof equippedToChampionId !== 'number' || !Number.isFinite(equippedToChampionId) || equippedToChampionId <= 0) return base
    const baseHeroId = artifact.equippedChampion?.baseHeroId
    const baseHeroLabel = (typeof baseHeroId === 'number' && Number.isFinite(baseHeroId) && baseHeroId > 0) ? String(baseHeroId) : '?'
    return `${base} (${baseHeroLabel} / ${equippedToChampionId})`
  })()
  const championIconSrc = championIconUrl(artifact.equippedChampion?.baseHeroId ?? artifact.equippedChampion?.id)
  // 4-col and 8-col cards align to 5-col avatar sizing — 4-col for visual parity, 8-col because
  // cards are narrower than 5-col despite the higher count so large avatars would crowd the stats.
  const championSizingColumnCount = (gridColumnCount === 4 || gridColumnCount >= 8) ? 5 : gridColumnCount
  // Champion avatars only render for collection/vault sources so the extra visuals stay meaningful.
  const championIconEligible = Boolean(
    showChampionIcons
    && sourceDescriptor
    && (sourceDescriptor.category === 'collection' || sourceDescriptor.category === 'vault'),
  )
  // Large avatars only appear when the grid has enough horizontal room to avoid crushing the stats column.
  const championIconMode = championIconEligible
    ? (championSizingColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? 'large' : 'compact')
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
  // Ultra-dense uses the same large size as non-dense large mode: 38×38 fits within the available
  // column height (43 gear + 4 gap + 10 mt + 38 champ = 95 px < leftColumnHeightPx 100 px).
  const championIconSize = (isUltraDense || championIconMode === 'large')
    ? CHAMPION_ICON_LARGE_SIZE
    : CHAMPION_ICON_BASE_SIZE
  // Champion avatars reuse the rarity palette so imported pieces surface their quality immediately.
  const rarityAccentColor = resolveRarityAccentColor(artifact.equippedChampion?.rarity)
  // Avatar frames fall back to the neutral divider so unknown rarities still look intentional.
  const championBorderColor = rarityAccentColor ?? (theme.vars?.palette.divider ?? theme.palette.divider)
  // Glyph-only source icons use the accent when available so missing champ icons are easier to spot.
  // Contrast-correct it for text legibility (dark-red/purple accents on a dark card otherwise vanish).
  const championGlyphColor = resolveRarityTextColor(artifact.equippedChampion?.rarity, scheme.paper)
    ?? (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary)
  // Mirror the champion dropdown fallback: render the first initial when an avatar image is missing.
  const missingChampionFallbackInitial = (() => {
    const name = artifact.equippedChampion?.name?.trim() ?? ''
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  })()
  const rerollLabel = artifact.rerollCount > 0 ? '⟳' : ''
  const rerollTooltip = artifact.rerollCount > 0 ? t('gearInspectorRerollLabel') : ''
  const lockTooltip = artifact.isLocked ? t('gearInspectorLockedTooltip') : undefined
  // Tooltip copy surfaces the localized last-used timestamp whenever the DB provided one.
  const lastUseTooltip = (() => {
    if (!artifact.lastUseLocalTimestamp) return null
    const formatted = formatLocalDateTime(artifact.lastUseLocalTimestamp, { dateStyle: 'medium', timeStyle: 'medium' })
    const displayTimestamp = formatted ?? artifact.lastUseLocalTimestamp
    return t('gearInspectorLastUsedTooltip', { timestamp: displayTimestamp })
  })()
  // Dev builds include artifact id in the icon tooltip for quick transcript/debug lookups.
  const devArtifactIdTooltip = (() => {
    if (!import.meta.env.DEV) return null
    const artifactId = Number(artifact.id)
    if (!Number.isFinite(artifactId)) return null
    return `Artifact ID: ${Math.trunc(artifactId)}`
  })()
  // Styled JSX render for the gear icon tooltip, matching the scroll-hint flyout appearance:
  // caption weight, stacked rows, stat colors. Substats are included only in ultra-dense mode
  // where inline values are hidden; last-used and dev id appear at the bottom when present.
  const gearTooltipRender: React.ReactNode = (() => {
    const slotName = artifactTypeName(artifact.slot as ArtifactTypeId)
    const factionNum = Number(artifact.faction)
    const factionName = (Number.isFinite(factionNum) && factionNum !== 0)
      ? factionCodeToName(artifact.faction as FactionId)
      : null
    const hasSubstatSection = isUltraDense && substatEntries.length > 0
    return (
      <Typography
        variant="caption"
        component="div"
        sx={{ fontWeight: 600, letterSpacing: 0.15, display: 'flex', flexDirection: 'column', gap: 0.25 }}
      >
        {/* Gear identity rows: faction (accessories) → set → slot, mirroring the scroll-hint flyout order. */}
        {factionName ? <Box component="span">{factionName}</Box> : null}
        {setTooltipName ? <Box component="span">{setTooltipName}</Box> : null}
        <Box component="span">{slotName}</Box>
        {/* Substats section — only in ultra-dense mode where inline values are hidden. */}
        {hasSubstatSection ? (
          <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.15, mt: 0.5 }}>
            {substatEntries.map((e) => (
              <Box key={e.variant} component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                <Box component="span" sx={{ flex: 1, color: e.statColor ?? 'inherit' }}>{e.statLabel}</Box>
                <Box component="span">{e.statValue}</Box>
                {e.glyphDelta ? (
                  <Box component="span" sx={{ color: glyphDeltaColor }}>{e.glyphDelta}</Box>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}
        {/* Last-used timestamp de-emphasised with reduced weight. */}
        {lastUseTooltip ? (
          <Box component="span" sx={{ fontWeight: 400, opacity: 0.75, mt: 0.5 }}>{lastUseTooltip}</Box>
        ) : null}
        {/* Dev-only: artifact ID for quick lookup in transcripts. */}
        {devArtifactIdTooltip ? (
          <Box component="span" sx={{ fontWeight: 400, opacity: 0.6 }}>{devArtifactIdTooltip}</Box>
        ) : null}
      </Typography>
    )
  })()
  // Ultra-dense 8-col shows only the ascension stat name, without the numeric value.
  const ascSummaryContent = isUltraDense ? ascLabelNode : ascSummary
  // Keep/sell outcome surfaces the rule chip inline so keyboard users do not need to open popovers.
  const cardOutcome = match
    ? {
        tone: match.keep === false ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.success.main ?? theme.palette.success.main),
        glyph: match.keep === false ? <SellIcon fontSize="inherit" aria-hidden /> : '✓',
        label: match.keep === false ? t('gearInspectorMatchSell') : t('gearInspectorMatchKeep'),
        canJump: allowPrimaryMatchJump,
        ...(allowPrimaryMatchJump ? { onClick: handlePrimaryMatchClick } : {}),
        inactive: matchDetailsFrozen,
      }
    : undefined
  // Surface stable match metadata for automation without forcing DOM text scraping.
  const cardMatchOutcome = match ? (match.keep === false ? 'sell' : 'keep') : 'none'
  const cardMatchRecipeIdx = match?.recipeIdx != null ? String(match.recipeIdx) : 'none'
  // Outcome tint uses CSS channel tokens so colors adapt per scheme without isDark checks.
  const outcomeTintBg = (highlightKeepSell && match)
    ? (match.keep === false ? theme.custom.cardSellTintBg : theme.custom.cardKeepTintBg)
    : null
  // Stats-dim overlay keeps stat text readable over the outcome tint.
  const statsBlockDimBg = (highlightKeepSell && match) ? theme.custom.cardStatsDimBg : null
  const mainSummaryLabel = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <Typography
        component="span"
        variant="body2"
        noWrap
        sx={{
          color: mainColor ?? 'inherit',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.1,
        }}
      >
        {/* Ultra-dense 8-col shows only the stat name; full "Stat Value" inline is used otherwise. */}
        {isUltraDense ? mainLabel : mainInline}
      </Typography>
      {ascSummaryContent ? (
        <Typography
          component="span"
          variant="body2"
          noWrap
          sx={{
            mt: CARD_ASC_BLOCK_MARGIN_TOP_UNITS,
            pl: 1,
            color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
            fontWeight: 600,
            fontSize: ascInlineFontSize,
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.1,
          }}
        >
          + {ascSummaryContent}
        </Typography>
      ) : null}
    </Box>
  )
  // Gear action button opens the keep/sell template menu.
  const ruleTemplateButton = canCreateRuleTemplate ? (
    // Tooltip clarifies the action without cluttering the card.
    <MarkdownTooltip markdown={t('gearInspectorRuleTemplateTooltip')}>
      <ButtonBase
        onClick={handleRuleTemplateOpen}
        aria-label={t('gearInspectorRuleTemplateButtonAria')}
        aria-haspopup="menu"
        sx={{
          width: CARD_ACTION_BUTTON_SIZE_PX,
          height: CARD_ACTION_BUTTON_SIZE_PX,
          borderRadius: '50%',
          border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
          color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
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
    const template = t('gearInspectorRuleTemplateActionTemplate', { outcome: ruleTemplateOutcomeMarker })
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
        paper: { ...buildContextMenuPaperSlotProps({
          component: ContextMenuPaper,
          contextMenuGuard: ruleTemplateMenuGuard,
          onRequestClose: handleRuleTemplateClose,
          closeLabel: t('close'),
        }), ref: ruleTemplateMenuRef },
      }}
    >
      {/* Keep actions create a keep template tied to the current item. */}
      <MenuItem onClick={() => handleRuleTemplateSelect('keep')}>
        <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
          {renderRuleTemplateActionLabel(t('gearInspectorMatchKeep'), (theme.vars?.palette.success.main ?? theme.palette.success.main))}
        </Box>
      </MenuItem>
      {/* Sell actions create a sell template tied to the current item. */}
      <MenuItem onClick={() => handleRuleTemplateSelect('sell')}>
        <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
          {renderRuleTemplateActionLabel(t('gearInspectorMatchSell'), (theme.vars?.palette.error.main ?? theme.palette.error.main))}
        </Box>
      </MenuItem>
    </Menu>
  ) : null

  const cardHeightStyle = `${cardHeightPx}px`
  const matchRowHeight = `${CARD_MATCH_ROW_HEIGHT_PX}px`

  // Cards tint when highlighted so Safeguards can spotlight the matching combinations.
  // Selection (endpoint-driven) takes priority over safeguard highlighting.
  return (
    <Box
      data-gear-inspector-grid-card="true"
      data-row-id={artifact.id}
      data-match-outcome={cardMatchOutcome}
      data-match-recipe-index={cardMatchRecipeIdx}
      // Selection click captures the full card area; chip/button handlers still fire first via bubble.
      onClick={selectionEnabled && onSelect ? onSelect : undefined}
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: cardGridTemplate,
        // Narrow the gap in ultra-dense mode to reclaim horizontal space for the stats column.
        columnGap: theme.spacing(isUltraDense ? 0.75 : CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${Number(theme.shape.borderRadius)}px`,
        // theme.vars.palette.* gives CSS variable references that adapt per scheme.
        // Selection uses primary border; safeguard highlight uses info; default uses divider.
        border: `1px solid ${selected ? (theme.vars?.palette.primary.main ?? theme.palette.primary.main) : cardHighlighted ? (theme.vars?.palette.info.light ?? theme.palette.info.light) : (theme.vars?.palette.divider ?? theme.palette.divider)}`,
        // Selection adds a subtle primary tint to the background.
        bgcolor: selected
          ? TINT.primaryFocusBg
          : (outcomeTintBg ?? (theme.vars?.palette.background.paper ?? theme.palette.background.paper)),
        // Expose baseline/peak palette values so the pulse animation can resolve to theme-safe colors.
        '--gear-inspector-focus-border-base': cardHighlighted ? (theme.vars?.palette.info.light ?? theme.palette.info.light) : (theme.vars?.palette.divider ?? theme.palette.divider),
        '--gear-inspector-focus-border-peak': (theme.vars?.palette.info.main ?? theme.palette.info.main),
        '--gear-inspector-focus-bg-base': outcomeTintBg ?? (theme.vars?.palette.background.paper ?? theme.palette.background.paper),
        '--gear-inspector-focus-bg-peak': TINT.focusBgPeak,
        '--gear-inspector-focus-shadow-base': cardHighlighted ? `0 0 0 1px ${TINT.focusRing}` : 'none',
        '--gear-inspector-focus-shadow-peak': `0 0 0 2px ${TINT.focusShadowInner}, 0 8px 18px ${TINT.focusShadowOuter}`,
        // Relative positioning anchors the overlay button to the card frame.
        position: 'relative',
        minHeight: cardHeightStyle,
        height: cardHeightStyle,
        maxHeight: cardHeightStyle,
        boxSizing: 'border-box',
        // Allow decorative mythic glow to paint outside row bounds in all layouts.
        overflowX: 'visible',
        overflowY: 'visible',
        alignContent: 'start',
        // Selection: inner ring + outer glow in primary color; highlight: info glow; default: none.
        boxShadow: selected
          ? `inset 0 0 0 1px ${(theme.vars?.palette.primary.main ?? theme.palette.primary.main)}, 0 0 0 2px ${TINT.primarySelectedShadow}`
          : cardHighlighted ? `0 0 0 1px ${TINT.focusRing}` : 'none',
        // Card content must stay readable even inside colored containers (for example success toasts).
        color: (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
        // Context mode opacity takes precedence; falls back to safeguards dim or full opacity.
        opacity: contextOpacity ?? (cardDimmed ? 0.35 : 1),
        // Show pointer when the whole card is clickable for selection.
        cursor: selectionEnabled ? 'pointer' : 'default',
        transition: 'opacity 220ms ease, border-color 260ms ease, box-shadow 280ms ease, background-color 280ms ease',
        // Programmatic focus pulse takes priority.  Entering cards play both the slide-in
        // and the match-change color pulse simultaneously so newly-appearing items are as
        // visually prominent as cards whose outcome flipped.  Match-change pulse fires alone
        // for outcome-only changes.  All paths resolve to 'none' when idle.
        animation: focusPulseActive
          ? `${GEAR_INSPECTOR_GRID_CARD_FOCUS_PULSE_KEYFRAMES} ${GRID_CARD_FOCUS_PULSE_DURATION_MS}ms ease-in-out 1`
          : animateIn
          ? `${GEAR_INSPECTOR_GRID_CARD_ENTER_KEYFRAMES} ${GRID_CARD_ENTER_ANIMATION_MS}ms ease-out 1, ${GEAR_INSPECTOR_GRID_CARD_MATCH_CHANGE_KEYFRAMES} ${GRID_CARD_MATCH_CHANGE_PULSE_MS}ms ease-out 1`
          : matchChangePulsing
          ? `${GEAR_INSPECTOR_GRID_CARD_MATCH_CHANGE_KEYFRAMES} ${GRID_CARD_MATCH_CHANGE_PULSE_MS}ms ease-out 1`
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
          {...(artifact.isLocked ? { locked: true, lockTooltip } : {})}
          size={iconBoxSizePx}
          // Ultra-dense small-mode cards swap the star row for a compact numeric rank badge.
          {...(isUltraDense ? { compactRankDisplay: true } : {})}
          // Card icon tooltip: styled JSX render matching the scroll-hint flyout.
          // Per-chip tooltips (rank table, upgrade breakdown) are on the chips via tooltipMarkdown/tooltipRender.
          gearTooltipRender={gearTooltipRender}
          // overlaySlotCount drives chip size + Y positions; passed uniformly so all grid cards align.
          overlaySlotCount={overlaySlotCount}
          // Each overlay carries its own tooltip; card icon hover shows only last-use / dev id.
          {...(centerOverlay ? { centerOverlay } : {})}
          // Top overlay stacks above the center score (used for safeguard improvement chance).
          {...(topOverlay ? { topOverlay } : {})}
          // Bottom overlay is the third stacked chip — safeguard rank (only active in triple mode).
          {...(bottomOverlay ? { bottomOverlay } : {})}
          {...(cardOutcome ? { outcome: cardOutcome } : {})}
        />
        {shouldShowChampionIcon || shouldShowMissingChampionIconFallback ? (
          <Box
            sx={{
              width: iconBoxSizePx,
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
                  // rarityAccentColor is a real hex — alpha() is safe. Without a rarity, fall back to a neutral channel tint.
                  bgcolor: shouldShowChampionIcon ? 'transparent' : (rarityAccentColor ? alpha(rarityAccentColor, ALPHA.a15) : TINT.neutralIconBgFallback),
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
                      color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
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
                  sx={isUltraDense ? {
                    // Ultra-dense: bottom-right corner badge overlaid on the portrait.
                    // Horizontal offset aligns the badge with the portrait's right edge; the
                    // dimmed pill background keeps the icon readable against any portrait colour.
                    position: 'absolute',
                    bottom: 1,
                    right: Math.round((iconBoxSizePx - championIconSize.width) / 2) - 2,
                    width: 17,
                    height: 17,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: TINT.cardScrim,
                    borderRadius: '3px',
                    color: 'text.secondary',
                    fontSize: '0.85rem',
                  } : {
                    // Non-ultra-dense: right-side badge, vertically centred on the portrait.
                    position: 'absolute',
                    top: `calc(50% + ${championIconMode === 'large' ? 0 : 3}px)`,
                    left: `${iconBoxSizePx - 5}px`,
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
                      width: championSizingColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.width : CHAMPION_ICON_BASE_SIZE.width,
                      height: championSizingColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.height : CHAMPION_ICON_BASE_SIZE.height,
                      borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
                      fontSize: `${Math.max(16, Math.round((championSizingColumnCount >= CHAMPION_ICON_LARGE_THRESHOLD ? CHAMPION_ICON_LARGE_SIZE.height : CHAMPION_ICON_BASE_SIZE.height) * 0.78))}px`,
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
        sx={{
          gridColumn: '2',
          gridRow: '1',
          minWidth: 0,
          minHeight: rightColumnHeightPx,
          height: rightColumnHeightPx,
          maxHeight: rightColumnHeightPx,
          // Anchor the dim panel to the full main+substats area without changing layout metrics.
          position: 'relative',
          ...(statsBlockDimBg
            ? {
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: `${-CARD_STATS_DIM_OUTSET_PX}px`,
                borderRadius: `${CARD_STATS_DIM_RADIUS_PX}px`,
                backgroundColor: statsBlockDimBg,
                pointerEvents: 'none',
                zIndex: 0,
              },
              // Keep text and interactive rows above the dim layer.
              '& > *': {
                position: 'relative',
                zIndex: 1,
              },
            }
            : {}),
          // Let the card container handle clipping so mythic glow can escape horizontally.
          overflow: 'visible',
        }}
      >
        <GearInspectorSummaryLabel label={mainSummaryLabel} wrap />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: CARD_SUBSTAT_ROW_GAP_UNITS,
            width: '100%',
            flexGrow: 1,
            // Always visible: mythic box-shadow lives on the outer row Box (outside
            // Typography), so this container must not clip it. Glyph cells clip
            // individually via overflow:hidden on columns 3/4 instead.
            overflowX: 'visible',
            overflowY: 'visible',
          }}
        >
          {substatEntries.length > 0 ? (
            substatEntries.map((entry) => {
                // Only apply the accent when the stat actually has a mythic bonus.
                const mythicIndicatorSx = entry.isMythicBonus
                  ? {
                      // Outer glow keeps spacing identical while still calling attention.
                      boxShadow: `0 0 ${MYTHIC_SUBSTAT_SHADOW_BLUR_PX}px ${MYTHIC_SUBSTAT_SHADOW_SPREAD_PX}px ${(theme.vars?.palette.error.main ?? theme.palette.error.main)}`,
                      // Soft fill keeps the text legible on tinted cards (module-level CSS channel constant).
                      backgroundColor: MYTHIC_SUBSTAT_BG_CSS,
                      // Rounded corners keep the indicator subtle.
                      borderRadius: `${MYTHIC_SUBSTAT_RADIUS_PX}px`,
                      // Raise the glow above adjacent grid cells so it isn't visually clipped.
                      position: 'relative',
                      zIndex: 1,
                    }
                  : undefined
                // Neutral halo offsets red-tinted text without replacing user-configured colors.
                const mythicTextShadow = entry.isMythicBonus
                  ? `0 0 ${MYTHIC_SUBSTAT_TEXT_SHADOW_BLUR_PX}px ${MYTHIC_TEXT_SHADOW_CSS}`
                  : undefined
                // Shadow on the outer row Box works in both modes (it sits above Typography,
                // so no overflow:hidden ancestor can clip it). In compact mode the row Box
                // width is capped to populated columns so the shadow stops there too.
                const rowMythicIndicatorSx = entry.isMythicBonus ? mythicIndicatorSx : undefined
                // Determine the last populated compact column so the mythic highlight
                // stops at visible content while shared table column widths stay aligned.
                const compactMythicHighlightEndColumn = entry.hasGlyph
                  ? 4
                  : entry.hasRoll
                    ? 3
                    : (compactHasValueColumnContent && entry.hasValue ? 2 : 1)
                // Pixel widths of each compact column (zero when absent at card level).
                const highlightColWidths = [
                  COMPACT_SUBSTAT_NAME_COL_PX,
                  compactHasValueColumnContent ? COMPACT_SUBSTAT_VALUE_COL_PX : 0,
                  compactHasRollColumnContent ? COMPACT_SUBSTAT_ROLL_COL_PX : 0,
                  compactHasGlyphColumnContent ? COMPACT_SUBSTAT_GLYPH_COL_PX : 0,
                ]
                // Sum the px part and add (n-1) column gaps + both horizontal paddings.
                const highlightPxWidth = highlightColWidths
                  .slice(0, compactMythicHighlightEndColumn)
                  .reduce((sum, w) => sum + w, 0)
                const highlightGapCount = compactMythicHighlightEndColumn - 1
                const highlightSpacingUnits =
                  2 * SUBSTAT_ROW_HORIZONTAL_PADDING_UNITS + 0.4 * highlightGapCount
                // calc() combines the fixed px part with the theme-unit gap+padding part.
                const compactMythicWidth = `calc(${highlightPxWidth}px + ${theme.spacing(highlightSpacingUnits)})`

                // Return a single inline row so ellipsis behavior stays consistent.
                return (
                  <Box
                    key={`sub-${entry.variant}`}
                    sx={{
                      // Inline flex keeps the stat label/value aligned with roll glyphs.
                      display: 'inline-flex',
                      alignItems: 'center',
                      // Compact mythic: exact populated-column width so the shadow stops at
                      // the last real column, not the full grid template width. All other rows
                      // use fit-content; column alignment comes from the shared template.
                      width: (compactSubstatColumnLayout && entry.isMythicBonus)
                        ? compactMythicWidth
                        : 'fit-content',
                      maxWidth: '100%',
                      alignSelf: 'flex-start',
                      // Preserve shrink behavior so long stats still ellipsize.
                      flexShrink: 1,
                      minWidth: 0,
                      // Uniform padding keeps spacing consistent across mythic and non-mythic rows.
                      px: SUBSTAT_ROW_HORIZONTAL_PADDING_UNITS,
                      // Merge the mythic indicator only when the bonus is present.
                      ...(rowMythicIndicatorSx ?? {}),
                    }}
                  >
                      <Typography
                        variant="body2"
                        component="span"
                        noWrap={!compactSubstatColumnLayout}
                        sx={{
                          // Tight line-height keeps substats compact within the fixed card height.
                          lineHeight: 1.1,
                          display: compactSubstatColumnLayout ? 'block' : 'inline-flex',
                          alignItems: compactSubstatColumnLayout ? undefined : 'center',
                          // Keep text stable when the stat name is long.
                          width: '100%',
                          minWidth: 0,
                          // Hidden in both modes: prevents long stat names from escaping the row.
                          // Compact mythic rows are narrowed to populated columns via the outer
                          // row Box width, so trailing empty columns are clipped here harmlessly.
                          overflow: 'hidden',
                          // Ultra-dense clips cleanly — no ellipsis; the roll glyph (if any)
                          // is absolutely positioned so the label text can run right to it.
                          textOverflow: (compactSubstatColumnLayout || isUltraDense) ? 'clip' : 'ellipsis',
                          whiteSpace: compactSubstatColumnLayout ? 'normal' : 'nowrap',
                          // Anchor for the absolutely-positioned roll glyph in ultra-dense mode.
                          position: 'relative',
                          color: 'inherit',
                          // Subtle halo keeps tinted text legible over the mythic background.
                          textShadow: mythicTextShadow,
                        }}
                      >
                        {compactSubstatColumnLayout ? (
                          <Box
                            component="span"
                            sx={{
                              // Table-like 4-column row: name | value | reroll | glyph.
                              display: 'grid',
                              // Fixed column widths keep every row perfectly aligned.
                              gridTemplateColumns: `${COMPACT_SUBSTAT_NAME_COL_PX}px ${compactHasValueColumnContent ? COMPACT_SUBSTAT_VALUE_COL_PX : 0}px ${compactHasRollColumnContent ? COMPACT_SUBSTAT_ROLL_COL_PX : 0}px ${compactHasGlyphColumnContent ? COMPACT_SUBSTAT_GLYPH_COL_PX : 0}px`,
                              columnGap: 0.4,
                              alignItems: 'center',
                              width: 'fit-content',
                              maxWidth: '100%',
                              minWidth: 0,
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                gridColumn: '1',
                                gridRow: '1',
                                color: entry.statColor ?? 'inherit',
                                minWidth: 0,
                                overflow: 'visible',
                                textOverflow: 'clip',
                                whiteSpace: 'nowrap',
                                zIndex: 1,
                              }}
                            >
                              {entry.statLabel}
                            </Box>
                            <Box
                              component="span"
                              sx={{
                                gridColumn: '2',
                                gridRow: '1',
                                color: entry.statColor ?? 'inherit',
                                whiteSpace: 'nowrap',
                                textAlign: 'right',
                                justifySelf: 'end',
                                fontVariantNumeric: 'tabular-nums',
                                zIndex: 1,
                              }}
                            >
                              {entry.statValue}
                            </Box>
                            <Box
                              component="span"
                              aria-label={entry.rollAriaLabel ?? undefined}
                              sx={{
                                gridColumn: '3',
                                gridRow: '1',
                                minWidth: 0,
                                // Clip wide glyphs at the cell boundary so they cannot bleed
                                // into adjacent columns or cards (replaces container overflow:hidden).
                                overflow: 'hidden',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                zIndex: 1,
                              }}
                            >
                              {entry.rollCount != null ? (
                                <Box
                                  component="span"
                                  sx={{
                                    fontSize: '1rem',
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <CircledDigitBadge value={entry.rollCount} />
                                </Box>
                              ) : null}
                            </Box>
                            <Box
                              component="span"
                              sx={{
                                gridColumn: '4',
                                gridRow: '1',
                                color: glyphDeltaColor,
                                fontWeight: 600,
                                minWidth: 0,
                                // Clip at cell boundary — same reason as column 3.
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textAlign: 'right',
                                justifySelf: 'end',
                                fontVariantNumeric: 'tabular-nums',
                                zIndex: 1,
                              }}
                            >
                              {entry.glyphDelta ?? ''}
                            </Box>
                          </Box>
                        ) : (isUltraDense && entry.hasRoll) ? (
                          // Ultra-dense: label has flex: '0 1 auto' so it sits naturally right
                          // of the icon and doesn't grow — glyph stays adjacent for short labels.
                          // When space is tight the label box shrinks and its text clips cleanly
                          // against the glyph (no ellipsis), which stays fully visible thanks to
                          // flex-shrink: 0. A subtle rounded bg on the glyph keeps it readable
                          // when it overlays the trailing characters of a long label.
                          <>
                            <Box
                              component="span"
                              sx={{
                                flex: '0 1 auto',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                minWidth: 0,
                                color: entry.statColor ?? 'inherit',
                              }}
                            >
                              {entry.statLabel}
                            </Box>
                            <Box
                              component="span"
                              sx={{
                                flexShrink: 0,
                                fontSize: '1rem',
                                lineHeight: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                ml: 0.5,
                              }}
                              aria-label={entry.rollAriaLabel ?? undefined}
                            >
                              {entry.rollCount != null && <CircledDigitBadge value={entry.rollCount} />}
                            </Box>
                          </>
                        ) : entry.content}
                      </Typography>
                  </Box>
              )
            })
          ) : (
            <GearInspectorSummaryLabel label="—" />
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
            gap: MATCHING_CHIP_GAP_UNITS,
            minWidth: 0,
            mt: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            mb: `${CARD_MATCH_ROW_MARGIN_PX}px`,
            minHeight: matchRowHeight,
            height: matchRowHeight,
            maxHeight: matchRowHeight,
            opacity: matchDetailsOpacity,
          }}
        >
          {match ? (
            <GearInspectorRuleReferenceChip
              match={match}
              underlayBg={cardChipBaseBg}
              {...(!matchDetailsFrozen && handleRuleReferenceJump ? { onJump: handleRuleReferenceJump } : {})}
              showRecipeIndex={showMatchRecipeIndex}
              showLineNumber={showMatchLineNumber}
              sx={{ flex: 1, minWidth: 0 }}
            />
          ) : null}
          {shouldPinOtherMatchesToPrimaryRow ? (
            // Reuse the +N affordance so hidden matches remain discoverable while first match stays fully visible.
            <MarkdownTooltip markdown={`${t('gearInspectorRecipeMatches')} (+${matchingOverflowCount})`}>
              <Box component="span" sx={{ ...MATCHING_CHIP_WRAPPER_SX, flexShrink: 0, ml: 'auto' }}>
                <Chip
                  label={`+${matchingOverflowCount}`}
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
              ref={handleVisibleChipsContainerRef}
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: MATCHING_CHIP_GAP_UNITS,
                // flex:1 lets the container naturally fill whatever space remains after the
                // +N button claims its own width — no pixel math needed.
                flex: 1,
                minWidth: 0,
                // overflow:hidden clips chips that temporarily exceed the container width while the
                // overflow-detection useLayoutEffect is still converging on the correct chip count.
                overflow: 'hidden',
              }}
            >
              {visibleOtherMatching.map((entry) => renderMatchingChip(entry))}
            </Box>
            {matchingOverflowCount > 0 ? (
              <>
                {/* MarkdownTooltip keeps the "+N" overflow chip consistent with other Gear Inspector tooltips. */}
                <MarkdownTooltip markdown={`${t('gearInspectorRecipeMatches')} (+${matchingOverflowCount})`}>
                  <Box component="span" sx={{ ...MATCHING_CHIP_WRAPPER_SX, flexShrink: 0 }}>
                    <Chip
                      label={`+${matchingOverflowCount}`}
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
              </>
            ) : null}
          </Box>
        </Box>
      ) : null}
      {matchingOverflowCount > 0 ? (
        <Popover
          open={matchingPopoverOpen}
          anchorEl={matchingPopoverAnchor}
          onClose={handleMatchingPopoverClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          disableRestoreFocus
          slotProps={{
            paper: { ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard: matchingPopoverGuard,
              onRequestClose: handleMatchingPopoverClose,
              closeLabel: t('close'),
              sx: {
                maxWidth: MATCHING_POPOVER_MAX_WIDTH_PX,
                width: `min(80vw, ${MATCHING_POPOVER_MAX_WIDTH_PX}px)`,
              },
            }), ref: matchingPopoverPaperRef },
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
            {matchingOverflowEntries.map((entry) => renderMatchingChip(entry, { onSelect: handleMatchingPopoverClose }))}
          </Box>
        </Popover>
      ) : null}
    </Box>
  )
});


type GearInspectorGridCardSkeletonProps = {
  cardHeightPx: number
  leftColumnHeightPx: number
  rightColumnHeightPx: number
  showPrimaryMatchRow: boolean
  showOtherMatchesRow: boolean
  highlighted: boolean
  dimmed: boolean
  // Drives ultra-dense layout adjustments (≥8 columns = small-card mode).
  gridColumnCount: number
}

// Skeleton cards borrow the real grid metrics so TanStack virtualization keeps accurate heights while assets defer.
function GearInspectorGridCardSkeleton({
  cardHeightPx,
  leftColumnHeightPx,
  rightColumnHeightPx,
  showPrimaryMatchRow,
  showOtherMatchesRow,
  highlighted,
  dimmed,
  gridColumnCount,
}: GearInspectorGridCardSkeletonProps) {
  const skeletonTheme = useTheme()
  const cardHeightStyle = `${cardHeightPx}px`
  const matchRowHeight = `${CARD_MATCH_ROW_HEIGHT_PX}px`
  // Mirror the real card's ultra-dense adjustments so the skeleton proportions match.
  const isUltraDense = gridColumnCount >= 8
  const iconBoxSizePx = isUltraDense
    ? Math.round(GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX * 0.6)
    : GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX
  const skeletonCardTemplate = isUltraDense
    ? `${iconBoxSizePx}px minmax(0, 1fr)`
    : GRID_CARD_TEMPLATE
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: skeletonCardTemplate,
        columnGap: theme.spacing(CARD_COLUMN_GAP_UNITS),
        p: theme.spacing(CARD_PADDING_UNITS),
        borderRadius: `${Number(theme.shape.borderRadius)}px`,
        border: `1px solid ${highlighted ? (theme.vars?.palette.info.light ?? theme.palette.info.light) : (theme.vars?.palette.divider ?? theme.palette.divider)}`,
        bgcolor: (theme.vars?.palette.background.paper ?? theme.palette.background.paper),
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
        {/* Use the same icon box size as the real card — 60% in ultra-dense mode. */}
        <Skeleton variant="rounded" width={iconBoxSizePx} height={iconBoxSizePx} />
        <Skeleton
          variant="rounded"
          width={CHAMPION_ICON_LARGE_SIZE.width}
          height={CHAMPION_ICON_LARGE_SIZE.height}
        />
        <Skeleton variant="circular" width={GRID_CARD_SOURCE_ICON_SIZE_PX} height={GRID_CARD_SOURCE_ICON_SIZE_PX} />
      </Box>
      <Stack
        spacing={CARD_TEXT_STACK_GAP_UNITS}
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
        {SKELETON_SUBSTAT_WIDTHS.map((w) => (
          <Skeleton
            key={`sub-skeleton-${w}`}
            variant="text"
            width={w}
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

type GearInspectorGridCardRevealTask = {
  priorityBase: number
  priorityOrder: number
  run: () => void
}

// Queue gated reveals throttle IMG decode churn so expanding large accordions stays interactive.
const gearInspectorGridCardRevealQueue: GearInspectorGridCardRevealTask[] = []
let gearInspectorGridCardRevealScheduled = false
let gearInspectorGridCardRevealQueueDirty = false
const gearInspectorGridCardSeenIds = new Set<number>()

// Exported so the grid can skip passing a live scrollVersion to already-revealed cards,
// preventing scroll events from triggering re-renders on cards that are already fully hydrated.
export function isGearInspectorCardRevealed(artifactId: number): boolean {
  return gearInspectorGridCardSeenIds.has(artifactId)
}

function useGearInspectorGridCardContentReady(rowId: number | null, priorityBase: number, priorityOrder: number): boolean {
  // Priority values keep row order deterministic while cards are still in their skeleton state.
  const normalizedBase = Number.isFinite(priorityBase) ? Math.max(0, priorityBase) : 0
  const normalizedOrder = Number.isFinite(priorityOrder) ? Math.max(0, priorityOrder) : 0
  const [ready, setReady] = useState(() => (
    typeof window === 'undefined' || rowId === null || gearInspectorGridCardSeenIds.has(rowId)
  ))
  // Promote to ready during render if the row was revealed by a sibling card's queue flush.
  if (!ready && rowId !== null && gearInspectorGridCardSeenIds.has(rowId)) {
    setReady(true)
  }
  // Ref-based setter so the async queue callback avoids the set-state-in-effect lint rule.
  // Synced via effect to avoid writing a ref during render.
  const setReadyRef = useRef(setReady)
  useEffect(() => { setReadyRef.current = setReady }, [setReady])
  useEffect(() => {
    if (ready) return undefined
    let cancelled = false
    const cleanup = enqueueGearInspectorGridCardReveal(normalizedBase, normalizedOrder, () => {
      if (cancelled) return
      if (rowId !== null) {
        gearInspectorGridCardSeenIds.add(rowId)
      }
      setReadyRef.current(true)
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [ready, rowId, normalizedBase, normalizedOrder])
  return ready
}

export function enqueueGearInspectorGridCardReveal(priorityBase: number, priorityOrder: number, run: () => void): () => void {
  if (typeof window === 'undefined') {
    run()
    return () => {}
  }
  const task: GearInspectorGridCardRevealTask = {
    priorityBase,
    priorityOrder,
    run,
  }
  gearInspectorGridCardRevealQueue.push(task)
  gearInspectorGridCardRevealQueueDirty = true
  const queueSize = gearInspectorGridCardRevealQueue.length
  if (queueSize >= GRID_CARD_REVEAL_EMERGENCY_THRESHOLD) {
    flushGearInspectorGridCardRevealQueue(true)
  } else {
    scheduleGearInspectorGridCardRevealFlush()
  }
  return () => {
    const idx = gearInspectorGridCardRevealQueue.indexOf(task)
    if (idx >= 0) {
      gearInspectorGridCardRevealQueue.splice(idx, 1)
    }
  }
}

export function scheduleGearInspectorGridCardRevealFlush() {
  if (gearInspectorGridCardRevealScheduled) return
  if (typeof window === 'undefined') {
    flushGearInspectorGridCardRevealQueue()
    return
  }
  gearInspectorGridCardRevealScheduled = true
  const scheduleFrame: (cb: FrameRequestCallback) => number = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (cb) => window.setTimeout(
      () => cb(typeof performance !== 'undefined' ? performance.now() : Date.now()),
      GRID_CARD_SKELETON_FRAME_DELAY_MS,
    )
  scheduleFrame(() => {
    gearInspectorGridCardRevealScheduled = false
    flushGearInspectorGridCardRevealQueue()
  })
}

// Off-screen pruning trims queued rows that are several viewports away; they re-enqueue automatically when scroll moves.
const shouldPruneRevealTask = (task: GearInspectorGridCardRevealTask): boolean => (
  task.priorityOrder >= GRID_CARD_OFFSCREEN_PRIORITY_PENALTY
    && task.priorityOrder > (GRID_CARD_OFFSCREEN_PRIORITY_PENALTY + GRID_CARD_REVEAL_MAX_OFFSCREEN_DISTANCE_PX)
)

// Mutates the queue in place so stale rows never dominate the backlog; returns the number of discarded tasks.
export const pruneOffscreenRevealTasks = (): number => {
  if (gearInspectorGridCardRevealQueue.length < GRID_CARD_REVEAL_PRUNE_THRESHOLD) {
    return 0
  }
  let writeIdx = 0
  let dropped = 0
  for (let idx = 0; idx < gearInspectorGridCardRevealQueue.length; idx += 1) {
    const task = gearInspectorGridCardRevealQueue[idx]
    if (!task) {
      continue
    }
    if (shouldPruneRevealTask(task)) {
      dropped += 1
      continue
    }
    gearInspectorGridCardRevealQueue[writeIdx] = task
    writeIdx += 1
  }
  if (dropped > 0) {
    gearInspectorGridCardRevealQueue.length = writeIdx
  }
  return dropped
}

export function flushGearInspectorGridCardRevealQueue(forceDrain = false) {
  if (!gearInspectorGridCardRevealQueue.length) return
  if (!forceDrain) {
    pruneOffscreenRevealTasks()
  }
  if (gearInspectorGridCardRevealQueueDirty) {
    gearInspectorGridCardRevealQueue.sort((a, b) => {
      if (a.priorityBase !== b.priorityBase) {
        return b.priorityBase - a.priorityBase
      }
      return a.priorityOrder - b.priorityOrder
    })
    gearInspectorGridCardRevealQueueDirty = false
  }
  const flushStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const frameBudgetMs = forceDrain ? Number.POSITIVE_INFINITY : GRID_CARD_REVEAL_FRAME_BUDGET_MS
  const maxBatchSize = forceDrain
    ? gearInspectorGridCardRevealQueue.length
    : (
      gearInspectorGridCardRevealQueue.length >= GRID_CARD_REVEAL_FAST_BATCH_THRESHOLD
        ? GRID_CARD_SKELETON_BATCH_SIZE * GRID_CARD_REVEAL_BATCH_MULTIPLIER
        : GRID_CARD_SKELETON_BATCH_SIZE
    )
  let processed = 0
  while (gearInspectorGridCardRevealQueue.length && processed < maxBatchSize) {
    const task = gearInspectorGridCardRevealQueue.shift()!
    processed += 1
    task.run()
    if (!forceDrain) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if ((now - flushStart) >= frameBudgetMs) {
        break
      }
    }
  }
  if (gearInspectorGridCardRevealQueue.length) {
    scheduleGearInspectorGridCardRevealFlush()
  }
}

function getGearInspectorCardHeight(
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

export type GearInspectorGridCardSizing = {
  // Fixed height used for the card container so layout stays stable.
  cardHeightPx: number
  // Minimum width needed for icon + stats columns before scaling.
  minWidthPx: number
}

/**
 * Compute card sizing for external previews (diff toasts, history tooltips).
 */
export function getGearInspectorGridCardSizing(
  theme: Theme,
  gridColumnCount: number,
  options: { showFirstMatchRow: boolean; showOtherMatchesRow: boolean },
): GearInspectorGridCardSizing {
  // Vertical padding uses the same units as the main grid cards.
  const cardVerticalPaddingPx = parseSpacingPx(theme.spacing(CARD_PADDING_UNITS)) * 2
  // Column heights feed the deterministic card height calculation.
  const { firstRowHeightPx } = getGearInspectorGridCardColumnHeights(theme, gridColumnCount)
  // Match rows add fixed-height blocks beneath the main summary row.
  const cardHeightPx = getGearInspectorCardHeight(
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

export function getGearInspectorGridCardColumnHeights(theme: Theme, gridColumnCount: number): GridCardColumnHeights {
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
  // Match 4-column cards to the 5-column vertical profile; only very narrow layouts inline ascension.
  const shouldInlineAscension = gridColumnCount <= 3
  const ascMarginPx = shouldInlineAscension ? 0 : parseSpacingPx(theme.spacing(CARD_ASC_BLOCK_MARGIN_TOP_UNITS))
  const ascFontSizePx = Math.max(0, summaryFontSizePx - CARD_ASC_FONT_DECREMENT_PX)
  const ascLineHeightPx = shouldInlineAscension ? 0 : CARD_ASC_LINE_HEIGHT * ascFontSizePx
  const summarySectionHeightPx = summaryLineHeightPx + ascMarginPx + ascLineHeightPx
  const rightColumnHeightPx = summarySectionHeightPx + stackGapPx + totalSubstatHeightPx
  const leftColumnGapPx = parseSpacingPx(theme.spacing(GRID_CARD_LEFT_COLUMN_GAP_UNITS))
  const leftColumnHeightPx = GEAR_INSPECTOR_GRID_ICON_BOX_SIZE_PX + GRID_CARD_SOURCE_ICON_SIZE_PX + leftColumnGapPx
  const normalizedLeftPx = Math.max(0, Math.ceil(leftColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  const normalizedRightPx = Math.max(0, Math.ceil(rightColumnHeightPx + CARD_COLUMN_HEIGHT_BUFFER_PX))
  return {
    leftColumnHeightPx: normalizedLeftPx,
    rightColumnHeightPx: normalizedRightPx,
    firstRowHeightPx: Math.max(normalizedLeftPx, normalizedRightPx),
  }
}

export type GearInspectorGridLayoutMetrics = {
  accordionSpacingPx: number
  cardHeightPx: number
  cardStyleColumnCount: number
  gridColumnCount: number
  gridGapPx: number
  leafPaddingPx: number
}

type UseGearInspectorGridLayoutMetricsOptions = {
  preferredColumnCount: number
  // When provided together, these drive the dynamic column count path for the Gear Inspector grid.
  // panelWidthPx is the Paper's outer width (including its own padding) as reported by the splitter.
  // containerInnerWidthPx is the scroll container's live clientWidth (paper padding already stripped);
  // it is preferred over panelWidthPx because it updates during splitter drag via ResizeObserver.
  cardSizeMode?: GearInspectorGridColumnMode
  panelWidthPx?: number
  containerInnerWidthPx?: number
  cardStyleColumnCount?: number
  showFirstMatch: boolean
  showOtherMatches: boolean
  theme: Theme
  // Gear-diff split-view: each pane is ~half the preview width. Rounding (instead of
  // flooring) the width/target ratio keeps the column count at half the full-grid count
  // and the card width identical, avoiding a collapse to one over-wide card near
  // exact-multiple widths.
  halfPaneColumns?: boolean
}

export function useGearInspectorGridLayoutMetrics({
  preferredColumnCount,
  cardSizeMode,
  panelWidthPx,
  containerInnerWidthPx,
  cardStyleColumnCount,
  showFirstMatch,
  showOtherMatches,
  theme,
  halfPaneColumns = false,
}: UseGearInspectorGridLayoutMetricsOptions): GearInspectorGridLayoutMetrics {
  // Layout metrics re-run only on breakpoint or resize events so the cards stay stable across renders.
  const isMultiColumn = useMediaQuery(theme.breakpoints.up('sm'))
  const leafPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(GRID_CARD_CONTAINER_PADDING_UNITS)), [theme])
  const gridColumnCount = useMemo(() => {
    if (!isMultiColumn) return 1
    if (cardSizeMode != null) {
      const targetWidth = GEAR_INSPECTOR_CARD_TARGET_WIDTH_PX[cardSizeMode]
      const containerInlineEndPx = parseSpacingPx(theme.spacing(GEAR_INSPECTOR_GRID_CONTAINER_PADDING_END_UNITS))
      let rowContentWidth: number
      if (containerInnerWidthPx != null && containerInnerWidthPx > 0) {
        // Live path: containerInnerWidthPx is the scroll container's clientWidth, measured by
        // ResizeObserver. Paper padding is already stripped — just remove container/row padding.
        rowContentWidth = Math.max(0, containerInnerWidthPx - containerInlineEndPx - leafPaddingPx * 2)
      } else if (panelWidthPx != null && panelWidthPx > 0) {
        // Committed path: panelWidthPx is the Paper's outer width as reported by the splitter.
        // Strip the Paper padding on both sides before removing container/row padding.
        const paperPaddingPx = parseSpacingPx(theme.spacing(PREVIEW_PAPER_PADDING_UNITS))
        rowContentWidth = Math.max(0, panelWidthPx - paperPaddingPx * 2 - containerInlineEndPx - leafPaddingPx * 2)
      } else {
        // Static fallback: neither width is available; use the reference column count for the mode.
        // In a half-width diff pane, halve the reference so the transient isn't over-columned.
        // Floor (not round) so odd reference counts (medium=5) give 2 columns, not 3.
        const fallback = GEAR_INSPECTOR_CARD_FALLBACK_COLUMN_COUNT[cardSizeMode]
        return halfPaneColumns ? Math.max(1, Math.floor(fallback / 2)) : fallback
      }
      // Derive column count from the full-panel row content width. For half-pane diff panes,
      // halve the column count so each pane mirrors the full-grid density at the same card width.
      // Floor keeps cards at least target-wide; halving floors again so odd full counts (e.g. 3)
      // give 1 rather than rounding up to 2 compressed columns.
      const fullColumns = Math.floor(rowContentWidth / targetWidth)
      return Math.max(1, halfPaneColumns ? Math.floor(fullColumns / 2) : fullColumns)
    }
    // Keep-override path: preferredColumnCount is 1 or 2, used verbatim.
    return Math.max(1, preferredColumnCount)
  }, [isMultiColumn, cardSizeMode, panelWidthPx, containerInnerWidthPx, leafPaddingPx, preferredColumnCount, theme, halfPaneColumns])
  // Card internals use a pinned column profile so their layout doesn't shift as the dynamic
  // column count adjusts with panel width. Priority: explicit cardStyleColumnCount override
  // (keep-override path) → mode's reference count (gear-inspector path) → gridColumnCount.
  const resolvedCardStyleColumnCount = Number.isFinite(cardStyleColumnCount)
    ? Math.max(1, Math.round(Number(cardStyleColumnCount)))
    : cardSizeMode != null
      ? GEAR_INSPECTOR_CARD_FALLBACK_COLUMN_COUNT[cardSizeMode]
      : gridColumnCount
  const accordionSpacingPx = useMemo(() => parseSpacingPx(theme.spacing(ACCORDION_MARGIN_UNITS)), [theme])
  const gridGapPx = useMemo(() => parseSpacingPx(theme.spacing(GRID_GAP)), [theme])
  // leafPaddingPx is computed above the gridColumnCount memo (needed there for row-content width).
  const cardVerticalPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(CARD_PADDING_UNITS)) * 2, [theme])
  const { firstRowHeightPx: cardFirstRowHeightPx } = useMemo(
    () => getGearInspectorGridCardColumnHeights(theme, resolvedCardStyleColumnCount),
    [theme, resolvedCardStyleColumnCount],
  )
  const cardHeightPx = useMemo(
    () => getGearInspectorCardHeight(showFirstMatch, showOtherMatches, cardVerticalPaddingPx, cardFirstRowHeightPx),
    [cardFirstRowHeightPx, cardVerticalPaddingPx, showFirstMatch, showOtherMatches],
  )
  return useMemo(() => ({
    accordionSpacingPx,
    cardHeightPx,
    cardStyleColumnCount: resolvedCardStyleColumnCount,
    gridColumnCount,
    gridGapPx,
    leafPaddingPx,
  }), [
    accordionSpacingPx,
    cardHeightPx,
    resolvedCardStyleColumnCount,
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

export function formatGearInspectorRankLabel(rank: number | null | undefined, translate: TranslateFn): string {
  if (rank === null || rank === undefined) return ''
  const numeric = Number(rank)
  if (!Number.isFinite(numeric)) return ''
  const clamped = Math.max(1, Math.min(6, Math.round(numeric)))
  return translate(STAR_LABEL_KEYS[clamped - 1] ?? 'star1')
}

export function formatGearInspectorRarityLabel(rarity: number | null | undefined, translate: TranslateFn): string {
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
