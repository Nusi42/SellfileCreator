/**
 * Multi-edit summary hook
 *
 * Aggregates stat/set/meta counts across the current multi-edit selection so
 * the BuilderPanel can show tri-state toggles without recalculating everything
 * inline.
 */
import { useMemo } from 'react'
import type { BuilderRecipe } from '../../lib/hsfBuilder'
import { splitArtifactSetSelections } from '../../lib/gearSets/selection'

export interface MultiEditSummary {
  total: number
  mainCounts: Map<number, number>
  subCounts: Map<number, { present: number; locked: number }>
  rollSummary: Map<number, { any: number; notCount: number; minValues: Set<number>; maxValues: Set<number> }>
  slotCounts: Map<number, number>
  setCounts: Map<number, number>
  metaCounts: Map<string, number>
}

export const useMultiEditSummary = (
  multiEditActive: boolean,
  multiSourceRecipes: readonly BuilderRecipe[] | null,
): MultiEditSummary | null => useMemo(() => {
  if (!multiEditActive || !multiSourceRecipes) return null
  // Counts populate per-token maps so tri-state toggles can resolve quickly.
  const total = multiSourceRecipes.length
  const mainCounts = new Map<number, number>()
  const subCounts = new Map<number, { present: number; locked: number }>()
  // Roll summary retains wildcard/not counts and min/max sets for each stat.
  const rollSummary = new Map<number, { any: number; notCount: number; minValues: Set<number>; maxValues: Set<number> }>()
  const slotCounts = new Map<number, number>()
  const setCounts = new Map<number, number>()
  const metaCounts = new Map<string, number>()
  for (const recipe of multiSourceRecipes) {
    const main = Array.isArray(recipe.mainStatsV) ? recipe.mainStatsV : []
    // Track unique main stat presence across the selection.
    for (const variant of main) {
      mainCounts.set(variant, (mainCounts.get(variant) ?? 0) + 1)
    }
    const substats = Array.isArray(recipe.substatsV) ? recipe.substatsV : []
    const fixed = new Set<number>(Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV : [])
    const bounds = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
    for (const variant of substats) {
      const entry = subCounts.get(variant) ?? { present: 0, locked: 0 }
      entry.present += 1
      if (fixed.has(variant)) entry.locked += 1
      subCounts.set(variant, entry)
      const roll = rollSummary.get(variant) ?? { any: 0, notCount: 0, minValues: new Set<number>(), maxValues: new Set<number>() }
      const b = bounds[variant]
      const hasMin = typeof b?.min === 'number'
      const hasMax = typeof b?.max === 'number'
      const isNot = b?.not === true
      const isWildcard = !b || b.any || (!hasMin && !hasMax && !isNot)
      if (isNot) {
        roll.notCount += 1
      } else if (isWildcard) {
        roll.any += 1
      }
      if (hasMin) roll.minValues.add(Math.max(0, Math.min(5, Number(b!.min))))
      if (hasMax) roll.maxValues.add(Math.max(0, Math.min(4, Number(b!.max))))
      rollSummary.set(variant, roll)
    }
    for (const variant of fixed) {
      if (!subCounts.has(variant)) {
        subCounts.set(variant, { present: 0, locked: 1 })
      }
    }
    // Slots, sets, and metasets each get their own simple counters.
    const slots = Array.isArray(recipe.artifactTypes) ? recipe.artifactTypes : []
    for (const slot of slots) {
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
    }
    // Only count explicit inclusions so exclusions don't register as selected.
    const sets = splitArtifactSetSelections(recipe.artifactSets).included
    for (const set of sets) {
      setCounts.set(Number(set), (setCounts.get(Number(set)) ?? 0) + 1)
    }
    const metas = Array.isArray(recipe.artifactMetaSets) ? recipe.artifactMetaSets : []
    for (const meta of metas) {
      metaCounts.set(meta, (metaCounts.get(meta) ?? 0) + 1)
    }
  }
  return {
    total,
    mainCounts,
    subCounts,
    rollSummary,
    slotCounts,
    setCounts,
    metaCounts,
  }
}, [multiEditActive, multiSourceRecipes])
