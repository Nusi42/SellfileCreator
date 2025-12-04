import { useCallback, useEffect, useRef } from 'react'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import { RULE_SOURCE_KEEP_UNIQUES, type HsfRuleWithCfg } from '../lib/merge'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type { RuleMatchIndexData } from '../lib/ruleMatchIndex'
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

type ConfigureParams = {
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ruleMatchIndex: RuleMatchIndexData | null
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

const evaluateRowsFallback = (
  rules: HsfRuleWithCfg[],
  configModes: SellfileExportMode[],
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
        matchingConfigIndices: [],
        matchingConfigDecisions: [],
      }
    })
  }
  return items.map((entry, idx) => {
    const {
      firstMatch,
      firstNonExcludedMatch,
      matchingConfigIndices,
      matchingConfigDecisions,
    } = evaluateMatchesByConfig(
      rules,
      entry.item,
      { configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] },
    )
    // Mirror worker behavior so determinate UI continues to move in fallback mode.
    forwardProgress({ completed: idx + 1, total })
    return {
      itemId: entry.itemId,
      firstMatch,
      firstNonExcludedMatch,
      matchingConfigIndices,
      matchingConfigDecisions,
    }
  })
}

export function useTesterMatchWorker(): UseTesterMatchWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingConfigureRef = useRef<Map<number, PendingRequest<void>>>(new Map())
  const pendingEvaluateRef = useRef<Map<number, PendingEvaluateRequest>>(new Map())
  const lastConfigurePromiseRef = useRef<Promise<void> | null>(null)
  const fallbackRulesRef = useRef<HsfRuleWithCfg[]>([])
  const fallbackConfigModesRef = useRef<SellfileExportMode[]>([])

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
    fallbackConfigModesRef.current = params.configModes
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
    const message: TesterMatchWorkerRequest = {
      id,
      kind: 'configure',
      payload: {
        rules: params.rules,
        configModes: params.configModes,
        ruleMatchIndex: params.ruleMatchIndex,
      },
    }
    worker.postMessage(message)
    return promise
  }, [])

  const evaluateItems = useCallback<UseTesterMatchWorkerResult['evaluateItems']>((params) => {
    if (!params.items.length) return Promise.resolve([])
    if (!supportsWorkerEnv || !workerRef.current) {
      const results = evaluateRowsFallback(
        fallbackRulesRef.current,
        fallbackConfigModesRef.current,
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
