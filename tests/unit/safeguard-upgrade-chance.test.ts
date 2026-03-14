/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSafeguardUpgradeChanceByArtifactId } from '../../src/lib/safeguardUpgradeChance.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { ArtifactSet, ArtifactType, StatId, StatVariant, type LevelMilestone, type RankValue } from '../../src/lib/types.js'

const makeMainStat = (variant: StatVariant): NormalizedStat => ({
  source: 'main',
  statId: StatId.ATK,
  isFlat: variant === StatVariant.ATK_FLAT,
  variant,
  baseValue: 0,
  glyphValue: 0,
  mythValue: 0,
  totalValue: 0,
})

const makeSubstat = (
  variant: StatVariant,
  totalValue: number,
  rolls = 0,
): NormalizedStat => {
  const statId = (() => {
    if (variant === StatVariant.SPD) return StatId.SPD
    if (variant === StatVariant.HP || variant === StatVariant.HP_FLAT) return StatId.HP
    if (variant === StatVariant.ACC) return StatId.ACC
    return StatId.ATK
  })()
  return {
    source: 'substat',
    statId,
    isFlat: variant === StatVariant.HP_FLAT || variant === StatVariant.ATK_FLAT || variant === StatVariant.DEF_FLAT,
    variant,
    baseValue: totalValue,
    glyphValue: 0,
    mythValue: 0,
    totalValue,
    rolls,
  }
}

const makeArtifact = (params: {
  id: number
  level: number
  exactLevel?: number | null
  rank?: number
  rarity?: number
  main?: StatVariant
  substats: NormalizedStat[]
}): NormalizedGearArtifact => {
  const rank = (params.rank ?? 6) as RankValue
  const rarity = (params.rarity ?? 5) as RankValue
  const level = (params.level ?? 0) as LevelMilestone
  const main = params.main ?? StatVariant.ATK
  return {
    id: params.id,
    slot: ArtifactType.Weapon,
    set: ArtifactSet.Speed,
    rank,
    rarity,
    level,
    exactLevel: params.exactLevel ?? params.level,
    faction: 0,
    mainStat: makeMainStat(main),
    substats: params.substats,
    ascension: null,
    gearInspectorItem: {
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      rank,
      rarity,
      level,
      faction: 0,
      main,
      subValues: {},
    },
    rerollCount: 0,
    equippedToChampionId: null,
    equippedChampionBaseId: null,
    equippedChampionRarity: null,
    source: 'manual',
    equippedChampionName: null,
    equippedChampionLocation: null,
    lastUseLocalTimestamp: null,
  }
}

const makeSpdSafeguardRule = (id: string): SafeguardRule => ({
  id,
  name: id,
  combination: {
    slots: [ArtifactType.Weapon],
    sets: [],
    metaSetNames: [],
    ranks: [],
    rarities: [],
    mainStats: [],
    factions: [],
  },
  requiredCount: 1,
  activation: SafeguardRuleActivation.ProtectExisting,
  countMode: SAFEGUARD_DEFAULT_COUNT_MODE,
  ignorePreviousSafeguards: true,
  ignoreEquippedInCollection: false,
  ignoreEquippedInVault: false,
  beatEquippedPercentile: null,
  substats: [StatVariant.SPD],
  substatMatch: SafeguardSubstatMatch.Any,
  substatWeights: {},
})

test('returns a non-binary safeguard selection chance for upgradable gear', () => {
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [
      makeSubstat(StatVariant.SPD, 5, 0),
      makeSubstat(StatVariant.HP, 5, 0),
    ],
  })
  const challenger = makeArtifact({
    id: 2,
    level: 16,
    rarity: 6,
    substats: [makeSubstat(StatVariant.SPD, 20, 3)],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate, challenger],
    [makeSpdSafeguardRule('sg_spd')],
  ).get(1)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.matchedRuleId, 'sg_spd')
  assert.equal(chance?.debug?.sourceArtifactCount, 2)
  assert.equal(chance?.debug?.requiredPerGroup, 1)
  assert.equal(chance?.debug?.selectedSubstats.join(','), String(StatVariant.SPD))
  assert.ok((chance?.chancePercent ?? 0) > 0, `expected > 0, got ${String(chance?.chancePercent)}`)
  assert.ok((chance?.chancePercent ?? 0) < 100, `expected < 100, got ${String(chance?.chancePercent)}`)
})

test('does not emit safeguard chance overlays for already-level-16 gear', () => {
  const high = makeArtifact({
    id: 10,
    level: 16,
    rarity: 6,
    substats: [makeSubstat(StatVariant.SPD, 20, 3)],
  })
  const low = makeArtifact({
    id: 11,
    level: 16,
    rarity: 6,
    substats: [makeSubstat(StatVariant.SPD, 10, 1)],
  })
  const challenger = makeArtifact({
    id: 12,
    level: 16,
    rarity: 6,
    substats: [makeSubstat(StatVariant.SPD, 20, 3)],
  })
  const chanceById = buildSafeguardUpgradeChanceByArtifactId(
    [high, low, challenger],
    [makeSpdSafeguardRule('sg_spd_lvl16')],
  )
  assert.equal(Boolean(chanceById.get(10)?.hasMatchingSafeguard), false)
  assert.equal(Boolean(chanceById.get(11)?.hasMatchingSafeguard), false)
  assert.equal(Boolean(chanceById.get(12)?.hasMatchingSafeguard), false)
})

test('marks no-match artifacts when no safeguard applies to the piece', () => {
  const candidate = makeArtifact({
    id: 20,
    level: 0,
    rarity: 5,
    substats: [
      makeSubstat(StatVariant.SPD, 5, 0),
      makeSubstat(StatVariant.HP, 5, 0),
    ],
  })
  const rule: SafeguardRule = {
    ...makeSpdSafeguardRule('sg_acc_only'),
    // Slot mismatch ensures this rule does not apply to the candidate piece at all.
    combination: {
      slots: [ArtifactType.Boots],
      sets: [],
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
  }
  const chance = buildSafeguardUpgradeChanceByArtifactId([candidate], [rule]).get(20)
  assert.equal(chance?.chancePercent, 0)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), false)
  assert.equal(chance?.matchedRuleId ?? null, null)
  assert.equal(chance?.debug, undefined)
})

test('treats no-SPD legendary gear as non-matching for SPD-only safeguards', () => {
  const candidate = makeArtifact({
    id: 30,
    level: 0,
    rarity: 5,
    substats: [
      makeSubstat(StatVariant.HP, 10, 0),
      makeSubstat(StatVariant.ACC, 8, 0),
      makeSubstat(StatVariant.CR, 6, 0),
      makeSubstat(StatVariant.RES, 7, 0),
    ],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate],
    [makeSpdSafeguardRule('sg_spd_only')],
  ).get(30)
  assert.equal(chance?.chancePercent, 0)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), false)
  assert.equal(chance?.matchedRuleId ?? null, null)
})

test('keeps no-SPD low-rarity gear eligible when future substat additions can still roll SPD', () => {
  const candidate = makeArtifact({
    id: 31,
    level: 0,
    rarity: 1,
    substats: [makeSubstat(StatVariant.HP, 5, 0)],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate],
    [makeSpdSafeguardRule('sg_spd_addable')],
  ).get(31)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.matchedRuleId, 'sg_spd_addable')
  assert.ok((chance?.chancePercent ?? 0) > 0, `expected > 0, got ${String(chance?.chancePercent)}`)
  assert.ok((chance?.chancePercent ?? 0) < 100, `expected < 100, got ${String(chance?.chancePercent)}`)
})

test('prefers the most likely safeguard for matchedRuleId when multiple safeguards apply', () => {
  const candidate = makeArtifact({
    id: 41,
    level: 0,
    rarity: 1,
    substats: [
      makeSubstat(StatVariant.SPD, 5, 0),
      makeSubstat(StatVariant.HP, 5, 0),
    ],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate],
    [
      makeSpdSafeguardRule('sg_spd_best'),
      {
        ...makeSpdSafeguardRule('sg_spd_acc_all'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.All,
      },
    ],
  ).get(41)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.matchedRuleId, 'sg_spd_best')
  assert.equal(chance?.debug?.selectedSubstats.join(','), String(StatVariant.SPD))
})

test('breaks equal-chance safeguard ties by higher matching substat count', () => {
  const candidate = makeArtifact({
    id: 51,
    level: 0,
    rarity: 6,
    substats: [
      makeSubstat(StatVariant.SPD, 6, 0),
      makeSubstat(StatVariant.HP, 6, 0),
    ],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate],
    [
      {
        ...makeSpdSafeguardRule('sg_less_matching'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.Any,
      },
      {
        ...makeSpdSafeguardRule('sg_more_matching'),
        substats: [StatVariant.SPD, StatVariant.HP],
        substatMatch: SafeguardSubstatMatch.Any,
      },
    ],
  ).get(51)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.chancePercent, 100)
  assert.equal(chance?.matchedRuleId, 'sg_more_matching')
})

test('breaks equal-chance + equal-match ties by safeguard list order', () => {
  const candidate = makeArtifact({
    id: 52,
    level: 0,
    rarity: 6,
    substats: [
      makeSubstat(StatVariant.SPD, 6, 0),
      makeSubstat(StatVariant.HP, 6, 0),
    ],
  })
  const chance = buildSafeguardUpgradeChanceByArtifactId(
    [candidate],
    [
      {
        ...makeSpdSafeguardRule('sg_top_rule'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.Any,
      },
      {
        ...makeSpdSafeguardRule('sg_bottom_rule'),
        substats: [StatVariant.SPD, StatVariant.RES],
        substatMatch: SafeguardSubstatMatch.Any,
      },
    ],
  ).get(52)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.chancePercent, 100)
  assert.equal(chance?.matchedRuleId, 'sg_top_rule')
})
