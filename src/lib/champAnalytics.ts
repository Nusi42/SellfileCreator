/**
 * champAnalytics.ts
 *
 * Pure aggregation functions for the Champion Stats section of the Gear Analytics tab.
 * Builds per-champion gear profiles from a snapshot of GearInspectorPreviewRow[].
 * No React, no side effects.
 */
import type { GearInspectorPreviewRow } from '../types/gearInspectorPreview'
import type { ChampionLookupRecord } from './importers/gearDbNormalizer'
import { isAccessorySlot } from './gearInspectorDomain'
import { statLabel, ANALYTICS_SUBSTAT_VARIANTS } from './gearAnalytics'
import { ArtifactType, PREFERRED_ARTIFACT_TYPE_ORDER, StatVariant } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Location filter options for the Champion Stats section. */
export type ChampAnalyticsLocation = 'all' | 'collection' | 'vault'

/**
 * One per unique equipped champion across all loaded gear rows. Aggregates slot
 * coverage + gear-derived stats for each champion.
 *
 * The champion-intrinsic fields (name, rarity, location, ascension, empowerment,
 * affinity, blessing grade, star grade, XP level, baseHeroId) are reached via the
 * nested `champion` reference — a pointer to the shared `ChampionLookupRecord`,
 * which is the single source of truth.
 */
export type ChampionGearProfile = {
  /** Reference to the champion's lookup record. reserveVault champions are filtered
   *  out by the builder so callers can rely on `champion.location` being either
   *  'collection' or 'vault'. The champion's id lives on `champion.id` — there is no
   *  separate top-level `championId` (would be redundant with the reference). */
  champion: ChampionLookupRecord
  /** Set of slot IDs for which this champion has gear equipped. */
  slotsFilled: ReadonlySet<number>
  /** Count of the 6 main artifact slots (1-6) that are filled. */
  mainSlotsFilled: number
  /** True when all 6 main artifact slots are filled. */
  fullyEquipped: boolean
  /** Average LevelMilestone across all gear pieces equipped to this champion. */
  avgLevel: number
  /** Total item count equipped to this champion. */
  itemCount: number
  /** Count of gear pieces that have an ascension (glyph) stat applied. */
  ascentionCount: number
  /** Sum of gear ranks (star grades) across all equipped pieces. */
  rankSum: number
}

// ── Slot availability ─────────────────────────────────────────────────────────

/**
 * Returns true when a given slot is available to equip at the champion's
 * ascension level (HeroID − BaseHeroID, 0–6).
 * Amulet (slot 8) requires level ≥ 5; Banner (slot 9) requires level 6.
 * All other slots are always available.
 * Passing null (level unknown) conservatively returns true for all slots.
 */
export function isSlotAvailableAtAscensionLevel(slotId: number, ascensionLevel: number | null): boolean {
  if (slotId === ArtifactType.Amulet) return ascensionLevel === null || ascensionLevel >= 5
  if (slotId === ArtifactType.Banner) return ascensionLevel === null || ascensionLevel >= 6
  return true
}

// ── Main slot IDs ─────────────────────────────────────────────────────────────

/**
 * The 6 main artifact slots (1–6). Accessories (7–9) are excluded from the
 * "fully equipped" calculation per the product definition.
 */
export const MAIN_ARTIFACT_SLOTS: readonly number[] = PREFERRED_ARTIFACT_TYPE_ORDER.filter(
  (s) => !isAccessorySlot(s),
)

/**
 * The 3 accessory slots (Ring / Amulet / Banner). Kept as a named constant
 * alongside MAIN_ARTIFACT_SLOTS so callers can refer to either group by name.
 */
export const ACCESSORY_SLOTS: readonly number[] = PREFERRED_ARTIFACT_TYPE_ORDER.filter(
  (s) => isAccessorySlot(s),
)

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build one ChampionGearProfile per unique champion that appears in `rows`.
 * Only rows whose `artifact.equippedChampion` resolves to a known champion with a
 * non-reserveVault location are included. Unequipped rows are silently skipped.
 */
export function buildChampionGearProfiles(
  rows: readonly GearInspectorPreviewRow[],
): ChampionGearProfile[] {
  // Per-champion accumulator. Champion-intrinsic fields live on the shared
  // ChampionLookupRecord (`champion`); only the gear-derived metrics belong here.
  type Accumulator = {
    champion: ChampionLookupRecord
    slots: Set<number>
    levels: number[]
    ascentionCount: number
    rankSum: number
  }
  const map = new Map<number, Accumulator>()

  for (const row of rows) {
    const a = row.artifact
    // Skip unequipped items.
    if (a.equippedChampion?.id === null) continue
    const champion = a.equippedChampion
    // Skip artifacts whose champion lookup is unresolved (orphan or pre-merge state).
    if (!champion) continue
    // Skip reserve-vault champions — they cannot actually hold gear.
    if (champion.location === 'reserveVault') continue

    let entry = map.get(champion.id)
    if (!entry) {
      entry = {
        champion,
        slots: new Set<number>(),
        levels: [],
        ascentionCount: 0,
        rankSum: 0,
      }
      map.set(champion.id, entry)
    }
    entry.slots.add(Number(a.slot))
    entry.levels.push(Number(a.level))
    // Gear-derived accumulators for the radar tiebreaker / icon lookup.
    if (a.ascension !== null) entry.ascentionCount++
    entry.rankSum += Number(a.rank)
  }

  // Convert to ChampionGearProfile[].
  const profiles: ChampionGearProfile[] = []
  for (const entry of map.values()) {
    const mainSlotsFilled = MAIN_ARTIFACT_SLOTS.filter((s) => entry.slots.has(s)).length
    const avgLevel =
      entry.levels.length > 0
        ? entry.levels.reduce((s, v) => s + v, 0) / entry.levels.length
        : 0
    profiles.push({
      champion: entry.champion,
      slotsFilled: entry.slots,
      mainSlotsFilled,
      fullyEquipped: mainSlotsFilled === MAIN_ARTIFACT_SLOTS.length,
      avgLevel,
      itemCount: entry.levels.length,
      ascentionCount: entry.ascentionCount,
      rankSum: entry.rankSum,
    })
  }
  return profiles
}

// ── Filter helper ─────────────────────────────────────────────────────────────

/**
 * Filter a ChampionGearProfile[] by location and fully-equipped flag.
 * 'all' passes both collection and vault champions through.
 */
export function filterChampionProfiles(
  profiles: readonly ChampionGearProfile[],
  location: ChampAnalyticsLocation,
  fullyEquippedOnly: boolean,
): ChampionGearProfile[] {
  return profiles.filter((p) => {
    // Location gate. The builder filters out reserveVault champions, so location here
    // is always either 'collection' or 'vault'.
    if (location !== 'all' && p.champion.location !== location) return false
    // Fully-equipped gate.
    if (fullyEquippedOnly && !p.fullyEquipped) return false
    return true
  })
}

// ── Profile comparator ────────────────────────────────────────────────────────

/**
 * Numeric codes for the `Champs.Affinity` column / WebSocket `Affinity` field
 * (planned). Named constants keep callers honest — `AFFINITY_ROSTER_PRIORITY`
 * and any future affinity-aware logic reference these instead of bare digits.
 */
export const Affinity = {
  Magic:  1,
  Force:  2,
  Spirit: 3,
  Void:   4,
} as const
// eslint-disable-next-line no-redeclare -- share the value name so callers import `Affinity` for both runtime and typing
export type Affinity = number

/**
 * In-game roster priority for the affinity field. Higher number = sorted earlier.
 * Order is Void > Force > Magic > Spirit; unknown / unmapped affinities get the
 * lowest priority so they sort to the end of their (rarity, empowerment) group.
 */
const AFFINITY_ROSTER_PRIORITY: Readonly<Record<Affinity, number>> = {
  [Affinity.Void]:   4, // highest
  [Affinity.Force]:  3,
  [Affinity.Magic]:  2,
  [Affinity.Spirit]: 1, // lowest
}

/** Resolve the roster-sort priority for an affinity code; null / unknown → -1. */
function affinityRosterPriority(affinity: number | null): number {
  if (affinity == null) return -1
  return AFFINITY_ROSTER_PRIORITY[affinity as Affinity] ?? -1
}

/**
 * Sort comparator that emulates the in-game default champion roster order
 * ("by rank"). Hierarchy, each step descending unless noted:
 *   1. rarity                  — Mythical (6) → Common (1)
 *   2. champEmpowermentLevel   — DB `EmpLvl`, 0–4 observed; unknown (null) sorts last
 *   3. champBlessingGrade      — Double-Ascension / "Awakening" grade (DB `BGrade`,
 *                                WebSocket `doubleAscend.grade`, 0–6); unknown sorts last
 *   4. champAffinity (Void > Force > Magic > Spirit) — DB `Affinity` 1–4; unknown sorts last
 *   5. champAscensionLevel     — ascended stars beyond base (= HeroID − BaseHeroID, 0–6); null sorts last
 *   6. champStarGrade          — current star count (DB `Rang`, WS `grade`, 1–6); null sorts last
 *   7. champExperienceLevel    — champion XP level (DB `Lvl`, WS `level`, 1–60); null sorts last
 *   8. baseId desc             — empirical tail tiebreaker (RSL internal hero release
 *                                order); confirmed against the in-game vault order
 *   9. championId desc         — same-hero duplicates: newer copy (higher instance id) first
 *
 * Gear-level / average-gear-rank / ascentionCount are excluded because the
 * in-game roster sort does not depend on what gear a champion happens to be wearing.
 */
export function champProfileRankComparator(a: ChampionGearProfile, b: ChampionGearProfile): number {
  const ac = a.champion
  const bc = b.champion
  // 1. Highest champion rarity first (Mythical → Common).
  if ((bc.rarity ?? 0) !== (ac.rarity ?? 0)) return (bc.rarity ?? 0) - (ac.rarity ?? 0)
  // 2. Highest empowerment; unknown (null) sorts last by treating it as -1.
  const aEmp = ac.empowermentLevel ?? -1
  const bEmp = bc.empowermentLevel ?? -1
  if (bEmp !== aEmp) return bEmp - aEmp
  // 3. Blessing grade desc — higher Double-Ascension / Awakening level first.
  const aBg = ac.blessingGrade ?? -1
  const bBg = bc.blessingGrade ?? -1
  if (bBg !== aBg) return bBg - aBg
  // 4. Affinity priority (Void > Force > Magic > Spirit); unknown → -1.
  const aAff = affinityRosterPriority(ac.affinity)
  const bAff = affinityRosterPriority(bc.affinity)
  if (bAff !== aAff) return bAff - aAff
  // 5. Highest ascension level; unknown (null) sorts last.
  const aRank = ac.ascensionLevel ?? -1
  const bRank = bc.ascensionLevel ?? -1
  if (bRank !== aRank) return bRank - aRank
  // 6. Star grade (current yellow-star count) desc — higher first.
  const aSg = ac.starGrade ?? -1
  const bSg = bc.starGrade ?? -1
  if (bSg !== aSg) return bSg - aSg
  // 7. Champion XP level desc — fully-levelled first.
  const aXp = ac.experienceLevel ?? -1
  const bXp = bc.experienceLevel ?? -1
  if (bXp !== aXp) return bXp - aXp
  // 8. BaseHeroID desc — empirical tail tiebreaker. Comparing the in-game vault order
  //    of two otherwise-tied heroes confirmed the higher BaseHeroID comes first.
  //    BaseHeroID has no in-game-visible meaning on its own; it correlates with the
  //    hero's release order, so this effectively puts newer heroes ahead of older
  //    ones when every other sort key ties.
  const aBase = ac.baseHeroId ?? -1
  const bBase = bc.baseHeroId ?? -1
  if (bBase !== aBase) return bBase - aBase
  // 9. Same-hero duplicates: sort the newer instance (higher champion-instance id) first
  //    — confirmed by two copies of the same hero in the in-game roster. Only fires
  //    when every preceding step ties, which in practice means same-hero copies.
  return b.champion.id - a.champion.id
}

// ── Per-champion substat totals ────────────────────────────────────────────────

/**
 * Minimal champion info needed to render the avatar in the range bar.
 * The tiebreaker champion for min/max is resolved inside computeChampSubstatTotalStats.
 */
export type ChampionDisplayInfo = {
  id: number
  name: string
  /** baseHeroId — used for icon lookup; falls back to id when absent. */
  baseId: number | null
  /** Champion rarity rank (1-6) — drives the rarity border color. */
  rarity: number
}

/** Number of equal-width histogram buckets rendered per substat row. */
export const HISTOGRAM_BUCKETS = 10

/** Distribution of per-champion substat totals across the filtered champion set. */
export type ChampSubstatStats = {
  variant: number
  label: string
  /** Lowest total value of this substat across matching champions. */
  min: number
  avg: number
  /** Highest total value of this substat across matching champions. */
  max: number
  /** Number of champions who have at least one piece with this substat. */
  count: number
  /**
   * Equal-width histogram: HISTOGRAM_BUCKETS counts from 0 to max.
   * buckets[i] = number of champions whose total falls in [i * bucketWidth, (i+1) * bucketWidth).
   * The last bucket is inclusive on the right to catch the max value.
   */
  buckets: readonly number[]
  /**
   * Per-champion totals, sorted total-ascending then by tiebreaker (rarity → ascension → level → rank).
   * Used by the hover tooltip to find the nearest champion to the cursor x-position.
   */
  samples: ReadonlyArray<{ total: number; display: ChampionDisplayInfo }>
  /** Champion to display for the min value (tiebreaker-resolved). */
  minChamp: ChampionDisplayInfo | null
  /** Champion to display for the max value (tiebreaker-resolved). */
  maxChamp: ChampionDisplayInfo | null
}

/**
 * Internal per-champion metadata used only for tiebreaking.
 * Tiebreaker order (all descending): rarity → ascensionCount → avgLevel → avgRank.
 */
type ChampMeta = {
  id: number
  name: string
  baseId: number | null
  rarity: number
  /** Count of gear pieces that have an ascension (glyph) stat applied. */
  ascentionCount: number
  /** Sum of gear levels across all equipped pieces (divide by gearCount for avg). */
  levelSum: number
  /** Sum of gear ranks (star grades) across all equipped pieces. */
  rankSum: number
  gearCount: number
}

/** Compare two champions for tiebreaking: higher score = preferred for display. */
function champTiebreaker(a: ChampMeta, b: ChampMeta): number {
  // 1. Highest champion rarity first.
  if (b.rarity !== a.rarity) return b.rarity - a.rarity
  // 2. Most ascension stats on equipped gear.
  if (b.ascentionCount !== a.ascentionCount) return b.ascentionCount - a.ascentionCount
  // 3. Highest average gear level.
  const aAvgLevel = a.gearCount > 0 ? a.levelSum / a.gearCount : 0
  const bAvgLevel = b.gearCount > 0 ? b.levelSum / b.gearCount : 0
  if (bAvgLevel !== aAvgLevel) return bAvgLevel - aAvgLevel
  // 4. Highest average gear rank (star grade).
  const aAvgRank = a.gearCount > 0 ? a.rankSum / a.gearCount : 0
  const bAvgRank = b.gearCount > 0 ? b.rankSum / b.gearCount : 0
  return bAvgRank - aAvgRank
}

/**
 * For each substat variant, sum its `totalValue` (+ optionally `glyphValue`) across
 * all gear equipped to each champion in `activeChampIds`, then compute min / avg /
 * median / max of those per-champion totals.
 *
 * Example: if champ A has SPD on three pieces (15 + 12 + 8 = 35) and champ B
 * has SPD on two pieces (20 + 5 = 25), the SPD row shows min=25, max=35, etc.
 *
 * When `includeGlyphs` is true, each substat's `glyphValue` is added to its
 * `totalValue` — matching the same opt-in approach used by gear-inspector sorting.
 *
 * When multiple champions tie for min or max, the tiebreaker order is:
 * highest champion rarity → most gear with ascension → highest avg gear level → highest avg gear rank.
 */
export function computeChampSubstatTotalStats(
  rows: readonly GearInspectorPreviewRow[],
  activeChampIds: ReadonlySet<number>,
  includeGlyphs: boolean,
): ChampSubstatStats[] {
  // Step 1: accumulate per-champion substat totals and tiebreaker metadata.
  const champTotals = new Map<number, Map<number, number>>()
  const champMeta = new Map<number, ChampMeta>()

  for (const row of rows) {
    const a = row.artifact
    const champion = a.equippedChampion
    if (!champion) continue
    if (!activeChampIds.has(champion.id)) continue
    const id = champion.id

    // Accumulate substat totals.
    let variantMap = champTotals.get(id)
    if (!variantMap) { variantMap = new Map(); champTotals.set(id, variantMap) }
    for (const sub of a.substats) {
      const variant = Number(sub.variant)
      if (variant === StatVariant.Any) continue
      // `totalValue` is pre-glyph (base + myth); add glyphValue when the user opts in.
      const value = sub.totalValue + (includeGlyphs ? sub.glyphValue : 0)
      variantMap.set(variant, (variantMap.get(variant) ?? 0) + value)
    }

    // Accumulate tiebreaker metadata. Using a separate const after the lookup avoids
    // the "possibly undefined" narrowing complaint when noUncheckedIndexedAccess is on.
    let meta = champMeta.get(id)
    if (!meta) {
      meta = {
        id,
        name: champion.name ?? String(id),
        baseId: champion.baseHeroId ?? null,
        rarity: Number(champion.rarity ?? 0),
        ascentionCount: 0,
        levelSum: 0,
        rankSum: 0,
        gearCount: 0,
      }
      champMeta.set(id, meta)
    }
    if (a.ascension !== null) meta.ascentionCount++
    meta.levelSum += Number(a.level)
    meta.rankSum  += Number(a.rank)
    meta.gearCount++
  }

  // Step 2: pivot to per-variant sample arrays (one value per champion), keyed by champId.
  const samples = new Map<number, Array<{ champId: number; total: number }>>()
  for (const [champId, variantMap] of champTotals) {
    for (const [variant, total] of variantMap) {
      let arr = samples.get(variant)
      if (!arr) { arr = []; samples.set(variant, arr) }
      arr.push({ champId, total })
    }
  }

  // Resolve the display champion for a given extreme value (min or max) among all champion totals.
  function resolveChamp(entries: Array<{ champId: number; total: number }>, extremeVal: number): ChampionDisplayInfo | null {
    const tied = entries.filter((e) => e.total === extremeVal).map((e) => champMeta.get(e.champId)!).filter(Boolean)
    if (tied.length === 0) return null
    tied.sort(champTiebreaker)
    const m = tied[0]!
    return { id: m.id, name: m.name, baseId: m.baseId, rarity: m.rarity }
  }

  // Step 3: compute distribution stats and resolve min/max champions.
  const result: ChampSubstatStats[] = []
  for (const [variant, entries] of samples) {
    if (entries.length === 0) continue
    const vals = entries.map((e) => e.total).sort((a, b) => a - b)
    const min = vals[0]!
    const max = vals[vals.length - 1]!
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    // Compute equal-width histogram buckets spanning [0, max]; last bucket is inclusive on the right.
    const bucketWidth = max > 0 ? max / HISTOGRAM_BUCKETS : 1
    const buckets = new Array<number>(HISTOGRAM_BUCKETS).fill(0)
    for (const v of vals) {
      buckets[Math.min(Math.floor(v / bucketWidth), HISTOGRAM_BUCKETS - 1)]! += 1
    }
    // Build samples array for cursor-hover lookup: total ascending, ties broken by tiebreaker.
    const samplesArr: Array<{ total: number; display: ChampionDisplayInfo }> = entries
      .map((e) => {
        const meta = champMeta.get(e.champId)
        return meta ? { total: e.total, meta } : null
      })
      .filter((x): x is { total: number; meta: ChampMeta } => x !== null)
      .sort((a, b) => a.total !== b.total ? a.total - b.total : champTiebreaker(a.meta, b.meta))
      .map((e) => ({
        total: e.total,
        display: { id: e.meta.id, name: e.meta.name, baseId: e.meta.baseId, rarity: e.meta.rarity },
      }))
    result.push({
      variant,
      label: statLabel(variant),
      min, avg, max,
      count: vals.length,
      buckets,
      samples: samplesArr,
      minChamp: resolveChamp(entries, min),
      maxChamp: resolveChamp(entries, max),
    })
  }
  // Sort by the shared analytics substat vocabulary, so the anomalous mode-damage
  // rows land in their canonical order after the classic ones instead of all tying
  // at Infinity (which left them in arbitrary encounter order). Variants outside
  // the vocabulary entirely still sort to the end.
  const priorityOf = (v: number) => {
    const i = ANALYTICS_SUBSTAT_VARIANTS.indexOf(v)
    return i >= 0 ? i : Infinity
  }
  result.sort((a, b) => priorityOf(a.variant) - priorityOf(b.variant))
  return result
}
