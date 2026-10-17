/**
 * nextFrame.ts
 *
 * "Wait for the next paint" that cannot hang.
 *
 * A browser delivers NO animation frames to a document it is not painting: a background
 * tab, and — the case that bit — a `display: none` cross-origin iframe, which is how
 * a host application keeps the embedded creator alive while another of its pages is on screen. A
 * bare `await requestAnimationFrame` there never resolves, so any data work sequenced on
 * it (the endpoint push queue) silently stalled until the user looked at the creator.
 *
 * Waiting for a paint is a courtesy to the UI, never a gate on data: the frame wins when
 * one comes (~16 ms on screen), the timeout wins when none will.
 */

// Long enough that a painting document always gets its frame first; short enough that a
// hidden one only loses a beat per wait. Hidden frames also have their timers coarsened
// by the browser, so the real ceiling there is the browser's, not this number.
const NEXT_FRAME_TIMEOUT_MS = 100

/** Resolves on the next animation frame, or after the timeout when no frame comes. */
export const nextFrame = (): Promise<void> => new Promise<void>((resolve) => {
  // Non-browser (tests, SSR): nothing to paint, so nothing to wait for.
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    resolve()
    return
  }
  // Whichever fires first settles the wait and cancels the other.
  let frameId = 0
  let timerId = 0
  const settle = () => {
    window.cancelAnimationFrame(frameId)
    window.clearTimeout(timerId)
    resolve()
  }
  frameId = window.requestAnimationFrame(settle)
  timerId = window.setTimeout(settle, NEXT_FRAME_TIMEOUT_MS)
})
