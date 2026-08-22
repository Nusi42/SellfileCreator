import { resolveAutoRarityCode, type BuilderRecipe } from './hsfBuilder'
import {
  LEVEL_MILESTONES,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
} from './types'
import { normalizeArtifactSetSelections } from './gearSets/selection'

const IGNORED_KEYS = new Set([
  // Cosmetic metadata never alters the generated rules, so we exclude it from fingerprints.
  'artifactTypeNames',
  'artifactSetNames',
  'artifactMetaSetNames',
  'appearance',
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
  source?: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>,
): Record<string, { min?: number; max?: number; any?: boolean; not?: boolean }> => {
  if (!source) return {}
  const entries = Object.entries(source)
    .map(([variant, payload]) => {
      const normalized: { min?: number; max?: number; any?: boolean; not?: boolean } = {}
      // `not` is mutually exclusive; when set, record only it for the fingerprint.
      if ((payload as { not?: boolean })?.not === true) {
        normalized.not = true
        return [Number(variant), normalized] as [number, typeof normalized]
      }
      if (typeof payload?.min === 'number') normalized.min = Math.max(0, Math.floor(payload.min))
      if (typeof payload?.max === 'number') normalized.max = Math.max(0, Math.floor(payload.max))
      if (payload?.any === true) normalized.any = true
      return [Number(variant), normalized] as [number, typeof normalized]
    })
    .filter(([, normalized]) => (
      normalized.min !== undefined
      || normalized.max !== undefined
      || normalized.any !== undefined
      || normalized.not !== undefined
    ))
  entries.sort((a, b) => a[0] - b[0])
  const result: Record<string, { min?: number; max?: number; any?: boolean; not?: boolean }> = {}
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

export type BuilderRecipeSnapshot = Record<string, unknown>

export function buildCanonicalRecipeSnapshot(recipe: BuilderRecipe): BuilderRecipeSnapshot {
  const entries: SnapshotEntry[] = []
  const push = (key: string, value: unknown): void => {
    if (value === undefined) return
    entries.push([key, value])
  }

  const rarityMode: 'auto' | 'code' = recipe.rarityMode === 'auto' ? 'auto' : 'code'
  const effectiveRarity = rarityMode === 'auto'
    ? resolveAutoRarityCode(recipe)
    : Number(recipe.rarityCode ?? 0)

  push('keep', Boolean(recipe.keep))
  push('exportMode', recipe.exportMode ?? 'active')
  push('minLevel', recipe.minLevel ?? DEFAULT_MIN_LEVEL)
  push('maxLevel', recipe.maxLevel ?? DEFAULT_MAX_LEVEL)
  push('rankCode', Number(recipe.rankCode ?? 0))
  push('rarityMode', rarityMode)
  push('rarityCode', Number(effectiveRarity ?? 0))
  push('autoRaritySupplementsThreshold', recipe.autoRaritySupplementsThreshold ?? 'rare')
  push('factionCode', Number(recipe.factionCode ?? 0))
  push('mainStatsV', sortNumbers(recipe.mainStatsV, compareVariants))
  push('substatsV', sortNumbers(recipe.substatsV, compareVariants))
  push('fixedSubstatsV', sortNumbers(recipe.fixedSubstatsV, compareVariants))
  push('minCount', Number(recipe.minCount ?? 0))
  push('autoMinCount', Boolean(recipe.autoMinCount ?? false))
  push('autoSubstatFlex', Boolean(recipe.autoSubstatFlex ?? false))
  push('minRequiredRolls', Number(recipe.minRequiredRolls ?? 0))
  push('autoMinRequiredRolls', recipe.autoMinRequiredRolls !== false)
  push('lockedMinRequiredRolls', Number((recipe as { lockedMinRequiredRolls?: number }).lockedMinRequiredRolls ?? 0))
  const normalizedBounds = normalizeBounds(recipe.substatRollBoundsV)
  if (Object.keys(normalizedBounds).length > 0) {
    push('substatRollBoundsV', normalizedBounds)
  }
  const normalizedTargets = canonicalizeRollTargets(recipe.substatRollTargetsV)
  if (normalizedTargets) {
    push('substatRollTargetsV', normalizedTargets)
  }
  push('artifactTypes', sortNumbers(recipe.artifactTypes, compareArtifactTypes))
  // Normalize set selections so include/exclude entries serialize consistently.
  const normalizedSets = normalizeArtifactSetSelections(recipe.artifactSets ?? [])
  // Sort by set id for stable fingerprints across reorders.
  const sortedSetEntries = normalizedSets
    .slice()
    .sort((a, b) => compareArtifactSets(Number(a.id), Number(b.id)))
    .map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id }))
  // Keep excluded flags in the snapshot so they affect the cache key.
  push('artifactSets', sortedSetEntries)
  push('artifactMetaSets', sortStrings(recipe.artifactMetaSets))
  push('earlyKeepMode', recipe.earlyKeepMode === 'late' ? 'late' : 'early')
  // Tags are excluded wholesale via IGNORED_KEYS: they are free-form user labels that
  // never change the generated rules, so renaming one must not rebuild every rule.
  // The two behaviours that DO change rules are explicit recipe fields now, and the
  // generic key sweep below picks them up automatically — no tag-derived contribution.

  const knownKeys = new Set(entries.map(([key]) => key))

  for (const [rawKey, rawValue] of Object.entries(recipe as unknown as Record<string, unknown>)) {
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
