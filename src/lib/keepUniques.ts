import { isAccessorySlot } from './testerDomain'
import type { TesterPreviewRow } from '../types/testerPreview'
import type { ArtifactSetId, ArtifactTypeId, FactionId, RankValue, StatVariant } from './types'
import { StatVariant as StatVariantEnum } from './types'
import type { NormalizedGearArtifact } from './importers/gearDbNormalizer'

const RANK_MIN = 1
const RANK_MAX = 6

/** Sentinel `__cfgIdx` value used to tag Keep Uniques derived rules. */
export const KEEP_UNIQUES_CFG_SENTINEL = -9000

export type KeepUniqueTuple = {
  slot: ArtifactTypeId
  set: ArtifactSetId
  rank: RankValue
  rarity: RankValue
  mainStat: StatVariant
  factionId: FactionId | null
}

export type KeepUniqueRule = {
  id: string
  tuple: KeepUniqueTuple
  requiredCount: number
  enabled: boolean
}

export type KeepUniqueDetectionEntry = {
  hash: string
  tuple: KeepUniqueTuple
  ruleId: string | null
  ruleEnabled: boolean
  requiredCount: number
  currentCount: number
  keptCount: number
  projectedCount: number
  deficit: number
  coveredByExisting: boolean
  rowKeys: number[]
}

export type KeepUniqueDetectionSnapshot = {
  scannedAt: number
  entries: KeepUniqueDetectionEntry[]
}

export type KeepUniquesMergeInput = {
  enabled: boolean
  rules: readonly KeepUniqueRule[]
  detection?: KeepUniqueDetectionSnapshot | null
}

export type KeepUniqueDetectionParams = {
  rows: readonly TesterPreviewRow[]
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
export function hashKeepUniqueTuple(tuple: KeepUniqueTuple): string {
  const factionPart = tuple.factionId == null ? '0' : String(tuple.factionId)
  return [
    Number(tuple.slot),
    Number(tuple.set),
    Number(tuple.rank),
    Number(tuple.rarity),
    Number(tuple.mainStat),
    factionPart,
  ].join(':')
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

/** Normalize tuple payloads loaded from HSFC/autosave. */
export function normalizeKeepUniqueTuple(value: unknown): KeepUniqueTuple | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const slot = Number(rec.slot)
  const set = Number(rec.set)
  if (!Number.isFinite(slot) || !Number.isFinite(set)) return null
  const rank = clampRankOrRarity(rec.rank)
  const rarity = clampRankOrRarity(rec.rarity)
  const mainStat = coerceStatVariant(rec.mainStat)
  const factionValue = Number(rec.factionId ?? 0)
  const factionId = Number.isFinite(factionValue) ? (factionValue as FactionId) : null
  return {
    slot: slot as ArtifactTypeId,
    set: set as ArtifactSetId,
    rank,
    rarity,
    mainStat,
    factionId: isAccessorySlot(slot) ? factionId : null,
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

type TupleStats = {
  tuple: KeepUniqueTuple
  currentCount: number
  keptCount: number
  rowKeys: number[]
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

const tupleFromArtifact = (artifact: NormalizedGearArtifact): KeepUniqueTuple => {
  const slot = Number(artifact.slot) as ArtifactTypeId
  const mainStatVariant = artifact.mainStat?.variant ?? StatVariantEnum.Any
  const tuple: KeepUniqueTuple = {
    slot,
    set: Number(artifact.set) as ArtifactSetId,
    rank: clampRankOrRarity(artifact.rank),
    rarity: clampRankOrRarity(artifact.rarity),
    mainStat: mainStatVariant,
    factionId: isAccessorySlot(slot) ? (artifact.faction as FactionId ?? 0) : null,
  }
  return tuple
}

const buildTupleStats = (rows: readonly TesterPreviewRow[]): Map<string, TupleStats> => {
  const stats = new Map<string, TupleStats>()
  for (const row of rows) {
    const tuple = tupleFromArtifact(row.artifact)
    const hash = hashKeepUniqueTuple(tuple)
    const entry = stats.get(hash)
    if (entry) {
      entry.currentCount += 1
      if (row.match?.keep === true) entry.keptCount += 1
      entry.rowKeys.push(getKeepUniqueRowKey(row.artifact))
      continue
    }
    stats.set(hash, {
      tuple,
      currentCount: 1,
      keptCount: row.match?.keep === true ? 1 : 0,
      rowKeys: [getKeepUniqueRowKey(row.artifact)],
    })
  }
  return stats
}

/** Compute Keep Unique tuple coverage against the current tester rows. */
export function computeKeepUniqueProtection(params: KeepUniqueDetectionParams): KeepUniqueDetectionSnapshot {
  const { rows, rules, enabled, now } = params
  const statsByHash = buildTupleStats(rows)
  const entries: KeepUniqueDetectionEntry[] = []
  const timestamp = Number.isFinite(now) ? Number(now) : Date.now()

  for (const rule of rules) {
    const tuple = rule.tuple
    const hash = hashKeepUniqueTuple(tuple)
    const stats = statsByHash.get(hash)
    const currentCount = stats?.currentCount ?? 0
    const keptCount = stats?.keptCount ?? 0
    const rowKeys = stats?.rowKeys ?? []
    const required = Math.max(1, Math.floor(rule.requiredCount))
    const projected = (() => {
      if (enabled && rule.enabled) {
        const target = Math.max(keptCount, required)
        return Math.min(currentCount, target)
      }
      return Math.min(currentCount, keptCount)
    })()
    const deficit = Math.max(0, required - projected)
    const coveredByExisting = keptCount >= Math.min(required, currentCount)
    entries.push({
      hash,
      tuple,
      ruleId: rule.id,
      ruleEnabled: rule.enabled,
      requiredCount: required,
      currentCount,
      keptCount,
      projectedCount: projected,
      deficit,
      coveredByExisting,
      rowKeys,
    })
  }

  return { scannedAt: timestamp, entries }
}
