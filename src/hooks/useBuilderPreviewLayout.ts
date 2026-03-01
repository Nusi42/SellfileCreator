import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AUTO_SIDE_BY_SIDE_FORCED_ZOOM,
  BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX,
  BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX,
  BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX,
  BUILDER_SAFEGUARD_CHIPS_MIN_HEIGHT_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
} from '../lib/constants'

const isSyntheticResizeEvent = (event?: Event): boolean => Boolean(event && event.type === 'resize' && event.isTrusted === false)

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
  // Trigger a re-measurement of the builder Paper min-height from current DOM state.
  // Call this whenever the builder content changes in a way that the chips ResizeObserver
  // may not detect (e.g. switching builderMode hides the recipe chips container).
  scheduleMeasurement: () => void
}

export type UseBuilderPreviewLayoutOptions = {
  forceSideBySide?: boolean
}

export function useBuilderPreviewLayout({ forceSideBySide = false }: UseBuilderPreviewLayoutOptions = {}): BuilderPreviewLayout {
  const leftPaperRef = useRef<HTMLDivElement | null>(null)
  const [leftHeight, setLeftHeight] = useState<number>(0)
  // When forceSideBySide, seed an immediate upper-bound estimate (viewport/zoom minus bottom inset)
  // so the Paper's maxHeight constraint is live from the very first render — preventing any
  // scrollbar flash before the accurate rAF measurement fires and refines the value.
  const [sideBySideMinPaperHeight, setSideBySideMinPaperHeightState] = useState<number>(() => {
    if (!forceSideBySide || typeof window === 'undefined') return 0
    const vh = window.innerHeight ?? 0
    return Math.max(0, Math.floor(vh / AUTO_SIDE_BY_SIDE_FORCED_ZOOM - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX))
  })
  const sideBySideMinPaperHeightRef = useRef(sideBySideMinPaperHeight)
  const setSideBySideMinPaperHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setSideBySideMinPaperHeightState((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      sideBySideMinPaperHeightRef.current = next
      return next
    })
  }, [setSideBySideMinPaperHeightState])

  useEffect(() => {
    const el = leftPaperRef.current
    if (!el) return
    const measure = () => {
      try {
        setLeftHeight(el.offsetHeight)
      } catch {}
    }
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    const onWin: EventListener = (event) => {
      if (isSyntheticResizeEvent(event)) return
      measure()
    }
    window.addEventListener('resize', onWin)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', onWin)
    }
  }, [])

  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const forceSideBySideRef = useRef(forceSideBySide)
  forceSideBySideRef.current = forceSideBySide
  const [isSideBySide, setIsSideBySide] = useState<boolean>(() => {
    if (forceSideBySide) return true
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`).matches
  })
  const isSideBySideRef = useRef(isSideBySide)
  isSideBySideRef.current = isSideBySide

  const [chipsMaxHeight, setChipsMaxHeightState] = useState<number>(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const chipsMaxHeightRef = useRef(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const setChipsMaxHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setChipsMaxHeightState((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      chipsMaxHeightRef.current = next
      return next
    })
  }, [setChipsMaxHeightState])

  // Zoom-corrected available height for the chips container (no minimum floor).
  // null = not in side-by-side mode; RecipeChipsPanel falls back to the legacy minHeight=maxHeight
  // stability trick. Non-null (including 0) = we are in side-by-side mode; RecipeChipsPanel lets
  // flex fill the available space and relies on the Paper's maxHeight as the true constraint.
  const [chipsAvailableHeight, setChipsAvailableHeightState] = useState<number | null>(null)
  const chipsAvailableHeightRef = useRef<number | null>(null)
  const setChipsAvailableHeight = useCallback<React.Dispatch<React.SetStateAction<number | null>>>((value) => {
    setChipsAvailableHeightState((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number | null) => number | null)(prev) : value
      chipsAvailableHeightRef.current = next
      return next
    })
  }, [setChipsAvailableHeightState])

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
        setChipsMaxHeight(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
      }
      // null signals "not in side-by-side mode"; RecipeChipsPanel uses the legacy minHeight trick.
      if (chipsAvailableHeightRef.current !== null) setChipsAvailableHeight(null)
      return
    }
    const paper = leftPaperRef.current
    if (!paper || typeof window === 'undefined') return
    try {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0
      const paperRect = paper.getBoundingClientRect()
      // In forceSideBySide mode, CSS zoom is applied to #root. getBoundingClientRect() returns
      // visual (zoomed) coordinates while window.innerHeight / visualViewport.height are CSS pixels.
      // Dividing by zoom converts rect positions back to CSS pixel space so minPaperHeight and
      // all downstream heights remain consistent with MUI sx values.
      const zoom = forceSideBySideRef.current ? AUTO_SIDE_BY_SIDE_FORCED_ZOOM : 1
      const paperAvailable = (viewportHeight - paperRect.top) / zoom - BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX
      const minPaperHeight = Math.max(0, Math.floor(paperAvailable))
      // Always update M from the paper's own position — this must run regardless of whether the
      // recipe chips container is visible, so safeguard mode on reload also gets a correct M.
      if (sideBySideMinPaperHeightRef.current !== minPaperHeight) {
        setSideBySideMinPaperHeight(minPaperHeight)
      }
      // Below here: chips-specific calculation that needs the container to be visible.
      // A hidden container (display:none in safeguard mode) still contributes the non-null signal
      // so RecipeChipsPanel knows we're in side-by-side mode and should not use the legacy trick.
      const container = chipsContainerRef.current
      if (!container) {
        if (chipsAvailableHeightRef.current === null) setChipsAvailableHeight(0)
        return
      }
      const containerRect = container.getBoundingClientRect()
      if (containerRect.width === 0 && containerRect.height === 0) {
        // Container is hidden (safeguard mode) — M is already updated above.
        // Set a non-null zero to suppress the legacy minHeight trick in RecipeChipsPanel.
        if (chipsAvailableHeightRef.current === null) setChipsAvailableHeight(0)
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
        setChipsAvailableHeight(availFloor)
      }
      if (!Number.isFinite(safeAvailable) || safeAvailable <= 0) return
      const next = Math.max(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX, safeAvailable)
      if (Math.abs(chipsMaxHeightRef.current - next) >= 4) {
        setChipsMaxHeight(next)
      }
    } catch {}
  }, [setChipsAvailableHeight, setChipsMaxHeight, setSideBySideMinPaperHeight])

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

  useEffect(() => {
    if (!isSideBySideRef.current || leftHeight === 0) return
    scheduleChipsMeasurement()
  }, [leftHeight, scheduleChipsMeasurement])

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
        setSideBySideMinPaperHeight((prevHeight) => (prevHeight === 0 ? prevHeight : 0))
        setChipsMaxHeight((prevHeight) =>
          prevHeight === BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX ? prevHeight : BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX,
        )
        // null = "not in side-by-side mode"; RecipeChipsPanel reverts to legacy behaviour.
        setChipsAvailableHeight((prev) => (prev === null ? prev : null))
        return
      }
      scheduleChipsMeasurement()
    },
    [cancelScheduledChipsMeasure, scheduleChipsMeasurement, setChipsAvailableHeight, setChipsMaxHeight, setSideBySideMinPaperHeight],
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => applySideBySideTransition(event.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange)
    }
    applySideBySideTransition(media.matches, { forceSchedule: true })
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleChange)
      } else if (typeof media.removeListener === 'function') {
        media.removeListener(handleChange)
      }
    }
  }, [applySideBySideTransition])

  useEffect(() => {
    if (forceSideBySideRef.current) {
      applySideBySideTransition(true, { forceSchedule: true })
      return
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      applySideBySideTransition(false, { forceSchedule: true })
      return
    }
    const matches = window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`).matches
    applySideBySideTransition(matches, { forceSchedule: true })
  }, [applySideBySideTransition, forceSideBySide])

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
  const [safeguardChipsMaxHeight, setSafeguardChipsMaxHeightState] = useState<number>(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const safeguardChipsMaxHeightRef = useRef(BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  // Wrap the state setter to keep the ref in sync for reads inside callbacks.
  const setSafeguardChipsMaxHeight = useCallback<React.Dispatch<React.SetStateAction<number>>>((value) => {
    setSafeguardChipsMaxHeightState((prev) => {
      const next = typeof value === 'function' ? (value as (previous: number) => number)(prev) : value
      safeguardChipsMaxHeightRef.current = next
      return next
    })
  }, [setSafeguardChipsMaxHeightState])

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
      const zoom = forceSideBySideRef.current ? AUTO_SIDE_BY_SIDE_FORCED_ZOOM : 1
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
        setSafeguardChipsMaxHeight(next)
      }
    } catch {}
  }, [setSafeguardChipsMaxHeight])

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
      observer = new ResizeObserver(() => { runSafeguardChipsMeasurement() })
      observer.observe(container)
    }
    attach()
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      if (observer) observer.disconnect()
    }
  }, [runSafeguardChipsMeasurement])

  // Re-measure whenever the builder paper height changes (form rows added/removed).
  // Calling runSafeguardChipsMeasurement in response to a state change is the correct
  // React idiom here — there is no DOM event to attach to, only the measured height value.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (leftHeight === 0) return
    runSafeguardChipsMeasurement()
  }, [leftHeight, runSafeguardChipsMeasurement])

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
    // Delegates to the chips measurement path so callers (e.g. App.tsx on builderMode
    // change) can force a recalculation without coupling to internal implementation.
    scheduleMeasurement: scheduleChipsMeasurement,
  }
}
