import { test } from 'node:test'
import assert from 'node:assert/strict'

// These tests pin the Anomalous Accessories domain data.
// The substat ids are the REAL RSL Helper DB ids reverse-engineered from
// examples/um109288203_RSLHelper.db (11/12/13/16 observed against screenshots;
// 14/15/17/18 inferred from mode order — see shared/domain-constants.json).
// The core promises: the confirmed id table stays pinned, ids collide with no
// classic stat id, derived variants use the standard encoding and collide with
// nothing real, and the announced set/slot scopes resolve against the catalogs.
// Ledger: docs/technical/anomalous-accessories.md.
import {
  ANOMALOUS_ELIGIBLE_SET_IDS,
  ANOMALOUS_ELIGIBLE_SLOT_IDS,
  ANOMALOUS_SUBSTAT_IDS,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
  anomalousSubstatLabel,
  isAnomalousEligibleSetId,
  isAnomalousEligibleSlotId,
  isAnomalousStatId,
  isAnomalousSubstatVariant,
} from '../../src/lib/anomalousAccessories.js'
import {
  ARTIFACT_SET_IDS,
  ARTIFACT_SET_NAMES,
  ARTIFACT_TYPE_AMULET,
  ARTIFACT_TYPE_BANNER,
  ARTIFACT_TYPE_RING,
  STAT_VARIANT_SHIFT_BITS,
} from '../../src/lib/generated/domainConstants.js'
import { StatId, StatVariant } from '../../src/lib/types.js'

test('substat ids match the reverse-engineered DB table (dealt 11..14, taken 15..18)', () => {
  // Pin the confirmed/inferred id assignments — a drift here either breaks DB
  // ingest or silently remaps observed gear lines.
  assert.deepEqual(ANOMALOUS_SUBSTAT_IDS_BY_KEY, {
    pveDmgPlus: 11,
    pvpDmgPlus: 12,
    bossDmgPlus: 13,
    dungeonDmgPlus: 14,
    pveDmgMinus: 15,
    pvpDmgMinus: 16,
    bossDmgMinus: 17,
    dungeonDmgMinus: 18,
  })
  // No collision with any classic stat id, and exact membership in the checker.
  const classicIds = new Set(Object.values(StatId))
  for (const id of ANOMALOUS_SUBSTAT_IDS) {
    assert.ok(!classicIds.has(id as never), `id ${id} collides with a classic StatId`)
    assert.ok(isAnomalousStatId(id))
  }
  // Membership is exact — neighbours and classic ids stay out.
  assert.equal(isAnomalousStatId(10), false)
  assert.equal(isAnomalousStatId(19), false)
  assert.equal(isAnomalousStatId(StatId.CDMG), false)
})

test('derived variants use the standard encoding and collide with nothing real', () => {
  // Variant = (id << shift) | 0 — percent-shaped, matching the DB fl=0 lines.
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

test('every variant has a unique announcement-derived label and the rank-5 base is observed', () => {
  const labels = ANOMALOUS_SUBSTAT_VARIANTS.map((variant) => anomalousSubstatLabel(variant))
  // Labels exist for all variants and are unique; real variants resolve to nothing.
  assert.ok(labels.every((label) => typeof label === 'string' && label.length > 0))
  assert.equal(new Set(labels).size, labels.length)
  assert.equal(anomalousSubstatLabel(StatVariant.SPD), undefined)
  // Rank-5 base per line observed at 1.25% (zero rolls) in the example DB.
  assert.equal(ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE, 1.25)
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

test('eligible slots are exactly the accessory slots (Banner observed in the DB)', () => {
  // A rank-5 Supersonic Banner exists in the example DB — all three jewelry slots.
  assert.deepEqual(
    [...ANOMALOUS_ELIGIBLE_SLOT_IDS].sort((a, b) => a - b),
    [ARTIFACT_TYPE_RING, ARTIFACT_TYPE_AMULET, ARTIFACT_TYPE_BANNER].sort((a, b) => a - b),
  )
  assert.ok(isAnomalousEligibleSlotId(ARTIFACT_TYPE_RING))
})
