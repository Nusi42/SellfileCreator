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
import { StatVariant as StatVariantEnum } from './types'
import type { SellfileExportMode } from './hsfBuilder'
import type { HsfRuleWithCfg } from './merge'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'
import type { Metaset } from './metasets'

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
}

export const KEEP_UNIQUE_DEFAULT_COUNT_MODE: KeepUniqueRuleCountMode = {
  perRule: false,
  perSet: true,
  perFaction: true,
  perMainStat: true,
}

const coerceBoolean = (value: unknown): boolean => value === true

const sanitizeCountMode = (raw: Partial<KeepUniqueRuleCountMode> | null | undefined): KeepUniqueRuleCountMode => {
  const perRule = coerceBoolean(raw?.perRule)
  const perSet = coerceBoolean(raw?.perSet)
  const perFaction = coerceBoolean(raw?.perFaction)
  const perMainStat = coerceBoolean(raw?.perMainStat)
  if (perRule) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
    }
  }
  const hasGrouping = perSet || perFaction || perMainStat
  if (!hasGrouping) {
    return {
      perRule: true,
      perSet: false,
      perFaction: false,
      perMainStat: false,
    }
  }
  return {
    perRule: false,
    perSet,
    perFaction,
    perMainStat,
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
      }
    }
    // Legacy per-combination strings default to the full grouping set (set+faction+main stat).
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

export type KeepUniqueRule = {
  id: string
  combination: KeepUniqueCombination
  requiredCount: number
  enabled: boolean
  countMode: KeepUniqueRuleCountMode
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
  ruleEnabled: boolean
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
}

export type KeepUniqueDetectionSnapshot = {
  scannedAt: number
  entries: KeepUniqueDetectionEntry[]
}

export type KeepUniqueCandidate = {
  row: TesterPreviewRow
  artifact: NormalizedGearArtifact
  itemKey: number
  groupKey: KeepUniqueGroupKey
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
const clampRankOrRarity = (value: unknown): RankValue => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return RANK_MAX
  const rounded = Math.floor(numeric)
  const clamped = Math.max(RANK_MIN, Math.min(RANK_MAX, rounded))
  return clamped as RankValue
}

/** Resolve the stat variant from user input; falls back to Any. */
const coerceStatVariant = (value: unknown): StatVariant => {
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
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactTypeId
}

const coerceArtifactSetId = (value: unknown): ArtifactSetId | null => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric) as ArtifactSetId
}

const coerceFactionId = (value: unknown): FactionId | null => {
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
  const mainSource = rec.mainStats ?? rec.mainStat
  const mainStats = normalizeSelectionArray(mainSource, (raw) => {
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
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepUniqueRuleId()
  const rawRequired = Number(rec.requiredCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  const enabled = rec.enabled !== false
  const countMode = (() => {
    if ('countMode' in rec) return normalizeCountMode(rec.countMode)
    if (rec.requirePerCombination === true) return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
    return { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE }
  })()
  return {
    id: rawId,
    combination,
    requiredCount,
    enabled,
    countMode,
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
    value: Number((stat.totalValue + stat.glyphValue).toFixed(3)),
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
  const groupStats = new Map<string, { total: number; sold: number; matches: KeepUniqueCandidate[] }>()
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  const baseRuleCount = baseRuleList.length

  for (const row of rows) {
    const artifact = row.artifact
    const itemKey = getKeepUniqueItemKey(artifact)
    const groupKey = getKeepUniqueGroupKey(artifact)
    const sold = (() => {
      if (row.baseMatch !== undefined) {
        const baseMatch = row.baseMatch
        return !baseMatch || baseMatch.keep !== true
      }
      if (baseRuleCount === 0) return true
      const { firstMatch } = evaluateMatchesByConfig(baseRuleList, artifact.testerItem, { configModes })
      return !firstMatch || firstMatch.keep !== true
    })()
    const entry = groupStats.get(groupKey)
    if (entry) {
      entry.total += 1
      if (sold) {
        entry.sold += 1
        entry.matches.push({ row, artifact, itemKey, groupKey })
      }
    } else {
      groupStats.set(groupKey, {
        total: 1,
        sold: sold ? 1 : 0,
        matches: sold ? [{ row, artifact, itemKey, groupKey }] : [],
      })
    }
  }

  const candidates: KeepUniqueCandidate[] = []
  const uniqueItemKeys = new Set<number>()
  for (const entry of groupStats.values()) {
    if (entry.total > 0 && entry.sold === entry.total) {
      for (const candidate of entry.matches) {
        candidates.push(candidate)
        uniqueItemKeys.add(candidate.itemKey)
      }
    }
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
    // Current matches reflect the “at risk” combos and double as the data source for both scopes.
    const matching = candidates.filter((candidate) => artifactMatchesKeepUniqueRule(candidate.artifact, combination))
    const requiredPerGroup = Math.max(1, Math.floor(rule.requiredCount))
    const currentCount = matching.length
    const ruleActive = enabled && rule.enabled
    let groupsTracked = perRuleMode ? (currentCount > 0 ? 1 : 0) : 0
    let requiredTotal = requiredPerGroup
    let deficit = 0
    if (!perRuleMode) {
      const groupCounts = new Map<KeepUniqueCountKey, number>()
      for (const candidate of matching) {
        const key = getKeepUniqueCountKey(candidate.artifact, countMode)
        groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1)
      }
      groupsTracked = groupCounts.size
      requiredTotal = requiredPerGroup * (groupsTracked || 1)
      for (const groupCount of groupCounts.values()) {
        const projectedGroup = ruleActive ? groupCount : 0
        if (projectedGroup >= requiredPerGroup) continue
        deficit += requiredPerGroup - projectedGroup
      }
    } else {
      const projectedRule = ruleActive ? currentCount : 0
      deficit = Math.max(0, requiredPerGroup - projectedRule)
    }
    const projected = ruleActive ? currentCount : 0
    const itemKeys = matching.map((match) => match.itemKey)
    const artifacts = matching.map((match) => toDetectionArtifact(match))
    entries.push({
      hash: hashKeepUniqueCombination(combination),
      combination,
      ruleId: rule.id,
      ruleEnabled: rule.enabled,
      countMode,
      perGroupRequiredCount: requiredPerGroup,
      groupsTracked,
      requiredCount: requiredTotal,
      currentCount,
      projectedCount: projected,
      deficit,
      coveredByExisting: currentCount === 0,
      itemKeys,
      artifacts,
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
