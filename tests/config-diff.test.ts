import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasConfigMeaningfulDifferences } from '../src/lib/configDiff.js'
import { fingerprintConfigForRules } from '../src/lib/ruleCache.js'
import { createHistoryBuilderBaseline } from '../src/history/builderUpdateDescriptor.js'

const SUBSTAT_TARGETS_KEY = '::test-targets'

test('name-only changes mark the builder as dirty', () => {
  const baseline = createHistoryBuilderBaseline({ name: 'Arena' })
  const renamed = { ...baseline, name: 'Arena - Speed' }

  assert.equal(
    fingerprintConfigForRules(renamed, SUBSTAT_TARGETS_KEY),
    fingerprintConfigForRules(baseline, SUBSTAT_TARGETS_KEY),
    'fingerprints should ignore cosmetic name edits',
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

export const __configDiffTestMarker = true
