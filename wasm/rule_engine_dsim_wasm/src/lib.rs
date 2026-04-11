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

use serde_wasm_bindgen::{from_value as from_js_value, to_value as to_js_value};
use wasm_bindgen::prelude::*;
use rule_engine_core::{configure_engine, evaluate_engine, RuleRaw, EvaluateItemRaw, EvaluateOptionsRaw};

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
// Must be called before evaluate_value.  Re-calling drops the old BucketedRules
// and allocates a fresh one from the recycled heap space.
#[wasm_bindgen]
pub fn configure_value(rules: JsValue, recipe_modes: JsValue) -> Result<(), JsValue> {
    let raw_rules: Vec<RuleRaw> = from_js_value(rules)
        .map_err(|error| JsValue::from_str(&format!("Invalid rules value: {error}")))?;
    let parsed_recipe_modes: Vec<String> = from_js_value(recipe_modes)
        .map_err(|error| JsValue::from_str(&format!("Invalid recipeModes value: {error}")))?;
    configure_engine(raw_rules, parsed_recipe_modes);
    Ok(())
}

// Evaluate a batch of items against the configured rules.
// Mirrors the evaluate_value export in rule_engine_wasm exactly so the shared
// TS wrapper in wasmDsimRuleEngine.ts can call it with the same serialization.
//
// Requires configure_value to have been called first.
#[wasm_bindgen]
pub fn evaluate_value(items: JsValue, options: JsValue) -> Result<JsValue, JsValue> {
    let parsed_items: Vec<EvaluateItemRaw> = from_js_value(items)
        .map_err(|error| JsValue::from_str(&format!("Invalid items value: {error}")))?;
    let parsed_options: EvaluateOptionsRaw = if options.is_undefined() || options.is_null() {
        EvaluateOptionsRaw::default()
    } else {
        from_js_value(options)
            .map_err(|error| JsValue::from_str(&format!("Invalid options value: {error}")))?
    };
    let results = evaluate_engine(parsed_items, parsed_options)
        .map_err(|error| JsValue::from_str(&error))?;
    to_js_value(&results)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize evaluate value: {error}")))
}
