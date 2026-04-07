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
  computeImprovementChanceWithLoadedWasm,
  configureWasmRuleEngine,
  evaluateWasmRuleEngineItems,
  finalizeGeneratedRulesWithLoadedWasm,
  getWasmLinearMemoryBytes,
  getWasmRuleEngineVersion,
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
// When these match the current pipeline output, rulesByRecipeEntries/mergedRules/keys
// are sent as null, skipping the structured-clone of ~50–100 MiB on artifact-only bursts.
let lastSentKeys: string[] | null = null
let lastSentSubstatTargetsKey: string | null = null
let lastSentTotalLimitHit = false
let lastSentTruncatedCount = 0

// O(N) element-wise comparison; no allocation.
// V8 terminates at pointer equality for identical strings (common case for large fingerprints).
const keysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
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
const yieldWorkerMacrotask = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    self.setTimeout(() => resolve(), 0)
  })
}

const notePipelineGeneration = (generation: number): void => {
  if (generation > latestPipelineGeneration) latestPipelineGeneration = generation
}

const pipelineGenerationIsStale = (generation: number): boolean => generation < latestPipelineGeneration

// Relay a [sfc-diag] line to the main thread via postMessage so it reaches
// page.on('console') in Playwright (worker console.log does not fire that event).
// The main thread consumer logs it with console.log so it also appears in DevTools.
const postDiagnostic = (text: string): void => {
  const response: RuleCacheWorkerResponse = { kind: 'diagnostic', text }
  self.postMessage(response)
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

// Warmup is mandatory because configure/evaluate run through loaded wasm state.
const ensureWasmWorkerReady = async (): Promise<void> => {
  if (!wasmWarmupPromise) wasmWarmupPromise = warmupWasmRuleEngine()
  await wasmWarmupPromise
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
        const storedMsg = `[sfc-diag] store-rows count=${detectionRows.length} (stored) wasm-linear-mem=${(getWasmLinearMemoryBytes() / 1048576).toFixed(2)}MiB`
        // Both: DevTools visibility for manual debugging + postMessage relay for Playwright.
        console.log(storedMsg)
        postDiagnostic(storedMsg)
      } else {
        const skippedMsg = `[sfc-diag] store-rows count=${artifactEntries.length} (skipped-unchanged) wasm-linear-mem=${(getWasmLinearMemoryBytes() / 1048576).toFixed(2)}MiB`
        console.log(skippedMsg)
        postDiagnostic(skippedMsg)
      }
      // Pass baselineExcludeSources so keep-override sources are excluded from the
      // safeguard base-match the same way as the regular evaluate pass.
      const detectionOptions = hasActiveSafeguards
        ? { baselineExcludeSources: SAFEGUARD_OVERRIDE_RULE_SOURCES }
        : undefined
      // The WASM engine reads stored rows directly; improvement-chance pre-computation
      // happens inside evaluateAndCollectSafeguardProtection when a threshold is set.
      const detectionResult = evaluateAndCollectSafeguardProtection({
        ...(detectionOptions ? { options: detectionOptions } : {}),
        rules: payload.safeguards.rules,
        enabled: payload.safeguards.enabled,
        ignoreSafeguardRecipeIndices,
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
      // Compute improvement-chance percentages in WASM while stored_rows are still fresh.
      // Gated on the caller opt-in flag; skipped when safeguards are off (needsDetection already
      // ensures safeguards.enabled && rules.length > 0 && artifacts.length > 0).
      if (payload.computeImprovementChance) {
        improvementChanceEntries = computeImprovementChanceWithLoadedWasm({
          rules: payload.safeguards.rules,
          enabled: payload.safeguards.enabled,
        })
        if (runIsStale()) return
      }
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
    // on detection results (not just recipe fingerprints) — always send the full payload.
    const safeguardsInjecting =
      safeguardDetectionSnapshot !== null && safeguardDetectionSnapshot.entries.length > 0
    // Check whether the per-recipe rule data is identical to what the main thread already
    // holds. If so, send null for the three large fields to skip structured-cloning ~50–100 MiB
    // on artifact-only endpoint bursts (the dominant cause of JS heap growth / OOM crashes).
    const rulesUnchanged =
      !safeguardsInjecting &&
      lastSentKeys !== null &&
      pipelineState.substatTargetsKey === lastSentSubstatTargetsKey &&
      pipelineState.totalLimitHit === lastSentTotalLimitHit &&
      pipelineState.truncatedRecipeIndices.length === lastSentTruncatedCount &&
      keysEqual(lastSentKeys, pipelineState.keys)

    if (rulesUnchanged) {
      const skipMsg = `[sfc-diag] rules-clone skipped merged-count=${mergedRulesFinal.length}`
      console.log(skipMsg)
      postDiagnostic(skipMsg)
    } else {
      // Capture sentinels before the response object is handed off (separate .slice()
      // calls ensure lastSentKeys and the response's keys array don't alias each other).
      lastSentKeys = pipelineState.keys.slice()
      lastSentSubstatTargetsKey = pipelineState.substatTargetsKey
      lastSentTotalLimitHit = pipelineState.totalLimitHit
      lastSentTruncatedCount = pipelineState.truncatedRecipeIndices.length
      const sentMsg = `[sfc-diag] rules-clone sent merged-count=${mergedRulesFinal.length}`
      console.log(sentMsg)
      postDiagnostic(sentMsg)
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
      },
    }
    self.postMessage(response)
  } catch (error) {
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
