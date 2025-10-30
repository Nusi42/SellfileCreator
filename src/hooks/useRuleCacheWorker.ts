import { useCallback, useEffect, useMemo, useRef } from 'react'
import { updateConfigRulesCache, createConfigRulesCache, type RuleCachePerfSample, type ConfigRulesCache } from '../lib/ruleCache'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import { computeMergedRules } from '../lib/merge'
import { configsForRuleBuild } from '../lib/ruleCacheHelpers'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from '../workers/ruleCacheWorkerTypes'
import RuleCacheWorker from '../workers/ruleCacheWorker?worker'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/finalSell'

type WarmCacheParams = {
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  hsf: HsfFile | null
  finalSellRemainder?: FinalSellRemainderConfig
}

type RuleCacheStateSnapshot = {
  rulesByConfig: Map<number, HsfRuleWithCfg[]>
  countsByConfig: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  mergedRules: HsfRuleWithCfg[]
}

type WarmCacheResult = {
  state: RuleCacheStateSnapshot
  perf: RuleCachePerfSample
}

type PendingRequest = {
  resolve: (value: WarmCacheResult) => void
  reject: (reason?: unknown) => void
  promise: Promise<WarmCacheResult>
}

type UseRuleCacheWorkerResult = {
  warmCache: (params: WarmCacheParams, options?: { signal?: AbortSignal }) => Promise<WarmCacheResult>
  flush: () => Promise<void>
  supportsWorker: boolean
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingRef = useRef<Map<number, PendingRequest>>(new Map())
  const abortedIdsRef = useRef<Set<number>>(new Set())
  const fallbackCacheRef = useRef<ConfigRulesCache | null>(supportsWorkerEnv ? null : createConfigRulesCache())

  useEffect(() => {
    if (!supportsWorkerEnv) return
    const worker = new RuleCacheWorker()
    workerRef.current = worker

    const handleMessage = (event: MessageEvent<RuleCacheWorkerResponse>) => {
      const data = event.data
      if (!data) return
      const pending = pendingRef.current.get(data.id)
      if (!pending) return

      pendingRef.current.delete(data.id)
      const aborted = abortedIdsRef.current.delete(data.id)

      if (data.kind === 'error') {
        if (aborted) return
        pending.reject(new Error(data.error))
        return
      }

      if (aborted) {
        return
      }

      const state: RuleCacheStateSnapshot = {
        rulesByConfig: new Map<number, HsfRuleWithCfg[]>(data.payload.rulesByConfigEntries),
        countsByConfig: new Map<number, number>(data.payload.countsByConfigEntries),
        keys: data.payload.keys,
        substatTargetsKey: data.payload.substatTargetsKey,
        mergedRules: data.payload.mergedRules,
      }
      pending.resolve({ state, perf: data.payload.perf })
    }

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const error = event instanceof ErrorEvent ? event.error : event.data
      pendingRef.current.forEach((pending, id) => {
        pending.reject(error ?? new Error('Rule cache worker error'))
        pendingRef.current.delete(id)
      })
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
    }
  }, [])

  const warmCache = useCallback<UseRuleCacheWorkerResult['warmCache']>((params, options) => {
    const signal = options?.signal ?? null

    if (!supportsWorkerEnv || !workerRef.current) {
      const configsForRules = configsForRuleBuild(params.configs)
      const previousCache = fallbackCacheRef.current ?? undefined
      const cacheResult = updateConfigRulesCache(previousCache
        ? {
            configs: configsForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
            previousCache,
          }
        : {
            configs: configsForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
          })
      fallbackCacheRef.current = cacheResult.cache
      const mergedRules = computeMergedRules({
        hsf: params.hsf,
        customCfgs: configsForRules,
        metasets: params.metasets,
        substatTargets: params.substatTargets,
        ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
        prebuiltCustomRules: cacheResult.rulesByConfig,
      })
      const state: RuleCacheStateSnapshot = {
        rulesByConfig: cacheResult.rulesByConfig,
        countsByConfig: cacheResult.countsByConfig,
        keys: cacheResult.keys,
        substatTargetsKey: cacheResult.substatTargetsKey,
        mergedRules,
      }
      return Promise.resolve({ state, perf: cacheResult.perf })
    }

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current

    let resolveFn: (value: WarmCacheResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<WarmCacheResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    pendingRef.current.set(id, { resolve: resolveFn, reject: rejectFn, promise })

    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingRef.current.get(id)?.reject(new DOMException('Aborted', 'AbortError'))
            pendingRef.current.delete(id)
          }
          signal.addEventListener('abort', abortHandler, { once: true })
          return () => signal.removeEventListener('abort', abortHandler)
        })()
      : null

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'warm',
      payload: {
        configs: params.configs,
        metasets: params.metasets,
        substatTargets: params.substatTargets,
        hsf: params.hsf,
        ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      },
    }

    worker.postMessage(message)

    return promise.finally(() => {
      cleanupAbort?.()
    })
  }, [])

  const flush = useCallback(() => {
    if (!supportsWorkerEnv || pendingRef.current.size === 0) return Promise.resolve()
    return Promise.all(Array.from(pendingRef.current.values()).map(entry => entry.promise)).then(() => {})
  }, [])

  return useMemo<UseRuleCacheWorkerResult>(() => ({
    warmCache,
    flush,
    supportsWorker: supportsWorkerEnv,
  }), [warmCache, flush])
}
