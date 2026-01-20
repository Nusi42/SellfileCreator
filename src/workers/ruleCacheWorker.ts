/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import { RULE_SOURCE_KEEP_UNIQUES, computeMergedRules } from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import { buildRuleMatchIndexData } from '../lib/ruleMatchIndex'
import { evaluateMatchesByConfig, type EvalResult } from '../lib/ruleEval'
import { buildIgnoreKeepUniqueConfigIndices, collectKeepUniqueCandidates, computeKeepUniqueProtection, hasActiveKeepUniqueRules, resolveKeepUniqueRuleLabel } from '../lib/keepUniques'
import type { KeepUniqueDetectionSnapshot } from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { BuilderConfig, SellfileExportMode } from '../lib/hsfBuilder'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
import type { TesterPreviewMatch } from '../types/testerPreview'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveMatchConfigName } from '../lib/ruleConfigIndex'
import { fingerprintRuleTesterItem } from '../lib/ruleTesterSession'
import type { RuleTesterItem } from '../lib/ruleTesterSession'
import { fingerprintKeepUniqueDetection } from '../lib/keepUniqueFingerprint'

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
    previousCache: cache,
    baseRuleCount,
    ...(handleProgress ? { onProgress: handleProgress } : {}),
  })
  cache = result.cache
  const mergedRules = computeMergedRules({
    hsf: payload.hsf,
    customCfgs: configsForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
    prebuiltCustomRules: result.rulesByConfig,
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
    ruleMatchIndex: buildRuleMatchIndexData(mergedRules),
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
  const canReuseMatches = Boolean(previous && previous.fingerprint === nextFingerprint)
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

const buildPipelineMatches = (
  mergedRules: HsfRuleWithCfg[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  configModes: SellfileExportMode[] | undefined,
  baseMatchMap: Map<number, TesterMatchWorkerItemResult> | null,
  ignoreKeepUniqueConfigIndices: ReadonlySet<number> | null,
  total: number,
  completedRef: { value: number },
  id: number,
  emitProgress: boolean,
): TesterMatchWorkerItemResult[] => {
  if (!artifactEntries.length) return []
  const results: TesterMatchWorkerItemResult[] = []
  for (const [itemId, artifact] of artifactEntries) {
    if (!artifact) continue
    const fullOptions = configModes
      ? {
        configModes,
        ...(ignoreKeepUniqueConfigIndices ? { ignoreKeepUniqueConfigIndices } : {}),
      }
      : undefined
    const baseOptions = configModes
      ? { configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] as const }
      : { excludeSources: [RULE_SOURCE_KEEP_UNIQUES] as const }
    const fullEval = evaluateMatchesByConfig(mergedRules, artifact.testerItem, fullOptions)
    const baseEval = baseMatchMap?.get(itemId)
      ?? evaluateMatchesByConfig(mergedRules, artifact.testerItem, baseOptions)
    results.push({
      itemId,
      firstMatch: fullEval.firstMatch,
      firstNonExcludedMatch: baseEval?.firstNonExcludedMatch ?? baseEval?.firstMatch ?? null,
      matchingConfigIndices: fullEval.matchingConfigIndices,
      matchingConfigDecisions: fullEval.matchingConfigDecisions,
    })
    if (!emitProgress) continue
    completedRef.value += 1
    postPipelineProgress(id, { completed: completedRef.value, total })
  }
  return results
}

self.onmessage = async (event: MessageEvent<RuleCacheWorkerRequest>) => {
  const message = event.data
  if (!message) return
  if (message.kind === 'builderCount') {
    const { id, payload } = message
    try {
      // BuilderPanel requests per-config rule counts through this fast path so the UI stays responsive.
      const counts = countRulesForConfigs(payload.configs, payload.substatTargets)
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
    // Skip the extra detection/merge work when keep-unique is effectively off.
    const hasActiveKeepUniques = hasActiveKeepUniqueRules(payload.keepUniques)
    const baseKeepUniques = hasActiveKeepUniques
      ? { ...payload.keepUniques, detection: null }
      : payload.keepUniques
    const configsForRules = warmState.configsForRules
  const warmTotal = reused ? 0 : payload.configs.length
  const needsMatches = payload.skipMatches !== true

    // Base-match results must be tied to the current rule/config fingerprint.
    const baseMatchSignature = buildBaseMatchSignature(payload)
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
      && hasActiveKeepUniques
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
    artifactCache.forEach((entry, itemId) => {
      // Reuse cached base matches only when the signature still aligns.
      if (!entry.baseMatch) return
      // Skip stale base matches when configs/reordering changed.
      if (entry.baseMatchSignature !== baseMatchSignature) return
      baselineMatchMap.set(itemId, entry.baseMatch)
    })
    if (needsDetection) {
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
        const baseMatchResults = buildPipelineMatches(
          mergedRulesBaseline,
          missingEntries,
          payload.configModes,
          null,
          null,
          total,
          baseProgressRef,
          id,
          true,
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
      const effectiveCfgName = cfgName && cfgName.length > 0 ? cfgName : keepUniqueLabel
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
    let detectionSnapshot: KeepUniqueDetectionSnapshot | null = null
    if (needsDetection) {
      const rows = artifactEntries.map(([itemId, artifact]) => {
        const match = baselineMatchMap.get(itemId)
        return {
          artifact,
          match: null,
          baseMatch: toPreviewMatch(match?.firstNonExcludedMatch ?? match?.firstMatch ?? null, mergedRulesBaseline),
          matchingCfgIndices: match?.matchingConfigIndices ?? [],
          matchingConfigDecisions: match?.matchingConfigDecisions ?? [],
        }
      })
      const candidates = collectKeepUniqueCandidates({
        rows,
        baseRules: mergedRulesBaseline,
        configModes: payload.configModes,
        ignoreKeepUniqueConfigIndices,
      })
      detectionSnapshot = computeKeepUniqueProtection({
        candidates: candidates.candidates,
        rules: payload.keepUniques.rules,
        enabled: payload.keepUniques.enabled,
      })
    }

    const mergedRulesFinal = computeMergedRules({
      hsf: payload.hsf,
      customCfgs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules,
      keepUniques: baseKeepUniques
        ? {
          ...payload.keepUniques,
          detection: detectionSnapshot,
        }
        : payload.keepUniques,
    })
    // Final-match cache needs to know both the rule fingerprint and the detection outcome;
    // when either changes we fall back to recomputing the affected entries.
    const detectionSignature = fingerprintKeepUniqueDetection(detectionSnapshot)
    const finalMatchSignature = `${payload.fingerprint ?? 'null'}|${detectionSignature ?? 'none'}`
    const matches: TesterMatchWorkerItemResult[] = []
    if (needsMatches) {
      const pendingEntries: Array<[number, NormalizedGearArtifact]> = []
      for (const [itemId, artifact] of artifactEntries) {
        const cached = artifactCache.get(itemId)
        const reusable = Boolean(
          cached
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
      if (pendingEntries.length > 0) {
        const pendingProgressRef = { value: completed }
        const pendingMatches = buildPipelineMatches(
          mergedRulesFinal,
          pendingEntries,
          payload.configModes,
          (needsDetection && baselineMatchMap.size > 0) ? baselineMatchMap : null,
          ignoreKeepUniqueConfigIndices,
          total,
          pendingProgressRef,
          id,
          true,
        )
        for (const match of pendingMatches) {
          matches.push(match)
          const cached = artifactCache.get(match.itemId)
          if (cached) {
            cached.finalMatch = match
            cached.finalMatchSignature = finalMatchSignature
          }
        }
        completed = pendingProgressRef.value
      } else if (total > 0 && completed < total) {
        completed = total
        postPipelineProgress(id, { completed, total })
      }
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
        ruleMatchIndex: buildRuleMatchIndexData(mergedRulesFinal),
        matches,
        detection: detectionSnapshot,
        fingerprint: payload.fingerprint ?? null,
        artifactSignature: payload.artifactPatch?.signature ?? payload.artifactSignature ?? null,
      },
    }
    // Update warm cache so subsequent requests can skip redundant work.
    lastWarmState = {
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
