import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGearInspectorMath,
  buildGearInspectorAutosavePayload,
  deserializeGearInspectorItems,
  type GearInspectorItem,
} from '../../src/lib/gearInspectorSession.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import {
  GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED,
  isGearInspectorCustomItemId,
  nextGearInspectorCustomItemId,
} from '../../src/lib/itemIdentity.js'
import { ArtifactType, ArtifactSet, StatVariant } from '../../src/lib/types.js'

// Minimal manual weapon; only the fields the migration/keying reads matter here.
const makeItem = (itemId: number): GearInspectorItem => ({
  slot: ArtifactType.Weapon,
  set: ArtifactSet.Speed,
  rank: 6,
  rarity: 5,
  level: 16,
  faction: 0,
  main: StatVariant.ATK,
  subValues: { [StatVariant.SPD]: 10 },
  itemId,
} as GearInspectorItem)

// A descending allocator mirroring App.tsx's ref-based allocGearInspectorItemId.
const makeAllocator = () => {
  let cursor = GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED
  return () => {
    const id = nextGearInspectorCustomItemId(cursor) ?? GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED - 1
    cursor = id
    return id
  }
}

test('deserialize relocates legacy low itemIds into the reserved custom band', () => {
  const math = createGearInspectorMath(defaultSubstatTargets())
  // Legacy autosave: ascending ids from 1 that collide with real DB artifact ids.
  const payload = buildGearInspectorAutosavePayload([makeItem(1), makeItem(2), makeItem(3)])
  const restored = deserializeGearInspectorItems(payload, { math, allocItemId: makeAllocator() })
  assert.ok(restored && restored.length === 3)
  // Every restored id must now be in the high custom band, and all distinct.
  const ids = restored!.map((r) => r.itemId)
  for (const id of ids) assert.equal(isGearInspectorCustomItemId(id), true, `id ${id} should be custom-band`)
  assert.equal(new Set(ids).size, 3)
})

test('deserialize keeps already-in-band custom ids but dedupes collisions', () => {
  const math = createGearInspectorMath(defaultSubstatTargets())
  const seed = GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED - 1 // sentinel
  // Two items already carry the SAME high custom id (duplicate) plus one good one.
  const payload = buildGearInspectorAutosavePayload([makeItem(seed), makeItem(seed), makeItem(seed - 1)])
  const restored = deserializeGearInspectorItems(payload, { math, allocItemId: makeAllocator() })
  assert.ok(restored && restored.length === 3)
  const ids = restored!.map((r) => r.itemId)
  // First occurrence of `seed` kept; the duplicate reassigned; `seed-1` kept.
  assert.equal(new Set(ids).size, 3, 'duplicate high ids must be split apart')
  for (const id of ids) assert.equal(isGearInspectorCustomItemId(id), true)
})
