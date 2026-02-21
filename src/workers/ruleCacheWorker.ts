/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createRecipeRulesCache, updateRecipeRulesCache, type RecipeRulesCache } from '../lib/ruleCache'
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
import type { RuleCachePipelinePhase, RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveMatchRecipeName } from '../lib/ruleRecipeIndex'
import { fingerprintRuleTesterItem } from '../lib/ruleTesterSession'
import type { RuleTesterItem } from '../lib/ruleTesterSession'
import { fingerprintSafeguardDetection } from '../lib/safeguardFingerprint'
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

type WarmState = {
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
  recipesForRules: BuilderRecipe[]
  fingerprint: string | null
  artifactSignature: string | null
}

let cache = createRecipeRulesCache()
let lastWarmState: WarmState | null = null
// Pipeline generation increments on the app side; worker uses it to ignore stale commits.
let latestPipelineGeneration = 0

// Log the loaded WASM version once per worker so perf transcripts can confirm
// which binary was active during a run.
let wasmVersionLogged = false
let wasmWarmupPromise: Promise<void> | null = null

// Local cache entry tracks both the artifact fingerprint and its cached matcher results.
type CachedArtifactEntry = {
  artifact: NormalizedGearArtifact
  fingerprint: string
  baseMatch: TesterMatchWorkerItemResult | null
  // Signature ties baseMatch to the rule/recipe snapshot it was computed against.
  baseMatchSignature: string | null
  finalMatch: TesterMatchWorkerItemResult | null
  finalMatchSignature: string | null
}

// Cache tester artifacts across pipeline runs so patches can be applied incrementally.
const artifactCache = new Map<number, CachedArtifactEntry>()

const notePipelineGeneration = (generation: number): void => {
  if (generation > latestPipelineGeneration) latestPipelineGeneration = generation
}

const pipelineGenerationIsStale = (generation: number): boolean => generation < latestPipelineGeneration

const cloneArtifactCache = (source: Map<number, CachedArtifactEntry>): Map<number, CachedArtifactEntry> => {
  const next = new Map<number, CachedArtifactEntry>()
  source.forEach((entry, itemId) => {
    // Clone each value so stale runs can never mutate shared cache entries in place.
    next.set(itemId, { ...entry })
  })
  return next
}

const commitArtifactCache = (next: Map<number, CachedArtifactEntry>): void => {
  artifactCache.clear()
  next.forEach((entry, itemId) => artifactCache.set(itemId, entry))
}

const postError = (id: number, error: unknown): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
  self.postMessage(response)
}

const postWarmProgress = (id: number, payload: { completed: number; total: number }): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'warm:progress',
    payload,
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

// Emit lightweight phase markers so perf timelines can break down pipeline stages.
const postPipelinePhase = (
  id: number,
  phase: RuleCachePipelinePhase,
  data?: Record<string, string | number | boolean | null>,
): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'pipeline:phase',
    payload: {
      phase,
      ...(data ? { data } : {}),
    },
  }
  self.postMessage(response)
}

// Warmup is mandatory in WASM mode because generation finalization and matcher
// paths rely on sync wasm calls after initialization.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) {
    wasmWarmupPromise = warmupWasmRuleEngine()
  }
  await wasmWarmupPromise
}

// Worker-only finalizer delegates branch-rule post-processing to wasm.
// Returning null indicates wasm was not initialized, which is treated as fatal.
const finalizeGeneratedRulesForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
  const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
  if (!finalized) {
    throw new Error('WASM rule generation finalizer is unavailable after warmup.')
  }
  return finalized
}

// Builder-count requests are served from the same cache-generation machinery as
// warm/pipeline so wasm-enabled branches measure the same generation path.
const countRulesForRecipesWithWorkerCache = (
  recipes: readonly BuilderRecipe[],
  substatTargets: SubstatTargetTable,
): number[] => {
  const recipesForRules = recipesForRuleBuild(recipes)
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    // Builder-count payload does not include metasets, so we preserve legacy
    // semantics by using an empty list in this fast-count path.
    metasets: [],
    substatTargets,
    // Keep this request independent from warm/pipeline cache state.
    previousCache: createRecipeRulesCache(),
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

const buildBaseMatchSignature = (payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload']): string => {
  // Fingerprint captures recipe order + safeguard rules + final-sell inputs.
  const fingerprint = payload.fingerprint ?? 'null'
  // Recipe modes alter the matcher gate (disabled/separator), so include them too.
  const modes = Array.isArray(payload.recipeModes) ? payload.recipeModes.join('|') : ''
  return `${fingerprint}|modes:${modes}`
}

const buildWarmState = (
  id: number,
  payload: Extract<RuleCacheWorkerRequest, { kind: 'warm' | 'pipeline' }>['payload'],
  options?: { skipProgress?: boolean; fingerprint?: string | null },
): { state: WarmState; mergedRules: HsfRuleWithRecipe[]; nextCache: RecipeRulesCache } => {
  const recipesForRules = recipesForRuleBuild(payload.recipes)
  const baseRuleCount = Array.isArray(payload.hsf?.Rules) ? (payload.hsf?.Rules.length ?? 0) : 0
  let lastProgress = 0
  const emitWarmProgress = options?.skipProgress === true
    ? null
    : createProgressThrottler((progress) => {
      postWarmProgress(id, progress)
    })
  const handleProgress = options?.skipProgress === true
    ? null
    : (progress: { completed: number; total: number }) => {
      // Forward determinate warm progress to the main thread so the single
      // workload indicator stays in sync with heavy merges.
      if (progress.completed === lastProgress) return
      lastProgress = progress.completed
      emitWarmProgress?.(progress)
    }
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    // Reuse the previous warm cache snapshot to avoid rebuilding unchanged branches.
    previousCache: cache,
    baseRuleCount,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
    ...(handleProgress ? { onProgress: handleProgress } : {}),
  })
  // Compute the next cache snapshot but defer committing it until the caller accepts this run.
  const nextCache = result.cache
  const mergedRules = computeMergedRules({
    hsf: payload.hsf,
    customRecipes: recipesForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
    prebuiltCustomRules: result.rulesByRecipe,
    // Keep overrides travel with warm merges so cached rules stay accurate.
    safeguards: payload.safeguards,
  })
  const state: WarmState = {
    rulesByRecipe: result.rulesByRecipe,
    countsByRecipe: result.countsByRecipe,
    keys: result.keys.slice(),
    substatTargetsKey: result.substatTargetsKey,
    truncatedRecipeIndices: result.truncatedRecipeIndices.slice(),
    totalLimitHit: result.totalLimitHit,
    excludedByTotalLimitIndices: result.excludedByTotalLimitIndices.slice(),
    recipesForRules,
    fingerprint: options?.fingerprint ?? null,
    artifactSignature: null,
  }
  return { state, mergedRules, nextCache }
}

const reuseWarmState = (
  fingerprint: string | null | undefined,
  skipWarm: boolean | undefined,
): WarmState | null => {
  if (!lastWarmState) return null
  const fingerprintsMatch = fingerprint != null ? fingerprint === lastWarmState.fingerprint : false
  if (skipWarm && fingerprintsMatch) return lastWarmState
  if (fingerprintsMatch) return lastWarmState
  return null
}

const toWarmResponsePayload = (
  state: WarmState,
  mergedRules: HsfRuleWithRecipe[],
): RuleCacheWorkerResponse => ({
  id: 0,
  kind: 'warm:done',
  payload: {
    rulesByRecipeEntries: Array.from(state.rulesByRecipe.entries()),
    countsByRecipeEntries: Array.from(state.countsByRecipe.entries()),
    keys: state.keys.slice(),
    substatTargetsKey: state.substatTargetsKey,
    mergedRules,
    truncatedRecipeIndices: state.truncatedRecipeIndices.slice(),
    totalLimitHit: state.totalLimitHit,
    excludedByTotalLimitIndices: state.excludedByTotalLimitIndices.slice(),
  },
})

const resolveItemId = (artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
  // Share one resolver with App/ruleEval so id precedence cannot drift.
  return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
}

const fingerprintArtifact = (artifact: NormalizedGearArtifact): string => {
  try {
    const testerPayload = artifact.testerItem as RuleTesterItem | undefined
    // Manual gear always surfaces a tester payload, but keep the function defensive so
    // corrupted payloads simply drop out of the cache.
    return testerPayload ? fingerprintRuleTesterItem(testerPayload) : ''
  } catch {
    return ''
  }
}

// Merge the new artifact into the cache while reusing cached matcher answers whenever
// the fingerprint proves the payload is identical to the last run.
const upsertArtifactCacheEntry = (
  cacheMap: Map<number, CachedArtifactEntry>,
  itemId: number,
  artifact: NormalizedGearArtifact,
): void => {
  const nextFingerprint = fingerprintArtifact(artifact)
  const previous = cacheMap.get(itemId)
  const canReuseMatches = Boolean(previous && previous.fingerprint === nextFingerprint)
  cacheMap.set(itemId, {
    artifact,
    fingerprint: nextFingerprint,
    // Preserve base matches only when the item payload fingerprint matches.
    baseMatch: canReuseMatches ? previous!.baseMatch : null,
    // Keep the signature aligned with the preserved base match.
    baseMatchSignature: canReuseMatches ? previous!.baseMatchSignature : null,
    // Preserve final matches only when the item payload fingerprint matches.
    finalMatch: canReuseMatches ? previous!.finalMatch : null,
    // Carry forward the final-match signature when its payload matches.
    finalMatchSignature: canReuseMatches ? previous!.finalMatchSignature : null,
  })
}

// Convert the cache map to the tuple shape the rest of the pipeline expects.
const artifactEntriesFromCache = (cacheMap: Map<number, CachedArtifactEntry>): Array<[number, NormalizedGearArtifact]> => {
  const entries: Array<[number, NormalizedGearArtifact]> = []
  cacheMap.forEach((entry, itemId) => {
    entries.push([itemId, entry.artifact])
  })
  return entries
}

const buildPipelineMatches = async (
  mergedRules: HsfRuleWithRecipe[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  recipeModes: SellfileExportMode[] | undefined,
  _baseMatchMap: Map<number, TesterMatchWorkerItemResult> | null,
  ignoreSafeguardRecipeIndices: ReadonlySet<number> | null,
  total: number,
  completedRef: { value: number },
  emitProgress: ((progress: { completed: number; total: number }) => void) | null,
  hasSafeguardOverrideRules: boolean,
) : Promise<TesterMatchWorkerItemResult[]> => {
  if (!artifactEntries.length) return []
  // Configure per phase so the WASM state aligns with the current ruleset.
  await configureWasmRuleEngine({
    rules: mergedRules,
    recipeModes: Array.isArray(recipeModes) ? recipeModes : [],
  })
  if (!wasmVersionLogged) {
    await getWasmRuleEngineVersion()
    wasmVersionLogged = true
  }
  // Full matcher pass mirrors evaluateMatchesByRecipe with safeguard
  // precedence options included.
  const fullItems = artifactEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
  const fullResults = await evaluateWasmRuleEngineItems({
    items: fullItems,
    options: {
      ...(ignoreSafeguardRecipeIndices ? { ignoreSafeguardRecipeIndices } : {}),
      ...(hasSafeguardOverrideRules ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES } : {}),
    },
  })
  const fullByItemId = new Map<number, TesterMatchWorkerItemResult>()
  fullResults.forEach((entry) => fullByItemId.set(entry.itemId, entry))
  const results: TesterMatchWorkerItemResult[] = []
  for (const [itemId] of artifactEntries) {
    const fullEval = fullByItemId.get(itemId)
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
  return results
}

// Safeguard candidate detection needs baseline keep/sell decisions with some
// recipes excluded. Batch evaluation avoids per-row JS re-scans in that phase.
const buildExcludedRecipeBaselineMap = async (
  mergedRules: HsfRuleWithRecipe[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  recipeModes: SellfileExportMode[] | undefined,
  excludeRecipeIndices: ReadonlySet<number>,
): Promise<Map<number, TesterMatchWorkerItemResult>> => {
  const byItem = new Map<number, TesterMatchWorkerItemResult>()
  if (!artifactEntries.length || excludeRecipeIndices.size === 0) return byItem
  // Configure with the baseline ruleset so exclude-index evaluation mirrors JS.
  await configureWasmRuleEngine({
    rules: mergedRules,
    recipeModes: Array.isArray(recipeModes) ? recipeModes : [],
  })
  const items = artifactEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
  const evaluated = await evaluateWasmRuleEngineItems({
    items,
    options: { excludeRecipeIndices },
  })
  for (const entry of evaluated) {
    byItem.set(entry.itemId, {
      itemId: entry.itemId,
      firstMatch: entry.firstMatch,
      firstNonExcludedMatch: entry.firstNonExcludedMatch ?? entry.firstMatch,
      matchingRecipeIndices: entry.matchingRecipeIndices,
      matchingRecipeDecisions: entry.matchingRecipeDecisions,
    })
  }
  // Fill any unexpected gaps so downstream row assembly can treat the map as complete.
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
  // WASM mode is fail-closed: if warmup fails we report the error per request.
  try {
    await ensureWasmWorkerReady()
  } catch (error) {
    postError(message.id, error)
    return
  }
  if (message.kind === 'builderCount') {
    const { id, payload } = message
    try {
      // BuilderPanel requests per-recipe rule counts through this fast path so the UI stays responsive.
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

  if (message.kind === 'warm') {
    const { id, payload } = message
    try {
      const { state, mergedRules, nextCache } = buildWarmState(id, payload)
      // Warm requests always commit immediately because they are single-shot cache seeds.
      cache = nextCache
      lastWarmState = state
      const response = toWarmResponsePayload(state, mergedRules)
      response.id = id
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  if (message.kind !== 'pipeline') return
  const { id, payload } = message
  const pipelineGeneration = Number.isFinite(payload.generation) ? Number(payload.generation) : id
  // Record this run as the newest candidate; older runs can only read, never commit.
  notePipelineGeneration(pipelineGeneration)
  const runIsStale = (): boolean => pipelineGenerationIsStale(pipelineGeneration)
  try {
    const reused = reuseWarmState(payload.fingerprint ?? null, payload.skipWarm)
    const builtWarmState = reused
      ? null
      : buildWarmState(
        id,
        payload,
        { skipProgress: true, fingerprint: payload.fingerprint ?? null },
      )
    const warmState = reused ?? builtWarmState!.state
    const pendingCacheCommit = builtWarmState?.nextCache ?? null
    // Pipeline work mutates a local snapshot and only commits if this generation stays current.
    const localArtifactCache = cloneArtifactCache(artifactCache)
    if (payload.resetArtifacts) {
      // Drop any cached tester artifacts so the next detection run cannot reference deleted items.
      localArtifactCache.clear()
    }
    const prebuiltCustomRules = warmState.rulesByRecipe
    // Skip the extra detection/merge work when safeguard overrides are effectively off.
    const hasActiveSafeguards = hasActiveSafeguardRules(payload.safeguards)
    const hasActiveSafeguardOverrides = hasActiveSafeguards
    const baseSafeguards = hasActiveSafeguards
      ? { ...payload.safeguards, detection: null }
      : payload.safeguards
    const recipesForRules = warmState.recipesForRules
    const warmTotal = reused ? 0 : payload.recipes.length
    const needsMatches = payload.skipMatches !== true

    // Base-match results must be tied to the current rule/recipe fingerprint.
    const baseMatchSignature = buildBaseMatchSignature(payload)
    // Track which item ids truly changed so baseline/final matcher caches can stay valid.
    const changedItemIds = new Set<number>()
    if (payload.artifactPatch) {
      for (const [itemId, artifact] of payload.artifactPatch.changed) {
        changedItemIds.add(itemId)
        upsertArtifactCacheEntry(localArtifactCache, itemId, artifact)
      }
      for (const removed of payload.artifactPatch.removed) {
        changedItemIds.add(removed)
        localArtifactCache.delete(removed)
      }
    } else if (payload.artifacts && payload.artifacts.length > 0) {
      localArtifactCache.clear()
      payload.artifacts.forEach((artifact, idx) => {
        const itemId = resolveItemId(artifact, idx)
        changedItemIds.add(itemId)
        upsertArtifactCacheEntry(localArtifactCache, itemId, artifact)
      })
    }
    const artifactEntries: Array<[number, NormalizedGearArtifact]> = (() => {
      if (payload.artifacts && payload.artifacts.length > 0) {
        return payload.artifacts.map((artifact, idx) => [resolveItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
      }
      return artifactEntriesFromCache(localArtifactCache)
    })()
    const needsDetection = needsMatches
      && payload.skipDetection !== true
      && hasActiveSafeguardOverrides
      && artifactEntries.length > 0
    const matchPasses = needsMatches ? (needsDetection ? 2 : 1) : 0
    const total = warmTotal + (artifactEntries.length * matchPasses)
    let completed = warmTotal
    // Throttle progress in the worker itself so the main thread receives far
    // fewer message events during large matcher loops.
    const emitPipelineProgress = total > 0
      ? createProgressThrottler((progress) => {
        postPipelineProgress(id, progress)
      })
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
    })

    // Seed the baseline map with anything we already evaluated so the detection pass only
    // recomputes the rows the patch touched.
    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    localArtifactCache.forEach((entry, itemId) => {
      // Reuse cached base matches only when the signature still aligns.
      if (!entry.baseMatch) return
      // Skip stale base matches when recipes/reordering changed.
      if (entry.baseMatchSignature !== baseMatchSignature) return
      baselineMatchMap.set(itemId, entry.baseMatch)
    })
    if (needsDetection) {
      // Baseline phase: refresh missing base matches so detection can reuse them.
      postPipelinePhase(id, 'baseline:start', { total: artifactEntries.length })
      // Only dispatch match jobs for artifacts whose baseline is missing or stale.
      const missingEntries = artifactEntries.filter(([itemId]) => !baselineMatchMap.has(itemId))
      const cachedCount = artifactEntries.length - missingEntries.length
      if (cachedCount > 0 && total > 0) {
        const cachedCompleted = warmTotal + cachedCount
        completed = cachedCompleted
        emitPipelineProgress?.({ completed: cachedCompleted, total })
      }
      if (missingEntries.length > 0) {
        const baseProgressRef = { value: warmTotal + cachedCount }
        const baseMatchResults = await buildPipelineMatches(
          mergedRulesBaseline,
          missingEntries,
          payload.recipeModes,
          null,
          null,
          total,
          baseProgressRef,
          emitPipelineProgress,
          hasActiveSafeguardOverrides,
        )
        if (runIsStale()) return
        for (const result of baseMatchResults) {
          baselineMatchMap.set(result.itemId, result)
          const cached = localArtifactCache.get(result.itemId)
          if (cached) cached.baseMatch = result
          if (cached) cached.baseMatchSignature = baseMatchSignature
        }
        completed = baseProgressRef.value
      } else {
        completed = warmTotal + cachedCount
      }
      // Baseline phase complete: report cached vs recomputed counts.
      postPipelinePhase(id, 'baseline:done', { missing: missingEntries.length, cached: cachedCount })
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

    // Precompute ignored recipes so matcher precedence can reuse the set.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    // Candidate detection uses this baseline when ignored recipes are excluded.
    const filteredBaselineMatchMap = (needsDetection && ignoreSafeguardRecipeIndices.size > 0)
      ? await buildExcludedRecipeBaselineMap(
        mergedRulesBaseline,
        artifactEntries,
        payload.recipeModes,
        ignoreSafeguardRecipeIndices,
      )
      : null
    if (runIsStale()) return
    // Keep detection optional so we only pay for it when needed.
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    // Only compute detection when the caller requested safeguard-override scanning.
    if (needsDetection) {
      // Detection phase: collect candidate groups + compute safeguard-override snapshots.
      postPipelinePhase(id, 'detection:start', {
        artifacts: artifactEntries.length,
        safeguardRules: payload.safeguards.rules.length,
      })
      // Build a row list that mirrors the preview matcher inputs.
      const rows = artifactEntries.map(([itemId, artifact]) => {
        // Reuse cached baseline matches to avoid re-evaluating base rules.
        const match = filteredBaselineMatchMap?.get(itemId) ?? baselineMatchMap.get(itemId)
        return {
          // Keep the raw artifact for candidate generation.
          artifact,
          // Detection ignores final matches; seed with null.
          match: null,
          // Provide a base match so detection can respect existing keep/sell results.
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          // Carry baseline recipe index sets to keep candidate math stable.
          matchingRecipeIndices: match?.matchingRecipeIndices ?? [],
          // Carry baseline recipe decisions for safeguard precedence checks.
          matchingRecipeDecisions: match?.matchingRecipeDecisions ?? [],
        }
      })
      // Run collect + detection together so wasm owns the full safeguard pass.
      const combinedDetection = collectAndComputeSafeguardProtection({
        // Use the prebuilt rows for stable snapshotting.
        rows,
        // Candidate generation depends on the base (non-safeguard) rules.
        baseRules: mergedRulesBaseline,
        // Recipe modes gate which rules can claim a candidate.
        recipeModes: payload.recipeModes,
        // Supply the active safeguard rules for detection scoring.
        rules: payload.safeguards.rules,
        // Respect the safeguard enabled toggle.
        enabled: payload.safeguards.enabled,
        // Pre-filtered baseline matches already exclude ignored recipes.
        ...(filteredBaselineMatchMap ? {} : { ignoreSafeguardRecipeIndices }),
      })
      // Safeguards snapshot drives rule injection + UI counts downstream.
      safeguardDetectionSnapshot = combinedDetection.detection
      // Detection phase complete: surface the candidate + entry counts.
      postPipelinePhase(id, 'detection:done', {
        candidates: combinedDetection.candidates.candidates.length,
        safeguardEntries: safeguardDetectionSnapshot?.entries.length ?? 0,
      })
    }

    // Build the final merged rules with safeguard-override injections if active.
    const mergedRulesFinal = computeMergedRules({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      // If safeguards is active, pass the detection snapshot through.
      safeguards: baseSafeguards
        ? {
          // Reuse the existing safeguard payload.
          ...payload.safeguards,
          // Inject the latest detection data.
          detection: safeguardDetectionSnapshot,
        }
        : payload.safeguards,
    })
    // Final-match cache needs to know both the rule fingerprint and the detection outcome.
    // When either changes we fall back to recomputing the affected entries.
    const detectionSignature = fingerprintSafeguardDetection(safeguardDetectionSnapshot)
    // Compose a signature that invalidates caches on any detection change.
    const finalMatchSignature = [
      payload.fingerprint ?? 'null',
      detectionSignature ?? 'none',
    ].join('|')
    // Collect final match rows in worker order for the response payload.
    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      // Collect artifacts that need full evaluation (cache misses or invalidated entries).
      const pendingEntries: Array<[number, NormalizedGearArtifact]> = []
      for (const [itemId, artifact] of artifactEntries) {
        const cached = localArtifactCache.get(itemId)
        const reusable = Boolean(
          cached
          && cached.finalMatch
          && cached.finalMatchSignature === finalMatchSignature
          && !changedItemIds.has(itemId),
        )
        if (reusable) {
          matches.push(cached!.finalMatch!)
          continue
        }
        pendingEntries.push([itemId, artifact])
      }
      // Emit the final stage marker so perf timelines can isolate match evaluation.
      postPipelinePhase(id, 'final:start', {
        pending: pendingEntries.length,
        cached: artifactEntries.length - pendingEntries.length,
        fastPath: false,
        safeguardOverrideRules: hasActiveSafeguardOverrides ? 1 : 0,
      })
      if (pendingEntries.length > 0) {
        const pendingProgressRef = { value: completed }
        const pendingMatches = await buildPipelineMatches(
          mergedRulesFinal,
          pendingEntries,
          payload.recipeModes,
          null,
          ignoreSafeguardRecipeIndices,
          total,
          pendingProgressRef,
          emitPipelineProgress,
          hasActiveSafeguardOverrides,
        )
        if (runIsStale()) return
        // Append each full-eval match and refresh the cache.
        for (const match of pendingMatches) {
          // Push the result into the output list.
          matches.push(match)
          // Update the cached match for this artifact.
          const cached = localArtifactCache.get(match.itemId)
          if (cached) {
            // Store the final match for reuse.
            cached.finalMatch = match
            // Save the signature so the cache knows when it is valid.
            cached.finalMatchSignature = finalMatchSignature
          }
        }
        // Sync completed with the final progress snapshot.
        completed = pendingProgressRef.value
      } else if (total > 0 && completed < total) {
        // Ensure progress reaches 100% when no work is pending.
        completed = total
        // Emit the final progress update for the UI.
        emitPipelineProgress?.({ completed, total })
      }
      // Final phase complete: surface how many matches were produced.
      postPipelinePhase(id, 'final:done', { matches: matches.length })
    } else {
      localArtifactCache.forEach((entry) => {
        entry.finalMatch = null
        entry.finalMatchSignature = null
      })
    }

    // Never let stale generations mutate shared worker cache state.
    if (runIsStale()) return

    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'pipeline:done',
      payload: {
        rulesByRecipeEntries: Array.from(prebuiltCustomRules.entries()),
        countsByRecipeEntries: Array.from(warmState.countsByRecipe.entries()),
        keys: warmState.keys.slice(),
        substatTargetsKey: warmState.substatTargetsKey,
        mergedRules: mergedRulesFinal,
        truncatedRecipeIndices: warmState.truncatedRecipeIndices.slice(),
        totalLimitHit: warmState.totalLimitHit,
        excludedByTotalLimitIndices: warmState.excludedByTotalLimitIndices.slice(),
        matches,
        // Safeguard detection snapshot drives Safeguards tab + merges.
        safeguardDetection: safeguardDetectionSnapshot,
        fingerprint: payload.fingerprint ?? null,
        artifactSignature: payload.artifactPatch?.signature ?? payload.artifactSignature ?? null,
      },
    }
    // Commit cache state only when this run is still the latest generation.
    if (pendingCacheCommit) cache = pendingCacheCommit
    commitArtifactCache(localArtifactCache)
    // Update warm cache so subsequent requests can skip redundant work.
    lastWarmState = {
      ...warmState,
      fingerprint: payload.fingerprint ?? null,
      artifactSignature: payload.artifactPatch?.signature ?? payload.artifactSignature ?? null,
    }
    self.postMessage(response)
  } catch (error) {
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
