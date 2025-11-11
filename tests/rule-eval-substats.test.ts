/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { matchRule, type TestItem } from '../src/lib/ruleEval.js'
import { StatId, StatVariant, ArtifactSet, ArtifactType, type RankValue, type LevelMilestone } from '../src/lib/types.js'
import type { HsfRule } from '../src/lib/hsfTypes.js'

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

test('<= thresholds fail when the stat is missing', () => {
  const noStat = buildBaseItem()
  assert.equal(matchRule(baseRule, noStat), false, 'stat absence should fail <= bounds')
})

test('<= thresholds still obey the numeric ceiling when the stat exists', () => {
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

export {}
