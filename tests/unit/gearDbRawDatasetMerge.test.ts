/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  createLastUsedLookup,
  mergeLastUsedLookup,
} from '../../src/lib/importers/gearDbLookups.js'
import { createDatasetFromSnapshot } from '../../src/lib/importers/gearDbRawDataset.js'
import type { GearDbLastUsedRow } from '../../src/lib/importers/gearDbNormalizer.js'
import type { GearDbRawSnapshotCommand } from '../../src/lib/externalCommands.js'

// Minimal but valid artifact rows — slot 5 = Weapon, set 19 = Speed, rank 6, rarity 4.
// Must have enough stat fields for normalizeGearDbArtifact to produce a real record.
const baseRow = {
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
  sumHP: 5235565133824,
  sumATK: 1138166333440,
  sumDEF: 0,
  sumSPD: 90194313216,
  sumCQuote: 257698037,
  sumCDMG: 515396074,
  sumRES: 0,
  sumACC: 0,
  REROLLCOUNT: 0,
} as const

const makeSnapshot = (
  artifactIds: number[],
  lastUsedRows: GearDbLastUsedRow[] = [],
  overrides: Partial<Record<number, object>> = {},
): GearDbRawSnapshotCommand => ({
  kind: 'gearDbRawSnapshot',
  snapshotId: null,
  payloadVersion: null,
  artifacts: artifactIds.map(id => ({ ...baseRow, ID: id, ...overrides[id] })),
  inboxArtifacts: [],
  champions: [],
  lastUsed: lastUsedRows,
})

// ─── mergeLastUsedLookup ────────────────────────────────────────────────────

test('mergeLastUsedLookup: incoming entries overwrite previous', () => {
  const previous = createLastUsedLookup([{ id: 1, lastUse: '2024-01-01 10:00:00' }])
  const incoming = createLastUsedLookup([{ id: 1, lastUse: '2024-06-15 12:00:00' }])
  const merged = mergeLastUsedLookup(incoming, previous)
  assert.equal(merged.get(1), '2024-06-15 12:00:00', 'incoming should overwrite previous for same id')
})

test('mergeLastUsedLookup: previous entries fill in missing ids', () => {
  const previous = createLastUsedLookup([
    { id: 1, lastUse: '2024-01-01 10:00:00' },
    { id: 2, lastUse: '2024-01-02 10:00:00' },
  ])
  // Incoming only has id=2; id=1 is absent.
  const incoming = createLastUsedLookup([{ id: 2, lastUse: '2024-06-15 12:00:00' }])
  const merged = mergeLastUsedLookup(incoming, previous)
  assert.equal(merged.get(1), '2024-01-01 10:00:00', 'absent id should fall back to previous')
  assert.equal(merged.get(2), '2024-06-15 12:00:00', 'present id should use incoming value')
})

test('mergeLastUsedLookup: empty incoming keeps all previous entries', () => {
  const previous = createLastUsedLookup([
    { id: 10, lastUse: '2024-03-01 08:00:00' },
    { id: 20, lastUse: '2024-03-02 09:00:00' },
  ])
  const incoming = createLastUsedLookup([])
  const merged = mergeLastUsedLookup(incoming, previous)
  assert.equal(merged.get(10), '2024-03-01 08:00:00', 'id=10 retained from previous')
  assert.equal(merged.get(20), '2024-03-02 09:00:00', 'id=20 retained from previous')
})

// ─── createDatasetFromSnapshot — lastUseLocalTimestamp protection ────────────

test('createDatasetFromSnapshot: sparse lastUsed feed does not wipe known timestamps', () => {
  // First snapshot: both artifacts have lastUsed timestamps.
  const snap1 = makeSnapshot([100, 200], [
    { id: 100, lastUse: '2024-05-01 10:00:00' },
    { id: 200, lastUse: '2024-05-02 11:00:00' },
  ])
  const { dataset: prev } = createDatasetFromSnapshot(snap1)

  // Second snapshot: artifact 200 is absent from lastUsed (sparse payload).
  const snap2 = makeSnapshot([100, 200], [
    { id: 100, lastUse: '2024-06-01 10:00:00' },
    // artifact 200 missing — endpoint did not report it
  ])
  const { dataset: next } = createDatasetFromSnapshot(snap2, prev)

  const ts100 = next.artifacts.get(100)?.lastUseLocalTimestamp
  const ts200 = next.artifacts.get(200)?.lastUseLocalTimestamp
  assert.equal(ts100, '2024-06-01 10:00:00', 'artifact 100 should have the new incoming timestamp')
  assert.equal(ts200, '2024-05-02 11:00:00', 'artifact 200 should retain previous timestamp when absent from new feed')
})

test('createDatasetFromSnapshot: null previous does not affect merge (no-op fallback)', () => {
  const snap = makeSnapshot([300], [{ id: 300, lastUse: '2024-04-10 09:00:00' }])
  const { dataset } = createDatasetFromSnapshot(snap, undefined)
  assert.equal(dataset.artifacts.get(300)?.lastUseLocalTimestamp, '2024-04-10 09:00:00')
})

// ─── createDatasetFromSnapshot — isLocked protection ────────────────────────

test('createDatasetFromSnapshot: undefined isLocked in row preserves previous true', () => {
  // First snapshot: artifact is locked.
  const snap1 = makeSnapshot([400], [], { 400: { isLocked: true } })
  const { dataset: prev } = createDatasetFromSnapshot(snap1)
  assert.equal(prev.artifacts.get(400)?.isLocked, true, 'sanity: first snapshot should have isLocked=true')

  // Second snapshot: row omits isLocked entirely (endpoint did not report the field).
  const snap2 = makeSnapshot([400], [], { 400: { isLocked: undefined } })
  const { dataset: next } = createDatasetFromSnapshot(snap2, prev)
  assert.equal(next.artifacts.get(400)?.isLocked, true, 'isLocked=true should be preserved when row omits the field')
  assert.equal(
    next.artifacts.get(400)?.gearInspectorItem.previewExtras?.isLocked,
    true,
    'previewExtras.isLocked should also reflect the preserved value',
  )
})

test('createDatasetFromSnapshot: explicit isLocked=false in row overwrites previous true', () => {
  const snap1 = makeSnapshot([500], [], { 500: { isLocked: true } })
  const { dataset: prev } = createDatasetFromSnapshot(snap1)

  // Explicit false means the endpoint is asserting "this item is unlocked".
  const snap2 = makeSnapshot([500], [], { 500: { isLocked: false } })
  const { dataset: next } = createDatasetFromSnapshot(snap2, prev)
  assert.equal(next.artifacts.get(500)?.isLocked, false, 'explicit isLocked=false should overwrite previous true')
})

test('createDatasetFromSnapshot: isLocked=undefined with no previous defaults to false', () => {
  // No previous dataset — undefined in the row should still produce false.
  const snap = makeSnapshot([600], [], { 600: { isLocked: undefined } })
  const { dataset } = createDatasetFromSnapshot(snap)
  assert.equal(dataset.artifacts.get(600)?.isLocked, false, 'without previous, undefined isLocked should default to false')
})
