/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import type { BuilderRecipe, SubstatTargetTable } from './hsfBuilder'
import {
  RULE_COUNT_LIMIT,
  TOTAL_RULE_COUNT_LIMIT,
  SAFEGUARD_RECIPE_ID_BASE,
} from './constants'
import { buildHsfRules, RuleLimitReachedError, resolveAutoRarityCode } from './hsfBuilder'
import {
  buildFinalSellRulesWithLoadedWasm,
  cacheGeneratedRulesWithLoadedWasm,
  computeMergedRulesCachedWithLoadedWasm,
  mergeCachedRulesAndConfigureWithLoadedWasm,
  expandAutoFlexRarityBranchesWithLoadedWasm,
  flattenRuleBatchesWithTotalLimitWithLoadedWasm,
  finalizeGeneratedRulesWithLoadedWasm,
  buildSafeguardRulesWithLoadedWasm,
  mergeSafeguardInjectedRulesWithLoadedWasm,
} from './wasm/wasmRuleEngine'
import type { Metaset } from './metasets'
import { resolveArtifactSetSelections } from './gearSets/selection'
import {
  getAllKnownArtifactSetIds,
} from './types'
import { ACCESSORY_NO_SET_ID } from './constants'
import {
  type FinalSellRemainderConfig,
} from './logicHub'
import {
  type SafeguardsMergeInput,
  hasActiveSafeguardRules,
  type SafeguardRule,
  type SafeguardDetectionSnapshot,
} from './safeguards'
import {
  RULE_SOURCE_HSF,
  RULE_SOURCE_SFC,
  RULE_SOURCE_SAFEGUARDS,
} from './ruleSources'
import type { RuleSource } from './ruleSources'
export {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_SFC,
  RULE_SOURCE_SAFEGUARDS,
  isKeepOverrideRuleSource,
  type RuleSource,
} from './ruleSources'

export type HsfRuleWithRecipe = HsfRule & {
  __lineIdx?: number
  __allKnownSets?: boolean
  __source?: RuleSource
  __rankMask?: number
  __rarityMask?: number
  __safeguardRuleId?: string
  __safeguardRuleOrdinal?: number
  __safeguardHash?: string
  __safeguardRequired?: number
  __safeguardScanMs?: number
  __safeguardProjected?: number
  __safeguardDeficit?: number
  __safeguardItemKey?: number
  __safeguardPlaceholder?: boolean
  __safeguardPlaceholderMissing?: number
}

// Keep branch metadata separate from the mutable rule object so worker callers
// can serialize generation output for WASM post-processing.
export type GeneratedBranchRuleEntry = {
  rule: HsfRuleWithRecipe
  branchOrder: number
  branchSeq: number
  originalIdx: number
}

// Optional post-processor contract used by worker WASM paths.
export type BuildRulesFinalizeGeneratedFn = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}) => HsfRuleWithRecipe[]

function expandAutoFlexRarityBranches(recipe: BuilderRecipe): BuilderRecipe[] {
  // Keep auto-rarity resolution in the existing shared helper.
  const baseRarityCode = resolveAutoRarityCode(recipe)
  // Delegate branch splitting heuristics to wasm for SSOT behavior.
  const branches = expandAutoFlexRarityBranchesWithLoadedWasm({
    recipe,
    baseRarityCode,
  })
  // Fail closed when warmup/payload is invalid; do not silently keep one branch.
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('WASM auto-flex rarity expansion returned no branches. Ensure warmupWasmRuleEngine() ran first.')
  }
  return branches
}

export function buildRulesForRecipe(params: {
  recipe: BuilderRecipe
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipeIdx?: number
}, options?: { limit?: number; onLimit?: () => void; finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn }): HsfRuleWithRecipe[] {
  const { recipe, metasets, substatTargets, recipeIdx } = params
  // Carry a stable 1-based recipe identifier through builder → HSF exports.
  const recipeIdForExport = (typeof recipeIdx === 'number' && Number.isFinite(recipeIdx) && recipeIdx >= 0)
    ? (Math.floor(recipeIdx) + 1)
    : null
  // Expand metasets and remove explicit exclusions before rule generation.
  const resolvedSets = resolveArtifactSetSelections({
    selections: recipe.artifactSets,
    metasetIds: recipe.artifactMetaSets,
    metasets,
  })
  // Build a recipe snapshot with the resolved set IDs only.
  const recipeWithSets: BuilderRecipe = {
    ...recipe,
    // Normalize to include-only entries so the builder sees final set ids.
    artifactSets: resolvedSets.resolved.map((id) => ({ id })),
  }
  try {
    const recipesToBuild = expandAutoFlexRarityBranches(recipeWithSets)
    // Capture explicit branch metadata so sorting/finalization is deterministic.
    const generatedEntries: GeneratedBranchRuleEntry[] = []
    recipesToBuild.forEach((branch, branchOrder) => {
      const built = buildHsfRules(
        branch,
        substatTargets,
        {
          ...(options?.limit != null ? { limit: options.limit } : {}),
          ...(recipeIdForExport !== null ? { recipeId: recipeIdForExport } : {}),
        },
      )
      built.forEach((rule, seq) => {
        generatedEntries.push({
          rule: rule as HsfRuleWithRecipe,
          branchOrder,
          branchSeq: seq,
          originalIdx: generatedEntries.length,
        })
      })
    })
    const applyObsoletePruning = recipesToBuild.length <= 1
    // Single source of truth: generated-rule finalize logic lives in WASM.
    // Allow callers to inject an alternative only for explicit test/worker hooks.
    const finalizeGeneratedRules = options?.finalizeGeneratedRules ?? ((finalizeParams: {
      entries: readonly GeneratedBranchRuleEntry[]
      applyObsoletePruning: boolean
    }) => {
      // Fail closed when warmup did not complete; no hidden JS fallback exists.
      const finalized = finalizeGeneratedRulesWithLoadedWasm(finalizeParams)
      if (!Array.isArray(finalized)) {
        throw new Error('WASM generated-rule finalizer is unavailable. Ensure warmupWasmRuleEngine() ran first.')
      }
      return finalized
    })
    // Always pass through the selected finalizer so merge/order/prune behavior
    // comes from one implementation across app + worker + tests.
    const finalized = finalizeGeneratedRules({ entries: generatedEntries, applyObsoletePruning })
    return finalized.map((rule): HsfRuleWithRecipe => ({ ...rule, __source: RULE_SOURCE_SFC }))
  } catch (error) {
    if (error instanceof RuleLimitReachedError) {
      options?.onLimit?.()
      return []
    }
    throw error
  }
}

export function buildFinalSellRules(finalSellRemainder: FinalSellRemainderConfig | null | undefined): HsfRuleWithRecipe[] {
  // Delegate final-sell level/type/set expansion to wasm for SSOT ordering.
  return buildFinalSellRulesWithLoadedWasm({
    finalSellRemainder,
    // ACCESSORY_NO_SET_ID (-99) is a UI sentinel, not a real game set;
    // exclude it so the WASM engine never generates a sell rule for set -99.
    allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)).filter((id) => id !== ACCESSORY_NO_SET_ID),
  })
}

export const buildSafeguardRules = (
  rules: readonly SafeguardRule[],
  detection: SafeguardDetectionSnapshot | null,
): HsfRuleWithRecipe[] => {
  // Single source of truth: safeguard-rule generation lives in WASM.
  return buildSafeguardRulesWithLoadedWasm({
    rules,
    detection,
    recipeIdBase: SAFEGUARD_RECIPE_ID_BASE,
  })
}

type SafeguardMergeParams = {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  finalSellRules: HsfRuleWithRecipe[]
  resolvedSafeguardRules: readonly SafeguardRule[]
  detection: SafeguardDetectionSnapshot | null
}

type SafeguardMergeResult = {
  baseRules: HsfRuleWithRecipe[]
  mergedRules: HsfRuleWithRecipe[]
}

// Shared helper: inject safeguard rules ahead of base/custom/final-sell with duplicate protection.
export function prependSafeguardRules({
  baseRules,
  customRules,
  finalSellRules,
  resolvedSafeguardRules,
  detection,
}: SafeguardMergeParams): SafeguardMergeResult {
  // Strip any prior safeguard injections to avoid double-prepending.
  const baseWithoutSafeguards = baseRules.filter((rule) => rule.__source !== RULE_SOURCE_SAFEGUARDS)
  // Build candidate safeguard rules from detection snapshot + resolved combinations.
  const candidateSafeguardRules = detection ? buildSafeguardRules(resolvedSafeguardRules, detection) : []
  // WASM now owns injected safeguard-rule dedupe + sorting semantics (SSOT).
  const sortedSafeguardRules = mergeSafeguardInjectedRulesWithLoadedWasm({
    baseRules: baseWithoutSafeguards,
    customRules,
    candidateSafeguardRules,
  })
  if (!Array.isArray(sortedSafeguardRules)) {
    throw new Error('WASM safeguard injected-rule merge is unavailable. Ensure warmupWasmRuleEngine() ran first.')
  }
  // Safeguard rules must precede base rules to override.
  const nextBaseRules = sortedSafeguardRules.concat(baseWithoutSafeguards)
  const mergedRules: HsfRuleWithRecipe[] = [
    ...nextBaseRules,
    ...customRules,
    ...finalSellRules,
  ]
  return { baseRules: nextBaseRules, mergedRules }
}

/**
 * Pre-computed base + customs that can be reused across multiple
 * computeMergedRulesFromComponents calls when only safeguard detection changes.
 * Build once with buildMergedRulesComponents, then pass to both baseline and
 * final calls to skip the redundant flattenRuleBatches WASM step.
 */
export type MergedRulesComponents = {
  base: HsfRuleWithRecipe[]
  customs: HsfRuleWithRecipe[]
  allKnownSetIds: number[]
}

/**
 * Extract the invariant parts of computeMergedRules (base rule wrapping and
 * WASM batch flattening) so callers that call computeMergedRules twice with
 * the same inputs but different safeguardDetection can skip the flatten step.
 */
export function buildMergedRulesComponents(params: {
  hsf: HsfFile | null
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  prebuiltCustomRules?: ReadonlyMap<number, readonly HsfRuleWithRecipe[]>
}): MergedRulesComponents {
  const { hsf, customRecipes, metasets, substatTargets, prebuiltCustomRules } = params

  // Strip foreign fields from base HSF rules once.
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRuleWithRecipe[] = baseRaw.map((r: HsfRule) => ({ ...r, __source: RULE_SOURCE_HSF }))

  const metasetsEffective: Metaset[] = metasets
  const normalizedTotalLimit = Number.isFinite(TOTAL_RULE_COUNT_LIMIT) && TOTAL_RULE_COUNT_LIMIT > 0
    ? Math.max(1, Math.floor(TOTAL_RULE_COUNT_LIMIT))
    : null
  const customBatches: HsfRuleWithRecipe[][] = []

  if (prebuiltCustomRules) {
    const ordered = Array.from(prebuiltCustomRules.entries())
    ordered.sort((a, b) => a[0] - b[0])
    for (const [, rules] of ordered) {
      customBatches.push(Array.from(rules))
    }
  } else {
    for (let recipeIdx = 0; recipeIdx < customRecipes.length; recipeIdx += 1) {
      const recipe = customRecipes[recipeIdx]!
      const built = buildRulesForRecipe(
        { recipe, metasets: metasetsEffective, substatTargets, recipeIdx },
        { limit: RULE_COUNT_LIMIT + 1 },
      )
      customBatches.push(built)
    }
  }
  // Flatten once; both baseline and final computeMergedRulesFromComponents reuse this.
  const customs = flattenRuleBatchesWithTotalLimitWithLoadedWasm({
    baseCount: base.length,
    totalLimit: normalizedTotalLimit,
    batches: customBatches,
  })

  // ACCESSORY_NO_SET_ID (-99) is a UI sentinel, not a real game set; exclude it here.
  return { base, customs, allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)).filter((id) => id !== ACCESSORY_NO_SET_ID) }
}

// Tracks the rulesCacheKey of the generated-rules currently cached WASM-side (per JS
// context — main thread and each worker have their own module instance + their own WASM
// engine, so this single module-level value correctly mirrors that context's cache).
// null = nothing cached yet (or last call used the always-refresh path).
let lastCachedRulesKey: string | null = null

/**
 * Compute merged rules from pre-built components to avoid redundant WASM flatten.
 * Callers that need both baseline and final rules should call buildMergedRulesComponents
 * once and call this function twice with different safeguards.detection values.
 *
 * Routes through the WASM-side rule cache: the base+custom+final-sell "generated rules"
 * (the merge half invariant across endpoint pushes within a session) are cached in the
 * engine and only re-sent when `rulesCacheKey` changes. Per push only the safeguard
 * detection snapshot crosses the boundary. This is the fix for the incremental-update
 * leak (re-sending ~17 MiB of rules every push churned talc into permanent grow-steps).
 *
 * `rulesCacheKey`: a cheap, caller-supplied signal of the rules-producing inputs (the
 * worker passes its computeRecipeKey). Equal key across calls ⇒ rules unchanged ⇒ reuse
 * the cache. Omitted ⇒ refresh the cache every call (safe; used by the occasional
 * main-thread merge where per-push cost is irrelevant). The cached merge falls back
 * internally to the full legacy merge on a WASM cache miss, so correctness never depends
 * on the key being right — only performance does.
 */
// Shared param shape for the cached-merge entry points below.
type MergedRulesFromComponentsParams = {
  finalSellRemainder?: FinalSellRemainderConfig
  safeguards?: SafeguardsMergeInput
  omitDisabledBeforeSafeguards?: boolean
  dedupeBeforeSafeguards?: boolean
  rulesCacheKey?: string
}

// Build the INVARIANT HALF of the merge payload (recipe rules + transform flags + safeguard
// rule DEFINITIONS — everything constant across pushes within a session; the detection
// snapshot is the only per-push input and is NOT part of this) and refresh the WASM-side
// rules cache when the key changed or no key was supplied. A supplied, matching key means
// the generated rules are already resident — skip the ~17 MiB rules payload entirely.
// SSOT for both computeMergedRulesFromComponents and configureMergedRulesFromComponents.
function ensureCachedMergeInputs(
  components: MergedRulesComponents,
  params: MergedRulesFromComponentsParams,
) {
  const { base, customs, allKnownSetIds } = components
  const safeguardsInput = hasActiveSafeguardRules(params.safeguards) ? params.safeguards : null
  const invariantHalf = {
    baseRules: base,
    customRules: customs,
    finalSellRemainder: params.finalSellRemainder ?? null,
    allKnownSetIds,
    omitDisabledBeforeSafeguards: params.omitDisabledBeforeSafeguards === true,
    dedupeBeforeSafeguards: params.dedupeBeforeSafeguards === true,
    safeguardEnabled: safeguardsInput != null,
    safeguardRules: safeguardsInput?.rules ?? [],
  }
  if (params.rulesCacheKey === undefined || params.rulesCacheKey !== lastCachedRulesKey) {
    cacheGeneratedRulesWithLoadedWasm(invariantHalf)
    // Record the key only when one was supplied; an absent key means "always refresh".
    lastCachedRulesKey = params.rulesCacheKey ?? null
  }
  return { invariantHalf, safeguardsInput }
}

export function computeMergedRulesFromComponents(
  components: MergedRulesComponents,
  params: MergedRulesFromComponentsParams,
): HsfRuleWithRecipe[] {
  const { invariantHalf, safeguardsInput } = ensureCachedMergeInputs(components, params)
  // Merge using the cached invariant inputs + this call's detection snapshot. Pass the full
  // params so the wrapper can self-heal (re-cache + retry) on a cache miss.
  return computeMergedRulesCachedWithLoadedWasm({
    ...invariantHalf,
    safeguardDetection: safeguardsInput?.detection ?? null,
    safeguardRecipeIdBase: SAFEGUARD_RECIPE_ID_BASE,
  })
}

/**
 * Merge (via the same WASM-cached inputs as computeMergedRulesFromComponents) and configure
 * the engine with the result in ONE WASM call, returning only the merged rule COUNT.
 * For configure passes whose merged rules have no TS consumer — the rule-cache worker's
 * baseline configure — this skips the entire rules round-trip (serialize-out + expand +
 * minify + serialize-in of ~15 MiB) that merge-then-configure would pay.
 * The engine ends up holding exactly the ruleset computeMergedRulesFromComponents would
 * have returned for identical params (same WASM merge half, byte-identical rules).
 */
export function configureMergedRulesFromComponents(
  components: MergedRulesComponents,
  params: MergedRulesFromComponentsParams & { recipeModes: readonly string[] },
): number {
  const { invariantHalf, safeguardsInput } = ensureCachedMergeInputs(components, params)
  return mergeCachedRulesAndConfigureWithLoadedWasm({
    ...invariantHalf,
    safeguardDetection: safeguardsInput?.detection ?? null,
    safeguardRecipeIdBase: SAFEGUARD_RECIPE_ID_BASE,
    recipeModes: params.recipeModes,
  })
}

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customRecipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder?: FinalSellRemainderConfig
  prebuiltCustomRules?: ReadonlyMap<number, readonly HsfRuleWithRecipe[]>
  safeguards?: SafeguardsMergeInput
  // Apply app-level transforms to generated rows before safeguard processing.
  omitDisabledBeforeSafeguards?: boolean
  dedupeBeforeSafeguards?: boolean
}): HsfRuleWithRecipe[] {
  // Delegate to the two-step path so the single-call API stays available.
  const components = buildMergedRulesComponents(params)
  return computeMergedRulesFromComponents(components, params)
}
