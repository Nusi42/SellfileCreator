import { useCallback, useEffect, useMemo, useRef } from 'react'
import { updateConfigRulesCache, createConfigRulesCache, type RuleCachePerfSample, type ConfigRulesCache } from '../lib/ruleCache'
import type { BuilderConfig, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import { computeMergedRules } from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
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
  truncatedConfigIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

type WarmCacheResult = {
  state: RuleCacheStateSnapshot
  perf: RuleCachePerfSample
}

type CountRulesParams = {
  configs: readonly BuilderConfig[]
  substatTargets: SubstatTargetTable
}

type PendingRequest<T> = {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  promise: Promise<T>
}

type PendingWarmRequest = PendingRequest<WarmCacheResult>
type PendingCountRequest = PendingRequest<number[]>

type UseRuleCacheWorkerResult = {
  warmCache: (params: WarmCacheParams, options?: { signal?: AbortSignal }) => Promise<WarmCacheResult>
  countRules: (params: CountRulesParams, options?: { signal?: AbortSignal }) => Promise<number[]>
  flush: () => Promise<void>
  supportsWorker: boolean
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingWarmRef = useRef<Map<number, PendingWarmRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
  const abortedIdsRef = useRef<Set<number>>(new Set())
  const fallbackCacheRef = useRef<ConfigRulesCache | null>(supportsWorkerEnv ? null : createConfigRulesCache())

  useEffect(() => {
    if (!supportsWorkerEnv) return
    const worker = new RuleCacheWorker()
    workerRef.current = worker
    // Stash the mutable maps so the cleanup closure observes the same instances.
    const warmMap = pendingWarmRef.current
    const countMap = pendingCountRef.current
    const abortedSet = abortedIdsRef.current

    const handleMessage = (event: MessageEvent<RuleCacheWorkerResponse>) => {
      const data = event.data
      if (!data) return
      if (data.kind === 'warm:done') {
        const pending = warmMap.get(data.id)
        if (!pending) return
        warmMap.delete(data.id)
        const aborted = abortedSet.delete(data.id)
        if (aborted) return
        const state: RuleCacheStateSnapshot = {
          rulesByConfig: new Map<number, HsfRuleWithCfg[]>(data.payload.rulesByConfigEntries),
          countsByConfig: new Map<number, number>(data.payload.countsByConfigEntries),
          keys: data.payload.keys,
          substatTargetsKey: data.payload.substatTargetsKey,
          mergedRules: data.payload.mergedRules,
          truncatedConfigIndices: data.payload.truncatedConfigIndices.slice(),
          totalLimitHit: data.payload.totalLimitHit,
          excludedByTotalLimitIndices: data.payload.excludedByTotalLimitIndices.slice(),
        }
        pending.resolve({ state, perf: data.payload.perf })
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
        const countPending = countMap.get(data.id)
        if (countPending) {
          countMap.delete(data.id)
          if (!aborted) countPending.reject(new Error(data.error))
        }
      }
    }

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const error = event instanceof ErrorEvent ? event.error : event.data
      const reason = error ?? new Error('Rule cache worker error')
      warmMap.forEach((pending) => {
        pending.reject(reason)
      })
      warmMap.clear()
      countMap.forEach((pending) => {
        pending.reject(reason)
      })
      countMap.clear()
      abortedSet.clear()
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
      warmMap.clear()
      countMap.clear()
      abortedSet.clear()
    }
  }, [])

  const warmCache = useCallback<UseRuleCacheWorkerResult['warmCache']>((params, options) => {
    const signal = options?.signal ?? null

    if (!supportsWorkerEnv || !workerRef.current) {
      const configsForRules = configsForRuleBuild(params.configs)
      const previousCache = fallbackCacheRef.current ?? undefined
      const baseRuleCount = Array.isArray(params.hsf?.Rules) ? (params.hsf?.Rules.length ?? 0) : 0
      const cacheResult = updateConfigRulesCache(previousCache
        ? {
            configs: configsForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
            previousCache,
            baseRuleCount,
          }
        : {
            configs: configsForRules,
            metasets: params.metasets,
            substatTargets: params.substatTargets,
            baseRuleCount,
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
        truncatedConfigIndices: cacheResult.truncatedConfigIndices.slice(),
        totalLimitHit: cacheResult.totalLimitHit,
        excludedByTotalLimitIndices: cacheResult.excludedByTotalLimitIndices.slice(),
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

    pendingWarmRef.current.set(id, { resolve: resolveFn, reject: rejectFn, promise })

    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingWarmRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingWarmRef.current.get(id)?.reject(new DOMException('Aborted', 'AbortError'))
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

  const countRules = useCallback<UseRuleCacheWorkerResult['countRules']>((params, options) => {
    const signal = options?.signal ?? null
    const configs = Array.from(params.configs)

    if (!supportsWorkerEnv || !workerRef.current) {
      // Non-worker environments (SSR/tests) fall back to synchronous counting.
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return Promise.resolve(countRulesForConfigs(configs, params.substatTargets))
    }

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
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
            pendingCountRef.current.get(id)?.reject(new DOMException('Aborted', 'AbortError'))
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
        configs,
        substatTargets: params.substatTargets,
      },
    }

    worker.postMessage(message)

    return promise.finally(() => {
      cleanupAbort?.()
    })
  }, [])

  const flush = useCallback(() => {
    if (!supportsWorkerEnv) return Promise.resolve()
    // Wait for any in-flight warm/count requests so teardown can proceed deterministically.
    const pendingPromises: Promise<unknown>[] = []
    pendingWarmRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    pendingCountRef.current.forEach((entry) => {
      pendingPromises.push(entry.promise)
    })
    if (pendingPromises.length === 0) return Promise.resolve()
    return Promise.all(pendingPromises).then(() => {})
  }, [])

  return useMemo<UseRuleCacheWorkerResult>(() => ({
    warmCache,
    countRules,
    flush,
    supportsWorker: supportsWorkerEnv,
  }), [warmCache, countRules, flush])
}
