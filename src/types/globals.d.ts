/* eslint import/no-unused-modules: off */
declare global {
  const __SQL_JS_WASM_INLINE__: string | undefined
  // Injected by wasmInlinePlugin at build time; undefined in Node.js test environments.
  const __RULE_ENGINE_WASM_INLINE__: string | undefined
}

export {}
