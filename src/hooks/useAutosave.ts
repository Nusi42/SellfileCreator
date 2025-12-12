/**
 * useAutosave
 *
 * Encapsulates autosave writes and flush-on-exit behavior. The caller
 * controls when autosave becomes enabled (e.g., after restore choice).
 */
import { useCallback, useEffect, useRef } from 'react'
import { saveAutosave } from '../lib/autosave'

type UseAutosaveOptions = {
  key: string
  payload: unknown
  enabled: boolean
  debounceMs?: number
  beforeSave?: () => void
}

export function useAutosave(opts: UseAutosaveOptions) {
  const { key, payload, enabled, debounceMs = 0, beforeSave } = opts
  const lastRef = useRef<unknown>(null)
  const debounceRef = useRef<number | null>(null)

  const writeSnapshot = useCallback(() => {
    try {
      beforeSave?.()
    } catch {}
    lastRef.current = payload
    saveAutosave(key, payload)
  }, [beforeSave, key, payload])

  // Persist immediately when enabled flips true so first-time sessions still get a snapshot right away.
  useEffect(() => {
    if (!enabled) return
    try { writeSnapshot() } catch {}
  }, [enabled, writeSnapshot])

  // Write on subsequent payload changes (post-render), honoring debounce to reduce churn.
  useEffect(() => {
    if (!enabled) return undefined
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
    }
    const schedule = window.setTimeout(() => {
      debounceRef.current = null
      try { writeSnapshot() } catch {}
    }, debounceMs)
    debounceRef.current = schedule
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [debounceMs, enabled, writeSnapshot])

  // Flush on unload / when tab becomes hidden
  useEffect(() => {
    if (!enabled) return
    // On unload/when tab gets hidden, persist the latest known payload.
    // Fall back to the current payload prop if we never wrote yet.
    const flush = () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      try {
        const cur = lastRef.current ?? payload
        if (cur) saveAutosave(key, cur)
      } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, key, payload])
}
