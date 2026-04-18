/* eslint import/no-unused-modules: off */
import fs from 'node:fs'
import path from 'node:path'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { getWorkloadIndicator } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { EXAMPLE_NUSI_SFC_PATH } from './fixture-paths'

// RSL Helper default WebSocket endpoint; app reads it from ?endpoint= query param.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Sample log captured from RSL Helper: 4 artifacts, 3 inboxArtifacts, 2 champions messages.
const SAMPLE_LOG_PATH = path.resolve(process.cwd(), 'docs/orig/sampleLog/helperRcvData.json')
// Repeat the full message burst this many times to stress-test the WASM boundary.
// 3 rounds is enough to verify crash-free operation; memory-focused runs use the
// binary-endpoint-memory spec which does many more rounds with explicit heap tracking.
const REPLAY_ROUNDS = 3
// Extended round count for the memory-leak detection variant.
const MEMORY_LEAK_ROUNDS = 20

test.describe('endpoint-replay', () => {
  test('replays helperRcvData 3× without crash or page error', async ({ page }) => {
    // Each round can trigger a full WASM pipeline pass over a large artifact set; budget accordingly.
    test.setTimeout(120_000)

    // Parse the 78 MB sample log once in Node.js; all 9 messages fit comfortably in memory.
    // The file has 3 missing commas between top-level array items (log was recorded by
    // concatenating raw captures without proper JSON array formatting). Patch them before parsing.
    let rawJson = fs.readFileSync(SAMPLE_LOG_PATH, 'utf-8')
    rawJson = rawJson.replace(/ {4}\}\{\n {8}"jsonrpc"/g, '    },\n    {\n        "jsonrpc"')
    const messages: unknown[] = JSON.parse(rawJson)

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

    // Load example.sfc to activate safeguard rules — the storeArtifactRows WASM call
    // only runs when needsDetection is true (i.e., safeguards are configured).
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(EXAMPLE_NUSI_SFC_PATH)
    // Note dialog may appear after SFC import — dismiss it before continuing.
    await dismissBlockingDialogs(page)

    // Wait for the initial rule-build pipeline triggered by the SFC load.
    const workload = getWorkloadIndicator(page)
    await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
    await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.testXL }).catch(() => undefined)

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
      await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
      await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.testXL }).catch(() => undefined)

      // Short pause between rounds so the JS heap can stabilise before the next burst.
      await page.waitForTimeout(500)
    }

    // Final check — any crash or uncaught error means the fix is incomplete.
    expect(crashed, 'page crashed during endpoint replay').toBe(false)
    expect(pageErrors, 'uncaught page errors during endpoint replay').toHaveLength(0)
  })

  /**
   * Memory-leak detection: runs 20 rounds of the full JSON per-type burst.
   * Each round triggers: enqueue → handleGearDbRawPart → WASM pipeline → settle.
   *
   * Data is mutated between rounds (artifact revision incremented) so the diff
   * algorithm sees a genuine change every round, guaranteeing a full pipeline
   * run — including storeArtifactRows, evaluateAndCollectSafeguardProtection,
   * and the rule-cache worker lifecycle.  Without this, identical data produces
   * a no-op diff after round 1 and the WASM worker is never exercised.
   */
  test('json per-type burst does not leak memory across 20 rounds', async ({ page }) => {
    // 20 rounds × ~30 s settle budget + startup headroom.
    test.setTimeout(720_000)

    let rawJson = fs.readFileSync(SAMPLE_LOG_PATH, 'utf-8')
    rawJson = rawJson.replace(/ {4}\}\{\n {8}"jsonrpc"/g, '    },\n    {\n        "jsonrpc"')
    // Parse once; we mutate the objects in place between rounds to avoid 78 MB
    // JSON roundtrips per round.  Revision fields are bumped per round so the
    // app's diff algorithm detects a change and triggers a full pipeline run.
    const messages: unknown[] = JSON.parse(rawJson)

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
    await sfcInput.setInputFiles(EXAMPLE_NUSI_SFC_PATH)
    await dismissBlockingDialogs(page)

    const workload = getWorkloadIndicator(page)
    await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
    await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.testXL }).catch(() => undefined)

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
      await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
      await workload.waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.testXL }).catch(() => undefined)

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
