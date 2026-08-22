import test from 'node:test'
import assert from 'node:assert/strict'

// End-to-end cover for the recipe rework gate and the HSF `Ore` rule property it drives.
//
// The feature crosses four boundaries that each look correct in isolation:
//   1. reworkGate field -> Ore sentinel  (recipeFlags.oreSentinelForRecipe)
//   2. Ore  -> emitted rule property      (wasm builder runtime)
//   3. DB REROLLCOUNT -> item rerollCount (gearDbNormalizer; the field name is the
//      pre-existing DB spelling for what the game calls a rework)
//   4. rule Ore + item rerollCount -> match/no-match (wasm matcher gate)
// The last test also walks the legacy-tag transcode, so a file written before the
// gate became a field keeps its author's intent.
// A test that pinned only emission, or only matching, would still pass if the
// item-side rework count never reached the matcher (it lives in previewExtras,
// which is otherwise stripped at the wasm wire boundary). So every assertion
// below runs the full build -> normalize -> evaluate path.
import { buildHsfRules, defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { normalizeGearDbArtifact, type GearDbArtifactRow } from '../../src/lib/importers/gearDbNormalizer.js'
import { evaluateFirst, evaluateMatchesByRecipe } from '../../src/lib/ruleEval.js'
import { transcodeLegacyRecipeTags } from '../../src/lib/recipeFlags.js'
import { ORE_NOT_ORED, ORE_ORED, REWORK_GATE_NOT_REWORKED, REWORK_GATE_REWORKED } from '../../src/lib/generated/domainConstants.js'

// "Keep every legendary boots" — deliberately the simplest recipe that emits rules,
// so the only thing varying across cases is the rework gate under test.
const keepAllRecipe = (reworkGate?: BuilderRecipe['reworkGate']): BuilderRecipe => ({
  keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
  factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
  substatsV: [], fixedSubstatsV: [],
  minCount: 0, autoMinCount: false, autoSubstatFlex: false,
  minRequiredRolls: 0, autoMinRequiredRolls: true,
  minLevel: 0, maxLevel: 16, substatRollBoundsV: {},
  artifactTypes: [], artifactSets: [],
  ...(reworkGate ? { reworkGate } : {}),
} as unknown as BuilderRecipe)

// A plain legendary boots row; REROLLCOUNT (the DB spelling for reworks) is what the Ore gate keys off.
const bootsRow = (rerollCount: number): GearDbArtifactRow => ({
  ID: 1, rank: 5, type: 4, rarity: 5, lvl: 0, aset: 1,
  mid: 4, mfl: 1,
  REROLLCOUNT: rerollCount,
} as unknown as GearDbArtifactRow)

// Build the rules for a recipe and evaluate one item of the given rework state.
const matches = (reworkGate: BuilderRecipe['reworkGate'] | undefined, rerollCount: number): boolean => {
  const rules = buildHsfRules(keepAllRecipe(reworkGate), defaultSubstatTargets())
  assert.ok(rules.length > 0, 'the recipe emits rules at all')
  const item = normalizeGearDbArtifact(bootsRow(rerollCount)).gearInspectorItem
  // Guard the importer half: if REROLLCOUNT stopped reaching the item, every
  // "not ored" assertion below would pass for the wrong reason.
  assert.equal(item.previewExtras?.rerollCount, rerollCount, 'importer carries the rework count')
  return evaluateFirst(rules, item) !== null
}

test('an ungated recipe ignores rework state entirely', async () => {
  await warmupWasmRuleEngine()
  // This is the backward-compatibility guarantee: existing recipes must be untouched.
  assert.equal(matches(undefined, 0), true, 'pristine gear still matches')
  assert.equal(matches(undefined, 3), true, 'chaos-ored gear still matches')
})

test('the reworked gate keeps only gear that has been reworked', async () => {
  await warmupWasmRuleEngine()
  assert.equal(matches(REWORK_GATE_REWORKED, 1), true, 'one rework is enough')
  assert.equal(matches(REWORK_GATE_REWORKED, 0), false, 'pristine gear is excluded')
})

test('the not-reworked gate keeps only gear that was never reworked', async () => {
  await warmupWasmRuleEngine()
  assert.equal(matches(REWORK_GATE_NOT_REWORKED, 0), true, 'pristine gear matches')
  assert.equal(matches(REWORK_GATE_NOT_REWORKED, 2), false, 'reworked gear is excluded')
})

test('the emitted rules carry the Ore property the preview column reads', async () => {
  await warmupWasmRuleEngine()
  // The preview column and the HSF export both read rule.Ore directly, so pin it.
  const oredRules = buildHsfRules(keepAllRecipe(REWORK_GATE_REWORKED), defaultSubstatTargets())
  assert.ok(oredRules.every((rule) => rule.Ore === ORE_ORED), 'every rule is gated to ored gear')

  const pristineRules = buildHsfRules(keepAllRecipe(REWORK_GATE_NOT_REWORKED), defaultSubstatTargets())
  assert.ok(pristineRules.every((rule) => rule.Ore === ORE_NOT_ORED), 'every rule is gated to pristine gear')

  // Ungated recipes must not gain the key at all, so exported HSF stays byte-identical.
  const plainRules = buildHsfRules(keepAllRecipe(), defaultSubstatTargets())
  assert.ok(plainRules.every((rule) => rule.Ore === undefined), 'ungated recipes emit no Ore key')
})

// The Gear Inspector's "other matches" list is driven by matchingRecipeIndices /
// matchingRecipeDecisions, which evaluate_item builds from a DIFFERENT accumulator than
// first_match. Both sit inside the same gate check, so a rework-mismatched recipe must be
// absent from the other-matches list too — not merely lose the first-match race. A rule
// whose Ore gate rejects the item must be invisible everywhere, not just deprioritized.
//
// This also covers the rule-BUCKETING half: rules are grouped by RuleGate and the matcher
// runs ONE gate check per group head. That is only sound because `ore` is part of RuleGate
// (and therefore part of the grouping key). If it were ever removed from the struct,
// recipes with opposite rework gates could share a group and the head check would admit
// the wrong one — which this test would catch.
test('a rework-mismatched recipe is absent from other matches, not just from first match', async () => {
  await warmupWasmRuleEngine()

  // Three recipes competing for the same item: ungated, reworked, not-reworked.
  // Recipe ids are 1-based, so the indices below are 0, 1 and 2 respectively.
  const ungated = buildHsfRules({ ...keepAllRecipe(), recipeId: 1 } as unknown as BuilderRecipe, defaultSubstatTargets())
  const onlyReworked = buildHsfRules({ ...keepAllRecipe(REWORK_GATE_REWORKED), recipeId: 2 } as unknown as BuilderRecipe, defaultSubstatTargets())
  const neverReworked = buildHsfRules({ ...keepAllRecipe(REWORK_GATE_NOT_REWORKED), recipeId: 3 } as unknown as BuilderRecipe, defaultSubstatTargets())

  // Stamp RecipeID per rule so the matcher can attribute decisions back to a recipe.
  const withRecipeId = (rules: ReturnType<typeof buildHsfRules>, recipeId: number) =>
    rules.map((rule) => ({ ...rule, RecipeID: recipeId }))
  const allRules = [
    ...withRecipeId(ungated, 1),
    ...withRecipeId(onlyReworked, 2),
    ...withRecipeId(neverReworked, 3),
  ] as unknown as Parameters<typeof evaluateMatchesByRecipe>[0]

  // A reworked item: the ungated and reworked recipes apply; not-reworked must not.
  const reworkedItem = normalizeGearDbArtifact(bootsRow(2)).gearInspectorItem
  const reworked = evaluateMatchesByRecipe(allRules, reworkedItem)
  assert.deepEqual(
    [...reworked.matchingRecipeIndices].sort((a, b) => a - b),
    [0, 1],
    'reworked gear matches the ungated and reworked recipes only',
  )
  // The decision list feeds the same UI row, so it must agree with the index list.
  assert.deepEqual(
    reworked.matchingRecipeDecisions.map((d) => d.recipeIdx).sort((a, b) => a - b),
    [0, 1],
    'decisions agree with indices for reworked gear',
  )

  // A pristine item: the ungated and not-reworked recipes apply; reworked must not.
  const pristineItem = normalizeGearDbArtifact(bootsRow(0)).gearInspectorItem
  const pristine = evaluateMatchesByRecipe(allRules, pristineItem)
  assert.deepEqual(
    [...pristine.matchingRecipeIndices].sort((a, b) => a - b),
    [0, 2],
    'pristine gear matches the ungated and not-reworked recipes only',
  )
  assert.deepEqual(
    pristine.matchingRecipeDecisions.map((d) => d.recipeIdx).sort((a, b) => a - b),
    [0, 2],
    'decisions agree with indices for pristine gear',
  )
})

// Regression for the reported bug: a recipe saved BEFORE the tag rename carried
// `ignore_for_chaos_ored`, which stopped being recognized. Its rules were emitted with no
// `Ore` key, so reworked gear kept matching it — visible in the Gear Inspector as the
// recipe appearing under "other matches" for reworked pieces.
//
// The gate is a field now, so the equivalent risk moved to the load transcode: if it
// failed to lift a legacy tag onto the field, the same symptom would return. This walks
// transcode -> build -> evaluate to prove the whole legacy path still gates correctly.
test('a recipe using the pre-rename tag spelling still gates on rework state', async () => {
  await warmupWasmRuleEngine()

  // The exact tag list from the reported recipe, legacy spelling included.
  const legacy = transcodeLegacyRecipeTags(['ignore_by_safeguards', 'ignore_for_chaos_ored', 'ore5epic'])
  // The transcode must recover both flags and leave the genuine label behind.
  assert.equal(legacy.reworkGate, REWORK_GATE_NOT_REWORKED, 'legacy tag lifted onto the gate')
  assert.equal(legacy.ignoredBySafeguards, true, 'legacy safeguard tag lifted onto the flag')
  assert.deepEqual(legacy.tags, ['ore5epic'], 'the user label survives as a plain tag')

  const rules = buildHsfRules(keepAllRecipe(legacy.reworkGate), defaultSubstatTargets())
  assert.ok(rules.length > 0, 'the recipe emits rules at all')
  // Before the original fix every rule came out with Ore undefined.
  assert.ok(
    rules.every((rule) => rule.Ore === ORE_NOT_ORED),
    'legacy-tagged rules carry the never-reworked gate',
  )

  // And the matcher honors it: reworked gear must NOT match, in first match or otherwise.
  assert.equal(matches(legacy.reworkGate, 0), true, 'pristine gear still matches')
  assert.equal(matches(legacy.reworkGate, 3), false, 'reworked gear no longer matches')
})
