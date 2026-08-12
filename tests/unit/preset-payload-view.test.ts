/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneDefaultRulesFilterState,
  type RulesFilterState,
  type GearInspectorSourceFilter,
} from '../../src/lib/rulesFilter.js'
import {
  presetPayloadView,
  presetPayloadForMode,
} from '../../src/lib/rulesFilterMerge.js'
import type { FilterPreset } from '../../src/state/filterPresetsPreference.js'

// Build a filter state carrying Gear-Inspector-only selections (sources + ascension stars).
const giState = (sources: GearInspectorSourceFilter[]): RulesFilterState => {
  const s = cloneDefaultRulesFilterState()
  s.gearInspectorResult = { keep: false, sell: true, matched: true, unmatched: false }
  s.gearInspectorSources = { selected: sources }
  s.gearInspectorAscension = { stars: [0, 1], stats: [] }
  return s
}

// Minimal preset wrapper; only `snapshot.views` matters for payload resolution.
const presetWithViews = (rules: RulesFilterState, gearInspector: RulesFilterState): FilterPreset => ({
  id: 'p1',
  name: 'p1',
  savedAt: '',
  snapshot: {
    version: 1,
    filtersSynced: false,
    limitRecipesToFiltered: false,
    gearInspectorRecipeFilterMode: 'first',
    views: {
      rules: { open: false, state: rules, collapsed: {} as never },
      gearInspector: { open: false, state: gearInspector, collapsed: {} as never },
    },
  },
} as FilterPreset)

test('prefers the active panel view when both views contribute but differ', () => {
  // Regression: with "sync views" OFF the two stored views drift apart. A mode-agnostic scan
  // ('rules' first) picked the stale rules view and discarded the Gear Inspector selection.
  const preset = presetWithViews(giState(['inventory', 'vault']), giState(['vault', 'collection']))
  const view = presetPayloadView(preset, 'gearInspector')
  assert.deepEqual(view?.state.gearInspectorSources?.selected, ['vault', 'collection'])
})

test('the rules panel still resolves to its own view', () => {
  const preset = presetWithViews(giState(['inventory', 'vault']), giState(['vault', 'collection']))
  const view = presetPayloadView(preset, 'rules')
  assert.deepEqual(view?.state.gearInspectorSources?.selected, ['inventory', 'vault'])
})

test('falls back to the other view when the active one contributes nothing', () => {
  // A preset authored in the Gear Inspector must still apply in the Sellfile preview.
  const preset = presetWithViews(cloneDefaultRulesFilterState(), giState(['vault']))
  const view = presetPayloadView(preset, 'rules')
  assert.deepEqual(view?.state.gearInspectorSources?.selected, ['vault'])
})

test('a preset whose views are both empty resolves to a non-contributing view', () => {
  const preset = presetWithViews(cloneDefaultRulesFilterState(), cloneDefaultRulesFilterState())
  const view = presetPayloadView(preset, 'gearInspector')
  assert.ok(view, 'a view is still returned so apply is a harmless no-op')
  assert.deepEqual(view?.state.gearInspectorSources?.selected, [])
})

test('presetPayloadForMode projects the active panel view onto that panel', () => {
  const preset = presetWithViews(giState(['inventory', 'vault']), giState(['vault', 'collection']))
  // Gear Inspector keeps the GI-only fields intact.
  const gi = presetPayloadForMode(preset, 'gearInspector')
  assert.deepEqual(gi?.gearInspectorSources?.selected, ['vault', 'collection'])
  assert.deepEqual(gi?.gearInspectorAscension?.stars, [0, 1])
  // The rules panel strips GI-only fields, keeping the Sell intent as a rule flag.
  const rules = presetPayloadForMode(preset, 'rules')
  assert.deepEqual(rules?.gearInspectorSources?.selected, [])
  assert.equal(rules?.rule?.keep, 'no')
})
