/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectKeepUniqueCandidates, computeKeepUniqueProtection, hashKeepUniqueCombination, normalizeKeepUniqueRule, resolveKeepUniqueRulesWithMetasets } from '../src/lib/keepUniques.js'
import { ArtifactSet, ArtifactType, StatVariant, type RankValue } from '../src/lib/types.js'
import type { TesterPreviewRow } from '../src/types/testerPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../src/lib/importers/gearDbNormalizer.js'
import type { KeepUniqueRule } from '../src/lib/keepUniques.js'
import type { Metaset } from '../src/lib/metasets.js'

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
    source: overrides.source ?? 'tester',
    equippedChampionName: overrides.equippedChampionName ?? null,
    equippedChampionLocation: overrides.equippedChampionLocation ?? null,
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
  }
}

const makeRule = (overrides: Partial<KeepUniqueRule> = {}): KeepUniqueRule => {
  const rule = normalizeKeepUniqueRule({
    id: overrides.id ?? `rule-${Math.random().toString(16).slice(2)}`,
    combination: overrides.combination ?? {
      slots: [ArtifactType.Weapon],
      sets: [ArtifactSet.Speed],
      metaSetIds: [],
      ranks: [6],
      rarities: [6],
      mainStats: [StatVariant.ATK],
      factions: [],
    },
    requiredCount: overrides.requiredCount ?? 1,
    enabled: overrides.enabled ?? true,
  })
  if (!rule) throw new Error('expected combination')
  return rule
}

test('hashKeepUniqueCombination differentiates accessory factions', () => {
  const base = {
    slots: [ArtifactType.Ring],
    sets: [ArtifactSet.Refresh],
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
        sets: [ArtifactSet.Speed],
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
  assert.strictEqual(entry.deficit, 0, 'no deficit when enough artifacts exist')
})

test('projected count mirrors existing keep state when disabled', () => {
  const rules = [makeRule({
    id: 'ring',
    requiredCount: 2,
    combination: {
      slots: [ArtifactType.Ring],
      sets: [ArtifactSet.Refresh],
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
  assert.strictEqual(entry.deficit, 2)
})

test('coveredByExisting flips when existing keep rules meet requirement', () => {
  const rules = [makeRule({ requiredCount: 1 })]
  const rows: TesterPreviewRow[] = []
  const candidates = collectKeepUniqueCandidates({ rows, baseRules: [], configModes: [] }).candidates
  const snapshot = computeKeepUniqueProtection({ candidates, rules, enabled: true })
  assert.strictEqual(snapshot.entries[0]?.coveredByExisting, true, 'no sold artifacts means existing coverage is sufficient')
  assert.strictEqual(snapshot.entries[0]?.projectedCount, 0)
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
  assert.deepStrictEqual(combinationSets.sort((a, b) => a - b), [ArtifactSet.Speed, ArtifactSet.DivineSpeed])
})
