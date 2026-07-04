import { useCallback, useMemo, useState } from 'react'
import type { ContextHintId } from './contextMenuHintIds'
import { CONTEXT_HINT_REVISIONS } from './contextMenuHintIds'

/**
 * Returns a flag describing whether the context-menu hint should be visible for
 * the surface's current revision, plus a setter to record that the user has seen it.
 *
 * A hint shows once per revision (see CONTEXT_HINT_REVISIONS) — never again after
 * being seen, and in particular NOT after app updates.
 *
 * Prefer useContextMenuButtonHint for standard button/area surfaces — it bundles
 * the pos state, trigger handlers, and overlay element into one hook call.
 * Use this hook directly only for complex cases (two interleaved hints, exposed
 * pos state, container-level tracking, etc.).
 */
export function useContextMenuHint(id: ContextHintId) {
  // Marker persisted per surface: "r1", "r2", … Legacy installs stored an
  // APP_VERSION string here instead (e.g. "1.0.34"), which re-showed every hint
  // after every release — see the legacy handling in shouldShow below.
  const marker = `r${CONTEXT_HINT_REVISIONS[id]}`
  const storageKey = `sellfileCreator.contextHint.${id}`
  const [storedMarker, setStoredMarker] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, marker)
    } catch {
      // Ignore storage failures (private browsing, quota, etc.)
    }
    setStoredMarker(marker)
  }, [storageKey, marker])

  const shouldShow = useMemo(() => {
    // Never seen on this surface → show.
    if (storedMarker === null) return true
    // Seen at the current revision → done.
    if (storedMarker === marker) return false
    // Legacy APP_VERSION value (no "r" prefix): treat as "seen revision 1" so
    // existing users don't get a fresh round of hints from this migration.
    const isLegacy = !storedMarker.startsWith('r')
    return !(isLegacy && marker === 'r1')
  }, [storedMarker, marker])

  return {
    shouldShow,
    markSeen,
  }
}
