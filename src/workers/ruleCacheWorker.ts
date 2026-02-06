/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES,
  RULE_SOURCE_KEEP_BEST_SUBSTAT,
  RULE_SOURCE_KEEP_UNIQUES,
  isKeepOverrideRuleSource,
  computeMergedRules,
} from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import { buildRuleMatchIndexData } from '../lib/ruleMatchIndex'
import { evaluateMatchesByConfig, matchRule, type EvalResult } from '../lib/ruleEval'
import {
  buildIgnoreKeepUniqueConfigIndices,
  collectKeepUniqueCandidates,
  computeKeepUniqueProtection,
  hasActiveKeepUniqueRules,
  resolveKeepUniqueRuleLabel,
} from '../lib/keepUniques'
import type { KeepUniqueDetectionSnapshot } from '../lib/keepUniques'
import {
  computeKeepBestSubstatProtection,
  hasActiveKeepBestSubstatRules,
  resolveKeepBestSubstatRuleLabel,
} from '../lib/keepBestSubstat'
import type { KeepBestSubstatDetectionSnapshot } from '../lib/keepBestSubstat'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithCfg } from '../lib/merge'
import type { BuilderConfig, SellfileExportMode } from '../lib/hsfBuilder'
import type { TesterMatchWorkerItemResult } from './testerMatchWorkerTypes'
import type { TesterPreviewMatch } from '../types/testerPreview'
import type { RuleCachePipelinePhase, RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { getRuleConfigIndex, resolveMatchConfigName } from '../lib/ruleConfigIndex'
import { fingerprintRuleTesterItem } from '../lib/ruleTesterSession'
import type { RuleTesterItem } from '../lib/ruleTesterSession'
import { fingerprintKeepUniqueDetection } from '../lib/keepUniqueFingerprint'
import { fingerprintKeepBestSubstatDetection } from '../lib/keepBestSubstatFingerprint'

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
    // Keep overrides travel with warm merges so cached rules stay accurate.
    keepUniques: payload.keepUniques,
    // Keep Best Substat follows Keep Uniques in precedence and must be included.
    keepBestSubstat: payload.keepBestSubstat,
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
  hasKeepOverrideRules: boolean,
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
      ? { configModes, excludeSources: KEEP_OVERRIDE_RULE_SOURCES }
      : { excludeSources: KEEP_OVERRIDE_RULE_SOURCES }
    // Full evaluation always runs to capture the complete match list.
    const fullEval = evaluateMatchesByConfig(mergedRules, artifact.testerItem, fullOptions)
    // Reuse cached base matches when possible to avoid redundant scans.
    const cachedBase = baseMatchMap?.get(itemId)
    // Skip the base scan entirely when no keep-override rules exist.
    const baseEval = cachedBase
      ? cachedBase
      : (hasKeepOverrideRules
        ? evaluateMatchesByConfig(mergedRules, artifact.testerItem, baseOptions)
        : fullEval)
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
    // Skip the extra detection/merge work when keep overrides are effectively off.
    const hasActiveKeepUniques = hasActiveKeepUniqueRules(payload.keepUniques)
    const hasActiveKeepBestSubstat = hasActiveKeepBestSubstatRules(payload.keepBestSubstat)
    const hasActiveKeepOverrides = hasActiveKeepUniques || hasActiveKeepBestSubstat
    const baseKeepUniques = hasActiveKeepUniques
      ? { ...payload.keepUniques, detection: null }
      : payload.keepUniques
    const baseKeepBestSubstat = hasActiveKeepBestSubstat
      ? { ...payload.keepBestSubstat, detection: null }
      : payload.keepBestSubstat
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
      keepBestSubstat: baseKeepBestSubstat,
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
      const keepBestLabel = rule?.__source === RULE_SOURCE_KEEP_BEST_SUBSTAT
        ? resolveKeepBestSubstatRuleLabel(rule)
        : null
      const effectiveCfgName = cfgName && cfgName.length > 0
        ? cfgName
        : (keepUniqueLabel ?? keepBestLabel)
      return {
        ruleIndex: result.ruleIndex,
        keep: result.keep,
        cfgIdx,
        cfgName: effectiveCfgName && effectiveCfgName.length > 0 ? effectiveCfgName : null,
        ruleLabel: keepUniqueLabel ?? keepBestLabel ?? null,
        ruleSource: rule?.__source ?? null,
      }
    }

    // Precompute ignored configs so matcher precedence can reuse the set.
    const ignoreKeepUniqueConfigIndices = buildIgnoreKeepUniqueConfigIndices(configsForRules)
    // Keep detection optional so we only pay for it when needed.
    let keepUniqueDetectionSnapshot: KeepUniqueDetectionSnapshot | null = null
    let keepBestSubstatDetectionSnapshot: KeepBestSubstatDetectionSnapshot | null = null
    // Only compute detection when the caller requested keep-override scanning.
    if (needsDetection) {
      // Detection phase: collect candidate groups + compute keep-override snapshots.
      postPipelinePhase(id, 'detection:start', {
        artifacts: artifactEntries.length,
        keepUniqueRules: payload.keepUniques.rules.length,
        keepBestSubstatRules: payload.keepBestSubstat.rules.length,
      })
      // Build a row list that mirrors the preview matcher inputs.
      const rows = artifactEntries.map(([itemId, artifact]) => {
        // Reuse cached baseline matches to avoid re-evaluating base rules.
        const match = baselineMatchMap.get(itemId)
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
        // Exclude configs tagged to ignore keep-unique overrides.
        ignoreKeepUniqueConfigIndices,
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
      if (hasActiveKeepBestSubstat) {
        keepBestSubstatDetectionSnapshot = computeKeepBestSubstatProtection({
          // Use only the candidate list (not the full wrapper).
          candidates: candidates.candidates,
          // Supply the current keep-best-substat rules.
          rules: payload.keepBestSubstat.rules,
          // Respect the keep-best-substat enabled toggle.
          enabled: payload.keepBestSubstat.enabled,
        })
      }
      // Detection phase complete: surface the candidate + entry counts.
      postPipelinePhase(id, 'detection:done', {
        candidates: candidates.candidates.length,
        keepUniqueEntries: keepUniqueDetectionSnapshot?.entries.length ?? 0,
        keepBestSubstatEntries: keepBestSubstatDetectionSnapshot?.entries.length ?? 0,
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
      // If keep-best-substat is active, pass the detection snapshot through.
      keepBestSubstat: baseKeepBestSubstat
        ? {
          // Reuse the existing keep-best-substat payload.
          ...payload.keepBestSubstat,
          // Inject the latest detection data.
          detection: keepBestSubstatDetectionSnapshot,
        }
        : payload.keepBestSubstat,
    })
    // Final-match cache needs to know both the rule fingerprint and the detection outcome.
    // When either changes we fall back to recomputing the affected entries.
    const detectionSignature = fingerprintKeepUniqueDetection(keepUniqueDetectionSnapshot)
    const keepBestDetectionSignature = fingerprintKeepBestSubstatDetection(keepBestSubstatDetectionSnapshot)
    // Compose a signature that invalidates caches on any detection change.
    const finalMatchSignature = [
      payload.fingerprint ?? 'null',
      detectionSignature ?? 'none',
      keepBestDetectionSignature ?? 'none',
    ].join('|')
    // Collect final match rows in worker order for the response payload.
    const matches: TesterMatchWorkerItemResult[] = []
    // Extract keep-override rules in merged order so we can short-circuit full scans.
    const keepOverrideRuleEntries: Array<{ rule: HsfRuleWithCfg; ruleIndex: number; cfgIdx: number | null }> = []
    // Cap fast-path scans so huge keep-override rule sets fall back to the indexed pipeline.
    const KEEP_OVERRIDE_FAST_PATH_RULE_LIMIT = 500
    // Only scan keep-override rules when either feature is active.
    if (hasActiveKeepOverrides) {
      // Preserve rule order so we match the same precedence as full evaluation.
      for (let idx = 0; idx < mergedRulesFinal.length; idx += 1) {
        // Grab the merged rule at this index.
        const rule = mergedRulesFinal[idx]
        // Guard against sparse arrays so type narrowing stays safe.
        if (!rule) continue
        // Skip non keep-override rules entirely.
        if (!isKeepOverrideRuleSource(rule.__source ?? null)) continue
        // Store the rule, its index, and its config index for fast matching.
        keepOverrideRuleEntries.push({
          // Keep the rule reference for matchRule.
          rule,
          // Preserve the merged rule index for downstream match reporting.
          ruleIndex: idx,
          // Resolve config index now to avoid extra work per item.
          cfgIdx: getRuleConfigIndex(rule),
        })
      }
    }
    // Fast path needs a full baseline map so we can reuse cached matches safely.
    const baselineMatchesComplete = artifactEntries.length > 0
      && baselineMatchMap.size === artifactEntries.length
    // Helper respects the ignore list when deciding if keep overrides can win.
    const isIgnoredForKeepOverride = (cfgIdx: number | null): boolean => (
      cfgIdx != null && ignoreKeepUniqueConfigIndices?.has(cfgIdx) === true
    )
    // Decide whether keep overrides can override the base matches.
    const allowKeepOverride = (baseMatch: TesterMatchWorkerItemResult | null | undefined): boolean => {
      // No baseline means we can allow keep overrides to decide.
      if (!baseMatch) return true
      // Reuse the first-match decision for the quick keep check.
      const firstMatch = baseMatch.firstMatch
      // Any non-ignored KEEP match blocks keep overrides.
      const firstMatchIsKeep = Boolean(firstMatch?.keep && !isIgnoredForKeepOverride(firstMatch?.cfgIdx ?? null))
      // Short-circuit when the first match is already a KEEP.
      if (firstMatchIsKeep) return false
      // Also block when any matching config decision indicates KEEP.
      for (const decision of baseMatch.matchingConfigDecisions ?? []) {
        // Ignore keep-unique exclusions when evaluating KEEP decisions.
        if (decision.keep && !isIgnoredForKeepOverride(decision.cfgIdx)) return false
      }
      // Allow keep overrides when no KEEP decisions were detected.
      return true
    }
    // Locate the first keep-override match in merged order when needed.
    const findKeepOverrideMatch = (artifact: NormalizedGearArtifact): EvalResult | null => {
      // No keep-override rules means no match.
      if (!keepOverrideRuleEntries.length) return null
      // Scan in merged order so results match the full pipeline.
      for (const entry of keepOverrideRuleEntries) {
        // Skip non-matching keep-override rules quickly.
        if (!matchRule(entry.rule, artifact.testerItem)) continue
        // Return the first keep-override match as a keep decision.
        return { ruleIndex: entry.ruleIndex, keep: true, cfgIdx: entry.cfgIdx }
      }
      // No keep-override rule matched this artifact.
      return null
    }
    if (needsMatches) {
      // Fast-path eligibility only depends on baseline completeness + keep-unique rule volume.
      const fastPathEligible = (
        baselineMatchesComplete
        && keepOverrideRuleEntries.length <= KEEP_OVERRIDE_FAST_PATH_RULE_LIMIT
      )
      // Collect artifacts that need full evaluation (cache misses or invalidated entries).
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
      // Emit the final stage marker so perf timelines can isolate match evaluation.
      postPipelinePhase(id, 'final:start', {
        pending: pendingEntries.length,
        cached: artifactEntries.length - pendingEntries.length,
        fastPath: fastPathEligible,
        keepOverrideRules: keepOverrideRuleEntries.length,
      })
      if (pendingEntries.length > 0) {
        const pendingProgressRef = { value: completed }
        // Fast path only works with a complete baseline snapshot.
        const canFastPathKeepOverrides = fastPathEligible && keepOverrideRuleEntries.length > 0
        // Fast path also covers the disabled keep-override case by reusing the baseline.
        const canFastPathDisabled = fastPathEligible && keepOverrideRuleEntries.length === 0
        if (canFastPathKeepOverrides || canFastPathDisabled) {
          for (const [itemId, artifact] of pendingEntries) {
            // Pull the baseline match for this artifact.
            const baseMatch = baselineMatchMap.get(itemId)
            // Fall back to full eval when the baseline snapshot is missing.
            if (!baseMatch) {
              // Reuse the full pipeline so the fallback stays correct.
              const fallbackMatch = buildPipelineMatches(
                mergedRulesFinal,
                [[itemId, artifact]],
                payload.configModes,
                baselineMatchMap,
                ignoreKeepUniqueConfigIndices,
                total,
                pendingProgressRef,
                id,
                true,
                keepOverrideRuleEntries.length > 0,
              )[0]
              // Guard against empty fallback results.
              if (fallbackMatch) {
                // Store the fallback result in the output list.
                matches.push(fallbackMatch)
                // Update the artifact cache so the next run can reuse it.
                const cached = artifactCache.get(fallbackMatch.itemId)
                if (cached) {
                  // Cache the final match for quick reuse.
                  cached.finalMatch = fallbackMatch
                  // Stamp the signature so invalidation works.
                  cached.finalMatchSignature = finalMatchSignature
                }
              }
              // Skip the fast path for this entry.
              continue
            }
            // Default to the baseline matches unless keep-unique overrides.
            const allowKeepOverrideMatch = canFastPathKeepOverrides && allowKeepOverride(baseMatch)
            // Evaluate keep-override rules only when overrides are allowed.
            const keepOverrideMatch = allowKeepOverrideMatch ? findKeepOverrideMatch(artifact) : null
            // Prefer keep-override match when present, else reuse baseline first match.
            const firstMatch = keepOverrideMatch ?? baseMatch.firstMatch
            // Preserve the baseline non-excluded match for parity.
            const baseNonExcluded = baseMatch.firstNonExcludedMatch ?? baseMatch.firstMatch ?? null
            // If baseline had no non-excluded match, allow keep overrides to fill it.
            const firstNonExcludedMatch = baseNonExcluded ?? keepOverrideMatch ?? null
            // Assemble the final match result from baseline + optional keep-override override.
            const matchResult: TesterMatchWorkerItemResult = {
              itemId,
              firstMatch,
              firstNonExcludedMatch,
              matchingConfigIndices: baseMatch.matchingConfigIndices ?? [],
              matchingConfigDecisions: baseMatch.matchingConfigDecisions ?? [],
            }
            // Append the match result to the response list.
            matches.push(matchResult)
            // Update the cache entry if the artifact is cached.
            const cached = artifactCache.get(itemId)
            if (cached) {
              // Cache the fast-path match for reuse.
              cached.finalMatch = matchResult
              // Record the signature so invalidations are accurate.
              cached.finalMatchSignature = finalMatchSignature
            }
            // Advance progress so the UI can keep the spinner updated.
            pendingProgressRef.value += 1
            // Emit progress updates per item to match the normal pipeline behavior.
            postPipelineProgress(id, { completed: pendingProgressRef.value, total })
          }
          // Sync the completed counter with the pending progress tracker.
          completed = pendingProgressRef.value
        } else {
          // Fall back to the full pipeline when fast-path prerequisites are missing.
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
            keepOverrideRuleEntries.length > 0,
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
        }
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
        ruleMatchIndex: buildRuleMatchIndexData(mergedRulesFinal),
        matches,
        // Keep-unique detection snapshot drives Keep Uniques tab + merges.
        keepUniqueDetection: keepUniqueDetectionSnapshot,
        // Keep-best-substat detection snapshot drives the new tab + merges.
        keepBestSubstatDetection: keepBestSubstatDetectionSnapshot,
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
