import { useCallback, useMemo } from 'react'
import type { ArtifactSetId, ArtifactTypeId } from '../../lib/types'
import {
  getAccessorySlotsCompatibleSetIds,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAllKnownArtifactSetIds,
} from '../../lib/types'
import type { Metaset } from '../../lib/metasets'
import { isAccessorySlot } from '../../lib/testerDomain'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { normalizeArtifactSetSelections } from '../../lib/gearSets/selection'
import type { SafeguardRule } from '../../lib/safeguards'
import { dedupeNumericArray, dedupeStringArray, getMainStatOptionsForSlots } from './keepOverrideRuleUtils'

// useKeepOverrideCombinationTools centralizes slot+set sanitization for keep overrides.
export const useKeepOverrideCombinationTools = (metasets: Metaset[]) => {
  // Recompute pools when the runtime set catalog changes.
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  // Fixed armor sets stay in a dedicated pool for slot-aware filtering.
  const armorFixedSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArmorFixedSetIds()
  }, [gearSetCatalogVersion])
  // Variable armor sets fill the rest of the armor-only pool.
  const armorVariableSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArmorVariableSetIds()
  }, [gearSetCatalogVersion])
  // Union the armor pools for a single allowed list.
  const artifactSetPool = useMemo(
    () => Object.freeze([...armorFixedSetIds, ...armorVariableSetIds]),
    [armorFixedSetIds, armorVariableSetIds],
  )
  // Accessories can only use a subset of sets; cache the lookup here.
  const accessoryCompatibleSetIds = useMemo(
    () => {
      void gearSetCatalogVersion
      return getAccessorySlotsCompatibleSetIds()
    },
    [gearSetCatalogVersion],
  )
  // When slots include both armor + accessory, allow every known set.
  const allArtifactSetIds = useMemo(
    () => {
      void gearSetCatalogVersion
      return getAllKnownArtifactSetIds()
    },
    [gearSetCatalogVersion],
  )
  // resolveAllowedSetPool chooses the right allowed set pool for selected slots.
  const resolveAllowedSetPool = useCallback((slots: ArtifactTypeId[]): readonly ArtifactSetId[] => {
    const slotAny = slots.length === 0
    const hasAccessory = slotAny || slots.some((slotId) => isAccessorySlot(slotId))
    const hasArmor = slotAny || slots.some((slotId) => !isAccessorySlot(slotId))
    if (hasAccessory && hasArmor) return allArtifactSetIds
    return hasAccessory ? accessoryCompatibleSetIds : artifactSetPool
  }, [accessoryCompatibleSetIds, allArtifactSetIds, artifactSetPool])
  // sanitizeCombinationForSlots keeps sets/main/faction selections valid as slots change.
  const sanitizeCombinationForSlots = useCallback((slots: ArtifactTypeId[], combination: SafeguardRule['combination']) => {
    const normalizedSlots = dedupeNumericArray(slots)
    const allowedSetPool = resolveAllowedSetPool(normalizedSlots)
    const allowedSetIds = new Set(allowedSetPool.map(Number))
    const filteredSets = normalizeArtifactSetSelections(combination.sets)
      .filter((entry) => allowedSetIds.has(Number(entry.id)))
    const filteredMetaIds = (combination.metaSetIds ?? []).filter((metaId) => {
      const meta = metasets.find((item) => item.id === metaId)
      if (!meta || !meta.sets.length) return false
      return meta.sets.every((setId) => allowedSetIds.has(Number(setId)))
    })
    const mainOptions = getMainStatOptionsForSlots(normalizedSlots)
    const hasAccessory = normalizedSlots.length === 0 || normalizedSlots.some((slotId) => isAccessorySlot(slotId))
    const filteredMainStats = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainOptions.includes(variant)))
    const filteredFactions = hasAccessory ? dedupeNumericArray(combination.factions ?? []) : []
    const hadExplicitSetSelection = combination.sets.length > 0 || (combination.metaSetIds?.length ?? 0) > 0
    const resolvedSets = filteredSets.length > 0
      ? filteredSets
      : (hadExplicitSetSelection && allowedSetPool[0] ? [{ id: allowedSetPool[0] }] : [])
    return {
      ...combination,
      slots: normalizedSlots,
      sets: resolvedSets,
      metaSetIds: dedupeStringArray(filteredMetaIds),
      mainStats: filteredMainStats,
      factions: filteredFactions,
    }
  }, [metasets, resolveAllowedSetPool])
  return {
    resolveAllowedSetPool,
    sanitizeCombinationForSlots,
  }
}
