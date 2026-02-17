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

test('HSFC writer emits SelectedRecipeIndex and canonical recipe-overrides marker wording', () => {
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
    ].join('\n'),
  }) as Record<string, unknown>

  // New exports should emit recipe wording for selection metadata.
  assert.equal(payload['SelectedRecipeIndex'], 0)
  assert.equal('SelectedConfigIndex' in payload, false)
  // New exports should canonicalize legacy note markers.
  const note = String(payload['Note'] ?? '')
  assert.match(note, /<!--\s*recipe-overrides\b/i)
  assert.equal(/<!--\s*config-options\b/i.test(note), false)
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
      Note: '<!-- config-options q "Legacy question" -->',
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )

  // Legacy keys remain accepted on read.
  assert.equal(parsed.selectedIndex, 0)
  assert.equal(parsed.safeguardsEnabled, true)
  assert.equal(Array.isArray(parsed.safeguardRules), true)
  assert.equal(parsed.safeguardRules.length, 0)
  // Boundary normalization should rewrite the note marker once.
  assert.equal(parsed.note?.includes('recipe-overrides'), true)
  assert.equal(parsed.note?.includes('config-options'), false)
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
