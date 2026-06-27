/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterGearInspectorItems, DEFAULT_RULES_FILTER_STATE, type GearInspectorFilterRow, type RulesFilterState, type GearInspectorRollFilterState, type GearInspectorContextGroup } from '../../src/lib/rulesFilter.js'
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
  equippedChampion: null,
  source: 'artifacts',
  lastUseLocalTimestamp: null,
  isLocked: false,
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

test('filterGearInspectorItems name filter sees every matched recipe, not just the winner', () => {
  // The item's winning match is recipe 0 ("Speed Farm"), but it also matches recipe 1
  // ("Arena Nuker") as a secondary rule. Searching the secondary recipe's name must still
  // surface the item — otherwise combining the name filter with other options drops rows
  // whose searched recipe is not their winning match.
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 }, matchingRecipeIndices: [0, 1] },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: true, recipeIdx: 0 }, matchingRecipeIndices: [0] },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    recipeName: { query: 'Arena' },
  }
  const result = filterGearInspectorItems(rows, state, undefined, { recipeNames: ['Speed Farm', 'Arena Nuker'] })
  // Only the first row matches "Arena" (via its secondary recipe); the second never matches recipe 1.
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.match?.recipeIdx, 0)
})

test('filterGearInspectorItems name filter intersects with other options (AND)', () => {
  // Both rows match recipe 1 ("Arena Nuker"); the set filter narrows to Speed only.
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact({ set: ArtifactSet.Speed }), match: { keep: true, recipeIdx: 1 }, matchingRecipeIndices: [1] },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: true, recipeIdx: 1 }, matchingRecipeIndices: [1] },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    recipeName: { query: 'Arena' },
    sets: { ...DEFAULT_RULES_FILTER_STATE.sets, selected: [{ id: ArtifactSet.Speed }] },
  }
  const result = filterGearInspectorItems(rows, state, undefined, { recipeNames: ['Speed Farm', 'Arena Nuker'] })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.set, ArtifactSet.Speed)
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

test('filterGearInspectorItems filters by tester Keep/Sell result (plain mode)', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: { keep: false, recipeIdx: 1 } },
    { artifact: makeArtifact({ set: ArtifactSet.Immortal }), match: null },
  ]
  // Keep-only: shows only keep-tagged items.
  const keepState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: false, matched: false, unmatched: false },
  }
  const keepMatches = filterGearInspectorItems(rows, keepState)
  assert.equal(keepMatches.items.length, 1)
  assert.equal(keepMatches.items[0]?.match?.keep, true)

  // Sell-only: shows only sell-tagged items.
  const sellState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: true, matched: false, unmatched: false },
  }
  const sellMatches = filterGearInspectorItems(rows, sellState)
  assert.equal(sellMatches.items.length, 1)
  assert.equal(sellMatches.items[0]?.match?.keep, false)

  // Keep+Sell both active: shows all matched items (keep and sell combined).
  const bothState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: true, matched: false, unmatched: false },
  }
  const bothMatches = filterGearInspectorItems(rows, bothState)
  assert.equal(bothMatches.items.length, 2)
  assert.equal(bothMatches.items.filter((r) => r.match !== null).length, 2)
})

test('filterGearInspectorItems filters by matched vs unmatched gear (plain mode)', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
    { artifact: makeArtifact({ set: ArtifactSet.Life }), match: null },
  ]
  // Keep+Sell combined = all matched items (replaces old matched='yes' behavior).
  const matchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: true, matched: false, unmatched: false },
  }
  const matched = filterGearInspectorItems(rows, matchedState)
  assert.equal(matched.items.length, 1)
  assert.equal(matched.items[0]?.match?.recipeIdx, 0)

  // Unmatched alone = unmatched items only (plain filter, no context mode).
  const unmatchedState: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: false, matched: false, unmatched: true },
  }
  const unmatched = filterGearInspectorItems(rows, unmatchedState)
  assert.equal(unmatched.items.length, 1)
  assert.equal(unmatched.items[0]?.match, null)
})

test('filterGearInspectorItems filters by tester sources', () => {
  const manual = makeArtifact({ source: 'manual' })
  const inventory = makeArtifact()
  // Equipped artifact carries a champion reference; the rulesFilter "collection" source
  // category looks at equippedChampion?.location, so we provide a minimal lookup record.
  const collection = makeArtifact({
    equippedChampion: {
      id: 101,
      name: 'Test Champ',
      location: 'collection',
      baseHeroId: null,
      rarity: null,
      ascensionLevel: null,
      empowermentLevel: null,
      affinity: null,
      blessingGrade: null,
      starGrade: null,
      experienceLevel: null,
    },
  })
  const rows: GearInspectorFilterRow[] = [
    { artifact: manual, match: null },
    { artifact: inventory, match: null },
    { artifact: collection, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorSources: { selected: ['manual'] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.source, 'manual')
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
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], gearInspectorRange: { min: 12, max: 16 } },
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
    level: { ...DEFAULT_RULES_FILTER_STATE.level, selected: [], gearInspectorRange: { min: 16, max: 16 } },
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
    gearInspectorChaos: { mode: 'rerolled' },
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
    gearInspectorGlyphs: { mode: 'on' },
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
    gearInspectorGlyphs: { mode: 'selected' },
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
    gearInspectorAscension: { stars: [3], stats: [StatVariant.SPD] },
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
    gearInspectorRolls: {
      wildcard: { mode: 'off', counts: [] },
      perStat: [{ stat: StatVariant.SPD, counts: [5] }],
    },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact, mythArtifact)
})

test('filterGearInspectorItems filters by champion selection', () => {
  const championArtifact = makeArtifact({
    equippedChampion: {
      id: 321,
      name: null,
      location: 'collection',
      baseHeroId: null,
      rarity: null,
      ascensionLevel: null,
      empowermentLevel: null,
      affinity: null,
      blessingGrade: null,
      starGrade: null,
      experienceLevel: null,
    },
  })
  const inventoryArtifact = makeArtifact({})
  const rows: GearInspectorFilterRow[] = [
    { artifact: championArtifact, match: null },
    { artifact: inventoryArtifact, match: null },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorChampions: { selected: [321] },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.equippedChampion?.id, 321)
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
    gearInspectorRolls: {
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
    gearInspectorRolls: legacyTesterRolls,
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
    gearInspectorRolls: {
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
      gearInspectorLastUse: {
        presets: ['recent7'],
        custom: { enabled: false, minDays: 0, maxDays: 365 },
      },
    }
    const recentResult = filterGearInspectorItems(rows, recentState)
    assert.equal(recentResult.items.length, 1)
    assert.equal(recentResult.items[0]?.artifact.id, recent.id)

    const olderState: RulesFilterState = {
      ...recentState,
      gearInspectorLastUse: {
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
      gearInspectorLastUse: {
        presets: [],
        custom: { enabled: true, minDays: 30, maxDays: 90 },
      },
    }
    const rangeResult = filterGearInspectorItems(rows, rangeState)
    assert.equal(rangeResult.items.length, 1)
    assert.equal(rangeResult.items[0]?.artifact.id, mid.id)

    const rangePlusNever: RulesFilterState = {
      ...rangeState,
      gearInspectorLastUse: {
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
      gearInspectorLastUse: {
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

// ---------- Context mode (Matched / Unmatched) ----------

test('Matched+Sell context mode: sell=primary, companion=companion, other hidden', () => {
  // A and B are the same Speed/Helmet set-mates; A is sell-tagged.
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  // C shares set but different slot — not a companion of A.
  const artC = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Boots })
  // D shares slot but different set — not a companion of A.
  const artD = makeArtifact({ set: ArtifactSet.Life, slot: ArtifactType.Helmet })
  // E has a different set — truly unrelated, no match.
  const artE = makeArtifact({ set: ArtifactSet.Immortal, slot: ArtifactType.Helmet })

  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell-tagged → primary
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // companion → companion
    { artifact: artC, match: { keep: true,  recipeIdx: 2 } }, // other (different slot) → hidden
    { artifact: artD, match: { keep: true,  recipeIdx: 3 } }, // other (different set) → hidden
    { artifact: artE, match: null },                          // other (different set, unmatched) → hidden
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: true, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  // Only sell + companion items survive; other group is hidden in Matched mode.
  assert.equal(result.items.length, 2)
  const ids = new Set(result.items.map((r) => r.artifact.id))
  assert.ok(ids.has(artA.id), 'sell item should be visible')
  assert.ok(ids.has(artB.id), 'companion should be visible')

  // contextGroupById must be present and correct.
  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.ok(g instanceof Map, 'contextGroupById should be a Map')
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'companion')
  assert.equal(g.get(artC.id), 'other')
  assert.equal(g.get(artD.id), 'other')
  assert.equal(g.get(artE.id), 'other')
})

test('Matched+Keep context mode: companion=primary, sell=companion, other hidden', () => {
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artC = makeArtifact({ set: ArtifactSet.Life, slot: ArtifactType.Helmet })
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell-tagged → companion group in Keep focus
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // set-mate of sell → primary group
    { artifact: artC, match: { keep: true,  recipeIdx: 2 } }, // other → hidden
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: false, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  assert.equal(result.items.length, 2)
  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.equal(g.get(artA.id), 'companion')  // sell-tagged is companion in Keep focus
  assert.equal(g.get(artB.id), 'primary')    // set-mate of sell item is primary
  assert.equal(g.get(artC.id), 'other')
})

test('Unmatched+Sell context mode: shows other group at 25% (all items returned)', () => {
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artC = makeArtifact({ set: ArtifactSet.Life, slot: ArtifactType.Helmet })
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell → primary
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // companion → companion
    { artifact: artC, match: null },                          // other → shown (Unmatched expands view)
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: true, matched: false, unmatched: true },
  }
  const result = filterGearInspectorItems(rows, state)

  // All three items visible; companion loses elevation when Matched is off.
  assert.equal(result.items.length, 3)
  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'other')   // no elevation without Matched
  assert.equal(g.get(artC.id), 'other')
})

test('Matched+Keep+Sell context mode: sell+companions both primary, other hidden', () => {
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artC = makeArtifact({ set: ArtifactSet.Life, slot: ArtifactType.Helmet })
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell → primary
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // companion → primary
    { artifact: artC, match: { keep: true,  recipeIdx: 2 } }, // other → hidden
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: true, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  assert.equal(result.items.length, 2)
  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'primary')
  assert.equal(g.get(artC.id), 'other')
})

test('Matched alone (no Keep/Sell) defaults to sell focus', () => {
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Helmet })
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell → primary (sell focus default)
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // companion → companion
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: false, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  // Default sell focus: sell item is primary, companion is companion.
  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'companion')
})

test('set=0 (no-set) artifact has no companions even if same set+slot', () => {
  // Two Helmets with set=0 must NOT companion each other per spec.
  const artA = makeArtifact({ set: 0 as ArtifactSet, slot: ArtifactType.Helmet })
  const artB = makeArtifact({ set: 0 as ArtifactSet, slot: ArtifactType.Helmet })
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } }, // sell-tagged
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } }, // not a companion — set=0
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: true, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  // artA is sell-tagged → primary; artB has no companion key (set=0) → other → hidden.
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'other')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.artifact.id, artA.id)
})

test('accessory companions match by set + slot + faction', () => {
  // Three rings with the same set but different factions — only same-faction pair are companions.
  const artA = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Ring, faction: 1 })
  const artB = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Ring, faction: 1 }) // companion of A
  const artC = makeArtifact({ set: ArtifactSet.Speed, slot: ArtifactType.Ring, faction: 2 }) // different faction
  const rows: GearInspectorFilterRow[] = [
    { artifact: artA, match: { keep: false, recipeIdx: 0 } },
    { artifact: artB, match: { keep: true,  recipeIdx: 1 } },
    { artifact: artC, match: { keep: true,  recipeIdx: 2 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: false, sell: true, matched: true, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)

  const g = result.contextGroupById as Map<number, GearInspectorContextGroup>
  assert.equal(g.get(artA.id), 'primary')
  assert.equal(g.get(artB.id), 'companion') // same faction → companion
  assert.equal(g.get(artC.id), 'other')     // different faction → not companion
  assert.equal(result.items.length, 2)
})

test('plain filter mode does not populate contextGroupById', () => {
  const rows: GearInspectorFilterRow[] = [
    { artifact: makeArtifact(), match: { keep: true, recipeIdx: 0 } },
  ]
  const state: RulesFilterState = {
    ...DEFAULT_RULES_FILTER_STATE,
    gearInspectorResult: { keep: true, sell: false, matched: false, unmatched: false },
  }
  const result = filterGearInspectorItems(rows, state)
  assert.equal(result.contextGroupById, undefined)
})
