import test from 'node:test'
import assert from 'node:assert/strict'
import {
  partitionGearInspectorItemsForPersistence,
  type GearInspectorItem,
} from '../../src/lib/gearInspectorSession.js'
import { ArtifactType, ArtifactSet, StatVariant } from '../../src/lib/types.js'
import { GEAR_INSPECTOR_CUSTOM_ID_SENTINEL } from '../../src/lib/itemIdentity.js'

// A manual ("custom") piece: no previewExtras.source (or 'manual') → isManual = true.
const makeManual = (itemId: number): GearInspectorItem => ({
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

// An endpoint-sourced piece: previewExtras.source 'artifacts' → isManual = false.
const makeEndpoint = (itemId: number, dbId: number): GearInspectorItem => ({
  slot: ArtifactType.Weapon,
  set: ArtifactSet.Speed,
  rank: 6,
  rarity: 5,
  level: 16,
  faction: 0,
  main: StatVariant.ATK,
  subValues: { [StatVariant.SPD]: 10 },
  itemId,
  previewExtras: { source: 'artifacts', id: dbId },
} as GearInspectorItem)

test('partition splits manual pieces from endpoint pieces', () => {
  const manualA = makeManual(GEAR_INSPECTOR_CUSTOM_ID_SENTINEL)
  const manualB = makeManual(GEAR_INSPECTOR_CUSTOM_ID_SENTINEL - 1)
  const endpointA = makeEndpoint(500, 500)
  const endpointB = makeEndpoint(501, 501)
  const { endpointItems, customItems } = partitionGearInspectorItemsForPersistence([
    endpointA, manualA, endpointB, manualB,
  ])
  assert.deepEqual(customItems.map((i) => i.itemId).sort((a, b) => a - b), [manualB.itemId, manualA.itemId].sort((a, b) => a - b))
  assert.deepEqual(endpointItems.map((i) => i.itemId).sort((a, b) => a - b), [500, 501])
})

test('partition: all-manual input yields empty endpoint list', () => {
  const items = [makeManual(GEAR_INSPECTOR_CUSTOM_ID_SENTINEL), makeManual(GEAR_INSPECTOR_CUSTOM_ID_SENTINEL - 1)]
  const { endpointItems, customItems } = partitionGearInspectorItemsForPersistence(items)
  assert.equal(endpointItems.length, 0)
  assert.equal(customItems.length, 2)
})

test('partition: all-endpoint input yields empty custom list', () => {
  const items = [makeEndpoint(1, 1), makeEndpoint(2, 2)]
  const { endpointItems, customItems } = partitionGearInspectorItemsForPersistence(items)
  assert.equal(endpointItems.length, 2)
  assert.equal(customItems.length, 0)
})

test('partition: empty input yields two empty lists', () => {
  const { endpointItems, customItems } = partitionGearInspectorItemsForPersistence([])
  assert.equal(endpointItems.length, 0)
  assert.equal(customItems.length, 0)
})
