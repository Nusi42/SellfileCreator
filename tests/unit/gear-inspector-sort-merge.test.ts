/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE,
  type GearInspectorSubstatSortState,
} from '../../src/state/gearInspectorSubstatSortPreferences.js'
import {
  mergeSortState,
  subtractSortState,
  reapplySortScalars,
  sortStateContains,
  sortStateHasContribution,
} from '../../src/lib/gearInspectorSortMerge.js'
import { GEAR_INSPECTOR_SORT_KEY_NEWEST, type GearInspectorSortKey } from '../../src/lib/gearInspectorSort.js'
import { StatVariant } from '../../src/lib/types.js'

const SPD = StatVariant.SPD as unknown as GearInspectorSortKey
const NEWEST = GEAR_INSPECTOR_SORT_KEY_NEWEST as GearInspectorSortKey

// Default sort state with the given priority levels (deep copy so tests stay independent).
const withSort = (priorities: GearInspectorSortKey[]): GearInspectorSubstatSortState => ({
  ...(JSON.parse(JSON.stringify(DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE)) as GearInspectorSubstatSortState),
  priorities,
})

test('stacking appends new sort levels in toggle order, deduped', () => {
  const merged = mergeSortState(withSort([SPD]), withSort([SPD, NEWEST]))
  assert.deepEqual(merged.priorities.map(Number), [Number(SPD), Number(NEWEST)])
})

test('sortStateContains is true iff the current sort already has the preset levels', () => {
  assert.equal(sortStateContains(withSort([SPD, NEWEST]), withSort([NEWEST])), true)
  assert.equal(sortStateContains(withSort([SPD]), withSort([NEWEST])), false)
})

test('subtract removes only the preset levels (un-OR)', () => {
  const result = subtractSortState(withSort([SPD, NEWEST]), withSort([NEWEST]))
  assert.deepEqual(result.priorities.map(Number), [Number(SPD)])
})

test('subtract(merge(base, add), add) round-trips back to base for a stacked level', () => {
  const base = withSort([SPD])
  const add = withSort([NEWEST])
  assert.deepEqual(subtractSortState(mergeSortState(base, add), add).priorities.map(Number), [Number(SPD)])
})

test('hasContribution reflects deviation from the default sort', () => {
  assert.equal(sortStateHasContribution(JSON.parse(JSON.stringify(DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE)) as GearInspectorSubstatSortState), false)
  assert.equal(sortStateHasContribution(withSort([SPD])), true)
})

// A direction-only sort preset (mirrors the built-in "Ascending"): default desc, so direction 'asc'
// is its sole contribution.
const ascending = (): GearInspectorSubstatSortState => ({
  ...(JSON.parse(JSON.stringify(DEFAULT_GEAR_INSPECTOR_SUBSTAT_SORT_STATE)) as GearInspectorSubstatSortState),
  direction: 'asc',
})

test('a direction-only preset contributes and merges as a scalar', () => {
  assert.equal(sortStateHasContribution(ascending()), true)
  const merged = mergeSortState(withSort([SPD]), ascending())
  assert.equal(merged.direction, 'asc')
  assert.deepEqual(merged.priorities.map(Number), [Number(SPD)])
  assert.equal(sortStateContains(merged, ascending()), true)
})

test('un-OR keeps a direction-only preset toggled when a priority preset is removed', () => {
  const current = mergeSortState(withSort([SPD]), ascending())
  // Untoggle the SPD priority preset: subtract its levels, re-derive scalar modes from Ascending.
  const next = reapplySortScalars(subtractSortState(current, withSort([SPD])), ascending())
  assert.deepEqual(next.priorities.map(Number), []) // SPD level removed
  assert.equal(next.direction, 'asc') // shared scalar mode preserved
  assert.equal(sortStateContains(next, ascending()), true) // Ascending stays toggled
  assert.equal(sortStateContains(next, withSort([SPD])), false)
})
