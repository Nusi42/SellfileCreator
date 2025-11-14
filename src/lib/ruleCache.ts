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
import { countRulesForConfig } from './ruleCacheHelpers'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import { compareVariants } from './types'
import { buildCanonicalConfigSnapshot } from './configSnapshot'

/** Cache entry keyed by a stable fingerprint for a single config. */
export type ConfigRuleCacheEntry = {
  key: string
  rules: HsfRuleWithCfg[]
  count: number
  truncated: boolean
  excludedByTotalLimit?: boolean
}

export type ConfigRulesCache = Map<number, ConfigRuleCacheEntry>

/** Create an empty cache that callers can persist across renders. */
export function createConfigRulesCache(): ConfigRulesCache {
  return new Map()
}

function buildFallbackBuckets(cache?: ConfigRulesCache): Map<string, ConfigRuleCacheEntry[]> | null {
  if (!cache) return null
  const buckets = new Map<string, ConfigRuleCacheEntry[]>()
  cache.forEach((entry) => {
    if (!entry) return
    const list = buckets.get(entry.key)
    if (list) {
      list.push(entry)
    } else {
      buckets.set(entry.key, [entry])
    }
  })
  return buckets
}

function remapConfigIndex(entry: ConfigRuleCacheEntry, cfgIdx: number): ConfigRuleCacheEntry {
  if (!entry.rules.length) {
    return {
      ...entry,
      rules: entry.rules,
    }
  }
  let needsClone = false
  for (const rule of entry.rules) {
    if (rule.__cfgIdx !== cfgIdx) {
      needsClone = true
      break
    }
  }
  if (!needsClone) return entry
  const remappedRules = entry.rules.map((rule) => {
    if (rule.__cfgIdx === cfgIdx) return rule
    return { ...rule, __cfgIdx: cfgIdx }
  })
  return {
    ...entry,
    rules: remappedRules,
  }
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
  truncatedConfigIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
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
  const substatTargetsKey = substatTargetsFingerprint(substatTargets)
  const nextCache: ConfigRulesCache = new Map()
  const rulesByConfig = new Map<number, HsfRuleWithCfg[]>()
  const countsByConfig = new Map<number, number>()
  const keys: string[] = []
  const truncatedConfigIndices: number[] = []
  const excludedByTotalLimitIndices: number[] = []
  let reportedTotalCount = 0
  const normalizedTotalLimit = Number.isFinite(totalLimit) && totalLimit > 0
    ? Math.max(1, Math.floor(totalLimit))
    : null
  const baseCount = Math.max(0, Math.floor(baseRuleCount))
  let runningTotal = baseCount
  let totalLimitHit = normalizedTotalLimit !== null && runningTotal > normalizedTotalLimit
  const fallbackBuckets = buildFallbackBuckets(previousCache)
  const reusedFallbackEntries = fallbackBuckets ? new Set<ConfigRuleCacheEntry>() : null

  const pickReusableEntry = (key: string, preferred?: ConfigRuleCacheEntry | null): ConfigRuleCacheEntry | null => {
    if (!fallbackBuckets) return null
    const bucket = fallbackBuckets.get(key)
    if (!bucket || bucket.length === 0) return null
    const isEligible = (entry: ConfigRuleCacheEntry | undefined | null): entry is ConfigRuleCacheEntry => (
      Boolean(entry)
      && entry!.excludedByTotalLimit !== true
      && !(reusedFallbackEntries?.has(entry!))
    )
    if (preferred && isEligible(preferred)) {
      return preferred
    }
    for (const candidate of bucket) {
      if (isEligible(candidate)) return candidate
    }
    return null
  }
  const markEntryUsed = (entry: ConfigRuleCacheEntry | null): void => {
    if (!entry || !reusedFallbackEntries) return
    reusedFallbackEntries.add(entry)
  }

  for (let cfgIdx = 0; cfgIdx < configs.length; cfgIdx += 1) {
    const source = configs[cfgIdx]!
    const resolvedConfig = mergeArtifactSets(source, metasets)
    const configKey = configFingerprint(resolvedConfig, substatTargetsKey)
    keys.push(configKey)

    const prevEntry = previousCache?.get(cfgIdx) ?? null
    const matched = Boolean(prevEntry && prevEntry.key === configKey)
    const reusableEntry = pickReusableEntry(configKey, matched ? prevEntry : null)
    const canReuseEntry = Boolean(reusableEntry)

    const remainingCapacity = normalizedTotalLimit !== null ? normalizedTotalLimit - runningTotal : null
    if (remainingCapacity !== null && remainingCapacity <= 0) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(cfgIdx)
      const fallbackEntry: ConfigRuleCacheEntry = canReuseEntry && reusableEntry
        ? { ...reusableEntry, truncated: true, excludedByTotalLimit: true, rules: [] }
        : {
            key: configKey,
            rules: [],
            count: Number.POSITIVE_INFINITY,
            truncated: true,
            excludedByTotalLimit: true,
          }
      if (canReuseEntry) markEntryUsed(reusableEntry)
      nextCache.set(cfgIdx, fallbackEntry)
      rulesByConfig.set(cfgIdx, [])
      countsByConfig.set(cfgIdx, Number.POSITIVE_INFINITY)
      truncatedConfigIndices.push(cfgIdx)
      reportedTotalCount = Number.POSITIVE_INFINITY
      continue
    }

    let mustExcludeByCapacity = false
    if (remainingCapacity !== null && remainingCapacity < RULE_COUNT_LIMIT) {
      const countLimit = Math.max(1, Math.floor(remainingCapacity + 1))
      const counted = (canReuseEntry && reusableEntry && !reusableEntry.truncated && Number.isFinite(reusableEntry.count))
        ? Math.max(0, Math.floor(reusableEntry.count))
        : countRulesForConfig(resolvedConfig, substatTargets, { limit: countLimit })
      if (!Number.isFinite(counted) || counted > remainingCapacity) {
        mustExcludeByCapacity = true
      }
    }

    if (mustExcludeByCapacity) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(cfgIdx)
      const fallbackEntry: ConfigRuleCacheEntry = canReuseEntry && reusableEntry
        ? { ...reusableEntry, truncated: true, excludedByTotalLimit: true, rules: [] }
        : {
            key: configKey,
            rules: [],
            count: Number.POSITIVE_INFINITY,
            truncated: true,
            excludedByTotalLimit: true,
          }
      if (canReuseEntry) markEntryUsed(reusableEntry)
      nextCache.set(cfgIdx, fallbackEntry)
      rulesByConfig.set(cfgIdx, [])
      countsByConfig.set(cfgIdx, Number.POSITIVE_INFINITY)
      truncatedConfigIndices.push(cfgIdx)
      reportedTotalCount = Number.POSITIVE_INFINITY
      continue
    }

    let entry: ConfigRuleCacheEntry
    if (canReuseEntry && reusableEntry) {
      markEntryUsed(reusableEntry)
      entry = remapConfigIndex(reusableEntry, cfgIdx)
      entry = { ...entry, excludedByTotalLimit: false }
    } else {
      entry = buildEntry(resolvedConfig, metasets, substatTargets, cfgIdx, configKey)
      entry = { ...entry, excludedByTotalLimit: false }
    }

    const rulesForPreview = entry.rules
    const ruleSpan = rulesForPreview.length
    const truncated = entry.truncated
    const outputCount = truncated ? Number.POSITIVE_INFINITY : ruleSpan

    if (normalizedTotalLimit !== null) {
      runningTotal = Math.min(normalizedTotalLimit, runningTotal + ruleSpan)
    } else {
      runningTotal += ruleSpan
    }

    nextCache.set(cfgIdx, entry)
    rulesByConfig.set(cfgIdx, rulesForPreview)
    countsByConfig.set(cfgIdx, outputCount)
    if (truncated) truncatedConfigIndices.push(cfgIdx)
    if (Number.isFinite(reportedTotalCount) && Number.isFinite(outputCount)) {
      reportedTotalCount += outputCount
    } else {
      reportedTotalCount = Number.POSITIVE_INFINITY
    }
  }

  return {
    cache: nextCache,
    rulesByConfig,
    countsByConfig,
    keys,
    substatTargetsKey,
    truncatedConfigIndices,
    totalLimitHit,
    excludedByTotalLimitIndices,
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
export function mergeArtifactSets(config: BuilderConfig, metasets: readonly Metaset[]): BuilderConfig {
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
  const canonical = buildCanonicalConfigSnapshot(config)
  return JSON.stringify({ cfg: canonical, substatTargets: substatTargetsKey })
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
