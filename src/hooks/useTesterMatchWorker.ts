import { useCallback, useEffect, useRef } from 'react'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import { RULE_SOURCE_SAFEGUARDS } from '../lib/merge'
import { evaluateMatchesByRecipe } from '../lib/ruleEval'
import TesterMatchWorker from '../workers/testerMatchWorker?worker&inline'
import type {
  TesterMatchWorkerEvaluatePayload,
  TesterMatchWorkerEvaluateItem,
  TesterMatchWorkerRequest,
  TesterMatchWorkerResponse,
  TesterMatchWorkerItemResult,
} from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { createProgressThrottler } from '../types/progress'
import { PERF_EVENTS, markPerfEvent } from '../lib/perfTimeline'

// Keep merge typing sourced from computeMergedRules while avoiding legacy alias names locally.
type HsfRuleWithRecipe = ReturnType<(typeof import('../lib/merge'))['computeMergedRules']>[number]

type ConfigureParams = {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}

type EvaluateParams = {
  items: TesterMatchWorkerEvaluateItem[]
  onProgress?: (progress: ProgressSnapshot) => void
}

type UseTesterMatchWorkerResult = {
  configure: (params: ConfigureParams) => Promise<void>
  evaluateItems: (params: EvaluateParams) => Promise<TesterMatchWorkerItemResult[]>
  supportsWorker: boolean
}

type PendingRequest<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

// Evaluate requests carry optional progress callbacks so we can surface determinate UI.
type PendingEvaluateRequest = PendingRequest<TesterMatchWorkerItemResult[]> & { onProgress?: (progress: ProgressSnapshot) => void }

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

// Dev-only perf marker helper keeps call sites concise for worker timing.
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

const evaluateRowsFallback = (
  rules: HsfRuleWithRecipe[],
  recipeModes: SellfileExportMode[],
  items: readonly TesterMatchWorkerEvaluateItem[],
  onProgress?: (progress: ProgressSnapshot) => void,
): TesterMatchWorkerItemResult[] => {
  if (!Array.isArray(items) || items.length === 0) return []
  const total = items.length
  const forwardProgress = createProgressThrottler(onProgress)
  if (!rules.length) {
    return items.map((entry, idx) => {
      forwardProgress({ completed: idx + 1, total })
      return {
        itemId: entry.itemId,
        firstMatch: null,
        firstNonExcludedMatch: null,
        matchingRecipeIndices: [],
        matchingRecipeDecisions: [],
      }
    })
  }
  return items.map((entry, idx) => {
    const {
      firstMatch,
      firstNonExcludedMatch,
      matchingRecipeIndices,
      matchingRecipeDecisions,
    } = evaluateMatchesByRecipe(
      rules,
      entry.item,
      { recipeModes, excludeSources: [RULE_SOURCE_SAFEGUARDS] },
    )
    // Mirror worker behavior so determinate UI continues to move in fallback mode.
    forwardProgress({ completed: idx + 1, total })
    return {
      itemId: entry.itemId,
      firstMatch,
      firstNonExcludedMatch,
      matchingRecipeIndices,
      matchingRecipeDecisions,
    }
  })
}

export function useTesterMatchWorker(): UseTesterMatchWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingConfigureRef = useRef<Map<number, PendingRequest<void>>>(new Map())
  const pendingEvaluateRef = useRef<Map<number, PendingEvaluateRequest>>(new Map())
  const lastConfigurePromiseRef = useRef<Promise<void> | null>(null)
  const fallbackRulesRef = useRef<HsfRuleWithRecipe[]>([])
  const fallbackRecipeModesRef = useRef<SellfileExportMode[]>([])

  useEffect(() => {
    if (!supportsWorkerEnv) {
      return
    }
    let worker: Worker | null = null
    try {
      worker = new TesterMatchWorker()
      workerRef.current = worker
    } catch (_error) {
      workerRef.current = null
      return
    }
    const configureMap = pendingConfigureRef.current
    const evaluateMap = pendingEvaluateRef.current

    const handleMessage = (event: MessageEvent<TesterMatchWorkerResponse>) => {
      const data = event.data
      if (!data) return
      if (data.kind === 'configure:done') {
        const pending = configureMap.get(data.id)
        if (!pending) return
        configureMap.delete(data.id)
        // Mark worker configure completion for perf timelines.
        maybeMarkPerfEvent(PERF_EVENTS.testerMatchWorkerConfigureDone, () => ({ id: data.id }))
        pending.resolve()
        return
      }
      if (data.kind === 'evaluate:progress') {
        const pending = evaluateMap.get(data.id)
        pending?.onProgress?.(data.payload)
        return
      }
      if (data.kind === 'evaluate:done') {
        const pending = evaluateMap.get(data.id)
        if (!pending) return
        evaluateMap.delete(data.id)
        // Mark worker evaluate completion for perf timelines.
        maybeMarkPerfEvent(PERF_EVENTS.testerMatchWorkerEvaluateDone, () => ({
          id: data.id,
          results: data.payload.results.length,
        }))
        pending.resolve(data.payload.results)
        return
      }
      if (data.kind === 'error') {
        const configurePending = configureMap.get(data.id)
        if (configurePending) {
          configureMap.delete(data.id)
          configurePending.reject(new Error(data.error))
        }
        const evaluatePending = evaluateMap.get(data.id)
        if (evaluatePending) {
          evaluateMap.delete(data.id)
          evaluatePending.reject(new Error(data.error))
        }
      }
    }

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const error = event instanceof ErrorEvent ? event.error : event.data
      const reason = error instanceof Error ? error : new Error('Tester match worker error')
      configureMap.forEach((pending) => pending.reject(reason))
      configureMap.clear()
      evaluateMap.forEach((pending) => pending.reject(reason))
      evaluateMap.clear()
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    worker.addEventListener('messageerror', handleError)

    return () => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      worker.removeEventListener('messageerror', handleError)
      worker.terminate()
      workerRef.current = null
      configureMap.clear()
      evaluateMap.clear()
    }
  }, [])

  const configure = useCallback<UseTesterMatchWorkerResult['configure']>((params) => {
    fallbackRulesRef.current = params.rules
    fallbackRecipeModesRef.current = params.recipeModes
    if (!supportsWorkerEnv || !workerRef.current) {
      lastConfigurePromiseRef.current = null
      return Promise.resolve()
    }
    const worker = workerRef.current
    const id = ++requestIdRef.current
    const promise = new Promise<void>((resolve, reject) => {
      pendingConfigureRef.current.set(id, { resolve, reject })
    })
    lastConfigurePromiseRef.current = promise
    // Mark configure request send for perf timelines.
    maybeMarkPerfEvent(PERF_EVENTS.testerMatchWorkerConfigureSend, () => ({
      id,
      rules: params.rules.length,
      modes: params.recipeModes.length,
    }))
    const message: TesterMatchWorkerRequest = {
      id,
      kind: 'configure',
      payload: {
        rules: params.rules,
        recipeModes: params.recipeModes,
      },
    }
    worker.postMessage(message)
    return promise
  }, [])

  const evaluateItems = useCallback<UseTesterMatchWorkerResult['evaluateItems']>((params) => {
    if (!params.items.length) return Promise.resolve([])
    if (!supportsWorkerEnv || !workerRef.current) {
      // Note the fallback path so perf traces capture worker unavailability.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchWorkerEvaluateFallback, () => ({ items: params.items.length }))
      const results = evaluateRowsFallback(
        fallbackRulesRef.current,
        fallbackRecipeModesRef.current,
        params.items,
        params.onProgress,
      )
      return Promise.resolve(results)
    }
    const worker = workerRef.current
    const sendEvaluate = () => {
      const id = ++requestIdRef.current
      const promise = new Promise<TesterMatchWorkerItemResult[]>((resolve, reject) => {
        const pendingEntry: PendingEvaluateRequest = {
          resolve,
          reject,
          // Throttle worker progress emissions so large batches cannot flood the UI.
          ...(params.onProgress ? { onProgress: createProgressThrottler(params.onProgress) } : {}),
        }
        pendingEvaluateRef.current.set(id, pendingEntry)
      })
      // Mark evaluate request send for perf timelines.
      maybeMarkPerfEvent(PERF_EVENTS.testerMatchWorkerEvaluateSend, () => ({ id, items: params.items.length }))
      const payload: TesterMatchWorkerEvaluatePayload = {
        items: params.items,
      }
      const message: TesterMatchWorkerRequest = {
        id,
        kind: 'evaluate',
        payload,
      }
      worker.postMessage(message)
      return promise
    }
    const configurePromise = lastConfigurePromiseRef.current
    if (configurePromise) {
      return configurePromise
        .catch(() => undefined)
        .then(() => sendEvaluate())
    }
    return sendEvaluate()
  }, [])

  return {
    configure,
    evaluateItems,
    supportsWorker: supportsWorkerEnv,
  }
}
