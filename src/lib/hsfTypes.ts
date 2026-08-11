/**
 * hsfTypes.ts
 *
 * Types for the RSL Helper HSF rule and file schema used by this app.
 */

export interface HsfSubstat {
  ID: number
  Value: number
  IsFlat: boolean
  Condition: string
  NotAvailable?: boolean
}

export interface HsfRule {
  /** Builder recipe index (1-based) for host integrations that expect stable IDs. */
  RecipeID?: number
  /** Optional builder recipe name (trimmed) so exported HSF stays human-readable. */
  RecipeName?: string
  /** Final 1-based order of this row in the exported Rules array for downstream tracing. */
  RowIdx?: number
  Keep?: boolean
  Use?: boolean
  IsRuleTypeAND?: boolean
  ArtifactSet?: number[]
  ArtifactType?: number[]
  Rank?: number
  Rarity?: number
  MainStatID?: number
  MainStatF?: number
  LVLForCheck?: number
  Faction?: number
  Substats: HsfSubstat[]
}

export interface HsfFile {
  Rules: HsfRule[]
}

// HSF wiring helpers: decode a StatVariant into HSF tuple shapes.
// These helpers are used only when mapping app state to/from HSF schema
// or when formatting for readability. Do not use them in SFC parsing.
import type { RankValue, StatVariantLike } from './types'
import { RANK_VALUES, StatId, StatVariant } from './types'
// placeholder-substat detection + variant bit layout for the
// honest-tuple branch in variantToSub (Update 11.70 Anomalous Accessories).
import { isAnomalousSubstatVariant } from './anomalousAccessories'
import { STAT_VARIANT_ID_MASK, STAT_VARIANT_SHIFT_BITS } from './generated/domainConstants'

const RANK_MASK_ALL = RANK_VALUES.reduce((mask, value) => mask | (1 << (Number(value) - 1)), 0)
const RARITY_MASK_ALL = RANK_MASK_ALL

const rankRangeMask = (min: number, max: number): number => {
  const lo = Math.max(1, Math.min(6, Math.floor(min)))
  const hi = Math.max(lo, Math.min(6, Math.floor(max)))
  let mask = 0
  for (let value = lo; value <= hi; value += 1) {
    mask |= 1 << (value - 1)
  }
  return mask
}

export function rankMask(code?: number): number {
  if (code === undefined || code === null || code === 0) {
    return RANK_MASK_ALL
  }
  const n = Number(code)
  if (Number.isNaN(n)) return RANK_MASK_ALL
  if (n >= 1 && n <= 6) {
    return 1 << (n - 1)
  }
  if (n >= 7 && n <= 11) {
    return rankRangeMask(n - 6, 6)
  }
  if (n >= 12 && n <= 16) {
    return rankRangeMask(1, n - 10)
  }
  return RANK_MASK_ALL
}

/** Convert a variant into HSF main stat tuple (id,f). */
export function variantToMain(v: StatVariantLike): { id: number; f?: number } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: StatId.HP, f: 0 }
    case StatVariant.HP_FLAT: return { id: StatId.HP, f: 1 }
    case StatVariant.ATK: return { id: StatId.ATK, f: 0 }
    case StatVariant.ATK_FLAT: return { id: StatId.ATK, f: 1 }
    case StatVariant.DEF: return { id: StatId.DEF, f: 0 }
    case StatVariant.DEF_FLAT: return { id: StatId.DEF, f: 1 }
    case StatVariant.SPD: return { id: StatId.SPD, f: 1 }
    case StatVariant.RES: return { id: StatId.RES, f: 1 }
    case StatVariant.ACC: return { id: StatId.ACC, f: 1 }
    case StatVariant.CR: return { id: StatId.CR, f: 0 }
    case StatVariant.CDMG: return { id: StatId.CDMG, f: 0 }
    case StatVariant.Any:
    default: return { id: StatId.Any, f: 1 }
  }
}

/** Convert a variant into HSF substat tuple (id,isFlat). */
export function variantToSub(v: StatVariantLike): { id: number; isFlat?: boolean } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: StatId.HP, isFlat: false }
    case StatVariant.HP_FLAT: return { id: StatId.HP, isFlat: true }
    case StatVariant.ATK: return { id: StatId.ATK, isFlat: false }
    case StatVariant.ATK_FLAT: return { id: StatId.ATK, isFlat: true }
    case StatVariant.DEF: return { id: StatId.DEF, isFlat: false }
    case StatVariant.DEF_FLAT: return { id: StatId.DEF, isFlat: true }
    case StatVariant.SPD: return { id: StatId.SPD, isFlat: true }
    case StatVariant.RES: return { id: StatId.RES, isFlat: true }
    case StatVariant.ACC: return { id: StatId.ACC, isFlat: true }
    case StatVariant.CR: return { id: StatId.CR, isFlat: false }
    case StatVariant.CDMG: return { id: StatId.CDMG, isFlat: false }
    case StatVariant.RollCount: return { id: StatId.RollCount, isFlat: true }
    case StatVariant.Any:
    default:
      // Anomalous substats keep their REAL DB stat id so
      // rule conditions match exactly the gear that carries them, instead of
      // silently widening to the "Any substat" tuple. Only their sellfile RULE
      // encoding is unconfirmed — the export boundary (hsfIO scrub) strips them
      // before anything reaches RSL Helper.
      if (isAnomalousSubstatVariant(n)) {
        return { id: (n >>> STAT_VARIANT_SHIFT_BITS) & STAT_VARIANT_ID_MASK, isFlat: false }
      }
      return { id: StatId.Any, isFlat: true }
  }
}

/** Map a rank code (0..16) to the set of star values 1..6. */
export function rankCoverage(code?: number): Set<RankValue> {
  const mask = rankMask(code)
  const values: RankValue[] = []
  for (let i = 0; i < RANK_VALUES.length; i += 1) {
    if ((mask & (1 << i)) !== 0) {
      values.push(RANK_VALUES[i] as RankValue)
    }
  }
  return new Set(values)
}

/**
 * Collapse a set of discrete 1..6 values (ranks or rarities) to a single edge-anchored
 * comparison operator, or null when the explicit list should be shown instead.
 *
 * Returns `≥ min` only when the values form a gap-free run reaching the max (6), and `≤ max`
 * only when they reach the min (1). Lists with gaps, single values, or runs touching neither
 * edge return null. A full 1..6 run touches both edges and also returns null (means "any").
 * Shared SSOT for the safeguard chip summary's rank and rarity segments.
 */
export function collapseRankRunToOperator(
  values: readonly number[],
): { op: '≥' | '≤'; boundary: number } | null {
  const uniq = [...new Set(values.map(Number))].sort((a, b) => a - b)
  if (uniq.length < 2) return null
  const min = uniq[0]!, max = uniq[uniq.length - 1]!
  // Reject lists with gaps: a contiguous run spans exactly (length - 1).
  if (max - min !== uniq.length - 1) return null
  const top = Number(RANK_VALUES[RANK_VALUES.length - 1])  // 6
  const bottom = Number(RANK_VALUES[0])                    // 1
  if (max === top && min > bottom) return { op: '≥', boundary: min }
  if (min === bottom && max < top) return { op: '≤', boundary: max }
  return null  // full range (both edges) → leave explicit
}

/** Map a rarity code (0..16) to the set of discrete rarity values 1..6 (Common..Mythical). */
export function rarityMask(code?: number): number {
  if (code === undefined || code === null) return RARITY_MASK_ALL
  const n = Number(code)
  switch (n) {
    case 0:
    case 6:
    case 14:
      return RARITY_MASK_ALL
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return 1 << (n - 1)
    case 15:
      return 1 << (6 - 1)
    case 7:
      return rankRangeMask(2, 6)
    case 8:
      return rankRangeMask(3, 6)
    case 9:
      return rankRangeMask(4, 6)
    case 16:
      return rankRangeMask(5, 6)
    case 10:
      return rankRangeMask(1, 2)
    case 11:
      return rankRangeMask(1, 3)
    case 12:
      return rankRangeMask(1, 4)
    case 13:
      return rankRangeMask(1, 5)
    default:
      return RARITY_MASK_ALL
  }
}

export function rarityCoverage(code?: number): Set<RankValue> {
  const mask = rarityMask(code)
  const values: RankValue[] = []
  for (let i = 0; i < RANK_VALUES.length; i += 1) {
    if ((mask & (1 << i)) !== 0) {
      values.push(RANK_VALUES[i] as RankValue)
    }
  }
  return new Set(values)
}
