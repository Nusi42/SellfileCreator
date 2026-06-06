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
  reapplyRulesFilterScalars,
  rulesFilterStateContains,
  rulesFilterStateHasContribution,
  projectFilterStateToMode,
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

// Mirror handleUnapplyFilterPreset's math: pure-subtract the untoggled payload's selections, then
// re-derive shared scalar modes from the other still-active presets. Pure, so we verify it here.
const unOr = (
  current: RulesFilterState,
  untoggled: RulesFilterState,
  others: RulesFilterState[],
): RulesFilterState => {
  const survivors = others.filter((o) => rulesFilterStateHasContribution(o) && rulesFilterStateContains(current, o))
  let next = subtractRulesFilterState(current, untoggled)
  for (const s of survivors) next = reapplyRulesFilterScalars(next, s)
  return next
}

test('un-OR keeps a disjoint survivor toggled by restoring a shared scalar mode', () => {
  // Mirrors the built-in slot presets, which share slots.anyMode: 'off'.
  const artifacts = withState((s) => { s.slots = { selected: [1, 2, 3] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  const accessories = withState((s) => { s.slots = { selected: [7, 8, 9] as RulesFilterState['slots']['selected'], anyMode: 'off' } })
  const current = mergeRulesFilterState(mergeRulesFilterState(cloneDefaultRulesFilterState(), artifacts), accessories)
  const next = unOr(current, artifacts, [accessories])
  assert.deepEqual([...next.slots.selected].sort((a, b) => a - b), [7, 8, 9]) // only Artifacts' slots removed
  assert.equal(next.slots.anyMode, 'off') // shared scalar mode re-derived from Accessories
  assert.equal(rulesFilterStateContains(next, accessories), true) // stays toggled
  assert.equal(rulesFilterStateContains(next, artifacts), false)
})

test('un-OR removes a shared selection flag regardless of which overlapping preset is untoggled', () => {
  // "Show only Sell" (sell) and "Scoped Sell" (sell + matched + sources) both active.
  const showOnlySell = withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: false, unmatched: false } })
  const scopedSell = withState((s) => {
    s.gearInspectorResult = { keep: false, sell: true, matched: true, unmatched: false }
    s.gearInspectorSources = { selected: ['inventory', 'vault'] }
  })
  const current = mergeRulesFilterState(mergeRulesFilterState(cloneDefaultRulesFilterState(), scopedSell), showOnlySell)
  // Untoggling the subset clears the shared `sell` flag; the superset reads untoggled.
  const afterSell = unOr(current, showOnlySell, [scopedSell])
  assert.equal(afterSell.gearInspectorResult?.sell, false)
  assert.equal(rulesFilterStateContains(afterSell, scopedSell), false)
  // Untoggling the superset also clears `sell` (a selection, pure-subtracted) — the subset does not linger.
  const afterScoped = unOr(current, scopedSell, [showOnlySell])
  assert.equal(afterScoped.gearInspectorResult?.sell, false)
  assert.equal(rulesFilterStateContains(afterScoped, showOnlySell), false)
})

test('projectFilterStateToMode maps Sell intent across panels (Keep/Sell mapping)', () => {
  // A Sell preset authored in the Gear Inspector (result.sell) projects onto the rules panel as a
  // Sell-rule filter (rule.keep = 'no'), dropping Gear-Inspector-only fields.
  const sellResult = withState((s) => { s.gearInspectorResult = { keep: false, sell: true, matched: true, unmatched: false } })
  const toRules = projectFilterStateToMode(sellResult, 'rules')
  assert.equal(toRules.rule?.keep, 'no')
  assert.equal(toRules.gearInspectorResult?.sell, false) // GI-only field stripped
  assert.equal(rulesFilterStateHasContribution(toRules), true) // → applicable in the Sellfile preview

  // The reverse: a Sell rule filter projects onto the Gear Inspector as result.sell.
  const sellRule = withState((s) => { s.rule = { keep: 'no', use: 'any' } })
  const toGi = projectFilterStateToMode(sellRule, 'gearInspector')
  assert.equal(toGi.gearInspectorResult?.sell, true)
  assert.equal(toGi.rule?.keep, 'any') // rule axis reset on the GI side

  // Shared fields (slots) pass through unchanged in either direction.
  const slots = withState((s) => { s.slots = { selected: [1, 2] as RulesFilterState['slots']['selected'], anyMode: 'include' } })
  assert.deepEqual(projectFilterStateToMode(slots, 'rules').slots.selected, [1, 2])

  // A purely Gear-Inspector payload (sources only) projects to nothing on the rules panel.
  const sourcesOnly = withState((s) => { s.gearInspectorSources = { selected: ['inventory'] } })
  assert.equal(rulesFilterStateHasContribution(projectFilterStateToMode(sourcesOnly, 'rules')), false)
})

test('hasContribution reflects whether the state deviates from default', () => {
  assert.equal(rulesFilterStateHasContribution(cloneDefaultRulesFilterState()), false)
  assert.equal(
    rulesFilterStateHasContribution(withState((s) => { s.slots.selected = [1] as RulesFilterState['slots']['selected'] })),
    true,
  )
})
