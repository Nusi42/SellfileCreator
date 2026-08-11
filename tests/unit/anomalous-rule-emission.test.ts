import test from 'node:test'
import assert from 'node:assert/strict'

// End-to-end emission for a recipe built entirely from anomalous substats — the
// shape a user actually builds ("keep anything with any mode-damage line"). Pins
// what the earlier PROVISIONAL layer could not: that these reach the emitted
// rules at all, that every selected substat gets its own OR-rule, and that the
// value arrives in HSF wire units (125 = 1.25%) rather than floored to 1.
import { buildHsfRules, defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  ANOMALOUS_HSF_VALUE_SCALE,
  ANOMALOUS_SUBSTAT_IDS,
  ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE,
  ANOMALOUS_SUBSTAT_VARIANTS,
} from '../../src/lib/anomalousAccessories.js'
import type { SubstatTargetTable } from '../../src/lib/hsfBuilder.js'
import { findObsoleteRules } from '../../src/lib/hsfObsolete.js'
import { countRulesForRecipeEntry } from '../../src/lib/ruleCacheHelpers.js'
import { StatVariant } from '../../src/lib/types.js'

// "Any rolls" on every anomalous substat, min 1 of them, across the full level
// window — the recipe form that exercises one rule per substat per milestone.
const anomalousAnyRecipe = (variants: readonly number[] = ANOMALOUS_SUBSTAT_VARIANTS): BuilderRecipe => {
  const substatRollBoundsV: Record<number, { any: boolean }> = {}
  for (const variant of variants) substatRollBoundsV[variant] = { any: true }
  return {
    keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
    factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
    substatsV: [...variants], fixedSubstatsV: [],
    minCount: 1, autoMinCount: false, autoSubstatFlex: false,
    minRequiredRolls: 0, autoMinRequiredRolls: true,
    minLevel: 0, maxLevel: 16, substatRollBoundsV,
    artifactTypes: [], artifactSets: [],
  } as unknown as BuilderRecipe
}

// The one anomalous line of a rule (the other three slots are ID -1 padding).
const anomalousLinesOf = (rules: ReturnType<typeof buildHsfRules>) =>
  rules.flatMap((rule) => (rule.Substats ?? []).filter((s) => Number(s.ID) !== -1))

test('distinct anomalous substats are not mistaken for each other after building', async () => {
  await warmupWasmRuleEngine()
  // The obsolete detector keys on the DECODED variant, and Rust's sub_to_variant
  // only knew the classic id ranges — so every anomalous id decoded to the Any
  // fallback and two different mode-damage rules looked like the same stat. A
  // recipe with N of them emitted one rule per level instead of N, silently.
  // This is the app's real post-build path; buildHsfRules alone never saw it.
  const targets = defaultSubstatTargets()
  const twoAnomalous = anomalousAnyRecipe([
    ANOMALOUS_SUBSTAT_VARIANTS[0]!,
    ANOMALOUS_SUBSTAT_VARIANTS[1]!,
  ])
  const built = buildHsfRules(twoAnomalous, targets)
  assert.equal(findObsoleteRules(built).obsolete.length, 0, 'no anomalous rule covers a DIFFERENT anomalous stat')
  assert.equal(countRulesForRecipeEntry(twoAnomalous, targets), built.length)

  // Same shape as the classic pair it must behave like (SPD + CR%).
  const twoClassic = anomalousAnyRecipe([StatVariant.SPD, StatVariant.CR])
  assert.equal(
    countRulesForRecipeEntry(twoAnomalous, targets),
    countRulesForRecipeEntry(twoClassic, targets),
    'two anomalous substats must survive pruning exactly like two classic ones',
  )
})

test('every selected anomalous substat reaches the emitted rules', async () => {
  await warmupWasmRuleEngine()
  const rules = buildHsfRules(anomalousAnyRecipe(), defaultSubstatTargets())
  const lines = anomalousLinesOf(rules)
  // All eight ids present — not just the first. OR-semantics rules carry one
  // positive substat each, so the pool must not collapse to a single stat.
  const ids = new Set(lines.map((s) => Number(s.ID)))
  assert.deepEqual([...ids].sort((a, b) => a - b), [...ANOMALOUS_SUBSTAT_IDS].sort((a, b) => a - b))
  // Five level milestones (0/4/8/12/16) x eight substats.
  const levels = new Set(rules.map((r) => Number(r.LVLForCheck)))
  assert.deepEqual([...levels].sort((a, b) => a - b), [0, 4, 8, 12, 16])
  assert.equal(rules.length, ANOMALOUS_SUBSTAT_VARIANTS.length * 5)
})

test('emitted anomalous values are in HSF wire units, not floored display units', async () => {
  await warmupWasmRuleEngine()
  const rules = buildHsfRules(anomalousAnyRecipe(), defaultSubstatTargets())
  const expected = Math.round(ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE * ANOMALOUS_HSF_VALUE_SCALE)
  for (const line of anomalousLinesOf(rules)) {
    // 125, i.e. 1.25% — the pre-scale code emitted floor(1.25) = 1, which RSL
    // Helper would read as a 0.01% threshold.
    assert.equal(Number(line.Value), expected)
    assert.equal(line.IsFlat, false)
    assert.equal(line.Condition, '>=')
  }
})

test('an SFC saved before these stats existed falls back to the factory minimum', async () => {
  await warmupWasmRuleEngine()
  // Such a document has NO key for these variants in its Minima table. Falling
  // back to 0 would emit a vacuous ">= 0" that matches any gear carrying the
  // line at all — silently broader than a freshly-created recipe.
  const targets = defaultSubstatTargets()
  const starKeys = ['one', 'two', 'three', 'four', 'five', 'six'] as const satisfies readonly (keyof SubstatTargetTable)[]
  for (const starKey of starKeys) {
    for (const variant of ANOMALOUS_SUBSTAT_VARIANTS) {
      delete (targets[starKey] as Record<number, number>)[variant]
    }
  }
  const rules = buildHsfRules(anomalousAnyRecipe(), targets)
  const expected = Math.round(ANOMALOUS_SUBSTAT_STAR5_ROLL_VALUE * ANOMALOUS_HSF_VALUE_SCALE)
  const values = new Set(anomalousLinesOf(rules).map((s) => Number(s.Value)))
  assert.deepEqual([...values], [expected])
})

test('a 0 target never reaches an emitted rule as a vacuous ">= 0"', async () => {
  await warmupWasmRuleEngine()
  // Zero is not a supported target, so a table carrying one (older document,
  // hand edit) must still emit a real threshold rather than a rule that matches
  // any gear carrying the line at all.
  const targets = defaultSubstatTargets()
  const zeroed = ANOMALOUS_SUBSTAT_VARIANTS[0]!
  for (const starKey of ['one', 'two', 'three', 'four', 'five', 'six'] as const) {
    ;(targets[starKey] as Record<number, number>)[zeroed] = 0
  }
  const rules = buildHsfRules(anomalousAnyRecipe(), targets)
  const zeroedId = Number(ANOMALOUS_SUBSTAT_IDS[0])
  const zeroedLines = anomalousLinesOf(rules).filter((s) => Number(s.ID) === zeroedId)
  assert.ok(zeroedLines.length > 0, 'the stat still emits rules')
  for (const line of zeroedLines) assert.ok(Number(line.Value) > 0, `expected a real threshold, got ${line.Value}`)
})
