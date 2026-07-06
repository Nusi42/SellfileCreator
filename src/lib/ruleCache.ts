/**
 * ruleCache.ts
 *
 * Builds generated HSF rules plus per-recipe metadata from the current recipe
 * snapshot. Fingerprints remain for stable keys/dirty checks, but rule rows are
 * rebuilt from the current payload each call.
 */
import {
  RULE_COUNT_LIMIT,
  TOTAL_RULE_COUNT_LIMIT,
  PERSISTENT_RULE_CACHE_MIN_ENTRIES,
  PERSISTENT_RULE_CACHE_MAX_MULTIPLIER,
} from './constants'
import {
  buildRulesForRecipe,
  type BuildRulesFinalizeGeneratedFn,
  type HsfRuleWithRecipe,
} from './merge'
import { cloneRuleWithRecipeIndex } from './ruleRecipeIndex'
import { countRulesForRecipeEntry } from './ruleCacheHelpers'
import type { BuilderRecipe, SubstatTargetTable } from './hsfBuilder'
import type { Metaset } from './metasets'
import { resolveArtifactSetSelections } from './gearSets/selection'
import { compareVariants } from './types'
import { buildCanonicalRecipeSnapshot } from './recipeSnapshot'
import type { ProgressSnapshot } from '../types/progress'

type UpdateArgs = {
  recipes: readonly BuilderRecipe[]
  metasets: readonly Metaset[]
  substatTargets: SubstatTargetTable
  baseRuleCount?: number
  totalLimit?: number
  finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn
  onProgress?: (progress: ProgressSnapshot) => void
  /**
   * Optional persistent cache keyed by recipe fingerprint. When provided,
   * entries whose fingerprint is already in the map are reused directly so the
   * WASM rule-build and capacity-check calls are skipped for unchanged recipes.
   * The map is updated in-place with any newly built entries.
   */
  rulesCache?: Map<string, RecipeRulesCacheEntry>
}

type UpdateResult = {
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

/**
 * Per-recipe rule entry used both by the internal builder and the persistent
 * worker-side cache keyed by recipe fingerprint.
 */
export type RecipeRulesCacheEntry = {
  rules: HsfRuleWithRecipe[]
  truncated: boolean
}

/**
 * Build per-recipe rules/count metadata and keep emitted indices aligned with
 * the input recipe order.
 */
export function updateRecipeRulesCache(args: UpdateArgs): UpdateResult {
  const {
    recipes,
    metasets,
    substatTargets,
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
  const rulesByRecipe = new Map<number, HsfRuleWithRecipe[]>()
  const countsByRecipe = new Map<number, number>()
  const keys: string[] = []
  const truncatedRecipeIndices: number[] = []
  const excludedByTotalLimitIndices: number[] = []

  const normalizedTotalLimit = Number.isFinite(totalLimit) && totalLimit > 0
    ? Math.max(1, Math.floor(totalLimit))
    : null
  const baseCount = Math.max(0, Math.floor(baseRuleCount))
  let runningTotal = baseCount
  let totalLimitHit = normalizedTotalLimit !== null && runningTotal > normalizedTotalLimit

  for (let recipeIdx = 0; recipeIdx < recipes.length; recipeIdx += 1) {
    const source = recipes[recipeIdx]!
    const resolvedRecipe = mergeRecipeArtifactSets(source, metasets)
    const recipeKey = buildRecipeFingerprint(resolvedRecipe, substatTargetsKey)
    keys.push(recipeKey)

    const remainingCapacity = normalizedTotalLimit !== null ? normalizedTotalLimit - runningTotal : null
    if (remainingCapacity !== null && remainingCapacity <= 0) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(recipeIdx)
      rulesByRecipe.set(recipeIdx, [])
      countsByRecipe.set(recipeIdx, Number.POSITIVE_INFINITY)
      truncatedRecipeIndices.push(recipeIdx)
      emitProgress(recipeIdx + 1)
      continue
    }

    // Look up the persistent cache before doing any WASM work. Re-insert on hit so the
    // Map's iteration order tracks recency (Map preserves insertion order; delete+set
    // moves the key to the end), giving the eviction below a cheap LRU without a
    // separate tracking structure.
    const cachedEntry = args.rulesCache?.get(recipeKey)
    if (cachedEntry && args.rulesCache) {
      args.rulesCache.delete(recipeKey)
      args.rulesCache.set(recipeKey, cachedEntry)
    }

    let mustExcludeByCapacity = false
    if (remainingCapacity !== null) {
      if (cachedEntry) {
        // Cached rules let us skip the countRulesForRecipeEntry WASM call.
        if (cachedEntry.truncated || cachedEntry.rules.length > remainingCapacity) {
          mustExcludeByCapacity = true
        }
      } else if (remainingCapacity < RULE_COUNT_LIMIT) {
        // No cache entry: fall back to the WASM count for capacity estimation.
        const countLimit = Math.max(1, Math.floor(remainingCapacity + 1))
        const counted = countRulesForRecipeEntry(resolvedRecipe, substatTargets, { limit: countLimit })
        if (!Number.isFinite(counted) || counted > remainingCapacity) {
          mustExcludeByCapacity = true
        }
      }
    }

    if (mustExcludeByCapacity) {
      totalLimitHit = true
      excludedByTotalLimitIndices.push(recipeIdx)
      rulesByRecipe.set(recipeIdx, [])
      countsByRecipe.set(recipeIdx, Number.POSITIVE_INFINITY)
      truncatedRecipeIndices.push(recipeIdx)
      emitProgress(recipeIdx + 1)
      continue
    }

    // Reuse cached entry when fingerprint matches, but re-stamp RecipeID to the
    // current position. Duplicate recipes share a fingerprint but sit at
    // different indices — serving cached rules as-is would give every duplicate
    // the RecipeID of whichever recipe was built first (always 1).
    let entry: RecipeRulesCacheEntry
    if (cachedEntry) {
      const restampedRules = cachedEntry.rules.map((rule) => cloneRuleWithRecipeIndex(rule, recipeIdx))
      entry = { rules: restampedRules, truncated: cachedEntry.truncated }
    } else {
      entry = buildEntry(
        resolvedRecipe,
        metasets,
        substatTargets,
        recipeIdx,
        {
          ...(args.finalizeGeneratedRules ? { finalizeGeneratedRules: args.finalizeGeneratedRules } : {}),
        },
      )
      // Store newly built entries so subsequent runs can reuse them, evicting the
      // least-recently-used entry first when the cache is at capacity so long sessions
      // with many substat-target edits (which invalidate every recipe's key at once —
      // see buildRecipeFingerprint) cannot grow it unboundedly. Cap scales with the
      // current recipe count so it holds roughly one full generation of entries plus a
      // margin, rather than an arbitrary flat constant unrelated to this SFC's size.
      if (args.rulesCache) {
        const maxEntries = Math.max(
          PERSISTENT_RULE_CACHE_MIN_ENTRIES,
          Math.ceil(totalRecipes * PERSISTENT_RULE_CACHE_MAX_MULTIPLIER),
        )
        if (args.rulesCache.size >= maxEntries) {
          const oldestKey = args.rulesCache.keys().next().value
          if (oldestKey !== undefined) args.rulesCache.delete(oldestKey)
        }
        args.rulesCache.set(recipeKey, entry)
      }
    }

    const rulesForPreview = entry.rules
    const ruleSpan = rulesForPreview.length
    const outputCount = entry.truncated ? Number.POSITIVE_INFINITY : ruleSpan

    if (normalizedTotalLimit !== null) {
      runningTotal = Math.min(normalizedTotalLimit, runningTotal + ruleSpan)
    } else {
      runningTotal += ruleSpan
    }

    rulesByRecipe.set(recipeIdx, rulesForPreview)
    countsByRecipe.set(recipeIdx, outputCount)
    if (entry.truncated) truncatedRecipeIndices.push(recipeIdx)
    emitProgress(recipeIdx + 1)
  }

  return {
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
  options?: { finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn },
): RecipeRulesCacheEntry {
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
    rules,
    truncated,
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
  // Collapse to include-only entries and clear metasets so downstream callers
  // (buildRulesForRecipe, fingerprinting) see the final set list without a
  // second metaset expansion that would re-add explicitly excluded sets.
  const normalized = resolved.resolved.map((id) => ({ id }))
  const metasetsAlreadyResolved = !recipe.artifactMetaSets?.length
  const setsAlreadyNormalized = metasetsAlreadyResolved
    && normalized.length === (recipe.artifactSets ?? []).length
    && normalized.every((entry, idx) => Number(entry.id) === Number((recipe.artifactSets ?? [])[idx]?.id))
  if (setsAlreadyNormalized) return recipe
  return { ...recipe, artifactSets: normalized, artifactMetaSets: [] }
}

/**
 * Build a stable fingerprint for rule-affecting recipe fields. Arrays are
 * sorted and roll bound objects are normalized so cosmetic edits (like
 * selection order) do not invalidate the key unnecessarily.
 */
function buildRecipeFingerprint(recipe: BuilderRecipe, substatTargetsKey: string): string {
  const canonical = buildCanonicalRecipeSnapshot(recipe)
  return JSON.stringify({ recipe: canonical, substatTargets: substatTargetsKey })
}

/**
 * Canonicalize substatTargets to ensure the fingerprint changes only when
 * thresholds that affect rule generation change.
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

export function fingerprintRecipeForRules(recipe: BuilderRecipe, substatTargetsKey: string): string {
  return buildRecipeFingerprint(recipe, substatTargetsKey)
}
