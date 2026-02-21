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
  computeMergedRulesWithLoadedWasm,
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
  RULE_SOURCE_HSFC,
  RULE_SOURCE_SAFEGUARDS,
} from './ruleSources'
import type { RuleSource } from './ruleSources'
export {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_HSFC,
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
    return finalized.map((rule): HsfRuleWithRecipe => ({ ...rule, __source: RULE_SOURCE_HSFC }))
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
    allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)),
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
  const {
    hsf,
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    prebuiltCustomRules,
    safeguards,
    omitDisabledBeforeSafeguards,
    dedupeBeforeSafeguards,
  } = params

  // Always strip any foreign/internal fields (e.g., __lineIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRuleWithRecipe[] = baseRaw.map((r: HsfRule) => ({ ...r, __source: RULE_SOURCE_HSF }))

  // The legacy "All Sets (Explicit)" metaset is removed; use provided metasets only.
  const metasetsEffective: Metaset[] = metasets

  const normalizedTotalLimit = Number.isFinite(TOTAL_RULE_COUNT_LIMIT) && TOTAL_RULE_COUNT_LIMIT > 0
    ? Math.max(1, Math.floor(TOTAL_RULE_COUNT_LIMIT))
    : null
  // Collect custom-rule batches first so wasm can apply the exact total-limit gate.
  const customBatches: HsfRuleWithRecipe[][] = []

  if (prebuiltCustomRules) {
    const ordered = Array.from(prebuiltCustomRules.entries())
    ordered.sort((a, b) => a[0] - b[0])
    for (const [, rules] of ordered) {
      customBatches.push(Array.from(rules))
    }
  } else {
    // Fallback: build on demand when no cache is supplied.
    for (let recipeIdx = 0; recipeIdx < customRecipes.length; recipeIdx += 1) {
      const recipe = customRecipes[recipeIdx]!
      const built = buildRulesForRecipe(
        { recipe, metasets: metasetsEffective, substatTargets, recipeIdx },
        {
          limit: RULE_COUNT_LIMIT + 1,
        },
      )
      customBatches.push(built)
    }
  }
  // Delegate batch flattening + overflow stop behavior to wasm for SSOT parity.
  const customs = flattenRuleBatchesWithTotalLimitWithLoadedWasm({
    baseCount: base.length,
    totalLimit: normalizedTotalLimit,
    batches: customBatches,
  })

  // Safeguard active gate remains in TS so UI toggle semantics stay explicit.
  const safeguardsInput = hasActiveSafeguardRules(safeguards)
    ? safeguards
    : null
  // Delegate merged-rule orchestration (+ __lineIdx assignment) to wasm.
  return computeMergedRulesWithLoadedWasm({
    baseRules: base,
    customRules: customs,
    finalSellRemainder: finalSellRemainder ?? null,
    allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)),
    omitDisabledBeforeSafeguards: omitDisabledBeforeSafeguards === true,
    dedupeBeforeSafeguards: dedupeBeforeSafeguards === true,
    safeguardEnabled: safeguardsInput != null,
    safeguardRules: safeguardsInput?.rules ?? [],
    safeguardDetection: safeguardsInput?.detection ?? null,
    safeguardRecipeIdBase: SAFEGUARD_RECIPE_ID_BASE,
  })
}
