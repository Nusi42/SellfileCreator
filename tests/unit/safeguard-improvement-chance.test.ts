/* eslint import/no-unused-modules: off */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSafeguardImprovementChanceByArtifactId } from '../../src/lib/safeguardImprovementChance.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { ArtifactSet, ArtifactType, StatId, StatVariant, type LevelMilestone, type RankValue } from '../../src/lib/types.js'
import { configureWasmRuleEngineWithLoadedWasm } from '../../src/lib/wasm/wasmRuleEngine.js'

// Test helper: configures WASM, stores artifacts, then computes improvement chance.
const computeChance = (
  artifacts: readonly NormalizedGearArtifact[],
  rules: readonly SafeguardRule[],
) => {
  // WASM engine requires a configure call before storing artifact rows.
  configureWasmRuleEngineWithLoadedWasm({ rules: [], recipeModes: [] })
  storeArtifactRows(artifacts.map(toWasmArtifactStoreRow))
  return buildSafeguardImprovementChanceByArtifactId(rules)
}

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
    equippedChampionAscensionLevel: null,
    source: 'manual',
    equippedChampionName: null,
    equippedChampionLocation: null,
    lastUseLocalTimestamp: null,
  }
}

// Rules no longer have an id field; ordinal is derived from position in the input array.
const makeSpdSafeguardRule = (name: string): SafeguardRule => ({
  name,
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
  improvementChanceThreshold: null,
  substats: [StatVariant.SPD],
  substatMatch: SafeguardSubstatMatch.Min1,
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
  const chance = computeChance(
    [candidate, challenger],
    [makeSpdSafeguardRule('sg_spd')],
  ).get(1)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  // Single rule at index 0 → ordinal 1.
  assert.equal(chance?.ruleOrdinal, 1)
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
  const chanceById = computeChance(
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
  const chanceMap = computeChance([candidate], [rule])
  // WASM omits entries for artifacts with no applicable scenarios (empty result).
  const chance = chanceMap.get(20)
  assert.equal(chance?.chancePercent ?? 0, 0)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), false)
  assert.equal(chance?.ruleOrdinal ?? null, null)
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
  const chance = computeChance(
    [candidate],
    [makeSpdSafeguardRule('sg_spd_only')],
  ).get(30)
  assert.equal(chance?.chancePercent, 0)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), false)
  assert.equal(chance?.ruleOrdinal ?? null, null)
})

test('keeps no-SPD low-rarity gear eligible when future substat additions can still roll SPD', () => {
  const candidate = makeArtifact({
    id: 31,
    level: 0,
    rarity: 1,
    substats: [makeSubstat(StatVariant.HP, 5, 0)],
  })
  const chance = computeChance(
    [candidate],
    [makeSpdSafeguardRule('sg_spd_addable')],
  ).get(31)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  // Single rule at index 0 → ordinal 1.
  assert.equal(chance?.ruleOrdinal, 1)
  assert.ok((chance?.chancePercent ?? 0) > 0, `expected > 0, got ${String(chance?.chancePercent)}`)
  assert.ok((chance?.chancePercent ?? 0) < 100, `expected < 100, got ${String(chance?.chancePercent)}`)
})

test('prefers the most likely safeguard for ruleOrdinal when multiple safeguards apply', () => {
  const candidate = makeArtifact({
    id: 41,
    level: 0,
    rarity: 1,
    substats: [
      makeSubstat(StatVariant.SPD, 5, 0),
      makeSubstat(StatVariant.HP, 5, 0),
    ],
  })
  const chance = computeChance(
    [candidate],
    [
      makeSpdSafeguardRule('sg_spd_best'),
      {
        ...makeSpdSafeguardRule('sg_spd_acc_all'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.Min2,
      },
    ],
  ).get(41)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  // sg_spd_best is at index 0 (ordinal 1); sg_spd_acc_all (All match) is less likely.
  assert.equal(chance?.ruleOrdinal, 1)
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
  const chance = computeChance(
    [candidate],
    [
      {
        ...makeSpdSafeguardRule('sg_less_matching'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.Min1,
      },
      {
        ...makeSpdSafeguardRule('sg_more_matching'),
        substats: [StatVariant.SPD, StatVariant.HP],
        substatMatch: SafeguardSubstatMatch.Min1,
      },
    ],
  ).get(51)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.chancePercent, 100)
  // sg_less_matching (SPD+ACC) is at ordinal 1; sg_more_matching (SPD+HP) is at ordinal 2.
  // More matching substats wins, so ordinal 2 is preferred.
  assert.equal(chance?.ruleOrdinal, 2)
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
  const chance = computeChance(
    [candidate],
    [
      {
        ...makeSpdSafeguardRule('sg_top_rule'),
        substats: [StatVariant.SPD, StatVariant.ACC],
        substatMatch: SafeguardSubstatMatch.Min1,
      },
      {
        ...makeSpdSafeguardRule('sg_bottom_rule'),
        substats: [StatVariant.SPD, StatVariant.RES],
        substatMatch: SafeguardSubstatMatch.Min1,
      },
    ],
  ).get(52)
  assert.equal(Boolean(chance?.hasMatchingSafeguard), true)
  assert.equal(chance?.chancePercent, 100)
  // sg_top_rule is at index 0 (ordinal 1); ties broken by list order so ordinal 1 wins.
  assert.equal(chance?.ruleOrdinal, 1)
})
