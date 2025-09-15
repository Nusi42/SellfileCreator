import { useEffect, useRef, useState } from 'react'
import { SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'

/**
 * useScrollingFlag
 *
 * Returns a transient boolean that is true while the user is actively
 * scrolling via wheel/scroll/touchmove. Debounced back to false after a
 * short idle. Used to temporarily suppress hover tooltips so they don't
 * appear at stale positions if the user scrolls right before they open.
 */
export function useScrollingFlag(): boolean {
  const [scrolling, setScrolling] = useState(false)
  const timerRef = useRef<number | null>(null)
  useEffect(() => {
    const mark = () => {
      setScrolling(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => { setScrolling(false); timerRef.current = null }, SCROLLING_TOOLTIP_HIDE_MS)
    }
    const onWheel = () => mark()
    const onScroll = () => mark()
    const onTouchMove = () => mark()
    window.addEventListener('wheel', onWheel, { passive: true })
    // capture ensures we see scrolls inside nested containers
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll, true as unknown as undefined)
      window.removeEventListener('touchmove', onTouchMove)
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [])
  return scrolling
}

export default useScrollingFlag

