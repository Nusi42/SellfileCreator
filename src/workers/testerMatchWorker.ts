/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import type { SellfileExportMode } from '../lib/hsfBuilder'
import { RULE_SOURCE_KEEP_UNIQUES, type HsfRuleWithCfg } from '../lib/merge'
import { buildRuleMatchIndexData, primeRuleMatchIndex, type RuleMatchIndexData } from '../lib/ruleMatchIndex'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type {
  TesterMatchWorkerEvaluateItem,
  TesterMatchWorkerRequest,
  TesterMatchWorkerResponse,
  TesterMatchWorkerItemResult,
} from './testerMatchWorkerTypes'

declare const self: DedicatedWorkerGlobalScope

let currentRules: HsfRuleWithCfg[] = []
let currentConfigModes: SellfileExportMode[] = []

const configureRules = (rules: HsfRuleWithCfg[], configModes: SellfileExportMode[], ruleMatchIndex: RuleMatchIndexData | null) => {
  currentRules = rules ?? []
  currentConfigModes = Array.isArray(configModes) ? configModes : []
  if (currentRules.length === 0) return
  if (ruleMatchIndex) {
    primeRuleMatchIndex(currentRules, ruleMatchIndex)
  } else {
    primeRuleMatchIndex(currentRules, buildRuleMatchIndexData(currentRules))
  }
}

const evaluateRows = (items: TesterMatchWorkerEvaluateItem[]): TesterMatchWorkerItemResult[] => {
  if (!Array.isArray(items) || items.length === 0) return []
  if (currentRules.length === 0) {
    return items.map((entry) => ({
      itemId: entry.itemId,
      firstMatch: null,
      firstNonExcludedMatch: null,
      matchingConfigIndices: [],
    }))
  }
  return items.map((entry) => {
    const result = evaluateMatchesByConfig(currentRules, entry.item, {
      configModes: currentConfigModes,
      excludeSources: [RULE_SOURCE_KEEP_UNIQUES],
    })
    return {
      itemId: entry.itemId,
      firstMatch: result.firstMatch,
      firstNonExcludedMatch: result.firstNonExcludedMatch,
      matchingConfigIndices: result.matchingConfigIndices,
    }
  })
}

self.onmessage = (event: MessageEvent<TesterMatchWorkerRequest>) => {
  const message = event.data
  if (!message) return
  if (message.kind === 'configure') {
    try {
      configureRules(message.payload.rules, message.payload.configModes, message.payload.ruleMatchIndex)
      const response: TesterMatchWorkerResponse = {
        id: message.id,
        kind: 'configure:done',
      }
      self.postMessage(response)
    } catch (error) {
      const response: TesterMatchWorkerResponse = {
        id: message.id,
        kind: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    }
    return
  }
  if (message.kind === 'evaluate') {
    try {
      const results = evaluateRows(message.payload.items)
      const response: TesterMatchWorkerResponse = {
        id: message.id,
        kind: 'evaluate:done',
        payload: { results },
      }
      self.postMessage(response)
    } catch (error) {
      const response: TesterMatchWorkerResponse = {
        id: message.id,
        kind: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      self.postMessage(response)
    }
  }
}

export {}
