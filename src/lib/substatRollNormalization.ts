/**
 * substatRollNormalization.ts
 *
 * Shared normalization helpers for substat-focused UI features (ex: Gear Inspector sorting).
 * These values intentionally reflect the 6★ in-game roll caps so mixed-star gear can be compared
 * on a consistent 0..1 scale without inventing additional tier-specific heuristics.
 */
import { StatVariant, statSupportsGlyphs } from './types'
import { GLYPH_RANGES_BY_RANK, MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT } from './generated/domainConstants'

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

// Clamp gear rank into the main-stat table's covered range (4..6). Ranks below 4 reuse the
// 4★ row: low-rank gear is essentially never safeguarded and lacks reliable level-16 data.
const clampMainStatRank = (rank: number): number => Math.max(4, Math.min(6, Math.floor(Number(rank))))

// Rank-quality ratio of a slot's main stat: the rank's +16 main-stat value divided by the
// 6★ +16 value for the same slot+variant. 6★ → 1.0, 5★ → ~0.81–0.89, 4★ → ~0.67–0.78.
// Intentionally level-independent — it uses the rank's final +16 value (not the current
// level), so a half-leveled and a maxed piece of the same rank contribute the same term and
// leveling alone never changes a piece's safeguard score. Returns 0 for unknown slot/variant.
export function mainStatRankRatio(rank: number, slot: number, variant: number): number {
  const slotKey = Number(slot)
  const variantKey = Number(variant)
  // 6★ value is the denominator; without it the variant is unrecognized → no contribution.
  const cap6 = MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT[6]?.[slotKey]?.[variantKey] ?? 0
  if (!(cap6 > 0)) return 0
  // Numerator is the (clamped) rank's level-16 maximum for the same slot+variant.
  const capRank = MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT[clampMainStatRank(rank)]?.[slotKey]?.[variantKey] ?? 0
  return capRank > 0 ? capRank / cap6 : 0
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
