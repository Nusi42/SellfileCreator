/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  considerByCount,
  emptyContentExtent,
  extendWithIcons,
  extendWithText,
  isAutoWidth,
  resolvePending,
  widthForExtent,
} from '../../src/components/rulesTableAutoWidth.js'
import {
  RULES_TABLE_AUTO_WIDTH_MAX_PX,
  RULES_TABLE_AUTO_WIDTH_MIN_PX,
  RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES,
  RULES_TABLE_CELL_PADDING_X_TOTAL_PX,
  RULES_TABLE_COL_WIDTH_AUTO,
} from '../../src/lib/constants.js'

test('isAutoWidth recognizes only the sentinel', () => {
  assert.equal(isAutoWidth(RULES_TABLE_COL_WIDTH_AUTO), true)
  // Real widths, absent values, and zero must all read as "not auto".
  assert.equal(isAutoWidth(140), false)
  assert.equal(isAutoWidth(0), false)
  assert.equal(isAutoWidth(null), false)
  assert.equal(isAutoWidth(undefined), false)
})

test('extendWithText/Icons keep the running maximum, not the last value', () => {
  const extent = emptyContentExtent()
  extendWithText(extent, 'four')
  extendWithText(extent, 'a much longer value')
  // A shorter value afterwards must not shrink the extent.
  extendWithText(extent, 'x')
  assert.equal(extent.maxChars, 'a much longer value'.length)

  extendWithIcons(extent, 3)
  extendWithIcons(extent, 7)
  extendWithIcons(extent, 1)
  assert.equal(extent.maxIcons, 7)
})

test('considerByCount keeps only the top count, and a higher count evicts the tied set', () => {
  const extent = emptyContentExtent()
  considerByCount(extent, 2, 'two-a')
  considerByCount(extent, 2, 'two-b')
  assert.deepEqual(extent.pendingRows, ['two-a', 'two-b'])

  // A strictly larger count discards everything kept at the lower count.
  considerByCount(extent, 5, 'five')
  assert.equal(extent.pendingCount, 5)
  assert.deepEqual(extent.pendingRows, ['five'])

  // Anything below the top count is ignored entirely.
  considerByCount(extent, 4, 'four')
  assert.deepEqual(extent.pendingRows, ['five'])
})

test('considerByCount caps how many tied rows it keeps', () => {
  const extent = emptyContentExtent()
  // Offer twice the cap at the same count; only the cap may be retained.
  for (let i = 0; i < RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES * 2; i++) considerByCount(extent, 3, `row-${i}`)
  assert.equal(extent.pendingRows.length, RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES)
})

test('resolvePending formats only the retained candidates and takes the widest', () => {
  const extent = emptyContentExtent()
  considerByCount(extent, 2, 'ab')
  considerByCount(extent, 2, 'abcd')
  const formatted: string[] = []
  resolvePending(extent, (row) => {
    formatted.push(row as string)
    return row as string
  })
  // Both tied rows are formatted, and the longer one decides the extent.
  assert.deepEqual(formatted, ['ab', 'abcd'])
  assert.equal(extent.maxChars, 4)
})

test('resolvePending is a no-op when no row was ever offered', () => {
  const extent = emptyContentExtent()
  let called = false
  resolvePending(extent, () => { called = true; return 'unused' })
  // A column with no rows must not invoke its formatter at all.
  assert.equal(called, false)
  assert.equal(extent.maxChars, 0)
})

test('widthForExtent floors an empty column and adds cell padding', () => {
  const extent = emptyContentExtent()
  // Nothing measured: the result is the floor plus padding, never zero.
  assert.equal(
    widthForExtent(extent, 0),
    RULES_TABLE_AUTO_WIDTH_MIN_PX + RULES_TABLE_CELL_PADDING_X_TOTAL_PX,
  )
})

test('widthForExtent caps a pathologically long value', () => {
  const extent = emptyContentExtent()
  // A 5000-character rule must not push the column past the ceiling.
  extendWithText(extent, 'x'.repeat(5000))
  assert.equal(
    widthForExtent(extent, 0),
    RULES_TABLE_AUTO_WIDTH_MAX_PX + RULES_TABLE_CELL_PADDING_X_TOTAL_PX,
  )
})

test('widthForExtent sizes an icon column by its icon step', () => {
  const extent = emptyContentExtent()
  extendWithIcons(extent, 4)
  const step = 20
  // 4 icons at 20px clears the 40px floor, so the icon term decides the width.
  assert.equal(widthForExtent(extent, step), 4 * step + RULES_TABLE_CELL_PADDING_X_TOTAL_PX)
})

test('widthForExtent takes the wider of the icon and text terms', () => {
  const extent = emptyContentExtent()
  // A column that saw both must not let the narrower term win.
  extendWithIcons(extent, 10)
  extendWithText(extent, 'ab')
  const step = 20
  assert.equal(widthForExtent(extent, step), 10 * step + RULES_TABLE_CELL_PADDING_X_TOTAL_PX)
})
