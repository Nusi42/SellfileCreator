/* eslint import/no-unused-modules: off */
//
// capture-replay-helper — replay a REAL captured RSL Helper endpoint session through the REAL
// app + rule-cache worker, and hand the per-build safeguard PROTECTED-itemKey history to a
// caller-supplied assertion.
//
// This is the general "reproduce a captured pipeline bug in CI" primitive. Capture a live
// session with `?capturePackets` (frames land in docs/orig/sampleLog/captures/<session>/), then
// write a 5-line spec that points `replayCaptureAndAssert` at that folder and asserts on the
// protected-count history. The offline headless harness (tests/repro/repro-capture-replay.ts)
// does a clean fresh detect per export, so it cannot exhibit bugs that only appear in the
// long-lived worker driven by the app's real build sequence (configure baseline → detect →
// matcher pass configures FINAL rules → next build's detection state). Replaying through the
// real app reproduces that exact interleave; this helper is how we drive it.
//
// The protected counts come from the window.__protectedHistory test hook (useRuleCacheWorker,
// gated by ALLOW_TEST_HOOKS + ?logWasmHeap) — worker console.log does not reliably reach
// Playwright, so the worker stashes the per-build protected count on window for us to read.
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import type { WebSocketRoute } from '@playwright/test'
import { expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { PRESET_LATEGAME_SFC_PATH } from './fixture-paths'

// RSL Helper default WebSocket endpoint; the app reads it from the ?endpoint= query param.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Where capture sessions land (the `?capturePackets` dev mechanism writes one folder per run).
const CAPTURES_ROOT = path.resolve(process.cwd(), 'docs/orig/sampleLog/captures')

// One captured JSON-RPC envelope. Inbound frames carry a `method`; outbound (app→endpoint)
// requests are tagged direction:"send" and are NOT fed back into ingest on replay.
type Envelope = { method?: string; direction?: string; params?: unknown }

// Load a capture session's INBOUND data frames in capture order. Skips outbound requests
// (uploadSellfile / requestSfcSync) and bare responses, which are not ingest inputs.
const loadInboundPackets = (captureDir: string): Envelope[] => {
  const files = fs.readdirSync(captureDir)
    .filter((name) => /^packet_\d+_.+\.json$/.test(name))
    // Numeric index prefix dictates send order (packet_2 follows packet_1 even single-digit).
    .sort((a, b) => Number(a.match(/^packet_(\d+)_/)![1]) - Number(b.match(/^packet_(\d+)_/)![1]))
  const out: Envelope[] = []
  for (const name of files) {
    const env = JSON.parse(fs.readFileSync(path.join(captureDir, name), 'utf-8')) as Envelope
    if (env.direction === 'send') continue
    if (!env.method || env.method === 'response') continue
    out.push(env)
  }
  return out
}

// Group inbound frames into "pushes" — each contiguous run the app ingests before settling once.
// RSL Helper emits artifacts/inboxArtifacts/champions per push; splitting on `artifacts`
// boundaries makes each group one gear update the pipeline settles on, so the replay reproduces
// the real per-build sequence (and restore-vs-endpoint timing) rather than one giant burst.
const groupIntoPushes = (packets: Envelope[]): Envelope[][] => {
  const groups: Envelope[][] = []
  let current: Envelope[] = []
  for (const p of packets) {
    if (p.method === 'artifacts' && current.length > 0) {
      groups.push(current)
      current = []
    }
    current.push(p)
  }
  if (current.length > 0) groups.push(current)
  return groups
}

export type ReplayCaptureOptions = {
  // Capture session: either a bare folder name under docs/orig/sampleLog/captures/, or an
  // absolute path to a capture directory.
  capture: string
  // The Playwright page (from the test fixture).
  page: Page
  // Preset .sfc to load before replaying (default: presets/lategame.sfc). Loading an SFC with
  // active safeguards is what makes the pipeline run detection (needsDetection).
  sfcPath?: string
  // Assertion over the per-build protected-itemKey history. `history` is one entry per pipeline
  // build (0 = a build before rules loaded). Throw / use expect() to fail.
  assert: (history: number[]) => void
  // Optional label for the diagnostic log line.
  label?: string
}

// Replay a captured endpoint session through the real app + worker and run `assert` on the
// resulting protected-itemKey history. Fails the test on page crash or uncaught page error.
export const replayCaptureAndAssert = async (options: ReplayCaptureOptions): Promise<number[]> => {
  const { page, assert } = options
  const sfcPath = options.sfcPath ?? PRESET_LATEGAME_SFC_PATH
  const label = options.label ?? path.basename(options.capture)
  const captureDir = path.isAbsolute(options.capture)
    ? options.capture
    : path.resolve(CAPTURES_ROOT, options.capture)
  if (!fs.existsSync(captureDir)) {
    throw new Error(`capture directory not found: ${captureDir}`)
  }

  const pushes = groupIntoPushes(loadInboundPackets(captureDir))
  expect(pushes.length, `expected gear pushes in capture ${label}`).toBeGreaterThan(0)

  const pageErrors: string[] = []
  let crashed = false
  page.on('crash', () => { crashed = true })
  page.on('pageerror', (err) => { pageErrors.push(err.message) })

  // Act as the RSL Helper server: accept the app's WebSocket, discard its outbound frames.
  let serverWs: WebSocketRoute | null = null
  await page.routeWebSocket(ENDPOINT_URL, (ws) => {
    serverWs = ws
    ws.onMessage(() => { /* discard outbound uploadSellfile / requestSfcSync */ })
  })

  await prepareApp(page)
  // ?logWasmHeap activates the ALLOW_TEST_HOOKS window.__protectedHistory recorder in the worker hook.
  await page.goto(`/?endpoint=${ENDPOINT_URL}&logWasmHeap=1`, APP_GOTO_OPTIONS)

  // Load the preset so safeguards are active (detection only runs when needsDetection is true).
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(sfcPath)
  await dismissBlockingDialogs(page)
  await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

  for (let i = 0; i < 50 && !serverWs; i += 1) await page.waitForTimeout(100)
  if (!serverWs) throw new Error('WebSocket connection to endpoint was never established')

  // Replay each push as a burst, settling the pipeline after each so the per-build sequence
  // mirrors the live session that produced the capture.
  const ws = serverWs
  for (const group of pushes) {
    expect(crashed, `page crashed during replay of ${label}`).toBe(false)
    for (const msg of group) ws.send(JSON.stringify(msg))
    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)
    await page.waitForTimeout(300).catch(() => { crashed = true })
    if (crashed) break
  }

  const history = await page.evaluate(
    () => (window as unknown as { __protectedHistory?: number[] }).__protectedHistory ?? [],
  )
   
  console.log(`[capture-replay] ${label} protected history = ${JSON.stringify(history)}`)

  expect(crashed, `page crashed during ${label}`).toBe(false)
  expect(pageErrors, `uncaught page errors during ${label}`).toHaveLength(0)
  expect(history.length, `expected at least one safeguard build for ${label} (history=${JSON.stringify(history)})`)
    .toBeGreaterThan(0)

  assert(history)
  return history
}

// Convenience assertion: every REAL build (non-zero; zeros are pre-rules-loaded startup builds)
// must protect AT LEAST `floor` items. Catches the stale-FINAL-config under-protection dip
// (a build collapsing to the masked low count). `floor` should sit between the masked value and
// the correct plateau for the account/preset under test.
export const expectProtectedFloor = (floor: number) => (history: number[]): void => {
  const realBuilds = history.filter((n) => n > 0)
  expect(realBuilds.length, `expected real safeguard builds (history=${JSON.stringify(history)})`)
    .toBeGreaterThan(0)
  const below = realBuilds.filter((n) => n < floor)
  expect(
    below,
    `under-protection: builds dropped below the ${floor} floor (history=${JSON.stringify(history)})`,
  ).toHaveLength(0)
}
