/**
 * raritySupplements.ts
 *
 * Shared helpers for Auto rarity supplement defaults.
 */
import type { BuilderConfig } from './hsfBuilder'
import { resolveAutoRarityCode } from './hsfBuilder'
import type { AutoRaritySupplementsThreshold } from './configNormalization'

// Pick the default Auto rarity supplement threshold from a config's resolved rarity.
export function pickAutoRaritySupplementsThreshold(cfg: BuilderConfig): AutoRaritySupplementsThreshold {
  // Resolve the concrete rarity code the Auto mode would choose.
  const code = resolveAutoRarityCode(cfg)
  // ≥ Epic thresholds need the epic branch; otherwise default to rare.
  return (code >= 9) ? 'epic' : 'rare'
}
