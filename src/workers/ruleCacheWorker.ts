/* eslint-disable import/no-unused-modules */
/// <reference lib="webworker" />

import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../lib/ruleCache'
import {
  KEEP_OVERRIDE_RULE_SOURCES as SAFEGUARD_OVERRIDE_RULE_SOURCES,
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  type MergedRulesComponents,
} from '../lib/merge'
import { recipesForRuleBuild } from '../lib/ruleCacheHelpers'
import {
  buildIgnoreSafeguardRecipeIndices,
  evaluateAndCollectSafeguardProtection,
  hasActiveSafeguardRules,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  toWasmTestItem,
} from '../lib/safeguards'
import type { SafeguardDetectionSnapshot } from '../lib/safeguards'
import type { NormalizedGearArtifact } from '../lib/importers/gearDbNormalizer'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { BuilderRecipe, SellfileExportMode, SubstatTargetTable } from '../lib/hsfBuilder'
import type { GearInspectorMatchWorkerItemResult } from './gearInspectorMatchWorkerTypes'
import type { RuleCacheWorkerRequest, RuleCacheWorkerResponse } from './ruleCacheWorkerTypes'
import { resolveArtifactItemIdWithFallback } from '../lib/itemIdentity'
import {
  clearStoredRowsWithLoadedWasm,
  preWarmHeapWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmLinearMemoryBytes,
  getWasmRuleEngineVersion,
  resetWasmInstance,
  warmupWasmRuleEngine,
} from '../lib/wasm/wasmRuleEngine'
import type { ImprovementChanceWasmEntry } from '../lib/wasm/wasmRuleEngine'
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
let wasmWarmupPromise: Promise<void> | null = null
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
// merge flags (omitDisabled, dedupe, safeguards.enabled/count, finalSellRemainder content).
// Stored as a single string because all four are cheap primitives — comparing one string
// is equivalent to four separate comparisons with no extra allocation at comparison time.
let lastSentRecipeKey: string | null = null
// Fingerprint of the safeguard detection entries that drove the last sent mergedRulesFinal.
// scannedAt is excluded (changes every run but does not affect merged rules).
// Covers which entries were detected, their placeholder contents, and itemKeys identity.
let lastSentDetectionKey: string | null = null
// Safety-net sentinel: the merged rule count of the most recently sent full payload.
// A count change guarantees rule content changed regardless of fingerprint matches,
// and catches any fingerprint gap not covered by the three keys above.
let lastSentMergedCount = -1

// O(N) element-wise comparison; no allocation.
// V8 terminates at pointer equality for identical strings (common case for large fingerprints).
const keysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Single composite key encoding everything that determines mergedRulesFinal
// except (a) pipelineState.keys (compared element-wise for speed) and
// (b) the detection snapshot (covered by lastSentDetectionKey).
// Includes: substatTargetsKey, totalLimitHit, truncatedRecipeIndices identity,
// omitDisabledBeforeSafeguards, dedupeBeforeSafeguards, safeguards.enabled/count,
// and full finalSellRemainder content.
const computeRecipeKey = (
  pipelineState: PipelineState,
  payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload'],
): string => {
  const { omitDisabledBeforeSafeguards: omit, dedupeBeforeSafeguards: dedup, safeguards } = payload
  const fsr = payload.finalSellRemainder
  // Encode each field of FinalSellRemainderConfig independently so any change is visible.
  const fsrKey = fsr == null
    ? '0'
    : `1${fsr.artifacts ? 1 : 0}${fsr.accessories ? 1 : 0}${fsr.setsMode ?? ''}${Array.isArray(fsr.levels) ? fsr.levels.join(',') : ''}`
  // XOR-multiply hash over truncatedRecipeIndices — catches both count and identity changes.
  let truncatedHash = pipelineState.truncatedRecipeIndices.length
  for (const idx of pipelineState.truncatedRecipeIndices) {
    truncatedHash = Math.imul(truncatedHash ^ idx, 0x9e3779b9) | 0
  }
  return `${pipelineState.substatTargetsKey}|${pipelineState.totalLimitHit ? 1 : 0}|${truncatedHash}|${omit ? 1 : 0}${dedup ? 1 : 0}${safeguards.enabled ? 1 : 0}${safeguards.rules.length}${fsrKey}`
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

// Compute a 32-bit integer hash over the mutable fields of each store row:
//   id            — artifact added or removed
//   level         — upgrade (also bounds which substats are unlocked)
//   rank          — rank promotion
//   substats.length — new sub added at levels 4/8/12/16
//   Σ totalValue  — glyph application or substat value increase on upgrade
//   equippedChampionLocation — artifact moved to/from champion / vault
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
    const loc = a.equippedChampionLocation
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

// Returns true when err is a WASM OOM abort (unreachable instruction trap).
// V8: "RuntimeError: unreachable"   SpiderMonkey: "RuntimeError: unreachable executed"
// When this fires the WASM linear heap is corrupted — every subsequent call also fails.
// Caller must call resetWasmInstance() so the next pipeline starts with a fresh heap.
const isWasmOom = (err: unknown): boolean =>
  err instanceof Error &&
  err.constructor.name === 'RuntimeError' &&
  err.message.includes('unreachable')

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

// Warmup is mandatory because configure/evaluate run through loaded wasm state.
// On failure the cached promise is cleared so the next pipeline request can retry
// rather than getting stuck on a permanently-rejected promise for the worker's lifetime.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) wasmWarmupPromise = warmupWasmRuleEngine()
  try {
    await wasmWarmupPromise
  } catch (error) {
    wasmWarmupPromise = null
    throw error
  }
}

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
    // Trim to only WASM-needed fields — see toWasmTestItem for why passing the full item causes Chrome OOM.
    const batchItems = batchEntries.map(([itemId, artifact]) => ({ itemId, item: toWasmTestItem(artifact.gearInspectorItem) }))
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

  if (message.kind !== 'pipeline') return
  const { id, payload } = message
  const pipelineGeneration = Number.isFinite(payload.generation) ? Number(payload.generation) : id
  notePipelineGeneration(pipelineGeneration)
  const runIsStale = (): boolean => pipelineGenerationIsStale(pipelineGeneration)

  try {
    const { state: pipelineState } = buildPipelineState(payload)
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
    const mergeParams = {
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
    }

    const mergedRulesBaseline = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: baseSafeguards,
    })

    // ignoreSafeguardRecipeIndices is needed by both detection and final passes.
    const ignoreSafeguardRecipeIndices = buildIgnoreSafeguardRecipeIndices(recipesForRules)
    const baselineMatchMap = new Map<number, GearInspectorMatchWorkerItemResult>()
    let safeguardDetectionSnapshot: SafeguardDetectionSnapshot | null = null
    // Populated inside needsDetection branch when payload.computeImprovementChance is true.
    let improvementChanceEntries: ImprovementChanceWasmEntry[] | null = null
    if (needsDetection) {
      // Configure baseline rules so the combined WASM evaluate+collect call uses them.
      await configureWasmRuleEngine({
        rules: mergedRulesBaseline,
        recipeModes: Array.isArray(payload.recipeModes) ? payload.recipeModes : [],
      })
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
        // Prewarm the talc heap before improvement-chance using the same artifact-count
        // formula as eval-collect: ceil(n * 4096 / 16 MiB) × 16 MiB, minimum 16 MiB.
        // Improvement-chance uses a large HashMap memo table; its growth path triggers
        // memory.grow inside a WASM call where we have no control over the grow size.
        // Pre-growing here (outside the critical path) forces any needed memory.grow now,
        // leaving a fresh contiguous block ready for the first HashMap resize.
        // If the block is already available the call is a no-op (Vec finds a free block,
        // drop returns it — no grow, no net allocation change).
        const PAGE_16MIB = 16 * 1024 * 1024
        const improvChancePrewarmBytes =
          Math.ceil((artifactEntries.length * 4096) / PAGE_16MIB) * PAGE_16MIB
        preWarmHeapWithLoadedWasm(improvChancePrewarmBytes) // 32 MiB for ~7982 items
        const improvResult = computeImprovementChanceWithLoadedWasm({
          rules: payload.safeguards.rules,
          enabled: payload.safeguards.enabled,
          debug: false,
        })
        // Store entries for the payload (null when caller didn't opt in).
        improvementChanceEntries = payload.computeImprovementChance ? (improvResult?.entries ?? null) : null
        if (runIsStale()) return
      }
      // Pass baselineExcludeSources so keep-override sources are excluded from the
      // safeguard base-match the same way as the regular evaluate pass.
      const detectionOptions = hasActiveSafeguards
        ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES }
        : undefined
      // Pre-grow the WASM heap before the most allocation-intensive call in the pipeline.
      // evaluateAndCollectSafeguardProtection builds per-item result Vecs, a candidates
      // Vec, and intermediate match buffers proportional to artifact count × rule count.
      // On V8/Windows a memory.grow *during* the call causes STATUS_ACCESS_VIOLATION;
      // growing here (before the call) forces that grow into a context where the OS is
      // more likely to grant it.  ~4 KiB per artifact is a rough working-set estimate
      // for the BucketedRules evaluate pass; round up to the nearest 16 MiB grow page.
      const evalCollectPrewarmBytes = Math.ceil((artifactEntries.length * 4096) / (16 * 1024 * 1024)) * (16 * 1024 * 1024)
      if (evalCollectPrewarmBytes > 0) preWarmHeapWithLoadedWasm(evalCollectPrewarmBytes)
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

    // Optimisation: when detection found nothing to protect (no injected safeguard
    // rules), the final merged rules are functionally identical to baseline and the
    // baseline match map is already authoritative. Skip the second O(N×M) scan.
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
    } else {
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
    const recipeKey = computeRecipeKey(pipelineState, payload)
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

    const response: RuleCacheWorkerResponse = {
      id,
      kind: 'pipeline:done',
      payload: {
        rulesByRecipeEntries: rulesUnchanged ? null : Array.from(prebuiltCustomRules.entries()),
        countsByRecipeEntries: Array.from(pipelineState.countsByRecipe.entries()),
        keys: rulesUnchanged ? null : pipelineState.keys.slice(),
        substatTargetsKey: pipelineState.substatTargetsKey,
        mergedRules: rulesUnchanged ? null : mergedRulesFinal,
        truncatedRecipeIndices: pipelineState.truncatedRecipeIndices.slice(),
        totalLimitHit: pipelineState.totalLimitHit,
        excludedByTotalLimitIndices: pipelineState.excludedByTotalLimitIndices.slice(),
        matches,
        safeguardDetection: safeguardDetectionSnapshot,
        improvementChanceEntries,
        // Snapshot taken after all WASM work completes; lets the hook decide when to
        // proactively restart the worker to keep the heap from growing past the
        // memory.grow failure threshold (~160+ MiB on V8/Windows).
        wasmLinearBytes: getWasmLinearMemoryBytes(),
      },
    }
    self.postMessage(response)
    // True heap resets happen in the main thread via cycleWorkerProactively
    // (PIPELINE_RESTART_INTERVAL=3) which terminates and respawns the worker.
    // An in-worker resetWasmInstance() call cannot produce a clean heap because
    // wasm-bindgen's initRuleEngineWasm is idempotent — it returns the cached
    // instance without re-instantiating it.
  } catch (error) {
    if (isWasmOom(error)) {
      // WASM heap is corrupted after an OOM abort (RuntimeError: unreachable).
      // Reset both the init flags and the warmup promise so ensureWasmWorkerReady()
      // fully reinitializes on the next pipeline.  The main thread will typically
      // replace this worker upon receiving the postError below, making these resets
      // redundant; they are a fallback for the stale-run path where postError is
      // skipped and the worker would otherwise sit with wasmInitialized=false.
      resetWasmInstance()
      wasmWarmupPromise = null
    }
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
