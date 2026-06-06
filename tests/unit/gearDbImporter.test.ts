/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import initSqlJs from 'sql.js'

import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'

// Use cwd so compiled tests still resolve repo assets.
const repoRoot = process.cwd()
// Keep large DB fixtures under tests/data to separate them from specs.
const sampleDbPath = join(repoRoot, 'tests', 'data', 'sample.db')
// Keep a fixture with REAL lastUse timestamps under versioned test data.
const helperRealLastUseDbPath = join(repoRoot, 'tests', 'data', 'sample2.db')

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(buffer)
  return copy.buffer
}

// Minimal subset of sql.js Database APIs used to synthesize a throwaway DB for tests.
type WritableDatabase = {
  run: (sql: string) => void
  export: () => Uint8Array
  close: () => void
  prepare: (sql: string) => {
    step: () => boolean
    getAsObject: () => Record<string, unknown>
    free: () => void
  }
}

test('gear DB importer normalizes artifacts and inbox items', async (t) => {
  if (!existsSync(sampleDbPath)) {
    t.skip('sample database not available')
    return
  }
  const arrayBuffer = bufferToArrayBuffer(readFileSync(sampleDbPath))
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)

  // Snapshot taken from tests/data/sample.db (sqlite counts).
  assert.equal(artifacts.length, 6900)
  assert.equal(inboxArtifacts.length, 358)

  const weapon = artifacts.find((item) => item.slot === 5)
  assert(weapon, 'expected weapon artifact in dataset')
  assert.equal(weapon?.gearInspectorItem.rank, 6)
  assert.equal(weapon?.gearInspectorItem.set, weapon?.set)
  const equipped = artifacts.find((item) => item.equippedChampion?.id != null)
  assert(equipped, 'expected equipped artifact in dataset')
  assert.notEqual(equipped?.equippedChampion?.name, null)
  assert.ok(['collection', 'vault', 'reserveVault'].includes(String(equipped?.equippedChampion?.location)), 'expected equipped artifact location to be set')

  const inboxRing = inboxArtifacts.find((item) => item.slot === 7)
  assert(inboxRing, 'expected ring in inbox dataset')
  assert.equal(inboxRing?.gearInspectorItem.faction, inboxRing?.faction)
  // Unequipped inbox items have no champion reference at all (the FK lookup misses).
  // Replaces the previous per-flat-field null checks now that the reference is unified.
  assert.equal(inboxRing?.equippedChampion, null)
})

test('gear DB importer threads last-used timestamps onto artifacts', async () => {
  const sqlWasmPath = join(repoRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => sqlWasmPath })
  const db = new SQL.Database() as unknown as WritableDatabase
  // Build a tiny DB with the LastUsedArtifacts table so importer wiring stays covered.
  db.run('CREATE TABLE Artifacts (ID INTEGER PRIMARY KEY, type INTEGER, rank INTEGER, rarity INTEGER, lvl INTEGER, aset INTEGER)')
  db.run('INSERT INTO Artifacts (ID, type, rank, rarity, lvl, aset) VALUES (1, 5, 6, 6, 16, 19)')
  db.run('INSERT INTO Artifacts (ID, type, rank, rarity, lvl, aset) VALUES (2, 1, 6, 6, 12, 19)')
  // Write a helper sentinel row (ID -1 / bogus slot) to ensure the importer skips metadata noise.
  db.run('INSERT INTO Artifacts (ID, type, rank, rarity, lvl, aset) VALUES (-1, 9999, 0, 0, 0, 0)')
  db.run('CREATE TABLE LastUsedArtifacts (id INTEGER PRIMARY KEY, lastUse REAL)')
  db.run("INSERT INTO LastUsedArtifacts (id, lastUse) VALUES (1, '2024-05-08 14:33:27.123')")
  db.run("INSERT INTO LastUsedArtifacts (id, lastUse) VALUES (2, julianday('2024-05-05 08:09:05.456', 'localtime'))")
  const formattedJulian = (() => {
    // Mirror SQLite's `strftime` conversion so assertions stay timezone-agnostic.
    const stmt = db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%f', lastUse, 'localtime') as ts FROM LastUsedArtifacts WHERE id = 2")
    try {
      if (!stmt.step()) throw new Error('failed to compute formatted lastUse')
      const row = stmt.getAsObject() as { ts: string }
      return row.ts
    } finally {
      stmt.free()
    }
  })()
  const binary = db.export()
  db.close()
  const arrayBuffer = bufferToArrayBuffer(Buffer.from(binary))
  const { artifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  assert.equal(artifacts.length, 2)
  assert.equal(artifacts.some((item) => item.id < 0), false)
  const directString = artifacts.find((item) => item.id === 1)
  const julianSource = artifacts.find((item) => item.id === 2)
  assert.equal(directString?.lastUseLocalTimestamp, '2024-05-08 14:33:27.123')
  assert.equal(directString?.gearInspectorItem.previewExtras?.lastUseLocalTimestamp, '2024-05-08 14:33:27.123')
  assert.equal(julianSource?.lastUseLocalTimestamp, formattedJulian)
  assert.equal(julianSource?.gearInspectorItem.previewExtras?.lastUseLocalTimestamp, formattedJulian)
})

test('gear DB importer reads lastUse timestamps from sample2 fixture', async () => {
  // Ensure the fixture is present so the test never skips in CI.
  assert(existsSync(helperRealLastUseDbPath), `missing fixture: ${helperRealLastUseDbPath}`)
  const arrayBuffer = bufferToArrayBuffer(readFileSync(helperRealLastUseDbPath))
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  // Snapshot counts come from tests/data/sample2.db.
  assert.equal(artifacts.length, 7676)
  // Inbox size anchors expectations for the importer output shape.
  assert.equal(inboxArtifacts.length, 86)
  assert.equal(artifacts.some((item) => item.id <= 0), false, 'sentinel artifacts should be dropped')
  // Use a stable artifact with known lastUse data.
  const target = artifacts.find((item) => item.id === 2817)
  assert(target, 'expected artifact 2817 in sample2 fixture')
  assert.equal(target?.lastUseLocalTimestamp, '2025-12-12 18:36:09.656')
  assert.equal(target?.gearInspectorItem.previewExtras?.lastUseLocalTimestamp, '2025-12-12 18:36:09.656')
})

export {}
