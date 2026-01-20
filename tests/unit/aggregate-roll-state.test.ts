/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  aggregateRollStateFromConfig,
  aggregateRollStateToConfig,
  applyAggregateRollAction,
} from '../../src/lib/aggregateRollState'
import type { BuilderConfig } from '../../src/lib/hsfBuilder'

type AggregateRollConfig = Pick<BuilderConfig, 'autoMinRequiredRolls' | 'minRequiredRolls' | 'lockedMinRequiredRolls'>

const baseConfig = (overrides: Partial<AggregateRollConfig> = {}): AggregateRollConfig => ({
  autoMinRequiredRolls: true,
  minRequiredRolls: 0,
  lockedMinRequiredRolls: 0,
  ...overrides,
})

test('toggle manual value sets and clears Auto consistently', () => {
  const initial = aggregateRollStateFromConfig(baseConfig())
  const manual = applyAggregateRollAction(initial, { type: 'toggle-manual', value: 3 })
  assert.deepEqual(manual, { auto: false, manual: 3, locked: 0 })
  const cleared = applyAggregateRollAction(manual, { type: 'toggle-manual', value: 3 })
  assert.deepEqual(cleared, { auto: true, manual: 0, locked: 0 })
})

test('locking a value above the manual total clears the manual selection but keeps Auto off', () => {
  const manualState = aggregateRollStateFromConfig(baseConfig({ autoMinRequiredRolls: false, minRequiredRolls: 2 }))
  const locked = applyAggregateRollAction(manualState, { type: 'toggle-lock', value: 3 })
  assert.deepEqual(locked, { auto: false, manual: 0, locked: 3 })
})

test('locking a lower value preserves the manual target', () => {
  const manualState = aggregateRollStateFromConfig(baseConfig({ autoMinRequiredRolls: false, minRequiredRolls: 4 }))
  const locked = applyAggregateRollAction(manualState, { type: 'toggle-lock', value: 1 })
  assert.deepEqual(locked, { auto: false, manual: 4, locked: 1 })
})

test('unlocking restores the lock value as the manual target when none exists', () => {
  const locked = { auto: false, manual: 0, locked: 2 } as const
  const unlocked = applyAggregateRollAction(locked, { type: 'toggle-lock', value: 2 })
  assert.deepEqual(unlocked, { auto: false, manual: 2, locked: 0 })
})

test('toggling a manual value below the lock clears the lock', () => {
  const state = { auto: false, manual: 4, locked: 2 } as const
  const next = applyAggregateRollAction(state, { type: 'toggle-manual', value: 1 })
  assert.deepEqual(next, { auto: false, manual: 1, locked: 0 })
})

test('toggling the active manual value while a lock exists keeps only the lock', () => {
  const state = { auto: false, manual: 3, locked: 1 } as const
  const next = applyAggregateRollAction(state, { type: 'toggle-manual', value: 3 })
  assert.deepEqual(next, { auto: false, manual: 0, locked: 1 })
})

test('state round-trips through config helpers', () => {
  const cfg = baseConfig({ autoMinRequiredRolls: false, minRequiredRolls: 2, lockedMinRequiredRolls: 1 })
  const state = aggregateRollStateFromConfig(cfg)
  const patch = aggregateRollStateToConfig(state)
  assert.equal(patch.autoMinRequiredRolls, false)
  assert.equal(patch.minRequiredRolls, 2)
  assert.equal(patch.lockedMinRequiredRolls, 1)
})
