import { useCallback, useEffect, useRef } from 'react'
import type { SellfileExportMode } from '../lib/hsfBuilder'
import type { HsfRuleWithCfg } from '../lib/merge'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type { RuleMatchIndexData } from '../lib/ruleMatchIndex'
import TesterMatchWorker from '../workers/testerMatchWorker?worker&inline'
import type {
  TesterMatchWorkerEvaluatePayload,
  TesterMatchWorkerEvaluateRow,
  TesterMatchWorkerRequest,
  TesterMatchWorkerResponse,
  TesterMatchWorkerRowResult,
} from '../workers/testerMatchWorkerTypes'

type ConfigureParams = {
  rules: HsfRuleWithCfg[]
  configModes: SellfileExportMode[]
  ruleMatchIndex: RuleMatchIndexData | null
}

type EvaluateParams = {
  rows: TesterMatchWorkerEvaluateRow[]
}

type UseTesterMatchWorkerResult = {
  configure: (params: ConfigureParams) => Promise<void>
  evaluateRows: (params: EvaluateParams) => Promise<TesterMatchWorkerRowResult[]>
  supportsWorker: boolean
}

type PendingRequest<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

const evaluateRowsFallback = (
  rules: HsfRuleWithCfg[],
  configModes: SellfileExportMode[],
  rows: readonly TesterMatchWorkerEvaluateRow[],
): TesterMatchWorkerRowResult[] => {
  if (!Array.isArray(rows) || rows.length === 0) return []
  if (!rules.length) {
    return rows.map((row) => ({
      rowId: row.rowId,
      firstMatch: null,
      matchingConfigIndices: [],
    }))
  }
  return rows.map((row) => {
    const { firstMatch, matchingConfigIndices } = evaluateMatchesByConfig(rules, row.item, { configModes })
    return {
      rowId: row.rowId,
      firstMatch,
      matchingConfigIndices,
    }
  })
}

export function useTesterMatchWorker(): UseTesterMatchWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingConfigureRef = useRef<Map<number, PendingRequest<void>>>(new Map())
  const pendingEvaluateRef = useRef<Map<number, PendingRequest<TesterMatchWorkerRowResult[]>>>(new Map())
  const lastConfigurePromiseRef = useRef<Promise<void> | null>(null)
  const fallbackRulesRef = useRef<HsfRuleWithCfg[]>([])
  const fallbackConfigModesRef = useRef<SellfileExportMode[]>([])

  useEffect(() => {
    if (!supportsWorkerEnv) return
    const worker = new TesterMatchWorker()
    workerRef.current = worker
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

  const evaluateRows = useCallback<UseTesterMatchWorkerResult['evaluateRows']>((params) => {
    if (!params.rows.length) return Promise.resolve([])
    if (!supportsWorkerEnv || !workerRef.current) {
      const results = evaluateRowsFallback(fallbackRulesRef.current, fallbackConfigModesRef.current, params.rows)
      return Promise.resolve(results)
    }
    const worker = workerRef.current
    const sendEvaluate = () => {
      const id = ++requestIdRef.current
      const promise = new Promise<TesterMatchWorkerRowResult[]>((resolve, reject) => {
        pendingEvaluateRef.current.set(id, { resolve, reject })
      })
      const payload: TesterMatchWorkerEvaluatePayload = {
        rows: params.rows,
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
    evaluateRows,
    supportsWorker: supportsWorkerEnv,
  }
}
