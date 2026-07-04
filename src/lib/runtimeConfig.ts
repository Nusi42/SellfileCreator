import { ALLOW_TEST_HOOKS } from './testHooks'

export type RuntimeConfig = {
  pushEndpoint?: string
  // True when the app was opened from RSL Helper via ?simple param — activates streamlined UI.
  simple?: boolean
  // RSL Helper's stable per-game-account id (?account=account-d). Opaque string — never
  // parsed. Used once at startup to resolve/bind/create the matching SFC account (lib/accounts.ts).
  accountId?: string
  // Optional human-readable account label (?accountName=…). Decorative only: it names a
  // freshly auto-created account and refreshes a non-customized display name — never a lookup key.
  accountName?: string
  // Dev-only: true when ?capturePackets is present. Streams raw inbound endpoint
  // packets to the dev server so they can be saved as sampleLog fixtures. Always
  // false in production builds — the flag is gated on import.meta.env.DEV.
  capturePackets?: boolean
  // TEST-only: true when ?logWasmHeap is present in a TEST build (ALLOW_TEST_HOOKS). Lets the
  // endpoint-incremental-updates Playwright spec read the rule-cache worker's WASM
  // linear-memory size via window.__wasmHeapMB (performance.memory on the main thread cannot
  // see the worker heap). Gated on ALLOW_TEST_HOOKS, so it is tree-shaken out of DEV and
  // release builds entirely — never ships.
  logWasmHeap?: boolean
}

type AppWindow = Window & { __APP_CONFIG__?: unknown }

function sanitizePushEndpoint(value: unknown): string | undefined {
  // Only accept string inputs so we do not coerce unexpected objects.
  if (typeof value !== 'string') return undefined
  // Trim whitespace to avoid subtle mismatches when params are copy-pasted.
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    // WebSocket endpoints are the only supported transport now.
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      return url.toString()
    }
  } catch {
    // ignore invalid values
  }
  return undefined
}

function readPushEndpoint(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const win = window as AppWindow
  const raw = win.__APP_CONFIG__
  if (raw && typeof raw === 'object') {
    const config = raw as { endpoint?: unknown }
    const fromConfig = sanitizePushEndpoint(config.endpoint)
    if (fromConfig) {
      return fromConfig
    }
  }

  try {
    const currentUrl = new URL(window.location.href)
    const fromSearch = sanitizePushEndpoint(currentUrl.searchParams.get('endpoint'))
    if (fromSearch) {
      return fromSearch
    }
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      const fromHash = sanitizePushEndpoint(hashParams.get('endpoint'))
      if (fromHash) {
        return fromHash
      }
    }
  } catch {
    // ignore parsing issues
  }

  return undefined
}

let cachedConfig: RuntimeConfig | null = null

// Shared reader for simple string params: query string first, then hash fragment —
// the same precedence readPushEndpoint uses. Returns a trimmed non-empty string or undefined.
function readStringParam(name: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const currentUrl = new URL(window.location.href)
    // Query param wins over hash so RSL Helper's canonical launch shape is authoritative.
    const fromSearch = currentUrl.searchParams.get(name)
    if (fromSearch && fromSearch.trim()) return fromSearch.trim()
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      const fromHash = hashParams.get(name)
      if (fromHash && fromHash.trim()) return fromHash.trim()
    }
  } catch {
    // ignore parsing issues — absent param is the safe fallback
  }
  return undefined
}

function readSimpleMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const currentUrl = new URL(window.location.href)
    // Accept ?simple, ?simple=true, ?simple=1, or ?simple= (any presence counts).
    if (currentUrl.searchParams.has('simple')) return true
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      if (hashParams.has('simple')) return true
    }
  } catch {
    // ignore
  }
  return false
}

// Dev-build flag. Vite statically replaces the `import.meta.env.DEV` token inside the
// IIFE with a literal, so release builds still resolve this to a constant `false` and the
// DEV-only readers below stay dead code. The try/catch exists for plain Node (the unit
// tests compile src directly), where `import.meta.env` does not exist and the property
// access would otherwise throw at module load.
const IS_DEV_BUILD: boolean = (() => {
  try { return Boolean(import.meta.env.DEV) } catch { return false }
})()

// Dev-only packet-capture flag. Reads ?capturePackets (or #capturePackets) the same
// way readSimpleMode does, but additionally requires a dev build (IS_DEV_BUILD) so the
// scaffolding can never activate in a production build even if the param is present.
function readCapturePackets(): boolean {
  if (!IS_DEV_BUILD) return false
  if (typeof window === 'undefined') return false
  try {
    const currentUrl = new URL(window.location.href)
    // Accept ?capturePackets, ?capturePackets=1, ?capturePackets=true, or bare presence.
    if (currentUrl.searchParams.has('capturePackets')) return true
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      if (hashParams.has('capturePackets')) return true
    }
  } catch {
    // ignore
  }
  return false
}

// Reads ?logWasmHeap (or #logWasmHeap), bare presence or =1/=true. This is a TEST-only
// hook (the e2e leak spec reads window.__wasmHeapMB), so it is gated on ALLOW_TEST_HOOKS:
// in real release builds that constant folds to `false`, making the whole reader provably
// dead so it (and the worker probe it drives) is tree-shaken out — the diagnostic does NOT
// ship. Only the TEST build (VITE_TEST_HOOKS=1) keeps it.
function readLogWasmHeap(): boolean {
  if (!ALLOW_TEST_HOOKS) return false
  if (typeof window === 'undefined') return false
  try {
    const currentUrl = new URL(window.location.href)
    if (currentUrl.searchParams.has('logWasmHeap')) return true
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      if (hashParams.has('logWasmHeap')) return true
    }
  } catch {
    // ignore
  }
  return false
}

function computeRuntimeConfig(): RuntimeConfig {
  const pushEndpoint = readPushEndpoint()
  const simple = readSimpleMode() || undefined
  // Account routing params from RSL Helper (see lib/accounts.ts for the resolution rules).
  const accountId = readStringParam('account')
  const accountName = readStringParam('accountName')
  // IS_DEV_BUILD resolves to a constant `false` in non-dev builds (see its definition),
  // so this is `false && …` → readCapturePackets() is dead and the packet-capture
  // dev tool (lib/packetCapture.ts) stays out of the release/test bundle. (capturePackets
  // is a DEV tool, not a test hook — hence the DEV gate, not ALLOW_TEST_HOOKS.)
  const capturePackets = (IS_DEV_BUILD && readCapturePackets()) || undefined
  const logWasmHeap = readLogWasmHeap() || undefined
  return {
    ...(pushEndpoint ? { pushEndpoint } : {}),
    ...(simple ? { simple } : {}),
    ...(accountId ? { accountId } : {}),
    ...(accountName ? { accountName } : {}),
    ...(capturePackets ? { capturePackets } : {}),
    ...(logWasmHeap ? { logWasmHeap } : {}),
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = computeRuntimeConfig()
  }
  return cachedConfig
}

// Test-only: drop the cached config so unit tests can vary window.location per case.
// Production never re-reads — the launch URL is fixed for the lifetime of a session.
export function __resetRuntimeConfigForTests(): void {
  cachedConfig = null
}

export function getPushEndpoint(): string | undefined {
  return getRuntimeConfig().pushEndpoint
}

// True when the ?simple URL param was present at startup.
export function getSimpleMode(): boolean {
  return getRuntimeConfig().simple ?? false
}

// RSL Helper's per-game-account id from ?account= at startup, or undefined when not launched
// with account routing. Consumed exactly once by the account resolution in lib/accounts.ts.
export function getAccountIdParam(): string | undefined {
  return getRuntimeConfig().accountId
}

// Optional display label from ?accountName= at startup (decorative companion to ?account=).
export function getAccountNameParam(): string | undefined {
  return getRuntimeConfig().accountName
}

// Dev-only: true when ?capturePackets was present at startup AND this is a dev build.
// Drives the inbound-packet capture scaffolding (see lib/packetCapture.ts).
export function getCapturePackets(): boolean {
  return getRuntimeConfig().capturePackets ?? false
}

// TEST-only: true when ?logWasmHeap was present at startup AND this is a TEST build.
// Drives the window.__wasmHeapMB stash in useRuleCacheWorker (read by the leak e2e spec).
// Always false in DEV/release (ALLOW_TEST_HOOKS folds false → readLogWasmHeap short-circuits).
export function getLogWasmHeap(): boolean {
  return getRuntimeConfig().logWasmHeap ?? false
}
