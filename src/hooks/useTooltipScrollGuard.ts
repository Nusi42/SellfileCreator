import { useEffect, useRef } from 'react'
import { SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'

/**
 * useTooltipScrollGuard
 *
 * Applies a transient `scrolling` class to the document body while the user
 * scrolls so MUI tooltips stay hidden and avoid viewport scrollbar flicker.
 * The hook also nudges Popper.js positioning once scrolling stops so tooltip
 * placement remains accurate.
 */
export type TooltipScrollGuardReturn = void

export function useTooltipScrollGuard(): TooltipScrollGuardReturn {
  const hideTipsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const markScrolling = () => {
      try {
        document.body.classList.add('scrolling')
        if (hideTipsTimerRef.current) {
          window.clearTimeout(hideTipsTimerRef.current)
          hideTipsTimerRef.current = null
        }
        hideTipsTimerRef.current = window.setTimeout(() => {
          try { document.body.classList.remove('scrolling') } catch {}
          // Dispatch resize so Popper recalculates tooltip placement after we unhide them.
          try { window.dispatchEvent(new Event('resize')) } catch {}
          hideTipsTimerRef.current = null
        }, SCROLLING_TOOLTIP_HIDE_MS)
      } catch {}
    }

    const onWheel = () => { markScrolling() }
    const onScroll = () => { markScrolling() }
    const onTouchMove = () => { markScrolling() }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('touchmove', onTouchMove)
      if (hideTipsTimerRef.current) {
        window.clearTimeout(hideTipsTimerRef.current)
        hideTipsTimerRef.current = null
      }
      try { document.body.classList.remove('scrolling') } catch {}
    }
  }, [])
}

export default useTooltipScrollGuard
