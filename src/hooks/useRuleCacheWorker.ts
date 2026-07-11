import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type {
  RuleCacheWorkerRequest,
  RuleCacheWorkerResponse,
  RuleCachePipelineResponse,
} from '../workers/ruleCacheWorkerTypes'
import RuleCacheWorker from '../workers/ruleCacheWorker?worker&inline'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import type {
  SafeguardCandidateOut,
  SafeguardDetectionArtifact,
  SafeguardDetectionSnapshot,
  SafeguardRuleCountMode,
  SafeguardsMergeInput,
} from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { GearInspectorMatchWorkerItemResult } from '../workers/gearInspectorMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
import { postRuleCacheWasmInit } from '../lib/headlessRuleCachePipeline'
import { getLogWasmHeap } from '../lib/runtimeConfig'
import { ALLOW_TEST_HOOKS } from '../lib/testHooks'
import { pauseAllDsimWorkers, signalPipelineDone } from '../lib/wasmWorkerSlot'

type PipelineParams = {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  hsf: HsfFile | null
  finalSellRemainder?: FinalSellRemainderConfig
  safeguards: SafeguardsMergeInput
  // In-app rule transforms run before safeguard evaluation in the worker.
  omitDisabledBeforeSafeguards: boolean
  dedupeBeforeSafeguards: boolean
  recipeModes: SellfileExportMode[]
  artifacts: NormalizedGearArtifact[]
  // When true, the worker computes improvement-chance percentages in WASM and
  // returns them in the result (requires safeguards to be enabled).
  computeImprovementChance?: boolean
}

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

// Exported so callers (e.g. App.tsx pipeline cache) can type-annotate stored results without
// duplicating the shape or relying on Awaited<ReturnType<...>> at call sites.
export type PipelineResult = {
  state: RuleCacheStateSnapshot
  matches: GearInspectorMatchWorkerItemResult[]
  safeguardDetection: SafeguardDetectionSnapshot | null
  // Null when computeImprovementChance was false or safeguards were inactive.
  improvementChanceByArtifactId: Map<number, ImprovementChanceWasmEntry> | null
  // crc32 of the bytes an HSF export would produce from these merged rules (worker-computed).
  // The HSF export/push "dirty" indicator compares it against the fingerprint captured at the
  // last export. Always present (sent every pipeline, even on the unchanged-rules fast path).
  mergedRulesHash: string
}

type CountRulesParams = {
  recipes: readonly BuilderRecipe[]
  substatTargets: SubstatTargetTable
}

// Mirrors the live-preview scoring request that used to spawn its own dedicated worker.
// Routed through this hook so the rule-engine WASM module is inlined into the build
// once (in ruleCacheWorker) instead of once per consumer worker.
export type ScoreCandidatesParams = {
  artifacts: SafeguardDetectionArtifact[]
  // StatVariant ids active in the editing rule.
  substats: number[]
  // Per-variant weight multipliers (variant id → weight).
  weights: Record<number, number>
  // Editing rule's "Weight by Rank" toggle so the preview ranking matches detection.
  weightMainStatByRank: boolean
  // Editing rule's tunable main-stat rank factor so the preview scaling matches detection.
  mainStatRankWeightFactor: number
  requiredCount: number
  // Editing rule's count-mode flags. Required for popover-cutoff parity with
  // detection — without it the WASM partition falls back to top-N and the
  // cutoff divider visibly snaps to row `requiredCount` after weight nudges.
  countMode?: SafeguardRuleCountMode
  // Editing rule's substat-match token. `perSubstat` (with >1 substat) makes the preview emit
  // per-substat sub-buckets so the flyout's per-substat focus buttons stay live during weight edits.
  substatMatch?: string
}

type PendingRequest<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

type PendingPipelineRequest = PendingRequest<PipelineResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingCountRequest = PendingRequest<number[]>
type PendingScoreRequest = PendingRequest<SafeguardCandidateOut[]>

type PipelineProgressHandler = (progress: ProgressSnapshot) => void

type ActivePipelineRun = {
  promise: Promise<PipelineResult>
  abort: () => void
}

type QueuedPipelineRun = {
  params: PipelineParams
  onProgress?: PipelineProgressHandler
  resolve: (value: PipelineResult) => void
  reject: (reason?: unknown) => void
  promise: Promise<PipelineResult>
}

type UseRuleCacheWorkerResult = {
  runPipeline: (
    params: PipelineParams,
    options?: { signal?: AbortSignal; onProgress?: (progress: ProgressSnapshot) => void }
  ) => Promise<PipelineResult>
  countRules: (params: CountRulesParams, options?: { signal?: AbortSignal }) => Promise<number[]>
  // Live-preview safeguard candidate scoring, routed through the same worker as the
  // pipeline so its rule-engine WASM instance is shared. Resolves with the ranked
  // candidate list; reject + abort semantics mirror countRules.
  scoreCandidates: (params: ScoreCandidatesParams, options?: { signal?: AbortSignal }) => Promise<SafeguardCandidateOut[]>
  flush: () => Promise<void>
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'
const isBrowserEnv = typeof window !== 'undefined'
const RULE_CACHE_WORKER_REQUIRED_ERROR = '[rule-cache] Worker is required in browser environments.'
const RULE_CACHE_WORKER_UNAVAILABLE_ERROR = '[rule-cache] Worker-backed pipeline is unavailable in this runtime.'

// Keep AbortError creation centralized so every abort path has the same shape.
const createAbortError = (): DOMException => new DOMException('Aborted', 'AbortError')
// Worker unavailability should fail with one consistent browser-facing message.
const createWorkerUnavailableError = (): Error => new Error(RULE_CACHE_WORKER_REQUIRED_ERROR)

// Canonical alias — avoids re-declaring fields that can drift out of sync with the worker type.
type WorkerStatePayload = RuleCachePipelineResponse['payload']

const toStateSnapshotFromWorker = (
  payload: WorkerStatePayload,
  // Most recently received non-null rule data; supplied as fallback when the worker
  // skipped the large clone (artifact-only burst → all rule fields null).
  lastRules: { rulesByRecipe: Map<number, HsfRuleWithRecipe[]>; mergedRules: HsfRuleWithRecipe[]; keys: string[] } | null,
): RuleCacheStateSnapshot => {
  // Determine rulesByRecipe from whichever encoding the worker sent.
  let rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  if (payload.rulesByRecipeIndices !== null) {
    // Compact path: indices into mergedRules — rule objects are shared with the mergedRules
    // array (no copy), halving the per-pipeline V8 allocation vs. sending full rule objects.
    const rules = payload.mergedRules ?? lastRules?.mergedRules ?? []
    rulesByRecipe = new Map(
      payload.rulesByRecipeIndices.map(([recipeIdx, indices]) => [
        recipeIdx,
        indices.map((i) => rules[i]).filter((r): r is HsfRuleWithRecipe => r !== undefined),
      ]),
    )
  } else if (payload.rulesByRecipeEntries !== null) {
    // Full path (dedupeBeforeSafeguards or omitDisabledBeforeSafeguards active): direct entries.
    rulesByRecipe = new Map<number, HsfRuleWithRecipe[]>(payload.rulesByRecipeEntries)
  } else {
    // Artifact-only burst (rulesUnchanged): reuse last known map.
    rulesByRecipe = lastRules?.rulesByRecipe ?? new Map()
  }
  return {
    rulesByRecipe,
    // countsByRecipe is always fresh — it depends on baseRuleCount which can change
    // independently of recipe content.
    countsByRecipe: new Map<number, number>(payload.countsByRecipeEntries),
    keys: payload.keys ?? lastRules?.keys ?? [],
    substatTargetsKey: payload.substatTargetsKey,
    mergedRules: payload.mergedRules ?? lastRules?.mergedRules ?? [],
    truncatedRecipeIndices: payload.truncatedRecipeIndices,
    totalLimitHit: payload.totalLimitHit,
    excludedByTotalLimitIndices: payload.excludedByTotalLimitIndices,
  }
}

const withCallerAbort = <T>(promise: Promise<T>, signal: AbortSignal | null): Promise<T> => {
  // No caller signal means there is nothing to wrap.
  if (!signal) return promise
  // Immediate abort should reject without touching the underlying run.
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

// No proactive worker cycling.
//
// Earlier iterations cycled the worker when the WASM heap exceeded a threshold or
// after every N pipelines.  Both strategies backfire:
//
// • The WASM heap (pre-grown to 256 MiB at startup) grows to 400–600 MiB on the
//   first pipeline with a large rule set (32 000+ rules).  This one-time growth is
//   the StabilityAllocator fitting the working set; subsequent pipelines on the SAME
//   worker reuse those pages and the heap stays stable.
// • Proactive cycling terminates that 400–600 MiB worker immediately after the first
//   pipeline and spawns a replacement that will grow identically.  Chrome's major GC
//   for Worker threads is lazy — the dead heap lingers until GC decides to run,
//   stacking dead 400–600 MiB allocations and causing the multi-GB main-thread growth
//   users observed.
// • Without cycling, one worker heap grows once to ~460 MiB and remains stable; that
//   is strictly better than N dead heaps accumulating faster than GC can free them.
//
// The runtime-error recovery path (replaceWorkerAfterRuntimeError) still handles
// genuine WASM traps (unreachable / out-of-bounds) by replacing the worker.  That
// path is the only necessary safeguard.

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  // Generation ids let worker runs drop stale responses safely.
  const pipelineGenerationRef = useRef(0)
  const pendingPipelineRef = useRef<Map<number, PendingPipelineRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
  // Live-preview candidate-scoring requests share the same id space as pipeline/count.
  const pendingScoreRef = useRef<Map<number, PendingScoreRequest>>(new Map())
  const abortedIdsRef = useRef<Set<number>>(new Set())
  // Keep one active and one queued payload for latest-only scheduling.
  const activePipelineRunRef = useRef<ActivePipelineRun | null>(null)
  const queuedPipelineRunRef = useRef<QueuedPipelineRun | null>(null)
  // Most recently received non-null rule data. Artifact-only pipeline responses send
  // null for the three large fields to avoid structured-cloning ~50–100 MiB per burst;
  // this ref supplies the fallback. Scoped to the hook instance so a worker restart
  // always overwrites it on the new worker's first (always full) response.
  const lastRulesRef = useRef<{
    rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
    mergedRules: HsfRuleWithRecipe[]
    keys: string[]
  } | null>(null)
  // Tracks whether the most recent completed pipeline produced new rules (mergedRules !== null)
  // or was an artifact-only burst (mergedRules === null → rules unchanged).
  // Read by promoteQueuedPipeline's .finally() to pass the correct flag to signalPipelineDone.
  const rulesChangedRef = useRef(false)

  // Browser builds must use worker execution; no in-thread fallback path exists.
  const rejectWhenWorkerUnavailable = useCallback(<T,>(signal: AbortSignal | null): Promise<T> => {
    if (signal?.aborted) return Promise.reject(createAbortError())
    if (isBrowserEnv) return Promise.reject(createWorkerUnavailableError())
    return Promise.reject(new Error(RULE_CACHE_WORKER_UNAVAILABLE_ERROR))
  }, [])

  useEffect(() => {
    // Non-worker environments keep the hook inert and fail at call-time.
    if (!supportsWorkerEnv) return
    const pipelineMap = pendingPipelineRef.current
    const countMap = pendingCountRef.current
    const scoreMap = pendingScoreRef.current
    const abortedSet = abortedIdsRef.current

    const handleMessage = (event: MessageEvent<RuleCacheWorkerResponse>) => {
      const data = event.data
      if (!data) return
      switch (data.kind) {
        case 'pipeline:progress': {
          // Aborted requests should not fan progress updates into the UI.
          if (abortedSet.has(data.id)) return
          pipelineMap.get(data.id)?.onProgress?.(data.payload)
          return
        }
        case 'pipeline:done': {
          const pending = pipelineMap.get(data.id)
          if (!pending) return
          pipelineMap.delete(data.id)
          // DEV build: log the worker's WASM heap after each pipeline to spot growth. The
          // `import.meta.env.DEV` literal folds to false in non-dev builds, so this branch
          // (and its string) is tree-shaken from release/test bundles.
          if (import.meta.env.DEV) {
            const mainHeap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
            const wasmMB = data.payload.wasmLinearBytes / 1024 / 1024 | 0
            console.log(`[rule-cache-worker] pipeline-done id=${data.id} wasmHeapMB=${wasmMB} mainHeapMB=${mainHeap / 1024 / 1024 | 0}`)
          }
          // TEST hook (?logWasmHeap): stash the worker's WASM heap on window so the
          // endpoint-incremental-updates leak spec can read it (performance.memory on the
          // main thread cannot see the worker heap; worker console.log doesn't reliably
          // reach Playwright). ALLOW_TEST_HOOKS folds to false in DEV and release builds, so
          // getLogWasmHeap() is provably false there and this whole branch tree-shakes out;
          // only the e2e TEST build (VITE_TEST_HOOKS=1) keeps it.
          if (ALLOW_TEST_HOOKS && getLogWasmHeap()) {
            try {
              (window as unknown as { __wasmHeapMB?: number }).__wasmHeapMB =
                data.payload.wasmLinearBytes / 1024 / 1024 | 0
            } catch { /* ignore */ }
          }
          // TEST hook (?logWasmHeap): record the per-build safeguard PROTECTED itemKey count so a
          // Playwright spec can replay captured endpoint packets through the REAL worker and assert
          // the count stays correct — reproducing the phantom over-protection (1270 vs 1490/1555)
          // in CI without manual capture. The protected set = the union of detection entries'
          // itemKeys (same metric as the worker's [detect-io] protected=). Stored as a history
          // array + the latest value. Tree-shaken out of DEV/release (ALLOW_TEST_HOOKS=false).
          if (ALLOW_TEST_HOOKS && getLogWasmHeap()) {
            try {
              const snap = data.payload.safeguardDetection
              const keys = new Set<number>()
              for (const e of snap?.entries ?? []) for (const k of e.itemKeys ?? []) keys.add(k)
              const w = window as unknown as { __protectedHistory?: number[]; __protectedCount?: number }
              w.__protectedCount = keys.size
              ;(w.__protectedHistory ??= []).push(keys.size)
            } catch { /* ignore */ }
          }
          if (abortedSet.delete(data.id)) return
          // Reconstruct the artifactId → entry map from the flat array (structured-clone safe).
          const entries = data.payload.improvementChanceEntries
          const improvementChanceByArtifactId = entries != null
            ? new Map(entries.map((e) => [e.artifactId, e] as const))
            : null
          // Fall back to lastRulesRef when the worker sent null for the three large fields
          // (artifact-only burst where per-recipe fingerprints were unchanged).
          const state = toStateSnapshotFromWorker(data.payload, lastRulesRef.current)
          // Update the ref only when full data was received, so it always holds the
          // most recently valid rule set without being clobbered by null-skipped runs.
          // mergedRules non-null = full pipeline (rules changed); null = artifact-only burst (rules same).
          const rulesChanged = data.payload.mergedRules !== null
          rulesChangedRef.current = rulesChanged
          if (rulesChanged) {
            lastRulesRef.current = {
              rulesByRecipe: state.rulesByRecipe,
              mergedRules: state.mergedRules,
              keys: state.keys,
            }
          }
          pending.resolve({
            state,
            matches: data.payload.matches,
            safeguardDetection: data.payload.safeguardDetection,
            improvementChanceByArtifactId,
            mergedRulesHash: data.payload.mergedRulesHash,
          })
          return
        }
        case 'builderCount:done': {
          const pending = countMap.get(data.id)
          if (!pending) return
          countMap.delete(data.id)
          if (abortedSet.delete(data.id)) return
          pending.resolve(data.payload.counts)
          return
        }
        case 'scoreCandidates:done': {
          const pending = scoreMap.get(data.id)
          if (!pending) return
          scoreMap.delete(data.id)
          if (abortedSet.delete(data.id)) return
          pending.resolve(data.payload.candidates)
          return
        }
        case 'error': {
          const aborted = abortedSet.delete(data.id)
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
          const scorePending = scoreMap.get(data.id)
          if (scorePending) {
            scoreMap.delete(data.id)
            if (!aborted) scorePending.reject(new Error(data.error))
          }
          // WASM traps propagate as caught RuntimeError and the worker sends them
          // via postError rather than letting them go unhandled, so the standard
          // worker 'error' event never fires. Per the WASM spec, any trap leaves
          // the module instance in an undefined state — subsequent calls are UB.
          // We must replace the worker so the next pipeline starts on a fresh instance.
          // Recognised traps:
          //   "unreachable" — Rust panic / OOM abort
          //   "out of bounds" — memory access fault (allocator corruption, use-after-free)
          if (data.error.includes('unreachable') || data.error.includes('out of bounds')) {
            replaceWorkerAfterRuntimeError()
          }
          return
        }
      }
    }

    const rejectAllPending = (reason: unknown, options?: { markAborted?: boolean }) => {
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
      scoreMap.forEach((pending, id) => {
        if (options?.markAborted) abortedSet.add(id)
        pending.reject(reason)
      })
      scoreMap.clear()
    }

    // AbortController per worker instance lets the lint rule trace listener cleanup.
    let workerAc = new AbortController()
    const attachWorkerListeners = (worker: Worker) => {
      worker.addEventListener('message', handleMessage, { signal: workerAc.signal })
      worker.addEventListener('error', handleError, { signal: workerAc.signal })
      worker.addEventListener('messageerror', handleError, { signal: workerAc.signal })
    }
    const spawnWorker = () => {
      const worker = new RuleCacheWorker()
      attachWorkerListeners(worker)
      workerRef.current = worker
      // Send the compiled WASM module immediately so the worker can call initSync
      // instead of fetching+compiling its own copy of the WASM bytes (keeps the ~1.6 MB
      // binary in the main bundle only). The handshake itself is the shared SSOT in
      // lib/headlessRuleCachePipeline; a missing module is swallowed here to preserve
      // this hook's historical "skip init, fail at call time" behavior.
      void postRuleCacheWasmInit(worker).catch(() => {})
    }
    const replaceWorkerAfterRuntimeError = () => {
      // Runtime faults are recoverable by replacing the worker instance.
      rejectAllPending(createAbortError(), { markAborted: true })
      const queued = queuedPipelineRunRef.current
      if (queued) {
        queued.reject(createAbortError())
        queuedPipelineRunRef.current = null
      }
      activePipelineRunRef.current = null
      const activeWorker = workerRef.current
      if (activeWorker) {
        // Abort all listeners on the old worker before terminating.
        workerAc.abort()
        workerAc = new AbortController()
        activeWorker.terminate()
        if (workerRef.current === activeWorker) workerRef.current = null
      }
      spawnWorker()
    }
    const handleError = (_event: ErrorEvent | MessageEvent) => {
      replaceWorkerAfterRuntimeError()
    }

    spawnWorker()

    return () => {
      const activeWorker = workerRef.current
      if (activeWorker) {
        // Abort all listeners registered via the shared AbortController.
        workerAc.abort()
        activeWorker.terminate()
        if (workerRef.current === activeWorker) workerRef.current = null
      }
      const queued = queuedPipelineRunRef.current
      if (queued) {
        queued.reject(createAbortError())
        queuedPipelineRunRef.current = null
      }
      activePipelineRunRef.current = null
      rejectAllPending(createAbortError(), { markAborted: true })
      abortedSet.clear()
    }
  }, [])

  const startPipelineRunOnWorker = useCallback((
    params: PipelineParams,
    onProgress: PipelineProgressHandler | undefined,
  ): ActivePipelineRun => {
    // Soft-pause all live dungeon-sim workers before the pipeline allocates its
    // own WASM peak memory — prevents both WASM linear heaps existing simultaneously.
    // Sends 'cancel' (not terminate) so cachedSession is preserved for resume after pipeline.
    pauseAllDsimWorkers()
    const worker = workerRef.current
    if (!supportsWorkerEnv || !worker) {
      // Callers should pre-check availability, but keep this deterministic.
      const promise = Promise.reject(createWorkerUnavailableError())
      return { promise, abort: () => {} }
    }

    // Assign a strictly increasing generation for stale-run suppression.
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
        safeguards: params.safeguards,
        omitDisabledBeforeSafeguards: params.omitDisabledBeforeSafeguards === true,
        dedupeBeforeSafeguards: params.dedupeBeforeSafeguards === true,
        recipeModes: params.recipeModes,
        artifacts: params.artifacts,
        emitProgressEvents: Boolean(onProgress),
        computeImprovementChance: params.computeImprovementChance === true,
      },
    }

    try {
      worker.postMessage(message)
    } catch (_error) {
      pendingPipelineRef.current.delete(id)
      return { promise: Promise.reject(_error), abort: () => {} }
    }

    const promise = basePromise
      .catch((error) => {
        const aborted = abortedIdsRef.current.delete(id)
        if (aborted) return Promise.reject(createAbortError())
        return Promise.reject(error)
      })
      .finally(() => {
        settled = true
      })

    return { promise, abort }
  }, [])

  // Ref indirection breaks the self-reference cycle so the lint rule sees a stable binding.
  const promoteQueuedPipelineRef = useRef<() => void>(() => {})

  const promoteQueuedPipeline = useCallback(() => {
    // Exactly one active run at a time.
    if (activePipelineRunRef.current) return
    const queued = queuedPipelineRunRef.current
    if (!queued) return
    queuedPipelineRunRef.current = null
    const activeRun = startPipelineRunOnWorker(queued.params, queued.onProgress)
    activePipelineRunRef.current = activeRun
    activeRun.promise.then((result) => {
      queued.resolve(result)
    }).catch((error) => {
      queued.reject(error)
    }).finally(() => {
      // Promote the next queued run once this one settles.
      if (activePipelineRunRef.current === activeRun) activePipelineRunRef.current = null
      promoteQueuedPipelineRef.current()
      // Signal the dsim to restart only when the queue is fully drained.
      // If promoteQueuedPipelineRef started another run, activePipelineRunRef is
      // non-null and we skip the signal so the dsim doesn't restart mid-batch.
      // Pass rulesChanged so each dsim hook can decide whether to resume or restart.
      if (!activePipelineRunRef.current) signalPipelineDone(rulesChangedRef.current)
    })
  }, [startPipelineRunOnWorker])

  // Keep the ref in sync so recursive .finally() calls always reach the latest closure.
  useEffect(() => { promoteQueuedPipelineRef.current = promoteQueuedPipeline }, [promoteQueuedPipeline])

  const runPipeline = useCallback<UseRuleCacheWorkerResult['runPipeline']>((params, options) => {
    const signal = options?.signal ?? null
    const workerProgress = options?.onProgress
    if (!supportsWorkerEnv || !workerRef.current) return rejectWhenWorkerUnavailable(signal)
    if (signal?.aborted) return Promise.reject(createAbortError())

    let resolveFn: (value: PipelineResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<PipelineResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    const nextQueued: QueuedPipelineRun = {
      params,
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      ...(workerProgress ? { onProgress: workerProgress } : {}),
    }

    // Keep one queued payload: drop older queued work in favor of the latest.
    const previousQueued = queuedPipelineRunRef.current
    if (previousQueued) previousQueued.reject(createAbortError())
    queuedPipelineRunRef.current = nextQueued

    // Supersede active work so newest payload runs next.
    const supersededActive = activePipelineRunRef.current
    if (supersededActive) {
      supersededActive.abort()
      if (activePipelineRunRef.current === supersededActive) activePipelineRunRef.current = null
    }

    promoteQueuedPipeline()
    return withCallerAbort(promise, signal)
  }, [promoteQueuedPipeline, rejectWhenWorkerUnavailable])

  const countRules = useCallback<UseRuleCacheWorkerResult['countRules']>((params, options) => {
    const signal = options?.signal ?? null
    const recipes = Array.from(params.recipes)
    if (!supportsWorkerEnv || !workerRef.current) return rejectWhenWorkerUnavailable(signal)

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
  }, [rejectWhenWorkerUnavailable])

  const scoreCandidates = useCallback<UseRuleCacheWorkerResult['scoreCandidates']>((params, options) => {
    const signal = options?.signal ?? null
    if (!supportsWorkerEnv || !workerRef.current) return rejectWhenWorkerUnavailable(signal)

    const worker = workerRef.current
    const id = ++requestIdRef.current
    let resolveFn: (value: SafeguardCandidateOut[]) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<SafeguardCandidateOut[]>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })
    pendingScoreRef.current.set(id, { resolve: resolveFn, reject: rejectFn, promise })

    // Mirrors countRules' abort plumbing: caller-signal aborts mark the id so a late
    // worker response is discarded by the dispatcher above.
    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingScoreRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingScoreRef.current.get(id)?.reject(createAbortError())
            pendingScoreRef.current.delete(id)
          }
          signal.addEventListener('abort', abortHandler, { once: true })
          return () => signal.removeEventListener('abort', abortHandler)
        })()
      : null

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'scoreCandidates',
      payload: {
        artifacts: params.artifacts,
        substats: params.substats,
        weights: params.weights,
        weightMainStatByRank: params.weightMainStatByRank,
        mainStatRankWeightFactor: params.mainStatRankWeightFactor,
        requiredCount: params.requiredCount,
        // Conditional spread keeps the payload shape stable when caller omits
        // count-mode (legacy callers / tests). The worker handler treats an
        // absent key as "use canonical default."
        ...(params.countMode ? { countMode: params.countMode } : {}),
        // Forward substat-match so perSubstat rules get sub-buckets in the live preview.
        ...(params.substatMatch ? { substatMatch: params.substatMatch } : {}),
      },
    }
    worker.postMessage(message)

    return promise.finally(() => {
      cleanupAbort?.()
    })
  }, [rejectWhenWorkerUnavailable])

  const flush = useCallback(() => {
    if (!supportsWorkerEnv) return Promise.resolve()
    // Wait for in-flight and queued promises so teardown is deterministic.
    const pendingPromises: Promise<unknown>[] = []
    pendingPipelineRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    if (activePipelineRunRef.current) pendingPromises.push(activePipelineRunRef.current.promise)
    if (queuedPipelineRunRef.current) pendingPromises.push(queuedPipelineRunRef.current.promise)
    pendingCountRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    pendingScoreRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    if (pendingPromises.length === 0) return Promise.resolve()
    return Promise.allSettled(pendingPromises).then(() => {})
  }, [])

  return useMemo<UseRuleCacheWorkerResult>(() => ({
    runPipeline,
    countRules,
    scoreCandidates,
    flush,
  }), [runPipeline, countRules, scoreCandidates, flush])
}
