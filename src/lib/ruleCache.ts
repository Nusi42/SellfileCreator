/**
 * ruleCache.ts
 *
 * Maintains a per-config cache of generated HSF rules so the builder,
 * preview, and filters reuse the same computation. The cache is keyed by a
 * fingerprint derived from the rule-affecting fields plus minima so changes
 * invalidate only the affected entries.
 */
import { buildRulesForConfig, type HsfRuleWithCfg } from './merge'
import type { BuilderConfig, MinimaTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import { resolveMetasetIds } from './metasets'
import {
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
} from './types'

/** Cache entry keyed by a stable fingerprint for a single config. */
export type ConfigRuleCacheEntry = {
  key: string
  rules: HsfRuleWithCfg[]
  count: number
}

export type ConfigRulesCache = Map<number, ConfigRuleCacheEntry>

/** Create an empty cache that callers can persist across renders. */
export function createConfigRulesCache(): ConfigRulesCache {
  return new Map()
}

type UpdateArgs = {
  configs: readonly BuilderConfig[]
  metasets: readonly Metaset[]
  minima: MinimaTable
  previousCache?: ConfigRulesCache
}

type UpdateResult = {
  cache: ConfigRulesCache
  rulesByConfig: Map<number, HsfRuleWithCfg[]>
  countsByConfig: Map<number, number>
  keys: string[]
  minimaKey: string
}

/**
 * Update (or warm) the cache and return the flattened rules plus lookups that
 * stay consistent with the provided config order. When a fingerprint matches
 * the previous entry we reuse the prior rules to avoid rebuilding.
 */
export function updateConfigRulesCache(args: UpdateArgs): UpdateResult {
  const { configs, metasets, minima, previousCache } = args
  const minimaKey = minimaFingerprint(minima)
  const nextCache: ConfigRulesCache = new Map()
  const rulesByConfig = new Map<number, HsfRuleWithCfg[]>()
  const countsByConfig = new Map<number, number>()
  const keys: string[] = []

  for (let cfgIdx = 0; cfgIdx < configs.length; cfgIdx += 1) {
    const source = configs[cfgIdx]!
    const resolvedConfig = mergeArtifactSets(source, metasets)
    const configKey = configFingerprint(resolvedConfig, minimaKey)
    keys.push(configKey)

    const prevEntry = previousCache?.get(cfgIdx)
    const matched = prevEntry && prevEntry.key === configKey
    const entry = matched
      ? prevEntry
      : buildEntry(resolvedConfig, metasets, minima, cfgIdx, configKey)

    nextCache.set(cfgIdx, entry)
    rulesByConfig.set(cfgIdx, entry.rules)
    countsByConfig.set(cfgIdx, entry.count)
  }

  return {
    cache: nextCache,
    rulesByConfig,
    countsByConfig,
    keys,
    minimaKey,
  }
}

function buildEntry(
  config: BuilderConfig,
  metasets: readonly Metaset[],
  minima: MinimaTable,
  cfgIdx: number,
  key: string,
): ConfigRuleCacheEntry {
  // Delegate to the shared builder so pruning and annotations stay unified.
  const rules = buildRulesForConfig({ config, metasets: metasets as Metaset[], minima, cfgIdx })
  return {
    key,
    rules,
    count: rules.length,
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
function configFingerprint(config: BuilderConfig, minimaKey: string): string {
  const canonical = canonicalizeConfig(config)
  return JSON.stringify({ cfg: canonical, minima: minimaKey })
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

/**
 * Canonicalize minima to ensure the fingerprint changes only when thresholds
 * that affect rule generation change.
 */
function minimaFingerprint(minima: MinimaTable): string {
  const stars: Array<{ star: string; values: Array<[number, number]> }> = []
  const order: Array<'one' | 'two' | 'three' | 'four' | 'five' | 'six'> = ['one', 'two', 'three', 'four', 'five', 'six']
  for (const star of order) {
    const table = minima[star] ?? {}
    const pairs = Object.entries(table)
      .map(([variant, value]) => [Number(variant), Number(value ?? 0)] as [number, number])
    pairs.sort((a, b) => compareVariants(a[0], b[0]))
    stars.push({ star, values: pairs })
  }
  return JSON.stringify({
    anyRankDefaultsTo: minima.anyRankDefaultsTo ?? 6,
    stars,
  })
}

/**
 * Expose the shared fingerprint helpers so UI layers can reuse cache semantics.
 */
export function fingerprintMinima(minima: MinimaTable): string {
  return minimaFingerprint(minima)
}

export function fingerprintConfigForRules(config: BuilderConfig, minimaKey: string): string {
  return configFingerprint(config, minimaKey)
}
