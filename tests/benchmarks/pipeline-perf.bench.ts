/* eslint import/no-unused-modules: off */
/**
 * pipeline-perf.bench
 *
 * Wall-clock benchmarks for the evaluation + merge hot paths.
 * Uses the real example.sfr (recipes + safeguards) and the largest sample DB
 * so numbers reflect worst-case production workloads.
 *
 * Benchmarks:
 *   1. WASM evaluate_engine — one full N-artifact baseline scan
 *   2. WASM evaluate_engine — final scan (more rules from safeguard injection)
 *   3. collectAndComputeSafeguardProtection — safeguard detect pass
 *   4. Double computeMergedRules — original "compute twice" pattern (baseline + final)
 *   5. buildMergedRulesComponents + computeMergedRulesFromComponents × 2 — new single-flatten path
 *   6. Full pipeline simulation — components → baseline eval → detect → final eval
 *
 * Run via:  npm run bench:pipeline
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseSfrObject } from '../../src/lib/sfrIO.js'
import { defaultSubstatTargets, type SellfileExportMode } from '../../src/lib/hsfBuilder.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import {
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  computeMergedRules,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import {
  configureWasmRuleEngineWithLoadedWasm,
  evaluateWasmRuleEngineItemsWithLoadedWasm,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  resolveSafeguardRulesWithMetasets,
  collectAndComputeSafeguardProtection,
  type SafeguardsMergeInput,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
import '../setup/wasm-warmup.js'

// ── timing helpers ────────────────────────────────────────────────────────────

type BenchStats = { runs: number; mean: number; min: number; max: number; stddev: number }

function computeStats(samples: number[]): BenchStats {
  const n = samples.length
  const mean = samples.reduce((a, b) => a + b, 0) / n
  const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  return { runs: n, mean, min: Math.min(...samples), max: Math.max(...samples), stddev: Math.sqrt(variance) }
}

function timeSyncMs(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

async function timeAsyncMs(fn: () => Promise<void>): Promise<number> {
  const t0 = performance.now()
  await fn()
  return performance.now() - t0
}

const RUNS = 6

function bench(label: string, fn: () => void): BenchStats {
  // One warmup run: primes JIT, WASM compilation, and caches.
  fn()
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) samples.push(timeSyncMs(fn))
  return reportStats(label, samples)
}

async function benchAsync(label: string, fn: () => Promise<void>): Promise<BenchStats> {
  await fn()
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) samples.push(await timeAsyncMs(fn))
  return reportStats(label, samples)
}

function reportStats(label: string, samples: number[]): BenchStats {
  const s = computeStats(samples)
  console.log(
    `  ${label.padEnd(58)} mean=${s.mean.toFixed(1)}ms  min=${s.min.toFixed(1)}  max=${s.max.toFixed(1)}  σ=${s.stddev.toFixed(1)}`,
  )
  return s
}

// ── fixture loading ───────────────────────────────────────────────────────────

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Uint8Array.from(view).buffer as ArrayBuffer
}

const ROOT_DIR = process.cwd()
// example.sfr has both recipes AND safeguards — simulates a realistic full pipeline.
const SFR_PATH = resolve(ROOT_DIR, 'examples', 'example.sfr')
// Largest sample DB for worst-case timing.
const DB_PATH  = resolve(ROOT_DIR, 'examples', 'um109288203_RSLHelper.db')

console.log('\n[bench:pipeline-perf] loading fixtures…')
const sfrRaw = JSON.parse(readFileSync(SFR_PATH, 'utf8'))
const parsed = parseSfrObject(sfrRaw, { metasets: [], substatTargets: defaultSubstatTargets() })
// example.sfr has safeguards; ?? [] is a type-system defensive fallback.
const safeguardRules: SafeguardRule[] = resolveSafeguardRulesWithMetasets(parsed.safeguardRules ?? [], parsed.metasets)
const recipeModes: SellfileExportMode[] = parsed.recipes.map((cfg) => cfg.exportMode)

const dbBytes  = readFileSync(DB_PATH)
const imported = await importGearDatabaseFromArrayBuffer(toArrayBuffer(dbBytes))
const artifacts = [...imported.artifacts, ...imported.inboxArtifacts]

// GearInspectorMatchWorkerEvaluateItem shape expected by evaluateWasmRuleEngineItemsWithLoadedWasm.
const evalItems = artifacts.map((a) => ({ itemId: a.id, item: a.gearInspectorItem }))

// GearInspectorPreviewRow shape expected by collectAndComputeSafeguardProtection.
// Match/baseMatch are null — the detection path derives candidates from sold status, not match results.
const previewRows: GearInspectorPreviewRow[] = artifacts.map((a) => ({
  artifact: a,
  match: null,
  baseMatch: null,
  matchingRecipeIndices: [],
  matchingRecipeDecisions: [],
}))

console.log(`[bench:pipeline-perf] ${artifacts.length} artifacts | ${parsed.recipes.length} recipes | ${safeguardRules.length} safeguard rules`)

// ── build shared merge parameters (reused across benchmarks) ──────────────────

const mergeParams = {
  hsf: null as null,
  customRecipes: parsed.recipes,
  metasets: parsed.metasets,
  substatTargets: parsed.substatTargets,
  // exactOptionalPropertyTypes: omit key entirely when null rather than assigning undefined.
  ...(parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
}
const safeguardsNoDetect: SafeguardsMergeInput = {
  enabled: parsed.safeguardsEnabled ?? false,
  rules: safeguardRules,
  detection: null,
}

// Build baseline merged rules to prime detection and final-eval benchmarks.
const mergedRulesBaseline: HsfRuleWithRecipe[] = computeMergedRules({
  ...mergeParams,
  safeguards: safeguardsNoDetect,
})

// Run detection once to get a realistic detection snapshot for the final-rules path.
const prebuiltDetect = collectAndComputeSafeguardProtection({
  rows: previewRows,
  baseRules: mergedRulesBaseline,
  recipeModes,
  rules: safeguardRules,
  enabled: parsed.safeguardsEnabled ?? false,
  now: Date.now(),
})
const safeguardsWithDetect: SafeguardsMergeInput = {
  ...safeguardsNoDetect,
  detection: prebuiltDetect.detection,
}

const mergedRulesFinal: HsfRuleWithRecipe[] = computeMergedRules({
  ...mergeParams,
  safeguards: safeguardsWithDetect,
})

console.log(`[bench:pipeline-perf] ${mergedRulesBaseline.length} baseline rules | ${mergedRulesFinal.length} final rules`)
console.log()

// ── benchmark 1: evaluate_engine — baseline ───────────────────────────────────

console.log('── 1. WASM evaluate_engine — baseline scan ──────────────────────────────────')
console.log(`     ${artifacts.length} artifacts × ${mergedRulesBaseline.length} rules`)

// Configure once before the timed loop so we measure only the evaluation scan.
configureWasmRuleEngineWithLoadedWasm({ rules: mergedRulesBaseline, recipeModes: Array.from(recipeModes) })

const b1 = bench(`evaluate_engine baseline (${artifacts.length} items)`, () => {
  evaluateWasmRuleEngineItemsWithLoadedWasm({ items: evalItems, options: {} })
})

// ── benchmark 2: evaluate_engine — final (safeguard rules injected) ───────────

console.log()
console.log('── 2. WASM evaluate_engine — final scan (safeguard rules injected) ─────────')
console.log(`     ${artifacts.length} artifacts × ${mergedRulesFinal.length} rules`)

configureWasmRuleEngineWithLoadedWasm({ rules: mergedRulesFinal, recipeModes: Array.from(recipeModes) })

const b2 = bench(`evaluate_engine final (${artifacts.length} items)`, () => {
  evaluateWasmRuleEngineItemsWithLoadedWasm({ items: evalItems, options: {} })
})

// ── benchmark 3: safeguard collect + detection ────────────────────────────────

console.log()
console.log('── 3. collectAndComputeSafeguardProtection ───────────────────────────────────')
console.log(`     ${artifacts.length} rows, ${safeguardRules.length} safeguard rules`)

const b3 = bench(`collectAndComputeSafeguardProtection (${artifacts.length} rows)`, () => {
  collectAndComputeSafeguardProtection({
    rows: previewRows,
    baseRules: mergedRulesBaseline,
    recipeModes,
    rules: safeguardRules,
    enabled: parsed.safeguardsEnabled ?? false,
    now: Date.now(),
  })
})

// ── benchmark 4: double computeMergedRules (original pattern) ─────────────────
// Original worker called computeMergedRules twice — each call runs flattenRuleBatches.

console.log()
console.log('── 4. double computeMergedRules — original worker pattern ───────────────────')
console.log('     two full calls each including the WASM flattenRuleBatches step')

const b4 = bench('computeMergedRules × 2 (baseline + final)', () => {
  computeMergedRules({ ...mergeParams, safeguards: safeguardsNoDetect })
  computeMergedRules({ ...mergeParams, safeguards: safeguardsWithDetect })
})

// ── benchmark 5: buildMergedRulesComponents + fromComponents × 2 (new) ────────
// New pattern: flattenRuleBatches runs exactly once; detection applied twice from shared components.

console.log()
console.log('── 5. buildMergedRulesComponents + fromComponents × 2 — new pattern ─────────')
console.log('     flatten once, apply safeguard detection twice from shared components')

const b5 = bench('buildMergedRulesComponents + fromComponents × 2', () => {
  const components = buildMergedRulesComponents(mergeParams)
  const fsrArg = parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}
  computeMergedRulesFromComponents(components, { ...fsrArg, safeguards: safeguardsNoDetect })
  computeMergedRulesFromComponents(components, { ...fsrArg, safeguards: safeguardsWithDetect })
})

// ── benchmark 6: full pipeline simulation (end-to-end) ────────────────────────
// Simulates the complete worker pipeline with the new optimized path:
//   buildMergedRulesComponents → baseline eval → safeguard detect → final eval

console.log()
console.log('── 6. Full pipeline simulation — end-to-end ─────────────────────────────────')
console.log('     components → configure + baseline eval → detect → configure + final eval')

const b6 = await benchAsync('full pipeline (components + 2×eval + detect)', async () => {
  // Build shared components once (flattenRuleBatches runs once here).
  const components = buildMergedRulesComponents(mergeParams)
  const fsrArg = parsed.finalSellRemainder !== null ? { finalSellRemainder: parsed.finalSellRemainder } : {}

  // Baseline merged rules + eval.
  const baseline = computeMergedRulesFromComponents(components, { ...fsrArg, safeguards: safeguardsNoDetect })
  configureWasmRuleEngineWithLoadedWasm({ rules: baseline, recipeModes: Array.from(recipeModes) })
  evaluateWasmRuleEngineItemsWithLoadedWasm({ items: evalItems, options: {} })

  // Safeguard detection — uses evaluate_item internally (EvaluateItemScratch optimization).
  const { detection } = collectAndComputeSafeguardProtection({
    rows: previewRows,
    baseRules: baseline,
    recipeModes,
    rules: safeguardRules,
    enabled: parsed.safeguardsEnabled ?? false,
    now: Date.now(),
  })

  // Final merged rules + eval.
  const final = computeMergedRulesFromComponents(components, { ...fsrArg, safeguards: { ...safeguardsNoDetect, detection } })
  configureWasmRuleEngineWithLoadedWasm({ rules: final, recipeModes: Array.from(recipeModes) })
  evaluateWasmRuleEngineItemsWithLoadedWasm({ items: evalItems, options: {} })
})

// ── summary ───────────────────────────────────────────────────────────────────

const mergeSpeedup  = (b4.mean / b5.mean).toFixed(2)
const evalThruBase  = (artifacts.length / (b1.mean / 1000)).toFixed(0)
const evalThruFinal = (artifacts.length / (b2.mean / 1000)).toFixed(0)
console.log()
console.log('── Summary ──────────────────────────────────────────────────────────────────')
console.log(`  evaluate_engine baseline:     ${b1.mean.toFixed(1)}ms/run  (${evalThruBase} artifacts/s)`)
console.log(`  evaluate_engine final:        ${b2.mean.toFixed(1)}ms/run  (${evalThruFinal} artifacts/s)`)
console.log(`  safeguard collect+detect:     ${b3.mean.toFixed(1)}ms/run`)
console.log(`  double computeMergedRules:    ${b4.mean.toFixed(1)}ms/run  (original)`)
console.log(`  components + fromComp × 2:    ${b5.mean.toFixed(1)}ms/run  (${mergeSpeedup}× vs double)`)
console.log(`  FULL PIPELINE:                ${b6.mean.toFixed(1)}ms/run`)
console.log()
