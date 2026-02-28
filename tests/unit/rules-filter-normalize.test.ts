/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RULES_FILTER_STATE,
  normalizeRulesFilterForGearInspector,
  toggleGearInspectorLastUsePresetSelection,
  type RulesFilterState,
} from '../../src/lib/rulesFilter.js'

test('normalizeRulesFilterForGearInspector returns the same object when no changes are required', () => {
  const result = normalizeRulesFilterForGearInspector(DEFAULT_RULES_FILTER_STATE)
  assert.equal(result, DEFAULT_RULES_FILTER_STATE)
})

test('normalizeRulesFilterForGearInspector forces tester-incompatible Any modes back to include', () => {
  const dirty: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    main: { ...DEFAULT_RULES_FILTER_STATE.main, anyMode: 'only' },
    level: { ...DEFAULT_RULES_FILTER_STATE.level, anyMode: 'off' },
    slots: { ...DEFAULT_RULES_FILTER_STATE.slots, anyMode: 'only' },
    rank: { ...DEFAULT_RULES_FILTER_STATE.rank, anyMode: 'off' },
    rarity: { ...DEFAULT_RULES_FILTER_STATE.rarity, anyMode: 'only' },
  }

  const normalized = normalizeRulesFilterForGearInspector(dirty)

  assert.notEqual(normalized, dirty)
  assert.equal(normalized.main.anyMode, 'include')
  assert.equal(normalized.level.anyMode, 'include')
  assert.equal(normalized.slots.anyMode, 'include')
  assert.equal(normalized.rank.anyMode, 'include')
  assert.equal(normalized.rarity.anyMode, 'include')

  // Ensure untouched sections retain referential equality so shallow compares still work elsewhere.
  assert.equal(normalized.sets, dirty.sets)
})

test('toggleGearInspectorLastUsePresetSelection swaps recency buckets when choosing a narrower preset', () => {
  const initial = toggleGearInspectorLastUsePresetSelection([], 'recent90')
  assert.deepEqual(initial, ['recent90'])

  const narrowed = toggleGearInspectorLastUsePresetSelection(initial, 'recent30')
  assert.deepEqual(narrowed, ['recent30'])

  const narrowest = toggleGearInspectorLastUsePresetSelection(narrowed, 'recent7')
  assert.deepEqual(narrowest, ['recent7'])

  const cleared = toggleGearInspectorLastUsePresetSelection(narrowest, 'recent7')
  assert.deepEqual(cleared, [])
})
