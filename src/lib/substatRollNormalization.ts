/**
 * substatRollNormalization.ts
 *
 * Shared normalization helpers for substat-focused UI features (ex: Gear Inspector sorting).
 * These values intentionally reflect the 6★ in-game roll caps so mixed-star gear can be compared
 * on one consistent scale without inventing additional tier-specific heuristics: one 6★ roll's
 * worth scores 1.0, and totals exceed 1 with further rolls so "more/better rolls" stays ordered.
 */
import { StatVariant, statSupportsGlyphs, flatToPercentSubstatVariant, slotSupportsAnyPercentSubstat } from './types'
import { ANOMALOUS_SUBSTAT_ROLL_VALUE_MAX, ANOMALOUS_SUBSTAT_VARIANTS } from './anomalousAccessories'
import {
  GLYPH_RANGES_BY_RANK,
  MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT,
  SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT,
  SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT,
  SAFEGUARD_SCORE_MAIN_ALIGNED_FLAT_EPSILON_WEIGHT,
} from './generated/domainConstants'

// 6★ per-roll maximums for substats (same units as `totalValue` / `glyphValue` from gearDbNormalizer).
// Why: these caps are the most stable reference point across the app (builder + Gear Inspector) and match samples.
// The anomalous entries are appended from the shared rank table: their 6★ per-line value (1.5%) is an
// EXACT cap rather than a sampled maximum, because these stats have no roll variance — every line is worth
// exactly its rank value. All eight share it, damage-taken included: those fold to magnitude at ingest, and
// taking less damage is as desirable as dealing more, so they normalize on the same scale as the dealt family.
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
  ...Object.fromEntries(ANOMALOUS_SUBSTAT_VARIANTS.map((variant) => [variant, ANOMALOUS_SUBSTAT_ROLL_VALUE_MAX])),
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

// Per-substat contribution to a glyph-aware normalized gear score: the weighted normalized
// current value plus, when the substat is present, the weighted normalized average glyph
// potential for the piece's rank. Glyphs apply at every rank but are capped to the gear's
// rank tier (a 6★ gets stronger glyphs than a 5★), which is exactly how getGlyphAverageForVariant
// is keyed — so a 6★ outscores an equal-substat 5★ on glyphable stats without inventing a multiplier.
// SSOT shared by the safeguard scorer (safeguards.ts) and the Gear Inspector normalized sort
// (gearInspectorSort.ts) so both rank mixed-star gear by the same formula. CR/CDMG are non-glyphable
// (getGlyphAverageForVariant returns 0), so they contribute no rank separation here by design — their
// 5★/6★ ordering is settled by the caller's rank tie-breaker instead.
// Epsilon tie-break ladder for substats PRESENT on the piece but NOT in the caller's
// selection (selected lines always score at their real weight). The tiers are FIXED per-line
// bonuses — deliberately NOT scaled by roll value: the epsilon only marks a line's *category*
// (useful vs padding vs relevance-aligned padding); comparing roll quality is what the real
// weights are for. Per unselected present line (all tiers far below the user weight floor of
// 0.01, so stacking can never outweigh an explicit selection; no glyph terms):
//   - non-flat line (spd/cr/cdmg/res/acc/%stat): SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT
//   - flat HP/ATK/DEF line whose percent twin IS selected: SELECTED_ALIGNED_FLAT weight
//   - flat line whose percent twin is the piece's own main stat: MAIN_ALIGNED_FLAT weight
//     (additive with the previous, so a doubly-aligned flat outranks a singly-aligned one)
//   - unrelated flat line: exactly 0
// The whole ladder is INERT on slots whose substat pool has no percent variants (amulet):
// demoting flats against percent twins is meaningless where twins can't roll, so amulets
// rank purely by selected substats + main-stat bonus and ties fall to the provable
// tie-breakers. Unknown slots keep the ladder (conservative armor-like fallback).
// SSOT shared by the safeguard scorer mirror (safeguards.ts) and the Gear Inspector
// normalized sort (gearInspectorSort.ts); mirrors Rust
// safeguard_unselected_substat_epsilon_bonus (safeguards/mod.rs).
export function unselectedSubstatEpsilonBonus(
  substats: ReadonlyArray<{ variant: number; value: number }>,
  selectedVariants: ReadonlyArray<number>,
  // The piece's own main-stat variant; undefined/unknown simply disables main alignment.
  mainStatVariant?: number | undefined,
  // The piece's slot for the percent-free-pool gate; undefined/unknown slots keep the ladder.
  slot?: number | undefined,
): number {
  // Slot-level gate: a known pool without any percent variant (amulet) skips the ladder.
  if (slot !== undefined && !slotSupportsAnyPercentSubstat(slot)) return 0
  let bonus = 0
  for (const { variant, value } of substats) {
    // Selected substats (flat or not) already score at their real weight.
    if (selectedVariants.includes(variant)) continue
    // Presence gate: unknown variants and absent/invalid values normalize to 0 and drop out.
    // Only presence matters — the bonus below is per-line, not value-scaled.
    if (normalizeSubstatByMax6(variant as StatVariant, value) <= 0) continue
    const percentTwin = flatToPercentSubstatVariant(variant)
    if (percentTwin !== null) {
      // Flat line: only relevance-aligned flats earn a micro tie-break.
      if (selectedVariants.includes(percentTwin)) bonus += SAFEGUARD_SCORE_SELECTED_ALIGNED_FLAT_EPSILON_WEIGHT
      if (Number(mainStatVariant) === percentTwin) bonus += SAFEGUARD_SCORE_MAIN_ALIGNED_FLAT_EPSILON_WEIGHT
    } else {
      // Useful non-flat line: the top epsilon tier.
      bonus += SAFEGUARD_SCORE_NON_FLAT_EPSILON_WEIGHT
    }
  }
  return bonus
}

export function substatNormalizedContribution(
  rank: number,
  variant: StatVariant,
  currentValue: number,
  weight: number,
): number {
  // Normalized current value on the shared 6★ per-roll scale, biased by the caller's weight.
  let total = weight * normalizeSubstatByMax6(variant, currentValue)
  // Glyph potential only counts for substats that actually exist on the piece (rolled),
  // mirroring the safeguard scorer's "present substat" gate.
  if (currentValue > 0) {
    const glyphAvg = getGlyphAverageForVariant(rank, variant)
    if (glyphAvg > 0) {
      total += weight * normalizeSubstatByMax6(variant, glyphAvg)
    }
  }
  return total
}
