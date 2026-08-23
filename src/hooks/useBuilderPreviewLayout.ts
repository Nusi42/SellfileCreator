import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  APP_EDGE_GAP_PX,
  BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX,
  BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX,
  BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX,
  BUILDER_SAFEGUARD_CHIPS_MIN_HEIGHT_PX,
  GRID_COLUMN_GAP_PX,
  SIDE_BY_SIDE_NATIVE_MEDIA_QUERY,
} from '../lib/constants'
import { getCurrentSideBySideZoom } from '../lib/sideBySideZoom'
import { isSplitterDragActive } from './useSplitterDrag'

const isSyntheticResizeEvent = (event?: Event): boolean => Boolean(event && event.type === 'resize' && event.isTrusted === false)

/**
 * Observe `el`'s offsetHeight and push it through `report` on every (non-drag) resize.
 *
 * SSOT for the two height probes below — the column wrapper and the builder form paper — which
 * otherwise differ only in whether they also follow window resizes. Returns the observer teardown.
 *
 * Mid-gesture notifications are skipped for both: a splitter drag resizes these elements on every
 * mousemove, and the mouseup commit re-measures from the final sizes anyway.
 */
function observeOffsetHeight(el: HTMLElement, report: (height: number) => void): { measure: () => void; disconnect: () => void } {
  const measure = () => {
    // offsetHeight can throw on a detached/zero-layout node in some engines; a failed probe just
    // leaves the previous height standing rather than tearing the layout down.
    try {
      report(el.offsetHeight)
    } catch {}
  }
  measure()
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!isSplitterDragActive()) measure() })
    ro.observe(el)
  }
  return { measure, disconnect: () => { if (ro) ro.disconnect() } }
}

/**
 * useBuilderPreviewLayout
 *
 * Centralizes Builder/Preview responsive layout measurements:
 * - Tracks the builder Paper height so the preview column can mirror it.
 * - Measures the recipe chips container while side-by-side to cap its height safely.
 * - Keeps the side-by-side breakpoint logic and resize observers in one place so App.tsx
 *   simply forwards refs and derived style values.
 */
export type BuilderPreviewLayout = {
  leftPaperRef: React.MutableRefObject<HTMLDivElement | null>
  chipsContainerRef: React.MutableRefObject<HTMLDivElement | null>
  chipsMaxHeight: number
  // Zoom-corrected available height for the chips container, with no minimum floor.
  // null = not in side-by-side mode (use legacy minHeight=maxHeight stability trick).
  // 0 = in side-by-side mode but no space available.
  // >0 = space available; RecipeChipsPanel can use flex-fill and ignore the legacy trick.
  chipsAvailableHeight: number | null
  safeguardChipsContainerRef: React.MutableRefObject<HTMLDivElement | null>
  safeguardChipsMaxHeight: number
  // Expose the resolved side-by-side state so other UI (e.g., empty states) can stay consistent
  // without re-deriving the breakpoint + force logic in multiple components.
  isSideBySide: boolean
  previewPaperHeightPx: number | null
  previewPaperHeightStyle: string | undefined
  sideBySideMinPaperHeightPx: string | undefined
  // Ref for the builder column's TOP paper (the rule form). Measured so the builder splitter can
  // start a drag from the form's natural height instead of jumping to an arbitrary ratio.
  builderFormPaperRef: React.MutableRefObject<HTMLDivElement | null>
  // Height budget (CSS px) the builder column's two papers share, or null outside side-by-side.
  // This is the same value sideBySideMinPaperHeightPx expresses as a CSS length.
  builderSplitUsableHeightPx: number | null
  // Where the split naturally falls today: form height / the extent the drag divides (the budget
  // minus the handle). Used as the drag start value while the user has not dragged in this mode.
  builderSplitNaturalRatio: number
  // Trigger a re-measurement of the builder Paper min-height from current DOM state.
  // Call this whenever the builder content changes in a way that the chips ResizeObserver
  // may not detect (e.g. switching builderMode hides the recipe chips container).
  scheduleMeasurement: () => void
}

export type UseBuilderPreviewLayoutOptions = {
  forceSideBySide?: boolean
}

export function useBuilderPreviewLayout({ forceSideBySide = false }: UseBuilderPreviewLayoutOptions = {}): BuilderPreviewLayout {
  // Shared native-side-by-side query (width AND height — see SIDE_BY_SIDE_NATIVE_MEDIA_QUERY) so the
  // JS matchMedia decision agrees with the CSS flash-guards and the zoom hook's raw≥1 handoff.
  const sideBySideMediaQuery = SIDE_BY_SIDE_NATIVE_MEDIA_QUERY
  const leftPaperRef = useRef<HTMLDivElement | null>(null)
  const [leftHeight, setLeftHeight] = useState<number>(0)
  // When forceSideBySide, seed an immediate upper-bound estimate (viewport/zoom minus bottom inset)
  // so the Paper's maxHeight constraint is live from the very first render — preventing any
  // scrollbar flash before the accurate rAF measurement fires and refines the value.
  const [sideBySideMinPaperHeight, setSideBySideMinPaperHeight] = useState<number>(() => {
    if (!forceSideBySide || typeof window === 'undefined') return 0
    // Reserve the app edge gap on BOTH vertical edges: #root owns the scroll and carries a top+bottom
    // gap (APP_EDGE_GAP_PX each), so the papers must fit within #root's content box — not the raw
    // viewport — or they overflow it by the gap and spawn the (unwanted) app scrollbar.
    const vh = (window.innerHeight ?? 0) - APP_EDGE_GAP_PX * 2
    // Seed with the live/derived zoom so the maxHeight constraint is correct from the first render.
    const zoom = getCurrentSideBySideZoom(forceSideBySide)
    return Math.max(0, Math.floor(vh / zoom - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX))
  })
  const sideBySideMinPaperHeightRef = useRef(sideBySideMinPaperHeight)
  const updateSideBySideMinPaperHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setSideBySideMinPaperHeight((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      sideBySideMinPaperHeightRef.current = next
      return next
    })
  }, [setSideBySideMinPaperHeight])

  // Ref-based setter so the ResizeObserver/resize callbacks avoid the set-state-in-effect lint rule.
  const setLeftHeightRef = useRef(setLeftHeight)
  useEffect(() => { setLeftHeightRef.current = setLeftHeight }, [setLeftHeight])

  useEffect(() => {
    const el = leftPaperRef.current
    if (!el) return
    const { measure, disconnect } = observeOffsetHeight(el, (h) => setLeftHeightRef.current(h))
    // The column also tracks the window: a viewport change alters its budget without necessarily
    // resizing the element itself first.
    const onWin: EventListener = (event) => {
      if (isSyntheticResizeEvent(event)) return
      measure()
    }
    window.addEventListener('resize', onWin)
    return () => {
      disconnect()
      window.removeEventListener('resize', onWin)
    }
  }, [])

  // ── Builder form paper (the column's TOP paper) ──
  // Measured only to derive the natural split ratio; the column's own height (leftHeight above)
  // remains the value the preview column mirrors.
  const builderFormPaperRef = useRef<HTMLDivElement | null>(null)
  const [builderFormHeight, setBuilderFormHeight] = useState<number>(0)
  const setBuilderFormHeightRef = useRef(setBuilderFormHeight)
  useEffect(() => { setBuilderFormHeightRef.current = setBuilderFormHeight }, [setBuilderFormHeight])

  useEffect(() => {
    const el = builderFormPaperRef.current
    if (!el) return
    // No window listener here: the form paper's height only matters relative to the column budget,
    // and the column probe above already re-measures on viewport changes.
    const { disconnect } = observeOffsetHeight(el, (h) => setBuilderFormHeightRef.current(h))
    return disconnect
  }, [])

  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const forceSideBySideRef = useRef(forceSideBySide)
  const [isSideBySide, setIsSideBySide] = useState<boolean>(() => {
    if (forceSideBySide) return true
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(sideBySideMediaQuery).matches
  })
  const isSideBySideRef = useRef(isSideBySide)
  // Sync refs in an effect so callbacks always read the latest values
  // without triggering a ref access during render.
  useEffect(() => {
    forceSideBySideRef.current = forceSideBySide
    isSideBySideRef.current = isSideBySide
  }, [forceSideBySide, isSideBySide])

  const [chipsMaxHeight, setChipsMaxHeight] = useState<number>(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const chipsMaxHeightRef = useRef(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const updateChipsMaxHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setChipsMaxHeight((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      chipsMaxHeightRef.current = next
      return next
    })
  }, [setChipsMaxHeight])

  // Zoom-corrected available height for the chips container (no minimum floor).
  // null = not in side-by-side mode; RecipeChipsPanel falls back to the legacy minHeight=maxHeight
  // stability trick. Non-null (including 0) = we are in side-by-side mode; RecipeChipsPanel lets
  // flex fill the available space and relies on the Paper's maxHeight as the true constraint.
  const [chipsAvailableHeight, setChipsAvailableHeight] = useState<number | null>(null)
  const chipsAvailableHeightRef = useRef<number | null>(null)
  const updateChipsAvailableHeight = useCallback<React.Dispatch<React.SetStateAction<number | null>>>((value) => {
    setChipsAvailableHeight((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number | null) => number | null)(prev) : value
      chipsAvailableHeightRef.current = next
      return next
    })
  }, [setChipsAvailableHeight])

  const chipsMeasureQueuedRef = useRef(false)
  const chipsMeasureFrameRef = useRef<number | null>(null)

  const cancelScheduledChipsMeasure = useCallback(() => {
    if (typeof window === 'undefined') return
    if (chipsMeasureFrameRef.current !== null) {
      window.cancelAnimationFrame(chipsMeasureFrameRef.current)
      chipsMeasureFrameRef.current = null
    }
    chipsMeasureQueuedRef.current = false
  }, [])

  const runChipsMeasurement = useCallback(() => {
    if (!isSideBySideRef.current) {
      if (chipsMaxHeightRef.current !== BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX) {
        updateChipsMaxHeight(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
      }
      // null signals "not in side-by-side mode"; RecipeChipsPanel uses the legacy minHeight trick.
      if (chipsAvailableHeightRef.current !== null) updateChipsAvailableHeight(null)
      return
    }
    const paper = leftPaperRef.current
    if (!paper || typeof window === 'undefined') return
    try {
      // Subtract the bottom app edge gap: #root's content box ends APP_EDGE_GAP_PX above the true
      // viewport bottom (the top gap is already reflected in paperRect.top below). Filling to the raw
      // viewport bottom would overshoot #root's scroll box by the gap and spawn the app scrollbar.
      const viewportHeight = (window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0) - APP_EDGE_GAP_PX
      const paperRect = paper.getBoundingClientRect()
      // In forceSideBySide mode, CSS zoom is applied to #root. getBoundingClientRect() returns
      // visual (zoomed) coordinates while window.innerHeight / visualViewport.height are CSS pixels.
      // Dividing by zoom converts rect positions back to CSS pixel space so minPaperHeight and
      // all downstream heights remain consistent with MUI sx values.
      const zoom = getCurrentSideBySideZoom(forceSideBySideRef.current)
      const paperAvailable = (viewportHeight - paperRect.top) / zoom - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX
      const minPaperHeight = Math.max(0, Math.floor(paperAvailable))
      // Always update M from the paper's own position — this must run regardless of whether the
      // recipe chips container is visible, so safeguard mode on reload also gets a correct M.
      if (sideBySideMinPaperHeightRef.current !== minPaperHeight) {
        updateSideBySideMinPaperHeight(minPaperHeight)
      }
      // Below here: chips-specific calculation that needs the container to be visible.
      // A hidden container (display:none in safeguard mode) still contributes the non-null signal
      // so RecipeChipsPanel knows we're in side-by-side mode and should not use the legacy trick.
      const container = chipsContainerRef.current
      if (!container) {
        if (chipsAvailableHeightRef.current === null) updateChipsAvailableHeight(0)
        return
      }
      const containerRect = container.getBoundingClientRect()
      if (containerRect.width === 0 && containerRect.height === 0) {
        // Container is hidden (safeguard mode) — M is already updated above.
        // Set a non-null zero to suppress the legacy minHeight trick in RecipeChipsPanel.
        if (chipsAvailableHeightRef.current === null) updateChipsAvailableHeight(0)
        return
      }
      if (!Number.isFinite(paperAvailable) || paperAvailable <= 0) return
      // Same zoom correction for the container offset — both rects are in visual px.
      const offsetWithinPaper = (containerRect.top - paperRect.top) / zoom
      const rawAvailable = Math.floor(paperAvailable - offsetWithinPaper)
      const safeAvailable = rawAvailable - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX
      // Signal to RecipeChipsPanel that we are in side-by-side mode (non-null value).
      // The value itself (≥0) is the zoom-corrected space available for the chips container.
      // A non-null value tells the panel to rely on the Paper's maxHeight as the true constraint.
      const availFloor = Math.max(0, safeAvailable)
      const prevAvail = chipsAvailableHeightRef.current
      // null → any transition always fires; number → skip tiny sub-4px jitter.
      if (prevAvail === null || Math.abs(prevAvail - availFloor) >= 4) {
        updateChipsAvailableHeight(availFloor)
      }
      if (!Number.isFinite(safeAvailable) || safeAvailable <= 0) return
      const next = Math.max(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX, safeAvailable)
      if (Math.abs(chipsMaxHeightRef.current - next) >= 4) {
        updateChipsMaxHeight(next)
      }
    } catch {}
  }, [updateChipsAvailableHeight, updateChipsMaxHeight, updateSideBySideMinPaperHeight])

  const scheduleChipsMeasurement = useCallback(() => {
    if (!isSideBySideRef.current || typeof window === 'undefined') return
    if (chipsMeasureQueuedRef.current) return
    chipsMeasureQueuedRef.current = true
    chipsMeasureFrameRef.current = window.requestAnimationFrame(() => {
      chipsMeasureFrameRef.current = null
      chipsMeasureQueuedRef.current = false
      runChipsMeasurement()
    })
  }, [runChipsMeasurement])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    let frame: number | null = null
    let observer: ResizeObserver | null = null
    const attach = () => {
      const container = chipsContainerRef.current
      if (!container) {
        frame = window.requestAnimationFrame(attach)
        return
      }
      observer = new ResizeObserver(() => {
        if (!isSideBySideRef.current) return
        // A splitter drag resizes the chips container continuously; the commit re-measures.
        if (isSplitterDragActive()) return
        scheduleChipsMeasurement()
      })
      observer.observe(container)
    }
    attach()
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      if (observer) observer.disconnect()
    }
  }, [scheduleChipsMeasurement])

  // Re-measure chips when leftHeight changes.
  // Why useEffect: scheduleChipsMeasurement accesses refs (DOM containers) which cannot be read during render.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state -- effect required: accesses DOM refs */
  useEffect(() => {
    // Skip the initial zero value and non-side-by-side mode.
    if (!isSideBySideRef.current || leftHeight === 0) return
    scheduleChipsMeasurement()
  }, [leftHeight, scheduleChipsMeasurement])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state */

  const applySideBySideTransition = useCallback(
    (matches: boolean, { forceSchedule = false }: { forceSchedule?: boolean } = {}) => {
      const desired = forceSideBySideRef.current || matches
      const prev = isSideBySideRef.current
      if (!forceSchedule && prev === desired) return
      isSideBySideRef.current = desired
      if (prev !== desired) {
        setIsSideBySide(desired)
      }
      if (!desired) {
        cancelScheduledChipsMeasure()
        updateSideBySideMinPaperHeight((prevHeight) => (prevHeight === 0 ? prevHeight : 0))
        updateChipsMaxHeight((prevHeight) =>
          prevHeight === BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX ? prevHeight : BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX,
        )
        // null = "not in side-by-side mode"; RecipeChipsPanel reverts to legacy behaviour.
        updateChipsAvailableHeight((prev) => (prev === null ? prev : null))
        return
      }
      scheduleChipsMeasurement()
    },
    [cancelScheduledChipsMeasure, scheduleChipsMeasurement, updateChipsAvailableHeight, updateChipsMaxHeight, updateSideBySideMinPaperHeight],
  )
  // Ref alias so media-query event handlers avoid the set-state-in-effect lint rule.
  // Synced via effect to avoid writing a ref during render.
  const applySideBySideTransitionRef = useRef(applySideBySideTransition)
  useEffect(() => {
    applySideBySideTransitionRef.current = applySideBySideTransition
  }, [applySideBySideTransition])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(sideBySideMediaQuery)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => applySideBySideTransitionRef.current(event.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange)
    }
    applySideBySideTransitionRef.current(media.matches, { forceSchedule: true })
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleChange)
      } else if (typeof media.removeListener === 'function') {
        media.removeListener(handleChange)
      }
    }
  }, [sideBySideMediaQuery])

  useEffect(() => {
    if (forceSideBySideRef.current) {
      applySideBySideTransitionRef.current(true, { forceSchedule: true })
      return
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      applySideBySideTransitionRef.current(false, { forceSchedule: true })
      return
    }
    const matches = window.matchMedia(sideBySideMediaQuery).matches
    applySideBySideTransitionRef.current(matches, { forceSchedule: true })
  }, [forceSideBySide, sideBySideMediaQuery])

  useEffect(() => {
    if (!isSideBySide || typeof window === 'undefined') return
    const handleResize: EventListener = (event) => {
      if (isSyntheticResizeEvent(event)) return
      scheduleChipsMeasurement()
    }
    window.addEventListener('resize', handleResize)
    const viewport = window.visualViewport
    if (viewport && typeof viewport.addEventListener === 'function') {
      viewport.addEventListener('resize', handleResize)
    }
    scheduleChipsMeasurement()
    return () => {
      window.removeEventListener('resize', handleResize)
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', handleResize)
      }
    }
  }, [isSideBySide, scheduleChipsMeasurement])

  // ── Safeguard chips measurement (always runs, independent of side-by-side) ──
  // Unlike recipe chips, safeguard chips always need a height cap because the
  // builder form above them has fixed height and the panel is always in
  // "side-by-side within the builder column" layout.
  const safeguardChipsContainerRef = useRef<HTMLDivElement | null>(null)
  // Start at the recipe default so the panel renders a reasonable height before
  // the first measurement fires; the ResizeObserver will correct it immediately.
  const [safeguardChipsMaxHeight, setSafeguardChipsMaxHeight] = useState<number>(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const safeguardChipsMaxHeightRef = useRef(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  // Wrap the state setter to keep the ref in sync for reads inside callbacks.
  const updateSafeguardChipsMaxHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setSafeguardChipsMaxHeight((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      safeguardChipsMaxHeightRef.current = next
      return next
    })
  }, [setSafeguardChipsMaxHeight])

  const runSafeguardChipsMeasurement = useCallback(() => {
    const container = safeguardChipsContainerRef.current
    const paper = leftPaperRef.current
    if (!container || !paper || typeof window === 'undefined') return
    try {
      // Prefer visualViewport so the measurement stays correct on mobile/zoom.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0
      const paperRect = paper.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // When the container is hidden (display: none gives an all-zero rect), skip — the
      // measurement would be meaningless and produce a garbage maxHeight value.
      if (containerRect.width === 0 && containerRect.height === 0) return
      // Apply the same zoom correction used in runChipsMeasurement for coordinate consistency.
      // In forceSideBySide mode, getBoundingClientRect() returns visual (zoomed) coordinates
      // while viewportHeight is in CSS pixels; dividing by zoom aligns the coordinate spaces.
      const zoom = getCurrentSideBySideZoom(forceSideBySideRef.current)
      // How much CSS-pixel height is available below the paper's top edge.
      const paperAvailable = (viewportHeight - paperRect.top) / zoom - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX
      if (!Number.isFinite(paperAvailable) || paperAvailable <= 0) return
      // Subtract the container's vertical offset within the paper to get usable chip height.
      const offsetWithinPaper = (containerRect.top - paperRect.top) / zoom
      const rawAvailable = Math.floor(paperAvailable - offsetWithinPaper)
      // Leave a safe gap at the bottom so the list never bumps the viewport edge.
      const safeAvailable = rawAvailable - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX
      if (!Number.isFinite(safeAvailable) || safeAvailable <= 0) return
      // Floor at the named minimum so the chip list stays usable even in tight viewports.
      const next = Math.max(BUILDER_SAFEGUARD_CHIPS_MIN_HEIGHT_PX, safeAvailable)
      // Skip tiny sub-4px changes to avoid jitter from sub-pixel rounding.
      if (Math.abs(safeguardChipsMaxHeightRef.current - next) >= 4) {
        updateSafeguardChipsMaxHeight(next)
      }
    } catch {}
  }, [updateSafeguardChipsMaxHeight])

  // Attach a ResizeObserver to the chips container. Poll with rAF until the
  // container mounts (it may render after this effect runs).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    let frame: number | null = null
    let observer: ResizeObserver | null = null
    const attach = () => {
      const container = safeguardChipsContainerRef.current
      if (!container) {
        // Retry next frame — container hasn't mounted yet.
        frame = window.requestAnimationFrame(attach)
        return
      }
      observer = new ResizeObserver(() => { if (!isSplitterDragActive()) runSafeguardChipsMeasurement() })
      observer.observe(container)
    }
    attach()
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      if (observer) observer.disconnect()
    }
  }, [runSafeguardChipsMeasurement])

  // Re-measure safeguard chips whenever the builder paper height changes.
  // Why useEffect: runSafeguardChipsMeasurement accesses refs and reads getBoundingClientRect.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state, react-you-might-not-need-an-effect/no-chain-state-updates -- effect required: accesses DOM refs and getBoundingClientRect */
  useEffect(() => {
    if (leftHeight === 0) return
    runSafeguardChipsMeasurement()
  }, [leftHeight, runSafeguardChipsMeasurement])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state, react-you-might-not-need-an-effect/no-chain-state-updates */

  // Re-measure on window/visualViewport resize so the cap stays correct after
  // keyboard-open, zoom changes, or browser chrome adjustments.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize: EventListener = (event) => {
      // Ignore synthetic resize events fired by our own measurement code.
      if (isSyntheticResizeEvent(event)) return
      runSafeguardChipsMeasurement()
    }
    window.addEventListener('resize', handleResize)
    const viewport = window.visualViewport
    if (viewport && typeof viewport.addEventListener === 'function') {
      viewport.addEventListener('resize', handleResize)
    }
    return () => {
      window.removeEventListener('resize', handleResize)
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', handleResize)
      }
    }
  }, [runSafeguardChipsMeasurement])

  const previewPaperHeightPx = useMemo(() => {
    const base = leftHeight
    const floor = sideBySideMinPaperHeight
    const next = Math.max(base, floor)
    return next > 0 ? Math.round(next) : null
  }, [leftHeight, sideBySideMinPaperHeight])

  const sideBySideMinPaperHeightPx = useMemo(
    () => (sideBySideMinPaperHeight > 0 ? `${sideBySideMinPaperHeight}px` : undefined),
    [sideBySideMinPaperHeight],
  )

  // The builder column's two papers divide exactly the budget the column is locked to. Outside
  // side-by-side there is no fixed budget (both papers grow with content), hence null.
  const builderSplitUsableHeightPx = useMemo(
    () => (isSideBySide && sideBySideMinPaperHeight > 0 ? sideBySideMinPaperHeight : null),
    [isSideBySide, sideBySideMinPaperHeight],
  )

  // Where the split sits before any drag: the form's share of the budget. Falls back to an even
  // split only when neither height has been measured yet, so a drag started in that window still
  // has a sane reference.
  //
  // The denominator is the budget MINUS the handle's own height, because that is the extent the
  // drag divides (see splitExtentByRatio). Dividing by the full budget instead would understate
  // the ratio, so grabbing the handle for the first time would jump the form upward by roughly
  // GRID_COLUMN_GAP_PX * ratio instead of continuing from where the papers actually sit.
  const builderSplitNaturalRatio = useMemo(() => {
    if (!builderSplitUsableHeightPx || builderFormHeight <= 0) return 0.5
    const divisible = builderSplitUsableHeightPx - GRID_COLUMN_GAP_PX
    if (divisible <= 0) return 0.5
    const raw = builderFormHeight / divisible
    return Math.max(0, Math.min(1, raw))
  }, [builderFormHeight, builderSplitUsableHeightPx])
  const previewPaperHeightStyle = useMemo(() => (previewPaperHeightPx ? `${previewPaperHeightPx}px` : undefined), [previewPaperHeightPx])

  return {
    leftPaperRef,
    chipsContainerRef,
    chipsMaxHeight,
    chipsAvailableHeight,
    safeguardChipsContainerRef,
    safeguardChipsMaxHeight,
    isSideBySide,
    previewPaperHeightPx,
    previewPaperHeightStyle,
    sideBySideMinPaperHeightPx,
    builderFormPaperRef,
    builderSplitUsableHeightPx,
    builderSplitNaturalRatio,
    // Delegates to the chips measurement path so callers (e.g. App.tsx on builderMode
    // change) can force a recalculation without coupling to internal implementation.
    scheduleMeasurement: scheduleChipsMeasurement,
  }
}
