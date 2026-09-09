// rule_engine_dsim_wasm — lean WASM cdylib for the dungeon simulator worker.
//
// Exports only configure_value + evaluate_value + version.  The Rust/LLVM
// dead-code elimination pass removes all other rule_engine_core symbols
// (safeguards, HSF builder, improvement-chance, merge, finalise, etc.)
// because no #[wasm_bindgen] attribute references them.
//
// Allocator: uses the default wasm32 allocator (wasm-bindgen's dlmalloc shim).
// talc is intentionally absent — the dsim allocation pattern is well-behaved:
//   • configure_value allocates BucketedRules once, held for session lifetime.
//   • evaluate_value does small temporary allocations per item (freed per call).
// No large HashMap memo tables, no repeated alloc/free cycles → no fragmentation,
// no STATUS_ACCESS_VIOLATION risk even at high rule counts.
//
// Build (from repo root):
//   node scripts/tooling/build-rule-engine-dsim-wasm.mjs
// Output:
//   src/lib/wasm/generated/rule_engine_dsim.js
//   src/lib/wasm/generated/rule_engine_dsim.d.ts
//   src/lib/wasm/generated/rule_engine_dsim_bg.wasm
//   src/lib/wasm/generated/rule_engine_dsim_bg.wasm.d.ts

use rule_engine_core::wasm_merged_rules_wire_format::RuleRawWire;
use rule_engine_core::{configure_engine, evaluate_engine, EvaluateValueInWire, RuleRaw};
use serde_wasm_bindgen::to_value as to_js_value;
use wasm_bindgen::prelude::*;

// Expose a version token so diagnostics can confirm the lean dsim binary is loaded
// rather than the full pipeline binary.
#[wasm_bindgen]
pub fn version() -> String {
    // Suffix differentiates from "rule-engine-wasm-v*" (full pipeline binary).
    "rule-engine-dsim-wasm-v0.1".to_string()
}

// Configure the rule engine with the merged rules + recipe-mode visibility.
// Mirrors the configure_value export in rule_engine_wasm exactly so the shared
// TS wrapper in wasmDsimRuleEngine.ts can call it with the same serialization.
//
// Takes a JSON string in the same minified wire format used by the full
// rule_engine_wasm binary: `{ "rules": [RuleRawWire...], "recipeModes": [...] }`.
// See wasm/rule_engine_core/src/wasm_merged_rules_wire_format.rs for the
// format definition and conversion impls.
//
// Must be called before evaluate_value.  Re-calling drops the old BucketedRules
// and allocates a fresh one from the recycled heap space.
#[wasm_bindgen]
pub fn configure_value(payload: &str) -> Result<JsValue, JsValue> {
    #[derive(serde::Deserialize)]
    struct ConfigurePayload {
        #[serde(default)]
        rules: Vec<RuleRawWire>,
        #[serde(default, rename = "recipeModes")]
        recipe_modes: Vec<String>,
    }
    let parsed: ConfigurePayload = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid configure payload: {error}")))?;
    let raw_rules: Vec<RuleRaw> = parsed.rules.into_iter().map(RuleRaw::from).collect();
    configure_engine(raw_rules, parsed.recipe_modes);
    // wasm-bindgen doesn't allow Result<(), JsValue> combined with non-JsValue
    // inputs; return JsValue::UNDEFINED so the binding signature is well-typed.
    Ok(JsValue::UNDEFINED)
}

// Evaluate a batch of items against the configured rules.
// Mirrors the evaluate_value export in rule_engine_wasm exactly so the shared
// TS wrapper in wasmDsimRuleEngine.ts can call it with the same serialization.
// Both share the EvaluateValueInWire wrapper defined in rule_engine_core so the
// wire shape stays in lockstep across binaries.
//
// Requires configure_value to have been called first.
#[wasm_bindgen]
pub fn evaluate_value(payload: &str) -> Result<JsValue, JsValue> {
    let input: EvaluateValueInWire = serde_json::from_str(payload)
        .map_err(|error| JsValue::from_str(&format!("Invalid evaluate-value payload: {error}")))?;
    let results =
        evaluate_engine(input.items, input.options.unwrap_or_default()).map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&results).map_err(|error| JsValue::from_str(&format!("Failed to serialize evaluate value: {error}")))
}
