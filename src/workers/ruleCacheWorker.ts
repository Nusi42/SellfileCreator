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

// True only on the Vite dev server (replaced to `false` in production builds by Vite).
// Used as a dead-code eliminator: all devLog / devTimer calls compile away in prod.
const IS_DEV = import.meta.env.DEV

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
// When all seven match the current pipeline output, rulesByRecipeEntries/mergedRules/keys
// are sent as null, skipping the structured-clone of ~50–100 MiB on artifact-only bursts.
let lastSentKeys: string[] | null = null
let lastSentSubstatTargetsKey: string | null = null
let lastSentTotalLimitHit = false
// XOR-multiply hash over truncatedRecipeIndices to detect both count and identity
// changes. A length-only check would miss swaps between identically-keyed recipes.
let lastSentTruncatedHash = 0
// Captures omitDisabledBeforeSafeguards, dedupeBeforeSafeguards, safeguards.enabled,
// safeguards.rules.length, and presence of finalSellRemainder — all inputs to
// computeMergedRulesFromComponents that are NOT reflected in pipelineState.keys.
let lastSentMergeFlags: string | null = null
// Fingerprint of the safeguard detection entries that drove the last sent mergedRulesFinal.
// scannedAt is excluded (changes every run but does not affect merged rules).
// Covers which entries were detected, their placeholder contents, and itemKeys identity.
let lastSentDetectionKey: string | null = null
// Safety-net sentinel: the merged rule count of the most recently sent full payload.
// A count change guarantees rule content changed regardless of fingerprint matches,
// and catches any fingerprint gap not covered by the six keys above.
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

// Cheap string key capturing all safeguard-merge inputs not in pipelineState.keys.
// Boolean flags are encoded as bits; rule count catches add/remove without needing
// to stringify each rule (content changes are rare and would show up in detection anyway).
// finalSellRemainder content is fully encoded (not just presence) because changing
// levels, setsMode, or artifact/accessory toggles produces different merged output
// even though the field remains non-null.
const computeMergeFlags = (
  payload: Extract<RuleCacheWorkerRequest, { kind: 'pipeline' }>['payload'],
): string => {
  const { omitDisabledBeforeSafeguards: omit, dedupeBeforeSafeguards: dedup, safeguards } = payload
  const fsr = payload.finalSellRemainder
  // Encode each field of FinalSellRemainderConfig independently so any change is visible.
  const fsrKey = fsr == null
    ? '0'
    : `1${fsr.artifacts ? 1 : 0}${fsr.accessories ? 1 : 0}${fsr.setsMode ?? ''}${Array.isArray(fsr.levels) ? fsr.levels.join(',') : ''}`
  return `${omit ? 1 : 0}${dedup ? 1 : 0}${safeguards.enabled ? 1 : 0}${safeguards.rules.length}${fsrKey}`
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

// Emit a trace line to DevTools and the diagnostic relay.
// No-ops in production builds (IS_DEV is a Vite compile-time constant → dead code).
const devLog = IS_DEV
  ? (msg: string): void => {
    console.log(msg)
    postDiagnostic(msg)
  }
  : (msg: string): void => { void msg /* stripped in prod by Vite dead-code elimination */ }

// Returns a zero-argument lambda that logs elapsed ms when called.
// Usage: const done = devTimer('label'); ... done()
const devTimer = IS_DEV
  ? (label: string): (() => void) => {
    const t0 = performance.now()
    return (): void => {
      devLog(`[sfc-trace] ${label} ${(performance.now() - t0).toFixed(1)}ms`)
    }
  }
  : (_label: string): (() => void) => (): void => { /* stripped in prod */ }

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
    devLog(`[sfc-trace] pipeline start id=${id} recipes=${payload.recipes.length} artifacts=${payload.artifacts.length}`)
    const doneState = devTimer('buildPipelineState')
    const { state: pipelineState } = buildPipelineState(payload)
    doneState()
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
    const doneComponents = devTimer('buildMergedRulesComponents')
    const sharedComponents: MergedRulesComponents = buildMergedRulesComponents({
      hsf: payload.hsf,
      customRecipes: recipesForRules,
      metasets: payload.metasets,
      substatTargets: payload.substatTargets,
      prebuiltCustomRules,
    })
    doneComponents()
    const mergeParams = {
      ...(payload.finalSellRemainder ? { finalSellRemainder: payload.finalSellRemainder } : {}),
      omitDisabledBeforeSafeguards: payload.omitDisabledBeforeSafeguards,
      dedupeBeforeSafeguards: payload.dedupeBeforeSafeguards,
    }

    const doneBaseline = devTimer('mergedRulesBaseline')
    const mergedRulesBaseline = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: baseSafeguards,
    })
    doneBaseline()

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
        const doneImprovChance = devTimer('computeImprovementChance')
        const improvResult = computeImprovementChanceWithLoadedWasm({
          rules: payload.safeguards.rules,
          enabled: payload.safeguards.enabled,
          // Pass debug flag so WASM populates perf counters in dev only.
          debug: IS_DEV,
        })
        doneImprovChance()
        // Store entries for the payload (null when caller didn't opt in).
        improvementChanceEntries = payload.computeImprovementChance ? (improvResult?.entries ?? null) : null
        if (IS_DEV && improvResult?.diag != null) {
          const d = improvResult.diag
          devLog(
            `[sfc-trace] improvChance-diag rows=${d.rowCount} rules=${d.ruleCount}` +
            ` scenarios=${d.scenarioCount} withScenarios=${d.artifactsWithScenarios} viable=${d.artifactsViable}`,
          )
        }
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
    const doneFinal = devTimer('mergedRulesFinal')
    const mergedRulesFinal = computeMergedRulesFromComponents(sharedComponents, {
      ...mergeParams,
      safeguards: {
        ...payload.safeguards,
        detection: safeguardDetectionSnapshot,
      },
    })
    doneFinal()

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
      const doneMatchPass = devTimer(`matchPass artifacts=${artifactEntries.length} rules=${mergedRulesFinal.length}`)
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
      doneMatchPass()
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
    // mergedRulesFinal depends on: recipe keys + substat targets + totalLimitHit +
    // truncatedRecipeIndices identity + merge flags (omitDisabled, dedupe, safeguards.enabled/count,
    // finalSellRemainder content) + safeguard detection entries (drive placeholder injection).
    const detectionKey = computeDetectionKey(safeguardDetectionSnapshot)
    const mergeFlags = computeMergeFlags(payload)
    // XOR-multiply hash over truncated recipe indices — catches both count and
    // identity changes (a length-only check would miss swaps between equal-key recipes).
    let truncatedHash = pipelineState.truncatedRecipeIndices.length
    for (const idx of pipelineState.truncatedRecipeIndices) {
      truncatedHash = Math.imul(truncatedHash ^ idx, 0x9e3779b9) | 0
    }
    const rulesUnchanged =
      lastSentKeys !== null &&
      // Safety net: any change in rule count guarantees content changed, regardless of
      // whether all fingerprints caught it. Catches gaps in the six keys below.
      mergedRulesFinal.length === lastSentMergedCount &&
      pipelineState.substatTargetsKey === lastSentSubstatTargetsKey &&
      pipelineState.totalLimitHit === lastSentTotalLimitHit &&
      truncatedHash === lastSentTruncatedHash &&
      mergeFlags === lastSentMergeFlags &&
      detectionKey === lastSentDetectionKey &&
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
      lastSentTruncatedHash = truncatedHash
      lastSentMergeFlags = mergeFlags
      lastSentDetectionKey = detectionKey
      lastSentMergedCount = mergedRulesFinal.length
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
    if (IS_DEV) {
      // Rough postMessage payload size: JSON is a proxy for structured-clone byte cost.
      // Only serialise a sample of large fields to keep the tracing overhead low.
      const mergedSize = rulesUnchanged ? 0 : mergedRulesFinal.length
      const matchesSize = matches.length
      const detectionEntries = safeguardDetectionSnapshot?.entries.length ?? 0
      const wamLinearMib = (getWasmLinearMemoryBytes() / 1048576).toFixed(2)
      devLog(
        `[sfc-trace] postMessage id=${id} merged=${mergedSize} matches=${matchesSize}` +
        ` detection-entries=${detectionEntries} rulesUnchanged=${rulesUnchanged}` +
        ` wasm-linear=${wamLinearMib}MiB`,
      )
    }
    self.postMessage(response)
  } catch (error) {
    if (runIsStale()) return
    postError(id, error)
  }
}

export {}
