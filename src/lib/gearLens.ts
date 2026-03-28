/**
 * gearLens.ts
 *
 * Pure aggregation functions for the Gear Lens analytics tab.
 * No React, no side effects — operates on a snapshot of GearInspectorPreviewRow[].
 */
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import { RULE_SOURCE_SAFEGUARDS } from './ruleSources'
import {
  determineGearInspectorSourceCategory,
  type GearInspectorSourceFilter,
} from './rulesFilter'
import { isAccessorySlot } from './gearInspectorDomain'
import {
  artifactTypeNames,
  PREFERRED_ARTIFACT_TYPE_ORDER,
  STAT_VARIANTS_PRIORITY,
  StatVariant,
  labelOfVariant,
  rarityCodeFromRankValue,
  rarityNames,
  artifactSetNames,
} from './types'
import { ACCESSORY_NO_SET_ID } from './constants'
import type { StatVariantLike } from './types'

// ── Outcome classification ────────────────────────────────────────────────────

/**
 * The four possible outcomes for a gear item in the Gear Lens.
 * 'none' distinguishes truly unmatched items (no rule triggered) from 'keep'
 * (explicit keep rule matched), giving users visibility into unevaluated gear.
 */
export type GearLensOutcome = 'sell' | 'keep' | 'safe' | 'none'

/** Classify a row into its outcome bucket. */
export function rowOutcome(row: GearInspectorPreviewRow): GearLensOutcome {
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
export type { GearInspectorSourceFilter as GearLensSource }

/** Dimension selections for the cross-filter dashboard state. */
export type GearLensDim = {
  /** Selected slot IDs (ArtifactTypeId). Empty = no slot filter. */
  slots: ReadonlySet<number>
  /** Selected star ranks (1–6). Empty = no rank filter. */
  ranks: ReadonlySet<number>
  /** Selected rarity values (RankValue 1-6). Empty = no rarity filter. */
  rarities: ReadonlySet<number>
  /** Selected set IDs (ArtifactSetId). Empty = no set filter. */
  sets: ReadonlySet<number>
  /** Selected result labels (sell / keep / safe). Empty = no result filter. */
  outcomes: ReadonlySet<GearLensOutcome>
  /** Selected source categories. Empty = no source filter. */
  sources: ReadonlySet<GearInspectorSourceFilter>
  /** Selected gear level milestones (0, 4, 8, 12, 16). Empty = no level filter. */
  levels: ReadonlySet<number>
}

/** Canonical empty dim: all charts unfiltered. */
export const EMPTY_GEAR_LENS_DIM: GearLensDim = {
  slots: new Set(),
  ranks: new Set(),
  rarities: new Set(),
  sets: new Set(),
  outcomes: new Set(),
  sources: new Set(),
  levels: new Set(),
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
export function isGearLensDimActive(dim: GearLensDim): boolean {
  // Check each dimension set for non-empty state.
  return (
    dim.slots.size > 0 || dim.ranks.size > 0 || dim.rarities.size > 0 || dim.sets.size > 0 ||
    dim.outcomes.size > 0 || dim.sources.size > 0 || dim.levels.size > 0
  )
}

// ── Slot groups ───────────────────────────────────────────────────────────────

// Armor and accessory groups derived from the canonical slot ordering.
// Keeps the definition in sync with domain changes without duplicating slot IDs.
const SLOT_ARMOR_GROUP:     ReadonlySet<number> = new Set(PREFERRED_ARTIFACT_TYPE_ORDER.filter((s) => !isAccessorySlot(s)))
const SLOT_ACCESSORY_GROUP: ReadonlySet<number> = new Set(PREFERRED_ARTIFACT_TYPE_ORDER.filter((s) =>  isAccessorySlot(s)))

/**
 * Return the full group of slot IDs that share the same slot category as `id`.
 * Returns null if `id` is not a recognised slot.
 * Used by the Gear Lens slot donut: double-clicking a slice selects all group members.
 */
export function slotGroupIds(id: number): ReadonlySet<number> | null {
  if (SLOT_ARMOR_GROUP.has(id))     return SLOT_ARMOR_GROUP
  if (SLOT_ACCESSORY_GROUP.has(id)) return SLOT_ACCESSORY_GROUP
  return null
}

/**
 * Apply the cross-filter to a row array, optionally excluding one dimension.
 * Crossfilter rule: each chart passes `exclude` as its own dimension key so it
 * receives data filtered by the *other* dimensions only, preserving its full range.
 */
export function applyGearLensFilter(
  rows: readonly GearInspectorPreviewRow[],
  dim: GearLensDim,
  exclude?: keyof GearLensDim,
): GearInspectorPreviewRow[] {
  // Short-circuit when nothing is active (after accounting for exclusion).
  const activeSlots    = exclude === 'slots'    ? EMPTY_SET : dim.slots
  const activeRanks    = exclude === 'ranks'    ? EMPTY_SET : dim.ranks
  const activeRarities = exclude === 'rarities' ? EMPTY_SET : dim.rarities
  const activeSets     = exclude === 'sets'     ? EMPTY_SET : dim.sets
  const activeOutcomes = exclude === 'outcomes' ? EMPTY_SET : dim.outcomes
  const activeSources  = exclude === 'sources'  ? EMPTY_SET : dim.sources
  const activeLevels   = exclude === 'levels'   ? EMPTY_SET : dim.levels

  // Fast path: if all dimensions are empty, return all rows as an array.
  if (!activeSlots.size && !activeRanks.size && !activeRarities.size && !activeSets.size && !activeOutcomes.size && !activeSources.size && !activeLevels.size) {
    return rows as GearInspectorPreviewRow[]
  }

  const result: GearInspectorPreviewRow[] = []
  for (const row of rows) {
    const a = row.artifact
    // Each dimension ANDs with the others; within a dimension, values are OR'd.
    if (activeSlots.size    && !activeSlots.has(Number(a.slot)))                               continue
    if (activeRanks.size    && !activeRanks.has(Number(a.rank)))                               continue
    if (activeRarities.size && !activeRarities.has(Number(a.rarity)))                          continue
    if (activeSets.size     && !activeSets.has(Number(a.set)))                                 continue
    if (activeOutcomes.size && !activeOutcomes.has(rowOutcome(row)))                           continue
    if (activeSources.size  && !activeSources.has(determineGearInspectorSourceCategory(a)))   continue
    if (activeLevels.size   && !activeLevels.has(Number(a.level)))                            continue
    result.push(row)
  }
  return result
}

/** Reusable sentinel for excluded dimensions in applyGearLensFilter. */
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

/** Max number of unique sets shown in the donut before bucketing into "other". */
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

export type GearLensKpis = {
  /** % of items at Legendary rarity or above (rarity 5=Legendary, 6=Mythical). */
  legendaryPlusRate: number | null
  /** % of items at 6★ rank (max star grade). */
  sixStarRate: number | null
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
}

/**
 * Compute KPI percentages for the given row set.
 * Returns null for a KPI when the denominator is zero (avoids 0/0 confusion).
 */
export function computeGearLensKpis(rows: readonly GearInspectorPreviewRow[]): GearLensKpis {
  const total = rows.length
  if (total === 0) {
    // All null: no data loaded yet.
    return { legendaryPlusRate: null, sixStarRate: null, maxedRate: null, vaultLockedRate: null, chaosRate: null, glyphedRate: null, ascendedRate: null, equippedRate: null }
  }

  let legendaryPlus = 0, sixStar = 0, maxed = 0, vaultLocked = 0, chaosed = 0, glyphed = 0, ascended = 0, equipped = 0

  for (const row of rows) {
    const a = row.artifact
    // Legendary+ = rarity 5 (Legendary) or 6 (Mythical, normalized from the DB value of 15).
    if (Number(a.rarity) >= 5) legendaryPlus++
    // 6★ = max star rank.
    if (Number(a.rank) === 6) sixStar++
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
    // Equipped = has an equippedToChampionId (any champion, including benched).
    if (a.equippedToChampionId !== null) equipped++
  }

  return {
    legendaryPlusRate: legendaryPlus / total,
    sixStarRate: sixStar / total,
    maxedRate: maxed / total,
    vaultLockedRate: vaultLocked / total,
    chaosRate: chaosed / total,
    glyphedRate: glyphed / total,
    ascendedRate: ascended / total,
    equippedRate: equipped / total,
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
