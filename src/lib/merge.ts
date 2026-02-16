/**
 * Merged rules computation (pure).
 *
 * Why: Isolate heavy preview merging into a testable function. Behavior is
 * unchanged — App composes this inside a useMemo with identical inputs.
 */
import type { HsfFile, HsfRule } from './hsfTypes'
import type { BuilderConfig, SubstatTargetTable } from './hsfBuilder'
import {
  RULE_COUNT_LIMIT,
  TOTAL_RULE_COUNT_LIMIT,
  KEEP_UNIQUE_CONFIG_ID_BASE,
} from './constants'
import { buildHsfRules, RuleLimitReachedError, resolveAutoRarityCode } from './hsfBuilder'
import {
  buildFinalSellRulesWithLoadedWasm,
  computeMergedRulesWithLoadedWasm,
  expandAutoFlexRarityBranchesWithLoadedWasm,
  flattenRuleBatchesWithTotalLimitWithLoadedWasm,
  finalizeGeneratedRulesWithLoadedWasm,
  buildKeepUniqueRulesWithLoadedWasm,
  mergeKeepUniqueInjectedRulesWithLoadedWasm,
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
  type KeepUniquesMergeInput,
  hasActiveKeepUniqueRules,
  type KeepUniqueRule,
  type KeepUniqueDetectionSnapshot,
} from './keepUniques'
import {
  RULE_SOURCE_HSF,
  RULE_SOURCE_HSFC,
  RULE_SOURCE_KEEP_UNIQUES,
} from './ruleSources'
import type { RuleSource } from './ruleSources'
export {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_HSFC,
  RULE_SOURCE_KEEP_UNIQUES,
  isKeepOverrideRuleSource,
  type RuleSource,
} from './ruleSources'

export type HsfRuleWithCfg = HsfRule & {
  __lineIdx?: number
  __allKnownSets?: boolean
  __source?: RuleSource
  __rankMask?: number
  __rarityMask?: number
  __keepUniqueRuleId?: string
  __keepUniqueRuleOrdinal?: number
  __keepUniqueHash?: string
  __keepUniqueRequired?: number
  __keepUniqueScanMs?: number
  __keepUniqueProjected?: number
  __keepUniqueDeficit?: number
  __keepUniqueItemKey?: number
  __keepUniquePlaceholder?: boolean
  __keepUniquePlaceholderMissing?: number
}

// Keep branch metadata separate from the mutable rule object so worker callers
// can serialize generation output for WASM post-processing.
export type GeneratedBranchRuleEntry = {
  rule: HsfRuleWithCfg
  branchOrder: number
  branchSeq: number
  originalIdx: number
}

// Optional post-processor contract used by worker WASM paths.
export type BuildRulesFinalizeGeneratedFn = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}) => HsfRuleWithCfg[]

function expandAutoFlexRarityBranches(cfg: BuilderConfig): BuilderConfig[] {
  // Keep auto-rarity resolution in the existing shared helper.
  const baseRarityCode = resolveAutoRarityCode(cfg)
  // Delegate branch splitting heuristics to wasm for SSOT behavior.
  const branches = expandAutoFlexRarityBranchesWithLoadedWasm({
    config: cfg,
    baseRarityCode,
  })
  // Fail closed when warmup/payload is invalid; do not silently keep one branch.
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('WASM auto-flex rarity expansion returned no branches. Ensure warmupWasmRuleEngine() ran first.')
  }
  return branches
}

export function buildRulesForConfig(params: {
  config: BuilderConfig
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  cfgIdx?: number
}, options?: { limit?: number; onLimit?: () => void; finalizeGeneratedRules?: BuildRulesFinalizeGeneratedFn }): HsfRuleWithCfg[] {
  const { config, metasets, substatTargets, cfgIdx } = params
  // Carry a stable 1-based config identifier through builder → HSF exports.
  const configIdForExport = (typeof cfgIdx === 'number' && Number.isFinite(cfgIdx) && cfgIdx >= 0)
    ? (Math.floor(cfgIdx) + 1)
    : null
  // Expand metasets and remove explicit exclusions before rule generation.
  const resolvedSets = resolveArtifactSetSelections({
    selections: config.artifactSets,
    metasetIds: config.artifactMetaSets,
    metasets,
  })
  // Build a config snapshot with the resolved set IDs only.
  const cfgWithSets: BuilderConfig = {
    ...config,
    // Normalize to include-only entries so the builder sees final set ids.
    artifactSets: resolvedSets.resolved.map((id) => ({ id })),
  }
  try {
    const configsToBuild = expandAutoFlexRarityBranches(cfgWithSets)
    // Capture explicit branch metadata so sorting/finalization is deterministic.
    const generatedEntries: GeneratedBranchRuleEntry[] = []
    configsToBuild.forEach((branch, branchOrder) => {
      const built = buildHsfRules(
        branch,
        substatTargets,
        {
          ...(options?.limit != null ? { limit: options.limit } : {}),
          ...(configIdForExport !== null ? { configId: configIdForExport } : {}),
        },
      )
      built.forEach((rule, seq) => {
        generatedEntries.push({
          rule: rule as HsfRuleWithCfg,
          branchOrder,
          branchSeq: seq,
          originalIdx: generatedEntries.length,
        })
      })
    })
    const applyObsoletePruning = configsToBuild.length <= 1
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
    return finalized.map((rule): HsfRuleWithCfg => ({ ...rule, __source: RULE_SOURCE_HSFC }))
  } catch (error) {
    if (error instanceof RuleLimitReachedError) {
      options?.onLimit?.()
      return []
    }
    throw error
  }
}

export function buildFinalSellRules(finalSellRemainder: FinalSellRemainderConfig | null | undefined): HsfRuleWithCfg[] {
  // Delegate final-sell level/type/set expansion to wasm for SSOT ordering.
  return buildFinalSellRulesWithLoadedWasm({
    finalSellRemainder,
    allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)),
  })
}

export const buildKeepUniqueRules = (
  rules: readonly KeepUniqueRule[],
  detection: KeepUniqueDetectionSnapshot | null,
): HsfRuleWithCfg[] => {
  // Single source of truth: keep-unique keep-rule generation lives in WASM.
  return buildKeepUniqueRulesWithLoadedWasm({
    rules,
    detection,
    configIdBase: KEEP_UNIQUE_CONFIG_ID_BASE,
  })
}

type KeepUniqueMergeParams = {
  baseRules: HsfRuleWithCfg[]
  customRules: HsfRuleWithCfg[]
  finalSellRules: HsfRuleWithCfg[]
  resolvedKeepUniqueRules: readonly KeepUniqueRule[]
  detection: KeepUniqueDetectionSnapshot | null
}

type KeepUniqueMergeResult = {
  baseRules: HsfRuleWithCfg[]
  mergedRules: HsfRuleWithCfg[]
}

// Shared helper: inject keep-unique rules ahead of base/custom/final-sell with duplicate protection.
export function prependKeepUniqueRules({
  baseRules,
  customRules,
  finalSellRules,
  resolvedKeepUniqueRules,
  detection,
}: KeepUniqueMergeParams): KeepUniqueMergeResult {
  // Strip any prior keep-unique injections to avoid double-prepending.
  const baseWithoutKeep = baseRules.filter((rule) => rule.__source !== RULE_SOURCE_KEEP_UNIQUES)
  // Build candidate keep rules from detection snapshot + resolved combinations.
  const candidateKeepRules = detection ? buildKeepUniqueRules(resolvedKeepUniqueRules, detection) : []
  // WASM now owns injected keep-rule dedupe + sorting semantics (SSOT).
  const sortedKeepRules = mergeKeepUniqueInjectedRulesWithLoadedWasm({
    baseRules: baseWithoutKeep,
    customRules,
    candidateKeepRules,
  })
  if (!Array.isArray(sortedKeepRules)) {
    throw new Error('WASM keep-unique injected-rule merge is unavailable. Ensure warmupWasmRuleEngine() ran first.')
  }
  // Keep-unique rules must precede base rules to override.
  const nextBaseRules = sortedKeepRules.concat(baseWithoutKeep)
  const mergedRules: HsfRuleWithCfg[] = [
    ...nextBaseRules,
    ...customRules,
    ...finalSellRules,
  ]
  return { baseRules: nextBaseRules, mergedRules }
}

export function computeMergedRules(params: {
  hsf: HsfFile | null
  customCfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder?: FinalSellRemainderConfig
  prebuiltCustomRules?: ReadonlyMap<number, readonly HsfRuleWithCfg[]>
  keepUniques?: KeepUniquesMergeInput
}): HsfRuleWithCfg[] {
  const { hsf, customCfgs, metasets, substatTargets, finalSellRemainder, prebuiltCustomRules, keepUniques } = params

  // Always strip any foreign/internal fields (e.g., __lineIdx) from base HSF rules
  const baseRaw = hsf?.Rules ?? []
  const base: HsfRuleWithCfg[] = baseRaw.map((r: HsfRule) => ({ ...r, __source: RULE_SOURCE_HSF }))

  // The legacy "All Sets (Explicit)" metaset is removed; use provided metasets only.
  const metasetsEffective: Metaset[] = metasets

  const normalizedTotalLimit = Number.isFinite(TOTAL_RULE_COUNT_LIMIT) && TOTAL_RULE_COUNT_LIMIT > 0
    ? Math.max(1, Math.floor(TOTAL_RULE_COUNT_LIMIT))
    : null
  // Collect custom-rule batches first so wasm can apply the exact total-limit gate.
  const customBatches: HsfRuleWithCfg[][] = []

  if (prebuiltCustomRules) {
    const ordered = Array.from(prebuiltCustomRules.entries())
    ordered.sort((a, b) => a[0] - b[0])
    for (const [, rules] of ordered) {
      customBatches.push(Array.from(rules))
    }
  } else {
    // Fallback: build on demand when no cache is supplied.
    for (let cfgIdx = 0; cfgIdx < customCfgs.length; cfgIdx += 1) {
      const config = customCfgs[cfgIdx]!
      const built = buildRulesForConfig(
        { config, metasets: metasetsEffective, substatTargets, cfgIdx },
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

  // Keep-unique active gate remains in TS so UI toggle semantics stay explicit.
  const keepUniquesInput = hasActiveKeepUniqueRules(keepUniques)
    ? keepUniques
    : null
  // Delegate merged-rule orchestration (+ __lineIdx assignment) to wasm.
  return computeMergedRulesWithLoadedWasm({
    baseRules: base,
    customRules: customs,
    finalSellRemainder: finalSellRemainder ?? null,
    allKnownSetIds: getAllKnownArtifactSetIds().map((id) => Number(id)),
    keepUniqueEnabled: keepUniquesInput != null,
    keepUniqueRules: keepUniquesInput?.rules ?? [],
    keepUniqueDetection: keepUniquesInput?.detection ?? null,
    keepUniqueConfigIdBase: KEEP_UNIQUE_CONFIG_ID_BASE,
  })
}
