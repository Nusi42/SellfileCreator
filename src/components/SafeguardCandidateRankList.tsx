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
import { Box, Divider, Typography } from '@mui/material'
import EllipsisTooltip from './EllipsisTooltip'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SellIcon from '@mui/icons-material/Sell'
import StarsIcon from '@mui/icons-material/Stars'
import { ELLIPSIS_TEXT_SX, FONT_SIZE_SECONDARY_REM } from '../lib/constants'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import { createElement, useEffect, useMemo, useRef } from 'react'
import type { SafeguardCandidateOut, SafeguardDetectionArtifact } from '../lib/safeguards'
import { normalizeSubstatByMax6 } from '../lib/substatRollNormalization'
import { artifactSetName, artifactTypeI18nKey, factionI18nKey, statVariantI18nKey, STAT_VARIANTS_PRIORITY, type StatVariant, type ArtifactSetId, type FactionId } from '../lib/types'
import { isAccessorySlot } from '../lib/gearInspectorDomain'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from '../lib/gearInspectorSort'
import { SUBSTAT_SLOT_COUNT } from '../lib/generated/domainConstants'
import { formatCircledDigit } from '../lib/gearInspectorPreviewFormatting'
import { resolveRarityAccentColor } from '../lib/rarityColors'
import { useI18n } from '../lib/i18n'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_SAFEGUARDS } from '../lib/ruleSources'
import type { SafeguardRuleCountMode } from '../lib/safeguards'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { GearInspectorGridCard, getGearInspectorGridCardSizing } from './GearInspectorGridCard'
import { GEAR_DB_DIFF_TOAST_CARD_SCALE, CHAMPION_ICON_LARGE_THRESHOLD } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'

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
  // ④ is the widest circled-digit glyph; appended to every substat sample so the cell
  // always has room for the label + roll count without clipping.
  const rollGlyph = formatCircledDigit(4) ?? ''
  let maxMainstat = 0
  let maxSubstat = 0
  for (const variant of STAT_VARIANTS_PRIORITY) {
    const label = t(statVariantI18nKey(variant))
    maxMainstat = Math.max(maxMainstat, ctx.measureText(label).width)
    maxSubstat = Math.max(maxSubstat, ctx.measureText(label + rollGlyph).width)
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
const MYTHIC_SUBSTAT_BG_ALPHA = 0.12
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
  // Name of the current safeguard rule — shown as the match source label when a candidate
  // is kept by this safeguard (isWithinQuota = true).
  ruleName?: string
  // 1-based ordinal of the current safeguard rule — used for identity comparisons.
  // Replaces the old ruleOrdinal approach now that SafeguardRule carries no id field.
  ruleOrdinal?: number
  // Number of substat columns to render per row (real cells + placeholder pads).
  // Computed by the parent from the max matching substats across candidates; falls back to
  // min(substats.length, SUBSTAT_SLOT_COUNT) when not provided.
  substatColumnCount?: number
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
  ruleName,
  ruleOrdinal,
  countMode,
  substatColumnCount,
}: SafeguardCandidateRankListProps) {
  const { t } = useI18n()
  const theme = useTheme()

  // Uniform fixed widths for mainstat and substat cells — measured once across ALL stat variants
  // so column widths are consistent regardless of which substats the current rule selects.
  const { mainstatCellWidthPx, substatCellWidthPx } = useMemo(() => measureStatCellWidths(t, theme), [t, theme])

  // Ref on the cutoff divider — scroll effect positions the view at the cutoff on first render.
  // Must be before any early returns (React hooks rules of hooks).
  const cutoffRef = useRef<HTMLDivElement | null>(null)

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
            <Typography key={variant} variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
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

  // Split into kept (isWithinQuota) and sold (outside quota) preserving rank order.
  const kept = candidates.filter((c) => c.isWithinQuota)
  const sold = candidates.filter((c) => !c.isWithinQuota)

  return (
    <Box sx={{ maxHeight: CANDIDATE_LIST_MAX_HEIGHT_PX, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* All kept candidates */}
      {kept.map((candidate) => (
        <CandidateRow
          key={candidate.itemKey}
          candidate={candidate}
          artifact={artifactsByItemKey.get(candidate.itemKey)}
          previewRow={previewRowByItemKey?.get(candidate.itemKey)}
          showSlotIcons={showSlotIcons}
          showSetIcons={showSetIcons}
          showFactionIcons={showFactionIcons}
          substats={substats}
          weights={weights}
          ruleName={ruleName}
          ruleOrdinal={ruleOrdinal}
          mainstatCellWidthPx={mainstatCellWidthPx}
          substatCellWidthPx={substatCellWidthPx}
          substatColumnCount={resolvedSubstatColumnCount}
          isFiltered={visibleItemKeys != null && !visibleItemKeys.has(candidate.itemKey)}
          {...(onSelectCandidate ? { onSelectCandidate } : {})}
          substatColors={substatColors ?? {}}
          useStatButtonColors={useStatButtonColors ?? false}
          t={t}
          theme={theme}
        />
      ))}
      {/* Cutoff divider — scroll target on mount.
          Label lists active countMode dimensions so users understand why non-consecutive
          global ranks appear on the same side of the line (e.g. "quota: 2 per set · faction"). */}
      <Box ref={cutoffRef} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
        <Divider sx={{ flex: 1, borderStyle: 'dashed', borderColor: 'text.disabled' }} />
        <Typography variant="caption" color="text.disabled" sx={{ px: 0.75, whiteSpace: 'nowrap', fontSize: `${FONT_SIZE_SECONDARY_REM}rem` }}>
          {(() => {
            // Collect active per-group dimensions in display order (slot → set → faction → main).
            const scopeParts: string[] = []
            if (countMode?.perSlot) scopeParts.push(t('safeguardsCountModeScopeSlot'))
            if (countMode?.perSet) scopeParts.push(t('safeguardsCountModeScopeSet'))
            if (countMode?.perFaction) scopeParts.push(t('safeguardsCountModeScopeFaction'))
            if (countMode?.perMainStat) scopeParts.push(t('safeguardsCountModeScopeMain'))
            return scopeParts.length > 0
              ? t('safeguardsCandidateCutoffPerGroup', { n: quota, scope: scopeParts.join(' · ') })
              : t('safeguardsCandidateCutoff', { n: quota })
          })()}
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
          showSlotIcons={showSlotIcons}
          showSetIcons={showSetIcons}
          showFactionIcons={showFactionIcons}
          substats={substats}
          weights={weights}
          ruleName={ruleName}
          ruleOrdinal={ruleOrdinal}
          mainstatCellWidthPx={mainstatCellWidthPx}
          substatCellWidthPx={substatCellWidthPx}
          substatColumnCount={resolvedSubstatColumnCount}
          isFiltered={visibleItemKeys != null && !visibleItemKeys.has(candidate.itemKey)}
          {...(onSelectCandidate ? { onSelectCandidate } : {})}
          substatColors={substatColors ?? {}}
          useStatButtonColors={useStatButtonColors ?? false}
          t={t}
          theme={theme}
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
  ruleName,
  ruleOrdinal,
  mainstatCellWidthPx,
  substatCellWidthPx,
  substatColumnCount,
  isFiltered,
  substatColors,
  useStatButtonColors,
  onSelectCandidate,
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
  ruleName: string | undefined
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
  t: ReturnType<typeof useI18n>['t']
  theme: Theme
}) {
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
    ? theme.palette.warning.main
    : isRecipeKept ? theme.palette.success.main : theme.palette.error.main
  const badgeTitle = isSafeguarded
    ? t('safeguardsCandidateSafeguarded')
    : isRecipeKept ? t('safeguardsCandidateKept') : isSold ? t('safeguardsCandidateSold') : undefined
  // Match source: always show the actual sell-file outcome name — the recipe, safeguard rule,
  // or final-sell rule that determined the result — so keep/sell/guard rows all display their
  // real reason. Show nothing when there is no match data (unmatched or no preview yet).
  // Without preview data, fall back to the rule name only when the candidate is within quota.
  const matchSourceRaw: string | null = previewRow
    ? (previewRow.match?.ruleSource === RULE_SOURCE_FINAL_SELL
        ? t('gearInspectorFinalSell')
        : (previewRow.match?.recipeName ?? previewRow.match?.ruleLabel ?? null))
    : (candidate.isWithinQuota ? (ruleName ?? null) : null)
  // Parse [rrggbb] color directives from the match source for colored display.
  // White is the default text color so names without a directive stand out on the dark row background.
  const matchSourceDecoration = parseRecipeNameDirectives(matchSourceRaw ?? undefined, theme.palette.common.white)
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

  // Mainstat: label + color (follows the same stat-button-color flag as substats).
  const mainStatLabel = artifact ? t(statVariantI18nKey(artifact.mainStat)) : null
  const mainStatColor = (useStatButtonColors && artifact)
    ? (substatColors[artifact.mainStat]?.fg ?? null)
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
      const rollGlyph = rolls !== null && rolls > 0 ? formatCircledDigit(rolls) : null
      // Apply stat button color when enabled; fall back to muted secondary color.
      const color = (useStatButtonColors && substatColors[variant]?.fg) ? substatColors[variant].fg : null
      // Mythic bonus is only detectable from NormalizedStat (previewRow); detection-only path has no mythValue.
      const isMythic = (previewArtSub?.mythValue ?? 0) >= MYTHIC_BONUS_MIN
      return [{ variant, label: t(statVariantI18nKey(variant)), rollGlyph, color, impact, isMythic }]
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
        // Four-level opacity based on filter state and whether this row's first match is
        // specifically this safeguard rule:
        //   not filtered + this rule  → 1.0  (primary)
        //   not filtered + other      → 0.75 (secondary, but still unfiltered)
        //   filtered    + this rule   → 0.55 (filtered but notable)
        //   filtered    + other       → 0.4  (most dimmed)
        opacity: (() => {
          // Use ordinal for identity — safeguardRuleId is legacy and always null in new sessions.
          const isThisRule = previewRow?.match?.ruleSource === RULE_SOURCE_SAFEGUARDS && previewRow.match.safeguardRuleOrdinal === ruleOrdinal
          return isFiltered ? (isThisRule ? 0.55 : 0.4) : (isThisRule ? 1.0 : 0.75)
        })(),
        cursor: onSelectCandidate ? 'pointer' : 'default',
        '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) },
      }}
    >
      {/* Rank number */}
      <Typography
        variant="caption"
        sx={{
          fontFamily: 'monospace',
          fontSize: `${FONT_SIZE_SECONDARY_REM}rem`,
          color: 'common.white',
          minWidth: 42,  // "#1000" = 5 chars at monospace 0.75rem ≈ 38px
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {candidate.candidateRank > 0 ? `#${candidate.candidateRank}` : '—'}
      </Typography>
      {/* Compact identifier: slot icon OR nothing (text goes in identifierText below),
          set icon, faction icon — all flex-shrink-0, no growing. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
        {/* Slot: icon uses createElement to avoid "component created during render" lint rule.
            Color follows rarity accent palette so rarity is visible at a glance. */}
        {showSlotIcons && (
          <Box
            sx={{
              color: resolveRarityAccentColor(artifact?.rarity) ?? 'text.secondary',
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
                  boxShadow: `0 0 ${MYTHIC_SUBSTAT_SHADOW_BLUR_PX}px ${MYTHIC_SUBSTAT_SHADOW_SPREAD_PX}px ${theme.palette.error.main}`,
                  backgroundColor: alpha(theme.palette.error.main, MYTHIC_SUBSTAT_BG_ALPHA),
                  borderRadius: `${MYTHIC_SUBSTAT_RADIUS_PX}px`,
                } : undefined}
              >
                {cell.label}
                {/* Roll count glyph uses white to match gear inspector card chip rendering. */}
                {cell.rollGlyph && (
                  <Box component="span" sx={{ color: 'common.white' }}>{cell.rollGlyph}</Box>
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
      {/* Score */}
      {/* Score: fixed width + right-align so the column stays consistent across all rows.
          Always rendered (empty when unranked) so badge/match don't shift. */}
      <Typography
        variant="caption"
        sx={{ fontFamily: 'monospace', fontSize: `${FONT_SIZE_SECONDARY_REM}rem`, color: 'common.white', flexShrink: 0, width: 48, textAlign: 'right' }}
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
    <Box sx={{ width: scaledW, height: scaledH, overflow: 'hidden', borderRadius: 1 }}>
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
