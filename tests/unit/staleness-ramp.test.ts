import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stalenessMinutes,
  stalenessTier,
  stalenessColor,
  stalenessDurationParts,
  resolveDirtySince,
  anyStampPending,
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

// A RECOVERY edge (autosave restore) is not an edit: the work has been unsaved since
// the original session, so the persisted stamp must be resumed rather than reset.
// Stamping now here is what made a restored document present an hours-old loss as a
// fresh, calm-looking dot. See lib/sfcProvenance.ts.
test('a recovery rising edge resumes the persisted stamp instead of restarting', () => {
  const restored = NOW - 95 * 60_000
  const recovered = resolveDirtySince({
    dirty: true, wasDirty: false, current: restored, restorePending: true, keepStamp: true, now: NOW,
  })
  assert.equal(recovered.next, restored, 'the restored age must survive the restore edge')
  assert.equal(recovered.restorePending, false)
  // The dot therefore arrives already red rather than neutral.
  assert.equal(stalenessTier(stalenessMinutes(recovered.next, NOW)), 'critical')
})

// keepStamp only has an age to resume when one was actually persisted; with no stamp
// the edge must still start a clock rather than leaving the document unstamped.
test('a recovery with no persisted stamp falls back to stamping now', () => {
  const recovered = resolveDirtySince({
    dirty: true, wasDirty: false, current: null, restorePending: false, keepStamp: true, now: NOW,
  })
  assert.equal(recovered.next, NOW)
})

// The flag must not leak past the restore: the next genuine edit re-stamps normally.
test('keepStamp does not affect ordinary edit edges', () => {
  const edited = resolveDirtySince({
    dirty: true, wasDirty: false, current: NOW - 95 * 60_000, restorePending: false, keepStamp: false, now: NOW,
  })
  assert.equal(edited.next, NOW)
})

// The tick gate. Every dot ages off ONE interval, and that interval only runs while
// something is pending — so a dot whose stamp is not in this predicate silently stops
// ramping. The push dot was exactly that case: it lived outside the hook, the gate only
// knew the two SAVED documents, and under SfcFileAsSellfile a push goes stale while both
// of those stay clean (an override answer rewrites the pushed rules, not the raw
// document). `now` then froze and the dot kept its mount-time colour indefinitely.
test('anyStampPending keeps the clock running for ANY pending stamp', () => {
  // Nothing pending: the interval must stay off so a saved session pays nothing.
  assert.equal(anyStampPending(null, null, null), false)
  assert.equal(anyStampPending(), false)
  assert.equal(anyStampPending(undefined, null), false)

  // Each stamp alone is enough — including the third, non-persisted one.
  assert.equal(anyStampPending(NOW, null, null), true, 'the SFC stamp alone ticks')
  assert.equal(anyStampPending(null, NOW, null), true, 'the HSF stamp alone ticks')
  assert.equal(
    anyStampPending(null, null, NOW),
    true,
    'a stale push must tick even while both saved documents are clean',
  )
})

// The push stamp runs the SAME edge resolver as the other two rather than a hand-rolled
// if/else, so its ages cannot drift from theirs. It passes no restore grace: nothing
// persists it, so there is no restored stamp to shield from the boot-time clean read and
// a dirty->clean edge is always a real push.
test('the ephemeral push stamp rises, holds, and clears on the shared resolver', () => {
  let prevDirty = false
  let cur: number | null = null
  const step = (dirty: boolean, now: number) => {
    cur = resolveDirtySince({ dirty, wasDirty: prevDirty, current: cur, restorePending: false, now }).next
    prevDirty = dirty
    return cur
  }

  assert.equal(step(false, NOW), null, 'a clean mount stamps nothing')
  assert.equal(step(true, NOW), NOW, 'the clean->dirty edge stamps the divergence moment')
  // Still dirty: the ORIGINAL moment is the age, so the dot keeps ramping instead of
  // restarting on every unrelated re-render.
  assert.equal(step(true, NOW + 60_000), NOW, 'a held dirty state keeps its first stamp')
  assert.equal(step(false, NOW + 90_000), null, 'a successful push clears it')
  // No restore grace means a clean read really clears, and the next divergence is new.
  assert.equal(step(true, NOW + 120_000), NOW + 120_000, 'the next divergence stamps fresh')
})
