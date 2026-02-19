import { useCallback, useEffect, useMemo, useRef } from 'react'
import { updateRecipeRulesCache, createRecipeRulesCache, type RecipeRulesCache } from '../lib/ruleCache'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_SAFEGUARDS,
  computeMergedRules,
} from '../lib/merge'
import { recipesForRuleBuild, countRulesForRecipes } from '../lib/ruleCacheHelpers'
import type { RuleCachePipelinePhase, RuleCacheWorkerRequest, RuleCacheWorkerResponse } from '../workers/ruleCacheWorkerTypes'
import RuleCacheWorker from '../workers/ruleCacheWorker?worker&inline'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import {
  buildIgnoreSafeguardRecipeIndices,
  collectAndComputeSafeguardProtection,
  hasActiveSafeguardRules,
  resolveSafeguardRuleLabel,
  type SafeguardDetectionSnapshot,
  type SafeguardsMergeInput,
} from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import { evaluateMatchesByRecipe } from '../lib/ruleEval'
import type { TesterMatchWorkerItemResult } from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { createProgressThrottler } from '../types/progress'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { resolveMatchRecipeName } from '../lib/ruleRecipeIndex'
import { PERF_EVENTS, markPerfEvent } from '../lib/perfTimeline'
import { warmupWasmRuleEngine } from '../lib/wasm/wasmRuleEngine'

type WarmCacheParams = {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  hsf: HsfFile | null
  finalSellRemainder?: FinalSellRemainderConfig
  // Safeguards state feeds rule injection during warm merges.
  safeguards: SafeguardsMergeInput
}

type PipelineParams = WarmCacheParams & {
  recipeModes: SellfileExportMode[]
  artifacts: NormalizedGearArtifact[]
  artifactSignature?: string | null
  artifactPatch?: {
    changed: Array<[number, NormalizedGearArtifact]>
    removed: number[]
    signature: string | null
  }
  // Explicit worker cache purge when artifacts disappear so safeguard detection cannot reuse stale entries.
  resetArtifacts?: boolean
  fingerprint?: string | null
  skipWarm?: boolean
  skipMatches?: boolean
  skipDetection?: boolean
}

// Merge exports still use the legacy rule type name; keep a local recipe-first alias in this hook.
type HsfRuleWithRecipe = ReturnType<typeof computeMergedRules>[number]

type RuleCacheStateSnapshot = {
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  mergedRules: HsfRuleWithRecipe[]
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

type WarmCacheResult = {
  state: RuleCacheStateSnapshot
}

type PipelineResult = {
  state: RuleCacheStateSnapshot
  matches: TesterMatchWorkerItemResult[]
  // Safeguard detection snapshot for the Safeguards tab.
  safeguardDetection: SafeguardDetectionSnapshot | null
  fingerprint: string | null
  artifactSignature: string | null
}

type CountRulesParams = {
  recipes: readonly BuilderRecipe[]
  substatTargets: SubstatTargetTable
}

type PendingRequest<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

// Pending warm requests need to remember attached progress handlers so we can forward worker updates.
type PendingWarmRequest = PendingRequest<WarmCacheResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingPipelineRequest = PendingRequest<PipelineResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingCountRequest = PendingRequest<number[]>
type PipelineProgressHandler = (progress: ProgressSnapshot) => void
type ActivePipelineRun = {
  signature: string | null
  promise: Promise<PipelineResult>
  abort: () => void
}
type QueuedPipelineRun = {
  signature: string | null
  params: PipelineParams
  onProgress?: PipelineProgressHandler
  resolve: (value: PipelineResult) => void
  reject: (reason?: unknown) => void
  promise: Promise<PipelineResult>
}

type UseRuleCacheWorkerResult = {
  warmCache: (params: WarmCacheParams, options?: { signal?: AbortSignal; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<WarmCacheResult>
  runPipeline: (params: PipelineParams, options?: { signal?: AbortSignal; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<PipelineResult>
  countRules: (params: CountRulesParams, options?: { signal?: AbortSignal }) => Promise<number[]>
  flush: () => Promise<void>
  supportsWorker: boolean
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

// Dev-only perf marker helper keeps call sites compact while honoring DEV gating.
type PerfEventPayload = Record<string, string | number | boolean | null>
// Allow lazy payload creation so release builds avoid data allocations entirely.
type PerfEventPayloadFactory = () => PerfEventPayload
const maybeMarkPerfEvent = (label: string, data?: PerfEventPayload | PerfEventPayloadFactory): void => {
  // Avoid emitting perf markers outside dev builds.
  if (!import.meta.env.DEV) return
  // Resolve data lazily so payload objects are only built in dev.
  const resolved = typeof data === 'function' ? data() : data
  markPerfEvent(label, resolved)
}

// Map rule-cache pipeline phases to perf timeline labels to keep matching centralized.
const RULE_CACHE_PHASE_MARKERS: Record<RuleCachePipelinePhase, string> = {
  // Baseline passes capture the initial match evaluation before safeguard overrides.
  'baseline:start': PERF_EVENTS.ruleCacheBaselineStart,
  // Baseline done marks the end of the initial matcher pass.
  'baseline:done': PERF_EVENTS.ruleCacheBaselineDone,
  // Detection start marks the safeguard detection snapshot phase.
  'detection:start': PERF_EVENTS.ruleCacheDetectionStart,
  // Detection done signals the end of safeguard snapshot building.
  'detection:done': PERF_EVENTS.ruleCacheDetectionDone,
  // Final start marks the safeguard-adjusted match pass.
  'final:start': PERF_EVENTS.ruleCacheFinalMatchStart,
  // Final done marks the end of match evaluation.
  'final:done': PERF_EVENTS.ruleCacheFinalMatchDone,
}

// Keep AbortError creation centralized so every early-exit uses the same error shape.
const createAbortError = (): DOMException => new DOMException('Aborted', 'AbortError')

const withCallerAbort = <T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> => {
  // No caller signal means the shared promise can be returned as-is.
  if (!signal) return promise
  // Immediate abort should reject without touching the underlying pipeline.
  if (signal.aborted) return Promise.reject(createAbortError())
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(createAbortError())
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then((value) => {
      signal.removeEventListener('abort', handleAbort)
      resolve(value)
    }).catch((error) => {
      signal.removeEventListener('abort', handleAbort)
      reject(error)
    })
  })
}

const buildPipelineRequestSignature = (params: PipelineParams): string | null => {
  const fingerprint = params.fingerprint ?? null
  const artifactSignature = params.artifactSignature ?? params.artifactPatch?.signature ?? null
  // Dedupe only when both fingerprints are available to avoid false "same request" positives.
  if (!fingerprint || !artifactSignature) return null
  return JSON.stringify({
    fingerprint,
    artifactSignature,
    recipeModes: params.recipeModes,
    skipWarm: params.skipWarm ?? false,
    skipMatches: params.skipMatches ?? false,
    skipDetection: params.skipDetection ?? false,
    resetArtifacts: params.resetArtifacts ?? false,
  })
}

const resolveArtifactSnapshotKey = (
  artifact: NormalizedGearArtifact,
  fallbackIdx: number,
): number => {
  // Reuse tester item id when present so patch keys align with App-side item identities.
  const testerId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
  if (Number.isFinite(testerId)) return testerId
  // Imported artifact ids are the second-best stable key.
  const artifactId = Number((artifact as { id?: number } | undefined)?.id ?? NaN)
  if (Number.isFinite(artifactId)) return artifactId
  // Final fallback keeps keys deterministic even when source ids are missing.
  return fallbackIdx
}

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  // Worker reset hook lets pipeline aborts terminate long-running wasm work immediately.
  const resetWorkerForPipelineAbortRef = useRef<(() => void) | null>(null)
  const requestIdRef = useRef(0)
  // Generation id lets the worker reject stale in-flight pipelines safely.
  const pipelineGenerationRef = useRef(0)
  const pendingWarmRef = useRef<Map<number, PendingWarmRequest>>(new Map())
  const pendingPipelineRef = useRef<Map<number, PendingPipelineRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
  // Track active + queued pipeline requests so rapid UI edits collapse to latest-only work.
  const activePipelineRunRef = useRef<ActivePipelineRun | null>(null)
  const queuedPipelineRunRef = useRef<QueuedPipelineRun | null>(null)
  // Mirror artifact patches locally so a respawned worker can be rehydrated with full artifacts.
  const workerArtifactSnapshotRef = useRef<Map<number, NormalizedGearArtifact>>(new Map())
  // Hard-cancel worker rotation clears worker cache; next run must resend full artifacts.
  const workerNeedsArtifactHydrationRef = useRef(false)
  const abortedIdsRef = useRef<Set<number>>(new Set())
  const fallbackCacheRef = useRef<RecipeRulesCache | null>(supportsWorkerEnv ? null : createRecipeRulesCache())
  // Local test runs skip Web Workers, so keep our own artifact map to mimic the patch behavior.
  const fallbackArtifactsRef = useRef<Map<number, NormalizedGearArtifact>>(new Map())
  const fallbackWarmStateRef = useRef<{
    snapshot: RuleCacheStateSnapshot
    recipesForRules: BuilderRecipe[]
    fingerprint: string | null
  } | null>(null)
  // Local fallback paths run sync WASM helpers, so warm once before any fallback execution.
  const localWasmWarmupPromiseRef = useRef<Promise<void> | null>(null)
  const ensureLocalWasmReady = useCallback(async (): Promise<void> => {
    if (!localWasmWarmupPromiseRef.current) {
      localWasmWarmupPromiseRef.current = warmupWasmRuleEngine()
    }
    await localWasmWarmupPromiseRef.current
  }, [])
  const syncWorkerArtifactSnapshot = useCallback((params: PipelineParams): void => {
    const snapshot = workerArtifactSnapshotRef.current
    // Explicit reset requests mirror the worker behavior by dropping the full snapshot first.
    if (params.resetArtifacts) snapshot.clear()
    // Patch mode carries exact changed/removed ids, so apply it incrementally.
    if (params.artifactPatch) {
      for (const [itemId, artifact] of params.artifactPatch.changed) {
        snapshot.set(itemId, artifact)
      }
      for (const removed of params.artifactPatch.removed) {
        snapshot.delete(removed)
      }
      return
    }
    // Full artifact payloads replace the snapshot to keep ids deterministic.
    if (params.artifacts.length > 0) {
      snapshot.clear()
      params.artifacts.forEach((artifact, idx) => {
        snapshot.set(resolveArtifactSnapshotKey(artifact, idx), artifact)
      })
    }
  }, [])

  const runWarmLocally = useCallback((params: WarmCacheParams, options?: { onProgress?: (progress: ProgressSnapshot) => void }): WarmCacheResult => {
    const recipesForRules = recipesForRuleBuild(params.recipes)
    const previousCache = fallbackCacheRef.current ?? undefined
    const baseRuleCount = Array.isArray(params.hsf?.Rules) ? (params.hsf?.Rules.length ?? 0) : 0
      const cacheResult = updateRecipeRulesCache(previousCache
        ? {
            recipes: recipesForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
          previousCache,
          baseRuleCount,
          // Forward local progress to consumers whenever a caller opts in.
          ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
        }
      : {
          recipes: recipesForRules,
          metasets: params.metasets,
          substatTargets: params.substatTargets,
          baseRuleCount,
          ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
        })
    fallbackCacheRef.current = cacheResult.cache
    const mergedRules = computeMergedRules({
      hsf: params.hsf,
      customRecipes: recipesForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByRecipe,
      // Safeguard overrides must be included so warm merges match pipeline merges.
      safeguards: params.safeguards,
    })
    const state: RuleCacheStateSnapshot = {
      rulesByRecipe: cacheResult.rulesByRecipe,
      countsByRecipe: cacheResult.countsByRecipe,
      keys: cacheResult.keys,
      substatTargetsKey: cacheResult.substatTargetsKey,
      mergedRules,
      truncatedRecipeIndices: cacheResult.truncatedRecipeIndices.slice(),
      totalLimitHit: cacheResult.totalLimitHit,
      excludedByTotalLimitIndices: cacheResult.excludedByTotalLimitIndices.slice(),
    }
    fallbackWarmStateRef.current = {
      snapshot: state,
      recipesForRules,
      fingerprint: null,
    }
    return { state }
  }, [])

  const runPipelineLocally = useCallback((params: PipelineParams, options?: { onProgress?: (progress: ProgressSnapshot) => void }): PipelineResult => {
    const warmTotal = params.skipWarm ? 0 : params.recipes.length
    const needsMatches = params.skipMatches !== true
    const fallbackArtifactMap = fallbackArtifactsRef.current
    if (params.resetArtifacts) fallbackArtifactMap.clear()
    if (params.artifactPatch) {
      // Mirror the worker: apply changed rows into the fallback cache so the matcher
      // only sees the artifacts that actually changed.
      for (const [itemId, artifact] of params.artifactPatch.changed) fallbackArtifactMap.set(itemId, artifact)
      for (const removed of params.artifactPatch.removed) fallbackArtifactMap.delete(removed)
    } else if (params.artifacts && params.artifacts.length > 0) {
      // Full reload path still nukes the cache to avoid mixing mixed id spaces (manual vs imports).
      fallbackArtifactMap.clear()
      params.artifacts.forEach((artifact, idx) => {
        const testerId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
        const artifactId = Number((artifact as { id?: number } | undefined)?.id ?? NaN)
        const key = Number.isFinite(testerId) ? testerId : (Number.isFinite(artifactId) ? artifactId : idx)
        fallbackArtifactMap.set(key, artifact)
      })
    }
    // Local matcher falls back to evaluating the full map because the fallback cache does not
    // track per-artifact fingerprints; the worker handles the finer-grained reuse.
    const artifactList = Array.from(fallbackArtifactMap.values())
    // Avoid detection passes unless at least one safeguard-override feature is active.
    const hasActiveSafeguards = hasActiveSafeguardRules(params.safeguards)
    // Safeguard overrides are active when Safeguards is enabled.
    const hasActiveSafeguardOverrides = hasActiveSafeguards
    const needsDetection = needsMatches
      && params.skipDetection !== true
      && hasActiveSafeguardOverrides
      && artifactList.length > 0
    const matchPasses = needsMatches ? (needsDetection ? 2 : 1) : 0
    const total = warmTotal + (artifactList.length * matchPasses)
    let completed = 0
    const emitProgress = () => {
      if (!options?.onProgress) return
      options.onProgress({ completed, total })
    }

    const cachedWarm = fallbackWarmStateRef.current
    const canReuseWarm = Boolean(
      cachedWarm
      && params.fingerprint
      && cachedWarm.fingerprint
      && cachedWarm.fingerprint === params.fingerprint,
    )
    const recipesForRules = canReuseWarm ? cachedWarm!.recipesForRules : recipesForRuleBuild(params.recipes)
    let cacheResult
    if (canReuseWarm) {
      cacheResult = {
        cache: fallbackCacheRef.current,
        rulesByRecipe: cachedWarm!.snapshot.rulesByRecipe,
        countsByRecipe: cachedWarm!.snapshot.countsByRecipe,
        keys: cachedWarm!.snapshot.keys,
        substatTargetsKey: cachedWarm!.snapshot.substatTargetsKey,
        truncatedRecipeIndices: cachedWarm!.snapshot.truncatedRecipeIndices,
        totalLimitHit: cachedWarm!.snapshot.totalLimitHit,
        excludedByTotalLimitIndices: cachedWarm!.snapshot.excludedByTotalLimitIndices,
      }
      completed = warmTotal
    } else {
      const previousCache = fallbackCacheRef.current ?? undefined
      const baseRuleCount = Array.isArray(params.hsf?.Rules) ? (params.hsf?.Rules.length ?? 0) : 0
      cacheResult = updateRecipeRulesCache(previousCache
        ? {
            recipes: recipesForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
            previousCache,
            baseRuleCount,
          }
        : {
            recipes: recipesForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
            baseRuleCount,
          })
      fallbackCacheRef.current = cacheResult.cache ?? null
      completed = warmTotal
    }
    if (total > 0 && completed > 0) emitProgress()

    // Baseline merges should exclude detection artifacts to avoid double-injection.
    const baseSafeguards = hasActiveSafeguards
      ? { ...params.safeguards, detection: null }
      : params.safeguards
    // Precompute ignore-tag indices so matcher precedence can reuse them.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const mergedRulesBaseline = computeMergedRules({
      hsf: params.hsf,
      customRecipes: recipesForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByRecipe,
      // Safeguard overrides must be excluded from the baseline so detection sees raw sell outcomes.
      safeguards: baseSafeguards,
    })

    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    if (needsDetection) {
      for (const artifact of artifactList) {
        if (!artifact) continue
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? NaN)
        if (!Number.isFinite(itemId)) continue
        const baseEval = evaluateMatchesByRecipe(
          mergedRulesBaseline,
          artifact.testerItem,
          // Baseline excludes safeguard overrides so detection stays honest.
          { recipeModes: params.recipeModes, excludeSources: KEEP_OVERRIDE_RULE_SOURCES },
        )
        baselineMatchMap.set(itemId, {
          itemId,
          firstMatch: baseEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstNonExcludedMatch ?? baseEval.firstMatch,
          matchingRecipeIndices: baseEval.matchingRecipeIndices,
          matchingRecipeDecisions: baseEval.matchingRecipeDecisions,
        })
      }
      completed += artifactList.length
      if (total > 0) emitProgress()
    }

    const toPreviewMatch = (result: ReturnType<typeof evaluateMatchesByRecipe>['firstMatch'], rules: HsfRuleWithRecipe[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const recipeIdx = result.recipeIdx ?? null
      const recipeName = resolveMatchRecipeName(recipeIdx, null, rule)
      // Safeguards render with a rule ordinal label instead of a recipe name.
      const safeguardLabel = rule?.__source === RULE_SOURCE_SAFEGUARDS
        ? resolveSafeguardRuleLabel(rule)
        : null
      // Prefer real recipe names but fall back to safeguard labels.
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

    // Safeguard detection snapshots feed merged rule injection.
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    if (needsDetection) {
      // Build candidate rows so safeguard overrides only consider sellable items.
      const rows = artifactList.map((artifact, idx) => {
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? idx ?? NaN)
        const match = baselineMatchMap.get(itemId)
        return {
          artifact,
          match: null,
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          matchingRecipeIndices: match?.matchingRecipeIndices ?? [],
          matchingRecipeDecisions: match?.matchingRecipeDecisions ?? [],
        }
      })
      // Run collect + detection together so wasm owns one full detection pass.
      const combinedDetection = collectAndComputeSafeguardProtection({
        rows,
        baseRules: mergedRulesBaseline,
        recipeModes: params.recipeModes,
        rules: params.safeguards.rules,
        enabled: params.safeguards.enabled,
        ignoreSafeguardRecipeIndices,
      })
      // Safeguards snapshot drives rule injection + UI counts.
      safeguardDetectionSnapshot = combinedDetection.detection
    }

    const mergedRulesFinal = computeMergedRules({
      hsf: params.hsf,
      customRecipes: recipesForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByRecipe,
      // Inject safeguard rules only when detection is active.
      safeguards: baseSafeguards
        ? { ...params.safeguards, detection: safeguardDetectionSnapshot }
        : params.safeguards,
    })

    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      for (const artifact of artifactList) {
        if (!artifact) continue
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
        if (!Number.isFinite(itemId)) continue
        const fullEval = evaluateMatchesByRecipe(
          mergedRulesFinal,
          artifact.testerItem,
          { recipeModes: params.recipeModes, ignoreSafeguardRecipeIndices },
        )
        const baseEval = baselineMatchMap.get(itemId)
          ?? evaluateMatchesByRecipe(
            mergedRulesFinal,
            artifact.testerItem,
            // Baseline keeps safeguard overrides excluded so precedence math stays correct.
            { recipeModes: params.recipeModes, excludeSources: KEEP_OVERRIDE_RULE_SOURCES },
          )
        matches.push({
          itemId,
          firstMatch: fullEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstMatch,
          matchingRecipeIndices: fullEval.matchingRecipeIndices,
          matchingRecipeDecisions: fullEval.matchingRecipeDecisions,
        })
        completed += 1
        if (total > 0 && options?.onProgress) emitProgress()
      }
    }

    const state: RuleCacheStateSnapshot = {
      rulesByRecipe: cacheResult.rulesByRecipe instanceof Map ? cacheResult.rulesByRecipe : new Map<number, HsfRuleWithRecipe[]>(cacheResult.rulesByRecipe),
      countsByRecipe: cacheResult.countsByRecipe instanceof Map ? cacheResult.countsByRecipe : new Map<number, number>(cacheResult.countsByRecipe),
      keys: cacheResult.keys.slice(),
      substatTargetsKey: cacheResult.substatTargetsKey,
      mergedRules: mergedRulesFinal,
      truncatedRecipeIndices: cacheResult.truncatedRecipeIndices.slice(),
      totalLimitHit: cacheResult.totalLimitHit,
      excludedByTotalLimitIndices: cacheResult.excludedByTotalLimitIndices.slice(),
    }
    fallbackWarmStateRef.current = {
      snapshot: state,
      recipesForRules,
      fingerprint: params.fingerprint ?? null,
    }
    return {
      state,
      matches,
      // Safeguards detection snapshot supports the tab UI.
      safeguardDetection: safeguardDetectionSnapshot,
      fingerprint: params.fingerprint ?? null,
      artifactSignature: params.artifactSignature ?? params.artifactPatch?.signature ?? null,
    }
  }, [])

  useEffect(() => {
    if (!supportsWorkerEnv) return
    const warmMap = pendingWarmRef.current
    const pipelineMap = pendingPipelineRef.current
    const countMap = pendingCountRef.current
    const artifactSnapshot = workerArtifactSnapshotRef.current
    const abortedSet = abortedIdsRef.current

    const handleMessage = (event: MessageEvent<RuleCacheWorkerResponse>) => {
      const data = event.data
      if (!data) return
      if (data.kind === 'warm:progress') {
        const pending = warmMap.get(data.id)
        pending?.onProgress?.(data.payload)
        return
      }
      // Throttle pipeline progress forwarding to roughly once per second (always forward completion).
      if (data.kind === 'pipeline:progress') {
        if (abortedIdsRef.current.has(data.id)) return
        const pending = pipelineMap.get(data.id)
        pending?.onProgress?.(data.payload)
        return
      }
      if (data.kind === 'pipeline:phase') {
        // Skip aborted pipelines so perf timelines only reflect active work.
        if (abortedIdsRef.current.has(data.id)) return
        // Resolve the perf marker for the phase we just received.
        const marker = RULE_CACHE_PHASE_MARKERS[data.payload.phase]
        // Attach the request id plus any phase payload details for logging.
        maybeMarkPerfEvent(marker, () => ({ id: data.id, ...(data.payload.data ?? {}) }))
        return
      }
      if (data.kind === 'warm:done') {
        const pending = warmMap.get(data.id)
        if (!pending) return
        warmMap.delete(data.id)
        const aborted = abortedSet.delete(data.id)
        if (aborted) return
        // Mark warm completion so perf timelines can isolate rule cache time.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmDone, () => ({
          id: data.id,
          rules: data.payload.mergedRules.length,
        }))
        const state: RuleCacheStateSnapshot = {
          rulesByRecipe: new Map<number, HsfRuleWithRecipe[]>(data.payload.rulesByRecipeEntries),
          countsByRecipe: new Map<number, number>(data.payload.countsByRecipeEntries),
          keys: data.payload.keys,
          substatTargetsKey: data.payload.substatTargetsKey,
          mergedRules: data.payload.mergedRules,
          truncatedRecipeIndices: data.payload.truncatedRecipeIndices.slice(),
          totalLimitHit: data.payload.totalLimitHit,
          excludedByTotalLimitIndices: data.payload.excludedByTotalLimitIndices.slice(),
        }
        pending.resolve({ state })
        return
      }
      if (data.kind === 'pipeline:done') {
        const aborted = abortedSet.delete(data.id)
        const pending = pipelineMap.get(data.id)
        if (!pending) return
        pipelineMap.delete(data.id)
        if (aborted) return
        // Mark pipeline completion so perf timelines can isolate match durations.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineDone, () => ({
          id: data.id,
          rules: data.payload.mergedRules.length,
          matches: data.payload.matches.length,
          // Detection is considered active when safeguard snapshot exists.
          detection: Boolean(data.payload.safeguardDetection),
        }))
        const state: RuleCacheStateSnapshot = {
          rulesByRecipe: new Map<number, HsfRuleWithRecipe[]>(data.payload.rulesByRecipeEntries),
          countsByRecipe: new Map<number, number>(data.payload.countsByRecipeEntries),
          keys: data.payload.keys,
          substatTargetsKey: data.payload.substatTargetsKey,
          mergedRules: data.payload.mergedRules,
          truncatedRecipeIndices: data.payload.truncatedRecipeIndices.slice(),
          totalLimitHit: data.payload.totalLimitHit,
          excludedByTotalLimitIndices: data.payload.excludedByTotalLimitIndices.slice(),
        }
        pending.resolve({
          state,
          matches: data.payload.matches,
          // Safeguard snapshot feeds the Safeguards tab.
          safeguardDetection: data.payload.safeguardDetection,
          fingerprint: data.payload.fingerprint,
          artifactSignature: data.payload.artifactSignature,
        })
        return
      }
      if (data.kind === 'builderCount:done') {
        const pending = countMap.get(data.id)
        if (!pending) return
        countMap.delete(data.id)
        const aborted = abortedSet.delete(data.id)
        if (aborted) return
        pending.resolve(data.payload.counts.slice())
        return
      }
      if (data.kind === 'error') {
        const aborted = abortedSet.delete(data.id)
        const warmPending = warmMap.get(data.id)
        if (warmPending) {
          warmMap.delete(data.id)
          if (!aborted) warmPending.reject(new Error(data.error))
        }
        const pipelinePending = pipelineMap.get(data.id)
        if (pipelinePending) {
          pipelineMap.delete(data.id)
          if (!aborted) pipelinePending.reject(new Error(data.error))
        }
        const countPending = countMap.get(data.id)
        if (countPending) {
          countMap.delete(data.id)
          if (!aborted) countPending.reject(new Error(data.error))
        }
      }
    }

    const rejectAllPending = (reason: unknown, options?: { markAborted?: boolean }) => {
      warmMap.forEach((pending, id) => {
        if (options?.markAborted) abortedSet.add(id)
        pending.reject(reason)
      })
      warmMap.clear()
      pipelineMap.forEach((pending, id) => {
        if (options?.markAborted) abortedSet.add(id)
        pending.reject(reason)
      })
      pipelineMap.clear()
      countMap.forEach((pending, id) => {
        if (options?.markAborted) abortedSet.add(id)
        pending.reject(reason)
      })
      countMap.clear()
    }

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const error = event instanceof ErrorEvent ? event.error : event.data
      const reason = error ?? new Error('Rule cache worker error')
      rejectAllPending(reason)
      abortedSet.clear()
    }

    const attachWorkerListeners = (worker: Worker) => {
      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
      worker.addEventListener('messageerror', handleError)
    }
    const detachWorkerListeners = (worker: Worker) => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      worker.removeEventListener('messageerror', handleError)
    }
    const spawnWorker = () => {
      const worker = new RuleCacheWorker()
      attachWorkerListeners(worker)
      workerRef.current = worker
    }
    const replaceWorkerForPipelineAbort = () => {
      // Abort-driven worker rotation is our hard stop for long wasm calls.
      rejectAllPending(createAbortError(), { markAborted: true })
      const activeWorker = workerRef.current
      if (activeWorker) {
        detachWorkerListeners(activeWorker)
        activeWorker.terminate()
        if (workerRef.current === activeWorker) workerRef.current = null
      }
      // The replacement worker starts empty, so the next pipeline must send a full artifact payload.
      workerNeedsArtifactHydrationRef.current = true
      spawnWorker()
    }

    resetWorkerForPipelineAbortRef.current = replaceWorkerForPipelineAbort
    spawnWorker()

    return () => {
      resetWorkerForPipelineAbortRef.current = null
      const activeWorker = workerRef.current
      if (activeWorker) {
        detachWorkerListeners(activeWorker)
        activeWorker.terminate()
        if (workerRef.current === activeWorker) workerRef.current = null
      }
      // Reject any queued request that never reached worker dispatch.
      const queued = queuedPipelineRunRef.current
      if (queued) {
        queued.reject(createAbortError())
        queuedPipelineRunRef.current = null
      }
      activePipelineRunRef.current = null
      workerNeedsArtifactHydrationRef.current = false
      artifactSnapshot.clear()
      rejectAllPending(createAbortError(), { markAborted: true })
      abortedSet.clear()
    }
  }, [])

  const warmCache = useCallback<UseRuleCacheWorkerResult['warmCache']>((params, options) => {
    const signal = options?.signal ?? null

    // Local fallback should stay parity with worker mode, including determinate updates.
    const localProgressOptions = options?.onProgress ? { onProgress: options.onProgress } : undefined
    if (!supportsWorkerEnv || !workerRef.current) {
      // Mark warm start before running the local fallback.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmStart, () => ({
        recipes: params.recipes.length,
        worker: false,
      }))
      return ensureLocalWasmReady().then(() => {
        const result = runWarmLocally(params, localProgressOptions)
        // Mark warm completion for the local fallback path.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmDone, () => ({
          rules: result.state.mergedRules.length,
          worker: false,
        }))
        return result
      })
    }

    if (signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current

    const runFallback = (_error: unknown): Promise<WarmCacheResult> => {
      if (signal?.aborted) {
        return Promise.reject(createAbortError())
      }
      return ensureLocalWasmReady().then(() => runWarmLocally(params, localProgressOptions))
    }

    let resolveFn: (value: WarmCacheResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<WarmCacheResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    const pendingEntry: PendingWarmRequest = { resolve: resolveFn, reject: rejectFn, promise }
    if (options?.onProgress) pendingEntry.onProgress = options.onProgress
    pendingWarmRef.current.set(id, pendingEntry)

    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingWarmRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingWarmRef.current.get(id)?.reject(createAbortError())
            pendingWarmRef.current.delete(id)
          }
          signal.addEventListener('abort', abortHandler, { once: true })
          return () => signal.removeEventListener('abort', abortHandler)
        })()
      : null

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'warm',
      payload: {
        recipes: params.recipes,
        metasets: params.metasets,
        substatTargets: params.substatTargets,
        hsf: params.hsf,
        ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
        // Safeguard override inputs must ride the worker request so merges stay consistent.
        safeguards: params.safeguards,
      },
    }

    try {
      // Mark warm start before dispatching to the worker.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmStart, () => ({
        id,
        recipes: params.recipes.length,
        worker: true,
      }))
      worker.postMessage(message)
    } catch (_error) {
      pendingWarmRef.current.delete(id)
      cleanupAbort?.()
      return runFallback(_error)
    }

    return promise
      .catch((error) => {
        const aborted = abortedIdsRef.current.delete(id)
        if (aborted) {
          return Promise.reject(createAbortError())
        }
        return runFallback(error)
      })
      .finally(() => {
        cleanupAbort?.()
      })
  }, [ensureLocalWasmReady, runWarmLocally])

  const startPipelineRunOnWorker = useCallback((
    params: PipelineParams,
    onProgress: PipelineProgressHandler | undefined,
    signature: string | null,
  ): ActivePipelineRun => {
    const localProgressOptions = onProgress
      ? { onProgress }
      : undefined
    const runFallback = (_error: unknown): Promise<PipelineResult> => ensureLocalWasmReady()
      .then(() => runPipelineLocally(params, localProgressOptions))
    const worker = workerRef.current
    if (!supportsWorkerEnv || !worker) {
      const promise = runFallback(new Error('Worker unavailable'))
      return {
        signature,
        promise,
        // Local fallback is synchronous work in this process and cannot be interrupted.
        abort: () => {},
      }
    }
    // Stamp this run with a strictly increasing generation so worker-side state commits are latest-only.
    const generation = pipelineGenerationRef.current + 1
    pipelineGenerationRef.current = generation
    const id = ++requestIdRef.current

    let resolveFn: (value: PipelineResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const basePromise = new Promise<PipelineResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    const pendingEntry: PendingPipelineRequest = {
      resolve: resolveFn,
      reject: rejectFn,
      promise: basePromise,
      ...(onProgress ? { onProgress } : {}),
    }
    pendingPipelineRef.current.set(id, pendingEntry)

    let settled = false
    let cancelIssued = false
    const abort = () => {
      // Ignore duplicate or post-settlement abort attempts.
      if (settled || cancelIssued) return
      cancelIssued = true
      const pending = pendingPipelineRef.current.get(id)
      if (pending) {
        abortedIdsRef.current.add(id)
        pendingPipelineRef.current.delete(id)
        pending.reject(createAbortError())
      }
      // Terminate + respawn the worker so wasm evaluation stops immediately.
      resetWorkerForPipelineAbortRef.current?.()
    }

    // Hard-cancel worker rotation empties worker cache; rehydrate from our local artifact snapshot.
    const workerNeedsHydration = workerNeedsArtifactHydrationRef.current
    const workerArtifactSnapshot = workerArtifactSnapshotRef.current
    let artifactsForWorker = params.artifacts
    let artifactPatchForWorker = params.artifactPatch
    let resetArtifactsForWorker = params.resetArtifacts ?? false
    if (workerNeedsHydration) {
      if (workerArtifactSnapshot.size > 0) {
        // Send a full payload once so recipe-mode-only toggles still produce matches.
        artifactsForWorker = Array.from(workerArtifactSnapshot.values())
        artifactPatchForWorker = undefined
        resetArtifactsForWorker = false
        workerNeedsArtifactHydrationRef.current = false
      } else if (params.artifacts.length > 0) {
        // A caller-provided full payload also satisfies hydration.
        workerNeedsArtifactHydrationRef.current = false
      }
    }

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'pipeline',
      payload: {
        generation,
        recipes: params.recipes,
        metasets: params.metasets,
        substatTargets: params.substatTargets,
        hsf: params.hsf,
        ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
        // Safeguard overrides must be supplied so detection + merges match the UI.
        safeguards: params.safeguards,
        recipeModes: params.recipeModes,
        artifacts: artifactsForWorker,
        ...(artifactPatchForWorker ? { artifactPatch: artifactPatchForWorker } : {}),
        ...(params.artifactSignature !== undefined ? { artifactSignature: params.artifactSignature ?? null } : {}),
        resetArtifacts: resetArtifactsForWorker,
        fingerprint: params.fingerprint ?? null,
        skipWarm: params.skipWarm ?? false,
        skipMatches: params.skipMatches ?? false,
        skipDetection: params.skipDetection ?? false,
      },
    }

    try {
      // Mark pipeline start before dispatching to the worker.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineStart, () => ({
        id,
        artifacts: artifactsForWorker?.length ?? 0,
        worker: true,
        skipWarm: params.skipWarm ?? false,
        skipMatches: params.skipMatches ?? false,
        skipDetection: params.skipDetection ?? false,
      }))
      worker.postMessage(message)
    } catch (_error) {
      pendingPipelineRef.current.delete(id)
      const promise = runFallback(_error)
      return {
        signature,
        promise,
        abort: () => {},
      }
    }

    const promise = basePromise
      .catch((error) => {
        const aborted = abortedIdsRef.current.delete(id)
        if (aborted) {
          return Promise.reject(createAbortError())
        }
        return runFallback(error)
      })
      .finally(() => {
        settled = true
      })

    return {
      signature,
      promise,
      abort,
    }
  }, [ensureLocalWasmReady, runPipelineLocally])

  const promoteQueuedPipeline = useCallback(() => {
    // Exactly one active pipeline at a time; wait for active completion before promoting queued work.
    if (activePipelineRunRef.current) return
    const queued = queuedPipelineRunRef.current
    if (!queued) return
    queuedPipelineRunRef.current = null
    const activeRun = startPipelineRunOnWorker(
      queued.params,
      queued.onProgress,
      queued.signature,
    )
    activePipelineRunRef.current = activeRun
    activeRun.promise.then((result) => {
      queued.resolve(result)
    }).catch((error) => {
      queued.reject(error)
    }).finally(() => {
      // Advance the queue only once the active run fully settled (success/error/abort).
      if (activePipelineRunRef.current === activeRun) activePipelineRunRef.current = null
      promoteQueuedPipeline()
    })
  }, [startPipelineRunOnWorker])

  const runPipeline = useCallback<UseRuleCacheWorkerResult['runPipeline']>((params, options) => {
    const signal = options?.signal ?? null
    const throttledProgress = options?.onProgress
      ? createProgressThrottler(options.onProgress)
      : undefined
    if (!supportsWorkerEnv || !workerRef.current) {
      // Mark pipeline start before running the local fallback.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineStart, () => ({
        artifacts: params.artifacts?.length ?? 0,
        worker: false,
        skipWarm: params.skipWarm ?? false,
        skipMatches: params.skipMatches ?? false,
        skipDetection: params.skipDetection ?? false,
      }))
      const localRun = ensureLocalWasmReady().then(() => {
        const result = runPipelineLocally(
          params,
          throttledProgress ? { onProgress: throttledProgress } : undefined,
        )
        // Mark pipeline fallback completion for perf traces.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineFallback, () => ({
          rules: result.state.mergedRules.length,
          matches: result.matches.length,
        }))
        // Mirror the completion marker for local pipeline runs.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineDone, () => ({
          rules: result.state.mergedRules.length,
          matches: result.matches.length,
          // Detection is active when safeguard snapshot exists.
          detection: Boolean(result.safeguardDetection),
        }))
        return result
      })
      return withCallerAbort(localRun, signal)
    }

    if (signal?.aborted) return Promise.reject(createAbortError())
    // Keep local artifact snapshot aligned with the latest payload before queue/dedupe.
    syncWorkerArtifactSnapshot(params)
    const signature = buildPipelineRequestSignature(params)

    // Identical payloads can share the same active run.
    const active = activePipelineRunRef.current
    if (signature && active && active.signature === signature) {
      return withCallerAbort(active.promise, signal)
    }
    // Identical payloads can share the same queued run too.
    const queued = queuedPipelineRunRef.current
    if (signature && queued && queued.signature === signature) {
      return withCallerAbort(queued.promise, signal)
    }

    let resolveFn: (value: PipelineResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<PipelineResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    const nextQueued: QueuedPipelineRun = {
      signature,
      params,
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      ...(throttledProgress ? { onProgress: throttledProgress } : {}),
    }

    // Keep a single queued request: drop older queued work in favor of the latest payload.
    const previousQueued = queuedPipelineRunRef.current
    if (previousQueued) {
      previousQueued.reject(createAbortError())
    }
    queuedPipelineRunRef.current = nextQueued

    // New payloads always cancel the active run; the next run starts after abort settles.
    if (activePipelineRunRef.current) {
      activePipelineRunRef.current.abort()
    }
    promoteQueuedPipeline()
    return withCallerAbort(promise, signal)
  }, [ensureLocalWasmReady, promoteQueuedPipeline, runPipelineLocally, syncWorkerArtifactSnapshot])

  const countRules = useCallback<UseRuleCacheWorkerResult['countRules']>((params, options) => {
    const signal = options?.signal ?? null
    const recipes = Array.from(params.recipes)

    if (!supportsWorkerEnv || !workerRef.current) {
      // Non-worker environments (SSR/tests) fall back to synchronous counting.
      if (signal?.aborted) {
        return Promise.reject(createAbortError())
      }
      return ensureLocalWasmReady().then(() => countRulesForRecipes(recipes, params.substatTargets))
    }

    if (signal?.aborted) {
      return Promise.reject(createAbortError())
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current

    let resolveFn: (value: number[]) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<number[]>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    pendingCountRef.current.set(id, { resolve: resolveFn, reject: rejectFn, promise })

    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingCountRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingCountRef.current.get(id)?.reject(createAbortError())
            pendingCountRef.current.delete(id)
          }
          signal.addEventListener('abort', abortHandler, { once: true })
          return () => signal.removeEventListener('abort', abortHandler)
        })()
      : null

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'builderCount',
      payload: {
        recipes,
        substatTargets: params.substatTargets,
      },
    }

    worker.postMessage(message)

    return promise.finally(() => {
      cleanupAbort?.()
    })
  }, [ensureLocalWasmReady])

  const flush = useCallback(() => {
    if (!supportsWorkerEnv) return Promise.resolve()
    // Wait for any in-flight or queued requests so teardown can proceed deterministically.
    const pendingPromises: Promise<unknown>[] = []
    pendingWarmRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    pendingPipelineRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    if (activePipelineRunRef.current) pendingPromises.push(activePipelineRunRef.current.promise)
    if (queuedPipelineRunRef.current) pendingPromises.push(queuedPipelineRunRef.current.promise)
    pendingCountRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    if (pendingPromises.length === 0) return Promise.resolve()
    return Promise.allSettled(pendingPromises).then(() => {})
  }, [])

  return useMemo<UseRuleCacheWorkerResult>(() => ({
    warmCache,
    runPipeline,
    countRules,
    flush,
    supportsWorker: supportsWorkerEnv,
  }), [warmCache, runPipeline, countRules, flush])
}
