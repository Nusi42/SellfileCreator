import test from 'node:test'
import assert from 'node:assert/strict'

// The other half of anomalous-rule-emission.test.ts. That spec pins what the
// BUILDER emits (wire units, 125 = 1.25%); this one pins that the MATCHER then
// accepts a real item carrying that line.
//
// Emission and matching sat on opposite sides of a unit boundary and neither
// spec crossed it: rules carry HSF wire units while item subValues carry display
// percent, so a correctly-emitted ">= 125" was tested against a correctly
// normalized 1.25 and never matched. Every classic stat scales by 1, which is
// why the gap only opened once these stats existed. Anything asserting emission
// alone, or matching alone, would still pass with the bug present — the
// assertion has to run the full build -> evaluate path on one item.
import { buildHsfRules, defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { normalizeGearDbArtifact, type GearDbArtifactRow } from '../../src/lib/importers/gearDbNormalizer.js'
import { evaluateFirst } from '../../src/lib/ruleEval.js'
import {
  ANOMALOUS_SUBSTAT_IDS_BY_KEY,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS,
  ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY,
} from '../../src/lib/anomalousAccessories.js'
import { STAT_SCALE } from '../../src/lib/importers/gearDbNormalizer.js'
import { StatId, StatVariant } from '../../src/lib/types.js'

// "Keep anything carrying any mode-damage line" — the same recipe shape the
// lategame preset ships, and the one a user actually builds for these stats.
const anomalousAnyRecipe = (): BuilderRecipe => {
  const substatRollBoundsV: Record<number, { any: boolean }> = {}
  for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) substatRollBoundsV[variant] = { any: true }
  return {
    keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
    factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
    substatsV: [...ANOMALOUS_SUBSTAT_VARIANTS], fixedSubstatsV: [],
    minCount: 1, autoMinCount: false, autoSubstatFlex: false,
    minRequiredRolls: 0, autoMinRequiredRolls: true,
    minLevel: 0, maxLevel: 16, substatRollBoundsV,
    artifactTypes: [], artifactSets: [],
  } as unknown as BuilderRecipe
}

// The DB stores stat values as fixed-point over 2^32, as a fraction (1.25% is
// 0.0125). Build rows the way the importer will actually read them rather than
// hand-writing the huge integers.
const fixedPoint = (percent: number): number => Math.round((percent / 100) * STAT_SCALE)

// An Amulet (slot 8) whose s1 carries one anomalous line at the rank-5 base
// value. Mirrors ID 264536 in examples/um109288203_RSLHelper.db.
const rowWithAnomalousSubstat = (statId: number, percent: number): GearDbArtifactRow => ({
  ID: 1, rank: 5, type: 8, rarity: 5, lvl: 0, aset: 58, accset: 15,
  mid: 3, mfl: 1, mlvlid: fixedPoint(2500),
  s1id: statId, s1lvlid: fixedPoint(percent),
})

test('an item carrying an anomalous substat matches the rule built for it', async () => {
  await warmupWasmRuleEngine()
  const rules = buildHsfRules(anomalousAnyRecipe(), defaultSubstatTargets())
  assert.ok(rules.length > 0, 'the recipe emits rules at all')

  // Every one of the eight stats, so a scale applied to only part of the family
  // (or keyed off the wrong id range) still fails here.
  for (const [key, statId] of Object.entries(ANOMALOUS_SUBSTAT_IDS_BY_KEY)) {
    const row = rowWithAnomalousSubstat(statId, ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE)
    const item = normalizeGearDbArtifact(row).gearInspectorItem

    // The importer must hand the matcher DISPLAY units; if this drifts to wire
    // units the assertion below would pass for the wrong reason.
    const variant = ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY[key as keyof typeof ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY]
    assert.equal(
      item.subValues?.[variant],
      ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
      `${key}: importer emits display units`,
    )

    const match = evaluateFirst(rules, item)
    assert.ok(match, `${key}: an item at the rank-5 base value must match its own rule`)
    assert.equal(match.keep, true, `${key}: the recipe keeps it`)
  }
})

test('an anomalous line below the target does not match', async () => {
  await warmupWasmRuleEngine()
  // The complement of the test above: proof the threshold is compared at the
  // right MAGNITUDE, not merely that some scaling happens. Dividing the rule
  // value by 100 twice (or the item by 100 once) would keep the match above
  // green while making every rule vacuous — this row is the one that catches it.
  const rules = buildHsfRules(anomalousAnyRecipe(), defaultSubstatTargets())
  // Stay on the importer's 2-decimal grid so the fixture value survives
  // normalization exactly (1.25 / 2 would round to 0.63 and fail its own check).
  const belowTarget = 0.25
  const row = rowWithAnomalousSubstat(ANOMALOUS_SUBSTAT_IDS_BY_KEY.pveDmgPlus, belowTarget)
  const item = normalizeGearDbArtifact(row).gearInspectorItem
  assert.equal(item.subValues?.[ANOMALOUS_SUBSTAT_VARIANTS_BY_KEY.pveDmgPlus], belowTarget)
  assert.equal(evaluateFirst(rules, item), null, 'a value under the target is not kept')
})

test('classic substats still match after the wire-unit normalization', async () => {
  await warmupWasmRuleEngine()
  // Classic stats scale by 1, so the wire -> display conversion must be a no-op
  // for them. Guards the fix against regressing the other ~40 stats.
  const speedRecipe = {
    ...anomalousAnyRecipe(),
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { any: true } },
  } as unknown as BuilderRecipe
  const rules = buildHsfRules(speedRecipe, defaultSubstatTargets())
  assert.ok(rules.length > 0)

  // A generous SPD roll clears any sane target for the stat.
  const row: GearDbArtifactRow = {
    ID: 2, rank: 5, type: 8, rarity: 5, lvl: 0, aset: 58, accset: 15,
    mid: 3, mfl: 1, mlvlid: fixedPoint(2500),
    s1id: StatId.SPD, s1fl: 1, s1lvlid: Math.round(30 * STAT_SCALE),
  }
  const item = normalizeGearDbArtifact(row).gearInspectorItem
  assert.equal(item.subValues?.[StatVariant.SPD], 30, 'flat SPD is not percent-scaled')
  assert.ok(evaluateFirst(rules, item), 'a classic substat still matches its rule')
})
