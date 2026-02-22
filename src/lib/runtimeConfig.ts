export type RuntimeConfig = {
  pushEndpoint?: string
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

function computeRuntimeConfig(): RuntimeConfig {
  const pushEndpoint = readPushEndpoint()
  return pushEndpoint ? { pushEndpoint } : {}
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
