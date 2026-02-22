/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSafeguardRules, buildRulesForRecipe, RULE_SOURCE_SFR } from '../../src/lib/merge.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { buildHsfFileFromMerged } from '../../src/lib/hsfIO.js'
import { ArtifactSet, ArtifactType, Faction, StatVariant } from '../../src/lib/types.js'
import { updateRecipeRulesCache } from '../../src/lib/ruleCache.js'
import { SAFEGUARD_RECIPE_ID_BASE } from '../../src/lib/constants.js'
import {
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  type SafeguardRule,
  type SafeguardDetectionSnapshot,
} from '../../src/lib/safeguards.js'

const baseRecipe = (overrides: Partial<BuilderRecipe> = {}): BuilderRecipe => ({
  name: '  Metadata Demo  ',
  keep: true,
  exportMode: 'active',
  minLevel: 0,
  maxLevel: 16,
  rankCode: 0,
  rarityCode: 0,
  rarityMode: 'auto',
  substatsV: [StatVariant.SPD],
  fixedSubstatsV: [StatVariant.SPD],
  minCount: 1,
  autoMinCount: false,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: false,
  ...overrides,
})

test('builder rules carry RecipeID/RecipeName through HSF export', () => {
  const recipe = baseRecipe()
  const substatTargets = defaultSubstatTargets()
  const rules = buildRulesForRecipe({ recipe, metasets: [], substatTargets, recipeIdx: 0 })
  assert(rules.length > 0, 'expected at least one rule to verify annotations')
  for (const rule of rules) {
    assert.equal(rule.RecipeID, 1, 'RecipeID should be 1-based and stable per recipe index')
    assert.equal(rule.RecipeName, undefined, 'builder rules should not carry RecipeName until export')
  }
  const exported = buildHsfFileFromMerged(rules, { recipeNames: [recipe.name ?? ''] })
  assert(exported.Rules.length === rules.length, 'HSF payload should retain every rule')
  const first = exported.Rules[0]
  assert(first, 'expected exported Rules to contain at least one entry')
  assert.equal(first!.RecipeID, 1, 'HSF payload should keep RecipeID')
  assert.equal(first!.RecipeName, 'Metadata Demo', 'HSF payload should keep RecipeName')
  const orderedKeys = Object.keys(first!)
  assert.deepEqual(
    orderedKeys.slice(0, 4),
    ['RecipeID', 'RecipeName', 'Keep', 'IsRuleTypeAND'],
    'Recipe metadata should precede legacy flags for readability',
  )
})

test('recipe metadata omits empty names but still writes RecipeID', () => {
  const recipe = baseRecipe({ name: '' })
  const rules = buildRulesForRecipe({ recipe, metasets: [], substatTargets: defaultSubstatTargets(), recipeIdx: 3 })
  assert(rules.length > 0, 'expected at least one rule to verify RecipeID fallback')
  for (const rule of rules) {
    assert.equal(rule.RecipeID, 4, 'RecipeID should map recipeIdx (0-based) to 1-based IDs')
    assert.equal(rule.RecipeName, undefined, 'builder rules should never store RecipeName')
  }
  const exported = buildHsfFileFromMerged(rules, { recipeNames: [recipe.name ?? ''] })
  const first = exported.Rules[0]
  assert(first, 'expected exported rules to exist')
  assert.equal(first!.RecipeID, 4, 'HSF payload should preserve RecipeID even without a name')
  assert(!('RecipeName' in first!), 'HSF payload should omit RecipeName when no label is configured')
})

test('renaming recipes updates RecipeName without mutating generated rule content', () => {
  const substatTargets = defaultSubstatTargets()
  const initial = updateRecipeRulesCache({
    recipes: [baseRecipe({ name: '  Cached Builder  ' })],
    metasets: [],
    substatTargets,
  })
  const renamed = updateRecipeRulesCache({
    recipes: [baseRecipe({ name: '  Cached Builder (Renamed)' })],
    metasets: [],
    substatTargets,
  })
  const firstRules = initial.rulesByRecipe.get(0)
  const renamedRules = renamed.rulesByRecipe.get(0)
  assert(firstRules && firstRules.length > 0, 'expected cached rules to exist')
  assert(renamedRules && renamedRules.length > 0, 'expected renamed recipe to keep its rules')
  assert.deepEqual(
    renamedRules,
    firstRules,
    'rename-only edits should preserve generated rule payload content',
  )
  assert(renamedRules!.every((rule) => rule.RecipeName === undefined), 'rules should remain free of RecipeName metadata')
  const exported = buildHsfFileFromMerged(renamedRules!, { recipeNames: ['Cached Builder (Renamed)'] })
  const first = exported.Rules[0]
  assert(first, 'expected exported rules to exist after rename')
  assert.equal(first!.RecipeName, 'Cached Builder (Renamed)', 'exported HSF should carry the latest RecipeName')
})

test('HSF export strips every UI-only metadata field', () => {
  const recipe = baseRecipe()
  const rules = buildRulesForRecipe({ recipe, metasets: [], substatTargets: defaultSubstatTargets(), recipeIdx: 0 })
  // Decorate the rules with every UI-only field so the export clean up has something to remove.
  const decorated = rules.map((rule, idx) => ({
    ...rule,
    __lineIdx: idx,
    __allKnownSets: true,
    __source: RULE_SOURCE_SFR,
    __rankMask: 0b1010,
    __rarityMask: 0b1001,
    __safeguardRuleId: `ku_${idx}`,
    __safeguardHash: `hash_${idx}`,
    __safeguardRequired: 2,
    __safeguardScanMs: 17,
    __safeguardProjected: 4,
    __safeguardDeficit: 1,
    __safeguardItemKey: idx,
  }))
  // Run the export helper so the sanitizer strips the fake diagnostics.
  const exported = buildHsfFileFromMerged(decorated, { recipeNames: [recipe.name ?? ''] })
  for (const rule of exported.Rules) {
    assert(rule, 'expected sanitized HSF rule to exist')
    // HSF schema never tolerates double-underscore metadata, so each key should be clean.
    const hasUiKey = Object.keys(rule!).some((key) => key.startsWith('__'))
    assert.equal(hasUiKey, false, 'HSF payload should exclude UI-only metadata keys')
  }
})

test('safeguard exports include sentinel RecipeID/RecipeName', () => {
  const keepRule: SafeguardRule = {
    id: 'ku_demo',
    name: '  Safeguard Demo  ',
    combination: {
      slots: [ArtifactType.Ring],
      // Safeguard sets now use entry objects to allow exclusions.
      sets: [{ id: ArtifactSet.Refresh }],
      metaSetIds: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [Faction.BannerLords],
    },
    requiredCount: 1,
    activation: SafeguardRuleActivation.ProtectExisting,
    countMode: {
      perRule: false,
      perSet: true,
      perFaction: true,
      perMainStat: false,
      perSlot: true,
    },
    // Default toggles preserve baseline independent safeguard behavior.
    ignorePreviousSafeguards: true,
    ignoreEquippedInCollection: false,
    ignoreEquippedInVault: false,
    // Keep the sample rule unfiltered by substats to mirror classic behavior.
    substats: [],
    substatMatch: SafeguardSubstatMatch.Any,
    substatWeights: {},
  }
  const detection: SafeguardDetectionSnapshot = {
    scannedAt: 1,
    entries: [{
      hash: 'demo',
      combination: keepRule.combination,
      ruleId: keepRule.id,
      ruleActivation: SafeguardRuleActivation.ProtectExisting,
      countMode: keepRule.countMode,
      perGroupRequiredCount: 1,
      groupsTracked: 1,
      requiredCount: 1,
      currentCount: 0,
      projectedCount: 1,
      deficit: 1,
      coveredByExisting: false,
      itemKeys: [777],
      artifacts: [{
        itemKey: 777,
        slot: ArtifactType.Ring,
        set: ArtifactSet.Refresh,
        rank: 6,
        rarity: 6,
        level: 0,
        exactLevel: 0,
        faction: Faction.BannerLords,
        mainStat: StatVariant.HP,
        substats: [{
          variant: StatVariant.DEF,
          isFlat: false,
          value: 12,
        }],
      }],
      placeholders: [],
    }],
  }
  const keepRules = buildSafeguardRules([keepRule], detection)
  assert(keepRules.length > 0, 'expected safeguard rules to be emitted')
  const first = keepRules[0]
  assert(first, 'expected first safeguard rule to exist')
  assert(first.RecipeID !== undefined, 'safeguard rule should include RecipeID')
  assert(first.RecipeID! <= SAFEGUARD_RECIPE_ID_BASE, 'safeguard RecipeID should use sentinel range')
  assert.equal(first.RecipeName, 'Safeguard Demo', 'safeguard RecipeName should be trimmed and preserved')
  assert(keepRules.every((rule) => rule.RecipeID === first.RecipeID), 'all rows from the same safeguard rule should share the sentinel RecipeID')
  const exported = buildHsfFileFromMerged(keepRules)
  const exportedFirst = exported.Rules[0]
  assert(exportedFirst, 'expected exported safeguard rule to exist')
  assert.equal(exportedFirst!.RecipeID, first.RecipeID, 'HSF export should retain sentinel RecipeID')
  assert.equal(exportedFirst!.RecipeName, first.RecipeName, 'HSF export should retain safeguard RecipeName')
})
