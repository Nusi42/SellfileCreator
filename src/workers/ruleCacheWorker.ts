/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import { RULE_SOURCE_KEEP_UNIQUES, computeMergedRules } from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import { buildRuleMatchIndexData } from '../lib/ruleMatchIndex'
import { evaluateMatchesByConfig, type EvalResult } from '../lib/ruleEval'
import { collectKeepUniqueCandidates, computeKeepUniqueProtection, hasActiveKeepUniqueRules } from '../lib/keepUniques'
import type { KeepUniqueDetectionSnapshot } from '../lib/keepUniques'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { BuilderConfig, SellfileExportMode } from '../lib/hsfBuilder'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
import type { TesterPreviewMatch } from '../types/testerPreview'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveMatchConfigName } from '../lib/ruleConfigIndex'

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
// Cache tester artifacts across pipeline runs so patches can be applied incrementally.
const artifactCache = new Map<number, NormalizedGearArtifact>()

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

const buildPipelineMatches = (
  mergedRules: HsfRuleWithCfg[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  configModes: SellfileExportMode[] | undefined,
  baseMatchMap: Map<number, TesterMatchWorkerItemResult> | null,
  total: number,
  completedRef: { value: number },
  id: number,
  emitProgress: boolean,
): TesterMatchWorkerItemResult[] => {
  if (!artifactEntries.length) return []
  const results: TesterMatchWorkerItemResult[] = []
  for (const [itemId, artifact] of artifactEntries) {
    if (!artifact) continue
    const fullOptions = configModes ? { configModes } : undefined
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

    if (payload.artifactPatch) {
      for (const [itemId, artifact] of payload.artifactPatch.changed) {
        artifactCache.set(itemId, artifact)
      }
      for (const removed of payload.artifactPatch.removed) {
        artifactCache.delete(removed)
      }
    } else if (payload.artifacts && payload.artifacts.length > 0) {
      artifactCache.clear()
      payload.artifacts.forEach((artifact, idx) => {
        const itemId = resolveItemId(artifact, idx)
        artifactCache.set(itemId, artifact)
      })
    }
    const artifactEntries: Array<[number, NormalizedGearArtifact]> = (() => {
      if (payload.artifacts && payload.artifacts.length > 0) {
        return payload.artifacts.map((artifact, idx) => [resolveItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
      }
      return Array.from(artifactCache.entries())
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

    const baselineMatchMap = new Map<number, TesterMatchWorkerItemResult>()
    // Baseline match pass for keep-unique detection (if enabled).
    if (needsDetection) {
      const baseMatchResults = buildPipelineMatches(
        mergedRulesBaseline,
        artifactEntries,
        payload.configModes,
        null,
        total,
        { value: completed },
        id,
        true,
      )
      for (const result of baseMatchResults) baselineMatchMap.set(result.itemId, result)
      completed = warmTotal + artifactEntries.length
    }

    const toPreviewMatch = (result: EvalResult | null, rules: HsfRuleWithCfg[]): TesterPreviewMatch | null => {
      if (!result) return null
      const rule = rules[result.ruleIndex]
      const cfgIdx = result.cfgIdx ?? null
      const cfgName = resolveMatchConfigName(cfgIdx, null, rule)
      return {
        ruleIndex: result.ruleIndex,
        keep: result.keep,
        cfgIdx,
        cfgName,
        ruleLabel: null,
        ruleSource: rule?.__source ?? null,
      }
    }

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
    const matches = needsMatches
      ? buildPipelineMatches(
        mergedRulesFinal,
        artifactEntries,
        payload.configModes,
        baselineMatchMap.size > 0 ? baselineMatchMap : null,
        total,
        { value: completed },
        id,
        true,
      )
      : []

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
