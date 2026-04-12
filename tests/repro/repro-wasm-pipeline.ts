/* eslint import/no-unused-modules: off */
/**
 * repro-wasm-pipeline
 *
 * Headless Node harness that replays the rule-cache-worker pipeline against
 * the largest sample fixtures (examples/example.sfc + um109288203_RSLHelper.db).
 * Goal: deterministically reproduce the `memory access out of bounds` crash
 * that shows up in-browser during the final compute_merged_rules_value call,
 * so we can iterate on fixes without browser reloads.
 *
 * Every call is made through the same TypeScript wrappers the worker uses,
 * which in turn call the exact wasm-bindgen exports we're trying to stress.
 *
 * Run via:  npm run repro:wasm-pipeline
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
  evaluateWasmRuleEngineItemsWithLoadedWasm,
  storeArtifactRowsWithLoadedWasm,
  clearStoredRowsWithLoadedWasm,
  preWarmHeapWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  evaluateAndCollectSafeguardProtectionWithLoadedWasm,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  heap_integrity_check as heapIntegrityCheckWasm,
} from '../../src/lib/wasm/generated/rule_engine.js'
import {
  resolveSafeguardRulesWithMetasets,
  toWasmArtifactStoreRow,
  type SafeguardRule,
  type SafeguardsMergeInput,
} from '../../src/lib/safeguards.js'
import '../setup/wasm-warmup.js'

// Heap integrity trip-wire.  Exercises the allocator by doing a fresh
// alloc→fill→verify→drop 4 KiB cycle.  If the allocator's free list is corrupt,
// the WASM call traps (RuntimeError: OOB) — catching that trap tells us which
// preceding call left the heap in a bad state.
function assertHeapIntegrity(afterLabel: string): void {
  try {
    const result = heapIntegrityCheckWasm()
    if (result !== 0) {
      throw new Error(`heap_integrity_check returned ${result} (expected 0) after ${afterLabel}`)
    }
  } catch (err) {
    console.error(`[HEAP CORRUPT] heap_integrity_check CRASHED after ${afterLabel}:`)
    console.error(err)
    throw err
  }
}

// ── fixture loading ───────────────────────────────────────────────────────────

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Uint8Array.from(view).buffer as ArrayBuffer
}

const ROOT_DIR = process.cwd()
// example.sfc has 192 recipes + 66 safeguards + 12 metasets — same shape as the
// user's broken autosave that produces the talc OOB crash in browser.
const SFC_PATH = resolve(ROOT_DIR, 'examples', 'example.sfc')
// Largest sample DB — ~8000 artifacts, matching the user's gear inspector state.
const DB_PATH  = resolve(ROOT_DIR, 'examples', 'um109288203_RSLHelper.db')

console.log('\n[repro:wasm-pipeline] loading fixtures…')
const sfcRaw = JSON.parse(readFileSync(SFC_PATH, 'utf8'))
const parsed = parseSfcObject(sfcRaw, { metasets: [], substatTargets: defaultSubstatTargets() })
// resolveSafeguardRulesWithMetasets produces the canonical SafeguardRule[] the
// pipeline feeds into detection; metasets must match the parsed ones.
const safeguardRules: SafeguardRule[] = resolveSafeguardRulesWithMetasets(parsed.safeguardRules ?? [], parsed.metasets)
const recipeModes: SellfileExportMode[] = parsed.recipes.map((cfg) => cfg.exportMode)

const dbBytes  = readFileSync(DB_PATH)
const imported = await importGearDatabaseFromArrayBuffer(toArrayBuffer(dbBytes))
const artifacts = [...imported.artifacts, ...imported.inboxArtifacts]
const artifactEntries = artifacts.map((a) => [a.id, a] as [number, typeof a])

console.log(
  `[repro:wasm-pipeline] ${artifacts.length} artifacts`
  + ` | ${parsed.recipes.length} recipes`
  + ` | ${safeguardRules.length} safeguard rules`
  + ` | safeguardsEnabled=${parsed.safeguardsEnabled ?? false}`,
)

// Merge parameters reused across every pipeline iteration — the worker builds
// these on every launchPipeline call, but the shape is stable so we build once
// and reuse like the worker does via the MergedRulesComponents cache.
const mergeParams = {
  hsf: null as null,
  customRecipes: parsed.recipes,
  metasets: parsed.metasets,
  substatTargets: parsed.substatTargets,
  ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
}
const safeguardsNoDetect: SafeguardsMergeInput = {
  enabled: parsed.safeguardsEnabled ?? false,
  rules: safeguardRules,
  detection: null,
}

// ── pipeline replay ───────────────────────────────────────────────────────────
// Mirrors the worker's onmessage flow in src/workers/ruleCacheWorker.ts:
//   1. buildMergedRulesComponents + computeMergedRulesFromComponents (baseline)
//   2. configureWasmRuleEngineWithLoadedWasm (baseline rules)
//   3. storeArtifactRowsWithLoadedWasm
//   4. preWarmHeapWithLoadedWasm
//   5. computeImprovementChanceWithLoadedWasm (when any safeguard has a threshold)
//   6. preWarmHeapWithLoadedWasm (again, for eval-collect)
//   7. evaluateAndCollectSafeguardProtectionWithLoadedWasm  (progress reaches 50%)
//   8. clearStoredRowsWithLoadedWasm
//   9. computeMergedRulesFromComponents (final — with detection populated)
//  10. configureWasmRuleEngineWithLoadedWasm (final rules)
//  11. evaluateWasmRuleEngineItemsWithLoadedWasm (batches of 256 for each artifact)

const PAGE_16MIB = 16 * 1024 * 1024

async function runPipelineOnce(iteration: number): Promise<void> {
  const t0 = performance.now()
  const tag = `[iter ${iteration}]`

  // REPRO_MODE=prewarm-only calls preWarmHeapWithLoadedWasm in isolation.
  // Tests whether prewarm alone corrupts talc's state across iterations.
  if (REPRO_MODE === 'prewarm-only') {
    const bytes = Math.ceil((artifactEntries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
    preWarmHeapWithLoadedWasm(bytes)
    console.log(`${tag} prewarm-only ${bytes} bytes | elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // REPRO_MODE=merge+prewarm-small calls buildMergedRulesComponents followed by
  // a TINY prewarm (64 KiB — one page).  This should NOT trigger WasmBulkGrow's
  // memory.grow path because any existing free block can satisfy it, so if the
  // crash disappears here vs `merge+prewarm`, the culprit is WasmBulkGrow.
  if (REPRO_MODE === 'merge+prewarm-small') {
    const sharedComponentsMPS = buildMergedRulesComponents({
      hsf: mergeParams.hsf,
      customRecipes: mergeParams.customRecipes,
      metasets: mergeParams.metasets,
      substatTargets: mergeParams.substatTargets,
    })
    const mergedMPS = computeMergedRulesFromComponents(sharedComponentsMPS, {
      ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
      safeguards: safeguardsNoDetect,
      omitDisabledBeforeSafeguards: false,
      dedupeBeforeSafeguards: false,
    })
    preWarmHeapWithLoadedWasm(65_536)  // tiny 64 KiB — fits in existing free blocks
    console.log(
      `${tag} merge+prewarm-small: ${mergedMPS.length} rules | 64 KiB`
      + ` | elapsed: ${(performance.now() - t0).toFixed(0)}ms`,
    )
    return
  }

  // REPRO_MODE=merge+prewarm calls buildMergedRulesComponents +
  // computeMergedRulesFromComponents followed by preWarmHeapWithLoadedWasm.
  // Tests whether the merge phase + prewarm combination corrupts talc's state.
  if (REPRO_MODE === 'merge+prewarm') {
    const sharedComponentsMP = buildMergedRulesComponents({
      hsf: mergeParams.hsf,
      customRecipes: mergeParams.customRecipes,
      metasets: mergeParams.metasets,
      substatTargets: mergeParams.substatTargets,
    })
    const mergedMP = computeMergedRulesFromComponents(sharedComponentsMP, {
      ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
      safeguards: safeguardsNoDetect,
      omitDisabledBeforeSafeguards: false,
      dedupeBeforeSafeguards: false,
    })
    const bytes = Math.ceil((artifactEntries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
    preWarmHeapWithLoadedWasm(bytes)
    console.log(
      `${tag} merge+prewarm: ${mergedMP.length} rules | ${bytes} bytes`
      + ` | elapsed: ${(performance.now() - t0).toFixed(0)}ms`,
    )
    return
  }

  // Phase 1: build baseline merged rules.
  const sharedComponents = buildMergedRulesComponents({
    hsf: mergeParams.hsf,
    customRecipes: mergeParams.customRecipes,
    metasets: mergeParams.metasets,
    substatTargets: mergeParams.substatTargets,
  })
  const mergedRulesBaseline: HsfRuleWithRecipe[] = computeMergedRulesFromComponents(sharedComponents, {
    ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
    safeguards: safeguardsNoDetect,
    omitDisabledBeforeSafeguards: false,
    dedupeBeforeSafeguards: false,
  })
  console.log(`${tag} baseline merged rules: ${mergedRulesBaseline.length}`)
  assertHeapIntegrity(`${tag} buildMergedRulesComponents+computeMergedRulesFromComponents`)

  // REPRO_MODE=merge-only stops after the merge phase.
  if (REPRO_MODE === 'merge-only') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 2: configure baseline rules.
  configureWasmRuleEngineWithLoadedWasm({
    rules: mergedRulesBaseline,
    recipeModes: Array.from(recipeModes),
  })
  assertHeapIntegrity(`${tag} configureWasmRuleEngine(baseline)`)

  if (REPRO_MODE === 'through-configure') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 3: store artifact rows.
  const storeRows = artifactEntries.map(([, artifact]) => toWasmArtifactStoreRow(artifact))
  storeArtifactRowsWithLoadedWasm({ rows: storeRows })
  assertHeapIntegrity(`${tag} storeArtifactRows`)

  if (REPRO_MODE === 'through-store') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 4: prewarm for improvement-chance computation.
  const improvChancePrewarmBytes =
    Math.ceil((artifactEntries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
  preWarmHeapWithLoadedWasm(improvChancePrewarmBytes)
  assertHeapIntegrity(`${tag} preWarmHeap(improvChance)`)

  if (REPRO_MODE === 'through-prewarm1') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 5: improvement-chance pass (requires stored rows).
  const hasThreshold = safeguardRules.some(
    (r) => r.improvementChanceThreshold !== null && r.improvementChanceThreshold !== undefined,
  )
  const improvementChances = hasThreshold
    ? (computeImprovementChanceWithLoadedWasm({
        rules: safeguardRules,
        enabled: parsed.safeguardsEnabled ?? false,
      })?.entries ?? [])
    : []
  console.log(`${tag} improvement-chance entries: ${improvementChances.length}`)
  assertHeapIntegrity(`${tag} computeImprovementChance`)

  if (REPRO_MODE === 'through-impr-chance') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 6: prewarm for eval-collect.
  const evalCollectPrewarmBytes =
    Math.ceil((artifactEntries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
  if (evalCollectPrewarmBytes > 0) preWarmHeapWithLoadedWasm(evalCollectPrewarmBytes)
  assertHeapIntegrity(`${tag} preWarmHeap(evalCollect)`)

  // Phase 7: evaluate + collect safeguard protection (reaches 50% progress in UI).
  const detectionResult = evaluateAndCollectSafeguardProtectionWithLoadedWasm({
    safeguardRules,
    improvementChances,
    enabled: parsed.safeguardsEnabled ?? false,
    now: Date.now(),
  })
  console.log(
    `${tag} detection entries: ${detectionResult.detection.entries.length}`
    + ` | candidates: ${detectionResult.candidates.length}`,
  )
  assertHeapIntegrity(`${tag} evaluateAndCollectSafeguardProtection`)

  if (REPRO_MODE === 'through-eval-collect') {
    console.log(`${tag} elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
    return
  }

  // Phase 8: clear stored rows — frees ~16–20 MiB before the final merge.
  clearStoredRowsWithLoadedWasm()
  assertHeapIntegrity(`${tag} clearStoredRows`)

  // Phase 9: final merged rules with detection populated.
  const safeguardsWithDetect: SafeguardsMergeInput = {
    ...safeguardsNoDetect,
    detection: detectionResult.detection,
  }
  const mergedRulesFinal: HsfRuleWithRecipe[] = computeMergedRulesFromComponents(sharedComponents, {
    ...(mergeParams.finalSellRemainder !== undefined ? { finalSellRemainder: mergeParams.finalSellRemainder } : {}),
    safeguards: safeguardsWithDetect,
    omitDisabledBeforeSafeguards: false,
    dedupeBeforeSafeguards: false,
  })
  console.log(`${tag} final merged rules: ${mergedRulesFinal.length}`)
  assertHeapIntegrity(`${tag} computeMergedRules(final)`)

  // Phase 10: configure final rules for the match pass.
  configureWasmRuleEngineWithLoadedWasm({
    rules: mergedRulesFinal,
    recipeModes: Array.from(recipeModes),
  })
  assertHeapIntegrity(`${tag} configureWasmRuleEngine(final)`)

  // Phase 11: evaluate items in batches of 256 — same chunking as the worker.
  const BATCH_SIZE = 256
  const evalItems = artifacts.map((a) => ({ itemId: a.id, item: a.gearInspectorItem }))
  let matched = 0
  for (let start = 0; start < evalItems.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, evalItems.length)
    const results = evaluateWasmRuleEngineItemsWithLoadedWasm({
      items: evalItems.slice(start, end),
      options: {},
    })
    matched += results.length
  }
  assertHeapIntegrity(`${tag} evaluateWasmRuleEngineItems(all batches)`)
  console.log(`${tag} evaluated ${matched} items | elapsed: ${(performance.now() - t0).toFixed(0)}ms`)
}

// Run the pipeline several times to simulate repeated "user changed a recipe"
// runs.  The browser crash shows up specifically after the first successful
// run, so a single iteration is not enough to reproduce it reliably.
const ITERATIONS = Number(process.env.REPRO_ITERATIONS ?? 4)
// REPRO_MODE=merge-only calls only buildMergedRulesComponents +
// computeMergedRulesFromComponents in a loop; this is the minimum scenario
// that still reproduces the iter-2 crash and makes bisecting the cause fast.
const REPRO_MODE = process.env.REPRO_MODE ?? 'full'

console.log(`\n[repro:wasm-pipeline] running ${ITERATIONS} pipeline iterations…\n`)

let crashed = false
for (let i = 1; i <= ITERATIONS; i += 1) {
  try {
    await runPipelineOnce(i)
    console.log(`[repro:wasm-pipeline] iter ${i} OK\n`)
  } catch (err) {
    crashed = true
    console.error(`[repro:wasm-pipeline] iter ${i} CRASHED:`)
    console.error(err)
    if (err instanceof Error && err.stack) {
      console.error('\nStack:')
      console.error(err.stack)
    }
    break
  }
}

if (crashed) {
  console.error('\n[repro:wasm-pipeline] FAILED — crash reproduced above')
  process.exit(1)
}

console.log('\n[repro:wasm-pipeline] SUCCESS — all iterations completed cleanly')
process.exit(0)
