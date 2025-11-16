/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeKeepUniqueProtection, hashKeepUniqueTuple, normalizeKeepUniqueRule } from '../src/lib/keepUniques.js'
import { ArtifactSet, ArtifactType, StatVariant, type RankValue } from '../src/lib/types.js'
import type { TesterPreviewRow } from '../src/types/testerPreview.js'
import type { NormalizedGearArtifact, NormalizedStat } from '../src/lib/importers/gearDbNormalizer.js'
import type { KeepUniqueRule } from '../src/lib/keepUniques.js'

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

const makeTesterRow = (overrides: Partial<NormalizedGearArtifact> = {}, keep = false, variant: StatVariant = StatVariant.ATK): TesterPreviewRow => ({
  artifact: makeArtifact(overrides, variant),
  match: keep ? { keep: true, cfgIdx: 0, cfgName: 'Keep', ruleIndex: 0, ruleLabel: null, ruleSource: 'hsfc' } : null,
  matchingCfgIndices: keep ? [0] : [],
})

const makeRule = (overrides: Partial<KeepUniqueRule> = {}): KeepUniqueRule => {
  const tuple = normalizeKeepUniqueRule({
    id: overrides.id ?? `rule-${Math.random().toString(16).slice(2)}`,
    tuple: overrides.tuple ?? {
      slot: ArtifactType.Weapon,
      set: ArtifactSet.Speed,
      rank: 6,
      rarity: 6,
      mainStat: StatVariant.ATK,
      factionId: null,
    },
    requiredCount: overrides.requiredCount ?? 1,
    enabled: overrides.enabled ?? true,
  })
  if (!tuple) throw new Error('expected tuple')
  return tuple
}

test('hashKeepUniqueTuple differentiates accessory factions', () => {
  const base = {
    slot: ArtifactType.Ring,
    set: ArtifactSet.Refresh,
    rank: 6 as RankValue,
    rarity: 6 as RankValue,
    mainStat: StatVariant.HP,
    factionId: 1,
  }
  const hashA = hashKeepUniqueTuple(base)
  const hashB = hashKeepUniqueTuple({ ...base, factionId: 2 })
  assert.notStrictEqual(hashA, hashB, 'different factions should yield different hashes')
})

test('computeKeepUniqueProtection aggregates tuple counts', () => {
  const rules = [
    makeRule({ id: 'speed', tuple: { slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue, mainStat: StatVariant.ATK, factionId: null } }),
  ]
  const rows: TesterPreviewRow[] = [
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, false, StatVariant.ATK),
    makeTesterRow({ slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6 as RankValue, rarity: 6 as RankValue }, true, StatVariant.ATK),
  ]
  const snapshot = computeKeepUniqueProtection({ rows, rules, enabled: true })
  assert.strictEqual(snapshot.entries.length, 1)
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.currentCount, 2)
  assert.strictEqual(entry.keptCount, 1)
  assert.strictEqual(entry.projectedCount, 1, 'projected count respects the configured requirement')
  assert.strictEqual(entry.deficit, 0)
})

test('projected count mirrors existing keep state when disabled', () => {
  const rules = [makeRule({
    id: 'ring',
    requiredCount: 2,
    tuple: {
      slot: ArtifactType.Ring,
      set: ArtifactSet.Refresh,
      rank: 5 as RankValue,
      rarity: 5 as RankValue,
      mainStat: StatVariant.RES,
      factionId: 3,
    },
  })]
  const rows = [
    makeTesterRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
    makeTesterRow({ slot: ArtifactType.Ring, set: ArtifactSet.Refresh, rank: 5 as RankValue, rarity: 5 as RankValue, faction: 3 }, false, StatVariant.RES),
  ]
  const snapshot = computeKeepUniqueProtection({ rows, rules, enabled: false })
  const entry = snapshot.entries[0]
  assert.ok(entry)
  assert.strictEqual(entry.projectedCount, 0, 'disabled feature mirrors existing keep state (0 kept)')
  assert.strictEqual(entry.deficit, 2)
})

test('coveredByExisting flips when existing keep rules meet requirement', () => {
  const rules = [makeRule({ requiredCount: 1 })]
  const rows = [
    makeTesterRow({}, true),
  ]
  const snapshot = computeKeepUniqueProtection({ rows, rules, enabled: true })
  assert.strictEqual(snapshot.entries[0]?.coveredByExisting, true)
  assert.strictEqual(snapshot.entries[0]?.projectedCount, 1)
})
