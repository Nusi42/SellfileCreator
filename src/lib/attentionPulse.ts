import { TINT } from './colorTints'

// Single source of truth for the "attention pulse" — a brief expanding-glow + scale animation used
// to draw the eye to a control that just appeared or changed off-screen of the user's focus (e.g.
// the simple/expert toggle swapping, or the note toggle after the dialog closes). Reusing one
// definition keeps the pulse visually identical wherever it is triggered.

// Default number of pulse cycles. At PULSE_CYCLE_MS each, two cycles read as a deliberate ~1.1s
// blink; callers that want a "few seconds" of attention pass more iterations.
export const ATTENTION_PULSE_DEFAULT_ITERATIONS = 2
// Duration of a single pulse cycle.
export const ATTENTION_PULSE_CYCLE_MS = 550

// The keyframes: grow an expanding halo while gently scaling up, then settle back. The halo starts
// from the primary glow tint and fades to transparent (pulseFadeOut) so it dissolves cleanly.
const ATTENTION_PULSE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)', boxShadow: `0 0 0 0 ${TINT.primaryGlow}` },
  { transform: 'scale(1.12)', boxShadow: `0 0 0 10px ${TINT.pulseFadeOut}` },
  { transform: 'scale(1)', boxShadow: `0 0 0 0 ${TINT.pulseFadeOut}` },
]

/**
 * playAttentionPulse
 *
 * Plays the shared attention pulse on `el`. Returns the Animation (or null if the element/Web
 * Animations API is unavailable) so callers can cancel it on cleanup. `iterations` controls how
 * long the blink lasts — default is a short ~1.1s; pass more for a multi-second draw.
 */
export function playAttentionPulse(
  el: HTMLElement | null | undefined,
  iterations: number = ATTENTION_PULSE_DEFAULT_ITERATIONS,
): Animation | null {
  // Guard missing element and environments without the Web Animations API.
  if (!el || typeof el.animate !== 'function') return null
  return el.animate(ATTENTION_PULSE_KEYFRAMES, {
    duration: ATTENTION_PULSE_CYCLE_MS,
    iterations,
    easing: 'ease-in-out',
  })
}

/**
 * attentionPulseIterationsForMs
 *
 * Converts a desired total duration (ms) into a whole number of pulse cycles, minimum one. Lets a
 * caller ask for "about N seconds of blinking" without hard-coding the iteration count against the
 * cycle length.
 */
export function attentionPulseIterationsForMs(totalMs: number): number {
  return Math.max(1, Math.round(totalMs / ATTENTION_PULSE_CYCLE_MS))
}
