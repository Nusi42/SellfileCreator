/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import type { SellfileExportMode } from '../lib/hsfBuilder'
import type { HsfRuleWithCfg } from '../lib/merge'
import { buildRuleMatchIndexData, primeRuleMatchIndex, type RuleMatchIndexData } from '../lib/ruleMatchIndex'
import { evaluateMatchesByConfig } from '../lib/ruleEval'
import type {
  TesterMatchWorkerEvaluateRow,
  TesterMatchWorkerRequest,
  TesterMatchWorkerResponse,
  TesterMatchWorkerRowResult,
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

const evaluateRows = (rows: TesterMatchWorkerEvaluateRow[]): TesterMatchWorkerRowResult[] => {
  if (!Array.isArray(rows) || rows.length === 0) return []
  if (currentRules.length === 0) {
    return rows.map((row) => ({
      rowId: row.rowId,
      firstMatch: null,
      matchingConfigIndices: [],
    }))
  }
  return rows.map((row) => {
    const result = evaluateMatchesByConfig(currentRules, row.item, { configModes: currentConfigModes })
    return {
      rowId: row.rowId,
      firstMatch: result.firstMatch,
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
      const results = evaluateRows(message.payload.rows)
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
