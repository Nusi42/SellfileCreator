/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterGearInspectorItems, DEFAULT_RULES_FILTER_STATE, type GearInspectorFilterRow, type RulesFilterState, type GearInspectorRollFilterState } from '../../src/lib/rulesFilter.js'
import { ArtifactSet, ArtifactType, StatId, StatVariant } from '../../src/lib/types.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import { RULE_SOURCE_FINAL_SELL } from '../../src/lib/merge.js'

const makeStat = (variant: StatVariant, value: number, options?: Partial<NormalizedStat>): NormalizedStat => {
  const baseValue = options?.baseValue ?? value
  const mythValue = options?.mythValue ?? 0
  const glyphValue = options?.glyphValue ?? 0
  const totalValue = options?.totalValue ?? (baseValue + mythValue)
  return {
    source: 'substat',
    statId: StatId.SPD,
    isFlat: false,
    variant,
    baseValue,
    glyphValue,
    mythValue,
    totalValue,
    ...options,
  }
}

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
    mythValue: 0,
    totalValue: 45,
  },
  substats: [
    makeStat(StatVariant.CR, 12, { statId: StatId.CR }),
    makeStat(StatVariant.CDMG, 20, { statId: StatId.CDMG }),
  ],
  ascension: null,
  gearInspectorItem: {
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
  equippedChampionBaseId: null,
  equippedChampionRarity: null,
  equippedChampionName: null,
  equippedChampionLocation: null,
  source: 'artifacts',
  lastUseLocalTimestamp: null,
  ...overrides,
})

test('filterGearInspectorItems filters by set selection', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact({ set: ArtifactSet.Speed }), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: true, recipeIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    // Filters now store set selection entries instead of raw ids.
    sets: { ...DEFAULT_RULES_FILTER_STATE.sets, selected: [{ id: ArtifactSet.Speed }] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.set, ArtifactSet.Speed)
  assert.equal(result.matchingRecipeIndices.has(0), true)
  assert.equal(result.matchingRecipeIndices.has(1), false)
})

test('filterGearInspectorItems filters by main stat and substats', () => {
  const fastArtifact = makeArtifact({
    slot: ArtifactType.Boots,
    mainStat: {
      source: 'main',
      statId: StatId.SPD,
      isFlat: false,
      variant: StatVariant.SPD,
      baseValue: 45,
      glyphValue: 0,
      mythValue: 0,
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
      mythValue: 0,
      totalValue: 50,
    },
    substats: [
      makeStat(StatVariant.HP, 10, { statId: StatId.HP }),
    ],
  })
  const rows: GearInspectorFilterRow[] = [
    { artifact: fastArtifact, match: { keep: true, recipeIdx: 0 } },
    { artifact: hpArtifact, match: { keep: true, recipeIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    main: { selected: [StatVariant.SPD], anyMode: 'include' },
    sub: { selected: [StatVariant.RES], notSelected: [], mode: 'any', wildcardMode: 'include' },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.slot, ArtifactType.Boots)
})

test('filterGearInspectorItems filters by config name', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: false, recipeIdx: 1 } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    recipeName: { query: 'Arena' },
  }
  const result = filterGearInspectorItems(rows, state, undefined, { recipeNames: ['Speed Farm', 'Arena Nuker'] })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.match?.recipeIdx, 1)
  assert.equal(result.matchingRecipeIndices.has(1), true)
  assert.equal(result.matchingRecipeIndices.has(0), false)
})

test('filterGearInspectorItems matches safeguard names without config indices', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: null, recipeName: 'Safeguard Demo' } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    recipeName: { query: 'safeguard' },
  }
  const result = filterGearInspectorItems(rows, state, undefined, { recipeNames: [] })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.match?.recipeIdx, null)
})

test('filterGearInspectorItems matches special rule labels like Final Sell chips', () => {
  const rows: GearInspectorFilterRow[] = [
    {
      artifact: makeArtifact(),
      match: { keep: false, recipeIdx: null, ruleSource: RULE_SOURCE_FINAL_SELL },
    },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    recipeName: { query: 'Final' },
  }
  const result = filterGearInspectorItems(
    rows,
    state,
    undefined,
    { specialRuleLabels: { [RULE_SOURCE_FINAL_SELL]: ['Final Sell'] } },
  )
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.match?.ruleSource, RULE_SOURCE_FINAL_SELL)
})

test('filterGearInspectorItems filters by tester Keep/Sell result', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: false, recipeIdx: 1 } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  const keepState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'yes', matched: 'any' },
  }
  const keepMatches = filterGearInspectorItems(rows, keepState)
  assert.equal(keepMatches.items.length, 1)
  assert.equal(keepMatches.items[0]?.match?.keep, true)

  const sellState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'no', matched: 'any' },
  }
  const sellMatches = filterGearInspectorItems(rows, sellState)
  assert.equal(sellMatches.items.length, 1)
  assert.equal(sellMatches.items[0]?.match?.keep, false)
})

test('filterGearInspectorItems filters by matched vs unmatched gear', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: null },
  ]
  const matchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'any', matched: 'yes' },
  }
  const matched = filterGearInspectorItems(rows, matchedState)
  assert.equal(matched.items.length, 1)
  assert.equal(matched.items[0]?.match?.recipeIdx, 0)

  const unmatchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerResult: { keep: 'any', matched: 'no' },
  }
  const unmatched = filterGearInspectorItems(rows, unmatchedState)
  assert.equal(unmatched.items.length, 1)
  assert.equal(unmatched.items[0]?.match, null)
})

test('filterGearInspectorItems filters by tester sources', () => {
  const manual = makeArtifact({ source: 'tester' })
  const inventory = makeArtifact()
  const collection = makeArtifact({ equippedToChampionId: 101, equippedChampionLocation: 'collection' })
  const rows: GearInspectorFilterRow[] = [
    { artifact: manual, match: null },
    { artifact: inventory, match: null },
    { artifact: collection, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerSources: { selected: ['manual'] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.source, 'tester')
})

test('filterGearInspectorItems filters by tester level slider range using exactLevels', () => {
  const highLevel = makeArtifact({ exactLevel: 15 })
  const midLevel = makeArtifact({ exactLevel: 9 })
  const rows: GearInspectorFilterRow[] = [
    { artifact: highLevel, match: { keep: true, recipeIdx: 0 } },
    { artifact: midLevel, match: { keep: false, recipeIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], testerRange: { min: 12, max: 16 } },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, highLevel.id)
})

test('filterGearInspectorItems falls back to milestone level when exactLevel is missing', () => {
  const missingExact = makeArtifact({ level: 12, exactLevel: null })
  const cappedLevel = makeArtifact({ level: 16, exactLevel: 16 })
  const rows: GearInspectorFilterRow[] = [
    { artifact: missingExact, match: { keep: true, recipeIdx: 0 } },
    { artifact: cappedLevel, match: { keep: true, recipeIdx: 1 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], testerRange: { min: 16, max: 16 } },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, cappedLevel.id)
})

test('filterGearInspectorItems filters by chaos ore reroll state', () => {
  const clean = makeArtifact({ rerollCount: 0 })
  const rerolled = makeArtifact({ rerollCount: 2 })
  const rows: GearInspectorFilterRow[] = [
    { artifact: clean, match: null },
    { artifact: rerolled, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerChaos: { mode: 'rerolled' },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.rerollCount, 2)
})

test('filterGearInspectorItems filters by glyph presence', () => {
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
  const rows: GearInspectorFilterRow[] = [
    { artifact: glyphed, match: null },
    { artifact: plain, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerGlyphs: { mode: 'on' },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.glyphValue, 1)
})

test('filterGearInspectorItems enforces glyphs on all selected substats when mode is selected', () => {
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
  const rows: GearInspectorFilterRow[] = [
    { artifact: fullyGlyphed, match: null },
    { artifact: missingGlyph, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    sub: { selected: [StatVariant.CR, StatVariant.CDMG], notSelected: [], mode: 'all', wildcardMode: 'include' },
    testerGlyphs: { mode: 'selected' },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact, fullyGlyphed)
})

test('filterGearInspectorItems filters by ascension stars and stats', () => {
  const ascArtifact = makeArtifact({
    ascension: {
      source: 'ascension',
      statId: StatId.SPD,
      isFlat: false,
      variant: StatVariant.SPD,
      baseValue: 5,
      glyphValue: 0,
      mythValue: 0,
      totalValue: 5,
      rolls: 3,
    },
  })
  const baseArtifact = makeArtifact({ ascension: null })
  const rows: GearInspectorFilterRow[] = [
    { artifact: ascArtifact, match: null },
    { artifact: baseArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerAscension: { stars: [3], stats: [StatVariant.SPD] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.ascension?.variant, StatVariant.SPD)
})

test('filterGearInspectorItems treats Mythical preroll as the fifth roll', () => {
  const mythArtifact = makeArtifact({
    rarity: 6,
    substats: [
      makeStat(StatVariant.SPD, 20, { statId: StatId.SPD, rolls: 4, mythValue: 5 }),
    ],
  })
  const normalArtifact = makeArtifact({
    substats: [
      makeStat(StatVariant.SPD, 20, { statId: StatId.SPD, rolls: 4, mythValue: 0 }),
    ],
  })
  const rows: GearInspectorFilterRow[] = [
    { artifact: mythArtifact, match: null },
    { artifact: normalArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerRolls: {
      wildcard: { mode: 'off', counts: [] },
      perStat: [{ stat: StatVariant.SPD, counts: [5] }],
    },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact, mythArtifact)
})

test('filterGearInspectorItems filters by champion selection', () => {
  const championArtifact = makeArtifact({ equippedToChampionId: 321 })
  const inventoryArtifact = makeArtifact({ equippedToChampionId: null })
  const rows: GearInspectorFilterRow[] = [
    { artifact: championArtifact, match: null },
    { artifact: inventoryArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerChampions: { selected: [321] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.equippedToChampionId, 321)
})

test('filterGearInspectorItems filters by wildcard roll counts', () => {
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
  const rows: GearInspectorFilterRow[] = [
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
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.rolls, 2)
})

test('filterGearInspectorItems treats legacy selected wildcard mode as any stat', () => {
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
  const rows: GearInspectorFilterRow[] = [
    { artifact: doubleRoll, match: null },
    { artifact: tripleRoll, match: null },
  ]
  const legacyTesterRolls = {
    wildcard: { mode: 'selected', counts: [2] },
    perStat: [],
  } as unknown as GearInspectorRollFilterState
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    testerRolls: legacyTesterRolls,
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.substats[0]?.rolls, 2)
})

test('filterGearInspectorItems filters by per-stat roll requirements', () => {
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
  const rows: GearInspectorFilterRow[] = [
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
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, matching.id)
})

test('filterGearInspectorItems filters by last-used presets', () => {
  const realNow = Date.now
  Date.now = () => Date.parse('2024-05-10T00:00:00Z')
  try {
    const recent = makeArtifact({ lastUseLocalTimestamp: '2024-05-09 12:00:00' })
    const older = makeArtifact({ lastUseLocalTimestamp: '2024-02-01 08:00:00' })
    const never = makeArtifact({ lastUseLocalTimestamp: null })
    const rows: GearInspectorFilterRow[] = [
      { artifact: recent, match: null },
      { artifact: older, match: null },
      { artifact: never, match: null },
    ]
    const recentState: RulesFilterState = {
      ...DEFAULT_RULES_FILTER_STATE,
      testerLastUse: {
        presets: ['recent7'],
        custom: { enabled: false, minDays: 0, maxDays: 365 },
      },
    }
    const recentResult = filterGearInspectorItems(rows, recentState)
    assert.equal(recentResult.items.length, 1)
    assert.equal(recentResult.items[0]?.artifact.id, recent.id)

    const olderState: RulesFilterState = {
      ...recentState,
      testerLastUse: {
        presets: ['older90', 'never'],
        custom: { enabled: false, minDays: 0, maxDays: 365 },
      },
    }
    const olderResult = filterGearInspectorItems(rows, olderState)
    assert.equal(olderResult.items.length, 2)
    assert.deepEqual(new Set(olderResult.items.map((row) => row.artifact.id)), new Set([older.id, never.id]))
  } finally {
    Date.now = realNow
  }
})

test('filterGearInspectorItems unions custom last-used ranges with presets', () => {
  const realNow = Date.now
  Date.now = () => Date.parse('2024-06-01T00:00:00Z')
  try {
    const mid = makeArtifact({ lastUseLocalTimestamp: '2024-04-20 00:00:00' })
    const old = makeArtifact({ lastUseLocalTimestamp: '2023-12-01 00:00:00' })
    const never = makeArtifact({ lastUseLocalTimestamp: null })
    const rows: GearInspectorFilterRow[] = [
      { artifact: mid, match: null },
      { artifact: old, match: null },
      { artifact: never, match: null },
    ]
    const rangeState: RulesFilterState = {
      ...DEFAULT_RULES_FILTER_STATE,
      testerLastUse: {
        presets: [],
        custom: { enabled: true, minDays: 30, maxDays: 90 },
      },
    }
    const rangeResult = filterGearInspectorItems(rows, rangeState)
    assert.equal(rangeResult.items.length, 1)
    assert.equal(rangeResult.items[0]?.artifact.id, mid.id)

    const rangePlusNever: RulesFilterState = {
      ...rangeState,
      testerLastUse: {
        presets: ['never'],
        custom: { enabled: true, minDays: 30, maxDays: 90 },
      },
    }
    const rangePlusNeverResult = filterGearInspectorItems(rows, rangePlusNever)
    assert.equal(rangePlusNeverResult.items.length, 2)
    assert.deepEqual(
      new Set(rangePlusNeverResult.items.map((row) => row.artifact.id)),
      new Set([mid.id, never.id]),
    )

    const rangePlusOlder: RulesFilterState = {
      ...rangeState,
      testerLastUse: {
        presets: ['older90'],
        custom: { enabled: true, minDays: 30, maxDays: 90 },
      },
    }
    const rangePlusOlderResult = filterGearInspectorItems(rows, rangePlusOlder)
    assert.equal(rangePlusOlderResult.items.length, 2)
    assert.deepEqual(
      new Set(rangePlusOlderResult.items.map((row) => row.artifact.id)),
      new Set([mid.id, old.id]),
    )
  } finally {
    Date.now = realNow
  }
})
