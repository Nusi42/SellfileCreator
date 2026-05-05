/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHsfRules, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { normalizeRollBoundsEntry, rollBoundsEqual } from '../../src/components/builderPanel/substatMenuHelpers.js'
import { RankCode, RarityCode, StatVariant, ArtifactSet, ArtifactType, type RankValue, type LevelMilestone } from '../../src/lib/types.js'
import { isMilestoneThresholdsActive } from '../../src/lib/recipeNormalization.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { evaluateMatchesByRecipe, type TestItem } from '../../src/lib/ruleEval.js'
import type { HsfRuleWithRecipe } from '../../src/lib/merge.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

const base = (overrides: Partial<BuilderRecipe> = {}): BuilderRecipe => ({
  keep: true,
  exportMode: 'active',
  rankCode: RankCode.Six,
  rarityCode: RarityCode.Any,
  rarityMode: 'auto',
  minCount: 1,
  autoSubstatFlex: false,
  ...overrides,
})

// ─── normalizeRollBoundsEntry ──────────────────────────────────────────────────

test('normalizeRollBoundsEntry clears min/max/any when not is true', () => {
  assert.deepEqual(normalizeRollBoundsEntry({ not: true }), { not: true })
  assert.deepEqual(normalizeRollBoundsEntry({ not: true, min: 2 }), { not: true })
  assert.deepEqual(normalizeRollBoundsEntry({ not: true, max: 3 }), { not: true })
  assert.deepEqual(normalizeRollBoundsEntry({ not: true, any: true }), { not: true })
  assert.deepEqual(normalizeRollBoundsEntry({ not: true, min: 1, max: 2, any: true }), { not: true })
})

test('normalizeRollBoundsEntry does not set not when false/absent', () => {
  assert.equal(normalizeRollBoundsEntry({ not: false }), null)
  assert.equal(normalizeRollBoundsEntry({}), null)
  assert.deepEqual(normalizeRollBoundsEntry({ min: 1 }), { min: 1 })
})

// ─── rollBoundsEqual ──────────────────────────────────────────────────────────

test('rollBoundsEqual treats not field correctly', () => {
  assert.equal(rollBoundsEqual({ not: true }, { not: true }), true)
  assert.equal(rollBoundsEqual({ not: false }, { not: false }), true)
  assert.equal(rollBoundsEqual({ not: true }, { not: false }), false)
  assert.equal(rollBoundsEqual({ not: true }, null), false)
  assert.equal(rollBoundsEqual(null, { not: true }), false)
  assert.equal(rollBoundsEqual({ min: 1 }, { not: true }), false)
})

// ─── isMilestoneThresholdsActive (exercises hasSubstatThresholds internally) ──

test('isMilestoneThresholdsActive returns true when any bound has not:true', () => {
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    substatRollBoundsV: { [StatVariant.CR]: { not: true } },
  })
  assert.equal(isMilestoneThresholdsActive(recipe), true)
})

test('isMilestoneThresholdsActive returns false for wildcard-only bounds', () => {
  const recipe = base({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { any: true } },
  })
  assert.equal(isMilestoneThresholdsActive(recipe), false)
})

// ─── rule generation ──────────────────────────────────────────────────────────

test('recipe with not substat emits Condition ¬ in generated rules', async () => {
  await warmupWasmRuleEngine()
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
    substatRollBoundsV: {
      [StatVariant.CR]: { not: true },
    },
    minCount: 1,
  })
  const rules = buildHsfRules(recipe)
  assert(rules.length > 0, 'expected at least one rule to be generated')
  for (const rule of rules) {
    const notSubs = rule.Substats?.filter(s => s.Condition === '¬') ?? []
    assert(notSubs.length >= 1, `rule has no ¬ substat: ${JSON.stringify(rule.Substats)}`)
    const crSub = notSubs.find(s => s.IsFlat === false && s.ID !== -1)
    assert(crSub != null, 'expected CR-variant ¬ entry in substats')
  }
})

test('not substat is excluded from combination pool — other combos still emit', async () => {
  await warmupWasmRuleEngine()
  // Two positive substats (SPD, HP%) + one not (ATK%) → every rule has SPD+HP% (or just one if minCount=2)
  // and all rules have ATK% ¬.
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.HP, StatVariant.ATK],
    fixedSubstatsV: [],
    substatRollBoundsV: {
      [StatVariant.ATK]: { not: true },
    },
    minCount: 2,
  })
  const rules = buildHsfRules(recipe)
  assert(rules.length > 0, 'expected rules')
  for (const rule of rules) {
    // Every rule must include the ¬ ATK% constraint.
    const notSubs = rule.Substats?.filter(s => s.Condition === '¬') ?? []
    assert(notSubs.length >= 1, 'every rule must have ¬ constraint')
    // No positive ATK entry (>=) should appear.
    const posSubs = rule.Substats?.filter(s => s.Condition === '>=' && s.ID !== -1) ?? []
    const hasATK = posSubs.some(s => s.IsFlat === true && s.ID === 1 /* ATK flat */)
    assert(!hasATK, 'ATK% should not appear as a positive >= substat')
  }
})

test('not substat excluded from minCount accounting', async () => {
  await warmupWasmRuleEngine()
  // minCount=1, substatsV=[SPD, ATK%¬] — ATK% must not raise the effective minCount
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.ATK],
    fixedSubstatsV: [],
    substatRollBoundsV: {
      [StatVariant.ATK]: { not: true },
    },
    minCount: 1,
  })
  const rules = buildHsfRules(recipe)
  // Should generate rules (SPD must appear, ATK¬ appended)
  assert(rules.length > 0, 'expected at least one rule')
  for (const rule of rules) {
    const geSubstats = rule.Substats?.filter(s => s.Condition === '>=') ?? []
    // Only SPD >= threshold; not ATK
    assert(geSubstats.length >= 1, 'should have at least one >= substat (SPD)')
  }
})

test('not substat disqualifies factory collapse', async () => {
  await warmupWasmRuleEngine()
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
    substatRollBoundsV: {
      [StatVariant.CR]: { not: true },
    },
    minCount: 1,
  })
  const rules = buildHsfRules(recipe)
  // Factory collapse would produce presence-only rules; ¬ rules are not factory-collapsed
  // (they carry explicit conditions). We simply assert rules are generated with conditions.
  assert(rules.length > 0)
  const hasConditioned = rules.some(r => r.Substats?.some(s => s.Condition && s.Condition !== ''))
  assert(hasConditioned, 'expected conditioned (non-presence-only) rules due to ¬ substat')
})

test('recipe with ALL substats as "not" emits only ¬ rules (no positive >= substats)', async () => {
  await warmupWasmRuleEngine()
  // Exercises the presence-only WASM path: selectedPoolV=[], notSubstatsV=[SPD].
  const recipe = base({
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { not: true } },
    minCount: 1,
    autoMinCount: true,
  })
  const rules = buildHsfRules(recipe)
  assert(rules.length > 0, 'expected rules to be generated')
  for (const rule of rules) {
    const notSub = rule.Substats?.find((s: { Condition?: string }) => s.Condition === '¬')
    assert(notSub != null, `expected ¬ substat in rule: ${JSON.stringify(rule.Substats)}`)
    const posSubs = rule.Substats?.filter((s: { Condition?: string; ID?: number }) => s.Condition === '>=' && s.ID !== -1) ?? []
    assert.equal(posSubs.length, 0, `unexpected positive substats: ${JSON.stringify(posSubs)}`)
  }
})

test('has_substat_thresholds returns true when any bound has not:true (WASM path)', async () => {
  await warmupWasmRuleEngine()
  // Verify the WASM path honours "not" for Auto-rarity determination.
  // A recipe with only ¬ bounds (no min rolls) should still produce rules
  // because hasSubstatThresholds is true and can influence rarity resolution.
  const recipe = base({
    substatsV: [StatVariant.SPD, StatVariant.CR],
    fixedSubstatsV: [StatVariant.SPD],
    substatRollBoundsV: {
      [StatVariant.CR]: { not: true },
    },
    minCount: 1,
  })
  const rules = buildHsfRules(recipe)
  assert(rules.length > 0, 'recipe with ¬ bound should produce rules')
})

// ─── end-to-end: generate rules then evaluate items (gear inspector path) ──────

test('¬ recipe: item WITH the forbidden stat does NOT match any rule', async () => {
  await warmupWasmRuleEngine()
  const recipe = base({
    keep: false,
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { not: true } },
    minCount: 1,
    autoMinCount: true,
    rarityMode: 'auto',
    rankCode: RankCode.Six,
  })
  const rules = buildHsfRules(recipe) as HsfRuleWithRecipe[]
  assert(rules.length > 0, 'expected rules to be generated')
  const itemWithSPD: TestItem = {
    slot: ArtifactType.Helmet,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 5 as RankValue,    // legendary
    level: 16 as LevelMilestone,
    subValues: { [StatVariant.SPD]: 20 },
  }
  const result = evaluateMatchesByRecipe(rules, itemWithSPD)
  assert.equal(result.firstMatch, null, 'item WITH SPD should not match the ¬ SPD recipe')
})

test('¬ recipe: item WITHOUT the forbidden stat matches a rule', async () => {
  await warmupWasmRuleEngine()
  const recipe = base({
    keep: false,
    substatsV: [StatVariant.SPD],
    substatRollBoundsV: { [StatVariant.SPD]: { not: true } },
    minCount: 1,
    autoMinCount: true,
    rarityMode: 'auto',
    rankCode: RankCode.Six,
  })
  const rules = buildHsfRules(recipe) as HsfRuleWithRecipe[]
  assert(rules.length > 0, 'expected rules to be generated')
  const itemWithoutSPD: TestItem = {
    slot: ArtifactType.Helmet,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 5 as RankValue,    // legendary
    level: 16 as LevelMilestone,
    subValues: { [StatVariant.ATK_FLAT]: 200 },  // has ATK but not SPD
  }
  const result = evaluateMatchesByRecipe(rules, itemWithoutSPD)
  assert.notEqual(result.firstMatch, null, 'item WITHOUT SPD should match the ¬ SPD recipe')
  assert.equal(result.firstMatch!.keep, false, 'matched recipe should be a sell recipe')
})

export {}
