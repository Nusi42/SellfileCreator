import { test } from 'node:test'
import assert from 'node:assert/strict'

// PROVISIONAL(anomalous): these tests pin the *placeholder* Anomalous
// Accessories domain data (Update 11.70 prep) so the judged values stay honest
// until real game/RSL-Helper data replaces them. The core promises under test:
// placeholder stat ids are byte-sized (so the standard variant encoding carries
// them) yet above every real stat id, the derived variants collide with nothing
// real, and the announced set/slot scopes resolve against the existing
// catalogs. Ledger + replacement checklist:
// docs/technical/anomalous-accessories.md.
import {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_PROVISIONAL_ID_FLOOR,
  ANOMALOUS_SUBSTAT_IDS,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_VARIANTS,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
  anomalousSubstatLabel,
  isAnomalousEligibleSetId,
  isAnomalousEligibleSlotId,
  isAnomalousSubstatVariant,
  isProvisionalAnomalousStatId,
} from '../../src/lib/anomalousAccessories.js'
import {
  ARTIFACT_SET_IDS,
  ARTIFACT_SET_NAMES,
  ARTIFACT_TYPE_AMULET,
  ARTIFACT_TYPE_BANNER,
  ARTIFACT_TYPE_RING,
  STAT_VARIANT_ID_MASK,
  STAT_VARIANT_SHIFT_BITS,
} from '../../src/lib/generated/domainConstants.js'
import { StatId, StatVariant } from '../../src/lib/types.js'

test('placeholder substat ids are unique, byte-sized, and above every real stat id', () => {
  // Eight announced substats, no duplicates among the placeholder ids.
  assert.equal(ANOMALOUS_SUBSTAT_IDS.length, 8)
  assert.equal(new Set(ANOMALOUS_SUBSTAT_IDS).size, 8)
  // Real stat ids top out at StatId.RollCount (99); placeholders must clear that
  // while still fitting the one-byte variant id field.
  const maxRealStatId = Math.max(...Object.values(StatId))
  for (const id of ANOMALOUS_SUBSTAT_IDS) {
    assert.ok(id >= ANOMALOUS_PROVISIONAL_ID_FLOOR, `id ${id} below provisional floor`)
    assert.ok(id > maxRealStatId, `id ${id} collides with the real stat id range`)
    assert.ok(id <= STAT_VARIANT_ID_MASK, `id ${id} does not fit the variant id byte`)
    assert.ok(isProvisionalAnomalousStatId(id))
  }
  // The provisional check is an exact range, not open-ended: real ids and
  // ids just past the placeholder block must both stay out.
  assert.equal(isProvisionalAnomalousStatId(StatId.RollCount), false)
  assert.equal(isProvisionalAnomalousStatId(Math.max(...ANOMALOUS_SUBSTAT_IDS) + 1), false)
})

test('derived variants use the standard encoding and collide with nothing real', () => {
  // Variant = (id << shift) | 0 — percent-shaped placeholders, one per id key.
  for (const [key, id] of Object.entries(ANOMALOUS_SUBSTAT_IDS_BY_KEY)) {
    const expected = (id << STAT_VARIANT_SHIFT_BITS) | 0
    assert.equal(
      ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY[key as keyof typeof ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY],
      expected,
      `variant for ${key} drifted from the standard encoding`,
    )
  }
  // No collision with any real StatVariant value, and the membership helper agrees.
  const realVariants = new Set<number>(Object.values(StatVariant))
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
    assert.ok(!realVariants.has(variant), `variant ${variant} collides with a real StatVariant`)
    assert.ok(isAnomalousSubstatVariant(variant))
  }
  assert.equal(isAnomalousSubstatVariant(StatVariant.SPD), false)
})

test('every placeholder variant has a unique announcement-derived label', () => {
  const labels = ANOMALOUS_SUBSTAT_VARIANTS.map((variant) => anomalousSubstatLabel(variant))
  // Labels exist for all variants and are unique; real variants resolve to nothing.
  assert.ok(labels.every((label) => typeof label === 'string' && label.length > 0))
  assert.equal(new Set(labels).size, labels.length)
  assert.equal(anomalousSubstatLabel(StatVariant.SPD), undefined)
})

test('eligible sets resolve to exactly the nine announced sets', () => {
  // Resolve ids through the catalog and compare names (order-independent).
  const names = ANOMALOUS_ELIGIBLE_SET_IDS.map((id) => ARTIFACT_SET_NAMES[id]).sort()
  assert.deepEqual(names, [
    'Bloodshield',
    'Cleansing',
    'Merciless',
    'Protection',
    'Reaction',
    'Refresh',
    'Revenge',
    'Stoneskin',
    'Supersonic',
  ])
  // Helper agrees with the list; a non-anomalous set stays out.
  assert.ok(isAnomalousEligibleSetId(ARTIFACT_SET_IDS.Stoneskin))
  assert.equal(isAnomalousEligibleSetId(ARTIFACT_SET_IDS.Speed), false)
})

test('eligible slots are exactly the accessory slots (Banner provisionally included)', () => {
  // Announcement says "Accessories"/"Jewelry"; we judge all three jewelry slots.
  assert.deepEqual(
    [...ANOMALOUS_ELIGIBLE_SLOT_IDS].sort((a, b) => a - b),
    [ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET, ARTIFACT_TYPE_BANNER].sort((a, b) => a - b),
  )
  assert.ok(isAnomalousEligibleSlotId(ARTIFACT_TYPE_RING))
})
