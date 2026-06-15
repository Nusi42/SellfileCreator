/* eslint import/no-unused-modules: off */

// Improvement-chance histogram SSOT: binning, exclusion rules (no-safeguard / degenerate),
// the bin counter, the applyGearAnalyticsFilter integration for the improvChanceBins dimension,
// and the bins <-> [min,max] range round-trip used by the Gear Inspector copy/apply bridge.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_GEAR_ANALYTICS_DIM,
  IMPROVEMENT_CHANCE_BIN_COUNT,
  binOfImprovementChance,
  improvementChanceBinLabel,
  countByImprovementChanceBin,
  applyGearAnalyticsFilter,
  improvChanceBinsToRange,
  rangeToImprovChanceBins,
  sqrtBarWidthScale,
  type GearAnalyticsDim,
} from '../../src/lib/gearAnalytics'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview'

// Minimal row factory: only the fields the histogram reads (artifact.id, .level) need to be real.
function makeRow(id: number, level: number): GearInspectorPreviewRow {
  // The histogram never inspects other artifact fields, so a partial cast keeps the fixture small.
  return { artifact: { id, level } } as unknown as GearInspectorPreviewRow
}

// Chance-map entry factory mirroring the ImprovementChanceWasmEntry subset the histogram uses.
function chance(chancePercent: number, hasMatchingSafeguard = true) {
  return { chancePercent, hasMatchingSafeguard }
}

test('binOfImprovementChance maps deciles, clamps 100, rejects out-of-range', () => {
  assert.equal(binOfImprovementChance(0), 0)
  assert.equal(binOfImprovementChance(9.999), 0)
  assert.equal(binOfImprovementChance(10), 1)
  assert.equal(binOfImprovementChance(55), 5)
  // Exactly 100 lands in the final (closed) bin rather than falling off the end.
  assert.equal(binOfImprovementChance(100), IMPROVEMENT_CHANCE_BIN_COUNT - 1)
  assert.equal(binOfImprovementChance(-1), null)
  assert.equal(binOfImprovementChance(101), null)
  assert.equal(binOfImprovementChance(Number.NaN), null)
})

test('improvementChanceBinLabel renders decile ranges', () => {
  assert.equal(improvementChanceBinLabel(0), '0–10%')
  assert.equal(improvementChanceBinLabel(3), '30–40%')
  assert.equal(improvementChanceBinLabel(9), '90–100%')
})

test('countByImprovementChanceBin excludes no-safeguard and degenerate (+16/100%) rows', () => {
  const rows = [
    makeRow(1, 8),   // 25% with safeguard → bin 2
    makeRow(2, 8),   // 33% with safeguard → bin 3
    makeRow(3, 8),   // 35% with safeguard → bin 3
    makeRow(4, 8),   // 90% but no matching safeguard → excluded
    makeRow(5, 16),  // 100% on +16 gear → degenerate, excluded
    makeRow(6, 8),   // not present in the chance map → excluded
  ]
  const chanceMap = new Map([
    [1, chance(25)],
    [2, chance(33)],
    [3, chance(35)],
    [4, chance(90, false)],
    [5, chance(100)],
  ])
  const counts = countByImprovementChanceBin(rows, chanceMap)
  assert.equal(counts.get(2), 1)
  assert.equal(counts.get(3), 2)
  // No bucket should pick up the excluded rows.
  assert.equal(counts.get(9), undefined)
  assert.equal([...counts.values()].reduce((s, n) => s + n, 0), 3)
})

test('applyGearAnalyticsFilter honors improvChanceBins only when the chance map is supplied', () => {
  const rows = [makeRow(1, 8), makeRow(2, 8), makeRow(3, 16)]
  const chanceMap = new Map([
    [1, chance(25)],   // bin 2
    [2, chance(65)],   // bin 6
    [3, chance(100)],  // degenerate → never matches
  ])
  const dim: GearAnalyticsDim = { ...EMPTY_GEAR_ANALYTICS_DIM, improvChanceBins: new Set([2]) }

  // Without the chance map the dimension is inert — all rows pass through.
  assert.equal(applyGearAnalyticsFilter(rows, dim).length, 3)

  // With the map, only the row in bin 2 survives.
  const filtered = applyGearAnalyticsFilter(rows, dim, undefined, chanceMap)
  assert.deepEqual(filtered.map((r) => r.artifact.id), [1])

  // Excluding the dimension restores the full set (crossfilter rule for the histogram's own chart).
  assert.equal(applyGearAnalyticsFilter(rows, dim, 'improvChanceBins', chanceMap).length, 3)
})

test('sqrtBarWidthScale keeps the max at 1, pulls small counts outward, and guards zero', () => {
  assert.equal(sqrtBarWidthScale(0, 0), 0)
  assert.equal(sqrtBarWidthScale(5, 0), 0)
  // The tallest bar still fills exactly 100%.
  assert.equal(sqrtBarWidthScale(100, 100), 1)
  // A 1/100 count renders at sqrt(0.01) = 0.10, not 0.01 — the whole point of the transform.
  assert.ok(Math.abs(sqrtBarWidthScale(1, 100) - 0.1) < 1e-9)
  // Negative counts are clamped to zero rather than producing NaN.
  assert.equal(sqrtBarWidthScale(-5, 100), 0)
})

test('improvChanceBinsToRange / rangeToImprovChanceBins round-trip for contiguous selections', () => {
  // Empty selection ⇒ no range.
  assert.equal(improvChanceBinsToRange(new Set()), null)
  // Full 0–100 range ⇒ empty selection (treated as "no constraint").
  assert.deepEqual([...rangeToImprovChanceBins(0, 100)], [])

  // Contiguous bins 2..4 → [20,50] → bins 2,3,4.
  const bins = new Set([2, 3, 4])
  const range = improvChanceBinsToRange(bins)
  assert.deepEqual(range, { min: 20, max: 50 })
  assert.deepEqual([...rangeToImprovChanceBins(range!.min, range!.max)].sort((a, b) => a - b), [2, 3, 4])

  // Top bin includes 100.
  const top = improvChanceBinsToRange(new Set([9]))
  assert.deepEqual(top, { min: 90, max: 100 })
  assert.deepEqual([...rangeToImprovChanceBins(90, 100)], [9])
})
