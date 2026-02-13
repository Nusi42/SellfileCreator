/**
 * hsfObsolete.ts
 *
 * Single-source wrapper around the WASM obsolete detector.
 * The domination algorithm lives only in wasm/rule_engine/src/lib.rs.
 */
import type { HsfRule } from './hsfTypes'
import { findObsoleteRulesWithLoadedWasm } from './wasm/wasmRuleEngine'

/** Entry describing one obsolete rule and the covering rule index with reason. */
export type ObsoleteEntry = { index: number; coveredBy: number; reason: string }
/** Summary report listing all obsolete rules. */
export type ObsoleteReport = { obsolete: ObsoleteEntry[] }

/**
 * Compute obsolete-rule coverage through the WASM engine only.
 * Callers must warm up WASM before invoking this sync helper.
 */
export function findObsoleteRules(rules: HsfRule[]): ObsoleteReport {
  // Delegate to WASM so domination semantics are defined in one place.
  const report = findObsoleteRulesWithLoadedWasm(rules)
  // Fail closed when warmup/config is missing; no JS duplicate path remains.
  if (!report || !Array.isArray(report.obsolete)) {
    throw new Error('WASM obsolete-rule detector is unavailable. Ensure warmupWasmRuleEngine() ran first.')
  }
  // Keep output shape compatible with existing TS call sites.
  return report
}

