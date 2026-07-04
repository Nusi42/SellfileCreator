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
  resolveEquippedChampionId,
  type GearDbArtifactRow,
  type GearDbChampionRow,
  type GearDbLastUsedRow,
  type NormalizedGearArtifact,
} from './gearDbNormalizer'
import {
  createChampionLookup,
  createLastUsedLookup,
  mergeLastUsedLookup,
  type ChampionLookup,
  type LastUsedLookup,
} from './gearDbLookups'
import type { GearDbRawSnapshotCommand } from '../externalCommands'

/**
 * Patch equipped-champion ids (cID) onto artifact rows using the champion slot map.
 * The endpoint reverses the relationship — champions list their artifacts instead of
 * artifacts carrying cID. Applied whenever the map yields a valid champion: RSL Helper
 * artifact rows always carry cID=0 (the equip link lives only in the champion
 * `artifacts` slot map), so a `cID != null` guard would skip every artifact and wipe
 * equip associations. The map only contains real equips, so a hit is authoritative.
 * Shared by App's snapshot synthesis AND the background account-push flow.
 */
export const patchArtifactRowsCID = (
  rows: GearDbArtifactRow[],
  equippedBy: ReadonlyMap<number, number> | null | undefined,
): GearDbArtifactRow[] => {
  if (!equippedBy || equippedBy.size === 0) return rows
  return rows.map((row) => {
    const championId = equippedBy.get(row.ID)
    return championId ? { ...row, cID: championId } : row
  })
}

export type GearDbRawDataset = {
  snapshotId: string | null
  champions: ChampionLookup
  lastUsed: LastUsedLookup
  artifacts: Map<number, NormalizedGearArtifact>
  inboxArtifacts: Map<number, NormalizedGearArtifact>
  // Raw revision per artifact id (inventory + inbox), captured at build time so
  // the NEXT snapshot can cheaply tell which rows actually changed and reuse the
  // unchanged normalized references (incremental ingest — see buildArtifactMap's
  // `reuse` hook). In-memory only; never persisted.
  artifactRevisions: Map<number, number>
}

type ArtifactSource = 'artifacts' | 'inbox'

/**
 * Build a full dataset from a JSON snapshot event so callers can diff it against
 * the currently rendered Gear Inspector queue.
 *
 * `previousDataset` is optional. When supplied, protected fields are merged
 * rather than blindly replaced:
 * - champion metadata (name, baseHeroId/icon, rarity, affinity, location, …):
 *   fields absent from a sparse champion push are carried forward, and champions
 *   present only in the previous lookup survive a partial roster push (see
 *   createChampionLookup → upsertChampionRow).
 * - `lastUseLocalTimestamp`: a non-null previous value is kept when the new feed
 *   omits the artifact from the lastUsed array (sparse payload protection).
 * - `isLocked`: when the incoming row did not include the field (`row.isLocked ===
 *   undefined`), a previously known `true` lock state is preserved rather than
 *   silently defaulting to `false`.
 */
export const createDatasetFromSnapshot = (
  snapshot: GearDbRawSnapshotCommand,
  previousDataset?: GearDbRawDataset,
): { dataset: GearDbRawDataset; gearInspectorItems: TestItem[]; artifactCount: number; inboxCount: number } => {
  // Build champion/last-used lookups first so artifact normalization has all
  // of the metadata the SQL importer would have provided.
  // Merge over the previous champion lookup so fields absent from a sparse push
  // (name, baseHeroId/icon, rarity, affinity, location) are preserved rather than
  // wiped — mirrors the lastUsed sparse-payload protection below.
  const championLookup = createChampionLookup(snapshot.champions, previousDataset?.champions)
  const incomingLastUsed = createLastUsedLookup(snapshot.lastUsed)
  // Merge over the previous lookup so timestamps absent from the new feed are
  // not dropped — endpoint lastUsed arrays can be sparse across pushes.
  const lastUsedLookup = previousDataset
    ? mergeLastUsedLookup(incomingLastUsed, previousDataset.lastUsed)
    : incomingLastUsed
  // Build the incremental-reuse predicate once per snapshot. A prior normalized
  // artifact is reused verbatim only when EVERY input to its normalization is
  // provably unchanged for that id:
  //   1. revision   — covers all stat/level/rarity/set edits the helper bumps;
  //   2. cID        — equip changes can occur WITHOUT a revision bump (the very
  //                   case the App.tsx cID fingerprint guards), so compare it;
  //   3. lastUse    — the resolved timestamp feeds normalization (display + sort);
  //   4. champion   — the equipped champion's lookup RECORD must be the same
  //                   reference, so a champion-metadata edit (icon, vault move)
  //                   re-normalizes the artifacts that point at it.
  // Any mismatch (or no prior dataset / no prior revision) falls through to a
  // full normalize. isLocked is intentionally not checked here: when the row
  // omits isLocked the carry-forward branch in buildArtifactMap only runs on the
  // normalize path, and an explicit lock/unlock bumps neither revision nor cID —
  // but it DOES change row.isLocked, which is not part of the reuse key, so a
  // lock toggle on an otherwise-identical row would be missed. Guard it: include
  // the raw isLocked flag in the reuse key.
  const makeReuse = (
    previousArtifacts: ReadonlyMap<number, NormalizedGearArtifact> | undefined,
  ): ((id: number, row: GearDbArtifactRow) => NormalizedGearArtifact | null) | undefined => {
    // No prior dataset → nothing to reuse; let every row normalize.
    if (!previousDataset || !previousArtifacts) return undefined
    const prevRevisions = previousDataset.artifactRevisions
    const prevChampions = previousDataset.champions
    const prevLastUsed = previousDataset.lastUsed
    return (id, row) => {
      const prev = previousArtifacts.get(id)
      if (!prev) return null
      // 1. revision must be present, valid, and unchanged.
      const rev = Number(row.revision)
      if (!Number.isFinite(rev) || rev <= 0) return null
      if (prevRevisions.get(id) !== rev) return null
      // 2. equip target unchanged.
      if (resolveEquippedChampionId(row) !== (prev.equippedChampion?.id ?? null)) return null
      // 3. resolved lastUse unchanged (both lookups merge sparse pushes, so a
      //    raw map miss means "carry forward" — compare the resolved values).
      if ((lastUsedLookup.get(id) ?? null) !== (prevLastUsed.get(id) ?? null)) return null
      // 4. equipped champion record is the same reference across lookups. When
      //    unequipped both are null/undefined and this holds trivially.
      const cid = prev.equippedChampion?.id ?? null
      if (cid != null && championLookup.get(cid) !== prevChampions.get(cid)) return null
      // 5. raw lock flag unchanged (an explicit toggle bumps neither rev nor cID).
      if ((row.isLocked === true) !== prev.isLocked) return null
      return prev
    }
  }

  const artifacts = buildArtifactMap(
    snapshot.artifacts, 'artifacts', championLookup, lastUsedLookup,
    previousDataset?.artifacts, makeReuse(previousDataset?.artifacts),
  )
  const inboxArtifacts = buildArtifactMap(
    snapshot.inboxArtifacts ?? [], 'inbox', championLookup, lastUsedLookup,
    previousDataset?.inboxArtifacts, makeReuse(previousDataset?.inboxArtifacts),
  )
  // Capture raw revisions for both collections so the NEXT push can diff cheaply.
  const artifactRevisions = buildArtifactRevisionMap(
    snapshot.artifacts, snapshot.inboxArtifacts ?? [],
  )
  const dataset: GearDbRawDataset = {
    snapshotId: snapshot.snapshotId ?? null,
    champions: championLookup,
    lastUsed: lastUsedLookup,
    artifacts,
    inboxArtifacts,
    artifactRevisions,
  }
  const { gearInspectorItems, artifactCount, inboxCount } = collectGearInspectorItems(dataset)
  return { dataset, gearInspectorItems, artifactCount, inboxCount }
}

/**
 * Reconstruct raw champion/lastUsed baselines (and the artifact→champion map) from the
 * currently rendered Gear Inspector queue.
 *
 * On restart the rich champion metadata, lastUse timestamps and equip associations are
 * restored into the rendered items but NOT into the endpoint merge refs. RSL Helper then
 * streams per-type pushes that are frequently incomplete and out of order — a sparse or
 * empty champions/lastUsed packet would wipe the restored data if it were used verbatim.
 * Callers merge these baselines UNDER each incoming packet (packet wins per id, baseline
 * fills the gaps) so no known data is lost while the burst is still in flight.
 *
 * The reverse-mapping is the single inverse of {@link cloneGearInspectorItem} /
 * {@link createChampionLookup}'s location flags — keep them in sync.
 */
export const buildRestoredGearDbBaselines = (
  items: readonly TestItem[],
): { champions: GearDbChampionRow[]; lastUsed: GearDbLastUsedRow[]; equippedByArtifact: Map<number, number> } => {
  const seenChampions = new Set<number>()
  const champions: GearDbChampionRow[] = []
  const lastUsed: GearDbLastUsedRow[] = []
  const equippedByArtifact = new Map<number, number>()
  for (const item of items) {
    const extras = item.previewExtras
    const aId = extras?.id
    // Rebuild the artifact→champion association so patchCID can restore cID.
    const champ = extras?.equippedChampion
    const cId = champ?.id
    if (aId != null && cId != null) equippedByArtifact.set(aId, cId)
    // Rebuild lastUsed rows so timestamps survive an artifacts-only / sparse push.
    const ts = extras?.lastUseLocalTimestamp
    if (aId != null && ts != null) lastUsed.push({ id: aId, lastUse: ts })
    // Rebuild one champion row per distinct equipped champion, reverse-mapping the
    // location enum back to the integer Vault/RVault flags the lookup expects.
    if (cId == null || champ == null || seenChampions.has(cId)) continue
    seenChampions.add(cId)
    const baseId = champ.baseHeroId
    const asc = champ.ascensionLevel
    champions.push({
      ID: cId,
      Name: champ.name ?? null,
      BaseHeroID: baseId ?? null,
      // HeroID = BaseHeroID + ascensionLevel; both required for the ascension calc.
      HeroID: baseId != null && asc != null ? baseId + asc : null,
      Rarity: champ.rarity ?? null,
      Vault: champ.location === 'vault' ? 1 : 0,
      RVault: champ.location === 'reserveVault' ? 1 : 0,
    })
  }
  return { champions, lastUsed, equippedByArtifact }
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
  // When provided, previously known protected field values are preserved over
  // endpoint defaults when the incoming row omits those fields.
  previousArtifacts?: ReadonlyMap<number, NormalizedGearArtifact>,
  // Incremental-reuse hook. During a farm session RSL Helper re-pushes the FULL
  // artifact DB (~7,777 rows) on every change even though typically a single row
  // differs (capture session_260619_201700.016: median 1, mean 1.3 changed/push).
  // When this predicate returns the prior NormalizedGearArtifact for an id, we
  // reuse that reference verbatim instead of re-running normalizeGearDbArtifact —
  // collapsing ~7,776 redundant normalizations per push. The caller owns the
  // safety check (revision + cID + lastUse + champion-record all unchanged); see
  // buildArtifactReuse in createDatasetFromSnapshot. Reuse is reference-stable,
  // so downstream memos (gearInspectorPreviewArtifacts) and the content hash also
  // short-circuit. Omitted (undefined) → every row is normalized as before.
  reuse?: (id: number, row: GearDbArtifactRow) => NormalizedGearArtifact | null,
): Map<number, NormalizedGearArtifact> => {
  const map = new Map<number, NormalizedGearArtifact>()
  for (const row of rows) {
    const id = Number(row.ID)
    if (!Number.isFinite(id) || id <= 0) continue
    // Fast path: an unchanged row reuses its prior normalized reference. This is
    // the dominant case during farming and the whole point of incremental ingest.
    const reused = reuse?.(id, row) ?? null
    if (reused) {
      map.set(id, reused)
      continue
    }
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
      // isLocked protection: when the endpoint row omits the field entirely
      // (undefined), the normalizer defaults to false. If we have a previous
      // artifact with isLocked=true, keep it — the endpoint is not asserting
      // "unlocked", it simply did not report the field.
      if (row.isLocked === undefined) {
        const prev = previousArtifacts?.get(id)
        if (prev?.isLocked === true) {
          normalized.isLocked = true
          normalized.gearInspectorItem = {
            ...normalized.gearInspectorItem,
            previewExtras: {
              ...normalized.gearInspectorItem.previewExtras,
              isLocked: true,
            },
          }
        }
      }
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

