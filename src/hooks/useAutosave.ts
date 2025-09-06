/**
 * useAutosave
 *
 * Encapsulates autosave writes and flush-on-exit behavior. The caller
 * controls when autosave becomes enabled (e.g., after restore choice).
 */
import { useEffect, useRef } from 'react'
import { saveAutosave } from '../lib/autosave'

export function useAutosave(opts: { key: string; payload: unknown; enabled: boolean }) {
  const { key, payload, enabled } = opts
  const lastRef = useRef<unknown>(null)

  // Write on enable and on subsequent payload changes (post-render)
  useEffect(() => {
    if (!enabled) return
    // When autosave becomes enabled, write one snapshot immediately so sessions
    // without prior autosave still persist even before any edits.
    try { lastRef.current = payload; saveAutosave(key, payload) } catch {}
  }, [enabled, key, payload])

  // Flush on unload / when tab becomes hidden
  useEffect(() => {
    if (!enabled) return
    // On unload/when tab gets hidden, persist the latest known payload.
    // Fall back to the current payload prop if we never wrote yet.
    const flush = () => {
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
