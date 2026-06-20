/**
 * SafeguardCandidateRankList
 *
 * Compact scrollable list of scored safeguard candidates for the weight popover.
 * Shows: rank number, slot (icon OR text), set (icon OR text), faction (icon OR text, accessories only),
 * score, kept/sold badge. A quota cutoff divider separates kept from sold candidates.
 *
 * Display flags mirror the global HSF table preferences: when an icon flag is on the corresponding
 * text label is suppressed — either icons OR text, never both.
 *
 * The list is windowed around the cutoff: the last few kept items appear before the divider
 * and the first few sold items after it, so users immediately see who is borderline.
 *
 * Hovering a candidate row shows a scaled GearInspectorGridCard tooltip (same 0.7-scale pattern
 * as the db-update-history view) when preview row data is available.
 *
 * Two modes:
 * - candidates provided: render ranked list (score/rank from WASM)
 * - no detection data + substats selected: render per-roll weight hints
 */
import { Box, Chip, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import EllipsisTooltip from './EllipsisTooltip'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SellIcon from '@mui/icons-material/Sell'
import StarsIcon from '@mui/icons-material/Stars'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import { ELLIPSIS_TEXT_SX, FONT_SIZE_SECONDARY_REM, FONT_FAMILY_MONO } from '../lib/constants'
import { alpha, useTheme, useColorScheme, type Theme } from '@mui/material/styles'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import type { SafeguardCandidateOut, SafeguardDetectionArtifact } from '../lib/safeguards'
import { safeguardFocusGroupKeyFor } from '../lib/safeguards'
import { normalizeSubstatByMax6 } from '../lib/substatRollNormalization'
import { artifactSetName, artifactTypeI18nKey, factionI18nKey, statVariantI18nKey, STAT_VARIANTS_PRIORITY, type StatVariant, type ArtifactSetId, type FactionId } from '../lib/types'
import { isAccessorySlot } from '../lib/gearInspectorDomain'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from '../lib/gearInspectorSort'
import { SUBSTAT_SLOT_COUNT } from '../lib/generated/domainConstants'
import { CircledDigitBadge } from './CircledDigitBadge'
import { resolveRarityTextColor } from '../lib/rarityColors'
import { useI18n } from '../lib/i18n'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_SAFEGUARDS } from '../lib/ruleSources'
import { safeguardEffectiveCountModeForDisplay, type SafeguardCombination, type SafeguardRuleCountMode } from '../lib/safeguards'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { GearInspectorGridCard, getGearInspectorGridCardSizing } from './GearInspectorGridCard'
import { GEAR_DB_DIFF_TOAST_CARD_SCALE, CHAMPION_ICON_LARGE_THRESHOLD } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import type { NameAppearance } from '../lib/nameAppearance'
import { ensureContrastOnBg, mixRgb, parseCssColorToRgb, rgbToCss } from '../lib/colorUtils'
import { resolveSchemePaper, schemeModeFromColorScheme, adaptSubstatFgOnSurface, MYTHIC_SUBSTAT_BG_ALPHA } from '../lib/themeCustomTokens'
import { TINT, ALPHA } from '../lib/colorTints'

// Scrollable container height — fits comfortably inside the 460px right column.
const CANDIDATE_LIST_MAX_HEIGHT_PX = 380
// Font size for the match-source (name) column — exported so SafeguardBuilderPanel can measure
// the same size when computing the fixed column width from candidate names.
export const FONT_SIZE_MATCH_SOURCE_REM = 0.68
export type StatCellWidths = {
  // Width for the mainstat column — widest label across all variants, no roll glyph.
  mainstatCellWidthPx: number
  // Width for each substat column — widest label + circled-4 roll glyph across all variants.
  substatCellWidthPx: number
}

// Measures exact pixel widths for mainstat and substat columns in a single canvas pass.
// Iterates every StatVariant in STAT_VARIANTS_PRIORITY so the result covers all possible labels.
// Exported so SafeguardBuilderPanel can size the popover consistently.
// Result is stable per language/theme; call inside useMemo([t, theme]) to avoid repeated work.
export function measureStatCellWidths(
  t: ReturnType<typeof useI18n>['t'],
  theme: Theme,
): StatCellWidths {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  // Resolve actual font size: matches the caption variant (FONT_SIZE_SECONDARY_REM) used in table cells.
  const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize)
  const fontSizePx = FONT_SIZE_SECONDARY_REM * (Number.isFinite(rootFontSizePx) ? rootFontSizePx : 16)
  if (!ctx) {
    // Canvas unavailable — fall back to a rough per-char estimate.
    return { mainstatCellWidthPx: Math.ceil(fontSizePx * 4), substatCellWidthPx: Math.ceil(fontSizePx * 7) }
  }
  ctx.font = `${fontSizePx}px ${theme.typography.fontFamily ?? 'sans-serif'}`
  // CSS badge outer size ≈ 1× the context em square; add it to the label measurement
  // to reserve space for the roll-count badge without measuring a Unicode glyph.
  const badgeWidthPx = fontSizePx
  let maxMainstat = 0
  let maxSubstat = 0
  for (const variant of STAT_VARIANTS_PRIORITY) {
    const label = t(statVariantI18nKey(variant))
    maxMainstat = Math.max(maxMainstat, ctx.measureText(label).width)
    maxSubstat = Math.max(maxSubstat, ctx.measureText(label).width + badgeWidthPx)
  }
  const buffer = 4  // px safety buffer for subpixel rounding
  return {
    mainstatCellWidthPx: Math.ceil(maxMainstat) + buffer,
    substatCellWidthPx: Math.ceil(maxSubstat) + buffer,
  }
}
// Card preview uses the same column profile and scale factor as the db-update-history toast.
const CANDIDATE_CARD_COLUMN_COUNT = CHAMPION_ICON_LARGE_THRESHOLD
const CANDIDATE_CARD_SCALE = GEAR_DB_DIFF_TOAST_CARD_SCALE
const EMPTY_RECIPE_NAMES: string[] = []
const CARD_PRIORITY_BASE = 0
// Mythic substat highlight mirrors GearInspectorGridCard constants.
const MYTHIC_SUBSTAT_SHADOW_BLUR_PX = 2
const MYTHIC_SUBSTAT_SHADOW_SPREAD_PX = 1
const MYTHIC_SUBSTAT_RADIUS_PX = 4
// A substat has a mythic bonus when its mythValue component is at least this threshold.
const MYTHIC_BONUS_MIN = 0.01

export type SafeguardCandidateRankListProps = {
  // Scored candidates from detection snapshot or live preview, sorted by rank ascending.
  // When undefined: show hint mode.
  candidates: SafeguardCandidateOut[] | undefined
  // Quota for the rule — used to draw the cutoff line and count kept items.
  quota: number
  // Count mode for the rule — used to label the cutoff with active grouping dimensions.
  countMode?: SafeguardRuleCountMode
  // Combination for the rule — used to suppress per-X labels that are redundant given the selected filters.
  combination?: SafeguardCombination
  // Artifact metadata keyed by itemKey, sourced from SafeguardDetectionEntry.artifacts.
  artifactsByItemKey: ReadonlyMap<number, SafeguardDetectionArtifact>
  // Substat variants selected in the rule — used for per-roll hints when no data.
  substats: StatVariant[]
  // Per-variant weight multipliers — used for per-roll hints and impact-sorted substat ordering.
  weights: Partial<Record<StatVariant, number>>
  // True when the detection pass has run but this rule has no candidates at all.
  noMatchesYet?: boolean
  // Display mode flags — each one selects icon OR text, never both (mirrors HSF table toggles).
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  // Preview rows keyed by safeguard item key — enables hover card tooltip on each row.
  previewRowByItemKey?: ReadonlyMap<number, GearInspectorPreviewRow> | null
  // Color map for substat label coloring inside the hover card tooltip.
  substatColors?: Record<number, { fg: string; bg: string }>
  // Whether stat button colors are active (controls colored substat text in the card tooltip).
  useStatButtonColors?: boolean
  // Clicking a candidate row selects it in the Gear Inspector, scrolls to it, and switches tabs.
  onSelectCandidate?: (itemKey: number) => void
  // When provided, candidates whose itemKey is not in this set are slightly dimmed
  // (the Gear Inspector filter is hiding them from the current grid view).
  visibleItemKeys?: ReadonlySet<number> | null
  // When true, perFaction is suppressed from the quota label (faction is not accessible-slot
  // relevant for this rule, so naming it in the cutoff label would be misleading).
  suppressPerFactionInLabel?: boolean
  // Appearance (name + optional color) of the current safeguard rule — shown as match source label.
  ruleAppearance?: NameAppearance
  // 1-based ordinal of the current safeguard rule — used for identity comparisons.
  // Replaces the old ruleOrdinal approach now that SafeguardRule carries no id field.
  ruleOrdinal?: number
  // Number of substat columns to render per row (real cells + placeholder pads).
  // Computed by the parent from the max matching substats across candidates; falls back to
  // min(substats.length, SUBSTAT_SLOT_COUNT) when not provided.
  substatColumnCount?: number
  // Controlled focus group: when provided, the list scopes to this count-group and the parent owns
  // the value (so it can persist across opens while the rule stays selected). onFocusedGroupKeyChange
  // is called on every toggle. When neither is provided the list falls back to internal focus state.
  focusedGroupKey?: string | null
  onFocusedGroupKeyChange?: (key: string | null) => void
  // Improvement chance percent (for the currently edited rule) keyed by safeguard item key.
  // Rendered as a column left of the score; absent keys render a blank cell.
  improvementChanceByItemKey?: ReadonlyMap<number, number> | null
}

// Human-readable label for a focused count-group, built from a representative artifact's active
// dimension values in the cutoff scope's slot → set → faction → main order. SSOT for the focus chip
// so the panel header (where the chip lives) and the list agree on naming. Returns null when no group
// is focused, the rule has no per-group dimension, or no candidate matches the key.
//
// Two modes are taken on purpose. `matchCountMode` is the mode the focus key was BUILT with (App's
// derivation) and is used only to locate the representative artifact — it must equal the key's mode
// or the lookup misses. `displayCountMode` decides which dimensions are NAMED in the chip; it may be
// stricter (e.g. drops perFaction for non-accessory rules) so the chip never shows a meaningless
// dimension. When omitted, the display mode falls back to the match mode.
export function computeSafeguardFocusGroupLabel(
  focusGroupKey: string | null,
  candidates: readonly SafeguardCandidateOut[] | undefined,
  artifactsByItemKey: ReadonlyMap<number, SafeguardDetectionArtifact>,
  matchCountMode: SafeguardRuleCountMode | undefined,
  t: ReturnType<typeof useI18n>['t'],
  displayCountMode?: SafeguardRuleCountMode,
): string | null {
  if (focusGroupKey == null || !matchCountMode || !candidates) return null
  // Locate any candidate in the focused group using the SAME mode the key was built with.
  let art: SafeguardDetectionArtifact | undefined
  for (const c of candidates) {
    const candidateArt = artifactsByItemKey.get(c.itemKey)
    if (!candidateArt) continue
    if (safeguardFocusGroupKeyFor(candidateArt, matchCountMode) === focusGroupKey) {
      art = candidateArt
      break
    }
  }
  if (!art) return null
  // Name dimensions per the display mode (defaults to the match mode when not narrowed).
  const display = displayCountMode ?? matchCountMode
  const parts: string[] = []
  if (display.perSlot) parts.push(t(artifactTypeI18nKey(art.slot)))
  if (display.perSet) parts.push(artifactSetName(art.set))
  if (display.perFaction) parts.push(t(factionI18nKey(art.faction)))
  if (display.perMainStat) parts.push(t(statVariantI18nKey(art.mainStat)))
  return parts.join(' · ')
}

// Clearable chip naming the focused count-group. Rendered by the panel beside the "Candidates"
// header (not inside the scroll container) so it stays visible while the list scrolls. Renders
// nothing when no group is focused.
export function SafeguardFocusGroupChip({
  label,
  onClear,
}: {
  label: string | null
  onClear: () => void
}) {
  if (label == null) return null
  return (
    <Chip
      size="small"
      icon={<FilterCenterFocusIcon />}
      label={label}
      onDelete={onClear}
      sx={{ maxWidth: '100%' }}
    />
  )
}

export default function SafeguardCandidateRankList({
  candidates,
  quota,
  artifactsByItemKey,
  substats,
  weights,
  noMatchesYet,
  showSlotIcons,
  showSetIcons,
  showFactionIcons,
  previewRowByItemKey,
  substatColors,
  useStatButtonColors,
  onSelectCandidate,
  visibleItemKeys,
  suppressPerFactionInLabel,
  ruleAppearance,
  ruleOrdinal,
  countMode,
  combination,
  substatColumnCount,
  focusedGroupKey: controlledFocusedGroupKey,
  onFocusedGroupKeyChange,
  improvementChanceByItemKey,
}: SafeguardCandidateRankListProps) {
  const { t } = useI18n()
  const theme = useTheme()

  // Uniform fixed widths for mainstat and substat cells — measured once across ALL stat variants
  // so column widths are consistent regardless of which substats the current rule selects.
  const { mainstatCellWidthPx, substatCellWidthPx } = useMemo(() => measureStatCellWidths(t, theme), [t, theme])

  // Ref on the cutoff divider — scroll effect positions the view at the cutoff on first render.
  // Must be before any early returns (React hooks rules of hooks).
  const cutoffRef = useRef<HTMLDivElement | null>(null)

  // Focus state: when set, the list is scoped to a single count-group (the group of the candidate
  // whose focus button was toggled). null = show every candidate. Controlled when the parent passes
  // onFocusedGroupKeyChange (so focus persists across opens while the rule stays selected); otherwise
  // falls back to internal state. Held before early returns to satisfy the rules of hooks.
  const [internalFocusedGroupKey, setInternalFocusedGroupKey] = useState<string | null>(null)
  const isFocusControlled = onFocusedGroupKeyChange != null
  const focusedGroupKey = isFocusControlled ? (controlledFocusedGroupKey ?? null) : internalFocusedGroupKey
  // Single setter that routes to the parent (controlled) or local state (uncontrolled).
  const setFocusedGroupKey = (next: string | null): void => {
    if (isFocusControlled) onFocusedGroupKeyChange(next)
    else setInternalFocusedGroupKey(next)
  }

  // On first render scroll the cutoff divider to center so both kept-near-cutoff and sold items are visible.
  // Only fires when we actually have a scroll container (candidates present); ref is null otherwise.
  useEffect(() => {
    cutoffRef.current?.scrollIntoView({ behavior: 'instant', block: 'center' })
  }, [])

  if (!candidates) {
    // No detection data yet — show per-roll hints if substats are configured.
    if (substats.length === 0) {
      return <NoDataPlaceholder text={t('safeguardsCandidatesNoSubstats')} />
    }
    if (noMatchesYet) {
      return <NoDataPlaceholder text={t('safeguardsCandidatesNoData')} />
    }
    // Render per-roll contribution estimate for each selected substat.
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {substats.map((variant) => {
          const rawWeight = Number(weights[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
          const weight = normalizeGearInspectorSortWeight(rawWeight)
          // Contribution of one max-6-star roll; uses normalization constant from domain (display hint only).
          const perRoll = normalizeSubstatByMax6(variant, weight)
          return (
            <Typography key={variant} variant="caption" color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO }}>
              {t('safeguardsCandidateWeightHint', { pts: perRoll.toFixed(2) })}
            </Typography>
          )
        })}
      </Box>
    )
  }

  if (candidates.length === 0) {
    return <NoDataPlaceholder text={t('safeguardsCandidatesNoData')} />
  }

  // Resolve substat column count — use parent-computed value (max across candidates) when available,
  // fall back to the rule's selection length so the layout is still valid before detection runs.
  const resolvedSubstatColumnCount = substatColumnCount ?? Math.min(substats.length, SUBSTAT_SLOT_COUNT)

  // Suppress per-X labels that are no-ops given the selected combination filters.
  const effectiveCutoffMode = (combination && countMode)
    ? safeguardEffectiveCountModeForDisplay(combination, countMode)
    : countMode
  // Collect active per-group dimensions in display order (slot → set → faction → main).
  // suppressPerFactionInLabel hides the faction dimension from the quota label when faction is not
  // meaningful for this rule (no accessory slot targeted).
  const cutoffScopeParts: string[] = []
  if (effectiveCutoffMode?.perSlot) cutoffScopeParts.push(t('safeguardsCountModeScopeSlot'))
  if (effectiveCutoffMode?.perSet) cutoffScopeParts.push(t('safeguardsCountModeScopeSet'))
  if (effectiveCutoffMode?.perFaction && !suppressPerFactionInLabel) cutoffScopeParts.push(t('safeguardsCountModeScopeFaction'))
  if (effectiveCutoffMode?.perMainStat) cutoffScopeParts.push(t('safeguardsCountModeScopeMain'))
  const cutoffLabel = cutoffScopeParts.length > 0
    ? t('safeguardsCandidateCutoffPerGroup', { n: quota, scope: cutoffScopeParts.join(' · ') })
    : t('safeguardsCandidateCutoff', { n: quota })

  // Focus is only meaningful when at least one per-group dimension is active — otherwise every
  // candidate is one global group and a focus toggle would be a no-op. Pass null down in that case
  // so CandidateRow hides its focus button entirely.
  const groupKeyFor = (itemKey: number): string | null => {
    if (!effectiveCutoffMode) return null
    const art = artifactsByItemKey.get(itemKey)
    return art ? safeguardFocusGroupKeyFor(art, effectiveCutoffMode) : null
  }
  const focusable = effectiveCutoffMode != null && cutoffScopeParts.length > 0

  // Drop a stale focus once the active group vanishes (e.g. weights changed and re-ranked the list,
  // or the user edited the count mode) so the list never renders empty with no way back.
  const focusStillPresent = focusedGroupKey != null
    && candidates.some((c) => groupKeyFor(c.itemKey) === focusedGroupKey)
  const activeFocusKey = focusStillPresent ? focusedGroupKey : null

  // When focused, keep only the candidates in the focused group; the kept/sold split and the cutoff
  // label still apply, now reading as a clean per-group ranking.
  const inFocus = (c: SafeguardCandidateOut): boolean =>
    activeFocusKey == null || groupKeyFor(c.itemKey) === activeFocusKey
  // Split into kept (isWithinQuota) and sold (outside quota) preserving rank order.
  const kept = candidates.filter((c) => c.isWithinQuota && inFocus(c))
  const sold = candidates.filter((c) => !c.isWithinQuota && inFocus(c))

  // Toggle focus to a candidate's group, or clear it when its group is already focused. Computed
  // against the current activeFocusKey so the setter never needs the functional-updater form (which
  // the controlled path does not support).
  const toggleFocusFor = (itemKey: number): void => {
    const key = groupKeyFor(itemKey)
    setFocusedGroupKey(activeFocusKey === key ? null : key)
  }

  // Shared props for every row — `groupRankMode` switches the rank column from global candidateRank
  // to per-group bucketRank while a group is focused; improvementChanceByItemKey feeds the chance cell.
  const rowCommonProps = {
    showSlotIcons,
    showSetIcons,
    showFactionIcons,
    substats,
    weights,
    ruleAppearance,
    ruleOrdinal,
    mainstatCellWidthPx,
    substatCellWidthPx,
    substatColumnCount: resolvedSubstatColumnCount,
    substatColors: substatColors ?? {},
    useStatButtonColors: useStatButtonColors ?? false,
    groupRankMode: activeFocusKey != null,
    improvementChanceByItemKey: improvementChanceByItemKey ?? null,
    t,
    theme,
  }

  return (
    <Box sx={{ maxHeight: CANDIDATE_LIST_MAX_HEIGHT_PX, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* The focus chip lives beside the "Candidates" header (rendered by SafeguardBuilderPanel) so it
          stays visible while this list scrolls — see SafeguardFocusGroupChip. */}
      {/* All kept candidates */}
      {kept.map((candidate) => (
        <CandidateRow
          key={candidate.itemKey}
          candidate={candidate}
          artifact={artifactsByItemKey.get(candidate.itemKey)}
          previewRow={previewRowByItemKey?.get(candidate.itemKey)}
          isFiltered={visibleItemKeys != null && !visibleItemKeys.has(candidate.itemKey)}
          {...(onSelectCandidate ? { onSelectCandidate } : {})}
          {...(focusable ? { onToggleFocus: () => toggleFocusFor(candidate.itemKey) } : {})}
          isFocused={activeFocusKey != null && groupKeyFor(candidate.itemKey) === activeFocusKey}
          {...rowCommonProps}
        />
      ))}
      {/* Cutoff divider — scroll target on mount.
          Label lists active countMode dimensions so users understand why non-consecutive
          global ranks appear on the same side of the line (e.g. "quota: 2 per set · faction"). */}
      <Box ref={cutoffRef} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
        <Divider sx={{ flex: 1, borderStyle: 'dashed', borderColor: 'text.disabled' }} />
        <Typography variant="caption" color="text.disabled" sx={{ px: 0.75, whiteSpace: 'nowrap', fontSize: `${FONT_SIZE_SECONDARY_REM}rem` }}>
          {cutoffLabel}
        </Typography>
        <Divider sx={{ flex: 1, borderStyle: 'dashed', borderColor: 'text.disabled' }} />
      </Box>
      {/* All sold candidates */}
      {sold.map((candidate) => (
        <CandidateRow
          key={candidate.itemKey}
          candidate={candidate}
          artifact={artifactsByItemKey.get(candidate.itemKey)}
          previewRow={previewRowByItemKey?.get(candidate.itemKey)}
          isFiltered={visibleItemKeys != null && !visibleItemKeys.has(candidate.itemKey)}
          {...(onSelectCandidate ? { onSelectCandidate } : {})}
          {...(focusable ? { onToggleFocus: () => toggleFocusFor(candidate.itemKey) } : {})}
          isFocused={activeFocusKey != null && groupKeyFor(candidate.itemKey) === activeFocusKey}
          {...rowCommonProps}
        />
      ))}
    </Box>
  )
}

// Single candidate row: rank, compact identifier (slot/set/faction icon or text), substats sorted by
// weighted impact with roll count, score, kept/sold badge.
// Each display flag selects icon mode OR text mode — never both.
function CandidateRow({
  candidate,
  artifact,
  previewRow,
  showSlotIcons,
  showSetIcons,
  showFactionIcons,
  substats,
  weights,
  ruleAppearance,
  ruleOrdinal,
  mainstatCellWidthPx,
  substatCellWidthPx,
  substatColumnCount,
  isFiltered,
  substatColors,
  useStatButtonColors,
  onSelectCandidate,
  onToggleFocus,
  isFocused,
  groupRankMode,
  improvementChanceByItemKey,
  t,
  theme,
}: {
  candidate: SafeguardCandidateOut
  artifact: SafeguardDetectionArtifact | undefined
  previewRow: GearInspectorPreviewRow | undefined
  showSlotIcons: boolean
  showSetIcons: boolean
  showFactionIcons: boolean
  substats: StatVariant[]
  weights: Partial<Record<StatVariant, number>>
  ruleAppearance: NameAppearance | undefined
  ruleOrdinal: number | undefined
  // Uniform fixed pixel width for the mainstat cell — measured from the longest label at runtime.
  mainstatCellWidthPx: number
  // Uniform fixed pixel width for every substat cell — measured from the longest label + roll glyph.
  substatCellWidthPx: number
  // Number of substat columns to render (real cells + placeholder pads) — from parent's max-across-candidates.
  substatColumnCount: number
  // True when the artifact is hidden by the current Gear Inspector filter — renders dimmed.
  isFiltered: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onSelectCandidate?: (itemKey: number) => void
  // When provided, a per-row focus toggle is rendered; clicking scopes the list to this row's group.
  // Absent when no per-group count dimension is active (focus would be a no-op).
  onToggleFocus?: () => void
  // True when the list is currently focused on this row's group — drives the toggle's active state.
  isFocused: boolean
  // True while a group is focused — show the per-group bucketRank instead of the global candidateRank.
  groupRankMode: boolean
  // Improvement chance percent (current rule) keyed by item key — rendered left of the score.
  improvementChanceByItemKey: ReadonlyMap<number, number> | null
  t: ReturnType<typeof useI18n>['t']
  theme: Theme
}) {
  // Runtime scheme paper for contrast math — theme.palette.* is frozen to light with cssVariables.
  const { colorScheme } = useColorScheme()
  const rowSurfacePaper = resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))
  // Determine the actual outcome for this candidate.
  // When previewRow is available its match field is ground truth — use it to drive the icon.
  // Fall back to isWithinQuota only when no preview data exists (e.g. popover opened before
  // a detection run has completed).
  //   StarsIcon / warning.main       → kept by a safeguard rule (this OR another)
  //   CheckCircleIcon / success.main → kept by a recipe / SFC rule
  //   SellIcon / error.main          → explicitly sold (keep === false)
  //   no badge                       → unmatched (no rule covers this item at all)
  const isSafeguarded = previewRow
    ? previewRow.match?.keep === true && previewRow.match.ruleSource === RULE_SOURCE_SAFEGUARDS
    : candidate.isWithinQuota
  const isRecipeKept = previewRow
    ? previewRow.match?.keep === true && previewRow.match.ruleSource !== RULE_SOURCE_SAFEGUARDS
    : false
  // Unmatched: previewRow present but no match at all — not explicitly sold, just uncovered.
  const isUnmatched = previewRow != null && previewRow.match == null
  const isSold = !isSafeguarded && !isRecipeKept && !isUnmatched
  const BadgeIcon = isSafeguarded ? StarsIcon : isRecipeKept ? CheckCircleIcon : isSold ? SellIcon : null
  const badgeColor = isSafeguarded
    ? (theme.vars?.palette.warning.main ?? theme.palette.warning.main)
    : isRecipeKept ? (theme.vars?.palette.success.main ?? theme.palette.success.main) : (theme.vars?.palette.error.main ?? theme.palette.error.main)
  const badgeTitle = isSafeguarded
    ? t('safeguardsCandidateSafeguarded')
    : isRecipeKept ? t('safeguardsCandidateKept') : isSold ? t('safeguardsCandidateSold') : undefined
  // Match source: always show the actual sell-file outcome name — the recipe, safeguard rule,
  // or final-sell rule that determined the result — so keep/sell/guard rows all display their
  // real reason. Show nothing when there is no match data (unmatched or no preview yet).
  // Without preview data, fall back to the rule name only when the candidate is within quota.
  // When no preview is available fall back to the rule's own name for within-quota candidates.
  const isRuleNameSource = !previewRow && candidate.isWithinQuota
  const matchSourceRaw: string | null = previewRow
    ? (previewRow.match?.ruleSource === RULE_SOURCE_FINAL_SELL
        ? t('gearInspectorFinalSell')
        : (previewRow.match?.recipeName ?? previewRow.match?.ruleLabel ?? null))
    : (isRuleNameSource ? (ruleAppearance?.name ?? null) : null)
  // Color priority: rule appearance when no preview; recipe color then safeguard rule color when preview present.
  const rawMatchSourceColor = isRuleNameSource
    ? (ruleAppearance?.fgColor ?? theme.palette.common.white)
    : (previewRow?.match?.recipeFgColor ?? previewRow?.match?.ruleLabelFgColor ?? theme.palette.common.white)
  // Ensure user-authored colors meet WCAG AA contrast against the actual surface background.
  const matchSourceColor = ensureContrastOnBg(rawMatchSourceColor, rowSurfacePaper)
  const matchSourceDecoration = { displayName: matchSourceRaw ?? '', resolvedColor: matchSourceColor }
  // Slot: icon replaces text when showSlotIcons is on.
  const slotIconType = (showSlotIcons && artifact) ? artifactTypeIconFor(artifact.slot) : null
  const slotLabel = (!showSlotIcons && artifact) ? t(artifactTypeI18nKey(artifact.slot)) : null
  // Set: icon replaces text when showSetIcons is on.
  const setLabel = (!showSetIcons && artifact) ? artifactSetName(artifact.set) : null
  const setIconId = (showSetIcons && artifact) ? artifact.set as ArtifactSetId : null
  // Faction: only shown for accessory slots; icon replaces text when showFactionIcons is on.
  const isAccessory = artifact ? isAccessorySlot(artifact.slot) : false
  const factionId = (isAccessory && artifact) ? artifact.faction as FactionId : null
  const factionLabel = (factionId !== null && !showFactionIcons) ? t(factionI18nKey(factionId)) : null
  const identifierText = [slotLabel, setLabel, factionLabel].filter(Boolean).join(' · ')

  // Rank shown in the leading column: per-group bucketRank while a group is focused (so the column
  // reads as a clean 1..N within the group), otherwise the global candidateRank across the rule.
  const displayedRank = groupRankMode ? candidate.bucketRank : candidate.candidateRank

  // Improvement chance for the current rule on this artifact (absent → blank cell). Graded on an
  // absolute 0→100 scale from error (low) to success (high), mirroring the grid overlay's palette.
  const improvementChance = improvementChanceByItemKey?.get(candidate.itemKey) ?? null
  const improvementChanceColor = ((): string | null => {
    if (improvementChance == null) return null
    const lowRgb = parseCssColorToRgb(theme.vars?.palette.error.main ?? theme.palette.error.main) ?? { r: 220, g: 38, b: 38 }
    const highRgb = parseCssColorToRgb(theme.vars?.palette.success.main ?? theme.palette.success.main) ?? { r: 22, g: 163, b: 74 }
    // Clamp to [0,1] so out-of-range values never overshoot the mix.
    const ratio = Math.max(0, Math.min(1, improvementChance / 100))
    return ensureContrastOnBg(rgbToCss(mixRgb(lowRgb, highRgb, ratio)), rowSurfacePaper)
  })()

  // Mainstat: label + color (follows the same stat-button-color flag as substats).
  const mainStatLabel = artifact ? t(statVariantI18nKey(artifact.mainStat)) : null
  const mainStatColor = (useStatButtonColors && artifact)
    ? (adaptSubstatFgOnSurface(substatColors[artifact.mainStat]?.fg, rowSurfacePaper) ?? null)
    : null

  // Build cells for present rule substats only, sorted by weighted impact descending.
  // Impact = normalised weight × per-unit contribution for the artifact's actual substat value.
  // Absent rule substats are omitted; roll glyphs and stat-button colors apply as usual.
  const previewSubstatRollsByVariant = new Map(
    (previewRow?.artifact.substats ?? []).map((s) => [s.variant, s.rolls ?? null]),
  )
  const substatCells = substats
    .flatMap((variant) => {
      // previewRow.artifact.substats uses NormalizedStat with plain JS-number variants —
      // no BigInt concern. Detection-snapshot artifact variants may be BigInt (i64 via
      // serde_wasm_bindgen 0.6 to_js_value), so coerce with Number() when falling back.
      const previewArtSub = previewRow?.artifact.substats.find((s) => s.variant === variant)
      const detArtSub = previewArtSub == null
        ? artifact?.substats.find((s) => Number(s.variant) === variant)
        : null
      // NormalizedStat uses totalValue; SafeguardDetectionSubstat uses value.
      const artSubValue = previewArtSub?.totalValue ?? detArtSub?.value
      if (artSubValue == null) return []  // substat absent from this artifact — omit cell
      const rawWeight = Number(weights[variant] ?? GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT)
      const weight = normalizeGearInspectorSortWeight(rawWeight)
      // Impact drives the sort order; higher impact substats appear first.
      const impact = weight * normalizeSubstatByMax6(variant, artSubValue)
      const rolls = previewSubstatRollsByVariant.get(variant) ?? null
      const rollCount = (rolls !== null && rolls > 0) ? rolls : null
      // Apply stat button color when enabled; fall back to muted secondary color.
      const color = (useStatButtonColors && substatColors[variant]?.fg)
        ? (adaptSubstatFgOnSurface(substatColors[variant].fg, rowSurfacePaper) ?? null)
        : null
      // Mythic bonus is only detectable from NormalizedStat (previewRow); detection-only path has no mythValue.
      const isMythic = (previewArtSub?.mythValue ?? 0) >= MYTHIC_BONUS_MIN
      return [{ variant, label: t(statVariantI18nKey(variant)), rollCount, color, impact, isMythic }]
    })
    .sort((a, b) => b.impact - a.impact)

  const rowNode = (
    <Box
      onClick={onSelectCandidate ? () => onSelectCandidate(candidate.itemKey) : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        py: 0.2,
        px: 0.25,
        borderRadius: 0.5,
        // Row opacity emphasises candidates whose first match is specifically this rule.
        // That distinction only exists once preview data is present, so a row with no
        // previewRow yet stays fully opaque — otherwise a freshly opened popover dims every
        // row (which, with the now-muted text.secondary base colour, reads as "disabled").
        // De-emphasis floors are lifted vs the old white-text era so dimmed rows stay legible.
        // Opacity steps come from the ALPHA ladder (SSOT); full opacity stays the literal 1 (an
        // extreme, like ALPHA's literal-0 fade-out), the fractional steps snap to ladder values:
        //   no preview info          → 1     (don't pre-dim before we know the match)
        //   not filtered + this rule → 1     (primary)
        //   not filtered + other     → a82   (de-emphasised, still legible)
        //   filtered    + this rule  → a60   (filtered but notable)
        //   filtered    + other      → a45   (most dimmed)
        // Use ordinal for identity — safeguardRuleId is legacy and always null in new sessions.
        opacity: previewRow == null
          ? 1
          : (previewRow.match?.ruleSource === RULE_SOURCE_SAFEGUARDS && previewRow.match.safeguardRuleOrdinal === ruleOrdinal)
            ? (isFiltered ? ALPHA.a60 : 1)
            : (isFiltered ? ALPHA.a45 : ALPHA.a82),
        cursor: onSelectCandidate ? 'pointer' : 'default',
        '&:hover': { bgcolor: TINT.neutralRowZebra },
      }}
    >
      {/* Rank number */}
      <Typography
        variant="caption"
        sx={{
          fontFamily: FONT_FAMILY_MONO,
          fontSize: `${FONT_SIZE_SECONDARY_REM}rem`,
          color: 'text.secondary',
          minWidth: 42,  // "#1000" = 5 chars at monospace 0.75rem ≈ 38px
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {displayedRank > 0 ? `#${displayedRank}` : '—'}
      </Typography>
      {/* Compact identifier: slot icon OR nothing (text goes in identifierText below),
          set icon, faction icon — all flex-shrink-0, no growing. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
        {/* Slot: icon uses createElement to avoid "component created during render" lint rule.
            Color follows rarity accent palette so rarity is visible at a glance. */}
        {showSlotIcons && (
          <Box
            sx={{
              color: resolveRarityTextColor(artifact?.rarity, rowSurfacePaper) ?? 'text.secondary',
              lineHeight: 0,
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {slotIconType ? createElement(slotIconType, { fontSize: 'small' }) : null}
          </Box>
        )}
        {setIconId && (
          <SetIcon setId={setIconId} size={14} sx={{ mr: 0, display: 'block' }} />
        )}
        {/* FactionIcon at size 14 (natural render size 19px with halo); no sx override to avoid clipping. */}
        {factionId !== null && showFactionIcons && (
          <FactionIcon faction={factionId} size={14} />
        )}
        {identifierText && (
          <Typography
            variant="caption"
            noWrap
            sx={{ fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, maxWidth: 88, color: 'text.secondary' }}
          >
            {identifierText}
          </Typography>
        )}
        {!artifact && (
          <Typography variant="caption" sx={{ fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, color: 'text.disabled' }}>—</Typography>
        )}
      </Box>
      {/* Mainstat + substats sorted by weighted impact descending (highest-scoring substat first).
          The container sizes to its content (flex: none). A flex-1 spacer after it pushes
          score/badge/match to the right edge, keeping them aligned across all rows regardless
          of how many substats an artifact has. */}
      <Box sx={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 0.25 }}>
        {mainStatLabel && (
          <Typography
            variant="caption"
            noWrap
            sx={{
              fontSize: `${FONT_SIZE_SECONDARY_REM}rem`,
              color: mainStatColor ?? 'text.secondary',
              width: mainstatCellWidthPx,
              flexGrow: 0,
              flexShrink: 0,
              textAlign: 'left',
              // Extra right margin separates mainstat from the first substat cell visually.
              mr: 0.75,
            }}
          >
            {mainStatLabel}
          </Typography>
        )}
        {substatCells.map((cell) => (
          // EllipsisTooltip shows an OS tooltip with the full label when the cell clips to ellipsis.
          <EllipsisTooltip key={cell.variant} title={cell.label} wrap="inline">
            <Typography
              variant="caption"
              noWrap
              sx={{
                fontSize: `${FONT_SIZE_SECONDARY_REM}rem`,
                color: cell.color ?? 'text.secondary',
                // Fixed width so every column is identically wide.
                // flexGrow: 0 + flexShrink: 0 prevents flex from resizing the cell.
                width: substatCellWidthPx,
                flexGrow: 0,
                flexShrink: 0,
                textAlign: 'left',
                // noWrap sets overflow:hidden which clips the child span's box-shadow.
                // Override to visible for mythic cells — labels are short and won't overflow.
                ...(cell.isMythic ? { overflow: 'visible' } : undefined),
              }}
            >
              {/* Mythic bonus: red glow + tint + rounded corners scoped to label+glyph only,
                  mirrors GearInspectorGridCard. Inline span keeps the highlight tight to the text. */}
              <Box
                component="span"
                sx={cell.isMythic ? {
                  boxShadow: `0 0 ${MYTHIC_SUBSTAT_SHADOW_BLUR_PX}px ${MYTHIC_SUBSTAT_SHADOW_SPREAD_PX}px ${(theme.vars?.palette.error.main ?? theme.palette.error.main)}`,
                  backgroundColor: alpha(theme.palette.error.main, MYTHIC_SUBSTAT_BG_ALPHA),
                  borderRadius: `${MYTHIC_SUBSTAT_RADIUS_PX}px`,
                } : undefined}
              >
                {cell.label}
                {/* Roll-count badge: circle + digit use the ambient text.primary, NOT the substat
                    cell color — matching GearInspectorGridCard, where the badge sits outside the
                    stat-color span and inherits the card's default text color. */}
                {cell.rollCount != null && (
                  <Box component="span" sx={{ color: 'text.primary' }}>
                    <CircledDigitBadge value={cell.rollCount} />
                  </Box>
                )}
              </Box>
            </Typography>
          </EllipsisTooltip>
        ))}
        {/* Empty placeholder cells to pad up to substatColumnCount (max matching substats across candidates).
            Keeps every row the same column width so the score/badge/match columns stay aligned. */}
        {Array.from({ length: substatColumnCount - substatCells.length }, (_, i) => (
          <Box key={`ph-${i}`} sx={{ width: substatCellWidthPx, flexShrink: 0, flexGrow: 0 }} />
        ))}
      </Box>
      {/* Improvement chance: fixed-width column immediately left of the score, colour-graded
          low→high. Blank when no chance is known for this artifact under the current rule. */}
      <Typography
        variant="caption"
        sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, color: improvementChanceColor ?? 'text.secondary', flexShrink: 0, width: 40, textAlign: 'right' }}
      >
        {improvementChance != null ? `${Math.round(improvementChance)}%` : ''}
      </Typography>
      {/* Score */}
      {/* Score: fixed width + right-align so the column stays consistent across all rows.
          Always rendered (empty when unranked) so badge/match don't shift. */}
      <Typography
        variant="caption"
        sx={{ fontFamily: FONT_FAMILY_MONO, fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, color: 'text.primary', flexShrink: 0, width: 48, textAlign: 'right' }}
      >
        {candidate.candidateRank > 0 ? candidate.score.toFixed(2) : ''}
      </Typography>
      {/* Outcome badge: icon mirrors the Gear Inspector summary chip (Stars/CheckCircle/Sell).
          Unmatched items render an empty placeholder so columns stay aligned. */}
      <Box title={badgeTitle} sx={{ color: badgeColor, lineHeight: 0, flexShrink: 0, display: 'flex', alignItems: 'center', width: 14 }}>
        {BadgeIcon && <BadgeIcon sx={{ fontSize: 14 }} />}
      </Box>
      {/* Match source: rule or recipe name that explains the outcome.
          Parsed for [rrggbb] color directives; white by default. Truncates with ellipsis + OS title. */}
      <Typography
        component="span"
        variant="caption"
        title={matchSourceDecoration.displayName || undefined}
        sx={[ELLIPSIS_TEXT_SX, {
          fontSize: `${FONT_SIZE_MATCH_SOURCE_REM}rem`,
          // Use parsed directive color (white fallback) instead of muted text.disabled.
          color: matchSourceDecoration.resolvedColor,
          fontWeight: 400,
          // Fills remaining row space, capped at 4× the substat cell width so
          // the column never dwarfs the stat columns on wide rows.
          flex: 1,
          minWidth: 0,
          maxWidth: substatCellWidthPx * 4,
        }]}
      >
        {matchSourceDecoration.displayName}
      </Typography>
      {/* Per-row focus toggle: scopes the list to this candidate's count-group. Wrapped in a styled
          MUI Tooltip with a matching aria-label — the same pattern as the Gear Inspector group
          select/clear icon buttons. stopPropagation keeps the row's select-in-grid click from also
          firing. Rendered only when grouping is active (onToggleFocus provided). */}
      {onToggleFocus && (
        <Tooltip title={isFocused ? t('safeguardsCandidateFocusClear') : t('safeguardsCandidateFocusGroup')}>
          <IconButton
            size="small"
            aria-pressed={isFocused}
            aria-label={isFocused ? t('safeguardsCandidateFocusClear') : t('safeguardsCandidateFocusGroup')}
            onClick={(e) => { e.stopPropagation(); onToggleFocus() }}
            sx={{
              flexShrink: 0,
              p: 0,
              width: 18,
              height: 18,
              // Active focus reads in the primary accent; inactive sits muted so it never competes
              // with the outcome badge or stat colours.
              color: isFocused ? 'primary.main' : 'text.disabled',
            }}
          >
            <FilterCenterFocusIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )

  // Wrap in a tooltip showing a scaled Gear Inspector card when preview data is available.
  if (previewRow) {
    return (
      <MarkdownTooltip
        render={
          <CandidateCardPreview
            row={previewRow}
            substatColors={substatColors}
            useStatButtonColors={useStatButtonColors}
          />
        }
      >
        {rowNode}
      </MarkdownTooltip>
    )
  }
  return rowNode
}

// Scaled GearInspectorGridCard rendered inside the candidate row hover tooltip.
// Defined at module level (not created during render) so the lint rule does not flag it.
function CandidateCardPreview({
  row,
  substatColors,
  useStatButtonColors,
}: {
  row: GearInspectorPreviewRow
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}) {
  const theme = useTheme()
  const cardSizing = getGearInspectorGridCardSizing(theme, CANDIDATE_CARD_COLUMN_COUNT, {
    showFirstMatchRow: false,
    showOtherMatchesRow: false,
  })
  const scale = CANDIDATE_CARD_SCALE
  // Clip box is sized to the scaled card so the tooltip balloon fits snugly.
  const scaledW = Math.ceil(cardSizing.minWidthPx * scale)
  const scaledH = Math.ceil(cardSizing.cardHeightPx * scale)
  return (
    <Box
      sx={{
        width: scaledW, height: scaledH, overflow: 'hidden', borderRadius: 1,
        ...theme.applyStyles('light', { filter: 'brightness(0.92)' }),
      }}
    >
      <Box
        sx={{
          width: cardSizing.minWidthPx,
          height: cardSizing.cardHeightPx,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <GearInspectorGridCard
          row={row}
          substatColors={substatColors}
          useStatButtonColors={useStatButtonColors}
          suppressMatchDetails={false}
          showFirstMatchRow={false}
          showOtherMatchesRow={false}
          showMatchRecipeIndex={false}
          showMatchLineNumber={false}
          showChampionIcons={true}
          cardHeightPx={cardSizing.cardHeightPx}
          gridColumnCount={CANDIDATE_CARD_COLUMN_COUNT}
          recipeNames={EMPTY_RECIPE_NAMES}
          cardPriority={{ base: CARD_PRIORITY_BASE, order: 0 }}
        />
      </Box>
    </Box>
  )
}

// Simple centered placeholder text for empty states.
function NoDataPlaceholder({ text }: { text: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
      <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', whiteSpace: 'pre-line' }}>
        {text}
      </Typography>
    </Box>
  )
}
