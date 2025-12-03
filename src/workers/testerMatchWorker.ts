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
import { createProgressThrottler } from '../types/progress'

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

const evaluateRows = (
  items: TesterMatchWorkerEvaluateItem[],
  onProgress?: (completed: number, total: number) => void,
): TesterMatchWorkerItemResult[] => {
  if (!Array.isArray(items) || items.length === 0) return []
  const total = items.length
  const forwardProgress = createProgressThrottler((snapshot) => onProgress?.(snapshot.completed, snapshot.total))
  if (currentRules.length === 0) {
    const emptyResults = items.map((entry, idx) => {
      forwardProgress({ completed: idx + 1, total })
      return {
        itemId: entry.itemId,
        firstMatch: null,
        firstNonExcludedMatch: null,
        matchingConfigIndices: [],
      }
    })
    return emptyResults
  }
  const results: TesterMatchWorkerItemResult[] = []
  for (let idx = 0; idx < items.length; idx += 1) {
    const entry = items[idx]
    if (!entry) continue
    // Full evaluation includes keep-unique injections so the tester grid shows overrides.
    const full = evaluateMatchesByConfig(currentRules, entry.item, { configModes: currentConfigModes })
    // Base evaluation excludes keep-unique so detection can still see the baseline keep/sell result.
    const base = evaluateMatchesByConfig(currentRules, entry.item, {
      configModes: currentConfigModes,
      excludeSources: [RULE_SOURCE_KEEP_UNIQUES],
    })
    results.push({
      itemId: entry.itemId,
      firstMatch: full.firstMatch,
      firstNonExcludedMatch: base.firstMatch,
      matchingConfigIndices: full.matchingConfigIndices,
    })
    // Emit determinate progress so the UI overlay can update mid-batch.
    forwardProgress({ completed: idx + 1, total })
  }
  return results
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
      const results = evaluateRows(message.payload.items, (completed, total) => {
        const progressResponse: TesterMatchWorkerResponse = {
          id: message.id,
          kind: 'evaluate:progress',
          payload: { completed, total },
        }
        self.postMessage(progressResponse)
      })
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
