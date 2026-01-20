import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BuilderConfig } from '../../src/lib/hsfBuilder.js'
import { hasConfigMeaningfulDifferences } from '../../src/lib/configDiff.js'
import { fingerprintConfigForRules } from '../../src/lib/ruleCache.js'
import { createHistoryBuilderBaseline } from '../../src/history/builderUpdateDescriptor.js'
import { RarityCode, StatVariant } from '../../src/lib/types.js'

const SUBSTAT_TARGETS_KEY = '::test-targets'

test('name-only changes mark the builder as dirty', () => {
  const baseline = createHistoryBuilderBaseline({ name: 'Arena' })
  const renamed = { ...baseline, name: 'Arena - Speed' }

  assert.equal(
    fingerprintConfigForRules(renamed, SUBSTAT_TARGETS_KEY),
    fingerprintConfigForRules(baseline, SUBSTAT_TARGETS_KEY),
    'renaming should reuse the fingerprint so cached rules stay valid',
  )

  assert.equal(
    hasConfigMeaningfulDifferences(renamed, baseline, SUBSTAT_TARGETS_KEY),
    true,
    'dirty check should still flag renamed configs',
  )
})

test('identical configs remain clean', () => {
  const baseline = createHistoryBuilderBaseline({ name: 'Faction Wars' })
  const clone = structuredClone(baseline)

  assert.equal(
    hasConfigMeaningfulDifferences(clone, baseline, SUBSTAT_TARGETS_KEY),
    false,
    'dirty check should treat identical configs as clean',
  )
})

test('switching between manual and auto rarity is detectable', () => {
  const manual = createHistoryBuilderBaseline({
    rarityMode: 'code',
    rarityCode: RarityCode.GTE_Epic,
  })
  const auto = { ...manual, rarityMode: 'auto' as const }

  assert.notEqual(
    fingerprintConfigForRules(auto, SUBSTAT_TARGETS_KEY),
    fingerprintConfigForRules(manual, SUBSTAT_TARGETS_KEY),
    'fingerprint should change when toggling rarity mode',
  )

  assert.equal(
    hasConfigMeaningfulDifferences(auto, manual, SUBSTAT_TARGETS_KEY),
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
  const stricter: BuilderConfig = { ...baseline, lockedMinRequiredRolls: 3 as const }

  assert.notEqual(
    fingerprintConfigForRules(stricter, SUBSTAT_TARGETS_KEY),
    fingerprintConfigForRules(baseline, SUBSTAT_TARGETS_KEY),
    'fingerprint should change when locked minimum rolls change',
  )

  assert.equal(
    hasConfigMeaningfulDifferences(stricter, baseline, SUBSTAT_TARGETS_KEY),
    true,
    'dirty check should flag locked minimum roll edits',
  )
})

export const __configDiffTestMarker = true
