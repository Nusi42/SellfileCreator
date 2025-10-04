export type RuntimeConfig = {
  pushEndpoint?: string
}

type AppWindow = Window & { __APP_CONFIG__?: unknown }

function sanitizePushEndpoint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
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
    const fromConfig = sanitizePushEndpoint((raw as { pushEndpoint?: unknown }).pushEndpoint)
    if (fromConfig) {
      return fromConfig
    }
  }

  try {
    const currentUrl = new URL(window.location.href)
    const fromSearch = sanitizePushEndpoint(currentUrl.searchParams.get('push'))
    if (fromSearch) {
      return fromSearch
    }
    if (currentUrl.hash && currentUrl.hash.length > 1) {
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1))
      const fromHash = sanitizePushEndpoint(hashParams.get('push'))
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
