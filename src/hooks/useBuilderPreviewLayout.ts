import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX,
  BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX,
  BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
} from '../lib/constants'

/**
 * useBuilderPreviewLayout
 *
 * Centralizes Builder/Preview responsive layout measurements:
 * - Tracks the builder Paper height so the preview column can mirror it.
 * - Measures the config chips container while side-by-side to cap its height safely.
 * - Keeps the side-by-side breakpoint logic and resize observers in one place so App.tsx
 *   simply forwards refs and derived style values.
 */
export type BuilderPreviewLayout = {
  leftPaperRef: React.MutableRefObject<HTMLDivElement | null>
  chipsContainerRef: React.MutableRefObject<HTMLDivElement | null>
  chipsMaxHeight: number
  previewPaperHeightPx: number | null
  previewPaperHeightStyle: string | undefined
  sideBySideMinPaperHeightPx: string | undefined
}

export type UseBuilderPreviewLayoutOptions = {
  forceSideBySide?: boolean
}

export function useBuilderPreviewLayout({ forceSideBySide = false }: UseBuilderPreviewLayoutOptions = {}): BuilderPreviewLayout {
  const leftPaperRef = useRef<HTMLDivElement | null>(null)
  const [leftHeight, setLeftHeight] = useState<number>(0)
  const [sideBySideMinPaperHeight, setSideBySideMinPaperHeight] = useState<number>(0)
  const sideBySideMinPaperHeightRef = useRef(0)
  useEffect(() => {
    sideBySideMinPaperHeightRef.current = sideBySideMinPaperHeight
  }, [sideBySideMinPaperHeight])

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
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', onWin)
    }
  }, [])

  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const forceSideBySideRef = useRef(forceSideBySide)
  useEffect(() => {
    forceSideBySideRef.current = forceSideBySide
  }, [forceSideBySide])
  const [isSideBySide, setIsSideBySide] = useState<boolean>(() => {
    if (forceSideBySide) return true
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`).matches
  })
  const isSideBySideRef = useRef(isSideBySide)
  useEffect(() => {
    isSideBySideRef.current = isSideBySide
  }, [isSideBySide])

  const [chipsMaxHeight, setChipsMaxHeight] = useState<number>(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const chipsMaxHeightRef = useRef(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  useEffect(() => {
    chipsMaxHeightRef.current = chipsMaxHeight
  }, [chipsMaxHeight])

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
      if (chipsMaxHeightRef.current !== BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX) {
        setChipsMaxHeight(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
      }
      return
    }
    const container = chipsContainerRef.current
    const paper = leftPaperRef.current
    if (!container || !paper || typeof window === 'undefined') return
    try {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0
      const paperRect = paper.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const paperAvailable = viewportHeight - paperRect.top - BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX
      const minPaperHeight = Math.max(0, Math.floor(paperAvailable))
      if (sideBySideMinPaperHeightRef.current !== minPaperHeight) {
        sideBySideMinPaperHeightRef.current = minPaperHeight
        setSideBySideMinPaperHeight(minPaperHeight)
      }
      if (!Number.isFinite(paperAvailable) || paperAvailable <= 0) return
      const offsetWithinPaper = containerRect.top - paperRect.top
      const rawAvailable = Math.floor(paperAvailable - offsetWithinPaper)
      const safeAvailable = rawAvailable - BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX
      if (!Number.isFinite(safeAvailable) || safeAvailable <= 0) return
      const next = Math.max(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX, safeAvailable)
      if (Math.abs(chipsMaxHeightRef.current - next) >= 4) {
        setChipsMaxHeight(next)
      }
    } catch {}
  }, [])

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
          prevHeight === BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX ? prevHeight : BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX,
        )
        return
      }
      scheduleChipsMeasurement()
    },
    [cancelScheduledChipsMeasure, scheduleChipsMeasurement],
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
    const handleResize = () => {
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
    previewPaperHeightPx,
    previewPaperHeightStyle,
    sideBySideMinPaperHeightPx,
  }
}
