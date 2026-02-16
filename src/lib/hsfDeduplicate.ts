/**
 * hsfDeduplicate.ts
 *
 * Wrapper around the WASM export dedupe helper.
 * The keep-segment matching + coverage algorithm lives in Rust only.
 */
import type { HsfRuleWithCfg } from './merge'
import { dedupeHsfRulesForExportWithLoadedWasm } from './wasm/wasmRuleEngine'

/**
 * Collapse redundant keep blocks while preserving intervening sell rules.
 * Callers must warm up WASM before invoking this sync helper.
 */
export function dedupeHsfRulesForExport(rules: HsfRuleWithCfg[]): HsfRuleWithCfg[] {
  // Delegate to WASM so export dedupe semantics stay in one implementation.
  const deduped = dedupeHsfRulesForExportWithLoadedWasm(rules)
  // Fail closed when warmup/recipe is missing; no JS fallback path remains.
  if (!Array.isArray(deduped)) {
    throw new Error('WASM export dedupe is unavailable. Ensure warmupWasmRuleEngine() ran first.')
  }
  // Keep output shape compatible with existing TS call sites.
  return deduped
}
