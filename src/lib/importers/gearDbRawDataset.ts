/**
 * gearDbRawDataset
 *
 * Maintains the normalized Gear Inspector snapshot derived from raw JSON commands.
 * We hang on to the canonical artifacts/inbox entries plus the Champion/LastUsed
 * lookups so a delta stream can mutate the dataset without shipping another
 * SQLite blob. Every helper keeps comments dense so endpoint authors can map
 * their payloads to the UI behavior.
 */
import type { TestItem } from '../ruleEval'
import {
  normalizeGearDbArtifact,
  type GearDbArtifactRow,
  type NormalizedGearArtifact,
} from './gearDbNormalizer'
import {
  createChampionLookup,
  createLastUsedLookup,
  type ChampionLookup,
  type LastUsedLookup,
} from './gearDbLookups'
import type { GearDbRawSnapshotCommand } from '../externalCommands'

export type GearDbRawDataset = {
  snapshotId: string | null
  champions: ChampionLookup
  lastUsed: LastUsedLookup
  artifacts: Map<number, NormalizedGearArtifact>
  inboxArtifacts: Map<number, NormalizedGearArtifact>
}

type ArtifactSource = 'artifacts' | 'inbox'

/**
 * Build a full dataset from a JSON snapshot event so callers can diff it against
 * the currently rendered Gear Inspector queue.
 */
export const createDatasetFromSnapshot = (
  snapshot: GearDbRawSnapshotCommand,
): { dataset: GearDbRawDataset; gearInspectorItems: TestItem[]; artifactCount: number; inboxCount: number } => {
  // Build champion/last-used lookups first so artifact normalization has all
  // of the metadata the SQL importer would have provided.
  const championLookup = createChampionLookup(snapshot.champions)
  const lastUsedLookup = createLastUsedLookup(snapshot.lastUsed)
  const artifacts = buildArtifactMap(snapshot.artifacts, 'artifacts', championLookup, lastUsedLookup)
  const inboxArtifacts = buildArtifactMap(snapshot.inboxArtifacts ?? [], 'inbox', championLookup, lastUsedLookup)
  const dataset: GearDbRawDataset = {
    snapshotId: snapshot.snapshotId ?? null,
    champions: championLookup,
    lastUsed: lastUsedLookup,
    artifacts,
    inboxArtifacts,
  }
  const { gearInspectorItems, artifactCount, inboxCount } = collectGearInspectorItems(dataset)
  return { dataset, gearInspectorItems, artifactCount, inboxCount }
}

/**
 * Build a map of artifact id → revision from raw rows.
 * Covers both inventory and inbox arrays in one pass so the caller
 * can compare the combined set against a persisted baseline.
 * Rows without a valid revision are skipped — they will never match an
 * existing baseline entry and so will always be treated as changed.
 */
export const buildArtifactRevisionMap = (
  ...rowArrays: readonly (readonly GearDbArtifactRow[])[]
): Map<number, number> => {
  const map = new Map<number, number>()
  for (const rows of rowArrays) {
    for (const row of rows) {
      const id = Number(row.ID)
      // Skip rows with invalid ids; they cannot be diff-keyed.
      if (!Number.isFinite(id) || id <= 0) continue
      const rev = Number(row.revision)
      // Only record rows that carry a valid revision number.
      if (!Number.isFinite(rev) || rev <= 0) continue
      map.set(id, rev)
    }
  }
  return map
}

const buildArtifactMap = (
  rows: readonly GearDbArtifactRow[],
  source: ArtifactSource,
  champions: ChampionLookup,
  lastUsed: LastUsedLookup,
): Map<number, NormalizedGearArtifact> => {
  const map = new Map<number, NormalizedGearArtifact>()
  for (const row of rows) {
    const id = Number(row.ID)
    if (!Number.isFinite(id) || id <= 0) continue
    try {
      // Mirror the SQL importer: rewrite the ID, plug in champion + last-used
      // metadata, and normalize via the shared helper.
      const normalized = normalizeGearDbArtifact(
        { ...row, ID: id },
        {
          source,
          championLookup: champions,
          lastUseLocalTimestamp: lastUsed.get(id) ?? null,
        },
      )
      map.set(id, normalized)
    } catch {
      // Invalid rows can appear when helper metadata slips through; drop them.
      continue
    }
  }
  return map
}

const collectGearInspectorItems = (
  dataset: GearDbRawDataset,
): { gearInspectorItems: TestItem[]; artifactCount: number; inboxCount: number } => {
  const artifactList = Array.from(dataset.artifacts.values()).sort((a, b) => a.id - b.id)
  const inboxList = Array.from(dataset.inboxArtifacts.values()).sort((a, b) => a.id - b.id)
  const gearInspectorItems: TestItem[] = []
  for (const artifact of artifactList) {
    // Always clone to detach the Gear Inspector queue from the dataset cache.
    gearInspectorItems.push(cloneGearInspectorItem(artifact))
  }
  for (const artifact of inboxList) {
    gearInspectorItems.push(cloneGearInspectorItem(artifact))
  }
  return { gearInspectorItems, artifactCount: artifactList.length, inboxCount: inboxList.length }
}

const cloneGearInspectorItem = (artifact: NormalizedGearArtifact): TestItem => ({
  ...artifact.gearInspectorItem,
  previewExtras: {
    ...(artifact.gearInspectorItem.previewExtras ?? {}),
    // Single nested reference replaces the previous flat `equippedChampion*` set —
    // see ChampionLookupRecord for the constituent fields. The id is reached via
    // `previewExtras.equippedChampion?.id` (there is no separate FK field).
    equippedChampion: artifact.equippedChampion,
    lastUseLocalTimestamp: artifact.lastUseLocalTimestamp,
  },
})

