import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { APP_ZOOM_CSS_VAR, resolveSideBySideZoom } from '../lib/sideBySideZoom'

export type AutoSideBySideZoomState = {
  zoom: number
  forceSideBySide: boolean
}

export type UseAutoSideBySideZoomOptions = {
  // When this ref reads true, zoom/side-by-side are fully suppressed: the #root zoom is cleared and
  // the hook reports forceSideBySide:false. Used to opt out in simple mode where only the note
  // dialog is shown and scaling the (hidden) panels behind it serves no purpose. A ref (not a plain
  // prop) keeps the suppression source decoupled from this hook's call-order in App.tsx — the caller
  // updates the ref and invokes the returned reevaluate() when the condition flips.
  suppressedRef?: MutableRefObject<boolean>
}

export type AutoSideBySideZoom = AutoSideBySideZoomState & {
  // Forces an immediate re-evaluation; call after mutating suppressedRef.current.
  reevaluate: () => void
}

/**
 * useAutoSideBySideZoom
 *
 * Forces the builder/preview papers side-by-side down to a width cutoff and shrinks the app with
 * CSS zoom so the fixed canvas fits. The zoom is computed dynamically from the viewport width
 * (down to a cutoff below which it reverts to stacked) and re-evaluated on resize. The live value
 * is published to the --app-zoom CSS variable for portal content outside #root. When suppressedRef
 * reads true the hook clears the zoom and reports stacked regardless of width.
 */
export function useAutoSideBySideZoom({ suppressedRef }: UseAutoSideBySideZoomOptions = {}): AutoSideBySideZoom {
  const [state, setState] = useState<AutoSideBySideZoomState>({ zoom: 1, forceSideBySide: false })
  const stateRef = useRef(state)
  const applyZoom = useCallback((targetZoom: number | null) => {
    if (typeof document === 'undefined') return
    const root = document.getElementById('root')
    if (!root) return
    if (targetZoom === null || targetZoom === 1) {
      root.style.removeProperty('zoom')
      // Remove the custom property so portal content (dialogs, tooltips, menus) reverts to 100% scale.
      document.documentElement.style.removeProperty(APP_ZOOM_CSS_VAR)
      return
    }
    const normalized = Math.max(0.01, Math.min(targetZoom, 1))
    root.style.zoom = normalized.toString()
    // Expose the zoom value for portal content outside #root (dialogs, tooltips, menus) which
    // cannot inherit the #root zoom directly. See MUI theme styleOverrides in theme.ts.
    document.documentElement.style.setProperty(APP_ZOOM_CSS_VAR, normalized.toString())
  }, [])

  // Ref-based setter so the resize/media-query callbacks avoid the set-state-in-effect lint rule.
  const setStateRef = useRef(setState)
  useEffect(() => { setStateRef.current = setState }, [setState])

  // Holds the effect's evaluate() so reevaluate() (returned to the caller) can trigger it on demand,
  // e.g. immediately after the caller flips suppressedRef.current.
  const evaluateRef = useRef<() => void>(() => {})

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const root = document.getElementById('root')
    if (!root) return
    const initialZoom = root.style.zoom

    const evaluate = () => {
      // Suppressed (e.g. simple mode with only the note dialog showing) → clear any zoom and report
      // stacked, ignoring viewport width entirely. There are no visible panels to scale behind the
      // dialog, so zooming would only distort the dialog's surroundings.
      if (suppressedRef?.current) {
        applyZoom(null)
        const next: AutoSideBySideZoomState = { zoom: 1, forceSideBySide: false }
        if (stateRef.current.zoom !== next.zoom || stateRef.current.forceSideBySide !== next.forceSideBySide) {
          stateRef.current = next
          setStateRef.current(next)
        }
        return
      }
      // Force side-by-side and derive the fitting zoom from the current viewport, down to a cutoff:
      // once the canvas can no longer fit at an acceptable zoom the decision flips to stacked
      // (forceSideBySide:false, zoom 1). We read clientWidth (not innerWidth) so the vertical
      // scrollbar's gutter is excluded and the zoomed canvas never overflows. See
      // resolveSideBySideZoom for the cutoff and clamp.
      const viewportWidth = document.documentElement.clientWidth
      const decision = resolveSideBySideZoom(viewportWidth)
      // 4 decimals is plenty of precision for a CSS zoom and keeps state-change comparisons stable.
      const nextZoom = Number(decision.zoom.toFixed(4))
      const next: AutoSideBySideZoomState = { zoom: nextZoom, forceSideBySide: decision.forceSideBySide }
      // Re-apply on every evaluation (resize) so the #root override tracks the viewport: the fitted
      // zoom when forced, or null to clear the zoom entirely when we fall back to stacked.
      applyZoom(next.forceSideBySide ? next.zoom : null)
      if (stateRef.current.zoom !== next.zoom || stateRef.current.forceSideBySide !== next.forceSideBySide) {
        stateRef.current = next
        setStateRef.current(next)
      }
    }
    // Publish for reevaluate(); cleared on cleanup so a stale closure can't run after unmount.
    evaluateRef.current = evaluate

    evaluate()
    const handleResize = () => evaluate()
    // AbortController lets the lint rule trace the cleanup path for event listeners.
    const ac = new AbortController()
    window.addEventListener('resize', handleResize, { signal: ac.signal })
    return () => {
      ac.abort()
      evaluateRef.current = () => {}
      if (initialZoom) {
        root.style.zoom = initialZoom
      } else {
        root.style.removeProperty('zoom')
      }
    }
  }, [applyZoom, suppressedRef])

  // Stable callback the caller invokes after flipping suppressedRef so suppression takes effect now
  // rather than on the next resize.
  const reevaluate = useCallback(() => { evaluateRef.current() }, [])

  return { ...state, reevaluate }
}
