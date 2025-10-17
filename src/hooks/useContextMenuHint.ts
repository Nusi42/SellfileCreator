import { useCallback, useMemo, useState } from 'react'
import { APP_VERSION } from '../version'

type Options = {
  version?: string
}

/**
 * Returns a flag describing whether the context-menu hint should be visible for
 * the current app version, plus a setter to record that the user has seen it.
 */
export function useContextMenuHint(id: string, options?: Options) {
  const version = options?.version ?? APP_VERSION
  const storageKey = `sellfileCreator.contextHint.${id}`
  const [storedVersion, setStoredVersion] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, version)
    } catch {
      // Ignore storage failures (private browsing, quota, etc.)
    }
    setStoredVersion(version)
  }, [storageKey, version])

  const shouldShow = useMemo(() => storedVersion !== version, [storedVersion, version])

  return {
    shouldShow,
    markSeen,
  }
}
