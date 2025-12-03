import { useCallback, useEffect, useMemo, useRef } from 'react'
import { updateConfigRulesCache, createConfigRulesCache, type ConfigRulesCache } from '../lib/ruleCache'
import type { BuilderConfig, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import { RULE_SOURCE_KEEP_UNIQUES, computeMergedRules } from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from '../workers/ruleCacheWorkerTypes'
import RuleCacheWorker from '../workers/ruleCacheWorker?worker&inline'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { buildRuleMatchIndexData, primeRuleMatchIndex } from '../lib/ruleMatchIndex'
import type { RuleMatchIndexData } from '../lib/ruleMatchIndex'
import { collectKeepUniqueCandidates, computeKeepUniqueProtection, hasActiveKeepUniqueRules, type KeepUniqueDetectionSnapshot, type KeepUniquesMergeInput } from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type { TesterMatchWorkerItemResult } from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { createProgressThrottler } from '../types/progress'
import type { TesterPreviewMatch } from '../types/testerPreview'

type WarmCacheParams = {
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  hsf: HsfFile | null
  finalSellRemainder?: FinalSellRemainderConfig
  keepUniques: KeepUniquesMergeInput
}

type PipelineParams = WarmCacheParams & {
  configModes: SellfileExportMode[]
  artifacts: NormalizedGearArtifact[]
  artifactSignature?: string | null
  artifactPatch?: {
    changed: Array<[number, NormalizedGearArtifact]>
    removed: number[]
    signature: string | null
  }
  // Explicit worker cache purge when artifacts disappear so keep-unique detection cannot reuse stale entries.
  resetArtifacts?: boolean
  fingerprint?: string | null
  skipWarm?: boolean
  skipMatches?: boolean
  skipDetection?: boolean
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
  ruleMatchIndex: RuleMatchIndexData
}

type WarmCacheResult = {
  state: RuleCacheStateSnapshot
}

type PipelineResult = {
  state: RuleCacheStateSnapshot
  matches: TesterMatchWorkerItemResult[]
  detection: KeepUniqueDetectionSnapshot | null
  fingerprint: string | null
  artifactSignature: string | null
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

// Pending warm requests need to remember attached progress handlers so we can forward worker updates.
type PendingWarmRequest = PendingRequest<WarmCacheResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingPipelineRequest = PendingRequest<PipelineResult> & { onProgress?: (progress: ProgressSnapshot) => void }
type PendingCountRequest = PendingRequest<number[]>

type UseRuleCacheWorkerResult = {
  warmCache: (params: WarmCacheParams, options?: { signal?: AbortSignal; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<WarmCacheResult>
  runPipeline: (params: PipelineParams, options?: { signal?: AbortSignal; onProgress?: (progress: ProgressSnapshot) => void }) => Promise<PipelineResult>
  countRules: (params: CountRulesParams, options?: { signal?: AbortSignal }) => Promise<number[]>
  flush: () => Promise<void>
  supportsWorker: boolean
}

const supportsWorkerEnv = typeof window !== 'undefined' && typeof Worker !== 'undefined'

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingWarmRef = useRef<Map<number, PendingWarmRequest>>(new Map())
  const pendingPipelineRef = useRef<Map<number, PendingPipelineRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
  const abortedIdsRef = useRef<Set<number>>(new Set())
  const fallbackCacheRef = useRef<ConfigRulesCache | null>(supportsWorkerEnv ? null : createConfigRulesCache())
  const fallbackWarmStateRef = useRef<{
    snapshot: RuleCacheStateSnapshot
    configsForRules: BuilderConfig[]
    fingerprint: string | null
  } | null>(null)
  // Keep pipelines latest-wins: abort older runs so we never resolve stale work after a new request arrives.
  const abortPipelineRequest = useCallback((id: number) => {
    const pending = pendingPipelineRef.current.get(id)
    abortedIdsRef.current.add(id)
    pendingPipelineRef.current.delete(id)
    pending?.reject(new DOMException('Aborted', 'AbortError'))
  }, [])
  const abortActivePipelines = useCallback(() => {
    for (const pendingId of pendingPipelineRef.current.keys()) {
      abortPipelineRequest(pendingId)
    }
  }, [abortPipelineRequest])

  const runWarmLocally = useCallback((params: WarmCacheParams, options?: { onProgress?: (progress: ProgressSnapshot) => void }): WarmCacheResult => {
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
          // Forward local progress to consumers whenever a caller opts in.
          ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
        }
      : {
          configs: configsForRules,
          metasets: params.metasets,
          substatTargets: params.substatTargets,
          baseRuleCount,
          ...(options?.onProgress ? { onProgress: options.onProgress } : {}),
        })
    fallbackCacheRef.current = cacheResult.cache
    const mergedRules = computeMergedRules({
      hsf: params.hsf,
      customCfgs: configsForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByConfig,
      keepUniques: params.keepUniques,
    })
    const ruleMatchIndex = buildRuleMatchIndexData(mergedRules)
    const state: RuleCacheStateSnapshot = {
      rulesByConfig: cacheResult.rulesByConfig,
      countsByConfig: cacheResult.countsByConfig,
      keys: cacheResult.keys,
      substatTargetsKey: cacheResult.substatTargetsKey,
      mergedRules,
      truncatedConfigIndices: cacheResult.truncatedConfigIndices.slice(),
      totalLimitHit: cacheResult.totalLimitHit,
      excludedByTotalLimitIndices: cacheResult.excludedByTotalLimitIndices.slice(),
      ruleMatchIndex,
    }
    primeRuleMatchIndex(state.mergedRules, state.ruleMatchIndex)
    fallbackWarmStateRef.current = {
      snapshot: state,
      configsForRules,
      fingerprint: null,
    }
    return { state }
  }, [])

  const runPipelineLocally = useCallback((params: PipelineParams, options?: { onProgress?: (progress: ProgressSnapshot) => void }): PipelineResult => {
    const warmTotal = params.skipWarm ? 0 : params.configs.length
    const needsMatches = params.skipMatches !== true
    const artifactList = (() => {
      if (params.resetArtifacts) return []
      if (params.artifactPatch) {
        // Local fallback does not cache patches; apply patch to a local map per run.
        const map = new Map<number, NormalizedGearArtifact>()
        for (const [itemId, artifact] of params.artifactPatch.changed) {
          map.set(itemId, artifact)
        }
        return Array.from(map.values())
      }
      return params.artifacts
    })()
    // Do not spend detection/match passes when keep-unique is effectively disabled.
    const hasActiveKeepUniques = hasActiveKeepUniqueRules(params.keepUniques)
    const needsDetection = needsMatches
      && params.skipDetection !== true
      && hasActiveKeepUniques
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
    const configsForRules = canReuseWarm ? cachedWarm!.configsForRules : configsForRuleBuild(params.configs)
    let cacheResult
    if (canReuseWarm) {
      cacheResult = {
        cache: fallbackCacheRef.current,
        rulesByConfig: cachedWarm!.snapshot.rulesByConfig,
        countsByConfig: cachedWarm!.snapshot.countsByConfig,
        keys: cachedWarm!.snapshot.keys,
        substatTargetsKey: cachedWarm!.snapshot.substatTargetsKey,
        truncatedConfigIndices: cachedWarm!.snapshot.truncatedConfigIndices,
        totalLimitHit: cachedWarm!.snapshot.totalLimitHit,
        excludedByTotalLimitIndices: cachedWarm!.snapshot.excludedByTotalLimitIndices,
      }
      completed = warmTotal
    } else {
      const previousCache = fallbackCacheRef.current ?? undefined
      const baseRuleCount = Array.isArray(params.hsf?.Rules) ? (params.hsf?.Rules.length ?? 0) : 0
      cacheResult = updateConfigRulesCache(previousCache
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
      fallbackCacheRef.current = cacheResult.cache ?? null
      completed = warmTotal
    }
    if (total > 0 && completed > 0) emitProgress()

    const baseKeepUniques = hasActiveKeepUniques
      ? { ...params.keepUniques, detection: null }
      : params.keepUniques
    const mergedRulesBaseline = computeMergedRules({
      hsf: params.hsf,
      customCfgs: configsForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByConfig,
      keepUniques: baseKeepUniques,
    })

    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    if (needsDetection) {
      for (const artifact of artifactList) {
        if (!artifact) continue
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? NaN)
        if (!Number.isFinite(itemId)) continue
        const baseEval = evaluateMatchesByConfig(
          mergedRulesBaseline,
          artifact.testerItem,
          { configModes: params.configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] },
        )
        baselineMatchMap.set(itemId, {
          itemId,
          firstMatch: baseEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstNonExcludedMatch ?? baseEval.firstMatch,
          matchingConfigIndices: baseEval.matchingConfigIndices,
        })
      }
      completed += artifactList.length
      if (total > 0) emitProgress()
    }

    const toPreviewMatch = (result: ReturnType<typeof evaluateMatchesByConfig>['firstMatch'], rules: HsfRuleWithCfg[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const cfgIdx = result.cfgIdx ?? null
      return {
        ruleIndex: result.ruleIndex,
        keep: result.keep,
        cfgIdx,
        cfgName: null,
        ruleLabel: null,
        ruleSource: rule?.__source ?? null,
      }
    }

    let detectionSnapshot: KeepUniqueDetectionSnapshot | null = null
    if (needsDetection) {
      const rows = artifactList.map((artifact, idx) => {
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? idx ?? NaN)
        const match = baselineMatchMap.get(itemId)
        return {
          artifact,
          match: null,
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          matchingCfgIndices: match?.matchingConfigIndices ?? [],
        }
      })
      const candidates = collectKeepUniqueCandidates({
        rows,
        baseRules: mergedRulesBaseline,
        configModes: params.configModes,
      })
      detectionSnapshot = computeKeepUniqueProtection({
        candidates: candidates.candidates,
        rules: params.keepUniques.rules,
        enabled: params.keepUniques.enabled,
      })
    }

    const mergedRulesFinal = computeMergedRules({
      hsf: params.hsf,
      customCfgs: configsForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByConfig,
      keepUniques: baseKeepUniques
        ? { ...params.keepUniques, detection: detectionSnapshot }
        : params.keepUniques,
    })

    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      for (const artifact of artifactList) {
        if (!artifact) continue
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
        if (!Number.isFinite(itemId)) continue
        const fullEval = evaluateMatchesByConfig(mergedRulesFinal, artifact.testerItem, { configModes: params.configModes })
        const baseEval = baselineMatchMap.get(itemId)
          ?? evaluateMatchesByConfig(
            mergedRulesFinal,
            artifact.testerItem,
            { configModes: params.configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] },
          )
        matches.push({
          itemId,
          firstMatch: fullEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstMatch,
          matchingConfigIndices: fullEval.matchingConfigIndices,
        })
        completed += 1
        if (total > 0 && options?.onProgress) emitProgress()
      }
    }

    const state: RuleCacheStateSnapshot = {
      rulesByConfig: cacheResult.rulesByConfig instanceof Map ? cacheResult.rulesByConfig : new Map<number, HsfRuleWithCfg[]>(cacheResult.rulesByConfig),
      countsByConfig: cacheResult.countsByConfig instanceof Map ? cacheResult.countsByConfig : new Map<number, number>(cacheResult.countsByConfig),
      keys: cacheResult.keys.slice(),
      substatTargetsKey: cacheResult.substatTargetsKey,
      mergedRules: mergedRulesFinal,
      truncatedConfigIndices: cacheResult.truncatedConfigIndices.slice(),
      totalLimitHit: cacheResult.totalLimitHit,
      excludedByTotalLimitIndices: cacheResult.excludedByTotalLimitIndices.slice(),
      ruleMatchIndex: buildRuleMatchIndexData(mergedRulesFinal),
    }
    primeRuleMatchIndex(state.mergedRules, state.ruleMatchIndex)
    fallbackWarmStateRef.current = {
      snapshot: state,
      configsForRules,
      fingerprint: params.fingerprint ?? null,
    }
    return {
      state,
      matches,
      detection: detectionSnapshot,
      fingerprint: params.fingerprint ?? null,
      artifactSignature: params.artifactSignature ?? params.artifactPatch?.signature ?? null,
    }
  }, [])

  useEffect(() => {
    if (!supportsWorkerEnv) return
    const worker = new RuleCacheWorker()
    workerRef.current = worker
    const warmMap = pendingWarmRef.current
    const pipelineMap = pendingPipelineRef.current
    const countMap = pendingCountRef.current
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
          ruleMatchIndex: data.payload.ruleMatchIndex,
        }
        primeRuleMatchIndex(state.mergedRules, state.ruleMatchIndex)
        pending.resolve({ state })
        return
      }
      if (data.kind === 'pipeline:done') {
        const aborted = abortedSet.delete(data.id)
        const pending = pipelineMap.get(data.id)
        if (!pending) return
        pipelineMap.delete(data.id)
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
          ruleMatchIndex: data.payload.ruleMatchIndex,
        }
        primeRuleMatchIndex(state.mergedRules, state.ruleMatchIndex)
        pending.resolve({
          state,
          matches: data.payload.matches,
          detection: data.payload.detection,
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

    const handleError = (event: ErrorEvent | MessageEvent) => {
      const error = event instanceof ErrorEvent ? event.error : event.data
      const reason = error ?? new Error('Rule cache worker error')
      warmMap.forEach((pending) => {
        pending.reject(reason)
      })
      warmMap.clear()
      pipelineMap.forEach((pending) => {
        pending.reject(reason)
      })
      pipelineMap.clear()
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
      pipelineMap.clear()
      countMap.clear()
      abortedSet.clear()
    }
  }, [])

  const warmCache = useCallback<UseRuleCacheWorkerResult['warmCache']>((params, options) => {
    const signal = options?.signal ?? null

    // Local fallback should stay parity with worker mode, including determinate updates.
    const localProgressOptions = options?.onProgress ? { onProgress: options.onProgress } : undefined
    if (!supportsWorkerEnv || !workerRef.current) {
      return Promise.resolve(runWarmLocally(params, localProgressOptions))
    }

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current

    const runFallback = (_error: unknown): Promise<WarmCacheResult> => {
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return Promise.resolve(runWarmLocally(params, localProgressOptions))
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
        keepUniques: params.keepUniques,
      },
    }

    try {
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
          return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }
        return runFallback(error)
      })
      .finally(() => {
        cleanupAbort?.()
      })
  }, [runWarmLocally])

  const runPipeline = useCallback<UseRuleCacheWorkerResult['runPipeline']>((params, options) => {
    const signal = options?.signal ?? null
    const localProgressOptions = options?.onProgress
      ? { onProgress: createProgressThrottler(options.onProgress) }
      : undefined
    if (!supportsWorkerEnv || !workerRef.current) {
      return Promise.resolve(runPipelineLocally(params, localProgressOptions))
    }

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }
    // Ensure only the newest pipeline runs so UI stays aligned with the latest inputs.
    if (pendingPipelineRef.current.size > 0) {
      abortActivePipelines()
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current
    const runFallback = (_error: unknown): Promise<PipelineResult> => {
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return Promise.resolve(runPipelineLocally(params, localProgressOptions))
    }

    let resolveFn: (value: PipelineResult) => void = () => {}
    let rejectFn: (reason?: unknown) => void = () => {}
    const promise = new Promise<PipelineResult>((resolve, reject) => {
      resolveFn = resolve
      rejectFn = reject
    })

    const pendingEntry: PendingPipelineRequest = {
      resolve: resolveFn,
      reject: rejectFn,
      promise,
      ...(options?.onProgress ? { onProgress: createProgressThrottler(options.onProgress) } : {}),
    }
    pendingPipelineRef.current.set(id, pendingEntry)
    const cleanupAbort = signal
      ? (() => {
          const abortHandler = () => {
            if (!pendingPipelineRef.current.has(id)) return
            abortedIdsRef.current.add(id)
            pendingPipelineRef.current.get(id)?.reject(new DOMException('Aborted', 'AbortError'))
            pendingPipelineRef.current.delete(id)
          }
          signal.addEventListener('abort', abortHandler, { once: true })
          return () => signal.removeEventListener('abort', abortHandler)
        })()
      : null

    const message: RuleCacheWorkerRequest = {
      id,
      kind: 'pipeline',
      payload: {
        configs: params.configs,
        metasets: params.metasets,
        substatTargets: params.substatTargets,
        hsf: params.hsf,
        ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
        keepUniques: params.keepUniques,
        configModes: params.configModes,
        artifacts: params.artifacts,
        ...(params.artifactPatch ? { artifactPatch: params.artifactPatch } : {}),
        ...(params.artifactSignature !== undefined ? { artifactSignature: params.artifactSignature ?? null } : {}),
        resetArtifacts: params.resetArtifacts ?? false,
        fingerprint: params.fingerprint ?? null,
        skipWarm: params.skipWarm ?? false,
        skipMatches: params.skipMatches ?? false,
        skipDetection: params.skipDetection ?? false,
      },
    }

    try {
      worker.postMessage(message)
    } catch (_error) {
      pendingPipelineRef.current.delete(id)
      cleanupAbort?.()
      return runFallback(_error)
    }

    return promise
      .catch((error) => {
        const aborted = abortedIdsRef.current.delete(id)
        if (aborted) {
          return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }
        return runFallback(error)
      })
      .finally(() => {
        cleanupAbort?.()
      })
  }, [runPipelineLocally])

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
    pendingPipelineRef.current.forEach((entry) => {
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
    runPipeline,
    countRules,
    flush,
    supportsWorker: supportsWorkerEnv,
  }), [warmCache, runPipeline, countRules, flush])
}
