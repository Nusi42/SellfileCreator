/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  championRowToLookupRecord,
  createLastUsedLookup,
  mergeChampionRowFields,
  mergeLastUsedLookup,
  mergeLastUsedRows,
} from '../../src/lib/importers/gearDbLookups.js'
import {
  applyGearDbPartToSlots,
  buildRestoredGearDbBaselines,
  createDatasetFromSnapshot,
  type GearDbRawParts,
} from '../../src/lib/importers/gearDbRawDataset.js'
import type {
  GearDbChampionRow,
  GearDbLastUsedRow,
} from '../../src/lib/importers/gearDbNormalizer.js'
import type { TestItem } from '../../src/lib/ruleEval.js'
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
  champions: GearDbChampionRow[] = [],
): GearDbRawSnapshotCommand => ({
  kind: 'gearDbRawSnapshot',
  snapshotId: null,
  payloadVersion: null,
  artifacts: artifactIds.map(id => ({ ...baseRow, ID: id, ...overrides[id] })),
  inboxArtifacts: [],
  champions,
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

// ─── mergeChampionRowFields ─────────────────────────────────────────────────

test('mergeChampionRowFields: omitted fields carry forward, explicit values win', () => {
  // Prior row has full metadata; incoming "second burst" row omits everything but ID.
  const prior: GearDbChampionRow = {
    ID: 1, Name: 'Kael', BaseHeroID: 555, HeroID: 558, Rarity: 5, Affinity: 1, Vault: 0, RVault: 0,
  }
  const sparse: GearDbChampionRow = { ID: 1 }
  const merged = mergeChampionRowFields(sparse, prior)
  assert.equal(merged.Name, 'Kael', 'omitted Name carries forward')
  assert.equal(merged.BaseHeroID, 555, 'omitted BaseHeroID (icon source) carries forward')
  assert.equal(merged.Rarity, 5, 'omitted Rarity carries forward')
  assert.equal(merged.Affinity, 1, 'omitted Affinity carries forward')

  // Explicit value on incoming overrides prior.
  const explicit: GearDbChampionRow = { ID: 1, Name: 'Athel' }
  const merged2 = mergeChampionRowFields(explicit, prior)
  assert.equal(merged2.Name, 'Athel', 'explicit Name overrides prior')
  assert.equal(merged2.BaseHeroID, 555, 'still carries forward the omitted BaseHeroID')
})

// ─── createDatasetFromSnapshot — champion metadata protection ────────────────

test('createDatasetFromSnapshot: sparse champion push preserves icon/metadata', () => {
  // First push: full champion roster equipped on artifact 700 (cID=1).
  const snap1 = makeSnapshot([700], [], { 700: { cID: 1 } }, [
    { ID: 1, Name: 'Kael', BaseHeroID: 555, HeroID: 558, Rarity: 5, Affinity: 1 },
  ])
  const { dataset: prev } = createDatasetFromSnapshot(snap1)
  assert.equal(prev.champions.get(1)?.baseHeroId, 555, 'sanity: baseHeroId established')

  // Second push: champion row repeats without metadata (RSL Helper second burst).
  const snap2 = makeSnapshot([700], [], { 700: { cID: 1 } }, [{ ID: 1 }])
  const { dataset: next } = createDatasetFromSnapshot(snap2, prev)
  assert.equal(next.champions.get(1)?.baseHeroId, 555, 'baseHeroId (icon) preserved across sparse push')
  assert.equal(next.champions.get(1)?.name, 'Kael', 'name preserved across sparse push')
  assert.equal(next.champions.get(1)?.affinity, 1, 'affinity preserved across sparse push')
})

test('createDatasetFromSnapshot: champion absent from new roster is retained', () => {
  const snap1 = makeSnapshot([701], [], { 701: { cID: 2 } }, [
    { ID: 2, Name: 'Athel', BaseHeroID: 600, HeroID: 600, Rarity: 4 },
  ])
  const { dataset: prev } = createDatasetFromSnapshot(snap1)
  // New push omits champion 2 entirely (partial roster).
  const snap2 = makeSnapshot([701], [], { 701: { cID: 2 } }, [])
  const { dataset: next } = createDatasetFromSnapshot(snap2, prev)
  assert.equal(next.champions.get(2)?.name, 'Athel', 'champion absent from new roster is carried forward')
})

// ─── mergeLastUsedRows ──────────────────────────────────────────────────────

test('mergeLastUsedRows: incoming wins, prior fills gaps', () => {
  const prior: GearDbLastUsedRow[] = [
    { id: 1, lastUse: '2024-01-01 10:00:00' },
    { id: 2, lastUse: '2024-01-02 10:00:00' },
  ]
  const incoming: GearDbLastUsedRow[] = [{ id: 1, lastUse: '2024-06-01 10:00:00' }]
  const merged = mergeLastUsedRows(incoming, prior)
  const byId = new Map(merged.map(r => [Number(r.id ?? r.ID), r.lastUse]))
  assert.equal(byId.get(1), '2024-06-01 10:00:00', 'incoming wins for id 1')
  assert.equal(byId.get(2), '2024-01-02 10:00:00', 'prior retained for id 2')
})

test('mergeLastUsedRows: empty incoming keeps all prior', () => {
  const prior: GearDbLastUsedRow[] = [{ id: 5, lastUse: '2024-03-01 08:00:00' }]
  const merged = mergeLastUsedRows([], prior)
  assert.equal(merged.length, 1, 'prior row retained when incoming is empty')
  assert.equal(merged[0]?.lastUse, '2024-03-01 08:00:00')
})

// ─── buildRestoredGearDbBaselines ───────────────────────────────────────────

test('buildRestoredGearDbBaselines: reconstructs champions/lastUsed/equip map from items', () => {
  const items: TestItem[] = [{
    itemId: -1,
    subValues: {},
    previewExtras: {
      id: 900,
      source: 'artifacts',
      lastUseLocalTimestamp: '2024-05-01 10:00:00',
      equippedChampion: {
        id: 3, name: 'Coldheart', location: 'collection', baseHeroId: 700, rarity: 5,
        ascensionLevel: 2, empowermentLevel: null, affinity: 2, blessingGrade: null,
        starGrade: null, experienceLevel: null,
      },
    },
  } as unknown as TestItem]
  const { champions, lastUsed, equippedByArtifact } = buildRestoredGearDbBaselines(items)
  assert.equal(equippedByArtifact.get(900), 3, 'artifact→champion association reconstructed')
  assert.equal(lastUsed[0]?.lastUse, '2024-05-01 10:00:00', 'lastUsed reconstructed')
  assert.equal(champions[0]?.BaseHeroID, 700, 'champion baseHeroId reconstructed')
  assert.equal(champions[0]?.HeroID, 702, 'HeroID = baseHeroId + ascensionLevel')
})

// Intrinsics now ship on every live `champions` row, so championRowToLookupRecord
// reports them verbatim: no static backfill, and a sparse row (e.g. a baseline rebuilt
// from restored UI items) honestly reads null rather than guessing from baseHeroId.
// Carrying the last known value forward for those rows is upsertChampionRow's job.
test('championRowToLookupRecord reads live rarity/affinity/name verbatim', () => {
  const live: GearDbChampionRow = {
    ID: 5, HeroID: 2066, BaseHeroID: 2060, Rarity: 5, Affinity: 4, Name: 'Custom Name',
  } as GearDbChampionRow
  const record = championRowToLookupRecord(live)
  assert.equal(record?.rarity, 5, 'live rarity is used as-is')
  assert.equal(record?.affinity, 4, 'live affinity is used as-is')
  assert.equal(record?.name, 'Custom Name', 'live name is used as-is')
})

test('championRowToLookupRecord leaves absent intrinsics null (graceful)', () => {
  // Sparse row with no Rarity/Affinity/Name: fields stay null so the UI degrades to
  // no colour rather than inventing a value from the base template id.
  const sparse: GearDbChampionRow = { ID: 5, HeroID: 2066, BaseHeroID: 2060 } as GearDbChampionRow
  const record = championRowToLookupRecord(sparse)
  assert.ok(record, 'record built from sparse row')
  assert.equal(record?.rarity, null, 'absent rarity stays null')
  assert.equal(record?.affinity, null, 'absent affinity stays null')
  assert.equal(record?.name, null, 'absent name stays null')
})

// ─── Equip-feed slot semantics (applyGearDbPartToSlots) ────────────────────────
// Regression for stale equips: RSL Helper only re-sends `champions` when a CHAMPION
// changes. Moving gear between champions pushes `ArtifactByHeroID` + `artifacts` only,
// so before the equip feed was consumed the cID map stayed frozen at the last champions
// packet and gear kept rendering on the champion it had already left.

test('gearDbEquipped replaces the equip map without touching champion rows', () => {
  const parts: GearDbRawParts = {
    artifacts: null, inboxArtifacts: null, lastUsed: null,
    champions: [{ ID: 501, HeroID: 5010, BaseHeroID: 5010, Name: 'Keeper' } as GearDbChampionRow],
    // Prior equips as a champions packet would have left them.
    equippedByArtifact: new Map([[9001, 501], [9002, 501]]),
  }
  // Gear move: artifact 9002 leaves champion 501; the new map simply omits it.
  applyGearDbPartToSlots(parts, {
    kind: 'gearDbEquipped',
    equippedByArtifact: new Map([[9001, 501]]),
  })
  assert.equal(parts.equippedByArtifact?.size, 1, 'equip map replaced, not merged')
  assert.equal(parts.equippedByArtifact?.get(9001), 501, 'retained equip survives')
  assert.equal(parts.equippedByArtifact?.has(9002), false, 'unequipped artifact is dropped')
  // Champion metadata must be untouched — the equip feed carries none.
  assert.equal(parts.champions?.length, 1, 'champion rows untouched')
  assert.equal(parts.champions?.[0]?.Name, 'Keeper', 'champion metadata preserved')
})

test('a champions packet after an equip push still wins on equips', () => {
  const parts: GearDbRawParts = {
    artifacts: null, inboxArtifacts: null, lastUsed: null, champions: null,
    equippedByArtifact: new Map([[9001, 501]]),
  }
  // Champions packets carry their own authoritative slot maps; both feeds agree in
  // captures, so last-writer-wins is safe and keeps the newest view.
  applyGearDbPartToSlots(parts, {
    kind: 'gearDbChampions',
    champions: [{ ID: 502, HeroID: 5020, BaseHeroID: 5020 } as GearDbChampionRow],
    equippedByArtifact: new Map([[9001, 502]]),
  })
  assert.equal(parts.equippedByArtifact?.get(9001), 502, 'champions packet updates the equip map')
})

export {}
