/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHsfcPayload, parseHsfcObject } from '../../src/lib/hsfcIO.js'
import { parseHsfFile } from '../../src/lib/hsfIO.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'

const buildRecipe = (name: string): BuilderRecipe => ({
  name,
  keep: true,
  exportMode: 'active',
  rankCode: 0,
  rarityCode: 0,
  factionCode: 0,
  mainStatsV: [],
  minLevel: 0,
  maxLevel: 16,
  substatsV: [],
  fixedSubstatsV: [],
  minCount: 0,
  autoMinCount: true,
  autoSubstatFlex: false,
  minRequiredRolls: 0,
  autoMinRequiredRolls: true,
  lockedMinRequiredRolls: 0,
  artifactTypes: [],
  artifactSets: [],
  artifactMetaSets: [],
})

test('HSFC writer emits SelectedRecipeIndex and canonical note marker wording', () => {
  const payload = buildHsfcPayload({
    version: 'test-version',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [buildRecipe('IO Demo')],
    selectedRecipeIndex: 0,
    note: [
      '<!-- config-options',
      '  q "Legacy marker"',
      '-->',
      '<!-- keep-uniques-re: "Legacy safeguard marker" -->',
    ].join('\n'),
  }) as Record<string, unknown>

  // New exports should emit recipe wording for selection metadata.
  assert.equal(payload['SelectedRecipeIndex'], 0)
  assert.equal('SelectedConfigIndex' in payload, false)
  // New exports should canonicalize legacy recipe/safeguard note markers.
  const note = String(payload['Note'] ?? '')
  assert.match(note, /<!--\s*recipe-overrides\b/i)
  assert.equal(/<!--\s*config-options\b/i.test(note), false)
  assert.match(note, /<!--\s*safeguards-re\b/i)
  assert.equal(/<!--\s*keep-uniques-re\b/i.test(note), false)
})

test('HSFC parser reads legacy SelectedConfigIndex/KeepUniques keys and canonicalizes note markers', () => {
  const parsed = parseHsfcObject(
    {
      Version: 'legacy-demo',
      Recipes: [buildHsfcPayload({
        version: 'inner',
        metasets: [],
        substatTargets: defaultSubstatTargets(),
        recipes: [buildRecipe('Legacy Recipe')],
        selectedRecipeIndex: 0,
      }).Recipes[0]],
      KeepUniques: [],
      KeepUniquesEnabled: true,
      SelectedConfigIndex: 0,
      Note: [
        '<!-- config-options q "Legacy question" -->',
        '<!-- keep-uniques-re: "Legacy safeguard marker" -->',
      ].join('\n'),
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )

  // Legacy keys remain accepted on read.
  assert.equal(parsed.selectedIndex, 0)
  assert.equal(parsed.safeguardsEnabled, true)
  assert.equal(Array.isArray(parsed.safeguardRules), true)
  assert.equal(parsed.safeguardRules.length, 0)
  // Boundary normalization should rewrite legacy recipe/safeguard markers once.
  assert.equal(parsed.note?.includes('recipe-overrides'), true)
  assert.equal(parsed.note?.includes('config-options'), false)
  assert.equal(parsed.note?.includes('safeguards-re'), true)
  assert.equal(parsed.note?.includes('keep-uniques-re'), false)
})

test('HSF parser resolves legacy ConfigID/ConfigName keys to recipe metadata at IO boundary', () => {
  const parsed = parseHsfFile(JSON.stringify({
    Rules: [{ Keep: true, IsRuleTypeAND: true, ConfigID: 7, ConfigName: 'Legacy Name' }],
  }))
  const first = parsed.Rules[0] as unknown as Record<string, unknown>
  assert(first, 'expected parsed HSF rule')
  // Legacy metadata should be promoted to canonical recipe keys.
  assert.equal(first['RecipeID'], 7)
  assert.equal(first['RecipeName'], 'Legacy Name')
  // Legacy fields should not leak past the parser boundary.
  assert.equal('ConfigID' in first, false)
  assert.equal('ConfigName' in first, false)
})

test('HSFC parser preserves safeguard substatWeights from legacy KeepUniques payloads', () => {
  const parsed = parseHsfcObject(
    {
      Version: 'legacy-keep-weights',
      Recipes: [buildRecipe('Legacy Keep Weights')],
      KeepUniques: [{
        id: 'legacy-keep',
        name: 'Reserve SPD/ACC',
        requiredCount: 1,
        activation: 'protectExisting',
        tuple: {
          slots: ['Gloves'],
          sets: [],
          metaSetIds: [],
          ranks: ['6★'],
          rarities: ['Epic', 'Legendary', 'Mythical'],
          mainStats: ['CR%'],
          factions: [],
        },
        substats: ['SPD', 'ACC'],
        substatWeights: {
          SPD: 1.5,
          ACC: 0.9,
        },
      }],
      KeepUniquesEnabled: true,
      SelectedConfigIndex: 0,
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )

  const importedRule = parsed.safeguardRules[0] as unknown as { substatWeights?: Record<string, number> } | undefined
  assert(importedRule, 'expected imported safeguard rule')
  // Import should expose plain records, not map-like values, so downstream exports keep weights.
  const importedWeights = Object.values(importedRule.substatWeights ?? {}).sort((a, b) => a - b)
  assert.deepEqual(importedWeights, [0.9, 1.5])

  const payload = buildHsfcPayload({
    version: 'roundtrip',
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
    selectedRecipeIndex: parsed.selectedIndex,
    safeguardRules: parsed.safeguardRules,
    safeguardsEnabled: parsed.safeguardsEnabled,
  }) as Record<string, unknown>
  const exportedRule = ((payload['Safeguards'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(exportedRule, 'expected exported safeguard rule')
  const exportedWeights = (exportedRule['substatWeights'] ?? null) as Record<string, number> | null
  assert(exportedWeights, 'expected exported substatWeights')
  assert.equal(exportedWeights['SPD'], 1.5)
  assert.equal(exportedWeights['ACC'], 0.9)
})

test('HSFC parser canonicalizes legacy safeguard-ignore recipe tags on roundtrip', () => {
  const parsed = parseHsfcObject(
    {
      Version: 'legacy-ignore-tag',
      Recipes: [
        {
          ...buildRecipe('Legacy Ignore Tag'),
          Tags: ['ignore_keep_unique', 'speed'],
        },
      ],
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )
  // Read path should accept legacy ignore tag aliases.
  assert.deepEqual(parsed.recipes[0]?.tags, ['ignore_by_safeguards', 'speed'])

  const payload = buildHsfcPayload({
    version: 'roundtrip-ignore-tag',
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
    selectedRecipeIndex: parsed.selectedIndex,
  }) as Record<string, unknown>
  const recipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(recipe, 'expected exported recipe')
  // Write path should emit only canonical safeguard-ignore tags.
  assert.deepEqual(recipe['Tags'], ['ignore_by_safeguards', 'speed'])
})

test('HSFC writer canonicalizes legacy safeguard-ignore aliases from runtime recipe state', () => {
  const legacyTaggedRecipe = {
    ...buildRecipe('Legacy Writer Alias'),
    tags: ['ignore_keep_unique', 'speed'],
  }
  const payload = buildHsfcPayload({
    version: 'writer-legacy-ignore-tag',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [legacyTaggedRecipe],
    selectedRecipeIndex: 0,
  }) as Record<string, unknown>
  const recipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(recipe, 'expected exported recipe')
  // Write boundary should emit canonical wording even for legacy runtime aliases.
  assert.deepEqual(recipe['Tags'], ['ignore_by_safeguards', 'speed'])
})
