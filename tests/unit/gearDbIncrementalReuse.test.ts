/* eslint import/no-unused-modules: off */
/**
 * gearDbIncrementalReuse
 *
 * Locks in the incremental-normalization fast path in createDatasetFromSnapshot.
 * RSL Helper re-pushes the FULL artifact DB on every change during farming, yet a
 * single row typically differs. The dataset builder must reuse the prior
 * NormalizedGearArtifact REFERENCE for every unchanged id (so downstream memos and
 * the content hash short-circuit) while still re-normalizing any row whose
 * revision, equip (cID), lastUse, equipped-champion record, or lock flag changed.
 *
 * Reference identity is the assertion that matters: `===` between the prior and
 * next normalized artifact proves no work was redone for that id.
 */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { createDatasetFromSnapshot } from '../../src/lib/importers/gearDbRawDataset.js'
import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
} from '../../src/lib/importers/gearDbNormalizer.js'
import type { GearDbRawSnapshotCommand } from '../../src/lib/externalCommands.js'

// Minimal valid artifact row — slot 5 = Weapon, set 19 = Speed. Carries a real
// `revision` so the incremental-reuse predicate has something to diff against.
const baseRow: Omit<GearDbArtifactRow, 'ID'> = {
  revision: 1000,
  price: 68400,
  rank: 6,
  type: 5,
  lvl: 16,
  mid: 2,
  mlvl: 0,
  mfl: 1,
  mlvlid: 1138166333440,
  mgv: 0,
  s1id: 1,
  s1lvl: 0,
  s1fl: 1,
  s1lvlid: 2302102470656,
  s1gv: 1181116006400,
  s2id: 8,
  s2lvl: 1,
  s2fl: 0,
  s2lvlid: 515396074,
  s2gv: 0,
  s3id: 4,
  s3lvl: 2,
  s3fl: 1,
  s3lvlid: 77309411328,
  s3gv: 12884901888,
  s4id: 7,
  s4lvl: 0,
  s4fl: 0,
  s4lvlid: 257698037,
  s4gv: 0,
  rarity: 4,
  aset: 19,
  accset: 0,
  cID: 0,
  REROLLCOUNT: 0,
}

// Build a snapshot from (id, revision) pairs plus optional per-id overrides.
const makeSnapshot = (
  rows: Array<{ id: number; revision?: number; override?: Partial<GearDbArtifactRow> }>,
  opts: { lastUsed?: GearDbLastUsedRow[]; champions?: GearDbChampionRow[] } = {},
): GearDbRawSnapshotCommand => ({
  kind: 'gearDbRawSnapshot',
  snapshotId: null,
  payloadVersion: null,
  artifacts: rows.map(({ id, revision, override }) => ({
    ...baseRow,
    ID: id,
    ...(revision != null ? { revision } : {}),
    ...override,
  })),
  inboxArtifacts: [],
  champions: opts.champions ?? [],
  lastUsed: opts.lastUsed ?? [],
})

test('unchanged rows reuse the prior normalized reference', () => {
  const first = makeSnapshot([
    { id: 1, revision: 100 },
    { id: 2, revision: 200 },
    { id: 3, revision: 300 },
  ])
  const { dataset: prev } = createDatasetFromSnapshot(first)

  // Second push: only id=2 changes (revision bump). 1 and 3 are byte-identical.
  const second = makeSnapshot([
    { id: 1, revision: 100 },
    { id: 2, revision: 201 },
    { id: 3, revision: 300 },
  ])
  const { dataset: next } = createDatasetFromSnapshot(second, prev)

  // Unchanged ids keep their EXACT prior reference — no re-normalization.
  assert.equal(next.artifacts.get(1), prev.artifacts.get(1), 'id=1 reference reused')
  assert.equal(next.artifacts.get(3), prev.artifacts.get(3), 'id=3 reference reused')
  // The changed id is a fresh object.
  assert.notEqual(next.artifacts.get(2), prev.artifacts.get(2), 'id=2 re-normalized')
})

test('revision bump re-normalizes only that id', () => {
  const { dataset: prev } = createDatasetFromSnapshot(makeSnapshot([{ id: 1, revision: 5 }]))
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 6 }]),
    prev,
  )
  assert.notEqual(next.artifacts.get(1), prev.artifacts.get(1), 'revision change forces re-normalize')
})

test('equip change (cID) without revision bump re-normalizes', () => {
  const champions: GearDbChampionRow[] = [
    { ID: 42, Name: 'Hero', BaseHeroID: 42, HeroID: 42, Rarity: 5, Vault: 0, RVault: 0 },
  ]
  const { dataset: prev } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 7, override: { cID: 0 } }], { champions }),
  )
  // Same revision, but now equipped to champion 42 — equip links can change
  // without a revision bump, so the reuse predicate must catch cID.
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 7, override: { cID: 42 } }], { champions }),
    prev,
  )
  assert.notEqual(next.artifacts.get(1), prev.artifacts.get(1), 'cID change forces re-normalize')
  assert.equal(next.artifacts.get(1)?.equippedChampion?.id, 42, 'new equip resolved')
})

test('lastUse change without revision bump re-normalizes', () => {
  const { dataset: prev } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 9 }], { lastUsed: [{ id: 1, lastUse: '2026-01-01 10:00:00' }] }),
  )
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 9 }], { lastUsed: [{ id: 1, lastUse: '2026-06-19 20:00:00' }] }),
    prev,
  )
  assert.notEqual(next.artifacts.get(1), prev.artifacts.get(1), 'lastUse change forces re-normalize')
  assert.equal(next.artifacts.get(1)?.lastUseLocalTimestamp, '2026-06-19 20:00:00', 'new lastUse resolved')
})

test('lock toggle without revision bump re-normalizes', () => {
  const { dataset: prev } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 11, override: { isLocked: false } }]),
  )
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 11, override: { isLocked: true } }]),
    prev,
  )
  assert.notEqual(next.artifacts.get(1), prev.artifacts.get(1), 'lock toggle forces re-normalize')
  assert.equal(next.artifacts.get(1)?.isLocked, true, 'new lock state resolved')
})

test('sparse lastUse (omitted) carries forward AND keeps reuse', () => {
  // First push seeds a timestamp; second omits the lastUsed array entirely.
  const { dataset: prev } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 13 }], { lastUsed: [{ id: 1, lastUse: '2026-01-01 10:00:00' }] }),
  )
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, revision: 13 }]), // no lastUsed → merge carries it forward
    prev,
  )
  // The resolved timestamp is unchanged after the merge, so reuse is valid.
  assert.equal(next.artifacts.get(1), prev.artifacts.get(1), 'sparse lastUse keeps reference')
  assert.equal(next.artifacts.get(1)?.lastUseLocalTimestamp, '2026-01-01 10:00:00', 'timestamp preserved')
})

test('rows missing a revision never reuse (cannot be diff-keyed)', () => {
  // A row with no/invalid revision must always re-normalize — there is no safe key.
  const { dataset: prev } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, override: { revision: 0 } }]),
  )
  const { dataset: next } = createDatasetFromSnapshot(
    makeSnapshot([{ id: 1, override: { revision: 0 } }]),
    prev,
  )
  assert.notEqual(next.artifacts.get(1), prev.artifacts.get(1), 'no-revision rows re-normalize')
})
