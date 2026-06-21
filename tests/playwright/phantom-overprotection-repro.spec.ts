/* eslint import/no-unused-modules: off */
//
// phantom-overprotection-repro — regression test for the safeguard under-protection bug.
//
// `ignore_by_safeguards` recipes (Chaos Ore — gear kept only to reroll, so its current
// main/substat combo is not really kept) make matching accessories at-risk, so the Best%/Unique
// safeguards correctly protect them. The steady-state correct protected count for account
// account-d + presets/lategame.sfc is the HIGH plateau (~1554). The bug: intermittently a build
// detected base_match against the leftover FINAL ruleset from the prior matcher pass — whose
// injected safeguard keep-rules give those Chaos Ore items a non-ignored keep, masking them as
// "not at-risk" → the count DROPPED to ~1270 and the exported HSF LOST ~285 keep rules.
//
// The fix (ruleCacheWorker.ts invalidateConfiguredKey) forces detection to reconfigure the
// baseline before each base_match, so every build stays on the high plateau. This replays the
// captured session that reproduced the dip and asserts no build falls below the plateau floor.
//
// See tests/playwright/capture-replay-helper.ts for the reusable replay primitive.
import { test } from './fixtures'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { replayCaptureAndAssert, expectProtectedFloor } from './capture-replay-helper'

// The captured session that reliably reproduced the inconsistency (1554 plateau with 1270 dips).
const CAPTURE = 'session_260621_180039.978'
// Floor between the masked under-protected value (~1270) and the correct plateau (~1554). Any
// real build below this is the stale-FINAL-config masking bug.
const PLATEAU_FLOOR = 1500

test.describe('phantom-overprotection-repro', () => {
  test('replayed capture never under-protects (protected stays on the correct plateau)', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointBurst)
    await replayCaptureAndAssert({
      page,
      capture: CAPTURE,
      assert: expectProtectedFloor(PLATEAU_FLOOR),
    })
  })
})
