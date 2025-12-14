/**
 * substatRollNormalization.ts
 *
 * Shared normalization helpers for substat-focused UI features (ex: Rule Tester sorting).
 * These values intentionally reflect the 6★ in-game roll caps so mixed-star gear can be compared
 * on a consistent 0..1 scale without inventing additional tier-specific heuristics.
 */
import { StatVariant } from './types'

// 6★ per-roll maximums for substats (same units as `totalValue` / `glyphValue` from gearDbNormalizer).
// Why: these caps are the most stable reference point across the app (builder + tester) and match samples.
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

export function normalizeSubstatByMax6(variant: StatVariant, rawValue: number): number {
  // Missing stats are treated as 0 upstream; keep that contract by returning 0 for invalid inputs too.
  const max = SUBSTAT_ROLL_MAX_6_BY_VARIANT[Number(variant)]
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return 0
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) return 0
  // Clamp to protect against glyph+base overflow or out-of-spec imports while keeping ordering monotonic.
  return Math.max(0, Math.min(1, value / max))
}

