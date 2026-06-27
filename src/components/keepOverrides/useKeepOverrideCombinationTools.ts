import { useCallback, useMemo } from 'react'
import type { ArtifactSetId, ArtifactTypeId } from '../../lib/types'
import {
  getAccessorySlotsCompatibleSetIds,
  getArtifactFixedSetIds,
  getArtifactVariableSetIds,
  getAllKnownArtifactSetIds,
} from '../../lib/types'
import type { Metaset } from '../../lib/metasets'
import { isAccessorySlot } from '../../lib/gearInspectorDomain'
import { ACCESSORY_NO_SET_ID } from '../../lib/constants'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { normalizeArtifactSetSelections } from '../../lib/gearSets/selection'
import type { SafeguardRule } from '../../lib/safeguards'
import { dedupeNumericArray, dedupeStringArray, getMainStatOptionsForSlots } from './keepOverrideRuleUtils'

// useKeepOverrideCombinationTools centralizes slot+set sanitization for keep overrides.
export const useKeepOverrideCombinationTools = (metasets: Metaset[]) => {
  // Recompute pools when the runtime set catalog changes.
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  // Fixed artifact sets stay in a dedicated pool for slot-aware filtering.
  const artifactFixedSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArtifactFixedSetIds()
  }, [gearSetCatalogVersion])
  // Variable artifact sets fill the rest of the artifact-only pool.
  const artifactVariableSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArtifactVariableSetIds()
  }, [gearSetCatalogVersion])
  // Union the artifact pools for a single allowed list.
  const artifactSetPool = useMemo(
    () => Object.freeze([...artifactFixedSetIds, ...artifactVariableSetIds]),
    [artifactFixedSetIds, artifactVariableSetIds],
  )
  // Accessories can only use a subset of sets; cache the lookup here.
  const accessoryCompatibleSetIds = useMemo(
    () => {
      void gearSetCatalogVersion
      return getAccessorySlotsCompatibleSetIds()
    },
    [gearSetCatalogVersion],
  )
  // When slots include both artifact + accessory, allow every known set.
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
    const hasArtifact = slotAny || slots.some((slotId) => !isAccessorySlot(slotId))
    if (hasAccessory && hasArtifact) return allArtifactSetIds
    return hasAccessory ? accessoryCompatibleSetIds : artifactSetPool
  }, [accessoryCompatibleSetIds, allArtifactSetIds, artifactSetPool])
  // sanitizeCombinationForSlots keeps sets/main/faction selections valid as slots change.
  const sanitizeCombinationForSlots = useCallback((slots: ArtifactTypeId[], combination: SafeguardRule['combination']) => {
    const normalizedSlots = dedupeNumericArray(slots)
    const allowedSetPool = resolveAllowedSetPool(normalizedSlots)
    const allowedSetIds = new Set(allowedSetPool.map(Number))
    const filteredSets = normalizeArtifactSetSelections(combination.sets)
      .filter((entry) => allowedSetIds.has(Number(entry.id)))
    const filteredMetaIds = (combination.metaSetNames ?? []).filter((metaId) => {
      const meta = metasets.find((item) => item.name === metaId)
      if (!meta || !meta.sets.length) return false
      return meta.sets.every((setId) => allowedSetIds.has(Number(setId)))
    })
    const mainOptions = getMainStatOptionsForSlots(normalizedSlots)
    // Clear factions when any artifact slot is present — faction filters only apply to accessories.
    // Empty slot selection means "Any slot" (includes accessories), so factions are kept.
    const hasArtifact = normalizedSlots.length > 0 && normalizedSlots.some((slotId) => !isAccessorySlot(slotId))
    const filteredMainStats = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainOptions.includes(variant)))
    const filteredFactions = hasArtifact ? [] : dedupeNumericArray(combination.factions ?? [])
    // Only individual sets count for the fallback — metasets are returned separately in filteredMetaIds.
    const hadExplicitSetSelection = combination.sets.length > 0
    // Fallback: when the user had individual sets and the slot change wiped them all out,
    // pick the first usable set from the pool rather than silently reverting to "any set".
    // Skip both the no-set sentinel (most-negative ID, not a real selection) and any surviving
    // metasets — if filteredMetaIds is non-empty the user's overall selection is still meaningful.
    const resolvedSets = filteredSets.length > 0
      ? filteredSets
      : (hadExplicitSetSelection && filteredMetaIds.length === 0
          ? (() => {
              const fallback = (allowedSetPool as readonly number[]).find((id) => id !== ACCESSORY_NO_SET_ID)
              return fallback != null ? [{ id: fallback as ArtifactSetId }] : []
            })()
          : [])
    return {
      ...combination,
      slots: normalizedSlots,
      sets: resolvedSets,
      metaSetNames: dedupeStringArray(filteredMetaIds),
      mainStats: filteredMainStats,
      factions: filteredFactions,
    }
  }, [metasets, resolveAllowedSetPool])
  return {
    resolveAllowedSetPool,
    sanitizeCombinationForSlots,
  }
}
