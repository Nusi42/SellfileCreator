import test from 'node:test'
import assert from 'node:assert/strict'
import { filterHsfRules, DEFAULT_RULES_FILTER_STATE, type RulesFilterState } from '../src/lib/rulesFilter.js'
import type { HsfRule } from '../src/lib/hsfTypes.js'
import { LEVEL_ANY_SENTINEL } from '../src/lib/types.js'

const stubRule = (overrides: Partial<HsfRule>): HsfRule => ({
  Substats: [],
  ...overrides,
})

const cloneDefaultState = (): RulesFilterState =>
  JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState

test('rarity filter hides Any entries and still applies selected rarities', () => {
  const rules: HsfRule[] = [
    stubRule({ Rarity: 0 }), // Any
    stubRule({ Rarity: 3 }), // Rare
    stubRule({ Rarity: 4 }), // Epic
  ]

  const state = cloneDefaultState()
  state.rarity = { ...state.rarity, anyMode: 'off', selected: [3] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.Rarity), [3])
})

test('rank filter hides Any entries and still applies selected ranks', () => {
  const rules: HsfRule[] = [
    stubRule({ Rank: 0 }), // Any
    stubRule({ Rank: 6 }), // 6★
    stubRule({ Rank: 5 }), // 5★
  ]

  const state = cloneDefaultState()
  state.rank = { ...state.rank, anyMode: 'off', selected: [6] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.Rank), [6])
})

test('slot filter hides Any entries and still applies selected slots', () => {
  const rules: HsfRule[] = [
    stubRule({ ArtifactType: [] }), // Any
    stubRule({ ArtifactType: [1] }), // slot 1
    stubRule({ ArtifactType: [2] }), // slot 2
  ]

  const state = cloneDefaultState()
  state.slots = { ...state.slots, anyMode: 'off', selected: [1] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.ArtifactType), [[1]])
})

test('level filter hides Any entries and still applies selected milestones', () => {
  const rules: HsfRule[] = [
    stubRule({ LVLForCheck: LEVEL_ANY_SENTINEL }), // Any
    stubRule({ LVLForCheck: 16 }),
    stubRule({ LVLForCheck: 12 }),
  ]

  const state = cloneDefaultState()
  state.level = { ...state.level, anyMode: 'off', selected: [16] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.LVLForCheck), [16])
})

test('level filter include keeps Any entries that match all milestones', () => {
  const rules: HsfRule[] = [
    stubRule({ LVLForCheck: LEVEL_ANY_SENTINEL }), // Any
    stubRule({ LVLForCheck: 16 }),
    stubRule({ LVLForCheck: 12 }),
  ]

  const state = cloneDefaultState()
  state.level = { ...state.level, anyMode: 'include', selected: [16] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.LVLForCheck), [LEVEL_ANY_SENTINEL, 16])
})

test('faction filter hides Any entries and still applies selected factions', () => {
  const rules: HsfRule[] = [
    stubRule({ Faction: 0 }), // Any
    stubRule({ Faction: 1 }),
    stubRule({ Faction: 2 }),
  ]

  const state = cloneDefaultState()
  state.faction = { ...state.faction, anyMode: 'off', selected: [2] }

  const { rules: filtered } = filterHsfRules(rules, state)
  assert.deepEqual(filtered.map(r => r.Faction), [2])
})

export const __rulesFilterRarityTestMarker = true
