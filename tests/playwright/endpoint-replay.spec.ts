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
const REPLAY_ROUNDS = 3

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
})
