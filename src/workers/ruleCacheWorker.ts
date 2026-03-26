/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  type MergedRulesComponents,
} from '../lib/merge'
import { recipesForRuleBuild } from '../lib/ruleCacheHelpers'
import {
  buildIgnoreSafeguardRecipeIndices,
  evaluateAndCollectSafeguardProtection,
  hasActiveSafeguardRules,
  storeArtifactRows,
} from '../lib/safeguards'
import type { SafeguardDetectionSnapshot } from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { GearInspectorMatchWorkerItemResult } from './gearInspectorMatchWorkerTypes'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveArtifactItemIdWithFallback } from '../lib/itemIdentity'
import {
  computeUpgradeChanceWithLoadedWasm,
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmRuleEngineVersion,
  warmupWasmRuleEngine,
} from '../lib/wasm/wasmRuleEngine'
import type { UpgradeChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
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
// Persistent rule cache: fingerprint → built rules. Reused across pipeline runs
// so unchanged recipes skip the WASM buildRulesForRecipe call entirely.
const persistentRuleCache = new Map<string, RecipeRulesCacheEntry>()

// Batch evaluate so long matcher passes yield between chunks; progress is
// emitted once per batch (not per artifact) to bound Firefox postMessage overhead.
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
    rulesCache: persistentRuleCache,
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
    rulesCache: persistentRuleCache,
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
) : Promise<GearInspectorMatchWorkerItemResult[]> => {
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
  const results: GearInspectorMatchWorkerItemResult[] = []
  for (let start = 0; start < artifactEntries.length; start += PIPELINE_MATCH_BATCH_SIZE) {
    if (shouldAbort?.()) return results
    const end = Math.min(start + PIPELINE_MATCH_BATCH_SIZE, artifactEntries.length)
    const batchEntries = artifactEntries.slice(start, end)
    const batchItems = batchEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.gearInspectorItem }))
    const batchResults = await evaluateWasmRuleEngineItems({
      items: batchItems,
      options: evaluateOptions,
    })
    if (shouldAbort?.()) return results
    const batchByItemId = new Map<number, GearInspectorMatchWorkerItemResult>()
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
    }
    // Emit progress once per batch rather than per artifact so the throttler
    // is not called thousands of times on large DBs — the primary Firefox slowdown.
    if (emitProgress) {
      completedRef.value += batchEntries.length
      emitProgress({ completed: completedRef.value, total })
    }
    // Yield so superseding pipeline messages can update generation state.
    if (end < artifactEntries.length) await yieldWorkerMacrotask()
  }
  return results
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

    // Build base + flattened-customs once; both baseline and final merged-rules
    // calls reuse this to skip the redundant WASM flattenRuleBatches step.
    const sharedComponents: MergedRulesComponents = buildMergedRulesComponents({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      prebuiltCustomRules,
    })
    const mergeParams = {
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
    }

    const mergedRulesBaseline = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: baseSafeguards,
    })

    // ignoreSafeguardRecipeIndices is needed by both detection and final passes.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const baselineMatchMap = new Map<number, GearInspectorMatchWorkerItemResult>()
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    // Populated inside needsDetection branch when payload.computeUpgradeChance is true.
    let upgradeChanceEntries: UpgradeChanceWasmEntry[] | null = null
    if (needsDetection) {
      // Configure baseline rules so the combined WASM evaluate+collect call uses them.
      await configureWasmRuleEngine({
        rules: mergedRulesBaseline,
        recipeModes: Array.isArray(payload.recipeModes) ? payload.recipeModes : [],
      })
      if (!wasmVersionLogged) {
        await getWasmRuleEngineVersion()
        wasmVersionLogged = true
      }
      if (runIsStale()) return
      // Build detection rows — artifact (including gearInspectorItem) per item.
      // Rows are stored in WASM state so the combined call avoids re-deserializing
      // the artifact table on every detection pass.
      const detectionRows = artifactEntries.map(([, artifact]) => ({
        artifact,
        match: null,
        baseMatch: null,
        matchingRecipeIndices: [],
        matchingRecipeDecisions: [],
      }))
      storeArtifactRows(detectionRows)
      // Pass baselineExcludeSources so keep-override sources are excluded from the
      // safeguard base-match the same way as the regular evaluate pass.
      const detectionOptions = hasActiveSafeguards
        ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES }
        : undefined
      // Artifacts are extracted from detectionRows for equippedFloorScore computation.
      // The WASM engine reads stored rows directly — no rows param needed here.
      const detectionResult = evaluateAndCollectSafeguardProtection({
        artifacts: artifactEntries.map(([, artifact]) => artifact),
        ...(detectionOptions ? { options: detectionOptions } : {}),
        rules: payload.safeguards.rules,
        enabled: payload.safeguards.enabled,
        ignoreSafeguardRecipeIndices,
      })
      if (runIsStale()) return
      // Populate baseline match map from per-item evaluation results.
      for (const entry of detectionResult.evaluateResults) {
        baselineMatchMap.set(entry.itemId, {
          itemId: entry.itemId,
          firstMatch: entry.firstMatch,
          firstNonExcludedMatch: (entry.firstNonExcludedMatch ?? entry.firstMatch ?? null),
          matchingRecipeIndices: entry.matchingRecipeIndices,
          matchingRecipeDecisions: entry.matchingRecipeDecisions,
        })
      }
      safeguardDetectionSnapshot = detectionResult.detection
      // Compute improvement-chance percentages in WASM while stored_rows are still fresh.
      // Gated on the caller opt-in flag; skipped when safeguards are off (needsDetection already
      // ensures safeguards.enabled && rules.length > 0 && artifacts.length > 0).
      if (payload.computeUpgradeChance) {
        upgradeChanceEntries = computeUpgradeChanceWithLoadedWasm({
          rules: payload.safeguards.rules,
          enabled: payload.safeguards.enabled,
        })
        if (runIsStale()) return
      }
      completed = warmTotal + artifactEntries.length
      emitPipelineProgress?.({ completed, total })
    } else {
      completed = warmTotal
    }

    // Use shared components so flattenRuleBatches is not called a second time.
    const mergedRulesFinal = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: {
        ...payload.safeguards,
        detection: safeguardDetectionSnapshot,
      },
    })

    // Optimisation: when detection found nothing to protect (no injected safeguard
    // rules), the final merged rules are functionally identical to baseline and the
    // baseline match map is already authoritative. Skip the second O(N×M) scan.
    const detectionFoundNothing = safeguardDetectionSnapshot != null
      && safeguardDetectionSnapshot.entries.length === 0
    let matches: GearInspectorMatchWorkerItemResult[]
    if (needsDetection && detectionFoundNothing) {
      // Copy results from the baseline map in artifact order.
      matches = artifactEntries.map(([itemId]) => baselineMatchMap.get(itemId) ?? {
        itemId,
        firstMatch: null,
        firstNonExcludedMatch: null,
        matchingRecipeIndices: [],
        matchingRecipeDecisions: [],
      })
      if (total > 0) {
        emitPipelineProgress?.({ completed: total, total })
      }
    } else {
      const finalProgressRef = { value: completed }
      matches = await buildPipelineMatches(
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
        upgradeChanceEntries,
      },
    }
    self.postMessage(response)
  } catch (error) {
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
