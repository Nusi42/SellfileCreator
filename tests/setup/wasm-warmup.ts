import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'

const installNodeFileFetch = async (): Promise<void> => {
  // Node's fetch does not handle file:// URLs yet, but wasm-bindgen resolves the
  // generated .wasm path as file:// in our compiled test artifacts.
  const isNodeRuntime = typeof process !== 'undefined' && Boolean(process.versions?.node)
  if (!isNodeRuntime) return
  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') return
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.href : input.url)
    if (url.startsWith('file://')) {
      const { readFile } = await import('node:fs/promises')
      const bytes = await readFile(new URL(url))
      const wasmBytes = new Uint8Array(bytes)
      return new Response(wasmBytes, {
        status: 200,
        headers: { 'content-type': 'application/wasm' },
      })
    }
    return originalFetch(input, init)
  }) as typeof fetch
}

// Unit/integration tests call sync builder/matcher helpers directly, so warm the
// wasm module first to guarantee those sync wrappers are ready.
await installNodeFileFetch()
await warmupWasmRuleEngine()

export const __wasmWarmupReady = true
