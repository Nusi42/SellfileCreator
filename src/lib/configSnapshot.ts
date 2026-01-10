import { resolveAutoRarityCode, type BuilderConfig } from './hsfBuilder'
import {
  LEVEL_MILESTONES,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
} from './types'
import { normalizeArtifactSetSelections } from './gearSets/selection'
import { hasIgnoreKeepUniqueTag } from './tagHelpers'

const IGNORED_KEYS = new Set([
  // Cosmetic metadata never alters the generated rules, so we exclude it from fingerprints.
  'artifactTypeNames',
  'artifactSetNames',
  'artifactMetaSetIds',
  'name',
  'tags',
])

const DEFAULT_MIN_LEVEL = LEVEL_MILESTONES[0]!
const DEFAULT_MAX_LEVEL = LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!

type SnapshotEntry = [string, unknown]

const sortPairsByKey = (entries: SnapshotEntry[]): SnapshotEntry[] => (
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
)

const sortNumbers = (values?: readonly number[], comparator?: (a: number, b: number) => number): number[] => {
  if (!Array.isArray(values) || values.length === 0) return []
  const next = values.map(Number)
  next.sort(comparator ?? ((a, b) => a - b))
  return next
}

const sortStrings = (values?: readonly string[]): string[] => {
  if (!Array.isArray(values) || values.length === 0) return []
  const next = values.map(String)
  next.sort()
  return next
}

const normalizeBounds = (
  source?: Record<number, { min?: number; max?: number; any?: boolean }>,
): Record<string, { min?: number; max?: number; any?: boolean }> => {
  if (!source) return {}
  const entries = Object.entries(source)
    .map(([variant, payload]) => {
      const normalized: { min?: number; max?: number; any?: boolean } = {}
      if (typeof payload?.min === 'number') normalized.min = Math.max(0, Math.floor(payload.min))
      if (typeof payload?.max === 'number') normalized.max = Math.max(0, Math.floor(payload.max))
      if (payload?.any === true) normalized.any = true
      return [Number(variant), normalized] as [number, { min?: number; max?: number; any?: boolean }]
    })
    .filter(([, normalized]) => (
      normalized.min !== undefined
      || normalized.max !== undefined
      || normalized.any !== undefined
    ))
  entries.sort((a, b) => a[0] - b[0])
  const result: Record<string, { min?: number; max?: number; any?: boolean }> = {}
  for (const [variant, payload] of entries) {
    result[String(variant)] = payload
  }
  return result
}

const canonicalizeRollTargets = (
  targets?: Record<number, { base?: number; increments?: Array<number | null> }>,
): Array<[number, { base?: number; increments?: number[] }]> | null => {
  if (!targets) return null
  const entries: Array<[number, { base?: number; increments?: number[] }]> = []
  for (const [variantKey, rawEntry] of Object.entries(targets)) {
    if (!rawEntry) continue
    const variant = Number(variantKey)
    const normalized: { base?: number; increments?: number[] } = {}
    if (typeof rawEntry.base === 'number' && Number.isFinite(rawEntry.base)) {
      normalized.base = Math.round(rawEntry.base)
    }
    if (Array.isArray(rawEntry.increments)) {
      const increments = rawEntry.increments.map((value) => (
        typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
      ))
      while (increments.length > 0 && increments[increments.length - 1] == null) {
        increments.pop()
      }
      if (increments.length > 0) {
        normalized.increments = increments as number[]
      }
    }
    if (normalized.base == null && !normalized.increments) continue
    entries.push([variant, normalized])
  }
  if (entries.length === 0) return null
  entries.sort((a, b) => compareVariants(a[0], b[0]))
  return entries
}

const canonicalizeUnknown = (value: unknown): unknown => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeUnknown)
  }
  if (typeof value === 'object') {
    const entries = sortPairsByKey(Object.entries(value as Record<string, unknown>))
    const normalized: Record<string, unknown> = {}
    for (const [key, entryValue] of entries) {
      normalized[key] = canonicalizeUnknown(entryValue)
    }
    return normalized
  }
  return undefined
}

export type BuilderConfigSnapshot = Record<string, unknown>

export function buildCanonicalConfigSnapshot(cfg: BuilderConfig): BuilderConfigSnapshot {
  const entries: SnapshotEntry[] = []
  const push = (key: string, value: unknown): void => {
    if (value === undefined) return
    entries.push([key, value])
  }

  const rarityMode: 'auto' | 'code' = cfg.rarityMode === 'auto' ? 'auto' : 'code'
  const effectiveRarity = rarityMode === 'auto'
    ? resolveAutoRarityCode(cfg)
    : Number(cfg.rarityCode ?? 0)

  push('keep', Boolean(cfg.keep))
  push('exportMode', cfg.exportMode ?? 'active')
  push('minLevel', cfg.minLevel ?? DEFAULT_MIN_LEVEL)
  push('maxLevel', cfg.maxLevel ?? DEFAULT_MAX_LEVEL)
  push('rankCode', Number(cfg.rankCode ?? 0))
  push('rarityMode', rarityMode)
  push('rarityCode', Number(effectiveRarity ?? 0))
  push('autoRaritySupplementsThreshold', cfg.autoRaritySupplementsThreshold ?? 'rare')
  push('factionCode', Number(cfg.factionCode ?? 0))
  push('mainStatsV', sortNumbers(cfg.mainStatsV, compareVariants))
  push('substatsV', sortNumbers(cfg.substatsV, compareVariants))
  push('fixedSubstatsV', sortNumbers(cfg.fixedSubstatsV, compareVariants))
  push('minCount', Number(cfg.minCount ?? 0))
  push('autoMinCount', Boolean(cfg.autoMinCount ?? false))
  push('autoSubstatFlex', Boolean(cfg.autoSubstatFlex ?? false))
  push('minRequiredRolls', Number(cfg.minRequiredRolls ?? 0))
  push('autoMinRequiredRolls', cfg.autoMinRequiredRolls !== false)
  push('lockedMinRequiredRolls', Number((cfg as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls ?? 0))
  const normalizedBounds = normalizeBounds(cfg.substatRollBoundsV)
  if (Object.keys(normalizedBounds).length > 0) {
    push('substatRollBoundsV', normalizedBounds)
  }
  const normalizedTargets = canonicalizeRollTargets(cfg.substatRollTargetsV)
  if (normalizedTargets) {
    push('substatRollTargetsV', normalizedTargets)
  }
  push('artifactTypes', sortNumbers(cfg.artifactTypes, compareArtifactTypes))
  // Normalize set selections so include/exclude entries serialize consistently.
  const normalizedSets = normalizeArtifactSetSelections(cfg.artifactSets ?? [])
  // Sort by set id for stable fingerprints across reorders.
  const sortedSetEntries = normalizedSets
    .slice()
    .sort((a, b) => compareArtifactSets(Number(a.id), Number(b.id)))
    .map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id }))
  // Keep excluded flags in the snapshot so they affect the cache key.
  push('artifactSets', sortedSetEntries)
  push('artifactMetaSets', sortStrings(cfg.artifactMetaSets))
  push('earlyKeepMode', cfg.earlyKeepMode === 'late' ? 'late' : 'early')
  // Keep-unique ignore tags affect match ordering, so include them in fingerprints.
  push('ignoreKeepUniqueTag', hasIgnoreKeepUniqueTag(cfg.tags))

  const knownKeys = new Set(entries.map(([key]) => key))

  for (const [rawKey, rawValue] of Object.entries(cfg as unknown as Record<string, unknown>)) {
    if (IGNORED_KEYS.has(rawKey)) continue
    if (knownKeys.has(rawKey)) continue
    if (rawKey.startsWith('__')) continue
    push(rawKey, canonicalizeUnknown(rawValue))
  }

  const snapshot: Record<string, unknown> = {}
  for (const [key, value] of sortPairsByKey(entries)) {
    snapshot[key] = value
  }

  return snapshot
}
