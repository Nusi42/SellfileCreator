import test from 'node:test'
import assert from 'node:assert/strict'
import { areAutosaveFiltersDefault, type AutosaveFiltersState } from '../../src/hooks/useAutosaveRestore.js'
import {
  cloneDefaultRulesFilterState,
  cloneDefaultRulesFilterCollapsed,
  RULES_FILTER_OPEN_DEFAULT,
  RULES_FILTER_PREVIEW_MODES,
} from '../../src/state/rulesFilterPersistence.js'
import { TESTER_RECIPE_FILTER_MODE_DEFAULT } from '../../src/types/testerRecipeFilterMode.js'

type Mode = typeof RULES_FILTER_PREVIEW_MODES[number]

// Shared builder avoids copy/paste while keeping defaults obvious per test.
const buildView = () => ({
  open: RULES_FILTER_OPEN_DEFAULT,
  state: cloneDefaultRulesFilterState(),
  collapsed: cloneDefaultRulesFilterCollapsed(),
})
const buildFilters = (overrides: Partial<AutosaveFiltersState> = {}): AutosaveFiltersState => {
  const baseViews = RULES_FILTER_PREVIEW_MODES.reduce((acc, mode) => {
    acc[mode] = buildView()
    return acc
  }, {} as Record<Mode, ReturnType<typeof buildView>>)
  return {
    activeMode: overrides.activeMode ?? 'rules',
    views: overrides.views ?? baseViews,
    testerRecipeFilterMode: overrides.testerRecipeFilterMode ?? TESTER_RECIPE_FILTER_MODE_DEFAULT,
    ...overrides,
  }
}

// Baseline factory filters should be treated as absent so autosave stays clean.
test('default filters are treated as absent', () => {
  const filters = buildFilters()
  assert.equal(areAutosaveFiltersDefault(filters), true)
})

// Tweaking visibility or selections must force autosave to retain the filters.
test('custom chips or toggles mark filters as non-default', () => {
  const openPanel = buildFilters({
    views: {
      rules: { ...buildView(), open: true },
      tester: buildView(),
    },
  })
  assert.equal(areAutosaveFiltersDefault(openPanel), false)
  const setsFilter = buildFilters()
  // Set selections now use entry objects so exclusions can be tracked.
  setsFilter.views.rules.state.sets.selected = [{ id: 1 }]
  assert.equal(areAutosaveFiltersDefault(setsFilter), false)
})

// Explicit null payloads also count as default, simplifying callers.
test('null filters still count as default', () => {
  assert.equal(areAutosaveFiltersDefault(null), true)
})

// Export marker keeps eslint happy when scanning for unused modules.
export const __autosaveFiltersDefaultTestMarker = true
