import type { ArtifactSetId } from '../artifactSets'

// Set icons injected at runtime (e.g. from a loaded gear-set file), keyed by set id.
// Kept apart from gearsetIconMap so the runtime gear-set store (reached from worker code
// through lib/types) never pulls the asset-pack icon maps into worker bundles.
const runtimeIconMap = new Map<number, string>()

export function setRuntimeGearSetIcon(id: ArtifactSetId, dataUrl?: string) {
  const numeric = Number(id)
  if (!Number.isFinite(numeric) || numeric <= 0) return
  if (!dataUrl) {
    runtimeIconMap.delete(numeric)
    return
  }
  runtimeIconMap.set(numeric, dataUrl)
}

/** The runtime-injected icon for a set id, if any. */
export const runtimeGearSetIcon = (numericId: number): string | undefined => runtimeIconMap.get(numericId)
