import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLooseRollTargetEntry } from '../../src/lib/hsfBuilder.js'
import { StatVariant } from '../../src/lib/types.js'

// Every ingress quantizes per stat, so the variant is a required argument —
// these legacy-shape cases use a classic stat (integral grid).
const SPD = StatVariant.SPD

test('normalizeLooseRollTargetEntry converts numeric legacy values', () => {
  const entry = normalizeLooseRollTargetEntry(37, SPD)
  assert.deepEqual(entry, { base: 37 })
})

test('normalizeLooseRollTargetEntry parses numeric strings', () => {
  const entry = normalizeLooseRollTargetEntry('42', SPD)
  assert.deepEqual(entry, { base: 42 })
})

test('normalizeLooseRollTargetEntry clamps negatives to zero', () => {
  const entry = normalizeLooseRollTargetEntry(-5, SPD)
  assert.deepEqual(entry, { base: 0 })
})

test('normalizeLooseRollTargetEntry ignores unsupported payloads', () => {
  const entry = normalizeLooseRollTargetEntry(Symbol('substat'), SPD)
  assert.equal(entry, null)
})
