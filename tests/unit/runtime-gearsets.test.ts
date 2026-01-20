/* eslint-disable import/no-unused-modules */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  registerRuntimeGearSetsPayload,
  getRuntimeGearSet,
  getRuntimeGearSetIcon,
  serializeRuntimeGearSets,
  normalizeRuntimeGearSetFilePayload,
  __dangerous__resetRuntimeGearSets_forTests,
} from '../../src/lib/gearSets/runtimeStore.js'

test('registerRuntimeGearSetsPayload stores custom sets', () => {
  __dangerous__resetRuntimeGearSets_forTests()
  const result = registerRuntimeGearSetsPayload({
    version: 1,
    sets: [
      {
        id: 5001,
        name: 'Test Set',
        pieceGroup: 'armorFixed',
        pieces: 2,
        text: 'SPD +10%',
        icon: 'data:image/png;base64,AA==',
      },
    ],
  })
  assert.deepEqual(result, { appliedIds: [5001], total: 1, rejected: 0 })
  const entry = getRuntimeGearSet(5001)
  assert.ok(entry, 'runtime set should be stored')
  assert.equal(entry?.canonicalName, 'Test Set')
  assert.equal(entry?.pieceGroup, 'armorFixed')
})

test('registerRuntimeGearSetsPayload accepts entries without icons', () => {
  __dangerous__resetRuntimeGearSets_forTests()
  const result = registerRuntimeGearSetsPayload({
    version: 1,
    sets: [
      {
        id: 5002,
        name: 'Nameless Aegis',
        pieceGroup: 'armorFixed',
        pieces: 2,
        text: 'DEF +10%',
      },
    ],
  })
  assert.deepEqual(result, { appliedIds: [5002], total: 1, rejected: 0 })
  const entry = getRuntimeGearSet(5002)
  assert.ok(entry, 'runtime set should be stored when icon is omitted')
  const fallbackIcon = getRuntimeGearSetIcon(5002)
  assert.ok(fallbackIcon?.startsWith('data:image/svg+xml'), 'missing icon should generate SVG data URL')
  const decoded = decodeURIComponent(String(fallbackIcon).split(',')[1] ?? '')
  assert.ok(decoded.includes('5002'), 'fallback art should embed the set id text')
})

test('serializeRuntimeGearSets emits stored entries with fallback art', () => {
  __dangerous__resetRuntimeGearSets_forTests()
  registerRuntimeGearSetsPayload({
    version: 1,
    sets: [
      {
        id: 9000,
        name: 'Ephemeral Ward',
        pieceGroup: 'armorFixed',
        pieces: 2,
        text: 'HP +10%',
      },
    ],
  })
  const payload = serializeRuntimeGearSets()
  assert.ok(payload, 'payload should exist after registering sets')
  assert.equal(payload?.sets?.length, 1)
  assert.ok(payload?.sets?.[0]?.icon?.startsWith('data:image/svg+xml'), 'fallback svg icon emitted')
})

test('normalizeRuntimeGearSetFilePayload rejects mismatched versions', () => {
  const normalized = normalizeRuntimeGearSetFilePayload({ version: 2, sets: [] })
  assert.equal(normalized, null)
})
