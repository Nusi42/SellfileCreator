/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SAFEGUARD_DEFAULT_COUNT_MODE, SafeguardRuleActivation, collectSafeguardCandidates, computeSafeguardProtection, hashSafeguardCombination, normalizeSafeguardRule, resolveSafeguardRuleLabel, resolveSafeguardRulesWithMetasets, buildDefaultSafeguardRules } from '../../src/lib/safeguards.js'
import { normalizeArtifactSetSelections } from '../../src/lib/gearSets/selection.js'
import { ArtifactSet, ArtifactType, Faction, StatVariant, LEVEL_ANY_SENTINEL, RarityCode, type RankValue } from '../../src/lib/types.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import type { SafeguardRule } from '../../src/lib/safeguards.js'
import type { Metaset } from '../../src/lib/metasets.js'
import { buildSafeguardRules, prependSafeguardRules, RULE_SOURCE_SAFEGUARDS } from '../../src/lib/merge.js'
import type { HsfRuleWithRecipe } from '../../src/lib/merge.js'
import {
  mergeSafeguardInjectedRulesWithLoadedWasm,
  warmupWasmRuleEngine,
} from '../../src/lib/wasm/wasmRuleEngine.js'

let nextArtifactId = 1

const buildMainStat = (variant: StatVariant): NormalizedStat => ({
  source: 'main',
  statId: 1,
  isFlat: false,
  variant,
  baseValue: 0,
  glyphValue: 0,
  mythValue: 0,
  totalValue: 0,
})

const buildSubstat = (variant: StatVariant, totalValue: number): NormalizedStat => ({
  source: 'substat',
  statId: 1,
  isFlat: variant === StatVariant.HP_FLAT || variant === StatVariant.DEF_FLAT || variant === StatVariant.ATK_FLAT,
  variant,
  baseValue: totalValue,
  glyphValue: 0,
  mythValue: 0,
  totalValue,
})

const makeArtifact = (overrides: Partial<NormalizedGearArtifact> = {}, variant: StatVariant = StatVariant.ATK): NormalizedGearArtifact => {
  const slot = overrides.slot ?? ArtifactType.Weapon
  const set = overrides.set ?? ArtifactSet.Speed
  return {
    id: overrides.id ?? nextArtifactId++,
    slot,
    set,
    rank: overrides.rank ?? 6,
    rarity: overrides.rarity ?? 6,
    level: overrides.level ?? 16,
    exactLevel: overrides.exactLevel ?? null,
    faction: overrides.faction ?? 0,
    mainStat: overrides.mainStat ?? buildMainStat(variant),
    substats: overrides.substats ?? [],
    ascension: overrides.ascension ?? null,
    gearInspectorItem: overrides.gearInspectorItem ?? {
      slot,
      set,
      rank: overrides.rank ?? 6,
      rarity: overrides.rarity ?? 6,
      level: overrides.level ?? 16,
      previewExtras: {},
    },
    rerollCount: overrides.rerollCount ?? 0,
    equippedToChampionId: overrides.equippedToChampionId ?? null,
    equippedChampionBaseId: overrides.equippedChampionBaseId ?? null,
    equippedChampionRarity: overrides.equippedChampionRarity ?? null,
    equippedChampionAscensionLevel: overrides.equippedChampionAscensionLevel ?? null,
    source: overrides.source ?? 'manual',
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
    lastUseLocalTimestamp: overrides.lastUseLocalTimestamp ?? null,
  }
}

const makeGearInspectorRow = (overrides: Partial<NormalizedGearArtifact> = {}, keep = false, variant: StatVariant = StatVariant.ATK): GearInspectorPreviewRow => {
  const artifact = makeArtifact(overrides, variant)
  const match = keep ? { keep: true, recipeIdx: 0, recipeName: 'Keep', ruleIndex: 0, ruleLabel: null, ruleSource: 'sfc', safeguardRuleId: null, safeguardRuleOrdinal: null } : null
  return {
    artifact,
    match,
    baseMatch: match,
    matchingRecipeIndices: keep ? [0] : [],
    matchingRecipeDecisions: keep ? [{ recipeIdx: 0, keep: true }] : [],
  }
}

const makeRule = (overrides: Partial<SafeguardRule> = {}): SafeguardRule => {
  const rule = normalizeSafeguardRule({
    combination: overrides.combination ?? {
      slots: [ArtifactType.Weapon],
      // Default to a single entry object to match selection shape.
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [6],
      rarities: [6],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
    requiredCount: overrides.requiredCount ?? 1,
    activation: overrides.activation ?? SafeguardRuleActivation.ProtectExisting,
    countMode: overrides.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE,
    ignorePreviousSafeguards: overrides.ignorePreviousSafeguards,
    ignoreEquippedInCollection: overrides.ignoreEquippedInCollection,
    ignoreEquippedInVault: overrides.ignoreEquippedInVault,
    // Pass optional substat ranking fields through so tests can exercise ranked mode.
    substats: overrides.substats,
    substatMatch: overrides.substatMatch,
    substatWeights: overrides.substatWeights,
  })
  if (!rule) throw new Error('expected combination')
  return rule
}

test('hashSafeguardCombination differentiates accessory factions', () => {
  const base = {
    slots: [ArtifactType.Ring],
    sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
    metaSetNames: [],
    ranks: [6 as RankValue],
    rarities: [6 as RankValue],
    mainStats: [StatVariant.HP],
    factions: [1],
  }
  const hashA = hashSafeguardCombination(base)
  const hashB = hashSafeguardCombination({ ...base, factions: [2] })
  assert.notStrictEqual(hashA, hashB, 'different factions should yield different hashes')
})

test('normalizeSafeguardRule supports readable wrapper payloads', () => {
  // Readable exports may wrap safeguard rules in `{ kind, rule }`.
  const normalized = normalizeSafeguardRule({
    kind: 'safeguardRule',
    rule: {
      requiredCount: 3,
      activation: SafeguardRuleActivation.AnticipateGaps,
      countMode: {
        perRule: false,
        perSet: true,
        perFaction: true,
        perMainStat: false,
        perSlot: true,
      },
      ignorePreviousSafeguards: false,
      ignoreEquippedInCollection: true,
      ignoreEquippedInVault: true,
      tuple: {
        slots: ['Banner'],
        sets: [],
        metaSetNames: [],
        ranks: ['5★', '6★'],
        rarities: ['Rare', 'Epic', 'Legendary', 'Mythical'],
        mainStats: [],
        factions: [],
      },
      name: 'Reserve: Speed Banner',
    },
  })
  assert.ok(normalized, 'wrapper payload should normalize into a safeguard rule')
  assert.strictEqual(normalized.name, 'Reserve: Speed Banner')
  assert.deepStrictEqual(normalized.combination.slots, [ArtifactType.Banner])
  assert.deepStrictEqual(normalized.combination.ranks, [5, 6])
  assert.deepStrictEqual(normalized.combination.rarities, [
    RarityCode.Rare,
    RarityCode.Epic,
    RarityCode.Legendary,
    6 as RankValue,
  ])
  assert.deepStrictEqual(normalized.countMode, {
    perRule: false,
    perSet: true,
    perFaction: true,
    perMainStat: false,
    perSlot: true,
  })
  assert.strictEqual(normalized.ignorePreviousSafeguards, false)
  assert.strictEqual(normalized.ignoreEquippedInCollection, true)
  assert.strictEqual(normalized.ignoreEquippedInVault, true)
})

test('normalizeSafeguardRule applies default toggle values', () => {
  const normalized = normalizeSafeguardRule({
    requiredCount: 1,
    activation: SafeguardRuleActivation.ProtectExisting,
    countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
    combination: {
      slots: [ArtifactType.Weapon],
      sets: [],
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
  })
  assert.ok(normalized)
  assert.strictEqual(normalized.ignorePreviousSafeguards, true)
  assert.strictEqual(normalized.ignoreEquippedInCollection, false)
  assert.strictEqual(normalized.ignoreEquippedInVault, false)
})

test('computeSafeguardProtection aggregates combination counts', () => {
  const rules = [
    makeRule({
      combination: {
        slots: [ArtifactType.Weapon],
        sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
        metaSetNames: [],
        ranks: [6 as RankValue],
        rarities: [6 as RankValue],
        mainStats: [StatVariant.ATK],
        factions: [],
      },
    }),
  ]
  const rows: GearInspectorPreviewRow[] = [
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, false, StatVariant.ATK),
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, false, StatVariant.ATK),
  ]
  const candidates = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] }).candidates
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  assert.strictEqual(snapshot.entries.length, 1)
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.currentCount, 2, 'tracks all sold artifacts')
  assert.strictEqual(entry.projectedCount, 1, 'projected count caps at the required quota when enabled')
  assert.strictEqual(entry.deficit, 0, 'no deficit once sold artifacts cover the quota')
})

test('projected count mirrors existing keep state when disabled', () => {
  const rules = [makeRule({
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Ring],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetNames: [],
      ranks: [5 as RankValue],
      rarities: [5 as RankValue],
      mainStats: [StatVariant.RES],
      factions: [3],
    },
  })]
  const rows = [
    makeGearInspectorRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
    makeGearInspectorRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
  ]
  const candidates = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] }).candidates
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: false })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.projectedCount, 0, 'disabled feature mirrors existing keep state (0 kept)')
  assert.strictEqual(entry.deficit, 0, 'deficit is zero because quota can be met if enabled')
})

test('coveredByExisting flips when existing keep rules meet requirement', () => {
  const rules = [makeRule({ requiredCount: 1 })]
  const rows: GearInspectorPreviewRow[] = []
  const candidates = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] }).candidates
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  assert.strictEqual(snapshot.entries[0]?.coveredByExisting, false, 'no gear means the quota still needs coverage')
  assert.strictEqual(snapshot.entries[0]?.deficit, 1, 'empty combos should report a deficit equal to the quota')
  assert.strictEqual(snapshot.entries[0]?.projectedCount, 0)
})

test('ignorePreviousSafeguards=false evaluates against cumulative prior safeguard state', () => {
  const firstRule = makeRule({
    requiredCount: 1,
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
  })
  const cumulativeRule = makeRule({
    requiredCount: 1,
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    ignorePreviousSafeguards: false,
  })
  const baselineRule = makeRule({
    requiredCount: 1,
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    ignorePreviousSafeguards: true,
  })
  const rows = [
    makeGearInspectorRow({
      id: 9101,
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      rank: 6 as RankValue,
      rarity: 6 as RankValue,
    }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({
    candidates,
    rules: [firstRule, cumulativeRule, baselineRule],
    enabled: true,
  })
  assert.deepStrictEqual(snapshot.entries[0]?.itemKeys, [9101], 'first rule should protect the sold candidate')
  assert.deepStrictEqual(snapshot.entries[1]?.itemKeys, [], 'cumulative rule should see the prior safeguard as already kept')
  assert.deepStrictEqual(snapshot.entries[2]?.itemKeys, [9101], 'baseline rule should ignore prior safeguards and re-evaluate from baseline')
})

test('equipped ignore toggles exclude matching collection/vault artifacts', () => {
  const collectionRule = makeRule({
    requiredCount: 1,
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    ignoreEquippedInCollection: true,
  })
  const vaultRule = makeRule({
    requiredCount: 1,
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    ignoreEquippedInVault: true,
  })
  const rows = [
    makeGearInspectorRow({
      id: 9201,
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      equippedChampionLocation: 'collection',
    }, false, StatVariant.ATK),
    makeGearInspectorRow({
      id: 9202,
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      equippedChampionLocation: 'vault',
    }, false, StatVariant.ATK),
    makeGearInspectorRow({
      id: 9203,
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      equippedChampionLocation: null,
    }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({
    candidates,
    rules: [collectionRule, vaultRule],
    enabled: true,
  })
  assert.deepStrictEqual(snapshot.entries[0]?.itemKeys, [9202], 'collection filter should skip collection-equipped candidate')
  assert.deepStrictEqual(snapshot.entries[1]?.itemKeys, [9201], 'vault filter should skip vault-equipped candidate')
})

test('per combination mode multiplies targets and deficits', () => {
  const rules = [makeRule({
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed, ArtifactSet.Accuracy]),
      metaSetNames: [],
      ranks: [6 as RankValue],
      rarities: [6 as RankValue],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
  })]
  const rows = [
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed }, false, StatVariant.ATK),
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.countMode.perRule, false)
  assert.strictEqual(entry.groupsTracked, 2, 'tracks each set/main tuple separately')
  assert.strictEqual(entry.perGroupRequiredCount, 2, 'preserves the base requirement for tooltips')
  assert.strictEqual(entry.requiredCount, 4, 'aggregated requirement scales by the number of tuples')
  assert.strictEqual(entry.deficit, 2, 'missing one artifact per tuple yields two deficits total')
})

test('per rule mode keeps a single aggregate quota', () => {
  const rules = [makeRule({
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Weapon],
      sets: [],
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
  })]
  const rows = [
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed }, false, StatVariant.ATK),
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy }, false, StatVariant.CDMG),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.countMode.perRule, true)
  assert.strictEqual(entry.groupsTracked, 1)
  assert.strictEqual(entry.requiredCount, 2)
  assert.strictEqual(entry.deficit, 0, 'no deficit because available artifacts can satisfy the quota')
})

test('custom grouping honors the selected dimensions only', () => {
  const rules = [makeRule({
    requiredCount: 1,
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed, ArtifactSet.Accuracy]),
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    countMode: { perRule: false, perSet: true, perFaction: false, perMainStat: false, perSlot: false },
  })]
  const rows = [
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, faction: 1 }, false, StatVariant.ATK),
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, faction: 2 }, false, StatVariant.DEF),
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy, faction: 1 }, false, StatVariant.CDMG),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.groupsTracked, 2, 'groups only by set when faction/main toggles are off')
  assert.strictEqual(entry.requiredCount, 2, 'requirement multiplies per set')
})

test('per-slot grouping splits quotas by slot and avoids zero-missing placeholders', () => {
  // Keep only slot grouping active so each selected slot gets its own quota.
  const rules = [makeRule({
    requiredCount: 1,
    combination: {
      slots: [ArtifactType.Weapon, ArtifactType.Helmet],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [6 as RankValue],
      rarities: [6 as RankValue],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
    countMode: { perRule: false, perSet: false, perFaction: false, perMainStat: false, perSlot: true },
  })]
  // One sold match per slot should fully satisfy the per-slot requirement.
  const rows = [
    makeGearInspectorRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed }, false, StatVariant.ATK),
    makeGearInspectorRow({ slot: ArtifactType.Helmet, set: ArtifactSet.Speed }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.groupsTracked, 2, 'slot grouping should track one group per selected slot')
  assert.strictEqual(entry.requiredCount, 2, 'required total should scale with the two slot groups')
  assert.strictEqual(entry.deficit, 0, 'no deficit is expected when both slot groups are covered')
  assert.strictEqual(entry.placeholders.length, 0, 'covered slot groups must not emit zero-missing placeholders')
})

test('ranked ties on the same main stat prefer higher rank', () => {
  const rules = [makeRule({
    requiredCount: 1,
    // Per-rule mode keeps the test focused on a single competition bucket.
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    // Keep the tuple broad so tie-break logic (not tuple filtering) decides.
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    substats: [StatVariant.SPD],
  })]
  const rows = [
    makeGearInspectorRow({
      id: 101,
      rank: 5 as RankValue,
      rarity: 6 as RankValue,
      mainStat: buildMainStat(StatVariant.ATK),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
    makeGearInspectorRow({
      id: 102,
      rank: 6 as RankValue,
      rarity: 5 as RankValue,
      mainStat: buildMainStat(StatVariant.ATK),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.deepStrictEqual(entry.itemKeys, [102], 'same-main tie should choose the higher-rank item only')
})

test('ranked ties across main stats prefer percent over matching flat stat', () => {
  const rules = [makeRule({
    requiredCount: 1,
    // Per-rule mode keeps the test focused on a single competition bucket.
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    // Keep the tuple broad so tie-break logic (not tuple filtering) decides.
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    substats: [StatVariant.SPD],
  })]
  const rows = [
    makeGearInspectorRow({
      id: 201,
      rank: 6 as RankValue,
      rarity: 6 as RankValue,
      mainStat: buildMainStat(StatVariant.ATK_FLAT),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
    makeGearInspectorRow({
      id: 202,
      rank: 6 as RankValue,
      rarity: 6 as RankValue,
      mainStat: buildMainStat(StatVariant.ATK),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.deepStrictEqual(entry.itemKeys, [202], 'percent main stat should win over the matching flat variant')
})

test('ranked unresolved cutoff ties keep more than N', () => {
  const rules = [makeRule({
    requiredCount: 1,
    // Per-rule mode keeps the test focused on a single competition bucket.
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    // Keep the tuple broad so tie-break logic (not tuple filtering) decides.
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    substats: [StatVariant.SPD],
  })]
  const rows = [
    makeGearInspectorRow({
      id: 301,
      rank: 6 as RankValue,
      rarity: 6 as RankValue,
      mainStat: buildMainStat(StatVariant.CDMG),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
    makeGearInspectorRow({
      id: 302,
      rank: 6 as RankValue,
      rarity: 5 as RankValue,
      mainStat: buildMainStat(StatVariant.CDMG),
      substats: [buildSubstat(StatVariant.SPD, 6)],
    }, false, StatVariant.ATK),
  ]
  const { candidates } = collectSafeguardCandidates({ rows, baseRules: [], recipeModes: [] })
  const snapshot = computeSafeguardProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.itemKeys.length, 2, 'unresolved boundary ties should preserve both candidates')
  assert.deepStrictEqual(new Set(entry.itemKeys), new Set([301, 302]))
})

test('ranked unresolved ties are order-invariant across candidate permutations', () => {
  const rules = [makeRule({
    requiredCount: 1,
    // Per-rule mode keeps all candidates in one competition bucket.
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
    // Keep tuple filters broad so only ranking/tie logic decides.
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetNames: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    substats: [StatVariant.SPD],
  })]
  const rowA = makeGearInspectorRow({
    id: 401,
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    mainStat: buildMainStat(StatVariant.CDMG),
    substats: [buildSubstat(StatVariant.SPD, 6)],
  }, false, StatVariant.ATK)
  const rowB = makeGearInspectorRow({
    id: 402,
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    mainStat: buildMainStat(StatVariant.CDMG),
    substats: [buildSubstat(StatVariant.SPD, 6)],
  }, false, StatVariant.ATK)
  const rowC = makeGearInspectorRow({
    id: 403,
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    mainStat: buildMainStat(StatVariant.CDMG),
    substats: [buildSubstat(StatVariant.SPD, 6)],
  }, false, StatVariant.ATK)
  // First permutation keeps natural encounter order.
  const firstRows = [rowA, rowB, rowC]
  // Second permutation scrambles encounter order intentionally.
  const secondRows = [rowC, rowA, rowB]
  const firstCandidates = collectSafeguardCandidates({ rows: firstRows, baseRules: [], recipeModes: [] }).candidates
  const secondCandidates = collectSafeguardCandidates({ rows: secondRows, baseRules: [], recipeModes: [] }).candidates
  const firstSnapshot = computeSafeguardProtection({ candidates: firstCandidates, rules, enabled: true })
  const secondSnapshot = computeSafeguardProtection({ candidates: secondCandidates, rules, enabled: true })
  const firstEntry = firstSnapshot.entries[0]
  const secondEntry = secondSnapshot.entries[0]
  assert.ok(firstEntry)
  assert.ok(secondEntry)
  // All unresolved ties should be kept, independent of incoming candidate order.
  assert.deepStrictEqual(new Set(firstEntry.itemKeys), new Set([401, 402, 403]))
  assert.deepStrictEqual(new Set(secondEntry.itemKeys), new Set([401, 402, 403]))
  // Deterministic item-key fallback should also keep emitted order stable.
  assert.deepStrictEqual(firstEntry.itemKeys, [401, 402, 403])
  assert.deepStrictEqual(secondEntry.itemKeys, [401, 402, 403])
})

test('resolveSafeguardRulesWithMetasets expands set lists', () => {
  const rules = [
    makeRule({
      combination: {
        slots: [ArtifactType.Weapon],
        sets: [],
        metaSetNames: ['Speed Sets'],
        ranks: [],
        rarities: [],
        mainStats: [StatVariant.ATK],
        factions: [],
      },
    }),
  ]
  const metasets: Metaset[] = [{
    name: 'Speed Sets',
    sets: [ArtifactSet.Speed, ArtifactSet.DivineSpeed],
    show: true,
  }]
  const resolved = resolveSafeguardRulesWithMetasets(rules, metasets)
  const combinationSets = resolved[0]?.combination.sets ?? []
  // Compare by numeric ids because the selection list now stores entry objects.
  const combinationSetIds = combinationSets.map((entry) => Number(entry.id)).sort((a, b) => a - b)
  assert.deepStrictEqual(combinationSetIds, [ArtifactSet.Speed, ArtifactSet.DivineSpeed])
})

test('resolveSafeguardRulesWithMetasets preserves rules without metaset expansion', () => {
  // Rules without metasets still need to survive the resolver unchanged.
  const rules = [
    makeRule({
      name: 'No Meta Rule',
      combination: {
        slots: [ArtifactType.Banner],
        sets: [],
        metaSetNames: [],
        ranks: [5 as RankValue, 6 as RankValue],
        rarities: [3 as RankValue, 4 as RankValue, 5 as RankValue, 6 as RankValue],
        mainStats: [],
        factions: [],
      },
      requiredCount: 3,
      activation: SafeguardRuleActivation.AnticipateGaps,
      countMode: { perRule: false, perSet: true, perFaction: true, perMainStat: false, perSlot: true },
      substats: [StatVariant.SPD],
      substatMatch: 'perSubstat',
    }),
  ]
  // Unrelated metasets should not remove or alter this rule.
  const metasets: Metaset[] = [{
    name: 'Unrelated',
    sets: [ArtifactSet.Speed],
    show: true,
  }]
  const resolved = resolveSafeguardRulesWithMetasets(rules, metasets)
  assert.strictEqual(resolved.length, 1, 'rules without metasets must not be dropped')
  const kept = resolved[0]
  assert.ok(kept)
  assert.deepStrictEqual(kept.combination.slots, [ArtifactType.Banner])
  assert.deepStrictEqual(kept.combination.metaSetNames, [])
  assert.deepStrictEqual(kept.combination.sets, [])
  assert.strictEqual(kept.requiredCount, 3)
  assert.strictEqual(kept.activation, SafeguardRuleActivation.AnticipateGaps)
  assert.deepStrictEqual(kept.countMode, {
    perRule: false,
    perSet: true,
    perFaction: true,
    perMainStat: false,
    perSlot: true,
  })
  assert.deepStrictEqual(kept.substats, [StatVariant.SPD])
  assert.strictEqual(kept.substatMatch, 'perSubstat')
})

test('resolveSafeguardRulesWithMetasets preserves substatWeights as a plain object after WASM round-trip', () => {
  // Regression guard: serde_wasm_bindgen 0.6 serializes HashMap as JS Map by default.
  // If the Rust output site is ever changed back to to_js_value() without
  // serialize_maps_as_objects(true), substatWeights will come back as a JS Map instance
  // and Object.entries() / bracket access will silently return empty results, producing
  // incorrect (100%) improvement-chance values for weighted safeguard rules.
  const weights = { [StatVariant.HP]: 1.1, [StatVariant.SPD]: 1.2 }
  const rules = [
    makeRule({
      substats: [StatVariant.HP, StatVariant.SPD],
      substatMatch: 'perSubstat',
      substatWeights: weights,
    }),
  ]
  const resolved = resolveSafeguardRulesWithMetasets(rules, [])
  const kept = resolved[0]
  assert.ok(kept)
  // Must be a plain object — not a JS Map — so Object.entries works correctly downstream.
  assert.ok(!(kept.substatWeights instanceof Map), 'substatWeights must not be a JS Map after WASM round-trip')
  assert.deepStrictEqual(kept.substatWeights, weights, 'substatWeights values must survive the WASM round-trip intact')
})

test('default safeguard rules start empty', () => {
  const rules = buildDefaultSafeguardRules()
  assert.strictEqual(rules.length, 0)
})

test('anticipate mode emits placeholder keeps when deficits remain', () => {
  const anticipateRule = makeRule({
    activation: SafeguardRuleActivation.AnticipateGaps,
    combination: {
      slots: [ArtifactType.Amulet],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetNames: [],
      ranks: [6],
      rarities: [5],
      mainStats: [StatVariant.CDMG],
      factions: [Faction.BannerLords],
    },
  })
  const detection = computeSafeguardProtection({ candidates: [], rules: [anticipateRule], enabled: true })
  const entry = detection.entries[0]
  assert.ok(entry, 'expected detection entry for anticipate rule')
  assert.strictEqual(entry.placeholders.length, 1, 'placeholder should be recorded when quota is unmet')
  const keepRules = buildSafeguardRules([anticipateRule], detection)
  assert.strictEqual(keepRules.length, 1, 'placeholder should emit a keep rule even without gear')
  const placeholderRule = keepRules[0]!
  assert.ok(placeholderRule.__safeguardPlaceholder, 'placeholder keep should be flagged')
  assert.deepStrictEqual(placeholderRule.ArtifactType, [ArtifactType.Amulet])
  assert.deepStrictEqual(placeholderRule.ArtifactSet, [ArtifactSet.Refresh])
  assert.strictEqual(placeholderRule.Rank, 6)
  assert.strictEqual(placeholderRule.Rarity, RarityCode.Legendary)
  assert.strictEqual(placeholderRule.Faction, Faction.BannerLords)
  assert.strictEqual(placeholderRule.LVLForCheck, LEVEL_ANY_SENTINEL)
})

test('safeguard merge preserves injected rule payload fields', () => {
  // Build one anticipate rule so we always emit at least one placeholder keep row.
  const keepRule = makeRule({
    activation: SafeguardRuleActivation.AnticipateGaps,
    combination: {
      slots: [ArtifactType.Amulet],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetNames: [],
      ranks: [6],
      rarities: [5],
      mainStats: [StatVariant.CDMG],
      factions: [Faction.BannerLords],
    },
  })
  // Empty candidates force a placeholder output path in safeguard detection.
  const detection = computeSafeguardProtection({ candidates: [], rules: [keepRule], enabled: true })
  // Merge helper should return full safeguard rows, never empty objects.
  const merged = prependSafeguardRules({
    baseRules: [],
    customRules: [],
    finalSellRules: [],
    resolvedSafeguardRules: [keepRule],
    detection,
  }).mergedRules
  assert.strictEqual(merged.length, 1, 'expected one injected placeholder keep rule')
  const injected = merged[0]!
  // Keep-source rows must retain source metadata after wasm merge serialization.
  assert.strictEqual(injected.__source, RULE_SOURCE_SAFEGUARDS)
  // Safeguard-injected rows must remain functional keep rules.
  assert.strictEqual(injected.Keep, true)
  assert.strictEqual(injected.Use, true)
  // Placeholder metadata must survive the merge payload boundary.
  assert.strictEqual(injected.__safeguardPlaceholder, true)
  assert.ok(Array.isArray(injected.Substats), 'placeholder keep row should carry padded substats')
  // Guard against "{}" regressions from broken merge payload serialization.
  assert.ok(Object.keys(injected).length > 1, 'injected keep row should not be an empty object')
})

test('wasm safeguard merge binding preserves injected payload fields', async () => {
  // Explicit warmup keeps this test valid even when run standalone.
  await warmupWasmRuleEngine()
  // Reuse the anticipate-gap path so candidate rows include placeholder metadata.
  const keepRule = makeRule({
    activation: SafeguardRuleActivation.AnticipateGaps,
    combination: {
      slots: [ArtifactType.Amulet],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetNames: [],
      ranks: [6],
      rarities: [5],
      mainStats: [StatVariant.CDMG],
      factions: [Faction.BannerLords],
    },
  })
  // Empty candidates force placeholder rows through the wasm merge boundary.
  const detection = computeSafeguardProtection({ candidates: [], rules: [keepRule], enabled: true })
  const candidateKeepRules = buildSafeguardRules([keepRule], detection)
  assert.strictEqual(candidateKeepRules.length, 1, 'expected one candidate keep row')
  // Call the wasm merge wrapper directly to guard the serialization boundary.
  const merged = mergeSafeguardInjectedRulesWithLoadedWasm({
    baseRules: [],
    customRules: [],
    candidateSafeguardRules: candidateKeepRules,
  })
  assert.strictEqual(merged.length, 1, 'expected one merged keep row')
  const injected = merged[0]!
  // Source tag must survive so downstream UI and filtering can classify rows.
  assert.strictEqual(injected.__source, RULE_SOURCE_SAFEGUARDS)
  // Core keep semantics must survive wasm serialization intact.
  assert.strictEqual(injected.Keep, true)
  assert.strictEqual(injected.Use, true)
  // Placeholder metadata verifies non-core fields survive this boundary too.
  assert.strictEqual(injected.__safeguardPlaceholder, true)
  assert.ok(Array.isArray(injected.Substats), 'merged keep row should include substats')
  // Guard against regressions where rows were deserialized as "{}".
  assert.ok(Object.keys(injected).length > 1, 'merged keep row should not be empty')
})

test('resolveSafeguardRuleLabel prefers trimmed rule names', () => {
  const rule = makeRule()
  const label = resolveSafeguardRuleLabel({ ...rule, name: '  Demo Rule  ' })
  assert.strictEqual(label, 'Demo Rule')
})

test('resolveSafeguardRuleLabel falls back to ordinal when metadata is present', () => {
  const injectedRule: HsfRuleWithRecipe = {
    Keep: true,
    Use: true,
    IsRuleTypeAND: false,
    Substats: [],
    RecipeName: '   ',
    __safeguardRuleOrdinal: 3,
  }
  const label = resolveSafeguardRuleLabel(injectedRule)
  assert.strictEqual(label, '#3')
})

test('resolveSafeguardRuleLabel falls back to __safeguardRuleId stamp when ordinal is missing', () => {
  const injectedRule: HsfRuleWithRecipe = {
    Keep: true,
    Use: true,
    IsRuleTypeAND: false,
    Substats: [],
    RecipeName: '   ',
    // Legacy __safeguardRuleId stamp on HsfRuleWithRecipe (WASM boundary, still string-based).
    __safeguardRuleId: 'ku_demo',
  }
  const label = resolveSafeguardRuleLabel(injectedRule)
  assert.strictEqual(label, '#ku_demo')
})
