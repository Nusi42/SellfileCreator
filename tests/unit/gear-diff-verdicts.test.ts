import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearInspectorPreviewMatch } from '../../src/types/gearInspectorPreview.js'
import { RULE_SOURCE_SAFEGUARDS } from '../../src/lib/merge.js'
import {
  diffVerdicts,
  countVerdictFlips,
  buildVerdictMapFromRows,
  joinFlipsToRows,
  buildRowsByVerdictItemId,
  type VerdictMap,
} from '../../src/lib/gearDiff/verdictDiff.js'

// Minimal match factory — `keep` and `ruleSource` drive the tri-state verdict; the rest null.
const match = (keep: boolean, ruleSource: GearInspectorPreviewMatch['ruleSource'] = null): GearInspectorPreviewMatch => ({
  keep,
  recipeIdx: null,
  recipeName: null,
  recipeFgColor: null,
  ruleLabelFgColor: null,
  ruleIndex: null,
  ruleLabel: null,
  ruleSource,
  safeguardRuleId: null,
  safeguardRuleOrdinal: null,
})

const SELL = match(false)
const KEEP = match(true)
// Kept, but specifically by a Safeguard — a distinct tri-state from a plain rule keep.
const SAFEGUARD = match(true, RULE_SOURCE_SAFEGUARDS)

const mapOf = (entries: Array<[number, GearInspectorPreviewMatch | null]>): VerdictMap =>
  new Map(entries)

const changedIds = (before: VerdictMap, after: VerdictMap): number[] =>
  diffVerdicts(before, after).map((f) => f.itemId)

test('items whose sell/keep verdict crosses the boundary are changed; unchanged are not', () => {
  const before = mapOf([[1, KEEP], [2, SELL], [3, KEEP], [4, SELL]])
  const after = mapOf([[1, SELL], [2, KEEP], [3, KEEP], [4, SELL]])
  const diff = diffVerdicts(before, after)
  // 1 (keep→sell) and 2 (sell→keep) changed; 3 and 4 unchanged.
  assert.deepEqual(diff.map((f) => f.itemId), [1, 2])
  assert.equal(countVerdictFlips(diff), 2)
})

test('null match counts as KEPT: null↔sell is a change, null↔keep is not', () => {
  // null and explicit KEEP are both the "kept" tri-state, so swapping them is no change.
  assert.deepEqual(changedIds(mapOf([[1, null]]), mapOf([[1, KEEP]])), [], 'null↔keep unchanged')
  // Crossing to/from an explicit sell is a change either direction.
  assert.deepEqual(changedIds(mapOf([[1, null], [2, SELL]]), mapOf([[1, SELL], [2, null]])), [1, 2])
})

test('keep↔safeguard is a change even though both are kept (the reason differs)', () => {
  // A piece a rule was keeping that is now only held by a safeguard — and the reverse.
  assert.deepEqual(changedIds(mapOf([[1, KEEP]]), mapOf([[1, SAFEGUARD]])), [1], 'keep→safeguard')
  assert.deepEqual(changedIds(mapOf([[1, SAFEGUARD]]), mapOf([[1, KEEP]])), [1], 'safeguard→keep')
  // null (default keep) → safeguard is likewise a reason change.
  assert.deepEqual(changedIds(mapOf([[1, null]]), mapOf([[1, SAFEGUARD]])), [1], 'null→safeguard')
  // Same safeguard on both sides is not a change.
  assert.deepEqual(changedIds(mapOf([[1, SAFEGUARD]]), mapOf([[1, SAFEGUARD]])), [], 'safeguard↔safeguard')
})

test('safeguard↔sell crosses the keep/sell boundary and is a change', () => {
  assert.deepEqual(changedIds(mapOf([[1, SAFEGUARD]]), mapOf([[1, SELL]])), [1], 'safeguard→sell')
  assert.deepEqual(changedIds(mapOf([[1, SELL]]), mapOf([[1, SAFEGUARD]])), [1], 'sell→safeguard')
})

test('items absent from the baseline are ignored (no add/remove axis)', () => {
  const before = mapOf([[1, KEEP]])
  const after = mapOf([[1, SELL], [99, SELL]]) // 99 is new, not in baseline
  assert.deepEqual(changedIds(before, after), [1], 'only the shared item is considered')
})

test('flip carries both before and after matches for rendering', () => {
  const [flip] = diffVerdicts(mapOf([[7, KEEP]]), mapOf([[7, SELL]]))
  assert.ok(flip, 'expected a single changed item')
  assert.equal(flip.beforeMatch, KEEP)
  assert.equal(flip.afterMatch, SELL)
})

test('buildVerdictMapFromRows keys by gearInspectorItem.itemId and skips non-finite ids', () => {
  const rows = [
    { artifact: { gearInspectorItem: { itemId: 10 } }, match: SELL },
    { artifact: { gearInspectorItem: { itemId: 11 } }, match: null },
    { artifact: { gearInspectorItem: {} }, match: KEEP }, // no itemId → skipped
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any
  const map = buildVerdictMapFromRows(rows)
  assert.equal(map.size, 2)
  assert.equal(map.get(10), SELL)
  assert.equal(map.get(11), null)
})

test('joinFlipsToRows annotates current rows and drops flips with no current row', () => {
  const rows = [
    { artifact: { gearInspectorItem: { itemId: 1 } }, match: SELL },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any
  const rowsByItemId = buildRowsByVerdictItemId(rows)
  const diff = diffVerdicts(mapOf([[1, KEEP], [2, KEEP]]), mapOf([[1, SELL], [2, SELL]]))
  const diffRows = joinFlipsToRows(diff, rowsByItemId)
  assert.equal(diffRows.length, 1, 'item 2 has no current row and is dropped')
  const [diffRow] = diffRows
  assert.ok(diffRow, 'expected one joined diff row')
  assert.equal(diffRow.beforeMatch, KEEP)
  assert.equal(diffRow.afterMatch, SELL)
})

export const __gearDiffVerdictsTestMarker = true
