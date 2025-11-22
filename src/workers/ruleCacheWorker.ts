/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import { computeMergedRules } from '../lib/merge'
import { configsForRuleBuild, countRulesForConfigs } from '../lib/ruleCacheHelpers'
import { buildRuleMatchIndexData } from '../lib/ruleMatchIndex'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'

declare const self: DedicatedWorkerGlobalScope

let cache = createConfigRulesCache()

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
      const response: RuleCacheWorkerResponse = {
        id,
        kind: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    }
    return
  }
  if (message.kind !== 'warm') return
  const { id, payload } = message
  try {
    const configsForRules = configsForRuleBuild(payload.configs)
    const baseRuleCount = Array.isArray(payload.hsf?.Rules) ? (payload.hsf?.Rules.length ?? 0) : 0
    const result = updateConfigRulesCache({
      configs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      previousCache: cache,
      baseRuleCount,
      onProgress: (progress) => {
        const progressResponse: RuleCacheWorkerResponse = {
          id,
          kind: 'warm:progress',
          payload: progress,
        }
        self.postMessage(progressResponse)
      },
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
    const ruleMatchIndex = buildRuleMatchIndexData(mergedRules)
    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'warm:done',
      payload: {
        rulesByConfigEntries: Array.from(result.rulesByConfig.entries()),
        countsByConfigEntries: Array.from(result.countsByConfig.entries()),
        keys: result.keys.slice(),
        substatTargetsKey: result.substatTargetsKey,
        mergedRules,
        truncatedConfigIndices: result.truncatedConfigIndices.slice(),
        totalLimitHit: result.totalLimitHit,
        excludedByTotalLimitIndices: result.excludedByTotalLimitIndices.slice(),
        ruleMatchIndex,
      },
    }
    self.postMessage(response)
  } catch (error) {
    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}

export {}
