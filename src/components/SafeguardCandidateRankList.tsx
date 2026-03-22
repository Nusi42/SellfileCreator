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
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import SellIcon from '@mui/icons-material/Sell'
import StarsIcon from '@mui/icons-material/Stars'
import { ELLIPSIS_TEXT_SX } from '../lib/constants'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import { createElement, useEffect, useRef } from 'react'
import type { SafeguardCandidateOut, SafeguardDetectionArtifact } from '../lib/safeguards'
import { normalizeSubstatByMax6 } from '../lib/substatRollNormalization'
import { artifactSetName, artifactTypeI18nKey, factionI18nKey, statVariantI18nKey, type StatVariant, type ArtifactSetId, type FactionId } from '../lib/types'
import { isAccessorySlot } from '../lib/gearInspectorDomain'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from '../lib/gearInspectorSort'
import { formatCircledDigit } from '../lib/gearInspectorPreviewFormatting'
import { resolveRarityAccentColor } from '../lib/rarityColors'
import { useI18n } from '../lib/i18n'
import { RULE_SOURCE_SAFEGUARDS } from '../lib/ruleSources'
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { GearInspectorGridCard, getGearInspectorGridCardSizing } from './GearInspectorGridCard'
import { GEAR_DB_DIFF_TOAST_CARD_SCALE, CHAMPION_ICON_LARGE_THRESHOLD } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'

// Scrollable container height — fits comfortably inside the 460px right column.
const CANDIDATE_LIST_MAX_HEIGHT_PX = 380
// Card preview uses the same column profile and scale factor as the db-update-history toast.
const CANDIDATE_CARD_COLUMN_COUNT = CHAMPION_ICON_LARGE_THRESHOLD
const CANDIDATE_CARD_SCALE = GEAR_DB_DIFF_TOAST_CARD_SCALE
const EMPTY_RECIPE_NAMES: string[] = []
const CARD_PRIORITY_BASE = 0

export type SafeguardCandidateRankListProps = {
  // Scored candidates from detection snapshot or live preview, sorted by rank ascending.
  // When undefined: show hint mode.
  candidates: SafeguardCandidateOut[] | undefined
  // Quota for the rule — used to draw the cutoff line and count kept items.
  quota: number
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
}: SafeguardCandidateRankListProps) {
  const { t } = useI18n()
  const theme = useTheme()

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
          isFiltered={visibleItemKeys != null && !visibleItemKeys.has(candidate.itemKey)}
          {...(onSelectCandidate ? { onSelectCandidate } : {})}
          substatColors={substatColors ?? {}}
          useStatButtonColors={useStatButtonColors ?? false}
          t={t}
          theme={theme}
        />
      ))}
      {/* Cutoff divider — scroll target on mount */}
      <Box ref={cutoffRef} sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
        <Divider sx={{ flex: 1, borderStyle: 'dashed', borderColor: 'text.disabled' }} />
        <Typography variant="caption" color="text.disabled" sx={{ px: 0.75, whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
          {t('safeguardsCandidateCutoff', { n: quota })}
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
  // True when the artifact is hidden by the current Gear Inspector filter — renders dimmed.
  isFiltered: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onSelectCandidate?: (itemKey: number) => void
  t: ReturnType<typeof useI18n>['t']
  theme: Theme
}) {
  // Determine the actual outcome for this candidate:
  //   safeguardedByThis  → isWithinQuota (kept by this specific rule's quota)
  //   safeguardedByOther → not in this quota, but another safeguard rule keeps it
  //   recipeKept         → not safeguarded, but a recipe/SFR rule keeps it
  //   sold               → nothing keeps it
  const isSafeguardedByThis = candidate.isWithinQuota
  const isSafeguardedByOther = !isSafeguardedByThis
    && previewRow?.match?.ruleSource === RULE_SOURCE_SAFEGUARDS
  const isSafeguarded = isSafeguardedByThis || isSafeguardedByOther
  const isRecipeKept = !isSafeguarded && previewRow?.match?.keep === true
  // Icon + color mirrors the Gear Inspector summary chip:
  //   StarsIcon / warning.main       → safeguarded (this OR another safeguard rule)
  //   CheckCircleIcon / success.main → recipe-kept (not safeguarded but a recipe keeps it)
  //   SellIcon / error.main          → sold (no rule or safeguard keeps it)
  const BadgeIcon = isSafeguarded ? StarsIcon : isRecipeKept ? CheckCircleIcon : SellIcon
  const badgeColor = isSafeguarded
    ? theme.palette.warning.main
    : isRecipeKept ? theme.palette.success.main : theme.palette.error.main
  const badgeTitle = isSafeguarded
    ? t('safeguardsCandidateSafeguarded')
    : isRecipeKept ? t('safeguardsCandidateKept') : t('safeguardsCandidateSold')
  // Match source: always show the actual sell-file first match (recipe/safeguard/rule label)
  // so users can identify which entry drove the outcome.
  // For items kept by this rule's quota with no previewRow match, fall back to the rule name.
  const matchSource: string | null =
    previewRow?.match?.recipeName
    ?? previewRow?.match?.ruleLabel
    ?? (isSafeguardedByThis ? (ruleName ?? null) : null)
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
      return [{ variant, label: t(statVariantI18nKey(variant)), rollGlyph, color, impact }]
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
        // Dim rows hidden by the active Gear Inspector filter so users can still see them
        // but understand they are outside the current view.
        opacity: isFiltered ? 0.4 : 1,
        cursor: onSelectCandidate ? 'pointer' : 'default',
        '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) },
      }}
    >
      {/* Rank number */}
      <Typography
        variant="caption"
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.7rem',
          color: 'text.disabled',
          minWidth: 38,  // "#1000" = 5 chars at monospace 0.7rem ≈ 34px
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
            sx={{ fontSize: '0.68rem', maxWidth: 88, color: 'text.secondary' }}
          >
            {identifierText}
          </Typography>
        )}
        {!artifact && (
          <Typography variant="caption" sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>—</Typography>
        )}
      </Box>
      {/* Mainstat + substats sorted by weighted impact descending (highest-scoring substat first).
          Each present substat gets its own cell; absent substats are omitted entirely.
          minWidth is computed from actual content so the flex-1 box cannot be crushed to 0 when
          fixed siblings (rank, identifier, score, badge) fill the container. */}
      <Box sx={{
        flex: 1,
        minWidth: (mainStatLabel ? 40 : 0) + 44 * substatCells.length,
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        overflow: 'hidden',
      }}>
        {mainStatLabel && (
          <Typography
            variant="caption"
            noWrap
            sx={{ fontSize: '0.65rem', color: mainStatColor ?? 'text.secondary', minWidth: 40, flexShrink: 0, textAlign: 'left' }}
          >
            {mainStatLabel}
          </Typography>
        )}
        {substatCells.map((cell) => (
          <Typography
            key={cell.variant}
            variant="caption"
            noWrap
            sx={{ fontSize: '0.65rem', color: cell.color ?? 'text.secondary', minWidth: 44, flexShrink: 0, textAlign: 'left' }}
          >
            {cell.label}
            {/* Roll count glyph uses white to match gear inspector card chip rendering. */}
            {cell.rollGlyph && (
              <Box component="span" sx={{ color: 'common.white' }}>{cell.rollGlyph}</Box>
            )}
          </Typography>
        ))}
      </Box>
      {/* Score */}
      {candidate.candidateRank > 0 && (
        <Typography
          variant="caption"
          sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'text.secondary', flexShrink: 0 }}
        >
          {candidate.score.toFixed(2)}
        </Typography>
      )}
      {/* Outcome badge: icon mirrors the Gear Inspector summary chip (Stars/CheckCircle/Sell). */}
      <Box title={badgeTitle} sx={{ color: badgeColor, lineHeight: 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <BadgeIcon sx={{ fontSize: 14 }} />
      </Box>
      {/* Match source: rule or recipe name that explains the outcome; truncates with ellipsis + OS title */}
      <Typography
        component="span"
        variant="caption"
        title={matchSource ?? undefined}
        sx={[ELLIPSIS_TEXT_SX, { fontSize: '0.6rem', color: 'text.disabled', width: 130, flexShrink: 0 }]}
      >
        {matchSource ?? ''}
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
