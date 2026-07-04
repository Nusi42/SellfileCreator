import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

import { APP_EDGE_GAP_PX, SIDE_BY_SIDE_TARGET_WIDTH_PX } from '../lib/constants'
import { APP_ZOOM_CSS_VAR, resolveSideBySideZoom } from '../lib/sideBySideZoom'
import type { ResolveSideBySideZoomOptions } from '../lib/sideBySideZoom'

export type AutoSideBySideZoomState = {
  zoom: number
  forceSideBySide: boolean
  // Width (CSS px, pre-zoom) the forced canvas should render at — widens beyond the target when the
  // height shortfall drove the zoom, so the scaled canvas fills the viewport instead of leaving bars.
  canvasWidthPx: number
}

export type UseAutoSideBySideZoomOptions = {
  // When this ref reads true, page zoom / side-by-side fit are fully suppressed: the #root zoom is
  // cleared and the hook reports forceSideBySide:false. Used in simple (express) mode where only the
  // centered note dialog is shown — it fills the viewport via its own CSS (NOTE_DIALOG_SIMPLE_PAPER_SX)
  // rather than via page zoom, and the (hidden) builder/preview panels behind it need no scaling. A
  // ref (not a plain prop) keeps the suppression source decoupled from this hook's call-order in
  // App.tsx — the caller updates the ref and invokes the returned reevaluate() when the condition flips.
  suppressedRef?: MutableRefObject<boolean>
  // Live user settings (theme flyout): the enabled master switch and the tunable cutoff. Read through
  // a ref for the same call-order reason as suppressedRef; the caller mutates it and calls reevaluate()
  // so a settings change applies immediately rather than on the next resize. Defaults apply when absent.
  settingsRef?: MutableRefObject<ResolveSideBySideZoomOptions>
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
export function useAutoSideBySideZoom({ suppressedRef, settingsRef }: UseAutoSideBySideZoomOptions = {}): AutoSideBySideZoom {
  const [state, setState] = useState<AutoSideBySideZoomState>({ zoom: 1, forceSideBySide: false, canvasWidthPx: SIDE_BY_SIDE_TARGET_WIDTH_PX })
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
      // Suppressed (e.g. simple mode with only the note dialog showing) → don't fit the side-by-side
      // canvas (the builder/preview panels are display:none behind the dialog). Instead fit the page
      // to the note dialog's OWN footprint so it fills the viewport with a small gap: shrink-only,
      // capped at 1 (resolveSimpleNoteZoom). Publishing --app-zoom scales the portaled dialog paper.
      // We still report forceSideBySide:false — only the note dialog is on screen, not the panels.
      if (suppressedRef?.current) {
        // Clear any page zoom and report stacked. Simple mode does NOT scale the page: the note
        // dialog sizes itself to fill the viewport via its own CSS (see NOTE_DIALOG_SIMPLE_PAPER_SX),
        // so a uniform page `zoom` here would only re-introduce the lg/vh/centering artifacts (small
        // box, large margins). There are no visible panels behind the dialog to scale anyway.
        applyZoom(null)
        const next: AutoSideBySideZoomState = { zoom: 1, forceSideBySide: false, canvasWidthPx: SIDE_BY_SIDE_TARGET_WIDTH_PX }
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
      // documentElement (<html>) clientWidth/Height give the viewport minus scrollbar gutters, so the
      // zoomed canvas never overflows. (Distinct from `root`, the #root element zoom is applied to.)
      const docEl = document.documentElement
      // Fit the canvas into the viewport MINUS the fixed app edge gap on every side, so the scaled
      // forced canvas leaves the same decorative gap that #root's padding gives the non-forced layout.
      // Both dimensions lose 2·gap (one gap per edge). Clamp at 1px so tiny viewports don't go ≤ 0.
      const availWidth = Math.max(1, docEl.clientWidth - APP_EDGE_GAP_PX * 2)
      const availHeight = Math.max(1, docEl.clientHeight - APP_EDGE_GAP_PX * 2)
      // Thread the live enabled/cutoff settings; when disabled the decision falls through to the
      // native breakpoint layout (forceSideBySide:false, zoom 1).
      const decision = resolveSideBySideZoom(
        { width: availWidth, height: availHeight },
        settingsRef?.current,
      )
      // 4 decimals is plenty of precision for a CSS zoom and keeps state-change comparisons stable.
      const nextZoom = Number(decision.zoom.toFixed(4))
      const next: AutoSideBySideZoomState = { zoom: nextZoom, forceSideBySide: decision.forceSideBySide, canvasWidthPx: decision.canvasWidthPx }
      // Re-apply on every evaluation (resize) so the #root override tracks the viewport: the fitted
      // zoom when forced, or null to clear the zoom entirely when we fall back to stacked.
      applyZoom(next.forceSideBySide ? next.zoom : null)
      // Re-render on any field change — canvasWidthPx can shift while zoom holds (height-bound resize).
      if (stateRef.current.zoom !== next.zoom || stateRef.current.forceSideBySide !== next.forceSideBySide || stateRef.current.canvasWidthPx !== next.canvasWidthPx) {
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
  }, [applyZoom, suppressedRef, settingsRef])

  // Stable callback the caller invokes after flipping suppressedRef so suppression takes effect now
  // rather than on the next resize.
  const reevaluate = useCallback(() => { evaluateRef.current() }, [])

  return { ...state, reevaluate }
}
