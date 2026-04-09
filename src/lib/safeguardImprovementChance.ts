/**
 * safeguardImprovementChance.ts
 *
 * Thin WASM wrapper — the probability recursion engine lives exclusively in Rust
 * (wasm/rule_engine_core/src/safeguards/improvement_chance.rs).
 * This module re-exports types and provides a convenience entry point that
 * delegates to the WASM binding. Callers must store artifact rows in WASM
 * (via storeArtifactRows / storeArtifactRowsWithLoadedWasm) before calling.
 */
import type { SafeguardRule } from './safeguards'
import {
  computeImprovementChanceWithLoadedWasm,
  type ImprovementChanceWasmEntry,
  type ImprovementChanceWasmDebug,
} from './wasm/wasmRuleEngine'

// Re-export WASM types under the names consumed by tests, scripts, and earlier callers.
export type SafeguardImprovementChanceEntry = ImprovementChanceWasmEntry
export type SafeguardImprovementChanceDebug = ImprovementChanceWasmDebug

// Build artifact-id keyed improvement-chance entries from the WASM engine.
// Precondition: artifact rows must already be stored in WASM state via storeArtifactRows.
export const buildSafeguardImprovementChanceByArtifactId = (
  rules: readonly SafeguardRule[],
): Map<number, SafeguardImprovementChanceEntry> => {
  const output = new Map<number, SafeguardImprovementChanceEntry>()
  // Delegate to the Rust recursion engine (SSOT for the probability computation).
  // Unwrap the { entries, diag } wrapper; diag is only used in the worker dev-tracing path.
  const result = computeImprovementChanceWithLoadedWasm({ rules, enabled: true })
  if (!result) return output
  for (const entry of result.entries) {
    const artifactId = Number(entry.artifactId)
    if (Number.isFinite(artifactId)) {
      output.set(artifactId, entry)
    }
  }
  return output
}
