import initRuleEngineWasm, {
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
  compute_merged_rules_value as computeMergedRulesWasmValueBinding,
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
} from '../safeguards'
import type { FinalSellRemainderConfig } from '../logicHub'
import type { GearInspectorMatchWorkerEvaluateItem, GearInspectorMatchWorkerItemResult } from '../../workers/gearInspectorMatchWorkerTypes'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import type { TestItem } from '../ruleEval'
// Minified wire-format field maps for compute_merged_rules_value.  Generated
// from shared/wasm-rule-wire-fields.json to keep TS and Rust in sync.
import {
  minifyRuleRawForWire,
  expandRuleRawFromWire,
} from '../generated/wasmRuleWireFields'

// Compact WASM substat input — only the fields SafeguardWasmSubstatRawIn reads.
// Trimmed from NormalizedStat (9+ fields) to eliminate serde_wasm_bindgen overhead
// from iterating ignored properties, which is catastrophically slow in Firefox.
//
// Every field is REQUIRED on this type — even nullable ones must be explicitly set
// (`T | null` rather than `T?`). This forces helper authors to acknowledge each
// field's presence at compile time; a silent omission of an optional field on the
// helper would otherwise produce a JSON payload that Rust deserialises as `None`
// — the exact bug class the wire-shape types exist to prevent.
export type WasmSubstatStoreInput = {
  variant: number
  isFlat: boolean
  totalValue: number | null
  rolls: number | null
}

// Compact WASM artifact input — only the fields SafeguardWasmArtifactRawIn reads.
// Avoids passing the full NormalizedGearArtifact (~20 fields) and NormalizedStat
// substats (~9 fields each) through serde_wasm_bindgen.
// mainStat is passed as a plain number (variant only) so serde immediately matches
// the Variant(i64) branch of the untagged enum, skipping the failed object-try.
//
// All fields REQUIRED (see WasmSubstatStoreInput comment for rationale).
export type WasmArtifactStoreInput = {
  id: number
  slot: number
  set: number
  rank: number
  rarity: number
  level: number
  exactLevel: number | null
  faction: number
  mainStat: number | null
  substats: WasmSubstatStoreInput[]
  // Nested champion reference matches the TS NormalizedGearArtifact shape.
  // Safeguards read `equippedChampion.location` to derive collection/vault flags.
  equippedChampion: { location: string | null } | null
  gearInspectorItem: TestItem
}

// Compact row passed to store_artifact_rows_value.
// Only artifact is required; SafeguardCollectRowFastIn's other fields default via #[serde(default)].
export type WasmArtifactStoreRow = {
  artifact: WasmArtifactStoreInput
}

// Compact safeguard candidate input — only the fields SafeguardWasmCandidateFastIn declares.
// Excludes the TS `row: GearInspectorPreviewRow` reference (Rust never reads it; carrying it
// across the boundary would just feed serde-wasm-bindgen useless externref work — and once
// the JSON-string path activates deny_unknown_fields, would outright reject the payload).
// All fields REQUIRED (see WasmSubstatStoreInput comment for rationale).
export type WasmSafeguardCandidateInput = {
  itemKey: number | null
  groupKey: string | null
  isSold: boolean
  artifact: WasmArtifactStoreInput
}

// Compact collect-row input — mirrors SafeguardCollectRowFastIn in
// wasm/rule_engine_core/src/safeguards/fast_path_types.rs. Only fields the Rust
// collect-row deserializer reads. The TS `GearInspectorPreviewRow` carries extra
// fields (`match`, `matchingRecipeIndices`, `matchingRecipeDecisions`) that the
// Rust struct does NOT declare — once collect_safeguard_candidates_value uses
// serde_json::from_str, deny_unknown_fields rejects them. The TS-side helper
// (toWasmSafeguardCollectRow) strips down before stringify.
// All fields REQUIRED (see WasmSubstatStoreInput comment for rationale).
export type WasmSafeguardCollectRowInput = {
  artifact: WasmArtifactStoreInput
  item: TestItem | null
  // Explicit flag mirrors SafeguardCollectRowFastIn.base_match_defined; null lets
  // Rust derive presence from baseMatch (the existing `unwrap_or(base_match.is_some())`).
  baseMatchDefined: boolean | null
  // Trimmed to only the fields SafeguardCandidateResolveBaseMatchIn declares
  // (wasm/rule_engine_core/src/matcher_evaluator.rs around line 276): keep + recipeIdx.
  // The full GearInspectorPreviewMatch carries display-only extras (recipeName,
  // ruleIndex, ruleLabel, ruleSource, safeguardRuleId, safeguardRuleOrdinal) that
  // deny_unknown_fields rejects — STRIP them in the helper.
  baseMatch: { keep: boolean; recipeIdx: number | null } | null
}

// Compact improvement-chance input — only the two fields ImprovementChanceInput in
// rule_engine_wasm/src/lib.rs declares (artifactId + chancesByRuleOrdinal).  The full
// ImprovementChanceWasmEntry shape carries display-only extras (chancePercent,
// hasMatchingSafeguard, matchedRuleId, ruleOrdinal, debug) that the Rust wire struct
// does NOT declare.  deny_unknown_fields rejects them post-migration, so we strip down
// here rather than loosening the Rust side.
export type WasmImprovementChanceInput = {
  artifactId: number
  chancesByRuleOrdinal: ReadonlyArray<{ ruleOrdinal: number; chancePercent: number }>
}

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
export const toWasmTestItem = (item: TestItem): TestItem => ({
  slot: item.slot,
  set: item.set,
  rank: item.rank,
  rarity: item.rarity,
  level: item.level,
  ...(item.faction != null ? { faction: item.faction } : {}),
  ...(item.main != null ? { main: item.main } : {}),
  ...(item.subValues != null ? { subValues: item.subValues } : {}),
  // Forward only previewExtras.id — every other extras field is not in PreviewExtrasRaw.
  ...(item.previewExtras?.id != null ? { previewExtras: { id: item.previewExtras.id } } : {}),
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
const buildEvaluatePayload = (
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
// The generated binding no-ops after first init, so repeated calls stay cheap.
// On failure the cached promise is cleared so the next caller can retry rather
// than every future call rejecting from the same permanently-stuck promise.
const ensureWasmInitialized = async (): Promise<void> => {
  if (!wasmInitPromise) {
    wasmInitPromise = initRuleEngineWasm().then(() => {
      wasmInitialized = true
    })
  }
  try {
    await wasmInitPromise
  } catch (error) {
    // Clear so the next pipeline request can attempt re-initialization.
    wasmInitPromise = null
    throw error
  }
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

// Warmup helper allows callers with async control flow to preload the wasm
// module so later sync helpers (e.g., obsolete pruning) can run in-process.
export const warmupWasmRuleEngine = async (): Promise<void> => {
  await ensureWasmInitialized()
  // Pre-commit WASM pages for the pipeline allocator.  The Rust side grows in
  // 16 MiB chunks (V8/Windows' safe per-call ceiling) so a single large request
  // won't be rejected outright.  Any pages V8 refuses are silently skipped.
  preGrowMemoryWasmBinding(PRE_GROW_TARGET_BYTES)
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


type WasmObsoleteEntry = { index: number; coveredBy: number; reason: string }
type WasmObsoleteReport = { obsolete: WasmObsoleteEntry[] }

type WasmSafeguardCountModePayload = {
  perRule: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
  perSlot: boolean
}

type WasmCollectedSafeguardCandidate = {
  rowIndex: number
  itemKey: number
  groupKey: string
  isSold: boolean
  // artifact removed: Rust no longer emits it; callers use rows[rowIndex].artifact.
}

type WasmCollectedSafeguardSnapshot = {
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
}

type WasmCollectedAndProtectedSafeguardSnapshot = {
  candidates: WasmCollectedSafeguardCandidate[]
  uniqueItemKeys: number[]
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
const resolveRulesForWasm = (rules: readonly SafeguardRule[]): readonly SafeguardRule[] =>
  rules.map((r) => {
    if (r.improvementChanceThreshold === null || r.improvementChanceThreshold === undefined) return r
    // Already resolved to a concrete array (WASM echo-back path).
    if (Array.isArray(r.improvementChanceThreshold)) return r
    const [l0, l4, l8, l12] = resolveImprovementChanceThresholds(r.improvementChanceThreshold)
    // Cast through unknown — the serialized shape is [f64;4] and Rust deserializes it as such.
    return { ...r, improvementChanceThreshold: [l0, l4, l8, l12] as unknown as typeof r.improvementChanceThreshold }
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
  if (result && typeof result === 'object' && Array.isArray((result as { entries?: unknown }).entries)) {
    return result as SafeguardDetectionSnapshot
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
  const result = collectAndComputeSafeguardProtectionWasmValueBinding(payload) as WasmCollectedAndProtectedSafeguardSnapshot
  if (
    result
    && Array.isArray(result.candidates)
    && Array.isArray(result.uniqueItemKeys)
    && result.detection
    && Array.isArray(result.detection.entries)
  ) {
    return result
  }
  throw new Error('WASM safeguard combined collector/detector returned an invalid payload.')
}

// Debug snapshot mirroring ImprovementChanceDebug from improvement_chance.rs.
// exactOptionalPropertyTypes: all nullable fields use T | null (not T | undefined).
export type ImprovementChanceWasmDebug = {
  viableScenarioCount: number
  selectedSubstats: number[]
  substatMatch: string
  requiredPerGroup: number
  bucketCandidateCount: number
  betterCandidateCount: number
  matchedSelectedNow: number
  maxAdditionEventsTo16: number
}

// Perf-diagnostics block returned alongside entries when debug=true.
// Mirrors ImprovementChancePerfDiag from improvement_chance.rs.
export type ImprovementChanceWasmPerfDiag = {
  rowCount: number
  ruleCount: number
  scenarioCount: number
  artifactsWithScenarios: number
  artifactsViable: number
}

// One per-rule chance entry — chance the artifact lands in THIS rule's top-N at +16.
// Carried as a list (not a map) so the payload round-trips cleanly through serde_wasm_bindgen
// without requiring the maps-as-objects serializer on either side.
export type ImprovementChanceWasmRuleEntry = {
  // 1-based safeguard rule ordinal in the input rules list.
  ruleOrdinal: number
  // Probability (0.0–100.0) the artifact lands in this rule's top-N at +16.
  chancePercent: number
}

// Single artifact entry returned by compute_improvement_chance_value.
export type ImprovementChanceWasmEntry = {
  artifactId: number
  // Max chance across all rules — used by the gear-inspector overlay for a single-value display.
  chancePercent: number
  hasMatchingSafeguard: boolean
  // Legacy field; always null now that SafeguardRule carries no id. Kept for deserialization compat.
  matchedRuleId: string | null
  // 1-based ordinal of the preferred safeguard rule (the rule with the max chance); null when no rule matched.
  ruleOrdinal: number | null
  // Per-rule chances. The threshold-expansion lookup in the safeguard core uses
  // (artifactId, ruleOrdinal) so each rule's expansion considers only ITS OWN top-N
  // chance — not the global union across rules. Empty when no rules apply to this artifact.
  chancesByRuleOrdinal: ImprovementChanceWasmRuleEntry[]
  debug: ImprovementChanceWasmDebug | null
}

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
  const result = evaluateAndCollectSafeguardProtectionWasmValueBinding(
    payloadJson,
    params.enabled === true,
    Number.isFinite(params.now) ? params.now : 0,
  ) as WasmEvaluateAndCollectSnapshot
  if (
    result
    && Array.isArray(result.evaluateResults)
    && Array.isArray(result.candidates)
    && Array.isArray(result.uniqueItemKeys)
    && result.detection
    && Array.isArray(result.detection.entries)
  ) {
    return result
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
  const payload = JSON.stringify({
    rules,
    metasets,
  })
  const result = resolveSafeguardRulesWithMetasetsWasmValueBinding(payload) as T[]
  if (Array.isArray(result)) return result
  throw new Error('WASM safeguard metaset resolver returned an invalid payload.')
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
    detection: params.detection,
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

// Merge orchestration combines base/custom/final-sell/safeguard rows and
// assigns stable __lineIdx ordering in one Rust pass.
export const computeMergedRulesWithLoadedWasm = (params: {
  baseRules: HsfRuleWithRecipe[]
  customRules: HsfRuleWithRecipe[]
  finalSellRemainder: FinalSellRemainderConfig | null | undefined
  allKnownSetIds: number[]
  // Transform generated HSF rows before safeguard evaluation/injection.
  omitDisabledBeforeSafeguards: boolean
  dedupeBeforeSafeguards: boolean
  safeguardEnabled: boolean
  safeguardRules: readonly SafeguardRule[]
  safeguardDetection: SafeguardDetectionSnapshot | null | undefined
  safeguardRecipeIdBase: number
}): HsfRuleWithRecipe[] => {
  assertWasmInitializedSync()
  // Minify rule arrays to short wire-format keys (SSOT at
  // shared/wasm-rule-wire-fields.json). At 45k-rule scale this cuts the JSON
  // payload by ~40% (~27 MiB → ~17 MiB), which avoids talc deallocate OOB
  // crashes triggered by allocator pressure from back-to-back large string
  // passes through wasm-bindgen's passStringToWasm0 realloc sequence.
  // Smaller supporting fields (finalSellRemainder, safeguards, etc) stay in
  // their native shape — the dominant cost is the two rule vecs.
  const payloadObject = {
    br: params.baseRules.map(minifyRuleRawForWire),
    cr: params.customRules.map(minifyRuleRawForWire),
    fsr: params.finalSellRemainder ?? null,
    aksi: params.allKnownSetIds,
    oms: params.omitDisabledBeforeSafeguards === true,
    dds: params.dedupeBeforeSafeguards === true,
    // Rust uses canonical safeguard payload keys for merged-rule orchestration.
    se: params.safeguardEnabled === true,
    sr: resolveRulesForWasm(params.safeguardRules),
    sd: params.safeguardDetection ?? null,
    srb: Math.floor(params.safeguardRecipeIdBase),
  }
  // JSON.stringify + serde_json::from_str stays in linear memory and avoids
  // the externref path entirely. JSON.stringify is O(n) and fast in V8;
  // serde_json is one of the fastest JSON parsers available.
  const payloadJson = JSON.stringify(payloadObject)
  const resultJson = computeMergedRulesWasmValueBinding(payloadJson)
  if (typeof resultJson !== 'string') {
    throw new Error('WASM merged-rule orchestrator returned an invalid payload.')
  }
  const parsed = JSON.parse(resultJson)
  if (!Array.isArray(parsed)) {
    throw new Error('WASM merged-rule orchestrator returned a non-array payload.')
  }
  // Expand minified keys (including nested Substats) back to canonical
  // HsfRuleWithRecipe shape. Each rule has ~13 populated fields on average,
  // so the rename pass is cheap.
  const expanded = (parsed as Array<Record<string, unknown>>).map((rule) =>
    expandRuleRawFromWire(rule) as unknown as HsfRuleWithRecipe,
  )
  return expanded
}

// Auto-flex rarity branch expansion now runs in Rust so merge.ts keeps one
// source for the branch split heuristics tied to auto rarity + locked mins.
export const expandAutoFlexRarityBranchesWithLoadedWasm = (params: {
  recipe: BuilderRecipe
  baseRarityCode: number
}): BuilderRecipe[] => {
  assertWasmInitializedSync()
  // Filter recipe to only fields accepted by AutoFlexRarityRecipeIn in WASM;
  // non-declared fields are restored by the TS wrapper via {...originalRecipe, ...wasmBranch}.
  const filteredRecipe = {
    ...(typeof params.recipe.rarityMode === 'string' ? { rarityMode: params.recipe.rarityMode } : {}),
    ...(typeof params.recipe.rarityCode === 'number' ? { rarityCode: params.recipe.rarityCode } : {}),
    ...(typeof params.recipe.autoSubstatFlex === 'boolean' ? { autoSubstatFlex: params.recipe.autoSubstatFlex } : {}),
    ...(typeof params.recipe.autoMinCount === 'boolean' ? { autoMinCount: params.recipe.autoMinCount } : {}),
    ...(typeof params.recipe.minCount === 'number' ? { minCount: params.recipe.minCount } : {}),
    ...(typeof params.recipe.autoMinRequiredRolls === 'boolean' ? { autoMinRequiredRolls: params.recipe.autoMinRequiredRolls } : {}),
    ...(typeof params.recipe.minRequiredRolls === 'number' ? { minRequiredRolls: params.recipe.minRequiredRolls } : {}),
    substatsV: Array.from(toFlooredI32(params.recipe.substatsV ?? [])),
    fixedSubstatsV: Array.from(toFlooredI32(params.recipe.fixedSubstatsV ?? [])),
    substatRollBoundsV: Object.fromEntries(
      Object.entries(params.recipe.substatRollBoundsV ?? {}).map(([key, bounds]) => [
        key,
        { min: bounds.min, max: bounds.max, any: bounds.any, not: bounds.not },
      ])
    ),
    ...(typeof params.recipe.minLevel === 'number' ? { minLevel: params.recipe.minLevel } : {}),
    ...(typeof params.recipe.maxLevel === 'number' ? { maxLevel: params.recipe.maxLevel } : {}),
  }
  const rawResult = expandAutoFlexRarityBranchesWasmValueBinding(
    JSON.stringify(filteredRecipe),
    Math.floor(params.baseRarityCode),
  )
  // Rust emits only the declared AutoFlexRarityRecipeIn fields (rarity-related
  // fields + substatsV/bounds used for branch logic).  Merge each branch with
  // the original recipe so non-declared fields (minCount, mainStats, etc.) are
  // preserved.  Branch-specific overrides (rarityMode, rarityCode, minLevel,
  // etc.) from WASM take precedence via the right-side spread.
  if (Array.isArray(rawResult)) {
    return rawResult.map((branch) => ({
      ...params.recipe,
      ...(branch as Partial<BuilderRecipe>),
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
  ) as {
    selectedPoolV?: unknown
    requiredV?: unknown
    optionalPoolV?: unknown
    minTargetCount?: unknown
    maxTargetCount?: unknown
    maxSelectableCount?: unknown
    hadRequestedSubstats?: unknown
    hasPerStatMin?: unknown
    currentBaseByVariant?: unknown
    factoryBaseByVariant?: unknown
    targetBaseOverrideByVariant?: unknown
    targetEntriesByVariant?: unknown
  }
  if (
    !result
    || !Array.isArray(result.selectedPoolV)
    || !Array.isArray(result.requiredV)
    || !Array.isArray(result.optionalPoolV)
    || result.currentBaseByVariant == null
    || result.factoryBaseByVariant == null
    || result.targetBaseOverrideByVariant == null
    || result.targetEntriesByVariant == null
  ) {
    throw new Error('WASM prepare-hsf-builder-recipe helper returned an invalid payload.')
  }
  return {
    selectedPoolV: result.selectedPoolV.map((value) => Math.floor(Number(value))),
    requiredV: result.requiredV.map((value) => Math.floor(Number(value))),
    optionalPoolV: result.optionalPoolV.map((value) => Math.floor(Number(value))),
    minTargetCount: Math.floor(Number(result.minTargetCount ?? 0)),
    maxTargetCount: Math.floor(Number(result.maxTargetCount ?? 0)),
    maxSelectableCount: Math.floor(Number(result.maxSelectableCount ?? 0)),
    hadRequestedSubstats: result.hadRequestedSubstats === true,
    hasPerStatMin: result.hasPerStatMin === true,
    // Rust emits plain objects via serialize_maps_as_objects; no Map → object conversion needed.
    currentBaseByVariant: result.currentBaseByVariant as Record<string, number>,
    factoryBaseByVariant: result.factoryBaseByVariant as Record<string, number | null>,
    targetBaseOverrideByVariant: result.targetBaseOverrideByVariant as Record<string, number | null>,
    targetEntriesByVariant: result.targetEntriesByVariant as Record<string, { base?: number; increments?: Array<number | null> }>,
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
export const scoreSafeguardCandidatesWithLoadedWasm = (params: {
  // Artifacts to score — sourced from SafeguardDetectionEntry.artifacts in the snapshot.
  artifacts: unknown[]
  // Substat variant IDs to include in the scoring formula.
  substats: number[]
  // Per-variant weight multipliers (variant id → weight).
  weights: Record<number, number>
  // How many items the rule intends to keep (quota for isWithinQuota).
  requiredCount: number
}): SafeguardCandidateOut[] => {
  assertWasmInitializedSync()
  const result = scoreSafeguardCandidatesWasmValueBinding(JSON.stringify({
    artifacts: params.artifacts,
    substats: params.substats,
    weights: params.weights,
    requiredCount: params.requiredCount,
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

// Safeguard item-key derivation runs in Rust so TS reuses DB-id-first
// semantics used by candidate collection.
export const getSafeguardItemKeyWithLoadedWasm = (artifact: unknown): number => {
  assertWasmInitializedSync()
  const key = safeguardItemKeyValueWasmValueBinding(artifact)
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
export const getSafeguardGroupKeyWithLoadedWasm = (artifact: unknown): string => {
  assertWasmInitializedSync()
  const key = safeguardGroupKeyValueWasmValueBinding(artifact)
  if (typeof key === 'string') return key
  throw new Error('WASM safeguard group-key helper returned an invalid payload.')
}

// Safeguard expected-group generation uses this helper so group-key logic is
// defined by Rust only; JS now supplies normalized tuple fields only.
export const getSafeguardCountKeyWithLoadedWasm = (params: {
  slot: number
  set: number
  faction: number
  mainStat: number
  countMode: WasmSafeguardCountModePayload
}): string => {
  // Sync helper is fail-closed: caller must have warmed wasm already.
  assertWasmInitializedSync()
  // Delegate key derivation to wasm so count-key semantics stay SSOT.
  return safeguardCountKeyValueWasmBinding(
    {
      slot: Math.floor(params.slot),
      set: Math.floor(params.set),
      faction: Math.floor(params.faction),
      mainStat: Math.floor(params.mainStat),
    },
    params.countMode,
  )
}

// Safeguard expected-group domain normalization is centralized in Rust so
// ordering/dedupe semantics cannot drift from matcher-side domain readers.
export const normalizeSafeguardExpectedGroupDomainWithLoadedWasm = <
  T extends {
    slotOrder: number[]
    accessoryCompatibleSetIds: number[]
    armorCompatibleSetIds: number[]
    allowedMainBySlot: Record<string, number[]>
    allFactionIds: number[]
  },
>(domain: T): T => {
  assertWasmInitializedSync()
  const result = normalizeSafeguardExpectedGroupDomainWasmValueBinding(JSON.stringify(domain))
  if (result && typeof result === 'object') return result as T
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
