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

/** Sentinel `__cfgIdx` value used to tag Keep Uniques derived rules. */
export const KEEP_UNIQUES_CFG_SENTINEL = -9000

export type KeepUniqueTuple = {
  slots: ArtifactTypeId[]
  sets: ArtifactSetId[]
  metaSetIds: string[]
  ranks: RankValue[]
  rarities: RankValue[]
  mainStats: StatVariant[]
  factions: FactionId[]
}

export type KeepUniqueRule = {
  id: string
  tuple: KeepUniqueTuple
  requiredCount: number
  enabled: boolean
}

export type KeepUniqueDetectionArtifact = {
  rowKey: number
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
  tuple: KeepUniqueTuple
  ruleId: string | null
  ruleEnabled: boolean
  requiredCount: number
  currentCount: number
  projectedCount: number
  deficit: number
  coveredByExisting: boolean
  rowKeys: number[]
  artifacts: KeepUniqueDetectionArtifact[]
}

export type KeepUniqueDetectionSnapshot = {
  scannedAt: number
  entries: KeepUniqueDetectionEntry[]
}

export type KeepUniqueCandidate = {
  row: TesterPreviewRow
  artifact: NormalizedGearArtifact
  rowKey: number
  groupKey: KeepUniqueGroupKey
}

export type KeepUniqueCandidateSnapshot = {
  candidates: KeepUniqueCandidate[]
  uniqueRowKeys: ReadonlySet<number>
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

/** Generate a short, unique id for tuple rules. */
export function createKeepUniqueRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `ku_${Date.now().toString(36)}_${rand}`
}

/** Canonical hash for tuple comparisons and metadata lookups. */
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

export function hashKeepUniqueTuple(tuple: KeepUniqueTuple): string {
  return [
    canonicalizeList(tuple.slots),
    canonicalizeList(tuple.sets),
    canonicalizeStringList(tuple.metaSetIds),
    canonicalizeList(tuple.ranks),
    canonicalizeList(tuple.rarities),
    canonicalizeList(tuple.mainStats),
    canonicalizeList(tuple.factions),
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

/** Normalize tuple payloads loaded from HSFC/autosave. */
export function normalizeKeepUniqueTuple(value: unknown): KeepUniqueTuple | null {
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

/** Normalize rule payloads; returns null when tuple data is invalid. */
export function normalizeKeepUniqueRule(value: unknown): KeepUniqueRule | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const tuple = normalizeKeepUniqueTuple(rec.tuple ?? rec)
  if (!tuple) return null
  const rawId = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id.trim() : createKeepUniqueRuleId()
  const rawRequired = Number(rec.requiredCount)
  const requiredCount = Number.isFinite(rawRequired) && rawRequired >= 1 ? Math.floor(rawRequired) : 1
  const enabled = rec.enabled !== false
  return {
    id: rawId,
    tuple,
    requiredCount,
    enabled,
  }
}

/** Shared helper for mapping tester artifacts to the detection row-key. */
export function getKeepUniqueRowKey(artifact: NormalizedGearArtifact): number {
  const testerRowId = Number((artifact.testerItem as { rowId?: number } | undefined)?.rowId ?? NaN)
  if (Number.isFinite(testerRowId)) return testerRowId
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

const matchesSelection = (selection: readonly number[], candidate: number): boolean => {
  if (!selection.length) return true
  return selection.some((value) => Number(value) === Number(candidate))
}

/** Determine whether an artifact satisfies a Keep Unique tuple filter. */
export function artifactMatchesKeepUniqueRule(artifact: NormalizedGearArtifact, tuple: KeepUniqueTuple): boolean {
  const slot = Number(artifact.slot)
  if (!matchesSelection(tuple.slots, slot)) return false

  const setId = Number(artifact.set)
  if (!matchesSelection(tuple.sets, setId)) return false

  const rankValue = Number(artifact.rank)
  if (!matchesSelection(tuple.ranks, rankValue)) return false

  const rarityValue = Number(artifact.rarity)
  if (!matchesSelection(tuple.rarities, rarityValue)) return false

  if (tuple.mainStats.length > 0) {
    const artifactMain = artifact.mainStat?.variant
    if (artifactMain == null) return false
    if (!tuple.mainStats.some((variant) => variant === artifactMain)) return false
  }

  const faction = isAccessorySlot(slot) ? Number(artifact.faction ?? 0) : 0
  if (!matchesSelection(tuple.factions, faction)) return false

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
  const { artifact, rowKey } = candidate
  return {
    rowKey,
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
  if (!rows.length) return { candidates: [], uniqueRowKeys: new Set() }
  const groupStats = new Map<string, { total: number; sold: number; matches: KeepUniqueCandidate[] }>()
  const baseRuleList: HsfRuleWithCfg[] = Array.isArray(baseRules) ? [...baseRules] : []
  const baseRuleCount = baseRuleList.length

  for (const row of rows) {
    const artifact = row.artifact
    const rowKey = getKeepUniqueRowKey(artifact)
    const groupKey = getKeepUniqueGroupKey(artifact)
    const sold = (() => {
      if (baseRuleCount === 0) return true
      const { firstMatch } = evaluateMatchesByConfig(baseRuleList, artifact.testerItem, { configModes })
      return !firstMatch || firstMatch.keep !== true
    })()
    const entry = groupStats.get(groupKey)
    if (entry) {
      entry.total += 1
      if (sold) {
        entry.sold += 1
        entry.matches.push({ row, artifact, rowKey, groupKey })
      }
    } else {
      groupStats.set(groupKey, {
        total: 1,
        sold: sold ? 1 : 0,
        matches: sold ? [{ row, artifact, rowKey, groupKey }] : [],
      })
    }
  }

  const candidates: KeepUniqueCandidate[] = []
  const uniqueRowKeys = new Set<number>()
  for (const entry of groupStats.values()) {
    if (entry.total > 0 && entry.sold === entry.total) {
      for (const candidate of entry.matches) {
        candidates.push(candidate)
        uniqueRowKeys.add(candidate.rowKey)
      }
    }
  }

  return { candidates, uniqueRowKeys }
}

/** Compute Keep Unique tuple coverage against the candidate sold rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { candidates, rules, enabled, now } = params
  const entries: KeepUniqueDetectionEntry[] = []
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()

  for (const rule of rules) {
    const tuple = rule.tuple
    const matching = candidates.filter((candidate) => artifactMatchesKeepUniqueRule(candidate.artifact, tuple))
    const required = Math.max(1, Math.floor(rule.requiredCount))
    const currentCount = matching.length
    const projected = enabled && rule.enabled ? currentCount : 0
    const deficit = Math.max(0, required - projected)
    const rowKeys = matching.map((match) => match.rowKey)
    const artifacts = matching.map((match) => toDetectionArtifact(match))
    entries.push({
      hash: hashKeepUniqueTuple(tuple),
      tuple,
      ruleId: rule.id,
      ruleEnabled: rule.enabled,
      requiredCount: required,
      currentCount,
      projectedCount: projected,
      deficit,
      coveredByExisting: currentCount === 0,
      rowKeys,
      artifacts,
    })
  }

  return { scannedAt: timestamp, entries }
}

/** Expand metaset references to explicit set IDs for tuple evaluation. */
export function resolveKeepUniqueRulesWithMetasets(
  rules: readonly KeepUniqueRule[],
  metasets: readonly Metaset[],
): KeepUniqueRule[] {
  if (!rules.length) return rules as KeepUniqueRule[]
  if (!metasets.length) return rules as KeepUniqueRule[]
  const metaMap = new Map(metasets.map((meta) => [meta.id, meta]))
  let mutated = false
  const resolved = rules.map((rule) => {
    const metaIds = rule.tuple.metaSetIds ?? []
    if (!metaIds.length) return rule
    const expanded = new Set<number>(rule.tuple.sets.map((setId) => Number(setId)))
    let tupleChanged = false
    for (const metaId of metaIds) {
      const meta = metaMap.get(metaId)
      if (!meta || !Array.isArray(meta.sets)) continue
      for (const setId of meta.sets) {
        const numeric = Number(setId)
        if (expanded.has(numeric)) continue
        expanded.add(numeric)
        tupleChanged = true
      }
    }
    if (!tupleChanged) return rule
    mutated = true
    const sortedSets = Array.from(expanded).sort((a, b) => a - b) as ArtifactSetId[]
    return {
      ...rule,
      tuple: {
        ...rule.tuple,
        sets: sortedSets,
      },
    }
  })
  return mutated ? resolved : rules as KeepUniqueRule[]
}
