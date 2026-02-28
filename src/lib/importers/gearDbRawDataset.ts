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
  removeChampion,
  removeLastUsed,
  type ChampionLookup,
  type LastUsedLookup,
  upsertChampionRow,
  upsertLastUsedRow,
} from './gearDbLookups'
import type {
  GearDbRawSnapshotCommand,
  GearDbRawDeltaCommand,
  GearDbRawDeltaOperation,
} from '../externalCommands'

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
 * Apply a delta event to the existing dataset. Throws when the snapshot id
 * mismatches so callers can explicitly request a new snapshot.
 */
export const applyDeltaToDataset = (
  dataset: GearDbRawDataset,
  delta: GearDbRawDeltaCommand,
): { gearInspectorItems: TestItem[]; artifactCount: number; inboxCount: number } => {
  const activeSnapshotId = dataset.snapshotId ?? null
  const deltaSnapshotId = delta.snapshotId ?? null
  if (activeSnapshotId !== null && deltaSnapshotId !== null && activeSnapshotId !== deltaSnapshotId) {
    throw new Error(`gearDbRawDelta snapshot mismatch (have "${activeSnapshotId}", got "${deltaSnapshotId}")`)
  }
  if (deltaSnapshotId && !activeSnapshotId) {
    dataset.snapshotId = deltaSnapshotId
  }
  const touchedChampionIds = new Set<number>()
  const touchedLastUsedIds = new Set<number>()
  for (const op of delta.ops) {
    // Walk every op eagerly so the Gear Inspector always receives a fully reconciled view.
    applyDeltaOperation(dataset, op, touchedChampionIds, touchedLastUsedIds)
  }
  if (touchedChampionIds.size > 0) {
    refreshChampionMetadata(dataset, touchedChampionIds)
  }
  if (touchedLastUsedIds.size > 0) {
    refreshLastUsedMetadata(dataset, touchedLastUsedIds)
  }
  return collectGearInspectorItems(dataset)
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
  ...artifact.testerItem,
  previewExtras: {
    ...(artifact.testerItem.previewExtras ?? {}),
    equippedChampionName: artifact.equippedChampionName,
    equippedChampionBaseId: artifact.equippedChampionBaseId,
    equippedChampionRarity: artifact.equippedChampionRarity,
    equippedChampionLocation: artifact.equippedChampionLocation,
    lastUseLocalTimestamp: artifact.lastUseLocalTimestamp,
    equippedToChampionId: artifact.equippedToChampionId,
  },
})

const applyDeltaOperation = (
  dataset: GearDbRawDataset,
  op: GearDbRawDeltaOperation,
  touchedChampionIds: Set<number>,
  touchedLastUsedIds: Set<number>,
): void => {
  // The op union mirrors the JSON payload; each branch mutates the cached maps
  // so subsequent deltas see the freshly updated dataset.
  if (op.op === 'remove') {
    handleRemoval(dataset, op)
    if (op.table === 'Champs') touchedChampionIds.add(op.id)
    if (op.table === 'LastUsed') touchedLastUsedIds.add(op.id)
    return
  }
  if (op.table === 'Artifacts' || op.table === 'InboxArtifacts') {
    const target = op.table === 'Artifacts' ? dataset.artifacts : dataset.inboxArtifacts
    const source: ArtifactSource = op.table === 'Artifacts' ? 'artifacts' : 'inbox'
    const id = Number(op.row.ID)
    if (!Number.isFinite(id) || id <= 0) return
    try {
      const normalized = normalizeGearDbArtifact(op.row, {
        source,
        championLookup: dataset.champions,
        lastUseLocalTimestamp: dataset.lastUsed.get(id) ?? null,
      })
      target.set(id, normalized)
    } catch {
      target.delete(id)
    }
    return
  }
  if (op.table === 'Champs') {
    const record = upsertChampionRow(dataset.champions, op.row)
    if (record) touchedChampionIds.add(record.id)
    return
  }
  if (op.table === 'LastUsed') {
    const timestamp = upsertLastUsedRow(dataset.lastUsed, op.row)
    if (timestamp) touchedLastUsedIds.add(op.row.id)
  }
}

const handleRemoval = (dataset: GearDbRawDataset, op: Extract<GearDbRawDeltaOperation, { op: 'remove' }>): void => {
  if (op.table === 'Artifacts') {
    dataset.artifacts.delete(op.id)
    return
  }
  if (op.table === 'InboxArtifacts') {
    dataset.inboxArtifacts.delete(op.id)
    return
  }
  if (op.table === 'Champs') {
    removeChampion(dataset.champions, op.id)
    return
  }
  if (op.table === 'LastUsed') {
    removeLastUsed(dataset.lastUsed, op.id)
  }
}

const refreshChampionMetadata = (dataset: GearDbRawDataset, championIds: Set<number>): void => {
  const updateArtifact = (artifact: NormalizedGearArtifact) => {
    const championId = artifact.equippedToChampionId
    if (championId == null || !championIds.has(championId)) return
    const record = dataset.champions.get(championId) ?? null
    artifact.equippedChampionName = record?.name ?? null
    artifact.equippedChampionBaseId = record?.baseHeroId ?? null
    artifact.equippedChampionRarity = record?.rarity ?? null
    artifact.equippedChampionLocation = record
      ? (record.reserveVault ? 'reserveVault' : (record.vault ? 'vault' : 'collection'))
      : null
    artifact.testerItem = cloneGearInspectorItem(artifact)
  }
  dataset.artifacts.forEach(updateArtifact)
  dataset.inboxArtifacts.forEach(updateArtifact)
}

const refreshLastUsedMetadata = (dataset: GearDbRawDataset, artifactIds: Set<number>): void => {
  const updateArtifact = (artifact: NormalizedGearArtifact) => {
    if (!artifactIds.has(artifact.id)) return
    artifact.lastUseLocalTimestamp = dataset.lastUsed.get(artifact.id) ?? null
    artifact.testerItem = cloneGearInspectorItem(artifact)
  }
  dataset.artifacts.forEach(updateArtifact)
  dataset.inboxArtifacts.forEach(updateArtifact)
}
