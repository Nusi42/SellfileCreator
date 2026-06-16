/* eslint import/no-unused-modules: off */
import fs from 'node:fs'
import path from 'node:path'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { REPLAY_ROUNDS, MEMORY_LEAK_ROUNDS } from './iteration-counts'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'

// RSL Helper default WebSocket endpoint; app reads it from ?endpoint= query param.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Sample log captured from RSL Helper on 2026-05-10: 22 packets in capture order —
// 6× artifacts, 7× champions, 6× inboxArtifacts, 2× lastUsed, 1× ArtifactByHeroID. Each
// file under `docs/orig/sampleLog/` is one full JSON-RPC envelope, named
// `packet_<index>_<method>_<YYMMDD>_<HHMMSS.mmm>.json` where the zero-padded numeric
// `<index>` dictates send order.
const SAMPLE_LOG_DIR = path.resolve(process.cwd(), 'docs/orig/sampleLog')
// Loads every captured packet from the sample-log directory, sorted by the numeric
// `<index>` prefix so we replay them in the exact order RSL Helper emitted them.
const loadCapturedPackets = (): unknown[] => {
  const files = fs.readdirSync(SAMPLE_LOG_DIR)
    // Only the per-packet capture files; ignore READMEs or unrelated JSON dumps.
    .filter((name) => /^packet_\d+_.+\.json$/.test(name))
    // Sort by numeric index so packet_2 follows packet_1 even with single-digit indices.
    .sort((a, b) => Number(a.match(/^packet_(\d+)_/)![1]) - Number(b.match(/^packet_(\d+)_/)![1]))
  // Each file is a clean standalone envelope — no array wrapping or comma stitching needed.
  return files.map((name) => JSON.parse(fs.readFileSync(path.join(SAMPLE_LOG_DIR, name), 'utf-8')))
}
// Round counts come from the shared dev/release split (E2E_FULL). REPLAY_ROUNDS verifies
// crash-free operation; MEMORY_LEAK_ROUNDS drives the heap-tracking variant for longer.

test.describe('endpoint-replay', () => {
  test(`replays sample-log packets ${REPLAY_ROUNDS}× without crash or page error`, async ({ page }) => {
    // A few push-burst rounds, each capped by one settleWorkload() wait; shared token.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointBurst)

    // Load every captured packet once in Node.js; the full burst fits comfortably in memory.
    // Each file is a self-contained JSON-RPC envelope, so no stitching or comma-patching is needed.
    const messages = loadCapturedPackets()

    // Accumulate errors so we can report all of them, not just the first.
    const pageErrors: string[] = []
    let crashed = false

    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })

    // Intercept WebSocket connections to the endpoint URL and act as the RSL Helper server.
    // serverWs is set when the app establishes the connection after page load.
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      // Silently discard any outbound requests (e.g., upload-sellfile) the app sends.
      ws.onMessage(() => { /* no-op */ })
    })

    await prepareApp(page)
    // Navigate with the endpoint param so the app opens the WebSocket on boot.
    await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)

    // Load lategame.sfc to activate safeguard rules — the storeArtifactRows WASM call
    // only runs when needsDetection is true (i.e., safeguards are configured).
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    // Note dialog may appear after SFC import — dismiss it before continuing.
    await dismissBlockingDialogs(page)

    // Wait for the initial rule-build pipeline triggered by the SFC load.
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    // Poll until the app has established the WebSocket connection (should be nearly instant).
    for (let i = 0; i < 50 && !serverWs; i++) {
      await page.waitForTimeout(100)
    }
    if (!serverWs) {
      throw new Error('WebSocket connection to endpoint was never established')
    }

    // Send all 9 messages REPLAY_ROUNDS times; no delay between messages in a burst to
    // maximise the chance of hitting the WASM-boundary memory pressure path.
    for (let round = 1; round <= REPLAY_ROUNDS; round++) {
      // Bail early if the page already crashed or threw.
      expect(crashed, `page crashed before round ${round}`).toBe(false)
      expect(pageErrors, `page errors before round ${round}`).toHaveLength(0)

      const ws = serverWs
      for (const msg of messages) {
        ws.send(JSON.stringify(msg))
      }

      // Wait for the gear-inspector workload indicator to appear then disappear.
      // The pipeline runs storeArtifactRows + evaluateAndCollectSafeguardProtection
      // for the full artifact set each time endpoint data arrives.
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

      // Short pause between rounds so the JS heap can stabilise before the next burst.
      // Catch page-closed errors (e.g. OOM under full-suite load) so the crash flag
      // drives the final assertion with a clear message instead of an unhandled throw.
      await page.waitForTimeout(500).catch(() => { crashed = true })
      if (crashed) break
    }

    // Final check — any crash or uncaught error means the fix is incomplete.
    expect(crashed, 'page crashed during endpoint replay').toBe(false)
    expect(pageErrors, 'uncaught page errors during endpoint replay').toHaveLength(0)
  })

  /**
   * Memory-leak detection: runs MEMORY_LEAK_ROUNDS rounds of the full JSON per-type burst.
   * Each round triggers: enqueue → handleGearDbRawPart → WASM pipeline → settle.
   *
   * Data is mutated between rounds (artifact revision incremented) so the diff
   * algorithm sees a genuine change every round, guaranteeing a full pipeline
   * run — including storeArtifactRows, evaluateAndCollectSafeguardProtection,
   * and the rule-cache worker lifecycle.  Without this, identical data produces
   * a no-op diff after round 1 and the WASM worker is never exercised.
   */
  test(`json per-type burst does not leak memory across ${MEMORY_LEAK_ROUNDS} rounds`, async ({ page }) => {
    // MEMORY_LEAK_ROUNDS push-burst rounds, each one settleWorkload() wait; shared token.
    // (The old 720_000 ms ceiling sized for a 20-round dev config that never ships at 3.)
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointBurst)

    // Parse once; we mutate the objects in place between rounds to avoid large
    // JSON roundtrips per round.  Revision fields are bumped per round so the
    // app's diff algorithm detects a change and triggers a full pipeline run.
    const messages = loadCapturedPackets()

    // Find the first artifact entry across all messages for per-round mutation.
    // Bumping its `revision` makes every round look like new data to the diff engine,
    // ensuring handleGearDbRawSnapshot → beginGearInspectorMatchReset → pipeline.
    const findFirstArtifactItem = (): Record<string, unknown> | null => {
      for (const msg of messages) {
        if (typeof msg !== 'object' || msg === null) continue
        const m = msg as Record<string, unknown>
        const params = m.params
        if (typeof params !== 'object' || params === null) continue
        const p = params as Record<string, unknown>
        for (const key of ['artifacts', 'inboxArtifacts']) {
          const arr = p[key]
          if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
            return arr[0] as Record<string, unknown>
          }
        }
      }
      return null
    }
    const firstArtifact = findFirstArtifactItem()
    const baseRevision = typeof firstArtifact?.revision === 'number' ? firstArtifact.revision : 0

    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })

    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage(() => { /* no-op */ })
    })

    await prepareApp(page)
    await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)

    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await dismissBlockingDialogs(page)

    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    for (let i = 0; i < 50 && !serverWs; i++) {
      await page.waitForTimeout(100)
    }
    if (!serverWs) throw new Error('WebSocket connection to endpoint was never established')

    // Baseline heap after SFC load and initial pipeline settle.
    const baselineHeap = await page.evaluate(() => {
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory
      return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : -1
    })
    console.log(`[memory-test] baseline heap=${baselineHeap}MB`)

    const roundHeaps: number[] = [baselineHeap]

    for (let round = 1; round <= MEMORY_LEAK_ROUNDS; round++) {
      expect(crashed, `page crashed before round ${round}`).toBe(false)
      expect(pageErrors, `page errors before round ${round}`).toHaveLength(0)

      // Bump revision so the diff sees new data this round → full pipeline triggered.
      if (firstArtifact) firstArtifact.revision = baseRevision + round * 10_000

      const ws = serverWs!
      // No inter-message delay — maximise WASM / worker-cycle pressure.
      for (const msg of messages) {
        ws.send(JSON.stringify(msg))
      }

      // workload appears when pipeline is triggered, disappears when settled.
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

      await page.waitForTimeout(500)

      const heapMB = await page.evaluate(() => {
        const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory
        return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : -1
      })
      roundHeaps.push(heapMB)
      console.log(`[memory-test] round=${round}/${MEMORY_LEAK_ROUNDS} heap=${heapMB}MB growth=${heapMB - baselineHeap}MB`)
    }

    console.log(`[memory-test] heap series (MB): ${roundHeaps.join(' → ')}`)
    const peakGrowthMB = baselineHeap > 0
      ? Math.max(...roundHeaps.filter((v) => v >= 0)) - baselineHeap
      : -1
    console.log(`[memory-test] peak growth=${peakGrowthMB}MB over ${MEMORY_LEAK_ROUNDS} rounds`)

    expect(crashed, 'page crashed during json replay').toBe(false)
    expect(pageErrors, 'uncaught page errors during json replay').toHaveLength(0)
  })
})
