import { test } from 'node:test'
import assert from 'node:assert/strict'

// PROVISIONAL(anomalous): pins the target-value quantization and feasibility
// behaviours a review caught regressing silently — decimal persistence through
// the normalize chain, grid snapping (off-grid values would widen at the
// engine's i32 floor), engine-mirrored threshold resolution, the jewelry-slot
// viability gate, and the export-scrub disclosure callback.
import {
  clampTargetOverrideValue,
  normalizeLooseRollTargetEntry,
  normalizeRollTargetEntry,
  quantizeTargetValueForVariant,
  resolveRollTargetValue,
} from '../../src/lib/hsfBuilder/targets.js'
import { resolveAllowedSubstatsForSlotsAndMains } from '../../src/lib/statCompatibility.js'
import { buildHsfFileFromMerged } from '../../src/lib/hsfIO.js'
import {
  ANOMALOUS_SUBSTAT_IDS,
  ANOMALOUS_SUBSTAT_VARIANTS,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
} from '../../src/lib/anomalousAccessories.js'
import { ArtifactType, StatVariant } from '../../src/lib/types.js'
import type { HsfSubstat } from '../../src/lib/hsfTypes.js'

const PVE_PLUS = ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus

test('quantizer: classic stats round to integers, anomalous snap to the 1.25 grid', () => {
  // Classic keeps the historical integer rounding.
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 4.5), 5)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 4.4), 4)
  // Anomalous snaps to the observed grid — including off-grid input like 2.6,
  // which would otherwise display as 2.6 yet apply as ≥ 2 after the i32 floor.
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 1.25), 1.25)
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 2.6), 2.5)
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 3.2), 3.75)
  // Negative and non-finite input floors at zero.
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, -1), 0)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, Number.NaN), 0)
})

test('normalize chain persists on-grid decimals for anomalous, integers for classic', () => {
  // The flyout regression: a typed 1.25 base must survive normalization.
  assert.deepEqual(normalizeRollTargetEntry({ base: 1.25 }, PVE_PLUS), { base: 1.25 })
  // Off-grid values snap instead of persisting raw.
  assert.deepEqual(normalizeRollTargetEntry({ base: 2.6 }, PVE_PLUS), { base: 2.5 })
  // The SFC ingress regression: classic decimals must not persist fractional.
  assert.deepEqual(normalizeRollTargetEntry({ base: 4.5 }, StatVariant.SPD), { base: 5 })
  assert.deepEqual(normalizeLooseRollTargetEntry(4.5, StatVariant.SPD), { base: 5 })
  assert.deepEqual(normalizeLooseRollTargetEntry('1.25', PVE_PLUS), { base: 1.25 })
  // Variant-less internal callers keep 2-decimal precision (post-ingress data).
  assert.equal(clampTargetOverrideValue(1.25), 1.25)
})

test('resolveRollTargetValue returns ENGINE-APPLIED thresholds (i32 floor on both sides)', () => {
  // Factory fallback: floor the fractional base first, then multiply (1, 2, 3, …).
  assert.equal(resolveRollTargetValue(null, 0, 1.25), 1)
  assert.equal(resolveRollTargetValue(null, 1, 1.25), 2)
  assert.equal(resolveRollTargetValue(null, 2, 1.25), 3)
  // Explicit overrides floor identically — a stored 2.5 applies as 2, so the
  // comparable values never mix floored and unfloored numbers.
  assert.equal(resolveRollTargetValue({ base: 2.5 }, 0, 1.25), 2)
  assert.equal(resolveRollTargetValue({ base: 2.5, increments: [3.75] }, 1, 1.25), 3)
})

test('anomalous feasibility requires a jewelry slot that SURVIVES the main-stat gate', () => {
  // Ring selected but the SPD main excludes rings (SPD is no ring main): the ring
  // is not viable, so no anomalous chips despite the jewelry slot in the pool.
  const deadRing = resolveAllowedSubstatsForSlotsAndMains({
    slots: [ArtifactType.Ring, ArtifactType.Boots],
    mainStats: [StatVariant.SPD],
  })
  assert.ok(deadRing.every((variant) => !ANOMALOUS_SUBSTAT_VARIANTS.includes(variant as never)))
  // A viable ring (wildcard mains) appends all eight after the classic list.
  const viableRing = resolveAllowedSubstatsForSlotsAndMains({ slots: [ArtifactType.Ring], mainStats: [] })
  assert.ok(ANOMALOUS_SUBSTAT_VARIANTS.every((variant) => viableRing.includes(variant)))
  // Artifact-only scopes never include them.
  const bootsOnly = resolveAllowedSubstatsForSlotsAndMains({ slots: [ArtifactType.Boots], mainStats: [] })
  assert.ok(bootsOnly.every((variant) => !ANOMALOUS_SUBSTAT_VARIANTS.includes(variant as never)))
})

test('export scrub reports dropped rules through the disclosure callback', () => {
  const sub = (id: number, condition = ''): HsfSubstat => (
    { ID: id, Value: 0, IsFlat: false, Condition: condition, NotAvailable: false }
  )
  type MergedRuleLike = Parameters<typeof buildHsfFileFromMerged>[0][number]
  const rule = (substats: HsfSubstat[]): MergedRuleLike => (
    { Keep: true, Substats: substats } as unknown as MergedRuleLike
  )
  const anomalousId = ANOMALOUS_SUBSTAT_IDS[0]!
  // One rule requires an anomalous substat → dropped and disclosed with its count.
  let reported: number | null = null
  buildHsfFileFromMerged(
    [rule([sub(anomalousId)]), rule([sub(4)])],
    { onAnomalousRulesScrubbed: (count) => { reported = count } },
  )
  assert.equal(reported, 1)
  // A vacuous ¬-line drop keeps the rule — no rule-level disclosure fires.
  reported = null
  buildHsfFileFromMerged(
    [rule([sub(anomalousId, '¬'), sub(4)])],
    { onAnomalousRulesScrubbed: (count) => { reported = count } },
  )
  assert.equal(reported, null)
  // Clean rule sets never fire the callback.
  reported = null
  buildHsfFileFromMerged([rule([sub(4)])], { onAnomalousRulesScrubbed: (count) => { reported = count } })
  assert.equal(reported, null)
})
