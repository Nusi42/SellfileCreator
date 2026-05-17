/**
 * useSafeguardMultiEditSummary
 *
 * Aggregates per-element counts across the current safeguard multi-edit
 * selection so SafeguardBuilderPanel can derive per-toggle tri-state
 * (all / mixed / none) without computing it inline for every render.
 *
 * Mirrors useRecipeMultiEditSummary but scoped to SafeguardRule arrays.
 */
import { useMemo } from 'react'
import type { SafeguardRule } from '../../lib/safeguards'
import { splitArtifactSetSelections } from '../../lib/gearSets/selection'

export interface SafeguardMultiEditSummary {
  // Number of selected rules; denominates all counts.
  total: number
  // How many selected rules have each slot id.
  slotCounts: Map<number, number>
  // How many selected rules include each rank value.
  rankCounts: Map<number, number>
  // How many selected rules include each rarity value.
  rarityCounts: Map<number, number>
  // How many selected rules include each main-stat variant.
  mainStatCounts: Map<number, number>
  // How many selected rules have at least one faction set (not faction=Any).
  rulesWithFactionCount: number
  // How many selected rules include each faction id.
  factionCounts: Map<number, number>
  // How many selected rules include each substat variant.
  substatCounts: Map<number, number>
  // How many selected rules include each set id (inclusions only).
  setCounts: Map<number, number>
  // How many selected rules include each meta-set id.
  metaSetIdCounts: Map<string, number>
}

export const useSafeguardMultiEditSummary = (
  multiEditActive: boolean,
  multiSelectedRules: readonly SafeguardRule[] | null,
): SafeguardMultiEditSummary | null => useMemo(() => {
  // Only aggregate when multi-edit is active with at least two rules.
  if (!multiEditActive || !multiSelectedRules || multiSelectedRules.length < 2) return null
  const total = multiSelectedRules.length
  const slotCounts = new Map<number, number>()
  const rankCounts = new Map<number, number>()
  const rarityCounts = new Map<number, number>()
  const mainStatCounts = new Map<number, number>()
  const factionCounts = new Map<number, number>()
  let rulesWithFactionCount = 0
  const substatCounts = new Map<number, number>()
  const setCounts = new Map<number, number>()
  const metaSetIdCounts = new Map<string, number>()
  for (const rule of multiSelectedRules) {
    const combo = rule.combination
    // Count slot presence across rules.
    for (const slot of (combo.slots ?? [])) {
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
    }
    // Count rank filter presence.
    for (const rank of (combo.ranks ?? [])) {
      rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1)
    }
    // Count rarity filter presence.
    for (const rarity of (combo.rarities ?? [])) {
      rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + 1)
    }
    // Count main-stat filter presence.
    for (const stat of (combo.mainStats ?? [])) {
      mainStatCounts.set(stat, (mainStatCounts.get(stat) ?? 0) + 1)
    }
    // Count faction filter presence; also track rules with any faction set.
    const ruleFactions = combo.factions ?? []
    if (ruleFactions.length > 0) rulesWithFactionCount++
    for (const faction of ruleFactions) {
      factionCounts.set(faction, (factionCounts.get(faction) ?? 0) + 1)
    }
    // Count substat presence (rule-level field, not in combination).
    for (const substat of (rule.substats ?? [])) {
      substatCounts.set(substat, (substatCounts.get(substat) ?? 0) + 1)
    }
    // Count set inclusions only — exclusions don't count as "selected".
    const { included } = splitArtifactSetSelections(combo.sets ?? [])
    for (const setId of included) {
      const n = Number(setId)
      setCounts.set(n, (setCounts.get(n) ?? 0) + 1)
    }
    // Count meta-set id presence.
    for (const metaId of (combo.metaSetNames ?? [])) {
      metaSetIdCounts.set(metaId, (metaSetIdCounts.get(metaId) ?? 0) + 1)
    }
  }
  return {
    total,
    rulesWithFactionCount,
    slotCounts,
    rankCounts,
    rarityCounts,
    mainStatCounts,
    factionCounts,
    substatCounts,
    setCounts,
    metaSetIdCounts,
  }
}, [multiEditActive, multiSelectedRules])
