/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRulesForConfig, RULE_SOURCE_HSFC } from '../src/lib/merge.js'
import { defaultSubstatTargets, type BuilderConfig } from '../src/lib/hsfBuilder.js'
import { buildHsfFileFromMerged } from '../src/lib/hsfIO.js'
import { StatVariant } from '../src/lib/types.js'
import { updateConfigRulesCache } from '../src/lib/ruleCache.js'

const baseConfig = (overrides: Partial<BuilderConfig> = {}): BuilderConfig => ({
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

test('builder rules carry ConfigID/ConfigName through HSF export', () => {
  const cfg = baseConfig()
  const substatTargets = defaultSubstatTargets()
  const rules = buildRulesForConfig({ config: cfg, metasets: [], substatTargets, cfgIdx: 0 })
  assert(rules.length > 0, 'expected at least one rule to verify annotations')
  for (const rule of rules) {
    assert.equal(rule.ConfigID, 1, 'ConfigID should be 1-based and stable per config index')
    assert.equal(rule.ConfigName, undefined, 'builder rules should not carry ConfigName until export')
  }
  const exported = buildHsfFileFromMerged(rules, { configNames: [cfg.name ?? ''] })
  assert(exported.Rules.length === rules.length, 'HSF payload should retain every rule')
  const first = exported.Rules[0]
  assert(first, 'expected exported Rules to contain at least one entry')
  assert.equal(first!.ConfigID, 1, 'HSF payload should keep ConfigID')
  assert.equal(first!.ConfigName, 'Metadata Demo', 'HSF payload should keep ConfigName')
  const orderedKeys = Object.keys(first!)
  assert.deepEqual(
    orderedKeys.slice(0, 4),
    ['ConfigID', 'ConfigName', 'Keep', 'IsRuleTypeAND'],
    'Config metadata should precede legacy flags for readability',
  )
})

test('config metadata omits empty names but still writes ConfigID', () => {
  const cfg = baseConfig({ name: '' })
  const rules = buildRulesForConfig({ config: cfg, metasets: [], substatTargets: defaultSubstatTargets(), cfgIdx: 3 })
  assert(rules.length > 0, 'expected at least one rule to verify ConfigID fallback')
  for (const rule of rules) {
    assert.equal(rule.ConfigID, 4, 'ConfigID should map cfgIdx (0-based) to 1-based IDs')
    assert.equal(rule.ConfigName, undefined, 'builder rules should never store ConfigName')
  }
  const exported = buildHsfFileFromMerged(rules, { configNames: [cfg.name ?? ''] })
  const first = exported.Rules[0]
  assert(first, 'expected exported rules to exist')
  assert.equal(first!.ConfigID, 4, 'HSF payload should preserve ConfigID even without a name')
  assert(!('ConfigName' in first!), 'HSF payload should omit ConfigName when no label is configured')
})

test('renaming configs updates ConfigName without rebuilding cached rules', () => {
  const substatTargets = defaultSubstatTargets()
  const initial = updateConfigRulesCache({
    configs: [baseConfig({ name: '  Cached Builder  ' })],
    metasets: [],
    substatTargets,
  })
  const renamed = updateConfigRulesCache({
    configs: [baseConfig({ name: '  Cached Builder (Renamed)' })],
    metasets: [],
    substatTargets,
    previousCache: initial.cache,
  })
  const firstRules = initial.rulesByConfig.get(0)
  const renamedRules = renamed.rulesByConfig.get(0)
  assert(firstRules && firstRules.length > 0, 'expected cached rules to exist')
  assert(renamedRules && renamedRules.length > 0, 'expected renamed config to keep its rules')
  assert.strictEqual(renamedRules, firstRules, 'rename-only edits should reuse the cached rule array')
  assert(renamedRules!.every((rule) => rule.ConfigName === undefined), 'rules should remain free of ConfigName metadata')
  const exported = buildHsfFileFromMerged(renamedRules!, { configNames: ['Cached Builder (Renamed)'] })
  const first = exported.Rules[0]
  assert(first, 'expected exported rules to exist after rename')
  assert.equal(first!.ConfigName, 'Cached Builder (Renamed)', 'exported HSF should carry the latest ConfigName')
})

test('HSF export strips every UI-only metadata field', () => {
  const cfg = baseConfig()
  const rules = buildRulesForConfig({ config: cfg, metasets: [], substatTargets: defaultSubstatTargets(), cfgIdx: 0 })
  // Decorate the rules with every UI-only field so the export clean up has something to remove.
  const decorated = rules.map((rule, idx) => ({
    ...rule,
    __lineIdx: idx,
    __allKnownSets: true,
    __source: RULE_SOURCE_HSFC,
    __rankMask: 0b1010,
    __rarityMask: 0b1001,
    __keepUniqueRuleId: `ku_${idx}`,
    __keepUniqueHash: `hash_${idx}`,
    __keepUniqueRequired: 2,
    __keepUniqueScanMs: 17,
    __keepUniqueProjected: 4,
    __keepUniqueDeficit: 1,
    __keepUniqueItemKey: idx,
  }))
  // Run the export helper so the sanitizer strips the fake diagnostics.
  const exported = buildHsfFileFromMerged(decorated, { configNames: [cfg.name ?? ''] })
  for (const rule of exported.Rules) {
    assert(rule, 'expected sanitized HSF rule to exist')
    // HSF schema never tolerates double-underscore metadata, so each key should be clean.
    const hasUiKey = Object.keys(rule!).some((key) => key.startsWith('__'))
    assert.equal(hasUiKey, false, 'HSF payload should exclude UI-only metadata keys')
  }
})
