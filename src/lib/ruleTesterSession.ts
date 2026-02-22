import { loadAutosave } from './autosave'
import { compressToBase64, decompressFromBase64 } from './compression'
import { AUTOSAVE_TESTER_KEY, ACCESSORY_NO_SET_ID, TESTER_ANY_SLOT_ID } from './constants'
import { additionLevelsForRarityCode, type SubstatTargetTable } from './hsfBuilder'
import { allowedTesterSetIds, normalizeTesterSetForSlot } from './testerDomain'
import {
  LEVEL_MILESTONES,
  type LevelMilestone,
  StatVariant,
  ArtifactType,
  type ArtifactTypeId,
  type ArtifactSetId,
  ArtifactSet,
  type FactionId,
  Faction,
  StatId,
  RarityCode,
  compareVariants,
  slotSupportsSub,
  ALLOWED_MAIN_BY_SLOT,
  artifactTypeNames,
} from './types'
import { variantToSub, variantToMain } from './hsfTypes'
import type { NormalizedStat } from './importers/gearDbNormalizer'
import type { TestItem, TesterItemPreviewExtras } from './ruleEval'

export type RuleTesterItem = Omit<TestItem, 'subRolls'> & {
  itemId: number
  subValues?: Record<number, number>
  subOrder?: number[]
  compact?: boolean
}

type StoredTesterItem = RuleTesterItem

export type TesterSourceCategory = 'manual' | 'inventory' | 'collection' | 'vault' | 'inbox'

export const testerSourceCategoryForItem = (item: RuleTesterItem): TesterSourceCategory => {
  const extras = item.previewExtras
  const baseSource = extras?.source
  if (!baseSource || baseSource === 'tester') return 'manual'
  if (baseSource === 'inbox') return 'inbox'
  if (extras?.equippedToChampionId != null) {
    const loc = extras.equippedChampionLocation
    return loc === 'vault' || loc === 'reserveVault' ? 'vault' : 'collection'
  }
  return 'inventory'
}

export const isManualTesterItem = (item: RuleTesterItem): boolean => testerSourceCategoryForItem(item) === 'manual'

export type RuleTesterAutosavePayload = {
  Version?: string | number
  ItemsCompressed: string
  ItemsCompressedBytes?: number
  ItemCount?: number
  SavedAt?: string
}

const MAIN_FALLBACK_VARIANTS: readonly number[] = [
  StatVariant.HP,
  StatVariant.ATK,
  StatVariant.DEF,
] as const

const ANY_SLOT_MAIN_VARIANTS: number[] = (() => {
  const variants = new Set<number>()
  Object.values(ALLOWED_MAIN_BY_SLOT).forEach((allowed) => {
    allowed.forEach((variant) => variants.add(Number(variant)))
  })
  MAIN_FALLBACK_VARIANTS.forEach((variant) => variants.add(Number(variant)))
  return Array.from(variants).sort(compareVariants)
})()

export const baseMainVariantsForSlot = (slot: ArtifactTypeId): number[] => {
  if (Number(slot) === TESTER_ANY_SLOT_ID) return [...ANY_SLOT_MAIN_VARIANTS]
  const allowed = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  if (!allowed || allowed.size === 0) return [...MAIN_FALLBACK_VARIANTS]
  return Array.from(allowed).sort(compareVariants)
}

export const normalizeMainVariantForSlot = (slot: ArtifactTypeId, main: number): number => {
  if (Number(main) === -1) return -1
  const options = baseMainVariantsForSlot(slot)
  if (options.length === 0) return -1
  return options.includes(main) ? main : options[0]!
}

export const mainOptionsForSlot = (slot: ArtifactTypeId, currentMain: number): number[] => {
  const base = baseMainVariantsForSlot(slot)
  if (currentMain >= 0 && !base.includes(currentMain)) {
    return [...base, currentMain].sort(compareVariants)
  }
  return base
}

export const entriesInOrder = (it: RuleTesterItem): Array<[number, number]> => {
  const vals = it.subValues || {}
  const presentKeys = new Set(Object.keys(vals).map(Number))
  const baseOrder = (it.subOrder && it.subOrder.length > 0)
    ? it.subOrder.filter((k) => presentKeys.has(Number(k)))
    : Array.from(presentKeys)
  const extras = Array.from(presentKeys).filter((k) => !baseOrder.includes(k))
  const order = [...baseOrder, ...extras]
  return order.map((key) => [Number(key), Number((vals as Record<number, number>)[key] ?? 0)])
}

const rarityCodeFromDiscrete = (r: 1|2|3|4|5|6): RarityCode => {
  const map: Record<1|2|3|4|5|6, RarityCode> = {
    1: RarityCode.Common,
    2: RarityCode.Uncommon,
    3: RarityCode.Rare,
    4: RarityCode.Epic,
    5: RarityCode.Legendary,
    6: RarityCode.Mythical,
  }
  return map[r]
}

const presentSubCount = (rarity: 1|2|3|4|5|6, level: number): 0|1|2|3|4 => {
  const code = rarityCodeFromDiscrete(rarity)
  const addSet = additionLevelsForRarityCode(code)
  const baseStart = Math.max(0, 4 - addSet.size)
  const addsSoFar = Array.from(addSet).filter((a) => a <= level).length
  const n = Math.min(4, baseStart + addsSoFar)
  return (n as 0|1|2|3|4)
}

const ROLL_MILESTONES = [4, 8, 12, 16] as const

const subEqualsMainVariant = (subV: number, mainV?: number): boolean => {
  if (mainV == null || Number(mainV) === StatId.Any) return false
  const sub = variantToSub(subV)
  const main = variantToMain(mainV)
  if (main.id === StatId.Any) return false
  if (main.id === StatId.HP || main.id === StatId.ATK || main.id === StatId.DEF) {
    if (main.f === undefined) return false
    return sub.id === main.id && Boolean(sub.isFlat) === (main.f === 1)
  }
  return sub.id === main.id
}

export type RuleTesterMath = ReturnType<typeof createRuleTesterMath>

const parseCompressedTesterItems = (base64: string): StoredTesterItem[] | null => {
  try {
    const json = decompressFromBase64(base64)
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed as StoredTesterItem[]
  } catch {
    return null
  }
}

type CachedTesterAutosaveCompression = {
  itemsRef: RuleTesterItem[] | null
  base64: string
  byteLength: number
  itemCount: number
}

// Cache the last tester compression result so repeated autosave flushes for the
// same immutable tester array can skip JSON stringify + compression work.
const cachedTesterAutosaveCompression: CachedTesterAutosaveCompression = {
  itemsRef: null,
  base64: '',
  byteLength: 0,
  itemCount: 0,
}

export function buildRuleTesterAutosavePayload(items: RuleTesterItem[]): RuleTesterAutosavePayload {
  try {
    if (cachedTesterAutosaveCompression.itemsRef !== items) {
      // Immutable tester state changes should produce a new array reference.
      // Recompress only on those reference changes.
      const json = JSON.stringify(items)
      const { base64, byteLength } = compressToBase64(json)
      cachedTesterAutosaveCompression.itemsRef = items
      cachedTesterAutosaveCompression.base64 = base64
      cachedTesterAutosaveCompression.byteLength = byteLength
      cachedTesterAutosaveCompression.itemCount = items.length
    }
    return {
      Version: '3',
      ItemsCompressed: cachedTesterAutosaveCompression.base64,
      ItemsCompressedBytes: cachedTesterAutosaveCompression.byteLength,
      ItemCount: cachedTesterAutosaveCompression.itemCount,
      SavedAt: new Date().toISOString(),
    }
  } catch {
    // Allow the caller to continue even if compression fails; worst case the tester resets.
    return { Version: '3', ItemsCompressed: '', SavedAt: new Date().toISOString() }
  }
}

export function createRuleTesterMath(substatTargets: SubstatTargetTable) {
  const baseStepForRank = (variant: number, star: 1|2|3|4|5|6): number => {
    if (star === 6) return substatTargets.six[variant] ?? 0
    if (star === 5) return substatTargets.five[variant] ?? 0
    if (star === 4) return substatTargets.four[variant] ?? 0
    if (star === 3) return substatTargets.three[variant] ?? 0
    if (star === 2) return substatTargets.two[variant] ?? 0
    return substatTargets.one[variant] ?? 0
  }

  const adjustSubValuesFor = (it: RuleTesterItem): RuleTesterItem => {
    const slotValue = Number(it.slot)
    const normalizedMain = normalizeMainVariantForSlot(it.slot, Number(it.main ?? -1))
    const normalizedSet = normalizeTesterSetForSlot(it.slot, (it.set ?? ACCESSORY_NO_SET_ID) as ArtifactSetId)
    const need = presentSubCount(it.rarity, it.level)
    const orderedEntries = entriesInOrder(it)
    const allowedFiltered = orderedEntries.filter(([variant]) => (
      (slotValue === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, variant)) && !subEqualsMainVariant(variant, normalizedMain)
    ))
    const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
    const baseFor = (variant: number): number => baseStepForRank(variant, star)

    let kept = allowedFiltered.map(([variant, value]) => [Number(variant), Math.max(1, Number(value))] as [number, number])
    if (kept.length > need) {
      kept = kept.slice(0, need)
    }
    if (kept.length < need) {
      const have = new Set(kept.map(([variant]) => Number(variant)))
      const candidates = [
        StatVariant.HP,
        StatVariant.HP_FLAT,
        StatVariant.ATK,
        StatVariant.ATK_FLAT,
        StatVariant.DEF,
        StatVariant.DEF_FLAT,
        StatVariant.SPD,
        StatVariant.RES,
        StatVariant.ACC,
        StatVariant.CR,
        StatVariant.CDMG,
      ].filter((variant) => (
        (slotValue === TESTER_ANY_SLOT_ID || slotSupportsSub(it.slot, variant))
        && !have.has(Number(variant))
        && !subEqualsMainVariant(variant, normalizedMain)
      ))
      while (kept.length < need && candidates.length > 0) {
        const idx = Math.floor(Math.random() * candidates.length)
        const variant = candidates.splice(idx, 1)[0]!
        kept.push([variant, Math.max(1, baseFor(variant))])
      }
    }
    const next: Record<number, number> = {}
    const nextOrder = kept.map(([variant]) => Number(variant))
    for (const [variant, value] of kept) {
      next[Number(variant)] = Number(value)
    }
    return {
      ...it,
      subValues: next,
      subOrder: nextOrder,
      main: normalizedMain,
      set: normalizedSet,
    }
  }

  const applyRandomRollsForLevel = (it: RuleTesterItem): RuleTesterItem => {
    const level = it.level
    const entries = entriesInOrder(it)
    if (entries.length === 0) return it

    const rarity = it.rarity
    const star = Math.max(1, Math.min(6, Number(it.rank || 6))) as 1|2|3|4|5|6
    const rarityCode = rarityCodeFromDiscrete(rarity)
    const additionSet = additionLevelsForRarityCode(rarityCode)
    const baseStart = Math.max(0, 4 - additionSet.size)
    const additionLevels = Array.from(additionSet)
      .filter((milestone): milestone is 0 | 4 | 8 | 12 | 16 => milestone <= level)
      .sort((a, b) => a - b)
    const orderedVariants = entries.map(([variant]) => variant)
    const initialVariants = orderedVariants.slice(0, Math.min(baseStart, orderedVariants.length))
    const additionCandidates = orderedVariants.slice(initialVariants.length)
    const additionByLevel = new Map<number, number>()
    const additionWithoutVariant = new Set<number>()
    for (let i = 0; i < additionLevels.length; i += 1) {
      const variant = additionCandidates[i]
      if (variant != null) {
        additionByLevel.set(additionLevels[i]!, variant)
      } else {
        additionWithoutVariant.add(additionLevels[i]!)
      }
    }

    const values: Record<number, number> = { ...(it.subValues || {}) }
    const available = new Set<number>()
    for (const variant of initialVariants) {
      available.add(variant)
      const step = Math.max(1, baseStepForRank(variant, star))
      const current = Number(values[variant] ?? 0)
      values[variant] = Math.max(step, current)
    }

    if (rarity === 6 && available.size > 0) {
      const variants = Array.from(available)
      const chosen = variants[Math.floor(Math.random() * variants.length)]!
      const step = Math.max(1, baseStepForRank(chosen, star))
      const current = Math.max(step, Number(values[chosen] ?? step))
      values[chosen] = current + step
    }

    for (const milestone of ROLL_MILESTONES) {
      if (milestone > level) break
      const additionVariant = additionByLevel.get(milestone)
      if (additionVariant != null) {
        const step = Math.max(1, baseStepForRank(additionVariant, star))
        const current = Number(values[additionVariant] ?? 0)
        values[additionVariant] = Math.max(step, current)
        available.add(additionVariant)
        continue
      }
      if (additionWithoutVariant.has(milestone)) {
        continue
      }
      if (available.size === 0) continue
      const pool = Array.from(available)
      const idx = Math.floor(Math.random() * pool.length)
      const variant = pool[idx]!
      const step = Math.max(1, baseStepForRank(variant, star))
      const current = Math.max(step, Number(values[variant] ?? step))
      values[variant] = current + step
    }

    return { ...it, subValues: values }
  }

  const makeDefaultItem = (allocItemId: () => number): RuleTesterItem => {
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!
    const slotIds = Object.keys(artifactTypeNames).map(Number)
    const levelMilestones: readonly LevelMilestone[] = LEVEL_MILESTONES
    const slot = pick(slotIds) as ArtifactTypeId
    const allowedMainSet = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
    const allowedMains = allowedMainSet ? Array.from(allowedMainSet) : [StatVariant.HP, StatVariant.ATK, StatVariant.DEF]
    const main = pick(allowedMains) as number
    const isAccessory = Number(slot) === ArtifactType.Ring || Number(slot) === ArtifactType.Amulet || Number(slot) === ArtifactType.Banner
    const factionPool = [
      Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians,
      Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs,
      Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant,
      Faction.Shadowkin, Faction.SylvanWatchers, Faction.Dwarves,
    ] as const
    const subValues: Record<number, number> = {}
    const baseItem: RuleTesterItem = {
      slot,
      set: ((): ArtifactSetId => {
        const pool = allowedTesterSetIds(slot)
        const id = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : ArtifactSet.Speed
        return id as ArtifactSetId
      })(),
      rank: (1 + Math.floor(Math.random() * 6)) as 1|2|3|4|5|6,
      rarity: (1 + Math.floor(Math.random() * 6)) as 1|2|3|4|5|6,
      level: pick(levelMilestones),
      faction: (isAccessory ? pick(factionPool) : 0) as FactionId,
      main,
      subValues,
      itemId: allocItemId(),
    }
    return applyRandomRollsForLevel(adjustSubValuesFor(baseItem))
  }

  return { adjustSubValuesFor, applyRandomRollsForLevel, makeDefaultItem }
}

type CanonicalNormalizedStat = {
  source: NormalizedStat['source'] | null
  statId: number | null
  isFlat: boolean
  variant: number | null
  baseValue: number
  glyphValue: number
  mythValue: number
  totalValue: number
  rolls: number | null
  position: number | null
}

type CanonicalPreviewExtras = {
  source: TesterItemPreviewExtras['source'] | null
  rerollCount: number | null
  equippedToChampionId: number | null
  equippedChampionBaseId: number | null
  equippedChampionRarity: number | null
  equippedChampionName: string | null
  equippedChampionLocation: TesterItemPreviewExtras['equippedChampionLocation'] | null
  mainStat: CanonicalNormalizedStat | null
  substats: CanonicalNormalizedStat[] | null
  ascension: CanonicalNormalizedStat | null
  exactLevel: number | null
  // Track DB last-used timestamps so metadata-only refreshes invalidate caches.
  lastUseLocalTimestamp: string | null
}

const coerceFiniteNumber = (value: unknown, fallback: number): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const normalizeFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const canonicalizeSubValues = (subValues?: Record<number, number>): Array<[number, number]> => {
  if (!subValues) return []
  const entries = Object.entries(subValues).map(([variantKey, value]) => {
    const variant = Number(variantKey)
    const safeVariant = Number.isFinite(variant) ? variant : 0
    const numericValue = Number(value)
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0
    return [safeVariant, safeValue] as [number, number]
  })
  entries.sort((a, b) => a[0] - b[0])
  return entries
}

const canonicalizeNormalizedStat = (stat?: NormalizedStat | null): CanonicalNormalizedStat | null => {
  if (!stat) return null
  return {
    source: stat.source ?? null,
    statId: normalizeFiniteNumber(stat.statId),
    isFlat: Boolean(stat.isFlat),
    variant: normalizeFiniteNumber(stat.variant),
    baseValue: coerceFiniteNumber(stat.baseValue, 0),
    glyphValue: coerceFiniteNumber(stat.glyphValue, 0),
    mythValue: coerceFiniteNumber(stat.mythValue, 0),
    totalValue: coerceFiniteNumber(stat.totalValue, 0),
    rolls: normalizeFiniteNumber(stat.rolls),
    position: normalizeFiniteNumber(stat.position),
  }
}

const canonicalizeStatArray = (stats?: NormalizedStat[] | null): CanonicalNormalizedStat[] | null => {
  if (!stats || stats.length === 0) return null
  const canonical = stats
    .map((stat) => canonicalizeNormalizedStat(stat))
    .filter((entry): entry is CanonicalNormalizedStat => Boolean(entry))
  if (canonical.length === 0) return null
  canonical.sort((a, b) => {
    const posA = a.position ?? 0
    const posB = b.position ?? 0
    if (posA !== posB) return posA - posB
    const variantA = a.variant ?? 0
    const variantB = b.variant ?? 0
    if (variantA !== variantB) return variantA - variantB
    const statA = a.statId ?? 0
    const statB = b.statId ?? 0
    return statA - statB
  })
  return canonical
}

const canonicalizePreviewExtras = (extras?: TesterItemPreviewExtras): CanonicalPreviewExtras | null => {
  if (!extras) return null
  return {
    source: extras.source ?? null,
    rerollCount: normalizeFiniteNumber(extras.rerollCount),
    equippedToChampionId: normalizeFiniteNumber(extras.equippedToChampionId),
    equippedChampionBaseId: normalizeFiniteNumber(extras.equippedChampionBaseId),
    equippedChampionRarity: normalizeFiniteNumber(extras.equippedChampionRarity),
    equippedChampionName: typeof extras.equippedChampionName === 'string' ? extras.equippedChampionName : null,
    equippedChampionLocation: extras.equippedChampionLocation ?? null,
    mainStat: canonicalizeNormalizedStat(extras.mainStat),
    substats: canonicalizeStatArray(extras.substats),
    ascension: canonicalizeNormalizedStat(extras.ascension),
    exactLevel: normalizeFiniteNumber(extras.exactLevel),
    // Keep the timestamp normalized so gear DB deltas refresh fingerprinted caches.
    lastUseLocalTimestamp: typeof extras.lastUseLocalTimestamp === 'string' ? extras.lastUseLocalTimestamp : null,
  }
}

const normalizeTesterName = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  return null
}

type RuleTesterItemSignature = {
  name: string | null
  slot: number
  set: number
  rank: number
  rarity: number
  level: number
  faction: number
  main: number
  subValues: Array<[number, number]>
  previewExtras: CanonicalPreviewExtras | null
}

type RuleTesterItemSignatureToken = {
  hash: number
  signature: RuleTesterItemSignature
}

type RuleTesterItemSignatureCountMap = Map<RuleTesterItemSignatureToken, number>

// Keep one deterministic non-crypt hash for interning typed signatures.
const HASH_FNV_OFFSET = 0x811c9dc5
const HASH_FNV_PRIME = 0x01000193
const HASH_NUMBER_BUFFER = new ArrayBuffer(8)
const HASH_NUMBER_VIEW = new DataView(HASH_NUMBER_BUFFER)

const hashFoldU32 = (hash: number, value: number): number => (
  (Math.imul((hash ^ (value >>> 0)) >>> 0, HASH_FNV_PRIME)) >>> 0
)

const hashFoldBool = (hash: number, value: boolean): number => hashFoldU32(hash, value ? 1 : 0)

const hashFoldNullableString = (hash: number, value: string | null): number => {
  if (value == null) return hashFoldU32(hash, 0xffffffff)
  let next = hashFoldU32(hash, value.length)
  for (let idx = 0; idx < value.length; idx += 1) next = hashFoldU32(next, value.charCodeAt(idx))
  return next
}

const hashFoldNumber = (hash: number, value: number): number => {
  const normalized = Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : Number.NaN
  HASH_NUMBER_VIEW.setFloat64(0, normalized, true)
  const low = HASH_NUMBER_VIEW.getUint32(0, true)
  const high = HASH_NUMBER_VIEW.getUint32(4, true)
  return hashFoldU32(hashFoldU32(hash, low), high)
}

const hashFoldNullableNumber = (hash: number, value: number | null): number => (
  value == null ? hashFoldU32(hash, 0xfffffffe) : hashFoldNumber(hash, value)
)

const hashFoldCanonicalStat = (hash: number, stat: CanonicalNormalizedStat | null): number => {
  if (!stat) return hashFoldU32(hash, 0xfffffffd)
  let next = hashFoldNullableString(hash, stat.source)
  next = hashFoldNullableNumber(next, stat.statId)
  next = hashFoldBool(next, stat.isFlat)
  next = hashFoldNullableNumber(next, stat.variant)
  next = hashFoldNumber(next, stat.baseValue)
  next = hashFoldNumber(next, stat.glyphValue)
  next = hashFoldNumber(next, stat.mythValue)
  next = hashFoldNumber(next, stat.totalValue)
  next = hashFoldNullableNumber(next, stat.rolls)
  next = hashFoldNullableNumber(next, stat.position)
  return next
}

const hashFoldCanonicalStatArray = (hash: number, stats: CanonicalNormalizedStat[] | null): number => {
  if (!stats) return hashFoldU32(hash, 0xfffffffc)
  let next = hashFoldU32(hash, stats.length)
  for (const stat of stats) next = hashFoldCanonicalStat(next, stat)
  return next
}

const hashFoldPreviewExtras = (hash: number, extras: CanonicalPreviewExtras | null): number => {
  if (!extras) return hashFoldU32(hash, 0xfffffffb)
  let next = hashFoldNullableString(hash, extras.source ?? null)
  next = hashFoldNullableNumber(next, extras.rerollCount)
  next = hashFoldNullableNumber(next, extras.equippedToChampionId)
  next = hashFoldNullableNumber(next, extras.equippedChampionBaseId)
  next = hashFoldNullableNumber(next, extras.equippedChampionRarity)
  next = hashFoldNullableString(next, extras.equippedChampionName)
  next = hashFoldNullableString(next, extras.equippedChampionLocation ?? null)
  next = hashFoldCanonicalStat(next, extras.mainStat)
  next = hashFoldCanonicalStatArray(next, extras.substats)
  next = hashFoldCanonicalStat(next, extras.ascension)
  next = hashFoldNullableNumber(next, extras.exactLevel)
  next = hashFoldNullableString(next, extras.lastUseLocalTimestamp)
  return next
}

const buildRuleTesterItemSignature = (item: RuleTesterItem | TestItem): RuleTesterItemSignature => ({
  name: normalizeTesterName((item as { name?: unknown }).name),
  slot: coerceFiniteNumber(item.slot, 0),
  set: coerceFiniteNumber(item.set, 0),
  rank: coerceFiniteNumber(item.rank, 0),
  rarity: coerceFiniteNumber(item.rarity, 0),
  level: coerceFiniteNumber(item.level, 0),
  faction: coerceFiniteNumber((item as { faction?: unknown }).faction, 0),
  main: coerceFiniteNumber(item.main, -1),
  subValues: canonicalizeSubValues(item.subValues),
  previewExtras: canonicalizePreviewExtras(item.previewExtras),
})

const hashRuleTesterItemSignature = (signature: RuleTesterItemSignature): number => {
  let hash = HASH_FNV_OFFSET
  hash = hashFoldNullableString(hash, signature.name)
  hash = hashFoldNumber(hash, signature.slot)
  hash = hashFoldNumber(hash, signature.set)
  hash = hashFoldNumber(hash, signature.rank)
  hash = hashFoldNumber(hash, signature.rarity)
  hash = hashFoldNumber(hash, signature.level)
  hash = hashFoldNumber(hash, signature.faction)
  hash = hashFoldNumber(hash, signature.main)
  hash = hashFoldU32(hash, signature.subValues.length)
  for (const [variant, value] of signature.subValues) {
    hash = hashFoldNumber(hash, variant)
    hash = hashFoldNumber(hash, value)
  }
  hash = hashFoldPreviewExtras(hash, signature.previewExtras)
  return hash >>> 0
}

const canonicalStatEqual = (
  left: CanonicalNormalizedStat | null,
  right: CanonicalNormalizedStat | null,
): boolean => (
  left === right
  || Boolean(left && right
    && left.source === right.source
    && left.statId === right.statId
    && left.isFlat === right.isFlat
    && left.variant === right.variant
    && left.baseValue === right.baseValue
    && left.glyphValue === right.glyphValue
    && left.mythValue === right.mythValue
    && left.totalValue === right.totalValue
    && left.rolls === right.rolls
    && left.position === right.position)
)

const canonicalStatArrayEqual = (
  left: CanonicalNormalizedStat[] | null,
  right: CanonicalNormalizedStat[] | null,
): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  if (left.length !== right.length) return false
  for (let idx = 0; idx < left.length; idx += 1) {
    if (!canonicalStatEqual(left[idx]!, right[idx]!)) return false
  }
  return true
}

const previewExtrasEqual = (left: CanonicalPreviewExtras | null, right: CanonicalPreviewExtras | null): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  if (
    left.source !== right.source
    || left.rerollCount !== right.rerollCount
    || left.equippedToChampionId !== right.equippedToChampionId
    || left.equippedChampionBaseId !== right.equippedChampionBaseId
    || left.equippedChampionRarity !== right.equippedChampionRarity
    || left.equippedChampionName !== right.equippedChampionName
    || left.equippedChampionLocation !== right.equippedChampionLocation
    || left.exactLevel !== right.exactLevel
    || left.lastUseLocalTimestamp !== right.lastUseLocalTimestamp
  ) {
    return false
  }
  if (!canonicalStatEqual(left.mainStat, right.mainStat)) return false
  if (!canonicalStatArrayEqual(left.substats, right.substats)) return false
  if (!canonicalStatEqual(left.ascension, right.ascension)) return false
  return true
}

const ruleTesterItemSignaturesEqual = (left: RuleTesterItemSignature, right: RuleTesterItemSignature): boolean => {
  if (left === right) return true
  if (
    left.name !== right.name
    || left.slot !== right.slot
    || left.set !== right.set
    || left.rank !== right.rank
    || left.rarity !== right.rarity
    || left.level !== right.level
    || left.faction !== right.faction
    || left.main !== right.main
  ) {
    return false
  }
  if (left.subValues.length !== right.subValues.length) return false
  for (let idx = 0; idx < left.subValues.length; idx += 1) {
    const leftPair = left.subValues[idx]!
    const rightPair = right.subValues[idx]!
    if (leftPair[0] !== rightPair[0] || leftPair[1] !== rightPair[1]) return false
  }
  return previewExtrasEqual(left.previewExtras, right.previewExtras)
}

const createRuleTesterSignatureInterner = () => {
  const internedByHash = new Map<number, RuleTesterItemSignatureToken[]>()
  const byReference = new WeakMap<object, RuleTesterItemSignatureToken>()

  const intern = (item: RuleTesterItem | TestItem): RuleTesterItemSignatureToken => {
    if (item && typeof item === 'object') {
      const cached = byReference.get(item as object)
      if (cached) return cached
    }
    const signature = buildRuleTesterItemSignature(item)
    const hash = hashRuleTesterItemSignature(signature)
    const bucket = internedByHash.get(hash)
    if (bucket) {
      for (const token of bucket) {
        if (ruleTesterItemSignaturesEqual(token.signature, signature)) {
          if (item && typeof item === 'object') byReference.set(item as object, token)
          return token
        }
      }
    }
    const created: RuleTesterItemSignatureToken = { hash, signature }
    if (bucket) {
      bucket.push(created)
    } else {
      internedByHash.set(hash, [created])
    }
    if (item && typeof item === 'object') byReference.set(item as object, created)
    return created
  }

  return { intern }
}

const incrementSignatureCount = (
  map: RuleTesterItemSignatureCountMap,
  key: RuleTesterItemSignatureToken,
  delta = 1,
): void => {
  map.set(key, (map.get(key) ?? 0) + delta)
}

const readSignatureCount = (
  map: RuleTesterItemSignatureCountMap,
  key: RuleTesterItemSignatureToken,
): number => map.get(key) ?? 0

export function fingerprintRuleTesterItem(item: RuleTesterItem | TestItem): string {
  // Keep the public helper stable for tests/dev tooling.
  return JSON.stringify(buildRuleTesterItemSignature(item))
}

export type DiffRuleTesterItemsOptions = {
  retainManualItems?: boolean
}

export function diffRuleTesterItems(
  currentItems: RuleTesterItem[],
  desiredItems: TestItem[],
  pendingQueue: TestItem[] = [],
  options?: DiffRuleTesterItemsOptions,
): { removalItemIds: number[]; nextPendingQueue: TestItem[]; additions: TestItem[] } {
  const retainManualItems = Boolean(options?.retainManualItems)
  const signatureInterner = createRuleTesterSignatureInterner()
  const desiredCounts: RuleTesterItemSignatureCountMap = new Map()
  for (const desired of desiredItems) {
    incrementSignatureCount(desiredCounts, signatureInterner.intern(desired))
  }

  const currentCounts: RuleTesterItemSignatureCountMap = new Map()
  for (const item of currentItems) {
    if (retainManualItems && isManualTesterItem(item)) continue
    incrementSignatureCount(currentCounts, signatureInterner.intern(item))
  }

  const currentKeepLimits: RuleTesterItemSignatureCountMap = new Map()
  for (const [key, desiredCount] of desiredCounts.entries()) {
    if (desiredCount <= 0) continue
    const currentCount = readSignatureCount(currentCounts, key)
    const keep = Math.min(currentCount, desiredCount)
    if (keep > 0) {
      currentKeepLimits.set(key, keep)
    }
  }

  const removalItemIds: number[] = []
  const currentKeptCounts: RuleTesterItemSignatureCountMap = new Map()
  for (const item of currentItems) {
    if (retainManualItems && isManualTesterItem(item)) continue
    const key = signatureInterner.intern(item)
    const keepLimit = readSignatureCount(currentKeepLimits, key)
    const kept = readSignatureCount(currentKeptCounts, key)
    if (kept < keepLimit) {
      currentKeptCounts.set(key, kept + 1)
      continue
    }
    removalItemIds.push(item.itemId)
  }

  const pendingKeepLimits: RuleTesterItemSignatureCountMap = new Map()
  for (const [key, desiredCount] of desiredCounts.entries()) {
    const keptCurrent = readSignatureCount(currentKeepLimits, key)
    const needFromPending = desiredCount - keptCurrent
    if (needFromPending > 0) {
      pendingKeepLimits.set(key, needFromPending)
    }
  }

  const pendingRetainedCounts: RuleTesterItemSignatureCountMap = new Map()
  const retainedPending: TestItem[] = []
  for (const pending of pendingQueue) {
    const key = signatureInterner.intern(pending)
    const limit = readSignatureCount(pendingKeepLimits, key)
    if (!limit || limit <= 0) continue
    const kept = readSignatureCount(pendingRetainedCounts, key)
    if (kept >= limit) continue
    pendingRetainedCounts.set(key, kept + 1)
    retainedPending.push(pending)
  }

  const additions: TestItem[] = []
  const satisfiedCounts: RuleTesterItemSignatureCountMap = new Map()
  for (const desired of desiredItems) {
    const key = signatureInterner.intern(desired)
    const satisfied = readSignatureCount(satisfiedCounts, key)
    const currentKeep = readSignatureCount(currentKeepLimits, key)
    const pendingKeep = readSignatureCount(pendingRetainedCounts, key)
    const satisfiedLimit = currentKeep + pendingKeep
    if (satisfied < satisfiedLimit) {
      satisfiedCounts.set(key, satisfied + 1)
      continue
    }
    const desiredCount = readSignatureCount(desiredCounts, key)
    if (satisfied < desiredCount) {
      additions.push(desired)
      satisfiedCounts.set(key, satisfied + 1)
    }
  }

  const nextPendingQueue = retainedPending.concat(additions)
  return { removalItemIds, nextPendingQueue, additions }
}

const deserializeTesterItems = (
  payload: RuleTesterAutosavePayload | null | undefined,
  opts: { math: RuleTesterMath; allocItemId: () => number },
): RuleTesterItem[] | null => {
  if (!payload) return null
  const compressed = payload.ItemsCompressed
  if (typeof compressed !== 'string' || compressed.length === 0) return null
  const savedItems = parseCompressedTesterItems(compressed)
  if (!Array.isArray(savedItems) || savedItems.length === 0) return null
  const { math } = opts
  const restored: RuleTesterItem[] = []
  savedItems.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return
    const subValues: Record<number, number> = {}
    const payloadValues = (raw.subValues && typeof raw.subValues === 'object') ? raw.subValues : {}
    for (const [key, value] of Object.entries(payloadValues)) {
      subValues[Number(key)] = Math.max(0, Number(value) || 0)
    }
    const rawItem = raw as { itemId?: number }
    const payloadItemId = typeof rawItem.itemId === 'number' && Number.isFinite(rawItem.itemId)
      ? rawItem.itemId
      : null
    const fallbackId = -(idx + 1)
    const itemId = payloadItemId ?? opts.allocItemId() ?? fallbackId
    restored.push(math.adjustSubValuesFor({ ...(raw as TestItem), subValues, itemId }))
  })
  return restored.length > 0 ? restored : null
}

export function loadRuleTesterAutosaveDraft(opts: { math: RuleTesterMath; allocItemId: () => number }): {
  items: RuleTesterItem[]
  savedAt: string | null
  itemCount: number
} | null {
  try {
    const entry = loadAutosave<RuleTesterAutosavePayload>(AUTOSAVE_TESTER_KEY)
    const restored = deserializeTesterItems(entry?.payload ?? null, opts)
    if (!restored || restored.length === 0) return null
    const savedAtRaw = entry?.payload?.SavedAt
    const count = typeof entry?.payload?.ItemCount === 'number' ? Number(entry?.payload?.ItemCount) : restored.length
    return {
      items: restored,
      savedAt: typeof savedAtRaw === 'string' ? savedAtRaw : null,
      itemCount: count,
    }
  } catch {
    return null
  }
}
