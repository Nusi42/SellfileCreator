/* eslint import/no-unused-modules: off */
/**
 * endpoint-incremental-updates.spec.ts
 *
 * Reproduces the real RSL Helper farming crash: the app dies after a few dozen feed
 * updates during a session. It does not crash on the first update — it accumulates as the
 * inventory GROWS, which points at the per-update diff/merge/pipeline cycle (App.tsx
 * handleGearDbRawSnapshot, the revision-keyed changed-id path around App.tsx:4703) leaking
 * or fragmenting the WASM allocator a little each round until the content process falls over.
 *
 * The trigger is a GROWING artifact set, not same-size churn. RSL Helper pulls new gear
 * over a farming session, so each `artifacts` push carries one (or more) artifact the feed
 * has never sent before. We model that exactly: withhold WITHHELD_ARTIFACTS items from the
 * seed, then add one back per round. Every push is strictly larger and introduces a
 * brand-new id, so the dataset / diff snapshots / WASM rows grow monotonically — the
 * accumulation a fixed-size set (bumped revisions only) reaches steady state and hides.
 *
 * Faithful to the real protocol — RSL Helper streams JSON-RPC `artifacts` / `champions`
 * / `lastUsed` notifications (NOT binary; see docs/orig/sampleLog/). During farming all
 * three interleave: the growing artifacts feed, champion re-pushes (equipment moved between
 * heroes), and standalone lastUsed packets after each game round. We replay that mix.
 *
 * Measured, not just crash-gated — the bug is an ACCUMULATION, so the diagnostic signal
 * is monotonic heap growth across rounds. We sample performance.memory each round
 * (Chromium-only) and assert the heap does not climb without bound. That catches the
 * leak on any platform, even though the hard crash itself manifests on Windows/Firefox.
 * On non-Chromium the sample is -1 and the growth assertion is skipped, but the
 * per-round crash gate still runs.
 *
 * Data source (entirely test-side — NO production code added, release stays clean):
 * we read the raw `Artifacts` / `Champs` / `LastUsedArtifacts` tables straight from the
 * real examples/um*.db captures with sql.js in Node. Those raw SQL columns map ~1:1 onto
 * the wire fields the app's inbound parser (parseArtifactLogRow / parseChampionRow in
 * src/lib/externalCommands.ts) consumes, so reconstructing wire objects here is a thin,
 * single-purpose inverse — no lossy round-trip through the importer's NormalizedGearArtifact
 * shape and no forward serializer bolted into src/. The raw tables have no `revision`
 * column (RSL-Helper-only), so we synthesize revisions, which is exactly what the
 * incremental-update simulation needs.
 */
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { dismissBlockingDialogs } from './dialog-helpers'
import { settleWorkload } from './workload-indicator'
import { INCREMENTAL_REVEAL_ROUNDS } from './iteration-counts'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { PRESET_LATEGAME_SFC_PATH, EXAMPLE_RSLHELPER_DB_PATHS } from './fixture-paths'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'

// RSL Helper default WebSocket endpoint.
const ENDPOINT_URL = 'ws://localhost:8080/'
// How many artifacts to WITHHOLD from the seed, then add back one per round (one round per
// withheld artifact). This makes every push a strictly LARGER artifact array — each round
// introduces a brand-new id the diff has never seen, so the dataset / snapshots / WASM rows
// grow monotonically. That growing inventory (a real farming session pulling new gear) is
// the trigger; a fixed-size set with bumped revisions reaches steady state and never exposes
// the accumulation.
// Round count comes from the shared dev/release split (E2E_FULL). The pre-fix leak stepped
// the WASM heap unboundedly within ~15 rounds, so the dev count (15) still reproduces a real
// leak; the full release count (60) gives a wide flatness margin while fitting the per-test
// budget on Firefox (slower than Chromium — 100 rounds overran 20 min there).
const WITHHELD_ARTIFACTS = INCREMENTAL_REVEAL_ROUNDS
// Max tolerated heap growth (MB) from the post-seed baseline to the peak. Adding 100 small
// artifacts to a multi-thousand dataset is a few MB of real data; a per-round leak (each
// push retaining a copy of the growing dataset) blows far past this. Generous so normal
// growth + GC jitter never false-fails, but tight enough to catch sustained accumulation.
const MAX_HEAP_GROWTH_MB = 300

// ── Wire reconstruction (test-side, thin inverse of the inbound parsers) ──────────

type WireStat = { id: number; level: number; isAbsolute: number; statValue: number; glyphValue: number; mValue: number }
type WireArtifact = {
  id: number; revision: number; price: number; level: number; kindId: number; rankId: number
  rarityId: number; setKindId: number; requiredFraction: number; readOnly: boolean
  primary: WireStat; secondary: WireStat[]; ascend: WireStat | null
}
type WireChampion = {
  id: number; typeId: number; grade: number; level: number; empower: number
  inStorage: boolean; Rarity: number; Name: string; artifacts: Record<string, number>
}
type WireLastUsed = { id: number; lastUse: string | number | null }
type AccountFeed = { artifacts: WireArtifact[]; champions: WireChampion[]; lastUsed: WireLastUsed[] }

// Read a numeric SQL cell defensively — sql.js returns Uint8Array/null for some types.
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0)
// Read a string SQL cell defensively.
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/**
 * Open a .db with sql.js (Node) and reconstruct the artifacts / champions / lastUsed
 * wire payloads. Mappings are the exact inverse of the inbound parsers:
 *   artifacts (parseArtifactLogRow): ID→id, type→kindId, rank→rankId, rarity→rarityId,
 *     lvl→level, aset→setKindId, accset→requiredFraction, primary={mid,mlvl,mfl,mlvlid,mgv},
 *     secondary[i]={sNid,sNlvl,sNfl,sNlvlid,sNgv,sNmlvlid}, ascend={ASCID,ASCLVL,ASCFL,ASCLVLID,ASCGV}.
 *   champions (parseChampionRow aliases): HeroID→typeId, Vault→inStorage, EmpLvl→empower,
 *     Rang→grade, plus Name/Rarity/Lvl→level. The per-instance `artifacts` slot map is
 *     rebuilt from the Artifacts rows' cID (equipped champion) + type (slot).
 *   lastUsed: { id, lastUse } passthrough.
 */
const readAccountFeed = async (dbPath: string): Promise<AccountFeed> => {
  const repoRoot = process.cwd()
  const sqlWasmPath = path.join(repoRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => sqlWasmPath })
  const db = new SQL.Database(fs.readFileSync(dbPath))
  try {
    const substat = (row: Record<string, unknown>, n: number): WireStat => ({
      id: num(row[`s${n}id`]), level: num(row[`s${n}lvl`]), isAbsolute: num(row[`s${n}fl`]),
      statValue: num(row[`s${n}lvlid`]), glyphValue: num(row[`s${n}gv`]), mValue: num(row[`s${n}mlvlid`]),
    })

    // Artifacts — also accumulate the per-champion slot map keyed by cID for champions below.
    const artifacts: WireArtifact[] = []
    const slotMapByChampion = new Map<number, Record<string, number>>()
    const aStmt = db.prepare('SELECT * FROM Artifacts')
    while (aStmt.step()) {
      const row = aStmt.getAsObject() as Record<string, unknown>
      const id = num(row.ID); const kindId = num(row.type); const rankId = num(row.rank); const rarityId = num(row.rarity)
      // parseArtifactLogRow rejects rows with any of these <= 0; skip so our payload matches.
      if (id <= 0 || kindId <= 0 || rankId <= 0 || rarityId <= 0) continue
      const secondary = [1, 2, 3, 4].map((n) => substat(row, n)).filter((s) => s.id > 0)
      const ascId = num(row.ASCID)
      artifacts.push({
        id, revision: 1, price: num(row.price), level: num(row.lvl), kindId, rankId, rarityId,
        setKindId: num(row.aset), requiredFraction: num(row.accset), readOnly: false,
        primary: { id: num(row.mid), level: num(row.mlvl), isAbsolute: num(row.mfl), statValue: num(row.mlvlid), glyphValue: num(row.mgv), mValue: 0 },
        secondary,
        ascend: ascId > 0 ? { id: ascId, level: num(row.ASCLVL), isAbsolute: num(row.ASCFL), statValue: num(row.ASCLVLID), glyphValue: num(row.ASCGV), mValue: 0 } : null,
      })
      // Record equip: artifact id sits in champion cID's slot `type`.
      const cid = num(row.cID)
      if (cid > 0 && kindId > 0) {
        const map = slotMapByChampion.get(cid) ?? {}
        map[String(kindId)] = id
        slotMapByChampion.set(cid, map)
      }
    }
    aStmt.free()

    // Champions — only when the table exists (mirrors the importer's guard).
    const champions: WireChampion[] = []
    const champStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Champs' LIMIT 1")
    const hasChamps = champStmt.step()
    champStmt.free()
    if (hasChamps) {
      const cStmt = db.prepare('SELECT ID, HeroID, Name, Vault, Rarity, EmpLvl, Rang, Lvl FROM Champs')
      while (cStmt.step()) {
        const row = cStmt.getAsObject() as Record<string, unknown>
        const id = num(row.ID)
        if (id <= 0) continue
        champions.push({
          id, typeId: num(row.HeroID), grade: num(row.Rang), level: num(row.Lvl), empower: num(row.EmpLvl),
          inStorage: num(row.Vault) > 0, Rarity: num(row.Rarity), Name: str(row.Name),
          artifacts: slotMapByChampion.get(id) ?? {},
        })
      }
      cStmt.free()
    }

    // LastUsed — only when the table exists.
    const lastUsed: WireLastUsed[] = []
    const luStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='LastUsedArtifacts' LIMIT 1")
    const hasLastUsed = luStmt.step()
    luStmt.free()
    if (hasLastUsed) {
      const lStmt = db.prepare('SELECT id, lastUse FROM LastUsedArtifacts')
      while (lStmt.step()) {
        const row = lStmt.getAsObject() as Record<string, unknown>
        const id = num(row.id)
        if (id <= 0) continue
        lastUsed.push({ id, lastUse: str(row.lastUse) || null })
      }
      lStmt.free()
    }

    return { artifacts, champions, lastUsed }
  } finally {
    db.close()
  }
}

// JSON-RPC notification envelopes matching the methods the app dispatches.
const artifactsNotification = (artifacts: WireArtifact[]): string =>
  JSON.stringify({ jsonrpc: '2.0', method: 'artifacts', params: { artifacts } })
const championsNotification = (champions: WireChampion[]): string =>
  JSON.stringify({ jsonrpc: '2.0', method: 'champions', params: { champions } })
const lastUsedNotification = (lastUsed: WireLastUsed[]): string =>
  JSON.stringify({ jsonrpc: '2.0', method: 'lastUsed', params: { lastUsed } })

// Sample V8 heap (MB), or -1 on non-Chromium where performance.memory is absent.
const measureHeapMB = async (page: { evaluate: (fn: () => number) => Promise<number> }): Promise<number> => {
  try {
    return await page.evaluate(() => {
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory
      return mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : -1
    })
  } catch { return -1 }
}

test.describe('endpoint-incremental-updates', () => {
  test('a growing artifact inventory does not crash or leak across many updates', async ({ page }) => {
    // 1 seed + WITHHELD_ARTIFACTS reveal rounds, each one push + settleWorkload() over a
    // strictly larger dataset. Shared sweep token (480 s) — less than half the former
    // 20-min ceiling. A run near this bound means a per-reveal settle is regressing.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testEndpointSweep)

    // Reconstruct every real account's feed once, up front (Node disk + sql.js work
    // stays out of the hot loop). Swapping accounts mid-run varies inventory size + ids.
    const feeds: AccountFeed[] = []
    for (const dbPath of EXAMPLE_RSLHELPER_DB_PATHS) {
      const feed = await readAccountFeed(dbPath)
      expect(feed.artifacts.length, `no artifacts read from ${dbPath}`).toBeGreaterThan(0)
      feeds.push(feed)
    }

    // Accumulate crash diagnostics so a failure pinpoints the round it died on.
    const pageErrors: string[] = []
    let crashed = false
    page.on('crash', () => { crashed = true })
    page.on('pageerror', (err) => { pageErrors.push(err.message) })
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[endpoint-queue]') || text.includes('[rule-cache-worker]')) {
        console.log(`[browser] ${msg.type()}: ${text}`)
      }
    })

    // Read the rule-cache-worker's latest WASM linear-memory size (MB) from window — the
    // worker hook stashes it there each pipeline-done when ?logWasmHeap is set. This is the
    // REAL leak signal: the pipeline allocates in the worker thread, whose heap
    // performance.memory (main thread) cannot observe, and whose console.log does not
    // reliably reach Playwright. -1 until the first pipeline has reported.
    const readWasmHeapMB = (): Promise<number> =>
      page.evaluate(() => (window as unknown as { __wasmHeapMB?: number }).__wasmHeapMB ?? -1)

    // Intercept the endpoint WebSocket; discard outbound messages (uploadSellfile etc.).
    let serverWs: WebSocketRoute | null = null
    await page.routeWebSocket(ENDPOINT_URL, (ws) => {
      serverWs = ws
      ws.onMessage(() => { /* no-op */ })
    })

    // Seed gear-inspector preview mode BEFORE boot so endpoint pushes render cards —
    // this is what lets the positive-control assertion below confirm the pipeline ran.
    await page.addInitScript(
      ({ previewKey, previewMode }: { previewKey: string; previewMode: string }) => {
        try { window.localStorage.setItem(previewKey, previewMode) } catch { /* ignore */ }
      },
      { previewKey: PREVIEW_MODE_STORAGE_KEY, previewMode: 'gearInspector' },
    )

    await prepareApp(page)
    // ?logWasmHeap makes the worker emit its per-pipeline WASM heap size (inert by default).
    await page.goto(`/?endpoint=${ENDPOINT_URL}&logWasmHeap=1`, APP_GOTO_OPTIONS)

    // Load lategame.sfc so safeguard rules activate (needed for the full WASM pipeline).
    const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
    await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await sfcInput.setInputFiles(PRESET_LATEGAME_SFC_PATH)
    await dismissBlockingDialogs(page)

    await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)

    for (let i = 0; i < 50 && !serverWs; i++) { await page.waitForTimeout(100) }
    if (!serverWs) throw new Error('App did not open the WebSocket endpoint connection.')

    // Settle helper: a feed push should kick the workload indicator; wait it out,
    // then one extra tick so React commits the revealed cards before we measure heap.
    const settle = async (): Promise<void> => {
      await settleWorkload(page, PLAYWRIGHT_TIMEOUTS.testXL)
      await page.waitForTimeout(150)
    }

    // Use the largest-inventory account so withholding 100 still leaves a meaningful
    // seed and the revealed items are real, distinct artifacts.
    const account = feeds.reduce((best, f) => (f.artifacts.length > best.artifacts.length ? f : best), feeds[0]!)
    const allArtifacts = account.artifacts
    expect(allArtifacts.length, 'largest account has too few artifacts to withhold 100')
      .toBeGreaterThan(WITHHELD_ARTIFACTS + 50)
    // The seed is everything EXCEPT the last WITHHELD_ARTIFACTS; those get revealed one
    // per round. revealCount grows 0→WITHHELD_ARTIFACTS so the pushed prefix length climbs.
    const seedCount = allArtifacts.length - WITHHELD_ARTIFACTS
    // Stamp a stable revision on every artifact once; a newly-revealed id is "changed"
    // purely by being absent from the previous push, so we never need to bump revisions.
    for (const a of allArtifacts) a.revision = 1

    // Build the artifact array visible after `reveal` items have been added back.
    const visibleArtifacts = (reveal: number): WireArtifact[] => allArtifacts.slice(0, seedCount + reveal)

    // Seed: the initial (withheld-trimmed) artifacts + full champions + lastUsed so the
    // equip / lastUsed merge paths are populated from the start.
    serverWs.send(artifactsNotification(visibleArtifacts(0)))
    serverWs.send(championsNotification(account.champions))
    serverWs.send(lastUsedNotification(account.lastUsed))
    await settle()

    // POSITIVE CONTROL — prove the synthesized pushes actually drive the pipeline.
    // Gear-inspector cards only render when the endpoint data was accepted, parsed, and
    // the WASM pass committed non-empty rows. Without this, a silently-rejected payload
    // would produce a flat heap and a meaningless "no leak" pass. Fail loudly if no card
    // ever appears — that means the repro is hollow, not that the app is healthy.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-gear-inspector-grid-card="true"]').length > 0,
      undefined,
      { timeout: PLAYWRIGHT_TIMEOUTS.testHeavy },
    )
    const seededCardCount = await page.locator('[data-gear-inspector-grid-card="true"]').count()
    expect(seededCardCount, 'no gear-inspector cards after seed — endpoint pipeline did not run').toBeGreaterThan(0)

    // Baselines after the seed has settled. The WASM heap (worker) is the primary leak
    // signal; the JS heap (main thread) is kept as a secondary, coarser readout.
    const baselineHeapMB = await measureHeapMB(page)
    const baselineWasmMB = await readWasmHeapMB()
    const heapSeries: number[] = [baselineHeapMB]
    const wasmSeries: number[] = [baselineWasmMB]
    console.log(`[incr-test] seeded ${seedCount} artifacts (withholding ${WITHHELD_ARTIFACTS}) / ${account.champions.length} champions — baseline jsHeap=${baselineHeapMB}MB wasmHeap=${baselineWasmMB}MB`)

    // Reveal one withheld artifact per round; every push is strictly larger than the last.
    for (let round = 1; round <= WITHHELD_ARTIFACTS; round++) {
      expect(crashed, `page crashed before round ${round}`).toBe(false)
      expect(pageErrors, `uncaught errors before round ${round} (last: ${pageErrors.at(-1) ?? 'n/a'})`).toHaveLength(0)

      // Push the growing prefix — one previously-withheld artifact is now newly present,
      // so the diff sees a brand-new id and the dataset/snapshots/WASM rows grow.
      serverWs.send(artifactsNotification(visibleArtifacts(round)))
      // Every 5th round also re-push champions (equipment churn) and lastUsed (the
      // standalone packet RSL Helper sends after each game round) so the equip-merge and
      // lastUsed-fingerprint paths run alongside the growing artifact set.
      if (round % 5 === 0) {
        serverWs.send(championsNotification(account.champions))
        serverWs.send(lastUsedNotification(account.lastUsed))
      }
      await settle()

      const heapMB = await measureHeapMB(page)
      heapSeries.push(heapMB)
      // window.__wasmHeapMB was updated by the worker hook during this round's pipeline-done
      // (?logWasmHeap). Record it as the round's worker WASM heap.
      const wasmMB = await readWasmHeapMB()
      wasmSeries.push(wasmMB)
      if (round % 10 === 0 || round <= 3) {
        const wDelta = wasmMB >= 0 && baselineWasmMB >= 0 ? wasmMB - baselineWasmMB : 'n/a'
        console.log(`[incr-test] round ${round}/${WITHHELD_ARTIFACTS} ok — ${seedCount + round} artifacts jsHeap=${heapMB}MB wasmHeap=${wasmMB}MB (wasmΔ${wDelta})`)
      }
    }

    // Final crash gate.
    expect(crashed, 'page crashed during incremental updates').toBe(false)
    expect(pageErrors, 'uncaught page errors during incremental updates').toHaveLength(0)

    // PRIMARY leak gate — rule-cache worker WASM linear memory. This is where the pipeline
    // actually allocates; a per-update leak (retaining the growing dataset's rows each
    // round) shows as steady WASM-heap growth far beyond the ~100-artifact footprint.
    // Requires ?logWasmHeap to have produced at least one reading (baseline >= 0).
    if (baselineWasmMB >= 0) {
      const peakWasmMB = Math.max(...wasmSeries.filter((v) => v >= 0))
      const wasmGrowthMB = peakWasmMB - baselineWasmMB
      console.log(`[incr-test] WASM heap baseline=${baselineWasmMB}MB peak=${peakWasmMB}MB growth=${wasmGrowthMB}MB limit=${MAX_HEAP_GROWTH_MB}MB`)
      console.log(`[incr-test] WASM heap series (MB): ${wasmSeries.join(' → ')}`)
      expect(
        wasmGrowthMB,
        `rule-cache-worker WASM heap grew ${wasmGrowthMB}MB while adding ${WITHHELD_ARTIFACTS} artifacts (limit ${MAX_HEAP_GROWTH_MB}MB)`
        + ` — that far exceeds the new data's footprint, implying each update leaks/fragments the growing dataset`,
      ).toBeLessThanOrEqual(MAX_HEAP_GROWTH_MB)
    } else {
      // If ?logWasmHeap never produced a reading the WASM gate is blind — fail rather than
      // silently pass, so a broken diagnostic can't masquerade as a clean leak result.
      throw new Error('No [rule-cache-worker] wasmHeapMB readings captured — ?logWasmHeap diagnostic did not fire; WASM leak gate is blind.')
    }

    // SECONDARY gate — main-thread JS heap (coarse; cannot see the worker WASM heap, so a
    // flat reading here is necessary-but-not-sufficient — the WASM gate above is the real one).
    if (baselineHeapMB > 0) {
      const peakMB = Math.max(...heapSeries.filter((v) => v >= 0))
      const peakGrowthMB = peakMB - baselineHeapMB
      console.log(`[incr-test] JS heap baseline=${baselineHeapMB}MB peak=${peakMB}MB growth=${peakGrowthMB}MB`)
      console.log(`[incr-test] JS heap series (MB): ${heapSeries.join(' → ')}`)
      expect(
        peakGrowthMB,
        `main-thread JS heap grew ${peakGrowthMB}MB while adding ${WITHHELD_ARTIFACTS} artifacts (limit ${MAX_HEAP_GROWTH_MB}MB)`,
      ).toBeLessThanOrEqual(MAX_HEAP_GROWTH_MB)
    }
  })
})
