/// <reference lib="webworker" />

import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  type MergedRulesComponents,
} from '../lib/merge'
import { recipesForRuleBuild, recipeNamesForExport } from '../lib/ruleCacheHelpers'
import { composeRuleCacheKey } from './ruleCacheKey'
import { computeExportedHsfFingerprint } from '../lib/hsfIO'
import {
  buildIgnoreSafeguardRecipeIndices,
  evaluateAndCollectSafeguardProtection,
  hasActiveSafeguardRules,
  safeguardRulesContentFingerprint,
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
let lastArtifactStoreFingerprint: number | null = null

// Sentinels tracking the most recently sent per-recipe rule data.
// When all four match the current pipeline output, rulesByRecipeEntries/mergedRules/keys
// are sent as null, skipping the structured-clone of ~50–100 MiB on artifact-only bursts.
let lastSentKeys: string[] | null = null
// Composite of: substatTargetsKey, totalLimitHit, truncatedRecipeIndices identity hash,
// merge flags (omitDisabled, dedupe, safeguards.enabled), safeguard rule content hash
// (requiredCount, activation, countMode, ignore flags, substats, weights, improvChance),
// and finalSellRemainder content. Stored as a single string for cheap single-comparison.
let lastSentRecipeKey: string | null = null
// Fingerprint of the safeguard detection entries that drove the last sent mergedRulesFinal.
// scannedAt is excluded (changes every run but does not affect merged rules).
// Covers which entries were detected, their placeholder contents, and itemKeys identity.
let lastSentDetectionKey: string | null = null
// Safety-net sentinel: the merged rule count of the most recently sent full payload.
// A count change guarantees rule content changed regardless of fingerprint matches,
// and catches any fingerprint gap not covered by the three keys above.
let lastSentMergedCount = -1

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
// consistent (see tests/playwright/phantom-overprotection-repro.spec.ts).
let lastConfiguredKey: string | null = null
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

// Thin wrapper over the pure composeRuleCacheKey helper (src/workers/ruleCacheKey.ts).
// The composition logic lives in that module so it can be unit-tested without the worker's
// `self`/WASM bootstrap. Here we only derive the safeguard fingerprint via the shared SSOT
// helper (safeguardRulesContentFingerprint) — keeping this cache key and the export-dirty
// signature (App.hsfExportStateSig) in agreement on which safeguard fields matter — and
// forward it. See composeRuleCacheKey for why pipelineState.keys (the recipe dimension)
// MUST contribute: omitting it let the WASM merge cache go stale across recipe edits and the
// recipes-enabled toggle.
const computeRecipeKey = (
  pipelineState: PipelineState,
  payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload'],
): string => composeRuleCacheKey(
  pipelineState,
  payload,
  safeguardRulesContentFingerprint(payload.safeguards.enabled, payload.safeguards.rules),
)

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

// Compute a 32-bit integer hash over the mutable fields of each store row:
//   id            — artifact added or removed
//   level         — upgrade (also bounds which substats are unlocked)
//   rank          — rank promotion
//   substats.length — new sub added at levels 4/8/12/16
//   Σ totalValue  — glyph application or substat value increase on upgrade
//   equippedChampion.location — artifact moved to/from champion / vault
// Immutable fields (slot, set, faction, mainStat variant, substat isFlat) are
// omitted for speed. Cost: O(N) integer multiply/XOR — no string allocation.
const computeArtifactStoreFingerprint = (
  entries: ReadonlyArray<[number, NormalizedGearArtifact]>,
): number => {
  // Seed with count so an empty set never collides with a 1-item set.
  let h = entries.length * 0x9e3779b9 | 0
  for (const [id, a] of entries) {
    h ^= id
    h = Math.imul(h, 0x9e3779b9) | 0
    // Cover upgrade and rank promotion.
    h ^= (a.level + (a.rank ?? 0) * 97) | 0
    h = Math.imul(h, 0x517cc1b7) | 0
    // Cover equipped-champion change: null=0, vault=1, collection/other=2.
    const loc = a.equippedChampion?.location
    const locCode = loc == null ? 0 : /vault/i.test(loc) ? 1 : 2
    h ^= locCode * 31
    h = Math.imul(h, 0xbf58476d) | 0
    // Cover glyph and substat value changes: hash substat count + Σ totalValue.
    // Scale by 10 so a 0.1-unit glyph gain produces a distinct integer delta.
    let subHash = a.substats?.length ?? 0
    for (const s of a.substats ?? []) {
      subHash += Math.round((s.totalValue ?? 0) * 10)
    }
    h ^= subHash
    h = Math.imul(h, 0x9e3779b9) | 0
  }
  return h
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
        requiredCount: payload.requiredCount,
        // Forward count-mode when caller supplied it so the WASM partition
        // matches detection-side bucketing. Drop the key when absent so the
        // wasm wrapper substitutes its `null` default (canonical resolution).
        ...(payload.countMode ? { countMode: payload.countMode } : {}),
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
    // Rules-cache key: the composite of every rules-PRODUCING input (substatTargets,
    // truncation, omit/dedupe flags, finalSellRemainder, safeguard-rule content). When it
    // is unchanged between pipeline runs the WASM-side generated-rules cache is reused, so
    // the ~17 MiB of rules are not re-sent per endpoint push. computeRecipeKey is the same
    // signal already used to gate re-sending merged rules to the main thread (below), so it
    // can only over-invalidate (refresh when not strictly needed), never go stale.
    // Both the baseline and final merge below share this key so the final call reuses the
    // cache the baseline call populated.
    const rulesCacheKey = computeRecipeKey(pipelineState, payload)
    const mergeParams = {
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
      rulesCacheKey,
    }

    const mergedRulesBaseline = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: baseSafeguards,
    })
    logTalcCounters(`after-mergedRulesBaseline id=${id} rules=${mergedRulesBaseline.length}`)

    // ignoreSafeguardRecipeIndices is needed by both detection and final passes.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const baselineMatchMap = new Map<number, GearInspectorMatchWorkerItemResult>()
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    // Populated inside needsDetection branch when payload.computeImprovementChance is true.
    let improvementChanceEntries: ImprovementChanceWasmEntry[] | null = null
    if (needsDetection) {
      // Configure baseline rules so the combined WASM evaluate+collect call uses them —
      // but ONLY when the baseline rules or recipe modes actually changed. The engine
      // preserves its BucketedRules across pushes, so on an artifact-only push (same
      // rulesCacheKey + recipeModes) the previously-configured rules are still valid and
      // re-sending ~17 MiB would just churn talc. computeRecipeKey is the rules signal;
      // append the recipeModes so a mode flip still reconfigures.
      const recipeModesForConfigure = Array.isArray(payload.recipeModes) ? payload.recipeModes : []
      const configureKey = `${rulesCacheKey}|${recipeModesForConfigure.join(',')}`
      if (configureKey !== lastConfiguredKey) {
        await configureWasmRuleEngine({
          rules: mergedRulesBaseline,
          recipeModes: recipeModesForConfigure,
        })
        lastConfiguredKey = configureKey
      }
      logTalcCounters(`after-configure(baseline) id=${id}`)
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
      // (b) the payload sends it to the main thread. Computing here and passing
      // precomputedImprovementChances to evaluateAndCollectSafeguardProtection suppresses the
      // internal fallback, avoiding a second WASM call and second peak-allocation for the Vec.
      // Gated on either threshold presence (detection needs it) or the caller opt-in flag.
      const hasThreshold = payload.safeguards.rules.some(
        (r) => r.improvementChanceThreshold !== null && r.improvementChanceThreshold !== undefined,
      )
      const needsImprovementChance = hasThreshold || payload.computeImprovementChance
      if (needsImprovementChance) {
        const improvResult = computeImprovementChanceWithLoadedWasm({
          rules: payload.safeguards.rules,
          enabled: payload.safeguards.enabled,
          debug: false,
        })
        // Store entries for the payload (null when caller didn't opt in).
        improvementChanceEntries = payload.computeImprovementChance ? (improvResult?.entries ?? null) : null
        logTalcCounters(`after-improvementChance id=${id}`)
        if (runIsStale()) return
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
        precomputedImprovementChances: improvementChanceEntries ?? [],
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

    // Use shared components so flattenRuleBatches is not called a second time.
    const mergedRulesFinal = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: {
        ...payload.safeguards,
        detection: safeguardDetectionSnapshot,
      },
    })
    logTalcCounters(`after-mergedRulesFinal id=${id} rules=${mergedRulesFinal.length}`)

    // The final ruleset differs from baseline ONLY by the injected safeguard keep-rules +
    // anticipateGaps placeholders. An item's final gear-inspector verdict can therefore differ
    // from its baseline verdict ONLY when a safeguard keep-override can fire for it — i.e. when
    // the item is NOT already kept by a non-ignored recipe (`evaluate_item`'s allow_keep_override
    // gate, matcher_evaluator.rs). So the verdict can only change for the CANDIDATE set:
    //   baseline firstMatch is sold (or no match)  OR  kept by an `ignore_by_safeguards` recipe.
    // Every other item (kept by a non-ignored recipe) is provably untouched by the injected rules,
    // so its baseline verdict is already the final verdict. We therefore re-evaluate ONLY the
    // candidate subset against the final ruleset and reuse baseline for the rest — instead of a
    // second full O(N×M) scan. Verified (changedOutsideCandidate=0) across all example DBs ×
    // 3 override tiers and gated by tests/repro/safeguard-verdict-golden.ts (per-item equivalence).
    const detectionFoundNothing = safeguardDetectionSnapshot != null
      && safeguardDetectionSnapshot.entries.length === 0
    let matches: GearInspectorMatchWorkerItemResult[]
    if (needsDetection && detectionFoundNothing) {
      // Copy results from the baseline map in artifact order.
      matches = artifactEntries.map(([itemId]) => baselineMatchMap.get(itemId) ?? {
        itemId,
        firstMatch: null,
        firstNonExcludedMatch: null,
        matchingRecipeIndices: [],
        matchingRecipeDecisions: [],
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
      // Merge: candidates take their freshly-evaluated final verdict; everyone else reuses the
      // baseline verdict (already the final verdict for non-candidates).
      const candidateById = new Map(candidateMatches.map((m) => [m.itemId, m]))
      matches = artifactEntries.map(([itemId]) =>
        candidateById.get(itemId)
        ?? baselineMatchMap.get(itemId)
        ?? { itemId, firstMatch: null, firstNonExcludedMatch: null, matchingRecipeIndices: [], matchingRecipeDecisions: [] },
      )
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
    // Reuse the key computed for the rules cache above — same composite signal (SSOT).
    const recipeKey = rulesCacheKey
    const rulesUnchanged =
      lastSentKeys !== null &&
      // Safety net: any change in rule count guarantees content changed, regardless of
      // whether all fingerprints caught it. Catches gaps in the three keys below.
      mergedRulesFinal.length === lastSentMergedCount &&
      recipeKey === lastSentRecipeKey &&
      detectionKey === lastSentDetectionKey &&
      keysEqual(lastSentKeys, pipelineState.keys)

    if (!rulesUnchanged) {
      // Capture sentinels before the response object is handed off (separate .slice()
      // calls ensure lastSentKeys and the response's keys array don't alias each other).
      lastSentKeys = pipelineState.keys.slice()
      lastSentRecipeKey = recipeKey
      lastSentDetectionKey = detectionKey
      lastSentMergedCount = mergedRulesFinal.length
    }

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
    const mergedRulesHash = computeExportedHsfFingerprint(mergedRulesFinal, { recipeNames: exportRecipeNames })

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
        safeguardDetection: safeguardDetectionSnapshot,
        improvementChanceEntries,
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
    }
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
