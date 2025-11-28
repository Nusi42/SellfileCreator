/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

import initSqlJs from 'sql.js'

import { importGearDatabaseFromArrayBuffer } from '../src/lib/importers/gearDbImporter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..', '..', '..')
const sampleDbPath = join(repoRoot, 'tests', 'sample.db')
const brokenDbPath = join(repoRoot, 'tests', 'broken.db')

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(buffer)
  return copy.buffer
}

// Minimal subset of sql.js Database APIs used to synthesize a throwaway DB for tests.
type WritableDatabase = {
  run: (sql: string) => void
  export: () => Uint8Array
  close: () => void
}

test('gear DB importer normalizes artifacts and inbox items', async (t) => {
  if (!existsSync(sampleDbPath)) {
    t.skip('sample database not available')
    return
  }
  const arrayBuffer = bufferToArrayBuffer(readFileSync(sampleDbPath))
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)

  // Snapshot taken from tests/sample.db (sqlite counts).
  assert.equal(artifacts.length, 6900)
  assert.equal(inboxArtifacts.length, 358)

  const weapon = artifacts.find((item) => item.slot === 5)
  assert(weapon, 'expected weapon artifact in dataset')
  assert.equal(weapon?.testerItem.rank, 6)
  assert.equal(weapon?.testerItem.set, weapon?.set)
  const equipped = artifacts.find((item) => item.equippedToChampionId != null)
  assert(equipped, 'expected equipped artifact in dataset')
  assert.notEqual(equipped?.equippedChampionName, null)
  assert.ok(['collection', 'vault', 'reserveVault'].includes(String(equipped?.equippedChampionLocation)), 'expected equipped artifact location to be set')

  const inboxRing = inboxArtifacts.find((item) => item.slot === 7)
  assert(inboxRing, 'expected ring in inbox dataset')
  assert.equal(inboxRing?.testerItem.faction, inboxRing?.faction)
  assert.equal(inboxRing?.equippedChampionName, null)
  assert.equal(inboxRing?.equippedChampionLocation, null)
})

test('gear DB importer reports zero gear for broken databases', async (t) => {
  if (!existsSync(brokenDbPath)) {
    t.skip('broken database not available')
    return
  }
  const arrayBuffer = bufferToArrayBuffer(readFileSync(brokenDbPath))
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  assert.equal(artifacts.length, 0, 'expected broken DB to yield zero artifacts')
  assert.equal(inboxArtifacts.length, 0, 'expected broken DB to yield zero inbox artifacts')
})

test('gear DB importer threads last-used timestamps onto artifacts', async () => {
  const sqlWasmPath = join(repoRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => sqlWasmPath })
  const db = new SQL.Database() as unknown as WritableDatabase
  // Build a tiny DB with the LastUsedArtifacts table so importer wiring stays covered.
  db.run('CREATE TABLE Artifacts (ID INTEGER PRIMARY KEY, type INTEGER, rank INTEGER, rarity INTEGER, lvl INTEGER, aset INTEGER)')
  db.run('INSERT INTO Artifacts (ID, type, rank, rarity, lvl, aset) VALUES (1, 5, 6, 6, 16, 19)')
  db.run('CREATE TABLE LastUsedArtifacts (id INTEGER PRIMARY KEY, lastUse TEXT)')
  db.run("INSERT INTO LastUsedArtifacts (id, lastUse) VALUES (1, '2024-05-08 14:33:27.123')")
  const binary = db.export()
  db.close()
  const arrayBuffer = bufferToArrayBuffer(Buffer.from(binary))
  const { artifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0]?.lastUseLocalTimestamp, '2024-05-08 14:33:27.123')
  assert.equal(artifacts[0]?.testerItem.previewExtras?.lastUseLocalTimestamp, '2024-05-08 14:33:27.123')
})

export {}
