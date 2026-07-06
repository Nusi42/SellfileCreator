/* eslint import/no-unused-modules: off */
/**
 * improvement-chance-per-rule
 *
 * Regression test for the per-rule improvement_chance semantic. Each safeguard rule's
 * improvement_chance is "chance this piece lands in THIS rule's top-N at +16" — never
 * the global union of "any safeguard would protect it." This means raising one rule's
 * `requiredCount` cannot inflate another rule's improvement_chance and therefore cannot
 * push items into an earlier rule's expansion set via threshold gating.
 *
 * Verifies via the user-reported scenario from a planning note:
 * raising rule B's count from 4 → 32 must NOT change rule A's per-rule chance for any
 * shared artifact, even though both rules target overlapping items.
 */
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

// Reset WASM state, store artifacts, compute improvement-chance entries.
const computeChance = (
  artifacts: readonly NormalizedGearArtifact[],
  rules: readonly SafeguardRule[],
) => {
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

const makeSubstat = (variant: StatVariant, totalValue: number, rolls = 0): NormalizedStat => {
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
    exactLevel: params.level,
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
    equippedChampion: null,
    source: 'manual',
    lastUseLocalTimestamp: null,
    isLocked: false,
  }
}

// Build a one-substat (SPD-only) rule with the given requiredCount; rules apply to the same
// slot/set/faction bucket so they share the same challenger pool.
const makeSpdRule = (name: string, requiredCount: number): SafeguardRule => ({
  ...(name ? { appearance: { name } } : {}),
  weightMainStatByRank: false,
  mainStatRankWeightFactor: 1,
  combination: {
    slots: [ArtifactType.Weapon],
    sets: [],
    metaSetNames: [],
    ranks: [],
    rarities: [],
    mainStats: [],
    factions: [],
  },
  requiredCount,
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

// Extract the per-rule chance entry for a given (artifactId, ruleOrdinal) pair.
const chanceForRule = (
  chances: ReturnType<typeof computeChance>,
  artifactId: number,
  ruleOrdinal: number,
): number | null => {
  const entry = chances.get(artifactId)
  if (!entry) return null
  const ruleEntry = entry.chancesByRuleOrdinal.find((r) => r.ruleOrdinal === ruleOrdinal)
  return ruleEntry ? ruleEntry.chancePercent : null
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('per-rule chance: rule A is invariant to rule B requiredCount changes (no cross-rule inflation)', () => {
  // 4 challengers fully-leveled with mid-range SPD; sit above the candidate at rule A's tight top-2
  // but below where the candidate could reach in rule B's wider top-32.
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 10, 1)],
  })
  const peers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) =>
    makeArtifact({ id, level: 16, rarity: 5, substats: [makeSubstat(StatVariant.SPD, 18, 3)] }),
  )

  // Rule A: tight (requiredCount=2). Rule B: wide (requiredCount=4 vs 32).
  const ruleA = makeSpdRule('rule-A-tight', 2)
  const ruleBSmall = makeSpdRule('rule-B-small', 4)
  const ruleBLarge = makeSpdRule('rule-B-large', 32)

  // Run with rule B at count=4 vs count=32; rule A is identical in both runs.
  const smallRun = computeChance([candidate, ...peers], [ruleA, ruleBSmall])
  const largeRun = computeChance([candidate, ...peers], [ruleA, ruleBLarge])

  const candidateAInSmall = chanceForRule(smallRun, 1, 1) // rule A ordinal = 1
  const candidateAInLarge = chanceForRule(largeRun, 1, 1)

  assert.ok(candidateAInSmall !== null, 'rule A chance must be reported when rule applies')
  assert.ok(candidateAInLarge !== null, 'rule A chance must be reported in large run too')
  assert.equal(
    candidateAInSmall,
    candidateAInLarge,
    `rule A's chance must be invariant to rule B's count; got ${String(candidateAInSmall)} vs ${String(candidateAInLarge)}`,
  )

  // Sanity check the design intent: rule B's own chance MUST grow when its count widens
  // (the candidate falls inside top-32 but not top-4 of peers, all of which beat it).
  const candidateBInSmall = chanceForRule(smallRun, 1, 2) // rule B ordinal = 2
  const candidateBInLarge = chanceForRule(largeRun, 1, 2)
  assert.ok(candidateBInSmall !== null && candidateBInLarge !== null, 'rule B chances reported')
  assert.ok(
    candidateBInLarge >= candidateBInSmall,
    `rule B's own chance is monotonic in its required_count; got small=${String(candidateBInSmall)} large=${String(candidateBInLarge)}`,
  )
})

test('per-rule chance: candidate not applicable to a rule gets no entry for that rule', () => {
  // Rule X targets Helmet; candidate is a Weapon. Rule X must not appear in candidate's per-rule list.
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 10, 1)],
  })

  const helmetRule: SafeguardRule = {
    ...makeSpdRule('helmet-only', 4),
    combination: {
      slots: [ArtifactType.Helmet],
      sets: [],
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
  }
  const weaponRule = makeSpdRule('weapon-rule', 4)
  const chances = computeChance([candidate], [helmetRule, weaponRule])

  const entry = chances.get(1)
  assert.ok(entry, 'candidate should have an entry')
  const ordinals = entry.chancesByRuleOrdinal.map((r) => r.ruleOrdinal)
  // Weapon-rule ordinal = 2; helmet-rule ordinal = 1.
  assert.ok(ordinals.includes(2), 'weapon rule (ordinal 2) must apply to the weapon candidate')
  assert.ok(!ordinals.includes(1), 'helmet rule (ordinal 1) must NOT appear for a weapon candidate')
})

test('per-rule chance: chancePercent equals max across per-rule chances (used by overlay display)', () => {
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 10, 1)],
  })

  // Two rules; widely different required_counts so their chances diverge.
  const tight = makeSpdRule('tight', 1)
  const wide = makeSpdRule('wide', 64)
  const chances = computeChance([candidate], [tight, wide])

  const entry = chances.get(1)
  assert.ok(entry, 'entry exists')
  const ruleChances = entry.chancesByRuleOrdinal.map((r) => r.chancePercent)
  const maxRule = Math.max(...ruleChances)
  // The overlay's single-value `chancePercent` must match the maximum across rules — this is
  // the SSOT contract that lets the gear-inspector overlay show one value per artifact.
  assert.equal(
    entry.chancePercent,
    maxRule,
    `chancePercent should equal max(perRuleChances); got entry.chancePercent=${String(entry.chancePercent)} max=${String(maxRule)}`,
  )
})
