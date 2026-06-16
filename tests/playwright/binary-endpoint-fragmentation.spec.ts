/* eslint import/no-unused-modules: off */
/**
 * binary-endpoint-fragmentation.spec.ts
 *
 * Long-running WASM allocator fragmentation stress test.
 *
 * The sibling binary-endpoint-memory spec re-imports a SINGLE DB with a FIXED
 * rule set, so every pipeline run allocates the same-sized buffers — that
 * exercises alloc/free but never produces the talc free-list fragmentation that
 * the warmup pre-grow exists to absorb. Fragmentation only bites when allocation
 * SIZES vary run-to-run, leaving mismatched holes the allocator must thread.
 *
 * This spec deliberately varies BOTH inputs across several dozen cases:
 *   1. Four real RSLHelper DBs of different sizes (~708 KB → ~1.4 MB) → different
 *      artifact-row buffer sizes per push.
 *   2. lategame.sfc's account-level + keep-toggle recipe overrides, flipped via
 *      the note dialog between pushes → materially different active rule sets,
 *      hence different rule-buffer sizes per configure.
 *
 * TRANSPORT NOTE — this spec uses the `gearDbFileBinary` WebSocket path: a JSON-RPC
 * metadata notification followed by a raw SQLite frame. That is a SECONDARY transport
 * for direct binary DB loads; it is NOT how RSL Helper itself pushes updates. RSL
 * Helper streams JSON-RPC part notifications (`artifacts` / `champions` /
 * `inboxArtifacts` / `lastUsed`, see docs/orig/sampleLog/) — never binary, and never a
 * single complete DB. We exercise the binary path here because it is a real ingest path
 * that still needs coverage AND it is the cheapest way to drive a full, size-varied
 * pipeline per case. Fragmentation lives in the WASM rule/eval allocator, which is
 * downstream of and identical for both transports, so a binary-driven stress is a valid
 * fragmentation guard. A future enhancement could replay the sample-log JSON parts
 * (optionally re-chunked) to stress the part-merge ingest path the same way.
 *
 * Each case: flip overrides → push that case's DB binary over the WebSocket endpoint →
 * wait for the pipeline to settle → assert the page did not crash and raised no uncaught
 * errors. The crash signal (page 'crash' / 'pageerror') is engine-agnostic, so unlike the
 * performance.memory heap assertion this catches the Firefox content-process SIGSEGV
 * directly. This is the guard that proves skipping the pre-grow on Gecko does NOT
 * reintroduce a fragmentation crash over a sustained, varied workload.
 */
import fs from 'node:fs'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import {
  openNoteDialog,
  setNoteOverrideCheckbox,
  closeNoteDialog,
  waitForWorkloadIdle,
} from './note-overrides-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { FRAGMENTATION_DBS_PER_RULESET } from './iteration-counts'
import { PRESET_LATEGAME_SFC_PATH, EXAMPLE_RSLHELPER_DB_PATHS } from './fixture-paths'

// RSL Helper default WebSocket endpoint.
const ENDPOINT_URL = 'ws://localhost:8080/'

// Account-level override labels (lategame.sfc "Which account level…" question).
// These are radio-style in practice: picking one materially reshapes the active
// rule set. Ordered midgame → endgame so the rule count climbs across the cycle.
const ACCOUNT_MODES = ['Midgame', 'Lategame', 'Endgame', 'Endgame+'] as const
// A keep-toggle whose on/off state adds or removes a block of safeguard rules,
// giving a second, independent axis of rule-buffer-size variation per case.
// Matches the lategame.sfc checkbox "Keep 5★ limited sets" (id=keep_limited);
// substring "Keep 5★ limited" is enough to disambiguate it from the other
// keep-* checkboxes in the same question.
const KEEP_LIMITED_LABEL = 'Keep 5★ limited'

/**
 * Build the case matrix as a FULL cross product: every (account mode × keep-toggle)
 * combination is run against every DB → 4 modes × 2 keep states × 4 DBs = 32 cases.
 * "Several dozen" varied pipeline runs, each a fresh configure + binary import +
 * full safeguard evaluation.
 *
 * The DB is the INNER loop so consecutive cases differ in DB size (different
 * artifact-row buffer sizes) while the rule set holds; the rule set changes every
 * 4 cases. That ordering keeps allocation sizes churning between adjacent runs —
 * the allocator never settles into a single steady-state footprint, which is what
 * surfaces talc free-list fragmentation rather than masking it.
 */
type FragCase = { mode: (typeof ACCOUNT_MODES)[number]; keepLimited: boolean; dbPath: string; dbLabel: string }
const buildCases = (): FragCase[] => {
  const cases: FragCase[] = []
  // Dev runs cap the DBs per rule-set (E2E_FULL → Infinity = every DB) so the matrix
  // stays size-varied — the fragmentation signal — while the dev loop stays short.
  const dbsPerRuleSet = EXAMPLE_RSLHELPER_DB_PATHS.slice(0, FRAGMENTATION_DBS_PER_RULESET)
  for (const mode of ACCOUNT_MODES) {
    for (const keepLimited of [false, true]) {
      for (const dbPath of dbsPerRuleSet) {
        const dbLabel = dbPath.split('/').pop() ?? dbPath
        cases.push({ mode, keepLimited, dbPath, dbLabel })
      }
    }
  }
  return cases
}

test.describe('binary-endpoint-fragmentation', () => {
  test('varied DB + rule-set pushes do not crash the WASM pipeline', async ({ page }) => {
    const cases = buildCases()
    // 32 cases: 8 pay the note-dialog + SFC-rebuild cost, the other 24 are DB-only
    // pushes bounded by a single settleWorkload() each. Shared sweep token (480 s) —
    // less than half the former 20-min ceiling, which only existed to mask the
    // visible-wait-that-never-fires bug that settleWorkload() avoids. Serialized in
    // the <browser>-perf project; a run near this bound means a real settle regressed.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointSweep)

    // Pre-read every DB once so the hot loop only does WebSocket I/O, not disk I/O.
    const dbBuffers = new Map<string, Buffer>()
    for (const dbPath of EXAMPLE_RSLHELPER_DB_PATHS) {
      dbBuffers.set(dbPath, fs.readFileSync(dbPath))
    }

    // Accumulate crash diagnostics so a failure reports the offending case.
    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })

    // Mirror pipeline diagnostics from the browser into the runner log so a crash
    // report shows which phase the process died in.
    page.on('console', (msg) => {
      const text = msg.text()
      if (
        text.includes('[endpoint-queue]')
        || text.includes('[rule-cache-worker]')
        || text.includes('[ws-binary]')
      ) {
        console.log(`[browser] ${msg.type()}: ${text}`)
      }
    })

    // Intercept the endpoint WebSocket; discard outbound messages (uploadSellfile etc.).
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage(() => { /* no-op — we don't simulate RSL Helper responses */ })
    })

    await prepareApp(page)
    // Boot with the endpoint param so the app immediately opens the WebSocket.
    await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)

    // Load lategame.sfc — the note dialog auto-opens and safeguard rules activate.
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    // Dismiss the auto-opened note dialog + any restore prompt; we re-open the note
    // dialog explicitly per case so the override flow starts from a known state.
    await dismissBlockingDialogs(page)
    await waitForWorkloadIdle(page)

    // Poll until the app opens the WebSocket to our interceptor.
    for (let i = 0; i < 50 && !serverWs; i++) {
      await page.waitForTimeout(100)
    }
    if (!serverWs) throw new Error('App did not open the WebSocket endpoint connection.')

    console.log(`[frag-test] starting ${cases.length} varied cases`)

    // Track the currently-selected account mode so we can uncheck it before
    // selecting the next one — the account-level checkboxes are mutually exclusive
    // in intent (each carries a ^self-require selector), so leaving stale ones
    // checked would muddy which rule set is actually active. lategame.sfc defaults
    // to Lategame (marked with * in the DSL), so that is the initial selection.
    // keepLimited starts true because the default Lategame mode sets +keep_limited.
    let activeMode: (typeof ACCOUNT_MODES)[number] = 'Lategame'
    let activeKeepLimited = true

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i]!
      // Fail fast — and identify the exact case — if the process already died.
      expect(crashed, `page crashed before case ${i + 1} (${c.mode}/keepLimited=${c.keepLimited}/${c.dbLabel})`).toBe(false)
      expect(pageErrors, `uncaught errors before case ${i + 1}`).toHaveLength(0)

      // 1) Reconfigure the rule set ONLY when this case's mode/keep differs from
      //    the currently-active selection. DB-only iterations (same rule set, new
      //    DB) skip the dialog entirely — that mirrors RSL Helper, which pushes
      //    DB updates without touching rules, and avoids a wasted SFC rebuild.
      const ruleSetChanged = c.mode !== activeMode || c.keepLimited !== activeKeepLimited
      if (ruleSetChanged) {
        // Open the note dialog, switch account mode (unchecking the previous one
        // so exactly one stays active), set the keep-toggle, close, and let the
        // SFC rebuild settle before the DB push.
        await openNoteDialog(page)
        if (activeMode !== c.mode) {
          await setNoteOverrideCheckbox(page, activeMode, false)
          await setNoteOverrideCheckbox(page, c.mode, true)
          activeMode = c.mode
        }
        if (activeKeepLimited !== c.keepLimited) {
          await setNoteOverrideCheckbox(page, KEEP_LIMITED_LABEL, c.keepLimited)
          activeKeepLimited = c.keepLimited
        }
        await closeNoteDialog(page)
        await waitForWorkloadIdle(page)
      }

      // 2) Push this case's DB over the secondary gearDbFileBinary path: a JSON-RPC
      //    metadata notification followed by the raw SQLite bytes. (RSL Helper does
      //    NOT use this path — it streams JSON parts; see the TRANSPORT NOTE above.)
      const ws = serverWs
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'gearDbFileBinary',
        params: { name: 'RSLHelper.db', contentType: 'application/x-sqlite3' },
      }))
      ws.send(dbBuffers.get(c.dbPath)!)

      // 3) Wait for the import + full safeguard pipeline to settle for this push.
      // settleWorkload keeps the visible wait short (a fast small-DB pipeline can
      // show-and-hide the spinner before Playwright polls it) and spends the long
      // budget only on the hidden wait — the bug that made this spec run for 30+ min
      // was a long visible budget × 24 DB-only cases of dead waiting.
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)
      // Trailing tick so React can commit any final state before the next case.
      await page.waitForTimeout(250)

      console.log(`[frag-test] case ${i + 1}/${cases.length} ok — ${c.mode}/keepLimited=${c.keepLimited}/${c.dbLabel}`)
    }

    // Final crash gate after the full varied workload.
    expect(crashed, 'page crashed during varied fragmentation workload').toBe(false)
    expect(pageErrors, 'uncaught page errors during varied fragmentation workload').toHaveLength(0)
  })
})
