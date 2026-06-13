// ruleEngineWasmBytes re-exports __RULE_ENGINE_WASM_INLINE__ (injected by wasmInlinePlugin)
// as a named export so wasmRuleEngine.ts never directly references the define constant.
// In worker builds suppressWasmUrlPlugin stubs this module so the WASM bytes stay out of
// the worker IIFE; in Node.js tests it falls back to '' and the URL-based init path is used.
import { ruleEngineWasmDataUri } from './ruleEngineWasmBytes'
import initRuleEngineWasm, {
  initSync as initSyncRuleEngine,
  auto_rarity_addition_levels_for_code_value as autoRarityAdditionLevelsForCodeWasmValueBinding,
  auto_rarity_includes_mythical_for_code_value as autoRarityIncludesMythicalForCodeWasmValueBinding,
  auto_rarity_roll_levels_for_code_value as autoRarityRollLevelsForCodeWasmValueBinding,
  build_hsf_rules_runtime_value as buildHsfRulesRuntimeWasmValueBinding,
  build_final_sell_rules_value as buildFinalSellRulesWasmValueBinding,
  build_safeguard_rules_value as buildSafeguardRulesWasmValueBinding,
  combinations_i32_fast_flat as combinationsI32FastFlatWasmBinding,
  collect_safeguard_candidates_value as collectSafeguardCandidatesWasmValueBinding,
  collect_and_compute_safeguard_protection_value as collectAndComputeSafeguardProtectionWasmValueBinding,
  evaluate_and_collect_safeguard_protection_value as evaluateAndCollectSafeguardProtectionWasmValueBinding,
  store_artifact_rows_value as storeArtifactRowsWasmValueBinding,
  clear_stored_rows_value as clearStoredRowsWasmBinding,
  prewarm_heap_value as preWarmHeapWasmBinding,
  compute_improvement_chance_value as computeImprovementChanceWasmValueBinding,
  cache_generated_rules_value as cacheGeneratedRulesWasmValueBinding,
  compute_merged_rules_cached_value as computeMergedRulesCachedWasmValueBinding,
  compute_safeguard_protection_value as computeSafeguardProtectionValueWasmBinding,
  dedupe_hsf_rules_for_export_value as dedupeHsfRulesForExportWasmValueBinding,
  expand_auto_flex_rarity_branches_value as expandAutoFlexRarityBranchesWasmValueBinding,
  flatten_rule_batches_with_total_limit_value as flattenRuleBatchesWithTotalLimitWasmValueBinding,
  configure_value as configureRuleEngineWasmValueBinding,
  evaluate_value as evaluateRuleEngineWasmValueBinding,
  finalize_generated_rules_value as finalizeGeneratedRulesWasmValueBinding,
  find_obsolete_value as findObsoleteRuleEngineWasmValueBinding,
  hash_safeguard_combination_value as hashSafeguardCombinationWasmValueBinding,
  intro_assignments_for_combo_fast_flat as introAssignmentsForComboFastFlatWasmBinding,
  safeguard_count_key_value as safeguardCountKeyValueWasmBinding,
  safeguard_group_key_value as safeguardGroupKeyValueWasmValueBinding,
  safeguard_item_key_value as safeguardItemKeyValueWasmValueBinding,
  merge_safeguard_injected_rules_value as mergeSafeguardInjectedRulesWasmValueBinding,
  normalize_safeguard_expected_group_domain_value as normalizeSafeguardExpectedGroupDomainWasmValueBinding,
  prepare_hsf_builder_recipe_value as prepareHsfBuilderRecipeWasmValueBinding,
  resolve_safeguard_rules_with_metasets_value as resolveSafeguardRulesWithMetasetsWasmValueBinding,
  resolve_auto_rarity_code_for_builder_value as resolveAutoRarityCodeForBuilderWasmValueBinding,
  permutations_i32_fast_flat as permutationsI32FastFlatWasmBinding,
  sort_safeguard_combination_value as sortSafeguardCombinationWasmValueBinding,
  sort_safeguard_substats_value as sortSafeguardSubstatsWasmValueBinding,
  score_safeguard_candidates_value as scoreSafeguardCandidatesWasmValueBinding,
  version as ruleEngineWasmVersionBinding,
  wasm_linear_memory_bytes as wasmLinearMemoryBytesBinding,
  pre_grow_memory_value as preGrowMemoryWasmBinding,
} from './generated/rule_engine.js'
import type { GeneratedBranchRuleEntry, HsfRuleWithRecipe } from '../merge'
import type { HsfRule } from '../hsfTypes'
import type { BuilderRecipe, SellfileExportMode } from '../hsfBuilder'
import {
  resolveImprovementChanceThresholds,
  toWasmImprovementChanceInput,
  toWasmSafeguardCandidate,
  toWasmSafeguardCollectRow,
  type SafeguardCandidate,
  type SafeguardCandidateOut,
  type SafeguardDetectionSnapshot,
  type SafeguardRule,
  type SafeguardRuleCountMode,
} from '../safeguards'
import type { FinalSellRemainderConfig } from '../logicHub'
import type { GearInspectorMatchWorkerEvaluateItem, GearInspectorMatchWorkerItemResult } from '../../workers/gearInspectorMatchWorkerTypes'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import type { TestItem } from '../ruleEval'
import { isAccessorySlot } from '../gearInspectorDomain'
// Wire projection / expansion helpers for the WASM boundary.
// The Rust #[serde(rename = "short")] attrs are the SSOT; wireProjections.ts is the TS side.
import {
  minifyRuleRawForWire,
  expandRuleRawFromWire,
  expandSafeguardSnapshotFromWire,
  projectSafeguardSnapshotForWire,
  projectSafeguardExpectedGroupDomainForWire,
  projectAutoFlexRarityRecipeForWire,
  expandAutoFlexRarityBranchFromWire,
  type SafeguardWasmSnapshotOutWire,
} from './wireProjections'
// Generated TS interfaces from `#[derive(TS)]` on rule_engine_core /
// rule_engine_wasm output + input wire structs.  Drift between Rust + TS is
// impossible because these files are regenerated by `cargo test` during
// wasm:ensure.
// ObsoleteEntryOut is referenced transitively via ObsoleteReportOut.obsolete[]
// (ts-rs imports it inside the generated file); no need to import it here.
import type { ObsoleteReportOut } from './generated/rust-types/ObsoleteReportOut'
import type { SafeguardWasmCountMode } from './generated/rust-types/SafeguardWasmCountMode'
import type { SafeguardCollectedCandidateOut } from './generated/rust-types/SafeguardCollectedCandidateOut'
import type { SafeguardCollectedSnapshotOut } from './generated/rust-types/SafeguardCollectedSnapshotOut'
import type { ImprovementChanceDebug } from './generated/rust-types/ImprovementChanceDebug'
import type { ImprovementChancePerfDiag } from './generated/rust-types/ImprovementChancePerfDiag'
import type { ImprovementChanceRuleEntry } from './generated/rust-types/ImprovementChanceRuleEntry'
import type { ImprovementChanceEntry } from './generated/rust-types/ImprovementChanceEntry'
// Input wire structs — generated from `#[derive(TS)]` on the Rust input types.
// The projection helpers (toWasmArtifactStoreInput, etc.) now return these
// generated types directly, so a Rust field rename forces tsc errors at every
// helper return position.
import type { SafeguardWasmSubstatRawIn } from './generated/rust-types/SafeguardWasmSubstatRawIn'
import type { SafeguardWasmArtifactRawIn } from './generated/rust-types/SafeguardWasmArtifactRawIn'
import type { SafeguardWasmCandidateFastIn } from './generated/rust-types/SafeguardWasmCandidateFastIn'
import type { SafeguardCollectRowFastIn } from './generated/rust-types/SafeguardCollectRowFastIn'
import type { ImprovementChanceInput } from './generated/rust-types/ImprovementChanceInput'
import type { TestItemRaw } from './generated/rust-types/TestItemRaw'
import type { SafeguardWasmArtifactIn } from './generated/rust-types/SafeguardWasmArtifactIn'
export type { SafeguardWasmArtifactIn }

// Input-wire types — pure mirrors of the Rust `*RawIn` / `*FastIn` / `*Input`
// structs in rule_engine_core + rule_engine_wasm.  The hand-written variants
// that used to live here were replaced with aliases to the ts-rs generated
// types so a Rust rename forces tsc errors at every projection helper return
// position (validated by Phase D's rename test).  Every nullable field is
// emitted by ts-rs as `T | null` (matching the hand-written contract), so the
// "force the helper to acknowledge every field" protection is preserved.
export type WasmSubstatStoreInput = SafeguardWasmSubstatRawIn
export type WasmArtifactStoreInput = SafeguardWasmArtifactRawIn

// Compact row passed to store_artifact_rows_value.  The Rust side
// (SafeguardCollectRowFastIn) accepts `artifact` plus three optional fields
// (`item`, `baseMatchDefined`, `baseMatch`); the store-path call always sends
// just `artifact`, so we tighten the type here to a single-field record.  This
// stays drift-safe because tsc compares structurally against the underlying
// SafeguardWasmArtifactRawIn — a Rust rename on the artifact still fails here.
export type WasmArtifactStoreRow = { artifact: WasmArtifactStoreInput }

export type WasmSafeguardCandidateInput = SafeguardWasmCandidateFastIn
export type WasmSafeguardCollectRowInput = SafeguardCollectRowFastIn
export type WasmImprovementChanceInput = ImprovementChanceInput

// Trim a TestItem to only the fields TestItemRaw reads (wasm/rule_engine_core/src/lib.rs
// around line 244).  Must be applied before any TestItem crosses the JS↔WASM boundary —
// both for storeArtifactRows (store path) and evaluate_value (evaluate path).
//
// Two reasons this projection cannot be skipped:
//   1. Drift gate: previewExtras on the TS side (GearInspectorItemPreviewExtras) carries
//      9+ fields (source, rerollCount, equippedChampion, mainStat, substats, ascension,
//      exactLevel, lastUseLocalTimestamp, isLocked).  PreviewExtrasRaw on the Rust side
//      declares only `id`, with deny_unknown_fields.  After the evaluate_value JSON
//      migration, the JSON parse REJECTS the extras unless they are stripped here.
//   2. Memory: passing the full item forced serde_wasm_bindgen to traverse and allocate
//      Rust Strings for previewExtras.mainStat / .substats / .ascension on every artifact.
//      With large artifact sets (~8–25 k items) this caused hundreds of thousands of
//      unnecessary heap allocations → WASM heap fragmentation → Chrome renderer OOM.
//
// SSOT lives here (used by the evaluate wrappers below); re-exported from safeguards.ts
// for downstream consumers that import from the safeguards module.
//
// Returns the ts-rs-generated `TestItemRaw` shape rather than the domain `TestItem`
// so every field is explicit `T | null`: a future addition on the Rust side becomes
// a tsc error here, not a silently-dropped wire field. `itemId` is set to null
// because the per-item id is supplied separately by `EvaluateItemRaw.itemId` /
// the candidate wrapper — TestItemRaw still declares it for paths that send the
// raw item inline.
export const toWasmTestItem = (item: TestItem): TestItemRaw => ({
  slot: item.slot,
  set: item.set,
  rank: item.rank,
  rarity: item.rarity,
  level: item.level,
  // Non-accessories cannot carry faction; null signals Rust to skip the faction check.
  faction: isAccessorySlot(item.slot) ? (item.faction ?? null) : null,
  main: item.main ?? null,
  subValues: item.subValues ?? null,
  itemId: null,
  // Forward only previewExtras.id — every other extras field is not in PreviewExtrasRaw.
  previewExtras: item.previewExtras?.id != null ? { id: item.previewExtras.id } : null,
})

// Evaluate options mirror evaluateMatchesByRecipe inputs used by worker paths.
// The WASM engine accepts object values and applies the same source/recipe gating.
export type WasmRuleEngineEvaluateOptions = {
  excludeSources?: readonly string[]
  excludeRecipeIndices?: ReadonlySet<number>
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  baselineExcludeSources?: readonly string[]
}

type WasmRuleEngineEvaluatePayload = {
  // Excluded rule sources (e.g., safeguard injections) for baseline scans.
  excludeSources?: string[]
  // Baseline-specific source exclusions used by worker differential flows.
  baselineExcludeSources?: string[]
  // Explicit recipe indices to skip during matcher evaluation.
  excludeRecipeIndices?: number[]
  // Recipe indices ignored by safeguard precedence logic.
  ignoreSafeguardRecipeIndices?: number[]
}

// Internal cached init promise prevents duplicate wasm instantiation work.
// Workers call configure/evaluate repeatedly, so one init per worker is enough.
let wasmInitPromise: Promise<void> | null = null
let wasmInitialized = false
// Compiled WebAssembly.Module cached after first init so the rule-cache worker
// can receive it via postMessage (structured clone) instead of bundling WASM bytes twice.
let compiledWasmModule: WebAssembly.Module | null = null


// Sync helpers are used on hot paths that cannot await. Callers must warm up first.
const assertWasmInitializedSync = (): void => {
  if (!wasmInitialized) {
    throw new Error('WASM rule engine is not initialized. Call warmupWasmRuleEngine() first.')
  }
}

// Decode flat wasm int arrays into fixed-width rows without JSON parse costs.
// This helper is fail-closed so malformed wasm payloads surface immediately.
const unflattenI32Rows = (flat: Int32Array, rowWidth: number): number[][] => {
  if (!Number.isFinite(rowWidth) || rowWidth < 0) {
    throw new Error(`Invalid wasm row width: ${String(rowWidth)}`)
  }
  if (rowWidth === 0) {
    if (flat.length === 0) return [[]]
    throw new Error('WASM row decoder received non-empty payload for zero-width rows.')
  }
  if (flat.length % rowWidth !== 0) {
    throw new Error('WASM row decoder received a payload with mismatched row width.')
  }
  const rowCount = Math.floor(flat.length / rowWidth)
  const rows: number[][] = new Array(rowCount)
  for (let row = 0; row < rowCount; row += 1) {
    const start = row * rowWidth
    const values: number[] = new Array(rowWidth)
    for (let col = 0; col < rowWidth; col += 1) {
      values[col] = flat[start + col] ?? 0
    }
    rows[row] = values
  }
  return rows
}

// Keep conversion helpers branch-free on hot paths: if callers already prepared
// typed arrays, forward them directly instead of allocating/mapping again.
const toFlooredI32 = (values: ReadonlyArray<number> | Int32Array): Int32Array => {
  if (values instanceof Int32Array) return values
  const out = new Int32Array(values.length)
  for (let idx = 0; idx < values.length; idx += 1) {
    const value = values[idx] ?? 0
    out[idx] = Number.isFinite(value) ? Math.floor(value) : 0
  }
  return out
}

// Convert Set inputs into plain arrays before serializing into the WASM payload.
// This keeps call sites typed while preserving deterministic JSON output ordering.
const toSortedNumberArray = (input?: ReadonlySet<number>): number[] | undefined => {
  if (!input || input.size === 0) return undefined
  return Array.from(input).sort((a, b) => a - b)
}

// Build the single JSON-stringified payload accepted by evaluate_value (Rust side
// EvaluateValueInWire).  Both async and sync evaluate wrappers route through this
// helper so the wire-shape projection stays SSOT — adding a new field here is the
// only place TS needs to touch when the Rust wrapper grows.
//
// Items are projected through toWasmTestItem so the inner TestItem matches
// TestItemRaw EXACTLY — deny_unknown_fields on the Rust side rejects any stray
// previewExtras fields beyond `id`.  Options are emitted only when at least one
// filter is active; an empty object would still parse but skipping the key keeps
// the on-wire payload smaller and lets the Rust wrapper short-circuit via
// EvaluateOptionsRaw::default() instead of allocating an empty options struct.
// Exported so the DSIM wrapper (wasmDsimRuleEngine.ts) reuses the same payload
// shape and projection logic — both binaries consume the EvaluateValueInWire
// wrapper defined in rule_engine_core, so any drift here would diverge them.
export const buildEvaluatePayload = (
  items: GearInspectorMatchWorkerEvaluateItem[],
  options?: WasmRuleEngineEvaluateOptions,
): string => {
  // Normalize optional filters into the compact wasm payload shape.
  const optionsPayload = toEvaluateOptionsPayload(options)
  // Stringify a single object so the Rust side performs exactly one parse.
  return JSON.stringify({
    items: items.map((entry) => ({ itemId: entry.itemId, item: toWasmTestItem(entry.item) })),
    ...(Object.keys(optionsPayload).length ? { options: optionsPayload } : {}),
  })
}

// Keep options payload construction in one place so async/sync evaluate wrappers
// cannot drift when we add new selector toggles.
const toEvaluateOptionsPayload = (
  options?: WasmRuleEngineEvaluateOptions,
): WasmRuleEngineEvaluatePayload => {
  // Start empty and attach only fields that are present/non-empty.
  const payload: WasmRuleEngineEvaluatePayload = {}
  // Copy source blocklist only when callers explicitly requested one.
  if (options?.excludeSources && options.excludeSources.length > 0) {
    payload.excludeSources = Array.from(options.excludeSources)
  }
  // Copy baseline source blocklist only when explicitly requested.
  if (options?.baselineExcludeSources && options.baselineExcludeSources.length > 0) {
    payload.baselineExcludeSources = Array.from(options.baselineExcludeSources)
  }
  // Convert recipe index set into sorted array for deterministic payload shape.
  if (options?.excludeRecipeIndices && options.excludeRecipeIndices.size > 0) {
    const sorted = toSortedNumberArray(options.excludeRecipeIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.excludeRecipeIndices = sorted
  }
  // Convert safeguard ignore set into sorted array for deterministic payload shape.
  if (options?.ignoreSafeguardRecipeIndices && options.ignoreSafeguardRecipeIndices.size > 0) {
    const sorted = toSortedNumberArray(options.ignoreSafeguardRecipeIndices)
    // Guard the assignment so exact optional typing never receives undefined.
    if (sorted) payload.ignoreSafeguardRecipeIndices = sorted
  }
  // Return compact payload so wasm bindings only receive active filters.
  return payload
}

// Ensure the WASM binary is instantiated exactly once for this JS context.
//
// Browser / Vite build path: __RULE_ENGINE_WASM_INLINE__ is a base64 data URI injected
// by wasmInlinePlugin. The WASM bytes are decoded, compiled into a WebAssembly.Module,
// then passed to the wasm-bindgen async init. Compiling separately lets the rule-cache
// worker receive the module via postMessage without embedding the WASM bytes itself.
//
// Node.js test path: __RULE_ENGINE_WASM_INLINE__ is undefined. Fall back to the no-arg
// initRuleEngineWasm() call, which uses the original new URL(…) path inside rule_engine.js
// (the suppressWasmUrlPlugin only transforms rule_engine.js in Vite builds, not tsc output).
// wasm-warmup.ts patches fetch to serve file:// URLs from disk in that environment.
//
// On failure all caches are cleared so the next caller can retry.
const ensureWasmInitialized = async (): Promise<void> => {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      if (ruleEngineWasmDataUri) {
        const inlineUri = ruleEngineWasmDataUri
        // Browser path: decode the data URI, compile, then instantiate via the wasm-bindgen init.
        const commaIdx = inlineUri.indexOf(',')
        const base64 = inlineUri.slice(commaIdx + 1)
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i += 1) {
          bytes[i] = binaryStr.charCodeAt(i) ?? 0
        }
        // Compile first so the module can be transferred to the rule-cache worker.
        const module = await WebAssembly.compile(bytes.buffer)
        compiledWasmModule = module
        // Pass the compiled module directly so init skips the URL fallback path.
        await initRuleEngineWasm({ module_or_path: module })
      } else {
        // Node.js test path: use the URL-based init (wasm-warmup.ts patches fetch).
        await initRuleEngineWasm()
      }
      wasmInitialized = true
    })()
  }
  try {
    await wasmInitPromise
  } catch (error) {
    // Clear so the next pipeline request can attempt re-initialization.
    wasmInitPromise = null
    compiledWasmModule = null
    throw error
  }
}

// Returns the compiled WebAssembly.Module after warmup, or null before init.
// Used by useRuleCacheWorker to transfer the module to the rule-cache worker via
// postMessage so the worker's IIFE bundle does not embed the WASM bytes a second time.
export const getCompiledWasmRuleEngineModule = (): WebAssembly.Module | null => compiledWasmModule

// Initialize the rule engine using a WebAssembly.Module transferred from the main thread.
// Called inside the rule-cache worker when it receives the 'init-wasm' message.
// Uses initSync (synchronous instantiation) — no async needed when the module is already
// compiled and transferred. Pre-grows the WASM heap so memory.grow does not stall the
// first pipeline run (same as warmupWasmRuleEngine does on the main thread).
export const initWasmRuleEngineFromModule = (module: WebAssembly.Module): void => {
  if (wasmInitialized) return
  initSyncRuleEngine({ module })
  wasmInitialized = true
  // Satisfy any caller that might await ensureWasmRuleEngineReady() in this JS context.
  wasmInitPromise = Promise.resolve()
  // Pre-commit WASM pages for the pipeline allocator (same as warmupWasmRuleEngine).
  preGrowMemoryWasmBinding(preGrowTargetBytesForEngine())
}

// Pre-grow the WASM linear memory to a target size in 16 MiB chunks so
// dlmalloc never needs to call memory.grow during the pipeline hot path.
// V8/Windows rejects small incremental memory.grow calls under address-space
// pressure → Rust OOM abort → STATUS_BREAKPOINT with no JS-visible error.
// 256 MiB is enough headroom for ~45k merged rules + 8k artifacts + safeguards.
// Exported so useRuleCacheWorker can set its restart threshold above this level —
// a normal pipeline always reports ~256 MiB (from the pre-grow); a threshold below
// that causes the worker to cycle after every single pipeline instead of every N.
export const PRE_GROW_TARGET_BYTES = 256 * 1024 * 1024

// Detect the Gecko (Firefox) engine. `navigator` exists in both window and
// worker scopes, so this resolves correctly on the rule-cache worker too.
// userAgentData is Chromium-only, so its absence + a "Gecko"/"Firefox" UA token
// is a reliable Gecko signal; we keep it defensive for non-browser (Node test)
// contexts where navigator may be undefined.
const isGeckoEngine = (): boolean => {
  // Guard for Node/test contexts that lack a navigator entirely.
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // "Gecko" appears in the Firefox UA token (e.g. "...Gecko/20100101 Firefox/..").
  // Chromium UAs contain "like Gecko" but also expose userAgentData, so exclude those.
  const hasUserAgentData = 'userAgentData' in navigator && !!(navigator as { userAgentData?: unknown }).userAgentData
  return !hasUserAgentData && /Firefox/.test(ua)
}

// Resolve the pre-grow target for the current engine.
//
// The 256 MiB up-front commit is a V8/Windows-specific workaround: V8 rejects the
// small incremental memory.grow calls dlmalloc issues during the hot path, so we
// front-load the whole reservation at warmup. Gecko/SpiderMonkey honors incremental
// grows fine, so it gains nothing from the pre-grow — and the eager 256 MiB commit
// is actively harmful there: multiplied across the worker + main-thread WASM
// instances (and any transient sql.js import heap that peaks in the same window),
// it pushes the Firefox content process past its memory ceiling and SIGSEGVs it.
// On Gecko we return 0 (skip pre-grow) and let dlmalloc grow on demand.
const preGrowTargetBytesForEngine = (): number => (isGeckoEngine() ? 0 : PRE_GROW_TARGET_BYTES)

// Lightweight init for callers that need WASM ready but don't require the
// pipeline-sized heap pre-growth (e.g., main-thread scoring in the weight popover).
export const ensureWasmRuleEngineReady = (): Promise<void> => ensureWasmInitialized()

// Warmup helper allows callers with async control flow to preload the wasm
// module so later sync helpers (e.g., obsolete pruning) can run in-process.
export const warmupWasmRuleEngine = async (): Promise<void> => {
  await ensureWasmInitialized()
  // Pre-commit WASM pages for the pipeline allocator.  The Rust side grows in
  // 16 MiB chunks (V8/Windows' safe per-call ceiling) so a single large request
  // won't be rejected outright.  Any pages V8 refuses are silently skipped.
  // On Gecko the target resolves to 0 (skip) — see preGrowTargetBytesForEngine.
  preGrowMemoryWasmBinding(preGrowTargetBytesForEngine())
}

// Build the minified JSON configure payload. Rules are minified via the wire
// helpers (same format as compute_merged_rules_value) so Rust's serde_json
// path stays in linear memory and avoids the serde_wasm_bindgen externref /
// Vec::grow_one / realloc path that triggers talc deallocate OOB crashes.
const buildConfigurePayload = (
  rules: HsfRuleWithRecipe[],
  recipeModes: SellfileExportMode[],
): string => JSON.stringify({
  rules: rules.map(minifyRuleRawForWire),
  recipeModes,
})

// Configure the WASM engine with the merged rules + recipe mode visibility.
// This must run before evaluate, matching the existing worker configure flow.
export const configureWasmRuleEngine = async (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): Promise<void> => {
  // Ensure module init before invoking wasm configure binding.
  await ensureWasmInitialized()
  // Configure shared matcher state used by subsequent evaluate calls.
  configureRuleEngineWasmValueBinding(buildConfigurePayload(params.rules, params.recipeModes))
}

// Evaluate a batch of Gear Inspector items through the WASM matcher implementation.
// Results are parsed back into the existing worker item-result shape.
//
// Payload crosses the boundary as a single JSON string (EvaluateValueInWire on
// the Rust side) so serde_json::from_str activates deny_unknown_fields at both
// the wrapper and the per-item TestItemRaw level — serde-wasm-bindgen's
// from_value path cannot trigger deny_unknown_fields because its ObjectAccess
// iterates the Rust struct's declared fields rather than the JS object's own
// keys.  Each item.item is projected via toWasmTestItem because TS-side
// GearInspectorItemPreviewExtras carries fields beyond PreviewExtrasRaw's
// single `id` field; deny_unknown_fields rejects the rest.
export const evaluateWasmRuleEngineItems = async (params: {
  items: GearInspectorMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): Promise<GearInspectorMatchWorkerItemResult[]> => {
  // Ensure module init before invoking wasm evaluate binding.
  await ensureWasmInitialized()
  // Build the JSON wire payload — single stringify so the Rust side parses once.
  // Options are omitted entirely when empty so the Rust wrapper falls through to
  // EvaluateOptionsRaw::default() (matches the previous null/undefined semantics).
  const payloadJson = buildEvaluatePayload(params.items, params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(payloadJson)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  // Fail loudly on malformed payloads instead of masking with fallback rows.
  throw new Error('WASM matcher evaluate returned an invalid payload.')
}

// Sync configure helper is used by main-thread adapters that cannot await.
// Callers must run warmup first and then can configure on each ruleset swap.
export const configureWasmRuleEngineWithLoadedWasm = (params: {
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
}): void => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Configure matcher state for sync callers that cannot await.
  configureRuleEngineWasmValueBinding(buildConfigurePayload(params.rules, params.recipeModes))
}

// Sync evaluate helper mirrors the async wrapper but skips init checks.
// This keeps matcher adapters WASM-only while still exposing sync call sites.
// Same JSON wire-format projection as the async wrapper — see buildEvaluatePayload.
export const evaluateWasmRuleEngineItemsWithLoadedWasm = (params: {
  items: GearInspectorMatchWorkerEvaluateItem[]
  options?: WasmRuleEngineEvaluateOptions
}): GearInspectorMatchWorkerItemResult[] => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Build the JSON wire payload — single stringify so the Rust side parses once.
  const payloadJson = buildEvaluatePayload(params.items, params.options)
  // Evaluate all provided items using the configured matcher state.
  const result = evaluateRuleEngineWasmValueBinding(payloadJson)
  // Return parsed results when binding returned the expected array payload.
  if (Array.isArray(result)) return result as GearInspectorMatchWorkerItemResult[]
  // Fail loudly when wasm returns an unexpected payload type.
  throw new Error('WASM matcher evaluate returned an invalid payload.')
}

// Version token helps quickly verify which compiled WASM payload is loaded.
// Keep this wired so debugging transcripts can include a stable identifier.
export const getWasmRuleEngineVersion = async (): Promise<string> => {
  await ensureWasmInitialized()
  return ruleEngineWasmVersionBinding()
}

// Called after a caught RuntimeError: unreachable (WASM OOM abort) to allow the next
// pipeline run to re-initialize a fresh WASM instance instead of continuing to call into
// the corrupted heap.  Only affects the calling worker's module scope.
export const resetWasmInstance = (): void => {
  wasmInitPromise = null
  wasmInitialized = false
}

// Returns the current WASM linear memory size in bytes (page_count × 65_536).
// Cheaper and more precise than the CDP ArrayBufferContents metric, which lumps all
// ArrayBuffers together. Used by worker [sfc-diag] logs and the memory-profiling spec.
// WASM must be initialized (call warmupWasmRuleEngine first) — returns 0 otherwise.
export const getWasmLinearMemoryBytes = (): number => {
  if (!wasmInitialized) return 0
  return wasmLinearMemoryBytesBinding()
}


// Hand-written WASM-wire mirrors removed — these now import from the ts-rs
// generated rust-types/ directory.  Aliases keep the legacy names available for
// the consumers below; the underlying shape stays in lockstep with Rust because
// `cargo test` regenerates the .ts files whenever a struct field changes.
type WasmObsoleteReport = ObsoleteReportOut

type WasmSafeguardCountModePayload = SafeguardWasmCountMode

type WasmCollectedSafeguardCandidate = SafeguardCollectedCandidateOut

type WasmCollectedSafeguardSnapshot = SafeguardCollectedSnapshotOut

// WasmCollectedAndProtectedSafeguardSnapshot is NOT a pure mirror — the Rust
// SafeguardCollectedAndProtectedSnapshotOut carries SafeguardWasmSnapshotOut
// for `detection`, but the TS side substitutes the domain-typed
// SafeguardDetectionSnapshot (uses ArtifactTypeId/StatVariant brand types).
// Compose the generated shape minus `detection` with the local typed field.
type WasmCollectedAndProtectedSafeguardSnapshot = SafeguardCollectedSnapshotOut & {
  detection: SafeguardDetectionSnapshot
}

// Synchronous obsolete-pruning helper used by generation code paths that must
// stay sync; it only runs after the async warmup initialized the module.
// Payload is a JSON-stringified array of minified RuleRawWire rows so the Rust
// side parses through serde_json::from_str and the per-rule deny_unknown_fields
// gate on RuleRawWire activates (serde-wasm-bindgen's from_value path cannot).
export const findObsoleteRulesWithLoadedWasm = (rules: HsfRule[]): WasmObsoleteReport | null => {
  assertWasmInitializedSync()
  // Wire format minification keeps the payload compact and aligned with the
  // rest of the RuleRaw-handling exports (configure, finalize, flatten, merge).
  const payloadJson = JSON.stringify(rules.map(minifyRuleRawForWire))
  const report = findObsoleteRuleEngineWasmValueBinding(payloadJson) as WasmObsoleteReport
  if (report && Array.isArray(report.obsolete)) return report
  throw new Error('WASM obsolete-rule detector returned an invalid payload.')
}

// Export dedupe helper; normalization + coverage matching live in Rust as the single source of truth.
// Payload is JSON-stringified minified RuleRawWire rows (same pattern as
// findObsoleteRulesWithLoadedWasm above) so the strict per-rule wire-form check applies.
export const dedupeHsfRulesForExportWithLoadedWasm = (rules: HsfRuleWithRecipe[]): HsfRuleWithRecipe[] | null => {
  assertWasmInitializedSync()
  const payloadJson = JSON.stringify(rules.map(minifyRuleRawForWire))
  const result = dedupeHsfRulesForExportWasmValueBinding(payloadJson) as HsfRuleWithRecipe[]
  if (Array.isArray(result)) return result
  throw new Error('WASM export-rule dedupe returned an invalid payload.')
}

// Synchronous finalizer mirrors merge.ts post-build collapse/prune/sort logic.
// Worker warm paths call this after async warmup so no extra await is required.
// JSON string path — called ~192 times per pipeline (once per recipe key), each
// with ~170 rules.  The old JsValue path produced ~1M externref accesses total,
// triggering "table index is out of bounds" in __wbindgen_object_clone_ref.
export const finalizeGeneratedRulesWithLoadedWasm = (params: {
  entries: readonly GeneratedBranchRuleEntry[]
  applyObsoletePruning: boolean
}): HsfRuleWithRecipe[] | null => {
  assertWasmInitializedSync()
  // Minify each entry's `rule` field via the wire format; the metadata fields
  // (branchOrder, branchSeq, originalIdx) stay as-is since they're small.
  const minified = params.entries.map((entry) => ({
    rule: minifyRuleRawForWire(entry.rule),
    branchOrder: entry.branchOrder,
    branchSeq: entry.branchSeq,
    originalIdx: entry.originalIdx,
  }))
  const payloadJson = JSON.stringify(minified)
  const resultJson = finalizeGeneratedRulesWasmValueBinding(payloadJson, params.applyObsoletePruning)
  if (typeof resultJson !== 'string') {
    throw new Error('WASM finalize-generated-rules returned an invalid payload.')
  }
  const parsed = JSON.parse(resultJson)
  if (!Array.isArray(parsed)) {
    throw new Error('WASM finalize-generated-rules returned a non-array payload.')
  }
  return (parsed as Array<Record<string, unknown>>).map((rule) =>
    expandRuleRawFromWire(rule) as unknown as HsfRuleWithRecipe,
  )
}

/** Prepares safeguard rules for a WASM call by resolving per-level threshold inheritance.
 *  Rust expects a concrete [f64; 4] array (one value per upgrade stage), not the sparse
 *  object with inherited nulls that the TS layer stores.
 *  Idempotent: rules whose threshold is already a resolved array (e.g., from WASM echo-back)
 *  are passed through unchanged. */
// Project a TypeScript SafeguardRule to the flat wire shape Rust deserializes.
// Rust uses `name: String` (flat); TS now uses `appearance: { name, fgColor }`.
// `appearance` is presentation-only so fgColor is dropped at this boundary.
const projectRuleForWasm = (r: SafeguardRule): Record<string, unknown> => {
  const { appearance, ...rest } = r as SafeguardRule & Record<string, unknown>
  return { ...rest, name: (appearance as { name?: string } | undefined)?.name ?? '' }
}

const resolveRulesForWasm = (rules: readonly SafeguardRule[]): readonly Record<string, unknown>[] =>
  rules.map((r) => {
    const projected = projectRuleForWasm(r)
    if (r.improvementChanceThreshold === null || r.improvementChanceThreshold === undefined) return projected
    // Already resolved to a concrete array (WASM echo-back path).
    if (Array.isArray(r.improvementChanceThreshold)) return projected
    const [l0, l4, l8, l12] = resolveImprovementChanceThresholds(r.improvementChanceThreshold)
    // Cast through unknown — the serialized shape is [f64;4] and Rust deserializes it as such.
    return { ...projected, improvementChanceThreshold: [l0, l4, l8, l12] }
  })

// Synchronous safeguard detector runs candidate/rule loops inside wasm.
// Callers must warm wasm first; invalid payloads are surfaced by callers.
//
// Payload crosses the boundary as a single JSON string (not JsValue) because
// serde-wasm-bindgen 0.6.5's `from_value` path is structurally incapable of
// triggering `#[serde(deny_unknown_fields)]` — its ObjectAccess::next_key_seed
// iterates the Rust struct's declared fields instead of the JS object's own
// keys, so unknown TS-side fields are silently dropped on the way in.  Routing
// through serde_json::from_str activates the deny check (and also halves peak
// memory + dodges the wasm externref churn that has produced talc OOB crashes).
export const computeSafeguardProtectionWithLoadedWasm = (params: {
  candidates: readonly SafeguardCandidate[]
  rules: readonly SafeguardRule[]
  // Pre-computed improvement-chance entries; passed to WASM for threshold gating.
  improvementChances?: readonly ImprovementChanceWasmEntry[]
  expectedGroupsByRuleId?: Record<string, unknown>
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): SafeguardDetectionSnapshot => {
  assertWasmInitializedSync()
  // Wrapper payload carries canonical expected-group metadata into wasm.
  const expectedGroupsByRuleId =
    params.expectedGroupsByRuleId !== undefined || params.expectedGroupDomain !== undefined
      ? {
          ...(params.expectedGroupsByRuleId !== undefined
            ? { expectedGroupsByRuleId: params.expectedGroupsByRuleId }
            : {}),
          ...(params.expectedGroupDomain !== undefined
            ? { expectedGroupDomain: params.expectedGroupDomain }
            : {}),
        }
      : undefined
  // Project every wire-bound field down to the exact shape the Rust wrapper
  // (ComputeSafeguardProtectionInWire) declares.  deny_unknown_fields rejects
  // any stray TS key — including the `row` field on SafeguardCandidate — so
  // the helpers strip down before stringify.
  const payload = JSON.stringify({
    candidates: params.candidates.map(toWasmSafeguardCandidate),
    rules: resolveRulesForWasm(params.rules),
    ...(expectedGroupsByRuleId !== undefined ? { expectedGroupsByRuleId } : {}),
    enabled: params.enabled === true,
    now: Number.isFinite(params.now) ? params.now : 0,
    ...(params.improvementChances?.length
      ? { improvementChances: params.improvementChances.map(toWasmImprovementChanceInput) }
      : {}),
  })
  const result = computeSafeguardProtectionValueWasmBinding(payload)
  const wire = result as SafeguardWasmSnapshotOutWire
  if (wire && typeof wire === 'object' && Array.isArray(wire.e)) {
    return expandSafeguardSnapshotFromWire(wire)
  }
  throw new Error('WASM safeguard detection returned an invalid payload.')
}

// Candidate collection keeps keep-flag resolution + item/group key derivation
// in Rust; TS callers reattach row references for compatibility.
//
// Payload crosses the boundary as a single JSON string (not multiple JsValues)
// for the same reason as compute_safeguard_protection_value: serde-wasm-bindgen's
// from_value path cannot trigger #[serde(deny_unknown_fields)] — its ObjectAccess
// iterates the Rust struct's declared fields instead of the JS object's own keys.
// Routing through serde_json::from_str activates the deny check, halves peak
// memory, and dodges the wasm externref churn that produces talc OOB crashes.
export const collectSafeguardCandidatesWithLoadedWasm = (params: {
  rows: readonly GearInspectorPreviewRow[]
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
}): WasmCollectedSafeguardSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  // Project every wire-bound field down to the exact shape the Rust wrapper
  // (CollectSafeguardCandidatesInWire) declares.  toWasmSafeguardCollectRow
  // strips the TS-only display fields (match / matchingRecipeIndices / etc.)
  // that deny_unknown_fields would otherwise reject.  rules pass through as-is:
  // RuleRaw intentionally lacks deny_unknown_fields and accepts the PascalCase
  // HSF shape directly.
  const payload = JSON.stringify({
    rows: params.rows.map(toWasmSafeguardCollectRow),
    rules: params.rules,
    recipeModes: params.recipeModes,
    ...(ignored !== null ? { ignoreSafeguardRecipeIndices: ignored } : {}),
  })
  const result = collectSafeguardCandidatesWasmValueBinding(payload) as WasmCollectedSafeguardSnapshot
  if (result && Array.isArray(result.candidates) && Array.isArray(result.uniqueItemKeys)) {
    return result
  }
  throw new Error('WASM safeguard candidate collector returned an invalid payload.')
}

// Combined safeguard pipeline runs candidate collection + detection in one
// wasm call so TS orchestration avoids two separate Rust roundtrips.
//
// Same JSON-string rationale as collectSafeguardCandidatesWithLoadedWasm above.
export const collectAndComputeSafeguardProtectionWithLoadedWasm = (params: {
  rows: readonly GearInspectorPreviewRow[]
  rules: HsfRuleWithRecipe[]
  recipeModes: SellfileExportMode[]
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  safeguardRules: readonly SafeguardRule[]
  // Pre-computed improvement-chance entries; passed to WASM for threshold gating.
  improvementChances?: readonly ImprovementChanceWasmEntry[]
  expectedGroupsByRuleId?: Record<string, unknown>
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): WasmCollectedAndProtectedSafeguardSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  const expectedGroupsPayload = (
    params.expectedGroupsByRuleId !== undefined
    || params.expectedGroupDomain !== undefined
  )
    ? {
      ...(params.expectedGroupsByRuleId !== undefined
        ? { expectedGroupsByRuleId: params.expectedGroupsByRuleId }
        : {}),
      ...(params.expectedGroupDomain !== undefined
        ? { expectedGroupDomain: params.expectedGroupDomain }
        : {}),
    }
    : undefined
  // Project every wire-bound field down to the exact shape the Rust wrapper
  // (CollectAndComputeSafeguardProtectionInWire) declares.  Helpers strip the
  // TS-only display fields that deny_unknown_fields would otherwise reject.
  const payload = JSON.stringify({
    rows: params.rows.map(toWasmSafeguardCollectRow),
    rules: params.rules,
    recipeModes: params.recipeModes,
    ...(ignored !== null ? { ignoreSafeguardRecipeIndices: ignored } : {}),
    safeguardRules: resolveRulesForWasm(params.safeguardRules),
    ...(expectedGroupsPayload !== undefined ? { expectedGroupsPayload } : {}),
    enabled: params.enabled === true,
    now: Number.isFinite(params.now) ? params.now : 0,
    ...(params.improvementChances?.length
      ? { improvementChances: params.improvementChances.map(toWasmImprovementChanceInput) }
      : {}),
  })
  const raw = collectAndComputeSafeguardProtectionWasmValueBinding(payload) as {
    candidates?: unknown; uniqueItemKeys?: unknown; detection?: SafeguardWasmSnapshotOutWire
  }
  if (
    raw
    && Array.isArray(raw.candidates)
    && Array.isArray(raw.uniqueItemKeys)
    && raw.detection
    && Array.isArray(raw.detection.e)
  ) {
    return {
      candidates: raw.candidates as WasmCollectedSafeguardCandidate[],
      uniqueItemKeys: raw.uniqueItemKeys as number[],
      detection: expandSafeguardSnapshotFromWire(raw.detection),
    }
  }
  throw new Error('WASM safeguard combined collector/detector returned an invalid payload.')
}

// Improvement-chance result types — pure mirrors of the Rust output structs.
// The generated rust-types/ files are imported above; the public names below
// are kept as aliases so external consumers (worker, UI overlays) don't have
// to be retyped.  Drift is impossible because `cargo test` regenerates the
// underlying .ts files when the Rust struct changes (`#[derive(TS)]`).
export type ImprovementChanceWasmDebug = ImprovementChanceDebug
export type ImprovementChanceWasmPerfDiag = ImprovementChancePerfDiag
export type ImprovementChanceWasmRuleEntry = ImprovementChanceRuleEntry
export type ImprovementChanceWasmEntry = ImprovementChanceEntry

// Output shape for the combined evaluate+collect WASM call.
// evaluateResults mirrors the Vec<EvaluateItemResult> shape from evaluate_value;
// the remaining fields match WasmCollectedAndProtectedSafeguardSnapshot.
export type WasmEvaluateAndCollectSnapshot = {
  evaluateResults: GearInspectorMatchWorkerItemResult[]
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
  detection: SafeguardDetectionSnapshot
}

// Store pre-parsed artifact rows in WASM engine state so the combined evaluate+collect
// entry point can read them without re-deserializing on every detection call.
// Caller must have called configureWasmRuleEngine first; re-call when the artifact DB changes.
// Returns the number of rows stored.
export const storeArtifactRowsWithLoadedWasm = (params: {
  rows: readonly WasmArtifactStoreRow[]
}): number => {
  assertWasmInitializedSync()
  // Pass as a JSON string instead of JsValue for the same reason as
  // compute_merged_rules_value and configure_value: ~8k deeply-nested rows
  // (artifact + gearInspectorItem + substats array each) would otherwise
  // hammer serde_wasm_bindgen's externref path, contributing to latent talc
  // heap corruption that surfaces as OOB crashes in later WASM calls.
  const payloadJson = JSON.stringify(params.rows)
  const result = storeArtifactRowsWasmValueBinding(payloadJson)
  return typeof result === 'number' ? result : 0
}

// Drops the stored artifact rows from ENGINE_STATE, releasing their heap allocation
// back to talc.  Call after eval-collect (the last consumer of stored_rows) and before
// computeMergedRulesWithLoadedWasm to free ~16–20 MiB before the large merge allocations.
// Rows must be re-populated via storeArtifactRowsWithLoadedWasm on the next pipeline run.
export const clearStoredRowsWithLoadedWasm = (): void => {
  assertWasmInitializedSync()
  clearStoredRowsWasmBinding()
}

// Prewarms the talc heap by allocating then immediately freeing `bytes` bytes.
// Forces memory.grow now (before the critical phase) so the freed block is in the
// talc free list when the phase's large allocations arrive.  No-op if a free block
// of that size already exists (the Vec::with_capacity hits an existing block and drop
// returns it — zero net effect in the steady-state case).
export const preWarmHeapWithLoadedWasm = (bytes: number): void => {
  assertWasmInitializedSync()
  preWarmHeapWasmBinding(bytes)
}

// Combined evaluate + safeguard-collect wrapper — replaces the two-step
// evaluate_value + collect_and_compute_safeguard_protection_value call pattern.
// Caller must configure the engine via configureWasmRuleEngine and store artifact rows
// via storeArtifactRowsWithLoadedWasm before calling this function.
export const evaluateAndCollectSafeguardProtectionWithLoadedWasm = (params: {
  options?: WasmRuleEngineEvaluateOptions
  ignoreSafeguardRecipeIndices?: ReadonlySet<number>
  safeguardRules: readonly SafeguardRule[]
  // Pre-computed improvement-chance entries; passed to WASM for threshold gating.
  improvementChances?: readonly ImprovementChanceWasmEntry[]
  expectedGroupDomain?: Record<string, unknown>
  enabled: boolean
  now: number
}): WasmEvaluateAndCollectSnapshot => {
  assertWasmInitializedSync()
  const ignored = toSortedNumberArray(params.ignoreSafeguardRecipeIndices) ?? null
  // Build the evaluate-options object that maps onto EvaluateOptionsRaw on the
  // Rust side.  Each field is only emitted when the caller supplied a value;
  // omitting the whole `options` key when the object is empty lets the Rust
  // wrapper use its serde default (EvaluateOptionsRaw::default()).
  const evaluatePayload: WasmRuleEngineEvaluatePayload = {}
  const opts = params.options
  if (opts?.excludeSources?.length) evaluatePayload.excludeSources = [...opts.excludeSources]
  if (opts?.baselineExcludeSources?.length) evaluatePayload.baselineExcludeSources = [...opts.baselineExcludeSources]
  if (opts?.excludeRecipeIndices?.size) evaluatePayload.excludeRecipeIndices = [...opts.excludeRecipeIndices]
  if (opts?.ignoreSafeguardRecipeIndices?.size) evaluatePayload.ignoreSafeguardRecipeIndices = [...opts.ignoreSafeguardRecipeIndices]
  // Expected-groups wrapper maps onto SafeguardWasmExpectedGroupsPayloadIn; only
  // emit it when the caller actually supplied an expected-group domain.
  const expectedGroupsPayload = params.expectedGroupDomain !== undefined
    ? { expectedGroupDomain: params.expectedGroupDomain }
    : undefined
  // Single JSON-stringified wrapper so the Rust side activates
  // deny_unknown_fields on EvaluateAndCollectSafeguardProtectionInWire.
  // `enabled` and `now` stay as primitive wasm-bindgen arguments because
  // wasm-bindgen marshals primitives natively (same convention as
  // build_safeguard_rules_value's recipe_id_base).
  // improvementChances are projected through toWasmImprovementChanceInput so
  // the inbound shape matches ImprovementChanceInput exactly (drops display-only
  // fields that deny_unknown_fields would otherwise reject).
  const payloadJson = JSON.stringify({
    ...(Object.keys(evaluatePayload).length ? { options: evaluatePayload } : {}),
    ...(ignored !== null ? { ignoreSafeguardRecipeIndices: ignored } : {}),
    safeguardRules: resolveRulesForWasm(params.safeguardRules),
    ...(expectedGroupsPayload !== undefined ? { expectedGroupsPayload } : {}),
    ...(params.improvementChances?.length
      ? { improvementChances: params.improvementChances.map(toWasmImprovementChanceInput) }
      : {}),
  })
  // Rows are read from ENGINE_STATE.stored_rows (populated by storeArtifactRowsWithLoadedWasm).
  const raw = evaluateAndCollectSafeguardProtectionWasmValueBinding(
    payloadJson,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  ) as { er?: unknown; ca?: unknown; uik?: unknown; dt?: SafeguardWasmSnapshotOutWire }
  if (
    raw
    && Array.isArray(raw.er)
    && Array.isArray(raw.ca)
    && Array.isArray(raw.uik)
    && raw.dt
    && Array.isArray(raw.dt.e)
  ) {
    return {
      evaluateResults: raw.er as GearInspectorMatchWorkerItemResult[],
      candidates: raw.ca as WasmCollectedSafeguardCandidate[],
      uniqueItemKeys: raw.uik as number[],
      detection: expandSafeguardSnapshotFromWire(raw.dt),
    }
  }
  throw new Error('WASM evaluate-and-collect safeguard snapshot returned an invalid payload.')
}

// Metaset expansion for safeguard rules now runs in Rust so include/exclude
// precedence stays single-sourced across app and workers.
export const resolveSafeguardRulesWithMetasetsWithLoadedWasm = <T extends { combination: unknown }>(
  rules: readonly T[],
  metasets: readonly unknown[],
): T[] => {
  assertWasmInitializedSync()
  if (rules.length === 0 || metasets.length === 0) return rules as T[]
  // SafeguardWasmMetasetIn is deny_unknown_fields; project to wire shape so
  // presentation-only fields (e.g. show, iconId) don't trip strict deserialize.
  const metasetsWire = metasets.map((m) => {
    const src = m as { name: string; sets: readonly number[] }
    return { name: src.name, sets: src.sets }
  })
  // Rust SafeguardRule uses flat `name: String`; project appearance→name before the boundary
  // so the Rust serde deny_unknown_fields does not reject the payload.
  const rulesWire = rules.map((r) => {
    const src = r as { appearance?: { name?: string; fgColor?: string }; name?: string }
    const { appearance: _appearance, ...rest } = src as Record<string, unknown>
    return { name: src.appearance?.name ?? src.name ?? '', ...rest }
  })
  const payload = JSON.stringify({
    rules: rulesWire,
    metasets: metasetsWire,
  })
  const rawResult = resolveSafeguardRulesWithMetasetsWasmValueBinding(payload) as Array<Record<string, unknown>>
  if (!Array.isArray(rawResult)) throw new Error('WASM safeguard metaset resolver returned an invalid payload.')
  // Restore appearance from the flat `name` the Rust side may have updated, preserving fgColor.
  return rawResult.map((res, idx) => {
    const original = rules[idx] as Record<string, unknown>
    const src = original as { appearance?: { name?: string; fgColor?: string } }
    const wasmName = typeof res.name === 'string' ? res.name : ''
    const { name: _n, ...restRes } = res
    const nextAppearance = (wasmName || src.appearance?.fgColor)
      ? { name: wasmName, ...(src.appearance?.fgColor ? { fgColor: src.appearance.fgColor } : {}) }
      : undefined
    return (nextAppearance ? { ...restRes, appearance: nextAppearance } : restRes) as T
  })
}

// Injected safeguard merge filtering/sorting runs in Rust so canonicalization
// and dedupe precedence are defined in one implementation.
//
// Payload crosses the boundary as a single JSON-stringified wrapper so the Rust
// side (MergeSafeguardInjectedRulesInWire) activates deny_unknown_fields at the
// wrapper level and again on every per-rule RuleRawWire entry.  Each rules array
// goes through minifyRuleRawForWire to produce the short-key on-wire format.
// RuleRaw stays intentionally lax — wire-form is the only strict gate.
export const mergeSafeguardInjectedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  candidateSafeguardRules: HsfRuleWithRecipe[]
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const payloadJson = JSON.stringify({
    baseRules: params.baseRules.map(minifyRuleRawForWire),
    customRules: params.customRules.map(minifyRuleRawForWire),
    candidateSafeguardRules: params.candidateSafeguardRules.map(minifyRuleRawForWire),
  })
  const result = mergeSafeguardInjectedRulesWasmValueBinding(payloadJson)
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM safeguard injected-rule merge returned an invalid payload.')
}

// Safeguard HSF rule construction moved to Rust so merge.ts no longer
// maintains duplicate placeholder/artifact expansion logic.
// Payload is a JSON-stringified { rules, detection } wrapper so serde_json
// activates BuildSafeguardRulesInWire's deny_unknown_fields gate on every
// nested key.  recipe_id_base stays a primitive bigint argument because
// wasm-bindgen marshals i64 natively without JSON overhead.
export const buildSafeguardRulesWithLoadedWasm = (params: {
  rules: readonly SafeguardRule[]
  detection: SafeguardDetectionSnapshot | null
  recipeIdBase: number
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  if (!params.detection) return []
  // Single wrapper object so Rust's serde_json::from_str sees one JSON document.
  // The detection field is required by the wrapper type but stays Option-typed
  // on the Rust side so future callers can omit it without breaking the schema.
  const payloadJson = JSON.stringify({
    rules: resolveRulesForWasm(params.rules),
    detection: projectSafeguardSnapshotForWire(params.detection),
  })
  const result = buildSafeguardRulesWasmValueBinding(
    payloadJson,
    BigInt(Math.floor(params.recipeIdBase)),
  )
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM safeguard rule builder returned an invalid payload.')
}

// Final-sell HSF remainder generation runs in Rust so merge.ts no longer owns
// level/type/set expansion loops.
// Payload is a JSON-stringified { remainder, allKnownSetIds } wrapper so the
// Rust side activates BuildFinalSellRulesInWire's deny_unknown_fields gate.
// FinalSellRemainderIn is strict-deserialized too, so any drift in the TS
// FinalSellRemainderConfig shape fails fast at the boundary.
export const buildFinalSellRulesWithLoadedWasm = (params: {
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  // Build the wrapper payload — remainder may be null/undefined when no
  // final-sell expansion is requested; the wrapper's Option<...> handles both.
  const payloadJson = JSON.stringify({
    remainder: params.finalSellRemainder ?? null,
    allKnownSetIds: params.allKnownSetIds,
  })
  const result = buildFinalSellRulesWasmValueBinding(payloadJson)
  if (Array.isArray(result)) return result as HsfRuleWithRecipe[]
  throw new Error('WASM final-sell rule builder returned an invalid payload.')
}

// Custom-rule batch flattening + total-limit gating runs in Rust so merge.ts
// keeps one source for add-batch overflow behavior.
// JSON string path — same rationale as compute_merged_rules_value: the batches
// payload (Vec<Vec<RuleRaw>>) with 32k+ rules hammers serde_wasm_bindgen's
// externref table, causing "table index is out of bounds".
export const flattenRuleBatchesWithTotalLimitWithLoadedWasm = (params: {
  baseCount: number
  totalLimit: number | null
  batches: ReadonlyArray<ReadonlyArray<HsfRuleWithRecipe>>
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  const payloadJson = JSON.stringify({
    baseCount: Math.max(0, Math.floor(params.baseCount)),
    totalLimit: params.totalLimit != null ? Math.floor(params.totalLimit) : -1,
    batches: params.batches.map((batch) =>
      batch.map(minifyRuleRawForWire),
    ),
  })
  const resultJson = flattenRuleBatchesWithTotalLimitWasmValueBinding(payloadJson)
  if (typeof resultJson !== 'string') {
    throw new Error('WASM custom-rule batch flattener returned an invalid payload.')
  }
  const parsed = JSON.parse(resultJson)
  if (!Array.isArray(parsed)) {
    throw new Error('WASM custom-rule batch flattener returned a non-array payload.')
  }
  return (parsed as Array<Record<string, unknown>>).map((rule) =>
    expandRuleRawFromWire(rule) as unknown as HsfRuleWithRecipe,
  )
}

// Shared expansion of a merged-rules JSON result (minified wire array → canonical
// HsfRuleWithRecipe[]). Used by both the legacy and cached merge wrappers (SSOT).
const expandMergedRulesResult = (resultJson: unknown, context: string): HsfRuleWithRecipe[] => {
  if (typeof resultJson !== 'string') {
    throw new Error(`WASM ${context} returned an invalid payload.`)
  }
  const parsed = JSON.parse(resultJson)
  if (!Array.isArray(parsed)) {
    throw new Error(`WASM ${context} returned a non-array payload.`)
  }
  return (parsed as Array<Record<string, unknown>>).map((rule) =>
    expandRuleRawFromWire(rule) as unknown as HsfRuleWithRecipe,
  )
}

// Cache the RULES HALF (base+custom+final-sell + transform flags) WASM-side. Sent only
// when the rules fingerprint changes (see merge.ts), NOT every endpoint push — re-sending
// the ~17 MiB of invariant rules per push churns talc into the incremental-update leak.
// Stores the invariant merge inputs in ENGINE_STATE; returns nothing.
export const cacheGeneratedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
  omitDisabledBeforeSafeguards: boolean
  dedupeBeforeSafeguards: boolean
  safeguardEnabled: boolean
  safeguardRules: readonly SafeguardRule[]
}): void => {
  assertWasmInitializedSync()
  // Invariant-half payload: the recipe rules AND the safeguard rule definitions — both
  // session-stable. Same minify + short-key SSOT as the full merge payload.
  const payloadJson = JSON.stringify({
    br: params.baseRules.map(minifyRuleRawForWire),
    cr: params.customRules.map(minifyRuleRawForWire),
    fsr: params.finalSellRemainder ?? null,
    aksi: params.allKnownSetIds,
    oms: params.omitDisabledBeforeSafeguards === true,
    dds: params.dedupeBeforeSafeguards === true,
    se: params.safeguardEnabled === true,
    sr: resolveRulesForWasm(params.safeguardRules),
  })
  cacheGeneratedRulesWasmValueBinding(payloadJson)
}

// Finish the merge using the WASM-cached invariant inputs + the per-push detection snapshot.
// Takes the FULL param set so a cache miss can self-heal (re-cache the invariant half, then
// retry) — never a silently-wrong result. The fast path sends only the detection snapshot,
// not the ~34 MiB full payload.
export const computeMergedRulesCachedWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
  omitDisabledBeforeSafeguards: boolean
  dedupeBeforeSafeguards: boolean
  safeguardEnabled: boolean
  safeguardRules: readonly SafeguardRule[]
  safeguardDetection: SafeguardDetectionSnapshot | null | undefined
  safeguardRecipeIdBase: number
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  // Per-push payload: ONLY the detection snapshot (+ recipe-id base). Rules and safeguard
  // definitions are already resident in ENGINE_STATE from the cache call.
  const payloadJson = JSON.stringify({
    sd: params.safeguardDetection ? projectSafeguardSnapshotForWire(params.safeguardDetection) : null,
    srb: Math.floor(params.safeguardRecipeIdBase),
  })
  let resultJson: unknown
  try {
    resultJson = computeMergedRulesCachedWasmValueBinding(payloadJson)
  } catch {
    // Cache miss (engine has no cached generated rules yet — e.g. first merge after a
    // worker respawn, before merge.ts's lastCachedRulesKey could know the WASM engine is
    // fresh). Self-heal: populate the cache from this call's full params and retry once.
    // This keeps the cached path the ONE merge path (no separate legacy merge) while
    // guaranteeing correctness on the rare miss. A second failure is a real bug — rethrow.
    cacheGeneratedRulesWithLoadedWasm(params)
    resultJson = computeMergedRulesCachedWasmValueBinding(payloadJson)
  }
  return expandMergedRulesResult(resultJson, 'cached merged-rule orchestrator')
}

// Auto-flex rarity branch expansion now runs in Rust so merge.ts keeps one
// source for the branch split heuristics tied to auto rarity + locked mins.
export const expandAutoFlexRarityBranchesWithLoadedWasm = (params: {
  recipe: BuilderRecipe
  baseRarityCode: number
}): BuilderRecipe[] => {
  assertWasmInitializedSync()
  // Project recipe to short-name wire form (AutoFlexRarityRecipeIn serde renames).
  const wireRecipe = projectAutoFlexRarityRecipeForWire(params.recipe)
  const rawResult = expandAutoFlexRarityBranchesWasmValueBinding(
    JSON.stringify(wireRecipe),
    Math.floor(params.baseRarityCode),
  )
  // WASM returns Vec<AutoFlexRarityRecipeIn> with short field names.  Expand each
  // branch back to BuilderRecipe field names, then merge with the original recipe
  // so non-declared fields (mainStats, etc.) are preserved.
  if (Array.isArray(rawResult)) {
    return rawResult.map((branch) => ({
      ...params.recipe,
      ...expandAutoFlexRarityBranchFromWire(branch as Parameters<typeof expandAutoFlexRarityBranchFromWire>[0]),
    }))
  }
  throw new Error('WASM auto-flex rarity branch expansion returned an invalid payload.')
}

// Builder-facing auto-rarity helper accepts raw recipe vectors and allowed ids.
// Rust compacts selected/fixed/bounds before running the shared rarity core.
export const resolveAutoRarityCodeForBuilderWithLoadedWasm = (payload: {
  autoRaritySupplementsThreshold?: string | null
  autoMinRequiredRolls?: boolean
  minRequiredRolls?: number
  lockedMinRequiredRolls?: number
  minCount?: number
  earlyKeepMode?: string
  substatsV: ReadonlyArray<number> | Int32Array
  fixedSubstatsV: ReadonlyArray<number> | Int32Array
  substatRollBoundsV: Record<number, { min?: number }> | undefined
  allowedSubstats: ReadonlyArray<number> | Int32Array
}): number => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate selection/fixed filtering + bound compaction + resolve to Rust.
  const result = resolveAutoRarityCodeForBuilderWasmValueBinding(JSON.stringify({
    ...(typeof payload.autoRaritySupplementsThreshold === 'string'
      ? { autoRaritySupplementsThreshold: payload.autoRaritySupplementsThreshold }
      : {}),
    ...(typeof payload.autoMinRequiredRolls === 'boolean'
      ? { autoMinRequiredRolls: payload.autoMinRequiredRolls }
      : {}),
    ...(typeof payload.minRequiredRolls === 'number' && Number.isFinite(payload.minRequiredRolls)
      ? { minRequiredRolls: payload.minRequiredRolls }
      : {}),
    ...(typeof payload.lockedMinRequiredRolls === 'number' && Number.isFinite(payload.lockedMinRequiredRolls)
      ? { lockedMinRequiredRolls: payload.lockedMinRequiredRolls }
      : {}),
    ...(typeof payload.minCount === 'number' && Number.isFinite(payload.minCount)
      ? { minCount: payload.minCount }
      : {}),
    ...(typeof payload.earlyKeepMode === 'string'
      ? { earlyKeepMode: payload.earlyKeepMode }
      : {}),
    substatsV: Array.from(toFlooredI32(payload.substatsV)),
    fixedSubstatsV: Array.from(toFlooredI32(payload.fixedSubstatsV)),
    substatRollBoundsV: Object.fromEntries(
      Object.entries(payload.substatRollBoundsV ?? {}).map(([key, bounds]) => [
        key,
        { min: bounds.min },
      ])
    ),
    allowedSubstats: Array.from(toFlooredI32(payload.allowedSubstats)),
  }))
  // Rust binding returns a numeric rarity code; reject malformed payloads.
  if (typeof result === 'number' && Number.isFinite(result)) return Math.floor(result)
  throw new Error('WASM auto-rarity builder resolver returned an invalid payload.')
}

// Auto-rarity roll-level helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityRollLevelsForCodeWithLoadedWasm = (rarityCode: number): number[] => {
  assertWasmInitializedSync()
  const levels = autoRarityRollLevelsForCodeWasmValueBinding(Math.floor(rarityCode))
  if (levels instanceof Int32Array) return Array.from(levels, (value) => Math.floor(Number(value)))
  throw new Error('WASM auto-rarity roll-level helper returned an invalid payload.')
}

// Auto-rarity addition-level helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityAdditionLevelsForCodeWithLoadedWasm = (rarityCode: number): number[] => {
  assertWasmInitializedSync()
  const levels = autoRarityAdditionLevelsForCodeWasmValueBinding(Math.floor(rarityCode))
  if (levels instanceof Int32Array) return Array.from(levels, (value) => Math.floor(Number(value)))
  throw new Error('WASM auto-rarity addition-level helper returned an invalid payload.')
}

// Mythical-membership helper keeps TS schedule lookups sourced from Rust.
export const getAutoRarityIncludesMythicalForCodeWithLoadedWasm = (rarityCode: number): boolean => {
  assertWasmInitializedSync()
  return autoRarityIncludesMythicalForCodeWasmValueBinding(Math.floor(rarityCode)) === true
}

// Builder prep helper normalizes selected/fixed pools and precomputes per-variant
// base/target maps in Rust so hsfBuilder.ts avoids heavy per-recipe prep loops.
export const prepareHsfBuilderRecipeWithLoadedWasm = (payload: {
  minCount: number
  autoSubstatFlex: boolean
  flexEligible: boolean
  substatsV: ReadonlyArray<number> | Int32Array
  fixedSubstatsV: ReadonlyArray<number> | Int32Array
  allowedSubstats: ReadonlyArray<number> | Int32Array
  substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
  substatRollTargetsV?: Record<number, { base?: number; increments?: Array<number | null> }>
  substatTargetByVariant: Record<number, number>
  factoryBaseByVariantForStar: Record<number, number>
  variantPriority: ReadonlyArray<number> | Int32Array
}): {
  selectedPoolV: number[]
  requiredV: number[]
  optionalPoolV: number[]
  minTargetCount: number
  maxTargetCount: number
  maxSelectableCount: number
  hadRequestedSubstats: boolean
  hasPerStatMin: boolean
  currentBaseByVariant: Record<string, number>
  factoryBaseByVariant: Record<string, number | null>
  targetBaseOverrideByVariant: Record<string, number | null>
  targetEntriesByVariant: Record<string, { base?: number; increments?: Array<number | null> }>
} => {
  assertWasmInitializedSync()
  const result = prepareHsfBuilderRecipeWasmValueBinding(
    JSON.stringify({
      minCount: Math.floor(payload.minCount),
      autoSubstatFlex: payload.autoSubstatFlex === true,
      flexEligible: payload.flexEligible === true,
      substatsV: Array.from(toFlooredI32(payload.substatsV)),
      fixedSubstatsV: Array.from(toFlooredI32(payload.fixedSubstatsV)),
      allowedSubstats: Array.from(toFlooredI32(payload.allowedSubstats)),
      substatRollBoundsV: payload.substatRollBoundsV ?? {},
      substatRollTargetsV: payload.substatRollTargetsV ?? {},
      substatTargetByVariant: payload.substatTargetByVariant ?? {},
      factoryBaseByVariantForStar: payload.factoryBaseByVariantForStar ?? {},
      variantPriority: Array.from(toFlooredI32(payload.variantPriority)),
    }),
  // PrepareHsfBuilderRecipeOut uses short wire names (sp/rv/op/mn/mx/ms/hrs/hps/cbv/fbv/tbv/tev).
  ) as {
    sp?: unknown; rv?: unknown; op?: unknown; mn?: unknown; mx?: unknown; ms?: unknown
    hrs?: unknown; hps?: unknown
    cbv?: unknown; fbv?: unknown; tbv?: unknown; tev?: unknown
  }
  if (
    !result
    || !Array.isArray(result.sp)
    || !Array.isArray(result.rv)
    || !Array.isArray(result.op)
    || result.cbv == null
    || result.fbv == null
    || result.tbv == null
    || result.tev == null
  ) {
    throw new Error('WASM prepare-hsf-builder-recipe helper returned an invalid payload.')
  }
  return {
    selectedPoolV: (result.sp as unknown[]).map((value) => Math.floor(Number(value))),
    requiredV: (result.rv as unknown[]).map((value) => Math.floor(Number(value))),
    optionalPoolV: (result.op as unknown[]).map((value) => Math.floor(Number(value))),
    minTargetCount: Math.floor(Number(result.mn ?? 0)),
    maxTargetCount: Math.floor(Number(result.mx ?? 0)),
    maxSelectableCount: Math.floor(Number(result.ms ?? 0)),
    hadRequestedSubstats: result.hrs === true,
    hasPerStatMin: result.hps === true,
    // Rust emits plain objects via serialize_maps_as_objects; no Map → object conversion needed.
    currentBaseByVariant: result.cbv as Record<string, number>,
    factoryBaseByVariant: result.fbv as Record<string, number | null>,
    targetBaseOverrideByVariant: result.tbv as Record<string, number | null>,
    // tev entries use short names: b (base), inc (increments).
    targetEntriesByVariant: Object.fromEntries(
      Object.entries(result.tev as Record<string, { b?: number; inc?: Array<number | null> }>).map(
        ([key, entry]) => [key, {
          ...(entry.b !== undefined ? { base: entry.b } : {}),
          ...(entry.inc !== undefined ? { increments: entry.inc } : {}),
        }]
      )
    ),
  }
}

// Safeguard substat sorting runs in Rust so TS reuses one priority ordering.
export const sortSafeguardSubstatsWithLoadedWasm = (values: readonly number[]): number[] => {
  assertWasmInitializedSync()
  const sorted = sortSafeguardSubstatsWasmValueBinding(JSON.stringify(values))
  if (sorted instanceof Int32Array) return Array.from(sorted, (value) => Math.floor(Number(value)))
  if (Array.isArray(sorted)) return sorted.map((value) => Math.floor(Number(value)))
  throw new Error('WASM safeguard substat sorter returned an invalid payload.')
}

// Live preview scoring for the weight popover: scores candidates with the
// given substats/weights without running the full detection pass.
// Returns candidates sorted by score descending with 1-based rank and quota flag.
// countMode mirrors the editing rule's count-mode so isWithinQuota partitioning
// (per-set/per-faction/per-main-stat/per-slot bucketing with tie extension)
// matches what detection produced on first open — without it the cutoff would
// snap to `rank < requiredCount` after any weight nudge.
export const scoreSafeguardCandidatesWithLoadedWasm = (params: {
  // Artifacts to score — sourced from SafeguardDetectionEntry.artifacts in the snapshot.
  // Typed against the generated WASM wire struct so tsc catches field renames.
  artifacts: SafeguardWasmArtifactIn[]
  // Substat variant IDs to include in the scoring formula.
  substats: number[]
  // Per-variant weight multipliers (variant id → weight).
  weights: Record<number, number>
  // How many items the rule intends to keep (quota for isWithinQuota).
  requiredCount: number
  // Bucketing flags from the editing rule. Omit to let Rust resolve canonical
  // detection defaults; callers in the popover always pass the live rule's mode.
  countMode?: SafeguardRuleCountMode
}): SafeguardCandidateOut[] => {
  assertWasmInitializedSync()
  const result = scoreSafeguardCandidatesWasmValueBinding(JSON.stringify({
    artifacts: params.artifacts,
    substats: params.substats,
    weights: params.weights,
    requiredCount: params.requiredCount,
    // Forward as null when caller skipped countMode so the Rust side falls
    // through to safeguard_resolve_count_mode (matches the wire form of an
    // omitted Option<SafeguardWasmCountMode>).
    countMode: params.countMode ?? null,
  }))
  if (Array.isArray(result)) return result as SafeguardCandidateOut[]
  throw new Error('WASM safeguard score preview returned an invalid payload.')
}

// Safeguard combination sorting runs in Rust so TS reuses one canonical order.
export const sortSafeguardCombinationWithLoadedWasm = <T extends object>(combination: T): T => {
  assertWasmInitializedSync()
  const sorted = sortSafeguardCombinationWasmValueBinding(JSON.stringify(combination))
  if (sorted && typeof sorted === 'object') return sorted as T
  throw new Error('WASM safeguard combination sorter returned an invalid payload.')
}

// Safeguard combination hash generation runs in Rust so TS reuses one canonical
// tokenization implementation for snapshots + rule metadata.
export const hashSafeguardCombinationWithLoadedWasm = (combination: unknown): string => {
  assertWasmInitializedSync()
  const hash = hashSafeguardCombinationWasmValueBinding(JSON.stringify(combination))
  if (typeof hash === 'string') return hash
  throw new Error('WASM safeguard combination hash helper returned an invalid payload.')
}

// Hot-path projection input: the field subset the safeguard item-key /
// group-key helpers actually read from NormalizedGearArtifact.  Decoupled
// from NormalizedGearArtifact's full ~20-field shape so callers in tests or
// non-importer paths can supply a minimal stub without faking unrelated
// fields.  See the two projection helpers below for the wire shape sent
// across the WASM boundary.
//
// gearInspectorItem is typed `TestItem` because that is what NormalizedGearArtifact
// declares; the optional `itemId` field is undocumented but read via type-assertion
// inside the projection — see resolveCanonicalTestItemId for the broader pattern.
type SafeguardKeyArtifactInput = {
  id: number
  slot: number
  set: number
  faction: number | null | undefined
  mainStat: { variant: number } | null | undefined
  gearInspectorItem: TestItem
}

// Project NormalizedGearArtifact → the wire shape SafeguardWasmItemKeyArtifactIn
// declares (id + gearInspectorItem.{itemId, previewExtras.id}).  Without this,
// JSON.stringify would emit the full ~20-field artifact and Rust's
// deny_unknown_fields would reject the payload.  Keep this projection in lockstep
// with SafeguardWasmItemKeyArtifactIn in wasm/rule_engine_core/src/safeguards/mod.rs.
//
// TestItem has no declared `itemId` field but some call sites attach one (see
// resolveCanonicalTestItemId in itemIdentity.ts); the type-assertion below reads
// it safely so the Rust-side fallback ladder (id → previewExtras.id → itemId)
// stays behaviour-identical with the pre-migration serde-wasm-bindgen path.
const toWasmSafeguardItemKeyArtifact = (artifact: SafeguardKeyArtifactInput): {
  id: number
  gearInspectorItem?: { itemId?: number; previewExtras?: { id: number } }
} => {
  // Tolerate artifacts with no gearInspectorItem at all (Rust treats it as
  // None and falls back to artifact.id / the zero sentinel).
  const inspectorItem = artifact.gearInspectorItem as (TestItem & { itemId?: number }) | undefined
  // Pull the optional itemId off the TestItem if attached at runtime.
  const itemId = inspectorItem?.itemId
  // Only emit previewExtras.id when present — the Rust struct uses
  // Option<SafeguardWasmItemKeyPreviewExtrasIn> with serde(default).
  const previewExtrasId = inspectorItem?.previewExtras?.id
  // Build the inner gearInspectorItem object only when at least one declared
  // field carries a value; omit it entirely otherwise so serde sees None.
  const inner: { itemId?: number; previewExtras?: { id: number } } = {}
  if (itemId != null) inner.itemId = itemId
  if (previewExtrasId != null) inner.previewExtras = { id: previewExtrasId }
  return {
    id: artifact.id,
    ...(Object.keys(inner).length > 0 ? { gearInspectorItem: inner } : {}),
  }
}

// Project NormalizedGearArtifact → the wire shape SafeguardWasmGroupKeyArtifactIn
// declares (slot, set, faction, mainStat).  mainStat is emitted as a plain
// number when present so serde immediately matches the Variant(i64) branch of
// the untagged SafeguardWasmMainStatRawIn enum (skipping the failed object-try).
// Keep this in lockstep with SafeguardWasmGroupKeyArtifactIn.
const toWasmSafeguardGroupKeyArtifact = (artifact: SafeguardKeyArtifactInput): {
  slot: number
  set: number
  faction: number
  mainStat?: number
} => {
  const mainVariant = artifact.mainStat?.variant
  return {
    slot: artifact.slot,
    set: artifact.set,
    faction: artifact.faction ?? 0,
    ...(mainVariant != null ? { mainStat: mainVariant } : {}),
  }
}

// Safeguard item-key derivation runs in Rust so TS reuses DB-id-first
// semantics used by candidate collection.
//
// PERF NOTE (hot path): this helper is called per-artifact in tight render loops
// (App.tsx grep: 6+ call sites over gearEntriesForTable).  The migration to
// JSON.stringify + serde_json::from_str adds ~0.12μs JSON.stringify + a small
// WASM parse on top vs the prior serde-wasm-bindgen path (measured V8, Node 22,
// 100k iters).  At a worst-case 10k calls per render that is ~1–2ms total —
// negligible vs the 16ms frame budget.  The TS-side projection
// (toWasmSafeguardItemKeyArtifact) keeps the on-wire payload at ~50–80 bytes so
// the parse stays cheap.  Do NOT widen the projection without re-measuring —
// the 10k-call worst case is what gates UI responsiveness.
export const getSafeguardItemKeyWithLoadedWasm = (artifact: SafeguardKeyArtifactInput): number => {
  assertWasmInitializedSync()
  // Project to the minimal shape SafeguardWasmItemKeyArtifactIn declares.
  const projected = toWasmSafeguardItemKeyArtifact(artifact)
  const key = safeguardItemKeyValueWasmValueBinding(JSON.stringify(projected))
  // wasm-bindgen maps Rust `i64` to JS `bigint`, but older bindings may still
  // surface a JS number in some environments.
  if (typeof key === 'bigint') {
    const numeric = Number(key)
    if (Number.isFinite(numeric)) return Math.floor(numeric)
  }
  // Keep compatibility with number-returning bindings while still fail-closing.
  if (typeof key === 'number' && Number.isFinite(key)) return Math.floor(key)
  throw new Error('WASM safeguard item-key helper returned an invalid payload.')
}

// Safeguard group-key derivation runs in Rust so TS reuses accessory faction
// normalization used by candidate collection.
//
// PERF NOTE (hot path): same considerations as getSafeguardItemKeyWithLoadedWasm
// — see the projection comment above.  Payload is ~40–60 bytes per call.
export const getSafeguardGroupKeyWithLoadedWasm = (artifact: SafeguardKeyArtifactInput): string => {
  assertWasmInitializedSync()
  // Project to the minimal shape SafeguardWasmGroupKeyArtifactIn declares.
  const projected = toWasmSafeguardGroupKeyArtifact(artifact)
  const key = safeguardGroupKeyValueWasmValueBinding(JSON.stringify(projected))
  if (typeof key === 'string') return key
  throw new Error('WASM safeguard group-key helper returned an invalid payload.')
}

// Safeguard expected-group generation uses this helper so group-key logic is
// defined by Rust only; JS now supplies normalized tuple fields only.
//
// PERF NOTE (hot path): wrapper struct (SafeguardCountKeyInWire) bundles the
// two prior args (artifact + count_mode) into one JSON parse.  Payload is
// ~150 bytes per call.  Same hot-loop considerations as the helpers above.
export const getSafeguardCountKeyWithLoadedWasm = (params: {
  slot: number
  set: number
  faction: number
  mainStat: number
  countMode: WasmSafeguardCountModePayload
}): string => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Bundle artifact + count_mode into the wrapper shape Rust expects.  Floors
  // applied here so the Rust side reads canonical i64 values.
  const payload = JSON.stringify({
    artifact: {
      slot: Math.floor(params.slot),
      set: Math.floor(params.set),
      faction: Math.floor(params.faction),
      mainStat: Math.floor(params.mainStat),
    },
    countMode: params.countMode,
  })
  return safeguardCountKeyValueWasmBinding(payload)
}

// Safeguard expected-group domain normalization is centralized in Rust so
// ordering/dedupe semantics cannot drift from matcher-side domain readers.
// Returns an opaque wire object (short field names: so/acs/ams/amb/afi) that callers
// pass unchanged as expectedGroupDomain in WASM compute payloads.
// The wire type flows opaquely through TS — callers must not read individual fields.
export const normalizeSafeguardExpectedGroupDomainWithLoadedWasm = (domain: {
  slotOrder: number[]
  accessoryCompatibleSetIds: number[]
  armorCompatibleSetIds: number[]
  allowedMainBySlot: Record<string, number[]>
  allFactionIds: number[]
}): Record<string, unknown> => {
  assertWasmInitializedSync()
  const wire = projectSafeguardExpectedGroupDomainForWire(domain)
  const result = normalizeSafeguardExpectedGroupDomainWasmValueBinding(JSON.stringify(wire))
  if (result && typeof result === 'object') return result as Record<string, unknown>
  throw new Error('WASM safeguard expected-group domain normalizer returned an invalid payload.')
}

// Full builder runtime helper runs preflight + branch orchestration in one wasm
// call so buildHsfRules no longer stitches presence/preflight/branches in TS.
export const buildHsfRulesRuntimeWithLoadedWasm = (params: {
  recipeId?: number | null
  keep?: boolean
  useFlag: boolean
  artifactSetIds: ReadonlyArray<number> | Int32Array
  artifactTypeIds: ReadonlyArray<number> | Int32Array
  rankCode: number
  rarityCode: number
  factionCode: number
  mainChoices: Array<{ id: number; f?: number }>
  emitAnyMainWhenNoChoices: boolean
  baseline?: string
  effectiveStart: number
  suppressRollThresholds: boolean
  levelWindowMin: number
  levelWindowMax: number
  requiredV: ReadonlyArray<number> | Int32Array
  optionalPoolV: ReadonlyArray<number> | Int32Array
  selectedPoolV: ReadonlyArray<number> | Int32Array
  notSubstatsV?: ReadonlyArray<number> | Int32Array
  flexActive: boolean
  aggregateMinActive: boolean
  minTargetCount: number
  maxTargetCount: number
  aggregateTargetsLocked: boolean
  aggregateMinValue: number
  lockedMinActive: boolean
  lockedMinValue: number
  substatRollBoundsV: Record<string, { min?: number; max?: number; any?: boolean; not?: boolean }>
  targetEntriesByVariant: Record<number, { base?: number; increments?: Array<number | null> }>
  currentBaseByVariant: Record<number, number>
  factoryBaseByVariant: Record<number, number | null>
  targetBaseOverrideByVariant: Record<number, number | null>
  rarityMode?: string
  earlyKeepMode?: string
  autoRaritySupplementsThreshold?: string
  earlyMode: 'early' | 'late'
  emissionLimit?: number | null
}): { rules: HsfRule[]; limitHit: boolean } => {
  assertWasmInitializedSync()
  const result = buildHsfRulesRuntimeWasmValueBinding(
    JSON.stringify({
      ...(params.recipeId != null && Number.isFinite(params.recipeId)
        ? { recipeId: Math.floor(params.recipeId) }
        : {}),
      ...(typeof params.keep === 'boolean' ? { keep: params.keep } : {}),
      useFlag: params.useFlag === true,
      artifactSetIds: Array.from(toFlooredI32(params.artifactSetIds)),
      artifactTypeIds: Array.from(toFlooredI32(params.artifactTypeIds)),
      rankCode: Math.floor(params.rankCode),
      rarityCode: Math.floor(params.rarityCode),
      factionCode: Math.floor(params.factionCode),
      mainChoices: params.mainChoices ?? [],
      emitAnyMainWhenNoChoices: params.emitAnyMainWhenNoChoices === true,
      baseline: params.baseline,
      effectiveStart: Math.floor(params.effectiveStart),
      suppressRollThresholds: params.suppressRollThresholds === true,
      levelWindowMin: Math.floor(params.levelWindowMin),
      levelWindowMax: Math.floor(params.levelWindowMax),
      requiredV: Array.from(toFlooredI32(params.requiredV)),
      optionalPoolV: Array.from(toFlooredI32(params.optionalPoolV)),
      selectedPoolV: Array.from(toFlooredI32(params.selectedPoolV)),
      ...(params.notSubstatsV != null ? { notSubstatsV: Array.from(toFlooredI32(params.notSubstatsV)) } : {}),
      flexActive: params.flexActive === true,
      aggregateMinActive: params.aggregateMinActive === true,
      minTargetCount: Math.floor(params.minTargetCount),
      maxTargetCount: Math.floor(params.maxTargetCount),
      aggregateTargetsLocked: params.aggregateTargetsLocked === true,
      aggregateMinValue: Math.floor(params.aggregateMinValue),
      lockedMinActive: params.lockedMinActive === true,
      lockedMinValue: Math.floor(params.lockedMinValue),
      substatRollBoundsV: params.substatRollBoundsV ?? {},
      targetEntriesByVariant: params.targetEntriesByVariant ?? {},
      currentBaseByVariant: params.currentBaseByVariant ?? {},
      factoryBaseByVariant: params.factoryBaseByVariant ?? {},
      targetBaseOverrideByVariant: params.targetBaseOverrideByVariant ?? {},
      ...(typeof params.rarityMode === 'string' ? { rarityMode: params.rarityMode } : {}),
      ...(typeof params.earlyKeepMode === 'string' ? { earlyKeepMode: params.earlyKeepMode } : {}),
      ...(typeof params.autoRaritySupplementsThreshold === 'string'
        ? { autoRaritySupplementsThreshold: params.autoRaritySupplementsThreshold }
        : {}),
      earlyMode: params.earlyMode,
      ...(params.emissionLimit != null && Number.isFinite(params.emissionLimit)
        ? { emissionLimit: Math.floor(params.emissionLimit) }
        : {}),
    }),
  ) as { rules?: unknown; limitHit?: unknown }
  if (!result || !Array.isArray(result.rules)) {
    throw new Error('WASM build-hsf-rules-runtime helper returned an invalid payload.')
  }
  return {
    rules: result.rules as HsfRule[],
    limitHit: result.limitHit === true,
  }
}

// Synchronous helper for intro assignment combinatorics.
// Callers must warm wasm first; this helper now fails closed.
export const getIntroAssignmentsForComboWithLoadedWasm = (params: {
  count: number
  baseSlots: number
  additionLevels: ReadonlyArray<number> | Int32Array
  forcedBase: ReadonlyArray<number> | Int32Array
}): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Guard invalid numeric inputs before array conversion.
  if (!Number.isFinite(params.count) || !Number.isFinite(params.baseSlots)) {
    throw new Error('Invalid intro assignment input: count/baseSlots must be finite.')
  }
  // Zero count yields one empty assignment row.
  if (params.count <= 0) return [[]]
  // Normalize both vectors once to avoid repeated Number coercions.
  const count = Math.max(0, Math.floor(params.count))
  const additionLevels = toFlooredI32(params.additionLevels)
  const forcedBase = toFlooredI32(params.forcedBase)
  // Run combinatorics in wasm and return flattened integer rows.
  const flat = introAssignmentsForComboFastFlatWasmBinding(
    count,
    Math.floor(params.baseSlots),
    additionLevels,
    forcedBase,
  )
  // Rehydrate fixed-width rows where width === artifact count.
  return unflattenI32Rows(flat, count)
}

// Synchronous numeric combinations helper for builder combinatorics.
export const getCombinationsI32WithLoadedWasm = (values: number[], pick: number): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Reject NaN/Infinity pick values before integer flooring.
  if (!Number.isFinite(pick)) {
    throw new Error('Invalid combinations input: pick must be finite.')
  }
  // Pick <= 0 means one empty combination by convention.
  if (pick <= 0) return [[]]
  // Picking more than input length cannot produce combinations.
  if (pick > values.length) return []
  // Convert once to contiguous i32 payload for wasm binding.
  const width = Math.max(0, Math.floor(pick))
  const payload = toFlooredI32(values)
  // Let wasm enumerate combinations in deterministic index order.
  const flat = combinationsI32FastFlatWasmBinding(payload, width)
  // Decode flat result into rows of length `pick`.
  return unflattenI32Rows(flat, width)
}

// Synchronous numeric permutations helper for builder combinatorics.
export const getPermutationsI32WithLoadedWasm = (values: number[]): number[][] => {
  // Sync callers must warm wasm first.
  assertWasmInitializedSync()
  // Empty/singleton vectors have exactly one permutation.
  if (values.length <= 1) return [values.slice()]
  // Convert once to contiguous i32 payload for wasm.
  const payload = toFlooredI32(values)
  // Execute permutation backtracking in wasm.
  const flat = permutationsI32FastFlatWasmBinding(payload)
  // Rehydrate rows where width equals input length.
  return unflattenI32Rows(flat, payload.length)
}

// Compute improvement-chance entries for all non-maxed artifacts in stored rows.
// Reads ENGINE_STATE.stored_rows — store_artifact_rows_value must be called first.
// Returns null on invalid WASM output (defensive guard).
// When debug=true, the returned diag block is populated with work counters for dev tracing.
//
// Rules cross the boundary as a single JSON-stringified Vec<SafeguardWasmRuleIn>
// (no wrapper struct — same convention as find_obsolete_value, since
// SafeguardWasmRuleIn itself carries deny_unknown_fields).  `enabled` and
// `debug` stay as primitive wasm-bindgen args because wasm-bindgen marshals
// primitives natively without any JSON round-trip.
export const computeImprovementChanceWithLoadedWasm = (params: {
  rules: readonly SafeguardRule[]
  enabled: boolean
  debug?: boolean
}): { entries: ImprovementChanceWasmEntry[]; diag: ImprovementChanceWasmPerfDiag | null } | null => {
  assertWasmInitializedSync()
  // Resolve per-level threshold inheritance once, then stringify into the wire shape.
  const payloadJson = JSON.stringify(resolveRulesForWasm(params.rules))
  const raw = computeImprovementChanceWasmValueBinding(
    payloadJson,
    params.enabled === true,
    params.debug === true,
  )
  // Defensive guard: WASM must return the { entries, diag } wrapper object.
  if (raw == null || typeof raw !== 'object' || !Array.isArray((raw as { entries?: unknown }).entries)) return null
  const typed = raw as { entries: ImprovementChanceWasmEntry[]; diag: ImprovementChanceWasmPerfDiag | null }
  return typed
}
