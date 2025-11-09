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

const makeMainStat = (): NormalizedStat => ({
  source: 'main',
  statId: StatId.ATK,
  isFlat: false,
  variant: StatVariant.ATK,
  baseValue: 0,
  glyphValue: 0,
  mythValue: 0,
  totalValue: 0,
})

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
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
    source: overrides.source ?? 'tester',
  }

  return {
    artifact,
    match: null,
    matchingCfgIndices: [],
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

test('sortTesterRows falls back to rank, rarity, then ascension tier', () => {
  const rankSixRarityFour = makeTesterRow({ rank: 6 as RankValue, rarity: 4 as RankValue })
  const rankFiveRaritySix = makeTesterRow({ rank: 5 as RankValue, rarity: 6 as RankValue })
  const rankSixRaritySixAscOne = makeTesterRow({ rank: 6 as RankValue, rarity: 6 as RankValue, ascension: makeAscensionStat(1) })
  const rankSixRaritySixAscThree = makeTesterRow({ rank: 6 as RankValue, rarity: 6 as RankValue, ascension: makeAscensionStat(3) })

  const sorted = sortTesterRows([
    rankFiveRaritySix,
    rankSixRarityFour,
    rankSixRaritySixAscOne,
    rankSixRaritySixAscThree,
  ])

  assert.deepEqual(
    sorted.map((row) => ({
      rank: Number(row.artifact.rank),
      rarity: Number(row.artifact.rarity),
      asc: row.artifact.ascension?.rolls ?? 0,
    })),
    [
      { rank: 6, rarity: 6, asc: 3 },
      { rank: 6, rarity: 6, asc: 1 },
      { rank: 6, rarity: 4, asc: 0 },
      { rank: 5, rarity: 6, asc: 0 },
    ],
  )
})

test('sortTesterRows preserves insertion order when all keys are equal', () => {
  const first = makeTesterRow({ set: ArtifactSet.Speed })
  const second = makeTesterRow({ set: ArtifactSet.Speed })
  const sorted = sortTesterRows([second, first])
  assert.deepEqual(sorted, [second, first])
})
