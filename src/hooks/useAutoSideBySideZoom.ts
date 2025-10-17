import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { AUTO_SIDE_BY_SIDE_MIN_ZOOM, SIDE_BY_SIDE_BREAKPOINT_PX } from '../lib/constants'

export type AutoSideBySideZoomState = {
  zoom: number
  forceSideBySide: boolean
}

/**
 * useAutoSideBySideZoom
 *
 * Attempts to shrink the app just enough to render the builder/preview papers side-by-side
 * on desktop widths that fall short of the breakpoint. We clamp the zoom so readability
 * does not suffer on very small displays and revert automatically when the viewport is wide
 * enough to render the native layout.
 */
export function useAutoSideBySideZoom(): AutoSideBySideZoomState {
  const [state, setState] = useState<AutoSideBySideZoomState>({ zoom: 1, forceSideBySide: false })
  const stateRef = useRef(state)
  const applyZoom = useCallback((targetZoom: number | null) => {
    if (typeof document === 'undefined') return
    const root = document.getElementById('root')
    if (!root) return
    if (targetZoom === null || targetZoom === 1) {
      root.style.removeProperty('zoom')
      return
    }
    const normalized = Math.max(0.01, Math.min(targetZoom, 1))
    root.style.zoom = normalized.toString()
  }, [])

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const root = document.getElementById('root')
    if (!root) return
    const initialZoom = root.style.zoom

    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`) : null

    const evaluate = () => {
      if (media?.matches) {
        if (stateRef.current.zoom !== 1 || stateRef.current.forceSideBySide) {
          applyZoom(null)
          const next: AutoSideBySideZoomState = { zoom: 1, forceSideBySide: false }
          stateRef.current = next
          setState(next)
        } else {
          applyZoom(null)
        }
        return
      }
      const viewportWidth = window.innerWidth
      if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
        if (stateRef.current.zoom !== 1 || stateRef.current.forceSideBySide) {
          applyZoom(null)
          const next: AutoSideBySideZoomState = { zoom: 1, forceSideBySide: false }
          stateRef.current = next
          setState(next)
        }
        return
      }
      const candidateZoom = viewportWidth / SIDE_BY_SIDE_BREAKPOINT_PX
      if (candidateZoom >= AUTO_SIDE_BY_SIDE_MIN_ZOOM && candidateZoom < 1) {
        const nextZoom = Number(candidateZoom.toFixed(4))
        const next: AutoSideBySideZoomState = { zoom: nextZoom, forceSideBySide: true }
        if (stateRef.current.zoom !== next.zoom || stateRef.current.forceSideBySide !== next.forceSideBySide) {
          applyZoom(next.zoom)
          stateRef.current = next
          setState(next)
        } else {
          applyZoom(next.zoom)
        }
        return
      }
      if (stateRef.current.zoom !== 1 || stateRef.current.forceSideBySide) {
        applyZoom(null)
        const next: AutoSideBySideZoomState = { zoom: 1, forceSideBySide: false }
        stateRef.current = next
        setState(next)
      }
    }

    evaluate()
    const handleResize = () => evaluate()
    window.addEventListener('resize', handleResize)
    const cleanup = () => {
      window.removeEventListener('resize', handleResize)
      if (initialZoom) {
        root.style.zoom = initialZoom
      } else {
        root.style.removeProperty('zoom')
      }
    }
    return cleanup
  }, [applyZoom])

  return state
}
