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
