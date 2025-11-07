/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RULES_FILTER_STATE, normalizeRulesFilterForTester, type RulesFilterState } from '../src/lib/rulesFilter.js'

test('normalizeRulesFilterForTester returns the same object when no changes are required', () => {
  const result = normalizeRulesFilterForTester(DEFAULT_RULES_FILTER_STATE)
  assert.equal(result, DEFAULT_RULES_FILTER_STATE)
})

test('normalizeRulesFilterForTester forces tester-incompatible Any modes back to include', () => {
  const dirty: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    main: { ...DEFAULT_RULES_FILTER_STATE.main, anyMode: 'only' },
    level: { ...DEFAULT_RULES_FILTER_STATE.level, anyMode: 'off' },
    slots: { ...DEFAULT_RULES_FILTER_STATE.slots, anyMode: 'only' },
    rank: { ...DEFAULT_RULES_FILTER_STATE.rank, anyMode: 'off' },
    rarity: { ...DEFAULT_RULES_FILTER_STATE.rarity, anyMode: 'only' },
  }

  const normalized = normalizeRulesFilterForTester(dirty)

  assert.notEqual(normalized, dirty)
  assert.equal(normalized.main.anyMode, 'include')
  assert.equal(normalized.level.anyMode, 'include')
  assert.equal(normalized.slots.anyMode, 'include')
  assert.equal(normalized.rank.anyMode, 'include')
  assert.equal(normalized.rarity.anyMode, 'include')

  // Ensure untouched sections retain referential equality so shallow compares still work elsewhere.
  assert.equal(normalized.sets, dirty.sets)
})
