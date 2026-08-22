/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSfcPayload, parseSfcObject } from '../../src/lib/sfcIO.js'
import { parseHsfFile } from '../../src/lib/hsfIO.js'
import { defaultSubstatTargets, type BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import { StatVariant } from '../../src/lib/types.js'
import {
  REWORK_GATE_NOT_REWORKED,
  REWORK_GATE_REWORKED,
  SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS,
  SFC_RECIPE_FIELD_REWORK_GATE,
} from '../../src/lib/generated/domainConstants.js'

const buildRecipe = (name: string): BuilderRecipe => ({
  ...(name ? { appearance: { name } } : {}),
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

test('SFC writer does not emit SelectedRecipeIndex and canonicalizes note marker wording', () => {
  const payload = buildSfcPayload({
    version: 'test-version',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [buildRecipe('IO Demo')],
    note: [
      '<!-- config-options',
      '  q "Legacy marker"',
      '-->',
      '<!-- keep-uniques-re: "Legacy safeguard marker" -->',
    ].join('\n'),
  }) as Record<string, unknown>

  // Selection is no longer persisted in the SFC format.
  assert.equal('SelectedRecipeIndex' in payload, false)
  assert.equal('SelectedConfigIndex' in payload, false)
  // New exports should canonicalize legacy recipe/safeguard note markers.
  const note = String(payload['Note'] ?? '')
  assert.match(note, /<!--\s*recipe-overrides\b/i)
  assert.equal(/<!--\s*config-options\b/i.test(note), false)
  assert.match(note, /<!--\s*safeguards-re\b/i)
  assert.equal(/<!--\s*keep-uniques-re\b/i.test(note), false)
})

test('SFC parser ignores SelectedConfigIndex (always selects first recipe) and canonicalizes note markers', () => {
  const parsed = parseSfcObject(
    {
      Version: 'legacy-demo',
      Recipes: [buildSfcPayload({
        version: 'inner',
        metasets: [],
        substatTargets: defaultSubstatTargets(),
        recipes: [buildRecipe('Legacy Recipe')],
      }).Recipes[0]],
      KeepUniques: [],
      KeepUniquesEnabled: true,
      SelectedConfigIndex: 99,
      Note: [
        '<!-- config-options q "Legacy question" -->',
        '<!-- keep-uniques-re: "Legacy safeguard marker" -->',
      ].join('\n'),
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )

  // Parser always returns first recipe regardless of stored index.
  assert.equal(parsed.selectedIndex, 0)
  assert.equal(parsed.safeguardsEnabled, true)
  assert.equal(Array.isArray(parsed.safeguardRules), true)
  assert.equal(parsed.safeguardRules!.length, 0)
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

test('SFC parser preserves safeguard substatWeights from legacy KeepUniques payloads', () => {
  const parsed = parseSfcObject(
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

  const importedRule = parsed.safeguardRules![0] as unknown as { substatWeights?: Record<string, number> } | undefined
  assert(importedRule, 'expected imported safeguard rule')
  // Import should expose plain records, not map-like values, so downstream exports keep weights.
  const importedWeights = Object.values(importedRule.substatWeights ?? {}).sort((a, b) => a - b)
  assert.deepEqual(importedWeights, [0.9, 1.5])

  const payload = buildSfcPayload({
    version: 'roundtrip',
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
    safeguardRules: parsed.safeguardRules!,
    safeguardsEnabled: parsed.safeguardsEnabled!,
  }) as Record<string, unknown>
  const exportedRule = ((payload['Safeguards'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(exportedRule, 'expected exported safeguard rule')
  const exportedWeights = (exportedRule['substatWeights'] ?? null) as Record<string, number> | null
  assert(exportedWeights, 'expected exported substatWeights')
  assert.equal(exportedWeights['SPD'], 1.5)
  assert.equal(exportedWeights['ACC'], 0.9)
})

test('SFC writes mainStatRankWeightFactor only when Weight by Rank is on', () => {
  // Parse a minimal safeguard so we get a valid SafeguardRule to mutate + re-export.
  const parseWith = (weightMainStatByRank: boolean, factor: number) => {
    const parsed = parseSfcObject(
      {
        Version: 'factor-gating',
        Recipes: [buildRecipe('Factor Gating')],
        Safeguards: [{
          id: 'factor-rule',
          requiredCount: 1,
          activation: 'protectExisting',
          tuple: { slots: ['Chestplate'], sets: [], metaSetIds: [], ranks: ['6★'], rarities: ['Legendary'], mainStats: ['ATK%'], factions: [] },
          substats: ['CR%'],
        }],
        SafeguardsEnabled: true,
        SelectedConfigIndex: 0,
      },
      { metasets: [], substatTargets: defaultSubstatTargets() },
    )
    // Set the toggle + factor on the parsed rule, then export and read the entry back.
    const rule = { ...parsed.safeguardRules![0]!, weightMainStatByRank, mainStatRankWeightFactor: factor }
    const payload = buildSfcPayload({
      version: 'factor-gating',
      metasets: parsed.metasets,
      substatTargets: parsed.substatTargets,
      recipes: parsed.recipes,
      safeguardRules: [rule],
      safeguardsEnabled: true,
    }) as Record<string, unknown>
    return ((payload['Safeguards'] as unknown[])?.[0] ?? {}) as Record<string, unknown>
  }

  // Toggle OFF: the factor is inert, so it must never be persisted (even a non-default value).
  assert.equal('mainStatRankWeightFactor' in parseWith(false, 2.5), false, 'off toggle must not write the factor')
  // Toggle ON + non-default: written verbatim.
  const onEntry = parseWith(true, 2.5)
  assert.equal(onEntry['mainStatRankWeightFactor'], 2.5, 'on toggle + non-default must write the factor')
  // Toggle ON + default (1.0): omitted so untouched files stay byte-identical.
  assert.equal('mainStatRankWeightFactor' in parseWith(true, 1.0), false, 'on toggle + default must not write the factor')
})

test('SFC round-trips every safeguard activation mode (incl. anticipateImprovements)', () => {
  for (const activation of ['off', 'protectExisting', 'anticipateGaps', 'anticipateImprovements']) {
    const parsed = parseSfcObject(
      {
        Version: 'activation-roundtrip',
        Recipes: [buildRecipe('Activation Roundtrip')],
        Safeguards: [{
          id: `act-${activation}`,
          requiredCount: 2,
          activation,
          tuple: { slots: ['Ring'], sets: [], metaSetIds: [], ranks: ['6★'], rarities: ['Legendary'], mainStats: [], factions: [] },
        }],
        SafeguardsEnabled: true,
      },
      { metasets: [], substatTargets: defaultSubstatTargets() },
    )
    const rule = parsed.safeguardRules![0]!
    // The loader must keep the mode verbatim — an unknown-value fallback to
    // protectExisting here would silently downgrade the rule.
    assert.equal(rule.activation, activation, `parse should keep activation=${activation}`)
    const payload = buildSfcPayload({
      version: 'activation-roundtrip',
      metasets: parsed.metasets,
      substatTargets: parsed.substatTargets,
      recipes: parsed.recipes,
      safeguardRules: parsed.safeguardRules!,
      safeguardsEnabled: parsed.safeguardsEnabled!,
    }) as Record<string, unknown>
    const exported = ((payload['Safeguards'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
    assert.equal(exported?.['activation'], activation, `export should keep activation=${activation}`)
  }
})

test('SFC parser lifts legacy behaviour tags onto the recipe flags', () => {
  const parsed = parseSfcObject(
    {
      Version: 'legacy-ignore-tag',
      Recipes: [
        {
          ...buildRecipe('Legacy Ignore Tag'),
          Tags: ['ignore_keep_unique', 'if_not_reworked', 'speed'],
        },
      ],
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )
  // The behaviour tags become fields; only the user's own label survives as a tag.
  assert.deepEqual(parsed.recipes[0]?.tags, ['speed'])
  assert.equal(parsed.recipes[0]?.ignoredBySafeguards, true)
  assert.equal(parsed.recipes[0]?.reworkGate, REWORK_GATE_NOT_REWORKED)

  const payload = buildSfcPayload({
    version: 'roundtrip-ignore-tag',
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
  }) as Record<string, unknown>
  const recipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(recipe, 'expected exported recipe')
  // The write path emits the flags and never re-emits the legacy tags.
  assert.deepEqual(recipe['Tags'], ['speed'])
  assert.equal(recipe[SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS], true)
  assert.equal(recipe[SFC_RECIPE_FIELD_REWORK_GATE], REWORK_GATE_NOT_REWORKED)
})

test('SFC omits the recipe flags entirely when they are not set', () => {
  // Omission is the backward-compatibility guarantee: a recipe that uses neither flag
  // must serialize exactly as it did before the flags existed.
  const payload = buildSfcPayload({
    version: 'no-flags',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [{ ...buildRecipe('Plain'), tags: ['speed'] }],
  }) as Record<string, unknown>
  const recipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(recipe, 'expected exported recipe')
  assert.equal(SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS in recipe, false, 'no ignore key')
  assert.equal(SFC_RECIPE_FIELD_REWORK_GATE in recipe, false, 'no gate key')
})

test('an explicit recipe flag key wins over a stale legacy tag in the same file', () => {
  // A current build writes the flag; a hand-merged file could still carry the old tag.
  // The explicit key is authoritative so the newer intent is not overridden.
  const parsed = parseSfcObject(
    {
      Version: 'mixed',
      Recipes: [
        {
          ...buildRecipe('Mixed'),
          Tags: ['if_not_reworked'],
          [SFC_RECIPE_FIELD_REWORK_GATE]: REWORK_GATE_REWORKED,
        },
      ],
    },
    { metasets: [], substatTargets: defaultSubstatTargets() },
  )
  assert.equal(parsed.recipes[0]?.reworkGate, REWORK_GATE_REWORKED)
  // The legacy tag is still stripped from the label list either way. An empty tag list is
  // dropped entirely by the loader, so the recipe carries no `tags` key at all.
  assert.equal(parsed.recipes[0]?.tags, undefined)
})

test('SFC round-trip preserves not:true rollBounds for substat', () => {
  // User-provided SFC shape that uses the ¬ (not-present) condition.
  const sfc = {
    Version: '1.0.7-dev',
    Metasets: [],
    Recipes: [{
      name: '',
      keep: false,
      SellfileVisibility: 'Active',
      Rank: 'Any',
      Rarity: 'Auto',
      mainStats: [],
      substats: [{ stat: 'SPD', rollBounds: { not: true } }],
      minCount: 1,
      autoMinCount: true,
      minRequiredRolls: 0,
      autoMinRequiredRolls: true,
      lockedMinRequiredRolls: 0,
      artifactTypeNames: [],
      artifactSetNames: [],
      artifactMetaSetNames: [],
    }],
  }
  const { recipes } = parseSfcObject(sfc, { metasets: [], substatTargets: defaultSubstatTargets() })
  assert(recipes.length === 1, 'expected one recipe')
  const r = recipes[0]!
  assert(r.substatsV?.length === 1, 'SPD should be in substatsV')
  const spdVariant = r.substatsV![0]!
  const bounds = r.substatRollBoundsV?.[spdVariant]
  assert.deepEqual(bounds, { not: true }, `expected not:true bound for SPD, got: ${JSON.stringify(bounds)}`)
})

test('SFC writer emits not:true rollBounds and reader restores it', () => {
  const recipe: BuilderRecipe = {
    ...buildRecipe('not-substat-round-trip'),
    keep: false,
    substatsV: [StatVariant.SPD],
    fixedSubstatsV: [],
    substatRollBoundsV: { [StatVariant.SPD]: { not: true } },
  }
  const payload = buildSfcPayload({
    version: '1.0.7-dev',
    metasets: [],
    substatTargets: defaultSubstatTargets(),
    recipes: [recipe],
  }) as Record<string, unknown>
  const rawRecipe = ((payload['Recipes'] as unknown[])?.[0] ?? null) as Record<string, unknown> | null
  assert(rawRecipe, 'expected exported recipe')
  const subs = rawRecipe['substats'] as unknown[]
  assert(Array.isArray(subs) && subs.length === 1, 'expected one substat entry')
  const sub = subs[0] as Record<string, unknown>
  assert.deepEqual(sub['rollBounds'], { not: true }, 'writer should emit not:true rollBounds')
  // Round-trip: parse the emitted payload back.
  const { recipes: parsed } = parseSfcObject(payload, { metasets: [], substatTargets: defaultSubstatTargets() })
  const parsedBounds = parsed[0]?.substatRollBoundsV?.[StatVariant.SPD]
  assert.deepEqual(parsedBounds, { not: true }, 'parsed recipe should have not:true for SPD')
})
