/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { sortTesterRows } from '../src/lib/testerSort.js'
import {
  ArtifactSet,
  ArtifactType,
  StatId,
  StatVariant,
  type RankValue,
  type LevelMilestone,
} from '../src/lib/types.js'
import type { TesterPreviewRow } from '../src/types/testerPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../src/lib/importers/gearDbNormalizer.js'

let nextArtifactId = 1

const makeMainStat = (variant: StatVariant = StatVariant.ATK): NormalizedStat => {
  const statId = (() => {
    switch (variant) {
      case StatVariant.HP:
      case StatVariant.HP_FLAT:
        return StatId.HP
      case StatVariant.ATK:
      case StatVariant.ATK_FLAT:
        return StatId.ATK
      case StatVariant.DEF:
      case StatVariant.DEF_FLAT:
        return StatId.DEF
      case StatVariant.SPD:
        return StatId.SPD
      case StatVariant.RES:
        return StatId.RES
      case StatVariant.ACC:
        return StatId.ACC
      case StatVariant.CR:
        return StatId.CR
      case StatVariant.CDMG:
        return StatId.CDMG
      default:
        return StatId.ATK
    }
  })()
  const isFlat = variant === StatVariant.HP_FLAT
    || variant === StatVariant.ATK_FLAT
    || variant === StatVariant.DEF_FLAT

  return {
    source: 'main',
    statId,
    isFlat,
    variant,
    baseValue: 0,
    glyphValue: 0,
    mythValue: 0,
    totalValue: 0,
  }
}

const makeAscensionStat = (tier: number): NormalizedStat => ({
  source: 'ascension',
  statId: StatId.HP,
  isFlat: false,
  variant: StatVariant.HP,
  baseValue: tier,
  glyphValue: 0,
  mythValue: 0,
  totalValue: tier,
  rolls: tier,
})

const makeTesterRow = (overrides: Partial<NormalizedGearArtifact> = {}): TesterPreviewRow => {
  const slot = overrides.slot ?? ArtifactType.Weapon
  const set = overrides.set ?? ArtifactSet.Speed
  const rank = (overrides.rank ?? 6) as RankValue
  const rarity = (overrides.rarity ?? 5) as RankValue
  const level = (overrides.level ?? 16) as LevelMilestone
  const faction = overrides.faction ?? 0
  const mainStat = overrides.mainStat ?? makeMainStat()

  const artifact: NormalizedGearArtifact = {
    id: overrides.id ?? nextArtifactId++,
    slot,
    set,
    rank,
    rarity,
    level,
    faction,
    mainStat,
    substats: overrides.substats ?? [],
    ascension: overrides.ascension ?? null,
    testerItem: {
      slot,
      set,
      rank,
      rarity,
      level,
      faction,
      main: mainStat.variant,
      subValues: {},
    },
    rerollCount: overrides.rerollCount ?? 0,
    equippedToChampionId: overrides.equippedToChampionId ?? null,
    equippedChampionBaseId: overrides.equippedChampionBaseId ?? null,
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
    source: overrides.source ?? 'tester',
    exactLevel: overrides.exactLevel ?? null,
    lastUseLocalTimestamp: overrides.lastUseLocalTimestamp ?? null,
  }

  return {
    artifact,
    match: null,
    baseMatch: null,
    matchingCfgIndices: [],
    matchingConfigDecisions: [],
  }
}

test('sortTesterRows keeps armor before accessories', () => {
  const armor = makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed })
  const accessory = makeTesterRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, faction: 123 })
  const sorted = sortTesterRows([accessory, armor])
  assert.deepEqual(sorted.map((row) => row.artifact.slot), [ArtifactType.Weapon, ArtifactType.Ring])
})

test('sortTesterRows sorts by set order once general slot matches', () => {
  const life = makeTesterRow({ set: ArtifactSet.Life })
  const savage = makeTesterRow({ set: ArtifactSet.Savage })
  const sorted = sortTesterRows([savage, life])
  assert.deepEqual(sorted.map((row) => row.artifact.set), [ArtifactSet.Life, ArtifactSet.Savage])
})

test('sortTesterRows respects preferred slot ordering after set comparison', () => {
  const gauntlets = makeTesterRow({ slot: ArtifactType.Gauntlets, set: ArtifactSet.Speed })
  const boots = makeTesterRow({ slot: ArtifactType.Boots, set: ArtifactSet.Speed })
  const sorted = sortTesterRows([boots, gauntlets])
  assert.deepEqual(sorted.map((row) => row.artifact.slot), [ArtifactType.Gauntlets, ArtifactType.Boots])
})

test('sortTesterRows orders identical-rank rows by main stat priority', () => {
  const rows = [
    makeTesterRow({ mainStat: makeMainStat(StatVariant.CDMG) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.CR) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.ACC) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.RES) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.SPD) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.DEF_FLAT) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.DEF) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.ATK_FLAT) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.ATK) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.HP_FLAT) }),
    makeTesterRow({ mainStat: makeMainStat(StatVariant.HP) }),
  ]

  const sorted = sortTesterRows(rows.slice().reverse())
  assert.deepEqual(
    sorted.map((row) => row.artifact.mainStat?.variant),
    [
      StatVariant.HP,
      StatVariant.HP_FLAT,
      StatVariant.ATK,
      StatVariant.ATK_FLAT,
      StatVariant.DEF,
      StatVariant.DEF_FLAT,
      StatVariant.SPD,
      StatVariant.RES,
      StatVariant.ACC,
      StatVariant.CR,
      StatVariant.CDMG,
    ],
  )
})

test('sortTesterRows falls back to rank, rarity, ascension, then main stat priority', () => {
  const rankSixRaritySixAscThree = makeTesterRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(3),
    mainStat: makeMainStat(StatVariant.SPD),
  })
  const rankSixRaritySixAscOneHp = makeTesterRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(1),
    mainStat: makeMainStat(StatVariant.HP),
  })
  const rankSixRaritySixAscOneCdmg = makeTesterRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(1),
    mainStat: makeMainStat(StatVariant.CDMG),
  })
  const rankSixRarityFourAscFive = makeTesterRow({
    rank: 6 as RankValue,
    rarity: 4 as RankValue,
    ascension: makeAscensionStat(5),
    mainStat: makeMainStat(StatVariant.SPD),
  })
  const rankFiveRaritySixAscTen = makeTesterRow({
    rank: 5 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(10),
    mainStat: makeMainStat(StatVariant.HP),
  })

  const sorted = sortTesterRows([
    rankFiveRaritySixAscTen,
    rankSixRarityFourAscFive,
    rankSixRaritySixAscOneCdmg,
    rankSixRaritySixAscOneHp,
    rankSixRaritySixAscThree,
  ])

  assert.deepEqual(
    sorted.map((row) => ({
      rank: Number(row.artifact.rank),
      rarity: Number(row.artifact.rarity),
      asc: row.artifact.ascension?.rolls ?? 0,
      main: row.artifact.mainStat?.variant,
    })),
    [
      { rank: 6, rarity: 6, asc: 3, main: StatVariant.SPD },
      { rank: 6, rarity: 6, asc: 1, main: StatVariant.HP },
      { rank: 6, rarity: 6, asc: 1, main: StatVariant.CDMG },
      { rank: 6, rarity: 4, asc: 5, main: StatVariant.SPD },
      { rank: 5, rarity: 6, asc: 10, main: StatVariant.HP },
    ],
  )
})

test('sortTesterRows preserves insertion order when all keys are equal', () => {
  const first = makeTesterRow({ set: ArtifactSet.Speed })
  const second = makeTesterRow({ set: ArtifactSet.Speed })
  const sorted = sortTesterRows([second, first])
  assert.deepEqual(sorted, [second, first])
})
