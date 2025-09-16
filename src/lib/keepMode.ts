/**
 * keepMode.ts
 *
 * Single source of truth for when Milestone Thresholds (Early/Late) are active.
 * Active when any per‑stat minimum is set (min > 0) or a global minimum is set (> 0).
 */
import type { BuilderConfig } from './hsfBuilder'

export function isMilestoneThresholdsActive(cfg: Pick<BuilderConfig, 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls'>): boolean {
  try {
    const bV = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
    const hasPerStatMin = Object.values(bV).some(x => typeof x?.min === 'number' && (x.min ?? 0) > 0)
    const hasGlobalMin = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && (cfg.minRequiredRolls as number) > 0
    return hasPerStatMin || hasGlobalMin
  } catch {
    return false
  }
}



/** Normalize keep mode to 'early' when thresholds are inactive. */
export function normalizeKeepMode<T extends Pick<BuilderConfig, 'earlyKeepMode' | 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls'>>(cfg: T): T {
  if (!isMilestoneThresholdsActive(cfg)) {
    return { ...cfg, earlyKeepMode: 'early' } as T
  }
  return cfg
}

/**
 * Normalize the Auto Rarity supplements flag.
 * - Clears the flag when Rarity is not Auto, when thresholds are inactive, or when Keep Mode is not Late.
 * - Keeps the flag as-is only for Late + Auto with active thresholds.
 */
export function normalizeAutoRaritySupplements<T extends Pick<BuilderConfig,
  'rarityMode' | 'earlyKeepMode' | 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls' | 'autoRaritySupplementsThreshold'
>>(cfg: T): T {
  const active = isMilestoneThresholdsActive(cfg)
  const applicable = (cfg.rarityMode === 'auto') && (cfg.earlyKeepMode === 'late') && active
  if (applicable) return cfg
  // Remove the optional key to satisfy exactOptionalPropertyTypes
  const { autoRaritySupplementsThreshold: _omit, ...rest } = cfg as unknown as Record<string, unknown>
  return rest as T
}
