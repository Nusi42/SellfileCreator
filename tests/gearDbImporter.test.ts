/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { importGearDatabaseFromArrayBuffer } from '../src/lib/importers/gearDbImporter.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, '..', '..', '..', 'examples', 'um109288203_RSLHelper.db')

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(buffer)
  return copy.buffer
}

test('gear DB importer normalizes artifacts and inbox items', async (t) => {
  if (!existsSync(dbPath)) {
    t.skip('sample database not available')
    return
  }
  const arrayBuffer = bufferToArrayBuffer(readFileSync(dbPath))
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(arrayBuffer)

  assert.equal(artifacts.length, 6900)
  assert.equal(inboxArtifacts.length, 358)

  const weapon = artifacts.find((item) => item.slot === 5)
  assert(weapon, 'expected weapon artifact in dataset')
  assert.equal(weapon?.testerItem.rank, 6)
  assert.equal(weapon?.testerItem.set, weapon?.set)

  const inboxRing = inboxArtifacts.find((item) => item.slot === 7)
  assert(inboxRing, 'expected ring in inbox dataset')
  assert.equal(inboxRing?.testerItem.faction, inboxRing?.faction)
})

export {}
