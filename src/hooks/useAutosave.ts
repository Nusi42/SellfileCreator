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
  // Eager payload path used by existing callers.
  payload?: unknown
  // Lightweight signal that marks "content changed"; this can avoid eagerly
  // allocating/serializing heavy payloads every render.
  payloadSignal?: unknown
  // Lazy payload builder invoked only when we actually persist.
  buildPayload?: () => unknown
  enabled: boolean
  debounceMs?: number
  beforeSave?: () => void
}

export function useAutosave(opts: UseAutosaveOptions) {
  const { key, payload, payloadSignal, buildPayload, enabled, debounceMs = 0, beforeSave } = opts
  const lastRef = useRef<unknown>(null)
  const debounceRef = useRef<number | null>(null)
  // Track the transition so "enabled=true" writes exactly once per activation.
  const prevEnabledRef = useRef<boolean>(false)

  // Stable payload resolver lets us decouple "when to save" from "how to build".
  const resolvePayload = useCallback((): unknown => {
    if (buildPayload) return buildPayload()
    return payload
  }, [buildPayload, payload])

  const writeSnapshot = useCallback(() => {
    try {
      beforeSave?.()
    } catch {}
    const nextPayload = resolvePayload()
    lastRef.current = nextPayload
    saveAutosave(key, nextPayload)
  }, [beforeSave, key, resolvePayload])

  // Persist immediately when enabled flips true so first-time sessions still get a snapshot right away.
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current
    prevEnabledRef.current = enabled
    if (!enabled || wasEnabled) return
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
  }, [debounceMs, enabled, payloadSignal, payload, writeSnapshot])

  // Flush on unload / when tab becomes hidden
  useEffect(() => {
    if (!enabled) return
    // On unload/when tab gets hidden, persist the latest known payload.
    // Fall back to a fresh payload resolve if we never wrote yet.
    const flush = () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      try {
        const cur = lastRef.current ?? resolvePayload()
        saveAutosave(key, cur)
      } catch {}
    }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, key, resolvePayload])
}
