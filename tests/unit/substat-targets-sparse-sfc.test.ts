import test from 'node:test'
import assert from 'node:assert/strict'

// SFC documents record substat targets as DEVIATIONS from the app's factory
// defaults: a value equal to the default is omitted on write and re-seeded on
// read. The point is that a default we later correct reaches existing documents
// instead of staying frozen at whatever was current when they were saved — which
// matters while some anomalous values are judged rather than observed.
// These tests pin the round-trip, since the whole scheme is only safe if reading
// restores exactly what writing dropped.
import { normalizeSubstatTargets, substatTargetsToReadable } from '../../src/lib/sfcIO.js'
import { baseMinForStarV, defaultSubstatTargets, isFactoryDefaultTargetValue } from '../../src/lib/hsfBuilder.js'
import { areSubstatTargetTablesEqual } from '../../src/history/substatTargetDescriptors.js'
import { ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY } from '../../src/lib/anomalousAccessories.js'
import { StatVariant, labelOfVariant } from '../../src/lib/types.js'

const PVE_PLUS = ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus

test('an untouched table writes no target values at all', () => {
  const written = substatTargetsToReadable(defaultSubstatTargets())
  for (const starKey of ['one', 'two', 'three', 'four', 'five', 'six'] as const) {
    assert.deepEqual(written[starKey], {}, `${starKey} should carry no explicit targets`)
  }
  // The any-rank fallback is a separate setting and is still recorded.
  assert.equal(written.anyRankDefaultsTo, 'six')
})

test('the omitted values are restored on read, so the round-trip is lossless', () => {
  const original = defaultSubstatTargets()
  const restored = normalizeSubstatTargets(substatTargetsToReadable(original))
  // Structural equality, not just resolved equality — the in-memory table stays
  // DENSE, so every existing reader and the history "is default" check are
  // unaffected by the sparser file.
  assert.ok(areSubstatTargetTablesEqual(original, restored))
  assert.equal(baseMinForStarV(PVE_PLUS, 6, restored), baseMinForStarV(PVE_PLUS, 6, original))
})

test('a deviation is written and survives the round-trip', () => {
  const edited = defaultSubstatTargets()
  edited.six[StatVariant.SPD] = 12
  edited.six[PVE_PLUS] = 2.5
  const written = substatTargetsToReadable(edited)
  // Only the two changed cells appear, keyed by canonical label.
  assert.deepEqual(written.six, { [labelOfVariant(StatVariant.SPD)]: 12, [labelOfVariant(PVE_PLUS)]: 2.5 })
  const restored = normalizeSubstatTargets(written)
  assert.equal(restored.six[StatVariant.SPD], 12)
  assert.equal(restored.six[PVE_PLUS], 2.5)
  // Everything else still resolves to the factory default.
  assert.ok(areSubstatTargetTablesEqual(defaultSubstatTargets(), normalizeSubstatTargets(substatTargetsToReadable(defaultSubstatTargets()))))
})

test('a 0 in an existing document is corrected to the stat minimum on load', () => {
  // Zero is not a supported target — "no threshold" is expressed by not selecting
  // the substat — so an older/hand-edited document carrying 0 is clamped rather
  // than emitting a vacuous ">= 0".
  const restored = normalizeSubstatTargets({
    six: { [labelOfVariant(StatVariant.SPD)]: 0, [labelOfVariant(PVE_PLUS)]: 0 },
    anyRankDefaultsTo: 'six',
  })
  assert.equal(restored.six[StatVariant.SPD], 1)
  assert.equal(restored.six[PVE_PLUS], 0.25)
})

test('a document written before a stat existed adopts that stat default', () => {
  // The forward-correction case: an older file simply has no key, so the stat
  // resolves to whatever the app currently seeds rather than to 0.
  const restored = normalizeSubstatTargets({ six: {}, anyRankDefaultsTo: 'six' })
  assert.equal(restored.six[PVE_PLUS], defaultSubstatTargets().six[PVE_PLUS])
  assert.ok(baseMinForStarV(PVE_PLUS, 6, restored) > 0)
})

test('isFactoryDefaultTargetValue answers per stat AND per rank', () => {
  const defaults = defaultSubstatTargets()
  assert.ok(isFactoryDefaultTargetValue(StatVariant.SPD, 6, defaults.six[StatVariant.SPD]!))
  assert.ok(!isFactoryDefaultTargetValue(StatVariant.SPD, 6, defaults.six[StatVariant.SPD]! + 1))
  // The same number can be default at one rank and a deviation at another, so the
  // check must never collapse the rank dimension.
  assert.ok(isFactoryDefaultTargetValue(PVE_PLUS, 5, defaults.five[PVE_PLUS]!))
})
