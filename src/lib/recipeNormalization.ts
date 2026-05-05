/**
 * recipeNormalization.ts
 *
 * Shared helpers that keep builder recipes internally consistent — deciding when
 * Auto Substat Flex applies, normalising keep modes, rarity supplements, level
 * windows, and related aggregate roll targets. Used by the builder UI, SFC IO,
 * and merge layer so they all agree on the same rules.
 */
import type { BuilderRecipe } from './hsfBuilder'
import { LEVEL_MILESTONES, type LevelMilestone, isLevelMilestone } from './types'

export type AutoRaritySupplementsThreshold = 'uncommon' | 'rare' | 'epic'

const isAutoRaritySupplementsThreshold = (value: unknown): value is AutoRaritySupplementsThreshold => (
  value === 'uncommon' || value === 'rare' || value === 'epic'
)

type FlexRecipeShape = Pick<BuilderRecipe,
  'autoMinCount' | 'minCount' | 'substatsV' | 'fixedSubstatsV' | 'substatRollBoundsV' |
  'autoMinRequiredRolls' | 'minRequiredRolls'
>

/**
 * Decide whether auto substat flex is meaningful for the current recipe.
 *
 * Requirements:
 * - Manual min-count with spare selectable substats.
 * - At least one optional substat that behaves as a wildcard (no explicit min/max).
 * - Flex adds coverage only when optional stats have a minimum roll requirement, or
 *   when the aggregate minimum exceeds the targeted substat count (forcing extras).
 */
export function canEnableSubstatFlex(recipe: FlexRecipeShape): boolean {
  try {
    if (recipe.autoMinCount) return false
    const minCount = Number(recipe.minCount ?? 0)
    const selected = Array.isArray(recipe.substatsV) ? recipe.substatsV.map(Number) : []
    if (selected.length === 0) return false
    const fixed = Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.map(Number) : []
    const fixedSet = new Set<number>(fixed)
    const lockedCount = selected.filter(v => fixedSet.has(v)).length
    const effectiveRequired = Math.max(minCount, lockedCount)
    if (selected.length <= effectiveRequired) return false

    const bounds = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
    // "Not" substats are excluded from the flexible pool — they carry a ¬ condition,
    // not a roll count, and don't participate in combination rotation.
    const optional = selected.filter(v => !fixedSet.has(v) && bounds[Number(v)]?.not !== true)

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

    const globalMinActive = (recipe.autoMinRequiredRolls === false) && typeof recipe.minRequiredRolls === 'number' && recipe.minRequiredRolls > 0
    const targetedCount = isLockedAggregateScopeActive(recipe, { lockedCountOverride: lockedCount }) ? lockedCount : effectiveRequired
    const needsFlexForAggregate = globalMinActive && (recipe.minRequiredRolls as number) > targetedCount

    if (hasOptionalMin || needsFlexForAggregate) return true
    // Even without per-stat mins or an aggregate bump, allow flex when we have
    // at least one wildcard optional so recipes can rotate the slot at milestones
    // where an extra substat becomes available (e.g., Epic at +16 vs Legendary at +0).
    return hasPureWildcardOptional
  } catch {
    return false
  }
}

export function normalizeAutoSubstatFlex<T extends FlexRecipeShape & Pick<BuilderRecipe, 'autoSubstatFlex'>>(recipe: T): T {
  if (recipe.autoSubstatFlex && !canEnableSubstatFlex(recipe)) {
    return { ...recipe, autoSubstatFlex: false } as T
  }
  return recipe
}

export function isMilestoneThresholdsActive(recipe: Pick<BuilderRecipe, 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls' | 'lockedMinRequiredRolls' | 'fixedSubstatsV'>): boolean {
  try {
    if (hasSubstatThresholds(recipe)) return true
    if (hasManualAggregateMin(recipe)) return true
    if (isLockedAggregateActive(recipe)) return true
    return false
  } catch {
    return false
  }
}



/** Normalize keep mode to 'early' when thresholds are inactive. */
export function normalizeKeepMode<T extends Pick<BuilderRecipe, 'earlyKeepMode' | 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls'>>(recipe: T): T {
  if (!isMilestoneThresholdsActive(recipe)) {
    return { ...recipe, earlyKeepMode: 'early' } as T
  }
  return recipe
}

/**
 * Normalize the Auto Rarity supplements flag.
 * - Clears the flag when Rarity is not Auto, when thresholds are inactive, or when Keep Mode is not Late.
 * - Keeps the flag as-is only for Late + Auto with active thresholds.
 */
export function normalizeAutoRaritySupplements<T extends Pick<BuilderRecipe,
  'rarityMode' | 'earlyKeepMode' | 'substatRollBoundsV' | 'autoMinRequiredRolls' | 'minRequiredRolls' | 'autoRaritySupplementsThreshold'
>>(recipe: T, options?: { defaultThreshold?: AutoRaritySupplementsThreshold }): T {
  const active = isMilestoneThresholdsActive(recipe)
  const applicable = (recipe.rarityMode === 'auto') && (recipe.earlyKeepMode === 'late') && active
  if (!applicable) {
    if (recipe.autoRaritySupplementsThreshold == null) {
      return recipe
    }
    // Remove the optional key to satisfy exactOptionalPropertyTypes
    const { autoRaritySupplementsThreshold: _omit, ...rest } = recipe as unknown as Record<string, unknown>
    return rest as T
  }
  if (isAutoRaritySupplementsThreshold(recipe.autoRaritySupplementsThreshold)) {
    return recipe
  }
  const fallback = options?.defaultThreshold ?? 'rare'
  return { ...recipe, autoRaritySupplementsThreshold: fallback } as T
}

/**
 * Keep the aggregate scope aligned with the locked aggregate floor:
 * - When a locked-only aggregate floor exists (value > 0 and locked substats present), force the scope to 'locked'.
 * - Otherwise default to 'selected' so the total applies across all targeted substats.
 */
const clampAggregateRollRequirement = (value: unknown): 0 | 1 | 2 | 3 | 4 | 5 => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.round(num)
  const clamped = Math.max(0, Math.min(5, rounded))
  return clamped as 0 | 1 | 2 | 3 | 4 | 5
}

export function isLockedAggregateScopeActive<T extends Pick<BuilderRecipe, 'lockedMinRequiredRolls' | 'fixedSubstatsV'>>(recipe: T, options?: { lockedCountOverride?: number }): boolean {
  try {
    const lockedCount = typeof options?.lockedCountOverride === 'number'
      ? options.lockedCountOverride
      : (Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.length : 0)
    if (lockedCount <= 0) return false
    const lockedMinRaw = (recipe as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls
    const lockedMin = clampAggregateRollRequirement(lockedMinRaw ?? 0)
    return lockedMin > 0
  } catch {
    return false
  }
}

/**
 * Clamp and clear the locked aggregate minimum rolls requirement when invalid.
 */
export function normalizeLockedMinRequiredRolls<T extends Pick<BuilderRecipe, 'lockedMinRequiredRolls' | 'fixedSubstatsV'>>(recipe: T): T {
  try {
    const lockedCount = Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.length : 0
    const currentValue = (recipe as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls
    const clamped = clampAggregateRollRequirement(currentValue ?? 0)
    if (lockedCount <= 0 || clamped <= 0) {
      if (currentValue == null) return recipe
      const { lockedMinRequiredRolls: _omit, ...rest } = recipe as unknown as Record<string, unknown>
      return rest as T
    }
    if (clamped !== currentValue) {
      return { ...recipe, lockedMinRequiredRolls: clamped } as T
    }
    return recipe
  } catch {
    return recipe
  }
}

export function normalizeMinRequiredRolls<T extends Pick<BuilderRecipe, 'minRequiredRolls' | 'autoMinRequiredRolls'>>(recipe: T): T {
  try {
    const currentValue = (recipe as { minRequiredRolls?: number }).minRequiredRolls
    const clamped = clampAggregateRollRequirement(currentValue ?? 0)
    if ((recipe.autoMinRequiredRolls ?? true) === false) {
      if (currentValue !== clamped) {
        return { ...recipe, minRequiredRolls: clamped } as T
      }
      return recipe
    }
    if (currentValue == null) return recipe
    if (currentValue !== clamped) {
      return { ...recipe, minRequiredRolls: clamped } as T
    }
    return recipe
  } catch {
    return recipe
  }
}

export function normalizeAggregateRollTargets<T extends Pick<BuilderRecipe, 'lockedMinRequiredRolls' | 'fixedSubstatsV' | 'autoMinRequiredRolls' | 'minRequiredRolls'>>(recipe: T): T {
  let next: T = normalizeLockedMinRequiredRolls(recipe)
  next = normalizeMinRequiredRolls(next as T)
  try {
    const locked = clampAggregateRollRequirement((next as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls ?? 0)
    if (locked <= 0) {
      if ((next as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls == null) return next
      const { lockedMinRequiredRolls: _omit, ...rest } = next as unknown as Record<string, unknown>
      return rest as T
    }
    const manualActive = (next as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls === false
    const manual = clampAggregateRollRequirement((next as { minRequiredRolls?: number }).minRequiredRolls ?? 0)
    if (manualActive && manual > 0 && manual <= locked) {
      return {
        ...next,
        minRequiredRolls: 0 as BuilderRecipe['minRequiredRolls'],
        autoMinRequiredRolls: false,
      }
    }
    return next
  } catch {
    return next
  }
}

/**
 * Keep min/max level milestones within the allowed window and maintain `min <= max`.
 * Falls back to the builder defaults (0/16) when values are missing or invalid.
 */
export function normalizeLevelWindow<T extends Pick<BuilderRecipe, 'minLevel' | 'maxLevel'>>(recipe: T): T {
  const defaultMin: LevelMilestone = LEVEL_MILESTONES[0]!
  const defaultMax: LevelMilestone = LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!
  let min: LevelMilestone = isLevelMilestone(recipe.minLevel) ? recipe.minLevel! : defaultMin
  let max: LevelMilestone = isLevelMilestone(recipe.maxLevel) ? recipe.maxLevel! : defaultMax
  if (min > max) {
    // Preserve the user-selected milestone by clamping the opposite bound.
    if (isLevelMilestone(recipe.minLevel) && !isLevelMilestone(recipe.maxLevel)) {
      max = min
    } else {
      min = max
    }
  }
  if (!isLevelMilestone(min)) min = defaultMin
  if (!isLevelMilestone(max)) max = defaultMax
  if (min > max) min = max
  return { ...recipe, minLevel: min, maxLevel: max } as T
}

const hasSubstatThresholds = (recipe: Pick<BuilderRecipe, 'substatRollBoundsV'>): boolean => {
  const bV = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
  return Object.values(bV).some((b) => (typeof b?.min === 'number' && (b.min ?? 0) > 0) || b?.not === true)
}

const hasManualAggregateMin = (recipe: Pick<BuilderRecipe, 'autoMinRequiredRolls' | 'minRequiredRolls'>): boolean => (
  (recipe.autoMinRequiredRolls === false)
  && typeof recipe.minRequiredRolls === 'number'
  && Number.isFinite(recipe.minRequiredRolls)
  && recipe.minRequiredRolls > 0
)

const isLockedAggregateActive = (recipe: Pick<BuilderRecipe, 'lockedMinRequiredRolls' | 'fixedSubstatsV'>): boolean => {
  const lockedValue = typeof recipe.lockedMinRequiredRolls === 'number' ? recipe.lockedMinRequiredRolls : 0
  if (!(lockedValue > 0)) return false
  const fixed = recipe.fixedSubstatsV ?? []
  return Array.isArray(fixed) && fixed.length > 0
}

/**
 * Derive the roll baseline mode from the current level window.
 * Windows that start at +0 (the default) behave like the legacy
 * 'afterStart' mode, while any window that begins above +0 needs to
 * count the rolls gained before the window and therefore acts like
 * 'upToLevel'.
 */
export function deriveRollBaselineMode<T extends Pick<BuilderRecipe, 'minLevel' | 'maxLevel'>>(recipe: T): 'afterStart' | 'upToLevel' {
  const defaultMin: LevelMilestone = LEVEL_MILESTONES[0]!
  const min: LevelMilestone = isLevelMilestone(recipe.minLevel) ? recipe.minLevel! : defaultMin
  return min <= 0 ? 'afterStart' : 'upToLevel'
}
