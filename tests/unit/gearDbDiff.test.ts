/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import { diffGearInspectorItems, fingerprintGearInspectorItem, type GearInspectorItem } from '../../src/lib/gearInspectorSession.js'
import type { TestItem } from '../../src/lib/ruleEval.js'

// Use cwd so compiled tests still resolve repo assets.
const repoRoot = process.cwd()
// Prefer bundled fixtures so the test never skips in CI.
const dbOnePath = join(repoRoot, 'tests', 'data', 'sample.db')
// Use the second fixture as the "newer" snapshot for diffing.
const dbTwoPath = join(repoRoot, 'tests', 'data', 'sample2.db')

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = Uint8Array.from(buffer)
  return copy.buffer
}

const fingerprintSnapshot = (items: Array<GearInspectorItem | TestItem>): Array<[string, number]> => {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = fingerprintGearInspectorItem(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

const stripItemId = (items: GearInspectorItem[], removalItemIds: Set<number>): GearInspectorItem[] => (
  items.filter((item) => !removalItemIds.has(item.itemId))
)

test('gear DB diff reuses entries across example backups', async () => {
  // Guard against unexpected fixture removal so failures are explicit.
  assert(existsSync(dbOnePath), `missing fixture: ${dbOnePath}`)
  // Keep the intent clear by validating both snapshots exist.
  assert(existsSync(dbTwoPath), `missing fixture: ${dbTwoPath}`)
  const readDb = async (path: string) => {
    const buffer = bufferToArrayBuffer(readFileSync(path))
    const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(buffer)
    return [...artifacts, ...inboxArtifacts]
  }

  const first = await readDb(dbOnePath)
  const second = await readDb(dbTwoPath)
  assert(first.length > 0, 'expected first DB to have artifacts')
  assert(second.length > 0, 'expected second DB to have artifacts')

  const currentItems: GearInspectorItem[] = first.map((artifact, idx) => ({
    ...(artifact.gearInspectorItem as GearInspectorItem),
    itemId: idx + 1,
  }))
  const desiredItems = second.map((artifact) => artifact.gearInspectorItem)

  const { removalItemIds, nextPendingQueue, additions } = diffGearInspectorItems(currentItems, desiredItems)
  assert(removalItemIds.length < currentItems.length, 'diff should keep some existing rows')
  assert(additions.length >= 0, 'added count should be non-negative')

  const survivors = stripItemId(currentItems, new Set(removalItemIds))
  const finalSnapshot = fingerprintSnapshot([...survivors, ...nextPendingQueue])
  const desiredSnapshot = fingerprintSnapshot(desiredItems)

  assert.deepEqual(finalSnapshot, desiredSnapshot, 'diff result should match desired tester payload')
})

test('gear DB diff retains manually added gear when requested', () => {
  const makePreviewExtras = (source: 'manual' | 'artifacts') => ({ source })
  const manual: GearInspectorItem = {
    itemId: 1,
    slot: 1,
    set: 0,
    rank: 6,
    rarity: 6,
    level: 0,
    faction: 0,
    previewExtras: makePreviewExtras('manual'),
  }
  const imported: GearInspectorItem = {
    itemId: 2,
    slot: 1,
    set: 0,
    rank: 6,
    rarity: 6,
    level: 0,
    faction: 0,
    previewExtras: makePreviewExtras('artifacts'),
  }
  {
    const { removalItemIds } = diffGearInspectorItems([manual, imported], [])
    assert(removalItemIds.includes(manual.itemId), 'manual gear should be removed without retention flag')
  }
  {
    const { removalItemIds } = diffGearInspectorItems([manual, imported], [], [], { retainManualItems: true })
    assert(!removalItemIds.includes(manual.itemId), 'manual gear should persist when retention flag is on')
    assert(removalItemIds.includes(imported.itemId), 'non-manual gear should still be removed when desired list is empty')
  }
})

export {}
