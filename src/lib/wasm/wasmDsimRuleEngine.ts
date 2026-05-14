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
import { buildEvaluatePayload, type WasmRuleEngineEvaluateOptions } from './wasmRuleEngine'
// Shared wire-format minify helper — same SSOT as the full rule_engine_wasm binary.
// Required to match the configure_value payload shape the dsim binary expects.
import { minifyRuleRawForWire } from './wireProjections'

// -- Init state --

let dsimWasmInitialized = false
let dsimWasmInitPromise: Promise<void> | null = null

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
// Payload is a JSON string in the same minified wire format the full
// rule_engine_wasm binary uses — see wasmRuleEngine.ts buildConfigurePayload.
export const configureDsimRuleEngineWithLoadedWasm = (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): void => {
  if (!dsimWasmInitialized) {
    throw new Error('dsim WASM is not initialized — call warmupDsimWasmRuleEngine first.')
  }
  const payload = JSON.stringify({
    rules: params.rules.map(minifyRuleRawForWire),
    recipeModes: params.recipeModes,
  })
  configureDsimRuleEngineWasmValueBinding(payload)
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
  // Shared with the full rule_engine_wasm binary so the EvaluateValueInWire shape
  // stays in lockstep across both. Items are projected through toWasmTestItem to
  // strip previewExtras fields beyond `id` (Rust TestItemRaw is strict).
  const payload = buildEvaluatePayload(params.items, params.options)
  const result = evaluateDsimRuleEngineWasmValueBinding(payload)
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  throw new Error('dsim WASM evaluate returned an invalid payload.')
}

// Version string for diagnostics — confirms the lean dsim binary is loaded, not the full pipeline one.
export const getDsimWasmRuleEngineVersion = async (): Promise<string> => {
  await warmupDsimWasmRuleEngine()
  return dsimRuleEngineWasmVersionBinding()
}
