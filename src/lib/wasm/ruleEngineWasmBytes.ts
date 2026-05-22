// Single source of the rule_engine_bg.wasm base64 data URI for the main bundle.
//
// In Vite builds: wasmInlinePlugin defines __RULE_ENGINE_WASM_INLINE__ as the base64
// data URI at build time. Vite replaces the identifier with the string literal.
//
// In Node.js test builds: typeof __RULE_ENGINE_WASM_INLINE__ === 'undefined' (no Vite
// define), so we export ''. ensureWasmInitialized in wasmRuleEngine.ts falls back to
// the URL-based init path when this is empty (wasm-warmup.ts patches fetch for file://).
//
// In worker IIFE builds: suppressWasmUrlPlugin intercepts this module and returns a
// stub (export const ruleEngineWasmDataUri = '') so the 1.6 MB binary is not embedded
// a second time — the worker receives a compiled WebAssembly.Module via postMessage.

// __RULE_ENGINE_WASM_INLINE__ is declared as string|undefined in src/types/globals.d.ts.
// The typeof guard prevents ReferenceError in environments where define did not run.
export const ruleEngineWasmDataUri: string =
  typeof __RULE_ENGINE_WASM_INLINE__ === 'string' ? __RULE_ENGINE_WASM_INLINE__ : ''
