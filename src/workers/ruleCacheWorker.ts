/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_KEEP_UNIQUES,
  computeMergedRules,
} from '../lib/merge'
import { configsForRuleBuild } from '../lib/ruleCacheHelpers'
import type { EvalResult } from '../lib/ruleEval'
import {
  buildIgnoreKeepUniqueConfigIndices,
  collectKeepUniqueCandidates,
  computeKeepUniqueProtection,
  hasActiveKeepUniqueRules,
  resolveKeepUniqueRuleLabel,
} from '../lib/keepUniques'
import type { KeepUniqueDetectionSnapshot } from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { BuilderConfig, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
import type { TesterPreviewMatch } from '../types/testerPreview'
import type { RuleCachePipelinePhase, RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveMatchConfigName } from '../lib/ruleConfigIndex'
import { fingerprintRuleTesterItem } from '../lib/ruleTesterSession'
import type { RuleTesterItem } from '../lib/ruleTesterSession'
import { fingerprintKeepUniqueDetection } from '../lib/keepUniqueFingerprint'
import {
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmRuleEngineVersion,
  warmupWasmRuleEngine,
} from '../lib/wasm/wasmRuleEngine'

declare const self: DedicatedWorkerGlobalScope

type WarmState = {
  rulesByConfig: Map<number, HsfRuleWithCfg[]>
  countsByConfig: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedConfigIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
  configsForRules: BuilderConfig[]
  fingerprint: string | null
  artifactSignature: string | null
}

let cache = createConfigRulesCache()
let lastWarmState: WarmState | null = null

// Cache reuse remains enabled by default; tests can disable it explicitly.
const WASM_EXPERIMENT_DISABLE_CACHES = (
  (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.VITE_WASM_DISABLE_CACHE_REUSE === '1'
)
// Log the loaded WASM version once per worker so perf transcripts can confirm
// which binary was active during a run.
let wasmVersionLogged = false
let wasmWarmupPromise: Promise<void> | null = null

// Local cache entry tracks both the artifact fingerprint and its cached matcher results.
type CachedArtifactEntry = {
  artifact: NormalizedGearArtifact
  fingerprint: string
  baseMatch: TesterMatchWorkerItemResult | null
  // Signature ties baseMatch to the rule/config snapshot it was computed against.
  baseMatchSignature: string | null
  finalMatch: TesterMatchWorkerItemResult | null
  finalMatchSignature: string | null
}

// Cache tester artifacts across pipeline runs so patches can be applied incrementally.
const artifactCache = new Map<number, CachedArtifactEntry>()

const postError = (id: number, error: unknown): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
  self.postMessage(response)
}

const postWarmProgress = (id: number, payload: { completed: number; total: number }): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'warm:progress',
    payload,
  }
  self.postMessage(response)
}

const postPipelineProgress = (id: number, payload: { completed: number; total: number }): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'pipeline:progress',
    payload,
  }
  self.postMessage(response)
}

// Emit lightweight phase markers so perf timelines can break down pipeline stages.
const postPipelinePhase = (
  id: number,
  phase: RuleCachePipelinePhase,
  data?: Record<string, string | number | boolean | null>,
): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'pipeline:phase',
    payload: {
      phase,
      ...(data ? { data } : {}),
    },
  }
  self.postMessage(response)
}

// Warmup is mandatory in WASM mode because generation finalization and matcher
// paths rely on sync wasm calls after initialization.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) {
    wasmWarmupPromise = warmupWasmRuleEngine()
  }
  await wasmWarmupPromise
}

// Worker-only finalizer delegates branch-rule post-processing to wasm.
// Returning null indicates wasm was not initialized, which is treated as fatal.
const finalizeGeneratedRulesForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
  const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
  if (!finalized) {
    throw new Error('WASM rule generation finalizer is unavailable after warmup.')
  }
  return finalized
}

// Builder-count requests are served from the same cache-generation machinery as
// warm/pipeline so wasm-enabled branches measure the same generation path.
const countRulesForConfigsWithWorkerCache = (
  configs: readonly BuilderConfig[],
  substatTargets: SubstatTargetTable,
): number[] => {
  const configsForRules = configsForRuleBuild(configs)
  const result = updateConfigRulesCache({
    configs: configsForRules,
    // Builder-count payload does not include metasets, so we preserve legacy
    // semantics by using an empty list in this fast-count path.
    metasets: [],
    substatTargets,
    // Keep this request independent from warm/pipeline cache state.
    previousCache: createConfigRulesCache(),
    // Count badges are per-config and should not be clipped by total limits.
    totalLimit: Number.POSITIVE_INFINITY,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
  })
  const counts: number[] = []
  for (let idx = 0; idx < configsForRules.length; idx += 1) {
    counts.push(result.countsByConfig.get(idx) ?? 0)
  }
  return counts
}

const buildBaseMatchSignature = (payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload']): string => {
  // Fingerprint captures config order + keep-unique rules + final-sell inputs.
  const fingerprint = payload.fingerprint ?? 'null'
  // Config modes alter the matcher gate (disabled/separator), so include them too.
  const modes = Array.isArray(payload.configModes) ? payload.configModes.join('|') : ''
  return `${fingerprint}|modes:${modes}`
}

const buildWarmState = (
  id: number,
  payload: Extract<RuleCacheWorkerRequest, { kind: 'warm' | 'pipeline' }>['payload'],
  options?: { skipProgress?: boolean; fingerprint?: string | null },
): { state: WarmState; mergedRules: HsfRuleWithCfg[] } => {
  const configsForRules = configsForRuleBuild(payload.configs)
  const baseRuleCount = Array.isArray(payload.hsf?.Rules) ? (payload.hsf?.Rules.length ?? 0) : 0
  let lastProgress = 0
  const handleProgress = options?.skipProgress === true
    ? null
    : (progress: { completed: number; total: number }) => {
      // Forward determinate warm progress to the main thread so the single
      // workload indicator stays in sync with heavy merges.
      if (progress.completed === lastProgress) return
      lastProgress = progress.completed
      postWarmProgress(id, progress)
    }
  const result = updateConfigRulesCache({
    configs: configsForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    // WASM experiment bypasses warm-cache reuse to expose raw rebuild costs.
    ...(WASM_EXPERIMENT_DISABLE_CACHES ? {} : { previousCache: cache }),
    baseRuleCount,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
    ...(handleProgress ? { onProgress: handleProgress } : {}),
  })
  // Keep the cache map in sync for non-experiment runs; in WASM mode we reset
  // to an empty cache so subsequent warm calls cannot reuse stale entries.
  cache = WASM_EXPERIMENT_DISABLE_CACHES ? createConfigRulesCache() : result.cache
  const mergedRules = computeMergedRules({
    hsf: payload.hsf,
    customCfgs: configsForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
    prebuiltCustomRules: result.rulesByConfig,
    // Keep overrides travel with warm merges so cached rules stay accurate.
    keepUniques: payload.keepUniques,
  })
  const state: WarmState = {
    rulesByConfig: result.rulesByConfig,
    countsByConfig: result.countsByConfig,
    keys: result.keys.slice(),
    substatTargetsKey: result.substatTargetsKey,
    truncatedConfigIndices: result.truncatedConfigIndices.slice(),
    totalLimitHit: result.totalLimitHit,
    excludedByTotalLimitIndices: result.excludedByTotalLimitIndices.slice(),
    configsForRules,
    fingerprint: options?.fingerprint ?? null,
    artifactSignature: null,
  }
  lastWarmState = state
  return { state, mergedRules }
}

const reuseWarmState = (
  fingerprint: string | null | undefined,
  skipWarm: boolean | undefined,
): WarmState | null => {
  // WASM experiment intentionally drops warm-state reuse.
  if (WASM_EXPERIMENT_DISABLE_CACHES) return null
  if (!lastWarmState) return null
  const fingerprintsMatch = fingerprint != null ? fingerprint === lastWarmState.fingerprint : false
  if (skipWarm && fingerprintsMatch) return lastWarmState
  if (fingerprintsMatch) return lastWarmState
  return null
}

const toWarmResponsePayload = (
  state: WarmState,
  mergedRules: HsfRuleWithCfg[],
): RuleCacheWorkerResponse => ({
  id: 0,
  kind: 'warm:done',
  payload: {
    rulesByConfigEntries: Array.from(state.rulesByConfig.entries()),
    countsByConfigEntries: Array.from(state.countsByConfig.entries()),
    keys: state.keys.slice(),
    substatTargetsKey: state.substatTargetsKey,
    mergedRules,
    truncatedConfigIndices: state.truncatedConfigIndices.slice(),
    totalLimitHit: state.totalLimitHit,
    excludedByTotalLimitIndices: state.excludedByTotalLimitIndices.slice(),
  },
})

const resolveItemId = (artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
  const testerId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
  if (Number.isFinite(testerId)) return testerId
  const artifactId = Number((artifact as { id?: number } | undefined)?.id ?? NaN)
  if (Number.isFinite(artifactId)) return artifactId
  if (typeof fallbackIdx === 'number') return -(fallbackIdx + 1)
  return -1
}

const fingerprintArtifact = (artifact: NormalizedGearArtifact): string => {
  try {
    const testerPayload = artifact.testerItem as RuleTesterItem | undefined
    // Manual gear always surfaces a tester payload, but keep the function defensive so
    // corrupted payloads simply drop out of the cache.
    return testerPayload ? fingerprintRuleTesterItem(testerPayload) : ''
  } catch {
    return ''
  }
}

// Merge the new artifact into the cache while reusing cached matcher answers whenever
// the fingerprint proves the payload is identical to the last run.
const upsertArtifactCacheEntry = (itemId: number, artifact: NormalizedGearArtifact): void => {
  const nextFingerprint = fingerprintArtifact(artifact)
  const previous = artifactCache.get(itemId)
  const canReuseMatches = !WASM_EXPERIMENT_DISABLE_CACHES && Boolean(previous && previous.fingerprint === nextFingerprint)
  artifactCache.set(itemId, {
    artifact,
    fingerprint: nextFingerprint,
    // Preserve base matches only when the item payload fingerprint matches.
    baseMatch: canReuseMatches ? previous!.baseMatch : null,
    // Keep the signature aligned with the preserved base match.
    baseMatchSignature: canReuseMatches ? previous!.baseMatchSignature : null,
    // Preserve final matches only when the item payload fingerprint matches.
    finalMatch: canReuseMatches ? previous!.finalMatch : null,
    // Carry forward the final-match signature when its payload matches.
    finalMatchSignature: canReuseMatches ? previous!.finalMatchSignature : null,
  })
}

// Convert the cache map to the tuple shape the rest of the pipeline expects.
const artifactEntriesFromCache = (): Array<[number, NormalizedGearArtifact]> => {
  const entries: Array<[number, NormalizedGearArtifact]> = []
  artifactCache.forEach((entry, itemId) => {
    entries.push([itemId, entry.artifact])
  })
  return entries
}

const buildPipelineMatches = async (
  mergedRules: HsfRuleWithCfg[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  configModes: SellfileExportMode[] | undefined,
  _baseMatchMap: Map<number, TesterMatchWorkerItemResult> | null,
  ignoreKeepUniqueConfigIndices: ReadonlySet<number> | null,
  total: number,
  completedRef: { value: number },
  id: number,
  emitProgress: boolean,
  hasKeepOverrideRules: boolean,
) : Promise<TesterMatchWorkerItemResult[]> => {
  if (!artifactEntries.length) return []
  // Configure per phase so the WASM state aligns with the current ruleset.
  await configureWasmRuleEngine({
    rules: mergedRules,
    configModes: Array.isArray(configModes) ? configModes : [],
  })
  if (!wasmVersionLogged) {
    await getWasmRuleEngineVersion()
    wasmVersionLogged = true
  }
  // Full matcher pass mirrors evaluateMatchesByConfig with keep-unique
  // precedence options included.
  const fullItems = artifactEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
  const fullResults = await evaluateWasmRuleEngineItems({
    items: fullItems,
    options: {
      ...(ignoreKeepUniqueConfigIndices ? { ignoreKeepUniqueConfigIndices } : {}),
      ...(hasKeepOverrideRules ? { baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES } : {}),
    },
  })
  const fullByItemId = new Map<number, TesterMatchWorkerItemResult>()
  fullResults.forEach((entry) => fullByItemId.set(entry.itemId, entry))
  const results: TesterMatchWorkerItemResult[] = []
  for (const [itemId] of artifactEntries) {
    const fullEval = fullByItemId.get(itemId)
    if (!fullEval) continue
    results.push({
      itemId,
      firstMatch: fullEval.firstMatch,
      firstNonExcludedMatch: (
        fullEval.firstNonExcludedMatch
        ?? fullEval.firstMatch
        ?? null
      ),
      matchingConfigIndices: fullEval.matchingConfigIndices,
      matchingConfigDecisions: fullEval.matchingConfigDecisions,
    })
    if (!emitProgress) continue
    completedRef.value += 1
    postPipelineProgress(id, { completed: completedRef.value, total })
  }
  return results
}

// Keep-unique candidate detection needs baseline keep/sell decisions with some
// configs excluded. Batch evaluation avoids per-row JS re-scans in that phase.
const buildExcludedConfigBaselineMap = async (
  mergedRules: HsfRuleWithCfg[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  configModes: SellfileExportMode[] | undefined,
  excludeConfigIndices: ReadonlySet<number>,
): Promise<Map<number, TesterMatchWorkerItemResult>> => {
  const byItem = new Map<number, TesterMatchWorkerItemResult>()
  if (!artifactEntries.length || excludeConfigIndices.size === 0) return byItem
  // Configure with the baseline ruleset so exclude-index evaluation mirrors JS.
  await configureWasmRuleEngine({
    rules: mergedRules,
    configModes: Array.isArray(configModes) ? configModes : [],
  })
  const items = artifactEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.testerItem }))
  const evaluated = await evaluateWasmRuleEngineItems({
    items,
    options: { excludeConfigIndices },
  })
  for (const entry of evaluated) {
    byItem.set(entry.itemId, {
      itemId: entry.itemId,
      firstMatch: entry.firstMatch,
      firstNonExcludedMatch: entry.firstNonExcludedMatch ?? entry.firstMatch,
      matchingConfigIndices: entry.matchingConfigIndices,
      matchingConfigDecisions: entry.matchingConfigDecisions,
    })
  }
  // Fill any unexpected gaps so downstream row assembly can treat the map as complete.
  for (const [itemId] of artifactEntries) {
    if (byItem.has(itemId)) continue
    byItem.set(itemId, {
      itemId,
      firstMatch: null,
      firstNonExcludedMatch: null,
      matchingConfigIndices: [],
      matchingConfigDecisions: [],
    })
  }
  return byItem
}

self.onmessage = async (event: MessageEvent<RuleCacheWorkerRequest>) => {
  const message = event.data
  if (!message) return
  // WASM mode is fail-closed: if warmup fails we report the error per request.
  try {
    await ensureWasmWorkerReady()
  } catch (error) {
    postError(message.id, error)
    return
  }
  if (message.kind === 'builderCount') {
    const { id, payload } = message
    try {
      // BuilderPanel requests per-config rule counts through this fast path so the UI stays responsive.
      const counts = countRulesForConfigsWithWorkerCache(payload.configs, payload.substatTargets)
      const response: RuleCacheWorkerResponse = {
        id,
        kind: 'builderCount:done',
        payload: { counts },
      }
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  if (message.kind === 'warm') {
    const { id, payload } = message
    try {
      const { state, mergedRules } = buildWarmState(id, payload)
      const response = toWarmResponsePayload(state, mergedRules)
      response.id = id
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  if (message.kind !== 'pipeline') return
  const { id, payload } = message
  try {
    const reused = reuseWarmState(payload.fingerprint ?? null, payload.skipWarm)
    const warmState = reused ?? buildWarmState(
      id,
      payload,
      { skipProgress: true, fingerprint: payload.fingerprint ?? null },
    ).state
    if (payload.resetArtifacts) {
      // Drop any cached tester artifacts so the next detection run cannot reference deleted items.
      artifactCache.clear()
    }
    const prebuiltCustomRules = warmState.rulesByConfig
    // Skip the extra detection/merge work when keep overrides are effectively off.
    const hasActiveKeepUniques = hasActiveKeepUniqueRules(payload.keepUniques)
    const hasActiveKeepOverrides = hasActiveKeepUniques
    const baseKeepUniques = hasActiveKeepUniques
      ? { ...payload.keepUniques, detection: null }
      : payload.keepUniques
    const configsForRules = warmState.configsForRules
    const warmTotal = reused ? 0 : payload.configs.length
    const needsMatches = payload.skipMatches !== true

    // Base-match results must be tied to the current rule/config fingerprint.
    // WASM experiment appends the request id so cross-run reuse stays disabled.
    const baseMatchSignature = WASM_EXPERIMENT_DISABLE_CACHES
      ? `${buildBaseMatchSignature(payload)}|run:${id}`
      : buildBaseMatchSignature(payload)
    // Track which item ids truly changed so baseline/final matcher caches can stay valid.
    const changedItemIds = new Set<number>()
    if (payload.artifactPatch) {
      for (const [itemId, artifact] of payload.artifactPatch.changed) {
        changedItemIds.add(itemId)
        upsertArtifactCacheEntry(itemId, artifact)
      }
      for (const removed of payload.artifactPatch.removed) {
        changedItemIds.add(removed)
        artifactCache.delete(removed)
      }
    } else if (payload.artifacts && payload.artifacts.length > 0) {
      artifactCache.clear()
      payload.artifacts.forEach((artifact, idx) => {
        const itemId = resolveItemId(artifact, idx)
        changedItemIds.add(itemId)
        upsertArtifactCacheEntry(itemId, artifact)
      })
    }
    const artifactEntries: Array<[number, NormalizedGearArtifact]> = (() => {
      if (payload.artifacts && payload.artifacts.length > 0) {
        return payload.artifacts.map((artifact, idx) => [resolveItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
      }
      return artifactEntriesFromCache()
    })()
    const needsDetection = needsMatches
      && payload.skipDetection !== true
      && hasActiveKeepOverrides
      && artifactEntries.length > 0
    const matchPasses = needsMatches ? (needsDetection ? 2 : 1) : 0
    const total = warmTotal + (artifactEntries.length * matchPasses)
    let completed = warmTotal
    if (total > 0 && completed > 0) postPipelineProgress(id, { completed, total })

    const mergedRulesBaseline = computeMergedRules({
      hsf: payload.hsf,
      customCfgs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      keepUniques: baseKeepUniques,
    })

    // Seed the baseline map with anything we already evaluated so the detection pass only
    // recomputes the rows the patch touched.
    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    if (!WASM_EXPERIMENT_DISABLE_CACHES) {
      artifactCache.forEach((entry, itemId) => {
        // Reuse cached base matches only when the signature still aligns.
        if (!entry.baseMatch) return
        // Skip stale base matches when configs/reordering changed.
        if (entry.baseMatchSignature !== baseMatchSignature) return
        baselineMatchMap.set(itemId, entry.baseMatch)
      })
    }
    if (needsDetection) {
      // Baseline phase: refresh missing base matches so detection can reuse them.
      postPipelinePhase(id, 'baseline:start', { total: artifactEntries.length })
      // Only dispatch match jobs for artifacts whose baseline is missing or stale.
      const missingEntries = artifactEntries.filter(([itemId]) => !baselineMatchMap.has(itemId))
      const cachedCount = artifactEntries.length - missingEntries.length
      if (cachedCount > 0 && total > 0) {
        const cachedCompleted = warmTotal + cachedCount
        completed = cachedCompleted
        postPipelineProgress(id, { completed: cachedCompleted, total })
      }
      if (missingEntries.length > 0) {
        const baseProgressRef = { value: warmTotal + cachedCount }
        const baseMatchResults = await buildPipelineMatches(
          mergedRulesBaseline,
          missingEntries,
          payload.configModes,
          null,
          null,
          total,
          baseProgressRef,
          id,
          true,
          hasActiveKeepOverrides,
        )
        for (const result of baseMatchResults) {
          baselineMatchMap.set(result.itemId, result)
          const cached = artifactCache.get(result.itemId)
          if (cached) cached.baseMatch = result
          if (cached) cached.baseMatchSignature = baseMatchSignature
        }
        completed = baseProgressRef.value
      } else {
        completed = warmTotal + cachedCount
      }
      // Baseline phase complete: report cached vs recomputed counts.
      postPipelinePhase(id, 'baseline:done', { missing: missingEntries.length, cached: cachedCount })
    } else {
      completed = warmTotal
    }

    const toPreviewMatch = (result: EvalResult | null, rules: HsfRuleWithCfg[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const cfgIdx = result.cfgIdx ?? null
      const cfgName = resolveMatchConfigName(cfgIdx, null, rule)
      const keepUniqueLabel = rule?.__source === RULE_SOURCE_KEEP_UNIQUES
        ? resolveKeepUniqueRuleLabel(rule)
        : null
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

    // Precompute ignored configs so matcher precedence can reuse the set.
    const ignoreKeepUniqueConfigIndices = buildIgnoreKeepUniqueConfigIndices(configsForRules)
    // Candidate detection uses this baseline when ignored configs are excluded.
    const filteredBaselineMatchMap = (needsDetection && ignoreKeepUniqueConfigIndices.size > 0)
      ? await buildExcludedConfigBaselineMap(
        mergedRulesBaseline,
        artifactEntries,
        payload.configModes,
        ignoreKeepUniqueConfigIndices,
      )
      : null
    // Keep detection optional so we only pay for it when needed.
    let keepUniqueDetectionSnapshot: KeepUniqueDetectionSnapshot | null = null
    // Only compute detection when the caller requested keep-override scanning.
    if (needsDetection) {
      // Detection phase: collect candidate groups + compute keep-override snapshots.
      postPipelinePhase(id, 'detection:start', {
        artifacts: artifactEntries.length,
        keepUniqueRules: payload.keepUniques.rules.length,
      })
      // Build a row list that mirrors the preview matcher inputs.
      const rows = artifactEntries.map(([itemId, artifact]) => {
        // Reuse cached baseline matches to avoid re-evaluating base rules.
        const match = filteredBaselineMatchMap?.get(itemId) ?? baselineMatchMap.get(itemId)
        return {
          // Keep the raw artifact for candidate generation.
          artifact,
          // Detection ignores final matches; seed with null.
          match: null,
          // Provide a base match so detection can respect existing keep/sell results.
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          // Carry baseline config index sets to keep candidate math stable.
          matchingCfgIndices: match?.matchingConfigIndices ?? [],
          // Carry baseline config decisions for keep-unique precedence checks.
          matchingConfigDecisions: match?.matchingConfigDecisions ?? [],
        }
      })
      // Collect candidate groups before running keep-unique protection logic.
      const candidates = collectKeepUniqueCandidates({
        // Use the prebuilt rows for stable snapshotting.
        rows,
        // Candidate generation depends on the base (non-keep-unique) rules.
        baseRules: mergedRulesBaseline,
        // Config modes gate which rules can claim a candidate.
        configModes: payload.configModes,
        // Pre-filtered baseline matches already exclude ignored configs.
        ...(filteredBaselineMatchMap ? {} : { ignoreKeepUniqueConfigIndices }),
      })
      // Produce detection snapshots for downstream keep-override rule injection.
      if (hasActiveKeepUniques) {
        keepUniqueDetectionSnapshot = computeKeepUniqueProtection({
          // Use only the candidate list (not the full wrapper).
          candidates: candidates.candidates,
          // Supply the current keep-unique rules.
          rules: payload.keepUniques.rules,
          // Respect the keep-unique enabled toggle.
          enabled: payload.keepUniques.enabled,
        })
      }
      // Detection phase complete: surface the candidate + entry counts.
      postPipelinePhase(id, 'detection:done', {
        candidates: candidates.candidates.length,
        keepUniqueEntries: keepUniqueDetectionSnapshot?.entries.length ?? 0,
      })
    }

    // Build the final merged rules with keep-override injections if active.
    const mergedRulesFinal = computeMergedRules({
      hsf: payload.hsf,
      customCfgs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      // If keep-uniques is active, pass the detection snapshot through.
      keepUniques: baseKeepUniques
        ? {
          // Reuse the existing keep-unique payload.
          ...payload.keepUniques,
          // Inject the latest detection data.
          detection: keepUniqueDetectionSnapshot,
        }
        : payload.keepUniques,
    })
    // Final-match cache needs to know both the rule fingerprint and the detection outcome.
    // When either changes we fall back to recomputing the affected entries.
    const detectionSignature = fingerprintKeepUniqueDetection(keepUniqueDetectionSnapshot)
    // Compose a signature that invalidates caches on any detection change.
    const finalMatchSignature = [
      payload.fingerprint ?? 'null',
      detectionSignature ?? 'none',
    ].join('|')
    // Collect final match rows in worker order for the response payload.
    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      // Collect artifacts that need full evaluation (cache misses or invalidated entries).
      const pendingEntries: Array<[number, NormalizedGearArtifact]> = []
      for (const [itemId, artifact] of artifactEntries) {
        const cached = artifactCache.get(itemId)
        const reusable = Boolean(
          !WASM_EXPERIMENT_DISABLE_CACHES
          && cached
          && cached.finalMatch
          && cached.finalMatchSignature === finalMatchSignature
          && !changedItemIds.has(itemId),
        )
        if (reusable) {
          matches.push(cached!.finalMatch!)
          continue
        }
        pendingEntries.push([itemId, artifact])
      }
      // Emit the final stage marker so perf timelines can isolate match evaluation.
      postPipelinePhase(id, 'final:start', {
        pending: pendingEntries.length,
        cached: artifactEntries.length - pendingEntries.length,
        fastPath: false,
        keepOverrideRules: hasActiveKeepOverrides ? 1 : 0,
      })
      if (pendingEntries.length > 0) {
        const pendingProgressRef = { value: completed }
        const pendingMatches = await buildPipelineMatches(
          mergedRulesFinal,
          pendingEntries,
          payload.configModes,
          null,
          ignoreKeepUniqueConfigIndices,
          total,
          pendingProgressRef,
          id,
          true,
          hasActiveKeepOverrides,
        )
        // Append each full-eval match and refresh the cache.
        for (const match of pendingMatches) {
          // Push the result into the output list.
          matches.push(match)
          // Update the cached match for this artifact.
          const cached = artifactCache.get(match.itemId)
          if (cached) {
            // Store the final match for reuse.
            cached.finalMatch = match
            // Save the signature so the cache knows when it is valid.
            cached.finalMatchSignature = finalMatchSignature
          }
        }
        // Sync completed with the final progress snapshot.
        completed = pendingProgressRef.value
      } else if (total > 0 && completed < total) {
        // Ensure progress reaches 100% when no work is pending.
        completed = total
        // Emit the final progress update for the UI.
        postPipelineProgress(id, { completed, total })
      }
      // Final phase complete: surface how many matches were produced.
      postPipelinePhase(id, 'final:done', { matches: matches.length })
    } else {
      artifactCache.forEach((entry) => {
        entry.finalMatch = null
        entry.finalMatchSignature = null
      })
    }

    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'pipeline:done',
      payload: {
        rulesByConfigEntries: Array.from(prebuiltCustomRules.entries()),
        countsByConfigEntries: Array.from(warmState.countsByConfig.entries()),
        keys: warmState.keys.slice(),
        substatTargetsKey: warmState.substatTargetsKey,
        mergedRules: mergedRulesFinal,
        truncatedConfigIndices: warmState.truncatedConfigIndices.slice(),
        totalLimitHit: warmState.totalLimitHit,
        excludedByTotalLimitIndices: warmState.excludedByTotalLimitIndices.slice(),
        matches,
        // Keep-unique detection snapshot drives Keep Uniques tab + merges.
        keepUniqueDetection: keepUniqueDetectionSnapshot,
        fingerprint: payload.fingerprint ?? null,
        artifactSignature: payload.artifactPatch?.signature ?? payload.artifactSignature ?? null,
      },
    }
    // Update warm cache so subsequent requests can skip redundant work.
    lastWarmState = WASM_EXPERIMENT_DISABLE_CACHES
      ? null
      : {
        ...warmState,
        fingerprint: payload.fingerprint ?? null,
        artifactSignature: payload.artifactPatch?.signature ?? payload.artifactSignature ?? null,
      }
    self.postMessage(response)
  } catch (error) {
    postError(id, error)
  }
}

export {}
