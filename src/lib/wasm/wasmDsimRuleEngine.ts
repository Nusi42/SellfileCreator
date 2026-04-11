// Lean WASM rule-engine wrapper for the dungeon simulator worker.
//
// Imports from the dedicated rule_engine_dsim_wasm binary (156 KB vs 1.2 MB for the full
// pipeline binary).  The dsim binary exports only configure_value + evaluate_value + version;
// all other rule_engine_core symbols (safeguards, HSF builder, improvement-chance, merge,
// etc.) are dead-code-eliminated.  No talc allocator — dlmalloc is fine for the simple
// dsim allocation pattern (configure once, evaluate per item).
//
// Usage:
//   1. Call warmupDsimWasmRuleEngine() at worker startup.
//   2. Call setRuleEvalWasmBindings() with the dsim configure + evaluate functions so
//      the shared ruleEval.ts helpers use this lean binary instead of the full pipeline one.
//   3. ruleEval.ts evaluateFirst / evaluateMatchesByRecipe now use the dsim WASM.

import initDsimRuleEngineWasm, {
  configure_value as configureDsimRuleEngineWasmValueBinding,
  evaluate_value as evaluateDsimRuleEngineWasmValueBinding,
  version as dsimRuleEngineWasmVersionBinding,
} from './generated/rule_engine_dsim.js'
import type { HsfRuleWithRecipe } from '../merge'
import type { SellfileExportMode } from '../hsfBuilder'
import type { GearInspectorMatchWorkerEvaluateItem, GearInspectorMatchWorkerItemResult } from '../../workers/gearInspectorMatchWorkerTypes'
import type { WasmRuleEngineEvaluateOptions } from './wasmRuleEngine'

// -- Init state --

let dsimWasmInitialized = false
let dsimWasmInitPromise: Promise<void> | null = null

// Converts WasmRuleEngineEvaluateOptions into the compact payload shape accepted by the
// dsim evaluate_value binding.  Mirrors toEvaluateOptionsPayload in wasmRuleEngine.ts.
const toDsimEvaluateOptionsPayload = (
  options: WasmRuleEngineEvaluateOptions | undefined,
): object | undefined => {
  if (!options) return undefined
  const payload: {
    excludeSources?: readonly string[]
    baselineExcludeSources?: readonly string[]
    excludeRecipeIndices?: number[]
    ignoreSafeguardRecipeIndices?: number[]
  } = {}
  if (options.excludeSources && options.excludeSources.length > 0) {
    payload.excludeSources = options.excludeSources
  }
  if (options.baselineExcludeSources && options.baselineExcludeSources.length > 0) {
    payload.baselineExcludeSources = options.baselineExcludeSources
  }
  if (options.excludeRecipeIndices && options.excludeRecipeIndices.size > 0) {
    payload.excludeRecipeIndices = [...options.excludeRecipeIndices]
  }
  if (options.ignoreSafeguardRecipeIndices && options.ignoreSafeguardRecipeIndices.size > 0) {
    payload.ignoreSafeguardRecipeIndices = [...options.ignoreSafeguardRecipeIndices]
  }
  return Object.keys(payload).length > 0 ? payload : undefined
}

// -- Public API --

// Initialize the dsim WASM binary.  Idempotent: subsequent calls return the cached promise.
// The cached promise is cleared on failure so the next call can retry.
export const warmupDsimWasmRuleEngine = async (): Promise<void> => {
  if (!dsimWasmInitPromise) {
    dsimWasmInitPromise = initDsimRuleEngineWasm().then(() => {
      dsimWasmInitialized = true
    })
  }
  try {
    await dsimWasmInitPromise
  } catch (error) {
    dsimWasmInitPromise = null
    throw error
  }
}

// Sync configure: set the rule engine state for the current batch.
// Must be called after warmupDsimWasmRuleEngine.
export const configureDsimRuleEngineWithLoadedWasm = (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): void => {
  if (!dsimWasmInitialized) {
    throw new Error('dsim WASM is not initialized — call warmupDsimWasmRuleEngine first.')
  }
  configureDsimRuleEngineWasmValueBinding(params.rules, params.recipeModes)
}

// Sync evaluate: evaluate a batch of items against the configured rules.
// Must be called after warmupDsimWasmRuleEngine (and after configure).
export const evaluateDsimRuleEngineItemsWithLoadedWasm = (params: {
  items: GearInspectorMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): GearInspectorMatchWorkerItemResult[] => {
  if (!dsimWasmInitialized) {
    throw new Error('dsim WASM is not initialized — call warmupDsimWasmRuleEngine first.')
  }
  const optionsPayload = toDsimEvaluateOptionsPayload(params.options)
  const result = evaluateDsimRuleEngineWasmValueBinding(params.items, optionsPayload)
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  throw new Error('dsim WASM evaluate returned an invalid payload.')
}

// Version string for diagnostics — confirms the lean dsim binary is loaded, not the full pipeline one.
export const getDsimWasmRuleEngineVersion = async (): Promise<string> => {
  await warmupDsimWasmRuleEngine()
  return dsimRuleEngineWasmVersionBinding()
}
