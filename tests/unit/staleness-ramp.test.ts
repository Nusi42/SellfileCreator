import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stalenessMinutes,
  stalenessTier,
  stalenessColor,
  stalenessDurationParts,
  resolveDirtySince,
} from '../../src/lib/stalenessRamp.js'
import { STALENESS_TIER_MINUTES } from '../../src/lib/constants.js'

// Anchors chosen as pure channels so interpolation is trivially checkable by eye.
const ANCHORS = { neutral: '#000000', warning: '#808080', error: '#ff0000' }
const NOW = 1_700_000_000_000
const minsAgo = (m: number): number => NOW - m * 60_000

// stalenessMinutes: null in → null out; future stamps clamp rather than going negative.
test('stalenessMinutes measures elapsed time and clamps clock skew', () => {
  assert.equal(stalenessMinutes(null, NOW), null)
  assert.equal(stalenessMinutes(undefined, NOW), null)
  assert.equal(stalenessMinutes(Number.NaN, NOW), null)
  assert.equal(stalenessMinutes(minsAgo(30), NOW), 30)
  // A stamp from the future (system clock moved back) reads as "just edited",
  // never as a negative age that would invert the ramp.
  assert.equal(stalenessMinutes(NOW + 60_000, NOW), 0)
})

// Tier boundaries are inclusive-low: exactly 5 minutes is already 'aging'.
test('stalenessTier maps ages onto the four tiers', () => {
  const { aging, stale, critical } = STALENESS_TIER_MINUTES
  assert.equal(stalenessTier(null), 'fresh')
  assert.equal(stalenessTier(0), 'fresh')
  assert.equal(stalenessTier(aging - 0.01), 'fresh')
  assert.equal(stalenessTier(aging), 'aging')
  assert.equal(stalenessTier(stale - 0.01), 'aging')
  assert.equal(stalenessTier(stale), 'stale')
  assert.equal(stalenessTier(critical - 0.01), 'stale')
  assert.equal(stalenessTier(critical), 'critical')
  // Past the last stop the ramp holds — it cannot escalate further.
  assert.equal(stalenessTier(critical * 100), 'critical')
})

// The quiet window and the endpoints are the contract the UI depends on.
test('stalenessColor holds neutral while fresh and error past the last stop', () => {
  const { aging, critical } = STALENESS_TIER_MINUTES
  assert.equal(stalenessColor(null, ANCHORS), ANCHORS.neutral)
  assert.equal(stalenessColor(0, ANCHORS), ANCHORS.neutral)
  assert.equal(stalenessColor(aging - 0.01, ANCHORS), ANCHORS.neutral)
  assert.equal(stalenessColor(critical, ANCHORS), ANCHORS.error)
  assert.equal(stalenessColor(critical * 10, ANCHORS), ANCHORS.error)
})

// Continuity is the whole point: the dot must never visibly snap between tiers.
test('stalenessColor interpolates continuously across both segments', () => {
  const { aging, stale, critical } = STALENESS_TIER_MINUTES
  // Midpoint of neutral(#000) → warning(#808080) is ~half of 0x80.
  const mid1 = stalenessColor((aging + stale) / 2, ANCHORS)
  assert.equal(mid1, 'rgb(64, 64, 64)')
  // Midpoint of warning(#808080) → error(#ff0000): red climbs, green/blue fall.
  const mid2 = stalenessColor((stale + critical) / 2, ANCHORS)
  assert.equal(mid2, 'rgb(192, 64, 64)')
  // Each segment ends exactly on its anchor, so the segments join without a jump.
  assert.equal(stalenessColor(stale, ANCHORS), 'rgb(128, 128, 128)')
})

// A malformed custom theme must degrade to the old flat dot, never throw.
test('stalenessColor falls back to neutral on unparseable anchors', () => {
  const broken = { neutral: '#123456', warning: 'not-a-color', error: 'also-bad' }
  assert.equal(stalenessColor(30, broken), '#123456')
})

// Regression: under MUI's CSS-variables mode `theme.vars.palette.warning.main` is the
// literal string "var(--mui-palette-warning-main)", which cannot be interpolated. Passing
// those through made every dot silently stay neutral no matter how stale the document was.
// Callers MUST resolve real values (resolveSchemePalette) first; this pins the failure mode
// so the fallback is understood as a safety net, never as acceptable behaviour.
test('CSS variable references cannot drive the ramp (callers must resolve real colours)', () => {
  const cssVars = {
    neutral: 'var(--mui-palette-text-secondary)',
    warning: 'var(--mui-palette-warning-main)',
    error: 'var(--mui-palette-error-main)',
  }
  // Every age collapses to the neutral fallback — i.e. no visible ramp at all.
  const atStale = stalenessColor(30, cssVars)
  const atCritical = stalenessColor(120, cssVars)
  assert.equal(atStale, cssVars.neutral)
  assert.equal(atCritical, cssVars.neutral)
  // With resolved hex the very same ages DO differ, proving the ramp itself is fine.
  const resolved = { neutral: '#a6b3c2', warning: '#ffa726', error: '#f44336' }
  assert.notEqual(stalenessColor(30, resolved), stalenessColor(120, resolved))
})

// Parts (not a formatted string) so the unit words stay in the i18n catalogs.
test('stalenessDurationParts splits hours and minutes, hiding sub-minute spans', () => {
  assert.equal(stalenessDurationParts(null), null)
  assert.equal(stalenessDurationParts(0.5), null)
  assert.deepEqual(stalenessDurationParts(1), { hours: 0, minutes: 1 })
  assert.deepEqual(stalenessDurationParts(45.9), { hours: 0, minutes: 45 })
  assert.deepEqual(stalenessDurationParts(60), { hours: 1, minutes: 0 })
  assert.deepEqual(stalenessDurationParts(80), { hours: 1, minutes: 20 })
})

// ---------------------------------------------------------------------------
// resolveDirtySince — the restore/edge state machine behind the persisted stamp.
// ---------------------------------------------------------------------------

// Regression: the app always boots CLEAN, so a naive "clean ⇒ clear" wiped the stamp
// that had just been restored from storage before anything could read it. The dot
// restarted at zero on every reload and could only ever reach red inside one session.
test('a restored stamp survives the boot-time clean observation', () => {
  const restored = NOW - 95 * 60_000
  // First observation after mount: document is clean, restore grace is armed.
  const boot = resolveDirtySince({
    dirty: false, wasDirty: false, current: restored, restorePending: true, now: NOW,
  })
  assert.equal(boot.next, restored, 'the restored stamp must be kept')
  assert.equal(boot.restorePending, false, 'the grace is consumed exactly once')

  // The age therefore still reads as critical — the dot is red and pulsing.
  assert.equal(stalenessTier(stalenessMinutes(boot.next, NOW)), 'critical')
})

// The grace is single-use: a real save after boot must still clear the stamp.
test('a genuine save clears the stamp once the restore grace is spent', () => {
  const saved = resolveDirtySince({
    dirty: false, wasDirty: true, current: NOW - 30 * 60_000, restorePending: false, now: NOW,
  })
  assert.equal(saved.next, null)
  assert.equal(saved.restorePending, false)
})

// A real edit starts the clock and supersedes whatever was restored.
test('a rising dirty edge stamps now and drops the restored stamp', () => {
  const edited = resolveDirtySince({
    dirty: true, wasDirty: false, current: NOW - 95 * 60_000, restorePending: true, now: NOW,
  })
  assert.equal(edited.next, NOW, 'a fresh edit restarts the clock')
  assert.equal(edited.restorePending, false)
})

// Steady dirty state must not keep re-stamping — that would freeze the age at 0.
test('staying dirty leaves the stamp untouched', () => {
  const stamp = NOW - 42 * 60_000
  const held = resolveDirtySince({
    dirty: true, wasDirty: true, current: stamp, restorePending: false, now: NOW,
  })
  assert.equal(held.next, stamp)
  assert.equal(stalenessTier(stalenessMinutes(held.next, NOW)), 'stale')
})
