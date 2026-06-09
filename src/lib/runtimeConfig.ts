export type RuntimeConfig = {
  pushEndpoint?: string
  // True when the app was opened from RSL Helper via ?simple param — activates streamlined UI.
  simple?: boolean
  // Dev-only: true when ?capturePackets is present. Streams raw inbound endpoint
  // packets to the dev server so they can be saved as sampleLog fixtures. Always
  // false in production builds — the flag is gated on import.meta.env.DEV.
  capturePackets?: boolean
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

// Dev-only packet-capture flag. Reads ?capturePackets (or #capturePackets) the same
// way readSimpleMode does, but additionally requires import.meta.env.DEV so the
// scaffolding can never activate in a production build even if the param is present.
function readCapturePackets(): boolean {
  if (!import.meta.env.DEV) return false
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

function computeRuntimeConfig(): RuntimeConfig {
  const pushEndpoint = readPushEndpoint()
  const simple = readSimpleMode() || undefined
  const capturePackets = readCapturePackets() || undefined
  return {
    ...(pushEndpoint ? { pushEndpoint } : {}),
    ...(simple ? { simple } : {}),
    ...(capturePackets ? { capturePackets } : {}),
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = computeRuntimeConfig()
  }
  return cachedConfig
}

export function getPushEndpoint(): string | undefined {
  return getRuntimeConfig().pushEndpoint
}

// True when the ?simple URL param was present at startup.
export function getSimpleMode(): boolean {
  return getRuntimeConfig().simple ?? false
}

// Dev-only: true when ?capturePackets was present at startup AND this is a dev build.
// Drives the inbound-packet capture scaffolding (see lib/packetCapture.ts).
export function getCapturePackets(): boolean {
  return getRuntimeConfig().capturePackets ?? false
}
