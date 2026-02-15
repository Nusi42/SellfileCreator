import { useCallback, useEffect, useMemo, useRef } from 'react'
import { updateConfigRulesCache, createConfigRulesCache, type ConfigRulesCache } from '../lib/ruleCache'
import type { BuilderConfig, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { HsfRuleWithCfg } from '../lib/merge'
import {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_KEEP_UNIQUES,
  computeMergedRules,
} from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import type { RuleCachePipelinePhase, RuleCacheWorkerRequest, RuleCacheWorkerResponse } from '../workers/ruleCacheWorkerTypes'
import RuleCacheWorker from '../workers/ruleCacheWorker?worker&inline'
import type { HsfFile } from '../lib/hsfTypes'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import {
  buildIgnoreKeepUniqueConfigIndices,
  collectAndComputeKeepUniqueProtection,
  hasActiveKeepUniqueRules,
  resolveKeepUniqueRuleLabel,
  type KeepUniqueDetectionSnapshot,
  type KeepUniquesMergeInput,
} from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type { TesterMatchWorkerItemResult } from '../workers/testerMatchWorkerTypes'
import type { ProgressSnapshot } from '../types/progress'
import { createProgressThrottler } from '../types/progress'
import type { TesterPreviewMatch } from '../types/testerPreview'
import { resolveMatchConfigName } from '../lib/ruleConfigIndex'
import { PERF_EVENTS, markPerfEvent } from '../lib/perfTimeline'
import { warmupWasmRuleEngine } from '../lib/wasm/wasmRuleEngine'

type WarmCacheParams = {
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  hsf: HsfFile | null
  finalSellRemainder?: FinalSellRemainderConfig
  // Keep Uniques state feeds rule injection during warm merges.
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
}

type WarmCacheResult = {
  state: RuleCacheStateSnapshot
}

type PipelineResult = {
  state: RuleCacheStateSnapshot
  matches: TesterMatchWorkerItemResult[]
  // Keep-unique detection snapshot for the Keep Uniques tab.
  keepUniqueDetection: KeepUniqueDetectionSnapshot | null
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
  // Baseline passes capture the initial match evaluation before keep-unique overrides.
  'baseline:start': PERF_EVENTS.ruleCacheBaselineStart,
  // Baseline done marks the end of the initial matcher pass.
  'baseline:done': PERF_EVENTS.ruleCacheBaselineDone,
  // Detection start marks the keep-unique detection snapshot phase.
  'detection:start': PERF_EVENTS.ruleCacheDetectionStart,
  // Detection done signals the end of keep-unique snapshot building.
  'detection:done': PERF_EVENTS.ruleCacheDetectionDone,
  // Final start marks the keep-unique-adjusted match pass.
  'final:start': PERF_EVENTS.ruleCacheFinalMatchStart,
  // Final done marks the end of match evaluation.
  'final:done': PERF_EVENTS.ruleCacheFinalMatchDone,
}

export function useRuleCacheWorker(): UseRuleCacheWorkerResult {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const pendingWarmRef = useRef<Map<number, PendingWarmRequest>>(new Map())
  const pendingPipelineRef = useRef<Map<number, PendingPipelineRequest>>(new Map())
  const pendingCountRef = useRef<Map<number, PendingCountRequest>>(new Map())
  const abortedIdsRef = useRef<Set<number>>(new Set())
  const fallbackCacheRef = useRef<ConfigRulesCache | null>(supportsWorkerEnv ? null : createConfigRulesCache())
  // Local test runs skip Web Workers, so keep our own artifact map to mimic the patch behavior.
  const fallbackArtifactsRef = useRef<Map<number, NormalizedGearArtifact>>(new Map())
  const fallbackWarmStateRef = useRef<{
    snapshot: RuleCacheStateSnapshot
    configsForRules: BuilderConfig[]
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
      // Keep overrides must be included so warm merges match pipeline merges.
      keepUniques: params.keepUniques,
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
    // Avoid detection passes unless at least one keep-override feature is active.
    const hasActiveKeepUniques = hasActiveKeepUniqueRules(params.keepUniques)
    // Keep overrides are active when Keep Uniques is enabled.
    const hasActiveKeepOverrides = hasActiveKeepUniques
    const needsDetection = needsMatches
      && params.skipDetection !== true
      && hasActiveKeepOverrides
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

    // Baseline merges should exclude detection artifacts to avoid double-injection.
    const baseKeepUniques = hasActiveKeepUniques
      ? { ...params.keepUniques, detection: null }
      : params.keepUniques
    // Precompute ignore-tag indices so matcher precedence can reuse them.
    const ignoreKeepUniqueConfigIndices = buildIgnoreKeepUniqueConfigIndices(configsForRules)
    const mergedRulesBaseline = computeMergedRules({
      hsf: params.hsf,
      customCfgs: configsForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByConfig,
      // Keep overrides must be excluded from the baseline so detection sees raw sell outcomes.
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
          // Baseline excludes keep overrides so detection stays honest.
          { configModes: params.configModes, excludeSources: KEEP_OVERRIDE_RULE_SOURCES },
        )
        baselineMatchMap.set(itemId, {
          itemId,
          firstMatch: baseEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstNonExcludedMatch ?? baseEval.firstMatch,
          matchingConfigIndices: baseEval.matchingConfigIndices,
          matchingConfigDecisions: baseEval.matchingConfigDecisions,
        })
      }
      completed += artifactList.length
      if (total > 0) emitProgress()
    }

    const toPreviewMatch = (result: ReturnType<typeof evaluateMatchesByConfig>['firstMatch'], rules: HsfRuleWithCfg[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const cfgIdx = result.cfgIdx ?? null
      const cfgName = resolveMatchConfigName(cfgIdx, null, rule)
      // Keep Uniques render with a rule ordinal label instead of a config name.
      const keepUniqueLabel = rule?.__source === RULE_SOURCE_KEEP_UNIQUES
        ? resolveKeepUniqueRuleLabel(rule)
        : null
      // Prefer real config names but fall back to keep-override labels.
      const effectiveCfgName = cfgName && cfgName.length > 0
        ? cfgName
        : keepUniqueLabel
      return {
        ruleIndex: result.ruleIndex,
        keep: result.keep,
        cfgIdx,
        cfgName: effectiveCfgName && effectiveCfgName.length > 0 ? effectiveCfgName : null,
        ruleLabel: keepUniqueLabel ?? null,
        ruleSource: rule?.__source ?? null,
      }
    }

    // Keep override detection snapshots feed merged rule injection.
    let keepUniqueDetectionSnapshot: KeepUniqueDetectionSnapshot | null = null
    if (needsDetection) {
      // Build candidate rows so keep overrides only consider sellable items.
      const rows = artifactList.map((artifact, idx) => {
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? idx ?? NaN)
        const match = baselineMatchMap.get(itemId)
        return {
          artifact,
          match: null,
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          matchingCfgIndices: match?.matchingConfigIndices ?? [],
          matchingConfigDecisions: match?.matchingConfigDecisions ?? [],
        }
      })
      // Run collect + detection together so wasm owns one full detection pass.
      const combinedDetection = collectAndComputeKeepUniqueProtection({
        rows,
        baseRules: mergedRulesBaseline,
        configModes: params.configModes,
        rules: params.keepUniques.rules,
        enabled: params.keepUniques.enabled,
        ignoreKeepUniqueConfigIndices,
      })
      // Keep Uniques snapshot drives rule injection + UI counts.
      keepUniqueDetectionSnapshot = combinedDetection.detection
    }

    const mergedRulesFinal = computeMergedRules({
      hsf: params.hsf,
      customCfgs: configsForRules,
      metasets: params.metasets,
      substatTargets: params.substatTargets,
      ...(params.finalSellRemainder ? { finalSellRemainder: params.finalSellRemainder } : {}),
      prebuiltCustomRules: cacheResult.rulesByConfig,
      // Inject keep-unique rules only when detection is active.
      keepUniques: baseKeepUniques
        ? { ...params.keepUniques, detection: keepUniqueDetectionSnapshot }
        : params.keepUniques,
    })

    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      for (const artifact of artifactList) {
        if (!artifact) continue
        const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
        if (!Number.isFinite(itemId)) continue
        const fullEval = evaluateMatchesByConfig(
          mergedRulesFinal,
          artifact.testerItem,
          { configModes: params.configModes, ignoreKeepUniqueConfigIndices },
        )
        const baseEval = baselineMatchMap.get(itemId)
          ?? evaluateMatchesByConfig(
            mergedRulesFinal,
            artifact.testerItem,
            // Baseline keeps ignore keep overrides so precedence math stays correct.
            { configModes: params.configModes, excludeSources: KEEP_OVERRIDE_RULE_SOURCES },
          )
        matches.push({
          itemId,
          firstMatch: fullEval.firstMatch,
          firstNonExcludedMatch: baseEval.firstMatch,
          matchingConfigIndices: fullEval.matchingConfigIndices,
          matchingConfigDecisions: fullEval.matchingConfigDecisions,
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
    }
    fallbackWarmStateRef.current = {
      snapshot: state,
      configsForRules,
      fingerprint: params.fingerprint ?? null,
    }
    return {
      state,
      matches,
      // Keep Uniques detection snapshot supports the tab UI.
      keepUniqueDetection: keepUniqueDetectionSnapshot,
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
          rulesByConfig: new Map<number, HsfRuleWithCfg[]>(data.payload.rulesByConfigEntries),
          countsByConfig: new Map<number, number>(data.payload.countsByConfigEntries),
          keys: data.payload.keys,
          substatTargetsKey: data.payload.substatTargetsKey,
          mergedRules: data.payload.mergedRules,
          truncatedConfigIndices: data.payload.truncatedConfigIndices.slice(),
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
          // Detection is considered active when keep-unique snapshot exists.
          detection: Boolean(data.payload.keepUniqueDetection),
        }))
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
        pending.resolve({
          state,
          matches: data.payload.matches,
          // Keep-unique snapshot feeds the Keep Uniques tab.
          keepUniqueDetection: data.payload.keepUniqueDetection,
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
      // Mark warm start before running the local fallback.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmStart, () => ({
        configs: params.configs.length,
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
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    const worker = workerRef.current
    const id = ++requestIdRef.current

    const runFallback = (_error: unknown): Promise<WarmCacheResult> => {
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
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
        // Keep override inputs must ride the worker request so merges stay consistent.
        keepUniques: params.keepUniques,
      },
    }

    try {
      // Mark warm start before dispatching to the worker.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCacheWarmStart, () => ({
        id,
        configs: params.configs.length,
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
          return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }
        return runFallback(error)
      })
      .finally(() => {
        cleanupAbort?.()
      })
  }, [ensureLocalWasmReady, runWarmLocally])

  const runPipeline = useCallback<UseRuleCacheWorkerResult['runPipeline']>((params, options) => {
    const signal = options?.signal ?? null
    const localProgressOptions = options?.onProgress
      ? { onProgress: createProgressThrottler(options.onProgress) }
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
      return ensureLocalWasmReady().then(() => {
        const result = runPipelineLocally(params, localProgressOptions)
        // Mark pipeline fallback completion for perf traces.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineFallback, () => ({
          rules: result.state.mergedRules.length,
          matches: result.matches.length,
        }))
        // Mirror the completion marker for local pipeline runs.
        maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineDone, () => ({
          rules: result.state.mergedRules.length,
          matches: result.matches.length,
          // Detection is active when keep-unique snapshot exists.
          detection: Boolean(result.keepUniqueDetection),
        }))
        return result
      })
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
      return ensureLocalWasmReady().then(() => runPipelineLocally(params, localProgressOptions))
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
        // Keep overrides must be supplied so detection + merges match the UI.
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
      // Mark pipeline start before dispatching to the worker.
      maybeMarkPerfEvent(PERF_EVENTS.ruleCachePipelineStart, () => ({
        id,
        artifacts: params.artifacts?.length ?? 0,
        worker: true,
        skipWarm: params.skipWarm ?? false,
        skipMatches: params.skipMatches ?? false,
        skipDetection: params.skipDetection ?? false,
      }))
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
  }, [abortActivePipelines, ensureLocalWasmReady, runPipelineLocally])

  const countRules = useCallback<UseRuleCacheWorkerResult['countRules']>((params, options) => {
    const signal = options?.signal ?? null
    const configs = Array.from(params.configs)

    if (!supportsWorkerEnv || !workerRef.current) {
      // Non-worker environments (SSR/tests) fall back to synchronous counting.
      if (signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'))
      }
      return ensureLocalWasmReady().then(() => countRulesForConfigs(configs, params.substatTargets))
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
  }, [ensureLocalWasmReady])

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
