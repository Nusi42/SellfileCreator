import { TINT } from './colorTints'

// Single source of truth for the "go-expert demo" slide — a one-time teaching gesture that plays
// when a user leaves simple (express) mode via the "Go Expert" button. In expert mode the note
// dialog becomes a draggable floating panel that overlays the newly-revealed builder column, and
// some users did not realise it could be moved or closed — they thought the builders were missing.
// The demo slides the panel once to the opposite screen edge and back, dragging a very dim
// Knight-Rider-style motion streak behind its trailing edge, so the eye registers "this thing
// moves — I can get it out of the way". Reusing one definition keeps the gesture identical wherever
// it is triggered and keeps the timing/keyframes out of the (already large) NoteDialog component.

// Total slide duration (out-and-back). Long enough to read as deliberate, short enough not to feel
// like the UI is frozen while it plays.
export const GO_EXPERT_DEMO_DURATION_MS = 1400

// The panel dwells briefly at the far edge before returning, so the "it moved all the way over"
// reads clearly rather than looking like a single bounce. Expressed as a fraction of the timeline.
const DEMO_FAR_HOLD_START = 0.42
const DEMO_FAR_HOLD_END = 0.58

/**
 * playGoExpertPanelDemo
 *
 * Slides `panel` visually to the opposite viewport edge and back using a `transform: translateX`
 * animation (Web Animations API). `travelPx` is the signed horizontal distance to the opposite edge
 * in the panel's own CSS-px space — positive to sweep right, negative to sweep left. The trailing
 * edge carries a dim `primaryDemoTrail` box-shadow streak that grows while moving and collapses at
 * the turn/rest points, reading as a fading motion trail.
 *
 * IMPORTANT: this animates `transform` and `box-shadow` only — never `left`/`width`. Those are the
 * panel's persisted/draggable position (snap side + width in localStorage); `transform` is
 * orthogonal to all of it, so the demo leaves the real position untouched. Callers must still guard
 * the panel's position layout effect for the duration (e.g. via `panel.dataset['gesture']`) so it
 * does not overwrite inline styles mid-play, and clear that guard in the returned promise.
 *
 * Returns the Animation (or null if the element / Web Animations API is unavailable) so callers can
 * cancel it on cleanup, plus resolves nothing special — read `.finished` for completion.
 */
export function playGoExpertPanelDemo(
  panel: HTMLElement | null | undefined,
  travelPx: number,
): Animation | null {
  // Guard missing element and environments without the Web Animations API.
  if (!panel || typeof panel.animate !== 'function') return null
  // Streak trails the leading edge of travel: it points back toward home, so its horizontal offset
  // is the opposite sign of travel. Its spread scales with how far we've moved (peak at the far edge).
  const streakDir = travelPx >= 0 ? -1 : 1
  // Shadow at rest — no streak. At the far edge — a wide dim streak pointing home.
  const noStreak = `0 0 0 0 ${TINT.pulseFadeOut}`
  const farStreak = `${streakDir * 48}px 0 40px 8px ${TINT.primaryDemoTrail}`
  const midStreak = `${streakDir * 24}px 0 24px 2px ${TINT.primaryDemoTrail}`
  // Keyframes: ease out to the far edge (growing the streak), dwell, then ease back (collapsing it).
  const keyframes: Keyframe[] = [
    { offset: 0, transform: 'translateX(0)', boxShadow: noStreak, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    { offset: DEMO_FAR_HOLD_START, transform: `translateX(${travelPx}px)`, boxShadow: farStreak, easing: 'linear' },
    { offset: DEMO_FAR_HOLD_END, transform: `translateX(${travelPx}px)`, boxShadow: midStreak, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    { offset: 1, transform: 'translateX(0)', boxShadow: noStreak },
  ]
  return panel.animate(keyframes, {
    duration: GO_EXPERT_DEMO_DURATION_MS,
    iterations: 1,
    // fill:'none' so the panel returns to its untouched (no transform / no extra shadow) state; its
    // real box-shadow comes from the Paper elevation and is unaffected once the animation clears.
    fill: 'none',
  })
}
