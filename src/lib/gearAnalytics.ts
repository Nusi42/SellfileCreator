/**
 * gearAnalytics.ts
 *
 * Pure aggregation functions for the Gear Analytics analytics tab.
 * No React, no side effects — operates on a snapshot of GearInspectorPreviewRow[].
 */
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { RULE_SOURCE_SAFEGUARDS } from './ruleSources'
import {
  determineGearInspectorSourceCategory,
  type GearInspectorSourceFilter,
} from './rulesFilter'
import { isAccessorySlot, isDegenerateImprovChance } from './gearInspectorDomain'
import { hasAnomalousSubstat } from './anomalousAccessories'
import {
  artifactTypeNames,
  artifactTypeI18nKey,
  rarityRankValueI18nKey,
  statVariantI18nKey,
  getLocalizedGearSetName,
  PREFERRED_ARTIFACT_TYPE_ORDER,
  STAT_VARIANTS_PRIORITY,
  ANOMALOUS_SUBSTAT_VARIANTS,
  StatVariant,
  labelOfVariant,
  rarityCodeFromRankValue,
  rarityNames,
  artifactSetNames,
} from './types'
import { ACCESSORY_NO_SET_ID } from './constants'
import type { StatVariantLike } from './types'

// Re-export so Gear Analytics components have a single import source for label i18n helpers.
export { artifactTypeI18nKey, rarityRankValueI18nKey, statVariantI18nKey, getLocalizedGearSetName }

// ── Outcome classification ────────────────────────────────────────────────────

/**
 * The four possible outcomes for a gear item in the Gear Analytics.
 * 'none' distinguishes truly unmatched items (no rule triggered) from 'keep'
 * (explicit keep rule matched), giving users visibility into unevaluated gear.
 */
export type GearAnalyticsOutcome = 'sell' | 'keep' | 'safe' | 'none'

/** Classify a row into its outcome bucket. */
export function rowOutcome(row: GearInspectorPreviewRow): GearAnalyticsOutcome {
  // No rule matched at all — item is unmatched (default keep by the app).
  if (row.match === null) return 'none'
  // Explicit sell match: keep=false means sell.
  if (row.match.keep === false) return 'sell'
  // Safeguard keep: ruleSource tags rows injected by safeguard rules.
  if (row.match.ruleSource === RULE_SOURCE_SAFEGUARDS) return 'safe'
  // Explicit keep rule matched.
  return 'keep'
}

// ── Cross-filter state ────────────────────────────────────────────────────────

/** Re-export source category type so components don't need to import from rulesFilter directly. */
export type { GearInspectorSourceFilter as GearAnalyticsSource }

/** Dimension selections for the cross-filter dashboard state. */
export type GearAnalyticsDim = {
  /** Selected slot IDs (ArtifactTypeId). Empty = no slot filter. */
  slots: ReadonlySet<number>
  /** Selected star ranks (1–6). Empty = no rank filter. */
  ranks: ReadonlySet<number>
  /** Selected rarity values (RankValue 1-6). Empty = no rarity filter. */
  rarities: ReadonlySet<number>
  /** Selected set IDs (ArtifactSetId). Empty = no set filter. */
  sets: ReadonlySet<number>
  /** Selected result labels (sell / keep / safe). Empty = no result filter. */
  outcomes: ReadonlySet<GearAnalyticsOutcome>
  /** Selected source categories. Empty = no source filter. */
  sources: ReadonlySet<GearInspectorSourceFilter>
  /** Selected gear level milestones (0, 4, 8, 12, 16). Empty = no level filter. */
  levels: ReadonlySet<number>
  /** Selected main stat variant IDs. Empty = no main stat filter. */
  mainStats: ReadonlySet<number>
  /**
   * Selected improvement-chance histogram bin indices (see IMPROVEMENT_CHANCE_BINS).
   * Empty = no improvement-chance filter. Filtering this dimension requires the
   * per-artifact chance map (see applyGearAnalyticsFilter's chanceByArtifactId arg).
   */
  improvChanceBins: ReadonlySet<number>
}

/** Canonical empty dim: all charts unfiltered. */
export const EMPTY_GEAR_ANALYTICS_DIM: GearAnalyticsDim = {
  slots: new Set(),
  ranks: new Set(),
  rarities: new Set(),
  sets: new Set(),
  outcomes: new Set(),
  sources: new Set(),
  levels: new Set(),
  mainStats: new Set(),
  improvChanceBins: new Set(),
}

/** SVG icon asset for a source category — used on arc centroids in the Source donut. */
const SOURCE_ICON_ASSET: Partial<Record<GearInspectorSourceFilter, { viewBox: string; path: string }>> = {
  // No icon for inventory — it is the default/implicit source.
  // Person silhouette — champion collection.
  collection: { viewBox: '0 0 24 24', path: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  // Safe / strongbox — secured vault storage.
  vault:      { viewBox: '0 0 24 24', path: 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h12v16zm-5-9c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zm-1-5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z' },
  // Mailbox — items waiting in inbox.
  inbox:      { viewBox: '0 0 24 24', path: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z' },
  // Pencil — manually / custom-added gear.
  manual:     { viewBox: '0 0 24 24', path: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
}

/** Return the SVG icon asset for a source category, or null for unknown values. */
export function sourceIconSvgAsset(id: number | string): { viewBox: string; path: string } | null {
  return SOURCE_ICON_ASSET[id as GearInspectorSourceFilter] ?? null
}

/**
 * Return true if any dimension in `dim` has at least one selection.
 * Used to decide whether to render the cross-filter chip bar.
 */
export function isGearAnalyticsDimActive(dim: GearAnalyticsDim): boolean {
  // Check each dimension set for non-empty state.
  return (
    dim.slots.size > 0 || dim.ranks.size > 0 || dim.rarities.size > 0 || dim.sets.size > 0 ||
    dim.outcomes.size > 0 || dim.sources.size > 0 || dim.levels.size > 0 || dim.mainStats.size > 0 ||
    dim.improvChanceBins.size > 0
  )
}

// ── Improvement chance histogram ────────────────────────────────────────────────

/**
 * Decile bin edges for the improvement-chance histogram, in ascending order.
 * SSOT for both binning (binOfImprovementChance) and chip/bar labels (improvementChanceBinLabel).
 * Each bin i covers [edges[i], edges[i+1]); the final bin is closed at 100 so a 100% value lands in it.
 */
export const IMPROVEMENT_CHANCE_BIN_EDGES: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

/** Number of histogram bins (one fewer than the edge count). */
export const IMPROVEMENT_CHANCE_BIN_COUNT = IMPROVEMENT_CHANCE_BIN_EDGES.length - 1

/**
 * Map a chancePercent (0–100) to its bin index, or null when out of range.
 * Bins are half-open [lo, hi) except the last, which is closed [90, 100] so 100% lands in bin 9.
 */
export function binOfImprovementChance(chancePercent: number): number | null {
  if (!Number.isFinite(chancePercent) || chancePercent < 0 || chancePercent > 100) return null
  // Clamp the top edge into the final bin so exactly-100 doesn't fall off the end.
  if (chancePercent >= 100) return IMPROVEMENT_CHANCE_BIN_COUNT - 1
  // Linear scan over edges; the bin count is tiny so this stays cheap.
  for (let i = 0; i < IMPROVEMENT_CHANCE_BIN_COUNT; i++) {
    if (chancePercent >= IMPROVEMENT_CHANCE_BIN_EDGES[i]! && chancePercent < IMPROVEMENT_CHANCE_BIN_EDGES[i + 1]!) return i
  }
  return null
}

/**
 * sqrt display scale for bar widths: returns the fraction of the longest bar to fill, computed as
 * sqrt(count) / sqrt(maxCount) = sqrt(count / maxCount). Keeps the tallest bar at exactly 100%
 * while pulling small counts outward so a strongly bimodal distribution (e.g. the improvement-chance
 * histogram, which clusters at 0–10% and 90–100%) keeps its near-empty middle bins legible.
 * Same visual transform the substat radar uses. Width-only — raw counts are shown unmodified.
 */
export function sqrtBarWidthScale(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0
  return Math.sqrt(Math.max(count, 0) / maxCount)
}

/** Human-readable label for a histogram bin (e.g. bin 3 → "30–40%"). */
export function improvementChanceBinLabel(bin: number): string {
  const lo = IMPROVEMENT_CHANCE_BIN_EDGES[bin]
  const hi = IMPROVEMENT_CHANCE_BIN_EDGES[bin + 1]
  // Out-of-range bin index: fall back to the raw number so callers never render "undefined".
  if (lo === undefined || hi === undefined) return String(bin)
  return `${lo}–${hi}%`
}

/**
 * Convert a set of selected histogram bin indices into the equivalent inclusive [min, max]
 * percentage range — the form the Gear Inspector filter uses
 * (gearInspectorImprovementChance.{min,max}). The range spans from the low edge of the
 * lowest selected bin to the high edge of the highest selected bin; for a contiguous
 * selection this round-trips exactly with rangeToImprovChanceBins. Returns null when no
 * bins are selected (= no range constraint).
 */
export function improvChanceBinsToRange(bins: ReadonlySet<number>): { min: number; max: number } | null {
  if (bins.size === 0) return null
  let lo = Infinity
  let hi = -Infinity
  for (const bin of bins) {
    // Ignore out-of-range indices defensively so a stray value can't blow up the bounds.
    if (bin < 0 || bin >= IMPROVEMENT_CHANCE_BIN_COUNT) continue
    lo = Math.min(lo, IMPROVEMENT_CHANCE_BIN_EDGES[bin]!)
    hi = Math.max(hi, IMPROVEMENT_CHANCE_BIN_EDGES[bin + 1]!)
  }
  if (lo === Infinity) return null
  return { min: lo, max: hi }
}

/**
 * Convert an inclusive [min, max] percentage range into the set of histogram bin indices it
 * covers — the inverse of improvChanceBinsToRange. A bin is included when it overlaps the
 * range (half-open [edge, nextEdge), with the top bin closed at 100). The full 0–100 range
 * yields an empty set (= no constraint) so a default range maps to "no bins selected".
 */
export function rangeToImprovChanceBins(min: number, max: number): Set<number> {
  const bins = new Set<number>()
  // The unconstrained full range is "no filter": return an empty selection.
  if (min <= 0 && max >= 100) return bins
  for (let i = 0; i < IMPROVEMENT_CHANCE_BIN_COUNT; i++) {
    const lo = IMPROVEMENT_CHANCE_BIN_EDGES[i]!
    const hi = IMPROVEMENT_CHANCE_BIN_EDGES[i + 1]!
    // Overlap test: bin [lo, hi) intersects [min, max] when lo < max and hi > min.
    // The top bin (hi === 100) is closed, so admit it when max reaches 100 too.
    if (lo < max && (hi > min || (hi >= 100 && max >= 100))) bins.add(i)
  }
  return bins
}

/**
 * Resolve a row's binnable improvement chance, or null when the row should be excluded
 * from the histogram/filter. Excludes items with no matching safeguard and the degenerate
 * +16/100% case — mirroring the Gear Inspector grid overlay and sort behavior (SSOT).
 */
export function rowImprovementChanceBin(
  row: GearInspectorPreviewRow,
  chanceByArtifactId: ReadonlyMap<number, { chancePercent: number; hasMatchingSafeguard: boolean }>,
): number | null {
  const entry = chanceByArtifactId.get(Number(row.artifact.id))
  // No chance entry, or no safeguard projects an upgrade for this item — not binnable.
  if (!entry || !entry.hasMatchingSafeguard) return null
  // Already-maxed gear reports a trivial 100% — treat as "no data" exactly like the grid.
  if (isDegenerateImprovChance(entry.chancePercent, Number(row.artifact.level))) return null
  return binOfImprovementChance(entry.chancePercent)
}

/**
 * Count rows into improvement-chance histogram bins.
 * Returns a count per bin index (0 … IMPROVEMENT_CHANCE_BIN_COUNT-1); unbinnable rows are skipped.
 */
export function countByImprovementChanceBin(
  rows: readonly GearInspectorPreviewRow[],
  chanceByArtifactId: ReadonlyMap<number, { chancePercent: number; hasMatchingSafeguard: boolean }>,
): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const bin = rowImprovementChanceBin(row, chanceByArtifactId)
    if (bin === null) continue
    map.set(bin, (map.get(bin) ?? 0) + 1)
  }
  return map
}

// ── Slot groups ───────────────────────────────────────────────────────────────

// Artifact and accessory groups derived from the canonical slot ordering.
// Keeps the definition in sync with domain changes without duplicating slot IDs.
const SLOT_ARTIFACT_GROUP:     ReadonlySet<number> = new Set(PREFERRED_ARTIFACT_TYPE_ORDER.filter((s) => !isAccessorySlot(s)))
const SLOT_ACCESSORY_GROUP: ReadonlySet<number> = new Set(PREFERRED_ARTIFACT_TYPE_ORDER.filter((s) =>  isAccessorySlot(s)))

/**
 * Return the full group of slot IDs that share the same slot category as `id`.
 * Returns null if `id` is not a recognised slot.
 * Used by the Gear Analytics slot donut: double-clicking a slice selects all group members.
 */
export function slotGroupIds(id: number): ReadonlySet<number> | null {
  if (SLOT_ARTIFACT_GROUP.has(id))     return SLOT_ARTIFACT_GROUP
  if (SLOT_ACCESSORY_GROUP.has(id)) return SLOT_ACCESSORY_GROUP
  return null
}

/**
 * Apply the cross-filter to a row array, optionally excluding one dimension.
 * Crossfilter rule: each chart passes `exclude` as its own dimension key so it
 * receives data filtered by the *other* dimensions only, preserving its full range.
 */
export function applyGearAnalyticsFilter(
  rows: readonly GearInspectorPreviewRow[],
  dim: GearAnalyticsDim,
  exclude?: keyof GearAnalyticsDim,
  /**
   * Per-artifact improvement-chance map. Required only to resolve the improvChanceBins
   * dimension; when omitted (or the dimension is inactive/excluded) the filter behaves as before.
   */
  chanceByArtifactId?: ReadonlyMap<number, { chancePercent: number; hasMatchingSafeguard: boolean }>,
): GearInspectorPreviewRow[] {
  // Short-circuit when nothing is active (after accounting for exclusion).
  const activeSlots     = exclude === 'slots'           ? EMPTY_SET : dim.slots
  const activeRanks     = exclude === 'ranks'           ? EMPTY_SET : dim.ranks
  const activeRarities  = exclude === 'rarities'        ? EMPTY_SET : dim.rarities
  const activeSets      = exclude === 'sets'            ? EMPTY_SET : dim.sets
  const activeOutcomes  = exclude === 'outcomes'        ? EMPTY_SET : dim.outcomes
  const activeSources   = exclude === 'sources'         ? EMPTY_SET : dim.sources
  const activeLevels    = exclude === 'levels'          ? EMPTY_SET : dim.levels
  const activeMainStats = exclude === 'mainStats'       ? EMPTY_SET : dim.mainStats
  // The improvChance dimension can only be honored when the chance map is supplied;
  // without it, treat the dimension as inactive so existing call sites stay unaffected.
  const activeChanceBins = (exclude === 'improvChanceBins' || !chanceByArtifactId) ? EMPTY_SET : dim.improvChanceBins

  // Fast path: if all dimensions are empty, return all rows as an array.
  if (!activeSlots.size && !activeRanks.size && !activeRarities.size && !activeSets.size && !activeOutcomes.size && !activeSources.size && !activeLevels.size && !activeMainStats.size && !activeChanceBins.size) {
    return rows as GearInspectorPreviewRow[]
  }

  const result: GearInspectorPreviewRow[] = []
  for (const row of rows) {
    const a = row.artifact
    // Each dimension ANDs with the others; within a dimension, values are OR'd.
    if (activeSlots.size     && !activeSlots.has(Number(a.slot)))                                                           continue
    if (activeRanks.size     && !activeRanks.has(Number(a.rank)))                                                           continue
    if (activeRarities.size  && !activeRarities.has(Number(a.rarity)))                                                      continue
    if (activeSets.size      && !activeSets.has(Number(a.set)))                                                              continue
    if (activeOutcomes.size  && !activeOutcomes.has(rowOutcome(row)))                                                        continue
    if (activeSources.size   && !activeSources.has(determineGearInspectorSourceCategory(a)))                                continue
    if (activeLevels.size    && !activeLevels.has(Number(a.level)))                                                          continue
    // Items with no main stat (accessories with null mainStat) never match a main-stat selection.
    if (activeMainStats.size && (a.mainStat == null || !activeMainStats.has(Number(a.mainStat.variant))))                   continue
    // Improvement-chance bin: unbinnable rows (null bin) never match a bin selection.
    if (activeChanceBins.size) {
      const bin = rowImprovementChanceBin(row, chanceByArtifactId!)
      if (bin === null || !activeChanceBins.has(bin)) continue
    }
    result.push(row)
  }
  return result
}

/** Reusable sentinel for excluded dimensions in applyGearAnalyticsFilter. */
const EMPTY_SET: ReadonlySet<never> = new Set()

// ── Distribution counters ─────────────────────────────────────────────────────

/** Count rows by slot ID. */
export function countBySlot(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const slot = Number(row.artifact.slot)
    map.set(slot, (map.get(slot) ?? 0) + 1)
  }
  return map
}

/** Count rows by star rank (1–6). */
export function countByRank(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const rank = Number(row.artifact.rank)
    map.set(rank, (map.get(rank) ?? 0) + 1)
  }
  return map
}

/** Human-readable label for a star rank (e.g. 6 → '6★'). */
export function rankLabel(rank: number): string {
  return `${rank}★`
}

/** Count rows by rarity RankValue (1-6). */
export function countByRarity(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const rarity = Number(row.artifact.rarity)
    map.set(rarity, (map.get(rarity) ?? 0) + 1)
  }
  return map
}

/** Max number of unique sets shown in a donut/pie before bucketing into "other". */
const SET_DONUT_TOP_N = 15

/**
 * Returns the set IDs that fall into the "others" bucket in the Sets donut —
 * i.e. all set IDs beyond the top SET_DONUT_TOP_N by item count.
 * Used by the cross-filter to resolve the synthetic -1 "others" bucket into
 * real set IDs so items in those sets are included when "others" is selected.
 */
export function getOtherSetIds(rows: readonly GearInspectorPreviewRow[]): ReadonlySet<number> {
  // Tally counts per set, sort descending — mirrors the logic in countBySet.
  const raw = new Map<number, number>()
  for (const row of rows) {
    const set = Number(row.artifact.set)
    raw.set(set, (raw.get(set) ?? 0) + 1)
  }
  const sorted = Array.from(raw.entries()).sort(([, a], [, b]) => b - a)
  // Return the set IDs beyond the top-N window.
  return new Set(sorted.slice(SET_DONUT_TOP_N).map(([id]) => id))
}

/**
 * Count rows by set ID. Returns the top N sets by count plus a synthetic
 * "other" entry (id=-1, count=remaining total) if more sets exist.
 */
export function countBySet(
  rows: readonly GearInspectorPreviewRow[],
  opts?: {
    /** Display label for set ID -99 (ACCESSORY_NO_SET_ID = no-set accessories). */
    noSetLabel?: string
    /** Label factory for the "others" bucket; receives the count of bucketed sets. */
    othersLabel?: (n: number) => string
  },
): Array<{ id: number; label: string; count: number }> {
  // Tally all sets first.
  const raw = new Map<number, number>()
  for (const row of rows) {
    const set = Number(row.artifact.set)
    raw.set(set, (raw.get(set) ?? 0) + 1)
  }
  // Sort by count descending, then by set name for determinism.
  const sorted = Array.from(raw.entries()).sort(([, a], [, b]) => b - a)
  const top = sorted.slice(0, SET_DONUT_TOP_N)
  const rest = sorted.slice(SET_DONUT_TOP_N)
  const result = top.map(([id, count]) => ({
    id,
    // Use caller-supplied label for the no-set bucket; fall back to name table then numeric ID.
    label: (id === ACCESSORY_NO_SET_ID && opts?.noSetLabel)
      ? opts.noSetLabel
      : (artifactSetNames[id] ?? String(id)),
    count,
  }))
  // Aggregate remaining sets into a single "others" bucket (id=-1).
  if (rest.length > 0) {
    const otherCount = rest.reduce((s, [, c]) => s + c, 0)
    const label = opts?.othersLabel ? opts.othersLabel(rest.length) : `Others (${rest.length})`
    result.push({ id: -1, label, count: otherCount })
  }
  return result
}

/** Per-set outcome breakdown — one entry per set ID in the filtered row set. */
export type SetOutcomeCount = {
  id: number
  label: string
  sell: number
  keep: number
  safe: number
  none: number
  /** sum of all four outcome counts */
  total: number
}

/**
 * Count rows by set ID and break each set down into outcome buckets.
 * Returns all sets (no top-N cap) sorted by total count descending.
 * Used by the stacked vertical bar chart which replaces the sets donut.
 */
export function countSetsByOutcome(
  rows: readonly GearInspectorPreviewRow[],
  opts?: {
    /** Display label for set ID -99 (ACCESSORY_NO_SET_ID = no-set accessories). */
    noSetLabel?: string
    /**
     * Optional localized name function for a set ID.
     * When provided it takes precedence over the fallback `artifactSetNames` lookup.
     * Pass `(id) => getLocalizedGearSetName(id, t, lang)` from the calling component.
     */
    setNameFn?: (id: number) => string
  },
): SetOutcomeCount[] {
  // Accumulate per-set, per-outcome tallies in a single pass.
  const map = new Map<number, { sell: number; keep: number; safe: number; none: number }>()
  for (const row of rows) {
    const set = Number(row.artifact.set)
    if (!map.has(set)) map.set(set, { sell: 0, keep: 0, safe: 0, none: 0 })
    // rowOutcome classifies the row into sell / keep / safe / none.
    map.get(set)![rowOutcome(row)]++
  }
  return Array.from(map.entries())
    .map(([id, counts]) => ({
      id,
      label: (id === ACCESSORY_NO_SET_ID && opts?.noSetLabel)
        ? opts.noSetLabel
        : (opts?.setNameFn ? opts.setNameFn(id) : (artifactSetNames[id] ?? String(id))),
      ...counts,
      total: counts.sell + counts.keep + counts.safe + counts.none,
    }))
    // Sort by total descending so the most-populated sets appear first (left).
    .sort((a, b) => b.total - a.total)
}

/** Count rows by source category (inventory / collection / vault / inbox / manual). */
export function countBySource(
  rows: readonly GearInspectorPreviewRow[],
): Map<GearInspectorSourceFilter, number> {
  const map = new Map<GearInspectorSourceFilter, number>()
  for (const row of rows) {
    const src = determineGearInspectorSourceCategory(row.artifact)
    map.set(src, (map.get(src) ?? 0) + 1)
  }
  return map
}

/** Count rows by gear level milestone (0 / 4 / 8 / 12 / 16). */
export function countByLevel(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const lvl = Number(row.artifact.level)
    map.set(lvl, (map.get(lvl) ?? 0) + 1)
  }
  return map
}

/** Human-readable label for a gear level milestone (e.g. 8 → '+8'). */
export function levelLabel(level: number): string {
  return `+${level}`
}

/** Count rows by outcome classification. */
export function countByOutcome(
  rows: readonly GearInspectorPreviewRow[],
): { sell: number; keep: number; safe: number; none: number } {
  let sell = 0, keep = 0, safe = 0, none = 0
  for (const row of rows) {
    const outcome = rowOutcome(row)
    if (outcome === 'sell') sell++
    else if (outcome === 'safe') safe++
    else if (outcome === 'none') none++
    else keep++
  }
  return { sell, keep, safe, none }
}

/** Count how many rows have each main stat variant (across all slots in the set). */
export function countMainStatFrequency(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    const variant = Number(row.artifact.mainStat?.variant ?? StatVariant.Any)
    if (variant === StatVariant.Any) continue
    map.set(variant, (map.get(variant) ?? 0) + 1)
  }
  return map
}

/** Count how many times each substat variant appears across all items. */
export function countSubstatFrequency(rows: readonly GearInspectorPreviewRow[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const row of rows) {
    for (const sub of row.artifact.substats) {
      // Use the sub variant as the key; skip Any/unknown variants.
      const variant = Number(sub.variant)
      if (variant === StatVariant.Any) continue
      map.set(variant, (map.get(variant) ?? 0) + 1)
    }
  }
  return map
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export type SlotMainMatrix = {
  /** cell[slot][variant] = count of items in that slot with that main stat */
  matrix: Record<number, Record<number, number>>
  /** Highest count across all cells — used to normalize opacity. */
  maxCount: number
}

/** All 9 slots in preferred display order. */
export const HEATMAP_SLOTS: readonly number[] = PREFERRED_ARTIFACT_TYPE_ORDER as readonly number[]

/** Main stat variants shown as heatmap rows, in the canonical preferred stat order. */
export const HEATMAP_VARIANTS: readonly number[] = STAT_VARIANTS_PRIORITY as readonly number[]

/**
 * The SUBSTAT vocabulary for analytics, in canonical display order: classic
 * priority first, then the accessory-only anomalous mode-damage stats.
 *
 * Deliberately not the same list as HEATMAP_VARIANTS: that one is MAIN stats, and
 * anomalous stats can never be a main, so reusing it there would draw eight
 * permanently-empty rows. The reverse reuse is what hid them from the radar —
 * countSubstatFrequency already tallies them off the rows, so only the axis list
 * kept them off the chart.
 *
 * Consumed by every analytics surface that enumerates or ORDERS substats (the
 * frequency radar's axes, the champion-stats row order), so a stat added to the
 * domain appears in all of them at once and in the same position.
 */
export const ANALYTICS_SUBSTAT_VARIANTS: readonly number[] = [
  ...STAT_VARIANTS_PRIORITY,
  ...ANOMALOUS_SUBSTAT_VARIANTS,
] as readonly number[]

/**
 * Build the slot × main stat count matrix.
 * Slots with no main stat (i.e. weapon/shield with fixed mains) still appear.
 */
export function buildSlotMainMatrix(rows: readonly GearInspectorPreviewRow[]): SlotMainMatrix {
  // Initialize all cells to zero for deterministic rendering.
  const matrix: Record<number, Record<number, number>> = {}
  for (const slot of HEATMAP_SLOTS) {
    matrix[slot] = {}
    for (const variant of HEATMAP_VARIANTS) {
      matrix[slot]![variant] = 0
    }
  }
  let maxCount = 0
  for (const row of rows) {
    const slot = Number(row.artifact.slot)
    const variant = Number(row.artifact.mainStat?.variant ?? StatVariant.Any)
    // Skip if slot or variant are outside our display set.
    if (!matrix[slot] || variant === StatVariant.Any) continue
    if (!(variant in matrix[slot]!)) continue
    const next = (matrix[slot]![variant] ?? 0) + 1
    matrix[slot]![variant] = next
    if (next > maxCount) maxCount = next
  }
  return { matrix, maxCount }
}

// ── KPI metrics ───────────────────────────────────────────────────────────────

export type GearAnalyticsKpis = {
  /** % of items that are both 6★ rank and Legendary or Mythical rarity. */
  sixStarLegendaryPlusRate: number | null
  /** % of items leveled to +16 (max level). */
  maxedRate: number | null
  /** % of items on a vault-benched champion (vault + reserveVault), out of all items. */
  vaultLockedRate: number | null
  /** % of items that have been rerolled at least once with a chaos orb. */
  chaosRate: number | null
  /** % of all items that have an ascension stat (glyph) applied. */
  glyphedRate: number | null
  /** % of items that have at least one ascension level (ascension stat present). */
  ascendedRate: number | null
  /** % of items equipped to any champion (including vault-benched). */
  equippedRate: number | null
  /** Raw count of non-accessory artifact pieces in the current view. */
  artifactCount: number | null
  /** Raw count of accessory pieces in the current view. */
  accessoryCount: number | null
  /**
   * Raw count of Anomalous Accessories in the current view — a SUBSET of accessoryCount,
   * not a third category. Detected via hasAnomalousSubstat (the piece carries at least one
   * mode-damage substat); the wire `variantId` flag would be exact but is not yet ingested.
   * See docs/technical/anomalous-accessories.md.
   */
  anomalousCount: number | null
}

/**
 * Compute KPI percentages for the given row set.
 * Returns null for a KPI when the denominator is zero (avoids 0/0 confusion).
 */
export function computeGearAnalyticsKpis(rows: readonly GearInspectorPreviewRow[]): GearAnalyticsKpis {
  const total = rows.length
  if (total === 0) {
    // All null: no data loaded yet.
    return { sixStarLegendaryPlusRate: null, maxedRate: null, vaultLockedRate: null, chaosRate: null, glyphedRate: null, ascendedRate: null, equippedRate: null, artifactCount: null, accessoryCount: null, anomalousCount: null }
  }

  let sixStarLegendaryPlus = 0, maxed = 0, vaultLocked = 0, chaosed = 0, glyphed = 0, ascended = 0, equipped = 0, artifacts = 0, accessories = 0, anomalous = 0

  for (const row of rows) {
    const a = row.artifact
    // 6★ Legendary+ = max star rank AND at least Legendary rarity (rarity 5 or 6).
    if (Number(a.rank) === 6 && Number(a.rarity) >= 5) sixStarLegendaryPlus++
    // Maxed = milestone level 16.
    if (Number(a.level) === 16) maxed++
    // Vault-locked = gear on a vault-benched champion (includes both 'vault' and 'reserveVault'
    // champion locations). Uses determineGearInspectorSourceCategory as the single source of truth
    // so the KPI matches what the Source donut shows in the 'vault' slice.
    if (determineGearInspectorSourceCategory(a) === 'vault') vaultLocked++
    // Chaos'd = at least one chaos orb has been applied.
    if (a.rerollCount > 0) chaosed++
    // Glyphed = at least one substat has a glyph bonus (glyphValue > 0), shown as green text in the Gear Inspector.
    if (a.substats.some((s) => s.glyphValue > 0)) glyphed++
    // Ascended = gear has an ascension stat (at least 1 ascension level applied).
    if (a.ascension !== null) ascended++
    // Equipped = has an equippedChampion reference (any champion, including benched).
    // Loose != null catches both null and undefined (optional chaining returns undefined when champion is null).
    if (a.equippedChampion?.id != null) equipped++
    // Artifacts vs accessories: split by slot type using the single-source-of-truth utility.
    if (isAccessorySlot(a.slot)) {
      accessories++
      // Anomalous pieces are a subset of accessories — counted inside this branch so the
      // two can never drift apart (an anomalous piece is always an accessory).
      if (hasAnomalousSubstat(a)) anomalous++
    } else artifacts++
  }

  return {
    sixStarLegendaryPlusRate: sixStarLegendaryPlus / total,
    maxedRate: maxed / total,
    vaultLockedRate: vaultLocked / total,
    chaosRate: chaosed / total,
    glyphedRate: glyphed / total,
    ascendedRate: ascended / total,
    equippedRate: equipped / total,
    artifactCount: artifacts,
    accessoryCount: accessories,
    anomalousCount: anomalous,
  }
}

// ── Label helpers (re-exported for component use) ─────────────────────────────

/** Human-readable name for a slot ID. */
export function slotLabel(slot: number): string {
  return artifactTypeNames[slot] ?? String(slot)
}

/** Human-readable name for a rarity RankValue (1-6). */
export function rarityLabel(rarity: number): string {
  // Convert RankValue to RarityCode then look up the display name.
  return rarityNames[rarityCodeFromRankValue(rarity as 1 | 2 | 3 | 4 | 5 | 6)] ?? String(rarity)
}

/** Human-readable label for a StatVariant (delegates to existing labelOfVariant). */
export const statLabel: (v: StatVariantLike) => string = labelOfVariant
