/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GEAR_INSPECTOR_SORT_KEY_LAST_USAGE,
  GEAR_INSPECTOR_SORT_KEY_NEWEST,
  GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE,
  sortGearInspectorRows,
  sortGearInspectorRowsBySubstats,
} from '../../src/lib/gearInspectorSort.js'
import {
  ArtifactSet,
  ArtifactType,
  StatId,
  StatVariant,
  type RankValue,
  type LevelMilestone,
} from '../../src/lib/types.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'

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

const makeSubstat = (variant: StatVariant, totalValue: number): NormalizedStat => {
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
    source: 'substat',
    statId,
    isFlat,
    variant,
    baseValue: totalValue,
    glyphValue: 0,
    mythValue: 0,
    totalValue,
  }
}

const makeGearInspectorRow = (overrides: Partial<NormalizedGearArtifact> = {}): GearInspectorPreviewRow => {
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
    gearInspectorItem: {
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
    equippedChampionRarity: overrides.equippedChampionRarity ?? null,
    equippedChampionAscensionLevel: overrides.equippedChampionAscensionLevel ?? null,
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
    source: overrides.source ?? 'manual',
    exactLevel: overrides.exactLevel ?? null,
    lastUseLocalTimestamp: overrides.lastUseLocalTimestamp ?? null,
    isLocked: overrides.isLocked ?? false,
  }

  return {
    artifact,
    match: null,
    baseMatch: null,
    matchingRecipeIndices: [],
    matchingRecipeDecisions: [],
  }
}

test('sortGearInspectorRows keeps armor before accessories', () => {
  const armor = makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed })
  const accessory = makeGearInspectorRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, faction: 123 })
  const sorted = sortGearInspectorRows([accessory, armor])
  assert.deepEqual(sorted.map((row) => row.artifact.slot), [ArtifactType.Weapon, ArtifactType.Ring])
})

test('sortGearInspectorRows sorts by set order once general slot matches', () => {
  const life = makeGearInspectorRow({ set: ArtifactSet.Life })
  const savage = makeGearInspectorRow({ set: ArtifactSet.Savage })
  const sorted = sortGearInspectorRows([savage, life])
  assert.deepEqual(sorted.map((row) => row.artifact.set), [ArtifactSet.Life, ArtifactSet.Savage])
})

test('sortGearInspectorRows respects preferred slot ordering after set comparison', () => {
  const gauntlets = makeGearInspectorRow({ slot: ArtifactType.Gauntlets, set: ArtifactSet.Speed })
  const boots = makeGearInspectorRow({ slot: ArtifactType.Boots, set: ArtifactSet.Speed })
  const sorted = sortGearInspectorRows([boots, gauntlets])
  assert.deepEqual(sorted.map((row) => row.artifact.slot), [ArtifactType.Gauntlets, ArtifactType.Boots])
})

test('sortGearInspectorRows orders identical-rank rows by main stat priority', () => {
  const rows = [
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.CDMG) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.CR) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.ACC) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.RES) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.SPD) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.DEF_FLAT) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.DEF) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.ATK_FLAT) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.ATK) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.HP_FLAT) }),
    makeGearInspectorRow({ mainStat: makeMainStat(StatVariant.HP) }),
  ]

  const sorted = sortGearInspectorRows(rows.slice().reverse())
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

test('sortGearInspectorRows falls back to rank, rarity, ascension, level, then main stat priority', () => {
  const rankSixRaritySixAscThree = makeGearInspectorRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(3),
    mainStat: makeMainStat(StatVariant.SPD),
  })
  const rankSixRaritySixAscOneLevelTwelveCdmg = makeGearInspectorRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    level: 12 as LevelMilestone,
    ascension: makeAscensionStat(1),
    mainStat: makeMainStat(StatVariant.CDMG),
  })
  const rankSixRaritySixAscOneHp = makeGearInspectorRow({
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    level: 8 as LevelMilestone,
    ascension: makeAscensionStat(1),
    mainStat: makeMainStat(StatVariant.HP),
  })
  const rankSixRarityFourAscFive = makeGearInspectorRow({
    rank: 6 as RankValue,
    rarity: 4 as RankValue,
    ascension: makeAscensionStat(5),
    mainStat: makeMainStat(StatVariant.SPD),
  })
  const rankFiveRaritySixAscTen = makeGearInspectorRow({
    rank: 5 as RankValue,
    rarity: 6 as RankValue,
    ascension: makeAscensionStat(10),
    mainStat: makeMainStat(StatVariant.HP),
  })

  const sorted = sortGearInspectorRows([
    rankFiveRaritySixAscTen,
    rankSixRarityFourAscFive,
    rankSixRaritySixAscOneLevelTwelveCdmg,
    rankSixRaritySixAscOneHp,
    rankSixRaritySixAscThree,
  ])

  assert.deepEqual(
    sorted.map((row) => ({
      rank: Number(row.artifact.rank),
      rarity: Number(row.artifact.rarity),
      asc: row.artifact.ascension?.rolls ?? 0,
      level: Number(row.artifact.level),
      main: row.artifact.mainStat?.variant,
    })),
    [
      { rank: 6, rarity: 6, asc: 3, level: 16, main: StatVariant.SPD },
      { rank: 6, rarity: 6, asc: 1, level: 12, main: StatVariant.CDMG },
      { rank: 6, rarity: 6, asc: 1, level: 8, main: StatVariant.HP },
      { rank: 6, rarity: 4, asc: 5, level: 16, main: StatVariant.SPD },
      { rank: 5, rarity: 6, asc: 10, level: 16, main: StatVariant.HP },
    ],
  )
})

test('sortGearInspectorRowsBySubstats sorts by last usage (most recent first)', () => {
  const old = makeGearInspectorRow({ id: 1, lastUseLocalTimestamp: '2020-01-01T00:00:00.000Z' })
  const recent = makeGearInspectorRow({ id: 2, lastUseLocalTimestamp: '2024-01-01T00:00:00.000Z' })
  const never = makeGearInspectorRow({ id: 3, lastUseLocalTimestamp: null })
  const sorted = sortGearInspectorRowsBySubstats([old, never, recent], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE],
    direction: 'desc',
    flipped: [],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [2, 1, 3])
})

test('sortGearInspectorRowsBySubstats supports per-key flipped direction', () => {
  const old = makeGearInspectorRow({ id: 1, lastUseLocalTimestamp: '2020-01-01T00:00:00.000Z' })
  const recent = makeGearInspectorRow({ id: 2, lastUseLocalTimestamp: '2024-01-01T00:00:00.000Z' })
  const never = makeGearInspectorRow({ id: 3, lastUseLocalTimestamp: null })
  const sorted = sortGearInspectorRowsBySubstats([old, never, recent], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE],
    direction: 'desc',
    flipped: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [1, 2, 3])
})

test('sortGearInspectorRowsBySubstats sorts by newest artifact id first', () => {
  const older = makeGearInspectorRow({ id: 101 })
  const newer = makeGearInspectorRow({ id: 202 })
  const newest = makeGearInspectorRow({ id: 303 })
  const sorted = sortGearInspectorRowsBySubstats([older, newest, newer], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_NEWEST],
    direction: 'desc',
    flipped: [],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [303, 202, 101])
})

test('sortGearInspectorRowsBySubstats supports flipped direction for newest artifact id', () => {
  const older = makeGearInspectorRow({ id: 101 })
  const newer = makeGearInspectorRow({ id: 202 })
  const newest = makeGearInspectorRow({ id: 303 })
  const sorted = sortGearInspectorRowsBySubstats([newer, older, newest], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_NEWEST],
    direction: 'desc',
    flipped: [GEAR_INSPECTOR_SORT_KEY_NEWEST],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [101, 202, 303])
})

test('sortGearInspectorRowsBySubstats sorts by safeguard improvement chance (highest first)', () => {
  const high = makeGearInspectorRow({ id: 1 })
  const low = makeGearInspectorRow({ id: 2 })
  const none = makeGearInspectorRow({ id: 3 })
  const sorted = sortGearInspectorRowsBySubstats([low, none, high], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE],
    direction: 'desc',
    flipped: [],
    excludeGlyphs: true,
    safeguardImprovementChanceByArtifactId: new Map([
      [1, 80],
      [2, 20],
    ]),
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [1, 2, 3])
})

test('sortGearInspectorRowsBySubstats supports flipped direction for safeguard improvement chance', () => {
  const high = makeGearInspectorRow({ id: 1 })
  const low = makeGearInspectorRow({ id: 2 })
  const none = makeGearInspectorRow({ id: 3 })
  const sorted = sortGearInspectorRowsBySubstats([high, none, low], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE],
    direction: 'desc',
    flipped: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE],
    excludeGlyphs: true,
    safeguardImprovementChanceByArtifactId: new Map([
      [1, 80],
      [2, 20],
    ]),
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [2, 1, 3])
})

test('sortGearInspectorRowsBySubstats composes last usage and substat priorities', () => {
  const timestamp = '2024-01-01T00:00:00.000Z'
  const spdHigh = makeGearInspectorRow({ id: 1, lastUseLocalTimestamp: timestamp, substats: [makeSubstat(StatVariant.SPD, 20)] })
  const spdLow = makeGearInspectorRow({ id: 2, lastUseLocalTimestamp: timestamp, substats: [makeSubstat(StatVariant.SPD, 5)] })
  const sorted = sortGearInspectorRowsBySubstats([spdLow, spdHigh], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_LAST_USAGE, StatVariant.SPD],
    direction: 'desc',
    flipped: [],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [1, 2])
})

test('sortGearInspectorRowsBySubstats composes safeguard chance and substat priorities', () => {
  const spdHigh = makeGearInspectorRow({ id: 1, substats: [makeSubstat(StatVariant.SPD, 20)] })
  const spdLow = makeGearInspectorRow({ id: 2, substats: [makeSubstat(StatVariant.SPD, 5)] })
  const sorted = sortGearInspectorRowsBySubstats([spdLow, spdHigh], {
    priorities: [GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE, StatVariant.SPD],
    direction: 'desc',
    flipped: [],
    excludeGlyphs: true,
    safeguardImprovementChanceByArtifactId: new Map([
      [1, 50],
      [2, 50],
    ]),
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [1, 2])
})

test('sortGearInspectorRowsBySubstats can flip only one key while keeping global direction', () => {
  const spdHigh = makeGearInspectorRow({ id: 1, substats: [makeSubstat(StatVariant.SPD, 20)] })
  const spdLow = makeGearInspectorRow({ id: 2, substats: [makeSubstat(StatVariant.SPD, 5)] })
  const sorted = sortGearInspectorRowsBySubstats([spdLow, spdHigh], {
    priorities: [StatVariant.SPD],
    direction: 'desc',
    flipped: [StatVariant.SPD],
    excludeGlyphs: true,
  })
  assert.deepEqual(sorted.map((row) => row.artifact.id), [2, 1])
})

test('sortGearInspectorRows breaks full ties by artifact id', () => {
  const first = makeGearInspectorRow({ set: ArtifactSet.Speed })
  const second = makeGearInspectorRow({ set: ArtifactSet.Speed })
  const sorted = sortGearInspectorRows([second, first])
  assert.deepEqual(sorted, [first, second])
})
