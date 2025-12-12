import { useSyncExternalStore } from 'react'
import { getRuntimeGearSetVersion, subscribeRuntimeGearSets, ensureRuntimeGearSetsLoaded } from '../lib/gearSets/runtimeStore'

/**
 * Subscribes components to the runtime gear-set registry so they re-render when
 * contributors drop a `.gearsets.json` patch.
 */
export function useGearSetCatalogVersion(): number {
  ensureRuntimeGearSetsLoaded()
  return useSyncExternalStore(
    subscribeRuntimeGearSets,
    getRuntimeGearSetVersion,
    () => 0,
  )
}
