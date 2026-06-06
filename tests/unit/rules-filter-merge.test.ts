/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneDefaultRulesFilterState,
  type RulesFilterState,
} from '../../src/lib/rulesFilter.js'
import {
  mergeRulesFilterState,
  subtractRulesFilterState,
  rulesFilterStateContains,
  rulesFilterStateHasContribution,
  rulesFilterStateAppliesToRulesMode,
} from '../../src/lib/rulesFilterMerge.js'

// Helper: a default state with the given mutation applied (deep, independent copy).
const withState = (mutate: (s: RulesFilterState) => void): RulesFilterState => {
  const s = cloneDefaultRulesFilterState()
  mutate(s)
  return s
}

test('merge unions numeric array selections (slots)', () => {
  const base = withState((s) => { s.slots.selected = [1, 2] as RulesFilterState['slots']['selected'] })
  const add = withState((s) => { s.slots.selected = [2, 3] as RulesFilterState['slots']['selected'] })
  const merged = mergeRulesFilterState(base, add)
  assert.deepEqual([...merged.slots.selected].sort(), [1, 2, 3])
})

test('merge unions set selections by id', () => {
  const base = withState((s) => { s.sets.selected = [{ id: 10 }] as RulesFilterState['sets']['selected'] })
  const add = withState((s) => { s.sets.selected = [{ id: 10 }, { id: 20 }] as RulesFilterState['sets']['selected'] })
  const merged = mergeRulesFilterState(base, add)
  assert.deepEqual(merged.sets.selected.map((e) => Number(e.id)).sort(), [10, 20])
})

test('merge ORs the gear inspector result flags', () => {
  const base = withState((s) => { s.gearInspectorResult = { keep: true, sell: false, matched: false, unmatched: false } })
  const add = withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: false, unmatched: false } })
  const merged = mergeRulesFilterState(base, add)
  assert.deepEqual(merged.gearInspectorResult, { keep: true, sell: true, matched: false, unmatched: false })
})

test('merge applies a scalar override only when the addition differs from default', () => {
  // recipeName query: add differs from default '' so it overrides base.
  const base = cloneDefaultRulesFilterState()
  const add = withState((s) => { s.recipeName = { query: 'spd' } })
  assert.equal(mergeRulesFilterState(base, add).recipeName?.query, 'spd')

  // anyMode: add at default ('include') leaves the base's non-default mode intact.
  const baseMode = withState((s) => { s.slots.anyMode = 'only' })
  const addDefaultMode = cloneDefaultRulesFilterState()
  assert.equal(mergeRulesFilterState(baseMode, addDefaultMode).slots.anyMode, 'only')
})

test('contains is true exactly when the base already covers the addition', () => {
  const add = withState((s) => { s.slots.selected = [2, 3] as RulesFilterState['slots']['selected'] })
  const superset = withState((s) => { s.slots.selected = [1, 2, 3] as RulesFilterState['slots']['selected'] })
  const partial = withState((s) => { s.slots.selected = [2] as RulesFilterState['slots']['selected'] })
  assert.equal(rulesFilterStateContains(superset, add), true)
  assert.equal(rulesFilterStateContains(partial, add), false)
})

test('contains holds iff merging would be a no-op (algebra invariant)', () => {
  const cases: Array<[RulesFilterState, RulesFilterState]> = [
    [withState((s) => { s.slots.selected = [1, 2, 3] as RulesFilterState['slots']['selected'] }),
     withState((s) => { s.slots.selected = [2] as RulesFilterState['slots']['selected'] })],
    [cloneDefaultRulesFilterState(),
     withState((s) => { s.recipeName = { query: 'x' } })],
    [withState((s) => { s.gearInspectorResult = { keep: true, sell: true, matched: false, unmatched: false } }),
     withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: false, unmatched: false } })],
  ]
  for (const [base, add] of cases) {
    const noop = JSON.stringify(mergeRulesFilterState(base, add)) === JSON.stringify(base)
    assert.equal(rulesFilterStateContains(base, add), noop)
  }
})

test('subtract is the inverse of merge when starting from default', () => {
  const add = withState((s) => {
    s.slots.selected = [1, 2] as RulesFilterState['slots']['selected']
    s.recipeName = { query: 'abc' }
    s.gearInspectorResult = { keep: true, sell: false, matched: false, unmatched: false }
    s.slots.anyMode = 'only'
  })
  const base = cloneDefaultRulesFilterState()
  const merged = mergeRulesFilterState(base, add)
  const restored = subtractRulesFilterState(merged, add)
  assert.deepEqual(restored, base)
})

test('subtract only removes the addition, leaving unrelated selections intact', () => {
  const base = withState((s) => { s.slots.selected = [1, 2, 3] as RulesFilterState['slots']['selected'] })
  const add = withState((s) => { s.slots.selected = [2, 3] as RulesFilterState['slots']['selected'] })
  const result = subtractRulesFilterState(base, add)
  assert.deepEqual(result.slots.selected, [1])
})

test('untoggle (subtract + re-merge survivors) preserves a shared scalar another preset needs', () => {
  // Mirrors the built-in slot presets, which share slots.anyMode: 'off'.
  const A = withState((s) => { s.slots = { selected: [1, 2, 3] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  const B = withState((s) => { s.slots = { selected: [7, 8, 9] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  // Toggle A then B → union of slots, shared anyMode 'off'.
  const current = mergeRulesFilterState(mergeRulesFilterState(cloneDefaultRulesFilterState(), A), B)
  assert.deepEqual([...current.slots.selected].sort((a, b) => a - b), [1, 2, 3, 7, 8, 9])
  assert.equal(current.slots.anyMode, 'off')
  // Untoggle A the way handleUnapplyFilterPreset does: subtract A, then re-merge the still-active B.
  const next = mergeRulesFilterState(subtractRulesFilterState(current, A), B)
  assert.deepEqual([...next.slots.selected].sort((a, b) => a - b), [7, 8, 9])
  assert.equal(next.slots.anyMode, 'off') // restored by re-merging B
  assert.equal(rulesFilterStateContains(next, B), true) // B stays active
  assert.equal(rulesFilterStateContains(next, A), false) // A is gone
})

test('naive subtract alone drops a shared scalar (why re-merge is required)', () => {
  const A = withState((s) => { s.slots = { selected: [1, 2, 3] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  const B = withState((s) => { s.slots = { selected: [7, 8, 9] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  const current = mergeRulesFilterState(mergeRulesFilterState(cloneDefaultRulesFilterState(), A), B)
  const naive = subtractRulesFilterState(current, A)
  // The shared anyMode is reset to default, which would wrongly deactivate B — hence the re-merge step.
  assert.equal(naive.slots.anyMode, 'include')
  assert.equal(rulesFilterStateContains(naive, B), false)
})

test('a subset preset is subsumed by a superset preset (drives the untoggle drop)', () => {
  // Mirrors "Show only Sell" (sell) vs "Scoped Sell" (sell + matched + sources).
  const showOnlySell = withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: false, unmatched: false } })
  const scopedSell = withState((s) => {
    s.gearInspectorResult = { keep: false, sell: true, matched: true, unmatched: false }
    s.gearInspectorSources = { selected: ['inventory', 'vault'] }
  })
  // Scoped Sell fully contains Show only Sell, but not the reverse.
  assert.equal(rulesFilterStateContains(scopedSell, showOnlySell), true)
  assert.equal(rulesFilterStateContains(showOnlySell, scopedSell), false)
  // Untoggling Scoped Sell with no surviving preset to re-merge clears the sell flag entirely.
  const current = mergeRulesFilterState(cloneDefaultRulesFilterState(), scopedSell)
  const next = subtractRulesFilterState(current, scopedSell)
  assert.equal(next.gearInspectorResult?.sell, false)
  assert.equal(next.gearInspectorResult?.matched, false)
})

test('appliesToRulesMode is true only when a non-gear-inspector-only field contributes', () => {
  // Slot selection is meaningful in both panels → applies to the Sellfile preview.
  const slots = withState((s) => { s.slots = { selected: [1, 2] as RulesFilterState['slots']['selected'], anyMode: 'include' } })
  assert.equal(rulesFilterStateAppliesToRulesMode(slots), true)
  // Gear-Inspector-only payloads (result flags / sources) do not apply to the rules preview.
  const resultOnly = withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: true, unmatched: false } })
  assert.equal(rulesFilterStateAppliesToRulesMode(resultOnly), false)
  const sourcesOnly = withState((s) => { s.gearInspectorSources = { selected: ['inventory'] } })
  assert.equal(rulesFilterStateAppliesToRulesMode(sourcesOnly), false)
  // Mixed payload (slots + gear-inspector result) still applies because slots are rules-relevant.
  const mixed = withState((s) => {
    s.slots = { selected: [1] as RulesFilterState['slots']['selected'], anyMode: 'include' }
    s.gearInspectorResult = { keep: false, sell: true, matched: false, unmatched: false }
  })
  assert.equal(rulesFilterStateAppliesToRulesMode(mixed), true)
  // The default (empty) state contributes nothing, so it does not "apply".
  assert.equal(rulesFilterStateAppliesToRulesMode(cloneDefaultRulesFilterState()), false)
})

test('hasContribution reflects whether the state deviates from default', () => {
  assert.equal(rulesFilterStateHasContribution(cloneDefaultRulesFilterState()), false)
  assert.equal(
    rulesFilterStateHasContribution(withState((s) => { s.slots.selected = [1] as RulesFilterState['slots']['selected'] })),
    true,
  )
})
