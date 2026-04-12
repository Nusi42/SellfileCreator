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
  SafeguardDetectionSnapshot,
  SafeguardsMergeInput,
} from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { GearInspectorMatchWorkerItemResult } from '../workers/gearInspectorMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
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

type PendingPipelineRequest = PendingRequest<PipelineResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingCountRequest = PendingRequest<number[]>

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
  // skipped the large clone (artifact-only burst → rulesByRecipeEntries/mergedRules/keys = null).
  lastRules: { rulesByRecipe: Map<number, HsfRuleWithRecipe[]>; mergedRules: HsfRuleWithRecipe[]; keys: string[] } | null,
): RuleCacheStateSnapshot => ({
  // Fall back to last known rules when the worker sent null.
  rulesByRecipe: payload.rulesByRecipeEntries !== null
    ? new Map<number, HsfRuleWithRecipe[]>(payload.rulesByRecipeEntries)
    : (lastRules?.rulesByRecipe ?? new Map()),
  // countsByRecipe is always fresh — it depends on baseRuleCount from the HSF file,
  // which can change independently of recipe content.
  countsByRecipe: new Map<number, number>(payload.countsByRecipeEntries),
  keys: payload.keys ?? lastRules?.keys ?? [],
  substatTargetsKey: payload.substatTargetsKey,
  mergedRules: payload.mergedRules ?? lastRules?.mergedRules ?? [],
  truncatedRecipeIndices: payload.truncatedRecipeIndices,
  totalLimitHit: payload.totalLimitHit,
  excludedByTotalLimitIndices: payload.excludedByTotalLimitIndices,
})

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

// Proactive worker restart thresholds: terminate + respawn the worker before a pipeline run
// when either the WASM heap has grown large (memory.grow failure risk on V8/Windows)
// or every N pipelines as a blanket hedge against accumulating fragmentation.
// STATUS_ACCESS_VIOLATION is unrecoverable at the JS level (V8 OS-level crash), so
// the only defence is staying below the ~160 MiB grow-rejection threshold.
const WASM_HEAP_RESTART_BYTES = 150 * 1024 * 1024 // 150 MiB
// Restart the worker periodically as a defense-in-depth measure against any
// unforeseen heap state accumulation.  The talc 5.0.3 free-list corruption
// is fixed at the Rust level (StabilityAllocator + Arc<str> on RuleRaw string
// fields + prewarm_for_json_parse/serialize_json_prealloc — see
// wasm/rule_engine_wasm/src/lib.rs).  20+ pipeline iterations pass cleanly;
// the interval is 5 rather than the old crash-mitigation value of 1.
const PIPELINE_RESTART_INTERVAL = 5               // restart worker every N completed pipelines

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  // Generation ids let worker runs drop stale responses safely.
  const pipelineGenerationRef = useRef(0)
  const completedPipelineCountRef = useRef(0)
  const lastWasmLinearBytesRef = useRef(0)
  const pendingPipelineRef = useRef<Map<number, PendingPipelineRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
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
          // Track heap size and pipeline count BEFORE the abort check — the
          // WORKER ran the full pipeline even if the JS side superseded it.
          // Without this, the cycling logic sees counter=0 after an aborted
          // pipeline and doesn't cycle, leaving the next pipeline on a dirty
          // heap where talc's free-list has accumulated corruption.
          lastWasmLinearBytesRef.current = data.payload.wasmLinearBytes
          completedPipelineCountRef.current += 1
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
    }
    // Proactively terminate and respawn the worker to reset the WASM linear heap.
    // Called before a pipeline when the heap is large or after N completed runs.
    // Unlike replaceWorkerAfterRuntimeError this does not reject pending requests
    // (there are none — it is always called between pipeline runs).
    const cycleWorkerProactively = () => {
      const oldWorker = workerRef.current
      if (!oldWorker) return
      workerAc.abort()
      workerAc = new AbortController()
      oldWorker.terminate()
      workerRef.current = null
      completedPipelineCountRef.current = 0
      lastWasmLinearBytesRef.current = 0
      spawnWorker()
    }
    cycleWorkerProactivelyRef.current = cycleWorkerProactively
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
    // Proactively restart the worker when the WASM heap has grown large or after
    // every Nth pipeline.  Must happen before reading workerRef so the fresh worker
    // is used for this pipeline.
    const shouldCycle =
      completedPipelineCountRef.current >= PIPELINE_RESTART_INTERVAL ||
      lastWasmLinearBytesRef.current >= WASM_HEAP_RESTART_BYTES
    if (shouldCycle && workerRef.current) cycleWorkerProactivelyRef.current()
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

  // Exposes cycleWorkerProactively to startPipelineRunOnWorker (separate useCallback).
  const cycleWorkerProactivelyRef = useRef<() => void>(() => {})
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
    if (pendingPromises.length === 0) return Promise.resolve()
    return Promise.allSettled(pendingPromises).then(() => {})
  }, [])

  return useMemo<UseRuleCacheWorkerResult>(() => ({
    runPipeline,
    countRules,
    flush,
  }), [runPipeline, countRules, flush])
}
