import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Pins our anomalous-substat model against the REAL sellfile RSL Helper produced
// (docs/orig/anomalous.hsf) — eight rules that a screenshot matched one-for-one,
// each carrying a distinct mode-damage substat at a distinct value. This is the
// evidence behind every judged constant here, so it is asserted rather than
// paraphrased: if RSL Helper ever changes the ids or the value scale, the sample
// file changes and this test fails instead of the export silently going wrong.
import { parseHsfFile, buildHsfFileFromMerged } from '../../src/lib/hsfIO.js'
import {
  ANOMALOUS_HSF_VALUE_SCALE,
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  isAnomalousStatId,
} from '../../src/lib/anomalousAccessories.js'
import { subToVariant, labelOfVariant } from '../../src/lib/types.js'
import type { HsfSubstat } from '../../src/lib/hsfTypes.js'

// Repo-root relative (like the other fixture-reading unit tests) — the compiled
// test lives under tmp/tsc, so import.meta.url would not resolve to the source tree.
const samplePath = resolve(process.cwd(), 'docs/orig/anomalous.hsf')
const sample = parseHsfFile(readFileSync(samplePath, 'utf8'))

// The screenshot the sample was captured against, in rule order. Values are the
// percentages RSL Helper displayed; the file stores them scaled (see below).
const EXPECTED_RULES: ReadonlyArray<{ key: keyof typeof ANOMALOUS_SUBSTAT_IDS_BY_KEY; percent: number }> = [
  { key: 'pveDmgPlus', percent: 0.25 },
  { key: 'pvpDmgPlus', percent: 0.5 },
  { key: 'bossDmgPlus', percent: 0.75 },
  { key: 'dungeonDmgPlus', percent: 1 },
  { key: 'pveDmgMinus', percent: 1.25 },
  { key: 'pvpDmgMinus', percent: 1.5 },
  { key: 'bossDmgMinus', percent: 2 },
  { key: 'dungeonDmgMinus', percent: 2.25 },
]

// The one anomalous line in a rule (the other three slots are ID -1 padding).
const anomalousLineOf = (substats: readonly HsfSubstat[] | undefined): HsfSubstat => {
  const found = (substats ?? []).filter((entry) => isAnomalousStatId(Number(entry.ID)))
  assert.equal(found.length, 1, 'each sample rule carries exactly one anomalous line')
  return found[0]!
}

test('every anomalous stat id matches the sample sellfile', () => {
  assert.equal(sample.Rules.length, EXPECTED_RULES.length)
  EXPECTED_RULES.forEach((expected, idx) => {
    const line = anomalousLineOf(sample.Rules[idx]!.Substats)
    // Ids 14/15/17/18 were INFERRED from mode-order contiguity before this
    // sample existed — this assertion is what confirmed the inference.
    assert.equal(Number(line.ID), ANOMALOUS_SUBSTAT_IDS_BY_KEY[expected.key], `rule ${idx + 1} stat id`)
  })
})

test('anomalous values are stored in hundredths of a percent', () => {
  EXPECTED_RULES.forEach((expected, idx) => {
    const line = anomalousLineOf(sample.Rules[idx]!.Substats)
    // 0.25% -> 25, 2.25% -> 225. This is the scale the emitter applies, and the
    // reason target values can express hundredths at all.
    assert.equal(Number(line.Value), Math.round(expected.percent * ANOMALOUS_HSF_VALUE_SCALE), `rule ${idx + 1} value`)
  })
})

test('anomalous rules are otherwise ordinary — percent-shaped, >=, Any-padded', () => {
  for (const rule of sample.Rules) {
    const line = anomalousLineOf(rule.Substats)
    // IsFlat false is what makes our percent-shaped variant encoding correct.
    assert.equal(line.IsFlat, false)
    assert.equal(line.Condition, '>=')
    assert.equal(line.NotAvailable, false)
    // Nothing exotic at rule level: any rank, any rarity, no main-stat demand.
    assert.equal(rule.Rank, 0)
    assert.equal(rule.Rarity, 0)
    assert.equal(rule.MainStatID, -1)
    // The remaining three slots are neutral padding, exactly like classic rules.
    assert.equal(rule.Substats!.length, 4)
    assert.equal(rule.Substats!.filter((entry) => Number(entry.ID) === -1).length, 3)
  }
})

test('the sample decodes into the variants and labels the app uses', () => {
  EXPECTED_RULES.forEach((expected, idx) => {
    const line = anomalousLineOf(sample.Rules[idx]!.Substats)
    // The standard (id<<8)|flat decode must land on our anomalous variant, so a
    // sample-derived line and an app-authored one are the same thing.
    const variant = subToVariant(Number(line.ID), line.IsFlat)
    assert.equal(variant, ANOMALOUS_SUBSTAT_IDS_BY_KEY[expected.key] << 8)
    assert.ok(labelOfVariant(variant).length > 0, 'decoded variant has a display label')
  })
})

test('anomalous rules survive the export boundary instead of being scrubbed', () => {
  // The export scrub used to drop these rules wholesale (the encoding was
  // unknown). Re-exporting the sample must now round-trip every rule.
  type MergedRuleLike = Parameters<typeof buildHsfFileFromMerged>[0][number]
  const exported = buildHsfFileFromMerged(sample.Rules as unknown as MergedRuleLike[])
  assert.equal(exported.Rules.length, EXPECTED_RULES.length)
  EXPECTED_RULES.forEach((expected, idx) => {
    const line = anomalousLineOf(exported.Rules[idx]!.Substats)
    assert.equal(Number(line.ID), ANOMALOUS_SUBSTAT_IDS_BY_KEY[expected.key])
    assert.equal(Number(line.Value), Math.round(expected.percent * ANOMALOUS_HSF_VALUE_SCALE))
  })
})
