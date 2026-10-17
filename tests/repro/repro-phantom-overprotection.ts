/* eslint import/no-unused-modules: off */
//
// repro-phantom-overprotection — manual Playwright repro for the safeguard under-protection bug.
//
// `ignore_by_safeguards` recipes (Chaos Ore — gear kept only to reroll, so its current
// main/substat combo is not really kept) make matching accessories at-risk, so the Best%/Unique
// safeguards correctly protect them. The steady-state correct protected count for the
// account-d gear-db fixture + presets/lategame.sfc is the HIGH plateau (~1554). The bug: intermittently a build
// detected base_match against the leftover FINAL ruleset from the prior matcher pass — whose
// injected safeguard keep-rules give those Chaos Ore items a non-ignored keep, masking them as
// "not at-risk" → the count DROPPED to ~1270 and the exported HSF LOST ~285 keep rules.
//
// The fix (ruleCacheWorker.ts invalidateConfiguredKey) forces detection to reconfigure the
// baseline before each base_match, so every build stays on the high plateau. This replays the
// captured session that reproduced the dip and asserts no build falls below the plateau floor.
//
// See tests/repro/capture-replay-helper.ts for the reusable replay primitive.
//
// USAGE:
//   1. Record a live session: open the app with ?capturePackets — frames land in
//      docs/orig/sampleLog/captures/<session_YYMMDD_HHMMSS.mmm>/
//   2. Update CAPTURE below to match the recorded session folder name.
//   3. Run manually:
//        npx playwright test --project=chromium tests/repro/repro-phantom-overprotection.ts
//
// NOTE: this file lives in tests/repro/ (outside Playwright's testDir=tests/playwright/) so it
// is NOT auto-discovered by `npm run test:e2e`. It requires a locally recorded capture to run.
import fs from 'node:fs'
import path from 'node:path'
import { test } from '../playwright/fixtures'
import { PLAYWRIGHT_TIMEOUTS } from '../playwright/timeouts'
import { replayCaptureAndAssert, expectProtectedFloor } from './capture-replay-helper'

// The captured session that reliably reproduced the inconsistency (1554 plateau with 1270 dips).
// Update this to a locally recorded session before running.
const CAPTURE = 'session_260621_180039.978'
// Floor between the masked under-protected value (~1270) and the correct plateau (~1554). Any
// real build below this is the stale-FINAL-config masking bug.
const PLATEAU_FLOOR = 1500

// Resolve the capture directory so we can guard against a missing session below.
const CAPTURES_ROOT = path.resolve(process.cwd(), 'docs/orig/sampleLog/captures')
const CAPTURE_DIR = path.resolve(CAPTURES_ROOT, CAPTURE)

test.describe('phantom-overprotection-repro', () => {
  test('replayed capture never under-protects (protected stays on the correct plateau)', async ({ page }) => {
    // Fail early with a clear message when the capture is not present locally.
    if (!fs.existsSync(CAPTURE_DIR)) {
      throw new Error(
        `capture not present: ${CAPTURE_DIR}\n` +
        `Record a session with ?capturePackets and update CAPTURE in this file to match.`,
      )
    }
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointBurst)
    await replayCaptureAndAssert({
      page,
      capture: CAPTURE,
      assert: expectProtectedFloor(PLATEAU_FLOOR),
    })
  })
})
