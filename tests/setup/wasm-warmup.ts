import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
// The file:// fetch shim wasm-bindgen's loader needs under Node — one definition, shared with the
// headless tooling scripts.
import { installNodeFileFetch } from '../../scripts/tooling/lib/headless-pipeline.js'

// Unit/integration tests call sync builder/matcher helpers directly, so warm the
// wasm module first to guarantee those sync wrappers are ready.
await installNodeFileFetch()
await warmupWasmRuleEngine()

export const __wasmWarmupReady = true
