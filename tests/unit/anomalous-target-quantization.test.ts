import { test } from 'node:test'
import assert from 'node:assert/strict'

// Pins the target-value model for the anomalous mode-damage substats now that
// docs/orig/anomalous.hsf fixes the wire format: values ride to HSF as integer
// hundredths of a percent, so decimals are EXACT rather than something to snap
// away. Covers the quantizer, the normalize chain, the engine-applied floor
// (which is a no-op at hundredth resolution), gear-line clamping, the multi-edit
// and SFC ingress paths, and the jewelry-slot viability gate.
import {
  clampTargetOverrideValue,
  engineAppliedTargetValue,
  minGearLineValueForVariant,
  minTargetValueForVariant,
  normalizeLooseRollTargetEntry,
  normalizeRollTargetEntry,
  quantizeTargetValueForVariant,
  resolveRollTargetValue,
  targetValueResolutionForVariant,
  targetValueStepForVariant,
} from '../../src/lib/hsfBuilder/targets.js'
import { clampGearLineValue } from '../../src/lib/gearInspectorSession.js'
import { applyMultiEditFieldToRecipe } from '../../src/lib/recipeMultiEditDraft.js'
import { normalizeSubstatTargets } from '../../src/lib/sfcIO.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { resolveAllowedSubstatsForSlotsAndMains } from '../../src/lib/statCompatibility.js'
import {
  ANOMALOUS_HSF_VALUE_SCALE,
  ANOMALOUS_SUBSTAT_ROLL_VALUE_MIN,
  ANOMALOUS_SUBSTAT_VARIANTS,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
  hsfValueScaleForVariant,
} from '../../src/lib/anomalousAccessories.js'
import { ArtifactType, StatVariant } from '../../src/lib/types.js'

const PVE_PLUS = ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus

test('the wire scale is per-stat: anomalous hundredths, classic plain', () => {
  // docs/orig/anomalous.hsf stores 0.25% as 25; docs/orig/rules.hsf stores 5% as 5.
  assert.equal(hsfValueScaleForVariant(PVE_PLUS), ANOMALOUS_HSF_VALUE_SCALE)
  assert.equal(hsfValueScaleForVariant(StatVariant.SPD), 1)
  // Resolution is the reciprocal — the finest value that survives export.
  assert.equal(targetValueResolutionForVariant(PVE_PLUS), 0.01)
  assert.equal(targetValueResolutionForVariant(StatVariant.SPD), 1)
})

test('quantizer: classic rounds to integers, anomalous keeps hundredths', () => {
  // Classic keeps the historical integer rounding.
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 4.5), 5)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 4.4), 4)
  // Every value the sample sellfile demonstrates survives untouched — the old
  // 1.25 grid mangled these (0.5 became 1.25, 0.75 became 1.25).
  for (const value of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.25]) {
    assert.equal(quantizeTargetValueForVariant(PVE_PLUS, value), value)
  }
  // Finer than the wire resolution rounds to it rather than silently truncating.
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 1.238), 1.24)
  // Values whose scaling is inexact in binary floating point (1.15 * 100 =
  // 114.99999999999999) must not drift a whole wire unit down.
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 1.15), 1.15)
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 2.35), 2.35)
  // Zero is not a target — "no threshold" means not selecting the substat — so
  // anything below the minimum lands ON the minimum rather than clearing.
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 0.001), 0.25)
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, 0), 0.25)
  assert.equal(quantizeTargetValueForVariant(PVE_PLUS, -1), 0.25)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 0), 1)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, 0.4), 1)
  assert.equal(quantizeTargetValueForVariant(StatVariant.SPD, Number.NaN), 1)
})

test('normalize chain persists decimals for anomalous, integers for classic', () => {
  // The flyout regression: a typed 1.25 base must survive normalization.
  assert.deepEqual(normalizeRollTargetEntry({ base: 1.25 }, PVE_PLUS), { base: 1.25 })
  // A value the old grid would have snapped now persists as typed.
  assert.deepEqual(normalizeRollTargetEntry({ base: 2.6 }, PVE_PLUS), { base: 2.6 })
  // The SFC ingress regression: classic decimals must not persist fractional.
  assert.deepEqual(normalizeRollTargetEntry({ base: 4.5 }, StatVariant.SPD), { base: 5 })
  assert.deepEqual(normalizeLooseRollTargetEntry(4.5, StatVariant.SPD), { base: 5 })
  assert.deepEqual(normalizeLooseRollTargetEntry('1.25', PVE_PLUS), { base: 1.25 })
  // The variant is REQUIRED throughout the chain — there is no permissive
  // bypass branch left for a caller to land on.
  assert.equal(clampTargetOverrideValue(1.25, PVE_PLUS), 1.25)
  assert.equal(clampTargetOverrideValue(1.25, StatVariant.SPD), 1)
})

test('engineAppliedTargetValue floors in WIRE units, so anomalous decimals are exact', () => {
  // Classic stats keep the whole-number floor: a stored 2.5 applies as >= 2.
  assert.equal(engineAppliedTargetValue(2.5, StatVariant.SPD), 2)
  assert.equal(engineAppliedTargetValue(4, StatVariant.SPD), 4)
  // Anomalous values are integers in hundredths, so nothing is lost — the whole
  // reason the old 1.25 snap existed is gone.
  assert.equal(engineAppliedTargetValue(1.25, PVE_PLUS), 1.25)
  assert.equal(engineAppliedTargetValue(2.6, PVE_PLUS), 2.6)
  assert.equal(engineAppliedTargetValue(1.15, PVE_PLUS), 1.15)
  // Never negative — mirrors the max(0, …) the engine's base values carry.
  assert.equal(engineAppliedTargetValue(-3, PVE_PLUS), 0)
})

test('resolveRollTargetValue mirrors the engine on both the fallback and override sides', () => {
  // Factory fallback for an anomalous stat: the base is exact, so the ladder is
  // 1.25 / 2.5 / 3.75 rather than the floored 1 / 2 / 3 of the old i32 model.
  assert.equal(resolveRollTargetValue(null, 0, 1.25, PVE_PLUS), 1.25)
  assert.equal(resolveRollTargetValue(null, 1, 1.25, PVE_PLUS), 2.5)
  assert.equal(resolveRollTargetValue(null, 2, 1.25, PVE_PLUS), 3.75)
  // Explicit overrides pass through untouched for anomalous stats.
  assert.equal(resolveRollTargetValue({ base: 2.5 }, 0, 1.25, PVE_PLUS), 2.5)
  assert.equal(resolveRollTargetValue({ base: 2.5, increments: [3.75] }, 1, 1.25, PVE_PLUS), 3.75)
  // A classic stat still floors, so the two families cannot drift apart.
  assert.equal(resolveRollTargetValue({ base: 2.5 }, 0, 3, StatVariant.SPD), 2)
  // Threshold resolution agrees with the floor helper on both sides, so no
  // surface can advertise a different number than another.
  for (const rolls of [0, 1, 2, 3]) {
    assert.equal(
      resolveRollTargetValue(null, rolls, 1.25, PVE_PLUS),
      engineAppliedTargetValue(1.25, PVE_PLUS) * (rolls + 1),
    )
  }
})

test('spinner step and gear-line minimum are distinct from the wire resolution', () => {
  // The spinner steps by the supported minimum, so arrows always land on legal
  // values — not by the 0.01 the wire could technically carry.
  assert.equal(targetValueStepForVariant(PVE_PLUS), 0.25)
  assert.equal(targetValueStepForVariant(StatVariant.SPD), 1)
  assert.equal(minTargetValueForVariant(PVE_PLUS), 0.25)
  assert.equal(minTargetValueForVariant(StatVariant.SPD), 1)
  // A PRESENT gear line is never worth less than one minimum roll. With no rank in
  // scope this floors at the LOWEST rank's line value, so it holds for every rank.
  assert.equal(minGearLineValueForVariant(PVE_PLUS), ANOMALOUS_SUBSTAT_ROLL_VALUE_MIN)
  assert.equal(minGearLineValueForVariant(StatVariant.SPD), 1)
})

test('gear line values use one resolution+floor rule for editor input and re-normalization', () => {
  // Anomalous lines keep their decimals and never fall below one minimum roll. With no
  // rank in scope the floor is the LOWEST rank's line value, so it holds at every rank —
  // same SSOT the previous test pins (ANOMALOUS_SUBSTAT_ROLL_VALUE_MIN).
  assert.equal(clampGearLineValue(PVE_PLUS, 2.6), 2.6)
  assert.equal(clampGearLineValue(PVE_PLUS, 0.1), ANOMALOUS_SUBSTAT_ROLL_VALUE_MIN)
  assert.equal(clampGearLineValue(PVE_PLUS, 0), ANOMALOUS_SUBSTAT_ROLL_VALUE_MIN)
  // Classic lines stay integral with the historical >=1 floor.
  assert.equal(clampGearLineValue(StatVariant.SPD, 4.4), 4)
  assert.equal(clampGearLineValue(StatVariant.SPD, 0.2), 1)
  // Idempotent: re-normalizing a stored value never drifts it.
  const stored = clampGearLineValue(PVE_PLUS, 3.75)
  assert.equal(clampGearLineValue(PVE_PLUS, stored), stored)
})

test('multi-edit apply persists decimal targets, not rounded integers', () => {
  // The multi-edit path used to run its own integer-rounding normalizer, storing
  // an anomalous 1.25 as 1 and — worse — 2.5 as 3, ABOVE what the user asked for.
  const recipe = { substatsV: [PVE_PLUS], substatRollTargetsV: {} } as unknown as BuilderRecipe
  const applied = applyMultiEditFieldToRecipe(recipe, 'substatRollTargetsV', {
    value: null,
    status: 'common',
    patch: { [PVE_PLUS]: { value: { base: 2.5, increments: [3.75] } } },
  } as never)
  assert.deepEqual(applied.substatRollTargetsV?.[PVE_PLUS], { base: 2.5, increments: [3.75] })
  // Values off the old 1.25 grid now persist exactly as typed.
  const offGrid = applyMultiEditFieldToRecipe(recipe, 'substatRollTargetsV', {
    value: null,
    status: 'common',
    patch: { [PVE_PLUS]: { value: { base: 0.5 } } },
  } as never)
  assert.deepEqual(offGrid.substatRollTargetsV?.[PVE_PLUS], { base: 0.5 })
})

test('SFC Minima ingress quantizes per stat like its roll-target sibling', () => {
  // A hand-edited/older SFC can carry values that never passed a UI clamp.
  const table = normalizeSubstatTargets({
    five: { 'PvE DMG +': 2.6, SPD: 4.5 },
    anyRankDefaultsTo: 6,
  })
  // Anomalous keeps its decimals; classic rounds to an integer.
  assert.equal(table.five[PVE_PLUS], 2.6)
  assert.equal(table.five[StatVariant.SPD], 5)
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
