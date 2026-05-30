import type { ArtifactTypeId, StatVariant, StatVariantLike } from './types'
import {
  ALLOWED_MAIN_BY_SLOT,
  ALLOWED_SUB_BY_SLOT,
  ArtifactType,
  PREFERRED_ARTIFACT_TYPE_ORDER,
  STAT_VARIANTS_PRIORITY,
  StatId,
  StatVariant as StatVariantEnum,
} from './types'
import { variantToMain, variantToSub } from './hsfTypes'

// substatMatchesMainVariant reports when a substat would duplicate the main stat.
export const substatMatchesMainVariant = (subVariant: StatVariantLike, mainVariant?: StatVariantLike): boolean => {
  // Missing or Any main stat cannot conflict with substats.
  if (mainVariant == null || Number(mainVariant) === StatVariantEnum.Any) return false
  // Decode both variants to compare against HSF tuple semantics.
  const sub = variantToSub(subVariant)
  const main = variantToMain(mainVariant)
  // Any main stat never blocks a substat.
  if (main.id === StatId.Any) return false
  // HP/ATK/DEF need flat vs percent awareness to match correctly.
  if (main.id === StatId.HP || main.id === StatId.ATK || main.id === StatId.DEF) {
    // Missing flat flag means we cannot assert a match.
    if (main.f === undefined) return false
    return sub.id === main.id && Boolean(sub.isFlat) === (main.f === 1)
  }
  // Other stats only need the stat id comparison.
  return sub.id === main.id
}

type ResolveAllowedSubstatsParams = {
  slots: ArtifactTypeId[] | undefined
  mainStats: StatVariantLike[] | undefined
}

// resolveAllowedSubstatsForSlotsAndMains returns substats feasible for any selected slot + main combo.
export const resolveAllowedSubstatsForSlotsAndMains = ({
  slots,
  mainStats,
}: ResolveAllowedSubstatsParams): StatVariant[] => {
  // Normalize slots while preserving the "Any slot" meaning of an empty selection.
  const normalizedSlots = (slots ?? [])
    .map((slotId) => Number(slotId))
    .filter((slotId) => Number.isFinite(slotId))
  // Treat empty slots as "all slots" so the substat list stays inclusive.
  const slotPool = normalizedSlots.length > 0
    ? normalizedSlots
    : PREFERRED_ARTIFACT_TYPE_ORDER.map((slotId) => Number(slotId))
  // Normalize main stats to numeric variants.
  const normalizedMainStats = (mainStats ?? [])
    .map((variant) => Number(variant))
    .filter((variant) => Number.isFinite(variant))
  // "Any" main stat means no main-stat restriction.
  const hasWildcardMain = normalizedMainStats.length === 0
    || normalizedMainStats.some((variant) => variant === Number(StatVariantEnum.Any))
  // Only keep explicit mains when we are truly restricting the list.
  const explicitMainStats = hasWildcardMain
    ? []
    : normalizedMainStats.filter((variant) => variant !== Number(StatVariantEnum.Any))
  // Build a union of allowed substats across all feasible slot + main pairs.
  const allowed = new Set<number>()
  // Iterate every slot so we can apply slot-level constraints.
  for (const slotId of slotPool) {
    // Look up the slot's base substat set.
    const substatSet = ALLOWED_SUB_BY_SLOT[Number(slotId) as ArtifactType]
    // Skip slots that are missing definition data.
    if (!substatSet) continue
    // Look up the slot's main stat options.
    const mainSet = ALLOWED_MAIN_BY_SLOT[Number(slotId) as ArtifactType]
    // Skip slots that are missing definition data.
    if (!mainSet || mainSet.size === 0) continue
    // Choose the main stats compatible with this slot + selection.
    const candidateMains = hasWildcardMain
      ? Array.from(mainSet)
      : explicitMainStats.filter((variant) => mainSet.has(Number(variant)))
    // Skip this slot if no main stats are possible.
    if (candidateMains.length === 0) continue
    // Add substats that are valid for at least one main stat in this slot.
    for (const subVariant of substatSet) {
      // Keep the substat if it doesn't clash with any allowed main.
      const viable = candidateMains.some((mainVariant) => !substatMatchesMainVariant(subVariant, mainVariant))
      // Drop substats that are invalid for every allowed main.
      if (!viable) continue
      // Record the numeric id so ordering stays stable later.
      allowed.add(Number(subVariant))
    }
  }
  // Preserve the app's preferred ordering for the final list.
  return STAT_VARIANTS_PRIORITY.filter((variant) => allowed.has(Number(variant)))
}

// retainAllowedSubstats filters any array whose items carry a stat variant to only
// those variants still allowed for the given slots + main stats. Works for both
// flat StatVariant arrays (safeguard substats) and substat-object arrays (recipe substats).
export function retainAllowedSubstats<T>(
  items: T[],
  getVariant: (item: T) => StatVariantLike,
  constraints: { slots: ArtifactTypeId[] | undefined; mainStats: StatVariantLike[] | undefined },
): T[] {
  const allowed = resolveAllowedSubstatsForSlotsAndMains(constraints)
  return items.filter((item) => allowed.includes(Number(getVariant(item)) as StatVariant))
}

// retainAllowedMainStats filters a mainstat array to those valid for the given slots.
// StatVariant.Any is always kept regardless of the slot set (it means no restriction).
// When slots is empty the full list is returned unchanged (no slot constraint).
export function retainAllowedMainStats(
  mainStats: StatVariantLike[],
  slots: ArtifactTypeId[],
): StatVariant[] {
  if (slots.length === 0) return mainStats.map(Number) as StatVariant[]
  const allowed = new Set<number>([StatVariantEnum.Any])
  slots.forEach((slotId) => {
    ALLOWED_MAIN_BY_SLOT[Number(slotId) as ArtifactType]?.forEach((v) => allowed.add(v))
  })
  return mainStats.map(Number).filter((v) => allowed.has(v)) as StatVariant[]
}
