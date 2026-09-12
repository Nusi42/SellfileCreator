/**
 * stalenessRamp.ts
 *
 * SSOT for the unsaved-document "staleness" ramp: how long a document has been
 * dirty, mapped to the colour its dirty-badge dot wears.
 *
 * Why this exists: the app runs from file://, so it can never autosave to disk —
 * the user must press Save/Export themselves. A dot that looks identical at five
 * seconds and five hours gives them no reason to. The ramp makes elapsed time
 * legible at a glance without spending any extra screen space.
 *
 * The tier colours are DERIVED from the theme's semantic warning/error slots
 * rather than being their own persisted fields. That way the ramp retunes itself
 * for free under RSL Helper's preset, a user's custom skin, and — importantly —
 * every colour-blind palette, since those override warning/error upstream in
 * theme.ts. See docs/technical/theming-system.md.
 */

import { mixRgb, parseCssColorToRgb, rgbToCss } from './colorUtils'
import { STALENESS_TIER_MINUTES } from './constants'

/** How stale an unsaved document is. Ordered fresh → critical. */
export type StalenessTier = 'fresh' | 'aging' | 'stale' | 'critical'

/**
 * The ramp's colour anchors, resolved from the live theme. Callers pass the
 * palette values so this module stays free of MUI imports (and testable).
 */
export interface StalenessRampAnchors {
  /** Tier 0 — the neutral dot the badge has always worn (text.secondary). */
  neutral: string
  /** Tier 1/2 anchor — theme warning.main. */
  warning: string
  /** Tier 3 anchor — theme error.main. */
  error: string
}

/**
 * Does a dirty stamp describe a CLEAN document? The stamp is the moment the document went
 * unsaved, and null while it is saved — this is the one definition of that reading, shared
 * by the autosave payload writer (Anchored vs DivergedAt), the divergence snapshot, the
 * express Custom snapshot's own stamp and the dots that render it. Writing `=== null`
 * inline at each of those sites let them drift apart.
 */
export function dirtyStampIsClean(dirtySince: number | null | undefined): boolean {
  return dirtySince == null
}

/**
 * Whether the staleness clock must keep ticking — true as soon as ANY stamp is pending.
 *
 * The one definition of "something is aging", so adding a dot cannot forget to enrol it
 * in the tick. That is not hypothetical: the push dot was first tracked outside the
 * staleness hook, so the hand-written OR chain here never saw its stamp. Under
 * SfcFileAsSellfile a push goes stale while both SAVED documents stay clean (answering
 * an override question rewrites the pushed rules without touching the raw document), so
 * the interval stayed off, `now` froze, and that dot kept its mount-time colour while its
 * tooltip's span stopped counting.
 *
 * Whether a stamp PERSISTS is a separate question — the push stamp is deliberately
 * ephemeral — and has no bearing on whether it ages.
 */
export function anyStampPending(...stamps: Array<number | null | undefined>): boolean {
  return stamps.some((stamp) => !dirtyStampIsClean(stamp))
}

/**
 * Minutes elapsed since `dirtySince`, or null when nothing is pending. Negative
 * clock skew (a stamp from the future, e.g. after a system clock change) clamps
 * to 0 so a bad stamp reads as "just edited" rather than as instantly critical.
 */
export function stalenessMinutes(dirtySince: number | null | undefined, now: number): number | null {
  if (dirtySince == null || !Number.isFinite(dirtySince)) return null
  const minutes = (now - dirtySince) / 60_000
  if (!Number.isFinite(minutes)) return null
  return minutes > 0 ? minutes : 0
}

/**
 * Which named tier a given age falls in. The tier drives discrete behaviour
 * (the critical pulse, the tooltip's wording); the colour itself interpolates
 * continuously via stalenessColor, so the dot never visibly "snaps".
 */
export function stalenessTier(minutes: number | null): StalenessTier {
  if (minutes == null || minutes < STALENESS_TIER_MINUTES.aging) return 'fresh'
  if (minutes < STALENESS_TIER_MINUTES.stale) return 'aging'
  if (minutes < STALENESS_TIER_MINUTES.critical) return 'stale'
  return 'critical'
}

/**
 * The dot colour for an age in minutes, interpolated across the tier anchors:
 *
 *   0m …… neutral        (normal editing stays quiet)
 *   5m …… warning        (a real work session is now unsaved)
 *  20m …… warning→error  (losing this would hurt)
 *  60m+ … error          (the state that lost a user their work)
 *
 * Interpolating rather than snapping matters because nobody watches the dot
 * change — they glance at it having changed, and a continuous ramp carries "how
 * long" far better than four discrete states. Falls back to the neutral anchor
 * if any colour fails to parse, so a malformed custom theme can only ever make
 * the dot look like today's dot.
 */
export function stalenessColor(minutes: number | null, anchors: StalenessRampAnchors): string {
  const neutral = parseCssColorToRgb(anchors.neutral)
  if (!neutral) return anchors.neutral
  // Nothing pending (or still inside the quiet window) → today's neutral dot.
  if (minutes == null || minutes <= 0) return anchors.neutral

  const warning = parseCssColorToRgb(anchors.warning)
  const error = parseCssColorToRgb(anchors.error)
  if (!warning || !error) return anchors.neutral

  const { aging, stale, critical } = STALENESS_TIER_MINUTES
  // The segment is chosen by the SAME tier predicate that drives the pulse and the
  // tooltip, never by restating its boundary comparisons here — otherwise the dot's
  // colour and its tier-driven behaviour could drift apart on any future retune.
  switch (stalenessTier(minutes)) {
    // Still inside the quiet window: today's neutral dot.
    case 'fresh':
      return anchors.neutral
    // Segment 1 — neutral → warning across the first tier boundary.
    case 'aging':
      return rgbToCss(mixRgb(neutral, warning, (minutes - aging) / (stale - aging)))
    // Segment 2 — warning → error across the second boundary.
    case 'stale':
      return rgbToCss(mixRgb(warning, error, (minutes - stale) / (critical - stale)))
    // Past the last stop the ramp holds at full error; it cannot escalate further.
    case 'critical':
      return anchors.error
  }
}

/**
 * Splits an elapsed span into whole hours + minutes for display, or null when it
 * is under a minute (where a duration would read as noise). Returns the PARTS
 * rather than a formatted string so the unit words stay in the i18n catalogs —
 * "1h 20m" is not universal, and the tooltip is user-facing in ten languages.
 */
export function stalenessDurationParts(minutes: number | null): { hours: number; minutes: number } | null {
  if (minutes == null || minutes < 1) return null
  const whole = Math.floor(minutes)
  return { hours: Math.floor(whole / 60), minutes: whole % 60 }
}

/**
 * Resolves what a dirty-since stamp should become when the dirty flag is observed.
 *
 * Extracted from the tracking hook so the boot-time case is testable in isolation —
 * it is the one that broke: the app always boots CLEAN (the history baseline is
 * established before any edit), so a naive "clean ⇒ clear" rule wiped the stamp that
 * had just been restored from storage, before anything could read it. The dot then
 * restarted at zero on every reload and could only reach the red tier inside a single
 * uninterrupted session.
 *
 * `restorePending` marks that a restored stamp has not yet survived its first clean
 * observation. Callers flip it false as soon as this returns, so only the FIRST clean
 * reading is forgiven; every later one is a genuine save and does clear the stamp.
 */
export function resolveDirtySince(params: {
  /** The live dirty flag. */
  dirty: boolean
  /** Whether the previous observation was dirty (the edge tracker). */
  wasDirty: boolean
  /** The current stamp. */
  current: number | null
  /** True while a restored stamp still needs to survive the boot-time clean read. */
  restorePending: boolean
  /**
   * True when the rising edge is a RECOVERY rather than an edit — an autosave
   * restore, whose unsaved age predates this session (see lib/sfcProvenance.ts).
   * Such an edge must keep the persisted stamp; stamping `now` would reset a
   * document that has been unsaved for hours back to a fresh, calm-looking dot.
   * An existing stamp is required: with none to resume, there is no age to keep
   * and the edge falls through to stamping now.
   */
  keepStamp?: boolean
  /** Clock, injected so tests are deterministic. */
  now: number
}): { next: number | null; restorePending: boolean } {
  const { dirty, wasDirty, current, restorePending, keepStamp, now } = params
  // Rising edge: a real edit starts (or restarts) the clock and supersedes any
  // restored stamp — unless this edge is a recovery, which resumes its own age.
  if (dirty && !wasDirty) {
    const resume = keepStamp === true && current !== null
    return { next: resume ? current : now, restorePending: false }
  }
  if (!dirty) {
    // Boot-time clean read: keep the restored stamp, and consume the grace.
    if (restorePending) return { next: current, restorePending: false }
    // A true save.
    return { next: null, restorePending: false }
  }
  // Still dirty, no edge: nothing changes.
  return { next: current, restorePending }
}
