/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTesterItems, DEFAULT_RULES_FILTER_STATE, type TesterFilterRow, type RulesFilterState, type TesterRollFilterState } from '../src/lib/rulesFilter.js'
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
  exactLevel: 16,
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
  equippedChampionName: null,
  equippedChampionLocation: null,
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

test('filterTesterItems filters by tester Keep/Sell result', () => {
  const rows: TesterFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, cfgIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: false, cfgIdx: 1 } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const keepState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'yes', matched: 'any' },
  }
  const keepMatches = filterTesterItems(rows, keepState)
  assert.equal(keepMatches.items.length, 1)
  assert.equal(keepMatches.items[0]?.match?.keep, true)

  const sellState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'no', matched: 'any' },
  }
  const sellMatches = filterTesterItems(rows, sellState)
  assert.equal(sellMatches.items.length, 1)
  assert.equal(sellMatches.items[0]?.match?.keep, false)
})

test('filterTesterItems filters by matched vs unmatched tester rows', () => {
  const rows: TesterFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, cfgIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: null },
  ]
  const matchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'any', matched: 'yes' },
  }
  const matched = filterTesterItems(rows, matchedState)
  assert.equal(matched.items.length, 1)
  assert.equal(matched.items[0]?.match?.cfgIdx, 0)

  const unmatchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'any', matched: 'no' },
  }
  const unmatched = filterTesterItems(rows, unmatchedState)
  assert.equal(unmatched.items.length, 1)
  assert.equal(unmatched.items[0]?.match, null)
})

test('filterTesterItems filters by tester sources', () => {
  const manual = makeArtifact({ source: 'tester' })
  const inventory = makeArtifact()
  const collection = makeArtifact({ equippedToChampionId: 101, equippedChampionLocation: 'collection' })
  const rows: TesterFilterRow[] = [
    { artifact: manual, match: null },
    { artifact: inventory, match: null },
    { artifact: collection, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerSources: { selected: ['manual'] },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.source, 'tester')
})

test('filterTesterItems filters by tester level slider range using exactLevels', () => {
  const highLevel = makeArtifact({ exactLevel: 15 })
  const midLevel = makeArtifact({ exactLevel: 9 })
  const rows: TesterFilterRow[] = [
    { artifact: highLevel, match: { keep: true, cfgIdx: 0 } },
    { artifact: midLevel, match: { keep: false, cfgIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], testerRange: { min: 12, max: 16 } },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, highLevel.id)
})

test('filterTesterItems falls back to milestone level when exactLevel is missing', () => {
  const missingExact = makeArtifact({ level: 12, exactLevel: null })
  const cappedLevel = makeArtifact({ level: 16, exactLevel: 16 })
  const rows: TesterFilterRow[] = [
    { artifact: missingExact, match: { keep: true, cfgIdx: 0 } },
    { artifact: cappedLevel, match: { keep: true, cfgIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], testerRange: { min: 16, max: 16 } },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, cappedLevel.id)
})

test('filterTesterItems filters by chaos ore reroll state', () => {
  const clean = makeArtifact({ rerollCount: 0 })
  const rerolled = makeArtifact({ rerollCount: 2 })
  const rows: TesterFilterRow[] = [
    { artifact: clean, match: null },
    { artifact: rerolled, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerChaos: { mode: 'rerolled' },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.rerollCount, 2)
})

test('filterTesterItems filters by glyph presence', () => {
  const glyphed = makeArtifact({
    substats: [
      makeStat(StatVariant.CR, 12, { statId: StatId.CR, glyphValue: 1, totalValue: 13 }),
    ],
  })
  const plain = makeArtifact({
    substats: [
      makeStat(StatVariant.CR, 12, { statId: StatId.CR, glyphValue: 0, totalValue: 12 }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: glyphed, match: null },
    { artifact: plain, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerGlyphs: { mode: 'on' },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.glyphValue, 1)
})

test('filterTesterItems enforces glyphs on all selected substats when mode is selected', () => {
  const fullyGlyphed = makeArtifact({
    substats: [
      makeStat(StatVariant.CR, 12, { statId: StatId.CR, glyphValue: 1, totalValue: 13 }),
      makeStat(StatVariant.CDMG, 20, { statId: StatId.CDMG, glyphValue: 2, totalValue: 22 }),
    ],
  })
  const missingGlyph = makeArtifact({
    substats: [
      makeStat(StatVariant.CR, 12, { statId: StatId.CR, glyphValue: 0, totalValue: 12 }),
      makeStat(StatVariant.CDMG, 20, { statId: StatId.CDMG, glyphValue: 2, totalValue: 22 }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: fullyGlyphed, match: null },
    { artifact: missingGlyph, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    sub: { selected: [StatVariant.CR, StatVariant.CDMG], mode: 'all', wildcardMode: 'include' },
    testerGlyphs: { mode: 'selected' },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact, fullyGlyphed)
})

test('filterTesterItems filters by ascension stars and stats', () => {
  const ascArtifact = makeArtifact({
    ascension: {
      source: 'ascension',
      statId: StatId.SPD,
      isFlat: false,
      variant: StatVariant.SPD,
      baseValue: 5,
      glyphValue: 0,
      totalValue: 5,
      rolls: 3,
    },
  })
  const baseArtifact = makeArtifact({ ascension: null })
  const rows: TesterFilterRow[] = [
    { artifact: ascArtifact, match: null },
    { artifact: baseArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerAscension: { stars: [3], stats: [StatVariant.SPD] },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.ascension?.variant, StatVariant.SPD)
})

test('filterTesterItems filters by champion selection', () => {
  const championArtifact = makeArtifact({ equippedToChampionId: 321 })
  const inventoryArtifact = makeArtifact({ equippedToChampionId: null })
  const rows: TesterFilterRow[] = [
    { artifact: championArtifact, match: null },
    { artifact: inventoryArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerChampions: { selected: [321] },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.equippedToChampionId, 321)
})

test('filterTesterItems filters by wildcard roll counts', () => {
  const doubleRoll = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 12, { statId: StatId.SPD, rolls: 2 }),
      makeStat(StatVariant.CR, 10, { statId: StatId.CR, rolls: 0 }),
    ],
  })
  const tripleRoll = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 15, { statId: StatId.SPD, rolls: 3 }),
      makeStat(StatVariant.CR, 8, { statId: StatId.CR, rolls: 0 }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: doubleRoll, match: null },
    { artifact: tripleRoll, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerRolls: {
      wildcard: { mode: 'any', counts: [2] },
      perStat: [],
    },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.rolls, 2)
})

test('filterTesterItems treats legacy selected wildcard mode as any stat', () => {
  const doubleRoll = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 12, { statId: StatId.SPD, rolls: 2 }),
      makeStat(StatVariant.CR, 10, { statId: StatId.CR, rolls: 0 }),
    ],
  })
  const tripleRoll = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 15, { statId: StatId.SPD, rolls: 3 }),
      makeStat(StatVariant.CR, 8, { statId: StatId.CR, rolls: 0 }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: doubleRoll, match: null },
    { artifact: tripleRoll, match: null },
  ]
  const legacyTesterRolls = {
    wildcard: { mode: 'selected', counts: [2] },
    perStat: [],
  } as unknown as TesterRollFilterState
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerRolls: legacyTesterRolls,
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.rolls, 2)
})

test('filterTesterItems filters by per-stat roll requirements', () => {
  const matching = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 15, { statId: StatId.SPD, rolls: 2 }),
      makeStat(StatVariant.CR, 11, { statId: StatId.CR, rolls: 1 }),
    ],
  })
  const failing = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 14, { statId: StatId.SPD, rolls: 2 }),
      makeStat(StatVariant.CR, 9, { statId: StatId.CR, rolls: 0 }),
    ],
  })
  const rows: TesterFilterRow[] = [
    { artifact: matching, match: null },
    { artifact: failing, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerRolls: {
      wildcard: { mode: 'off', counts: [] },
      perStat: [
        { stat: StatVariant.SPD, counts: [2] },
        { stat: StatVariant.CR, counts: [1] },
      ],
    },
  }
  const result = filterTesterItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, matching.id)
})
