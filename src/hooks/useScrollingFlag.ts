import { useSyncExternalStore } from 'react'
import { SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'

/**
 * useScrollingFlag
 *
 * Returns a transient boolean that is true while the user is actively
 * scrolling via wheel/scroll/touchmove. Debounced back to false after a
 * short idle. Used to temporarily suppress hover tooltips so they don't
 * appear at stale positions if the user scrolls right before they open.
 *
 * Multiple consumers share a single set of window scroll listeners so the
 * global handlers only register once regardless of how many components need
 * the scrolling flag.
 */
export function useScrollingFlag(): boolean {
  return useSyncExternalStore(subscribeToScrolling, getSnapshot, getServerSnapshot)
}

export default useScrollingFlag

type Listener = () => void

const listeners = new Set<Listener>()
let eventsAttached = false
let scrolling = false
let timer: ReturnType<typeof setTimeout> | null = null

const notify = () => {
  listeners.forEach(listener => {
    try {
      listener()
    } catch {}
  })
}

const setScrolling = (next: boolean) => {
  if (scrolling === next) return
  scrolling = next
  notify()
}

const clearTimer = () => {
  if (timer !== null && typeof window !== 'undefined') {
    window.clearTimeout(timer)
  }
  timer = null
}

const markIdle = () => {
  clearTimer()
  setScrolling(false)
}

const markScrolling = () => {
  setScrolling(true)
  if (typeof window === 'undefined') {
    timer = null
    return
  }
  clearTimer()
  timer = window.setTimeout(() => {
    timer = null
    setScrolling(false)
  }, SCROLLING_TOOLTIP_HIDE_MS)
}

const handleWheel = () => { markScrolling() }
const handleScroll = () => { markScrolling() }
const handleTouchMove = () => { markScrolling() }

const attachListeners = () => {
  if (eventsAttached || typeof window === 'undefined') return
  window.addEventListener('wheel', handleWheel, { passive: true })
  // capture ensures we see scrolls inside nested containers
  window.addEventListener('scroll', handleScroll, { passive: true, capture: true })
  window.addEventListener('touchmove', handleTouchMove, { passive: true })
  eventsAttached = true
}

const detachListeners = () => {
  if (!eventsAttached || typeof window === 'undefined') return
  window.removeEventListener('wheel', handleWheel)
  window.removeEventListener('scroll', handleScroll, true as unknown as undefined)
  window.removeEventListener('touchmove', handleTouchMove)
  eventsAttached = false
  markIdle()
}

const subscribeToScrolling = (listener: Listener) => {
  listeners.add(listener)
  attachListeners()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      detachListeners()
    }
  }
}

const getSnapshot = () => scrolling
const getServerSnapshot = () => false
