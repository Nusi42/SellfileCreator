/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { createConfigRulesCache, updateConfigRulesCache } from '../lib/ruleCache'
import { computeMergedRules } from '../lib/merge'
import { configsForRuleBuild } from '../lib/ruleCacheHelpers'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'

declare const self: DedicatedWorkerGlobalScope

let cache = createConfigRulesCache()

self.onmessage = async (event: MessageEvent<RuleCacheWorkerRequest>) => {
  const message = event.data
  if (!message) return
  if (message.kind !== 'warm') return
  const { id, payload } = message
  try {
    const configsForRules = configsForRuleBuild(payload.configs)
    const result = updateConfigRulesCache({
      configs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      previousCache: cache,
    })
    cache = result.cache
    const mergedRules = computeMergedRules({
      hsf: payload.hsf,
      customCfgs: configsForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      prebuiltCustomRules: result.rulesByConfig,
    })
    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'warm:done',
      payload: {
        rulesByConfigEntries: Array.from(result.rulesByConfig.entries()),
        countsByConfigEntries: Array.from(result.countsByConfig.entries()),
        keys: result.keys.slice(),
        substatTargetsKey: result.substatTargetsKey,
        perf: result.perf,
        mergedRules,
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
