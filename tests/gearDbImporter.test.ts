/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

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

export {}
