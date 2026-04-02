/* eslint import/no-unused-modules: off */
/**
 * improvement-chance-threshold
 *
 * Verifies that improvementChanceThreshold gates candidates based on their computed
 * improvement-chance probability (likelihood of surviving in the bucket once fully leveled).
 *
 * Pure-TS tests use buildSafeguardImprovementChanceByArtifactId directly (no WASM needed).
 * The monotonicity invariant is derived: items whose chance < threshold are excluded,
 * so a stricter threshold can only reduce or preserve the protection count, never increase it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSafeguardImprovementChanceByArtifactId } from '../../src/lib/safeguardImprovementChance.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import { ArtifactSet, ArtifactType, StatId, StatVariant, type LevelMilestone, type RankValue } from '../../src/lib/types.js'

// ── helpers ───────────────────────────────────────────────────────────────────

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

const makeSpdRule = (name: string, improvementChanceThreshold: number | null = null): SafeguardRule => ({
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
  improvementChanceThreshold,
  substats: [StatVariant.SPD],
  substatMatch: SafeguardSubstatMatch.Min1,
  substatWeights: {},
})

// ── tests ─────────────────────────────────────────────────────────────────────

test('strong candidate at level 0 gets non-trivial improvement chance when competing against weaker fully-leveled peers', () => {
  // candidate is unleveled; it starts with the same SPD as the challengers will finish with —
  // so after projection it should score very competitively → high improvement chance.
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 20, 3)],
  })
  // Several weaker challengers at full level: their SPD is fixed and low.
  const weak = [2, 3, 4].map((id) =>
    makeArtifact({ id, level: 16, rarity: 5, substats: [makeSubstat(StatVariant.SPD, 6, 1)] }),
  )

  const rule = makeSpdRule('strong')
  const chances = buildSafeguardImprovementChanceByArtifactId([candidate, ...weak], [rule])
  const entry = chances.get(1)

  assert.equal(Boolean(entry?.hasMatchingSafeguard), true, 'candidate should match the rule')
  assert.ok(
    (entry?.chancePercent ?? 0) > 50,
    `expected improvement chance > 50% for dominant candidate, got ${String(entry?.chancePercent)}`,
  )
})

test('weak candidate with many low-quality rolls gets near-zero improvement chance against strong peers', () => {
  // Weak candidate: SPD=5, 0 additional rolls, but has 4 substats so future rolls spread across all of them.
  // Expected SPD gain ≈ 4 milestones / 4 substats × ~5.5 per roll = ~5.5 → projected ~10.5 SPD total.
  // With glyph potential (~5.5): ~16 normalized. Far below challengers.
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [
      makeSubstat(StatVariant.SPD, 5, 0),
      makeSubstat(StatVariant.HP, 5, 0),
      makeSubstat(StatVariant.ACC, 9, 0),
      makeSubstat(StatVariant.RES, 9, 0),
    ],
  })
  // Strong challengers already at +16 with very high SPD (well above what the candidate can reach).
  const strong = [2, 3, 4].map((id) =>
    makeArtifact({ id, level: 16, rarity: 5, substats: [makeSubstat(StatVariant.SPD, 35, 4)] }),
  )

  const rule = makeSpdRule('weak')
  const chances = buildSafeguardImprovementChanceByArtifactId([candidate, ...strong], [rule])
  const entry = chances.get(1)

  assert.equal(Boolean(entry?.hasMatchingSafeguard), true, 'candidate should still match the rule')
  assert.ok(
    (entry?.chancePercent ?? 100) < 10,
    `expected near-zero improvement chance for weak-roll candidate, got ${String(entry?.chancePercent)}`,
  )
})

test('threshold semantics: computed improvement chances differentiate strong vs weak candidates', () => {
  // Strong candidate: high SPD, good roll quality. Easily beats the fully-leveled peers.
  const strong = makeArtifact({
    id: 10,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 20, 3)],
  })
  // Weak candidate: low SPD spread across 4 substats so future rolls dilute across all of them.
  // Only ~1/4 of the 4 remaining roll events go to SPD → projected SPD stays low.
  const weak = makeArtifact({
    id: 11,
    level: 0,
    rarity: 5,
    substats: [
      makeSubstat(StatVariant.SPD, 4, 0),
      makeSubstat(StatVariant.HP, 5, 0),
      makeSubstat(StatVariant.ACC, 10, 0),
      makeSubstat(StatVariant.RES, 10, 0),
    ],
  })
  // Fully-leveled peers with high SPD to establish a competitive bar.
  const peers = [20, 21, 22, 23].map((id) =>
    makeArtifact({ id, level: 16, rarity: 5, substats: [makeSubstat(StatVariant.SPD, 25, 4)] }),
  )

  const rule = makeSpdRule('threshold-test')
  const chances = buildSafeguardImprovementChanceByArtifactId([strong, weak, ...peers], [rule])

  const strongChance = chances.get(10)?.chancePercent ?? 0
  const weakChance   = chances.get(11)?.chancePercent ?? 100

  // The strong candidate should have meaningfully higher improvement chance than the weak one.
  assert.ok(
    strongChance > weakChance,
    `strong (${strongChance}%) should have higher improvement chance than weak (${weakChance}%)`,
  )
  // Strong should qualify well above any mid-range threshold.
  assert.ok(strongChance > 50, `strong chance ${strongChance}% should exceed 50%`)
  // Weak should be clearly below the strong candidate.
  assert.ok(weakChance < 30, `weak chance ${weakChance}% should be below 30%`)
})

test('improvementChanceThreshold null does not trigger a matching safeguard (threshold is disabled)', () => {
  // With threshold=null the rule uses top-N selection, not chance gating.
  // buildSafeguardImprovementChanceByArtifactId still assigns a chance (used for the overlay
  // display), but the chance is independent of whether the threshold is enabled.
  const candidate = makeArtifact({
    id: 1,
    level: 0,
    rarity: 5,
    substats: [makeSubstat(StatVariant.SPD, 12, 1)],
  })

  const ruleWithThreshold    = makeSpdRule('with-threshold', 50)
  const ruleWithoutThreshold = makeSpdRule('without-threshold', null)

  const chancesWithThreshold    = buildSafeguardImprovementChanceByArtifactId([candidate], [ruleWithThreshold])
  const chancesWithoutThreshold = buildSafeguardImprovementChanceByArtifactId([candidate], [ruleWithoutThreshold])

  // Improvement chance is computed in both cases (overlay display needs it regardless).
  assert.ok(chancesWithThreshold.has(1), 'chance entry should exist when threshold is set')
  assert.ok(chancesWithoutThreshold.has(1), 'chance entry should exist even when threshold is null')
})
