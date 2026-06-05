import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { hasRecipeMeaningfulDifferences } from '../../src/lib/recipeDiff.js'
import { fingerprintRecipeForRules } from '../../src/lib/ruleCache.js'
import { createHistoryBuilderBaseline } from '../../src/history/builderUpdateDescriptor.js'
import { RarityCode, StatVariant } from '../../src/lib/types.js'

const SUBSTAT_TARGETS_KEY = '::test-targets'

test('name-only changes mark the builder as dirty', () => {
  const baseline = createHistoryBuilderBaseline({ appearance: { name: 'Arena' } })
  const renamed = { ...baseline, appearance: { name: 'Arena - Speed' } }

  assert.equal(
    fingerprintRecipeForRules(renamed, SUBSTAT_TARGETS_KEY),
    fingerprintRecipeForRules(baseline, SUBSTAT_TARGETS_KEY),
    'renaming should reuse the fingerprint so cached rules stay valid',
  )

  assert.equal(
    hasRecipeMeaningfulDifferences(renamed, baseline),
    true,
    'dirty check should still flag renamed recipes',
  )
})

test('identical recipes remain clean', () => {
  const baseline = createHistoryBuilderBaseline({ appearance: { name: 'Faction Wars' } })
  const clone = structuredClone(baseline)

  assert.equal(
    hasRecipeMeaningfulDifferences(clone, baseline),
    false,
    'dirty check should treat identical recipes as clean',
  )
})

test('switching between manual and auto rarity is detectable', () => {
  const manual = createHistoryBuilderBaseline({
    rarityMode: 'code',
    rarityCode: RarityCode.GTE_Epic,
  })
  const auto = { ...manual, rarityMode: 'auto' as const }

  assert.notEqual(
    fingerprintRecipeForRules(auto, SUBSTAT_TARGETS_KEY),
    fingerprintRecipeForRules(manual, SUBSTAT_TARGETS_KEY),
    'fingerprint should change when toggling rarity mode',
  )

  assert.equal(
    hasRecipeMeaningfulDifferences(auto, manual),
    true,
    'dirty check should flag manual vs auto rarity as a change',
  )
})

test('lockedMinRequiredRolls changes invalidate rule fingerprints', () => {
  const baseline = createHistoryBuilderBaseline({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
    lockedMinRequiredRolls: 1 as const,
  })
  const stricter: BuilderRecipe = { ...baseline, lockedMinRequiredRolls: 3 as const }

  assert.notEqual(
    fingerprintRecipeForRules(stricter, SUBSTAT_TARGETS_KEY),
    fingerprintRecipeForRules(baseline, SUBSTAT_TARGETS_KEY),
    'fingerprint should change when locked minimum rolls change',
  )

  assert.equal(
    hasRecipeMeaningfulDifferences(stricter, baseline),
    true,
    'dirty check should flag locked minimum roll edits',
  )
})

export const __recipeDiffTestMarker = true
