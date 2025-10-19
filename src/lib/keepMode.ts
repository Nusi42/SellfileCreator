/**
 * keepMode.ts
 *
 * Single source of truth for when Milestone Thresholds (Early/Late) are active.
 * Active when any per‑stat minimum is set (min > 0) or a global minimum is set (> 0).
 */
import type { BuilderConfig } from './hsfBuilder'

export type AutoRaritySupplementsThreshold = 'uncommon' | 'rare' | 'epic'

const AUTO_RARITY_DEFAULT_STORAGE_KEY = 'sellfileCreator.builder.autoRarityThresholdDefault.v1'

const isAutoRaritySupplementsThreshold = (value: unknown): value is AutoRaritySupplementsThreshold => (
  value === 'uncommon' || value === 'rare' || value === 'epic'
)

/** Read the persisted Auto ≥ default; falls back to Rare when unavailable. */
export const readAutoRaritySupplementsDefault = (): AutoRaritySupplementsThreshold => {
  if (typeof localStorage === 'undefined') return 'rare'
  try {
    const raw = localStorage.getItem(AUTO_RARITY_DEFAULT_STORAGE_KEY)
    if (isAutoRaritySupplementsThreshold(raw)) {
      return raw
    }
  } catch {
    // ignore — localStorage access is best-effort
  }
  return 'rare'
}

/** Persist the Auto ≥ default for future sessions. */
export const writeAutoRaritySupplementsDefault = (value: AutoRaritySupplementsThreshold): void => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(AUTO_RARITY_DEFAULT_STORAGE_KEY, value)
  } catch {
    // ignore — localStorage access is best-effort
  }
}

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

export function normalizeAutoSubstatFlex<T extends FlexConfigShape & Pick<BuilderConfig, 'autoSubstatFlex'>>(cfg: T): T {
  if (cfg.autoSubstatFlex && !canEnableSubstatFlex(cfg)) {
    return { ...cfg, autoSubstatFlex: false } as T
  }
  return cfg
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
>>(cfg: T, options?: { defaultThreshold?: AutoRaritySupplementsThreshold }): T {
  const active = isMilestoneThresholdsActive(cfg)
  const applicable = (cfg.rarityMode === 'auto') && (cfg.earlyKeepMode === 'late') && active
  if (!applicable) {
    if (cfg.autoRaritySupplementsThreshold == null) {
      return cfg
    }
    // Remove the optional key to satisfy exactOptionalPropertyTypes
    const { autoRaritySupplementsThreshold: _omit, ...rest } = cfg as unknown as Record<string, unknown>
    return rest as T
  }
  if (isAutoRaritySupplementsThreshold(cfg.autoRaritySupplementsThreshold)) {
    return cfg
  }
  const fallback = options?.defaultThreshold ?? 'rare'
  return { ...cfg, autoRaritySupplementsThreshold: fallback } as T
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

type LevelMilestone = 0 | 4 | 8 | 12 | 16
const LEVEL_VALUES: readonly LevelMilestone[] = [0, 4, 8, 12, 16]

const isLevelMilestone = (value: unknown): value is LevelMilestone => {
  return LEVEL_VALUES.includes(value as LevelMilestone)
}

/**
 * Keep min/max level milestones within the allowed window and maintain `min <= max`.
 * Falls back to the builder defaults (0/16) when values are missing or invalid.
 */
export function normalizeLevelWindow<T extends Pick<BuilderConfig, 'minLevel' | 'maxLevel'>>(cfg: T): T {
  const defaultMin: LevelMilestone = 0
  const defaultMax: LevelMilestone = 16
  let min: LevelMilestone = isLevelMilestone(cfg.minLevel) ? cfg.minLevel! : defaultMin
  let max: LevelMilestone = isLevelMilestone(cfg.maxLevel) ? cfg.maxLevel! : defaultMax
  if (min > max) {
    // Preserve the user-selected milestone by clamping the opposite bound.
    if (isLevelMilestone(cfg.minLevel) && !isLevelMilestone(cfg.maxLevel)) {
      max = min
    } else {
      min = max
    }
  }
  if (!isLevelMilestone(min)) min = defaultMin
  if (!isLevelMilestone(max)) max = defaultMax
  if (min > max) min = max
  return { ...cfg, minLevel: min, maxLevel: max } as T
}
