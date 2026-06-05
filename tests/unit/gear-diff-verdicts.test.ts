import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearInspectorPreviewMatch } from '../../src/types/gearInspectorPreview.js'
import {
  diffVerdicts,
  countVerdictFlips,
  buildVerdictMapFromRows,
  joinFlipsToRows,
  buildRowsByVerdictItemId,
  type VerdictMap,
} from '../../src/lib/gearDiff/verdictDiff.js'

// Minimal match factory — only `keep` matters for the verdict; other fields are null.
const match = (keep: boolean): GearInspectorPreviewMatch => ({
  keep,
  recipeIdx: null,
  recipeName: null,
  recipeFgColor: null,
  ruleLabelFgColor: null,
  ruleIndex: null,
  ruleLabel: null,
  ruleSource: null,
  safeguardRuleId: null,
  safeguardRuleOrdinal: null,
})

const SELL = match(false)
const KEEP = match(true)

const mapOf = (entries: Array<[number, GearInspectorPreviewMatch | null]>): VerdictMap =>
  new Map(entries)

test('keep→sell flips land in newlySell; sell→keep flips land in newlyKeep', () => {
  const before = mapOf([[1, KEEP], [2, SELL], [3, KEEP], [4, SELL]])
  const after = mapOf([[1, SELL], [2, KEEP], [3, KEEP], [4, SELL]])
  const diff = diffVerdicts(before, after)

  assert.deepEqual(diff.newlySell.map((f) => f.itemId), [1])
  assert.deepEqual(diff.newlyKeep.map((f) => f.itemId), [2])
  assert.equal(countVerdictFlips(diff), 2)
})

test('null match counts as KEPT (keep-list default), so null→sell is a flip', () => {
  // An unmatched item (null) is kept; flipping it to an explicit sell is newly-sell.
  const before = mapOf([[1, null], [2, SELL]])
  const after = mapOf([[1, SELL], [2, null]])
  const diff = diffVerdicts(before, after)

  assert.deepEqual(diff.newlySell.map((f) => f.itemId), [1], 'null→sell is newly-sell')
  assert.deepEqual(diff.newlyKeep.map((f) => f.itemId), [2], 'sell→null is newly-keep')
})

test('explicit keep and null are both KEPT, so keep↔null is NOT a flip', () => {
  const before = mapOf([[1, KEEP], [2, null]])
  const after = mapOf([[1, null], [2, KEEP]])
  const diff = diffVerdicts(before, after)
  assert.equal(countVerdictFlips(diff), 0, 'kept↔kept never flips regardless of reason')
})

test('items absent from the baseline are ignored (no add/remove axis)', () => {
  const before = mapOf([[1, KEEP]])
  const after = mapOf([[1, SELL], [99, SELL]]) // 99 is new, not in baseline
  const diff = diffVerdicts(before, after)
  assert.deepEqual(diff.newlySell.map((f) => f.itemId), [1], 'only the shared item flips')
})

test('flip carries both before and after matches for rendering', () => {
  const before = mapOf([[7, KEEP]])
  const after = mapOf([[7, SELL]])
  const [flip] = diffVerdicts(before, after).newlySell
  assert.ok(flip, 'expected a single newly-sell flip')
  assert.equal(flip.beforeMatch, KEEP)
  assert.equal(flip.afterMatch, SELL)
  assert.equal(flip.direction, 'newly-sell')
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
  const diffRows = joinFlipsToRows(diff.newlySell, rowsByItemId)
  assert.equal(diffRows.length, 1, 'item 2 has no current row and is dropped')
  const [diffRow] = diffRows
  assert.ok(diffRow, 'expected one joined diff row')
  assert.equal(diffRow.direction, 'newly-sell')
  assert.equal(diffRow.beforeMatch, KEEP)
  assert.equal(diffRow.afterMatch, SELL)
})

export const __gearDiffVerdictsTestMarker = true
