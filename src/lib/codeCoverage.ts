/**
 * codeCoverage.ts
 *
 * Shared helpers to map HSF rank/rarity codes (0..16) to the discrete
 * underlying values used by UI filters and evaluators.
 */

import { RANK_VALUES, type RankValue } from './types'

/** Map a rank code (0..16) to the set of star values 1..6. */
export function rankCoverage(code?: number): Set<RankValue> {
  if (code === undefined || code === null || code === 0) return new Set(RANK_VALUES)
  const n = Number(code)
  if (n >= 1 && n <= 6) return new Set([n as RankValue])
  if (n >= 7 && n <= 11) return new Set(RANK_VALUES.filter(v => v >= (n - 6)) as RankValue[])
  if (n >= 12 && n <= 16) return new Set(RANK_VALUES.filter(v => v <= (n - 10)) as RankValue[])
  return new Set(RANK_VALUES)
}

/** Map a rarity code (0..16) to the set of discrete rarity values 1..6 (Common..Mythical). */
export function rarityCoverage(code?: number): Set<RankValue> {
  if (code === undefined || code === null || code === 0) return new Set(RANK_VALUES)
  const n = Number(code)
  switch (n) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return new Set([n as RankValue])
    case 15:
      return new Set([6 as RankValue])
    case 6:
      return new Set(RANK_VALUES)
    case 7:
      return new Set(RANK_VALUES.filter(v => v >= 2) as RankValue[])
    case 8:
      return new Set(RANK_VALUES.filter(v => v >= 3) as RankValue[])
    case 9:
      return new Set(RANK_VALUES.filter(v => v >= 4) as RankValue[])
    case 16:
      return new Set(RANK_VALUES.filter(v => v >= 5) as RankValue[])
    case 10:
      return new Set(RANK_VALUES.filter(v => v <= 2) as RankValue[])
    case 11:
      return new Set(RANK_VALUES.filter(v => v <= 3) as RankValue[])
    case 12:
      return new Set(RANK_VALUES.filter(v => v <= 4) as RankValue[])
    case 13:
      return new Set(RANK_VALUES.filter(v => v <= 5) as RankValue[])
    case 14:
      return new Set(RANK_VALUES)
    default:
      return new Set(RANK_VALUES)
  }
}
