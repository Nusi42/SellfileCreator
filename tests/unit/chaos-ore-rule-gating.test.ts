import test from 'node:test'
import assert from 'node:assert/strict'

// End-to-end cover for the rework recipe tags (if_reworked / if_not_reworked)
// and the HSF `Ore` rule property they drive.
//
// The feature crosses four boundaries that each look correct in isolation:
//   1. tags -> Ore sentinel               (tagHelpers.resolveChaosOreTagValue)
//   2. Ore  -> emitted rule property      (wasm builder runtime)
//   3. DB REROLLCOUNT -> item rerollCount (gearDbNormalizer; the field name is the
//      pre-existing DB spelling for what the game calls a rework)
//   4. rule Ore + item rerollCount -> match/no-match (wasm matcher gate)
// A test that pinned only emission, or only matching, would still pass if the
// item-side rework count never reached the matcher (it lives in previewExtras,
// which is otherwise stripped at the wasm wire boundary). So every assertion
// below runs the full build -> normalize -> evaluate path.
import { buildHsfRules, defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import { normalizeGearDbArtifact, type GearDbArtifactRow } from '../../src/lib/importers/gearDbNormalizer.js'
import { evaluateFirst, evaluateMatchesByRecipe } from '../../src/lib/ruleEval.js'
import { REWORK_EXCLUDE_TAG, REWORK_ONLY_TAG } from '../../src/lib/tagHelpers.js'
import { ORE_NOT_ORED, ORE_ORED } from '../../src/lib/generated/domainConstants.js'

// "Keep every legendary boots" — deliberately the simplest recipe that emits rules,
// so the only thing varying across cases is the chaos-ore tag under test.
const keepAllRecipe = (tags?: string[]): BuilderRecipe => ({
  keep: true, exportMode: 'active', rankCode: 0, rarityCode: 0, rarityMode: 'auto',
  factionCode: 0, mainStatsV: [], earlyKeepMode: 'early',
  substatsV: [], fixedSubstatsV: [],
  minCount: 0, autoMinCount: false, autoSubstatFlex: false,
  minRequiredRolls: 0, autoMinRequiredRolls: true,
  minLevel: 0, maxLevel: 16, substatRollBoundsV: {},
  artifactTypes: [], artifactSets: [],
  ...(tags ? { tags } : {}),
} as unknown as BuilderRecipe)

// A plain legendary boots row; REROLLCOUNT (the DB spelling for reworks) is what the Ore gate keys off.
const bootsRow = (rerollCount: number): GearDbArtifactRow => ({
  ID: 1, rank: 5, type: 4, rarity: 5, lvl: 0, aset: 1,
  mid: 4, mfl: 1,
  REROLLCOUNT: rerollCount,
} as unknown as GearDbArtifactRow)

// Build the rules for a recipe and evaluate one item of the given rework state.
const matches = (tags: string[] | undefined, rerollCount: number): boolean => {
  const rules = buildHsfRules(keepAllRecipe(tags), defaultSubstatTargets())
  assert.ok(rules.length > 0, 'the recipe emits rules at all')
  const item = normalizeGearDbArtifact(bootsRow(rerollCount)).gearInspectorItem
  // Guard the importer half: if REROLLCOUNT stopped reaching the item, every
  // "not ored" assertion below would pass for the wrong reason.
  assert.equal(item.previewExtras?.rerollCount, rerollCount, 'importer carries the rework count')
  return evaluateFirst(rules, item) !== null
}

test('an untagged recipe ignores rework state entirely', async () => {
  await warmupWasmRuleEngine()
  // This is the backward-compatibility guarantee: existing recipes must be untouched.
  assert.equal(matches(undefined, 0), true, 'pristine gear still matches')
  assert.equal(matches(undefined, 3), true, 'chaos-ored gear still matches')
})

test('if_reworked keeps only gear that has been reworked', async () => {
  await warmupWasmRuleEngine()
  assert.equal(matches([REWORK_ONLY_TAG], 1), true, 'one rework is enough')
  assert.equal(matches([REWORK_ONLY_TAG], 0), false, 'pristine gear is excluded')
})

test('if_not_reworked keeps only gear that was never reworked', async () => {
  await warmupWasmRuleEngine()
  assert.equal(matches([REWORK_EXCLUDE_TAG], 0), true, 'pristine gear matches')
  assert.equal(matches([REWORK_EXCLUDE_TAG], 2), false, 'reworked gear is excluded')
})

test('a file carrying both tags resolves to if_reworked', async () => {
  await warmupWasmRuleEngine()
  // The editors keep these mutually exclusive, so this only happens for hand-edited or
  // legacy files. if_reworked wins, and the order in the list must not matter.
  const both = [REWORK_ONLY_TAG, REWORK_EXCLUDE_TAG]
  assert.equal(matches(both, 5), true, 'reworked gear matches')
  assert.equal(matches(both, 0), false, 'pristine gear is excluded')
  const reversed = [REWORK_EXCLUDE_TAG, REWORK_ONLY_TAG]
  assert.equal(matches(reversed, 5), true, 'order in the tag list does not change the winner')
  assert.equal(matches(reversed, 0), false, 'order in the tag list does not change the winner')
})

test('the emitted rules carry the Ore property the preview column reads', async () => {
  await warmupWasmRuleEngine()
  // The preview column and the HSF export both read rule.Ore directly, so pin it.
  const oredRules = buildHsfRules(keepAllRecipe([REWORK_ONLY_TAG]), defaultSubstatTargets())
  assert.ok(oredRules.every((rule) => rule.Ore === ORE_ORED), 'every rule is gated to ored gear')

  const pristineRules = buildHsfRules(keepAllRecipe([REWORK_EXCLUDE_TAG]), defaultSubstatTargets())
  assert.ok(pristineRules.every((rule) => rule.Ore === ORE_NOT_ORED), 'every rule is gated to pristine gear')

  // Untagged recipes must not gain the key at all, so exported HSF stays byte-identical.
  const plainRules = buildHsfRules(keepAllRecipe(), defaultSubstatTargets())
  assert.ok(plainRules.every((rule) => rule.Ore === undefined), 'untagged recipes emit no Ore key')
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
// recipes with opposite rework tags could share a group and the head check would admit
// the wrong one — which this test would catch.
test('a rework-mismatched recipe is absent from other matches, not just from first match', async () => {
  await warmupWasmRuleEngine()

  // Three recipes competing for the same item: untagged, if_reworked, if_not_reworked.
  // Recipe ids are 1-based, so the indices below are 0, 1 and 2 respectively.
  const untagged = buildHsfRules({ ...keepAllRecipe(), recipeId: 1 } as unknown as BuilderRecipe, defaultSubstatTargets())
  const onlyReworked = buildHsfRules({ ...keepAllRecipe([REWORK_ONLY_TAG]), recipeId: 2 } as unknown as BuilderRecipe, defaultSubstatTargets())
  const neverReworked = buildHsfRules({ ...keepAllRecipe([REWORK_EXCLUDE_TAG]), recipeId: 3 } as unknown as BuilderRecipe, defaultSubstatTargets())

  // Stamp RecipeID per rule so the matcher can attribute decisions back to a recipe.
  const withRecipeId = (rules: ReturnType<typeof buildHsfRules>, recipeId: number) =>
    rules.map((rule) => ({ ...rule, RecipeID: recipeId }))
  const allRules = [
    ...withRecipeId(untagged, 1),
    ...withRecipeId(onlyReworked, 2),
    ...withRecipeId(neverReworked, 3),
  ] as unknown as Parameters<typeof evaluateMatchesByRecipe>[0]

  // A reworked item: the untagged and if_reworked recipes apply; if_not_reworked must not.
  const reworkedItem = normalizeGearDbArtifact(bootsRow(2)).gearInspectorItem
  const reworked = evaluateMatchesByRecipe(allRules, reworkedItem)
  assert.deepEqual(
    [...reworked.matchingRecipeIndices].sort((a, b) => a - b),
    [0, 1],
    'reworked gear matches the untagged and if_reworked recipes only',
  )
  // The decision list feeds the same UI row, so it must agree with the index list.
  assert.deepEqual(
    reworked.matchingRecipeDecisions.map((d) => d.recipeIdx).sort((a, b) => a - b),
    [0, 1],
    'decisions agree with indices for reworked gear',
  )

  // A pristine item: the untagged and if_not_reworked recipes apply; if_reworked must not.
  const pristineItem = normalizeGearDbArtifact(bootsRow(0)).gearInspectorItem
  const pristine = evaluateMatchesByRecipe(allRules, pristineItem)
  assert.deepEqual(
    [...pristine.matchingRecipeIndices].sort((a, b) => a - b),
    [0, 2],
    'pristine gear matches the untagged and if_not_reworked recipes only',
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
// recipe appearing under "other matches" for reworked pieces. This walks the same
// build -> evaluate path with the legacy spelling to prove the constraint is restored.
test('a recipe using the pre-rename tag spelling still gates on rework state', async () => {
  await warmupWasmRuleEngine()

  // The exact tag list from the reported recipe, legacy spelling included.
  const legacyTags = ['ignore_by_safeguards', 'ignore_for_chaos_ored', 'ore5epic']
  const rules = buildHsfRules(keepAllRecipe(legacyTags), defaultSubstatTargets())
  assert.ok(rules.length > 0, 'the recipe emits rules at all')
  // Before the fix every rule came out with Ore undefined.
  assert.ok(
    rules.every((rule) => rule.Ore === ORE_NOT_ORED),
    'legacy-tagged rules carry the never-reworked gate',
  )

  // And the matcher honors it: reworked gear must NOT match, in first match or otherwise.
  assert.equal(matches(legacyTags, 0), true, 'pristine gear still matches')
  assert.equal(matches(legacyTags, 3), false, 'reworked gear no longer matches')
})
