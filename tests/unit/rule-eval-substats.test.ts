/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { evaluateMatchesByConfig, matchRule, type TestItem } from '../../src/lib/ruleEval.js'
import { RULE_SOURCE_FINAL_SELL } from '../../src/lib/ruleSources.js'
import { StatId, StatVariant, ArtifactSet, ArtifactType, type RankValue, type LevelMilestone } from '../../src/lib/types.js'
import type { HsfRule } from '../../src/lib/hsfTypes.js'
import type { HsfRuleWithCfg } from '../../src/lib/merge.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'

// Keep this test file isolated from merge.ts so the matcher suite does not pull
// unrelated builder modules when validating rule-eval behavior.
type RuleWithOptionalCfg = HsfRuleWithCfg

function buildBaseItem(): TestItem {
  return {
    slot: ArtifactType.Helmet,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    level: 0 as LevelMilestone,
  }
}

const baseRule: HsfRule = {
  Use: true,
  ArtifactType: [ArtifactType.Helmet],
  ArtifactSet: [ArtifactSet.Speed],
  Rank: 6,
  Rarity: 6,
  Substats: [
    { ID: StatId.SPD, Value: 18, IsFlat: true, Condition: '<=' },
  ],
}

test('<= thresholds fail when the stat is missing', async () => {
  // Sync matcher helpers require warmup in each isolated test file.
  await warmupWasmRuleEngine()
  const noStat = buildBaseItem()
  assert.equal(matchRule(baseRule, noStat), false, 'stat absence should fail <= bounds')
})

test('<= thresholds still obey the numeric ceiling when the stat exists', async () => {
  // Sync matcher helpers require warmup in each isolated test file.
  await warmupWasmRuleEngine()
  const okStat: TestItem = {
    ...buildBaseItem(),
    subValues: { [StatVariant.SPD]: 12 },
  }
  assert.equal(matchRule(baseRule, okStat), true, 'present stat under the ceiling should match')

  const tooHigh: TestItem = {
    ...buildBaseItem(),
    subValues: { [StatVariant.SPD]: 24 },
  }
  assert.equal(matchRule(baseRule, tooHigh), false, 'present stat above the ceiling should fail')
})

test('matching config indices preserve encounter order when primary match has no config', async () => {
  // Sync matcher helpers require warmup in each isolated test file.
  await warmupWasmRuleEngine()
  // Final-sell-style primary rule has no config id but still wins first-match.
  const finalSellPrimary: RuleWithOptionalCfg = {
    ...baseRule,
    Keep: false,
    Substats: [],
    __source: RULE_SOURCE_FINAL_SELL,
  }
  // ConfigID maps to zero-based cfgIdx (2 -> 1, 1 -> 0) in matcher payloads.
  const laterConfigOne: RuleWithOptionalCfg = { ...baseRule, Keep: true, Substats: [], ConfigID: 2 }
  const laterConfigTwo: RuleWithOptionalCfg = { ...baseRule, Keep: true, Substats: [], ConfigID: 1 }
  const result = evaluateMatchesByConfig(
    [finalSellPrimary, laterConfigOne, laterConfigTwo],
    buildBaseItem(),
    { configModes: ['active', 'active'] },
  )
  // Primary match still points at the first (config-less) final-sell rule.
  assert.equal(result.firstMatch?.ruleIndex, 0)
  // Config-less matches may serialize cfgIdx as undefined; normalize to null.
  assert.equal(result.firstMatch?.cfgIdx ?? null, null)
  // Config list must retain scan order so UI can remove only the real primary config.
  assert.deepEqual(result.matchingConfigIndices, [1, 0])
})

export {}
