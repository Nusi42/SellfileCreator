import test from 'node:test'
import assert from 'node:assert/strict'
import { areAutosaveFiltersDefault } from '../src/hooks/useAutosaveRestore.js'
import { cloneDefaultRulesFilterState, cloneDefaultRulesFilterCollapsed, RULES_FILTER_OPEN_DEFAULT } from '../src/state/rulesFilterPersistence.js'
import { TESTER_CONFIG_FILTER_MODE_DEFAULT } from '../src/types/testerConfigFilterMode.js'

// Shared builder avoids copy/paste while keeping defaults obvious per test.
const buildFilters = (overrides = {}) => ({
  open: RULES_FILTER_OPEN_DEFAULT,
  state: cloneDefaultRulesFilterState(),
  collapsed: cloneDefaultRulesFilterCollapsed(),
  testerConfigFilterMode: TESTER_CONFIG_FILTER_MODE_DEFAULT,
  ...overrides,
})

// Baseline factory filters should be treated as absent so autosave stays clean.
test('default filters are treated as absent', () => {
  const filters = buildFilters()
  assert.equal(areAutosaveFiltersDefault(filters), true)
})

// Tweaking visibility or selections must force autosave to retain the filters.
test('custom chips or toggles mark filters as non-default', () => {
  const openPanel = buildFilters({ open: true })
  assert.equal(areAutosaveFiltersDefault(openPanel), false)
  const setsFilter = buildFilters()
  setsFilter.state.sets.selected = [1]
  assert.equal(areAutosaveFiltersDefault(setsFilter), false)
})

// Explicit null payloads also count as default, simplifying callers.
test('null filters still count as default', () => {
  assert.equal(areAutosaveFiltersDefault(null), true)
})

// Export marker keeps eslint happy when scanning for unused modules.
export const __autosaveFiltersDefaultTestMarker = true
