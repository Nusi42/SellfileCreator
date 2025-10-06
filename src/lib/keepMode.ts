/**
 * keepMode.ts
 *
 * Single source of truth for when Milestone Thresholds (Early/Late) are active.
 * Active when any per‑stat minimum is set (min > 0) or a global minimum is set (> 0).
 */
import type { BuilderConfig, SellfileMode } from './hsfBuilder'

type FlexConfigShape = Pick<BuilderConfig,
  'autoMinCount' | 'minCount' | 'substatsV' | 'fixedSubstatsV' | 'substatRollBoundsV' |
  'autoMinRequiredRolls' | 'minRequiredRolls' | 'substatMinTarget'
>

/**
 * Decide whether auto substat flex is meaningful for the current configuration.
 *
 * Requirements:
 * - Manual min-count with spare selectable substats.
 * - At least one optional substat that behaves as a wildcard (no explicit min/max).
 * - Flex adds coverage only when optional stats have a minimum roll requirement, or
 *   when the aggregate minimum exceeds the targeted substat count (forcing extras).
 */
export function canEnableSubstatFlex(cfg: FlexConfigShape): boolean {
  try {
    if (cfg.autoMinCount) return false
    const minCount = Number(cfg.minCount ?? 0)
    const selected = Array.isArray(cfg.substatsV) ? cfg.substatsV.map(Number) : []
    if (selected.length === 0) return false
    const fixed = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV.map(Number) : []
    const fixedSet = new Set<number>(fixed)
    const lockedCount = selected.filter(v => fixedSet.has(v)).length
    const effectiveRequired = Math.max(minCount, lockedCount)
    if (selected.length <= effectiveRequired) return false

    const bounds = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
    const optional = selected.filter(v => !fixedSet.has(v))

    const hasPureWildcardOptional = optional.some(v => {
      const b = bounds[Number(v)]
      const hasMin = typeof b?.min === 'number' && b.min > 0
      const hasMax = typeof b?.max === 'number'
      const wildcard = (b?.any === true) || (!b && true)
      return wildcard && !hasMin && !hasMax
    })
    if (!hasPureWildcardOptional) return false

    const hasOptionalMin = optional.some(v => {
      const b = bounds[Number(v)]
      return typeof b?.min === 'number' && b.min > 0
    })

    const globalMinActive = (cfg.autoMinRequiredRolls === false) && typeof cfg.minRequiredRolls === 'number' && cfg.minRequiredRolls > 0
    const targetedCount = (cfg.substatMinTarget === 'locked') ? lockedCount : effectiveRequired
    const needsFlexForAggregate = globalMinActive && (cfg.minRequiredRolls as number) > targetedCount

    return hasOptionalMin || needsFlexForAggregate
  } catch {
    return false
  }
}

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

/**
 * Ensure the min-rolls target falls back to selected substats when no substats are locked.
 */
export function normalizeSubstatMinTarget<T extends Pick<BuilderConfig, 'substatMinTarget' | 'fixedSubstatsV'>>(cfg: T): T {
  try {
    const fixed = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV : []
    if ((cfg.substatMinTarget ?? 'selected') === 'locked' && fixed.length === 0) {
      return { ...cfg, substatMinTarget: 'selected' } as T
    }
    return cfg
  } catch {
    return cfg
  }
}

/**
 * Align sellfile visibility flags so `enabled` mirrors the resolved mode.
 */
export function normalizeSellfileVisibility<T extends Pick<BuilderConfig, 'sellfileMode' | 'enabled'>>(cfg: T): T {
  const mode: SellfileMode = (() => {
    const raw = cfg.sellfileMode
    if (raw === 'enabled' || raw === 'hidden' || raw === 'draft') return raw
    const explicitlyDisabled = (cfg as { enabled?: boolean }).enabled === false
    return explicitlyDisabled ? 'hidden' : 'enabled'
  })()
  const normalizedEnabled = mode === 'enabled'
  const currentMode = cfg.sellfileMode
  const currentEnabled = (cfg as { enabled?: boolean }).enabled
  if (currentMode === mode && (currentEnabled ?? true) === normalizedEnabled) {
    return cfg
  }
  return { ...cfg, sellfileMode: mode, enabled: normalizedEnabled } as T
}
