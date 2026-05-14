export type RuntimeConfig = {
  pushEndpoint?: string
  // True when the app was opened from RSL Helper via ?simple param — activates streamlined UI.
  simple?: boolean
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

function computeRuntimeConfig(): RuntimeConfig {
  const pushEndpoint = readPushEndpoint()
  const simple = readSimpleMode() || undefined
  return { ...(pushEndpoint ? { pushEndpoint } : {}), ...(simple ? { simple } : {}) }
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
