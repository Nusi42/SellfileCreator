import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLooseRollTargetEntry } from '../../src/lib/hsfBuilder.js'

test('normalizeLooseRollTargetEntry converts numeric legacy values', () => {
  const entry = normalizeLooseRollTargetEntry(37)
  assert.deepEqual(entry, { base: 37 })
})

test('normalizeLooseRollTargetEntry parses numeric strings', () => {
  const entry = normalizeLooseRollTargetEntry('42')
  assert.deepEqual(entry, { base: 42 })
})

test('normalizeLooseRollTargetEntry clamps negatives to zero', () => {
  const entry = normalizeLooseRollTargetEntry(-5)
  assert.deepEqual(entry, { base: 0 })
})

test('normalizeLooseRollTargetEntry ignores unsupported payloads', () => {
  const entry = normalizeLooseRollTargetEntry(Symbol('substat'))
  assert.equal(entry, null)
})
