/**
 * raritySupplements.ts
 *
 * Shared helpers for Auto rarity supplement defaults.
 */
import type { BuilderRecipe } from './hsfBuilder'
import { resolveAutoRarityCode } from './hsfBuilder'
import type { AutoRaritySupplementsThreshold } from './recipeNormalization'

// Pick the default Auto rarity supplement threshold from a recipe's resolved rarity.
export function pickAutoRaritySupplementsThreshold(cfg: BuilderRecipe): AutoRaritySupplementsThreshold {
  // Resolve the concrete rarity code the Auto mode would choose.
  const code = resolveAutoRarityCode(cfg)
  // ≥ Epic thresholds need the epic branch; otherwise default to rare.
  return (code >= 9) ? 'epic' : 'rare'
}
