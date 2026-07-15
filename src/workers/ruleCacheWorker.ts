/// <reference lib="webworker" />

import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  configureMergedRulesFromComponents,
  type MergedRulesComponents,
} from '../lib/merge'
import { recipesForRuleBuild, recipeNamesForExport } from '../lib/ruleCacheHelpers'
import { composeRuleCacheKey } from './ruleCacheKey'
import { computeExportedHsfFingerprint } from '../lib/hsfIO'
import {
  artifactContentFoldKey,
  buildIgnoreSafeguardRecipeIndices,
  createArtifactContentFold,
  evaluateAndCollectSafeguardProtection,
  foldArtifactWasmProjection,
  hasActiveSafeguardRules,
  safeguardRulesContentFingerprint,
  safeguardRulesHaveImprovementThreshold,
  scoreSafeguardCandidates,
  storeArtifactRows,
  toWasmArtifactStoreRow,
} from '../lib/safeguards'
import type { SafeguardDetectionSnapshot } from '../lib/safeguards'
import type { StatVariant } from '../lib/types'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { GearInspectorMatchWorkerItemResult } from './gearInspectorMatchWorkerTypes'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveArtifactItemIdWithFallback } from '../lib/itemIdentity'
import {
  clearStoredRowsWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmLinearMemoryBytes,
  getWasmRuleEngineVersion,
  initWasmRuleEngineFromModule,
  resetWasmInstance,
} from '../lib/wasm/wasmRuleEngine'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
import {
  log_talc_counters as logTalcCounters,
} from '../lib/wasm/generated/rule_engine.js'
import { createProgressThrottler } from '../types/progress'

declare const self: DedicatedWorkerGlobalScope

type PipelineState = {
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
  recipesForRules: BuilderRecipe[]
}

// Pipeline generation increments on the app side; worker drops stale runs.
let latestPipelineGeneration = 0
// Log the loaded WASM version once per worker for transcript parity.
let wasmVersionLogged = false
// Resolved by the 'init-wasm' message handler when the main thread transfers the
// compiled WebAssembly.Module. All pipeline messages await this before calling any WASM.
let wasmReadyResolve: (() => void) | null = null
const wasmReadyPromise: Promise<void> = new Promise<void>((resolve) => { wasmReadyResolve = resolve })
// Persistent rule cache: fingerprint → built rules. Reused across pipeline runs
// so unchanged recipes skip the WASM buildRulesForRecipe call entirely.
const persistentRuleCache = new Map<string, RecipeRulesCacheEntry>()

// Fingerprint of the artifact set most recently stored in WASM ENGINE_STATE.
// Compared before each storeArtifactRows call; if unchanged, the call (and the
// JS→WASM serialization + Vec alloc on the Rust side) is skipped entirely.
// Derives from the shared WASM-projection fold (foldArtifactWasmProjection, safeguards.ts)
// so EVERY field the engine can read is covered — an earlier hand-picked "mutable fields
// only" hash here missed substat-variant swaps that preserve Σ totalValue (possible via
// custom-gear edits) and would have skipped the re-store, running detection on stale rows.
let lastArtifactStoreFingerprint: string | null = null

// Signature of a merged-final rules output. SSOT for BOTH the send-skip decision
// (rulesByRecipeEntries/mergedRules/keys sent as null when unchanged, skipping the
// structured-clone of ~50–100 MiB on artifact-only bursts) and the export-fingerprint
// memo below, so the two guards can never diverge on what "unchanged" means.
type MergedOutputSignature = {
  // Per-recipe rule fingerprints, compared element-wise (net for composite-hash collisions).
  keys: string[]
  // Composite of: substatTargetsKey, totalLimitHit, truncatedRecipeIndices identity hash,
  // merge flags (omitDisabled, dedupe, safeguards.enabled), safeguard rule content hash
  // (requiredCount, activation, countMode, ignore flags, substats, weights, improvChance),
  // and finalSellRemainder content.
  recipeKey: string
  // Fingerprint of the safeguard detection entries that drove mergedRulesFinal.
  // scannedAt is excluded (changes every run but does not affect merged rules).
  // Covers which entries were detected, their placeholder contents, and itemKeys identity.
  detectionKey: string
  // Safety net: a merged rule count change guarantees content changed regardless of
  // fingerprint matches, catching any gap not covered by the three keys above.
  mergedCount: number
}
// Cheapest-first comparison: count, then the two composite strings, then element-wise keys.
const mergedOutputSignatureEquals = (a: MergedOutputSignature | null, b: MergedOutputSignature): boolean =>
  a !== null
  && a.mergedCount === b.mergedCount
  && a.recipeKey === b.recipeKey
  && a.detectionKey === b.detectionKey
  && keysEqual(a.keys, b.keys)

// Signature of the most recently SENT full rule payload (null until the first send).
let lastSentSignature: MergedOutputSignature | null = null

// detectionKey of the most recently SENT non-null detection snapshot (null after a null
// send / before the first send). Drives the safeguardDetectionUnchanged elision: during a
// farm session the detection content is typically identical across dozens of pipelines
// while only the artifact list grows, so re-cloning the snapshot (placeholder lists of
// 200k+ objects on large accounts) every run was the single largest per-pipeline clone.
let lastSentDetectionKey: string | null = null
// Improvement-chance memo key of the most recently SENT entries (null after a null send).
// Same elision idea: the compute itself is already memoized (lastImprovementChance), but
// the entries were still re-cloned to the main thread on every pipeline.
let lastSentImprovementKey: string | null = null

// Memo for computeExportedHsfFingerprint: the export crc clones + stringifies the whole
// export (~150 ms at 33k rules) yet its only inputs are the merged output signature and the
// export recipe names — both unchanged on artifact-only bursts. Reuse the crc when they match.
let lastExportHash: { signature: MergedOutputSignature; namesKey: string; hash: string } | null = null

// Memo for the WASM improvement-chance pass: safeguard rule content (whose fingerprint
// folds the enabled flag) + artifact content fully determine the entries, so a recipe-only
// edit (same safeguards, same artifacts) reuses the previous result instead of re-running
// the ~300 ms WASM pass.
let lastImprovementChance: { key: string; entries: ImprovementChanceWasmEntry[] } | null = null

// Sentinel for the baseline rules currently configured into the WASM matcher engine.
// configure_engine re-sends ~17 MiB of merged baseline rules; that per-push transient
// churns talc the same way the merge did (the second half of the incremental-update
// leak). The baseline merged rules are invariant while the rules-cache key + recipeModes
// are unchanged, and the engine PRESERVES its BucketedRules across pushes, so we skip the
// configure call entirely when this composite is unchanged. null = nothing configured yet.
//
// CRITICAL: this key tracks the BASELINE config. The matcher pass (buildPipelineMatches)
// overwrites the engine with the FINAL ruleset, so it MUST call invalidateConfiguredKey()
// afterward — otherwise the next pipeline run's detection sees configureKey === lastConfiguredKey,
// skips the baseline reconfigure, and runs evaluate+collect base_match against the leftover FINAL
// ruleset. The FINAL ruleset carries the injected safeguard keep-rules, which give
// `ignore_by_safeguards` (e.g. Chaos Ore "kept for reroll") items a non-ignored keep — so they
// are NOT flagged at-risk and the safeguard UNDER-protects (the intermittent ~285-rule drop:
// 1554 → 1270). Forcing a baseline reconfigure before every detection makes the protected set
// consistent (see tests/repro/repro-phantom-overprotection.ts).
let lastConfiguredKey: string | null = null
// Rule count of the baseline config behind lastConfiguredKey. Read ONLY under a matching
// key: when the full merge+configure is skipped, the baseline→final index-offset math
// still needs the baseline rule count the engine is holding.
let lastConfiguredBaselineCount: number | null = null
// Reset the configured-key sentinel so the next detection-phase configure runs unconditionally.
// Called by buildPipelineMatches after it loads the FINAL ruleset into the engine.
const invalidateConfiguredKey = (): void => { lastConfiguredKey = null }

// O(N) element-wise comparison; no allocation.
// V8 terminates at pointer equality for identical strings (common case for large fingerprints).
const keysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Fingerprint of the safeguard detection snapshot that drives placeholder-rule injection.
// Two snapshots with the same key produce identical injected rules in mergedRulesFinal.
// scannedAt is excluded — it changes every run regardless of content.
const computeDetectionKey = (snapshot: SafeguardDetectionSnapshot | null): string => {
  if (snapshot === null || snapshot.entries.length === 0) return ''
  // For each detected combination: its stable hash + per-placeholder (missing count, reason,
  // and substat variant VALUES). Hashing only length was insufficient: when an item is upgraded
  // and its substats change, the placeholder list may carry the same count but different variant
  // numbers, producing different __safeguardSubstatVariant placeholder rules in mergedRulesFinal.
  return snapshot.entries.map((e) => {
    const ph = e.placeholders.map((p) => {
      // XOR-multiply hash over the variant array so order and value both matter.
      // Seeded with length so an empty array never collides with a single-element array.
      let variantHash = p.substatVariants?.length ?? 0
      if (p.substatVariants) {
        for (const v of p.substatVariants) variantHash = Math.imul(variantHash ^ v, 0x9e3779b9) | 0
      }
      return `${p.missing}${p.reason}${variantHash}`
    }).join(',')
    // Hash itemKeys: specific artifact IDs counted toward this safeguard drive per-item
    // keep rules (__safeguardItemKey) in mergedRulesFinal. When a safeguarded item is removed
    // and a spare absorbs the gap, placeholders stay empty but itemKeys changes.
    let keyHash = e.itemKeys.length
    for (const k of e.itemKeys) keyHash = Math.imul(keyHash ^ k, 0x9e3779b9) | 0
    return `${e.hash}:${ph}:${keyHash}`
  }).join('|')
}

// Fingerprint of the artifact store rows via the shared WASM-projection fold
// (foldArtifactWasmProjection — the SSOT for which artifact fields reach the engine).
// The rows sent to WASM are pure functions of each artifact's projected content, so equal
// fingerprints ⇒ byte-identical stored rows. Cost: O(N) integer multiply/XOR per field.
const computeArtifactStoreFingerprint = (
  entries: ReadonlyArray<[number, NormalizedGearArtifact]>,
): string => {
  const state = createArtifactContentFold()
  for (const [, artifact] of entries) foldArtifactWasmProjection(state, artifact)
  return artifactContentFoldKey(state, entries.length)
}

// Batch evaluate so long matcher passes yield between chunks; progress is
// emitted once per batch (not per artifact) to bound Firefox postMessage overhead.
const PIPELINE_MATCH_BATCH_SIZE = 256 as const
// Cap progress chatter so postMessage overhead stays bounded.
const PIPELINE_PROGRESS_MAX_EVENTS = 16 as const

// Yield one macrotask turn so queued worker messages can advance generation.
// Uses MessageChannel instead of setTimeout(0): Chrome throttles setTimeout in
// background tabs (up to 1-minute intervals under intensive throttling), which
// would freeze a multi-yield pipeline for 5–10 minutes when the tab is hidden.
// MessageChannel messages are delivered as regular macrotasks and are NOT subject
// to background timer throttling, so the pipeline stays responsive regardless of
// tab visibility.
const yieldWorkerMacrotask = (): Promise<void> => new Promise<void>((resolve) => {
  const { port1, port2 } = new MessageChannel()
  // Close both ports after delivery to avoid a reference-counted port leak.
  port1.onmessage = () => { port1.close(); port2.close(); resolve() }
  port2.postMessage(null)
})

const notePipelineGeneration = (generation: number): void => {
  if (generation > latestPipelineGeneration) latestPipelineGeneration = generation
}

const pipelineGenerationIsStale = (generation: number): boolean => generation < latestPipelineGeneration

// Returns true when err is a fatal WASM trap. Per the WASM spec, any trap leaves
// the module instance in an undefined state — subsequent calls are UB. The caller
// must call resetWasmInstance() so the next pipeline starts on a fresh instance.
// Currently recognised traps:
//   - "unreachable" — Rust panic compiles to the unreachable instruction (also OOM aborts).
//   - "memory access out of bounds" — linear-memory load/store at an address ≥ memory.size;
//     can be triggered by allocator bookkeeping faults or use-after-free.
const isWasmFatalTrap = (err: unknown): boolean => {
  if (!(err instanceof Error) || err.constructor.name !== 'RuntimeError') return false
  return err.message.includes('unreachable') || err.message.includes('out of bounds')
}

const postError = (id: number, error: unknown): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'error',
    error: error instanceof Error ? error.message : String(error),
  }
  self.postMessage(response)
}

const postPipelineProgress = (id: number, payload: { completed: number; total: number }): void => {
  const response: RuleCacheWorkerResponse = {
    id,
    kind: 'pipeline:progress',
    payload,
  }
  self.postMessage(response)
}

// Awaits the 'init-wasm' message that the main thread sends immediately after spawning
// this worker. All pipeline messages must wait for this before calling any WASM function.
const ensureWasmWorkerReady = (): Promise<void> => wasmReadyPromise

// Worker-only finalizer delegates branch-rule post-processing to wasm.
const finalizeGeneratedRulesForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
  const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
  if (!finalized) {
    throw new Error('WASM rule generation finalizer is unavailable after warmup.')
  }
  return finalized
}

// Builder-count requests use the same generation path as pipeline requests.
const countRulesForRecipesWithWorkerCache = (
  recipes: readonly BuilderRecipe[],
  substatTargets: SubstatTargetTable,
): number[] => {
  const recipesForRules = recipesForRuleBuild(recipes)
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    // Builder-count payload does not include metasets in this call path.
    metasets: [],
    substatTargets,
    // Count badges are per-recipe and should not be clipped by total limits.
    totalLimit: Number.POSITIVE_INFINITY,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
    rulesCache: persistentRuleCache,
  })
  const counts: number[] = []
  for (let idx = 0; idx < recipesForRules.length; idx += 1) {
    counts.push(result.countsByRecipe.get(idx) ?? 0)
  }
  return counts
}

const buildPipelineState = (
  payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload'],
): { state: PipelineState } => {
  const recipesForRules = recipesForRuleBuild(payload.recipes)
  const baseRuleCount = Array.isArray(payload.hsf?.Rules) ? (payload.hsf?.Rules.length ?? 0) : 0
  const result = updateRecipeRulesCache({
    recipes: recipesForRules,
    metasets: payload.metasets,
    substatTargets: payload.substatTargets,
    baseRuleCount,
    finalizeGeneratedRules: finalizeGeneratedRulesForWorker,
    rulesCache: persistentRuleCache,
  })
  const state: PipelineState = {
    rulesByRecipe: result.rulesByRecipe,
    countsByRecipe: result.countsByRecipe,
    keys: result.keys.slice(),
    substatTargetsKey: result.substatTargetsKey,
    truncatedRecipeIndices: result.truncatedRecipeIndices.slice(),
    totalLimitHit: result.totalLimitHit,
    excludedByTotalLimitIndices: result.excludedByTotalLimitIndices.slice(),
    recipesForRules,
  }
  return { state }
}

const resolveItemId = (artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
  // Share one resolver with App/ruleEval so id precedence cannot drift.
  return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
}

// Build a compact per-recipe index array into mergedRulesFinal.
// Used instead of rulesByRecipeEntries when dedupeBeforeSafeguards and
// omitDisabledBeforeSafeguards are both false — rules are identical between
// prebuiltCustomRules and mergedRulesFinal in that case, so the receiver can
// rebuild rulesByRecipe by indexing into the already-cloned mergedRules array.
// Both RecipeID and __lineIdx survive the WASM wire round-trip (keys r_id / _li),
// so (RecipeID, lineIdx) uniquely identifies each user-recipe rule.
const buildRulesByRecipeIndices = (
  prebuiltCustomRules: Map<number, HsfRuleWithRecipe[]>,
  mergedRulesFinal: HsfRuleWithRecipe[],
): Array<[number, number[]]> => {
  // Build lookup: "RecipeID:lineIdx" → position in mergedRulesFinal.
  // Skip safeguard rules (RecipeID <= 0) and base rules (RecipeID absent).
  const positionMap = new Map<string, number>()
  for (let i = 0; i < mergedRulesFinal.length; i++) {
    const rule = mergedRulesFinal[i]!
    const recipeId = rule.RecipeID
    if (typeof recipeId !== 'number' || recipeId <= 0) continue
    positionMap.set(`${recipeId}:${rule.__lineIdx ?? -1}`, i)
  }
  // For each recipe, resolve positions in mergedRulesFinal preserving prebuiltCustomRules order.
  const result: Array<[number, number[]]> = []
  for (const [recipeIdx, rules] of prebuiltCustomRules.entries()) {
    const indices: number[] = []
    for (const rule of rules) {
      const recipeId = rule.RecipeID
      if (typeof recipeId !== 'number' || recipeId <= 0) continue
      const idx = positionMap.get(`${recipeId}:${rule.__lineIdx ?? -1}`)
      if (idx !== undefined) indices.push(idx)
    }
    result.push([recipeIdx, indices])
  }
  return result
}

// Baseline matches carry `ruleIndex` relative to the BASELINE ruleset (no injected safeguard
// rules). The main thread looks rules up in mergedRulesFinal, where the injected safeguard
// block is PREPENDED (prependSafeguardRules), shifting every non-safeguard rule forward by the
// injected count. Reusing a baseline match for a non-candidate without shifting its index makes
// the chip read the wrong (often a slot-mismatched safeguard) rule — e.g. a Weapon showing a
// "Best SPD Banner" safeguard. Since baseline has zero safeguard rules (detection=null) and both
// builds share merge params (identical non-safeguard order), the shift is the uniform offset
// `mergedRulesFinal.length - baselineRuleCount`. SSOT for that remap lives here.
// EvalMatch-shaped value (ruleIndex/keep/recipeIdx); typed via the worker result alias so this
// file keeps using the worker's domain shapes rather than importing lib match types directly.
type WorkerEvalMatch = GearInspectorMatchWorkerItemResult['firstMatch']
const shiftMatchRuleIndex = (
  match: WorkerEvalMatch,
  offset: number,
): WorkerEvalMatch => (
  // Zero offset (no injection) or no match → return as-is; EvalMatch is a flat value object.
  match && offset !== 0 ? { ...match, ruleIndex: match.ruleIndex + offset } : match
)

// Remap a baseline-relative match entry into final-ruleset index space (both match fields).
const remapBaselineMatchToFinal = (
  entry: GearInspectorMatchWorkerItemResult,
  offset: number,
): GearInspectorMatchWorkerItemResult => (
  offset === 0 ? entry : {
    ...entry,
    firstMatch: shiftMatchRuleIndex(entry.firstMatch, offset),
    firstNonExcludedMatch: shiftMatchRuleIndex(entry.firstNonExcludedMatch, offset),
  }
)

const buildPipelineMatches = async (
  mergedRules: HsfRuleWithRecipe[],
  artifactEntries: ReadonlyArray<[number, NormalizedGearArtifact]>,
  recipeModes: SellfileExportMode[] | undefined,
  ignoreSafeguardRecipeIndices: ReadonlySet<number> | null,
  total: number,
  completedRef: { value: number },
  emitProgress: ((progress: { completed: number; total: number }) => void) | null,
  hasSafeguardOverrideRules: boolean,
  shouldAbort: (() => boolean) | null,
) : Promise<GearInspectorMatchWorkerItemResult[]> => {
  if (!artifactEntries.length) return []
  // Configure for this matcher pass; no signature-based configure cache is used.
  await configureWasmRuleEngine({
    rules: mergedRules,
    recipeModes: Array.isArray(recipeModes) ? recipeModes : [],
  })
  // The engine now holds the FINAL ruleset, NOT the baseline. Invalidate the baseline
  // configured-key sentinel so the NEXT run's detection reconfigures the baseline before
  // computing base_match — otherwise it would detect against this leftover FINAL config and
  // under-protect `ignore_by_safeguards` items (see invalidateConfiguredKey's definition).
  invalidateConfiguredKey()
  if (!wasmVersionLogged) {
    await getWasmRuleEngineVersion()
    wasmVersionLogged = true
  }
  if (shouldAbort?.()) return []
  // Full matcher pass mirrors evaluateMatchesByRecipe semantics.
  const evaluateOptions = {
    ...(ignoreSafeguardRecipeIndices ? { ignoreSafeguardRecipeIndices } : {}),
    ...(hasSafeguardOverrideRules ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES } : {}),
  }
  const results: GearInspectorMatchWorkerItemResult[] = []
  for (let start = 0; start < artifactEntries.length; start += PIPELINE_MATCH_BATCH_SIZE) {
    if (shouldAbort?.()) return results
    const end = Math.min(start + PIPELINE_MATCH_BATCH_SIZE, artifactEntries.length)
    const batchEntries = artifactEntries.slice(start, end)
    // evaluateWasmRuleEngineItems applies toWasmTestItem internally via buildEvaluatePayload,
    // so we just pass the domain TestItem (rank/rarity stay branded). Pre-projecting here
    // would mismatch the GearInspectorMatchWorkerEvaluateItem signature which holds the
    // narrow domain shape.
    const batchItems = batchEntries.map(([itemId, artifact]) => ({ itemId, item: artifact.gearInspectorItem }))
    const batchResults = await evaluateWasmRuleEngineItems({
      items: batchItems,
      options: evaluateOptions,
    })
    if (shouldAbort?.()) return results
    const batchByItemId = new Map<number, GearInspectorMatchWorkerItemResult>()
    batchResults.forEach((entry) => batchByItemId.set(entry.itemId, entry))
    for (const [itemId] of batchEntries) {
      const fullEval = batchByItemId.get(itemId)
      if (!fullEval) continue
      results.push({
        itemId,
        firstMatch: fullEval.firstMatch,
        firstNonExcludedMatch: (
          fullEval.firstNonExcludedMatch
          ?? fullEval.firstMatch
          ?? null
        ),
        matchingRecipeIndices: fullEval.matchingRecipeIndices,
        matchingRecipeDecisions: fullEval.matchingRecipeDecisions,
      })
    }
    // Emit progress once per batch rather than per artifact so the throttler
    // is not called thousands of times on large DBs — the primary Firefox slowdown.
    if (emitProgress) {
      completedRef.value += batchEntries.length
      emitProgress({ completed: completedRef.value, total })
    }
    // Yield so superseding pipeline messages can update generation state.
    if (end < artifactEntries.length) await yieldWorkerMacrotask()
  }
  return results
}


self.onmessage = async (event: MessageEvent<RuleCacheWorkerRequest>) => {
  const message = event.data
  if (!message) return

  // init-wasm arrives once, immediately after the worker is spawned.
  // Must be handled before ensureWasmWorkerReady (which awaits wasmReadyPromise).
  if (message.kind === 'init-wasm') {
    // initWasmRuleEngineFromModule also pre-grows the WASM linear memory.
    initWasmRuleEngineFromModule(message.wasmModule)
    wasmReadyResolve?.()
    return
  }

  try {
    await ensureWasmWorkerReady()
  } catch (error) {
    postError(message.id, error)
    return
  }

  if (message.kind === 'builderCount') {
    const { id, payload } = message
    try {
      const counts = countRulesForRecipesWithWorkerCache(payload.recipes, payload.substatTargets)
      const response: RuleCacheWorkerResponse = {
        id,
        kind: 'builderCount:done',
        payload: { counts },
      }
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  // Routed here (instead of a dedicated scoring worker) so the rule-engine WASM module
  // is inlined into the build only once per worker, not once per consumer. Reuses the
  // already-warmed WASM instance.
  if (message.kind === 'scoreCandidates') {
    const { id, payload } = message
    try {
      const candidates = scoreSafeguardCandidates({
        artifacts: payload.artifacts,
        substats: payload.substats as unknown as StatVariant[],
        weights: payload.weights,
        weightMainStatByRank: payload.weightMainStatByRank,
        mainStatRankWeightFactor: payload.mainStatRankWeightFactor,
        requiredCount: payload.requiredCount,
        // Forward count-mode when caller supplied it so the WASM partition
        // matches detection-side bucketing. Drop the key when absent so the
        // wasm wrapper substitutes its `null` default (canonical resolution).
        ...(payload.countMode ? { countMode: payload.countMode } : {}),
        // Forward substat-match so perSubstat rules get per-substat sub-buckets in the preview.
        ...(payload.substatMatch ? { substatMatch: payload.substatMatch } : {}),
      })
      const response: RuleCacheWorkerResponse = {
        id,
        kind: 'scoreCandidates:done',
        payload: { candidates },
      }
      self.postMessage(response)
    } catch (error) {
      postError(id, error)
    }
    return
  }

  if (message.kind !== 'pipeline') return
  const { id, payload } = message
  const pipelineGeneration = Number.isFinite(payload.generation) ? Number(payload.generation) : id
  notePipelineGeneration(pipelineGeneration)
  const runIsStale = (): boolean => pipelineGenerationIsStale(pipelineGeneration)

  try {
    logTalcCounters(`pipeline-start id=${id}`)
    const { state: pipelineState } = buildPipelineState(payload)
    logTalcCounters(`after-buildPipelineState id=${id}`)
    const prebuiltCustomRules = pipelineState.rulesByRecipe
    const hasActiveSafeguards = hasActiveSafeguardRules(payload.safeguards)
    const baseSafeguards = hasActiveSafeguards
      ? { ...payload.safeguards, detection: null }
      : payload.safeguards
    const recipesForRules = pipelineState.recipesForRules
    const warmTotal = payload.recipes.length
    const artifactEntries: Array<[number, NormalizedGearArtifact]> = payload.artifacts
      .map((artifact, idx) => [resolveItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
    const needsDetection = hasActiveSafeguards && artifactEntries.length > 0
    // Detection uses one matcher pass; final rows use one matcher pass.
    const matchPasses = (needsDetection ? 1 : 0) + 1
    const total = warmTotal + (artifactEntries.length * matchPasses)
    let completed = warmTotal
    const emitProgressEvents = payload.emitProgressEvents !== false
    const emitPipelineProgress = (emitProgressEvents && total > 0)
      ? createProgressThrottler((progress) => {
        postPipelineProgress(id, progress)
      }, { maxEvents: PIPELINE_PROGRESS_MAX_EVENTS })
      : null
    if (total > 0 && completed > 0) emitPipelineProgress?.({ completed, total })

    // Build base + flattened-customs once; both baseline and final merged-rules
    // calls reuse this to skip the redundant WASM flattenRuleBatches step.
    const sharedComponents: MergedRulesComponents = buildMergedRulesComponents({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      prebuiltCustomRules,
    })
    // Safeguard rule content fingerprint (SSOT helper) — feeds the rules-cache key AND the
    // improvement-chance memo so both agree on exactly which safeguard fields matter.
    const safeguardsFingerprint = safeguardRulesContentFingerprint(payload.safeguards.enabled, payload.safeguards.rules)
    // Rules-cache key: the composite of every rules-PRODUCING input (substatTargets,
    // truncation, omit/dedupe flags, finalSellRemainder, safeguard-rule content). When it
    // is unchanged between pipeline runs the WASM-side generated-rules cache is reused, so
    // the ~17 MiB of rules are not re-sent per endpoint push. composeRuleCacheKey is the same
    // signal already used to gate re-sending merged rules to the main thread (below), so it
    // can only over-invalidate (refresh when not strictly needed), never go stale. See
    // composeRuleCacheKey (src/workers/ruleCacheKey.ts) for why pipelineState.keys (the
    // recipe dimension) MUST contribute: omitting it let the WASM merge cache go stale
    // across recipe edits and the recipes-enabled toggle.
    // Both the baseline and final merge below share this key so the final call reuses the
    // cache the baseline call populated.
    const rulesCacheKey = composeRuleCacheKey(pipelineState, payload, safeguardsFingerprint)
    const mergeParams = {
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
      rulesCacheKey,
    }

    // Single definition of the baseline merge call (ODR) — used by the no-detection path
    // below and by the defensive fallback in the final-merge expression further down.
    const materializeBaselineRules = (): HsfRuleWithRecipe[] => computeMergedRulesFromComponents(
      sharedComponents,
      { ...mergeParams, safeguards: baseSafeguards },
    )
    // Baseline rules. When detection runs, the baseline merged rules have NO TS consumer
    // besides the engine configuration and their COUNT (baseline→final index offset), so
    // merge + configure happen in ONE WASM call (configureMergedRulesFromComponents) and
    // the ~15 MiB of rules never cross the boundary. When detection is skipped, the
    // baseline IS the final output (snapshot stays null) — materialize it classically so
    // the response can carry it. mergedRulesBaseline is therefore null iff needsDetection.
    let mergedRulesBaseline: HsfRuleWithRecipe[] | null = null
    let baselineRuleCount = 0
    if (!needsDetection) {
      mergedRulesBaseline = materializeBaselineRules()
      baselineRuleCount = mergedRulesBaseline.length
    }
    logTalcCounters(`after-mergedRulesBaseline id=${id} materialized=${mergedRulesBaseline !== null}`)

    // ignoreSafeguardRecipeIndices is needed by both detection and final passes.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const baselineMatchMap = new Map<number, GearInspectorMatchWorkerItemResult>()
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    // Populated inside needsDetection branch when payload.computeImprovementChance is true.
    let improvementChanceEntries: ImprovementChanceWasmEntry[] | null = null
    // Memo key of the entries above (null while entries are null) — compared against
    // lastSentImprovementKey at response time to elide re-cloning unchanged entries.
    let improvementChanceKeyForSend: string | null = null
    if (needsDetection) {
      // Configure baseline rules so the combined WASM evaluate+collect call uses them —
      // but ONLY when the baseline rules or recipe modes actually changed. The engine
      // preserves its BucketedRules across pushes, so on an artifact-only push (same
      // rulesCacheKey + recipeModes) the previously-configured rules are still valid and
      // re-sending ~17 MiB would just churn the allocator. rulesCacheKey is the rules
      // signal; append the recipeModes so a mode flip still reconfigures.
      const recipeModesForConfigure = Array.isArray(payload.recipeModes) ? payload.recipeModes : []
      const configureKey = `${rulesCacheKey}|${recipeModesForConfigure.join(',')}`
      if (configureKey === lastConfiguredKey && lastConfiguredBaselineCount !== null) {
        // Engine still holds exactly this baseline config — skip merge AND configure.
        baselineRuleCount = lastConfiguredBaselineCount
      } else {
        // One WASM call: cached merge + configure, count out (rules stay WASM-resident).
        baselineRuleCount = configureMergedRulesFromComponents(sharedComponents, {
          ...mergeParams,
          safeguards: baseSafeguards,
          recipeModes: recipeModesForConfigure,
        })
        lastConfiguredKey = configureKey
        lastConfiguredBaselineCount = baselineRuleCount
      }
      logTalcCounters(`after-configure(baseline) id=${id} rules=${baselineRuleCount}`)
      if (!wasmVersionLogged) {
        await getWasmRuleEngineVersion()
        wasmVersionLogged = true
      }
      if (runIsStale()) return
      // Store compact rows in WASM ENGINE_STATE for the combined evaluate+collect path.
      // Only the fields SafeguardWasmArtifactRawIn reads are included (toWasmArtifactStoreRow).
      // Skip the call entirely when the artifact set is unchanged: the Rust Vec is already
      // populated from the previous run. If something did change, Rust reuses the backing
      // allocation (clear + extend) instead of dropping and reallocating — see lib.rs
      // store_artifact_rows_engine for the fragmentation rationale.
      const storeFingerprint = computeArtifactStoreFingerprint(artifactEntries)
      const rowsAreStale = storeFingerprint !== lastArtifactStoreFingerprint
      if (rowsAreStale) {
        const detectionRows = artifactEntries.map(([, artifact]) => toWasmArtifactStoreRow(artifact))
        storeArtifactRows(detectionRows)
        lastArtifactStoreFingerprint = storeFingerprint
      }
      // Compute improvement-chance percentages once, before detection. Two consumers need
      // this result: (a) the detection call uses it for threshold gating on candidate ranking,
      // (b) the payload sends it to the main thread (opt-in). Computing here and passing
      // precomputedImprovementChances to evaluateAndCollectSafeguardProtection suppresses the
      // internal fallback, avoiding a second WASM call and second peak-allocation for the Vec.
      // Gated on either threshold presence (detection needs it) or the caller opt-in flag.
      const hasThreshold = safeguardRulesHaveImprovementThreshold(payload.safeguards.rules)
      const needsImprovementChance = hasThreshold || payload.computeImprovementChance
      // Entries actually fed to detection; [] when the pass is not needed at all.
      let improvementChanceForDetection: ImprovementChanceWasmEntry[] = []
      if (needsImprovementChance) {
        // Memo key: safeguard rule content (safeguardsFingerprint already folds the enabled
        // flag — SSOT) + artifact content. storeFingerprint hashes exactly the store rows
        // the WASM pass reads, so equal keys ⇒ equal entries.
        const improvementChanceKey = `${safeguardsFingerprint}|${storeFingerprint}`
        if (lastImprovementChance !== null && lastImprovementChance.key === improvementChanceKey) {
          // Inputs unchanged (e.g. a recipe-only edit) — reuse the previous WASM result.
          improvementChanceForDetection = lastImprovementChance.entries
        } else {
          const improvResult = computeImprovementChanceWithLoadedWasm({
            rules: payload.safeguards.rules,
            enabled: payload.safeguards.enabled,
            debug: false,
          })
          improvementChanceForDetection = improvResult?.entries ?? []
          lastImprovementChance = { key: improvementChanceKey, entries: improvementChanceForDetection }
          logTalcCounters(`after-improvementChance id=${id}`)
          if (runIsStale()) return
        }
        // Forward entries to the main thread only when the caller opted in (overlay / sort
        // column active). Detection below always receives them — previously a threshold-only
        // run discarded this result and detection recomputed it internally (double WASM pass).
        improvementChanceEntries = payload.computeImprovementChance ? improvementChanceForDetection : null
        // The memo key fully determines the entries, so it doubles as the send-elision key.
        improvementChanceKeyForSend = improvementChanceEntries !== null ? improvementChanceKey : null
      }
      // Pass baselineExcludeSources so keep-override sources are excluded from the
      // safeguard base-match the same way as the regular evaluate pass.
      const detectionOptions = hasActiveSafeguards
        ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES }
        : undefined
      // Supply pre-computed entries so evaluateAndCollectSafeguardProtection skips its
      // internal improvement-chance fallback (prevents a second WASM call + allocation).
      const detectionResult = evaluateAndCollectSafeguardProtection({
        ...(detectionOptions ? { options: detectionOptions } : {}),
        rules: payload.safeguards.rules,
        enabled: payload.safeguards.enabled,
        ignoreSafeguardRecipeIndices,
        precomputedImprovementChances: improvementChanceForDetection,
      })
      if (runIsStale()) return
      // Populate baseline match map from per-item evaluation results.
      for (const entry of detectionResult.evaluateResults) {
        baselineMatchMap.set(entry.itemId, {
          itemId: entry.itemId,
          firstMatch: entry.firstMatch,
          firstNonExcludedMatch: (entry.firstNonExcludedMatch ?? entry.firstMatch ?? null),
          matchingRecipeIndices: entry.matchingRecipeIndices,
          matchingRecipeDecisions: entry.matchingRecipeDecisions,
        })
      }
      safeguardDetectionSnapshot = detectionResult.detection
      logTalcCounters(`after-evalCollect id=${id}`)
      completed = warmTotal + artifactEntries.length
      emitPipelineProgress?.({ completed, total })
    } else {
      // Detection not needed (no safeguards active or no artifact rows). The fingerprint
      // is left as-is: the stored rows in the WASM engine are still valid for the next
      // run where detection IS needed. If the artifact data actually changed, the hash
      // will differ on that run and trigger a re-store naturally. Resetting here caused
      // spurious re-stores whenever an intermediate non-artifact pipeline run (e.g. a
      // roster or account message) left artifactEntries empty between bursts.
      completed = warmTotal
    }

    // Free stored artifact rows from WASM ENGINE_STATE before the merge phase.
    // stored_rows (7970 items, ~16–20 MiB) are only consumed by eval-collect and are
    // no longer needed.  Dropping them gives talc a large allocation budget before
    // computeMergedRulesFromComponents (which deserializes 24k rules and needs
    // contiguous blocks the fragmented heap cannot otherwise provide without a grow).
    // The rows will be repopulated on the next pipeline run via store_artifact_rows_value.
    if (needsDetection) {
      clearStoredRowsWithLoadedWasm()
      // Invalidate the artifact store fingerprint so the next pipeline run that needs
      // detection re-stores rows unconditionally (stored_rows is now None in ENGINE_STATE).
      lastArtifactStoreFingerprint = null
    }

    // Final merge differs from baseline ONLY via the detection snapshot. With no snapshot
    // (safeguards inactive, or no artifacts to detect against) the two calls would receive
    // content-identical inputs — reuse the baseline array and skip the second WASM merge +
    // full rule-array expansion entirely. Sharing the array is safe: it is read-only from
    // here on (structured clone snapshots it on postMessage). A null snapshot implies
    // !needsDetection, where the baseline IS materialized; the ?? fallback merge only fires
    // if that invariant ever breaks (defensive — same output either way).
    // Use shared components so flattenRuleBatches is not called a second time.
    const mergedRulesFinal = safeguardDetectionSnapshot === null
      ? (mergedRulesBaseline ?? materializeBaselineRules())
      : computeMergedRulesFromComponents(sharedComponents, {
          ...mergeParams,
          safeguards: {
            ...payload.safeguards,
            detection: safeguardDetectionSnapshot,
          },
        })
    logTalcCounters(`after-mergedRulesFinal id=${id} rules=${mergedRulesFinal.length}`)

    // Offset between baseline-relative and final-relative rule indices: the injected safeguard
    // block is prepended, so every reused baseline match must shift its ruleIndex by this amount
    // before the main thread looks it up in mergedRulesFinal. Baseline has no safeguard rules
    // (detection=null) and both builds share merge params, so the offset is uniform. SSOT for the
    // baseline→final index space lives in remapBaselineMatchToFinal.
    const baselineToFinalIndexOffset = mergedRulesFinal.length - baselineRuleCount

    // The final ruleset differs from baseline ONLY by the injected safeguard keep-rules +
    // anticipate placeholders (gaps or improvement-watch — both are keep rules, so the
    // candidate-subset argument below holds for either mode). An item's final gear-inspector
    // verdict can therefore differ
    // from its baseline verdict ONLY when a safeguard keep-override can fire for it — i.e. when
    // the item is NOT already kept by a non-ignored recipe (`evaluate_item`'s allow_keep_override
    // gate, matcher_evaluator.rs). So the verdict can only change for the CANDIDATE set:
    //   baseline firstMatch is sold (or no match)  OR  kept by an `ignore_by_safeguards` recipe.
    // Every other item (kept by a non-ignored recipe) is provably untouched by the injected rules,
    // so its baseline verdict is already the final verdict. We therefore re-evaluate ONLY the
    // candidate subset against the final ruleset and reuse baseline for the rest — instead of a
    // second full O(N×M) scan. Verified (changedOutsideCandidate=0) across all example DBs ×
    // 3 override tiers during development of this fast path.
    const detectionFoundNothing = safeguardDetectionSnapshot != null
      && safeguardDetectionSnapshot.entries.length === 0
    let matches: GearInspectorMatchWorkerItemResult[]
    if (needsDetection && detectionFoundNothing) {
      // Copy results from the baseline map in artifact order, remapping baseline-relative rule
      // indices into final-ruleset space (the main thread indexes mergedRulesFinal).
      matches = artifactEntries.map(([itemId]) => {
        const baseEntry = baselineMatchMap.get(itemId)
        return baseEntry
          ? remapBaselineMatchToFinal(baseEntry, baselineToFinalIndexOffset)
          : { itemId, firstMatch: null, firstNonExcludedMatch: null, matchingRecipeIndices: [], matchingRecipeDecisions: [] }
      })
      if (total > 0) {
        emitPipelineProgress?.({ completed: total, total })
      }
    } else if (needsDetection) {
      // Restructure (candidate-subset matcher). An item is a candidate when its BASELINE
      // first-match is not a keep from a non-ignored recipe — only those can flip under the
      // injected safeguard rules. Identical-by-construction for non-candidates.
      const isCandidate = (itemId: number): boolean => {
        const fm = baselineMatchMap.get(itemId)?.firstMatch
        // Kept by a non-ignored recipe ⇒ allow_keep_override is false ⇒ verdict cannot change.
        const keptByNonIgnored = fm != null && fm.keep === true
          && fm.recipeIdx != null && !ignoreSafeguardRecipeIndices.has(fm.recipeIdx)
        return !keptByNonIgnored
      }
      const candidateEntries = artifactEntries.filter(([itemId]) => isCandidate(itemId))
      // Re-evaluate ONLY the candidates against the final ruleset.
      const finalProgressRef = { value: completed }
      const candidateMatches = await buildPipelineMatches(
        mergedRulesFinal,
        candidateEntries,
        payload.recipeModes,
        ignoreSafeguardRecipeIndices,
        total,
        finalProgressRef,
        emitPipelineProgress,
        hasActiveSafeguards,
        runIsStale,
      )
      if (runIsStale()) return
      // Merge: candidates take their freshly-evaluated final verdict (already final-indexed);
      // everyone else reuses the baseline verdict, remapped from baseline- to final-index space.
      const candidateById = new Map(candidateMatches.map((m) => [m.itemId, m]))
      matches = artifactEntries.map(([itemId]) => {
        const candidate = candidateById.get(itemId)
        if (candidate) return candidate
        const baseEntry = baselineMatchMap.get(itemId)
        return baseEntry
          ? remapBaselineMatchToFinal(baseEntry, baselineToFinalIndexOffset)
          : { itemId, firstMatch: null, firstNonExcludedMatch: null, matchingRecipeIndices: [], matchingRecipeDecisions: [] }
      })
      if (total > 0 && finalProgressRef.value < total) {
        finalProgressRef.value = total
        emitPipelineProgress?.({ completed: total, total })
      }
    } else {
      // No detection (safeguards inactive): the final ruleset == baseline; full scan as before.
      const finalProgressRef = { value: completed }
      matches = await buildPipelineMatches(
        mergedRulesFinal,
        artifactEntries,
        payload.recipeModes,
        ignoreSafeguardRecipeIndices,
        total,
        finalProgressRef,
        emitPipelineProgress,
        hasActiveSafeguards,
        runIsStale,
      )
      if (runIsStale()) return
      if (total > 0 && finalProgressRef.value < total) {
        finalProgressRef.value = total
        emitPipelineProgress?.({ completed: total, total })
      }
    }

    if (runIsStale()) return

    // When safeguards are injecting rules into mergedRulesFinal, the merged output depends
    // Check whether mergedRulesFinal is identical to what the main thread already holds.
    // If so, send null for the three large fields to skip structured-cloning ~50–100 MiB
    // on artifact-only endpoint bursts (the dominant cause of JS heap growth / OOM crashes).
    // mergedRulesFinal depends on: recipe keys (element-wise) + recipeKey (composite of
    // substatTargetsKey, totalLimitHit, truncatedRecipeIndices identity, merge flags) +
    // detection key (safeguard detection entries drive placeholder injection).
    const detectionKey = computeDetectionKey(safeguardDetectionSnapshot)
    // Signature of this run's merged output. recipeKey reuses the rules-cache key computed
    // above — same composite signal (SSOT). keys is its own slice so the sentinel and the
    // response's keys array never alias each other.
    const outputSignature: MergedOutputSignature = {
      keys: pipelineState.keys.slice(),
      recipeKey: rulesCacheKey,
      detectionKey,
      mergedCount: mergedRulesFinal.length,
    }
    const rulesUnchanged = mergedOutputSignatureEquals(lastSentSignature, outputSignature)
    if (!rulesUnchanged) {
      // Capture the signature before the response object is handed off.
      lastSentSignature = outputSignature
    }

    // Detection elision: identical detectionKey ⇒ content-identical snapshot (scannedAt
    // aside) ⇒ skip cloning it; the receiver reuses its previous snapshot. A null snapshot
    // ("detection did not run") is always sent as-is — null must never read as "unchanged"
    // because an EMPTY snapshot also fingerprints to '' and the two differ semantically.
    const detectionUnchanged = safeguardDetectionSnapshot !== null && detectionKey === lastSentDetectionKey
    lastSentDetectionKey = safeguardDetectionSnapshot === null ? null : detectionKey
    // Improvement-chance elision: same idea keyed by the compute-memo key. A null key
    // (entries not requested this run) resets the sentinel so a later send is full.
    const improvementUnchanged = improvementChanceKeyForSend !== null
      && improvementChanceKeyForSend === lastSentImprovementKey
    lastSentImprovementKey = improvementChanceKeyForSend

    // Fingerprint of the EXACT bytes an HSF export would produce from these merged rules.
    // The main thread's "export/push needed" indicator compares this against the fingerprint
    // captured at the last export, so it flags only when the EXPORTED file would actually
    // differ (not merely when some input or the detection snapshot churned). Computed here
    // because the worker already holds mergedRulesFinal. The recipe names written into the
    // export come from recipeNamesForExport over THIS pipeline's (override-applied) recipes —
    // the same SSOT helper and the same override-applied list the main thread feeds to its
    // own export payload, so the two crcs can never diverge. (computeExportedHsfFingerprint
    // SSOT lives in hsfIO; the name-projection SSOT in ruleCacheHelpers.)
    const exportRecipeNames = recipeNamesForExport(recipesForRules)
    // Memo: the crc's only inputs are the merged output signature + the export names —
    // reuse the previous crc when both match (JSON names key makes boundaries unambiguous).
    const exportNamesKey = JSON.stringify(exportRecipeNames)
    const mergedRulesHash = (
      lastExportHash !== null
      && lastExportHash.namesKey === exportNamesKey
      && mergedOutputSignatureEquals(lastExportHash.signature, outputSignature)
    )
      ? lastExportHash.hash
      : computeExportedHsfFingerprint(mergedRulesFinal, { recipeNames: exportRecipeNames })
    lastExportHash = { signature: outputSignature, namesKey: exportNamesKey, hash: mergedRulesHash }

    // Use compact indices when neither dedup nor omitDisabled is active: in that case
    // the same rule objects appear in both mergedRulesFinal and prebuiltCustomRules,
    // so structured clone produces one shared set instead of two independent copies.
    const useIndexPath = !payload.dedupeBeforeSafeguards && !payload.omitDisabledBeforeSafeguards
    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'pipeline:done',
      payload: {
        rulesByRecipeEntries: rulesUnchanged || useIndexPath ? null : Array.from(prebuiltCustomRules.entries()),
        rulesByRecipeIndices: rulesUnchanged || !useIndexPath ? null : buildRulesByRecipeIndices(prebuiltCustomRules, mergedRulesFinal),
        countsByRecipeEntries: Array.from(pipelineState.countsByRecipe.entries()),
        keys: rulesUnchanged ? null : pipelineState.keys.slice(),
        substatTargetsKey: pipelineState.substatTargetsKey,
        mergedRules: rulesUnchanged ? null : mergedRulesFinal,
        // Export fingerprint of mergedRulesFinal — sent every pipeline (even when mergedRules
        // is null for the unchanged-rules fast path) so the main thread always has the current
        // export identity for its dirty check.
        mergedRulesHash,
        truncatedRecipeIndices: pipelineState.truncatedRecipeIndices.slice(),
        totalLimitHit: pipelineState.totalLimitHit,
        excludedByTotalLimitIndices: pipelineState.excludedByTotalLimitIndices.slice(),
        matches,
        // Elided (null + unchanged flag) when content-identical to the last send — the
        // receiver reuses its previous snapshot/entries, so consecutive pipeline results
        // share ONE object graph instead of stacking independent clones (see the
        // lastSentDetectionKey / lastSentImprovementKey sentinels).
        safeguardDetection: detectionUnchanged ? null : safeguardDetectionSnapshot,
        safeguardDetectionUnchanged: detectionUnchanged,
        improvementChanceEntries: improvementUnchanged ? null : improvementChanceEntries,
        improvementChanceUnchanged: improvementUnchanged,
        // Snapshot taken after all WASM work completes; logged in DEV mode to
        // verify the WASM heap is not growing across consecutive pipeline runs.
        wasmLinearBytes: getWasmLinearMemoryBytes(),
      },
    }
    self.postMessage(response)
  } catch (error) {
    // Log before postMessage so the worker-side stack trace is visible in DevTools.
    // The main thread only receives error.message (structured-clone-safe), which drops
    // the stack and makes diagnosing which WASM call threw impossible otherwise.
    console.error('[rule-cache-worker] pipeline failed:', error)
    if (isWasmFatalTrap(error)) {
      // WASM instance is in an undefined state after any trap — reinitialize on the
      // next pipeline. The main thread will typically replace this worker upon
      // receiving the postError below; these resets are the fallback for the
      // stale-run path where postError is skipped.
      resetWasmInstance()
      // The fresh instance holds NO engine state (BucketedRules / stored_rows are gone),
      // so the skip sentinels that mirror that state must reset with it — otherwise the
      // next run would skip configure/store against an empty engine and silently
      // evaluate zero rules. (The WASM merge cache needs no reset here: its wrapper
      // self-heals on a cache miss by re-caching and retrying.)
      invalidateConfiguredKey()
      lastConfiguredBaselineCount = null
      lastArtifactStoreFingerprint = null
      // Cached rule arrays were built against the now-discarded WASM instance's
      // recipe-index bookkeeping; drop them so the fresh instance rebuilds clean
      // rather than serving entries stamped for a state that no longer exists.
      persistentRuleCache.clear()
    }
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
