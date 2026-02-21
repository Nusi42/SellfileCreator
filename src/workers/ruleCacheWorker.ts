/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { updateRecipeRulesCache } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_SAFEGUARDS,
  computeMergedRules,
} from '../lib/merge'
import { recipesForRuleBuild } from '../lib/ruleCacheHelpers'
import type { EvalResult } from '../lib/ruleEval'
import {
  buildIgnoreSafeguardRecipeIndices,
  collectAndComputeSafeguardProtection,
  hasActiveSafeguardRules,
  resolveSafeguardRuleLabel,
} from '../lib/safeguards'
import type { SafeguardDetectionSnapshot } from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
import type { TesterPreviewMatch } from '../types/testerPreview'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveMatchRecipeName } from '../lib/ruleRecipeIndex'
import { resolveArtifactItemIdWithFallback } from '../lib/itemIdentity'
import {
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmRuleEngineVersion,
  warmupWasmRuleEngine,
} from '../lib/wasm/wasmRuleEngine'
import { createProgressThrottler } from '../types/progress'

declare const self: DedicatedWorkerGlobalScope

type PipelineState = {
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
  recipesForRules: BuilderRecipe[]
}

// Pipeline generation increments on the app side; worker drops stale runs.
let latestPipelineGeneration = 0
// Log the loaded WASM version once per worker for transcript parity.
let wasmVersionLogged = false
let wasmWarmupPromise: Promise<void> | null = null

// Batch evaluate so long matcher passes yield between chunks.
const PIPELINE_MATCH_BATCH_SIZE = 256 as const
// Cap progress chatter so postMessage overhead stays bounded.
const PIPELINE_PROGRESS_MAX_EVENTS = 16 as const

// Yield one macrotask turn so queued worker messages can advance generation.
const yieldWorkerMacrotask = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    self.setTimeout(() => resolve(), 0)
  })
}

const notePipelineGeneration = (generation: number): void => {
  if (generation > latestPipelineGeneration) latestPipelineGeneration = generation
}

const pipelineGenerationIsStale = (generation: number): boolean => generation < latestPipelineGeneration

const postError = (id: number, error: unknown): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
  self.postMessage(response)
}

const postPipelineProgress = (id: number, payload: { completed: number; total: number }): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'pipeline:progress',
    payload,
  }
  self.postMessage(response)
}

// Warmup is mandatory because configure/evaluate run through loaded wasm state.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) wasmWarmupPromise = warmupWasmRuleEngine()
  await wasmWarmupPromise
}

// Worker-only finalizer delegates branch-rule post-processing to wasm.
const finalizeGeneratedRulesForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
  const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
  if (!finalized) {
    throw new Error('WASM rule generation finalizer is unavailable after warmup.')
  }
  return finalized
}

// Builder-count requests use the same generation path as pipeline requests.
const countRulesForRecipesWithWorkerCache = (
  recipes: readonly BuilderRecipe[],
  substatTargets: SubstatTargetTable,
): number[] => {
  const recipesForRules = recipesForRuleBuild(recipes)
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    // Builder-count payload does not include metasets in this call path.
    metasets: [],
    substatTargets,
    // Count badges are per-recipe and should not be clipped by total limits.
    totalLimit: Number.POSITIVE_INFINITY,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
  })
  const counts: number[] = []
  for (let idx = 0; idx < recipesForRules.length; idx += 1) {
    counts.push(result.countsByRecipe.get(idx) ?? 0)
  }
  return counts
}

const buildPipelineState = (
  payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload'],
): { state: PipelineState } => {
  const recipesForRules = recipesForRuleBuild(payload.recipes)
  const baseRuleCount = Array.isArray(payload.hsf?.Rules) ? (payload.hsf?.Rules.length ?? 0) : 0
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    baseRuleCount,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
  })
  const state: PipelineState = {
    rulesByRecipe: result.rulesByRecipe,
    countsByRecipe: result.countsByRecipe,
    keys: result.keys.slice(),
    substatTargetsKey: result.substatTargetsKey,
    truncatedRecipeIndices: result.truncatedRecipeIndices.slice(),
    totalLimitHit: result.totalLimitHit,
    excludedByTotalLimitIndices: result.excludedByTotalLimitIndices.slice(),
    recipesForRules,
  }
  return { state }
}

const resolveItemId = (artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
  // Share one resolver with App/ruleEval so id precedence cannot drift.
  return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
}

const buildPipelineMatches = async (
  mergedRules: HsfRuleWithRecipe[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  recipeModes: SellfileExportMode[] | undefined,
  ignoreSafeguardRecipeIndices: ReadonlySet<number> | null,
  total: number,
  completedRef: { value: number },
  emitProgress: ((progress: { completed: number; total: number }) => void) | null,
  hasSafeguardOverrideRules: boolean,
  shouldAbort: (() => boolean) | null,
) : Promise<TesterMatchWorkerItemResult[]> => {
  if (!artifactEntries.length) return []
  // Configure for this matcher pass; no signature-based configure cache is used.
  await configureWasmRuleEngine({
    rules: mergedRules,
    recipeModes: Array.isArray(recipeModes) ? recipeModes : [],
  })
  if (!wasmVersionLogged) {
    await getWasmRuleEngineVersion()
    wasmVersionLogged = true
  }
  if (shouldAbort?.()) return []
  // Full matcher pass mirrors evaluateMatchesByRecipe semantics.
  const evaluateOptions = {
    ...(ignoreSafeguardRecipeIndices ? { ignoreSafeguardRecipeIndices } : {}),
    ...(hasSafeguardOverrideRules ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES } : {}),
  }
  const results: TesterMatchWorkerItemResult[] = []
  for (let start = 0; start < artifactEntries.length; start += PIPELINE_MATCH_BATCH_SIZE) {
    if (shouldAbort?.()) return results
    const end = Math.min(start + PIPELINE_MATCH_BATCH_SIZE, artifactEntries.length)
    const batchEntries = artifactEntries.slice(start, end)
    const batchItems = batchEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
    const batchResults = await evaluateWasmRuleEngineItems({
      items: batchItems,
      options: evaluateOptions,
    })
    if (shouldAbort?.()) return results
    const batchByItemId = new Map<number, TesterMatchWorkerItemResult>()
    batchResults.forEach((entry) => batchByItemId.set(entry.itemId, entry))
    for (const [itemId] of batchEntries) {
      const fullEval = batchByItemId.get(itemId)
      if (!fullEval) continue
      results.push({
        itemId,
        firstMatch: fullEval.firstMatch,
        firstNonExcludedMatch: (
          fullEval.firstNonExcludedMatch
          ?? fullEval.firstMatch
          ?? null
        ),
        matchingRecipeIndices: fullEval.matchingRecipeIndices,
        matchingRecipeDecisions: fullEval.matchingRecipeDecisions,
      })
      if (!emitProgress) continue
      completedRef.value += 1
      emitProgress({ completed: completedRef.value, total })
    }
    // Yield so superseding pipeline messages can update generation state.
    if (end < artifactEntries.length) await yieldWorkerMacrotask()
  }
  return results
}

// Safeguard detection needs baseline keep/sell decisions with ignored recipes excluded.
const buildExcludedRecipeBaselineMap = async (
  mergedRules: HsfRuleWithRecipe[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  recipeModes: SellfileExportMode[] | undefined,
  excludeRecipeIndices: ReadonlySet<number>,
  shouldAbort: (() => boolean) | null,
): Promise<Map<number, TesterMatchWorkerItemResult>> => {
  const byItem = new Map<number, TesterMatchWorkerItemResult>()
  if (!artifactEntries.length || excludeRecipeIndices.size === 0) return byItem
  await configureWasmRuleEngine({
    rules: mergedRules,
    recipeModes: Array.isArray(recipeModes) ? recipeModes : [],
  })
  if (shouldAbort?.()) return byItem
  for (let start = 0; start < artifactEntries.length; start += PIPELINE_MATCH_BATCH_SIZE) {
    if (shouldAbort?.()) return byItem
    const end = Math.min(start + PIPELINE_MATCH_BATCH_SIZE, artifactEntries.length)
    const batchEntries = artifactEntries.slice(start, end)
    const batchItems = batchEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
    const evaluated = await evaluateWasmRuleEngineItems({
      items: batchItems,
      options: { excludeRecipeIndices },
    })
    if (shouldAbort?.()) return byItem
    for (const entry of evaluated) {
      byItem.set(entry.itemId, {
        itemId: entry.itemId,
        firstMatch: entry.firstMatch,
        firstNonExcludedMatch: entry.firstNonExcludedMatch ?? entry.firstMatch,
        matchingRecipeIndices: entry.matchingRecipeIndices,
        matchingRecipeDecisions: entry.matchingRecipeDecisions,
      })
    }
    if (end < artifactEntries.length) await yieldWorkerMacrotask()
  }
  // Fill any unexpected gaps so downstream assembly can treat the map as complete.
  for (const [itemId] of artifactEntries) {
    if (byItem.has(itemId)) continue
    byItem.set(itemId, {
      itemId,
      firstMatch: null,
      firstNonExcludedMatch: null,
      matchingRecipeIndices: [],
      matchingRecipeDecisions: [],
    })
  }
  return byItem
}

self.onmessage = async (event: MessageEvent<RuleCacheWorkerRequest>) => {
  const message = event.data
  if (!message) return
  try {
    await ensureWasmWorkerReady()
  } catch (error) {
    postError(message.id, error)
    return
  }

  if (message.kind === 'builderCount') {
    const { id, payload } = message
    try {
      const counts = countRulesForRecipesWithWorkerCache(payload.recipes, payload.substatTargets)
      const response: RuleCacheWorkerResponse = {
        id,
        kind: 'builderCount:done',
        payload: { counts },
      }
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  if (message.kind !== 'pipeline') return
  const { id, payload } = message
  const pipelineGeneration = Number.isFinite(payload.generation) ? Number(payload.generation) : id
  notePipelineGeneration(pipelineGeneration)
  const runIsStale = (): boolean => pipelineGenerationIsStale(pipelineGeneration)

  try {
    const { state: pipelineState } = buildPipelineState(payload)
    const prebuiltCustomRules = pipelineState.rulesByRecipe
    const hasActiveSafeguards = hasActiveSafeguardRules(payload.safeguards)
    const baseSafeguards = hasActiveSafeguards
      ? { ...payload.safeguards, detection: null }
      : payload.safeguards
    const recipesForRules = pipelineState.recipesForRules
    const warmTotal = payload.recipes.length
    const artifactEntries: Array<[number, NormalizedGearArtifact]> = payload.artifacts
      .map((artifact, idx) => [resolveItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
    const needsDetection = hasActiveSafeguards && artifactEntries.length > 0
    // Detection uses one matcher pass; final rows use one matcher pass.
    const matchPasses = (needsDetection ? 1 : 0) + 1
    const total = warmTotal + (artifactEntries.length * matchPasses)
    let completed = warmTotal
    const emitProgressEvents = payload.emitProgressEvents !== false
    const emitPipelineProgress = (emitProgressEvents && total > 0)
      ? createProgressThrottler((progress) => {
        postPipelineProgress(id, progress)
      }, { maxEvents: PIPELINE_PROGRESS_MAX_EVENTS })
      : null
    if (total > 0 && completed > 0) emitPipelineProgress?.({ completed, total })

    const mergedRulesBaseline = computeMergedRules({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      safeguards: baseSafeguards,
      // Apply app-level transforms before safeguard detection/injection.
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
    })

    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    if (needsDetection) {
      const baseProgressRef = { value: warmTotal }
      const baseMatchResults = await buildPipelineMatches(
        mergedRulesBaseline,
        artifactEntries,
        payload.recipeModes,
        null,
        total,
        baseProgressRef,
        emitPipelineProgress,
        hasActiveSafeguards,
        runIsStale,
      )
      if (runIsStale()) return
      for (const result of baseMatchResults) baselineMatchMap.set(result.itemId, result)
      completed = baseProgressRef.value
    } else {
      completed = warmTotal
    }

    const toPreviewMatch = (result: EvalResult | null, rules: HsfRuleWithRecipe[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const recipeIdx = result.recipeIdx ?? null
      const recipeName = resolveMatchRecipeName(recipeIdx, null, rule)
      const safeguardLabel = rule?.__source === RULE_SOURCE_SAFEGUARDS
        ? resolveSafeguardRuleLabel(rule)
        : null
      const effectiveRecipeName = recipeName && recipeName.length > 0
        ? recipeName
        : safeguardLabel
      return {
        ruleIndex: result.ruleIndex,
        keep: result.keep,
        recipeIdx,
        recipeName: effectiveRecipeName && effectiveRecipeName.length > 0 ? effectiveRecipeName : null,
        ruleLabel: safeguardLabel ?? null,
        ruleSource: rule?.__source ?? null,
      }
    }

    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const filteredBaselineMatchMap = (needsDetection && ignoreSafeguardRecipeIndices.size > 0)
      ? await buildExcludedRecipeBaselineMap(
        mergedRulesBaseline,
        artifactEntries,
        payload.recipeModes,
        ignoreSafeguardRecipeIndices,
        runIsStale,
      )
      : null
    if (runIsStale()) return

    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    if (needsDetection) {
      const rows = artifactEntries.map(([itemId, artifact]) => {
        const match = filteredBaselineMatchMap?.get(itemId) ?? baselineMatchMap.get(itemId)
        return {
          artifact,
          match: null,
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          matchingRecipeIndices: match?.matchingRecipeIndices ?? [],
          matchingRecipeDecisions: match?.matchingRecipeDecisions ?? [],
        }
      })
      const combinedDetection = collectAndComputeSafeguardProtection({
        rows,
        baseRules: mergedRulesBaseline,
        recipeModes: payload.recipeModes,
        rules: payload.safeguards.rules,
        enabled: payload.safeguards.enabled,
        ...(filteredBaselineMatchMap ? {} : { ignoreSafeguardRecipeIndices }),
      })
      safeguardDetectionSnapshot = combinedDetection.detection
    }

    const mergedRulesFinal = computeMergedRules({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      safeguards: {
        ...payload.safeguards,
        detection: safeguardDetectionSnapshot,
      },
      // Keep final matcher output aligned with baseline transformed rules.
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
    })

    const finalProgressRef = { value: completed }
    const matches = await buildPipelineMatches(
      mergedRulesFinal,
      artifactEntries,
      payload.recipeModes,
      ignoreSafeguardRecipeIndices,
      total,
      finalProgressRef,
      emitPipelineProgress,
      hasActiveSafeguards,
      runIsStale,
    )
    if (runIsStale()) return

    if (total > 0 && finalProgressRef.value < total) {
      finalProgressRef.value = total
      emitPipelineProgress?.({ completed: total, total })
    }

    if (runIsStale()) return

    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'pipeline:done',
      payload: {
        rulesByRecipeEntries: Array.from(prebuiltCustomRules.entries()),
        countsByRecipeEntries: Array.from(pipelineState.countsByRecipe.entries()),
        keys: pipelineState.keys.slice(),
        substatTargetsKey: pipelineState.substatTargetsKey,
        mergedRules: mergedRulesFinal,
        truncatedRecipeIndices: pipelineState.truncatedRecipeIndices.slice(),
        totalLimitHit: pipelineState.totalLimitHit,
        excludedByTotalLimitIndices: pipelineState.excludedByTotalLimitIndices.slice(),
        matches,
        safeguardDetection: safeguardDetectionSnapshot,
      },
    }
    self.postMessage(response)
  } catch (error) {
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
