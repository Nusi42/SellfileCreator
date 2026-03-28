/**
 * easterEggAnimUtils.ts
 *
 * Shared animation utilities for all Easter egg systems in the app.
 * Extracted from useGearInspectorSortPopoutEasterEgg so both the sort-popout
 * Easter egg and the Gear Analytics Easter eggs share exactly one definition.
 */

/** Smooth deceleration — good for "land in place" end states. */
export const easingSnappy = 'cubic-bezier(0.2, 0.9, 0.2, 1)'
/** Overshoot landing — good for "slam" moments. */
export const easingSlam   = 'cubic-bezier(0.18, 1.15, 0.22, 1)'
/** Step-based jitter — good for glitch / digital noise effects. */
export const easingGlitch = 'steps(6, end)'

/**
 * Batch-animate a list of elements with identical keyframes + options.
 * WAAPI animations are compositor-friendly and do not require React re-rendering per frame.
 */
export function animateAll(
  targets: readonly HTMLElement[],
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): readonly Animation[] {
  // Map instead of forEach so callers can track returned Animation objects for reversal/cancel.
  return targets.map((el) => el.animate(keyframes, options))
}

/** Clamp a number to [0, 1]. */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Cross-component Gear Analytics Easter egg peer trigger.
 * Passed from GearAnalyticsTabContent down to sibling components so they can react
 * when a different component's Easter egg fires.  The `seq` field increments
 * on every new trigger so React sees a fresh value even if the flavor repeats.
 *
 *   cascade — another component fired; play a random matching dance animation.
 *   rage    — react with a brief "angry inflate" WAAPI burst (used by donuts when
 *             the treemap or radar fires, making them look like furious pie charts).
 */
export type GearAnalyticsEggPeer = { seq: number; flavor: 'cascade' | 'rage' }
