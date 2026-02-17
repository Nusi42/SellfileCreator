/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import type { SellfileExportMode } from '../lib/hsfBuilder'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  type HsfRuleWithRecipe,
} from '../lib/merge'
import {
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  warmupWasmRuleEngine,
} from '../lib/wasm/wasmRuleEngine'
import type {
  TesterMatchWorkerEvaluateItem,
  TesterMatchWorkerRequest,
  TesterMatchWorkerResponse,
  TesterMatchWorkerItemResult,
} from './testerMatchWorkerTypes'
import { createProgressThrottler } from '../types/progress'

declare const self: DedicatedWorkerGlobalScope

let currentRules: HsfRuleWithRecipe[] = []
let currentRecipeModes: SellfileExportMode[] = []
let currentSafeguardOverrideRuleIndices = new Set<number>()
let wasmWarmupPromise: Promise<void> | null = null

// Reuse a set for O(1) first-match source checks on the hot evaluate path.
const SAFEGUARD_OVERRIDE_SOURCE_SET = new Set<string>(SAFEGUARD_OVERRIDE_RULE_SOURCES)

const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) {
    wasmWarmupPromise = warmupWasmRuleEngine()
  }
  await wasmWarmupPromise
}

const configureRules = async (rules: HsfRuleWithRecipe[], recipeModes: SellfileExportMode[]) => {
  currentRules = rules ?? []
  currentRecipeModes = Array.isArray(recipeModes) ? recipeModes : []
  // Safeguard-override index map allows skipping baseline re-eval for unaffected rows.
  currentSafeguardOverrideRuleIndices = new Set<number>()
  for (let idx = 0; idx < currentRules.length; idx += 1) {
    const source = currentRules[idx]?.__source ?? ''
    if (!SAFEGUARD_OVERRIDE_SOURCE_SET.has(source)) continue
    currentSafeguardOverrideRuleIndices.add(idx)
  }
  await ensureWasmWorkerReady()
  await configureWasmRuleEngine({
    rules: currentRules,
    recipeModes: currentRecipeModes,
  })
}

const evaluateRows = async (
  items: TesterMatchWorkerEvaluateItem[],
  onProgress?: (completed: number, total: number) => void,
): Promise<TesterMatchWorkerItemResult[]> => {
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
        matchingRecipeIndices: [],
        matchingRecipeDecisions: [],
      }
    })
    return emptyResults
  }
  const fullResults = await evaluateWasmRuleEngineItems({
    items,
    ...(currentSafeguardOverrideRuleIndices.size > 0
      ? { options: { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES } }
      : {}),
  })
  const fullById = new Map<number, TesterMatchWorkerItemResult>()
  fullResults.forEach((entry) => fullById.set(entry.itemId, entry))
  const results: TesterMatchWorkerItemResult[] = []
  for (let idx = 0; idx < items.length; idx += 1) {
    const entry = items[idx]
    if (!entry) continue
    const full = fullById.get(entry.itemId)
    results.push({
      itemId: entry.itemId,
      firstMatch: full?.firstMatch ?? null,
      firstNonExcludedMatch: (
        full?.firstNonExcludedMatch
        ?? full?.firstMatch
        ?? null
      ),
      matchingRecipeIndices: full?.matchingRecipeIndices ?? [],
      matchingRecipeDecisions: full?.matchingRecipeDecisions ?? [],
    })
    // Emit determinate progress so the UI overlay can update mid-batch.
    forwardProgress({ completed: idx + 1, total })
  }
  return results
}

self.onmessage = async (event: MessageEvent<TesterMatchWorkerRequest>) => {
  const message = event.data
  if (!message) return
  if (message.kind === 'configure') {
    try {
      await configureRules(message.payload.rules, message.payload.recipeModes)
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
      const results = await evaluateRows(message.payload.items, (completed, total) => {
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
