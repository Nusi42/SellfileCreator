/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTesterItems, DEFAULT_RULES_FILTER_STATE, type TesterFilterRow, type RulesFilterState } from '../src/lib/rulesFilter.js'
import { ArtifactSet, ArtifactType, StatId, StatVariant } from '../src/lib/types.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../src/lib/importers/gearDbNormalizer.js'

const makeStat = (variant: StatVariant, value: number, options?: Partial<NormalizedStat>): NormalizedStat => ({
  source: 'substat',
  statId: StatId.SPD,
  isFlat: false,
  variant,
  baseValue: value,
  glyphValue: 0,
  totalValue: value,
  ...options,
})

let artifactIdCounter = 1

const makeArtifact = (overrides: Partial<NormalizedGearArtifact> = {}): NormalizedGearArtifact => ({
  id: artifactIdCounter++,
  slot: ArtifactType.Helmet,
  set: ArtifactSet.Speed,
  rank: 6,
  rarity: 5,
  level: 16,
  faction: 0,
  mainStat: {
    source: 'main',
    statId: StatId.SPD,
    isFlat: false,
    variant: StatVariant.SPD,
    baseValue: 45,
    glyphValue: 0,
    totalValue: 45,
  },
  substats: [
    makeStat(StatVariant.CR, 12, { statId: StatId.CR }),
    makeStat(StatVariant.CDMG, 20, { statId: StatId.CDMG }),
  ],
  ascension: null,
  testerItem: {
    slot: ArtifactType.Helmet,
    set: ArtifactSet.Speed,
    rank: 6,
    rarity: 5,
    level: 16,
    faction: 0,
    main: StatVariant.SPD,
    subValues: { [StatVariant.CR]: 12, [StatVariant.CDMG]: 20 },
  },
  rerollCount: 0,
  equippedToChampionId: null,
  source: 'artifacts',
  ...overrides,
})

test('filterTesterItems filters by set selection', () => {
  const rows: TesterFilterRow[] = [
    { artifact: makeArtifact({ set: ArtifactSet.Speed }), match: { keep: true, cfgIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: true, cfgIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    sets: { ...DEFAULT_RULES_FILTER_STATE.sets, selected: [ArtifactSet.Speed] },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.set, ArtifactSet.Speed)
  assert.equal(result.matchingConfigIndices.has(0), true)
  assert.equal(result.matchingConfigIndices.has(1), false)
})

test('filterTesterItems filters by main stat and substats', () => {
  const fastArtifact = makeArtifact({
    slot: ArtifactType.Boots,
    mainStat: {
      source: 'main',
      statId: StatId.SPD,
      isFlat: false,
      variant: StatVariant.SPD,
      baseValue: 45,
      glyphValue: 0,
      totalValue: 45,
    },
    substats: [
      makeStat(StatVariant.CR, 12, { statId: StatId.CR }),
      makeStat(StatVariant.CDMG, 20, { statId: StatId.CDMG }),
      makeStat(StatVariant.RES, 30, { statId: StatId.RES }),
    ],
  })
  const hpArtifact = makeArtifact({
    slot: ArtifactType.Chestplate,
    mainStat: {
      source: 'main',
      statId: StatId.HP,
      isFlat: false,
      variant: StatVariant.HP,
      baseValue: 50,
      glyphValue: 0,
      totalValue: 50,
    },
    substats: [
      makeStat(StatVariant.HP, 10, { statId: StatId.HP }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: fastArtifact, match: { keep: true, cfgIdx: 0 } },
    { artifact: hpArtifact, match: { keep: true, cfgIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    main: { selected: [StatVariant.SPD], anyMode: 'include' },
    sub: { selected: [StatVariant.RES], mode: 'any', wildcardMode: 'include' },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.slot, ArtifactType.Boots)
})

test('filterTesterItems filters by config name', () => {
  const rows: TesterFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, cfgIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: false, cfgIdx: 1 } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    configName: { query: 'Arena' },
  }
  const result = filterTesterItems(rows, state, undefined, { configNames: ['Speed Farm', 'Arena Nuker'] })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.match?.cfgIdx, 1)
  assert.equal(result.matchingConfigIndices.has(1), true)
  assert.equal(result.matchingConfigIndices.has(0), false)
})
