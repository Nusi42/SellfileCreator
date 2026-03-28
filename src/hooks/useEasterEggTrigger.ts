/**
 * useEasterEggTrigger.ts
 *
 * Shared trigger-detection hook for all Easter egg systems.
 * Extracted from useGearInspectorSortPopoutEasterEgg so the Gear Analytics Easter
 * eggs and the sort-popout Easter egg share the same sliding-window logic.
 */
import { useRef, useCallback } from 'react'

/**
 * Returns a stable `recordClick(id)` function.
 *
 * The function returns `true` — and resets the counter for that id — when the
 * same id is clicked `threshold` times within `windowMs` milliseconds.
 * Each id has its own independent sliding window; switching ids does NOT reset others.
 */
export function useEasterEggTrigger(threshold = 10, windowMs = 10_000) {
  const historyRef = useRef<Map<string | number, number[]>>(new Map())

  return useCallback((id: string | number): boolean => {
    const now = Date.now()
    const h = historyRef.current
    // Keep only timestamps within the sliding window.
    const times = (h.get(id) ?? []).filter((t) => now - t < windowMs)
    times.push(now)
    if (times.length >= threshold) {
      // Clear ALL ids so a fresh streak is needed on any element to trigger again.
      h.clear()
      return true
    }
    h.set(id, times)
    return false
  }, [threshold, windowMs])
}
