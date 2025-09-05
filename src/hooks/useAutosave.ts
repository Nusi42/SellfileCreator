/**
 * useAutosave
 *
 * Encapsulates autosave writes and flush-on-exit behavior. The caller
 * controls when autosave becomes enabled (e.g., after restore choice).
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { saveAutosave } from '../lib/autosave'

export function useAutosave(opts: { key: string; payload: unknown; enabled: boolean }) {
  const { key, payload, enabled } = opts
  const lastRef = useRef<unknown>(null)
  const initSkipRef = useRef<boolean>(false)

  // Write on payload changes (skip initial write)
  useLayoutEffect(() => {
    if (!enabled) return
    if (!initSkipRef.current) { initSkipRef.current = true; return }
    try { lastRef.current = payload; saveAutosave(key, payload) } catch {}
  }, [enabled, key, payload])

  // Flush on unload / when tab becomes hidden
  useEffect(() => {
    if (!enabled) return
    const flush = () => { try { const cur = lastRef.current; if (cur) saveAutosave(key, cur) } catch {} }
    const onVis = () => { if (document.hidden) flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, key])
}

