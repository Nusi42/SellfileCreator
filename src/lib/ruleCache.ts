/**
 * ruleCache.ts
 *
 * Maintains a per-recipe cache of generated HSF rules so the builder,
 * preview, and filters reuse the same computation. The cache is keyed by a
 * fingerprint derived from the rule-affecting fields plus substatTargets so changes
 * invalidate only the affected entries.
 */
import { RULE_COUNT_LIMIT, TOTAL_RULE_COUNT_LIMIT } from './constants'
import {
  buildRulesForRecipe,
  type BuildRulesFinalizeGeneratedFn,
  type HsfRuleWithCfg,
} from './merge'
import { countRulesForRecipeEntry } from './ruleCacheHelpers'
import type { BuilderRecipe, SubstatTargetTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import { resolveArtifactSetSelections } from './gearSets/selection'
import { compareVariants } from './types'
import { buildCanonicalRecipeSnapshot } from './recipeSnapshot'
import type { ProgressSnapshot } from '../types/progress'
import { applyRecipeIndexMutable, cloneRuleWithRecipeIndex } from './ruleRecipeIndex'

/** Cache entry keyed by a stable fingerprint for a single recipe. */
export type RecipeRuleCacheEntry = {
  key: string
  rules: HsfRuleWithCfg[]
  count: number
  truncated: boolean
  excludedByTotalLimit?: boolean
}

export type RecipeRulesCache = Map<number, RecipeRuleCacheEntry>

/** Create an empty cache that callers can persist across renders. */
export function createRecipeRulesCache(): RecipeRulesCache {
  return new Map()
}

function buildFallbackBuckets(cache?: RecipeRulesCache): Map<string, RecipeRuleCacheEntry[]> | null {
  if (!cache) return null
  const buckets = new Map<string, RecipeRuleCacheEntry[]>()
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

function remapRecipeIndex(entry: RecipeRuleCacheEntry, recipeIdx: number): RecipeRuleCacheEntry {
  if (!entry.rules.length) {
    return {
      ...entry,
      rules: entry.rules,
    }
  }
  const targetRecipeId = Math.floor(recipeIdx) + 1
  // Exit quickly when every rule already points at this RecipeID.
  let needsRemap = false
  for (const rule of entry.rules) {
    if (!rule) continue
    const currentId = Number(rule.RecipeID)
    if (currentId !== targetRecipeId) {
      needsRemap = true
      break
    }
  }
  if (!needsRemap) return entry
  const remappedRules = entry.rules.map((rule) => {
    if (!rule) return rule
    const currentId = Number(rule.RecipeID)
    if (currentId !== targetRecipeId) {
      // RecipeID drifted because the recipe moved; clone so we do not mutate shared entries.
      return cloneRuleWithRecipeIndex(rule, recipeIdx)
    }
    // IDs already match, so mutate in place.
    applyRecipeIndexMutable(rule, recipeIdx)
    return rule
  })
  return {
    ...entry,
    rules: remappedRules,
  }
}

type UpdateArgs = {
  recipes: readonly BuilderRecipe[]
  metasets: readonly Metaset[]
  substatTargets: SubstatTargetTable
  previousCache?: RecipeRulesCache
  baseRuleCount?: number
  totalLimit?: number
  finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn
  onProgress?: (progress: ProgressSnapshot) => void
}

type UpdateResult = {
  cache: RecipeRulesCache
  rulesByRecipe: Map<number, HsfRuleWithCfg[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

/**
 * Update (or warm) the cache and return the flattened rules plus lookups that
 * stay consistent with the provided recipe order. When a fingerprint matches
 * the previous entry we reuse the prior rules to avoid rebuilding.
 */
export function updateRecipeRulesCache(args: UpdateArgs): UpdateResult {
  const {
    recipes,
    metasets,
    substatTargets,
    previousCache,
    baseRuleCount = 0,
    totalLimit = TOTAL_RULE_COUNT_LIMIT,
    onProgress,
  } = args
  const totalRecipes = recipes.length
  const emitProgress = (completed: number) => {
    if (!onProgress || totalRecipes <= 0) return
    const snapshot: ProgressSnapshot = {
      completed: Math.max(0, Math.min(completed, totalRecipes)),
      total: totalRecipes,
    }
    try {
      onProgress(snapshot)
    } catch {
      // Ignore listener errors so rule building keeps advancing.
    }
  }
  const substatTargetsKey = substatTargetsFingerprint(substatTargets)
  const nextCache: RecipeRulesCache = new Map()
  const rulesByRecipe = new Map<number, HsfRuleWithCfg[]>()
  const countsByRecipe = new Map<number, number>()
  const keys: string[] = []
  const truncatedRecipeIndices: number[] = []
  const excludedByTotalLimitIndices: number[] = []
  let reportedTotalCount = 0
  const normalizedTotalLimit = Number.isFinite(totalLimit) && totalLimit > 0
    ? Math.max(1, Math.floor(totalLimit))
    : null
  const baseCount = Math.max(0, Math.floor(baseRuleCount))
  let runningTotal = baseCount
  let totalLimitHit = normalizedTotalLimit !== null && runningTotal > normalizedTotalLimit
  const fallbackBuckets = buildFallbackBuckets(previousCache)
  const reusedFallbackEntries = fallbackBuckets ? new Set<RecipeRuleCacheEntry>() : null

  const pickReusableEntry = (key: string, preferred?: RecipeRuleCacheEntry | null): RecipeRuleCacheEntry | null => {
    if (!fallbackBuckets) return null
    const bucket = fallbackBuckets.get(key)
    if (!bucket || bucket.length === 0) return null
    const isEligible = (entry: RecipeRuleCacheEntry | undefined | null): entry is RecipeRuleCacheEntry => (
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
  const markEntryUsed = (entry: RecipeRuleCacheEntry | null): void => {
    if (!entry || !reusedFallbackEntries) return
    reusedFallbackEntries.add(entry)
  }

  for (let recipeIdx = 0; recipeIdx < recipes.length; recipeIdx += 1) {
    const source = recipes[recipeIdx]!
    const resolvedRecipe = mergeRecipeArtifactSets(source, metasets)
    const recipeKey = buildRecipeFingerprint(resolvedRecipe, substatTargetsKey)
    keys.push(recipeKey)

    const prevEntry = previousCache?.get(recipeIdx) ?? null
    const matched = Boolean(prevEntry && prevEntry.key === recipeKey)
    const reusableEntry = pickReusableEntry(recipeKey, matched ? prevEntry : null)
    const canReuseEntry = Boolean(reusableEntry)

    const remainingCapacity = normalizedTotalLimit !== null ? normalizedTotalLimit - runningTotal : null
    if (remainingCapacity !== null && remainingCapacity <= 0) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(recipeIdx)
      const fallbackEntry: RecipeRuleCacheEntry = canReuseEntry && reusableEntry
        ? { ...reusableEntry, truncated: true, excludedByTotalLimit: true, rules: [] }
        : {
            key: recipeKey,
            rules: [],
            count: Number.POSITIVE_INFINITY,
            truncated: true,
            excludedByTotalLimit: true,
          }
      if (canReuseEntry) markEntryUsed(reusableEntry)
      nextCache.set(recipeIdx, fallbackEntry)
      rulesByRecipe.set(recipeIdx, [])
      countsByRecipe.set(recipeIdx, Number.POSITIVE_INFINITY)
      truncatedRecipeIndices.push(recipeIdx)
      reportedTotalCount = Number.POSITIVE_INFINITY
      emitProgress(recipeIdx + 1)
      continue
    }

    let mustExcludeByCapacity = false
    if (remainingCapacity !== null && remainingCapacity < RULE_COUNT_LIMIT) {
      const countLimit = Math.max(1, Math.floor(remainingCapacity + 1))
      const counted = (canReuseEntry && reusableEntry && !reusableEntry.truncated && Number.isFinite(reusableEntry.count))
        ? Math.max(0, Math.floor(reusableEntry.count))
        : countRulesForRecipeEntry(resolvedRecipe, substatTargets, { limit: countLimit })
      if (!Number.isFinite(counted) || counted > remainingCapacity) {
        mustExcludeByCapacity = true
      }
    }

    if (mustExcludeByCapacity) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(recipeIdx)
      const fallbackEntry: RecipeRuleCacheEntry = canReuseEntry && reusableEntry
        ? { ...reusableEntry, truncated: true, excludedByTotalLimit: true, rules: [] }
        : {
            key: recipeKey,
            rules: [],
            count: Number.POSITIVE_INFINITY,
            truncated: true,
            excludedByTotalLimit: true,
          }
      if (canReuseEntry) markEntryUsed(reusableEntry)
      nextCache.set(recipeIdx, fallbackEntry)
      rulesByRecipe.set(recipeIdx, [])
      countsByRecipe.set(recipeIdx, Number.POSITIVE_INFINITY)
      truncatedRecipeIndices.push(recipeIdx)
      reportedTotalCount = Number.POSITIVE_INFINITY
      emitProgress(recipeIdx + 1)
      continue
    }

    let entry: RecipeRuleCacheEntry
    if (canReuseEntry && reusableEntry) {
      markEntryUsed(reusableEntry)
      entry = remapRecipeIndex(reusableEntry, recipeIdx)
      entry = { ...entry, excludedByTotalLimit: false }
    } else {
      entry = buildEntry(
        resolvedRecipe,
        metasets,
        substatTargets,
        recipeIdx,
        recipeKey,
        {
          ...(args.finalizeGeneratedRules ? { finalizeGeneratedRules: args.finalizeGeneratedRules } : {}),
        },
      )
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

    nextCache.set(recipeIdx, entry)
    rulesByRecipe.set(recipeIdx, rulesForPreview)
    countsByRecipe.set(recipeIdx, outputCount)
    if (truncated) truncatedRecipeIndices.push(recipeIdx)
    if (Number.isFinite(reportedTotalCount) && Number.isFinite(outputCount)) {
      reportedTotalCount += outputCount
    } else {
      reportedTotalCount = Number.POSITIVE_INFINITY
    }
    emitProgress(recipeIdx + 1)
  }

  return {
    cache: nextCache,
    rulesByRecipe,
    countsByRecipe,
    keys,
    substatTargetsKey,
    truncatedRecipeIndices,
    totalLimitHit,
    excludedByTotalLimitIndices,
  }
}

function buildEntry(
  recipe: BuilderRecipe,
  metasets: readonly Metaset[],
  substatTargets: SubstatTargetTable,
  recipeIdx: number,
  key: string,
  options?: { finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn },
): RecipeRuleCacheEntry {
  // Delegate to the shared builder so pruning and annotations stay unified.
  let truncated = false
  const rules = buildRulesForRecipe(
    { recipe, metasets: metasets as Metaset[], substatTargets, recipeIdx },
    {
      limit: RULE_COUNT_LIMIT + 1,
      onLimit: () => { truncated = true },
      ...(options?.finalizeGeneratedRules ? { finalizeGeneratedRules: options.finalizeGeneratedRules } : {}),
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
export function mergeRecipeArtifactSets(recipe: BuilderRecipe, metasets: readonly Metaset[]): BuilderRecipe {
  // Resolve sets against metasets and explicit exclusions before caching.
  const resolved = resolveArtifactSetSelections({
    selections: recipe.artifactSets,
    metasetIds: recipe.artifactMetaSets,
    metasets,
  })
  // Only include the resolved set IDs in cached recipes for fingerprints.
  const normalized = resolved.resolved.map((id) => ({ id }))
  if (normalized.length === (recipe.artifactSets ?? []).length) {
    const same = normalized.every((entry, idx) => Number(entry.id) === Number((recipe.artifactSets ?? [])[idx]?.id))
    if (same) return recipe
  }
  return { ...recipe, artifactSets: normalized }
}

/**
 * Build a stable fingerprint for rule-affecting recipe fields. Arrays are
 * sorted and roll bound objects are normalized so cosmetic edits (like
 * selection order) do not invalidate the cache unnecessarily.
 */
function buildRecipeFingerprint(recipe: BuilderRecipe, substatTargetsKey: string): string {
  const canonical = buildCanonicalRecipeSnapshot(recipe)
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

export function fingerprintRecipeForRules(recipe: BuilderRecipe, substatTargetsKey: string): string {
  return buildRecipeFingerprint(recipe, substatTargetsKey)
}
