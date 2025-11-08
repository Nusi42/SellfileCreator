/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { importGearDatabaseFromArrayBuffer } from '../src/lib/importers/gearDbImporter.js'
import { diffRuleTesterItems, fingerprintRuleTesterItem, type RuleTesterItem } from '../src/lib/ruleTesterSession.js'
import type { TestItem } from '../src/lib/ruleEval.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..', '..', '..')
const dbOnePath = join(repoRoot, 'examples', 'um109288203_RSLHelper.db')
const dbTwoPath = join(repoRoot, 'examples', 'um109288203_RSLHelper.2.db')

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(buffer)
  return copy.buffer
}

const fingerprintSnapshot = (items: Array<RuleTesterItem | TestItem>): Array<[string, number]> => {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = fingerprintRuleTesterItem(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

const stripRowId = (items: RuleTesterItem[], removalRowIds: Set<number>): RuleTesterItem[] => (
  items.filter((item) => !removalRowIds.has(item.rowId))
)

test('gear DB diff reuses entries across example backups', async (t) => {
  if (!existsSync(dbOnePath) || !existsSync(dbTwoPath)) {
    t.skip('example gear DBs missing')
    return
  }

  const readDb = async (path: string) => {
    const buffer = bufferToArrayBuffer(readFileSync(path))
    const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(buffer)
    return [...artifacts, ...inboxArtifacts]
  }

  const first = await readDb(dbOnePath)
  const second = await readDb(dbTwoPath)
  assert(first.length > 0, 'expected first DB to have artifacts')
  assert(second.length > 0, 'expected second DB to have artifacts')

  const currentItems: RuleTesterItem[] = first.map((artifact, idx) => ({
    ...(artifact.testerItem as RuleTesterItem),
    rowId: idx + 1,
  }))
  const desiredItems = second.map((artifact) => artifact.testerItem)

  const { removalRowIds, nextPendingQueue, additions } = diffRuleTesterItems(currentItems, desiredItems)
  assert(removalRowIds.length < currentItems.length, 'diff should keep some existing rows')
  assert(additions.length >= 0, 'added count should be non-negative')

  const survivors = stripRowId(currentItems, new Set(removalRowIds))
  const finalSnapshot = fingerprintSnapshot([...survivors, ...nextPendingQueue])
  const desiredSnapshot = fingerprintSnapshot(desiredItems)

  assert.deepEqual(finalSnapshot, desiredSnapshot, 'diff result should match desired tester payload')
})

test('gear DB diff retains manual tester items when requested', () => {
  const makePreviewExtras = (source: 'tester' | 'artifacts') => ({ source })
  const manual: RuleTesterItem = {
    rowId: 1,
    slot: 1,
    set: 0,
    rank: 6,
    rarity: 6,
    level: 0,
    faction: 0,
    previewExtras: makePreviewExtras('tester'),
  }
  const imported: RuleTesterItem = {
    rowId: 2,
    slot: 1,
    set: 0,
    rank: 6,
    rarity: 6,
    level: 0,
    faction: 0,
    previewExtras: makePreviewExtras('artifacts'),
  }
  {
    const { removalRowIds } = diffRuleTesterItems([manual, imported], [])
    assert(removalRowIds.includes(manual.rowId), 'manual gear should be removed without retention flag')
  }
  {
    const { removalRowIds } = diffRuleTesterItems([manual, imported], [], [], { retainManualItems: true })
    assert(!removalRowIds.includes(manual.rowId), 'manual gear should persist when retention flag is on')
    assert(removalRowIds.includes(imported.rowId), 'non-manual gear should still be removed when desired list is empty')
  }
})

export {}
