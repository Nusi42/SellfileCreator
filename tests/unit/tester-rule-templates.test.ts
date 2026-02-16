/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  ArtifactSet,
  ArtifactType,
  Faction,
  StatId,
  StatVariant,
  type LevelMilestone,
  type RankValue,
} from '../../src/lib/types.js'
import { buildTesterRuleTemplateRecipe } from '../../src/lib/testerRuleTemplates.js'
import type {
  NormalizedGearArtifact,
  NormalizedStat,
} from '../../src/lib/importers/gearDbNormalizer.js'
import type { TestItem } from '../../src/lib/ruleEval.js'

const buildSubstat = (params: {
  variant: StatVariant
  statId: StatId
  rolls: number
  isFlat: boolean
  position: number
}): NormalizedStat => ({
  source: 'substat',
  statId: params.statId,
  isFlat: params.isFlat,
  variant: params.variant,
  baseValue: 0,
  glyphValue: 0,
  mythValue: 0,
  totalValue: 0,
  rolls: params.rolls,
  position: params.position,
})

const buildArtifact = (params: {
  slot: ArtifactType
  substats: NormalizedStat[]
}): NormalizedGearArtifact => {
  const testerItem: TestItem = {
    slot: params.slot,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 5 as RankValue,
    level: 12 as LevelMilestone,
    faction: Faction.BannerLords,
  }
  return {
    id: 1,
    slot: params.slot,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 5 as RankValue,
    level: 12 as LevelMilestone,
    exactLevel: 12,
    faction: Faction.BannerLords,
    mainStat: null,
    substats: params.substats,
    ascension: null,
    testerItem,
    rerollCount: 0,
    equippedToChampionId: null,
    equippedChampionBaseId: null,
    equippedChampionRarity: null,
    source: 'tester',
    equippedChampionName: null,
    equippedChampionLocation: null,
    lastUseLocalTimestamp: null,
  }
}

test('keep templates ignore flat top substats for non-amulets', () => {
  const artifact = buildArtifact({
    slot: ArtifactType.Ring,
    substats: [
      // Flat HP has the highest roll count but should not drive Keep primary picks for non-amulets.
      buildSubstat({ variant: StatVariant.HP_FLAT, statId: StatId.HP, isFlat: true, rolls: 5, position: 1 }),
      buildSubstat({ variant: StatVariant.SPD, statId: StatId.SPD, isFlat: false, rolls: 3, position: 2 }),
      buildSubstat({ variant: StatVariant.CR, statId: StatId.CR, isFlat: false, rolls: 2, position: 3 }),
    ],
  })
  const config = buildTesterRuleTemplateRecipe({ artifact, intent: 'keep' })
  assert.equal(config.keep, true)
  // Mid-level templates should keep the top two non-flat entries.
  assert.deepStrictEqual(config.fixedSubstatsV, [StatVariant.SPD, StatVariant.CR])
  // The full substat list still includes flat lines for context.
  assert.deepStrictEqual(config.substatsV, [StatVariant.HP_FLAT, StatVariant.SPD, StatVariant.CR])
  if (!config.substatRollBoundsV) {
    assert.fail('expected Keep templates to include substat roll bounds')
  }
  const nonAmuletBounds = config.substatRollBoundsV
  // Roll floors follow capped Keep bounds for the selected non-flat stats.
  assert.deepStrictEqual(nonAmuletBounds[StatVariant.SPD], { min: 2 })
  assert.deepStrictEqual(nonAmuletBounds[StatVariant.CR], { min: 2 })
  assert.equal(nonAmuletBounds[StatVariant.HP_FLAT], undefined)
})

test('keep templates still consider flat top substats for amulets', () => {
  const artifact = buildArtifact({
    slot: ArtifactType.Amulet,
    substats: [
      // Amulets keep the legacy behavior where flat lines can drive primary Keep picks.
      buildSubstat({ variant: StatVariant.HP_FLAT, statId: StatId.HP, isFlat: true, rolls: 5, position: 1 }),
      buildSubstat({ variant: StatVariant.SPD, statId: StatId.SPD, isFlat: false, rolls: 3, position: 2 }),
      buildSubstat({ variant: StatVariant.CR, statId: StatId.CR, isFlat: false, rolls: 2, position: 3 }),
    ],
  })
  const config = buildTesterRuleTemplateRecipe({ artifact, intent: 'keep' })
  assert.equal(config.keep, true)
  // Mid-level templates should include the top two entries, including flat HP on amulets.
  assert.deepStrictEqual(config.fixedSubstatsV, [StatVariant.HP_FLAT, StatVariant.SPD])
  if (!config.substatRollBoundsV) {
    assert.fail('expected Keep templates to include substat roll bounds')
  }
  const amuletBounds = config.substatRollBoundsV
  assert.deepStrictEqual(amuletBounds[StatVariant.HP_FLAT], { min: 2 })
  assert.deepStrictEqual(amuletBounds[StatVariant.SPD], { min: 2 })
})

export {}
