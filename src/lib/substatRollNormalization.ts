/**
 * substatRollNormalization.ts
 *
 * Shared normalization helpers for substat-focused UI features (ex: Gear Inspector sorting).
 * These values intentionally reflect the 6★ in-game roll caps so mixed-star gear can be compared
 * on a consistent 0..1 scale without inventing additional tier-specific heuristics.
 */
import { StatVariant, statSupportsGlyphs } from './types'
import { GLYPH_RANGES_BY_RANK } from './generated/domainConstants'

// 6★ per-roll maximums for substats (same units as `totalValue` / `glyphValue` from gearDbNormalizer).
// Why: these caps are the most stable reference point across the app (builder + Gear Inspector) and match samples.
export const SUBSTAT_ROLL_MAX_6_BY_VARIANT: Readonly<Record<number, number>> = Object.freeze({
  [StatVariant.HP_FLAT]: 565,
  [StatVariant.HP]: 7,
  [StatVariant.ATK_FLAT]: 30,
  [StatVariant.ATK]: 7,
  [StatVariant.DEF_FLAT]: 30,
  [StatVariant.DEF]: 7,
  [StatVariant.SPD]: 6,
  [StatVariant.RES]: 12,
  [StatVariant.ACC]: 12,
  [StatVariant.CR]: 7,
  [StatVariant.CDMG]: 7,
})

// Average glyph enchantment value for a given gear rank and substat variant.
// Source data lives in shared/domain-constants.json → GLYPH_RANGES_BY_RANK (SSOT).
// Returns 0 for non-glyphable variants (CR, CDMG) or invalid rank/variant.
export function getGlyphAverageForVariant(rank: number, variant: number): number {
  if (!statSupportsGlyphs(variant)) return 0
  const clampedRank = Math.max(1, Math.min(6, Math.floor(Number(rank))))
  if (!Number.isFinite(clampedRank)) return 0
  const range = GLYPH_RANGES_BY_RANK[clampedRank]?.[variant]
  if (!range) return 0
  return (range.min + range.max) / 2
}

export function normalizeSubstatByMax6(variant: StatVariant, rawValue: number): number {
  // Missing stats are treated as 0 upstream; keep that contract by returning 0 for invalid inputs too.
  const max = SUBSTAT_ROLL_MAX_6_BY_VARIANT[Number(variant)]
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return 0
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) return 0
  // Normalized sorting compares totals, not single-roll quality, so allow values > 1 when the stat has multiple rolls.
  // This keeps ordering faithful to "more (or better) rolls = higher score" while still using the same per-roll cap scale.
  return Math.max(0, value / max)
}
