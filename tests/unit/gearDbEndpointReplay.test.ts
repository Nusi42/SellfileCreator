/* eslint import/no-unused-modules: off */
/**
 * gearDbEndpointReplay
 *
 * Replays the committed RSL Helper sample log (docs/orig/sampleLog/) through the real
 * normalize + dataset pipeline — the same path the live app uses for per-type endpoint
 * pushes — and asserts the resulting dataset carries the metadata the UI needs:
 *   - champions resolve a baseHeroId (the champion-icon source), and
 *   - equipped artifacts resolve their equippedChampion reference.
 *
 * This guards the "champ icons missing after endpoint push" symptom: if the WS payload
 * shape changes (e.g. typeId → BaseHeroID derivation breaks, or the per-champion
 * `artifacts` slot map stops feeding cID), this test fails before users see blank icons.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { normalizeExternalEvent } from '../../src/lib/externalCommands.js'
import { createDatasetFromSnapshot } from '../../src/lib/importers/gearDbRawDataset.js'
import type { GearDbRawSnapshotCommand } from '../../src/lib/externalCommands.js'
import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
} from '../../src/lib/importers/gearDbNormalizer.js'

const SAMPLE_DIR = resolve(process.cwd(), 'docs/orig/sampleLog')

// Read every packet_*.json envelope in send order (filename index is zero-padded).
const loadPackets = (): Array<{ method: string; payload: unknown }> => {
  const files = readdirSync(SAMPLE_DIR)
    .filter((name) => name.startsWith('packet_') && name.endsWith('.json'))
    .sort()
  return files.map((name) => {
    const env = JSON.parse(readFileSync(resolve(SAMPLE_DIR, name), 'utf8')) as {
      method?: string
      params?: unknown
    }
    return { method: env.method ?? '', payload: env.params ?? {} }
  })
}

// Fold the per-type packets into one merged snapshot, mirroring how App.tsx accumulates
// the four slots (last write wins per type) AND applies the champion-derived
// equippedByArtifact slot map onto artifact cID — exactly what handleGearDbRawPart's
// patchCID does, since RSL Helper artifact rows carry no cID of their own.
const buildMergedSnapshot = (): GearDbRawSnapshotCommand => {
  let artifacts: GearDbArtifactRow[] = []
  let inboxArtifacts: GearDbArtifactRow[] = []
  let champions: GearDbChampionRow[] = []
  let lastUsed: GearDbLastUsedRow[] = []
  let equippedByArtifact = new Map<number, number>()
  for (const { method, payload } of loadPackets()) {
    const command = normalizeExternalEvent(method, payload)
    if (!command) continue
    if (command.kind === 'gearDbArtifacts') artifacts = command.artifacts
    else if (command.kind === 'gearDbInboxArtifacts') inboxArtifacts = command.inboxArtifacts
    else if (command.kind === 'gearDbChampions') {
      champions = command.champions
      equippedByArtifact = command.equippedByArtifact
    } else if (command.kind === 'gearDbLastUsed') lastUsed = command.lastUsed
  }
  // patchCID: RSL Helper artifact rows carry cID=0; the equip link lives only in the
  // champion slot map. Apply the inversion whenever it has a match (no cID short-circuit
  // — that would skip every cID=0 row). Mirrors handleGearDbRawPart's patchCID.
  const patchCID = (rows: GearDbArtifactRow[]): GearDbArtifactRow[] =>
    rows.map((row) => {
      const championId = equippedByArtifact.get(row.ID)
      return championId ? { ...row, cID: championId } : row
    })
  return {
    kind: 'gearDbRawSnapshot',
    snapshotId: null,
    payloadVersion: null,
    artifacts: patchCID(artifacts),
    inboxArtifacts: patchCID(inboxArtifacts),
    champions,
    lastUsed,
  }
}

test('sample log: champions resolve baseHeroId (icon source) from typeId', () => {
  const snapshot = buildMergedSnapshot()
  assert(snapshot.champions.length > 0, 'sample log should carry champion rows')
  const { dataset } = createDatasetFromSnapshot(snapshot)
  const champs = Array.from(dataset.champions.values())
  assert(champs.length > 0, 'dataset should contain champions')
  // Every champion must resolve a positive baseHeroId — that (or id) drives the icon.
  const withIcon = champs.filter((c) => c.baseHeroId != null && c.baseHeroId > 0)
  assert.equal(withIcon.length, champs.length, 'all champions should derive a baseHeroId')
})

test('sample log: equipped artifacts resolve their equippedChampion reference', () => {
  const snapshot = buildMergedSnapshot()
  const { dataset } = createDatasetFromSnapshot(snapshot)
  const artifacts = Array.from(dataset.artifacts.values())
  assert(artifacts.length > 0, 'dataset should contain artifacts')
  // At least some artifacts are equipped (the champion slot maps reference them), and
  // those must carry a resolved equippedChampion with a usable icon id.
  const equipped = artifacts.filter((a) => a.equippedChampion != null)
  assert(equipped.length > 0, 'some artifacts should be equipped on champions')
  for (const a of equipped) {
    const champ = a.equippedChampion
    assert(champ, 'equipped artifact must carry a champion record')
    const iconId = champ.baseHeroId ?? champ.id
    assert(iconId != null && iconId > 0, `equipped champion ${champ.id} must have an icon id`)
  }
})
