/**
 * useSplitterDrag
 *
 * SSOT for the splitter drag gesture shared by the two resize handles in the app:
 * the vertical handle between the builder and preview columns (SideBySideSplitter) and the
 * horizontal handle between the builder form and the chip list (BuilderSplitter).
 *
 * Both handles want identical mechanics and differ only in axis and clamping, so the gesture
 * lives here once:
 *   - mousedown: snapshot the start coordinate, the start ratio, and the container's usable
 *       extent, then attach move/up listeners.
 *   - mousemove: convert the cursor delta to a ratio delta, clamp it, and write absolute px to
 *       two CSS custom properties on the container. No React state is touched during the drag,
 *       so a gesture costs zero re-renders.
 *   - mouseup: commit the final clamped ratio via onResize (exactly one re-render).
 *
 * Double-click reset stays with each handle: 50/50 for the columns, natural height for the
 * builder column, which is the one behaviour the two genuinely disagree on.
 *
 * The container's usable extent is snapshotted once at drag start rather than re-read per move:
 * the container cannot resize mid-gesture, and calling getBoundingClientRect() on every mousemove
 * forces a synchronous layout flush that starves the browser's rendering update — which is what
 * delivers the ResizeObserver notifications driving live layout (e.g. the preview column count).
 */
import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { getCurrentSideBySideZoom } from '../lib/sideBySideZoom'

export type SplitterDragAxis = 'horizontal' | 'vertical'

/**
 * Split a container extent at `ratio`, honouring both absolute px floors.
 *
 * SSOT for the ratio→px conversion. The drag writes the result to the CSS variables, and any
 * component that renders a committed ratio as a fallback height/width must resolve it the SAME
 * way — including subtracting the handle's own extent from the container first. Deriving the
 * fallback independently makes the pre-drag (and post-reload) size differ from the size the
 * gesture actually produced, by `gapPx * ratio`.
 */
export function splitExtentByRatio({
  ratio,
  extentPx,
  gapPx,
  minLeadingPx,
  minTrailingPx,
}: {
  ratio: number
  /** Full container extent along the drag axis, handle included. */
  extentPx: number
  gapPx: number
  minLeadingPx: number
  minTrailingPx: number
}): { leadingPx: number; trailingPx: number; usablePx: number } {
  // The handle sits between the panels, so it is not theirs to divide.
  const usablePx = Math.max(0, extentPx - gapPx)
  const leadingPx = Math.max(minLeadingPx, Math.min(usablePx - minTrailingPx, Math.round(ratio * usablePx)))
  return { leadingPx, trailingPx: usablePx - leadingPx, usablePx }
}

// ── Active-gesture flag ──
// A splitter drag resizes real elements on every mousemove, and those elements are watched by the
// ResizeObservers in useBuilderPreviewLayout. Left alone, each move would trigger a measurement →
// setState → re-render in the middle of the gesture, which is exactly the stutter the CSS-variable
// design exists to avoid — and the measurements are wasted anyway, since the sizes they read are
// mid-drag intermediates that the mouseup commit supersedes.
//
// Module-level rather than React state on purpose: it must be readable from inside observer
// callbacks without re-registering them, and flipping it must never itself cause a render.
let splitterDragActive = false

/** True while any splitter drag gesture is in flight. */
export const isSplitterDragActive = (): boolean => splitterDragActive

export type UseSplitterDragOptions = {
  /** 'horizontal' = handle moves left/right (resizes columns); 'vertical' = up/down (rows). */
  axis: SplitterDragAxis
  /** Current committed ratio — the drag start reference. */
  ratio: number
  /** Container whose CSS custom properties carry the live drag values. */
  containerRef: RefObject<HTMLElement | null>
  /** CSS custom property receiving the leading (left / top) panel size in px. */
  leadingVar: string
  /** CSS custom property receiving the trailing (right / bottom) panel size in px. */
  trailingVar: string
  /** Extent consumed by the handle itself, subtracted from the container before splitting. */
  gapPx: number
  /** Absolute px floor for the leading panel. */
  minLeadingPx: number
  /** Absolute px floor for the trailing panel. */
  minTrailingPx: number
  /** When true, #root carries a CSS zoom and pointer deltas must be divided by it. */
  forceSideBySide?: boolean
  /** Called once on mouseup with the final clamped ratio. */
  onResize: (ratio: number) => void
  /** Optional live callback fired each mousemove with the trailing panel size in px. */
  onResizeLive?: (trailingPx: number) => void
  /**
   * Overrides the container's measured extent. The builder column needs this: its usable extent
   * is the paper-height budget computed by useBuilderPreviewLayout, not the element's own box.
   */
  usableExtentPx?: number | null
}

export type SplitterDragHandlers = {
  handleMouseDown: (e: React.MouseEvent) => void
}

export function useSplitterDrag({
  axis,
  ratio,
  containerRef,
  leadingVar,
  trailingVar,
  gapPx,
  minLeadingPx,
  minTrailingPx,
  forceSideBySide = false,
  onResize,
  onResizeLive,
  usableExtentPx,
}: UseSplitterDragOptions): SplitterDragHandlers {
  // Drag bookkeeping lives in refs so the document-level listeners never read stale closures.
  const dragStartCoordRef = useRef<number | null>(null)
  const dragStartRatioRef = useRef<number>(ratio)
  // Accumulates the latest clamped ratio so mouseup can commit it.
  const dragFinalRatioRef = useRef<number>(ratio)
  // Whether this gesture actually moved the pointer. A plain click — and each of the two clicks
  // inside a double-click — produces mousedown+mouseup with no movement; committing there would
  // write a ratio the user never chose, and in the double-click case the second click's commit
  // lands AFTER the dblclick reset and silently undoes it.
  const dragMovedRef = useRef(false)
  // Live mirrors of the props the mousedown/mousemove closures read, synced after render so the
  // listeners never need re-registering (and never read a ref during render).
  const ratioRef = useRef(ratio)
  useEffect(() => { ratioRef.current = ratio })
  const onResizeLiveRef = useRef(onResizeLive)
  useEffect(() => { onResizeLiveRef.current = onResizeLive }, [onResizeLive])
  const usableExtentRef = useRef(usableExtentPx)
  useEffect(() => { usableExtentRef.current = usableExtentPx }, [usableExtentPx])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only the primary button starts a drag; other buttons belong to context menus.
    if (e.button !== 0) return
    e.preventDefault()

    // clientY tracks a vertical (row) handle; clientX a horizontal (column) one.
    const readCoord = (source: { clientX: number; clientY: number }): number =>
      (axis === 'vertical' ? source.clientY : source.clientX)

    dragStartCoordRef.current = readCoord(e)
    dragStartRatioRef.current = ratioRef.current
    // Suppress layout re-measurement for the duration of the gesture (see splitterDragActive).
    splitterDragActive = true
    dragMovedRef.current = false
    // Seed the final-value ref so a click without movement commits the current ratio unchanged.
    dragFinalRatioRef.current = ratioRef.current

    const el = containerRef.current
    // Zoom cannot change mid-gesture (no resize during a drag), so snapshot it once.
    const zoom = getCurrentSideBySideZoom(forceSideBySide)
    // An explicit extent wins; otherwise measure the container along the drag axis.
    const overrideExtent = usableExtentRef.current
    const rect = el ? el.getBoundingClientRect() : null
    const measuredExtent = rect ? (axis === 'vertical' ? rect.height : rect.width) / zoom : 0
    const baseExtent = overrideExtent != null && overrideExtent > 0 ? overrideExtent : measuredExtent
    const usableAtStart = Math.max(0, baseExtent - gapPx)

    /** Split the usable extent at `r` — shared with the callers that render a committed ratio. */
    const ratioToPx = (r: number): { leadingPx: number; trailingPx: number } =>
      splitExtentByRatio({ ratio: r, extentPx: baseExtent, gapPx, minLeadingPx, minTrailingPx })

    /**
     * Seed both variables from the start ratio. A panel sized as var(--x, fallback) resolves to the
     * fallback while the variable is unset, so without this the first gesture after mount (or after
     * a reset that cleared the variables) would not move until mouseup pushed a value through React.
     *
     * Deferred to the first actual movement rather than run on mousedown: writing it here would
     * make a plain click — including each half of a double-click — pin the panels to the seeded px
     * and defeat the dblclick reset.
     */
    const seedVars = () => {
      const container = containerRef.current
      if (!container || usableAtStart <= 0) return
      const seed = ratioToPx(dragStartRatioRef.current)
      container.style.setProperty(leadingVar, `${seed.leadingPx}px`)
      container.style.setProperty(trailingVar, `${seed.trailingPx}px`)
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragStartCoordRef.current === null || usableAtStart <= 0) return
      const container = containerRef.current
      if (!container) return

      // Pointer coords are visual (zoomed) px when zoom is active; divide for a CSS-px delta.
      const rawDelta = readCoord(moveEvent) - dragStartCoordRef.current
      const delta = forceSideBySide ? rawDelta / zoom : rawDelta

      // Ignore a mousemove that has not actually left the press point (browsers emit these for a
      // stationary click), so a click still commits nothing.
      if (!dragMovedRef.current) {
        if (rawDelta === 0) return
        // First real movement: this is a drag. Seed the variables so this very frame already moves.
        dragMovedRef.current = true
        seedVars()
      }

      // Convert the delta to a ratio change, then clamp so neither panel drops below its floor.
      const rawRatio = dragStartRatioRef.current + delta / usableAtStart
      const minRatio = minLeadingPx / usableAtStart
      const maxRatio = 1 - minTrailingPx / usableAtStart
      // A container too small to honour both floors would invert the bounds; pin to the leading
      // floor in that case rather than letting Math.min/max produce a nonsense ratio.
      const clampedRatio = minRatio >= maxRatio ? minRatio : Math.max(minRatio, Math.min(maxRatio, rawRatio))
      dragFinalRatioRef.current = clampedRatio

      // Write straight to the DOM — no React state, no re-renders, for the whole gesture.
      const { leadingPx, trailingPx } = ratioToPx(clampedRatio)
      container.style.setProperty(leadingVar, `${leadingPx}px`)
      container.style.setProperty(trailingVar, `${trailingPx}px`)
      // Same px the CSS var received, so callers need no additional math.
      onResizeLiveRef.current?.(trailingPx)
    }

    /**
     * Detach the gesture's listeners and clear the suppression flag. Idempotent, because it runs
     * from both mouseup and the window-blur safety net below and either may fire first.
     */
    const endGesture = () => {
      dragStartCoordRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
      // Re-enable measurement BEFORE committing, so the observers that fire in response to the
      // commit see the final sizes and refresh the layout budget from them.
      splitterDragActive = false
    }

    const handleMouseUp = () => {
      endGesture()
      // A click that never moved chose nothing — leave the current split (and, crucially, any
      // pending double-click reset) untouched.
      if (!dragMovedRef.current) return
      // Commit once — one React re-render plus one localStorage write per gesture.
      onResize(dragFinalRatioRef.current)
    }

    /**
     * Safety net for a gesture that never gets its mouseup: releasing the button outside the
     * browser window (alt-tab, dragging onto another app) delivers no mouseup to the document.
     * Without this the module-level splitterDragActive would stay true for the rest of the
     * session and silently disable EVERY layout ResizeObserver in useBuilderPreviewLayout.
     * The drag already wrote its px to the CSS variables, so commit what the user last saw.
     */
    function handleWindowBlur() {
      const moved = dragMovedRef.current
      endGesture()
      if (moved) onResize(dragFinalRatioRef.current)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)
  }, [axis, containerRef, forceSideBySide, gapPx, leadingVar, minLeadingPx, minTrailingPx, onResize, trailingVar])

  return { handleMouseDown }
}
