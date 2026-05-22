import type { Plugin } from 'vite'

// Prevents rule_engine_bg.wasm from being embedded twice in the single-file app build.
//
// Without this plugin, every bundle that imports rule_engine.js (the generated wasm-bindgen
// JS glue) gets rule_engine_bg.wasm inlined as a data URI — once in the main bundle (because
// App.tsx → merge.ts → wasmRuleEngine.ts → rule_engine.js) and once in the IIFE rule-cache
// worker bundle. That produces two identical ~1.6 MB base64 blobs in the single-file app.
//
// Two separate transforms remove the duplication:
//
// 1. transform() — applied to ALL bundles (main + worker):
//    Replaces the no-arg URL fallback inside __wbg_init with an explicit throw so Vite
//    does not emit rule_engine_bg.wasm as a bundle asset via new URL(…, import.meta.url).
//    The real loading path uses __RULE_ENGINE_WASM_INLINE__ (set by wasmInlinePlugin) which
//    lives only in ruleEngineWasmBytes.ts.
//
// 2. resolveId()/load() — applied to worker bundles only (stubInlineBytes: true):
//    Intercepts ruleEngineWasmBytes so the worker IIFE receives '' instead of the 1.6 MB
//    data URI. The worker never calls ensureWasmInitialized; it receives a compiled
//    WebAssembly.Module from the main thread via postMessage and calls initSync() instead.

type Options = {
  // When true, stub ruleEngineWasmBytes to export '' so the worker IIFE does not embed
  // the WASM data URI. Only pass this for the worker build plugins, not the main build.
  stubInlineBytes?: boolean
}

const WASM_BYTES_STUB_ID = '\0rule_engine_wasm_bytes_stub'

export function suppressWasmUrlPlugin(options?: Options): Plugin {
  const stubInline = options?.stubInlineBytes ?? false
  return {
    name: 'suppress-wasm-url',
    enforce: 'pre',
    resolveId(id) {
      // In worker builds, intercept ruleEngineWasmBytes so the WASM data URI is not embedded.
      if (stubInline && id.endsWith('/ruleEngineWasmBytes')) return WASM_BYTES_STUB_ID
    },
    load(id) {
      // Stub: worker receives the WebAssembly.Module via postMessage instead of bytes.
      if (id === WASM_BYTES_STUB_ID) return 'export const ruleEngineWasmDataUri = ""'
    },
    transform(code, id) {
      // Only transform the main rule-engine glue; leave rule_engine_dsim.js untouched.
      if (!id.endsWith('/rule_engine.js')) return null
      const patched = code.replace(
        /if \(module_or_path === undefined\) \{\s*module_or_path = new URL\('rule_engine_bg\.wasm', import\.meta\.url\);\s*\}/,
        "if (module_or_path === undefined) { throw new Error('[rule_engine] WASM module must be provided; auto-URL loading is disabled'); }",
      )
      // Only return a transformed result when the pattern was actually found.
      if (patched === code) return null
      return { code: patched, map: null }
    },
  }
}
