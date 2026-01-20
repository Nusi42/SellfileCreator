/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { KEEP_UNIQUE_DEFAULT_COUNT_MODE, KeepUniqueRuleActivation, collectKeepUniqueCandidates, computeKeepUniqueProtection, hashKeepUniqueCombination, normalizeKeepUniqueRule, resolveKeepUniqueRuleLabel, resolveKeepUniqueRulesWithMetasets, buildDefaultKeepUniqueRules } from '../../src/lib/keepUniques.js'
import { normalizeArtifactSetSelections } from '../../src/lib/gearSets/selection.js'
import { ArtifactSet, ArtifactType, Faction, StatVariant, LEVEL_ANY_SENTINEL, RarityCode, type RankValue, getAccessorySlotsCompatibleSetIds } from '../../src/lib/types.js'
import type { TesterPreviewRow } from '../../src/types/testerPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../../src/lib/importers/gearDbNormalizer.js'
import type { KeepUniqueRule } from '../../src/lib/keepUniques.js'
import type { Metaset } from '../../src/lib/metasets.js'
import { buildKeepUniqueRules } from '../../src/lib/merge.js'
import type { HsfRuleWithCfg } from '../../src/lib/merge.js'

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
    testerItem: overrides.testerItem ?? {
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
    source: overrides.source ?? 'tester',
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
    lastUseLocalTimestamp: overrides.lastUseLocalTimestamp ?? null,
  }
}

const makeTesterRow = (overrides: Partial<NormalizedGearArtifact> = {}, keep = false, variant: StatVariant = StatVariant.ATK): TesterPreviewRow => {
  const artifact = makeArtifact(overrides, variant)
  const match = keep ? { keep: true, cfgIdx: 0, cfgName: 'Keep', ruleIndex: 0, ruleLabel: null, ruleSource: 'hsfc' } : null
  return {
    artifact,
    match,
    baseMatch: match,
    matchingCfgIndices: keep ? [0] : [],
    matchingConfigDecisions: keep ? [{ cfgIdx: 0, keep: true }] : [],
  }
}

const makeRule = (overrides: Partial<KeepUniqueRule> = {}): KeepUniqueRule => {
  const rule = normalizeKeepUniqueRule({
    id: overrides.id ?? `rule-${Math.random().toString(16).slice(2)}`,
    combination: overrides.combination ?? {
      slots: [ArtifactType.Weapon],
      // Default to a single entry object to match selection shape.
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
      metaSetIds: [],
      ranks: [6],
      rarities: [6],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
    requiredCount: overrides.requiredCount ?? 1,
    activation: overrides.activation ?? KeepUniqueRuleActivation.ProtectExisting,
    countMode: overrides.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  })
  if (!rule) throw new Error('expected combination')
  return rule
}

test('hashKeepUniqueCombination differentiates accessory factions', () => {
  const base = {
    slots: [ArtifactType.Ring],
    sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
    metaSetIds: [],
    ranks: [6 as RankValue],
    rarities: [6 as RankValue],
    mainStats: [StatVariant.HP],
    factions: [1],
  }
  const hashA = hashKeepUniqueCombination(base)
  const hashB = hashKeepUniqueCombination({ ...base, factions: [2] })
  assert.notStrictEqual(hashA, hashB, 'different factions should yield different hashes')
})

test('computeKeepUniqueProtection aggregates combination counts', () => {
  const rules = [
    makeRule({
      id: 'speed',
      combination: {
        slots: [ArtifactType.Weapon],
        sets: normalizeArtifactSetSelections([ArtifactSet.Speed]),
        metaSetIds: [],
        ranks: [6 as RankValue],
        rarities: [6 as RankValue],
        mainStats: [StatVariant.ATK],
        factions: [],
      },
    }),
  ]
  const rows: TesterPreviewRow[] = [
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, false, StatVariant.ATK),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, false, StatVariant.ATK),
  ]
  const candidates = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] }).candidates
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
  assert.strictEqual(snapshot.entries.length, 1)
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.currentCount, 2, 'tracks all sold artifacts')
  assert.strictEqual(entry.projectedCount, 2, 'projected count mirrors sold artifacts when enabled')
  assert.strictEqual(entry.deficit, 0, 'no deficit once sold artifacts cover the quota')
})

test('projected count mirrors existing keep state when disabled', () => {
  const rules = [makeRule({
    id: 'ring',
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Ring],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetIds: [],
      ranks: [5 as RankValue],
      rarities: [5 as RankValue],
      mainStats: [StatVariant.RES],
      factions: [3],
    },
  })]
  const rows = [
    makeTesterRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
    makeTesterRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
  ]
  const candidates = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] }).candidates
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: false })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.projectedCount, 0, 'disabled feature mirrors existing keep state (0 kept)')
  assert.strictEqual(entry.deficit, 0, 'deficit is zero because quota can be met if enabled')
})

test('coveredByExisting flips when existing keep rules meet requirement', () => {
  const rules = [makeRule({ requiredCount: 1 })]
  const rows: TesterPreviewRow[] = []
  const candidates = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] }).candidates
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
  assert.strictEqual(snapshot.entries[0]?.coveredByExisting, false, 'no gear means the quota still needs coverage')
  assert.strictEqual(snapshot.entries[0]?.deficit, 1, 'empty combos should report a deficit equal to the quota')
  assert.strictEqual(snapshot.entries[0]?.projectedCount, 0)
})

test('per combination mode multiplies targets and deficits', () => {
  const rules = [makeRule({
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Weapon],
      sets: normalizeArtifactSetSelections([ArtifactSet.Speed, ArtifactSet.Accuracy]),
      metaSetIds: [],
      ranks: [6 as RankValue],
      rarities: [6 as RankValue],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
  })]
  const rows = [
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed }, false, StatVariant.ATK),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy }, false, StatVariant.ATK),
  ]
  const { candidates } = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] })
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
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
      metaSetIds: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
  })]
  const rows = [
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed }, false, StatVariant.ATK),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy }, false, StatVariant.CDMG),
  ]
  const { candidates } = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] })
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
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
      metaSetIds: [],
      ranks: [],
      rarities: [],
      mainStats: [],
      factions: [],
    },
    countMode: { perRule: false, perSet: true, perFaction: false, perMainStat: false, perSlot: false },
  })]
  const rows = [
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, faction: 1 }, false, StatVariant.ATK),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, faction: 2 }, false, StatVariant.DEF),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Accuracy, faction: 1 }, false, StatVariant.CDMG),
  ]
  const { candidates } = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] })
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.groupsTracked, 2, 'groups only by set when faction/main toggles are off')
  assert.strictEqual(entry.requiredCount, 2, 'requirement multiplies per set')
})

test('resolveKeepUniqueRulesWithMetasets expands set lists', () => {
  const rules = [
    makeRule({
      combination: {
        slots: [ArtifactType.Weapon],
        sets: [],
        metaSetIds: ['meta_speed'],
        ranks: [],
        rarities: [],
        mainStats: [StatVariant.ATK],
        factions: [],
      },
    }),
  ]
  const metasets: Metaset[] = [{
    id: 'meta_speed',
    name: 'Speed Sets',
    sets: [ArtifactSet.Speed, ArtifactSet.DivineSpeed],
    show: true,
  }]
  const resolved = resolveKeepUniqueRulesWithMetasets(rules, metasets)
  const combinationSets = resolved[0]?.combination.sets ?? []
  // Compare by numeric ids because the selection list now stores entry objects.
  const combinationSetIds = combinationSets.map((entry) => Number(entry.id)).sort((a, b) => a - b)
  assert.deepStrictEqual(combinationSetIds, [ArtifactSet.Speed, ArtifactSet.DivineSpeed])
})

test('default keep unique rules seed the accessory guard and optional armor sets', () => {
  const rules = buildDefaultKeepUniqueRules()
  assert.strictEqual(rules.length, 2)
  const accessoryRule = rules[0]
  assert.ok(accessoryRule)
  assert.strictEqual(accessoryRule.name, 'Rare+ Accessories (5-6★)')
  assert.deepStrictEqual(accessoryRule.combination.slots, [ArtifactType.Ring, ArtifactType.Amulet, ArtifactType.Banner])
  assert.deepStrictEqual(accessoryRule.combination.sets, getAccessorySlotsCompatibleSetIds().map((id) => ({ id })))
  assert.deepStrictEqual(accessoryRule.combination.ranks, [5, 6])
  assert.deepStrictEqual(accessoryRule.combination.rarities, [3, 4, 5, 6])
  assert.strictEqual(accessoryRule.requiredCount, 1)
  const accessoryCountMode = accessoryRule.countMode
  assert.ok(accessoryCountMode.perSlot)
  assert.ok(accessoryCountMode.perSet)
  assert.ok(accessoryCountMode.perFaction)
  assert.ok(accessoryCountMode.perMainStat)

  const armorRule = rules[1]
  assert.ok(armorRule)
  assert.strictEqual(armorRule.name, 'Utility Sets (5-6★)')
  assert.strictEqual(armorRule.activation, KeepUniqueRuleActivation.Off)
  assert.deepStrictEqual(armorRule.combination.slots, [
    ArtifactType.Weapon,
    ArtifactType.Helmet,
    ArtifactType.Shield,
    ArtifactType.Gauntlets,
    ArtifactType.Chestplate,
    ArtifactType.Boots,
  ])
  assert.deepStrictEqual(armorRule.combination.sets,
    [ArtifactSet.Stun, ArtifactSet.Toxic, ArtifactSet.Cursed, ArtifactSet.Provoke, ArtifactSet.Destroy].map((id) => ({ id })),
  )
  assert.deepStrictEqual(armorRule.combination.ranks, [6])
  assert.deepStrictEqual(armorRule.combination.rarities, [5, 6])
  assert.strictEqual(armorRule.requiredCount, 1)
  const armorCountMode = armorRule.countMode
  assert.ok(armorCountMode.perSlot)
  assert.ok(armorCountMode.perSet)
  assert.strictEqual(armorCountMode.perFaction, false)
  assert.strictEqual(armorCountMode.perMainStat, false)
})

test('anticipate mode emits placeholder keeps when deficits remain', () => {
  const anticipateRule = makeRule({
    activation: KeepUniqueRuleActivation.AnticipateGaps,
    combination: {
      slots: [ArtifactType.Amulet],
      sets: normalizeArtifactSetSelections([ArtifactSet.Refresh]),
      metaSetIds: [],
      ranks: [6],
      rarities: [5],
      mainStats: [StatVariant.CDMG],
      factions: [Faction.BannerLords],
    },
  })
  const detection = computeKeepUniqueProtection({ candidates: [], rules: [anticipateRule], enabled: true })
  const entry = detection.entries[0]
  assert.ok(entry, 'expected detection entry for anticipate rule')
  assert.strictEqual(entry.placeholders.length, 1, 'placeholder should be recorded when quota is unmet')
  const keepRules = buildKeepUniqueRules([anticipateRule], detection)
  assert.strictEqual(keepRules.length, 1, 'placeholder should emit a keep rule even without gear')
  const placeholderRule = keepRules[0]!
  assert.ok(placeholderRule.__keepUniquePlaceholder, 'placeholder keep should be flagged')
  assert.deepStrictEqual(placeholderRule.ArtifactType, [ArtifactType.Amulet])
  assert.deepStrictEqual(placeholderRule.ArtifactSet, [ArtifactSet.Refresh])
  assert.strictEqual(placeholderRule.Rank, 6)
  assert.strictEqual(placeholderRule.Rarity, RarityCode.Legendary)
  assert.strictEqual(placeholderRule.Faction, Faction.BannerLords)
  assert.strictEqual(placeholderRule.LVLForCheck, LEVEL_ANY_SENTINEL)
})

test('resolveKeepUniqueRuleLabel prefers trimmed rule names', () => {
  const rule = makeRule()
  const label = resolveKeepUniqueRuleLabel({ ...rule, name: '  Demo Rule  ' })
  assert.strictEqual(label, 'Demo Rule')
})

test('resolveKeepUniqueRuleLabel falls back to ordinal when metadata is present', () => {
  const keepRule = makeRule({ id: 'ku_demo' })
  const injectedRule: HsfRuleWithCfg = {
    Keep: true,
    Use: true,
    IsRuleTypeAND: false,
    Substats: [],
    ConfigName: '   ',
    __keepUniqueRuleId: keepRule.id,
    __keepUniqueRuleOrdinal: 3,
  }
  const label = resolveKeepUniqueRuleLabel(injectedRule)
  assert.strictEqual(label, '#3')
})

test('resolveKeepUniqueRuleLabel falls back to rule id when ordinal is missing', () => {
  const keepRule = makeRule({ id: 'ku_demo' })
  const injectedRule: HsfRuleWithCfg = {
    Keep: true,
    Use: true,
    IsRuleTypeAND: false,
    Substats: [],
    ConfigName: '   ',
    __keepUniqueRuleId: keepRule.id,
  }
  const label = resolveKeepUniqueRuleLabel(injectedRule)
  assert.strictEqual(label, `#${keepRule.id}`)
})
