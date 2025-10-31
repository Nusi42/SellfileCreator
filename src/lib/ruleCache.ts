/**
 * ruleCache.ts
 *
 * Maintains a per-config cache of generated HSF rules so the builder,
 * preview, and filters reuse the same computation. The cache is keyed by a
 * fingerprint derived from the rule-affecting fields plus substatTargets so changes
 * invalidate only the affected entries.
 */
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT } from './constants'
import { buildRulesForConfig, type HsfRuleWithCfg } from './merge'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import {
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
} from './types'
import { nowMs } from './perf'

/** Cache entry keyed by a stable fingerprint for a single config. */
export type ConfigRuleCacheEntry = {
  key: string
  rules: HsfRuleWithCfg[]
  count: number
  truncated: boolean
  excludedByTotalLimit?: boolean
}

export type ConfigRulesCache = Map<number, ConfigRuleCacheEntry>

export type RuleCachePerfSample = {
  totalMs: number
  rebuildMs: number
  cfgCount: number
  rebuilt: number
  reused: number
  totalRules: number
  topRebuilds: Array<{ idx: number; name: string; count: number; durationMs: number }>
}

/** Create an empty cache that callers can persist across renders. */
export function createConfigRulesCache(): ConfigRulesCache {
  return new Map()
}

type UpdateArgs = {
  configs: readonly BuilderConfig[]
  metasets: readonly Metaset[]
  substatTargets: SubstatTargetTable
  previousCache?: ConfigRulesCache
  baseRuleCount?: number
  totalLimit?: number
}

type UpdateResult = {
  cache: ConfigRulesCache
  rulesByConfig: Map<number, HsfRuleWithCfg[]>
  countsByConfig: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  perf: RuleCachePerfSample
  truncatedConfigIndices: number[]
  totalLimitHit: boolean
}

/**
 * Update (or warm) the cache and return the flattened rules plus lookups that
 * stay consistent with the provided config order. When a fingerprint matches
 * the previous entry we reuse the prior rules to avoid rebuilding.
 */
export function updateConfigRulesCache(args: UpdateArgs): UpdateResult {
  const {
    configs,
    metasets,
    substatTargets,
    previousCache,
    baseRuleCount = 0,
    totalLimit = TOTAL_RULE_COUNT_LIMIT,
  } = args
  const startTotal = nowMs()
  const substatTargetsKey = substatTargetsFingerprint(substatTargets)
  const nextCache: ConfigRulesCache = new Map()
  const rulesByConfig = new Map<number, HsfRuleWithCfg[]>()
  const countsByConfig = new Map<number, number>()
  const keys: string[] = []
  const truncatedConfigIndices: number[] = []
  let rebuildCount = 0
  let reuseCount = 0
  let rebuildDuration = 0
  let reportedTotalCount = 0
  const rebuildDetails: Array<{ idx: number; name: string; count: number; duration: number }> = []
  const normalizedTotalLimit = Number.isFinite(totalLimit) && totalLimit > 0
    ? Math.max(1, Math.floor(totalLimit))
    : null
  const baseCount = Math.max(0, Math.floor(baseRuleCount))
  let runningTotal = baseCount
  let totalLimitHit = normalizedTotalLimit !== null && runningTotal > normalizedTotalLimit

  for (let cfgIdx = 0; cfgIdx < configs.length; cfgIdx += 1) {
    const source = configs[cfgIdx]!
    const resolvedConfig = mergeArtifactSets(source, metasets)
    const configKey = configFingerprint(resolvedConfig, substatTargetsKey)
    keys.push(configKey)

    const prevEntry = previousCache?.get(cfgIdx)
    const matched = prevEntry && prevEntry.key === configKey
    const limitAlreadyReached = normalizedTotalLimit !== null && runningTotal >= normalizedTotalLimit
    if (limitAlreadyReached) {
      totalLimitHit = true
      if (matched) {
        reuseCount += 1
      } else {
        rebuildCount += 1
      }
      const truncatedEntry: ConfigRuleCacheEntry = matched && prevEntry
        ? { ...prevEntry, truncated: true, count: Number.POSITIVE_INFINITY, excludedByTotalLimit: true }
        : {
            key: configKey,
            rules: matched && prevEntry ? prevEntry.rules : [],
            count: Number.POSITIVE_INFINITY,
            truncated: true,
            excludedByTotalLimit: true,
          }
      nextCache.set(cfgIdx, truncatedEntry)
      rulesByConfig.set(cfgIdx, [])
      countsByConfig.set(cfgIdx, Number.POSITIVE_INFINITY)
      truncatedConfigIndices.push(cfgIdx)
      reportedTotalCount = Number.POSITIVE_INFINITY
      continue
    }
    let entry: ConfigRuleCacheEntry
    if (matched && prevEntry) {
      reuseCount += 1
      entry = prevEntry
    } else {
      rebuildCount += 1
      const buildStart = nowMs()
      entry = buildEntry(resolvedConfig, metasets, substatTargets, cfgIdx, configKey)
      const span = nowMs() - buildStart
      rebuildDuration += span
      rebuildDetails.push({
        idx: cfgIdx,
        name: String(source.name ?? ''),
        count: entry.count,
        duration: span,
      })
    }

    let excludeForTotalLimit = false
    if (!entry.truncated && normalizedTotalLimit !== null) {
      const remaining = normalizedTotalLimit - runningTotal
      if (remaining <= 0) {
        excludeForTotalLimit = true
      } else {
        const ruleCount = entry.rules.length
        if (ruleCount > remaining) {
          excludeForTotalLimit = true
        } else {
          runningTotal += ruleCount
        }
      }
    } else if (!entry.truncated && normalizedTotalLimit === null) {
      runningTotal += entry.rules.length
    }

    if (excludeForTotalLimit) {
      totalLimitHit = true
      if (normalizedTotalLimit !== null) {
        runningTotal = normalizedTotalLimit
      }
    }

    const truncated = entry.truncated || excludeForTotalLimit
    const outputRules = truncated ? [] : entry.rules
    const outputCount = truncated ? Number.POSITIVE_INFINITY : entry.rules.length

    const cacheEntry: ConfigRuleCacheEntry = matched && prevEntry
      ? { ...prevEntry, excludedByTotalLimit: excludeForTotalLimit }
      : { ...entry, excludedByTotalLimit: excludeForTotalLimit }

    nextCache.set(cfgIdx, cacheEntry)
    rulesByConfig.set(cfgIdx, outputRules)
    countsByConfig.set(cfgIdx, outputCount)
    if (truncated) truncatedConfigIndices.push(cfgIdx)
    if (Number.isFinite(reportedTotalCount) && Number.isFinite(outputCount)) {
      reportedTotalCount += outputCount
    } else {
      reportedTotalCount = Number.POSITIVE_INFINITY
    }
  }

  const totalDuration = nowMs() - startTotal
  const topRebuilds = rebuildDetails
    .slice()
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((d) => ({
      idx: d.idx,
      name: d.name,
      count: d.count,
      durationMs: Number(d.duration.toFixed(2)),
    }))

  return {
    cache: nextCache,
    rulesByConfig,
    countsByConfig,
    keys,
    substatTargetsKey,
    perf: {
      totalMs: Number(totalDuration.toFixed(2)),
      rebuildMs: Number(rebuildDuration.toFixed(2)),
      cfgCount: configs.length,
      rebuilt: rebuildCount,
      reused: reuseCount,
      totalRules: Number.isFinite(reportedTotalCount)
        ? reportedTotalCount
        : Number.POSITIVE_INFINITY,
      topRebuilds,
    },
    truncatedConfigIndices,
    totalLimitHit,
  }
}

function buildEntry(
  config: BuilderConfig,
  metasets: readonly Metaset[],
  substatTargets: SubstatTargetTable,
  cfgIdx: number,
  key: string,
): ConfigRuleCacheEntry {
  // Delegate to the shared builder so pruning and annotations stay unified.
  let truncated = false
  const rules = buildRulesForConfig(
    { config, metasets: metasets as Metaset[], substatTargets, cfgIdx },
    {
      limit: RULE_COUNT_LIMIT + 1,
      onLimit: () => { truncated = true },
    },
  )
  return {
    key,
    rules,
    count: truncated ? Number.POSITIVE_INFINITY : rules.length,
    truncated,
    excludedByTotalLimit: false,
  }
}

/**
 * Merge explicit artifact sets with metaset-derived sets so fingerprints and
 * rule generation see a single resolved list.
 */
function mergeArtifactSets(config: BuilderConfig, metasets: readonly Metaset[]): BuilderConfig {
  const explicit = (config.artifactSets ?? []).map(Number)
  const fromMetas = resolveMetasetIds(config.artifactMetaSets, metasets as Metaset[])
  const seen = new Set<number>()
  const union: number[] = []
  for (const id of explicit) {
    if (!Number.isFinite(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    union.push(id)
  }
  for (const id of fromMetas) {
    if (!Number.isFinite(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    union.push(id)
  }
  if (union.length === explicit.length && union.every((id, idx) => id === explicit[idx])) {
    return config
  }
  return { ...config, artifactSets: union }
}

/**
 * Build a stable fingerprint for rule-affecting config fields. Arrays are
 * sorted and roll bound objects are normalized so cosmetic edits (like
 * selection order) do not invalidate the cache unnecessarily.
 */
function configFingerprint(config: BuilderConfig, substatTargetsKey: string): string {
  const canonical = canonicalizeConfig(config)
  return JSON.stringify({ cfg: canonical, substatTargets: substatTargetsKey })
}

function canonicalizeConfig(config: BuilderConfig): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    keep: Boolean(config.keep),
    exportMode: config.exportMode ?? 'active',
    minLevel: config.minLevel ?? null,
    maxLevel: config.maxLevel ?? null,
    rankCode: Number(config.rankCode ?? 0),
    rarityCode: Number(config.rarityCode ?? 0),
    rarityMode: config.rarityMode ?? 'auto',
    autoRaritySupplementsThreshold: (config as { autoRaritySupplementsThreshold?: 'uncommon' | 'rare' | 'epic' }).autoRaritySupplementsThreshold ?? 'rare',
    factionCode: Number(config.factionCode ?? 0),
    rollBaseline: config.rollBaseline ?? 'afterStart',
    minCount: Number(config.minCount ?? 0),
    autoMinCount: Boolean(config.autoMinCount ?? false),
    autoSubstatFlex: Boolean(config.autoSubstatFlex ?? false),
    minRequiredRolls: Number(config.minRequiredRolls ?? 0),
    autoMinRequiredRolls: config.autoMinRequiredRolls !== false,
    substatMinTarget: (config as { substatMinTarget?: 'locked' | 'selected' }).substatMinTarget ?? 'selected',
    artifactTypes: sortedNumbers(config.artifactTypes ?? [], compareArtifactTypes),
    artifactSets: sortedNumbers(config.artifactSets ?? [], compareArtifactSets),
    artifactMetaSets: sortedStrings(config.artifactMetaSets ?? []),
    earlyKeepMode: config.earlyKeepMode ?? 'early',
    mainStatsV: sortedNumbers(config.mainStatsV ?? [], compareVariants),
    substatsV: sortedNumbers(config.substatsV ?? [], compareVariants),
    fixedSubstatsV: sortedNumbers(config.fixedSubstatsV ?? [], compareVariants),
  }
  if (config.substatRollBoundsV && typeof config.substatRollBoundsV === 'object') {
    snapshot.substatRollBoundsV = canonicalizeRollBounds(config.substatRollBoundsV)
  }
  if (config.substatRollTargetsV && typeof config.substatRollTargetsV === 'object') {
    const normalizedTargets = canonicalizeRollTargets(config.substatRollTargetsV)
    if (normalizedTargets.length > 0) {
      snapshot.substatRollTargetsV = normalizedTargets
    }
  }
  return snapshot
}

function sortedNumbers<T extends number>(
  values: readonly T[],
  comparator: (a: number, b: number) => number,
): number[] {
  const list = values.map(Number)
  list.sort(comparator)
  return list
}

function sortedStrings(values: readonly string[]): string[] {
  const list = values.map(String)
  list.sort()
  return list
}

function canonicalizeRollBounds(bounds: Record<number, { min?: number; max?: number; any?: boolean }>): Array<[number, { min?: number; max?: number; any?: boolean }]> {
  const entries = Object.entries(bounds)
    .map(([raw, value]) => {
      const variant = Number(raw)
      const normalized: { min?: number; max?: number; any?: boolean } = {}
      if (typeof value?.min === 'number') normalized.min = Math.max(0, Math.floor(value.min))
      if (typeof value?.max === 'number') normalized.max = Math.max(0, Math.floor(value.max))
      if (value?.any) normalized.any = true
      return [variant, normalized] as [number, { min?: number; max?: number; any?: boolean }]
    })
  entries.sort((a, b) => compareVariants(Number(a[0]), Number(b[0])))
  return entries
}

function canonicalizeRollTargets(
  targets: Record<number, { base?: number; increments?: Array<number | null> }>,
): Array<[number, { base?: number; increments?: number[] }]> {
  const entries: Array<[number, { base?: number; increments?: number[] }]> = []
  for (const [raw, entry] of Object.entries(targets)) {
    if (!entry) continue
    const variant = Number(raw)
    const normalized: { base?: number; increments?: number[] } = {}
    if (typeof entry.base === 'number' && Number.isFinite(entry.base)) {
      normalized.base = Math.round(entry.base)
    }
    if (Array.isArray(entry.increments)) {
      const increments = entry.increments.map((value) => (
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
  entries.sort((a, b) => compareVariants(a[0], b[0]))
  return entries
}

/**
 * Canonicalize substatTargets to ensure the fingerprint changes only when thresholds
 * that affect rule generation change.
 */
function substatTargetsFingerprint(substatTargets: SubstatTargetTable): string {
  const stars: Array<{ star: string; values: Array<[number, number]> }> = []
  const order: Array<'one' | 'two' | 'three' | 'four' | 'five' | 'six'> = ['one', 'two', 'three', 'four', 'five', 'six']
  for (const star of order) {
    const table = substatTargets[star] ?? {}
    const pairs = Object.entries(table)
      .map(([variant, value]) => [Number(variant), Number(value ?? 0)] as [number, number])
    pairs.sort((a, b) => compareVariants(a[0], b[0]))
    stars.push({ star, values: pairs })
  }
  return JSON.stringify({
    anyRankDefaultsTo: substatTargets.anyRankDefaultsTo ?? 6,
    stars,
  })
}

/**
 * Expose the shared fingerprint helpers so UI layers can reuse cache semantics.
 */
export function fingerprintSubstatTargets(substatTargets: SubstatTargetTable): string {
  return substatTargetsFingerprint(substatTargets)
}

export function fingerprintConfigForRules(config: BuilderConfig, substatTargetsKey: string): string {
  return configFingerprint(config, substatTargetsKey)
}
