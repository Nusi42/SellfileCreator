import { rankMask, rarityMask } from './hsfTypes'
import type { HsfRuleWithCfg } from './merge'
import { ArtifactType, PREFERRED_ARTIFACT_TYPE_ORDER, type ArtifactSetId, type ArtifactTypeId } from './types'

const RANK_VALUES = [1, 2, 3, 4, 5, 6] as const
const RARITY_VALUES = [1, 2, 3, 4, 5, 6] as const
const RANK_MASK_ALL = RANK_VALUES.reduce((mask, value) => mask | (1 << (value - 1)), 0)
const RARITY_MASK_ALL = RANK_MASK_ALL
const SLOT_ID_LIST: ArtifactTypeId[] = [
  ArtifactType.Weapon,
  ArtifactType.Helmet,
  ArtifactType.Shield,
  ArtifactType.Gauntlets,
  ArtifactType.Chestplate,
  ArtifactType.Boots,
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
]

type RarityIndexMutable = {
  any: number[]
  byRarity: Map<number, number[]>
}

type RankIndexMutable = {
  any: RarityIndexMutable
  byRank: Map<number, RarityIndexMutable>
}

type SlotSetBucketMutable = {
  anySets: RankIndexMutable
  bySet: Map<number, RankIndexMutable>
}

type SlotBucketsMutable = Map<number, SlotSetBucketMutable>

export type RarityIndexData = {
  any: Uint32Array
  byRarity: Array<{ rarity: number; rules: Uint32Array }>
}

export type RankIndexData = {
  any: RarityIndexData
  byRank: Array<{ rank: number; rarityIndex: RarityIndexData }>
}

export type SlotSetBucketData = {
  anySets: RankIndexData
  bySet: Array<{ setId: number; rankIndex: RankIndexData }>
}

export type RuleMatchIndexData = {
  slotBuckets: Array<{ slot: number; bucket: SlotSetBucketData }>
}

type RarityIndexRuntime = {
  any: Uint32Array
  byRarity: Map<number, Uint32Array>
}

type RankIndexRuntime = {
  any: RarityIndexRuntime
  byRank: Map<number, RarityIndexRuntime>
}

type SlotSetBucketRuntime = {
  anySets: RankIndexRuntime
  bySet: Map<number, RankIndexRuntime>
}

export type RuleMatchIndexRuntime = Map<number, SlotSetBucketRuntime>

const RULE_MATCH_INDEX_CACHE = new WeakMap<readonly HsfRuleWithCfg[], RuleMatchIndexRuntime>()

const createRarityIndexMutable = (): RarityIndexMutable => ({
  any: [],
  byRarity: new Map(),
})

const createRankIndexMutable = (): RankIndexMutable => ({
  any: createRarityIndexMutable(),
  byRank: new Map(),
})

const createSlotBucketMutable = (): SlotSetBucketMutable => ({
  anySets: createRankIndexMutable(),
  bySet: new Map(),
})

const maskToValues = (mask: number, values: readonly number[]): number[] => {
  if (mask === 0) return []
  const out: number[] = []
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]!
    if ((mask & (1 << (value - 1))) !== 0) {
      out.push(value)
    }
  }
  return out
}

const insertIntoRarityIndex = (index: RarityIndexMutable, ruleIndex: number, rarityMask: number) => {
  if (rarityMask === RARITY_MASK_ALL) {
    index.any.push(ruleIndex)
    return
  }
  const rarities = maskToValues(rarityMask, RARITY_VALUES)
  if (rarities.length === 0) {
    index.any.push(ruleIndex)
    return
  }
  for (const rarity of rarities) {
    const arr = index.byRarity.get(rarity)
    if (arr) {
      arr.push(ruleIndex)
    } else {
      index.byRarity.set(rarity, [ruleIndex])
    }
  }
}

const insertIntoRankIndex = (index: RankIndexMutable, ruleIndex: number, rankMaskValue: number, rarityMaskValue: number) => {
  if (rankMaskValue === RANK_MASK_ALL) {
    insertIntoRarityIndex(index.any, ruleIndex, rarityMaskValue)
    return
  }
  const ranks = maskToValues(rankMaskValue, RANK_VALUES)
  if (ranks.length === 0) {
    insertIntoRarityIndex(index.any, ruleIndex, rarityMaskValue)
    return
  }
  for (const rank of ranks) {
    const entry = (() => {
      const current = index.byRank.get(rank)
      if (current) return current
      const created = createRarityIndexMutable()
      index.byRank.set(rank, created)
      return created
    })()
    insertIntoRarityIndex(entry, ruleIndex, rarityMaskValue)
  }
}

const getSlotBucketMutable = (slots: SlotBucketsMutable, slot: number): SlotSetBucketMutable => {
  const existing = slots.get(slot)
  if (existing) return existing
  const created = createSlotBucketMutable()
  slots.set(slot, created)
  return created
}

const normalizeSlotsForRule = (rule: HsfRuleWithCfg): number[] | null => {
  const raw = rule.ArtifactType
  if (!Array.isArray(raw) || raw.length === 0) return null
  const seen = new Set<number>()
  const slots: number[] = []
  for (const entry of raw) {
    const slot = Number(entry)
    if (!Number.isFinite(slot)) return null
    if (!PREFERRED_ARTIFACT_TYPE_ORDER.includes(slot as ArtifactType)) return null
    if (seen.has(slot)) continue
    seen.add(slot)
    slots.push(slot)
  }
  return slots.length > 0 ? slots : null
}

const normalizeSetsForRule = (rule: HsfRuleWithCfg): number[] | null => {
  const raw = rule.ArtifactSet
  if (!Array.isArray(raw) || raw.length === 0) return null
  const seen = new Set<number>()
  const setIds: number[] = []
  for (const entry of raw) {
    const setId = Number(entry)
    if (!Number.isFinite(setId)) return null
    if (seen.has(setId)) continue
    seen.add(setId)
    setIds.push(setId)
  }
  return setIds.length > 0 ? setIds : null
}

const insertRuleIntoBucket = (
  bucket: SlotSetBucketMutable,
  ruleIndex: number,
  sets: number[] | null,
  rankMaskValue: number,
  rarityMaskValue: number,
) => {
  if (!sets || sets.length === 0) {
    insertIntoRankIndex(bucket.anySets, ruleIndex, rankMaskValue, rarityMaskValue)
    return
  }
  for (const setId of sets) {
    const entry = (() => {
      const current = bucket.bySet.get(setId)
      if (current) return current
      const created = createRankIndexMutable()
      bucket.bySet.set(setId, created)
      return created
    })()
    insertIntoRankIndex(entry, ruleIndex, rankMaskValue, rarityMaskValue)
  }
}

const serializeRarityIndex = (index: RarityIndexMutable): RarityIndexData => ({
  any: Uint32Array.from(index.any),
  byRarity: Array.from(index.byRarity.entries()).map(([rarity, rules]) => ({
    rarity,
    rules: Uint32Array.from(rules),
  })),
})

const serializeRankIndex = (index: RankIndexMutable): RankIndexData => ({
  any: serializeRarityIndex(index.any),
  byRank: Array.from(index.byRank.entries()).map(([rank, rarityIndex]) => ({
    rank,
    rarityIndex: serializeRarityIndex(rarityIndex),
  })),
})

const serializeSlotBucket = (bucket: SlotSetBucketMutable): SlotSetBucketData => ({
  anySets: serializeRankIndex(bucket.anySets),
  bySet: Array.from(bucket.bySet.entries()).map(([setId, rankIndex]) => ({
    setId,
    rankIndex: serializeRankIndex(rankIndex),
  })),
})

export function buildRuleMatchIndexData(rules: readonly HsfRuleWithCfg[]): RuleMatchIndexData {
  const slotBuckets: SlotBucketsMutable = new Map()
  for (const slot of SLOT_ID_LIST) {
    slotBuckets.set(slot, createSlotBucketMutable())
  }

  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]!
    const slots = normalizeSlotsForRule(rule) ?? SLOT_ID_LIST
    const sets = normalizeSetsForRule(rule)
    const rMask = rankMask(rule.Rank)
    const rarMask = rarityMask(rule.Rarity)
    for (const slot of slots) {
      const bucket = getSlotBucketMutable(slotBuckets, slot)
      insertRuleIntoBucket(bucket, i, sets, rMask, rarMask)
    }
  }

  return {
    slotBuckets: Array.from(slotBuckets.entries()).map(([slot, bucket]) => ({
      slot,
      bucket: serializeSlotBucket(bucket),
    })),
  }
}

const deserializeRarityIndex = (data: RarityIndexData): RarityIndexRuntime => ({
  any: data.any,
  byRarity: new Map<number, Uint32Array>(data.byRarity.map(entry => [entry.rarity, entry.rules])),
})

const deserializeRankIndex = (data: RankIndexData): RankIndexRuntime => ({
  any: deserializeRarityIndex(data.any),
  byRank: new Map<number, RarityIndexRuntime>(data.byRank.map(entry => [entry.rank, deserializeRarityIndex(entry.rarityIndex)])),
})

const deserializeSlotBucket = (data: SlotSetBucketData): SlotSetBucketRuntime => ({
  anySets: deserializeRankIndex(data.anySets),
  bySet: new Map<number, RankIndexRuntime>(data.bySet.map(entry => [entry.setId, deserializeRankIndex(entry.rankIndex)])),
})

const deserializeRuleMatchIndex = (data: RuleMatchIndexData): RuleMatchIndexRuntime => {
  const map: RuleMatchIndexRuntime = new Map()
  for (const entry of data.slotBuckets) {
    map.set(entry.slot, deserializeSlotBucket(entry.bucket))
  }
  return map
}

export function primeRuleMatchIndex(rules: readonly HsfRuleWithCfg[], data: RuleMatchIndexData): void {
  const runtime = deserializeRuleMatchIndex(data)
  RULE_MATCH_INDEX_CACHE.set(rules, runtime)
}

export function getRuleMatchIndex(rules: readonly HsfRuleWithCfg[]): RuleMatchIndexRuntime {
  let cached = RULE_MATCH_INDEX_CACHE.get(rules)
  if (cached) return cached
  const data = buildRuleMatchIndexData(rules)
  cached = deserializeRuleMatchIndex(data)
  RULE_MATCH_INDEX_CACHE.set(rules, cached)
  return cached
}

const gatherRarityLists = (index: RarityIndexRuntime | undefined, rarity: number, out: Uint32Array[]) => {
  if (!index) return
  const specific = index.byRarity.get(rarity)
  if (specific && specific.length > 0) out.push(specific)
  const universal = index.any
  if (universal.length > 0) out.push(universal)
}

const gatherRankLists = (index: RankIndexRuntime | undefined, rank: number, rarity: number, out: Uint32Array[]) => {
  if (!index) return
  const specific = index.byRank.get(rank)
  if (specific) gatherRarityLists(specific, rarity, out)
  gatherRarityLists(index.any, rarity, out)
}

const mergeAndVisit = (lists: Uint32Array[], visit: (ruleIndex: number) => boolean | void): void => {
  if (lists.length === 0) return
  const positions = lists.map(() => 0)
  while (true) {
    let nextList = -1
    let nextValue = 0
    for (let i = 0; i < lists.length; i += 1) {
      const arr = lists[i]!
      const pos = positions[i]!
      if (pos >= arr.length) continue
      const value = arr[pos]!
      if (nextList === -1 || value < nextValue) {
        nextList = i
        nextValue = value
      }
    }
    if (nextList === -1) break
    positions[nextList]! += 1
    if (visit(nextValue) === false) return
  }
}

export function forEachRuleMatchCandidate(
  index: RuleMatchIndexRuntime,
  slot: ArtifactTypeId,
  setId: ArtifactSetId,
  rank: number,
  rarity: number,
  visit: (ruleIndex: number) => boolean | void,
): void {
  const bucket = index.get(slot) ?? index.get(PREFERRED_ARTIFACT_TYPE_ORDER[0]!)
  if (!bucket) return
  const lists: Uint32Array[] = []
  gatherRankLists(bucket.bySet.get(Number(setId)), rank, rarity, lists)
  gatherRankLists(bucket.anySets, rank, rarity, lists)
  mergeAndVisit(lists, visit)
}
