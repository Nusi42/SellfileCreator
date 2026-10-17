/* eslint import/no-unused-modules: off */
/**
 * repro-incremental-growth
 *
 * Node leak-localizer / regression guard for the incremental-update WASM leak
 * (project_incremental_update_wasm_leak): the rule-cache worker's WASM linear memory used to
 * grow per added artifact across a growing endpoint inventory and crash after dozens of
 * updates. Fixed by caching the invariant merge inputs WASM-side. This harness samples
 * getWasmLinearMemoryBytes() after every pipeline phase, every round, over a GROWING artifact
 * set, so the WASM heap should now stay flat (a regression would show as per-round growth and
 * pinpoint the offending phase). The browser counterpart is endpoint-incremental-updates.spec.ts.
 *
 * Mirrors the rule-cache worker's per-push pipeline (ruleCacheWorker.ts onmessage), gated the
 * same way: configure(baseline, only when rules change) → storeArtifactRows → improvementChance
 * → evaluateAndCollect → clearStoredRows → mergedRulesFinal (cached).
 *
 * Run: npm run repro:incremental-growth
 *   REPRO_WITHHELD=N   number of artifacts withheld then revealed one/round (default 60)
 *   REPRO_PREWARM=1    re-enable the per-pipeline prewarms (removed from production) to
 *                      compare heap behaviour with/without them
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets, type SellfileExportMode } from '../../src/lib/hsfBuilder.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import {
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import {
  configureWasmRuleEngineWithLoadedWasm,
  storeArtifactRowsWithLoadedWasm,
  clearStoredRowsWithLoadedWasm,
  preWarmHeapWithLoadedWasm,
  evaluateAndCollectSafeguardProtectionWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  getWasmLinearMemoryBytes,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  resolveSafeguardRulesWithMetasets,
  toWasmArtifactStoreRow,
  type SafeguardRule,
  type SafeguardsMergeInput,
} from '../../src/lib/safeguards.js'
import { GEAR_DB_FIXTURES, ensureGearDb } from '../../scripts/test/gear-db-fixtures.mjs'
import '../setup/wasm-warmup.js'

const ROOT_DIR = process.cwd()
const SFC_PATH = resolve(ROOT_DIR, 'presets', 'lategame.sfc')
// Largest account DB, built from its committed SQL dump.
const DB_PATH = ensureGearDb(GEAR_DB_FIXTURES.accountD)
const PAGE_16MIB = 16 * 1024 * 1024
// Withhold this many artifacts from the seed, then reveal one per round (growing inventory).
const WITHHELD = Number(process.env.REPRO_WITHHELD ?? '60')

const mb = (): number => Math.round(getWasmLinearMemoryBytes() / 1024 / 1024)

console.log('\n[repro:incremental-growth] loading fixtures…')
const parsed = parseSfcObject(JSON.parse(readFileSync(SFC_PATH, 'utf8')), { metasets: [], substatTargets: defaultSubstatTargets() })
const safeguardRules: SafeguardRule[] = resolveSafeguardRulesWithMetasets(parsed.safeguardRules ?? [], parsed.metasets)
const recipeModes: SellfileExportMode[] = parsed.recipes.map((cfg) => cfg.exportMode)

const dbBytes = readFileSync(DB_PATH)
const view = new Uint8Array(dbBytes.buffer, dbBytes.byteOffset, dbBytes.byteLength)
const imported = await importGearDatabaseFromArrayBuffer(Uint8Array.from(view).buffer as ArrayBuffer)
const allArtifacts = [...imported.artifacts, ...imported.inboxArtifacts]
const seedCount = allArtifacts.length - WITHHELD

const mergeParams = {
  hsf: null as null,
  customRecipes: parsed.recipes,
  metasets: parsed.metasets,
  substatTargets: parsed.substatTargets,
  ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
}
const hasThreshold = safeguardRules.some((r) => r.improvementChanceThreshold !== null && r.improvementChanceThreshold !== undefined)

console.log(`[repro:incremental-growth] ${allArtifacts.length} artifacts | seed=${seedCount} | reveal ${WITHHELD} rounds | safeguards=${parsed.safeguardsEnabled ?? false}`)

// One full pipeline pass over the first `count` artifacts. Logs WASM MB after each phase.
function runPipeline(round: number, count: number): void {
  const entries = allArtifacts.slice(0, count).map((a) => [a.id, a] as [number, typeof a])
  const phase: Record<string, number> = {}

  const sharedComponents = buildMergedRulesComponents({
    hsf: mergeParams.hsf, customRecipes: mergeParams.customRecipes,
    metasets: mergeParams.metasets, substatTargets: mergeParams.substatTargets,
  })
  const baseSafeguards: SafeguardsMergeInput = { enabled: parsed.safeguardsEnabled ?? false, rules: safeguardRules, detection: null }
  const mergedBaseline: HsfRuleWithRecipe[] = computeMergedRulesFromComponents(sharedComponents, {
    ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
    safeguards: baseSafeguards, omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false,
    // Same fixed key as the final merge below — both reuse the cached generated rules
    // (the worker passes its rulesCacheKey to both baseline and final merges too).
    rulesCacheKey: 'repro-fixed-rules',
  })
  phase.merge = mb()

  // Mirror the worker's gated configure: rules + recipeModes are fixed across the repro's
  // reveal rounds, so configure only on round 0 (the worker gates on its rulesCacheKey +
  // recipeModes). The engine preserves BucketedRules across pushes, so later rounds reuse them.
  if (round === 0) {
    configureWasmRuleEngineWithLoadedWasm({ rules: mergedBaseline, recipeModes: Array.from(recipeModes) })
  }
  phase.configure = mb()

  storeArtifactRowsWithLoadedWasm({ rows: entries.map(([, a]) => toWasmArtifactStoreRow(a)) })
  phase.store = mb()

  // Production no longer prewarms the heap per pipeline (removed with the leak fix), so the
  // default here matches that. REPRO_PREWARM=1 re-enables both prewarms to compare heap
  // behaviour with/without them (Linux can't exercise the V8/Windows memory.grow rejection
  // they once guarded, so any difference here is necessary-but-not-sufficient evidence).
  const prewarm = process.env.REPRO_PREWARM === '1'
  const prewarmBytes = Math.ceil((entries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
  if (prewarm) preWarmHeapWithLoadedWasm(prewarmBytes)
  phase.prewarm1 = mb()

  const improvementChances = hasThreshold
    ? (computeImprovementChanceWithLoadedWasm({ rules: safeguardRules, enabled: parsed.safeguardsEnabled ?? false })?.entries ?? [])
    : []
  phase.imprChance = mb()

  if (prewarm) preWarmHeapWithLoadedWasm(prewarmBytes)
  const detection = evaluateAndCollectSafeguardProtectionWithLoadedWasm({
    safeguardRules, improvementChances, enabled: parsed.safeguardsEnabled ?? false, now: 0,
  })
  phase.evalCollect = mb()

  clearStoredRowsWithLoadedWasm()
  phase.clearRows = mb()

  // Measure the growing term directly: detection snapshot entry/artifact counts and the
  // serialized snapshot byte size that gets embedded in the merge payload.
  const snap = detection.detection
  const snapEntries = snap?.entries?.length ?? 0
  const snapArtifacts = snap?.entries?.reduce((s, e) => s + ((e as { artifacts?: unknown[] }).artifacts?.length ?? 0), 0) ?? 0
  const snapBytes = snap ? JSON.stringify(snap).length : 0
  // Decompose the merge payload by term so we know what the ~17 MiB is MADE OF and how
  // each piece scales (rules ≈ constant with inventory; snapshot ≈ scales with matches).
  const MiB = (n: number): string => (n / 1024 / 1024).toFixed(2)
  const baselineRulesBytes = JSON.stringify(mergedBaseline).length
  const safeguardRulesBytes = JSON.stringify(safeguardRules).length

  // Final merge through the shared entry — a stable rulesCacheKey makes round ≥1 hit the
  // WASM rule-cache fast-path (only the detection snapshot crosses the boundary).
  const mergeArgs = {
    ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
    safeguards: { ...baseSafeguards, detection: detection.detection },
    omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false,
  }
  const mergedFinal = computeMergedRulesFromComponents(sharedComponents, { ...mergeArgs, rulesCacheKey: 'repro-fixed-rules' })
  phase.mergeFinal = mb()

  if (round === 0 || round % 10 === 0 || phase.mergeFinal > phase.clearRows) {
    const totalPayload = baselineRulesBytes + safeguardRulesBytes + snapBytes
    console.log(
      `[r${round}] PAYLOAD≈${MiB(totalPayload)}MiB = rules ${MiB(baselineRulesBytes)} + safeguardRules ${MiB(safeguardRulesBytes)} + snapshot ${MiB(snapBytes)}`
      + ` | snapEntries=${snapEntries} snapArtifactRefs=${snapArtifacts} | mergedFinalRules=${mergedFinal.length} | mF jump=${phase.mergeFinal - phase.clearRows}MB`,
    )
  }

  // NOTE: the real rule-cache worker does NOT configure the FINAL merged rules — it only
  // configures the BASELINE rules (for eval-collect). The earlier configureFinal here was a
  // repro artifact that re-sent ~17 MiB to configure_engine every round, mismodeling the
  // worker and creating its own churn. Dropped so the repro matches the worker pipeline.
  phase.configureFinal = phase.mergeFinal

  console.log(
    `[r${round}] n=${count} wasmMB=${phase.configureFinal}`
    + ` | merge=${phase.merge} cfg=${phase.configure} store=${phase.store} pw1=${phase.prewarm1}`
    + ` impr=${phase.imprChance} eval=${phase.evalCollect} clr=${phase.clearRows} mF=${phase.mergeFinal} cfgF=${phase.configureFinal}`,
  )
}

// Seed, then reveal one artifact per round; watch which phase's WASM bytes climb.
runPipeline(0, seedCount)
const baseMB = mb()
for (let round = 1; round <= WITHHELD; round++) {
  runPipeline(round, seedCount + round)
}
const endMB = mb()
console.log(`\n[repro:incremental-growth] WASM heap: baseline=${baseMB}MB end=${endMB}MB growth=${endMB - baseMB}MB over ${WITHHELD} added artifacts`)
console.log(`[repro:incremental-growth] per-artifact growth ≈ ${((endMB - baseMB) / WITHHELD).toFixed(2)} MB/artifact`)
