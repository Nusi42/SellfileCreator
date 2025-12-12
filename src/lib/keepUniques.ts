import { isAccessorySlot } from './testerDomain'
import { evaluateMatchesByConfig } from './ruleEval'
import type { TesterPreviewRow } from '../types/testerPreview'
import type {
  ArtifactSetId,
  ArtifactTypeId,
  FactionId,
  LevelMilestone,
  RankValue,
  StatVariant,
} from './types'
import {
  ArtifactSet,
  ArtifactType,
  StatVariant as StatVariantEnum,
  artifactSetNames,
  artifactTypeNames,
  factionNames,
  getAccessorySlotsCompatibleSetIds,
  rarityNames,
  variantFromLabel,
  findArtifactSetIdByName,
} from './types'
import type { SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'
import { normalizeConfigName } from './ruleConfigIndex'

const RANK_MIN = 1
const RANK_MAX = 6

export type KeepUniqueCombination = {
  slots: ArtifactTypeId[]
  sets: ArtifactSetId[]
  metaSetIds: string[]
  ranks: RankValue[]
  rarities: RankValue[]
  mainStats: StatVariant[]
  factions: FactionId[]
}

// Count mode decides whether the required total is per rule or enforced per set/faction/main tuple.
export type KeepUniqueRuleCountMode = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

// Mirrors the default scope-chip state (slot+set+faction+main) so HSFC imports and tutorials stay aligned.
export const KEEP_UNIQUE_DEFAULT_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: true,
  perFaction: true,
  perMainStat: true,
  perSlot: false,
}

const coerceBoolean = (value: unknown): boolean => value === true

export const KeepUniqueRuleActivation = {
  Off: 'off',
  ProtectExisting: 'protectExisting',
  AnticipateGaps: 'anticipateGaps',
} as const

// eslint-disable-next-line no-redeclare -- allow constant/type pair
export type KeepUniqueRuleActivation =
  (typeof KeepUniqueRuleActivation)[keyof typeof KeepUniqueRuleActivation]

const KEEP_UNIQUE_RULE_ACTIVATION_VALUES = new Set<KeepUniqueRuleActivation>([
  KeepUniqueRuleActivation.Off,
  KeepUniqueRuleActivation.ProtectExisting,
  KeepUniqueRuleActivation.AnticipateGaps,
])

const normalizeKeepUniqueActivation = (
  value: unknown,
  legacyEnabled?: unknown,
): KeepUniqueRuleActivation => {
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (lowered.length > 0) {
      if (lowered === KeepUniqueRuleActivation.Off || lowered === 'disabled') {
        return KeepUniqueRuleActivation.Off
      }
      if (
        lowered === KeepUniqueRuleActivation.AnticipateGaps
        || lowered === 'anticipate'
        || lowered === 'anticipategaps'
        || lowered === 'placeholder'
      ) {
        return KeepUniqueRuleActivation.AnticipateGaps
      }
      if (KEEP_UNIQUE_RULE_ACTIVATION_VALUES.has(lowered as KeepUniqueRuleActivation)) {
        return lowered as KeepUniqueRuleActivation
      }
    }
  }
  if (legacyEnabled === false) return KeepUniqueRuleActivation.Off
  if (legacyEnabled === true) return KeepUniqueRuleActivation.ProtectExisting
  return KeepUniqueRuleActivation.ProtectExisting
}

export const isKeepUniqueRuleActive = (rule: KeepUniqueRule): boolean => (
  rule.activation !== KeepUniqueRuleActivation.Off
)

const sanitizeCountMode = (raw: Partial<KeepUniqueRuleCountMode> | null | undefined): KeepUniqueRuleCountMode => {
  const perRule = coerceBoolean(raw?.perRule)
  const perSet = coerceBoolean(raw?.perSet)
  const perFaction = coerceBoolean(raw?.perFaction)
  const perMainStat = coerceBoolean(raw?.perMainStat)
  const perSlot = coerceBoolean(raw?.perSlot)
  if (perRule) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
      perSlot: false,
    }
  }
  const hasGrouping = perSet || perFaction || perMainStat || perSlot
  if (!hasGrouping) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
      perSlot: false,
    }
  }
  return {
    perRule: false,
    perSet,
    perFaction,
    perMainStat,
    perSlot,
  }
}

const normalizeCountMode = (value: unknown): KeepUniqueRuleCountMode => {
  if (!value) return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  if (typeof value === 'string') {
    if (value === 'perRule' || value === 'rule') {
      return {
        perRule: true,
        perSet: false,
        perFaction: false,
        perMainStat: false,
        perSlot: false,
      }
    }
    // Legacy per-combination strings default to the full grouping set (slot+set+faction+main stat).
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  }
  if (typeof value === 'object') {
    const rec = value as Partial<KeepUniqueRuleCountMode>
    return sanitizeCountMode(rec)
  }
  return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
}

export const isPerRuleCountMode = (mode: KeepUniqueRuleCountMode): boolean => mode.perRule
export const sanitizeKeepUniqueCountMode = (mode: KeepUniqueRuleCountMode): KeepUniqueRuleCountMode => sanitizeCountMode(mode)

export const cloneKeepUniqueCombination = (combination: KeepUniqueCombination): KeepUniqueCombination => ({
  slots: [...combination.slots],
  sets: [...combination.sets],
  metaSetIds: [...(combination.metaSetIds ?? [])],
  ranks: [...combination.ranks],
  rarities: [...combination.rarities],
  mainStats: [...(combination.mainStats ?? [])],
  factions: [...(combination.factions ?? [])],
})

export type KeepUniqueRule = {
  id: string
  name: string
  combination: KeepUniqueCombination
  requiredCount: number
  activation: KeepUniqueRuleActivation
  countMode: KeepUniqueRuleCountMode
}

// Accessory defaults keep Rare+ pieces to skip fodder while still catching Epic/Legendary/Mythical.
const ACCESSORY_KEEP_UNIQUE_DEFAULT_NAME = 'Rare+ Accessories (5-6★)'

const ACCESSORY_KEEP_UNIQUE_SLOTS: readonly ArtifactType[] = [
  ArtifactType.Ring,
  ArtifactType.Amulet,
  ArtifactType.Banner,
] as const

const ACCESSORY_KEEP_UNIQUE_RARE_PLUS_RARITIES: readonly RankValue[] = [3, 4, 5, 6]
const ACCESSORY_KEEP_UNIQUE_STAR_VALUES: readonly RankValue[] = [5, 6]

const ACCESSORY_KEEP_UNIQUE_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: true,
  perFaction: true,
  perMainStat: true,
  perSlot: true,
}

/** Default rule keeps every 5★/6★ ring/amulet/banner per slot/set/main/faction. */
function createDefaultAccessoryKeepUniqueRule(): KeepUniqueRule {
  return {
    id: createKeepUniqueRuleId(),
    combination: {
      slots: [...ACCESSORY_KEEP_UNIQUE_SLOTS],
      sets: [...getAccessorySlotsCompatibleSetIds()],
      metaSetIds: [],
      ranks: [...ACCESSORY_KEEP_UNIQUE_STAR_VALUES],
      rarities: [...ACCESSORY_KEEP_UNIQUE_RARE_PLUS_RARITIES],
      mainStats: [],
      factions: [],
    },
    name: ACCESSORY_KEEP_UNIQUE_DEFAULT_NAME,
    requiredCount: 1,
    activation: KeepUniqueRuleActivation.ProtectExisting,
    countMode: { ...ACCESSORY_KEEP_UNIQUE_COUNT_MODE },
  }
}

const ARMOR_KEEP_UNIQUE_DEFAULT_NAME = 'Utility Sets (5-6★)'

const ARMOR_KEEP_UNIQUE_SLOTS: readonly ArtifactType[] = [
  ArtifactType.Weapon,
  ArtifactType.Helmet,
  ArtifactType.Shield,
  ArtifactType.Gauntlets,
  ArtifactType.Chestplate,
  ArtifactType.Boots,
] as const

const ARMOR_KEEP_UNIQUE_SET_IDS: readonly ArtifactSetId[] = [
  ArtifactSet.Stun,
  ArtifactSet.Toxic,
  ArtifactSet.Cursed,
  ArtifactSet.Provoke,
  ArtifactSet.Destroy,
] as const

const ARMOR_KEEP_UNIQUE_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: true,
  perFaction: false,
  perMainStat: false,
  perSlot: true,
}

// Armor defaults focus on top-end control sets: Legendary+/Mythical at 6★ only.
const ARMOR_KEEP_UNIQUE_LEGENDARY_PLUS_RARITIES: readonly RankValue[] = [5, 6]
const ARMOR_KEEP_UNIQUE_STAR_VALUES: readonly RankValue[] = [6]

function createDefaultArmorKeepUniqueRule(): KeepUniqueRule {
  return {
    id: createKeepUniqueRuleId(),
    combination: {
      slots: [...ARMOR_KEEP_UNIQUE_SLOTS],
      sets: [...ARMOR_KEEP_UNIQUE_SET_IDS],
      metaSetIds: [],
      ranks: [...ARMOR_KEEP_UNIQUE_STAR_VALUES],
      rarities: [...ARMOR_KEEP_UNIQUE_LEGENDARY_PLUS_RARITIES],
      mainStats: [],
      factions: [],
    },
    name: ARMOR_KEEP_UNIQUE_DEFAULT_NAME,
    requiredCount: 1,
    activation: KeepUniqueRuleActivation.Off,
    countMode: { ...ARMOR_KEEP_UNIQUE_COUNT_MODE },
  }
}

/** Build the seeded Keep Unique rule list for new sessions. */
export function buildDefaultKeepUniqueRules(): KeepUniqueRule[] {
  return [createDefaultAccessoryKeepUniqueRule(), createDefaultArmorKeepUniqueRule()]
}

export type KeepUniqueDetectionArtifact = {
  itemKey: number
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue
  level: LevelMilestone
  exactLevel: number | null
  faction: FactionId
  mainStat: StatVariant
  substats: KeepUniqueDetectionSubstat[]
}

export type KeepUniqueDetectionSubstat = {
  variant: StatVariant
  isFlat: boolean
  value: number
}

export type KeepUniqueDetectionEntry = {
  hash: string
  combination: KeepUniqueCombination
  ruleId: string | null
  ruleActivation: KeepUniqueRuleActivation
  // Carry the scope metadata so the UI can explain how totals were derived.
  countMode: KeepUniqueRuleCountMode
  perGroupRequiredCount: number
  groupsTracked: number
  requiredCount: number
  currentCount: number
  projectedCount: number
  deficit: number
  coveredByExisting: boolean
  itemKeys: number[]
  artifacts: KeepUniqueDetectionArtifact[]
  placeholders: KeepUniquePlaceholderRequest[]
}

export type KeepUniqueDetectionSnapshot = {
  scannedAt: number
  entries: KeepUniqueDetectionEntry[]
}

export type KeepUniquePlaceholderRequest = {
  combination: KeepUniqueCombination
  missing: number
  reason: 'global' | 'group'
}

export type KeepUniqueCandidate = {
  row: TesterPreviewRow
  artifact: NormalizedGearArtifact
  itemKey: number
  groupKey: KeepUniqueGroupKey
  isSold: boolean
}

export type KeepUniqueCandidateSnapshot = {
  candidates: KeepUniqueCandidate[]
  uniqueItemKeys: ReadonlySet<number>
}

export type KeepUniquesMergeInput = {
  enabled: boolean
  rules: readonly KeepUniqueRule[]
  detection?: KeepUniqueDetectionSnapshot | null
}

/**
 * True when the master toggle is on and at least one rule is enabled.
 * Used by pipeline callers to avoid unnecessary detection passes.
 */
export const hasActiveKeepUniqueRules = (input: KeepUniquesMergeInput | null | undefined): boolean => {
  if (!input || input.enabled !== true) return false
  if (!Array.isArray(input.rules) || input.rules.length === 0) return false
  return input.rules.some((rule) => rule && isKeepUniqueRuleActive(rule))
}

export type KeepUniqueDetectionParams = {
  candidates: readonly KeepUniqueCandidate[]
  rules: readonly KeepUniqueRule[]
  enabled: boolean
  now?: number
}

/** Generate a short, unique id for combination rules. */
export function createKeepUniqueRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ku_${Date.now().toString(36)}_${rand}`
}

/** Canonical hash for combination comparisons and metadata lookups. */
const canonicalizeList = (values: readonly number[]): string => {
  if (!values.length) return '*'
  const numeric = values.map((v) => Number(v)).filter((v) => Number.isFinite(v))
  if (numeric.length === 0) return '*'
  numeric.sort((a, b) => a - b)
  return numeric.join(',')
}

const canonicalizeStringList = (values: readonly string[]): string => {
  if (!values.length) return '*'
  const cleaned = values
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
  if (!cleaned.length) return '*'
  cleaned.sort()
  return cleaned.join(',')
}

export function hashKeepUniqueCombination(combination: KeepUniqueCombination): string {
  return [
    canonicalizeList(combination.slots),
    canonicalizeList(combination.sets),
    canonicalizeStringList(combination.metaSetIds),
    canonicalizeList(combination.ranks),
    canonicalizeList(combination.rarities),
    canonicalizeList(combination.mainStats),
    canonicalizeList(combination.factions),
  ].join('|')
}

/** Clamp ranks/rarities to the valid 1..6 range. */
// Name lookups keep HSFC tuple fields readable while still resolving back to enum IDs on load.
const artifactTypeIdByName = new Map<string, ArtifactTypeId>(
  Object.entries(artifactTypeNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactTypeId]),
)

const artifactSetIdByName = new Map<string, ArtifactSetId>(
  Object.entries(artifactSetNames).map(([id, label]) => [label.trim().toLowerCase(), Number(id) as ArtifactSetId]),
)

const factionIdByName = new Map<string, FactionId>(
  Object.entries(factionNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Number(id) as FactionId]),
)

// Rarity is captured as labels in HSFC; keep a reverse map so loader can stay locale-agnostic.
const rarityCodeByName = new Map<string, RankValue>(
  Object.entries(rarityNames)
    .filter(([, name]) => Boolean(name && name.trim()))
    .map(([id, name]) => [name.trim().toLowerCase(), Math.max(RANK_MIN, Math.min(RANK_MAX, Number(id))) as RankValue]),
)

/** Clamp ranks/rarities to the valid 1..6 range, accepting either numbers or labels. */
const clampRankOrRarity = (value: unknown): RankValue => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return RANK_MAX
    const namedRarity = rarityCodeByName.get(trimmed.toLowerCase())
    if (namedRarity != null) return namedRarity
    const numericInLabel = Number(trimmed.replace(/[^0-9]/g, ''))
    if (Number.isFinite(numericInLabel) && numericInLabel > 0) {
      const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, Math.floor(numericInLabel)))
      return clamped as RankValue
    }
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return RANK_MAX
  const rounded = Math.floor(numeric)
  const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, rounded))
  return clamped as RankValue
}

/** Resolve the stat variant from user input (label or numeric); falls back to Any. */
const coerceStatVariant = (value: unknown): StatVariant => {
  if (typeof value === 'string') {
    // Stat labels should be readable in HSFC; keep the parser tolerant of labels first.
    const parsed = variantFromLabel(value.trim())
    if (parsed !== null) return parsed
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return StatVariantEnum.Any
  return numeric as StatVariant
}

const normalizeSelectionArray = <T extends number>(
  value: unknown,
  coerce: (raw: unknown) => T | null,
): T[] => {
  if (value == null) return []
  const list = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: T[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      for (const nested of normalizeSelectionArray(raw, coerce)) {
        const key = String(nested)
        if (seen.has(key)) continue
        seen.add(key)
        result.push(nested)
      }
      continue
    }
    const normalized = coerce(raw)
    if (normalized == null) continue
    const key = String(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

const coerceArtifactTypeId = (value: unknown): ArtifactTypeId | null => {
  if (typeof value === 'string') {
    // Handle readable slot labels in HSFC first, then allow numeric ids for resilience.
    const found = artifactTypeIdByName.get(value.trim().toLowerCase())
    if (found != null) return found
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactTypeId
}

const coerceArtifactSetId = (value: unknown): ArtifactSetId | null => {
  if (typeof value === 'string') {
    // Accept readable set names so exported HSFC stays human-friendly.
    const trimmed = value.trim().toLowerCase()
    const found = artifactSetIdByName.get(trimmed)
    if (found != null) return found
    const runtime = findArtifactSetIdByName(value.trim())
    if (runtime !== null) return runtime
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactSetId
}

const coerceFactionId = (value: unknown): FactionId | null => {
  if (typeof value === 'string') {
    // Faction names only apply to accessories; still resolve strings to keep tuples readable.
    const found = factionIdByName.get(value.trim().toLowerCase())
    if (found != null) return found
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as FactionId
}

const normalizeStringSelectionArray = (value: unknown): string[] => {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of list) {
    if (Array.isArray(raw)) {
      for (const nested of normalizeStringSelectionArray(raw)) {
        if (seen.has(nested)) continue
        seen.add(nested)
        result.push(nested)
      }
      continue
    }
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/** Normalize combination payloads loaded from HSFC/autosave. */
export function normalizeKeepUniqueCombination(value: unknown): KeepUniqueCombination | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const slotValues = normalizeSelectionArray(rec.slots, coerceArtifactTypeId)
  const setValues = normalizeSelectionArray(rec.sets, coerceArtifactSetId)
  const rankValues = normalizeSelectionArray(rec.ranks, (raw) => {
    if (raw == null || raw === '') return null
    return clampRankOrRarity(raw)
  })
  const rarityValues = normalizeSelectionArray(rec.rarities, (raw) => {
    if (raw == null || raw === '') return null
    return clampRankOrRarity(raw)
  })
  const mainStats = normalizeSelectionArray(rec.mainStats, (raw) => {
    if (raw == null || raw === '') return null
    const variant = coerceStatVariant(raw)
    if (variant === StatVariantEnum.Any) return null
    return variant
  })
  if (mainStats.length > 1) mainStats.sort((a, b) => a - b)
  const factionValues = normalizeSelectionArray(rec.factions, (raw) => {
    if (raw == null || raw === '') return null
    return coerceFactionId(raw)
  })
  const metaSetIds = normalizeStringSelectionArray(rec.metaSetIds ?? rec.metaSets)
  return {
    slots: slotValues,
    sets: setValues,
    metaSetIds,
    ranks: rankValues,
    rarities: rarityValues,
    mainStats,
    factions: factionValues,
  }
}

/** Normalize rule payloads; returns null when combination data is invalid. */
export function normalizeKeepUniqueRule(value: unknown): KeepUniqueRule | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const combination = normalizeKeepUniqueCombination(rec.combination ?? rec.tuple ?? rec)
  if (!combination) return null
  const name = (() => {
    if (typeof rec.name !== 'string') return ''
    const trimmed = rec.name.trim()
    if (!trimmed) return ''
    return trimmed
  })()
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepUniqueRuleId()
  const rawRequired = Number(rec.requiredCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  const activation = normalizeKeepUniqueActivation(rec.activation, rec.enabled)
  const countMode = (() => {
    if ('countMode' in rec) return normalizeCountMode(rec.countMode)
    if (rec.requirePerCombination === true) return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  })()
  return {
    id: rawId,
    combination,
    requiredCount,
    activation,
    countMode,
    name,
  }
}

/** Shared helper for mapping tester artifacts to the detection item key. */
export function getKeepUniqueItemKey(artifact: NormalizedGearArtifact): number {
  const testerItemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
  if (Number.isFinite(testerItemId)) return testerItemId
  if (Number.isFinite(artifact.id)) return Number(artifact.id)
  return 0
}

export type KeepUniqueGroupKey = string

/** Hash representing the slot+set+main+faction group used for uniqueness filtering. */
export function getKeepUniqueGroupKey(artifact: NormalizedGearArtifact): KeepUniqueGroupKey {
  const slot = Number(artifact.slot)
  const set = Number(artifact.set)
  const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  return [slot, set, mainStat, faction].join(':')
}

type KeepUniqueCountKey = string

const getKeepUniqueCountKey = (artifact: NormalizedGearArtifact, mode: KeepUniqueRuleCountMode): KeepUniqueCountKey => {
  if (mode.perRule) return 'global'
  const parts: string[] = []
  if (mode.perSlot) {
    parts.push(`slot:${Number(artifact.slot)}`)
  }
  if (mode.perSet) {
    parts.push(`set:${Number(artifact.set)}`)
  }
  if (mode.perFaction) {
    const faction = isAccessorySlot(Number(artifact.slot)) ? Number(artifact.faction ?? 0) : 0
    parts.push(`faction:${faction}`)
  }
  if (mode.perMainStat) {
    const mainStat = Number(artifact.mainStat?.variant ?? StatVariantEnum.Any)
    parts.push(`main:${mainStat}`)
  }
  return parts.length > 0 ? parts.join('|') : 'global'
}

const matchesSelection = (selection: readonly number[], candidate: number): boolean => {
  if (!selection.length) return true
  return selection.some((value) => Number(value) === Number(candidate))
}

// Placeholder combos inherit the base filters but narrow whichever dimensions affect the group key.
const buildPlaceholderCombinationForGroup = (params: {
  base: KeepUniqueCombination
  mode: KeepUniqueRuleCountMode
  sample: NormalizedGearArtifact | null
}): KeepUniqueCombination => {
  const { base, mode, sample } = params
  if (!sample) return cloneKeepUniqueCombination(base)
  const clone = cloneKeepUniqueCombination(base)
  if (mode.perSlot) clone.slots = [Number(sample.slot) as ArtifactTypeId]
  if (mode.perSet) clone.sets = [Number(sample.set) as ArtifactSetId]
  if (mode.perMainStat) {
    const variant = sample.mainStat?.variant
    clone.mainStats = variant == null || variant === StatVariantEnum.Any
      ? []
      : [variant]
  }
  if (mode.perFaction) {
    const faction = isAccessorySlot(Number(sample.slot)) ? Number(sample.faction ?? 0) : 0
    clone.factions = faction > 0 ? [faction as FactionId] : []
  }
  return clone
}

/** Determine whether an artifact satisfies a Keep Unique combination filter. */
export function artifactMatchesKeepUniqueRule(artifact: NormalizedGearArtifact, combination: KeepUniqueCombination): boolean {
  const slot = Number(artifact.slot)
  if (!matchesSelection(combination.slots, slot)) return false

  const setId = Number(artifact.set)
  if (!matchesSelection(combination.sets, setId)) return false

  const rankValue = Number(artifact.rank)
  if (!matchesSelection(combination.ranks, rankValue)) return false

  const rarityValue = Number(artifact.rarity)
  if (!matchesSelection(combination.rarities, rarityValue)) return false

  if (combination.mainStats.length > 0) {
    const artifactMain = artifact.mainStat?.variant
    if (artifactMain == null) return false
    if (!combination.mainStats.some((variant) => variant === artifactMain)) return false
  }

  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  if (!matchesSelection(combination.factions, faction)) return false

  return true
}

const toDetectionSubstats = (artifact: NormalizedGearArtifact): KeepUniqueDetectionSubstat[] => (
  artifact.substats.map((stat) => ({
    variant: stat.variant,
    isFlat: stat.isFlat,
    // Keep-unique rules must mirror the tester’s subValues payload, which omits glyph bonuses.
    // Using `totalValue` keeps the injected rule self-matching so glyph-heavy items are not skipped.
    value: Number((stat.totalValue ?? 0).toFixed(3)),
  }))
)

const toDetectionArtifact = (candidate: KeepUniqueCandidate): KeepUniqueDetectionArtifact => {
  const { artifact, itemKey } = candidate
  return {
    itemKey,
    slot: artifact.slot,
    set: artifact.set,
    rank: artifact.rank,
    rarity: artifact.rarity,
    level: artifact.level,
    exactLevel: artifact.exactLevel ?? null,
    faction: isAccessorySlot(artifact.slot) ? artifact.faction : (0 as FactionId),
    mainStat: artifact.mainStat?.variant ?? StatVariantEnum.Any,
    substats: toDetectionSubstats(artifact),
  }
}

export function collectKeepUniqueCandidates(params: {
  rows: readonly TesterPreviewRow[]
  baseRules: readonly HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
}): KeepUniqueCandidateSnapshot {
  const { rows, baseRules, configModes } = params
  if (!rows.length) return { candidates: [], uniqueItemKeys: new Set() }
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  const baseRuleCount = baseRuleList.length
  const candidates: KeepUniqueCandidate[] = []
  const uniqueItemKeys = new Set<number>()

  for (const row of rows) {
    const artifact = row.artifact
    const itemKey = getKeepUniqueItemKey(artifact)
    const groupKey = getKeepUniqueGroupKey(artifact)
    const isSold = (() => {
      if (row.baseMatch !== undefined) {
        const baseMatch = row.baseMatch
        return !baseMatch || baseMatch.keep !== true
      }
      if (baseRuleCount === 0) return true
      const { firstMatch } = evaluateMatchesByConfig(baseRuleList, artifact.testerItem, { configModes })
      return !firstMatch || firstMatch.keep !== true
    })()
    const candidate: KeepUniqueCandidate = { row, artifact, itemKey, groupKey, isSold }
    candidates.push(candidate)
    if (isSold) uniqueItemKeys.add(itemKey)
  }

  return { candidates, uniqueItemKeys }
}

/** Compute Keep Unique combination coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const entries: KeepUniqueDetectionEntry[] = []
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()

  for (const rule of rules) {
    const combination = rule.combination
    const countMode = sanitizeCountMode(rule.countMode)
    const perRuleMode = countMode.perRule
    const activation = rule.activation ?? KeepUniqueRuleActivation.ProtectExisting
    const ruleActive = enabled && activation !== KeepUniqueRuleActivation.Off
    // Current matches split into “kept” vs “sold” so deficits consider what is already safe.
    const matching = candidates.filter((candidate) => artifactMatchesKeepUniqueRule(candidate.artifact, combination))
    const requiredPerGroup = Math.max(1, Math.floor(rule.requiredCount))
    const placeholders: KeepUniquePlaceholderRequest[] = []

    if (perRuleMode) {
      let keptCount = 0
      let soldCount = 0
      for (const candidate of matching) {
        if (candidate.isSold) soldCount += 1
        else keptCount += 1
      }
      const requiredTotal = requiredPerGroup
      const projected = keptCount + (ruleActive ? soldCount : 0)
      const deficit = Math.max(0, requiredTotal - (keptCount + soldCount))
      if (deficit > 0) {
        placeholders.push({
          combination: cloneKeepUniqueCombination(combination),
          missing: deficit,
          reason: 'global',
        })
      }
      // When short, emit only the sold artifacts; already-kept items do not need injected rules.
      const atRisk = keptCount < requiredPerGroup
        ? matching.filter((candidate) => candidate.isSold)
        : []
      const itemKeys = atRisk.map((match) => match.itemKey)
      const artifacts = atRisk.map((match) => toDetectionArtifact(match))
      entries.push({
        hash: hashKeepUniqueCombination(combination),
        combination,
        ruleId: rule.id,
        ruleActivation: activation,
        countMode,
        perGroupRequiredCount: requiredPerGroup,
        groupsTracked: matching.length > 0 ? 1 : 0,
        requiredCount: requiredTotal,
        // current reflects how many matching items exist (kept + sold).
        currentCount: keptCount + soldCount,
        projectedCount: projected,
        deficit,
        coveredByExisting: keptCount >= requiredTotal,
        itemKeys,
        artifacts,
        placeholders,
      })
      continue
    }

    type KeepUniqueGroupBucket = { kept: KeepUniqueCandidate[]; sold: KeepUniqueCandidate[]; sample: KeepUniqueCandidate | null }
    const groupCounts = new Map<KeepUniqueCountKey, KeepUniqueGroupBucket>()
    for (const candidate of matching) {
      const key = getKeepUniqueCountKey(candidate.artifact, countMode)
      const entry = groupCounts.get(key)
      if (entry) {
        if (candidate.isSold) {
          entry.sold.push(candidate)
        } else {
          entry.kept.push(candidate)
        }
        if (!entry.sample) entry.sample = candidate
      } else {
        groupCounts.set(key, {
          kept: candidate.isSold ? [] : [candidate],
          sold: candidate.isSold ? [candidate] : [],
          sample: candidate,
        })
      }
    }

    const groupsTracked = groupCounts.size
    const effectiveGroupCount = groupsTracked > 0 ? groupsTracked : 1
    const requiredTotal = requiredPerGroup * effectiveGroupCount
    let deficit = 0
    let keptTotal = 0
    let soldTotal = 0
    const atRisk: KeepUniqueCandidate[] = []
    for (const group of groupCounts.values()) {
      keptTotal += group.kept.length
      soldTotal += group.sold.length
      const projectedGroup = group.kept.length + group.sold.length
      const deficitGroup = Math.max(0, requiredPerGroup - projectedGroup)
      if (group.kept.length < requiredPerGroup) {
        // Only sold artifacts need injected keep rules; already-kept artifacts are safe.
        atRisk.push(...group.sold)
        const sampleArtifact = group.sample?.artifact ?? null
        placeholders.push({
          combination: buildPlaceholderCombinationForGroup({
            base: combination,
            mode: countMode,
            sample: sampleArtifact,
          }),
          missing: deficitGroup,
          reason: 'group',
        })
      }
      deficit += deficitGroup
    }
    if (groupsTracked === 0 && requiredPerGroup > 0) {
      placeholders.push({
        combination: cloneKeepUniqueCombination(combination),
        missing: requiredPerGroup,
        reason: 'global',
      })
      deficit = requiredPerGroup
    }

    const projected = keptTotal + (ruleActive ? soldTotal : 0)
    const itemKeys = atRisk.map((match) => match.itemKey)
    const artifacts = atRisk.map((match) => toDetectionArtifact(match))
    entries.push({
      hash: hashKeepUniqueCombination(combination),
      combination,
      ruleId: rule.id,
      ruleActivation: activation,
      countMode,
      perGroupRequiredCount: requiredPerGroup,
      groupsTracked,
      requiredCount: requiredTotal,
      currentCount: keptTotal + soldTotal,
      projectedCount: projected,
      deficit,
      coveredByExisting: keptTotal >= requiredTotal,
      itemKeys,
      artifacts,
      placeholders,
    })
  }

  return { scannedAt: timestamp, entries }
}

/** Expand metaset references to explicit set IDs for combination evaluation. */
export function resolveKeepUniqueRulesWithMetasets(
  rules: readonly KeepUniqueRule[],
  metasets: readonly Metaset[],
): KeepUniqueRule[] {
  if (!rules.length) return rules as KeepUniqueRule[]
  if (!metasets.length) return rules as KeepUniqueRule[]
  const metaMap = new Map(metasets.map((meta) => [meta.id, meta]))
  let mutated = false
  const resolved = rules.map((rule) => {
    const metaIds = rule.combination.metaSetIds ?? []
    if (!metaIds.length) return rule
    const expanded = new Set<number>(rule.combination.sets.map((setId) => Number(setId)))
    let combinationChanged = false
    for (const metaId of metaIds) {
      const meta = metaMap.get(metaId)
      if (!meta || !Array.isArray(meta.sets)) continue
      for (const setId of meta.sets) {
        const numeric = Number(setId)
        if (expanded.has(numeric)) continue
        expanded.add(numeric)
        combinationChanged = true
      }
    }
    if (!combinationChanged) return rule
    mutated = true
    const sortedSets = Array.from(expanded).sort((a, b) => a - b) as ArtifactSetId[]
    return {
      ...rule,
      combination: {
        ...rule.combination,
        sets: sortedSets,
      },
    }
  })
  return mutated ? resolved : rules as KeepUniqueRule[]
}

type KeepUniqueLabelSource = KeepUniqueRule | HsfRuleWithCfg | null | undefined

/**
 * Resolve the label to display for a Keep Unique rule or injected row.
 * Prefers trimmed rule names, then falls back to a `#id` sentinel when blank.
 */
export function resolveKeepUniqueRuleLabel(source: KeepUniqueLabelSource): string | null {
  if (!source) return null
  const rawName = 'name' in source ? source.name : source.ConfigName
  const normalizedName = normalizeConfigName(rawName ?? null)
  if (normalizedName) return normalizedName
  const ordinal = ((): number | null => {
    if (typeof source !== 'object' || source === null) return null
    if ('__keepUniqueRuleOrdinal' in source) {
      const value = Number((source as { __keepUniqueRuleOrdinal?: number }).__keepUniqueRuleOrdinal)
      if (Number.isFinite(value) && value > 0) return value
    }
    return null
  })()
  if (ordinal) return `#${ordinal}`
  const fallbackId = 'name' in source ? source.id : source.__keepUniqueRuleId
  if (typeof fallbackId === 'string') {
    const trimmed = fallbackId.trim()
    if (trimmed.length > 0) return `#${trimmed}`
  }
  return null
}
